<p align="center">
  <img src="bluelens-logos/bluelens-full-color-dark.svg" width="80" height="80" />
</p>

<h1 align="center">BlueLens</h1>

<p align="center">
  <strong>The living architecture layer for your codebase —<br>readable by humans, navigable by AI agents.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" />
  <img src="https://img.shields.io/badge/React-19-blue" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" />
  <img src="https://img.shields.io/badge/Mermaid.js-v11-orange" />
</p>

<p align="center">
  <a href="https://app.bluelens.dev"><strong>Try it free →</strong></a>
  &nbsp;·&nbsp;
  <a href="https://bluelens.dev">Website</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Nathanf22/BlueLens/issues">Issues</a>
</p>

---

Most architecture tools give you a flat diagram you update once
and forget. Your code moves on; the diagram lies.

BlueLens is different in four ways:

**1. Diagrams that stay in sync** — point it at any local repo,
get a semantic architecture map in seconds. When your code
changes, BlueLens detects the drift and lets you resync in one
click — no manual diagram maintenance.

**2. Drill-down navigation** — every node can link to a
sub-diagram. Click to go deeper, breadcrumb to come back.
Your architecture lives at every level of abstraction, not
just one flat view.

**3. Architecture drift detection** — BlueLens enforces domain
boundaries, tracks fan-in growth on critical nodes, and reviews
structural changes against your documented philosophy using the
git commit history as the source of truth for intent.

**4. An MCP server for AI agents** — AI agents (Claude Code,
Cursor, etc.) operate blind on raw file context. BlueLens
exposes a CodeGraph via the Model Context Protocol: an agent
navigates 200k tokens of code for 20k tokens of graph.
10x cheaper, architecturally aware.

<p align="center">
  <img src="public/demo_pro.gif" alt="BlueLens demo" width="100%" />
</p>

> 100% client-side — your code never leaves your machine.  
> Free and open source. MIT license.

---

---

## Features

### Diagram Editor
- Live Mermaid preview with split-pane editing
- All Mermaid diagram types (flowchart, sequence, class, ER, state, gantt, ...)
- AI-powered generation from natural language prompts
- Diagram analysis with anti-pattern detection (fan-out, god nodes, circular deps)

### Multi-Level Navigation
- Link any diagram node to another diagram for drill-down exploration
- Visual badges on nodes that have sub-diagrams (blue) or code links (green)
- Breadcrumb trail tracks your position in the hierarchy
- Double-click to zoom in, breadcrumb to zoom out

### Code Integration
- Connect diagrams to local repositories via the File System Access API
- Link individual nodes to specific files and line ranges
- Read-only Monaco Editor panel for viewing linked source code
- Multi-repository support scoped to workspaces

### CodeGraph
- Automatic graph generation from a codebase — no manual diagramming needed
- Hierarchical model: System (D0) > Domain (D1) > File (D2) > Symbol (D3)
- LLM-powered semantic clustering into meaningful domains (not just directory structure)
- ViewLens system: switch between Component, Flow, and Domain perspectives
- Contextual flow detection with AI-generated sequence diagrams
- SHA-256 hash-based sync detection for code drift

### Architecture Drift Detection
- Structural diff between two graph snapshots — added/removed modules and dependencies
- Deterministic domain-boundary enforcement (forbidden cross-domain imports, fan-in thresholds)
- LLM review grounded in git commit history: distinguishes intentional changes from unexplained drift
- Flags structural changes not explained by a commit message

### MCP Server (`@bluelens/mcp`)
- Exposes the full BlueLens capability set to AI agents via the Model Context Protocol
- `scan_codebase` — semantic graph generation with LLM clustering
- `analyze_node_impact` — blast-radius analysis before touching a file (fan-in, fan-out, risk score)
- `find_dependency_path` — shortest dependency path between two modules
- `check_architectural_rules` / `review_architectural_drift` — automated architecture governance
- `add_node_link` / `remove_node_link` — wire drill-down navigation from the agent
- Works with Claude Code, Cursor, and any MCP-compatible agent

### Intelligence Layer
- Multi-provider LLM support: **Gemini**, **OpenAI**, **Anthropic**
- AI chat panel for diagram modifications, conversions, and scaffolding
- Code scanning with divergence detection and typed sync suggestions
- Three sync modes: manual, semi-auto, auto
- Visual diff via Monaco DiffEditor
- Encrypted API key storage (AES-GCM + IndexedDB)

### Organization
- Workspaces and nested folders
- `.blueprint` export format preserving all metadata (comments, node links, folders)
- Legacy import support (.mmd, .mermaid, .txt, .zip)

