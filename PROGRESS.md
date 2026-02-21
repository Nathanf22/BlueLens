# Blueprint — Project Progress

## Phase 1: Foundation (MVP) — COMPLETE
All features implemented and working:
- Mermaid editor with live preview, pan/zoom
- Multi-level zoom navigation with node link badges
- Breadcrumb navigation
- Workspace/folder management
- Import/export (.blueprint JSON, legacy .mmd/.txt/.zip)
- Comments (positioned annotations on diagrams)
- Split pane resizable editor/preview

## Phase 2: Code Integration — COMPLETE
All features implemented and working:
- File System Access API for local repo browsing (Chromium only)
- Regex-based symbol extraction (TS/JS/Python) via `codeParserService`
- Manual code linking (nodes → files with line ranges)
- Monaco Editor for read-only code viewing (`CodePanel`)
- Green SVG badges for code links, blue for node links
- Multi-repo support per workspace
- `RepoConfig` persisted in localStorage; `FileSystemDirectoryHandle` in-memory only

## Phase 3: Intelligence Layer — PARTIAL

### Implemented
- **Multi-provider LLM**: Gemini (`@google/genai`), OpenAI (`openai` SDK), Anthropic (direct `fetch`, needs CORS proxy)
  - Unified abstraction in `services/llmService.ts`
  - `testConnection()` per provider
  - Default models: gemini-3-flash-preview, gpt-4o-mini, claude-sonnet-4-5
- **AI Settings Modal** (`components/AISettingsModal.tsx`): API key input, model override, proxy URL for Anthropic, test connection, active provider radio buttons
- **LLM Settings persistence**: `hooks/useLLMSettings.ts` → `mermaidviz_llm_settings` localStorage key
- **AI Chat Panel** (`components/AIChatPanel.tsx`): side panel (not modal), suggestion chips, "Apply to diagram" button, per-diagram sessions (in-memory, not persisted)
- **AI Generator Modal**: updated to use `llmService` instead of direct `geminiService`
- **On-demand code scanning**: `services/codeScannerService.ts` — recursive file walk, symbol extraction, 2-pass matching (exact + fuzzy)
- **Scan Results Panel** (`components/ScanResultsPanel.tsx`): repo selector, matches/missing sections, checkbox selection, "Add to diagram" with AI fallback
- **Chat and Code panels**: mutually exclusive in the same right-side slot

### Missing (from PRD)

#### FR3.2 — Sync Status Dashboard
Status indicators (green/yellow/red) showing sync state between code and diagram. Currently no persistent sync status — user must manually run a scan each time.

#### FR3.3 — Three Sync Modes
- Manual: review all suggestions, accept/reject individually
- Semi-auto: auto-accept additions, confirm deletions
- Auto: full automatic sync (with confirmation for destructive changes)

None of these modes exist. Current behavior is purely manual (scan → select → add).

#### FR3.4 — Bidirectional Sync (Diagram → Code)
Only Code→Diagram direction is implemented (detect missing entities, add to diagram). Diagram→Code (generate code scaffolding from diagram structure) is not implemented.

#### FR3.5 — Visual Diff View
Color-coded view showing current diagram vs suggested changes (green=additions, red=deletions, orange=modifications). Not implemented at all.

#### FR3.6 — Configurable Ignore Rules
Ignore utility classes and small helper functions by default, with user configuration. Currently all symbols are included in scans.

#### FR3.7 — Formal Suggestion Types
Structured suggestion system: add component, remove component, add relationship, update relationship, mark as obsolete. Currently scan only identifies "missing in diagram" and "missing in code" without typed suggestions.

#### TR3.3 — Configurable Scan Patterns
Include/exclude paths per repository. Currently all `.ts/.tsx/.js/.jsx/.py` files are scanned with no filtering.

#### FR5.2 — Context-Aware Suggestions
Suggestions based on the currently selected diagram element. Not implemented.

#### FR5.3 — Anti-Pattern Detection
Detect architectural anti-patterns (e.g., "this service has too many dependencies") with explanations. Not implemented.

#### FR5.4 — Cross-Diagram-Type Generation
Generate sequence diagrams from architectural diagrams and vice versa. Not implemented.

#### FR5.6 — Heuristic Rule Engine
Standalone rule-based analysis for common patterns, independent of AI. Only partial: `addMissingToDiagram` falls back to manual node append when AI is unavailable. No broader rule engine.

#### TR5.2 — Secure API Key Storage
PRD specifies encrypted IndexedDB storage. Currently API keys are stored in plain text in localStorage.

### Bugs Fixed (2025-02-07)
1. `useScanHandlers.ts`: selector was `#mermaid-preview svg` (doesn't exist) — fixed to `.mermaid-svg-container svg`
2. `App.tsx`: chat and code panels could open simultaneously — added mutual exclusivity logic

### Dead Code
- `services/geminiService.ts` still exists but is no longer imported by any code (replaced by `llmService`). Can be deleted.

## Phase 4: Polish & Advanced — NOT STARTED
- Semantic search
- Auto-tagging
- Version history
- Diagram templates
- Advanced exports (PDF/HTML with comments)
