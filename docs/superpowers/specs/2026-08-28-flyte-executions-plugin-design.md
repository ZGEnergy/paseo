# Flyte executions plugin — design

Status: design approved 2026-08-28. No implementation this session.
Mockups: `mockups/flyte-plugin/concept-a.html`, `concept-b.html`, `concept-hybrid.html` (hybrid is the settled runs design), `spike-cluster.html` (cluster usage card).

## Problem

Paseo has no visibility into Flyte executions. Answering "did last night's run finish?" or "which task is stuck right now?" today means the Flyte console or the repo's Python CLI — neither is glanceable from a phone. The plugin adds a read-only Flyte runs surface to Paseo, backed by the anonymous flyteadmin REST API at `http://flyte.cluster.zge` (verified: `/home/joe/code/zge-workspace/ercot-power-flow-poc/src/zge_ercot_power_flow/flyte/admin_client.py:189`).

Target project: `ercot-power-flow-poc`, domain `experiments`, with an in-app project switcher (the cluster also has `market-ercot` and `sandbox`).

## Which runs — the settled decision

**The N most recent executions, any phase, newest first**, with token-based load-more. Rejected alternatives and why:

- _Running only_: usually empty (typically 0–2 concurrent at ~16 runs/day); a dead panel half the time. Also rejected as a section: recent-N keeps running runs inline by `created_at` — no pinning, no mixed-field row split.
- _Time-bounded window_: a quiet week yields an empty panel; count-bounding never does.
- Terminal runs age out naturally: newer runs push older ones off the bottom.

Sub-decisions:

- **Pagination**: first page 25, "Load more" appends 25 per press (react-query `useInfiniteQuery`, admin `token` param).
- **CI filter**: executions on workflows starting `.flytegen.` (the `ledger-*` "verify and land" automation, no labels) are filtered out in the plugin server. The panel shows human-launched runs.
- **Label filtering**: none in v1. Labels render as data. (Admin cannot filter by label server-side — `query.py:207` filters client-side; same constraint applies to us.)
- **Project switcher**: a compact toolbar row at the top of the plugin body (below the host header — the plugin owns only the body, `public-docs/plugins/reference.md:167`), showing the muted active `project · domain` text with a small ChevronDown `Icon` as a Pressable; tapping expands a transient inline list (hand-built View/Text — plugins get no DropdownMenu primitive). The cluster exposes three projects today (`ercot-power-flow-poc`, `market-ercot`, `sandbox`, all domain `experiments`, via `GET /api/v1/projects`). Selecting one re-keys the runs queries; the selection is sticky — the plugin server records the last viewed project in a small JSON state file, so the next open starts there from any client device (there is no plugin storage API, and browser storage is per-device web-only — `public-docs/plugins/reference.md:86`). Domain stays fixed at the env default; all three projects have only `experiments`.

Real-data facts the design depends on (pulled 2026-08-28):

- `closure.duration` is **null while RUNNING** — confirmed on `main-6fff59b-df70`. Elapsed must be computed from `startedAt`. Terminal rows carry real durations.
- ~15–16 runs/day; durations span 4m (dispatch) to 7.9h (size `l` scenario).
- Concurrent reality: 2026-08-26 20:36 UTC had 9 executions in flight at once.
- Labels present on all non-CI runs: `authorized_by`, `pr`, `size`, `start_date`, `end_date`, `cluster`, occasionally `ab`/`arm`.
- Node-level failure is visible: `main-72629b8-fb00` failed at node `n6` (1005s) after six succeeded nodes — the detail drill-down surfaces exactly this.

## Where it lives

Sidebar item **"Flyte runs"** opening a full screen (`plugin.addSidebarItem` + `plugin.addSurface("main", …)`), plus a Command Center item that opens the same screen (`plugin.addCommandCenterItem`). Chosen over a workspace panel because executions are project-scoped, not workspace-scoped — the same data would repeat identically in every sibling workspace tab, and a panel is a tap deeper on mobile. Lucide icon: `Plane`.

