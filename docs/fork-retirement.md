# Fork retirement

## Active capability count

**4 waiting.** No capability is `upstream-candidate`. No capability is `retired`. Host LaTeX
rendering is **superseded** (see history) and is not one of the four.

Last reviewed: 2026-09-11 (OMP / Ask / Claude unchanged). Plugin-surface replacement: 2026-09-11.

The four waiting capabilities are:

1. Plugin assistant-markdown surface
2. OMP task and subagent lifecycle correctness
3. OMP Ask option descriptions
4. Claude background and autonomous subagent lifecycle correctness

Evidence baseline:

- fork integration: `origin/internal/main` at `1d38366aa5c3362e8f6802c12843730895877716`
- fork upstream mirror: `origin/main` at `fa93c4290eaa87ae58452ab6e2012f85ae6e0c6b`
- upstream: `getpaseo/paseo` `main` at `fa93c4290eaa87ae58452ab6e2012f85ae6e0c6b`
- capability 1 is no longer host KaTeX. The fork removed that path in [#110](https://github.com/ZGEnergy/paseo/pull/110) and replaced it with host plugin APIs in [#108](https://github.com/ZGEnergy/paseo/pull/108), [#109](https://github.com/ZGEnergy/paseo/pull/109), and [#111](https://github.com/ZGEnergy/paseo/pull/111). Do not treat [getpaseo/paseo#2562](https://github.com/getpaseo/paseo/pull/2562) as an upstream candidate.

## Plugin assistant-markdown surface

**Status:** `waiting`

Last reviewed: 2026-09-11

What this is: the host exposes `SvgXml`, `addMarkdownExtension`, and `MarkdownSource` so a plugin
can extend the assistant markdown row without forking the renderer. Formula rendering is a plugin,
not a fork product feature.

What we are waiting for: those three APIs on getpaseo `main`.

Observable behavior:

- [x] Plugins import `SvgXml` from `@getpaseo/plugin/client/react-native`. The host supplies it; a plugin bundle cannot import `react-native-svg`.
- [x] Plugins call `addMarkdownExtension({ id, parser?, rules?, blockDelimiters? })`. The host still renders the assistant row (anchors, file links, images, selection, streaming).
- [x] A throwing parser or render rule loses only that extension.
- [x] `MarkdownSource` makes a text-free drawing copy as `source` on a web drag selection.
- [ ] Upstream `main` provides `SvgXml`, `addMarkdownExtension`, and `MarkdownSource`.

Fork evidence:

- [ZGEnergy/paseo#108](https://github.com/ZGEnergy/paseo/pull/108), merge `099f9f8b22baa7f62d054d56f28524be7f8fe415`: host `SvgXml`.
- [ZGEnergy/paseo#109](https://github.com/ZGEnergy/paseo/pull/109), merge `fe9c6897e672412646651405edbd1ba277b7febc`: `addMarkdownExtension`.
- [ZGEnergy/paseo#111](https://github.com/ZGEnergy/paseo/pull/111), merge `b43b4841009ec7308b79361c43ca7caec90a7765`: `MarkdownSource` and web copy-source.
- [ZGEnergy/paseo#115](https://github.com/ZGEnergy/paseo/pull/115): open follow-up so a parser that throws on rebuild is dropped instead of escaping.

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) `SvgXml`, open.
- [getpaseo/paseo#4750](https://github.com/getpaseo/paseo/pull/4750) `addMarkdownExtension`, open, stacked on 4749.
- [getpaseo/paseo#4752](https://github.com/getpaseo/paseo/pull/4752) `MarkdownSource`, open, stacked on 4750.
- Merge order is 4749, then 4750, then 4752. None of these add a formula renderer to core.
- [getpaseo/paseo#2562](https://github.com/getpaseo/paseo/pull/2562) is closed and is not a candidate for this capability.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-11

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
- Upstream `main` still completes from provider state alone at `f22a37e613e965c8ebc02e1f5565e21fd72eaf2f` (re-verified 2026-09-11): `completeTurnAfterProviderIdle` polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors, a fixed scheduler retry, and no elapsed-time or failure budget, and no child-activity awareness; interruption still terminalizes running children.

## OMP Ask option descriptions

**Status:** `waiting`

Last reviewed: 2026-09-11

Observable behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options.
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options.
- [x] OMP `16.3.9` and later remain supported; description metadata does not raise the provider-wide minimum version.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`: description decoding, propagation, fallback behavior, and tests.
- [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`: restored the upstream-equivalent `16.3.9` support floor and removed the accidental fork-only version requirement.

Upstream evidence:

- [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628), inspected head `b1f831e5dc4b148a44135f0b44c3b7afe7c8411c`, remains open (unchanged since 2026-08-27) and carries the description candidate.
- Upstream `main` already retains the `16.3.9` support floor but contains no `optionDetails` decoding or propagation at `f22a37e613e965c8ebc02e1f5565e21fd72eaf2f` (re-verified 2026-09-11; zero matches).

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-11

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
- New open upstream PRs adjacent to this capability, neither merged and neither carrying the missing behaviors as of 2026-09-11: [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) "claude: spare background subagents from an interrupt, and let one be stopped" (head `49b03bcd23d56e4119e3b8f56e89a0b7214574f6`) and [getpaseo/paseo#4633](https://github.com/getpaseo/paseo/pull/4633) "fix(server): forward steerActiveTurn through wrapSessionProvider" (head `1132cdb0e6e50f4780c8c69e68c9c11e8500ef7b`).
- Upstream `main` at `f22a37e613e965c8ebc02e1f5565e21fd72eaf2f` (re-verified 2026-09-11) routes `task_notification` through `appendTaskNotificationEvents`, which appends provider-subagent events only and never settles a leftover autonomous turn; `steerActiveTurn` returns `unavailable` without a live foreground stream, so follow-up admission still replaces the turn and a compatible background child neither keeps the parent admitted nor blocks replacement.

## Retired history

### Host LaTeX assistant-message rendering

**Status:** superseded 2026-09-11. Not `retired` (upstream never shipped it) and not `waiting`.

The fork removed the host KaTeX path in [ZGEnergy/paseo#110](https://github.com/ZGEnergy/paseo/pull/110), merge `7c8e3ef939795f4eb7afd00b9855018d2566e4da`. Formula rendering is a plugin. Do not restore this as an active capability. Do not wait on [getpaseo/paseo#2562](https://github.com/getpaseo/paseo/pull/2562) or [ekalvi/paseo#1](https://github.com/ekalvi/paseo/pull/1). The replacement is the plugin assistant-markdown surface.

Prior fork evidence, kept only as history: [#6](https://github.com/ZGEnergy/paseo/pull/6), [#21](https://github.com/ZGEnergy/paseo/pull/21), [#28](https://github.com/ZGEnergy/paseo/pull/28).

## Excluded fork operations

These keep the fork safe and maintainable but do not count as product-capability retirement blockers:

- fork governance, provenance, sync workflows, ship gate, and `.claude/handoffs/`
- local fork-daemon upgrade plus systemd and safety fixes
- desktop auto-update isolation and local desktop signing
- fork onboarding and release or deploy isolation
- derived Nix hash maintenance, Nix and `node-pty` packaging, and test-only stabilization
