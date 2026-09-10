# Fork retirement

## Active capability count

**4 waiting.** No capability is `upstream-candidate`: live upstream `main` at `d7c7044dfc91d1d18721dc8757ac3bb913d8c232` does not provide every required behavior for any capability. No capability is retired.

Last reviewed: 2026-09-10

Evidence baseline:

- fork integration: `origin/internal/main` at `5ae0651c8ffb05b96e4af554e738cb207db1d701`
- fork upstream mirror: `origin/main` at `92504cd525c7e594539a369ed441eb836372dd2d`
- upstream: `getpaseo/paseo` `main` at `d7c7044dfc91d1d18721dc8757ac3bb913d8c232`
- review-period fork merge [#97](https://github.com/ZGEnergy/paseo/pull/97) refreshed this ledger only; no new downstream product capability landed

## LaTeX assistant-message rendering

**Status:** `waiting`

Last reviewed: 2026-09-10

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

- [getpaseo/paseo#2562](https://github.com/getpaseo/paseo/pull/2562), inspected head `e784d3b91a63add5a8fa3889e282d35da86e7c78`, closed unmerged in favor of a timeline-plugin approach that does not provide built-in assistant-message rendering.
- [ekalvi/paseo#1](https://github.com/ekalvi/paseo/pull/1), inspected head `51505218784075ceb73d59408ee78305c02ca1b0`, remains open atop the closed rendering candidate and supplies inherited-color handling.
- Upstream `main` contains no corresponding math parser, renderer, native fallback, KaTeX dependency, or focused tests at `d7c7044dfc91d1d18721dc8757ac3bb913d8c232`.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-10

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

- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371), inspected head `fa9fc5e6244edc3252851f3132c49b34c3f56a84`, closed unmerged in favor of [#2777](https://github.com/getpaseo/paseo/pull/2777). That merged change aggregates native-child activity into workspace status while explicitly leaving parent lifecycle unchanged; it does not add bounded completion, yield settlement, or interruption-safe children.
- Upstream `main` still completes from provider state alone with an unbounded retry loop and terminalizes running children on interruption at `d7c7044dfc91d1d18721dc8757ac3bb913d8c232`.

## OMP Ask option descriptions

**Status:** `waiting`

Last reviewed: 2026-09-10

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
- Upstream `main` already retains the `16.3.9` support floor but contains no `optionDetails` decoding or propagation at `d7c7044dfc91d1d18721dc8757ac3bb913d8c232`.

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-10

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live.
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366), inspected head `bf3820d81cc1579bc8ad4cd9721aeba972ad0b56`, closed unmerged in favor of [#3394](https://github.com/getpaseo/paseo/pull/3394), merge `42245d139ad1f3ba93c3e691e9e0a7971169ea79`.
- Upstream active-turn steering, commit `f9e1def954550ec50c45ffa435f5fe1d57fc48f3`, and archive-continuation commit `613cbbe9ef7b461bdd7e859cf2303598100ad924` cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- No dedicated upstream pull request or equivalent `main` implementation covers leftover task-protocol settlement at `d7c7044dfc91d1d18721dc8757ac3bb913d8c232`.

## Retired history

None.

## Excluded fork operations

These keep the fork safe and maintainable but do not count as product-capability retirement blockers:

- fork governance, provenance, sync workflows, ship gate, and `.claude/handoffs/`
- local fork-daemon upgrade plus systemd and safety fixes
- desktop auto-update isolation and local desktop signing
- fork onboarding and release or deploy isolation
- derived Nix hash maintenance, Nix and `node-pty` packaging, and test-only stabilization
