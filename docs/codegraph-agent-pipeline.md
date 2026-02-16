# CodeGraph — Pipeline LLM pour le groupement architectural

## Probleme

Le CodeGraph groupe les fichiers par **repertoire** : `components/`, `hooks/`, `services/`.
C'est la meme chose qu'un explorateur de fichiers — ca ne montre pas l'architecture.

Des fichiers de 3 repertoires differents qui implementent la meme feature devraient apparaitre ensemble.

## Methode : 2 agents LLM en sequence

```
Fichiers du repo
      |
      v
 +-----------+     +-----------+     +------------------+
 | Agent 1   | --> | Agent 2   | --> | Modules fonctionnels
 | Analyste  |     | Architecte|     | dans le CodeGraph
 +-----------+     +-----------+     +------------------+
  par batch de 10    appel unique
```

### Agent 1 — Analyste de fichiers

**Entree** : metadonnees deja extraites (pas de re-lecture de fichiers)

```
File: services/llmService.ts
Symbols: sendMessage (function), testConnection (function)
Imports: @google/genai, openai, ../types
Exports: llmService, getDefaultSettings
```

**Sortie** : but + role de chaque fichier

```json
{
  "filePath": "services/llmService.ts",
  "purpose": "Multi-provider LLM abstraction for Gemini, OpenAI, and Anthropic",
  "role": "service"
}
```

**Batching** : 10 fichiers par appel LLM. Un projet de 40 fichiers = 4 appels.

**Tolerances** :
- Les chemins retournes par le LLM sont normalises (`./foo.ts` → `foo.ts`)
- Les roles invalides sont inferes depuis le nom de fichier
- On accepte le resultat si au moins 50% des fichiers sont couverts
- Les fichiers manquants sont completes avec un fallback par nom

### Agent 2 — Architecte

**Entree** : toutes les analyses de l'Agent 1 + les aretes d'import entre fichiers

```
FILE SUMMARIES:
services/llmService.ts — Multi-provider LLM abstraction [...] [service]
components/AIChatPanel.tsx — Chat UI for AI interactions [component]
hooks/useChatHandlers.ts — Chat session state management [hook]

IMPORT RELATIONSHIPS:
hooks/useChatHandlers.ts → services/llmService.ts
components/AIChatPanel.tsx → hooks/useChatHandlers.ts
```

**Sortie** : modules nommes + relations

```json
{
  "modules": [
    {
      "name": "AI Intelligence",
      "description": "LLM chat, generation, analysis",
      "files": ["services/llmService.ts", "components/AIChatPanel.tsx", "hooks/useChatHandlers.ts"]
    }
  ],
  "relationships": [
    { "from": "AI Intelligence", "to": "Diagram Editor", "label": "modifies diagrams" }
  ]
}
```

**Contrainte cle dans le prompt** : le system prompt inclut la liste exacte des chemins valides,
avec l'instruction de les copier tels quels. Ca evite que le LLM modifie les chemins.

**Tolerances** :
- Resolution flexible des chemins (normalisation, sans extension, par basename)
- Un module avec 0 fichier valide est ignore (pas rejet de tout le blueprint)
- Les noms de module dupliques recoivent un suffixe
- Les fichiers non assignes vont dans un module "Other"
- Minimum 1 module (pas 2) pour accepter le resultat

## Chaine de fallback

```
LLM configure ?
  |
  oui --> Pipeline AI
  |         |
  |         succes --> Modules fonctionnels (ex: "AI Intelligence", "Diagram Editor")
  |         |
  |         echec (3 tentatives) --> Groupement par repertoire
  |
  non --> Groupement par repertoire (comportement original)
```

Chaque agent a droit a 3 tentatives (1 initiale + 2 retries).
Si le JSON est invalide, le retry inclut un message d'erreur dans le prompt.

## Flux de code

```
App.tsx
  handleCreateGraph(repoId)           -- injecte llmSettings
    |
    v
useCodeGraph.ts
  createGraph(repoId, llmSettings?)
    |
    +--> codebaseAnalyzerService.analyzeCodebase(handle)   -- scan brut des fichiers
    |
    +--> analyzeCodebaseWithAI(analysis, llmSettings)      -- re-groupe par cohesion
    |      |
    |      +--> Agent 1: analyzeFilesBatch() x N batches
    |      +--> Agent 2: buildArchitecture()
    |      +--> Retourne CodebaseAnalysis avec modules re-groupes
    |
    +--> parseCodebaseToGraph(analysis, ...)                -- construit le graph D0-D3
```

Le `parseCodebaseToGraph` recoit l'analyse deja re-groupee.
Il cree les noeuds D1 (modules) depuis `analysis.modules`, donc si les modules
sont fonctionnels, le graph D1 montre des modules fonctionnels.

## Fichiers impliques

| Fichier | Role |
|---|---|
| `services/codeGraphAgentService.ts` | Pipeline LLM (Agent 1 + Agent 2 + orchestrateur) |
| `services/codeToGraphParserService.ts` | CodebaseAnalysis → CodeGraph (D0-D3) |
| `hooks/useCodeGraph.ts` | Appelle le pipeline si LLM configure |
| `App.tsx` | Injecte llmSettings dans createGraph |
| `components/Sidebar.tsx` | Affiche la progression pendant l'analyse AI |

## Cout token

| Taille projet | Agent 1 | Agent 2 | Total | Cout (Gemini Flash) |
|---|---|---|---|---|
| ~30 fichiers | 3 batches | 1 appel | ~65K tokens | ~$0.01 |
| ~200 fichiers | 20 batches | 1 appel | ~410K tokens | ~$0.10 |

## Debug

Ouvrir la console du navigateur. Les logs `[CodeGraph]` montrent :
- `[CodeGraph] Agent 1 complete: N file analyses`
- `[CodeGraph] Import edges resolved: N`
- `[CodeGraph Agent 2] Created N modules with N relationships`
- `[CodeGraph Agent 2] Module "X" had 0 valid files, skipping` (si probleme de chemins)
- `[CodeGraph] AI pipeline failed, returning directory-based grouping` (fallback)