---

## Getting Started

### Prerequisites

- **Node.js 18+**
- **Chromium-based browser** (Chrome, Edge, Brave) — required for the File System Access API

### Installation

```bash
git clone https://github.com/Nathanf22/BlueLens.git
cd BlueLens
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### AI Features (optional)

AI-powered features (chat, code scanning, flow generation, smart grouping) require an API key. Copy `.env.example` to `.env` and fill in your key, or configure via the **AI Settings** panel in the app.

| Provider | Setup |
|----------|-------|
| Google Gemini | API key from [Google AI Studio](https://aistudio.google.com/) |
| OpenAI | API key from [OpenAI Platform](https://platform.openai.com/) |
| Anthropic | API key + CORS proxy (browser cannot call the API directly) |

---

## Architecture

The web app is client-side only — no backend, no router, no external state library. All data persists to `localStorage` and `IndexedDB`.

The MCP server (`mcp/`) is a standalone Node.js companion process. It imports bluelens services directly, stores data in `~/.bluelens/`, and communicates with AI agents over stdio. Data flows between the two via `.bluelens` export files.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite |
| Diagrams | Mermaid.js v11 |
| Code Viewer | Monaco Editor |
| AI | Gemini SDK, OpenAI SDK, Anthropic (fetch) |
| Styling | Tailwind CSS (CDN) |
| Storage | localStorage + IndexedDB (encrypted) |

### Project Structure

```
BlueLens/
  App.tsx                    # Root orchestrator — composes hooks, passes props
  types.ts                   # All TypeScript interfaces
  components/                # React components (stateless — props only)
    CodeGraphPanel.tsx       # CodeGraph node tree, lens tabs, flow list
    CodeGraphVisualizer.tsx  # Force-directed graph + sequence diagrams
    AIChatPanel.tsx          # AI chat with suggestion chips
    ScanResultsPanel.tsx     # Code scan results and sync suggestions
    ProgressLogPanel.tsx     # Build-log panel for graph creation
    ...
  hooks/                     # Custom hooks (state + logic)
    useAppState.ts           # Central state: workspaces, diagrams, UI toggles
    useCodeGraph.ts          # CodeGraph state, lens switching, flow nav
    useLLMSettings.ts        # Encrypted LLM config storage
    useChatHandlers.ts       # AI chat sessions
    useScanHandlers.ts       # Code sync modes and suggestions
    ...
  services/                  # Pure services (no React dependency)
    codeGraphModelService.ts # CodeGraph CRUD, tree traversal, lens queries
    codeGraphRendererService.ts  # CodeGraph + ViewLens → Mermaid string
    codeGraphFlowService.ts  # AI flow generation pipeline
    codeGraphAgentService.ts # Two-agent LLM pipeline for smart grouping
    llmService.ts            # Unified multi-provider LLM interface
    codeScannerService.ts    # Divergence detection + sync suggestions
    ...
```

### Key Patterns

- **Props-only components** — state lives in hooks, composed in `App.tsx`, drilled via props
- **No context providers** — everything flows through the component tree
- **Service layer** — pure functions with no React dependency
- **Path alias** — `@/*` maps to the project root

---

## Roadmap

### Complete

- **Phase 1 — Foundation**: Mermaid editor, live preview, multi-level zoom navigation, badges, breadcrumbs, workspaces, folders, import/export, AI generation
- **Phase 2 — Code Integration**: File System Access API, code linking, Monaco viewer, multi-repo support, codebase-to-diagram generation
- **Phase 3 — Intelligence Layer**: Multi-provider LLM, AI chat, code scanning, divergence detection, sync modes, visual diff, diagram analysis, encrypted storage, CodeGraph with flows

### Planned

- **Phase 4 — Polish**: Semantic search, version history, diagram templates, advanced exports (PDF, HTML)

---

## Community

- [Discussions](https://github.com/Nathanf22/BlueLens/discussions) — questions, ideas, show and tell
- [Issues](https://github.com/Nathanf22/BlueLens/issues) — bugs and feature requests

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, architecture notes, and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

## License

[MIT](LICENSE) — Copyright (c) 2026 Nathan Kamokoue

## Author

**Nathan Kamokoue** — [LinkedIn](https://www.linkedin.com/in/nathan-kamokoue-1289121b8/) | [X](https://x.com/KamokoueNathan)

**Johann Kengne** — [LinkedIn](https://www.linkedin.com/in/johann-kengne/)

---

**BlueLens** — The living architecture layer for your codebase.