Desktop: settings-shell list+detail — the canonical 320px list column (`SETTINGS_DESKTOP_SIDEBAR_WIDTH`, `packages/app/src/constants/layout.ts`) on `surfaceSidebar`, detail pane right. Phone: the list and detail are both in-surface views — plugins cannot push routes or retitle the host header (`PluginSurfaceProps` carries only theme/host/layout, `packages/plugin/src/contracts.ts:23-35`; the host always renders its own `ScreenHeader`, `packages/app/src/plugins/surface-screen.tsx`). Tapping a row swaps the body to the detail view with a body-level back control ("‹ Flyte runs") under the persistent host header; desktop keeps both panes visible. One `layout.compact` branch, same components.

## RPC contract (Zod sketch)

Plugin RPC names use dotted namespaces (`flyte.executions.list`) even though plugin examples use flat names — consistent with the repo's RPC direction.

```ts
// flyte.shared.ts
import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

const executionSummary = z.object({
  name: z.string(),
  workflow: z.string(),
  phase: z.string(), // verbatim Flyte phase; mapped client-side
  createdAt: z.string(), // ISO 8601
  startedAt: z.string().nullable(),
  durationSeconds: z.number().nullable(), // null while RUNNING
  labels: z.record(z.string(), z.string()),
  consoleUrl: z.string(),
  nodeProgress: z
    .object({
      succeeded: z.number(),
      total: z.number(),
    })
    .nullable(), // present on RUNNING rows; null otherwise or on node-fetch failure
});

export const listExecutionsRpc = defineRpc({
  name: "flyte.executions.list",
  input: z.object({
    cursor: z.string().nullable(), // admin page token; null = first page
    pageSize: z.number().int().min(1).max(100),
    project: z.string().optional(), // omitted = sticky last-viewed project (server default)
  }),
  output: z.object({
    executions: z.array(executionSummary),
    nextCursor: z.string().nullable(), // null = no more pages
  }),
});

export const executionDetailRpc = defineRpc({
  name: "flyte.executions.detail",
  input: z.object({ name: z.string(), project: z.string().optional() }),
  output: z.object({
    execution: executionSummary,
    nodes: z.array(
      z.object({
        nodeId: z.string(),
        taskName: z.string().nullable(), // from task executions; null if unavailable
        phase: z.string(), // e.g. SUCCEEDED, DYNAMIC_RUNNING, FAILED
        startedAt: z.string().nullable(),
        durationSeconds: z.number().nullable(),
        logs: z.array(z.object({ name: z.string(), uri: z.string() })),
      }),
    ),
  }),
});

export const clusterUsageRpc = defineRpc({
  name: "flyte.cluster.usage",
  input: z.object({}).strict(),
  output: z.object({
    racks: z.array(
      z.object({
        name: z.string(), // "Rack 1" | "Rack 2"
        cores: z.number(), // exact allocatable core sum
        memoryGi: z.number(), // allocatable RAM rounded to 10Gi
        cpuPercent: z.number(), // one decimal; usage over allocatable
        memPercent: z.number(), // integer
      }),
    ),
    fetchedAt: z.string(), // ISO 8601
  }),
});
```

The project preference RPCs (same block):

```ts
export const listProjectsRpc = defineRpc({
  name: "flyte.projects.list",
  input: z.object({}).strict(),
  output: z.object({
    projects: z.array(
      z.object({
        id: z.string(),
        domains: z.array(z.string()),
      }),
    ),
    activeProject: z.string(), // fully resolved: lastProject → env → default; what the trigger shows and queries key on
    domain: z.string(), // fixed env domain, returned so the client never guesses
  }),
});

export const setProjectPreferenceRpc = defineRpc({
  name: "flyte.preferences.setProject",
  input: z.object({ project: z.string() }),
  output: z.object({}).strict(),
});
```

## Server behavior (`*.server.ts` — Node HTTP only; no Python, no subprocess; flyteadmin over plain HTTP, Kubernetes over mTLS `node:https`)

