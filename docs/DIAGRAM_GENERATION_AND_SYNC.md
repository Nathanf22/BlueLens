# Génération de Diagrammes et Resync — Référence Technique

> Document de référence interne. Objectif : comprendre le système en détail pour identifier les failles architecturales.
> Dernière mise à jour : feat/incremental-sync

---

## Réponse directe : comportement agentique ?

**Non — les pipelines de génération ne sont pas agentiques.**

Le LLM reçoit un contexte pré-construit et répond en une seule passe. Il ne dispose pas d'outils pour aller chercher du code, explorer des fichiers, ou prendre des décisions séquentielles basées sur des résultats intermédiaires.

**La seule partie vraiment agentique du système est le chat global** (`GlobalAIChatModal` + `agentToolService`), qui implémente une vraie boucle tool-use avec jusqu'à 20 itérations et des outils comme `get_node_source`, `get_diagram`, `update_diagram`. Là, le LLM peut décider d'aller chercher du code.

**Conséquence majeure :** dans le pipeline de génération, le LLM ne voit pas le code source brut. Il raisonne sur des **métadonnées extraites** (noms de symboles, types, chemins d'import). Il ne peut pas lire la logique métier à l'intérieur des fonctions, ni les patterns d'utilisation complexes.

---

## Vue d'ensemble du système

```
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE DE GÉNÉRATION                       │
│                                                                   │
│  Filesystem ──► codebaseAnalyzerService ──► CodebaseAnalysis     │
│                       (regex, pas de LLM)                        │
│                              │                                    │
│                              ▼                                    │
│               codeGraphAgentService (LLM ×2)                     │
│               ├── Agent 1 : File Analyst (batches)               │
│               └── Agent 2 : Architect (groupement)               │
│                              │                                    │
│                              ▼                                    │
│            codeToGraphParserService ──► CodeGraph                │
│                       (déterministe)                              │
│                              │                                    │
│                    ┌─────────┴────────┐                          │
│                    ▼                  ▼                           │
│         codeGraphFlowService    diagramGeneratorService          │
│           (LLM, séquences)      (déterministe, flowcharts)       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE DE RESYNC                           │
│                                                                   │
│  Filesystem ──► codeGraphSyncService.incrementalResync()         │
│                       (hash comparison + regex reparse)          │
│                              │                                    │
│                              ▼                                    │
│                         GraphDiff                                 │
│                              │                                    │
│                              ▼                                    │
│              diagramSyncService.buildSyncProposal()              │
│                 proposeDiagramUpdate() ← LLM (merge intelligent) │
│                              │                                    │
│                              ▼                                    │
│                    SyncProposal (DiagramDiffs)                    │
│                              │                                    │
│                    ┌─────────┼─────────┐                         │
│                    ▼         ▼         ▼                          │
│                  auto    semi-auto   manual                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Partie 1 : Pipeline de Génération du CodeGraph

### Étape 0 : Lecture du filesystem (`codebaseAnalyzerService`)

**Nature : 100% déterministe, aucun LLM.**

Le service lit le repo via le File System Access API (Chromium uniquement) ou `GitFileSystemProvider` (pour un commit historique). Il parcourt récursivement les fichiers avec les extensions reconnues (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.cpp`, `.c`, `.h`).

Pour chaque fichier, il extrait par **regex** :
- **Symboles** : classes, fonctions, interfaces, variables exportées (avec `lineStart`, `lineEnd`)
- **Imports** : toutes les déclarations `import` / `require` / `#include` — source résolue, externe ou interne
- **Exports** : symboles explicitement exportés (`export const`, `export default`, `__all__`, etc.)
- **Hiérarchies de classes** : `extends` / `implements` par regex

Produit : une `CodebaseAnalysis` groupée initialement par répertoire de premier niveau.

**Faille #1 :** L'extraction est regex-only, pas d'AST. Manque :
- Appels de fonctions indirects (callbacks, event listeners, fonctions stockées dans des variables)
- Types génériques complexes
- Code conditionnel (`if (condition) { import(...) }`)
- Symboles dans les corps de fonctions (seulement les déclarations de niveau module)

