# Fork retirement

## Active capability count

**3 waiting.** No capability changed status this period: the 2026-09-26 downstream sync ([ZGEnergy/paseo#162](https://github.com/ZGEnergy/paseo/pull/162)) landed upstream's own clean window with zero conflicts and no capability impact, and OMP Ask option descriptions remain retired (2026-09-25, upstream [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) — see retired history). One older retired history entry also exists (host KaTeX, superseded by the plugin surface).

Last reviewed: 2026-09-26

Evidence baseline:

- fork integration: `origin/internal/main` at `4e3b0938c75e86f188f7daa7e0856dd336070f1d` (PR-merge commit of [#162](https://github.com/ZGEnergy/paseo/pull/162); head `e654acb07`, two-parent merge: first parent `64d871b20b`, second parent `a272a22d7e` = live `main`) — the 2026-09-26 downstream sync [#162](https://github.com/ZGEnergy/paseo/pull/162) landed with green CI and provenance and closed the auto sync [#161](https://github.com/ZGEnergy/paseo/pull/161) (auto-closed MERGED). `git merge-tree` was clean, so the merge carries upstream's own content only; the direct merge of #161 was blocked because the `internal/main` ruleset reports the behind-head `main` branch as BEHIND and the merge API refuses it even for admins (see excluded operations).
- fork upstream mirror: `origin/main` at `a272a22d7e` — fast-forwarded from `43a2a7969` (8 commits: OSC 8 terminal links [getpaseo/paseo#5388](https://github.com/getpaseo/paseo/pull/5388), run agents on another daemon from inside an agent session [#5392](https://github.com/getpaseo/paseo/pull/5392), model picker nested buttons [#5404](https://github.com/getpaseo/paseo/pull/5404), notify a caller once when prompting a running child [#5407](https://github.com/getpaseo/paseo/pull/5407), generic ACP slash commands [#5411](https://github.com/getpaseo/paseo/pull/5411), skill refresh on branch change [#5415](https://github.com/getpaseo/paseo/pull/5415), Pi rewind across daemon restart [#5432](https://github.com/getpaseo/paseo/pull/5432), OpenCode synthetic messages [#5434](https://github.com/getpaseo/paseo/pull/5434)).
- upstream: `getpaseo/paseo` `main` at `76a9781ba` — one commit beyond fork `main` ([#5437](https://github.com/getpaseo/paseo/pull/5437) "Read Claude history from the provider's own config directory": config-dir resolution for Claude history reading and custom-provider model-catalog discovery; no lifecycle change). Every remaining capability verdict below was re-verified against this exact tree on 2026-09-26 (zero `addMarkdownExtension`, zero plugin-facing `MarkdownSource`, `SvgXml` only in internal icon/catalog components and test stubs; `completeTurnAfterProviderIdle` still completes from provider state alone with an unbounded `providerIdleScheduler.waitForRetry()` retry at `providers/omp/agent.ts:2216` and `interrupt()` still calls `terminalizeActiveWork()` (no `terminalizeSubagents` option; call sites at :1158/:1813/:2168); `appendTaskNotificationEvents` still appends events only at `providers/claude/agent.ts:4326`; `steerOrReplaceActiveTurn` in `agent-manager.ts` still falls back to `replaceAdmittedForegroundTurn`; `optionDetails` decode present via #3628).

## Plugin assistant-markdown surface

**Status:** `waiting`

Last reviewed: 2026-09-26

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
- [ZGEnergy/paseo#155](https://github.com/ZGEnergy/paseo/pull/155) (head `13f09f677`, 2026-09-24 downstream sync): `packages/plugin/package.json` conflict resolved as upstream's 0.9.2 version alignment plus the fork's markdown dependency declarations (`@types/markdown-it`, `react-native-markdown-display` optional peers).
- [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, 2026-09-25 downstream sync): no conflicts touched this surface; the extension API, host-scoped registry, and plugin SDK markdown dependencies are unchanged on the merged tree.
- [ZGEnergy/paseo#162](https://github.com/ZGEnergy/paseo/pull/162) (head `e654acb07`, 2026-09-26 downstream sync): no conflicts touched this surface; `addMarkdownExtension` (app `plugins/evaluate.ts`, `plugins/registry.ts`, plugin SDK `client/contracts.ts`, `client/markdown-extension.ts`) and the `MarkdownSource` host component are present unchanged on the merged tree.

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) (SvgXml, head `1a1144648baa`), [#4750](https://github.com/getpaseo/paseo/pull/4750) (assistant markdown extensions, head `15efaa1b284a`), and [#4752](https://github.com/getpaseo/paseo/pull/4752) (MarkdownSource, head `bfc1e0ecdc1a`) are open and unmerged as of 2026-09-26 with unchanged heads (last updates 2026-09-12); merge order is 4749 → 4750 → 4752.
- Upstream `main` at `76a9781ba` contains no `addMarkdownExtension`, no plugin-facing `MarkdownSource` host component, and no host-provided `SvgXml` (re-verified 2026-09-26; the only `SvgXml` matches are internal icon/catalog components (`material-file-icon`, `provider-catalog-list`, `provider-icons`, `pair-device-section`) and test stubs). Upstream's plugin work in this window — plugin theme-list scrolling ([getpaseo/paseo#5374](https://github.com/getpaseo/paseo/pull/5374)), the open [#4985](https://github.com/getpaseo/paseo/pull/4985) "let local plugins provide Forge adapters", the open [#4627](https://github.com/getpaseo/paseo/pull/4627) chat-history attachment sources, and the open [#4532](https://github.com/getpaseo/paseo/pull/4532) "expose host Markdown component" (a small subset that exposes the host Markdown component without the extension API or `MarkdownSource` semantics; head `e5b6d4461b81`, untouched since 2026-09-09) — does not provide the extension API.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-26

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
- [ZGEnergy/paseo#46](https://github.com/ZGEnergy/paseo/pull/46), merge `e12cec0f34dd01aee47cc1b85b9f817b77dbdf33`: incremental yields and interruption-safe live children (`subagent-index.ts` fingerprinting).
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): adopted upstream's aborted-terminal-response classification (#5243) inside the fork's `completeTurn` — the `turn_canceled` path keeps the fork's `terminalizeSubagents: false` sparing so live children survive a user Stop — and upstream's deferred completion after custom messages (#3258), which now flows through the fork's bounded gate. Upstream's unbounded retry loop was replaced by the fork's bounded scheduler, which subsumes upstream's interrupt-race re-check via ownership re-checks at completion and at the retry decision. Upstream's `holdStateRequests()` test helper replaced the fork's duplicate.
- [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, 2026-09-25 downstream sync): the single conflict was the OMP test harness import line, resolved to the fork's strict-superset import; the fork's lifecycle code (`completeTurnAfterProviderIdle` bounded gate, `accrueProviderIdleSilence`, subagent snapshots, interruption-safe children) is unchanged on the merged tree. All 78 OMP provider tests pass on the merged tree.
- [ZGEnergy/paseo#162](https://github.com/ZGEnergy/paseo/pull/162) (head `e654acb07`, 2026-09-26 downstream sync): no conflicts and zero `providers/omp` commits in the window; the bounded gate (`completeTurnAfterProviderIdle` at `providers/omp/agent.ts:2507`, `accrueProviderIdleSilence` at :2465, `ompSubagentFingerprint` child-activity fingerprinting, `terminalizeActiveWork({ terminalizeSubagents: false })` sparing at :1341/:2421) is unchanged on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371), head `fa9fc5e6244e`, remains closed unmerged (re-checked 2026-09-26, unchanged since 2026-09-08) in favor of [#2777](https://github.com/getpaseo/paseo/pull/2777), whose merged change aggregates native-child activity into workspace status while explicitly leaving parent lifecycle unchanged.
- Open upstream PRs adjacent to this capability, none merged and none carrying the missing behaviors (re-checked 2026-09-26): [getpaseo/paseo#4977](https://github.com/getpaseo/paseo/pull/4977) "omp provider: mid-turn steering, paging drain, fast-mode passthrough, and lifecycle hardening" (head moved to `e789208a9fc7` on 2026-09-25; still only an absolute completion deadline — it fails the turn when `OMP_PROVIDER_IDLE_DEADLINE_MS` elapses — with no silence/failure budgets, no child-activity-aware completion, no yield settlement or interruption-safe children) and [getpaseo/paseo#5362](https://github.com/getpaseo/paseo/pull/5362) "Fix completed parents showing Done while attached subagents work" (head `082ebaa3ccc5`, unchanged since 2026-09-24).
- Merged adjacent-but-distinct upstream work in this window, none carrying the missing behaviors (re-checked 2026-09-26): [getpaseo/paseo#5407](https://github.com/getpaseo/paseo/pull/5407) "Notify a caller once when it prompts a child that is still running" (caller notification/reporting layer, not parent lifecycle), plus the still-open [getpaseo/paseo#5386](https://github.com/getpaseo/paseo/pull/5386) (send_agent_prompt started-turn reporting) and [#5132](https://github.com/getpaseo/paseo/pull/5132) (history purpose, not turn lifecycle). The 8-commit upstream window touched `providers/omp` zero times.
- Upstream `main` at `76a9781ba` still completes from provider state alone (re-verified 2026-09-26): `completeTurnAfterProviderIdle` polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors and an unbounded scheduler retry loop (`providerIdleScheduler.waitForRetry()` at `providers/omp/agent.ts:2216`) — no silence/elapsed budget, no failure budget, no child-activity awareness — and `interrupt()` still calls `terminalizeActiveWork()` (no `terminalizeSubagents` option; call sites at :1158/:1813/:2168), terminalizing running children.

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-26

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live (`agent-manager.ts` pending foreground runs, `agent-run-state.ts` autonomous run tracking).
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes (`settleLeftoverAutonomousTurn`).
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): the auto-merged upstream changes to `providers/claude/agent.ts` and `agent-manager.ts` are rewind-anchoring (#5285, #5289), slash-command ordering (#5240), and timeline hydration (#5286) work; the fork's admission and leftover-turn settlement paths are unchanged on the merged tree.
- [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, 2026-09-25 downstream sync): no conflicts touched `providers/claude` or `agent-manager`; the upstream window contains zero Claude-provider commits and the fork's admission and settlement paths are unchanged on the merged tree.
- [ZGEnergy/paseo#162](https://github.com/ZGEnergy/paseo/pull/162) (head `e654acb07`, 2026-09-26 downstream sync): no conflicts and zero `providers/claude` commits in the window; admission (`PendingForegroundRun`/`startPendingForegroundTurn`, `refusedAutonomousCancellations`, autonomous run tracking in `agent-run-state.ts`) and settlement (`settleLeftoverAutonomousTurn` at `providers/claude/agent.ts:3902`) are unchanged on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366), head `bf3820d81cc1`, remains closed unmerged (re-checked 2026-09-26, unchanged since 2026-09-08) in favor of [#3394](https://github.com/getpaseo/paseo/pull/3394), merge `42245d139ad1`.
- Upstream active-turn steering (commit `f9e1def95455`) and archive-continuation (commit `613cbbe9ef7b`) cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- Adjacent open upstream PRs, none merged and none carrying the missing behaviors (re-checked 2026-09-26): [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) (head `1549ea566e16`, unchanged since 2026-09-11; still the "spare background subagents from an interrupt, and let one be stopped" stop-control candidate), [getpaseo/paseo#4633](https://github.com/getpaseo/paseo/pull/4633) and the near-duplicate [#4113](https://github.com/getpaseo/paseo/pull/4113) "forward steerActiveTurn through wrapSessionProvider" (open, #4113 updated 2026-09-26), [getpaseo/paseo#5022](https://github.com/getpaseo/paseo/pull/5022) "fix: queue follow-ups when providers cannot steer" (head `e9692f7f34dd`, unchanged since 2026-09-17; app-side composer/session-store queueing of follow-ups, not provider-level admission), and [getpaseo/paseo#5336](https://github.com/getpaseo/paseo/pull/5336) (head `a8d0e8729d35`, unchanged since 2026-09-24; Claude option previews in the question card, retired-capability-adjacent).
- New adjacent-but-distinct upstream PRs in this window, none carrying the missing behaviors (re-checked 2026-09-26): [getpaseo/paseo#5386](https://github.com/getpaseo/paseo/pull/5386) (send_agent_prompt started-turn reporting; head `6a4d67661b12`) and [getpaseo/paseo#5359](https://github.com/getpaseo/paseo/pull/5359) "Let archive settle an ACP agent whose transport is dead" (ACP archive settlement, not Claude autonomous-turn settlement). The one upstream commit beyond fork `main`, [#5437](https://github.com/getpaseo/paseo/pull/5437), resolves Claude history reading and custom-provider model-catalog discovery from the provider's own config directory; neither carries the missing lifecycle behaviors.
- Upstream `main` at `76a9781ba` (re-verified 2026-09-26) routes `task_notification` through `appendTaskNotificationEvents` (`providers/claude/agent.ts:4326-4334`), which appends provider-subagent/timeline events only and never settles a leftover autonomous turn (`settleLeftoverAutonomousTurn` is absent upstream); `steerOrReplaceActiveTurn` in `agent-manager.ts` still falls back to `replaceAdmittedForegroundTurn` (`:2761`/`:2818`) when provider steering is unavailable, so follow-up admission still replaces the turn and a compatible background child neither keeps the parent admitted nor blocks replacement. The 8-commit upstream window touches `providers/claude` zero times.

## Retired history

### OMP Ask option descriptions

**Status:** retired on 2026-09-25 by adopting upstream [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) through downstream sync [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, two-parent merge of `f58b84eb4` + live `main` `43a2a7969`; upstream commit `90d978ab68570f531a9b728d7360ae09f36f1fec`, PR merged 2026-09-25T08:25:19Z).

Upstream `main` provides every checklist behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options (`readSelectOptions` index-maps details onto labels; both question builders pass `description` through; the app question card's description passthrough predates this window).
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options (details array shorter than the labels, non-record entries, non-string or whitespace-only `description`, and extra entries all degrade to `{ label }`; the schema accepts any shape via `optionDetails: z.unknown().optional()`).
- [x] OMP `16.3.9` and later remain supported; the merged window touches no version floor.

The fork's implementation ([ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`; [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`) was byte-identical to what upstream merged — the same author ported it upstream, and upstream's follow-up commit adopted the same `toStrictEqual` test assertions the fork already carried. The downstream sync therefore adopted upstream's copy directly: the merged tree keeps exactly one copy of `readSelectOptions`, both builders, the `optionDetails` schema, and the tests, and a repo-wide search shows `optionDetails` only in the OMP provider files that now equal upstream's implementation — no fork-only code, shims, or duplicates remain.

Retirement proof (2026-09-25, on the merged tree at `c80ef9e10`): `npx vitest run packages/server/src/server/agent/providers/omp/agent.test.ts` 78/78 pass (including the described/malformed/combined option-details tests); `agent/mcp-server.test.ts` 120/120; `npm run typecheck` clean; lint 0/0 on all changed files; format check clean; fork/upstream implementation equality verified by diff (`agent.ts`, `rpc-types.ts`, `omp-harness.ts` identical to the fork tip; `agent.test.ts` differs only by upstream's blank-line normalization). The 2026-09-26 sync ([ZGEnergy/paseo#162](https://github.com/ZGEnergy/paseo/pull/162)) carried this state forward unchanged.

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

Operational note (2026-09-26): the `internal/main` ruleset reports any PR whose head is behind the base as BEHIND and the merge API refuses it even for admins, so the Upstream import merge bot's clean-sync step (`Merge MERGEABLE head-main sync`) can never land a head-`main` sync directly. Clean syncs need the same downstream-sync merge resolver as conflicting ones — see the 2026-09-26 sync ([ZGEnergy/paseo#162](https://github.com/ZGEnergy/paseo/pull/162)); the separate Nix `build-desktop-darwin` failure on fork `main` pushes (bundling worker SIGTERM on the macOS runner, 2026-09-25 and 2026-09-26) is not a required check for `internal/main` merges.

This period's excluded-operations landings: [ZGEnergy/paseo#147](https://github.com/ZGEnergy/paseo/pull/147) (resolve the daemon runner through a traced server entrypoint so `upgrade:local` Nix closures include `exports.js`), [ZGEnergy/paseo#157](https://github.com/ZGEnergy/paseo/pull/157) (Upstream sync schedule moved to 5:30 America/Denver), [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (2026-09-25 downstream sync adopting upstream #3628), [ZGEnergy/paseo#160](https://github.com/ZGEnergy/paseo/pull/160) (2026-09-25 ledger refresh), and [ZGEnergy/paseo#162](https://github.com/ZGEnergy/paseo/pull/162) (2026-09-26 downstream sync). Open and pending in excluded categories: [#153](https://github.com/ZGEnergy/paseo/pull/153) (ZGE relay deploy config) and [#148](https://github.com/ZGEnergy/paseo/pull/148) (workspace keyboard navigation — fork product behavior, not yet integrated; becomes a capability to ledger only when merged).