- Config: `FLYTE_ADMIN_URL` (default `http://flyte.cluster.zge`), `FLYTE_PROJECT` (default `ercot-power-flow-poc`), `FLYTE_DOMAIN` (default `experiments`) — mirrors `resolve_admin_url` in `admin_client.py:138`.
- List: `GET {base}/api/v1/executions/{project}/{domain}?limit=…&sort_by.key=created_at&sort_by.direction=DESCENDING[&token=…]`. Filter `.flytegen.*` workflows. **Page refill without loss:** request each admin page with `limit = pageSize - visibleRowsCollected` (never a fixed admin page size). Because admin tokens are opaque and cannot split a page, a fixed-size page that overshoots `pageSize` would strand the surplus rows — dynamic limits make overshoot impossible: each page returns at most the remaining count, filtering only shrinks it, and the loop continues until `pageSize` visible rows are collected or the token is exhausted. Return the final consumed token as `nextCursor`. Then, for each RUNNING row in the returned page, fetch `/api/v1/node_executions/{project}/{domain}/{name}` **in parallel** and compute `nodeProgress` (succeeded/total, sentinel nodes `start-node`/`end-node` excluded). A failed node fetch degrades that row's hint to null — it never fails the page.
- Detail: `GET /api/v1/executions/{project}/{domain}/{name}` + node executions (+ task executions per node for task name and log URIs — mirrors the repo `status` command, `query.py:296`; works mid-run).
- `consoleUrl`: `{base}/console/projects/{project}/domains/{domain}/executions/{name}`.
- Timeouts 10s per request. Transport failures reject the RPC with a stable prefix (`Flyte unreachable: …`). Not-found mapping mirrors the reference client (`admin_client.py:210-220`): HTTP 404 **or** a gRPC-gateway JSON body with `code === 5` rejects the detail RPC with `Execution not found`; any other JSON `{code, message}` body rejects with the verbatim message. Payload decode happens only after this mapping.
- Durations parse from the wire's `"912.864954004s"` format to seconds server-side.

- Projects: `GET {base}/api/v1/projects` returns `{projects: [...], token}` where each entry's `domains` is an array of objects (`{id, name}`). Normalize before RPC validation: take `body.projects`, map `domains.map((d) => d.id)`. Cached in memory for 5 minutes (the set rarely changes).
- Sticky preference: a single JSON state file, `$PASEO_HOME/flyte-runs-state.json` when `PASEO_HOME` is set, else `~/.paseo/flyte-runs-state.json` — `{ lastProject: string | null }`. Read at startup and on `flyte.projects.list`; written by `flyte.preferences.setProject` (atomic write, best-effort — a failed write degrades to in-memory stickiness and never blocks the UI). Machine-local filesystem work in `*.server.ts` is the sanctioned pattern; there is no plugin storage API (`public-docs/plugins/reference.md:86`). The preference is daemon-wide (single-user), not per-device.
- RPC `project` input fields: when omitted, resolve as sticky `lastProject` → `FLYTE_PROJECT` env default → `ercot-power-flow-poc`. The resolution result is returned to the client as `activeProject` (plus the fixed `domain`) from `flyte.projects.list`, so the trigger text and query keys never guess. The cluster card ignores project — racks are cluster-scoped.

### Cluster usage (`flyte.cluster.usage`)

- Kubernetes API, not flyteadmin: `GET /apis/metrics.k8s.io/v1beta1/nodes` (usage) + `GET /api/v1/nodes` (allocatable). The kubeconfig requires client-cert mTLS, and `fetch` `RequestInit` has no cert/key options — use `node:https` with an `https.Agent` carrying the resolved `cert`, `key`, and `ca` (or an Undici `Agent` dispatcher; either way it is explicit in the code, not "plain fetch"). Kubeconfig resolution: read `current-context`, map to its cluster (`server`, `certificate-authority-data` base64 or `certificate-authority` file path) and user (`client-certificate-data`/`client-key-data` base64, or `client-certificate`/`client-key` file paths — both forms handled). No kubectl subprocess.
- Rack mapping is convention, not cluster data — no rack labels exist in Kubernetes. `big*`/`bigbig*`/`biggpu` → Rack 1; `mid*` → Rack 2. `cupk8` and `minio*` are excluded (infra, not run-scheduling compute). Node renames break the mapping silently — the name-prefix table lives in one constant.
- Percentages are usage over allocatable, aggregated per rack — not node-percentage averages. Cores render exact; RAM rounds to 10Gi.
- Refresh: every 15s, matched to metrics-server's `--metric-resolution=15s` (verified in the deployment args) — faster polls return identical data. The runs list keeps its 30s poll. Both stop when the screen closes.
- Failure degrades to the card showing "Unavailable"; it never blocks the runs list (separate query cache).

