import type { AgentStreamEvent } from "../../agent-sdk-types.js";
import { OmpHistoryMapper } from "./message-history.js";
import type { OmpAgentMessage, OmpAgentSessionEvent } from "./rpc-types.js";
import { OMP_HISTORY_MAPPER_HOOKS } from "./history-hooks.js";
import { formatOmpSubagentTitle } from "./subagent-title.js";
import type {
  OmpSubagentEventPayload,
  OmpSubagentLifecyclePayload,
  OmpSubagentProgressPayload,
  OmpSubagentSnapshot,
} from "./rpc-types.js";

interface OmpSubagentState {
  title: string;
  description: string | null;
  resolvedModel: string | null;
  toolCallId: string | null;
  status: "running" | "completed" | "failed" | "canceled";
  pendingYieldToolCallId: string | null;
  seenInSnapshot: boolean;
  mapper: OmpHistoryMapper;
}

export class OmpSubagentIndex {
  private readonly statesByParent = new WeakMap<object, Map<string, OmpSubagentState>>();

  handleLifecycle(parent: object, payload: OmpSubagentLifecyclePayload): AgentStreamEvent[] {
    const state = this.stateFor(parent, payload.id, payload.agent);
    if (payload.status === "started") state.pendingYieldToolCallId = null;
    state.title = payload.agent || state.title;
    state.description = payload.description ?? state.description;
    state.toolCallId = payload.parentToolCallId ?? state.toolCallId;
    state.status = mapLifecycleStatus(payload.status);
    return [this.upsert(payload.id, state.status, state)];
  }

  handleProgress(parent: object, payload: OmpSubagentProgressPayload): AgentStreamEvent[] {
    const id = payload.progress.id;
    const state = this.stateFor(parent, id, payload.agent);
    state.title = payload.agent || state.title;
    state.description = payload.progress.description ?? payload.assignment ?? state.description;
    if (payload.progress.resolvedModel?.trim()) {
      state.resolvedModel = payload.progress.resolvedModel;
    }
    state.toolCallId = payload.parentToolCallId ?? state.toolCallId;
    const nextStatus = mapProgressStatus(payload.progress.status);
    if (state.status === "running" || nextStatus !== "running") {
      state.status = nextStatus;
    }
    return [this.upsert(id, state.status, state)];
  }

  handleEvent(parent: object, payload: OmpSubagentEventPayload): AgentStreamEvent[] {
    const state = this.stateFor(parent, payload.id, "OMP subagent");
    const completedFromIncrementalYield = observeIncrementalTerminalYield(state, payload.event);
    const events: AgentStreamEvent[] = state.mapper
      .mapMessages(messagesFromSessionEvent(payload.event))
      .flatMap((mapped) =>
        mapped.type === "timeline"
          ? [
              {
                type: "provider_subagent" as const,
                provider: "omp" as const,
                event: {
                  type: "timeline" as const,
                  id: payload.id,
                  item: mapped.item,
                  ...(mapped.timestamp ? { timestamp: mapped.timestamp } : {}),
                },
              },
            ]
          : [],
      );
    if (
      state.status === "running" &&
      (completedFromIncrementalYield ||
        (payload.event.type === "agent_end" && hasSuccessfulTerminalYield(payload.event.messages)))
    ) {
      state.status = "completed";
      events.push(this.upsert(payload.id, state.status, state));
    }
    return events;
  }

  hasRunning(parent: object): boolean {
    const states = this.statesByParent.get(parent);
    if (!states) {
      return false;
    }
    for (const state of states.values()) {
      if (state.status === "running") {
        return true;
      }
    }
    return false;
  }

  hasLinkedChild(parent: object, toolCallId: string): boolean {
    const states = this.statesByParent.get(parent);
    if (!states) {
      return false;
    }
    for (const state of states.values()) {
      if (state.toolCallId === toolCallId) {
        return true;
      }
    }
    return false;
  }

  hasRunningLinkedTo(parent: object, toolCallId: string): boolean {
    const states = this.statesByParent.get(parent);
    if (!states) {
      return false;
    }
    for (const state of states.values()) {
      if (state.toolCallId === toolCallId && state.status === "running") {
        return true;
      }
    }
    return false;
  }

