"""
Orchestrator — the one improvement loop, end to end (spec.md §2).

  ingress surface(s) (Daily + Twilio, OR a live Pipecat call)
    -> normalized CallTrace
    -> Cekura baseline eval
    -> Forge failure router
    -> Forge repair compiler (+ NVIDIA artifact)
    -> generated harder evals
    -> Cekura regression eval
    -> regression gate (promote / hold)
    -> AWS-persisted report
    -> DemoReport for the dashboard

ONE code path for fixture (build_demo_report) and for a real Pipecat call
(build_report_from_trace, fed by the starter bot's trace collector). Live vs
fixture differs only inside the adapters and in where the trace comes from.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from . import eval_runner, failure_router, regression_gate, repair_compiler, storage
from .harness import fixtures
from .models import (
    CallSource,
    CallTrace,
    DemoReport,
    SponsorMode,
    SponsorProof,
)
from .sponsor_adapters import build_adapters
from .sponsor_adapters.base import AdapterContext


def _assemble_report(
    primary_trace: CallTrace,
    secondary_trace: CallTrace | None,
    scenario_id: str,
    run_id: str,
    desired_mode: SponsorMode,
    persist: bool,
) -> tuple[DemoReport, dict[str, str]]:
    """Run the full improvement loop on an already-normalized CallTrace."""
    adapters = build_adapters()
    ctx = AdapterContext(run_id=run_id, scenario_id=scenario_id, desired_mode=desired_mode)

    # ── Failure router ─────────────────────────────────────────────────────────
    clusters = failure_router.route(primary_trace)

    # ── Repair compiler (+ generated harder evals) ────────────────────────────
    repair_pack, generated = repair_compiler.compile_repair(clusters, primary_trace, run_id)

    # ── NVIDIA repair artifact ──────────────────────────────────────────────────
    # The crisis risk-phrase detector ships as a word-boost artifact; older ASR
    # vocabulary-boost artifacts are honored too.
    boost_terms = next(
        (
            a.terms
            for a in repair_pack.artifacts
            if a.type in ("risk_phrase_detector", "asr_vocabulary_boost")
        ),
        None,
    )
    nvidia_ctx = AdapterContext(
        run_id=run_id, scenario_id=scenario_id, desired_mode=desired_mode,
        payload={"boost_terms": boost_terms},
    )
    nvidia_contract = adapters["nvidia"].run(nvidia_ctx)
    nvidia_artifact = nvidia_contract.proof.get("artifact")

    # ── Cekura baseline + regression (always through the Cekura adapter) ──────
    cekura = adapters["cekura"]
    baseline_suite = fixtures.load_baseline_suite()
    baseline_eval = eval_runner.run_baseline(cekura, baseline_suite, ctx)
    regression_eval = eval_runner.run_regression(
        cekura, baseline_suite + generated, ctx, repair_pack
    )

    # ── Regression gate ─────────────────────────────────────────────────────────
    regression = regression_gate.evaluate_gate(
        baseline_eval, regression_eval, repair_pack, baseline_suite, run_id
    )

    # ── Sponsor proof strip ─────────────────────────────────────────────────────
    sponsor_proof = _build_sponsor_proof(
        adapters, ctx, primary_trace, baseline_eval, regression_eval, nvidia_contract
    )

    report = DemoReport(
        run_id=run_id,
        scenario_id=scenario_id,
        mode=desired_mode,
        created_at=datetime.now(timezone.utc).isoformat(),
        trace=primary_trace,
        secondary_trace=secondary_trace,
        failure_clusters=clusters,
        repair_pack=repair_pack,
        baseline_eval=baseline_eval,
        regression_eval=regression_eval,
        regression=regression,
        sponsor_proof=sponsor_proof,
        baseline_scenarios=baseline_suite,
        generated_scenarios=generated,
    )

    objects: dict[str, str] = {}
    if persist:
        objects = storage.persist_demo_report(report, adapters["aws"], ctx, nvidia_artifact)
    return report, objects


def build_demo_report(
    desired_mode: SponsorMode,
    scenario_id: str = "crisis_escalation_001",
    run_id: str = "demo_001",
    persist: bool = True,
) -> tuple[DemoReport, dict[str, str]]:
    """Fixture path: replay the two hero ingress surfaces through the loop."""
    daily_trace = fixtures.build_hero_trace(CallSource.daily, run_id)
    twilio_trace = fixtures.build_hero_trace(CallSource.twilio, run_id)
    return _assemble_report(
        daily_trace, twilio_trace, scenario_id, run_id, desired_mode, persist
    )


def build_report_from_trace(
    trace: CallTrace,
    desired_mode: SponsorMode = SponsorMode.live,
    run_id: str = "live_001",
    secondary_trace: CallTrace | None = None,
    persist: bool = True,
) -> tuple[DemoReport, dict[str, str]]:
    """Live path: a real Pipecat call (from the starter bot's trace collector)
    flows through the SAME router -> repair -> Cekura -> gate loop."""
    return _assemble_report(
        trace, secondary_trace, trace.scenario_id, run_id, desired_mode, persist
    )


def _build_sponsor_proof(
    adapters,
    ctx: AdapterContext,
    trace,
    baseline_eval,
    regression_eval,
    nvidia_contract,
) -> SponsorProof:
    proof = SponsorProof(run_id=ctx.run_id)

    # Daily + Twilio: surface proof, tagged with the trace's actual source.
    daily_contract = adapters["daily"].run(ctx)
    twilio_contract = adapters["twilio"].run(ctx)
    if trace.source == CallSource.daily:
        daily_contract.proof["live_call_id"] = trace.call_id
    if trace.source == CallSource.twilio:
        twilio_contract.proof["live_call_id"] = trace.call_id

    # Simulated crisis handoff package — the artifact the REPAIRED agent produces
    # when it routes an imminent-risk caller to 988. This is deliberately a
    # staged artifact: VoiceShield NEVER places a real emergency / 988 call. It
    # proves the handoff *path* without dialing anyone.
    sid_seed = hashlib.md5(f"{ctx.run_id}:crisis_handoff".encode()).hexdigest()
    twilio_contract.proof["crisis_handoff"] = {
        "handoff_package_created": True,
        "crisis_route_selected": "988_suicide_and_crisis_lifeline",
        "human_review_required": True,
        "warm_handoff": True,
        "stay_on_line": True,
        "call_sid": f"CA{sid_seed}",
        "simulated": True,
        "note": "SIMULATED handoff artifact — no real 988/emergency call placed",
    }
    proof.sponsors["daily"] = daily_contract
    proof.sponsors["twilio"] = twilio_contract

    # Pipecat: telemetry derived from the (possibly live) trace.
    pipecat_ctx = AdapterContext(
        run_id=ctx.run_id, scenario_id=ctx.scenario_id, desired_mode=ctx.desired_mode,
        payload={"trace": trace.model_dump(mode="json"), "transport": trace.transport},
    )
    proof.sponsors["pipecat"] = adapters["pipecat"].run(pipecat_ctx)

    # Cekura: contract proof enriched with the real run ids from the evals.
    cekura_contract = adapters["cekura"].run(ctx)
    cekura_contract.proof["baseline_run_id"] = baseline_eval.cekura_run_id
    cekura_contract.proof["regression_run_id"] = regression_eval.cekura_run_id
    cekura_contract.mode = baseline_eval.mode
    proof.sponsors["cekura"] = cekura_contract

    proof.sponsors["nvidia"] = nvidia_contract
    proof.sponsors["aws"] = adapters["aws"].run(ctx)
    return proof
