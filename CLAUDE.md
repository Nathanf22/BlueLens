# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start dev server on http://localhost:3000
npm run build    # Production build via Vite
npm run preview  # Preview production build
```

No test runner or linter is currently configured.

## Environment

The `GEMINI_API_KEY` env var is required for AI diagram generation. Vite loads it from a `.env` file in the project root and exposes it as `process.env.GEMINI_API_KEY` and `process.env.API_KEY`.

## Tech Stack

React 19 + TypeScript on Vite. Tailwind CSS loaded via CDN (configured in `index.html` with custom dark theme colors). Mermaid.js for diagram rendering. Google Gemini (`@google/genai`) for AI generation. JSZip for import/export.

## Architecture

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

## Product Roadmap (from PRD)

Blueprint aims to be a living architecture diagram platform that syncs with codebases. See `PRD` for the full product requirements document.

- **Phase 1 — Foundation (MVP):** COMPLETE. Mermaid editor with live preview, multi-level zoom navigation with badges, breadcrumb navigation, workspace/folder management, import/export.
- **Phase 2 — Code Integration:** UP NEXT. File System Access API, Tree-sitter WASM parsing (Python, TS/JS), manual code linking, Monaco Editor for code viewing, split diagram+code view, multi-repo support.
- **Phase 3 — Intelligence Layer:** On-demand code scanning, divergence detection, AI chat panel for diagram modifications, visual diff, three sync modes (manual/semi-auto/auto).
- **Phase 4 — Polish & Advanced:** Semantic search, auto-tagging, version history, diagram templates, advanced exports (PDF/HTML with comments).

## Git Conventions

- Do NOT include model name (e.g. "Opus", "Sonnet") in commit messages or Co-Authored-By lines.