## Client design (`*.client.tsx`)

Information hierarchy:

- Cluster card above the day list: one line per rack — `Rack 1  2526c · 9940Gi` with CPU and Mem bars right-aligned. CPU renders with one decimal (integer rounding once showed a misleading flat "0%" during a CPU-idle DAG stage while executors held 2.9Ti of memory — verified the hard way). Bars are the same track/fill View pair as the node progress bar; fill is `foregroundMuted`, no status color. Polls at 15s.
- Row (two lines): status dot · execution name (single line, tail ellipsis) · meta `HH:MM · workflow · size · authorized_by [· pr N]` · trailing duration (terminal) or live elapsed + `succeeded/total` hint (running, e.g. `8h 32m · 5/6`) · chevron (desktop). All times render in the device's local timezone (user choice; the mockups show UTC).
- Date window and full labels live behind the tap in the detail — they don't fit a phone row and the name prefix usually encodes them.
- Summary chips under the screen title: `N running · N succeeded today · N aborted` (computed from loaded pages; "today" = device-local midnight). During the busy moment this collapses to `9 running`.
- Detail: emphasized elapsed or final duration, node progress bar (running only), overview card (date window, size, workflow), labels card, nodes card — two-line node rows (id, phase, duration; task name on a muted second line as its final dot-segment) with a trailing small "Logs" link per node when log URIs exist (opens the first URI in the browser — the fetched value is never silently dropped), "Open in console" outline button + URL.

Phase mapping (single client function; tokens from `theme.colors`):

| Flyte phase                        | Dot / pill                           | Label                        |
| ---------------------------------- | ------------------------------------ | ---------------------------- |
| `SUCCEEDED`                        | `statusDotSuccess` / `statusSuccess` | Succeeded                    |
| `SUCCEEDING`                       | `statusDotSuccess` / `statusSuccess` | Succeeding                   |
| `RUNNING`                          | `statusDotRunning` (pulses)          | Running                      |
| `ABORTED` / `ABORTING`             | `statusDotWarning` / `statusWarning` | Aborted / Aborting           |
| `FAILED` / `FAILING` / `TIMED_OUT` | `statusDotDanger` / `statusDanger`   | Failed / Failing / Timed out |
| `QUEUED` / `UNDEFINED`             | muted dot                            | Queued / Undefined           |
| any other value                    | muted dot                            | verbatim phase               |

Node phases reuse the same table, plus `DYNAMIC_RUNNING` → running, `SKIPPED` → muted "Skipped", `RECOVERED` → success "Recovered" (canonical `NodeExecution.Phase` has no `RETRY`). The catch-all row is deliberate: Flyte can add phases, and an unknown value must still render its verbatim name rather than lose status. Full enums: `flyteidl/core/execution.proto:12-38`.

Live behavior:

- Polling: 30s `refetchInterval` while the screen is open (each tick = 1 list GET + 1 node GET per running execution — 9 extra during the busy moment, trivial for flyteadmin).
- Pull-to-refresh on compact (`RefreshControl` — react-native is a host external). Desktop relies on the 30s poll.
- Elapsed ticks client-side at 1s from `startedAt` (only while running rows are rendered) — `duration` is null mid-run.
- "Load more" ghost footer appends pages.
- Loading: first page → centered spinner, chips render as empty shells (no layout shift). Error: one bordered alert "Unable to reach Flyte" + Retry; react-query keeps last good data — the alert is the whole error surface, no state text below it. Empty state: a successful load where the refill loop ran to **token exhaustion** with zero visible rows (a project with no runs at all — `sandbox` today) renders the centered muted noun "No Flyte runs yet" (`docs/design.md` empty-state norm). A merely CI-heavy page never empties — refill keeps following tokens. Transport failures stay in the alert path; the empty state is success-only.

Platform constraints honored: host-provided externals only (react, react-native, @tanstack/react-query, zod); no react-native-svg — the progress bar is nested Views; all colors from `theme.colors.*`; `layout.compact` drives the single responsive branch; works light/dark, desktop/mobile.

## Prerequisites