  /**
   * Merge a successful `get_subagents` reply. That RPC lists only still-running
   * children: an id that previously appeared and is now missing is finished.
   * Never-listed lifecycle children stay running so an empty first reply cannot
   * kill a child whose started frame beat the first snapshot.
   */
  reconcileSnapshots(parent: object, snapshots: OmpSubagentSnapshot[]): AgentStreamEvent[] {
    const present = new Set<string>();
    const events: AgentStreamEvent[] = [];

    for (const snapshot of snapshots) {
      present.add(snapshot.id);
      const state = this.stateFor(parent, snapshot.id, snapshot.agent);
      state.seenInSnapshot = true;
      state.title = snapshot.agent || state.title;
      state.description = snapshot.description ?? snapshot.assignment ?? state.description;
      state.toolCallId = snapshot.parentToolCallId ?? state.toolCallId;
      state.status = mapSnapshotStatus(snapshot.status);
      events.push(this.upsert(snapshot.id, state.status, state));
    }

    const states = this.statesByParent.get(parent);
    if (!states) {
      return events;
    }
    for (const [id, state] of states) {
      if (state.status !== "running" || !state.seenInSnapshot || present.has(id)) {
        continue;
      }
      state.status = "completed";
      events.push(this.upsert(id, state.status, state));
    }
    return events;
  }

  terminalizeRunning(parent: object): AgentStreamEvent[] {
    const states = this.statesByParent.get(parent);
    if (!states) {
      return [];
    }
    const events: AgentStreamEvent[] = [];
    for (const [id, state] of states) {
      if (state.status !== "running") {
        continue;
      }
      state.status = "canceled";
      events.push(this.upsert(id, state.status, state));
    }
    return events;
  }

  clear(parent: object): void {
    this.statesByParent.delete(parent);
  }

  private stateFor(parent: object, id: string, title: string): OmpSubagentState {
    const states = this.statesByParent.get(parent) ?? new Map<string, OmpSubagentState>();
    const existing = states.get(id);
    if (existing) return existing;
    const state: OmpSubagentState = {
      title,
      description: null,
      resolvedModel: null,
      toolCallId: null,
      status: "running",
      pendingYieldToolCallId: null,
      seenInSnapshot: false,
      mapper: new OmpHistoryMapper("omp", [], OMP_HISTORY_MAPPER_HOOKS),
    };
    states.set(id, state);
    this.statesByParent.set(parent, states);
    return state;
  }

  private upsert(
    id: string,
    status: "running" | "completed" | "failed" | "canceled",
    state: OmpSubagentState,
  ): AgentStreamEvent {
    return {
      type: "provider_subagent",
      provider: "omp",
      event: {
        type: "upsert",
        id,
        title: formatOmpSubagentTitle(state.title, state.resolvedModel),
        description: state.description,
        status,
        toolCallId: state.toolCallId,
      },
    };
  }
}

function messagesFromSessionEvent(event: OmpAgentSessionEvent): OmpAgentMessage[] {
  if (event.type === "message_end") return [event.message];
  return [];
}

function observeIncrementalTerminalYield(
  state: OmpSubagentState,
  event: OmpAgentSessionEvent,
): boolean {
  if (event.type !== "message_end") return false;
  const message = event.message;
  if (message.role === "assistant") {
    state.pendingYieldToolCallId = null;
    if (message.errorMessage) return false;
    const toolCall = message.content.findLast((content) => content.type === "toolCall");
    if (toolCall?.name === "yield") state.pendingYieldToolCallId = toolCall.id;
    return false;
  }
  if (
    message.role !== "toolResult" ||
    message.toolName !== "yield" ||
    message.toolCallId !== state.pendingYieldToolCallId
  ) {
    return false;
  }
  state.pendingYieldToolCallId = null;
  return isSuccessfulYieldResult(message);
}

function hasSuccessfulTerminalYield(messages: OmpAgentMessage[] | undefined): boolean {
  if (!messages) return false;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    if (message.errorMessage) return false;
    const toolCall = message.content.findLast((content) => content.type === "toolCall");
    if (!toolCall || toolCall.name !== "yield") return false;
    const result = messages.find(
      (candidate) =>
        candidate.role === "toolResult" &&
        candidate.toolCallId === toolCall.id &&
        candidate.toolName === "yield",
    );
    return result?.role === "toolResult" && isSuccessfulYieldResult(result);
  }
  return false;
}

function isSuccessfulYieldResult(
  result: Extract<OmpAgentMessage, { role: "toolResult" }>,
): boolean {
  if (result.isError) return false;
  const details = result.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const record = details as Record<string, unknown>;
  if (record.status !== "success") return false;
  return record.type === undefined || typeof record.type === "string";
}

function mapLifecycleStatus(
  status: OmpSubagentLifecyclePayload["status"],
): "running" | "completed" | "failed" | "canceled" {
  if (status === "started") return "running";
  return status === "aborted" ? "canceled" : status;
}

function mapProgressStatus(
  status: OmpSubagentProgressPayload["progress"]["status"],
): "running" | "completed" | "failed" | "canceled" {
  if (status === "completed" || status === "failed") return status;
  return status === "aborted" ? "canceled" : "running";
}

function mapSnapshotStatus(
  status: OmpSubagentSnapshot["status"],
): "running" | "completed" | "failed" | "canceled" {
  if (status === "completed" || status === "failed") return status;
  return status === "aborted" ? "canceled" : "running";
}
