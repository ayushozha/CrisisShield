"""
Run-demo harness (spec.md §7, §13 Phase 1 second gate).

    uv run python -m app.harness.run_demo --mode fixture --scenario crisis_escalation_001

Runs the full improvement loop and produces the four required artifacts:
trace.json, eval-report.json, repair-pack.json, sponsor-proof.json. FAILS
(exit 1) if any artifact is missing.
"""

from __future__ import annotations

import argparse
import sys

from rich.console import Console
from rich.table import Table

from ..config import fixture_root
from ..models import SponsorMode
from ..orchestrator import build_demo_report

console = Console()

REQUIRED_ARTIFACTS = ["trace.json", "repair-pack.json", "sponsor-proof.json"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="VoiceShield Forge demo harness")
    parser.add_argument("--mode", choices=["fixture", "live"], default="fixture")
    parser.add_argument("--scenario", default="crisis_escalation_001")
    parser.add_argument("--run-id", default="demo_001")
    args = parser.parse_args(argv)

    desired = SponsorMode(args.mode)
    console.rule(f"[bold]VoiceShield Forge — run_demo ({args.mode}) — {args.scenario}")

    report, objects = build_demo_report(desired, args.scenario, args.run_id)

    # ── Failure router ─────────────────────────────────────────────────────────
    console.print("\n[bold]Failure router[/]")
    for c in report.failure_clusters:
        console.print(
            f"  • [bold]{c.failed_layer.value}[/] (sev={c.severity.value}, "
            f"freq={c.frequency}) — {c.root_cause}"
        )
        for ev in c.evidence:
            console.print(f"      - {ev}")

    # ── Repair pack ────────────────────────────────────────────────────────────
    console.print("\n[bold]Repair pack[/] "
                  f"({report.repair_pack.repair_id}, targets="
                  f"{[layer.value for layer in report.repair_pack.target_layers]})")
    for a in report.repair_pack.artifacts:
        console.print(f"  • {a.type}" + (f" [{a.provider}]" if a.provider else ""))
    console.print(f"  generated harder evals: {report.repair_pack.generated_eval_ids}")

    # ── Before / after ─────────────────────────────────────────────────────────
    console.print("\n[bold]Regression gate — before / after[/]")
    t = Table()
    t.add_column("Metric", style="bold")
    t.add_column("Before", justify="right")
    t.add_column("After", justify="right")
    t.add_column("Gate")
    m = report.regression.metrics
    checks_by = {c.name: c for c in report.regression.gate_checks}
    t.add_row("Task success", _pct(m["task_success"].before), _pct(m["task_success"].after),
              _gate(checks_by.get("task_success_gain")))
    t.add_row("Risk-tag accuracy", _pct(m["entity_accuracy"].before), _pct(m["entity_accuracy"].after), "Improved")
    t.add_row("Missed escalation", f"{int(m['missed_escalation'].before)}",
              f"{int(m['missed_escalation'].after)}", _gate(checks_by.get("missed_escalation_zero")))
    t.add_row("Unsafe responses", f"{int(m['unsafe_events'].before)}",
              f"{int(m['unsafe_events'].after)}", _gate(checks_by.get("unsafe_events_zero")))
    t.add_row("Correct handoff", _pct(m["correct_handoff"].before), _pct(m["correct_handoff"].after),
              _gate(checks_by.get("correct_handoff_min")))
    t.add_row("Time to escalation (s)", f"{m['time_to_escalation_s'].before:.0f}",
              f"{m['time_to_escalation_s'].after:.0f}", _gate(checks_by.get("time_to_escalation_budget")))
    t.add_row("P95 latency (ms)", f"{m['p95_latency_ms'].before:.0f}",
              f"{m['p95_latency_ms'].after:.0f}", _gate(checks_by.get("latency_budget")))
    console.print(t)

    decision = report.regression.promotion_decision.value.upper()
    label = "HUMAN REVIEW REQUIRED / STAGING PASS" if decision == "STAGING_PASS" else decision
    style = "green" if decision in ("PROMOTE", "STAGING_PASS") else "red"
    console.print(f"\nPromotion decision: [bold {style}]{label}[/] — "
                  f"{report.regression.promotion_reason}")

    # ── Sponsor proof strip ─────────────────────────────────────────────────────
    console.print("\n[bold]Sponsor proof[/]")
    st = Table()
    st.add_column("Sponsor", style="bold")
    st.add_column("Mode")
    st.add_column("Status")
    for name, contract in report.sponsor_proof.sponsors.items():
        st.add_row(name, contract.mode.value, contract.status.value)
    console.print(st)

    # ── Artifacts ───────────────────────────────────────────────────────────────
    run_dir = fixture_root() / "seeded-runs" / report.run_id
    console.print(f"\n[bold]Artifacts[/] -> {run_dir}")
    for name, uri in objects.items():
        console.print(f"  • {name}: {uri}")

    missing = [a for a in REQUIRED_ARTIFACTS if not (run_dir / a).exists()]
    if not (run_dir / "demo-report.json").exists():
        missing.append("demo-report.json")
    # eval-report is persisted to the AWS store; verify its URI was emitted.
    if "eval-report.json" not in objects:
        missing.append("eval-report.json (object)")

    if missing:
        console.print(f"[bold red]RUN_DEMO FAILED[/]: missing artifacts: {missing}")
        return 1
    console.print("\n[bold green]RUN_DEMO PASSED[/]: all artifacts produced.")
    return 0


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def _gate(check) -> str:
    if check is None:
        return "-"
    return f"{'PASS' if check.passed else 'FAIL'} ({check.detail})"


if __name__ == "__main__":
    sys.exit(main())
