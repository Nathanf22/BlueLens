# Bluelens MCP — Agent Usage Guide

This skill teaches you how to use the `bluelens` MCP server to navigate and understand this codebase efficiently, at minimal token cost.

## Core principle: navigate before reading

Reading code is expensive. This codebase is ~13,000 lines (~207,000 tokens if read entirely). The CodeGraph lets you orient yourself for **~20,000 tokens**, then read only the files relevant to your task. Typical gain: **10x**.

The rule: **never read a file before knowing why you need it.**

---

## Step 1 — Orient yourself

Always start by fetching the existing graph:

```
list_codegraphs()
```

If a graph exists, get the summary:

```
get_codegraph_summary(graph_id)
```

This gives you the 7 semantic domains, file counts per domain, and structural anomalies — without reading a single line of code.

If no graph exists, generate one:

```
scan_codebase(
  directory: "/home/nathan/Projects/bluelens",
  workspace_id: <id>,
  llm_model: "gemini-2.5-flash"   # API key read from .env automatically
)
```

---

## Step 2 — Locate the right domain

To find where something lives:

```
get_codegraph_nodes(graph_id, depth: 1)                  # → the 7 domains
get_codegraph_nodes(graph_id, parent_id: <domain_id>)    # → files in domain
```

**The 7 domains of bluelens:**

| Domain | node_id | Contents |
|---|---|---|
| Code Graph & Analysis | `t0z6eo28q` | LLM pipeline, orchestrator, graph model (26 files) |
| AI Agent & LLM Integration | `zhm42nofk` | llmService, agents, token tracking (13 files) |
| Application Shell & Core UI | `pcyy52e7k` | App.tsx, main hooks, UI shell (32 files) |
| Workspace & File Management | `0y2uyj6bp` | Workspaces, repos, file system (16 files) |
| Data Import/Export & Sync | `r44b8jaca` | Export/import, diagram/code sync (8 files) |
| Diagramming & Visualization | `7akrtg047` | Mermaid editor, preview, SVG (10 files) |
| Shared Utilities & Configuration | `stocy8k1p` | types.ts, config, shared utils (7 files) |

> These IDs belong to CodeGraph `kcju8x6ha` generated with gemini-2.5-flash on 2026-05-13.
> If the graph was regenerated, use `get_codegraph_nodes(graph_id, depth:1)` to find current IDs.

---

## Step 3 — Understand flows without reading code

Sequence diagrams exist at two levels:

**System level** (folder "Sequence Diagrams") — 6 flows:
- Create New Workspace
- Add GitHub Repository
- Send AI Chat Message
- Import Codebase
- Generate Code Graph ← key entry point for anything touching scan/analysis
- Export Flow/Diagram

**Domain level** (folder "Code Graph & Analysis") — 4 flows:
- Display Code Graph
- Initiate Code Scan
- Synchronize Code Graph with File System
- AI Agent Generates Code Graph Architecture ← detail of the agentic pipeline internals

Use `search_diagrams(query)` to find a diagram by keyword.

To generate diagrams at a deeper level (module, function):

```
generate_domain_diagrams(
  graph_id,
  node_id: <target node id>,
  workspace_id,
  folder_id,
  llm_model: "gemini-2.5-flash"
)
```

This scopes flow generation to that node's files only, producing more precise diagrams than the system-level ones. Call recursively to drill down to function level.

---

## Step 4 — Assess impact before touching code

Two complementary tools:

```
detect_codegraph_anomalies(graph_id)          # structural anomalies: god nodes, orphans, cycles
analyze_node_impact(graph_id, file_path: "services/llmService.ts")   # blast radius for a specific file
```

`analyze_node_impact` returns:
- **directDependents** — nodes that directly import this file (fan-in)
- **directDependencies** — nodes this file imports (fan-out)
- **blastRadius** — transitive set of all nodes that will be affected (BFS up to `max_depth`, default 3)
- **riskScore** — 0–10 composite metric

**`find_nodes` is the prerequisite for all other analysis tools** — it resolves a name or partial file path to a node ID without loading the full graph.

```
find_nodes(graph_id, query: "llmService")     # → node ID + all exported symbols (classes, functions)
find_nodes(graph_id, kind: "package")         # → the 7 domains with IDs (dynamic alternative to the table above)
find_nodes(graph_id, query: "storageService") # → 14 matches across 2 files, with IDs
```

Without it: `get_codegraph_nodes(depth:2)` dumps all 112 modules (~11 000 tokens) and you parse manually.
With it: a targeted query returns ~1 300 tokens — **8x cheaper** — and also surfaces exported symbols so you know what the file exposes before reading it.

**Known high-risk areas in bluelens:**
- `types.ts` — 297 dependents. Any change propagates everywhere.
- `llmService.ts` — 23 dependents. Intentional god node (multi-provider abstraction: Gemini/OpenAI/Anthropic).
- `fileSystemService.ts` — 15 dependents. Browser-only (File System Access API). Never import in Node.js.
- `App.tsx` — 56 direct dependencies. Central orchestrator using props-drilling with no context/store.
- Inter-domain circular dependencies — by design in this project. Do not attempt to fix without understanding the architecture.

