# Fork governance

This repository is the public `ZGEnergy/paseo` fork. Keep the fork's `main` branch as an upstream mirror; use `internal/main` as the internal integration branch.

## Branches and sync

- `main` tracks `getpaseo/paseo:main`. Do not add fork-only commits to it.
- `internal/main` receives reviewed upstream imports and internal features.
- The scheduled or manually dispatched **Upstream sync** workflow fetches upstream `main`, fast-forwards fork `main` only when fork `main` is an ancestor, then opens or updates a `main` → `internal/main` pull request when `main` contains commits absent from `internal/main`. If there are no such commits, it exits successfully without creating or editing a pull request.
- GitHub Actions scheduled workflows run from the repository default branch. Set the repository default branch to `internal/main`; the workflow asserts this configuration before any write.

## Provenance and review

Internal pull requests targeting `internal/main` use one of three mutually exclusive modes:

- **Upstream import** (default): identifies its upstream issue, pull request, head repository, and upstream pull-request head SHA. The **Upstream provenance** check verifies that metadata against the public upstream API, confirms the base repository, actual head repository, and SHA, compares every upstream and fork pull-request patch ID in order, and uploads reconciliation evidence. Direct imports need no human approval; reconciled imports (with `Fork main:` and `Reconciliation merge:` metadata) retain one human approval because conflict resolution requires review.
- **Downstream governance**: uses the exact body marker `Downstream governance: true` and is restricted to the governance allowlist below. It does not assert upstream patch equivalence and does not require a pull-request review.
- **Downstream feature**: uses exactly `Downstream feature: true` plus one non-empty `Downstream rationale:` line. It is fork-only, requires one human `APPROVED` review of the current pull-request head (self-approval counts — this is a single-maintainer fork), and cannot change governance-allowlisted files or any `.github/workflows/` file.

Feature and governance markers cannot coexist with each other or with upstream-provenance metadata. For a downstream feature, a review on an older head, a dismissed review, or a bot review does not satisfy the exception. Any new commit invalidates prior feature approval until a reviewer approves the new head.

### Approval phases

Downstream feature exceptions have two approval phases. Before merge, the **pre-merge** phase requires one human `APPROVED` review whose commit SHA exactly matches the pull-request head. After merge, the **post-merge** phase accepts the human actor recorded in `merged_by` as approval evidence only when the pull request is both `closed` and `merged`. Missing or bot merger data, and a closed-but-unmerged pull request, fail provenance; closure alone never bypasses review. Downstream governance exceptions do not require approval in either phase.

The provenance evidence for feature exceptions records the phase and evidence type that qualified: an exact-head review before merge or a human merger after merge. Manual provenance dispatch selects the same phase from current pull-request state. Governance exceptions record their downstream-governance outcome without approval evidence.

If an upstream import is stale, the final provenance run fails and the bot does not merge it. Update its metadata or reconcile against the new upstream head, then rerun checks. Never merge an import whose upstream head changed after review.

## Upstream-port preflight

An upstream-port pull request must start from the fetched `getpaseo/paseo` upstream `main`, not from `internal/main` or any other fork-descendant branch. Before creating the pull request, run the deterministic local guard with the candidate ref, fetched upstream ref, and every permitted path:

```sh
node scripts/check-upstream-port.mjs --candidate <candidate-ref> --upstream-ref <fetched-upstream-ref> --integration-ref origin/internal/main --allow-path <path>
```

The guard resolves both refs locally, requires the upstream commit to be the candidate's merge base, and rejects every changed path outside the declared scopes using exact prefix boundaries. Repeat `--allow-path` for multiple scopes. The agent may run `gh pr create` only after successful preflight. The guard never fetches, interpolates shell input, or opens a pull request.

### Narrow downstream-governance exception

A fork-only governance pull request may select the narrow exception only with the exact pull-request-body marker `Downstream governance: true`. Marker variants, including different capitalization or values, do not select it. The checker accepts the marker only when every changed file is exactly one of these governance artifacts:

- `CLAUDE.md`
- `scripts/check-upstream-provenance.mjs`
- `scripts/check-upstream-provenance.test.mjs`
- `scripts/check-upstream-port.mjs`
- `scripts/check-upstream-port.test.mjs`
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

This exception does not provide a general provenance bypass: a non-governance path, missing or invalid marker, or ordinary feature/import pull request remains subject to the requirements above. A qualifying governance pull request is validated only against the exact allowlist, does not require review approval, does not assert upstream patch equivalence, and records its outcome as a downstream-governance exception.

## Local ship gate

Internal teammates run `/ship` locally for a pull request that targets `internal/main`. The operator uses their own review agent, posts its review to GitHub, and stops on a high-risk finding. The skill requires CI and provenance for the current head before review. A clean direct import may dispatch **Upstream import merge** after the review posts. A reconciled import requires the focused conflict-resolution review and the existing human approval before that dispatch. See `.claude/skills/ship/SKILL.md` for the procedure.

## CI and permissions

Required checks are the repository CI workflow and the provenance check for changes targeting `internal/main`. CI runs on pushes to both `main` and `internal/main`; merging into `internal/main` therefore creates a fresh validation run for the exact internal release source. Governance workflows use narrow GitHub token permissions. The sync GitHub App must be installed on this repository with **Contents: write**, **Issues: write**, **Pull requests: write**, and **Workflows: write** repository permissions; Issues write is required only to create or update the single actionable divergence incident, and Workflows write is required because mirrored `main` can include workflow file changes. The workflow stores only `ZGE_PASEO_SYNC_APP_ID` and `ZGE_PASEO_SYNC_APP_PRIVATE_KEY` as secrets, mints a repository-scoped installation token at the start of each run, and uses that short-lived token for sync pushes, pull-request automation, and divergence incident updates. No persistent installation token is stored.

## Release and relay isolation

This fork must not publish to upstream release destinations. Release workflows may create GitHub-native artifacts only in the repository where they run. Inherited external deployment paths for Cloudflare app and website deployments, Expo Android publishing, Apple signing/notarization, and relay deployment use exact-repository guards (`github.repository == 'ZGEnergy/paseo'`); those guards do not block GitHub-native release artifacts in forks. The relay implementation and its default endpoint remain unchanged.

Desktop auto-update is off in this fork. `packages/desktop/electron-builder.yml` still names `getpaseo/paseo` as its publish target, so the `app-update.yml` baked into a packaged build resolves to upstream's releases; an enabled updater would replace a fork build with an upstream one. `packages/desktop/src/features/auto-updater.ts` short-circuits the update check, the download-and-install path, and the install-on-quit path unless `PASEO_FORK_ENABLE_AUTO_UPDATE=1`. Set that variable only once this fork publishes desktop releases and `electron-builder.yml` points at them.

Build the desktop app locally with `npm run build:desktop`. macOS builds here are unsigned and unnotarized, so clear the quarantine attribute after installing: `xattr -dr com.apple.quarantine /Applications/Paseo.app`.
