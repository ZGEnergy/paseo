# Fork governance

This repository is the public `ZGEnergy/paseo` fork. Keep the fork's `main` branch as an upstream mirror; use `internal/main` as the internal integration branch.

## Branches and sync

- `main` tracks `getpaseo/paseo:main`. Do not add fork-only commits to it.
- `internal/main` receives reviewed upstream imports and internal features.
- The scheduled or manually dispatched **Upstream sync** workflow fetches upstream `main`, fast-forwards fork `main` only when fork `main` is an ancestor, then opens or updates a `main` → `internal/main` pull request when `main` contains commits absent from `internal/main`. If there are no such commits, it exits successfully without creating or editing a pull request.
- GitHub Actions scheduled workflows run from the repository default branch. Set the repository default branch to `internal/main`; the workflow asserts this configuration before any write.

## Provenance and review

Every internal feature or imported upstream change must identify its upstream issue, upstream pull request, upstream head repository, and upstream pull-request head SHA in the pull-request body. The **Upstream provenance** check verifies that metadata against the public upstream API, confirms the base repository, actual head repository, and SHA, compares every upstream and fork pull-request patch ID in order, and uploads reconciliation evidence. A mismatch blocks the pull request.

Clean direct imports (patch-equivalent to the upstream pull request) need no human approval. The import bot reruns provenance immediately before its merge decision, waits for required CI checks, and merges only after that final check passes. Reconciled imports (those with `Fork main:` and `Reconciliation merge:` metadata) retain one human approval because their conflict resolution requires review.

If an upstream import is stale, the final provenance run fails and the bot does not merge it. Update its metadata or reconcile against the new upstream head, then rerun checks. Never merge an import whose upstream head changed after review.

## CI and permissions

Required checks are the repository CI workflow and the provenance check for changes targeting `internal/main`. Governance workflows use narrow GitHub token permissions. The sync GitHub App must be installed on this repository with **Contents: write**, **Issues: write**, **Pull requests: write**, and **Workflows: write** repository permissions; Issues write is required only to create or update the single actionable divergence incident, and Workflows write is required because mirrored `main` can include workflow file changes. The workflow stores only `ZGE_PASEO_SYNC_APP_ID` and `ZGE_PASEO_SYNC_APP_PRIVATE_KEY` as secrets, mints a repository-scoped installation token at the start of each run, and uses that short-lived token for sync pushes, pull-request automation, and divergence incident updates. No persistent installation token is stored.

## Release and relay isolation

This fork must not publish to upstream release destinations. Release workflows may create artifacts only in this repository and require repository-owner or credential guards before any external publish. A workflow-file guard alone cannot prevent relay deployment across a public fork network: each repository owner must disable the inherited relay workflow in repository Actions settings and remove any relay deployment credentials/secrets (or otherwise revoke the deployment environment) at the repository level. The relay implementation and its default endpoint remain unchanged.
