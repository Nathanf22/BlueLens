# Problem Framing — BlueLens Agentic Pipeline

> **Formalization note.** This document was written *after the fact*, following the pipeline's
> implementation. The decisions it describes were made from the very start of the project — they
> guided every architectural choice — but were never formally written down. This document fills
> that gap. It follows the agentic framing document structure described in
> *The Agentic Engineering Handbook*, Ch. 2.1.

---

## 1. The Real Problem

Developers joining an existing codebase, or returning to a project after a few weeks, have no
visual source of truth for the system's actual architecture. Existing tools fail for structural
reasons:

- **Hand-drawn diagrams** (UML, C4, Miro) are accurate the day they are created and obsolete by
  the next PR. Nobody maintains them systematically because the maintenance cost is too high
  relative to the perceived value.
- **Static generators** (package dependency graphs, import graphs) produce technically correct
  but unreadable graphs: 500 nodes with no semantics, no hierarchy, no notion of runtime
  behavior.
- **Textual documentation** describes original intent, not current behavior. It drifts silently.

The operational result: to understand how a system works, a developer reads dozens of files by
hand, mentally traces calls between modules, and rebuilds a cognitive map that disappears the
moment they close their editor.

The problem is not a lack of tools — it's that existing tools produce either unmaintainable
artifacts (manual diagrams) or unreadable ones (raw import graphs). What is missing: a visual
representation that is **semantic, hierarchical, and synchronized with the code**.

---

## 2. Agent / Non-Agent Decision

The decision gate applied to BlueLens:

| # | Question | Answer | Justification |
|---|----------|--------|---------------|
| 01 | Must the behavior adapt to unpredictable inputs? | **Yes** | Every codebase is different. Import patterns, naming conventions, and domain boundaries vary radically from one project to the next. A deterministic pipeline would produce generic, unusable clusters. |
| 02 | Must the system make decisions during execution? | **Yes** | The agent decides which files to read, in what order, to infer domain boundaries. These decisions cannot be encoded in advance: they depend on the content of the files discovered during exploration. |
| 03 | Must the system act on the external world? | **Yes** | The agent reads code files via the File System Access API or the GitHub API, generates structured artifacts (CodeGraph, flows, Mermaid diagrams), and persists those artifacts in the user's workspace. |
| 04 | Does the objective require multiple reasoning cycles? | **Yes** | The task is impossible in a single LLM call. The agent must first explore the structure (Analyst), then verify its hypotheses (Evaluator), then trace flows (Synthesizer), then verify flows against real code (Evaluator), then generate diagrams (Architect). Each step depends on the results of the previous one. |
| 05 | Does the benefit justify the cost of agentic complexity? | **Yes** | A deterministic pipeline would produce groupings by directory structure (services/, components/, hooks/) — technically correct but semantically empty. The agent's value is precisely the semantic inference: understanding that `useCodeGraph.ts`, `codeGraphOrchestrator.ts`, and `svgParserService.ts` belong to different domains despite their superficial similarities. |
| 06 | Do regulatory constraints allow this deployment? | **Yes** | See section 5. Low risk for a developer-side tool, provided code data is handled transparently. |

**Verdict: clearly agentic use case.** Input variability, the need for runtime decisions,
multi-step exploration with feedback, and the value of semantic inference all justify the
agentic approach.

---

## 3. Action Scope

### Permitted actions

- **Read** source code files (local FS or GitHub API), capped at the first 150–200 lines per
  file to control token cost
- **List** project files and their metadata (size, language, extracted imports)
- **Infer** semantic boundaries (clusters, flows, dependencies) from the code read
- **Generate** output artifacts: `CodeGraph`, `GraphFlow[]`, Mermaid diagrams
- **Verify** generated artifacts by re-reading source code (the Evaluator's role)
- **Persist** artifacts to the user's workspace localStorage

### Prohibited actions

- **Modify** the user's source code — the agent is read-only on the codebase
- **Execute** user code (no test runs, no builds)
- **Access** network resources other than the chosen LLM API and the GitHub API if explicitly
  configured
- **Decide** to synchronize or apply diagram changes without human validation — sync is always
  a proposal submitted for approval

### Autonomy level

The system sits toward the middle of the assistant ↔ autonomous spectrum, with a deliberate
asymmetry:

- **Generation phase**: fully autonomous. The agent reads, infers, and generates without any
  intermediate human intervention. The human can observe in real time via the `AgentMissionPanel`
  but does not validate intermediate steps.
- **Sync phase**: semi-autonomous. When code changes, the system detects divergences and
  generates a *proposal* to update the diagrams. The human accepts or rejects it. No diagram
  change is applied automatically.

This partial autonomy is a deliberate design choice: generation errors are recoverable (the
user can edit the Mermaid code), silently applied sync errors are not.

---

## 4. Context Constraints

### Tech stack

- **Runtime**: client-side only (React 19 + TypeScript + Vite), no backend. All pipeline logic
  runs in the user's browser.
- **Persistence**: localStorage + IndexedDB. No server-side database, no cloud sync.
- **LLM providers**: Gemini (`@google/genai`), OpenAI (`openai` SDK), Anthropic (fetch to
  proxy). The user configures their own API keys.
- **Code parsing**: per-language regex and heuristics (TypeScript/JS, Python, Java, Go, Rust).
  No full AST parser (tree-sitter available but optional).

### Token and cost budget

The pipeline is designed to stay within reasonable usage thresholds for an individual developer:

- **~30-file codebase**: ~75K tokens, estimated cost < $0.01 with Gemini Flash
- **~200-file codebase**: ~420K tokens, estimated cost ~$0.10 with Gemini Flash
- **Practical limit**: ~500 files before cost becomes prohibitive

Control mechanisms implemented: batching (10 files per Analyst call), truncation at 150–200
lines per file, read deduplication (the Evaluator never reads the same file twice), cap of 20
iterations per agent.

### Acceptable latency

The full generation pipeline takes 2–5 minutes for a 100–200 file codebase. This latency is
accepted by design: generation is a one-time (or manually triggered) operation, not a
real-time computation. The UI displays detailed progress to prevent the perception of blocking.

### Integration constraints

- The File System Access API is only available in Chromium-based browsers (Chrome, Edge).
  Firefox is out of scope for local FS access.
- The GitHub API enforces rate limits (60 req/h unauthenticated, 5,000 req/h authenticated).
  Very large GitHub codebases may hit this limit.

---

## 5. Regulatory Constraints

| Question | Assessment for BlueLens |
|----------|-------------------------|
| Automated decisions with significant impact on natural persons? | **No.** The agent generates architecture diagrams, not HR, financial, or health decisions. No direct impact on individuals. |
| Personal data processed, and on what legal basis? | **Potentially.** A user's source code may contain personal data (hardcoded emails, tokens, names). This data is sent to third-party LLM APIs. Legal basis: the user's legitimate interest — they configure their own API keys and explicitly choose to send their code. |
| Data transferred to servers outside the EU? | **Yes.** Gemini (Google US), OpenAI (US), Anthropic (US). Users are informed through explicit key configuration. No data is transmitted without an intentional action by the user. |
| Deployment in a regulated sector? | **Not applicable.** BlueLens is a development tool, not a system deployed in a regulated industry. |
| Sensitive data (health, biometrics, political opinions)? | **No by design.** Source code should not contain such data; if it does, that is a security malpractice on the user's side, not a risk introduced by BlueLens. |

**Conclusion**: BlueLens falls outside the EU AI Act's "high-risk" scope (developer aid tool,
no automated decisions impacting persons). The primary point of attention is transmission of
source code to third-party LLM APIs — addressed by explicit user-side key configuration and
the absence of any default transmission.

