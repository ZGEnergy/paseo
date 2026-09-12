# Fork retirement

## Active capability count

**4 waiting.** No capability is `upstream-candidate`. No capability is `retired`. Host LaTeX
rendering is **superseded** (see history) and is not one of the four.

Last reviewed: 2026-09-12

The four waiting capabilities are:

1. Plugin assistant-markdown surface
2. OMP task and subagent lifecycle correctness
3. OMP Ask option descriptions
4. Claude background and autonomous subagent lifecycle correctness

Evidence baseline:

- fork integration: `origin/internal/main` at `2470e3ef6b9c41382f8de3a7143305b52ff5cd72`
- fork upstream mirror: `origin/main` at `fa93c4290eaa87ae58452ab6e2012f85ae6e0c6b`
- upstream: `getpaseo/paseo` `main` at `d1b705a0cd91617a5707fae25d80cb0be3057950`
- review-period fork merges [#115](https://github.com/ZGEnergy/paseo/pull/115) (parser rebuild isolation) and [#116](https://github.com/ZGEnergy/paseo/pull/116) (native `MarkdownSource` hosting) extend capability 1; [#117](https://github.com/ZGEnergy/paseo/pull/117) (ledger replacement), [#112](https://github.com/ZGEnergy/paseo/pull/112) (Nix hash), and [#113](https://github.com/ZGEnergy/paseo/pull/113) (daemon-upgrade docs) land no product capability; open sync PR [#114](https://github.com/ZGEnergy/paseo/pull/114) is mergeable and carries none
- the fork upstream mirror moved from `f22a37e613` to `fa93c4290` (upstream changelog commits), and upstream `main` advanced 6 commits to `d1b705a0c` (Android clipboard pasting #4758, rejected-plan collapse #4756, timeline recovery #4737, Cursor thinking options #4180, incomplete-Markdown streaming #4742, archived Codex workspaces #4736 — none touch the four capabilities below)

## Plugin assistant-markdown surface

**Status:** `waiting`

Last reviewed: 2026-09-12

What this is: the host exposes `SvgXml`, `addMarkdownExtension`, and `MarkdownSource` so a plugin
can extend the assistant markdown row without forking the renderer. Formula rendering is a plugin,
not a fork product feature.

What we are waiting for: those three APIs on getpaseo `main`.

Observable behavior:

- [x] Plugins import `SvgXml` from `@getpaseo/plugin/client/react-native`. The host supplies it; a plugin bundle cannot import `react-native-svg`.
- [x] Plugins call `addMarkdownExtension({ id, parser?, rules?, blockDelimiters? })`. The host still renders the assistant row (anchors, file links, images, selection, streaming).
- [x] A throwing parser or render rule loses only that extension, and a parser that throws while being rebuilt is dropped with its mutations discarded instead of escaping.
- [x] `MarkdownSource` copies as its `source` on a web drag selection, for inline and display placements.
- [x] Native `MarkdownSource` is a `View`, so view-backed children such as `SvgXml` are not nested under `Text` on iOS and Android.
- [ ] Upstream `main` provides `SvgXml`, `addMarkdownExtension`, and `MarkdownSource`.

Fork evidence:

- [ZGEnergy/paseo#108](https://github.com/ZGEnergy/paseo/pull/108), merge `099f9f8b22baa7f62d054d56f28524be7f8fe415`: host `SvgXml`.
- [ZGEnergy/paseo#109](https://github.com/ZGEnergy/paseo/pull/109), merge `fe9c6897e672412646651405edbd1ba277b7febc`: `addMarkdownExtension`.
- [ZGEnergy/paseo#111](https://github.com/ZGEnergy/paseo/pull/111), merge `b43b4841009ec7308b79361c43ca7caec90a7765`: `MarkdownSource` and web copy-source.
- [ZGEnergy/paseo#115](https://github.com/ZGEnergy/paseo/pull/115), merge `2470e3ef6b9c41382f8de3a7143305b52ff5cd72`: rebuild-throw isolation — a parser that throws while rebuilding is dropped and its mutations discarded.
- [ZGEnergy/paseo#116](https://github.com/ZGEnergy/paseo/pull/116), merge `63af4a9d0506bf167b417001f067fef88211fbf9`: native `MarkdownSource` hosted in a `View` so view-backed children are safe.

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) `SvgXml`, open, head `1a1144648baae78c4484bec7bb4a5e9252ddd0d2` (2026-09-12).
- [getpaseo/paseo#4750](https://github.com/getpaseo/paseo/pull/4750) `addMarkdownExtension`, open, head `15efaa1b284aa25b86428e6fe5e5ebdfc43cf2c5` (2026-09-12), stacked on 4749.
- [getpaseo/paseo#4752](https://github.com/getpaseo/paseo/pull/4752) `MarkdownSource`, open, head `bfc1e0ecdc1a65ad3e556b72db4d16390dcc2aab` (2026-09-12), stacked on 4750.
- Merge order is 4749, then 4750, then 4752. None of these add a formula renderer to core.
- Upstream `main` contains no `SvgXml`, `addMarkdownExtension`, or `MarkdownSource` at `d1b705a0cd91617a5707fae25d80cb0be3057950` (re-verified 2026-09-12; zero matches across `packages/app/src` and `packages/plugin`).
- [getpaseo/paseo#2562](https://github.com/getpaseo/paseo/pull/2562) is closed and is not a candidate for this capability.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-12

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
- Upstream `main` still completes from provider state alone at `d1b705a0cd91617a5707fae25d80cb0be3057950` (re-verified 2026-09-12): `completeTurnAfterProviderIdle` polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors, a fixed scheduler retry, and no elapsed-time or failure budget, and no child-activity awareness; interruption still terminalizes running children.

## OMP Ask option descriptions

**Status:** `waiting`

Last reviewed: 2026-09-12

Observable behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options.
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options.
- [x] OMP `16.3.9` and later remain supported; description metadata does not raise the provider-wide minimum version.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`: description decoding, propagation, fallback behavior, and tests.
- [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`: restored the upstream-equivalent `16.3.9` support floor and removed the accidental fork-only version requirement.

Upstream evidence:

- [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628), open, current head `f8e7b93dae7c143d17342c2e4ef8f779a4bfc007` (updated 2026-09-11; the head moved after the previous snapshot, so the earlier "unchanged since 2026-08-27" note no longer holds). The diff still carries the description candidate — `readSelectOptions(options, optionDetails)` with malformed/blank/extra fallback tests — over the same files as the fork implementation (`omp/agent.ts`, `omp/rpc-types.ts`).
- Upstream `main` already retains the `16.3.9` support floor but contains no `optionDetails` decoding or propagation at `d1b705a0cd91617a5707fae25d80cb0be3057950` (re-verified 2026-09-12; zero matches).

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-12

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live (`hasBlockingRun`, `acceptsPromptDuringAutonomousTurn`).
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes (`hasRunningTasks`).

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366), inspected head `bf3820d81cc1579bc8ad4cd9721aeba972ad0b56`, closed unmerged in favor of [#3394](https://github.com/getpaseo/paseo/pull/3394), merge `42245d139ad1f3ba93c3e691e9e0a7971169ea79`.
- Upstream active-turn steering, commit `f9e1def954550ec50c45ffa435f5fe1d57fc48f3`, and archive-continuation commit `613cbbe9ef7b461bdd7e859cf2303598100ad924` cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- Open upstream PRs adjacent to this capability, neither merged as of 2026-09-12: [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) "claude: spare background subagents from an interrupt, and let one be stopped", head now `1549ea566e16c31d92e86bfe91b8645b80e65d5b` (updated 2026-09-11); it spares children from interrupts and adds a stop control, leaves a child's settlement to its own terminal status, and does not touch the prompt-admission gate (`agent-prompt.ts` and `agent-run-state.ts` are absent from its diff). [getpaseo/paseo#4633](https://github.com/getpaseo/paseo/pull/4633) "fix(server): forward steerActiveTurn through wrapSessionProvider" (head `1132cdb0e6e50f4780c8c69e68c9c11e8500ef7b`) remains open and unchanged.
- Upstream `main` at `d1b705a0cd91617a5707fae25d80cb0be3057950` (re-verified 2026-09-12) routes `task_notification` through `appendTaskNotificationEvents`, which appends provider-subagent timeline events only and never settles a leftover autonomous turn; replacement prompts still gate on `hasInFlightRun` with no `acceptsPromptDuringAutonomousTurn` and no autonomous-run supersession settlement, so a compatible background child neither keeps the parent admitted nor blocks replacement.

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
