# Fork retirement

## Active capability count

**4 waiting.** No capability is `upstream-candidate`: live upstream `main` at `c356394bfa127832350c0535d32f5511bc86523c` does not yet provide every required behavior for any capability. No capability retired this period; one retired history entry exists (host KaTeX, superseded by the plugin surface).

Last reviewed: 2026-09-24

Evidence baseline:

- fork integration: `origin/internal/main` at `910c06838` — the 2026-09-23 state plus [ZGEnergy/paseo#147](https://github.com/ZGEnergy/paseo/pull/147) (nix daemon runner resolve; excluded operations, not a capability). The 2026-09-24 downstream sync [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, two-parent merge: first parent `910c06838`, second parent `c356394bf` = live `main`) resolves the conflicting auto sync [ZGEnergy/paseo#149](https://github.com/ZGEnergy/paseo/pull/149); it adopts upstream's OMP aborted-turn classification (#5243) and deferred custom-message completion (#3258) into the fork's bounded provider-idle gate, adopts upstream's boot-instant PID-lock ownership (#5277) and empty-lock tolerance (#5306), and removes the fork's duplicate `holdStateChecks` fake-OMP mechanism in favor of upstream's `holdStateRequests()`. All four capability implementations survive the merge.
- fork upstream mirror: `origin/main` at `c356394bf` — fast-forwarded from `290306fd1` (39 commits: Stop settles an agent whose Pi/OMP runtime exited [#5235](https://github.com/getpaseo/paseo/pull/5235), OMP stopped turn reported as canceled [#5243](https://github.com/getpaseo/paseo/pull/5243), OMP waits for the terminal event after custom messages ([#3258](https://github.com/getpaseo/paseo/pull/3258)), Claude rewind hardening (#5285, #5289), slash commands as the last content block (#5240), plugin subprocess reload crash (#5231) and plugin stop-after-agent-close (#5253), OpenCode permission rules (#5296), daemon start fixes for stale PID/schedule/empty-lock states (#5277, #5301, #5306), boot-instant PID-lock ownership, keyboard shortcuts (#5224, #5255, #5272, #5287), Codex approvals (#5239), and release/config housekeeping (#5315, #5310, #5305)).
- upstream: `getpaseo/paseo` `main` at `c356394bf` — every capability verdict below was re-verified against this exact tree on 2026-09-24 (zero `addMarkdownExtension`, zero plugin-facing `MarkdownSource`, `SvgXml` still internal icon/catalog use only, zero `optionDetails`; `completeTurnAfterProviderIdle` still completes from provider state alone with an unbounded `providerIdleScheduler.waitForRetry()` retry at `packages/server/src/server/agent/providers/omp/agent.ts:2190` and `interrupt()` still calls `terminalizeActiveWork()` at line 1132; `appendTaskNotificationEvents` (defined at `providers/claude/agent.ts:4336`) still appends events only; `steerOrReplaceActiveTurn` in `agent-manager.ts` still falls back to `replaceAdmittedForegroundTurn` at line 2761).

## Plugin assistant-markdown surface

**Status:** `waiting`

Last reviewed: 2026-09-24

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
- [ZGEnergy/paseo#142](https://github.com/ZGEnergy/paseo/pull/142), merge `f16c1da93` (head `af0660fcf`, 2026-09-22 downstream sync): kept this surface in full while adopting upstream's link-reference folding; extension-delimited blocks are excluded from folding and a delimiter-catalog revision re-splits cached rows.
- [ZGEnergy/paseo#145](https://github.com/ZGEnergy/paseo/pull/145), PR merge `0c283f96c` (head `08335b40e`, 2026-09-23 downstream sync): kept the plugin SDK's markdown dependency declarations under upstream's 0.9.1 version alignment.
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): no conflicts touched this surface; the extension API, host-scoped registry, and plugin SDK markdown dependencies are unchanged on the merged tree.

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) (SvgXml, head `1a1144648baae78c4484bec7bb4a5e9252ddd0d2`), [#4750](https://github.com/getpaseo/paseo/pull/4750) (assistant markdown extensions, head `15efaa1b284aa25b86428e6fe5e5ebdfc43cf2c5`), and [#4752](https://github.com/getpaseo/paseo/pull/4752) (MarkdownSource, head `bfc1e0ecdc1a65ad3e556b72db4d16390dcc2aab`) are open and unmerged as of 2026-09-24 with unchanged heads (last updates 2026-09-12); merge order is 4749 → 4750 → 4752.
- Upstream `main` at `c356394bf` contains no `addMarkdownExtension`, no plugin-facing `MarkdownSource` host component, and no host-provided `SvgXml` (re-verified 2026-09-24). Upstream's plugin work this period — plugin subprocess reload crash fix (#5231), stop-after-agent-close (#5253), plugin provider request-failure crash fix (#5298) — hardens the plugin runtime but does not provide the extension API.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-24

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
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): adopted upstream's aborted-terminal-response classification (#5243) inside the fork's `completeTurn` — the `turn_canceled` path keeps the fork's `terminalizeSubagents: false` sparing so live children survive a user Stop — and upstream's deferred completion after custom messages (#3258), which now flows through the fork's bounded gate. Upstream's unbounded retry loop was replaced by the fork's bounded scheduler, which subsumes upstream's interrupt-race re-check via ownership re-checks at completion and at the retry decision. Upstream's `holdStateRequests()` test helper replaced the fork's duplicate. All 78 OMP provider tests (fork gate/bounded-completion suites plus upstream's new aborted-turn suites) pass on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371), head `fa9fc5e6244edc3252851f3132c49b34c3f56a84`, remains closed unmerged (re-checked 2026-09-24, last update 2026-09-08) in favor of [#2777](https://github.com/getpaseo/paseo/pull/2777). That merged change aggregates native-child activity into workspace status while explicitly leaving parent lifecycle unchanged; it does not add bounded completion, yield settlement, or interruption-safe children. Yield/live follow-ups still have no dedicated upstream PR (re-checked 2026-09-24).
- Open upstream PR adjacent to this capability: [getpaseo/paseo#4977](https://github.com/getpaseo/paseo/pull/4977) "omp provider: mid-turn steering, paging drain, fast-mode passthrough, and lifecycle hardening" (head `cb82272988382ec411261e7a87b0ae63065ea2e8`, unchanged since 2026-09-17, re-checked 2026-09-24). Its diff adds OMP `steerActiveTurn` steering, request-timeout diagnostics, a paging drain with legacy fallback, and abort escalation — it does not add bounded provider-idle completion, verified-yield settlement, or interruption-safe children.
- Upstream `main` at `c356394bf` still completes from provider state alone (re-verified 2026-09-24): `completeTurnAfterProviderIdle` polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors and an unbounded scheduler retry loop (`providerIdleScheduler.waitForRetry()` at `providers/omp/agent.ts:2190`) — no silence/elapsed budget, no failure budget, no child-activity awareness — and `interrupt()` still calls `terminalizeActiveWork()` (line 1132), terminalizing running children. Upstream's new OMP work this period does not close the gap: #5243 adds an interrupt-race re-check inside the loop and classifies a stopped turn as canceled (error reporting and stop-path), #3258 defers completion until the terminal event after custom messages (completion timing), and #5235 settles a Stop when the runtime process has already exited (stop path).

## OMP Ask option descriptions

**Status:** `waiting`

Last reviewed: 2026-09-24

Observable behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options.
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options.
- [x] OMP `16.3.9` and later remain supported; description metadata does not raise the provider-wide minimum version.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`: description decoding, propagation, fallback behavior, and tests.
- [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`: restored the upstream-equivalent `16.3.9` support floor and removed the accidental fork-only version requirement.
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): no conflicts touched this surface; the decoding/propagation path is unchanged on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) remains open (head `cd641993cd210a0af17034eec8d39f3736c8585f`, unchanged since 2026-09-14; re-checked 2026-09-24 — still the `optionDetails` decoding candidate with malformed/blank fallbacks) and still carries the description candidate.
- Upstream `main` at `c356394bf` retains the `16.3.9` support floor but contains no `optionDetails` decoding or propagation (re-verified 2026-09-24; zero matches in source, including the select-option reader path).
- Adjacent but distinct: [getpaseo/paseo#5336](https://github.com/getpaseo/paseo/pull/5336) "Show Claude option previews in the question card" (head `446191a02`, opened 2026-09-24) renders option previews app-side for Claude providers; it is not the OMP `optionDetails` decode/propagate behavior and is open, not merged.

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-24

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live.
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes.
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): the auto-merged upstream changes to `providers/claude/agent.ts` and `agent-manager.ts` are rewind-anchoring (#5285, #5289), slash-command ordering (#5240), and timeline hydration (#5286) work; the fork's admission and leftover-turn settlement paths are unchanged on the merged tree and all focused Claude/agent-manager tests pass.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366), head `bf3820d81cc1579bc8ad4cd9721aeba972ad0b56`, remains closed unmerged (re-checked 2026-09-24, last update 2026-09-08) in favor of [#3394](https://github.com/getpaseo/paseo/pull/3394), merge `42245d139ad1f3ba93c3e691e9e0a7971169ea79`.
- Upstream active-turn steering (commit `f9e1def954550ec50c45ffa435f5fe1d57fc48f3`) and archive-continuation (commit `613cbbe9ef7b461bdd7e859cf2303598100ad924`) cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- Adjacent open upstream PRs, none merged and none carrying the missing behaviors (re-checked 2026-09-24): [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) (head `1549ea566e16c31d92e86bfe91b8645b80e65d5b`, unchanged since 2026-09-11; still the "spare background subagents from an interrupt, and let one be stopped" stop-control candidate), [getpaseo/paseo#4633](https://github.com/getpaseo/paseo/pull/4633) (head `1132cdb0e6e50f4780c8c69e68c9c11e8500ef7b`, unchanged since 2026-09-10), [getpaseo/paseo#5022](https://github.com/getpaseo/paseo/pull/5022) "fix: queue follow-ups when providers cannot steer" (head `e9692f7f3`, unchanged since 2026-09-17; app-side composer/session-store queueing of follow-ups, not provider-level admission).
- Upstream `main` at `c356394bf` (re-verified 2026-09-24) routes `task_notification` through `appendTaskNotificationEvents` (`providers/claude/agent.ts:4336`), which appends provider-subagent/timeline events only and never settles a leftover autonomous turn; `steerOrReplaceActiveTurn` in `agent-manager.ts` still falls back to `replaceAdmittedForegroundTurn` when provider steering is unavailable (line 2761), so follow-up admission still replaces the turn and a compatible background child neither keeps the parent admitted nor blocks replacement. The upstream commits this period do not touch `providers/claude` lifecycle admission or settlement (rewind anchoring #5285/#5289 and slash-command ordering #5240 are conversation-history work; #5206 adds structured launch arguments).

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

This period's excluded-operations landings: [ZGEnergy/paseo#147](https://github.com/ZGEnergy/paseo/pull/147) (nix daemon runner resolve through a traced server entrypoint) and the pid-lock safety adoptions in the 2026-09-24 sync ([ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150)).
