# Flyte executions plugin — design

Status: design approved 2026-08-28. No implementation this session.
Mockups: `mockups/flyte-plugin/concept-a.html`, `concept-b.html`, `concept-hybrid.html` (hybrid is the settled design).

## Problem

Paseo has no visibility into Flyte executions. Answering "did last night's run finish?" or "which task is stuck right now?" today means the Flyte console or the repo's Python CLI — neither is glanceable from a phone. The plugin adds a read-only Flyte runs surface to Paseo, backed by the anonymous flyteadmin REST API at `http://flyte.cluster.zge` (verified: `/home/joe/code/zge-workspace/ercot-power-flow-poc/src/zge_ercot_power_flow/flyte/admin_client.py:189`).

Target project: `ercot-power-flow-poc`, domain `experiments`. More projects later; v1 scopes via env overrides.

## Which runs — the settled decision

**The N most recent executions, any phase, newest first**, with token-based load-more. Rejected alternatives and why:

- _Running only_: usually empty (typically 0–2 concurrent at ~16 runs/day); a dead panel half the time. Also rejected as a section: recent-N keeps running runs inline by `created_at` — no pinning, no mixed-field row split.
- _Time-bounded window_: a quiet week yields an empty panel; count-bounding never does.
- Terminal runs age out naturally: newer runs push older ones off the bottom.

Sub-decisions:

- **Pagination**: first page 25, "Load more" appends 25 per press (react-query `useInfiniteQuery`, admin `token` param).
- **CI filter**: executions on workflows starting `.flytegen.` (the `ledger-*` "verify and land" automation, no labels) are filtered out in the plugin server. The panel shows human-launched runs.
- **Label filtering**: none in v1. Labels render as data. (Admin cannot filter by label server-side — `query.py:207` filters client-side; same constraint applies to us.)

Real-data facts the design depends on (pulled 2026-08-28):

- `closure.duration` is **null while RUNNING** — confirmed on `main-6fff59b-df70`. Elapsed must be computed from `startedAt`. Terminal rows carry real durations.
- ~15–16 runs/day; durations span 4m (dispatch) to 7.9h (size `l` scenario).
- Concurrent reality: 2026-08-26 20:36 UTC had 9 executions in flight at once.
- Labels present on all non-CI runs: `authorized_by`, `pr`, `size`, `start_date`, `end_date`, `cluster`, occasionally `ab`/`arm`.
- Node-level failure is visible: `main-72629b8-fb00` failed at node `n6` (1005s) after six succeeded nodes — the detail drill-down surfaces exactly this.

## Where it lives

Sidebar item **"Flyte runs"** opening a full screen (`plugin.addSidebarItem` + `plugin.addSurface("main", …)`), plus a Command Center item that opens the same screen (`plugin.addCommandCenterItem`). Chosen over a workspace panel because executions are project-scoped, not workspace-scoped — the same data would repeat identically in every sibling workspace tab, and a panel is a tap deeper on mobile. Lucide icon proposal: `Plane`.

Desktop: settings-shell list+detail — 360px list column on `surfaceSidebar`, detail pane right. Phone: full-screen list; tapping a row pushes a detail screen with a back header. One `layout.compact` branch, same components.

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
  }),
  output: z.object({
    executions: z.array(executionSummary),
    nextCursor: z.string().nullable(), // null = no more pages
  }),
});

