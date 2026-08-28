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
- **Project switcher**: the header's muted `project · domain` text is a Pressable with a small ChevronDown `Icon`; tapping expands a transient inline list (hand-built View/Text — plugins get no DropdownMenu primitive). The cluster exposes three projects today (`ercot-power-flow-poc`, `market-ercot`, `sandbox`, all domain `experiments`, via `GET /api/v1/projects`). Selecting one re-keys the runs queries; the selection is sticky — the plugin server records the last viewed project in a small JSON state file, so the next open starts there from any client device (there is no plugin storage API, and browser storage is per-device web-only — `public-docs/plugins/reference.md:86`). Domain stays fixed at the env default; all three projects have only `experiments`.

Real-data facts the design depends on (pulled 2026-08-28):

- `closure.duration` is **null while RUNNING** — confirmed on `main-6fff59b-df70`. Elapsed must be computed from `startedAt`. Terminal rows carry real durations.
- ~15–16 runs/day; durations span 4m (dispatch) to 7.9h (size `l` scenario).
- Concurrent reality: 2026-08-26 20:36 UTC had 9 executions in flight at once.
- Labels present on all non-CI runs: `authorized_by`, `pr`, `size`, `start_date`, `end_date`, `cluster`, occasionally `ab`/`arm`.
- Node-level failure is visible: `main-72629b8-fb00` failed at node `n6` (1005s) after six succeeded nodes — the detail drill-down surfaces exactly this.

## Where it lives

Sidebar item **"Flyte runs"** opening a full screen (`plugin.addSidebarItem` + `plugin.addSurface("main", …)`), plus a Command Center item that opens the same screen (`plugin.addCommandCenterItem`). Chosen over a workspace panel because executions are project-scoped, not workspace-scoped — the same data would repeat identically in every sibling workspace tab, and a panel is a tap deeper on mobile. Lucide icon proposal: `Plane`.

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
    lastProject: z.string().nullable(), // sticky preference; null = never switched
  }),
});

export const setProjectPreferenceRpc = defineRpc({
  name: "flyte.preferences.setProject",
  input: z.object({ project: z.string() }),
  output: z.object({}).strict(),
});
```

## Server behavior (`*.server.ts`, plain Node fetch — no Python, no subprocess)

- Config: `FLYTE_ADMIN_URL` (default `http://flyte.cluster.zge`), `FLYTE_PROJECT` (default `ercot-power-flow-poc`), `FLYTE_DOMAIN` (default `experiments`) — mirrors `resolve_admin_url` in `admin_client.py:138`.
- List: `GET {base}/api/v1/executions/{project}/{domain}?limit=…&sort_by.key=created_at&sort_by.direction=DESCENDING[&token=…]`. Filter `.flytegen.*` workflows. **Page refill:** the CI filter runs after fetching, so a single admin page can return fewer than `pageSize` visible rows — keep following the admin token, page by page, until `pageSize` human runs are collected or the token is exhausted, then return the final consumed token as `nextCursor` (mirrors `_gather_runs` in `query.py:202-220`; behavior defended at `tests/unit/flyte/test_query.py:107-126`). Then, for each RUNNING row in the returned page, fetch `/api/v1/node_executions/{project}/{domain}/{name}` **in parallel** and compute `nodeProgress` (succeeded/total, sentinel nodes `start-node`/`end-node` excluded). A failed node fetch degrades that row's hint to null — it never fails the page.
- Detail: `GET /api/v1/executions/{project}/{domain}/{name}` + node executions (+ task executions per node for task name and log URIs — mirrors the repo `status` command, `query.py:296`; works mid-run).
- `consoleUrl`: `{base}/console/projects/{project}/domains/{domain}/executions/{name}`.
- Timeouts 10s per request. Transport failures reject the RPC with a stable prefix (`Flyte unreachable: …`). Not-found mapping mirrors the reference client (`admin_client.py:210-220`): HTTP 404 **or** a gRPC-gateway JSON body with `code === 5` rejects the detail RPC with `Execution not found`; any other JSON `{code, message}` body rejects with the verbatim message. Payload decode happens only after this mapping.
- Durations parse from the wire's `"912.864954004s"` format to seconds server-side.

