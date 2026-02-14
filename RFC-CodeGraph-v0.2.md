# RFC-0001 : CodeGraph — Spécification pour un Système de Visualisation Bidirectionnelle Code ↔ Diagramme

**Version** : 0.2 (Draft)
**Date** : 11 février 2026
**Statut** : Proposition initiale
**Auteur** : [À compléter]

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Problème](#2-problème)
3. [Principes fondateurs](#3-principes-fondateurs)
4. [Modèle conceptuel](#4-modèle-conceptuel)
5. [Les trois dimensions du système](#5-les-trois-dimensions-du-système)
6. [Le graphe de navigation (Zoom Graph)](#6-le-graphe-de-navigation-zoom-graph)
7. [Les perspectives (ViewLens)](#7-les-perspectives-viewlens)
8. [Le lien bidirectionnel Code ↔ Diagramme](#8-le-lien-bidirectionnel-code--diagramme)
9. [Format de description : CodeGraph Manifest (CGM)](#9-format-de-description--codegraph-manifest-cgm)
10. [Détection d'anomalies et incohérences](#10-détection-danomalies-et-incohérences)
11. [Navigation et interaction utilisateur](#11-navigation-et-interaction-utilisateur)
12. [Comparaison avec les approches existantes](#12-comparaison-avec-les-approches-existantes)
13. [Cas d'usage](#13-cas-dusage)
14. [Glossaire](#14-glossaire)
15. [Prochaines étapes](#15-prochaines-étapes)

---

## 1. Résumé exécutif

**CodeGraph** est une spécification pour un système de visualisation interactive du code source sous forme de diagrammes hiérarchiques et navigables. Le système est **bidirectionnel** : toute modification dans un diagramme se reflète dans le code, et toute modification du code met à jour les diagrammes.

L'idée centrale est celle d'une **carte zoomable du logiciel**. À chaque niveau de zoom, un diagramme montre les éléments pertinents. Cliquer sur un nœud revient à "zoomer" : un nouveau diagramme s'ouvre, montrant les détails internes de ce nœud. Plusieurs **perspectives** (métier, flux de données, composants) permettent de voir le même système sous différents angles.

CodeGraph ne remplace pas le code. Il le rend **navigable, compréhensible et auditable** visuellement, comme un moteur 3D permet d'explorer les pièces d'une machine.

---

## 2. Problème

Le code source est **linéaire et textuel**. Cette représentation est efficace pour l'écriture et l'exécution, mais inadaptée pour :

- **Comprendre l'architecture globale** d'un système complexe. Un développeur qui rejoint un projet doit lire des centaines de fichiers pour comprendre comment les pièces s'assemblent.
- **Identifier les flux critiques**. Quel chemin prend une requête utilisateur du frontend jusqu'à la base de données ? Où sont les goulots d'étranglement ?
- **Détecter les incohérences**. Un composant qui dépend d'un service non documenté, une route API sans handler, un flux de données qui boucle sans condition d'arrêt.
- **Communiquer avec les non-développeurs**. Les product managers, designers et stakeholders ne lisent pas le code, mais ont besoin de comprendre le système.
- **Naviguer entre niveaux d'abstraction**. Passer de "ce microservice gère les paiements" à "voici la fonction qui appelle Stripe" nécessite aujourd'hui un effort cognitif considérable.

Les outils existants (UML, C4, Mermaid) produisent des diagrammes **statiques et déconnectés du code**. Ils deviennent obsolètes dès que le code évolue. CodeGraph propose une approche où les diagrammes **sont** le code, vu autrement.

---

## 3. Principes fondateurs

### P1 — Le code est la source de vérité
Les diagrammes sont dérivés du code et synchronisés avec lui. Un diagramme sans code sous-jacent n'est qu'une illustration. CodeGraph garantit que ce que vous voyez correspond à ce qui s'exécute.

### P2 — Zoom sémantique, pas géométrique
Zoomer ne signifie pas agrandir visuellement un diagramme. Cela signifie **descendre d'un niveau d'abstraction** : un nœud "Service Paiement" à un niveau devient un diagramme complet montrant ses classes, fonctions et dépendances au niveau suivant.

### P3 — Perspectives multiples, modèle unique
Le même graphe sous-jacent peut être affiché sous différentes perspectives (métier, flux, composants). Chaque perspective est un **filtre et un style de rendu** appliqué au même modèle, pas un modèle séparé.

### P4 — Bidirectionnalité
Modifier un diagramme (ajouter un nœud, créer une connexion, renommer un élément) génère ou modifie le code correspondant. Modifier le code met à jour les diagrammes automatiquement.

### P5 — Lisibilité avant exhaustivité
Un diagramme ne doit jamais tout montrer. Chaque niveau montre **uniquement** les éléments pertinents à ce niveau d'abstraction. La complexité est gérée par la profondeur, pas par la densité.

---

## 4. Modèle conceptuel

CodeGraph repose sur trois concepts fondamentaux qui forment un espace tridimensionnel de navigation.

```
                    ┌─────────────────────────────────────────┐
                    │           L'espace CodeGraph             │
                    │                                         │
                    │   Axe Y : Perspective (ViewLens)        │
                    │   ▲  Métier │ Flux │ Composants         │
                    │   │                                     │
                    │   │         ┌───────────┐               │
                    │   │        ╱           ╱│               │
                    │   │       ╱  Diagram  ╱ │               │
                    │   │      ╱    Node   ╱  │               │
                    │   │     ╱           ╱   │               │
                    │   │    └───────────┘    │               │
                    │   │    │           │   ╱                │
                    │   │    │   Canvas  │  ╱                 │
                    │   │    │           │ ╱                  │
                    │   │    └───────────┘                    │
                    │   │                                     │
                    │   └──────────────────────► Axe X :      │
                    │              Profondeur (Depth)          │
                    │              Système → Service → Classe  │
                    │                          → Fonction      │
                    │                                         │
                    │              Axe Z : Synchronisation     │
                    │              Code source ←→ Modèle       │
                    └─────────────────────────────────────────┘
```

---

## 5. Les trois dimensions du système

### Dimension 1 — Profondeur (Depth Axis)

La profondeur définit les **niveaux d'abstraction** du système. Chaque niveau correspond à un degré de détail.

| Niveau | Hiérarchie technique (ComponentLens, FlowLens) | Hiérarchie métier (DomainLens) |
|--------|------------------------------------------------|-------------------------------|
| D0 | Écosystème — le système et ses acteurs externes | Domaines métier — les grands périmètres fonctionnels ("Commerce", "Logistique", "Facturation") |
| D1 | Services — les grands blocs techniques (microservices, modules) | Sous-domaines — les capacités métier ("Gestion des commandes", "Catalogue produits") |
| D2 | Composants — classes, contrôleurs, repositories | Entités métier — les concepts du domaine ("Commande", "Client", "Produit") |
| D3 | Unités — fonctions, méthodes et signatures | Règles / Cas d'usage — les comportements métier ("Valider une commande", "Calculer la TVA") |
| D4 | Implémentation — le code source, visualisé comme flowchart | **Convergence** — le code source, identique à la vue technique |

**Règle fondamentale** : un nœud au niveau Dn peut être "ouvert" pour révéler un diagramme au niveau Dn+1. C'est la mécanique de zoom sémantique.

**Point critique — Double hiérarchie** : la hiérarchie technique et la hiérarchie métier ne se superposent pas. Un concept métier ("Commande") peut être éclaté dans 3 services techniques différents. Les deux hiérarchies sont des **arbres parallèles** qui partagent le même socle de code (D4) mais l'organisent différemment. La section 7.5 détaille ce mécanisme.

### Dimension 2 — Perspective (ViewLens Axis)

Une perspective est un **filtre sémantique** qui détermine quels nœuds et quelles relations sont affichés, et comment ils sont stylisés. Trois perspectives prioritaires :

**Vue Composants / Architecture (ComponentLens)**
Montre la structure statique : quels éléments existent, comment ils sont organisés, quelles sont leurs dépendances. C'est la vue "plan d'architecte". Les relations sont de type : *dépend de*, *contient*, *hérite de*, *implémente*.

**Vue Flux de données (FlowLens)**
Montre les chemins dynamiques : comment les données circulent à travers le système. Les nœuds sont les mêmes, mais les relations sont de type : *envoie des données à*, *lit depuis*, *écrit dans*, *appelle*. Les flux critiques (requête utilisateur, pipeline de paiement) sont mis en évidence.

**Vue Métier / Domaine (DomainLens)**
Montre les concepts métier et leurs relations, indépendamment de l'implémentation technique. Contrairement aux deux autres perspectives qui filtrent le même arbre technique, la DomainLens opère sur sa **propre hiérarchie parallèle** de nœuds virtuels (`DomainNode`). Les nœuds sont des entités du domaine (Commande, Client, Produit, Paiement) et les relations sont des règles métier ("Un Client passe une Commande", "Un Paiement valide une Commande"). Cette vue est lisible par des non-développeurs. Un mécanisme de **projection** lie chaque nœud métier aux nœuds techniques qui l'implémentent (voir section 7.5).

### Dimension 3 — Synchronisation (Sync Axis)

La synchronisation est le **lien vivant** entre le modèle CodeGraph et le code source. Deux directions :

**Code → Modèle (Analyse)**
Un analyseur (parser) lit le code source et construit le graphe CodeGraph. Il extrait les structures (classes, fonctions, modules), les relations (imports, appels, héritages), et les annotations CodeGraph éventuellement présentes dans le code.

**Modèle → Code (Génération)**
Lorsqu'un utilisateur modifie un diagramme (ajouter un composant, créer une relation), le système génère ou modifie le code correspondant. Cela peut aller de la création d'un fichier squelette à la modification d'un import.

---

## 6. Le graphe de navigation (Zoom Graph)

### 6.1 Définition formelle

Le Zoom Graph est un **graphe acyclique dirigé** (DAG) où :

- Chaque **nœud** (`GraphNode`) représente un élément du logiciel à un certain niveau d'abstraction.
- Chaque **arête de composition** (`contains`) relie un nœud parent à ses nœuds enfants (relation de zoom).
- Chaque **arête de relation** (`relates_to`) relie des nœuds au même niveau, typée selon la perspective active.

### 6.2 Structure d'un GraphNode

```
GraphNode {
    id          : UUID                  # Identifiant unique
    name        : String                # Nom affiché
    kind        : NodeKind              # Type (system, service, component, unit, impl)
    depth       : Int                   # Niveau de profondeur (D0-D4)
    source_ref  : SourceReference?      # Lien vers le code source (fichier, ligne, colonne)
    metadata    : Map<String, Any>      # Métadonnées extensibles
    children    : List<GraphNode>       # Nœuds enfants (niveau suivant)
    relations   : List<Relation>        # Relations avec d'autres nœuds
    tags        : List<String>          # Tags pour filtrage (ex: "critical", "deprecated")
    lens_config : Map<LensType, LensOverride>  # Surcharge d'affichage par perspective
    domain_projections : List<DomainProjection>  # Liens vers les DomainNodes qui incluent ce nœud
}
```

### 6.3 Structure d'une Relation

```
Relation {
    id          : UUID
    source      : NodeRef               # Nœud source
    target      : NodeRef               # Nœud cible
    kind        : RelationKind          # Type de relation
    lens        : List<LensType>        # Perspectives où cette relation est visible
    direction   : Direction             # unidirectional | bidirectional
    metadata    : Map<String, Any>      # Données additionnelles (ex: type de données transférées)
    source_ref  : SourceReference?      # D'où vient cette relation dans le code
}
```

### 6.4 Types de relations (RelationKind)

| RelationKind | Lens | Signification |
|-------------|------|---------------|
| `contains` | Toutes | A contient B (zoom) |
| `depends_on` | ComponentLens | A dépend de B (import, injection) |
| `inherits` | ComponentLens | A hérite de B |
| `implements` | ComponentLens | A implémente l'interface B |
| `calls` | FlowLens | A appelle B |
| `sends_data` | FlowLens | A envoie des données à B |
| `reads_from` | FlowLens | A lit depuis B |
| `writes_to` | FlowLens | A écrit dans B |
| `domain_rel` | DomainLens | Relation métier (customisable) |

### 6.5 Référence au code source

```
SourceReference {
    file        : FilePath              # Chemin du fichier
    start_line  : Int                   # Ligne de début
    end_line    : Int                   # Ligne de fin
    start_col   : Int?                  # Colonne de début (optionnel)
    end_col     : Int?                  # Colonne de fin (optionnel)
    language    : String                # Langage (typescript, python, java...)
    hash        : String                # Hash du contenu pour détecter les désynchronisations
}
```

---

## 7. Les perspectives (ViewLens)

### 7.1 Définition

Une ViewLens est un **filtre de projection** appliqué au Zoom Graph. Elle détermine :

1. **Quels nœuds sont visibles** (filtrage par `kind`, `tags`, ou règle custom)
2. **Quelles relations sont visibles** (filtrage par `RelationKind` et `lens`)
3. **Comment les éléments sont rendus** (style, couleur, forme, icône)
4. **Quelles informations sont affichées** (label, métriques, statut)

### 7.2 Structure d'une ViewLens

```
ViewLens {
    id              : String                # Identifiant (ex: "component", "flow", "domain")
    name            : String                # Nom affiché
    description     : String                # Description pour l'utilisateur
    node_filter     : NodeFilter            # Règles de visibilité des nœuds
    relation_filter : RelationFilter        # Règles de visibilité des relations
    style_rules     : List<StyleRule>       # Règles de rendu
    layout_hint     : LayoutHint            # Suggestion de layout (hierarchical, flow, force-directed)
    aggregation     : AggregationRules?     # Comment regrouper les nœuds (optionnel)
}
```

### 7.3 Composition de perspectives

Les perspectives peuvent être **combinées**. Par exemple, afficher la vue composants avec les flux de données superposés en surbrillance. La spécification définit un opérateur de composition :

```
CombinedLens = ComponentLens + FlowLens.highlight("payment_flow")
```

Cela permet de répondre à des questions comme : "Montre-moi l'architecture, mais mets en évidence le chemin du flux de paiement."

### 7.4 Perspectives par défaut

**ComponentLens** :
- Layout : hiérarchique (boîtes imbriquées)
- Nœuds : tous types structurels
- Relations : `depends_on`, `inherits`, `implements`
- Style : boîtes avec icônes par type, couleur par module/package

**FlowLens** :
- Layout : flux gauche → droite ou haut → bas
- Nœuds : points de passage des données
- Relations : `calls`, `sends_data`, `reads_from`, `writes_to`
- Style : flèches animées, épaisseur proportionnelle au volume, couleur par type de données

**DomainLens** :
- Layout : force-directed (organique)
- Nœuds : **DomainNodes** — nœuds virtuels de la hiérarchie métier (pas un filtre sur les nœuds techniques)
- Relations : `domain_rel` uniquement
- Style : formes distinctes par type d'entité, labels en langage naturel
- Particularité : opère sur sa propre hiérarchie (voir 7.5)

### 7.5 La double hiérarchie : concilier la vue métier avec les vues techniques

#### 7.5.1 Le problème fondamental

Les vues ComponentLens et FlowLens partagent le même arbre de nœuds techniques : elles filtrent et stylisent les mêmes `GraphNode`, simplement en montrant des relations différentes. La DomainLens ne peut pas fonctionner ainsi, car **les concepts métier ne correspondent pas aux découpages techniques**.

Exemple concret — l'entité métier "Commande" dans un e-commerce :

```
Vue technique (ComponentLens) :                 Vue métier (DomainLens) :
                                               
  ┌─ Service API ─────────────┐                  ┌─ Commande ──────────────────┐
  │  OrderController          │ ──projette──►    │                             │
  │  OrderValidator           │ ──projette──►    │  "Un client passe une       │
  └───────────────────────────┘                  │   commande qui contient     │
  ┌─ Service Payment ─────────┐                  │   des produits et déclenche │
  │  OrderService             │ ──projette──►    │   un paiement"             │
  │  OrderRepository          │ ──projette──►    │                             │
  └───────────────────────────┘                  └─────────────────────────────┘
  ┌─ Service Catalog ─────────┐                 
  │  order.model.ts           │ ──projette──►   
  └───────────────────────────┘                 
```

L'entité "Commande" est implémentée par **5 composants répartis dans 3 services**. Un simple filtre sur l'arbre technique produirait un diagramme fragmenté et incompréhensible.

#### 7.5.2 Solution : le Domain Graph (hiérarchie parallèle)

Le Zoom Graph contient en réalité **deux arbres** qui coexistent :

```
                    ┌──────────────────────────────────────────────────┐
                    │              Zoom Graph (unifié)                  │
                    │                                                  │
                    │   Technical Tree          Domain Tree            │
                    │   (ComponentLens,         (DomainLens)           │
                    │    FlowLens)                                     │
                    │                                                  │
                    │   D0: Ecosystem ─ ─ ─ ─  D0: Domain Areas       │
                    │       │                       │                  │
                    │   D1: Services ─ ─ ─ ─ ─ D1: Subdomains        │
                    │       │                       │                  │
                    │   D2: Components ═══════ D2: Entities           │
                    │       │          projection    │                  │
                    │   D3: Functions ═════════ D3: Business Rules    │
                    │       │          projection    │                  │
                    │   D4: Code ──────────── D4: Code (convergence)  │
                    │                                                  │
                    └──────────────────────────────────────────────────┘
                    
                    ─ ─ ─  = correspondance lâche (pas de lien direct)
                    ═══════ = projection (liens explicites)
                    ──────── = convergence (même nœud)
```

Le **Technical Tree** est celui décrit dans les sections précédentes. Le **Domain Tree** est un second arbre composé de `DomainNode`, avec sa propre hiérarchie de profondeur.

#### 7.5.3 Structure d'un DomainNode

```
DomainNode {
    id              : UUID
    name            : String                    # Nom métier en langage naturel ("Commande")
    kind            : DomainKind                # domain_area | subdomain | entity | business_rule | use_case
    depth           : Int                       # D0-D4 dans la hiérarchie métier
    description     : String                    # Description lisible par un non-développeur
    children        : List<DomainNode>          # Enfants dans la hiérarchie métier
    relations       : List<DomainRelation>      # Relations métier avec d'autres DomainNodes
    projections     : List<Projection>          # Liens vers les nœuds techniques
    invariants      : List<String>              # Règles métier invariantes ("le total ne peut pas être négatif")
    metadata        : Map<String, Any>
}
```

#### 7.5.4 La Projection : le pont entre les deux hiérarchies

Une **Projection** est le lien formel entre un nœud métier et les nœuds techniques qui l'implémentent.

```
Projection {
    domain_node     : DomainNodeRef             # Le nœud métier
    technical_nodes : List<TechnicalNodeRef>     # Les nœuds techniques projetés
    role            : ProjectionRole             # Quel rôle joue ce nœud technique pour le concept métier
    completeness    : Float                      # 0.0-1.0 : quelle fraction du concept ce nœud couvre
}
```

Les **rôles de projection** (`ProjectionRole`) définissent comment un nœud technique contribue au concept métier :

| ProjectionRole | Signification | Exemple |
|---------------|---------------|---------|
| `defines` | Définit la structure de l'entité | `order.model.ts` définit "Commande" |
| `validates` | Vérifie les règles métier | `OrderValidator` valide "Commande" |
| `persists` | Stocke/récupère l'entité | `OrderRepository` persiste "Commande" |
| `orchestrates` | Coordonne les opérations sur l'entité | `OrderService` orchestre "Commande" |
| `exposes` | Expose l'entité à l'extérieur | `OrderController` expose "Commande" |
| `transforms` | Transforme ou enrichit l'entité | `OrderMapper` transforme "Commande" |
| `notifies` | Produit des événements liés à l'entité | `OrderEventEmitter` notifie sur "Commande" |

#### 7.5.5 La profondeur en DomainLens : comment le zoom fonctionne

Quand l'utilisateur navigue en DomainLens, il parcourt le **Domain Tree**, pas le Technical Tree. Voici ce que chaque niveau montre et comment il se comporte :

**D0 — Domaines métier**
L'utilisateur voit les grands périmètres fonctionnels. Chaque nœud est un domaine au sens DDD (Domain-Driven Design).

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Commerce   │────►│  Logistique  │     │  Facturation  │
│             │     │              │◄────│               │
└─────────────┘     └──────────────┘     └───────────────┘
        │                                        │
        └────────────────────────────────────────┘
              "Commerce déclenche Facturation"
```

**D1 — Sous-domaines**
Zoomer sur "Commerce" révèle ses sous-domaines. Ces sous-domaines ne correspondent pas nécessairement à des services techniques — ils sont découpés par **capacité métier**.

```
Commerce (zoom in) :
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  Catalogue   │────►│  Commandes    │────►│  Fidélité    │
│  produits    │     │               │     │  client      │
└──────────────┘     └───────────────┘     └──────────────┘
```

**D2 — Entités métier**
Zoomer sur "Commandes" montre les entités et leurs relations métier. C'est le niveau le plus utile pour les product managers.

```
Commandes (zoom in) :
┌──────────┐  passe  ┌───────────┐  contient  ┌──────────┐
│  Client  │────────►│ Commande  │◄───────────│ Ligne de │
└──────────┘         └───────────┘             │ commande │
                          │                    └──────────┘
                     déclenche                      │
                          ▼                    référence
                    ┌───────────┐                   ▼
                    │ Paiement  │             ┌──────────┐
                    └───────────┘             │ Produit  │
                                             └──────────┘
```

**D3 — Règles métier / Cas d'usage**
Zoomer sur "Commande" montre ses **règles et comportements métier**, exprimés en langage naturel. Chaque règle est liée aux fonctions techniques qui l'implémentent via les projections.

```
Commande (zoom in) :
┌───────────────────────────────────────────────────────────────────┐
│  Cas d'usage : Passer une commande                               │
│  ─────────────────────────────────────                           │
│  1. Vérifier que le panier n'est pas vide                        │
│  2. Vérifier la disponibilité de chaque produit                  │
│  3. Calculer le total (sous-total + taxes + livraison)           │
│  4. Valider le moyen de paiement                                 │
│  5. Créer la commande et réserver le stock                       │
│  6. Initier le paiement                                          │
│  7. Envoyer la confirmation                                      │
│                                                                   │
│  Invariants :                                                     │
│  • Le total ne peut pas être négatif                             │
│  • Une commande doit avoir au moins une ligne                    │
│  • Le stock doit être réservé avant le paiement                  │
│                                                                   │
│  Projections techniques :                                         │
│  ├─ Étape 1-2 → OrderValidator.validate()                       │
│  ├─ Étape 3   → PricingService.calculateTotal()                 │
│  ├─ Étape 4   → PaymentService.validateMethod()                 │
│  ├─ Étape 5   → OrderService.createOrder() + StockService.reserve()│
│  ├─ Étape 6   → PaymentService.processPayment()                 │
│  └─ Étape 7   → NotificationService.sendConfirmation()          │
└───────────────────────────────────────────────────────────────────┘
```

**D4 — Convergence**
Au niveau D4, l'utilisateur clique sur une étape ou une projection et atterrit dans le **code source réel**, exactement comme en vue technique. Les deux hiérarchies convergent vers le même code. La seule différence est le **chemin parcouru** pour y arriver.

```
Chemin technique :  Ecosystem → Service Payment → PaymentService → processPayment() → code
Chemin métier :     Commerce → Commandes → Commande → "Initier le paiement" → processPayment() → code
                                                                                      ▲
                                                                              Même destination
```

#### 7.5.6 Transition entre perspectives (le "cross-lens jump")

Un mécanisme essentiel : à tout moment, l'utilisateur peut **sauter d'une hiérarchie à l'autre** en utilisant les projections.

**Du métier vers le technique** : en DomainLens, l'utilisateur voit l'entité "Commande" et ses règles. Il peut cliquer sur "Voir l'implémentation" pour basculer en ComponentLens, centré sur les composants techniques projetés. Le système "éclate" le concept métier et montre où ses morceaux vivent dans l'architecture technique.

**Du technique vers le métier** : en ComponentLens, l'utilisateur regarde `OrderService`. Un badge indique "Commande (orchestrates)". Cliquer dessus bascule en DomainLens, centré sur l'entité "Commande", pour comprendre le contexte métier de ce composant.

```
Interaction :

  [DomainLens - D2]                    [ComponentLens - D2]
  ┌───────────┐                        ┌─ Service Payment ─────────┐
  │ Commande  │ ──"Voir implémentation"──► │  OrderService          │
  │           │                        │  OrderRepository         │
  │           │ ◄──"Voir contexte métier"── │  PaymentService        │
  └───────────┘                        └───────────────────────────┘
```

#### 7.5.7 Relations dans le Domain Tree

Les relations métier (`DomainRelation`) ont leur propre typologie, distincte des relations techniques :

```
DomainRelation {
    id          : UUID
    source      : DomainNodeRef
    target      : DomainNodeRef
    kind        : DomainRelationKind
    label       : String                    # Libellé en langage naturel
    cardinality : Cardinality?              # 1:1, 1:N, N:N
    metadata    : Map<String, Any>
}
```

| DomainRelationKind | Signification | Exemple |
|-------------------|---------------|---------|
| `owns` | A possède/contient B | "Client possède des Commandes" |
| `triggers` | A déclenche B | "Commande déclenche un Paiement" |
| `requires` | A a besoin de B | "Commande requiert un Stock disponible" |
| `produces` | A produit B | "Paiement produit un Reçu" |
| `transforms` | A transforme B | "Promotion transforme le Prix" |
| `constrains` | A contraint B | "Quota contraint les Commandes" |

#### 7.5.8 Sources de la hiérarchie métier

Le Domain Tree peut être construit de trois façons, combinables :

**1. Déclaration explicite dans le manifest (`.codegraph.yml`)**
L'architecte ou le PO définit manuellement les domaines, sous-domaines, entités et leurs relations. C'est la méthode la plus fiable.

```yaml
domain_tree:
  - name: "Commerce"
    kind: "domain_area"
    children:
      - name: "Commandes"
        kind: "subdomain"
        children:
          - name: "Commande"
            kind: "entity"
            description: "Achat effectué par un client"
            projections:
              - technical: "src/services/api/OrderController.ts"
                role: "exposes"
              - technical: "src/services/payment/OrderService.ts"
                role: "orchestrates"
              - technical: "src/services/payment/OrderRepository.ts"
                role: "persists"
              - technical: "src/models/order.model.ts"
                role: "defines"
              - technical: "src/services/api/OrderValidator.ts"
                role: "validates"
            relations:
              - target: "Client"
                kind: "owns"
                label: "Un client passe des commandes"
                cardinality: "1:N"
```

**2. Annotations dans le code**
Les développeurs annotent le code pour l'associer à des concepts métier. Le système agrège automatiquement.

```typescript
// @codegraph:domain Commerce > Commandes > Commande
// @codegraph:domain-role orchestrates
export class OrderService {
    
    // @codegraph:business-rule "Le stock doit être réservé avant le paiement"
    // @codegraph:use-case "Passer une commande" [step=5]
    async createOrder(cart: Cart): Promise<Order> { ... }
}
```

**3. Inférence automatique (optionnel, IA-assisté)**
Le système analyse les noms de classes, les patterns de code (Repository, Service, Controller) et les structures de données pour suggérer une hiérarchie métier. Cette inférence est toujours soumise à validation humaine.

#### 7.5.9 Cohérence entre les deux hiérarchies

Le système vérifie automatiquement la cohérence entre le Domain Tree et le Technical Tree :

| Anomalie | Sévérité | Description |
|----------|----------|-------------|
| **Entité orpheline** | Erreur | Un DomainNode n'a aucune projection technique → concept métier non implémenté |
| **Composant non projeté** | Warning | Un GraphNode technique n'est projeté dans aucun DomainNode → code sans contexte métier |
| **Projection cassée** | Erreur | Une projection pointe vers un nœud technique qui n'existe plus → désynchronisation |
| **Couverture incomplète** | Info | Une entité métier n'a pas tous les rôles de projection attendus (ex: pas de `validates`) |
| **Conflit de domaine** | Warning | Un composant technique est projeté dans deux entités métier sans justification explicite |

---

## 8. Le lien bidirectionnel Code ↔ Diagramme

### 8.1 Direction Code → Diagramme (Analyse)

Le processus d'analyse convertit le code source en Zoom Graph. Il opère en couches :

**Couche 1 — Extraction syntaxique (AST)**
Un parser spécifique au langage (TypeScript, Python, Java...) extrait la structure : fichiers, classes, fonctions, imports, appels.

**Couche 2 — Construction du graphe brut**
Les éléments extraits sont convertis en `GraphNode` avec leurs `SourceReference`. Les relations sont inférées à partir des imports, appels de fonctions, et héritages.

**Couche 3 — Enrichissement sémantique**
Des règles et annotations enrichissent le graphe : regroupement de fichiers en services, identification des entités métier, détection des flux de données. Cette couche utilise :
- Des **annotations dans le code** (commentaires ou décorateurs CodeGraph)
- Des **conventions de nommage** et de structure de dossiers
- Des **fichiers de configuration CodeGraph** (`.codegraph.yml`)
- Optionnellement, une **analyse par IA** pour inférer les intentions

**Couche 4 — Hiérarchisation**
Le graphe plat est organisé en niveaux de profondeur (D0-D4) selon les règles de regroupement.

### 8.2 Direction Diagramme → Code (Génération)

Quand un utilisateur modifie un diagramme, le système doit traduire cette modification en code. Les opérations possibles :

| Action sur le diagramme | Effet sur le code |
|------------------------|-------------------|
| Ajouter un nœud "Service" au niveau D1 | Créer un nouveau dossier/module avec la structure de base |
| Ajouter un nœud "Classe" au niveau D2 | Créer un fichier avec le squelette de la classe |
| Ajouter un nœud "Fonction" au niveau D3 | Ajouter une signature de fonction dans la classe parente |
| Créer une relation `depends_on` | Ajouter l'import correspondant |
| Créer une relation `calls` | Ajouter un appel de méthode (avec TODO pour le corps) |
| Renommer un nœud | Refactoring : renommer le symbole dans tout le code |
| Supprimer un nœud | Supprimer le fichier/la classe/la fonction (avec confirmation) |
| Déplacer un nœud | Déplacer le fichier et mettre à jour les imports |

### 8.3 Stratégie de synchronisation

La synchronisation repose sur un **fichier de mapping** (`.codegraph.lock`) qui maintient la correspondance entre les IDs du graphe et les positions dans le code. Quand le code change :

1. Le parser re-analyse les fichiers modifiés
2. Le diff entre l'ancien et le nouveau graphe est calculé
3. Les nœuds existants sont mis à jour (leur `SourceReference` et `hash` changent)
4. Les nouveaux éléments sont ajoutés au graphe
5. Les éléments supprimés sont marqués comme "orphelins" (pas supprimés immédiatement, pour éviter la perte d'annotations)

### 8.4 Annotations dans le code

Les développeurs peuvent enrichir le modèle directement dans le code via des annotations :

```typescript
// @codegraph:domain Client
// @codegraph:flow payment_flow
// @codegraph:critical
export class PaymentService {

    // @codegraph:flow payment_flow [step=3]
    async processPayment(order: Order): Promise<PaymentResult> {
        // ...
    }
}
```

```python
# @codegraph:domain Inventory
# @codegraph:tags slow,needs-optimization
class StockManager:

    # @codegraph:flow restock_flow [step=1]
    def check_levels(self, product_id: str) -> StockLevel:
        ...
```

Ces annotations sont **optionnelles** mais permettent un contrôle précis sur la façon dont le code apparaît dans les diagrammes.

---

## 9. Format de description : CodeGraph Manifest (CGM)

### 9.1 Objectif

Le **CodeGraph Manifest** (fichier `.codegraph.yml` ou `.codegraph.json`) est le fichier de configuration du projet. Il définit les règles de construction du graphe sans modifier le code source.

### 9.2 Structure du manifest

```yaml
# .codegraph.yml
version: "0.1"
project:
  name: "E-Commerce Platform"
  description: "Plateforme e-commerce multi-services"

# Définition des niveaux de profondeur
depth_rules:
  D0:
    name: "Écosystème"
    auto_detect: false
    nodes:
      - id: "ecosystem"
        name: "E-Commerce Platform"
        external:
          - { name: "Stripe API", type: "payment_provider" }
          - { name: "SendGrid", type: "email_provider" }
          - { name: "End User", type: "actor" }

  D1:
    name: "Services"
    auto_detect: true
    grouping:
      strategy: "directory"         # Regroupe par dossier de premier niveau
      root: "./src/services"
      fallback: "module_name"       # Si pas de dossier, utilise le nom du module

  D2:
    name: "Composants"
    auto_detect: true
    grouping:
      strategy: "file"              # Chaque fichier = un composant
      include: ["**/*.ts", "**/*.py"]
      exclude: ["**/*.test.*", "**/*.spec.*"]

  D3:
    name: "Unités"
    auto_detect: true
    grouping:
      strategy: "symbol"            # Chaque classe/fonction exportée
      visibility: "exported"        # Seulement les symboles publics

  D4:
    name: "Implémentation"
    auto_detect: true
    strategy: "flowchart"           # Convertit le corps des fonctions en flowchart

# Configuration des perspectives
lenses:
  component:
    layout: "hierarchical"
    relation_types: ["depends_on", "inherits", "implements"]
    style:
      service: { shape: "rounded_rect", color: "#4A90D9" }
      controller: { shape: "hexagon", color: "#7B68EE" }
      repository: { shape: "cylinder", color: "#2ECC71" }
      external: { shape: "cloud", color: "#95A5A6" }

  flow:
    layout: "left_to_right"
    relation_types: ["calls", "sends_data", "reads_from", "writes_to"]
    named_flows:
      payment_flow:
        description: "Flux de paiement utilisateur"
        highlight_color: "#E74C3C"
        critical: true
      user_registration:
        description: "Inscription d'un nouvel utilisateur"
        highlight_color: "#3498DB"
    style:
      data_arrow: { animated: true, width_by: "throughput" }

  domain:
    layout: "force_directed"
    relation_types: ["domain_rel"]
    entity_mapping:
      "src/models/order.ts": { domain_name: "Commande", icon: "shopping-cart" }
      "src/models/customer.ts": { domain_name: "Client", icon: "user" }
      "src/models/product.ts": { domain_name: "Produit", icon: "box" }
    rules:
      - pattern: "src/models/*.ts"
        auto_tag: "domain_entity"

# Règles de détection d'anomalies
analysis:
  anomalies:
    - type: "circular_dependency"
      severity: "error"
      scope: "D1"                   # Vérifie au niveau services

    - type: "orphan_node"
      severity: "warning"
      description: "Composant sans aucune relation entrante ou sortante"

    - type: "missing_error_handling"
      severity: "warning"
      scope: "D3"
      pattern: "async functions without try/catch"

    - type: "flow_dead_end"
      severity: "info"
      description: "Flux de données qui ne mène nulle part"

    - type: "inconsistent_naming"
      severity: "info"
      pattern: "files not matching convention"

# Synchronisation
sync:
  watch: true                       # Watch mode pour mise à jour en temps réel
  lock_file: ".codegraph.lock"
  on_code_change: "incremental"     # incremental | full_rebuild
  on_diagram_change: "generate"     # generate | suggest | manual
  conflict_resolution: "ask"        # ask | code_wins | diagram_wins
```

### 9.3 Le fichier de lock (.codegraph.lock)

Ce fichier maintient le mapping entre les IDs du graphe et le code. Il est généré automatiquement et ne doit pas être édité manuellement.

```json
{
  "version": "0.1",
  "generated_at": "2026-02-11T10:30:00Z",
  "nodes": {
    "a1b2c3d4": {
      "name": "PaymentService",
      "kind": "component",
      "depth": 2,
      "source": {
        "file": "src/services/payment/PaymentService.ts",
        "start_line": 15,
        "end_line": 120,
        "hash": "sha256:abc123..."
      }
    }
  },
  "relations": {
    "r1e2f3": {
      "source": "a1b2c3d4",
      "target": "x9y8z7",
      "kind": "calls",
      "source_ref": {
        "file": "src/services/payment/PaymentService.ts",
        "line": 45
      }
    }
  }
}
```

---

## 10. Détection d'anomalies et incohérences

### 10.1 Catégories d'anomalies

Le système analyse le graphe pour détecter automatiquement des problèmes. Les anomalies sont classées par sévérité :

**Erreurs (rouge)** — Problèmes structurels qui indiquent probablement un bug ou un défaut d'architecture :
- Dépendances circulaires entre services (D1)
- Nœud référencé par un flux mais dont le code source a été supprimé
- Incohérence de types dans un flux de données (A envoie un `string`, B attend un `number`)
- Flux sans point de sortie (boucle infinie potentielle)

**Avertissements (orange)** — Problèmes potentiels qui méritent attention :
- Composant orphelin (aucune relation entrante ni sortante)
- Service avec trop de dépendances sortantes (couplage fort)
- Fonction critique sans gestion d'erreur
- Code non couvert par aucun flux nommé

**Informations (bleu)** — Suggestions d'amélioration :
- Nommage incohérent avec les conventions du projet
- Flux de données qui pourrait être simplifié
- Duplication structurelle entre composants

### 10.2 Affichage des anomalies

Les anomalies sont affichées **en surimpression** sur le diagramme actif, avec la possibilité de les filtrer par sévérité. Chaque anomalie est un élément cliquable qui mène au code source concerné.

---

## 11. Navigation et interaction utilisateur

### 11.1 Modèle d'interaction

L'interface suit une métaphore de **carte explorable** :

**Zoom sémantique (molette / pinch)**
Tourner la molette sur un nœud ouvre son diagramme enfant (zoom in) ou remonte au diagramme parent (zoom out). L'animation montre la transition entre niveaux.

**Changement de perspective (onglets / raccourci)**
Basculer entre ComponentLens, FlowLens et DomainLens avec un switcher. Le diagramme se réorganise pour la nouvelle perspective, avec une animation de transition.

**Breadcrumb de navigation**
Un fil d'Ariane montre le chemin de zoom actuel : `Écosystème > Service Paiement > PaymentController > processPayment`. Chaque élément est cliquable pour remonter.

**Recherche contextuelle**
Taper un nom de composant, fonction ou concept métier pour y naviguer directement, quel que soit le niveau de profondeur.

**Mode flux**
Sélectionner un flux nommé (ex: "payment_flow") pour voir uniquement les nœuds et relations impliqués dans ce flux, à travers tous les niveaux de profondeur. Le système "aplatit" temporairement la hiérarchie pour montrer le chemin complet.

### 11.2 Édition visuelle

**Ajout de nœud** : drag & drop depuis une palette de types. Le système propose un emplacement dans le code et génère le squelette.

**Connexion** : tracer une ligne entre deux nœuds pour créer une relation. Le système demande le type et génère le code correspondant (import, appel, etc.).

**Refactoring visuel** : déplacer un nœud d'un conteneur à un autre déclenche un refactoring dans le code (déplacement de fichier, mise à jour des imports).

---

## 12. Comparaison avec les approches existantes

| Critère | UML | C4 Model | Mermaid/D2 | CodeGraph |
|---------|-----|----------|------------|-----------|
| Niveaux de zoom | Limité (diagrammes séparés) | 4 niveaux fixes | Non | N niveaux configurables |
| Synchronisation code | Non | Non | Non | Bidirectionnelle |
| Perspectives multiples | Via types de diagrammes | Non (structure uniquement) | Non | Oui, composables |
| Navigation interactive | Non (statique) | Non (statique) | Non | Oui (carte zoomable) |
| Détection d'anomalies | Non | Non | Non | Oui (configurable) |
| Édition → code | Non | Non | Non | Oui (génération) |
| Source de vérité | Diagramme (déconnecté) | Diagramme (DSL séparé) | Diagramme (texte séparé) | Code source |
| Adapté aux non-devs | Peu | Oui (D0-D1) | Non | Oui (DomainLens) |

---

## 13. Cas d'usage

### Cas 1 — Onboarding d'un nouveau développeur
Sarah rejoint l'équipe. Elle ouvre CodeGraph sur le projet. Au niveau D0, elle voit le système dans son écosystème. Elle zoome sur le service qui l'intéresse, bascule en FlowLens pour comprendre les flux principaux, puis zoome encore pour lire le code des fonctions critiques. En 30 minutes, elle a une carte mentale du système.

### Cas 2 — Revue d'architecture
L'équipe active la détection d'anomalies. CodeGraph identifie trois dépendances circulaires entre services et deux composants orphelins. L'architecte voit immédiatement les problèmes sur le diagramme D1 et planifie le refactoring.

### Cas 3 — Communication avec le Product Manager
Le PM a besoin de comprendre l'impact d'une nouvelle fonctionnalité. L'équipe ouvre la DomainLens. Le PM voit les entités métier et leurs relations. Il comprend que "ajouter un système de coupons" impacte les entités Commande, Paiement et Catalogue, et peut estimer la complexité.

### Cas 4 — Debugging d'un flux
Un bug survient dans le processus de paiement. Le développeur ouvre le flux "payment_flow" en FlowLens. Il voit le chemin complet des données, identifie l'étape où le flux diverge, et clique pour atterrir directement dans le code de la fonction problématique.

### Cas 5 — Conception visuelle
Un architecte conçoit un nouveau microservice. Il l'ajoute visuellement au diagramme D1, crée les connexions avec les services existants, puis zoome pour ajouter les composants internes. CodeGraph génère la structure de fichiers et le code squelette.

---

## 14. Glossaire

| Terme | Définition |
|-------|------------|
| **GraphNode** | Élément fondamental du graphe technique, représentant une entité logicielle à un niveau d'abstraction |
| **DomainNode** | Élément fondamental du graphe métier, représentant un concept du domaine (entité, règle, cas d'usage) |
| **Zoom Graph** | Le graphe complet contenant les deux hiérarchies (technique et métier) et leurs projections |
| **Technical Tree** | L'arbre hiérarchique des composants techniques (services, classes, fonctions) |
| **Domain Tree** | L'arbre hiérarchique des concepts métier (domaines, entités, règles) |
| **ViewLens** | Filtre de perspective qui détermine ce qui est affiché et comment |
| **Depth (Dn)** | Niveau de profondeur dans la hiérarchie (D0 = plus abstrait, D4 = code) |
| **Projection** | Lien formel entre un DomainNode et les GraphNodes techniques qui l'implémentent, typé par un rôle |
| **ProjectionRole** | Rôle qu'un composant technique joue pour un concept métier (defines, orchestrates, persists, etc.) |
| **Cross-lens jump** | Navigation entre les deux hiérarchies via les projections (du métier vers le technique et inversement) |
| **Convergence (D4)** | Point où les deux hiérarchies se rejoignent : le code source réel |
| **SourceReference** | Pointeur vers un emplacement précis dans le code source |
| **CGM (CodeGraph Manifest)** | Fichier de configuration définissant les règles du projet |
| **Zoom sémantique** | Navigation entre niveaux d'abstraction (un nœud → son diagramme détaillé) |
| **Flux nommé** | Chemin de données identifié traversant plusieurs niveaux et composants |
| **Anomalie** | Problème détecté automatiquement par l'analyse du graphe |

---

## 15. Prochaines étapes

### Phase 1 — Validation du modèle
- Revue de cette spécification par des développeurs et architectes
- Test du modèle de données sur 2-3 projets réels
- Raffinement des types de relations et des règles de détection

### Phase 2 — Prototype du parser (Code → Graphe)
- Implémenter l'extraction AST pour TypeScript et Python
- Générer un fichier `.codegraph.lock` à partir d'un projet réel
- Valider que le graphe produit est navigable et cohérent

### Phase 3 — Prototype du viewer
- Construire un viewer interactif (React + D3/Cytoscape)
- Implémenter le zoom sémantique et le changement de perspective
- Tester l'expérience utilisateur sur les cas d'usage définis

### Phase 4 — Bidirectionnalité (Diagramme → Code)
- Implémenter la génération de code à partir de modifications visuelles
- Définir la stratégie de résolution de conflits
- Tests de synchronisation sous charge (projets de 100k+ lignes)

### Phase 5 — Intégrations
- Plugin IDE (VS Code, JetBrains)
- Intégration CI/CD (vérification d'anomalies dans la pipeline)
- API pour extensions tierces

---

*Fin de la spécification RFC-0001 — CodeGraph v0.1*
