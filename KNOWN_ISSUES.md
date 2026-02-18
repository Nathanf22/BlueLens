# Known Issues

Issues that are partially mitigated but not properly fixed. Each entry includes
the root cause and the correct long-term fix.

---

## [KI-001] View Code fails when repo was removed and re-added

**Severity:** Medium
**Files:** `App.tsx` (`handleCodeGraphViewCode`, `handleViewCode`)

### Symptom
"View Code" shows "Repository is disconnected" even though a repo is visibly
connected in the Repo Manager.

### Root Cause
`CodeGraph` and `CodeLink` store the repo's UUID at creation time. If the user
removes a repo from the Repo Manager and adds the same directory again, it gets
a new UUID. The old UUID stored on the graph/link no longer matches any handle.

### Current Workaround (BAD)
Both handlers fall back to `workspaceRepos.find(r => hasHandle(r.id))` — the
**first** connected repo. This accidentally works when there is only one repo,
but picks the wrong repo when multiple repos are connected simultaneously.

### Correct Fix
Option A: Store `repo.name` (directory name) alongside `repoId` on `CodeGraph`
and `CodeLink`. On mismatch, resolve by name across connected repos.
Option B: Show a "Re-link repository" prompt letting the user explicitly pick
which connected repo to use for this graph/link.
Option B is safer and more explicit.
