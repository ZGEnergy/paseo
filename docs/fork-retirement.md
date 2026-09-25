# Fork retirement

## Active capability count

**3 waiting, 1 retired this period.** OMP Ask option descriptions left `waiting` on 2026-09-25: upstream merged [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628), whose implementation is byte-identical to the fork's, and the 2026-09-25 downstream sync adopted it — see retired history. The remaining three capabilities are still `waiting`: live upstream `main` at `43a2a7969cbf049455b998d38ccd18ce179a88d1` does not yet provide every required behavior for any of them. One older retired history entry also exists (host KaTeX, superseded by the plugin surface).

Last reviewed: 2026-09-25

Evidence baseline:

- fork integration: `origin/internal/main` at `677dbe11dfaaa5ee73476a24065a1a767169d476` (PR-merge commit; head `c80ef9e10`, two-parent merge: first parent `f58b84eb4`, second parent `43a2a7969` = live `main`) — the 2026-09-25 downstream sync [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) landed by Upstream import merge with green CI and provenance, resolving the conflicting auto sync [ZGEnergy/paseo#158](https://github.com/ZGEnergy/paseo/pull/158) (auto-closed MERGED). The only conflict was one hunk of `packages/server/src/server/agent/providers/omp/test-utils/omp-harness.ts` (the fake-omp import line), resolved to the fork's strict-superset import (`OmpRuntimeEvent` plus `type FakeOmpSubagentSnapshot`); both sides' identical `emit(OmpRuntimeEvent)` helper merged cleanly and appears once. Upstream #3628's option-details implementation is byte-identical to the fork's, so the merged tree carries exactly one copy of every option-details piece and no fork-only variant remains. No derived-file churn in this window (`package-lock.json`, `nix/npm-deps.hash`, workspace versions untouched).
- fork upstream mirror: `origin/main` at `43a2a7969` — fast-forwarded from `e3c853df5` (9 commits: OMP described select options [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) merged 2026-09-25 as `90d978ab6`, Pi rewind [#5383](https://github.com/getpaseo/paseo/pull/5383), plugin theme-list scroll [#5374](https://github.com/getpaseo/paseo/pull/5374), provider-check restart [#5372](https://github.com/getpaseo/paseo/pull/5372), set-password stdin note [#5358](https://github.com/getpaseo/paseo/pull/5358), blocking send_agent_prompt 30s notice [#5347](https://github.com/getpaseo/paseo/pull/5347), model-less Pi default model [#5343](https://github.com/getpaseo/paseo/pull/5343), weekday date display [#5341](https://github.com/getpaseo/paseo/pull/5341), OpenCode reconnect [#5338](https://github.com/getpaseo/paseo/pull/5338)).
- upstream: `getpaseo/paseo` `main` at `43a2a7969` — every remaining capability verdict below was re-verified against this exact tree on 2026-09-25 (zero `addMarkdownExtension`, zero plugin-facing `MarkdownSource`, `SvgXml` still internal icon/catalog and test-stub use only; `completeTurnAfterProviderIdle` still completes from provider state alone with an unbounded `providerIdleScheduler.waitForRetry()` retry at `packages/server/src/server/agent/providers/omp/agent.ts:2216` and `interrupt()` still calls `terminalizeActiveWork()` at lines 1158/1813/2168; `appendTaskNotificationEvents` still appends events only; `steerOrReplaceActiveTurn` in `agent-manager.ts` still falls back to `replaceAdmittedForegroundTurn`; `optionDetails` decode is now present via #3628).

## Plugin assistant-markdown surface

**Status:** `waiting`

Last reviewed: 2026-09-25

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

Upstream evidence:

- [getpaseo/paseo#4749](https://github.com/getpaseo/paseo/pull/4749) (SvgXml, head `1a1144648baa`), [#4750](https://github.com/getpaseo/paseo/pull/4750) (assistant markdown extensions, head `15efaa1b284a`), and [#4752](https://github.com/getpaseo/paseo/pull/4752) (MarkdownSource, head `bfc1e0ecdc1a`) are open and unmerged as of 2026-09-25 with unchanged heads (last updates 2026-09-12); merge order is 4749 → 4750 → 4752.
- Upstream `main` at `43a2a7969` contains no `addMarkdownExtension`, no plugin-facing `MarkdownSource` host component, and no host-provided `SvgXml` (re-verified 2026-09-25; the only `SvgXml` matches are six internal icon/catalog components and test stubs). Upstream's plugin work in this window — plugin theme-list scrolling ([getpaseo/paseo#5374](https://github.com/getpaseo/paseo/pull/5374)) and the open [getpaseo/paseo#4985](https://github.com/getpaseo/paseo/pull/4985) "let local plugins provide Forge adapters" — does not provide the extension API.

## OMP task and subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-25

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
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): adopted upstream's aborted-terminal-response classification (#5243) inside the fork's `completeTurn` — the `turn_canceled` path keeps the fork's `terminalizeSubagents: false` sparing so live children survive a user Stop — and upstream's deferred completion after custom messages (#3258), which now flows through the fork's bounded gate. Upstream's unbounded retry loop was replaced by the fork's bounded scheduler, which subsumes upstream's interrupt-race re-check via ownership re-checks at completion and at the retry decision. Upstream's `holdStateRequests()` test helper replaced the fork's duplicate.
- [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, 2026-09-25 downstream sync): the single conflict was the OMP test harness import line, resolved to the fork's strict-superset import; the fork's lifecycle code (`completeTurnAfterProviderIdle` bounded gate, `accrueProviderIdleSilence`, subagent snapshots, interruption-safe children) is unchanged on the merged tree. All 78 OMP provider tests pass on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3371](https://github.com/getpaseo/paseo/pull/3371), head `fa9fc5e6244e`, remains closed unmerged (re-checked 2026-09-25, unchanged since 2026-09-08) in favor of [#2777](https://github.com/getpaseo/paseo/pull/2777), whose merged change aggregates native-child activity into workspace status while explicitly leaving parent lifecycle unchanged.
- Open upstream PRs adjacent to this capability, none merged and none carrying the missing behaviors (re-checked 2026-09-25): [getpaseo/paseo#4977](https://github.com/getpaseo/paseo/pull/4977) "omp provider: mid-turn steering, paging drain, fast-mode passthrough, and lifecycle hardening" (head `8b360274d668`, unchanged since 2026-09-24; adds an absolute completion deadline `OMP_PROVIDER_IDLE_DEADLINE_MS = 600_000` — the first upstream movement toward bounded completion, but only the absolute-elapsed dimension, no silence/failure budgets, no child-activity awareness, no yield settlement or interruption-safe children) and [getpaseo/paseo#5362](https://github.com/getpaseo/paseo/pull/5362) "Fix completed parents showing Done while attached subagents work" (head `082ebaa3ccc5`; client-only `waiting_on_subagent` display state, parent lifecycle unchanged).
- New adjacent-but-distinct upstream PRs in this window, none carrying the missing behaviors (re-checked 2026-09-25): [getpaseo/paseo#5386](https://github.com/getpaseo/paseo/pull/5386) "Report a background send_agent_prompt's started turn as running" (MCP tool reporting layer) and [getpaseo/paseo#5132](https://github.com/getpaseo/paseo/pull/5132) "honor purpose: history in omp, pi, acp, opencode and plugin providers" (history purpose, not turn lifecycle). The 9-commit upstream window touched `providers/omp` only through #3628 (option details — retired capability below), with zero lifecycle changes.
- Upstream `main` at `43a2a7969` still completes from provider state alone (re-verified 2026-09-25): `completeTurnAfterProviderIdle` (defined at `providers/omp/agent.ts:2197`) polls `runtimeSession.getState()` until `!isStreaming && !isCompacting` with swallowed state errors and an unbounded scheduler retry loop (`providerIdleScheduler.waitForRetry()` at line 2216) — no silence/elapsed budget, no failure budget, no child-activity awareness — and `interrupt()` still calls `terminalizeActiveWork()` (call sites at lines 1158/1813/2168), terminalizing running children.

## Claude background and autonomous subagent lifecycle correctness

**Status:** `waiting`

Last reviewed: 2026-09-25

Observable behavior:

- [x] A follow-up prompt does not interrupt a compatible background child; foreground and incompatible autonomous runs still block or replace correctly.
- [x] A completed task notification settles a leftover autonomous turn only after no declared child remains running.
- [x] Ordinary live stream wakes remain open, and stale interrupt-window frames cannot create or settle the wrong turn.
- [ ] Upstream `main` provides the full behavior.

Fork evidence:

- [ZGEnergy/paseo#11](https://github.com/ZGEnergy/paseo/pull/11), merge `bc5e4306aef008f0e09a3d173f7526d26b89c7e9`: prompt admission while compatible background children remain live.
- [ZGEnergy/paseo#42](https://github.com/ZGEnergy/paseo/pull/42), merge `2ef63b4f293495e8bff3e783c75d6137e327dde2`: task-protocol leftover-turn settlement without breaking live wakes.
- [ZGEnergy/paseo#150](https://github.com/ZGEnergy/paseo/pull/150) (head `a5fd41656`, 2026-09-24 downstream sync): the auto-merged upstream changes to `providers/claude/agent.ts` and `agent-manager.ts` are rewind-anchoring (#5285, #5289), slash-command ordering (#5240), and timeline hydration (#5286) work; the fork's admission and leftover-turn settlement paths are unchanged on the merged tree.
- [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, 2026-09-25 downstream sync): no conflicts touched `providers/claude` or `agent-manager`; the upstream window contains zero Claude-provider commits and the fork's admission and settlement paths are unchanged on the merged tree.

Upstream evidence:

- [getpaseo/paseo#3366](https://github.com/getpaseo/paseo/pull/3366), head `bf3820d81cc1`, remains closed unmerged (re-checked 2026-09-25, unchanged since 2026-09-08) in favor of [#3394](https://github.com/getpaseo/paseo/pull/3394), merge `42245d139ad1`.
- Upstream active-turn steering (commit `f9e1def95455`) and archive-continuation (commit `613cbbe9ef7b`) cover explicit steering, stale interrupt-window frames, and archived workspaces. They do not replace default follow-up admission during an autonomous turn or completed task-notification settlement.
- Adjacent open upstream PRs, none merged and none carrying the missing behaviors (re-checked 2026-09-25): [getpaseo/paseo#4594](https://github.com/getpaseo/paseo/pull/4594) (head `1549ea566e16`, unchanged since 2026-09-11; still the "spare background subagents from an interrupt, and let one be stopped" stop-control candidate), [getpaseo/paseo#4633](https://github.com/getpaseo/paseo/pull/4633) (head `1132cdb0e6e5`, unchanged since 2026-09-10), [getpaseo/paseo#5022](https://github.com/getpaseo/paseo/pull/5022) "fix: queue follow-ups when providers cannot steer" (head `e9692f7f34dd`, unchanged since 2026-09-17; app-side composer/session-store queueing of follow-ups, not provider-level admission), and [getpaseo/paseo#5336](https://github.com/getpaseo/paseo/pull/5336) "Show Claude option previews in the question card" (head `a8d0e8729d35`, updated 2026-09-24; app-side previews, not lifecycle).
- New adjacent-but-distinct upstream PRs in this window, none carrying the missing behaviors (re-checked 2026-09-25): [getpaseo/paseo#5386](https://github.com/getpaseo/paseo/pull/5386) (send_agent_prompt started-turn reporting) and [getpaseo/paseo#5359](https://github.com/getpaseo/paseo/pull/5359) "Let archive settle an ACP agent whose transport is dead" (ACP archive settlement, not Claude autonomous-turn settlement).
- Upstream `main` at `43a2a7969` (re-verified 2026-09-25) routes `task_notification` through `appendTaskNotificationEvents`, which appends provider-subagent/timeline events only and never settles a leftover autonomous turn; `steerOrReplaceActiveTurn` in `agent-manager.ts` still falls back to `replaceAdmittedForegroundTurn` when provider steering is unavailable, so follow-up admission still replaces the turn and a compatible background child neither keeps the parent admitted nor blocks replacement. The 9-commit upstream window touches `providers/claude` zero times.

## Retired history

### OMP Ask option descriptions

**Status:** retired on 2026-09-25 by adopting upstream [getpaseo/paseo#3628](https://github.com/getpaseo/paseo/pull/3628) through downstream sync [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (head `c80ef9e10`, two-parent merge of `f58b84eb4` + live `main` `43a2a7969`; upstream commit `90d978ab68570f531a9b728d7360ae09f36f1fec`, PR merged 2026-09-25T08:25:19Z).

Upstream `main` provides every checklist behavior:

- [x] Optional `optionDetails` descriptions are aligned with labels and reach question-card options (`readSelectOptions` index-maps details onto labels; both question builders pass `description` through; the app question card's description passthrough predates this window).
- [x] Missing, malformed, blank, short, or extra description metadata falls back safely to label-only options (details array shorter than the labels, non-record entries, non-string or whitespace-only `description`, and extra entries all degrade to `{ label }`; the schema accepts any shape via `optionDetails: z.unknown().optional()`).
- [x] OMP `16.3.9` and later remain supported; the merged window touches no version floor.

The fork's implementation ([ZGEnergy/paseo#30](https://github.com/ZGEnergy/paseo/pull/30), merge `75c020f15d0fac77eed5087b61c0230dcdeade42`; [ZGEnergy/paseo#56](https://github.com/ZGEnergy/paseo/pull/56), merge `ef35d039c1f5cf2692f76855e05464f9d01b64cf`) was byte-identical to what upstream merged — the same author ported it upstream, and upstream's follow-up commit adopted the same `toStrictEqual` test assertions the fork already carried. The downstream sync therefore adopted upstream's copy directly: the merged tree keeps exactly one copy of `readSelectOptions`, both builders, the `optionDetails` schema, and the tests, and a repo-wide search shows `optionDetails` only in the OMP provider files that now equal upstream's implementation — no fork-only code, shims, aliases, or stale tests remain.

Retirement proof (2026-09-25, on the merged tree at `c80ef9e10`): `npx vitest run packages/server/src/server/agent/providers/omp/agent.test.ts` 78/78 pass (including the described/malformed/combined option-details tests); `agent/mcp-server.test.ts` 120/120; `npm run typecheck` clean; lint 0/0 on all changed files; format check clean; fork/upstream implementation equality verified by diff (`agent.ts`, `rpc-types.ts`, `omp-harness.ts` identical to the fork tip; `agent.test.ts` differs only by upstream's blank-line normalization).

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

This period's excluded-operations landings: [ZGEnergy/paseo#147](https://github.com/ZGEnergy/paseo/pull/147) (resolve the daemon runner through a traced server entrypoint so `upgrade:local` Nix closures include `exports.js`), [ZGEnergy/paseo#157](https://github.com/ZGEnergy/paseo/pull/157) (Upstream sync schedule moved to 5:30 America/Denver), and [ZGEnergy/paseo#159](https://github.com/ZGEnergy/paseo/pull/159) (2026-09-25 downstream sync adopting upstream #3628).
