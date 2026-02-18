# CodeGraph — Graph Creation Pipeline

## Overview

CodeGraph is a hierarchical model of a codebase, generated automatically from source files.
It produces Mermaid on-the-fly via ViewLens (Component, Flow, Domain).

Creation happens in 4 stages:
1. **Scan** — read files, extract symbols and imports
2. **Grouping** — functional grouping of files (AI or heuristic)
3. **Parsing** — build the D0-D3 graph with relations
4. **Flows** — generate flows (sequence diagrams) via AI

A **Progress Log Panel** displays detailed progress for each stage in real-time.

---

## Functional Grouping

### Problem

Raw scanning groups files by **directory**: `components/`, `hooks/`, `services/`.
This is the same as a file explorer — it doesn't show the architecture.

Files from 3 different directories implementing the same feature should appear together.

### Method: 2 LLM Agents in Sequence

```
Repository files
      |
      v
 +-----------+     +-----------+     +---------------------+
 | Agent 1   | --> | Agent 2   | --> | Functional modules
 | Analyst   |     | Architect |     | in the CodeGraph
 +-----------+     +-----------+     +---------------------+
  batches of 10     single call
```

#### Agent 1 — File Analyst

**Input**: metadata already extracted (no file re-reading)

```
File: services/llmService.ts
Symbols: sendMessage (function), testConnection (function)
Imports: @google/genai, openai, ../types
Exports: llmService, getDefaultSettings
```

**Output**: purpose + role for each file

```json
{
  "filePath": "services/llmService.ts",
  "purpose": "Multi-provider LLM abstraction for Gemini, OpenAI, and Anthropic",
  "role": "service"
}
```

**Batching**: 10 files per LLM call. A 40-file project = 4 calls.

**Tolerances**:
- Paths returned by the LLM are normalized (`./foo.ts` → `foo.ts`)
- Invalid roles are inferred from the filename
- Result is accepted if at least 50% of files are covered
- Missing files are filled in with a name-based fallback

#### Agent 2 — Architect

**Input**: all Agent 1 analyses + import edges between files

```
FILE SUMMARIES:
services/llmService.ts — Multi-provider LLM abstraction [...] [service]
components/AIChatPanel.tsx — Chat UI for AI interactions [component]
hooks/useChatHandlers.ts — Chat session state management [hook]

IMPORT RELATIONSHIPS:
hooks/useChatHandlers.ts → services/llmService.ts
components/AIChatPanel.tsx → hooks/useChatHandlers.ts
```

**Output**: named modules + relationships + descriptions

```json
{
  "modules": [
    {
      "name": "AI Intelligence",
      "description": "LLM chat, generation, and intelligent analysis",
      "files": ["services/llmService.ts", "components/AIChatPanel.tsx", "hooks/useChatHandlers.ts"]
    }
  ],
  "relationships": [
    { "from": "AI Intelligence", "to": "Diagram Editor", "label": "modifies diagrams" }
  ]
}
```

**Key constraint in the prompt**: the system prompt includes the exact list of valid paths,
with instructions to copy them as-is. This prevents the LLM from modifying paths.

**Tolerances**:
- Flexible path resolution (normalization, without extension, by basename)
- A module with 0 valid files is skipped (does not reject the entire blueprint)
- Duplicate module names receive a suffix
- Unassigned files go into an "Other" module
- Minimum 1 module (not 2) to accept the result

### Heuristic Fallback

When AI is not configured or fails, the **heuristic grouper** (`codeGraphHeuristicGrouper.ts`) takes over.
It produces functional modules (not directories) via:

1. **Pattern matching** — table of ~15 regexps mapping filenames to groups:
   - `useCodeGraph.ts`, `CodeGraphPanel.tsx` → "Code Graph"
   - `llmService.ts`, `AIChatPanel.tsx` → "AI Intelligence"
   - `useDiagramHandlers.ts`, `Editor.tsx` → "Diagram Editor"
   - etc.

2. **Import affinity** — unmatched files are assigned to the group that receives the most of their imports

3. **Merge** — groups with < 2 files merge with their closest import neighbor

4. **Dependencies** — cross-group imports become module relationships

### Fallback Chain

```
LLM configured?
  |
  yes --> AI Pipeline (Agent 1 + Agent 2)
  |         |
  |         success --> Functional modules (e.g., "AI Intelligence", "Diagram Editor")
  |         |
  |         failure (3 attempts) --> Heuristic functional grouping
  |
  no --> Heuristic functional grouping
```

Each agent gets 3 attempts (1 initial + 2 retries).
If the JSON is invalid, the retry includes an error message in the prompt.