export const executionDetailRpc = defineRpc({
  name: "flyte.executions.detail",
  input: z.object({ name: z.string() }),
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
```

## Server behavior (`*.server.ts`, plain Node fetch — no Python, no subprocess)

- Config: `FLYTE_ADMIN_URL` (default `http://flyte.cluster.zge`), `FLYTE_PROJECT` (default `ercot-power-flow-poc`), `FLYTE_DOMAIN` (default `experiments`) — mirrors `resolve_admin_url` in `admin_client.py:138`.
- List: `GET {base}/api/v1/executions/{project}/{domain}?limit={pageSize}&sort_by.key=created_at&sort_by.direction=DESCENDING[&token=…]`. Filter `.flytegen.*` workflows. Then, for each RUNNING row in the page, fetch `/api/v1/node_executions/{project}/{domain}/{name}` **in parallel** and compute `nodeProgress` (succeeded/total, sentinel nodes `start-node`/`end-node` excluded). A failed node fetch degrades that row's hint to null — it never fails the page.
- Detail: `GET /api/v1/executions/{project}/{domain}/{name}` + node executions (+ task executions per node for task name and log URIs — mirrors the repo `status` command, `query.py:296`; works mid-run).
- `consoleUrl`: `{base}/console/projects/{project}/domains/{domain}/executions/{name}`.
- Timeouts 10s per request. Transport failures reject the RPC with a stable prefix (`Flyte unreachable: …`); 404 on detail rejects `Execution not found`.
- Durations parse from the wire's `"912.864954004s"` format to seconds server-side.

## Client design (`*.client.tsx`)

Information hierarchy:

- Row (two lines): status dot · execution name (single line, tail ellipsis) · meta `HH:MM · workflow · size · authorized_by [· pr N]` · trailing duration (terminal) or live elapsed + `succeeded/total` hint (running, e.g. `8h 32m · 5/6`) · chevron (desktop). All times render in the device's local timezone (user choice; the mockups show UTC).
- Date window and full labels live behind the tap in the detail — they don't fit a phone row and the name prefix usually encodes them.
- Summary chips under the screen title: `N running · N succeeded today · N aborted` (computed from loaded pages; "today" = device-local midnight). During the busy moment this collapses to `9 running`.
- Day sections (Today / Yesterday / date) in device-local time.
- Detail: emphasized elapsed or final duration, node progress bar (running only), overview card (date window, size, workflow), labels card, nodes card (id, task name, phase, duration), "Open in console" outline button + URL.

Phase mapping (single client function; tokens from `theme.colors`):

| Flyte phase            | Dot / pill                           | Label              |
| ---------------------- | ------------------------------------ | ------------------ |
| `SUCCEEDED`            | `statusDotSuccess` / `statusSuccess` | Succeeded          |
| `RUNNING`              | `statusDotRunning` (pulses)          | Running            |
| `ABORTED` / `ABORTING` | `statusDotWarning` / `statusWarning` | Aborted / Aborting |
| `FAILED` / `TIMED_OUT` | `statusDotDanger` / `statusDanger`   | Failed / Timed out |

Node `DYNAMIC_RUNNING` renders as running.

Domain labeling rule (from `~/.claude/skills/ercot-run-monitoring/SKILL.md`): these phases are the **Flyte** `run_status` only. Nothing in the UI claims overall completion. The detail renders **"Spark health: Unavailable"** — Spark lives behind a rotating port-forward and is out of scope; the skill forbids fabricating an unavailable metric. No green "done" state exists in v1.

Live behavior:

- Polling: 30s `refetchInterval` while the screen is open (each tick = 1 list GET + 1 node GET per running execution — 9 extra during the busy moment, trivial for flyteadmin).
- Pull-to-refresh on compact (`RefreshControl` — react-native is a host external). Desktop relies on the 30s poll.
- Elapsed ticks client-side at 1s from `startedAt` (only while running rows are rendered) — `duration` is null mid-run.
- Loading: first page → centered spinner, chips render as empty shells (no layout shift). Error: one bordered alert "Unable to reach Flyte" + Retry; react-query keeps last good data. No standing empty state — recent-N is never empty after first load.
- "Load more" ghost footer appends pages.

Platform constraints honored: host-provided externals only (react, react-native, @tanstack/react-query, zod); no react-native-svg — the progress bar is nested Views; all colors from `theme.colors.*`; `layout.compact` drives the single responsive branch; works light/dark, desktop/mobile.

## Prerequisite (user decision, not taken)

Plugins are disabled on the production daemon (`~/.paseo/config.json` has no `pluginsEnabled`). Enabling is runtime-safe (`paseo reload`, no daemon restart — port 6767 stays up). Plugin code is trusted and unsandboxed: the server half runs with the user's credentials on the dev box; the client half runs inside the Paseo app. Do not enable on the user's behalf.

## Out of scope for v1

- Spark health / SparkApplications monitoring (rendered "Unavailable"; would need the rotating port-forward or cluster-side service)
- Triggering runs (submission has a source-resolution and labeling contract guarded by the ercot-run-monitoring skill; v2 candidate via the admin launch endpoint)
- Agent attribution — no `paseo-agent=<PASEO_AGENT_ID>` label on submit, no grouping by agent, no deep-links to agent tabs. `authorized_by` already names the human launcher. Future option: stamp the label in the submit CLI; the contract above needs no change to consume it later.
- Workflow filter UI, label search, `name_contains`, time-window queries (all supported by the admin API when wanted)
- Multi-project switching (env overrides only)
- Notifications / push
- In-app log viewing (log URIs link out)
- Refreshing data while the screen is closed (queries stop with the surface)

## Open decisions

1. Plugin home and install: own repo (git source via `paseo plugin add`) vs directory under an existing checkout. Runtime id: `flyte-runs`?
2. Sidebar icon: `Plane` proposed (Lucide).
3. Detail node rows: contract carries `taskName` and `logs`; confirm they render on phone (mockup shows node id + phase + duration only — task name may crowd the row; it can go on a second line).
4. Page size 25 vs 50 for the first load.
5. Follow-up (outside this plugin): `paseo-agent` label in the submit CLI to enable attribution later.
