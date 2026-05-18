# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start dev server on http://localhost:3000
npm run build    # Production build via Vite
npm run preview  # Preview production build

# MCP server (companion tool, not part of the web app)
cd mcp && npm run build   # Compile to mcp/dist/index.js via tsup
```

No test runner or linter is currently configured.

## Environment

The `GEMINI_API_KEY` env var is required for AI diagram generation and MCP LLM features. Vite loads it from a `.env` file in the project root. The MCP server reads the same `.env` at startup — never pass API keys as MCP tool parameters.

## Tech Stack

**Web app:** React 19 + TypeScript on Vite. Tailwind CSS loaded via CDN (configured in `index.html` with custom dark theme colors). Mermaid.js for diagram rendering. Google Gemini (`@google/genai`) for AI generation. JSZip for import/export.

**MCP server (`mcp/`):** Node.js 20 + TypeScript, bundled with tsup (ESM). Implements the Model Context Protocol via `@modelcontextprotocol/sdk`. Imports bluelens services directly — no logic is duplicated. External dependencies (`@google/genai`, `openai`, `google-auth-library`) are kept external in the tsup bundle to avoid CJS/ESM conflicts.

## Architecture

### Web app

This is a client-side-only React app. All data persists to browser localStorage. There is no backend, router, or external state library.

### State Management

`App.tsx` is the root orchestrator. It composes state and handlers from custom hooks, then passes them down as props to child components.

- **`hooks/useAppState.ts`** — Central state: workspaces, diagrams, folders, UI toggles, navigation stack. Also computes derived state (`workspaceDiagrams`, `activeDiagram`, `breadcrumbPath`).
- **`hooks/useStoragePersistence.ts`** — Auto-saves all state to localStorage with 500ms debounce via `services/storageService.ts`.
- **Domain handler hooks** (`useDiagramHandlers`, `useFolderHandlers`, `useWorkspaceHandlers`, `useCommentHandlers`, `useNodeLinkHandlers`) — CRUD operations for each entity type.
- **`hooks/useNavigationHandlers.ts`** — Multi-level diagram navigation (zoom into linked sub-diagrams, breadcrumb trail, zoom out).

### Data Model (`types.ts`)

Key entities: `Workspace` > `Folder` > `Diagram`. Diagrams contain Mermaid `code`, `comments` (positioned annotations), and `nodeLinks` (connections from diagram nodes to other diagrams for drill-down navigation). `NavigationStep` tracks the breadcrumb stack.

### Services

- **`services/storageService.ts`** — localStorage read/write with migration logic for legacy formats.
- **`services/svgParserService.ts`** — Parses rendered Mermaid SVG to extract node IDs and inject `SubDiagramBadge` overlays. Uses MutationObserver to re-inject badges after Mermaid re-renders.
- **`services/geminiService.ts`** — Calls Google Gemini API with a system prompt that ensures valid Mermaid syntax output.

### Component Layout

```
App.tsx
├── AppHeader          — Top bar, sidebar toggle, "Ask AI" button
├── Sidebar            — Workspace switcher, folder tree, diagram list, import/export
├── WorkspaceView      — Resizable split pane (useSplitPane hook)
│   ├── Editor         — Textarea with line numbers
│   └── Preview        — Mermaid SVG render (useDiagramRenderer, useNavigation for zoom/pan)
│       ├── PreviewToolbar, Breadcrumb
│       ├── SubDiagramBadge (injected into SVG)
│       └── CommentItem / DraftComment
├── AppFooter          — Diagram count, save status
└── ModalManager
    ├── AIGeneratorModal
    └── NodeLinkManager
```

### Path Alias

`@/*` maps to the project root (configured in both `tsconfig.json` and `vite.config.ts`).

### Key Patterns

- Props are drilled from App.tsx; no context providers or state library.
- `useNavigation` hook manages zoom/pan with non-passive wheel listeners on the preview container.
- SVG badge injection (`svgParserService`) directly manipulates the DOM after Mermaid renders, with a MutationObserver to handle re-renders during pan/zoom.
- Diagrams are scoped to workspaces; folders provide optional hierarchy within a workspace.

### MCP server (`mcp/`)

The MCP server is a **standalone Node.js companion tool**, not part of the web app. It exposes bluelens capabilities to AI agents (Claude Code) via the Model Context Protocol over stdio.

**Architectural boundaries:**
- The MCP server imports bluelens services directly (`services/`, `types.ts`). It is a consumer of the bluelens core, not an extension of it.
- `mcp/src/services/codeToGraph.ts` is a Node.js adaptation of the browser parser — do not confuse with `codeToGraphParserService.ts` (browser-only, uses File System Access API).
- `fileSystemService.ts` is browser-only (File System Access API). Never import it from MCP or any Node.js context.
- The MCP server stores data in `~/.bluelens/db.json` (workspaces, folders, diagrams) and `~/.bluelens/codegraphs/` (CodeGraph JSON files). This is separate from and independent of the browser localStorage used by the web app.

**Data exchange:** the web app and MCP server share data via `.bluelens` export files (Sidebar → Import / `export_for_bluelens()` MCP tool). There is no live connection between them.

**Heuristic fallback is intentionally disabled:** if the LLM fails during `scan_codebase`, the tool returns an error rather than silently producing low-quality clusters.

**Architectural rule violations (pre-existing, tracked):**
- `githubDemoService.ts` and `scaffoldService.ts` (Shared Utilities) import from Code Graph and LLM layers — violates domain boundaries. Needs refactoring toward dependency injection.
- `diagramSyncService.ts` (Diagramming) imports `llmService.ts` directly — couples the rendering layer to a specific LLM implementation.

## Product Roadmap (from PRD)

Blueprint aims to be a living architecture diagram platform that syncs with codebases. See `PRD` for the full product requirements document.

- **Phase 1 — Foundation (MVP):** COMPLETE. Mermaid editor with live preview, multi-level zoom navigation with badges, breadcrumb navigation, workspace/folder management, import/export.
- **Phase 2 — Code Integration:** UP NEXT. File System Access API, Tree-sitter WASM parsing (Python, TS/JS), manual code linking, Monaco Editor for code viewing, split diagram+code view, multi-repo support.
- **Phase 3 — Intelligence Layer:** On-demand code scanning, divergence detection, AI chat panel for diagram modifications, visual diff, three sync modes (manual/semi-auto/auto).
- **Phase 4 — Polish & Advanced:** Semantic search, auto-tagging, version history, diagram templates, advanced exports (PDF/HTML with comments).

## Git Conventions

- Do NOT include model name (e.g. "Opus", "Sonnet") in commit messages or Co-Authored-By lines.
