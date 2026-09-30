# Fork retirement

## Active capability count

**3 waiting.** No capability changed status this period: the 2026-09-29 downstream sync ([ZGEnergy/paseo#171](https://github.com/ZGEnergy/paseo/pull/171)) resolved the auto sync [#170](https://github.com/ZGEnergy/paseo/pull/170)'s three-path conflict (plugin manifest, lockfile, Nix hash) plus a semantic `splitMarkdownBlocks` union with upstream's #5577 streaming fix, and the 2026-09-30 downstream sync ([ZGEnergy/paseo#173](https://github.com/ZGEnergy/paseo/pull/173), resolving auto sync [#172](https://github.com/ZGEnergy/paseo/pull/172)) integrated upstream's OMP first-class provider rework ([getpaseo/paseo#5550](https://github.com/getpaseo/paseo/pull/5550)) around the fork's bounded OMP lifecycle gate and unioned upstream's content width with the fork's host-scoped height caches (PR-merge `c8f622c336`). OMP Ask option descriptions remain retired (2026-09-25, upstream [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) — see retired history). One older retired history entry also exists (host KaTeX, superseded by the plugin surface). Upstream evidence below was re-verified against upstream `main` at `3a9304607c` on 2026-09-30.

Last reviewed: 2026-09-30

Evidence baseline:

- fork integration: `origin/internal/main` at `c8f622c336` — the 2026-09-30 PR-merge of [ZGEnergy/paseo#173](https://github.com/ZGEnergy/paseo/pull/173) on top of `c3134745fb`, which was the 2026-09-29 downstream sync [ZGEnergy/paseo#171](https://github.com/ZGEnergy/paseo/pull/171) merge (head `450f572edd`, two-parent merge: first parent `9ee910e944` = prior `internal/main` tip, second parent `d596861891` = live `main`) landed with green CI/provenance, superseding auto sync [#170](https://github.com/ZGEnergy/paseo/pull/170) (auto-closed MERGED). #171's conflicts: `packages/plugin/package.json` (upstream 0.10.0 version alignment + the fork's markdown dependency declarations, the #155/#168 union pattern), `package-lock.json` (upstream's 0.10.0 stable cut + usage built-in plugins + fork `packages/plugin` delta; `npm install` left it byte-identical), and `nix/npm-deps.hash` (regenerated → `sha256-GBgfyTaBbp+o2E44VlGzpB8pfMQ0HHSWYGwbrO0e1fg=`), plus the semantic [#5577](https://github.com/getpaseo/paseo/pull/5577) streaming-line-break union described under capability 1.
- 2026-09-30 resolver: [ZGEnergy/paseo#173](https://github.com/ZGEnergy/paseo/pull/173) (head `78f44b7232`, two-parent merge: first parent `c3134745fb`, second parent `b1a3b0772d` = live `main`) resolved auto sync [#172](https://github.com/ZGEnergy/paseo/pull/172)'s seven-file conflict (OMP provider + agent-stream height estimation) and landed as PR-merge `c8f622c336` with fully green CI and provenance (merged 2026-09-30), superseding [#172](https://github.com/ZGEnergy/paseo/pull/172) (auto-closed MERGED); see per-capability evidence below.
- fork upstream mirror: `origin/main` at `b1a3b0772d` — fast-forwarded from `7f5d32cdd5` across two windows: `7f5d32cdd5..d596861891` (34 commits, merged by #171: the 0.10.0 stable cut and usage built-in plugins [#5465](https://github.com/getpaseo/paseo/pull/5465), the #5577 streaming line-break fix, send_agent_prompt reporting [#5386](https://github.com/getpaseo/paseo/pull/5386), OMP question/steer groundwork) and `d596861891..b1a3b0772d` (17 commits, in #173: the OMP first-class epic [#5550](https://github.com/getpaseo/paseo/pull/5550), chat/Markdown content width [#5680](https://github.com/getpaseo/paseo/pull/5680), Codex fast/ultrafast [#5708](https://github.com/getpaseo/paseo/pull/5708) and declined-command settlement [#5717](https://github.com/getpaseo/paseo/pull/5717), Codex legacy rewind [#5711](https://github.com/getpaseo/paseo/pull/5711), OpenCode v2 fixes (#5674, #5696, #5710, #5679), content-width e2e, the 0.10.2 changelog, sidebar empty-project actions [#5675](https://github.com/getpaseo/paseo/pull/5675), daemon process-spam fix [#5636](https://github.com/getpaseo/paseo/pull/5636), archived-workspace restore [#5694](https://github.com/getpaseo/paseo/pull/5694), Claude hooks skip for internal agents [#5750](https://github.com/getpaseo/paseo/pull/5750), CLI agent-open failure [#5727](https://github.com/getpaseo/paseo/pull/5727), host-removal probe fix [#5722](https://github.com/getpaseo/paseo/pull/5722)).
- upstream: `getpaseo/paseo` `main` at `3a9304607c` — one commit beyond fork `main` (sidebar header/footer plugin items + Usage in sidebar footer, [#5685](https://github.com/getpaseo/paseo/pull/5685); plugin sidebar API surface, not a capability replacement). Every capability verdict below was re-verified against this exact tree on 2026-09-30: zero `addMarkdownExtension`, zero `MarkdownSource` anywhere in `packages/` (host or plugin-facing), `SvgXml` only in internal icon/catalog components (`material-file-icon`, `provider-catalog-list`, `provider-icons`, `pair-device-section`), their internal-component test (`provider-icons.test.ts`), and a test stub (`test-stubs/react-native-svg`); `completeTurnAfterProviderIdle` still completes from provider state alone with an unbounded `providerIdleScheduler.waitForRetry()` (line 2185) and a bare `terminalizeActiveWork()` (lines 1153/1165/1748) that terminalizes running children; `optionDetails` present (`question-ui.ts`, `rpc-types.ts`); zero `acceptsPromptDuringAutonomousTurn`/`settleLeftoverAutonomousTurn` with only generic `PendingForegroundRun`/`startPendingForegroundTurn` foreground tracking.

## Plugin assistant-markdown surface

**Status:** `waiting`

Last reviewed: 2026-09-30

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
- [ZGEnergy/paseo#155](https://github.com/ZGEnergy/paseo/pull/155) (head `13f09f677`, 2026-09-24), [#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, 2026-09-25), [#162](https://github.com/ZGEnergy/paseo/pull/162) (head `e654acb07`, 2026-09-26), [#165](https://github.com/ZGEnergy/paseo/pull/165) (head `db11c4d67`, 2026-09-27), [#168](https://github.com/ZGEnergy/paseo/pull/168) (head `6d3323572`, 2026-09-28): carried the surface and the plugin SDK markdown dependency declarations forward; the 2026-09-28 sync resolved `packages/plugin/package.json` on the #155 pattern.
- [ZGEnergy/paseo#171](https://github.com/ZGEnergy/paseo/pull/171) (head `450f572edd`, 2026-09-29 downstream sync): resolved the semantic overlap between the fork's extension-block retention and upstream's #5577 streaming fix as a union — `split-markdown-blocks.ts` now keeps blank lines wholesale inside open extension-delimited blocks (fork capability) while fences follow the parser's structural verdict (upstream semantics), fixing the doubled trailing tail upstream's own test exposed; `packages/plugin/package.json` unioned as upstream 0.10.0 alignment + the fork's markdown dependency declarations. 37/37 app plugin-markdown tests and 56/56 plugin SDK tests green on the merged tree.
- [ZGEnergy/paseo#173](https://github.com/ZGEnergy/paseo/pull/173) (head `78f44b7232`, 2026-09-30 downstream sync): the height-estimate conflicts resolved as a union of upstream's #5680 content width and the fork's host-scoped caches — `estimateStreamItemHeight(item, contentMaxWidth, serverId?)` and `estimateAssistantMessageHeightFromCache(markdown, contentMaxWidth, serverId?)` with cache keys `${serverId}:${contentMaxWidth-16}:${hash}`; `strategy-web.tsx` passes both; host-keyed tests updated to the union signature. The extension API, host-scoped registry, and plugin SDK markdown dependencies are unchanged; 76/76 focused plugin-markdown tests pass on the merged tree.

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) (SvgXml, head `1a1144648baa`), [#4750](https://github.com/getpaseo/paseo/pull/4750) (assistant markdown extensions, head `15efaa1b284a`), and [#4752](https://github.com/getpaseo/paseo/pull/4752) (MarkdownSource, head `bfc1e0ecdc1a`) are open and unmerged as of 2026-09-30 with unchanged heads (last updates 2026-09-12); merge order is 4749 → 4750 → 4752.
- Upstream `main` at `3a9304607c` contains no `addMarkdownExtension`, no `MarkdownSource` of any kind, and no host-provided `SvgXml` (re-verified 2026-09-30; the only `SvgXml` matches are internal icon/catalog components and a test stub). The window's #5680 (content width) reworks the fixed-width height estimate into a runtime `contentMaxWidth` parameter and the #5577 streaming fix re-appends blank tails — both adopted in the fork without touching the extension API; upstream's #5685 sidebar plugin items extend the plugin API but do not provide assistant-markdown extensions.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-30

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
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24), [#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, 2026-09-25), [#162](https://github.com/ZGEnergy/paseo/pull/162) (head `e654acb07`, 2026-09-26), [#165](https://github.com/ZGEnergy/paseo/pull/165) (head `db11c4d67`, 2026-09-27), [#168](https://github.com/ZGEnergy/paseo/pull/168) (head `6d3323572`, 2026-09-28): carried the bounded gate forward through the daily windows (no `providers/omp` conflicts in the 09-26 through 09-28 windows; the 09-25 sync's single `providers/omp` conflict was the test-harness import line in [#159](https://github.com/ZGEnergy/paseo/pull/159)); #150 had adopted upstream's aborted-terminal classification (#5243) and deferred completion (#3258) inside the fork's gate.
- [ZGEnergy/paseo#171](https://github.com/ZGEnergy/paseo/pull/171) (head `450f572edd`, 2026-09-29 downstream sync): zero `providers/omp` conflicts; 13 gate-symbol matches (`accrueProviderIdleSilence`, `ompProviderIdleBudgetMs`, `ompSubagentFingerprint`, `terminalizeSubagents`) verified on the merged tree; 276/276 OMP + agent-manager tests.
- [ZGEnergy/paseo#173](https://github.com/ZGEnergy/paseo/pull/173) (head `78f44b7232`, 2026-09-30 downstream sync): the OMP first-class rework (#5550) was adopted wholesale around the fork's gate — steering (`steerActiveTurn` with echo correlation through `pendingClientMessages`), `OmpQuestionUi`, fast mode, crash relaunch (`runtimeDead`, `unsubscribeRuntime`), `resetActiveTurn({terminalizeWork})`, and upstream's `isOmpToolFailure`/`toolFailureMessage` failure classification — while the fork's gate is unchanged in behavior: `OmpProviderIdleAttempt` budgets (60s other / 600s compaction / 600s subagent silence, 3-failure budget, 60-minute ceiling), `providerIdleGate` re-entry dedup, child-aware completion (`get_subagents` polling, `activeToolCallTurns`, `ompSubagentFingerprint`), `interrupt()` and the aborted-terminal path sparing live children (`terminalizeSubagents: false`), `forceSettleDeferredTaskCalls`, and `failStalledTurn` rich diagnostics. Upstream's `providerIdleDeadlineMs` mechanism is adopted inside the gate loop with upstream's exact `turn_failed` emission but defaults to the fork's 60-minute ceiling rather than upstream's 600s — upstream's gate completes at the first idle state and never waits for children, so a 600s wall-clock kill is safe only there; in the fork's child-aware gate it would fail a healthy >10-minute fan-out with steady progress. An explicit shorter deadline still binds (upstream's `providerIdleDeadlineMs: 1` test passes). The fork-side ask-dialog tracking (`readActiveAskUserDialog`) was removed with the plumbing upstream's `OmpQuestionUi` replaces. 105/105 `agent.test.ts` (fork + upstream suites) and 271 passed / 1 skipped across the omp directory on the merged tree.

Upstream evidence:

- Upstream's #5550 "OMP first-class epic" (merged 2026-09-29, in the fork mirror window) explicitly lists [getpaseo/paseo#2232](https://github.com/getpaseo/paseo/issues/2232) "parent agent shows idle while its subagents run" under **Out of scope** ("fixing that needs agent-status changes") — upstream `main` still does not provide any checklist behavior (re-verified 2026-09-30): `completeTurnAfterProviderIdle` polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors and an unbounded `providerIdleScheduler.waitForRetry()` retry (line 2185 at `3a9304607c`), plus a bare 600s absolute deadline (`OMP_PROVIDER_IDLE_DEADLINE_MS`, line 158) with no silence/failure budgets and no child-activity awareness; `terminalizeActiveWork()` (lines 1153/1165/1748) has no sparing option and terminalizes running children from `interrupt()`, `resetActiveTurn({terminalizeWork: true})`, and process exit. Its #4977-derived steering and 600s deadline are error-reporting/steering work, not bounded completion, yield settlement, or interruption-safe children.
- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371) and [#3667](https://github.com/getpaseo/paseo/pull/3667) remain closed unmerged; [getpaseo/paseo#4977](https://github.com/getpaseo/paseo/pull/4977) is closed (superseded by #5550, whose supersedes note explicitly leaves #4977's shared `agent-run-state.ts`/`jsonl-rpc-process.ts` changes, paging drain, and Pi edit out). A 2026-09-30 search of open upstream PRs found no new candidate for #2232 or for yield/child-interruption behavior.

## OMP Ask option descriptions

Retired — see [Retired history](#retired-history).

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-30

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live (`agent-manager.ts` pending foreground runs, `agent-run-state.ts` autonomous run tracking).
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes (`settleLeftoverAutonomousTurn`).
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24), [#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, 2026-09-25), [#162](https://github.com/ZGEnergy/paseo/pull/162) (head `e654acb07`, 2026-09-26), [#165](https://github.com/ZGEnergy/paseo/pull/165) (head `db11c4d67`, 2026-09-27 — resolved the `agent-sdk-types.ts` union keeping both upstream's `initialTimeline` and the fork's `acceptsPromptDuringAutonomousTurn`; 215/215 agent-manager tests), and [#168](https://github.com/ZGEnergy/paseo/pull/168) (head `6d3323572`, 2026-09-28): carried admission and settlement forward.
- [ZGEnergy/paseo#171](https://github.com/ZGEnergy/paseo/pull/171) (head `450f572edd`, 2026-09-29 downstream sync): no conflicts touched `providers/claude` or `agent-manager`; admission and settlement verified present on the merged tree.
- [ZGEnergy/paseo#173](https://github.com/ZGEnergy/paseo/pull/173) (head `78f44b7232`, 2026-09-30 downstream sync): the window's only Claude-provider change, [#5750](https://github.com/getpaseo/paseo/pull/5750) "skip user and project hooks for internal agents", is hook-scope work and carries no lifecycle behavior; admission (`PendingForegroundRun`/`startPendingForegroundTurn`, `refusedAutonomousCancellations`, autonomous run tracking in `agent-run-state.ts`) and settlement (`settleLeftoverAutonomousTurn`) are unchanged on the merged tree, and 288/288 focused `providers/claude/agent.test.ts` + `agent-manager.test.ts` tests pass.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366) remains closed unmerged; its successor [getpaseo/paseo#5457](https://github.com/getpaseo/paseo/pull/5457) "fix(server): keep background subagents alive when prompting a busy agent" is open and unmerged (re-checked 2026-09-30; head moved to `72da9ee1f069` on 2026-09-29) and still ports the fork's [#11](https://github.com/ZGEnergy/paseo/pull/11) admission behavior only — no completed task-notification settlement of leftover autonomous turns.
- Upstream active-turn steering (commit `f9e1def95455`) and archive-continuation (commit `613cbbe9ef7b`) cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- Adjacent open upstream PRs, none merged and none carrying the missing behaviors (re-checked 2026-09-30): [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) (unchanged since 2026-09-11; stop-control candidate), [#4633](https://github.com/getpaseo/paseo/pull/4633) (unchanged since 2026-09-10) with the near-duplicate [#4113](https://github.com/getpaseo/paseo/pull/4113), and [#5022](https://github.com/getpaseo/paseo/pull/5022) (app-side follow-up queueing, not provider-level admission).
- Upstream `main` at `3a9304607c` (re-verified 2026-09-30) routes `task_notification` through `appendTaskNotificationEvents`, which appends provider-subagent/timeline events only and never settles a leftover autonomous turn; `acceptsPromptDuringAutonomousTurn` and `settleLeftoverAutonomousTurn` are absent (zero matches in `packages/server`); `PendingForegroundRun`/`startPendingForegroundTurn` exist as generic foreground pending-run tracking without the `hasBlockingRun`/`acceptsPromptDuringAutonomousTurn` admission gate; and `steerOrReplaceActiveTurn` still falls back to `replaceAdmittedForegroundTurn` when provider steering is unavailable or declined.

## Retired history

### OMP Ask option descriptions

**Status:** retired on 2026-09-25 by adopting upstream [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) through downstream sync [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, two-parent merge of `f58b84eb4` + live `main` `43a2a7969`; upstream commit `90d978ab68570f531a9b728d7360ae09f36f1fec`, PR merged 2026-09-25T08:25:19Z).

Upstream `main` provides every checklist behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options (`readSelectOptions` index-maps details onto labels; both question builders pass `description` through; the app question card's description passthrough predates this window).
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options (details array shorter than the labels, non-record entries, non-string or whitespace-only `description`, and extra entries all degrade to `{ label }`; the schema accepts any shape via `optionDetails: z.unknown().optional()`).
- [x] OMP `16.3.9` and later remain supported; the merged window touches no version floor.

The fork's implementation ([ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`; [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`) was byte-identical to what upstream merged — the same author ported it upstream, and upstream's follow-up commit adopted the same `toStrictEqual` test assertions the fork already carried. The downstream sync therefore adopted upstream's copy directly: the merged tree keeps exactly one copy of `readSelectOptions`, both builders, the `optionDetails` schema, and the tests, and a repo-wide search shows `optionDetails` only in the OMP provider files that now equal upstream's implementation — no fork-only code, shims, or aliases.

Retirement proof (2026-09-25, on the merged tree at `c80ef9e10`): `npx vitest run packages/server/src/server/agent/providers/omp/agent.test.ts` 78/78 pass (including the described/malformed/combined option-details tests); `agent/mcp-server.test.ts` 120/120; `npm run typecheck` clean; lint 0/0 on all changed files; format check clean; fork/upstream implementation equality verified by diff (`agent.ts`, `rpc-types.ts`, `omp-harness.ts` identical to the fork tip; `agent.test.ts` differs only by upstream's blank-line normalization). Carried forward unchanged by the 2026-09-27 ([#165](https://github.com/ZGEnergy/paseo/pull/165)), 2026-09-28 ([#168](https://github.com/ZGEnergy/paseo/pull/168)), and 2026-09-29 ([#171](https://github.com/ZGEnergy/paseo/pull/171)) syncs; re-verified 2026-09-30 against upstream `main` at `3a9304607c` (`optionDetails` in `question-ui.ts` and `rpc-types.ts`) and on the #173 merged tree (omp directory 271 passed / 1 skipped).

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

Operational note (2026-09-27): the `internal/main` ruleset reports any PR whose head is behind the base as BEHIND and the merge API refuses it even for admins, so the Upstream import merge bot's clean-sync step (`Merge MERGEABLE head-main sync`) can never land a head-`main` sync directly. Clean syncs need the same downstream-sync merge resolver as conflicting ones — see the 2026-09-26 sync ([ZGEnergy/paseo#162](https://github.com/ZGEnergy/paseo/pull/162)). The Nix `build-desktop-darwin` bundling-worker SIGTERM on fork `main` pushes (2026-09-25/26) did not recur on later `main` pushes.

This period's excluded-operations landings: [ZGEnergy/paseo#169](https://github.com/ZGEnergy/paseo/pull/169) (2026-09-28 ledger refresh), [#170](https://github.com/ZGEnergy/paseo/pull/170) (2026-09-29 auto sync, closed MERGED by the resolver below it), and [#171](https://github.com/ZGEnergy/paseo/pull/171) (2026-09-29 downstream sync). Open and pending in excluded categories: [#172](https://github.com/ZGEnergy/paseo/pull/172) (2026-09-30 auto sync, CONFLICTING) superseded and closed by the resolver [#173](https://github.com/ZGEnergy/paseo/pull/173) (two-parent merge of `c3134745fb` + live `main` `b1a3b0772d`; PR-merge `c8f622c336`, landed 2026-09-30), [#153](https://github.com/ZGEnergy/paseo/pull/153) (ZGE relay deploy config, MERGEABLE but BEHIND `internal/main` — the merge API refuses BEHIND heads, so it needs a rebase), and [#148](https://github.com/ZGEnergy/paseo/pull/148) (workspace keyboard navigation — fork product behavior, not yet integrated; still CONFLICTING with `internal/main`). The 2026-09-30 resolver's OMP deadline default (fork's 60-minute ceiling instead of upstream's 600s) is documented in the #173 PR body and is product-behavior-preserving, not an excluded operation.