---

## Flow Generation

After graph construction, the pipeline generates **flows** (sequence diagrams) via AI.

**Pipeline** (`codeGraphFlowService.ts`):
1. `buildGraphSummary()` — extracts D1 modules, D2 edges, entry points
2. `generateFlowsWithLLM()` — single LLM call, JSON schema output, 2 retries, validates node IDs
3. `generateFlows()` — orchestrator, returns empty if no AI

Flows are **contextual to zoom level**:
- Focus on root → end-to-end flows (cross-module)
- Focus on a module → module-internal flows

**No heuristic fallback for flows** — heuristic flows were not relevant.
If generation fails, existing flows are preserved (no loss).

---

## Progress Log

The entire pipeline emits log entries via a callback `onLogEntry(category, message, detail?)`.

**Categories**: `scan`, `ai-analyze`, `ai-architect`, `parse`, `resolve`, `hierarchy`, `flow`, `info`

The **ProgressLogPanel** displays these entries in real-time in a panel at the bottom of the workspace:
- Compact bar (28px) with the latest message
- Expanded view (~200px, resizable) with timestamps and category icons
- Auto-scroll, pauses if the user scrolls up

Example log:
```
[0:00.1] Search   Scanning codebase...
[0:02.3] Info     Starting AI analysis pipeline
[0:02.4] Brain    Analyzing batch 1/4 (10 files)
[0:05.1] Brain    Batch 1 complete: 10 file analyses
[0:12.1] Brain    Building functional architecture...
[0:18.4] Brain    Architecture: 6 modules, 8 rels
[0:18.5] Branch   Creating 6 modules
[0:19.8] Branch   Processing files (42/42)
[0:20.1] Link     Resolving dependencies (42/42)
[0:21.3] Layers   Analyzing class hierarchy (42/42)
[0:22.0] Play     Generating flows with AI
[0:28.1] Play     Generated 8 flows
[0:28.2] Info     Graph creation complete (186 nodes)
```

---

## Code Flow

```
App.tsx
  handleCreateGraph(repoId)
    |  injects llmSettings + progressLog.addEntry
    v
useCodeGraph.ts
  createGraph(repoId, llmSettings?, onLogEntry?)
    |
    +--> codebaseAnalyzerService.analyzeCodebase(handle)
    |      raw file scan
    |
    +--> analyzeCodebaseWithAI(analysis, llmSettings, onLogEntry)
    |      |
    |      +--> Agent 1: analyzeFilesBatch() x N batches
    |      +--> Agent 2: buildArchitecture()
    |      +--> Failure? → groupByFunctionalHeuristics(analysis)
    |      +--> Returns CodebaseAnalysis with regrouped modules
    |
    +--> parseCodebaseToGraph(analysis, ..., onLogEntry)
    |      builds D0-D3 graph, propagates module.description to D1
    |
    +--> generateFlows(graph, llmSettings, onLogEntry)
           AI-only, returns empty if no AI
```

---

## Files Involved

| File | Role |
|---|---|
| `services/codeGraphAgentService.ts` | LLM pipeline (Agent 1 + Agent 2 + orchestrator) |
| `services/codeGraphHeuristicGrouper.ts` | Functional grouping via patterns + import affinity |
| `services/codeGraphFlowService.ts` | Flow generation (AI-only) |
| `services/codeToGraphParserService.ts` | CodebaseAnalysis → CodeGraph (D0-D3) |
| `hooks/useCodeGraph.ts` | Orchestrates the pipeline, manages graph state |
| `hooks/useProgressLog.ts` | Log state (entries, active, expanded) |
| `components/ProgressLogPanel.tsx` | Log UI at the bottom of the workspace |
| `App.tsx` | Injects llmSettings and addEntry into createGraph |

## Token Cost

| Project size | Agent 1 | Agent 2 | Flows | Total | Cost (Gemini Flash) |
|---|---|---|---|---|---|
| ~30 files | 3 batches | 1 call | 1 call | ~75K tokens | ~$0.01 |
| ~200 files | 20 batches | 1 call | 1 call | ~420K tokens | ~$0.10 |

## Debugging

Open the browser console. `[CodeGraph]` logs show:
- `[CodeGraph] Agent 1 complete: N file analyses`
- `[CodeGraph] Import edges resolved: N`
- `[CodeGraph Agent 2] Created N modules with N relationships`
- `[CodeGraph Agent 2] Module "X" had 0 valid files, skipping` (path mismatch issue)
- `[CodeGraph] AI architecture failed, falling back to heuristic grouping`

The **Progress Log Panel** in the UI provides the same visibility without opening the console.
