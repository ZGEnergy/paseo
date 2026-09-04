# Fork retirement

Last reviewed: 2026-09-04

Evidence baseline:

- fork integration: `origin/internal/main` at `e1e99dfe3975b085a1a99b9b34dbc91a82ba07db`
- fork upstream mirror: `origin/main` at `92442e743517cb4f1c304967bd79e2b9401a6ba6`
- upstream: `getpaseo/paseo` `main` at `140b0bb716205cf0e00c0ff5b6b3c20af6c79413`

## Active capability count

**4 waiting.** No capability is `upstream-candidate`: each named upstream pull request remains absent from upstream `main`. No capability is retired.

## LaTeX assistant-message rendering

**Status:** `waiting`

Last reviewed: 2026-09-04

Observable behavior:

- [x] Assistant messages parse inline, display, fenced, and streamed math without treating currency, code, escaped delimiters, or incomplete input as formulas.
- [x] Web and Electron render accessible KaTeX and show malformed input as readable source.
- [x] Native renders readable selectable source instead of failing.
- [x] Math inherits readable theme and blockquote text color.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#6](https://github.com/ZGEnergy/paseo/pull/6), merge `79e27189c7eda9315d30bd44690ac032b3832e05`: parser, streaming protection, web renderer, native fallback, and tests.
- [ZGEnergy/paseo#21](https://github.com/ZGEnergy/paseo/pull/21), merge `db0df8107ae90ac5ba495c79286d9c83b1cadcc4`: import verification and provenance follow-up; no additional runtime behavior.
- [ZGEnergy/paseo#28](https://github.com/ZGEnergy/paseo/pull/28), merge `6574593b878faafb60eef094b3651bdf854ad064`: inherited theme and blockquote color with focused tests.

Upstream evidence:

- [getpaseo/paseo#2562](https://github.com/getpaseo/paseo/pull/2562), inspected head `e784d3b91a63add5a8fa3889e282d35da86e7c78`, remains open and supplies the base parser/rendering candidate.
- [ekalvi/paseo#1](https://github.com/ekalvi/paseo/pull/1), inspected head `51505218784075ceb73d59408ee78305c02ca1b0`, remains open and supplies the inherited-color candidate.
- Upstream `main` contains no corresponding math parser, renderer, native fallback, KaTeX dependency, or focused tests at the reviewed SHA.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-04

Observable behavior:

- [x] A parent remains non-idle while linked or snapshot-discovered children run, including an initially empty snapshot.
- [x] Provider-idle completion is bounded for silence, rejected state checks, compaction, child activity, and absolute elapsed time.
- [x] Verified terminal yields, including incremental yield frames, settle the child and deferred task card.
- [x] Interrupting a parent preserves independently live children and accepts their later progress and completion.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#25](https://github.com/ZGEnergy/paseo/pull/25), merge `8fd853918303deca0c83d50889aca4250d124391`: bounded provider-idle gate and child reconciliation.
- [ZGEnergy/paseo#29](https://github.com/ZGEnergy/paseo/pull/29), merge `20ded451f70a34bac4ef0a824bb6cb35110b4fc9`: imported child-polling baseline later integrated into the bounded gate.
- [ZGEnergy/paseo#45](https://github.com/ZGEnergy/paseo/pull/45), merge `e4ba146157d3652f2e712ea83d8776660662fde4`: verified terminal-yield settlement.
- [ZGEnergy/paseo#46](https://github.com/ZGEnergy/paseo/pull/46), merge `e12cec0f34dd01aee47cc1b85b9f817b77dbdf33`: incremental yields and interruption-safe live children.

Upstream evidence:

- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371), inspected head `fa9fc5e6244edc3252851f3132c49b34c3f56a84`, remains open. It supplies an earlier child-polling baseline but not the fork's bounded completion, verified incremental-yield settlement, or interruption-safe child behavior.
- Upstream `main` still completes from provider state alone with an unbounded retry loop and terminalizes running children on interruption at the reviewed SHA.

## OMP Ask option descriptions

**Status:** `waiting`

Last reviewed: 2026-09-04

Observable behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options.
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options.
- [x] OMP `16.3.9` and later remain supported; description metadata does not raise the provider-wide minimum version.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`: description decoding, propagation, fallback behavior, and tests.
- [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`: restored the upstream-equivalent `16.3.9` support floor and removed the accidental fork-only version requirement.

Upstream evidence:

- [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628), inspected head `b1f831e5dc4b148a44135f0b44c3b7afe7c8411c`, remains open and carries the description candidate.
- Upstream `main` already retains the `16.3.9` support floor but contains no `optionDetails` decoding or propagation at the reviewed SHA.

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-04

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live.
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366), inspected head `bf3820d81cc1579bc8ad4cd9721aeba972ad0b56`, remains open and carries the background-child prompt candidate.
- Upstream commits `403a32ad9f38933e5a8f38fe77f9aa787e9d39c8` and `f9e1def954550ec50c45ffa435f5fe1d57fc48f3` cover explicit autonomous steering and stale interrupt-window frames. They do not replace ordinary follow-up admission or completed task-notification settlement.
- No dedicated upstream pull request or equivalent `main` implementation covers leftover task-protocol settlement at the reviewed SHA.

## Retired history

None.

## Excluded fork operations

These keep the fork safe and maintainable but do not count as product-capability retirement blockers:

- fork governance, provenance, sync workflows, ship gate, and `.claude/handoffs/`
- local fork-daemon upgrade plus systemd and safety fixes
- desktop auto-update isolation and local desktop signing
- fork onboarding and release or deploy isolation
- derived Nix hash maintenance, Nix and `node-pty` packaging, and test-only stabilization
