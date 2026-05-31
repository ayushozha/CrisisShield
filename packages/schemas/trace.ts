/**
 * VoiceShield Forge — CallTrace + SponsorProof Zod schemas.
 *
 * Kept 1:1 in sync with services/voice-backend/app/models.py (the Python
 * contracts that actually emit these artifacts). The dashboard parses every
 * harness artifact through these so a schema drift fails loudly in the UI
 * instead of silently rendering wrong data.
 */
import { z } from "zod";

export const CallSource = z.enum(["twilio", "daily", "cekura", "agent_sim"]);
export type CallSource = z.infer<typeof CallSource>;

export const Speaker = z.enum(["caller", "agent"]);

export const SponsorMode = z.enum(["live", "fixture"]);
export type SponsorMode = z.infer<typeof SponsorMode>;

export const CredentialState = z.enum(["present", "placeholder", "missing"]);
export type CredentialState = z.infer<typeof CredentialState>;

export const AdapterStatus = z.enum(["ready", "degraded", "failed"]);
export type AdapterStatus = z.infer<typeof AdapterStatus>;

export const FailureLayer = z.enum([
  "asr_entity_capture",
  "turn_taking",
  "reasoning_prompt",
  "tool_call_policy",
  "safety_guardrail",
  "latency_routing",
]);
export type FailureLayer = z.infer<typeof FailureLayer>;

export const Severity = z.enum(["low", "medium", "high", "critical"]);

export const Entity = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
});

export const LatencyMs = z.object({
  asr: z.number().nullable().optional(),
  llm: z.number().nullable().optional(),
  tts: z.number().nullable().optional(),
  end_to_end: z.number().nullable().optional(),
});

export const ToolCall = z.object({
  name: z.string(),
  args: z.record(z.string(), z.any()).default({}),
  allowed: z.boolean().default(true),
  blocked_reason: z.string().nullable().optional(),
  at_turn: z.string().nullable().optional(),
});

export const Turn = z.object({
  turn_id: z.string(),
  speaker: Speaker,
  audio_ms: z.number().nullable().optional(),
  transcript: z.string().default(""),
  asr_confidence: z.number().nullable().optional(),
  entities: z.record(z.string(), Entity).default({}),
  latency_ms: LatencyMs.default({}),
  tool_calls: z.array(ToolCall).default([]),
  interruption: z.boolean().default(false),
});
export type Turn = z.infer<typeof Turn>;

export const SafetyEvent = z.object({
  turn_id: z.string().nullable().optional(),
  kind: z.string(),
  detail: z.string().default(""),
  severity: Severity.default("high"),
});

export const ToolEvent = z.object({
  turn_id: z.string().nullable().optional(),
  tool: z.string(),
  fired: z.boolean().default(true),
  preconditions_met: z.boolean().default(true),
  detail: z.string().default(""),
});

export const CallTrace = z.object({
  call_id: z.string(),
  source: CallSource,
  scenario_id: z.string(),
  started_at: z.string(),
  turns: z.array(Turn).default([]),
  safety_events: z.array(SafetyEvent).default([]),
  tool_events: z.array(ToolEvent).default([]),
  transport: z.string().nullable().optional(),
});
export type CallTrace = z.infer<typeof CallTrace>;

// ── Sponsor proof (spec §7 mode contract + §8 SponsorProof) ────────────────
export const AdapterContract = z.object({
  sponsor: z.string(),
  mode: SponsorMode,
  credential_state: CredentialState,
  status: AdapterStatus,
  proof: z.record(z.string(), z.any()).default({}),
  note: z.string().nullable().optional(),
});
export type AdapterContract = z.infer<typeof AdapterContract>;

export const SponsorProof = z.object({
  run_id: z.string(),
  sponsors: z.record(z.string(), AdapterContract).default({}),
});
export type SponsorProof = z.infer<typeof SponsorProof>;
