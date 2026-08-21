---
name: ship
description: Review and merge a ZGE Paseo internal pull request. Use when the user says "ship", "merge this PR", or "/ship".
user-invocable: true
---

# Ship an internal pull request

Run this flow only for a pull request that targets `internal/main`.

1. Read `docs/fork-governance.md`.
2. Confirm CI and Upstream provenance passed for the current pull-request head.
3. Run your configured review agent against the pull request diff and its governance metadata.
4. Post the review to GitHub. Include the reviewed head SHA, verdict, high-risk findings, and advisory findings.
5. Stop if the review finds a high-risk issue. Request changes with path and line evidence.
6. For a clean direct import, dispatch **Upstream import merge** after the review posts.
7. For a reconciled import, review only the conflict-resolution diff. Submit the required human approval, then dispatch **Upstream import merge**.
8. Confirm the pull request merged with a merge commit.

Do not merge a pull request with failed CI, failed provenance, a stale upstream head, or an unresolved high-risk finding.
