// VoiceShield Forge — dashboard view types.
// Mirror of services/voice-backend/app/models.py and packages/schemas/*.ts.

export type SponsorMode = "live" | "fixture";
export type CredentialState = "present" | "placeholder" | "missing";
export type AdapterStatus = "ready" | "degraded" | "failed";
export type FailureLayer =
  | "asr_entity_capture"
  | "turn_taking"
  | "reasoning_prompt"
  | "tool_call_policy"
  | "safety_guardrail"
  | "latency_routing";

export interface Entity {
  value: string;
  confidence: number;
}
export interface LatencyMs {
  asr?: number | null;
  llm?: number | null;
  tts?: number | null;
  end_to_end?: number | null;
}
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  allowed: boolean;
  blocked_reason?: string | null;
  at_turn?: string | null;
}
export interface Turn {
  turn_id: string;
  speaker: "caller" | "agent";
  audio_ms?: number | null;
  transcript: string;
  asr_confidence?: number | null;
  entities: Record<string, Entity>;
  latency_ms: LatencyMs;
  tool_calls: ToolCall[];
  interruption: boolean;
}
export interface SafetyEvent {
  turn_id?: string | null;
  kind: string;
  detail: string;
  severity: string;
}
export interface ToolEvent {
  turn_id?: string | null;
  tool: string;
  fired: boolean;
  preconditions_met: boolean;
  detail: string;
}
export interface CallTrace {
  call_id: string;
  source: "twilio" | "daily" | "cekura" | "agent_sim";
  scenario_id: string;
  started_at: string;
  turns: Turn[];
  safety_events: SafetyEvent[];
  tool_events: ToolEvent[];
  transport?: string | null;
}

export interface AdapterContract {
  sponsor: string;
  mode: SponsorMode;
  credential_state: CredentialState;
  status: AdapterStatus;
  proof: Record<string, any>;
  note?: string | null;
}
export interface SponsorProof {
  run_id: string;
  sponsors: Record<string, AdapterContract>;
}

export interface FailureCluster {
  cluster_id: string;
  failed_layer: FailureLayer;
  secondary_layers: FailureLayer[];
  severity: string;
  frequency: number;
  evidence_turn_ids: string[];
  evidence: string[];
  root_cause: string;
  judge_story: string;
}

export interface RepairArtifact {
  type: string;
  provider?: string | null;
  terms?: string[] | null;
  rule?: string | null;
  tool?: string | null;
  allow_when?: string[] | null;
  detail: Record<string, any>;
}
export interface RepairPack {
  repair_id: string;
  target_layers: FailureLayer[];
  artifacts: RepairArtifact[];
  generated_eval_ids: string[];
  rationale: string;
}

export interface Scenario {
  scenario_id: string;
  title: string;
  description: string;
  category: string;
  targets_layer?: FailureLayer | null;
  knobs: Record<string, any>;
  critical: boolean;
}
export interface ScenarioResult {
  scenario_id: string;
  passed: boolean;
  task_success: boolean;
  entity_accuracy: number;
  missed_escalation: number;
  unsafe_events: number;
  p95_latency_ms: number;
  time_to_escalation_s?: number;
  handoff_score?: number | null;
  failure_labels: string[];
  detail: string;
}
export interface EvalRun {
  run_id: string;
  kind: string;
  mode: SponsorMode;
  scenario_results: ScenarioResult[];
  aggregate: Record<string, number>;
  cekura_run_id?: string | null;
}

export interface MetricDelta {
  before: number;
  after: number;
}
export interface GateCheck {
  name: string;
  passed: boolean;
  detail: string;
}
export interface RegressionRun {
  run_id: string;
  baseline_run_id: string;
  repair_id: string;
  metrics: Record<string, MetricDelta>;
  gate_checks: GateCheck[];
  promotion_decision: "promote" | "hold" | "staging_pass";
  promotion_reason: string;
}

export interface DemoReport {
  run_id: string;
  scenario_id: string;
  mode: SponsorMode;
  created_at: string;
  trace: CallTrace;
  secondary_trace?: CallTrace | null;
  failure_clusters: FailureCluster[];
  repair_pack: RepairPack;
  baseline_eval: EvalRun;
  regression_eval: EvalRun;
  regression: RegressionRun;
  sponsor_proof: SponsorProof;
  baseline_scenarios: Scenario[];
  generated_scenarios: Scenario[];
}

export interface LiveTraceSnapshot {
  call_id: string;
  source: CallTrace["source"];
  scenario_id: string;
  transport?: string | null;
  turn_count: number;
  status: "streaming" | "completed" | string;
  updated_at: string;
  report_run_id?: string | null;
  trace: CallTrace;
}

export interface TwilioRecentCall {
  sid?: string | null;
  from?: string | null;
  to?: string | null;
  status?: string | null;
  direction?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration?: string | null;
  error_code?: string | null;
}

export interface TwilioReadiness {
  status: "blocked" | "waiting" | "receiving" | "tracing" | string;
  checked_at: string;
  public_base_url: string;
  expected_voice_webhook?: string | null;
  accepted_voice_webhooks?: string[];
  expected_stream_url?: string | null;
  configured_number?: string | null;
  number_sid?: string | null;
  number_config?: {
    sid?: string | null;
    phone_number?: string | null;
    voice_url?: string | null;
    voice_method?: string | null;
    status_callback?: string | null;
    webhook_matches?: boolean | null;
  } | null;
  latest_call?: TwilioRecentCall | null;
  streams: {
    total: number;
    active: number;
    latest?: Record<string, any> | null;
  };
  traces: {
    total: number;
    latest?: LiveTraceSnapshot | null;
  };
  pipeline?: Record<string, any>;
  issues: string[];
}

export const SPONSOR_ORDER = ["daily", "pipecat", "cekura", "twilio", "nvidia", "aws"] as const;

export const LAYER_LABEL: Record<FailureLayer, string> = {
  asr_entity_capture: "Risk Phrase Detection",
  turn_taking: "Turn-Taking",
  reasoning_prompt: "Safety Reasoning",
  tool_call_policy: "Escalation Routing",
  safety_guardrail: "Crisis Escalation",
  latency_routing: "Time-to-Escalation",
};
