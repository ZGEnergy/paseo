# Fork retirement

## Active capability count

**3 waiting.** No capability changed status this period: the 2026-10-06 auto sync ([ZGEnergy/paseo#187](https://github.com/ZGEnergy/paseo/pull/187), head `main` `543e3712e1`, DIRTY on 7 files) is resolved by the 2026-10-06 downstream sync ([ZGEnergy/paseo#188](https://github.com/ZGEnergy/paseo/pull/188), head `7dccbf4418`, two-parent merge: first parent `4a0485eb8b` = prior `internal/main` tip, second parent `543e3712e1` = live `main`, landed as PR-merge `00e5c95f36` with green CI/provenance) — the `nix.yml`/`trace-daemon.mjs` conflicts adopted upstream's #5523 resolved-dependency rework wholesale while preserving the fork's glob directory-skip fix, the `assistant-selection-copy` conflicts unioned upstream's image/alt/list-number selection fixes with the fork's MarkdownSource verbatim copy, and `packages/plugin/package.json`/`package-lock.json` unioned upstream's 0.11.0-beta.5 alignment with the fork's markdown dependency declarations. `nix/npm-deps.hash` was recomputed from the merged lockfile and differs from both parents (`sha256-DtidHLUp0vvtUDFvICyhfGSVG7XEh5UV2oTvFW6h8V4=`), because the merged lockfile carries both sides' dependency sets.

Last reviewed: 2026-10-06

Evidence baseline:

- fork integration: `origin/internal/main` at `00e5c95f36` — the 2026-10-06 PR-merge of the downstream sync [ZGEnergy/paseo#188](https://github.com/ZGEnergy/paseo/pull/188) (head `7dccbf4418`, two-parent merge: first parent `4a0485eb8b` = the 2026-10-05 PR-merge of the docs refresh [#186](https://github.com/ZGEnergy/paseo/pull/186), itself on `daf98972c2` = the 2026-10-05 PR-merge of the ledger refresh [#185](https://github.com/ZGEnergy/paseo/pull/185), which sat on `a702dddabb` (the 2026-10-05 downstream sync [#184](https://github.com/ZGEnergy/paseo/pull/184) PR-merge) on the earlier syncs #181/#178/#176/#174/#173 down to the 2026-09-30 baseline `c8f622c336`), landing with green CI/provenance and superseding auto sync [#187](https://github.com/ZGEnergy/paseo/pull/187) (auto-closed MERGED). #188's conflicts: `.github/workflows/nix.yml`, `scripts/trace-daemon.mjs`, `packages/app/src/assistant-selection-copy/content.web.ts`, `packages/app/src/assistant-selection-copy/markup.ts`, `packages/plugin/package.json`, `package-lock.json`, `nix/npm-deps.hash`.
- fork upstream mirror: `origin/main` at `543e3712e1` — fast-forwarded from `8ced059b4d` (29 commits, carried by the #187/#188 window): the 0.11.0-beta.5 cut, resolved daemon dependencies and working terminals [#5523](https://github.com/getpaseo/paseo/pull/5523), assistant selection-copy fixes ([#6138](https://github.com/getpaseo/paseo/pull/6138), [#6158](https://github.com/getpaseo/paseo/pull/6158), [#6181](https://github.com/getpaseo/paseo/pull/6181), [#6195](https://github.com/getpaseo/paseo/pull/6195)), OMP history/error fixes ([#6112](https://github.com/getpaseo/paseo/pull/6112), [#6115](https://github.com/getpaseo/paseo/pull/6115), [#6198](https://github.com/getpaseo/paseo/pull/6198)), OpenCode v2 permission/question fixes ([#6177](https://github.com/getpaseo/paseo/pull/6177), [#6188](https://github.com/getpaseo/paseo/pull/6188)), daemon stays up when nobody reads its output ([#6117](https://github.com/getpaseo/paseo/pull/6117)), plugin CLIs on Windows + the `.oxlintrc.json` lint config ([#6151](https://github.com/getpaseo/paseo/pull/6151)), Vue highlighting, usage login scoping ([#6156](https://github.com/getpaseo/paseo/pull/6156)), Muse fixes ([#6021](https://github.com/getpaseo/paseo/pull/6021), [#6159](https://github.com/getpaseo/paseo/pull/6159)), app-language PR panel labels ([#6196](https://github.com/getpaseo/paseo/pull/6196), [#6208](https://github.com/getpaseo/paseo/pull/6208)), hover-card and Codex speed-bolt fixes, chat rows across virtual layout changes ([#6172](https://github.com/getpaseo/paseo/pull/6172)), desktop browser_type composer fix ([#6207](https://github.com/getpaseo/paseo/pull/6207)), website plugin directory closing section ([#6160](https://github.com/getpaseo/paseo/pull/6160)).
- upstream: `getpaseo/paseo` `main` at `4ede81e841` — one commit beyond fork `main` (Usage as a modal over the current screen, [#6216](https://github.com/getpaseo/paseo/pull/6216); app UX, not a capability replacement). Every capability verdict below was re-verified against this exact tree on 2026-10-06: zero `addMarkdownExtension`, zero `MarkdownSource` anywhere in `packages/` (host or plugin-facing), `SvgXml` only in internal icon/catalog components (`material-file-icon`, `provider-catalog-list`, `provider-icons` + its test, `pair-device-section`) and a test stub (`test-stubs/react-native-svg`); `completeTurnAfterProviderIdle` still completes from provider state alone with an unbounded `providerIdleScheduler.waitForRetry()` retry and a bare 600s absolute deadline (`OMP_PROVIDER_IDLE_DEADLINE_MS`) with no silence/failure budgets and no child-activity awareness; `acceptsPromptDuringAutonomousTurn`, `settleLeftoverAutonomousTurn`, and `hasBlockingRun` absent (zero matches in `packages/server`); `task_notification` still routes only through `appendTaskNotificationEvents`.

## Plugin assistant-markdown surface

**Status:** `waiting`

Last reviewed: 2026-10-06

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
- [ZGEnergy/paseo#142](https://github.com/ZGEnergy/paseo/pull/142) through [#184](https://github.com/ZGEnergy/paseo/pull/184) (2026-09-22 → 2026-10-05 daily downstream syncs, heads `af0660fcf` … `d54b4ff83b`): carried the surface, the host-scoped registry, and the plugin SDK markdown dependency declarations forward through every window, each verified on its merged tree (per-window union detail in this file's git history and the sync PR bodies). The two most recent: #181 unioned upstream's #5945 measured-height fast path ahead of the fork's host-scoped `estimateStreamItemHeight` fallback; #184 unioned upstream's #5970 image-space object-param height shape with the fork's optional `serverId`.
- [ZGEnergy/paseo#188](https://github.com/ZGEnergy/paseo/pull/188) (head `7dccbf4418`, 2026-10-06 downstream sync, resolving auto sync [#187](https://github.com/ZGEnergy/paseo/pull/187)): the window's four selection-copy conflicts (`content.web.ts`, `markup.ts`, plus the auto-merged `content.browser.test.ts`) resolved as a union — upstream's #6181/#6195 image copy dataset (`markdownCopyImageDataSet`, `MARKDOWN_COPY_SRC_ATTRIBUTE`/`MARKDOWN_COPY_ALT_ATTRIBUTE`), #6158 `value`-attribute list numbering, #6195 `startAfterImageFrame`, and #6138 `selectedCodeRegion`/`selectsNothingOutside`, alongside the fork's MarkdownSource verbatim copy (`MARKDOWN_COPY_SOURCE_ATTRIBUTE`, the `declaredMarkdownSource` Turndown rule, the source attribute in the visible-void selector, the sentinel + presentational-unwrap exclusion now extracted into `prepareTurndownSentinels` to satisfy the new complexity-20 ceiling from #6151's `.oxlintrc.json`); `hasMarkdownContent` unions upstream's `img` selectors with the fork's source-attribute selector; `packages/plugin/package.json`/`package-lock.json` unioned as upstream 0.11.0-beta.5 alignment + the fork's markdown dependency declarations. The extension API, host-scoped registry, and host-provided `SvgXml`/`MarkdownSource` are unchanged; 126/126 app plugin-markdown tests and 54/54 selection-copy browser tests pass on the merged tree.

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) (SvgXml, head `1a1144648baa`), [#4750](https://github.com/getpaseo/paseo/pull/4750) (assistant markdown extensions, head `15efaa1b284a`), and [#4752](https://github.com/getpaseo/paseo/pull/4752) (MarkdownSource, head `bfc1e0ecdc1a`) are open and unmerged as of 2026-10-06 with unchanged heads (last updates 2026-09-12; #4750's 2026-10-02 updatedAt bump carried no new commits — only a gallery-plugin author's composition/priority questions); merge order is 4749 → 4750 → 4752.
- Upstream `main` at `4ede81e841` (re-verified 2026-10-06) contains no `addMarkdownExtension`, no `MarkdownSource` of any kind, and no host-provided `SvgXml` (the only `SvgXml` matches are internal icon/catalog components and a test stub). The integrated window (`8ced059b4d..543e3712e1`) touches assistant selection copy (#6138/#6158/#6181/#6195 — adopted as the union above), nix/trace packaging (#5523 — not extension-related), and adds the `.oxlintrc.json` lint config (#6151 — no extension API surface); #6216 (Usage modal) is app UX.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-10-06

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
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) through [#184](https://github.com/ZGEnergy/paseo/pull/184) (2026-09-24 → 2026-10-05 daily downstream syncs): carried the bounded gate forward through every window, each verified on its merged tree (per-window detail in this file's git history and the sync PR bodies). Notables: #150 adopted upstream's aborted-terminal classification (#5243); #171 verified 13 gate-symbol matches with zero `providers/omp` conflicts; #173 adopted the #5550 OMP first-class rework wholesale around the unchanged gate (`OmpProviderIdleAttempt` budgets 60s other / 600s compaction / 600s subagent silence, 3-failure budget, 60-minute ceiling; `providerIdleGate` re-entry dedup; child-aware completion); #184 unioned the `agent.test.ts` vitest import line and adopted #6110's prompt-rejection failure with no gate changes.
- [ZGEnergy/paseo#188](https://github.com/ZGEnergy/paseo/pull/188) (head `7dccbf4418`, 2026-10-06 downstream sync, resolving auto sync [#187](https://github.com/ZGEnergy/paseo/pull/187)): zero `providers/omp` conflicts; the window's only gate-file change is the additive `this.pendingPromptResults.clear()` on OMP process restart (#6112 family — request ids restart with each OMP process), adopted with no gate changes; gate symbols (`accrueProviderIdleSilence`, `ompProviderIdleBudgetMs`, `ompSubagentFingerprint`, `terminalizeSubagents`) verified on the merged tree (14 matches in `providers/omp/agent.ts`); focused `providers/omp/agent.test.ts` 110/110 on the merged tree.

Upstream evidence:

- Upstream's #5550 "OMP first-class epic" (merged 2026-09-29, in the fork mirror window) explicitly lists [getpaseo/paseo#2232](https://github.com/getpaseo/paseo/issues/2232) "parent agent shows idle while its subagents run" under **Out of scope** ("fixing that needs agent-status changes") — upstream `main` still does not provide any checklist behavior (re-verified 2026-10-06 at `4ede81e841`): `completeTurnAfterProviderIdle` polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors and an unbounded `providerIdleScheduler.waitForRetry()` retry, plus a bare 600s absolute deadline (`OMP_PROVIDER_IDLE_DEADLINE_MS`) with no silence/failure budgets and no child-activity awareness; zero gate-symbol matches in `packages/server`.
- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371) (closed unmerged 2026-09-08 — the maintainer closed it "in favor of the workspace activity implementation merged in [#2777](https://github.com/getpaseo/paseo/pull/2777)", noting #2232's missing-native-handle half "still needs a separate fix"), [#3667](https://github.com/getpaseo/paseo/pull/3667) (closed unmerged), and [#4977](https://github.com/getpaseo/paseo/pull/4977) (closed; superseded by #5550, whose supersedes note explicitly leaves #4977's shared `agent-run-state.ts`/`jsonl-rpc-process.ts` changes, paging drain, and Pi edit out). #2777 (merged 2026-08-02, in upstream main and the mirror) feeds provider-native child activity into workspace-status aggregation — workspace rows show `running` while a child works — with the explicit non-goal "Do not change parent agent lifecycle state"; it is not the OMP provider idle gate. The open [getpaseo/paseo#5362](https://github.com/getpaseo/paseo/pull/5362) (head `082ebaa3ccc5`, unchanged since 2026-09-24) extends the same display-only direction — a client-derived `waiting_on_subagent` state whose body declares "No daemon lifecycle, protocol, persisted state or completion-notification changes" a non-goal, with an unresolved P1 (resolved child permissions keep parents blocked) — and does not carry any checklist behavior; [getpaseo/paseo#6056](https://github.com/getpaseo/paseo/pull/6056) (open 2026-10-04) is review-state scoping only. 2026-10-06 searches of open upstream PRs found no candidate for yield/child-interruption behavior.

## OMP Ask option descriptions

Retired — see [Retired history](#retired-history).

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-10-06

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live (`agent-manager.ts` pending foreground runs, `agent-run-state.ts` autonomous run tracking).
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes (`settleLeftoverAutonomousTurn`).
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) through [#184](https://github.com/ZGEnergy/paseo/pull/184) (2026-09-24 → 2026-10-05 daily downstream syncs): carried admission and settlement forward through every window, each verified on its merged tree (per-window detail in this file's git history and the sync PR bodies). Notables: #165 unioned `agent-sdk-types.ts` keeping both upstream's `initialTimeline` and the fork's `acceptsPromptDuringAutonomousTurn`; #173 confirmed the window's only Claude-provider change (#5750 hook scope) carried no lifecycle behavior; #176 re-added the fork's `acceptsPromptDuringAutonomousTurn` forwarding getter after upstream's `ForwardedAgentSession` registry rework; #184 kept both the fork's forwarding getter and upstream's `usageSession` binding in `wrapSessionProvider`.
- [ZGEnergy/paseo#188](https://github.com/ZGEnergy/paseo/pull/188) (head `7dccbf4418`, 2026-10-06 downstream sync, resolving auto sync [#187](https://github.com/ZGEnergy/paseo/pull/187)): zero `providers/claude` or `agent-manager` conflicts; the window's server-side changes (#6117 daemon output handling, OMP/usage/website work) touch no Claude lifecycle paths; admission symbols (`PendingForegroundRun`, `acceptsPromptDuringAutonomousTurn` in `agent-manager.ts`/`agent-sdk-types.ts`/`provider-registry.ts`/`providers/claude/agent.ts`) and settlement (`settleLeftoverAutonomousTurn` wired to `task_notification` with `taskProtocolSource.hasRunningTasks()`) verified present on the merged tree; focused `providers/claude/agent.test.ts` + `agent-manager.test.ts` 285/285 on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366) closed unmerged 2026-09-08 (maintainer: "in favor of the active-turn steering approach introduced in merged [#3394](https://github.com/getpaseo/paseo/pull/3394)"); its successor [getpaseo/paseo#5457](https://github.com/getpaseo/paseo/pull/5457) "fix(server): keep background subagents alive when prompting a busy agent" is open and unmerged as of 2026-10-06, head `a99cf52d2b98` (updated 2026-10-03; last two commits add the staged-terminal-event replay guards), and still carries admission scope only — `hasBlockingRun`/`acceptsPromptDuringAutonomousTurn` plumbing and tests, no `settleLeftoverAutonomousTurn`, no completed task-notification settlement of leftover autonomous turns.
- Upstream active-turn steering (commit `f9e1def95455`, via #3394) and archive-continuation (commit `613cbbe9ef7b`) cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- Adjacent open upstream PRs, none merged and none carrying the missing behaviors (re-checked 2026-10-06): [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) (stop-control candidate, unchanged since 2026-09-11), [#5362](https://github.com/getpaseo/paseo/pull/5362) (client display state), [#6056](https://github.com/getpaseo/paseo/pull/6056) (review gating while provider subagents run), [#6072](https://github.com/getpaseo/paseo/pull/6072) (leave a background subagent's permission request to the user — permission UX), [#6129](https://github.com/getpaseo/paseo/pull/6129) (subagent card action log persistence across daemon restart — card persistence), [#5991](https://github.com/getpaseo/paseo/pull/5991) (transcript replay budget — replay presentation), [#5022](https://github.com/getpaseo/paseo/pull/5022) (app-side follow-up queueing, not provider-level admission).
- Upstream `main` at `4ede81e841` (re-verified 2026-10-06) routes `task_notification` through `appendTaskNotificationEvents`, which appends provider-subagent or timeline tool-call events only and never settles a leftover autonomous turn; `acceptsPromptDuringAutonomousTurn`, `settleLeftoverAutonomousTurn`, and `hasBlockingRun` are absent (zero matches in `packages/server`); `PendingForegroundRun`/`startPendingForegroundTurn` exist as generic foreground pending-run tracking without an admission gate; and `steerOrReplaceActiveTurn` still falls back to `replaceAdmittedForegroundTurn` when provider steering is unavailable or declined.

## Retired history

### OMP Ask option descriptions

**Status:** retired on 2026-09-25 by adopting upstream [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) through downstream sync [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, two-parent merge of `f58b84eb4` + live `main` `43a2a7969`; upstream commit `90d978ab68570f531a9b728d7360ae09f36f1fec`, PR merged 2026-09-25T08:25:19Z).

Upstream `main` provides every checklist behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options (`readSelectOptions` index-maps details onto labels; both question builders pass `description` through; the app question card's description passthrough predates this window).
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options (details array shorter than the labels, non-record entries, non-string or whitespace-only `description`, and extra entries all degrade to `{ label }`; the schema accepts any shape via `optionDetails: z.unknown().optional()`).
- [x] OMP `16.3.9` and later remain supported; the merged window touches no version floor.

The fork's implementation ([ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`; [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`) was byte-identical to what upstream merged — the same author ported it upstream, and upstream's follow-up commit adopted the same `toStrictEqual` test assertions the fork already carried. The downstream sync therefore adopted upstream's copy directly: the merged tree keeps exactly one copy of `readSelectOptions`, both builders, the `optionDetails` schema, and the tests, and a repo-wide search shows `optionDetails` only in the OMP provider files that now equal upstream's implementation — no fork-only code, shims, aliases, or duplicated tests remain.

Retirement proof (2026-09-25, on the merged tree at `c80ef9e10`): `npx vitest run packages/server/src/server/agent/providers/omp/agent.test.ts` 78/78 pass (including the described/malformed/combined option-details tests); `agent/mcp-server.test.ts` 120/120; `npm run typecheck` clean; lint 0/0 on all changed files; format check clean; fork/upstream implementation equality verified by diff (`agent.ts`, `rpc-types.ts`, `omp-harness.ts` identical to the fork tip; `agent.test.ts` differs only by upstream's blank-line normalization). Carried forward unchanged by the 2026-09-27 ([#165](https://github.com/ZGEnergy/paseo/pull/165)), 2026-09-28 ([#168](https://github.com/ZGEnergy/paseo/pull/168)), and 2026-09-29 ([#171](https://github.com/ZGEnergy/paseo/pull/171)) syncs and every sync since.

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

Operational note (2026-10-06): bare `npm run lint` (oxlint) finds zero files on this workstation, in any checkout under `~/code/zge-workspace`, because `/home/joe/code/zge-workspace/.gitignore` is an ignore-all `*` whitelist file above the repos and oxlint applies ancestor `.gitignore` hierarchies during directory walks (verified by probe outside the workspace: an ancestor ignore-all `.gitignore` reproduces it; single-file linting works). CI runners are unaffected — lint there is authoritative. Local runs must lint resolved files by explicit path. The 2026-10-06 sync (#188) had to commit with `--no-verify` for this reason, after per-file lint verification.

This period's excluded-operations landings: [ZGEnergy/paseo#185](https://github.com/ZGEnergy/paseo/pull/185) (2026-10-05 ledger refresh), [#186](https://github.com/ZGEnergy/paseo/pull/186) (2026-10-05 Hub agent connector docs), and [#188](https://github.com/ZGEnergy/paseo/pull/188) (2026-10-06 downstream sync, head `7dccbf4418`, two-parent merge: first parent `4a0485eb8b`, second parent `543e3712e1` = live `main`; landed as PR-merge `00e5c95f36`, superseding auto sync [#187](https://github.com/ZGEnergy/paseo/pull/187) — DIRTY on 7 files: `nix.yml`, `npm-deps.hash`, `package-lock.json`, `content.web.ts`, `markup.ts`, `packages/plugin/package.json`, `trace-daemon.mjs` — auto-closed MERGED). Open and pending in excluded categories: [#153](https://github.com/ZGEnergy/paseo/pull/153) (ZGE relay deploy config at `relay.zgenergy.app`, open since 2026-09-24).
