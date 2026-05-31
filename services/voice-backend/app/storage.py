"""
Storage (spec.md §5 storage, §6 final artifacts, §13 Phase 6).

Persists the four required artifacts — trace.json, eval-report.json,
repair-pack.json, sponsor-proof.json — plus the NVIDIA repair artifact, through
the AWS adapter (real S3/DynamoDB in live mode, an AWS-shaped local store in
fixture mode). It ALSO mirrors the full DemoReport into demo/seeded-runs/<run>/
so the dashboard can read it directly with no backend round-trip (degradation
Level C/D).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import fixture_root
from .models import DemoReport
from .sponsor_adapters import AwsAdapter
from .sponsor_adapters.base import AdapterContext


def _seeded_run_dir(run_id: str) -> Path:
    d = fixture_root() / "seeded-runs" / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def persist_demo_report(
    report: DemoReport,
    aws: AwsAdapter,
    ctx: AdapterContext,
    nvidia_artifact: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Write all artifacts. Returns a map of artifact name -> s3:// URI."""
    objects: dict[str, str] = {}

    objects["trace.json"] = aws.persist(ctx, "trace.json", report.trace.model_dump(mode="json"))
    if report.secondary_trace:
        objects["trace-secondary.json"] = aws.persist(
            ctx, "trace-secondary.json", report.secondary_trace.model_dump(mode="json")
        )
    objects["eval-report.json"] = aws.persist(
        ctx,
        "eval-report.json",
        {
            "baseline_eval": report.baseline_eval.model_dump(mode="json"),
            "regression_eval": report.regression_eval.model_dump(mode="json"),
            "regression": report.regression.model_dump(mode="json"),
        },
    )
    objects["repair-pack.json"] = aws.persist(
        ctx, "repair-pack.json", report.repair_pack.model_dump(mode="json")
    )
    objects["sponsor-proof.json"] = aws.persist(
        ctx, "sponsor-proof.json", report.sponsor_proof.model_dump(mode="json")
    )
    if nvidia_artifact is not None:
        objects["nvidia-repair.json"] = aws.persist(ctx, "nvidia-repair.json", nvidia_artifact)

    # DynamoDB run index.
    aws.index_run(
        ctx,
        {
            "promotion_decision": report.regression.promotion_decision.value,
            "task_success_before": report.regression.metrics.get("task_success").before
            if report.regression.metrics.get("task_success")
            else None,
            "task_success_after": report.regression.metrics.get("task_success").after
            if report.regression.metrics.get("task_success")
            else None,
            "created_at": report.created_at,
            "mode": report.mode.value,
        },
    )

    # Mirror the full report + individual artifacts to demo/seeded-runs/<run>/.
    run_dir = _seeded_run_dir(report.run_id)
    (run_dir / "demo-report.json").write_text(
        json.dumps(report.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    (run_dir / "trace.json").write_text(
        json.dumps(report.trace.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    (run_dir / "repair-pack.json").write_text(
        json.dumps(report.repair_pack.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    (run_dir / "sponsor-proof.json").write_text(
        json.dumps(report.sponsor_proof.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    if nvidia_artifact is not None:
        (run_dir / "nvidia-repair.json").write_text(
            json.dumps(nvidia_artifact, indent=2), encoding="utf-8"
        )

    # A stable pointer the dashboard/backend can always resolve to "the latest run".
    latest = fixture_root() / "seeded-runs" / "latest.json"
    latest.write_text(
        json.dumps({"run_id": report.run_id, "objects": objects}, indent=2), encoding="utf-8"
    )

    return objects
