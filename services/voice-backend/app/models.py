"""
VoiceShield Forge — typed data contracts.

These Pydantic models are the single source of truth for every artifact the
harness emits. They mirror the JSON contracts in spec.md §8 and are kept in
1:1 sync with the Zod schemas in `packages/schemas/*.ts` (the dashboard's view
of the same shapes). Every adapter, the failure router, the repair compiler,
and the regression gate speak these types — nothing passes raw dicts around.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

# ─────────────────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────────────────


class CallSource(str, Enum):
    twilio = "twilio"
    daily = "daily"
    cekura = "cekura"
    agent_sim = "agent_sim"


class Speaker(str, Enum):
    caller = "caller"
    agent = "agent"


class SponsorMode(str, Enum):
    live = "live"
    fixture = "fixture"


class CredentialState(str, Enum):
    present = "present"
    placeholder = "placeholder"
    missing = "missing"


class AdapterStatus(str, Enum):
    ready = "ready"
    degraded = "degraded"
    failed = "failed"


class FailureLayer(str, Enum):
    asr_entity_capture = "asr_entity_capture"
    turn_taking = "turn_taking"
    reasoning_prompt = "reasoning_prompt"
    tool_call_policy = "tool_call_policy"
    safety_guardrail = "safety_guardrail"
    latency_routing = "latency_routing"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class PromotionDecision(str, Enum):
    promote = "promote"
    hold = "hold"
    # High-stakes posture: even a clean regression does NOT auto-ship to
    # production. It passes staging and is flagged for mandatory human review.
    staging_pass = "staging_pass"


# ─────────────────────────────────────────────────────────────────────────────
# CallTrace  (spec.md §8 CallTrace)
# ─────────────────────────────────────────────────────────────────────────────


class Entity(BaseModel):
    value: str
    confidence: float = Field(ge=0.0, le=1.0)


class LatencyMs(BaseModel):
    asr: Optional[float] = None
    llm: Optional[float] = None
    tts: Optional[float] = None
    end_to_end: Optional[float] = None


class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    allowed: bool = True
    blocked_reason: Optional[str] = None
    at_turn: Optional[str] = None


class Turn(BaseModel):
    turn_id: str
    speaker: Speaker
    audio_ms: Optional[int] = None
    transcript: str = ""
    asr_confidence: Optional[float] = None
    entities: dict[str, Entity] = Field(default_factory=dict)
    latency_ms: LatencyMs = Field(default_factory=LatencyMs)
    tool_calls: list[ToolCall] = Field(default_factory=list)
    interruption: bool = False


class SafetyEvent(BaseModel):
    turn_id: Optional[str] = None
    kind: str  # e.g. "unsafe_advice", "verification_bypass", "prompt_pressure"
    detail: str = ""
    severity: Severity = Severity.high


class ToolEvent(BaseModel):
    turn_id: Optional[str] = None
    tool: str
    fired: bool = True
    preconditions_met: bool = True
    detail: str = ""


class CallTrace(BaseModel):
    call_id: str
    source: CallSource
    scenario_id: str
    started_at: str
    turns: list[Turn] = Field(default_factory=list)
    safety_events: list[SafetyEvent] = Field(default_factory=list)
    tool_events: list[ToolEvent] = Field(default_factory=list)
    # Provenance: which sponsor surface produced the audio for this trace.
    transport: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# SponsorProof  (spec.md §8 SponsorProof, §7 adapter mode contract)
# ─────────────────────────────────────────────────────────────────────────────


class AdapterContract(BaseModel):
    """The uniform mode contract every adapter returns (spec.md §7)."""

    sponsor: str
    mode: SponsorMode
    credential_state: CredentialState
    status: AdapterStatus
    proof: dict[str, Any] = Field(default_factory=dict)
    note: Optional[str] = None


class SponsorProof(BaseModel):
    """Aggregated proof object surfaced in the dashboard's sponsor strip."""

    run_id: str
    sponsors: dict[str, AdapterContract] = Field(default_factory=dict)

    def all_present(self, required: list[str]) -> bool:
        return all(name in self.sponsors for name in required)


# ─────────────────────────────────────────────────────────────────────────────
# FailureCluster  (spec.md §8 FailureCluster)
# ─────────────────────────────────────────────────────────────────────────────


