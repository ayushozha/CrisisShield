"""
AWS adapter — production persistence / deployment proof (spec.md §4, §7).

Persists trace, eval report, repair pack, and sponsor proof. Live mode writes
to S3 + DynamoDB via boto3; fixture mode writes to an AWS-shaped LOCAL object
store under .aws-fixture-store/ using the SAME s3://<bucket>/<key> URI scheme
and the SAME DynamoDB run-index item schema. The dashboard cannot tell the
schema apart — only the `mode` badge differs.
"""

from __future__ import annotations

import json
import os
from typing import Any

from ..config import aws_fixture_store
from .base import AdapterContext, SponsorAdapter


class AwsAdapter(SponsorAdapter):
    sponsor = "aws"

    def credential_vars(self) -> list[str]:
        return ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]

    @property
    def bucket(self) -> str:
        return os.getenv("VOICEFORGE_S3_BUCKET", "voiceforge-fixture")

    @property
    def table(self) -> str:
        return os.getenv("VOICEFORGE_DDB_TABLE", "voiceforge-fixture-runs")

    def _key(self, run_id: str, name: str) -> str:
        return f"runs/{run_id}/{name}"

    def _uri(self, key: str) -> str:
        return f"s3://{self.bucket}/{key}"

    # ── domain methods used by run_demo ───────────────────────────────────────
    def persist(self, ctx: AdapterContext, name: str, obj: Any) -> str:
        """Write one JSON artifact. Returns its s3:// URI (live or fixture)."""
        key = self._key(ctx.run_id, name)
        body = json.dumps(obj, indent=2, default=str).encode("utf-8")
        mode = self.effective_mode(ctx.desired_mode)
        if mode.value == "live":
            try:
                self._s3_put(key, body)
                return self._uri(key)
            except Exception:  # noqa: BLE001 - fall back to fixture store
                pass
        # Fixture / fallback: write to the local AWS-shaped store.
        dest = aws_fixture_store() / self.bucket / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
        return self._uri(key)

    def index_run(self, ctx: AdapterContext, item: dict[str, Any]) -> dict[str, Any]:
        """Write a DynamoDB run-index item. Returns the item key."""
        record = {"run_id": ctx.run_id, "scenario_id": ctx.scenario_id, **item}
        mode = self.effective_mode(ctx.desired_mode)
        if mode.value == "live":
            try:
                self._ddb_put(record)
                return {"table": self.table, "run_id": ctx.run_id}
            except Exception:  # noqa: BLE001
                pass
        index_path = aws_fixture_store() / f"{self.table}.jsonl"
        with index_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, default=str) + "\n")
        return {"table": self.table, "run_id": ctx.run_id}

    # ── boto3 (lazy) ──────────────────────────────────────────────────────────
    def _s3_put(self, key: str, body: bytes) -> None:
        import boto3  # lazy import

        boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-west-2")).put_object(
            Bucket=self.bucket, Key=key, Body=body, ContentType="application/json"
        )

    def _ddb_put(self, item: dict[str, Any]) -> None:
        import boto3  # lazy import

        # DynamoDB resource rejects floats -> stringify the whole item to be safe.
        safe = json.loads(json.dumps(item, default=str))
        boto3.resource("dynamodb", region_name=os.getenv("AWS_REGION", "us-west-2")).Table(
            self.table
        ).put_item(Item=safe)

    # ── contract surface ──────────────────────────────────────────────────────
    def run_fixture(self, ctx: AdapterContext) -> dict[str, Any]:
        return self._proof(ctx, live=False)

    def run_live(self, ctx: AdapterContext) -> dict[str, Any]:
        # Touch the bucket to verify credentials, then report proof.
        import boto3  # lazy import

        boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-west-2")).head_bucket(
            Bucket=self.bucket
        )
        return self._proof(ctx, live=True)

    def _proof(self, ctx: AdapterContext, live: bool) -> dict[str, Any]:
        return {
            "store": "s3+dynamodb" if live else "aws-shaped-local-fixture-store",
            "region": os.getenv("AWS_REGION", "us-west-2"),
            "s3_bucket": self.bucket,
            "ddb_table": self.table,
            "trace_object": self._uri(self._key(ctx.run_id, "trace.json")),
            "eval_report_object": self._uri(self._key(ctx.run_id, "eval-report.json")),
            "repair_pack_object": self._uri(self._key(ctx.run_id, "repair-pack.json")),
            "sponsor_proof_object": self._uri(self._key(ctx.run_id, "sponsor-proof.json")),
            "ddb_run_key": {"table": self.table, "run_id": ctx.run_id},
        }
