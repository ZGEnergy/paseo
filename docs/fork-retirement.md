# Fork retirement

## Active capability count

**4 waiting.** No capability is `upstream-candidate`: live upstream `main` at `d636abd7a4ce302e7ccb9eb6074f637c6dd4d83b` does not yet provide every required behavior for any capability. No capability retired this period; one retired history entry exists (host KaTeX, superseded by the plugin surface).

Last reviewed: 2026-09-18

Evidence baseline:

- fork integration: `origin/internal/main` at `091ce4c16` — the docs-only ledger refresh [ZGEnergy/paseo#133](https://github.com/ZGEnergy/paseo/pull/133) (merge `091ce4c16`) landed on top of the 2026-09-18 state (downstream sync [#131](https://github.com/ZGEnergy/paseo/pull/131) at `6be25b186`, governance repair [#132](https://github.com/ZGEnergy/paseo/pull/132) at `83b867351`); no product-code delta since the sync
- fork upstream mirror: `origin/main` at `3cc4ae28664493b2f1ad75a6a6ed1d318c76e944` — fully merged into the integration branch (`merge-tree` clean, zero unintegrated commits), so no `main` → `internal/main` pull request was open, dirty, or unmergeable at review time and no resolver was needed
- upstream: `getpaseo/paseo` `main` at `d636abd7a4ce302e7ccb9eb6074f637c6dd4d83b` — four commits ahead of the mirror this review period: [getpaseo/paseo#5040](https://github.com/getpaseo/paseo/pull/5040) (subscribe only the chats this session opened), the 0.9.0-beta.2 changelog entry and release cut, and lockfile/Nix hash maintenance; none touch the four capabilities
- #5040 is the only delta commit touching a capability-adjacent path (`agent-manager.ts`); the capability sections below record the per-path verdicts
- the mirror delta is the scheduled Upstream sync workflow's to mirror and classify; its lockfile/Nix changes follow the derived-only path

## Plugin assistant-markdown surface

**Status:** `waiting`

Last reviewed: 2026-09-18

Observable behavior:

- [x] A plugin can register an assistant-markdown extension with custom block delimiters and rules via `addMarkdownExtension`; the host publishes delimiters only for parsers that install, and a throwing parser or overriding rule leaves no partial mutations.
- [x] Extension delimiters are host-scoped: markdown block splitting and per-host block height caches key on `serverId`, so two servers with different plugin catalogs render independently.
- [x] The host exposes `SvgXml` to plugin rules and `MarkdownSource` renders verbatim text (web) and view-backed children on native without nesting under `Text`.
- [x] Missing, malformed, blank, or unpublished extension metadata falls back to ordinary assistant markdown without crashing the host.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#108](https://github.com/ZGEnergy/paseo/pull/108), merge `099f9f8b2` (commit `d1a1008eb`): host `SvgXml` provision to plugin rules.
- [ZGEnergy/paseo#109](https://github.com/ZGEnergy/paseo/pull/109), merge `fe9c6897e` (commits `945b75f80`, `8af9d6b5b`, `2d28c1b94`): the assistant-markdown extension API (`addMarkdownExtension`), host-scoped delimiters, failure isolation, and the finished host-scoped plumbing.
- [ZGEnergy/paseo#111](https://github.com/ZGEnergy/paseo/pull/111), merge `b43b48410` (commits `b2709ad71`, `d09b67558`, `275b9e863`): `MarkdownSource` provided to plugins, verbatim web copy, and allowed without children.
- [ZGEnergy/paseo#110](https://github.com/ZGEnergy/paseo/pull/110), merge `7c8e3ef93` (fix commit `0e15bccdc`): retired the host KaTeX math hack in favor of this surface (see retired history).
- [ZGEnergy/paseo#115](https://github.com/ZGEnergy/paseo/pull/115), merge `2470e3ef6`: isolate markdown parser rebuild after a failed install.
- [ZGEnergy/paseo#116](https://github.com/ZGEnergy/paseo/pull/116), merge `63af4a9d0`: host native `MarkdownSource` in a View.

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) (SvgXml, head `1a1144648baae78c4484bec7bb4a5e9252ddd0d2`), [#4750](https://github.com/getpaseo/paseo/pull/4750) (assistant markdown extensions, head `15efaa1b284aa25b86428e6fe5e5ebdfc43cf2c5`), and [#4752](https://github.com/getpaseo/paseo/pull/4752) (MarkdownSource, head `bfc1e0ecdc1a65ad3e556b72db4d16390dcc2aab`) are open and unmerged as of 2026-09-18 with unchanged heads; merge order is 4749 → 4750 → 4752.
- Upstream `main` at `d636abd7a` contains no `addMarkdownExtension`, no plugin-facing `MarkdownSource` host component, and no host-provided `SvgXml` (re-verified 2026-09-18; zero `addMarkdownExtension`/`MarkdownSource` matches after the #5013 word-stream deletion removed even word-stream's internal streaming component, and the only `SvgXml` matches are internal icon/catalog components). Upstream #4675 (merge `0aca3b605`) moved streaming block promotion into `agent-stream/presentation.ts` and is compatible with, but does not provide, the extension API. The four new plugin commits in the prior review period — #4942 (host navigation), #4971 (host discovery with host-targeted SDK clients), #4972 (external links and workspace browsers), and #4970 (nested provider-subagent links) — extend plugin host integration but do not add the assistant-markdown extension surface.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-18

Observable behavior:

- [x] A parent remains non-idle while linked or snapshot-discovered children run, including an initially empty snapshot.
- [x] Provider-idle completion is bounded for silence, rejected state checks, compaction, child activity, and absolute elapsed time.
- [x] Verified terminal yields, including incremental yield frames, settle the child and deferred task card.
- [x] Interrupting a parent preserves independently live children and accepts their later progress and completion.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#25](https://github.com/ZGEnergy/paseo/pull/25), merge `8fd853918303deca0c83d50889aca4250d124391`: bounded provider-idle gate and child reconciliation (silence budget in `accrueProviderIdleSilence`).
- [ZGEnergy/paseo#29](https://github.com/ZGEnergy/paseo/pull/29), merge `20ded451f70a34bac4ef0a824bb6cb35110b4fc9`: imported child-polling baseline later integrated into the bounded gate.
- [ZGEnergy/paseo#45](https://github.com/ZGEnergy/paseo/pull/45), merge `e4ba146157d3652f2e712ea83d8776660662fde4`: verified terminal-yield settlement.
- [ZGEnergy/paseo#46](https://github.com/ZGEnergy/paseo/pull/46), merge `e12cec0f34dd01aee47cc1b85b9f817b77dbdf33`: incremental yields and interruption-safe live children.

Upstream evidence:

- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371), head `fa9fc5e6244edc3252851f3132c49b34c3f56a84`, remains closed unmerged (re-checked 2026-09-18, last update 2026-09-08) in favor of [#2777](https://github.com/getpaseo/paseo/pull/2777). That merged change aggregates native-child activity into workspace status while explicitly leaving parent lifecycle unchanged; it does not add bounded completion, yield settlement, or interruption-safe children. Yield/live follow-ups still have no dedicated upstream PR (re-checked 2026-09-18).
- Open upstream PR adjacent to this capability: [getpaseo/paseo#4977](https://github.com/getpaseo/paseo/pull/4977) "omp provider: mid-turn steering, paging drain, fast-mode passthrough, and lifecycle hardening" (head `cb82272988382ec411261e7a87b0ae63065ea2e8`, unchanged since 2026-09-17). Its diff adds OMP `steerActiveTurn` steering, request-timeout diagnostics, a paging drain with legacy fallback, and abort escalation — inspected 2026-09-17; it does not add bounded provider-idle completion, verified-yield settlement, or interruption-safe children.
- Upstream `main` at `d636abd7a` still completes from provider state alone (re-verified 2026-09-18): `completeTurnAfterProviderIdle` (providers/omp/agent.ts) polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors and an unbounded scheduler retry loop (`providerIdleScheduler.waitForRetry()`) — no silence/elapsed budget, no failure budget, no child-activity awareness — and `interrupt()` still calls `terminalizeActiveWork()`, terminalizing running children. Zero upstream commits touched `providers/omp` in the `6830c46e9..d636abd7a` delta.

## OMP Ask option descriptions

**Status:** `waiting`

Last reviewed: 2026-09-18

Observable behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options.
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options.
- [x] OMP `16.3.9` and later remain supported; description metadata does not raise the provider-wide minimum version.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`: description decoding, propagation, fallback behavior, and tests.
- [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`: restored the upstream-equivalent `16.3.9` support floor and removed the accidental fork-only version requirement.

Upstream evidence:

- [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) remains open (head `cd641993cd210a0af17034eec8d39f3736c8585f`, unchanged since 2026-09-14; re-checked 2026-09-18) and still carries the description candidate.
- Upstream `main` at `d636abd7a` retains the `16.3.9` support floor but contains no `optionDetails` decoding or propagation (re-verified 2026-09-18; zero matches in source).

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-18

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live.
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366), head `bf3820d81cc1579bc8ad4cd9721aeba972ad0b56`, remains closed unmerged (re-checked 2026-09-18, last update 2026-09-08) in favor of [#3394](https://github.com/getpaseo/paseo/pull/3394), merge `42245d139ad1f3ba93c3e691e9e0a7971169ea79`.
- Upstream active-turn steering (commit `f9e1def954550ec50c45ffa435f5fe1d57fc48f3`) and archive-continuation (commit `613cbbe9ef7b461bdd7e859cf2303598100ad924`) cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- Adjacent open upstream PRs, none merged and none carrying the missing behaviors as of 2026-09-18: [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) (head `1549ea566e16c31d92e86bfe91b8645b80e65d5b`, unchanged since 2026-09-11), [getpaseo/paseo#4633](https://github.com/getpaseo/paseo/pull/4633) (head `1132cdb0e6e50f4780c8c69e68c9c11e8500ef7b`, unchanged since 2026-09-10), [getpaseo/paseo#5022](https://github.com/getpaseo/paseo/pull/5022) "fix: queue follow-ups when providers cannot steer" (head `e9692f7f3`, opened 2026-09-17; app-side composer/session-store queueing of follow-ups, not provider-level admission or background-child survival), and [getpaseo/paseo#5026](https://github.com/getpaseo/paseo/pull/5026) "feat(server): surface Muse subagents in the subagents track" (head `3bb630229`, opened 2026-09-17; a new Muse provider and track UI, not lifecycle correctness). Leftover-turn settlement still has no dedicated upstream PR.
- Upstream `main` at `d636abd7a` (re-verified 2026-09-18) routes `task_notification` through `appendTaskNotificationEvents` (providers/claude/agent.ts), which appends provider-subagent/timeline events only and never settles a leftover autonomous turn; `steerOrReplaceActiveTurn` in packages/server/src/server/agent/agent-manager.ts (the 2026-09-17 entry wrongly cited providers/claude/agent.ts for this call site) still falls back to `replaceAdmittedForegroundTurn` when provider steering is unavailable, so follow-up admission still replaces the turn and a compatible background child neither keeps the parent admitted nor blocks replacement. Zero upstream commits touched `providers/claude` in the `6830c46e9..d636abd7a` delta; the only `agent-manager.ts` change in that range is #5040's attention/registration plumbing (`extractAttention` import, exported `AttentionState` type, an `attention` register option, `restoring` flags) — inspected 2026-09-18, no prompt-admission, settlement, or background-child change.

## Retired history

### Host LaTeX / KaTeX assistant-message rendering

**Status:** retired (superseded) on 2026-09-11 by [ZGEnergy/paseo#110](https://github.com/ZGEnergy/paseo/pull/110).

The fork removed the host math parser, KaTeX renderer, native fallback, and their tests. Formula rendering is now expected to arrive as a plugin through the assistant-markdown surface (capability 1 above), not as fork product behavior. Historical fork implementation: [#6](https://github.com/ZGEnergy/paseo/pull/6) (merge `79e27189c`), [#21](https://github.com/ZGEnergy/paseo/pull/21) (merge `db0df810`), [#28](https://github.com/ZGEnergy/paseo/pull/28) (merge `6574593b`); upstream candidate [getpaseo/paseo#2562](https://github.com/getpaseo/paseo/pull/2562) was closed unmerged in favor of a timeline-plugin approach. This entry is history only — do not restore host math as an active capability.

## Excluded fork operations

These keep the fork safe and maintainable but do not count as product-capability retirement blockers:

- fork governance, provenance, sync workflows, ship gate, and `.claude/handoffs/`
- local fork-daemon upgrade plus systemd and safety fixes
- desktop auto-update isolation and local desktop signing
- fork onboarding and release or deploy isolation
- derived Nix hash maintenance, Nix and `node-pty` packaging, and test-only stabilization