### Host change: extend PluginTheme

The spec's dots, list column, chip/track surfaces, and the outline button need tokens the plugin theme DTO does not currently expose. `PluginTheme` carries only `surface0`–`surface2`, `border`, `foreground`, `foregroundMuted`, `accent`, `accentForeground`, `statusSuccess`, `statusWarning`, `statusDanger` (`packages/plugin/src/contracts.ts:7-21`; projection `packages/app/src/plugins/theme.ts:4-19`). Before the plugin build, extend the DTO and projection with: `statusDotSuccess`, `statusDotDanger`, `statusDotWarning`, `statusDotRunning`, `surface3`, `surfaceSidebar`, `borderAccent`. Rationale: status dots are deliberately their own chroma band (`docs/design.md` §13) — substituting the `status*` family would make dots read dimmer than the metadata beside them; `statusDotRunning` is the only running-state signal token anywhere in the theme; the list column and chip/track shells use `surfaceSidebar`/`surface3` in every canonical surface; `borderAccent` is the design contract's outline-button border (`docs/design.md` §5). This is a small host change to the fork (~7 mapped fields), not a plugin-side workaround — hardcoded hexes are forbidden.

### Host change: route Command Center opens through the sidebar contribution

Command Center `openSurface("main")` routes with identity kind `surface` (`packages/app/src/plugins/command-center/contributions.ts:39-45`, `registration.tsx:68-71`), and `PluginSurfaceScreen` falls back to `surface.id` for direct surfaces (`surface-contribution.ts:15-23`, `surface-screen.tsx:175`) — the host title would render as `main`, not `Flyte runs`. Before shipping the Command Center item, make `openSurface` prefer the plugin's `sidebarItem` targeting the same surface when one exists (route with that identity, preserving the item's title and icon). The sidebar entry point is unaffected; this only fixes the Command Center path.

### User decision (not taken)

Plugins are disabled on the production daemon (`~/.paseo/config.json` has no `pluginsEnabled`). Enabling is runtime-safe (`paseo reload`, no daemon restart — port 6767 stays up). Plugin code is trusted and unsandboxed: the server half runs with the user's credentials on the dev box; the client half runs inside the Paseo app. Do not enable on the user's behalf. The cluster usage section additionally reads the kubeconfig client cert — the plugin server holds cluster read credentials while it runs.

## Out of scope for v1

- Spark health / SparkApplications monitoring (rendered "Unavailable"; would need the rotating port-forward or cluster-side service)
- Triggering runs (submission has a source-resolution and labeling contract guarded by the ercot-run-monitoring skill; v2 candidate via the admin launch endpoint)
- Agent attribution — no `paseo-agent=<PASEO_AGENT_ID>` label on submit, no grouping by agent, no deep-links to agent tabs. `authorized_by` already names the human launcher. Future option: stamp the label in the submit CLI; the contract above needs no change to consume it later.
- Workflow filter UI, label search, `name_contains`, time-window queries (all supported by the admin API when wanted)
- Domain switching (every project on this cluster has only `experiments`; the env default covers it)
- Notifications / push
- In-app log viewing (log URIs link out)
- Refreshing data while the screen is closed (queries stop with the surface)

## Resolved decisions (2026-08-28)

1. **Plugin home and runtime id**: directory source at `/home/joe/code/zge-workspace/dev-tools/paseo/flyte-runs-plugin` (new path, following the dev-tools repo's existing pattern), installed via `paseo plugin install` under runtime id `flyte-runs`. Directory source keeps the edit-reload dev loop; the repo is shareable through git like any other checkout.
2. **Sidebar icon**: Lucide `Plane` — confirmed.
3. **Detail node rows**: two lines — node id, phase, duration on the first; the task name on a muted second line, rendered as the final dot-segment of the namespaced task name (e.g. `power_flow` from `zge_market_framework.sacrilege.flyte_generator.sized.scenario.power_flow` — real values for main-6fff59b-df70: ingestion, topology, scenarios, disaggregation, dispatch, power_flow). The full name stays in the console.
4. **Page size**: 25 (first page and each load-more).
5. **`paseo-agent` submit-path label**: dropped. The out-of-scope note above remains as documentation should it be revisited.
