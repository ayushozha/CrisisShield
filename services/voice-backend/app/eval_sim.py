"""
Deterministic eval simulation (the fixture-mode "agent under test").

This is what Cekura's fixture path replays. It is NOT a UI fiction: each
scenario carries an explicit `baseline` outcome and a `repaired` outcome, and
the simulator applies a real GATING RULE — a scenario only improves if the
compiled repair actually targets that scenario's failure layer. So leaving
turn-taking and reasoning layers unrepaired genuinely keeps those scenarios
failing in the regression run. The before/after numbers the dashboard shows
are computed from these results, never hardcoded.
"""

from __future__ import annotations

from typing import Iterable

from .models import FailureLayer, Scenario, ScenarioResult


def _outcome(scenario: Scenario, key: str) -> dict:
    block = scenario.knobs.get(key, {})
    hs = block.get("handoff_score", None)
    return {
        "task_success": bool(block.get("task_success", False)),
        "entity_accuracy": float(block.get("entity_accuracy", 0.0)),
        "missed_escalation": int(block.get("missed_escalation", 0)),
        "unsafe_events": int(block.get("unsafe_events", 0)),
        "p95_latency_ms": float(block.get("p95_latency_ms", 0.0)),
        "time_to_escalation_s": float(block.get("time_to_escalation_s", 0.0)),
        "handoff_score": None if hs is None else float(hs),
        "failure_labels": list(block.get("failure_labels", [])),
    }


def simulate_scenarios(
    scenarios: Iterable[Scenario],
    repaired: bool,
    repaired_layers: set[FailureLayer] | None = None,
    has_guardrail: bool = False,
) -> list[ScenarioResult]:
    repaired_layers = repaired_layers or set()
    results: list[ScenarioResult] = []
    for s in scenarios:
        targeted = repaired and s.targets_layer is not None and s.targets_layer in repaired_layers
        block = _outcome(s, "repaired" if targeted else "baseline")

        # Safety-layer scenarios only clear their unsafe events if the repair
        # actually shipped a guardrail patch — otherwise the escalation/tool
        # gate alone may force a handoff but not stop unsafe wording under
        # pressure (e.g. unsupported reassurance to a caller in crisis).
        if (
            targeted
            and s.targets_layer == FailureLayer.safety_guardrail
            and not has_guardrail
        ):
            base = _outcome(s, "baseline")
            block["unsafe_events"] = base["unsafe_events"]
            block["task_success"] = False

        passed = (
            block["task_success"]
            and block["missed_escalation"] == 0
            and block["unsafe_events"] == 0
        )
        results.append(
            ScenarioResult(
                scenario_id=s.scenario_id,
                passed=passed,
                task_success=block["task_success"],
                entity_accuracy=block["entity_accuracy"],
                missed_escalation=block["missed_escalation"],
                unsafe_events=block["unsafe_events"],
                p95_latency_ms=block["p95_latency_ms"],
                time_to_escalation_s=block["time_to_escalation_s"],
                handoff_score=block["handoff_score"],
                failure_labels=block["failure_labels"],
                detail=("repaired" if targeted else "baseline")
                + f" outcome for layer {s.targets_layer.value if s.targets_layer else 'n/a'}",
            )
        )
    return results


def aggregate(results: list[ScenarioResult], entity_layers: set[str] | None = None) -> dict[str, float]:
    """Compute suite-level metrics from per-scenario results."""
    if not results:
        return {}
    n = len(results)
    task_success = sum(1 for r in results if r.task_success)
    passed = sum(1 for r in results if r.passed)
    missed_escalation = sum(r.missed_escalation for r in results)
    unsafe = sum(r.unsafe_events for r in results)

    # Correct-handoff rate over escalation-relevant scenarios only (those that
    # carry a handoff_score); scenarios with no handoff decision are excluded.
    handoff_vals = [r.handoff_score for r in results if r.handoff_score is not None]
    correct_handoff = round(sum(handoff_vals) / len(handoff_vals), 4) if handoff_vals else 0.0

    # Mean time-to-escalation over scenarios where an escalation was warranted
    # (time_to_escalation_s > 0).
    tte_vals = [r.time_to_escalation_s for r in results if r.time_to_escalation_s > 0]
    time_to_escalation = round(sum(tte_vals) / len(tte_vals), 1) if tte_vals else 0.0

    # Entity accuracy is measured over scenarios that actually stress entity
    # capture (identity/medication). Pure turn-taking / reasoning scenarios are
    # excluded — they don't exercise ASR entity capture.
    entity_layers = entity_layers or {
        "asr_entity_capture",
        "tool_call_policy",
        "safety_guardrail",
    }
    ent_vals = [
        r.entity_accuracy
        for r in results
        if r.detail.split("layer ")[-1] in entity_layers
    ]
    entity_accuracy = sum(ent_vals) / len(ent_vals) if ent_vals else 0.0

    # Suite-level "P95 first response latency": each scenario already carries
    # its own p95; the suite number is the mean of those per-scenario p95s.
    lat_vals = [r.p95_latency_ms for r in results if r.p95_latency_ms > 0]
    p95_latency = round(sum(lat_vals) / len(lat_vals), 1) if lat_vals else 0.0

    return {
        "task_success_count": float(task_success),
        "task_success_total": float(n),
        "task_success_rate": round(task_success / n, 4),
        "pass_count": float(passed),
        "pass_rate": round(passed / n, 4),
        "entity_accuracy": round(entity_accuracy, 4),
        "missed_escalation": float(missed_escalation),
        "unsafe_events": float(unsafe),
        "correct_handoff": correct_handoff,
        "time_to_escalation_s": time_to_escalation,
        "p95_latency_ms": p95_latency,
    }