---

### Étape 1 : Agent 1 — File Analyst (`codeGraphAgentService`)

**Nature : LLM, mais PAS agentique. Une seule passe par batch.**

**Ce que le LLM reçoit :**
```
File: hooks/useChatHandlers.ts
Symbols: handleSend (function), handleClear (function), useChatHandlers (function)
Imports: ./llmService, ../types, react
Exports: useChatHandlers
```
Le LLM ne voit **pas le code source**. Il voit uniquement les noms de symboles, les chemins d'import, et les exports.

**Ce qu'on lui demande :**
Pour chaque fichier, retourner :
- `filePath` : copie exacte du chemin (critique — le LLM hallucine souvent les chemins)
- `purpose` : 1 phrase décrivant ce que fait le fichier
- `role` : l'un de `entry_point | service | component | hook | utility | model | config | test | style`

**Mécanique :**
- Batches de 10 fichiers par appel LLM
- 2 retries par batch si le JSON est invalide
- Fallback path-based si tous les retries échouent (regex sur le nom de fichier)
- Résolution flexible des chemins retournés : exact → sans extension → basename (pour absorber les hallucinations du LLM sur les chemins)

**Faille #2 :** Le LLM classe les rôles uniquement sur les noms de symboles et d'imports, sans voir le code. Un fichier peut être classé `utility` alors qu'il est en réalité le cœur d'une feature critique. Les noms ambigus (ex: `helpers.ts`) sont mal classifiés systématiquement.

**Faille #3 :** Le `purpose` généré est une inférence sur les noms, pas une analyse du comportement réel. Il peut être générique ou trompeur.

---

### Étape 2 : Agent 2 — Architect (`codeGraphAgentService`)

**Nature : LLM, PAS agentique. Un seul appel pour tout le repo.**

**Ce que le LLM reçoit :**
```
FILE SUMMARIES:
hooks/useChatHandlers.ts — Manages chat message state and handlers [hook]
services/llmService.ts — Provides multi-provider LLM abstraction [service]
components/GlobalAIChatModal.tsx — Global AI chat modal dialog [component]
...

IMPORT RELATIONSHIPS:
hooks/useChatHandlers.ts → services/llmService.ts
components/GlobalAIChatModal.tsx → hooks/useChatHandlers.ts
...
```

**Ce qu'on lui demande :**
Grouper les fichiers en **modules fonctionnels** (pas des couches techniques). Règles strictes :
- 2 à 10 modules
- Noms descriptifs de domaine (interdit : "Services", "Hooks", "Components")
- Cohésion fonctionnelle : `ChatPanel.tsx + useChatHandlers.ts + aiChatService.ts → "AI Intelligence"`
- Retourner aussi les relations entre modules (`from`, `to`, `label`)