class FailureCluster(BaseModel):
    cluster_id: str
    failed_layer: FailureLayer
    secondary_layers: list[FailureLayer] = Field(default_factory=list)
    severity: Severity = Severity.high
    frequency: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_turn_ids: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    root_cause: str = ""
    judge_story: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# RepairPack  (spec.md §8 RepairPack)
# ─────────────────────────────────────────────────────────────────────────────


class RepairArtifact(BaseModel):
    type: str  # asr_vocabulary_boost | dialog_policy_patch | tool_gate | guardrail_patch
    provider: Optional[str] = None
    # Free-form per artifact type; validated structurally by the compiler.
    terms: Optional[list[str]] = None
    rule: Optional[str] = None
    tool: Optional[str] = None
    allow_when: Optional[list[str]] = None
    detail: dict[str, Any] = Field(default_factory=dict)


class RepairPack(BaseModel):
    repair_id: str
    target_layers: list[FailureLayer] = Field(default_factory=list)
    artifacts: list[RepairArtifact] = Field(default_factory=list)
    generated_eval_ids: list[str] = Field(default_factory=list)
    rationale: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Evals  (spec.md §10)
# ─────────────────────────────────────────────────────────────────────────────


class Scenario(BaseModel):
    scenario_id: str
    title: str
    description: str = ""
    category: str = "baseline"  # baseline | generated
    targets_layer: Optional[FailureLayer] = None
    # Difficulty knobs the simulated runner uses to perturb the call.
    knobs: dict[str, Any] = Field(default_factory=dict)
    critical: bool = False


class ScenarioResult(BaseModel):
    scenario_id: str
    passed: bool
    task_success: bool
    # entity_accuracy is reused as the crisis "risk-tag / safety adherence"
    # accuracy: how correctly the agent detected risk + tagged it.
    entity_accuracy: float = Field(ge=0.0, le=1.0)
    # Count of calls where an escalation/handoff was REQUIRED but not performed.
    missed_escalation: int = 0
    unsafe_events: int = 0
    wrong_patient_lookup: int = 0
    p95_latency_ms: float = 0.0
    # Seconds from imminent-risk disclosure to escalation/handoff (0 = n/a).
    time_to_escalation_s: float = 0.0
    # Handoff-quality score 0..1 for escalation-relevant scenarios; None when the
    # scenario does not involve a handoff decision (excluded from the rate).
    handoff_score: Optional[float] = None
    failure_labels: list[str] = Field(default_factory=list)
    detail: str = ""


class EvalRun(BaseModel):
    """Uniform across live (Cekura) and fixture — spec.md Phase 4 gate."""

    run_id: str
    kind: str  # "baseline" | "regression"
    mode: SponsorMode
    scenario_results: list[ScenarioResult] = Field(default_factory=list)
    aggregate: dict[str, float] = Field(default_factory=dict)
    cekura_run_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# RegressionRun  (spec.md §8 RegressionRun, §10 regression gate)
# ─────────────────────────────────────────────────────────────────────────────


class MetricDelta(BaseModel):
    before: float
    after: float


class GateCheck(BaseModel):
    name: str
    passed: bool
    detail: str = ""


class RegressionRun(BaseModel):
    run_id: str
    baseline_run_id: str
    repair_id: str
    metrics: dict[str, MetricDelta] = Field(default_factory=dict)
    gate_checks: list[GateCheck] = Field(default_factory=list)
    promotion_decision: PromotionDecision
    promotion_reason: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# DemoReport — the top-level artifact bundle the dashboard reads
# ─────────────────────────────────────────────────────────────────────────────


class DemoReport(BaseModel):
    run_id: str
    scenario_id: str
    mode: SponsorMode
    created_at: str
    trace: CallTrace
    secondary_trace: Optional[CallTrace] = None  # the other ingress surface
    failure_clusters: list[FailureCluster] = Field(default_factory=list)
    repair_pack: RepairPack
    baseline_eval: EvalRun
    regression_eval: EvalRun
    regression: RegressionRun
    sponsor_proof: SponsorProof
    baseline_scenarios: list[Scenario] = Field(default_factory=list)
    generated_scenarios: list[Scenario] = Field(default_factory=list)
