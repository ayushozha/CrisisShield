import type { CallTrace, SafetyEvent, ToolCall, ToolEvent, Turn } from "@/lib/types";
import type { TimbreDataset, TimbreEntity, TimbreThought } from "./data";

const SOURCE_LABEL: Record<CallTrace["source"], string> = {
  daily: "Daily realtime AI",
  twilio: "Twilio PSTN",
  cekura: "Cekura agent run",
  agent_sim: "Agent caller sim",
};

export function traceToTimbreDataset(trace: CallTrace): TimbreDataset {
  return {
    callId: trace.call_id,
    source: trace.source,
    transport: readableTransport(trace),
    scenario: trace.scenario_id,
    turns: trace.turns
      .filter((turn) => turn.transcript || turn.tool_calls.length > 0)
      .map((turn) => turnToTimbre(turn, trace)),
  };
}

export function traceSurfaceKey(trace: CallTrace): string {
  return `${trace.source}:${trace.call_id}`;
}

export function datasetSurfaceKey(dataset: TimbreDataset): string {
  return `${dataset.source}:${dataset.callId}`;
}

function readableTransport(trace: CallTrace): string {
  if (!trace.transport) return SOURCE_LABEL[trace.source] ?? trace.source;
  const transport = trace.transport
    .replace(/_/g, " ")
    .replace(/\bdaily\b/i, "Daily")
    .replace(/\btwilio\b/i, "Twilio")
    .replace(/\bpstn\b/i, "PSTN");
  return SOURCE_LABEL[trace.source] ?? transport;
}

function turnToTimbre(turn: Turn, trace: CallTrace) {
  const safety = trace.safety_events.filter((event) => event.turn_id === turn.turn_id);
  const events = matchingToolEvents(turn, trace.tool_events);
  const primaryTool = turn.tool_calls[0];
  const unsafe = isUnsafeTool(primaryTool, events, safety);
  const blocked = primaryTool?.allowed === false;

  return {
    id: turn.turn_id,
    speaker: turn.speaker,
    text: turn.transcript || describeToolOnlyTurn(primaryTool),
    asr: turn.asr_confidence ?? undefined,
    entities: Object.entries(turn.entities).map(
      ([k, entity]): TimbreEntity => ({
        k,
        v: entity.value,
        c: entity.confidence,
      }),
    ),
    latency: turn.latency_ms.end_to_end ?? undefined,
    think: turn.speaker === "agent" ? thoughtsForAgentTurn(turn, trace, events, safety) : undefined,
    toolFired:
      primaryTool && !blocked
        ? {
            name: primaryTool.name,
            args: formatArgs(primaryTool.args),
            unsafe,
          }
        : undefined,
    gated:
      primaryTool && blocked
        ? {
            name: primaryTool.name,
            reason: primaryTool.blocked_reason || "blocked by policy",
            ok: true,
          }
        : undefined,
    safety: safety.map((event) => event.detail).join(" "),
  };
}

function matchingToolEvents(turn: Turn, events: ToolEvent[]): ToolEvent[] {
  return events.filter(
    (event) =>
      event.turn_id === turn.turn_id ||
      (!event.turn_id && turn.speaker === "agent" && turn.tool_calls.some((c) => c.name === event.tool)),
  );
}

function isUnsafeTool(
  call: ToolCall | undefined,
  events: ToolEvent[],
  safety: SafetyEvent[],
): boolean {
  if (!call) return false;
  if (call.allowed === false) return false;
  return safety.length > 0 || events.some((event) => event.fired && !event.preconditions_met);
}

function thoughtsForAgentTurn(
  turn: Turn,
  trace: CallTrace,
  events: ToolEvent[],
  safety: SafetyEvent[],
): TimbreThought[] {
  const out: TimbreThought[] = [];
  if (turn.transcript) {
    out.push({
      kind: "reason",
      text: `${SOURCE_LABEL[trace.source] ?? trace.source} agent response captured.`,
    });
  }
  for (const call of turn.tool_calls) {
    const event = events.find((item) => item.tool === call.name);
    const unsafe = isUnsafeTool(call, event ? [event] : events, safety);
    out.push({
      kind: "tool",
      text: `${call.name}(${formatArgs(call.args)})`,
      danger: unsafe,
      ok: !unsafe && call.allowed !== false,
    });
    if (call.allowed === false || call.blocked_reason) {
      out.push({
        kind: "guard",
        text: call.blocked_reason || "Tool call blocked by policy.",
        ok: true,
      });
    }
  }
  for (const event of events) {
    if (!event.preconditions_met) {
      out.push({
        kind: "guard",
        text: event.detail || `${event.tool} preconditions were not met.`,
        danger: true,
      });
    }
  }
  for (const event of safety) {
    out.push({ kind: "guard", text: event.detail, danger: true });
  }
  return out;
}

function describeToolOnlyTurn(call: ToolCall | undefined): string {
  if (!call) return "(turn captured without transcript text)";
  return `${call.name}(${formatArgs(call.args)})`;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => `${key}=${formatArgValue(value)}`)
    .join(" / ");
}

function formatArgValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