---

## Step 5 — Trace coupling between two modules

```
find_dependency_path(graph_id, from_node_id, to_node_id)
```

Finds the **shortest dependency path** between two nodes via BFS. Useful for answering "why does A depend on B?" or "is there an indirect coupling I should break?".

---

## Step 6 — Detect and review architectural drift

**Structural diff** (no LLM — instant):
```
diff_codegraphs(base_graph_id, target_graph_id)
```
Reports added/removed modules, new/dropped `depends_on` edges, domain changes.

**Deterministic rule enforcement:**
```
check_architectural_rules(graph_id)
# Runs the default bluelens ruleset:
# - Forbidden cross-domain imports (e.g. Shared Utilities must not import LLM layer)
# - Fan-in thresholds (types.ts < 310, llmService.ts < 30)
# Pass base_graph_id to surface only NEW violations since the last scan.
```

**LLM architectural review** (reads git history + CLAUDE.md):
```
review_architectural_drift(
  base_graph_id,
  target_graph_id,
  project_directory: "/home/nathan/Projects/bluelens"
)
```
Reads git log between the two scan timestamps, computes the structural diff, runs anomaly and rule checks, then asks the LLM to evaluate whether the changes align with the project philosophy. **The commit history is the source of truth for intent** — commits that introduce structural changes must explain the architectural reason, otherwise the LLM will flag the change as unexplained drift.

---

## Step 7 — Build navigable diagram hierarchies

Diagrams generated by `generate_domain_diagrams` are standalone by default. Connect them with node links to enable drill-down navigation in the Bluelens UI:

```
add_node_link(
  diagram_id: <parent diagram>,
  node_id: "Auth",              # exact Mermaid node identifier (case-sensitive)
  target_diagram_id: <child diagram>,
  label: "zoom in"              # optional
)

remove_node_link(diagram_id, node_id)
```

`node_id` must match the identifier as written in the Mermaid code — if the diagram contains `Auth([Auth Service])`, the node_id is `"Auth"`. Calling `add_node_link` on an already-linked node updates it rather than duplicating. `get_diagram` returns the current `nodeLinks` array.

**Typical pattern for a multi-level diagram map:**
```
1. generate_domain_diagrams() at system level        → 6 overview diagrams
2. generate_domain_diagrams() per domain             → domain-level diagrams
3. add_node_link() from overview nodes → domain diagrams
4. add_node_link() from domain nodes → module diagrams
5. export_for_bluelens() → import in UI → full drill-down navigation
```

---

## Typical task workflow

```
1. list_codegraphs()                                      → find the existing graph
2. get_codegraph_summary(graph_id)                        → orient yourself
3. get_codegraph_nodes(graph_id, depth:1)                 → identify the right domain
4. get_codegraph_nodes(graph_id, parent_id)               → files in that domain
5. search_diagrams(query)                                 → find relevant sequence diagrams
6. find_nodes(graph_id, query: "<file>")                  → resolve node ID
7. analyze_node_impact(graph_id, node_id)                 → blast radius before editing
8. Read ONLY the identified files                         → targeted reading
9. Make changes, test
10. check_architectural_rules(graph_id)                   → verify no new violations
11. [optional] generate_domain_diagrams()                 → update diagrams if flow changed
12. [optional] add_node_link()                            → wire drill-down navigation
13. export_for_bluelens()                                 → export for the web interface
```

---

## Creating and editing diagrams

```
create_diagram(workspace_id, name, code, folder_id, description)
update_diagram(diagram_id, code)
search_diagrams(query, workspace_id)
get_diagram(diagram_id)          # includes full nodeLinks array
list_diagrams(workspace_id, folder_id)
delete_diagram(diagram_id)
```

Mermaid code is rendered directly in bluelens. Supported formats: `sequenceDiagram`, `flowchart`, `classDiagram`, `erDiagram`, etc.

---

## Exporting to the web interface

```
export_for_bluelens(workspace_id)
# → generates ~/bluelens-export.bluelens
# → Sidebar → Import in bluelens (http://localhost:3000)
```

---

## Key reminders

- **API keys are never passed as parameters** — read automatically from `.env`.
- **Graph `kcju8x6ha`** is the current reference graph (generated 2026-05-13 with gemini-2.5-flash).
- **System-level sequence diagrams are approximations.** The deeper you go in the hierarchy, the more precise they become.
- **`mcp/src/services/codeToGraph.ts`** is a Node.js adaptation of the bluelens parser — do not confuse with `codeToGraphParserService.ts` (browser version).
- **`codeGraphHeuristicGrouper`** has been intentionally disabled as a fallback — if the LLM fails, scan_codebase returns an error rather than silently producing low-quality clusters.
- **Commits that introduce structural changes must explain the architectural reason.** `review_architectural_drift` uses git history to distinguish intentional changes from unexplained drift — a vague commit message will be flagged.
