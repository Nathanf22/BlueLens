# Open Issues

## 🔴 URGENT

### [ARCH-01] Strict tree hierarchy can't represent cross-cutting concerns

**Problem:**
The CodeGraph data model is a strict tree (`parentId` is singular). Each node belongs to exactly one parent. This makes it impossible to represent:

- A function that is architecturally relevant to multiple abstractions simultaneously (e.g., `authenticate()` belongs to both "Security" and "API Gateway")
- A transversal view grouping functions from different files around a shared concept (e.g., all nodes involved in "Payment processing" regardless of which module they live in)
- The fact that the same D3 symbol can be a cross-cutting concern across multiple D1 modules

**Current mitigations (partial):**
- Flows: show cross-module paths, but are ephemeral and LLM-generated
- Domain lens: semantic grouping, but still one group per node
- `depends_on` / `calls` relations: express links, but don't enable multi-membership

**What's needed:**
Nodes should support **multi-dimensional semantic tagging** — e.g., `tags: ['#auth', '#critical-path', '#api']` — enabling transversal views that cut across the hierarchy without breaking it. Similar to "concern maps" in tools like CodeScene or Understand.

**Impact:** High — affects diagram fidelity, sync relevance, and the ability to represent real-world architectures where concerns don't map cleanly to file/folder structure.

**Suggested approach:**
1. Extend `GraphNode.tags` (already exists as `string[]`) to be the primary vehicle for cross-cutting membership
2. Add a **Tag lens** — a new `ViewLens` type that groups nodes by tag rather than by `parentId`
3. Allow Agent 2 (Architect) to assign semantic tags during graph creation
4. Expose tag filtering in CodeGraphPanel

---

## 🟡 KNOWN FAULTS (from pipeline analysis)

See `docs/DIAGRAM_GENERATION_AND_SYNC.md` for the full list of architectural faults identified in the diagram generation and sync pipeline.
