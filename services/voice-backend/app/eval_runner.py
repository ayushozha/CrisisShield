"""
Eval Runner (spec.md §5 eval-runner service).

Thin orchestration that runs baseline and post-repair scenarios THROUGH the
Cekura adapter and never bypasses the harness. This module is intentionally
tiny: its whole job is to guarantee that no eval path exists that skips Cekura
(spec.md Phase 4 gate: "no local-only eval path bypasses the Cekura adapter").
"""

from __future__ import annotations

from .models import EvalRun, RepairPack, Scenario
from .sponsor_adapters import CekuraAdapter
from .sponsor_adapters.base import AdapterContext


def run_baseline(
    cekura: CekuraAdapter, scenarios: list[Scenario], ctx: AdapterContext
) -> EvalRun:
    return cekura.evaluate(ctx, scenarios, kind="baseline", repaired=False)


def run_regression(
    cekura: CekuraAdapter,
    scenarios: list[Scenario],
    ctx: AdapterContext,
    repair_pack: RepairPack,
) -> EvalRun:
    return cekura.evaluate(
        ctx, scenarios, kind="regression", repaired=True, repair_pack=repair_pack
    )