- Projects: `GET {base}/api/v1/projects` → `[{id, domains}]`. Cached in memory for 5 minutes (the set rarely changes).
- Sticky preference: a single JSON state file, `$PASEO_HOME/flyte-runs-state.json` when `PASEO_HOME` is set, else `~/.paseo/flyte-runs-state.json` — `{ lastProject: string | null }`. Read at startup and on `flyte.projects.list`; written by `flyte.preferences.setProject` (atomic write, best-effort — a failed write degrades to in-memory stickiness and never blocks the UI). Machine-local filesystem work in `*.server.ts` is the sanctioned pattern; there is no plugin storage API (`public-docs/plugins/reference.md:86`). The preference is daemon-wide (single-user), not per-device.
- RPC `project` input fields: when omitted, resolve as sticky `lastProject` → `FLYTE_PROJECT` env default → `ercot-power-flow-poc`. The cluster card ignores project — racks are cluster-scoped.

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
- Day sections (Today / Yesterday / date) in device-local time.
- Detail: emphasized elapsed or final duration, node progress bar (running only), overview card (date window, size, workflow), labels card, nodes card (id, task name, phase, duration), "Open in console" outline button + URL.

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

Node phases reuse the same table, plus `DYNAMIC_RUNNING` → running, `SKIPPED` → muted "Skipped", `RETRY` → warning "Retrying", `RECOVERED` → success "Recovered". The catch-all row is deliberate: Flyte can add phases, and an unknown value must still render its verbatim name rather than lose status. Full enums: `flyteidl/core/execution.proto:12-38`.

Live behavior:

- Polling: 30s `refetchInterval` while the screen is open (each tick = 1 list GET + 1 node GET per running execution — 9 extra during the busy moment, trivial for flyteadmin).
- Pull-to-refresh on compact (`RefreshControl` — react-native is a host external). Desktop relies on the 30s poll.
- Elapsed ticks client-side at 1s from `startedAt` (only while running rows are rendered) — `duration` is null mid-run.
- "Load more" ghost footer appends pages.
- Loading: first page → centered spinner, chips render as empty shells (no layout shift). Error: one bordered alert "Unable to reach Flyte" + Retry; react-query keeps last good data. Empty state: a successful load with zero visible rows (a project with no runs — `sandbox` today — or a page where every row is CI) renders the centered muted noun "No Flyte runs yet" (`docs/design.md` empty-state norm). Transport failures stay in the alert path; the empty state is success-only.

Platform constraints honored: host-provided externals only (react, react-native, @tanstack/react-query, zod); no react-native-svg — the progress bar is nested Views; all colors from `theme.colors.*`; `layout.compact` drives the single responsive branch; works light/dark, desktop/mobile.

## Prerequisites

### Host change: extend PluginTheme

The spec's dots, list column, and chip/track surfaces need tokens the plugin theme DTO does not currently expose. `PluginTheme` carries only `surface0`–`surface2`, `border`, `foreground`, `foregroundMuted`, `accent`, `accentForeground`, `statusSuccess`, `statusWarning`, `statusDanger` (`packages/plugin/src/contracts.ts:7-21`; projection `packages/app/src/plugins/theme.ts:4-19`). Before the plugin build, extend the DTO and projection with: `statusDotSuccess`, `statusDotDanger`, `statusDotWarning`, `statusDotRunning`, `surface3`, `surfaceSidebar`. Rationale: status dots are deliberately their own chroma band (`docs/design.md` §13) — substituting the `status*` family would make dots read dimmer than the metadata beside them; `statusDotRunning` is the only running-state signal token anywhere in the theme; the list column and chip/track shells use `surfaceSidebar`/`surface3` in every canonical surface. This is a small host change to the fork (~6 mapped fields), not a plugin-side workaround — hardcoded hexes are forbidden.

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

## Open decisions

1. Plugin home and install: own repo (git source via `paseo plugin add`) vs directory under an existing checkout. Runtime id: `flyte-runs`?
2. Sidebar icon: `Plane` proposed (Lucide).
3. Detail node rows: contract carries `taskName` and `logs`; confirm they render on phone (mockup shows node id + phase + duration only — task name may crowd the row; it can go on a second line).
4. Page size 25 vs 50 for the first load.
5. Follow-up (outside this plugin): `paseo-agent` label in the submit CLI to enable attribution later.
