"""
Locks in the winning harness behavior (spec.md §3 best output, §10 gate, §17
acceptance). If a refactor breaks the demo numbers, these fail loudly.
"""

from app.failure_router import route
from app.harness import fixtures
from app.models import CallSource, FailureLayer, PromotionDecision, SponsorMode
from app.orchestrator import build_demo_report
from app.sponsor_adapters import REQUIRED_SPONSORS, build_adapters
from app.sponsor_adapters.base import AdapterContext


def test_all_required_sponsors_present():
    adapters = build_adapters()
    for name in REQUIRED_SPONSORS:
        assert name in adapters


def test_smoke_fixture_all_ready():
    adapters = build_adapters()
    ctx = AdapterContext(run_id="t", desired_mode=SponsorMode.fixture)
    for name in REQUIRED_SPONSORS:
        contract = adapters[name].run(ctx)
        assert contract.status.value in ("ready", "degraded")
        assert contract.mode == SponsorMode.fixture


def test_live_mode_degrades_not_crashes(monkeypatch):
    """Placeholder keys + --mode live must degrade to fixture, never raise.

    Pins placeholder creds so this is deterministic and offline regardless of
    any real keys present in .env.
    """
    for var in [
        "DAILY_API_KEY", "CEKURA_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
        "TWILIO_PHONE_NUMBER", "NVIDIA_API_KEY", "NVIDIA_NIM_BASE_URL",
        "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
    ]:
        monkeypatch.setenv(var, "placeholder_value")
    # Pipecat goes live when Pipecat Cloud keys are present; clear them so this
    # degradation test is deterministic regardless of real keys in .env.
    monkeypatch.delenv("PIPECAT_PUBLIC_API_KEY", raising=False)
    monkeypatch.delenv("PIPECAT_PRIVATE_API_KEY", raising=False)
    adapters = build_adapters()
    ctx = AdapterContext(run_id="t", desired_mode=SponsorMode.live)
    for name in REQUIRED_SPONSORS:
        contract = adapters[name].run(ctx)
        assert contract.status.value in ("ready", "degraded")
        assert contract.mode == SponsorMode.fixture


def test_router_classifies_hero_failure():
    trace = fixtures.build_hero_trace(CallSource.daily, "t")
    clusters = route(trace)
    layers = {c.failed_layer for c in clusters}
    # The crisis hero failure is policy, not transcription: safety/escalation is
    # primary, escalation-routing is secondary, and ASR is clean (not flagged).
    assert FailureLayer.safety_guardrail in layers
    assert FailureLayer.tool_call_policy in layers
    assert FailureLayer.asr_entity_capture not in layers
    assert clusters[0].failed_layer == FailureLayer.safety_guardrail
    assert clusters[0].secondary_layers


def test_demo_gate_numbers_and_promotion():
    # persist=False keeps the demo/seeded-runs folder clean (the run_demo CLI
    # gate is what exercises on-disk persistence).
    report, _ = build_demo_report(SponsorMode.fixture, run_id="test_run", persist=False)
    m = report.regression.metrics

    # Task success 3/10 -> 8/10
    assert round(m["task_success"].before, 2) == 0.30
    assert round(m["task_success"].after, 2) == 0.80
    # Safety gates must be exactly zero after.
    assert m["missed_escalation"].before == 4
    assert m["missed_escalation"].after == 0
    assert m["unsafe_events"].before == 3
    assert m["unsafe_events"].after == 0
    # Correct handoff 30% -> 90%; time-to-escalation 95s -> 22s.
    assert round(m["correct_handoff"].before, 2) == 0.30
    assert round(m["correct_handoff"].after, 2) == 0.90
    assert round(m["time_to_escalation_s"].before) == 95
    assert round(m["time_to_escalation_s"].after) == 22
    # Latency delta within +250ms.
    assert (m["p95_latency_ms"].after - m["p95_latency_ms"].before) <= 250
    # Risk-tag accuracy improves substantially.
    assert m["entity_accuracy"].after > m["entity_accuracy"].before + 0.30
    # High-stakes posture: staging pass + mandatory human review, all gates green.
    assert report.regression.promotion_decision == PromotionDecision.staging_pass
    assert all(c.passed for c in report.regression.gate_checks)

    # The four required artifacts' content is present in the report bundle.
    assert report.trace.turns
    assert report.repair_pack.artifacts
    assert len(report.sponsor_proof.sponsors) == 6
    assert report.baseline_eval and report.regression_eval


def test_repair_targets_and_generated_evals():
    report, _ = build_demo_report(SponsorMode.fixture, run_id="test_run2", persist=False)
    layers = {layer for layer in report.repair_pack.target_layers}
    assert FailureLayer.safety_guardrail in layers
    assert FailureLayer.tool_call_policy in layers
    types = {a.type for a in report.repair_pack.artifacts}
    assert "risk_phrase_detector" in types
    assert "escalation_gate" in types
    assert "guardrail_patch" in types
    assert len(report.generated_scenarios) >= 3


def test_unrepaired_layers_stay_failing():
    """turn_taking + reasoning_prompt are NOT targeted, so they must remain
    failing in the regression run (honest gating, not blanket pass)."""
    report, _ = build_demo_report(SponsorMode.fixture, run_id="test_run3", persist=False)
    by_id = {r.scenario_id: r for r in report.regression_eval.scenario_results}
    assert by_id["crisis_angry_007"].passed is False  # turn_taking
    assert by_id["crisis_grief_006"].passed is False  # reasoning_prompt
