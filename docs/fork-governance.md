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

## Local ship gate

Internal teammates run `/ship` locally for a pull request that targets `internal/main`. The operator uses their own review agent, posts its review to GitHub, and stops on a high-risk finding. The skill requires CI and provenance for the current head before review. A clean direct import may dispatch **Upstream import merge** after the review posts. A reconciled import requires the focused conflict-resolution review and the existing human approval before that dispatch. See `.claude/skills/ship/SKILL.md` for the procedure.

### Narrow downstream-governance exception

A fork-only governance pull request may select the narrow exception only with the exact pull-request-body marker `Downstream governance: true`. Marker variants, including different capitalization or values, do not select it. The checker accepts the marker only when every changed file is exactly one of these governance artifacts:

- `scripts/check-upstream-provenance.mjs`
- `scripts/ci-workflow.test.mjs`
- `docs/fork-governance.md`
- `.github/workflows/ci.yml`
- `.github/workflows/upstream-sync.yml`
- `.github/workflows/upstream-import-merge.yml`
- `.github/workflows/upstream-provenance.yml`
- `.github/workflows/deploy-app.yml`
- `.github/workflows/deploy-website.yml`
- `.github/workflows/android-apk-release.yml`
- `.github/workflows/desktop-release.yml`
- `.github/workflows/deploy-relay.yml`
- `.claude/skills/ship/SKILL.md`

This exception does not provide a general provenance bypass: a non-governance path, missing or invalid marker, or ordinary feature/import pull request remains subject to the requirements above. For a qualifying governance pull request, the checker intentionally does not require upstream metadata or assert upstream patch equivalence; it records the outcome as an exception instead. The governance exception requires an effective approval by a human GitHub user for the current pull-request head. An approval for an older head, an approval from a bot or GitHub App, and a dismissed approval do not count; submitting or dismissing a review reruns provenance so the current-head requirement is reevaluated. Evidence and the workflow summary identify this outcome as a downstream-governance exception. The checker always runs from trusted `internal/main` code, so this first exception change must be merged through the documented human/admin bootstrap process after a current-head approval; later governance pull requests use the review-triggered check.

## CI and permissions

Required checks are the repository CI workflow and the provenance check for changes targeting `internal/main`. Governance workflows use narrow GitHub token permissions. The sync GitHub App must be installed on this repository with **Contents: write**, **Issues: write**, **Pull requests: write**, and **Workflows: write** repository permissions; Issues write is required only to create or update the single actionable divergence incident, and Workflows write is required because mirrored `main` can include workflow file changes. The workflow stores only `ZGE_PASEO_SYNC_APP_ID` and `ZGE_PASEO_SYNC_APP_PRIVATE_KEY` as secrets, mints a repository-scoped installation token at the start of each run, and uses that short-lived token for sync pushes, pull-request automation, and divergence incident updates. No persistent installation token is stored.

## Release and relay isolation

This fork must not publish to upstream release destinations. Release workflows may create GitHub-native artifacts only in the repository where they run. Inherited external deployment paths for Cloudflare app and website deployments, Expo Android publishing, Apple signing/notarization, and relay deployment use exact-repository guards (`github.repository == 'ZGEnergy/paseo'`); those guards do not block GitHub-native release artifacts in forks. The relay implementation and its default endpoint remain unchanged.
