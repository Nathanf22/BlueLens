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

Before modifying anything, understand the blast radius:

```
detect_codegraph_anomalies(graph_id)
```

**Known high-risk areas in bluelens:**
- `types.ts` — 297 dependents. Any change propagates everywhere.
- `llmService.ts` — 23 dependents. Intentional god node (multi-provider abstraction: Gemini/OpenAI/Anthropic).
- `fileSystemService.ts` — 15 dependents. Browser-only (File System Access API). Never import in Node.js.
- `App.tsx` — 56 direct dependencies. Central orchestrator using props-drilling with no context/store.
- Inter-domain circular dependencies — by design in this project. Do not attempt to fix without understanding the architecture.

---

## Typical task workflow

```
1. list_codegraphs()                           → find the existing graph
2. get_codegraph_summary(graph_id)             → orient yourself
3. get_codegraph_nodes(graph_id, depth:1)      → identify the right domain
4. get_codegraph_nodes(graph_id, parent_id)    → files in that domain
5. search_diagrams(query)                      → find relevant sequence diagrams
6. Read ONLY the identified files              → targeted reading
7. Make changes, test
8. [optional] generate_domain_diagrams()       → update diagrams if the flow changed
9. export_for_bluelens()                       → export for the web interface
```

---

## Creating and editing diagrams

```
create_diagram(workspace_id, name, code, folder_id, description)
update_diagram(diagram_id, code)
search_diagrams(query, workspace_id)
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