**Validation post-LLM :**
- Chaque fichier assigné à exactement un module
- Les fichiers non assignés → module "Other" automatique
- Chemins résolus flexiblement (même tolérance que l'Agent 1)
- Si la validation échoue après 2 retries → fallback `codeGraphHeuristicGrouper`

**Faille #4 :** Le LLM voit un seul appel LLM pour l'ensemble du repo. Sur un grand repo (>100 fichiers), le prompt devient très long et la qualité du groupement se dégrade. La limite est gérée par le batch de l'Agent 1, mais l'Agent 2 reçoit toujours la totalité.

**Faille #5 :** Aucune validation de cohérence post-groupement : on ne vérifie pas que les fichiers d'un module sont réellement liés (mesure d'import-affinity). Un module peut contenir des fichiers qui ne s'importent jamais entre eux.

**Faille #6 :** Les relations entre modules (`from: "AI Intelligence", to: "Data Layer", label: "queries"`) sont inventées par le LLM. Elles ne sont pas dérivées du graphe d'imports réel. Elles peuvent être fausses ou incomplètes.

---

### Étape 3 : Construction du Graphe (`codeToGraphParserService`)

**Nature : 100% déterministe, aucun LLM.**

Transforme la `CodebaseAnalysis` (avec modules fonctionnels) en `CodeGraph` avec hiérarchie à 4 niveaux :

```
D0  system   — nœud racine unique, représente le repo entier
D1  package  — modules fonctionnels (sortie de l'Agent 2)
D2  module   — fichiers individuels dans un module
D3  class/fn — symboles dans un fichier (classes, fonctions, interfaces, variables)
```

**Relations créées :**
- `contains` : D0→D1→D2→D3 (hiérarchie parentale)
- `depends_on` : D2→D2 (dérivé des imports résolus), D1→D1 (agrégation)
- `inherits` : D3→D3 (héritage de classes, depuis `extractClassHierarchy`)
- `implements` : D3→D3 (interfaces implémentées)
- `calls` : D3→D3 (appels de fonctions, depuis `extractCallReferences`)

**Résolution des imports :**
Tente de résoudre chaque import vers un fichier réel : exact → avec extensions → index files. Les imports non résolus (vers des packages npm) sont ignorés pour les relations.

**SyncLock :**
Chaque nœud D2 (fichier) reçoit une `SyncLockEntry` avec le hash SHA-256 de son contenu. C'est l'ancre du système de sync.

**Faille #7 :** La résolution d'imports est heuristique, pas AST. Les imports dynamiques (`import()`), les barrel files complexes (`export * from './subdir'`), et les alias personnalisés (hors `@/`) ne sont pas résolus.

**Faille #8 :** Les relations `calls` D3→D3 sont extraites par regex (cherche des appels de fonction connus dans le corps du fichier). Manque : callbacks, méthodes sur des objets, appels via destructuring, appels conditionnels.

---

### Étape 4 (optionnelle) : Génération de Flows (`codeGraphFlowService`)

**Nature : LLM, PAS agentique. Un ou deux appels selon la taille.**

**Phase 1 — Extraction du résumé de graphe (déterministe) :**

Construit une structure `GraphSummary` à partir du CodeGraph :
- Modules D1 avec leurs fichiers D2 et symboles D3
- File edges (D2→D2) avec les noms d'imports comme labels
- Call edges D3→D3 (appels de fonctions)
- Entry points (fichiers sans dépendances entrantes OU nommés `index|main|app|server`)

Si le repo a >150 fichiers, les fichiers sont tronqués proportionnellement par module (max 150 total).

**Phase 2 — Génération LLM :**

**Ce que le LLM reçoit (system prompt) :**
- Structure de tous les modules avec leurs fichiers et symboles
- Liste exhaustive des nodeIds valides (IDs stables du graphe)
- Instructions qualité : chaque flow doit raconter une histoire complète, les labels doivent être des actions descriptives, les séquences Mermaid doivent être riches (alt/opt/loop/Note)

**Ce que le LLM reçoit (user prompt) :**
- Graphe de dépendances fichier→fichier avec labels d'imports
- Graphe d'appels fonction→fonction (limité à 100 edges)
- Entry points identifiés

**Ce qu'on lui demande :**
Retourner 5-15 flows au format JSON :
```json
{
  "flows": [
    {
      "name": "User sends AI message",
      "description": "End-to-end flow from user input to AI response display",
      "scopeNodeId": "<rootNodeId ou D1 nodeId>",
      "steps": [
        { "nodeId": "<D2 ou D1 nodeId>", "label": "Receive user message and dispatch handler", "order": 0 }
      ],
      "sequenceDiagram": "sequenceDiagram\n  participant UI as Chat Modal\n  ..."
    }
  ]
}
```

**Validation post-LLM :**
- `scopeNodeId` doit être le rootNodeId ou un D1 valide
- Chaque `step.nodeId` doit exister dans le graphe
- Minimum 2 steps par flow
- Si `sequenceDiagram` absent ou malformé → reconstruction automatique depuis les steps

**Ce que le LLM ne voit PAS :** le code source. Il infère les flows depuis les noms de fichiers, de symboles, et les relations d'import.

**Faille #9 :** Sans code source, le LLM ne peut pas connaître les conditions, les branches d'erreur, les états asynchrones, ou les effets de bord. Les flows générés sont des hypothèses plausibles, pas des traces d'exécution réelles.

**Faille #10 :** La limite de 100 call edges coupe potentiellement des relations importantes dans un grand repo. Les flows peuvent manquer des dépendances clés.

---

### Étape 5 (optionnelle) : Génération de Diagrammes Mermaid (`diagramGeneratorService`)

**Nature : 100% déterministe, aucun LLM.**

Génère trois niveaux de diagrammes flowchart depuis la `CodebaseAnalysis` :

**L1 — System Overview** : modules D1 comme nœuds, dépendances cross-modules comme arêtes. Nœuds avec la forme `stadium` (`((...))`) pour les entry points.

**L2 — Module Detail** : pour chaque module D1, les fichiers D2 comme nœuds, leurs imports comme arêtes.

**L3 — File Detail** : pour chaque fichier D2, les symboles D3 comme nœuds.

Limite de 25 nœuds par diagramme. Les diagrammes sont liés entre eux via `nodeLinks` (navigation drill-down).

Ces diagrammes sont différents des flows Mermaid générés par `codeGraphFlowService` (qui sont des sequence diagrams). Ils coexistent dans le workspace.

---

## Partie 2 : Pipeline de Resync

### Architecture générale

Le resync est décomposé en deux axes indépendants :

```
Axe 1 : Code → CodeGraph  (déterministe + regex)
Axe 2 : CodeGraph → Diagrams  (LLM pour le merge)
```

### Axe 1 : Détection et Resync Incrémental (`codeGraphSyncService`)

#### `computeGraphStatus(graph)` — Déterministe

Dérive le statut global du graph depuis les entrées `syncLock` :

| Condition | Statut |
|-----------|--------|
| Aucune entrée | `unknown` |
| Au moins un `missing` | `conflicts` |
| Au moins un `modified` | `suggestions` |
| Tous `locked` | `synced` |

#### `detectChanges(graph, handle)` — Déterministe

Pour chaque entrée dans `graph.syncLock` (chaque fichier tracké) :
- Lit le fichier via `fileSystemService.readFile(handle, filePath)`
- Calcule le hash SHA-256 du contenu actuel
- Compare au hash stocké dans `sourceRef.contentHash`
- Si différent → `modified`; si fichier inaccessible → `missing`; sinon → `unchanged`

Retourne un `ChangeReport { modified[], missing[], unchanged[] }`.

**Limitation importante :** `detectChanges` ne détecte pas les **nouveaux fichiers**. Un fichier ajouté au repo depuis le dernier parse n'est pas dans le `syncLock`, donc invisible. Seul un `fullResync` (pipeline complet avec LLM) peut l'intégrer.

#### `incrementalResync(graph, handle, repoName)` — Déterministe + Regex

1. Appelle `detectChanges` → `ChangeReport`
2. Si aucun changement → retourne le graph inchangé + diff vide
3. Pour chaque fichier **modifié** :
   a. Trouve le nœud D2 correspondant (via `sourceRef.filePath` dans `syncLock`)
   b. Relit le contenu du fichier
   c. Détecte le langage depuis l'extension (`.ts/.tsx` → typescript, `.py` → python, etc.)
   d. Re-parse les symboles : `codeParserService.extractSymbols(content, language)`
   e. Calcule le nouveau hash
   f. Diff D3 : symboles ajoutés (dans le nouveau parse mais pas dans les enfants actuels), supprimés (dans les enfants actuels mais plus dans le nouveau parse)
   g. Ajoute les nouveaux nœuds D3, retire les obsolètes
   h. Met à jour `syncLock[nodeId]` avec le nouveau hash et `status: 'locked'`
4. Pour chaque fichier **manquant** : met à jour `syncLock[nodeId].status = 'missing'` (ne supprime pas le nœud)
5. Calcule le `GraphDiff` : `diffGraphs(graphBefore, graphAfter)`
6. Retourne `{ graph: updatedGraph, diff }`

#### `diffGraphs(before, after)` — Déterministe

Compare les maps `nodes` et `relations` par clé (ID stable) :
- Nœud dans `after` mais pas `before` → `addedNodes`
- Nœud dans `before` mais pas `after` → `removedNodes`
- Même ID, mais `name` / `kind` / `sourceRef.contentHash` différent → `modifiedNodes`
- Idem pour les relations

**Garantie de cohérence :** les IDs de nœuds sont stables depuis la création (générés une fois, jamais réassignés). Le diff par ID est donc non-ambigu pour les modifications. Seuls les ajouts/suppressions peuvent provoquer des faux positifs si un fichier est renommé (apparaît comme remove + add au lieu de modify).

#### `fullResync(graph, handle, repoName)` — Complet avec LLM

Relance l'intégralité du pipeline de génération (Étapes 0→3). Préserve : `id`, `name`, `createdAt`, `lenses`, `activeLensId`, `domainNodes`, `domainRelations`, `flows`. Recalcule tout le reste.

À utiliser quand : nouveaux fichiers détectés, changement de structure des modules, réorganisation de répertoires.

**Faille #11 (gap actuel) :** Le système ne décide pas automatiquement de basculer de `incrementalResync` vers `fullResync` quand le changement est suffisamment majeur. C'est laissé à l'utilisateur. Un heuristique manque :
```
Si diff.addedNodes.filter(n => n.depth <= 1).length > 2
   OU diff.removedNodes.filter(n => n.depth <= 1).length > 0
→ déclencher fullResync automatiquement
```

---

### Axe 2 : Propagation aux Diagrammes (`diagramSyncService`)

#### `findAffectedDiagrams(diagrams, graphId, diff)`

Filtre les diagrammes ayant `sourceGraphId === graphId`. Ce sont les seuls diagrammes "dérivés" qui doivent être mis à jour. Les diagrammes manuels sont ignorés.

#### `proposeDiagramUpdate(diagram, updatedGraph, graphDiff, llmSettings)` — LLM

C'est ici qu'intervient le seul LLM du pipeline de resync, pour un **merge intelligent**.

**Ce que le LLM reçoit :**

System prompt :
```
Tu es un expert en architecture. Tu dois mettre à jour un diagramme Mermaid
en intégrant les changements du code, TOUT EN PRÉSERVANT les ajouts manuels
de l'utilisateur qui restent architecturalement pertinents. Sois conservateur :
dans le doute, garde ce que l'utilisateur a ajouté.
```

Message utilisateur :
```
Diagramme actuel ("Nom du diagramme") :
```mermaid
flowchart TD
  AuthService["Auth Service"]
  TokenManager["Token Manager"]
  UserRepo["User Repository"]
  AuthService --> TokenManager
  AuthService --> UserRepo
  ManualNode["Audit Logger"]  ← ajout manuel de l'utilisateur
```

Changements détectés dans le code :
  Added nodes: SessionCache (module), validateToken (function)
  Removed nodes: UserRepo (module)
  Modified nodes: AuthService (content changed)

Structure du code mise à jour (scope: Auth Service) :
  Nodes (3):
    - AuthService [package] — 2 children
    - TokenManager [module]
    - SessionCache [module]  ← nouveau
  Relations (2):
    - AuthService → TokenManager [depends_on]
    - AuthService → SessionCache [depends_on]  ← nouvelle
```

**Comportement attendu du LLM :**
- Retire `UserRepo` (supprimé dans le code)
- Ajoute `SessionCache` (nouveau dans le code)
- Garde `ManualNode` (ajout utilisateur, reste architecturalement plausible)
- Maintient les conventions de style (flowchart TD, guillemets, etc.)

**Fallback :** si le LLM échoue ou est non configuré → `generateMermaidFromGraph()` (déterministe, perd les ajouts manuels).

#### `computeDiagramDiff(diagram, proposedCode)` — Déterministe

Compare le code Mermaid actuel et le code proposé en parsant les nœuds et arêtes par **label** (pas par ID Mermaid) :
- `addedNodes` : labels dans proposedCode absents du code actuel
- `removedNodes` : labels dans le code actuel absents de proposedCode
- Même logique pour les arêtes (clé : `from::to::label`)

Produit aussi `annotatedCode` : le diagramme proposé avec des `classDef` Mermaid ajoutés pour coloriser les nœuds ajoutés (vert `#16a34a`) et supprimés (rouge `#dc2626`).

**Faille #12 :** Le matching par label (pas par ID Mermaid) est fragile. Si l'utilisateur a renommé un nœud Mermaid (`UserService` → `User Service`), le diff voit un remove + add au lieu d'une modification. Pas de détection de rename.

#### `buildSyncProposal(graph, graphDiff, diagrams, updatedGraph, llmSettings)` — Async

Orchestre l'ensemble : trouve les diagrammes affectés, appelle `proposeDiagramUpdate` pour chacun (appels LLM séquentiels), filtre les diffs sans changements, retourne un `SyncProposal`.

**Faille #13 :** Les appels LLM pour les diagrammes sont séquentiels, pas parallèles. Sur un workspace avec 10 diagrammes dérivés, ça représente 10 appels LLM en série.

---

### Modes de Sync (`useSyncHandlers`)

| Mode | Comportement |
|------|-------------|
| **manual** | Rien d'automatique. L'utilisateur déclenche "Check" (détection) puis "Sync" (resync). Tous les diffs sont présentés dans `SyncDiffModal` pour review. |
| **semi-auto** *(défaut)* | Après resync : les diffs avec uniquement des **ajouts** (0 suppression de nœuds/arêtes) sont auto-appliqués. Les diffs avec des suppressions sont mis en pending → `SyncDiffModal`. |
| **auto** | Tous les diffs appliqués immédiatement. Notification toast "N diagrammes mis à jour". |

Le mode est persisté en localStorage (`bluelens_sync_mode`).

---

## Matrice des Failles Identifiées

| # | Composant | Type de faille | Impact |
|---|-----------|----------------|--------|
| 1 | `codebaseAnalyzerService` | Regex vs AST | Appels indirects, dynamic imports manqués |
| 2 | Agent 1 File Analyst | Pas de code source | Classification des rôles imprécise |
| 3 | Agent 1 File Analyst | Pas de code source | `purpose` générique ou trompeur |
| 4 | Agent 2 Architect | 1 appel pour tout le repo | Dégradation qualité sur grands repos |
| 5 | Agent 2 Architect | Pas de validation de cohésion | Modules incohérents (fichiers non liés) |
| 6 | Agent 2 Architect | Relations inventées | Dépendances entre modules incorrectes |
| 7 | `codeToGraphParserService` | Résolution d'imports heuristique | Barrel files, alias complexes manqués |
| 8 | `codeToGraphParserService` | Regex pour call edges | Callbacks, méthodes, destructuring manqués |
| 9 | `codeGraphFlowService` | Pas de code source | Flows plausibles mais non vérifiés |
| 10 | `codeGraphFlowService` | Troncature à 100/200 | Relations importantes potentiellement coupées |
| 11 | `codeGraphSyncService` | Pas de basculement auto full/incrémental | Nouveaux fichiers jamais intégrés en incrémental |
| 12 | `diagramSyncService` | Matching label-based | Renommages vus comme remove+add |
| 13 | `diagramSyncService` | LLM calls séquentiels | Latence O(n) sur n diagrammes dérivés |

---

## Ce qui N'est PAS dans le système

- **Pas de code source dans les prompts LLM** (sauf `get_node_source` dans l'agent chat) — le LLM raisonne sur des métadonnées
- **Pas de three-way merge** pour les diagrammes (base / current / proposed) — le LLM tente le merge mais sans base explicite
- **Pas de trigger automatique** incrémental→fullResync pour les changements structurels majeurs
- **Pas de parallelisme** dans les appels LLM pour les proposals de diagrammes
- **Pas de tree-sitter** — parsing regex uniquement pour tous les langages
- **Pas de sync pour GitHub repos** — le resync nécessite un `FileSystemDirectoryHandle` local (File System Access API)
