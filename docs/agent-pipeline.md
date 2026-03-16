# BlueLens Agent Pipeline

## Overview

The agentic code-analysis pipeline converts a raw codebase into structured diagrams using four specialized agents coordinated by a deterministic orchestrator. Each agent has a distinct epistemic role.

```
Codebase scan
    ↓
[Analyst]   → semantic clusters
    ↓
[Evaluator] → cluster issues (warns Analyst of design problems)
    ↓
[Synthesizer] round 1 → runtime flows
    ↓
[Evaluator] → correctness issues + missing flows
    ↓ (if issues)
[Synthesizer] round 2 → surgical fixes + new flows
    ↓
[Architect] → architecture diagrams (overview + one per cluster)
    ↓
[Evaluator] → architecture issues
```

---

## Agents

### Analyst
**Role:** Semantic clustering — groups files into meaningful domain clusters.

**Tools:** `list_files_by_coupling`, `get_file_info`

**Approach:** Reads file metadata (symbols, imports, coupling metrics) to identify functional domains. Does NOT read file contents — works at the structural level only.

**Output:** A list of named semantic clusters, each with a description and a list of files.

**Philosophical basis:** *Structural inference.* The Analyst reasons from import graphs and symbol counts, not business logic. This gives it a stable, objective foundation for grouping — but means it cannot understand what a file does, only what it depends on. An `api/db.js` file may be correctly placed at the infrastructure layer only if the Analyst understands that low inbound coupling ≠ domain membership.

**Failure modes:**
- Groups files by location (`public/`) rather than domain
- Treats infrastructure files (db, config) as peer domains

---

### Synthesizer
**Role:** Runtime flow generation — traces user journeys across the codebase.

**Tools:** `find_entry_points`, `read_file`, `get_node_relations`, `get_cluster_files`

**Approach:** Uses explicit Chain-of-Thought reasoning:
1. Surveys entry points
2. Enumerates all user-facing operations (HTTP endpoints, UI actions, background jobs)
3. Selects the most important and distinct flows
4. Traces each flow by reading the relevant files
5. Outputs structured flow JSON with sequence diagrams

**Output:** A set of named `GraphFlow` objects, each with ordered steps (file-level nodes) and a Mermaid sequence diagram.

**Philosophical basis:** *Synthesis under uncertainty.* The Synthesizer fills in gaps with plausible inferences. It reads actual code, but interprets it — and interpretation can hallucinate. An HTTP `fetch('/api/foo')` on the client is connected to the server route that handles it, but the Synthesizer must infer this cross-process boundary, not just follow import edges. This is where errors of commission (wrong connections) and errors of omission (missing flows) both originate.

**Chain-of-Thought rationale:** Without explicit enumeration, the model jumps to generating the first 3-5 flows that come to mind, missing important ones. The enumeration step forces a survey of the full operation space before selection.

**Failure modes:**
- Hallucinated method calls (e.g., `db.findById()` that doesn't exist)
- Missing important flows (fixed by completeness check in Evaluator)
- Wrong `scopeNodeId` (fixed by validation in `validateAndBuildFlows`)

---

### Evaluator
**Role:** Adversarial verification — reads actual source code to falsify the generated output.

**Tools:** `read_file` only (intentionally restricted)

**Approach (correctness):** Given a set of generated flows, reads the source files of each step and checks whether the claimed connections actually exist in the code.

**Approach (completeness):** After verifying existing flows, asks: based on the files read, are there important user journeys clearly NOT represented?

**Output:** A list of `ValidationIssue` objects (errors + warnings), plus a `missing` list of suggested absent flows.

**Philosophical basis:** *Falsification.* The Evaluator does not build a model — it tests one. Its only tool is `read_file`, which forces every judgment to be grounded in actual source code. It cannot hallucinate a connection (it can only report one it found or didn't find). This structural asymmetry is why the Evaluator catches errors the Synthesizer makes: the Synthesizer infers, the Evaluator verifies.

**What the Evaluator cannot catch:**
- *Errors of omission* the Synthesizer made — flows that were never generated. The completeness check partially addresses this, but cannot discover flows it never read about.
- *Internally consistent errors* — if a flow's logic is wrong in a way that's consistent with the code (e.g., a flow is technically correct but architecturally misleading).

**Deduplication:** The Evaluator uses a `readOnce` set per session — if it asks for the same file twice, the second request returns `"(already provided above)"` immediately, saving tokens and preventing redundant Mission Control events.

**Surgical update rationale:** When the Evaluator finds errors in specific named flows, only those flows are regenerated in round 2. Verified flows are frozen and merged back after round 2. This preserves good work on large codebases where full regeneration would corrupt already-correct flows.

---

### Architect
**Role:** Architecture diagram generation — produces Mermaid graphs showing module structure.

**Tools:** `find_entry_points`, `read_file`, `get_node_relations`, `get_cluster_files` (same as Synthesizer)

**Approach:**
1. Reads all cluster file lists
2. Reads the main file of each cluster to understand its real responsibility
3. Outputs two types of diagrams:
   - **Overview** (`graph LR`): one node per D1 cluster, edges labeled with what is used/provided
   - **Service diagrams** (`graph TD`): one node per D2 file within a cluster, entry points vs dependencies

**Output:** An `ArchitectureDiagramSet` with an overview diagram and one service diagram per semantic cluster.

**Philosophical basis:** *Structural synthesis with code grounding.* Unlike deterministic diagram generation (which just renders the node graph), the Architect reads actual code to write meaningful node descriptions and edge labels. The risk is the same as the Synthesizer: interpretation can diverge from reality.

**Failure modes:**
- Misattributed cluster responsibilities (e.g., calling a client-side state manager a "session management" service)
- Missing cross-cluster dependencies in the overview

---

## Pipeline Design Decisions

### Why separate Evaluator instead of better Generators?
Generators and Evaluators have structurally different failure modes. A generator rewarded for producing coherent output will hallucinate to fill gaps. An evaluator rewarded for finding errors will only report what the code confirms. You cannot make a single agent do both well simultaneously — the adversarial stance requires a different objective.

### Why surgical updates instead of full regeneration?
On large codebases, a single error in one flow should not invalidate 20 correctly generated flows. Full regeneration risks the Synthesizer producing a *different* (not necessarily better) set of flows in round 2, corrupting previously correct work. Surgical updates freeze verified flows and only patch or add what the Evaluator flagged.

### Why Chain-of-Thought for the Synthesizer but not the Analyst?
The Analyst's task is structural (clustering by coupling metrics) — there is no hidden space of candidates to enumerate. The Synthesizer's task is semantic (identifying user journeys) — the space of possible flows is large and the model must survey it explicitly to avoid premature convergence on obvious ones.

### Why doesn't the Architect have a retry round?
Architecture diagrams are more subjective than flows — an error like "cluster described incorrectly" does not have a clear programmatic fix. Flow errors (wrong method call, non-existent import) have unambiguous corrections. The Architect's Evaluator pass is informational: it surfaces design concerns without triggering regeneration.

### Why is the Evaluator restricted to `read_file` only?
Restricting tools forces the Evaluator to ground every judgment in raw source text. If it had access to `get_node_relations`, it could construct abstract arguments about structure without reading the code. The restriction is a deliberate epistemic constraint: *read the code, then judge*.
