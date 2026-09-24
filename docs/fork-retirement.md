# Fork retirement

## Active capability count

**4 waiting.** No capability is `upstream-candidate`: live upstream `main` at `e3c853df58bd38f0c29553454c1cbe49cc391c09` does not yet provide every required behavior for any capability. No capability retired this period; one retired history entry exists (host KaTeX, superseded by the plugin surface).

Last reviewed: 2026-09-24 (second review)

Evidence baseline:

- fork integration: `origin/internal/main` at `871860658b3ae962a1fa595bef9c676f61dcbabe` (PR-merge commit; head `13f09f677`, two-parent merge: first parent `f37162315`, second parent `e3c853df5` = live `main`) — the 2026-09-24 first-pass state plus the second 2026-09-24 downstream sync [ZGEnergy/paseo#155](https://github.com/ZGEnergy/paseo/pull/155), which resolves the conflicting auto sync [ZGEnergy/paseo#154](https://github.com/ZGEnergy/paseo/pull/154); it unions the fork's pid-lock `lifecycle` record with upstream #5335's top-level `serverId`, adopts upstream #5332's `failStartup` failure naming, drops the fork's redundant direct `getOrCreateServerId` worker call in favor of upstream's bootstrap-routed `getServerId()`, and keeps the plugin SDK markdown dependencies under upstream's 0.9.2 version alignment. Conflict-resolution review: APPROVE, no findings.
- fork upstream mirror: `origin/main` at `e3c853df5` — fast-forwarded from `c356394bf` (11 commits: the 0.9.2 stable cut and its lockfile/nix housekeeping, config.json parse-failure naming [#5337](https://github.com/getpaseo/paseo/pull/5337), Open-in-editor for password-protected desktop daemons with pid-lock `serverId` plumbing [#5335](https://github.com/getpaseo/paseo/pull/5335), background-start failure cause naming [#5332](https://github.com/getpaseo/paseo/pull/5332), Fable model in Claude settings.json [#5326](https://github.com/getpaseo/paseo/pull/5326), local workspace path rejection [#5322](https://github.com/getpaseo/paseo/pull/5322), multi-select Other-answer grouping [#5320](https://github.com/getpaseo/paseo/pull/5320), chat upload original file names [#5317](https://github.com/getpaseo/paseo/pull/5317)).
- upstream: `getpaseo/paseo` `main` at `e3c853df5` — every capability verdict below was re-verified against this exact tree on 2026-09-24 (zero `addMarkdownExtension`, zero plugin-facing `MarkdownSource`, `SvgXml` still internal icon/catalog use only, zero `optionDetails`; `completeTurnAfterProviderIdle` still completes from provider state alone with an unbounded `providerIdleScheduler.waitForRetry()` retry at `packages/server/src/server/agent/providers/omp/agent.ts:2190` and `interrupt()` still calls `terminalizeActiveWork()` at lines 1132/1787; `appendTaskNotificationEvents` (defined at `providers/claude/agent.ts:4336`) still appends events only; `steerOrReplaceActiveTurn` in `agent-manager.ts` still falls back to `replaceAdmittedForegroundTurn` at line 2761).

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
- [ZGEnergy/paseo#155](https://github.com/ZGEnergy/paseo/pull/155) (head `13f09f677`, 2026-09-24 downstream sync): `packages/plugin/package.json` conflict resolved as upstream's 0.9.2 version alignment plus the fork's markdown dependency declarations (`@types/markdown-it`, `react-native-markdown-display` optional peers); the lockfile was reconciled with that metadata only.

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) (SvgXml, head `1a1144648baa`), [#4750](https://github.com/getpaseo/paseo/pull/4750) (assistant markdown extensions, head `15efaa1b284a`), and [#4752](https://github.com/getpaseo/paseo/pull/4752) (MarkdownSource, head `bfc1e0ecdc1a`) are open and unmerged as of 2026-09-24 with unchanged heads (last updates 2026-09-12); merge order is 4749 → 4750 → 4752.
- Upstream `main` at `e3c853df5` contains no `addMarkdownExtension`, no plugin-facing `MarkdownSource` host component, and no host-provided `SvgXml` (re-verified 2026-09-24; the only `SvgXml` matches are internal icon/catalog components and test stubs). Upstream's plugin work in this window touched only the release version bump; the extension API remains absent.

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
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): adopted upstream's aborted-terminal-response classification (#5243) inside the fork's `completeTurn` — the `turn_canceled` path keeps the fork's `terminalizeSubagents: false` sparing so live children survive a user Stop — and upstream's deferred completion after custom messages (#3258), which now flows through the fork's bounded gate. Upstream's unbounded retry loop was replaced by the fork's bounded scheduler, which subsumes upstream's interrupt-race re-check via ownership re-checks at completion and at the retry decision. Upstream's `holdStateRequests()` test helper replaced the fork's duplicate. All 78 OMP provider tests pass on the merged tree.
- [ZGEnergy/paseo#155](https://github.com/ZGEnergy/paseo/pull/155) (head `13f09f677`, 2026-09-24 downstream sync): no conflicts touched the OMP provider; upstream main's OMP tree in this window had zero commits. All 78 OMP provider tests pass on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371), head `fa9fc5e6244e`, remains closed unmerged (re-checked 2026-09-24, unchanged since 2026-09-08) in favor of [#2777](https://github.com/getpaseo/paseo/pull/2777), whose merged change aggregates native-child activity into workspace status while explicitly leaving parent lifecycle unchanged.
- Open upstream PR adjacent to this capability: [getpaseo/paseo#4977](https://github.com/getpaseo/paseo/pull/4977) "omp provider: mid-turn steering, paging drain, fast-mode passthrough, and lifecycle hardening" — head CHANGED on 2026-09-24 (was `cb8227298838`, now `8b360274d668`, last update 14:44 UTC; re-reviewed against the new head). The new head adds an absolute completion deadline (`OMP_PROVIDER_IDLE_DEADLINE_MS = 600_000`, injectable via `providerIdleDeadlineMs`): if OMP has not reported a non-streaming, non-compacting state within the deadline after `agent_end`, the turn FAILS with a timeout error. This is the first upstream movement toward bounded provider-idle completion, but it covers only the absolute-elapsed dimension of the fork's bounded gate: no silence budget, no rejected-state-check budget, no compaction awareness beyond the existing pause, no child-activity awareness (the deadline can fail a turn while children still run), and no verified-yield settlement or interruption-safe children. Still open and unmerged.
- New adjacent open upstream PR: [getpaseo/paseo#5362](https://github.com/getpaseo/paseo/pull/5362) "Fix completed parents showing Done while attached subagents work" (opened 2026-09-24): derives a client-only `waiting_on_subagent` display state from attached active descendants for sidebar/tabs/badges; display-level only, parent lifecycle unchanged — the same family as #2777. Open, unmerged.
- Upstream `main` at `e3c853df5` still completes from provider state alone (re-verified 2026-09-24): `completeTurnAfterProviderIdle` polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors and an unbounded scheduler retry loop (`providerIdleScheduler.waitForRetry()` at `providers/omp/agent.ts:2190`) — no silence/elapsed budget, no failure budget, no child-activity awareness — and `interrupt()` still calls `terminalizeActiveWork()` (lines 1132/1787), terminalizing running children. The upstream commits in this window include zero OMP provider changes.

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
- [ZGEnergy/paseo#155](https://github.com/ZGEnergy/paseo/pull/155) (head `13f09f677`, 2026-09-24 downstream sync): no conflicts touched this surface; upstream's multi-select grouping work (#5320) auto-merged beneath the fork's description flow and the app question-card tests pass on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) remains open (head `cd641993cd21`, unchanged since 2026-09-14; re-checked 2026-09-24 — still the `optionDetails` decoding candidate with malformed/blank fallbacks).
- Upstream `main` at `e3c853df5` retains the `16.3.9` support floor but contains no `optionDetails` decoding or propagation (re-verified 2026-09-24; zero matches in source, including the select-option reader path). The app's question card has long rendered option descriptions when a provider attaches them (`question-form-card-core.ts` description passthrough predates this window), so the missing piece remains the OMP provider decode, not the render path.
- Adjacent but distinct: [getpaseo/paseo#5336](https://github.com/getpaseo/paseo/pull/5336) "Show Claude option previews in the question card" (head updated 2026-09-24 to `a8d0e8729` with "Check option previews under the option that owns them") adds app-side option previews for Claude providers; it is not the OMP `optionDetails` decode/propagate behavior and remains open, unmerged.

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
- [ZGEnergy/paseo#155](https://github.com/ZGEnergy/paseo/pull/155) (head `13f09f677`, 2026-09-24 downstream sync): the only Claude-provider commit in this upstream window is the Fable model catalog entry (#5326); the fork's admission and settlement paths are unchanged on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366), head `bf3820d81cc1`, remains closed unmerged (re-checked 2026-09-24, unchanged since 2026-09-08) in favor of [#3394](https://github.com/getpaseo/paseo/pull/3394), merge `42245d139ad1`.
- Upstream active-turn steering (commit `f9e1def95455`) and archive-continuation (commit `613cbbe9ef7b`) cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- Adjacent open upstream PRs, none merged and none carrying the missing behaviors (re-checked 2026-09-24): [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) (head `1549ea566e16`, unchanged since 2026-09-11; still the "spare background subagents from an interrupt, and let one be stopped" stop-control candidate), [getpaseo/paseo#4633](https://github.com/getpaseo/paseo/pull/4633) (head `1132cdb0e6e5`, unchanged since 2026-09-10), [getpaseo/paseo#5022](https://github.com/getpaseo/paseo/pull/5022) "fix: queue follow-ups when providers cannot steer" (head `e9692f7f34dd`, unchanged since 2026-09-17; app-side composer/session-store queueing of follow-ups, not provider-level admission).
- Upstream `main` at `e3c853df5` (re-verified 2026-09-24) routes `task_notification` through `appendTaskNotificationEvents` (`providers/claude/agent.ts:4336`), which appends provider-subagent/timeline events only and never settles a leftover autonomous turn; `steerOrReplaceActiveTurn` in `agent-manager.ts` still falls back to `replaceAdmittedForegroundTurn` when provider steering is unavailable (line 2761), so follow-up admission still replaces the turn and a compatible background child neither keeps the parent admitted nor blocks replacement. The upstream commits in this window touch `providers/claude` only for the Fable model catalog entry (#5326).

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

This period's excluded-operations landings: [ZGEnergy/paseo#155](https://github.com/ZGEnergy/paseo/pull/155) (pid-lock `serverId` union with upstream #5335, adoption of upstream #5332's startup-failure naming including the CLI launcher tolerance, and removal of the fork's redundant direct server-id call).