No DPIA (Data Protection Impact Assessment) required at this stage for a developer-side tool
without large-scale processing of personal data.

---

## 6. Assumptions and Risks

### Assumptions made at framing

**A1 — Semantic inference is possible on partial code.**
The agent can infer semantic domain boundaries from imports, symbol names, and the first 150
lines of each file — without reading each file in full.
*Risk if false*: clusters will be structural (by directory) rather than semantic. Mitigated by
the Evaluator feedback loop and the ability to regenerate.

**A2 — An adversarial evaluator improves output quality.**
A separate agent whose role is to find errors in generation outputs improves accuracy compared
to a single generator agent. This assumption rests on the asymmetry of failure modes:
generators hallucinate to fill gaps; evaluators only report what the code confirms.
*Risk if false*: two generation rounds cost more with no quality gain. Not observed in practice
on tested codebases.

**A3 — Developers accept 2–5 minutes of latency for initial generation.**
Generation is not interactive — it is a "codebase analysis" operation, comparable to a first
`git clone` + static analysis. The latency is acceptable.
*Risk if false*: product abandonment due to perceived slowness. Mitigated by the detailed
progress bar and incremental generation (per-cluster flows appear as they arrive).

**A4 — Current LLMs (Gemini Flash, GPT-4o-mini) are capable enough for this task.**
Mid-tier models (not Opus/GPT-4) can infer correct semantic clusters on moderately sized
codebases.
*Risk if false*: need to use more expensive models, multiplying the budget by 10–50x.

### Risks that would invalidate the framing

**R1 — Target codebases are systematically > 500 files.**
Above ~500 files, generation cost becomes prohibitive and cluster quality declines (too many
files per batch). The current framing assumes moderately sized codebases. *If the primary use
case is a 2,000+ file monorepo*, the design must change (scope-based or per-module generation
only).

**R2 — Users want to edit generated diagrams and preserve those edits across regenerations.**
The current framing treats generation as "overwrite everything." The sync pipeline (issue #12)
handles incremental updates, but manual edits can be lost. *This risk is partially addressed
by the sync pipeline*, which proposes modifications rather than regenerating wholesale.

---

## 7. Success Criteria

An agentic system is never "done" — it is "good enough for the use case." The following
criteria define the acceptability threshold for BlueLens's agentic pipeline:

| Dimension | Criterion | Measurement |
|-----------|-----------|-------------|
| **Cluster accuracy** | Fewer than 20% of files misplaced after Evaluator round 2 | Manual validation on 5 reference codebases of varied size and domain |
| **Flow accuracy** | Fewer than 1 hallucinated flow (connection absent from code) per 10 generated flows | Evaluator reports `hallucinated_relation` issues |
| **Flow coverage** | Generated flows cover the 3 main user journeys of a standard web application | Evaluator reports `missing_flow` on obviously critical flows |
| **Diagram usability** | Generated diagrams are usable without manual editing in ≥ 60% of cases | User feedback during test sessions |
| **Generation cost** | < $0.20 for a 200-file codebase with Gemini Flash | Measured via `tokenUsageService.ts` |
| **Generation latency** | < 5 minutes for a 100–200 file codebase | Measured via `useProgressLog.ts` (elapsed ms per phase) |
| **Error recovery** | Pipeline completes without crashing on any valid (TypeScript/JS) codebase, even if output is partial | Test coverage on codebases of varying sizes and structures |

---

*Document created 2026-03-29 — formalized after the fact from decisions made at project inception
(Q4 2024). Methodological reference: The Agentic Engineering Handbook, Ch. 2.1.*
