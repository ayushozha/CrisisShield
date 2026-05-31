"""
Smoke harness (spec.md §7, §13 Phase 0 first gate).

    uv run python -m app.harness.smoke --mode fixture

Runs every mandatory sponsor adapter through its mode contract and prints the
proof strip. FAILS (exit 1) if any required sponsor is absent or its adapter
status is `failed` — "the final harness command must fail if any sponsor
adapter is absent" (spec.md §7).
"""

from __future__ import annotations

import argparse
import sys

from rich.console import Console
from rich.table import Table

from ..models import AdapterStatus, SponsorMode
from ..sponsor_adapters import REQUIRED_SPONSORS, build_adapters
from ..sponsor_adapters.base import AdapterContext

console = Console()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="VoiceShield Forge sponsor smoke test")
    parser.add_argument("--mode", choices=["fixture", "live"], default="fixture")
    parser.add_argument("--run-id", default="smoke_001")
    args = parser.parse_args(argv)

    desired = SponsorMode(args.mode)
    adapters = build_adapters()

    missing = [s for s in REQUIRED_SPONSORS if s not in adapters]
    if missing:
        console.print(f"[bold red]FAIL[/]: missing sponsor adapters: {missing}")
        return 1

    ctx = AdapterContext(run_id=args.run_id, desired_mode=desired)

    table = Table(title=f"VoiceShield Forge — sponsor smoke ({args.mode} mode)")
    table.add_column("Sponsor", style="bold")
    table.add_column("Mode")
    table.add_column("Credentials")
    table.add_column("Status")
    table.add_column("Proof (key)")

    failed = False
    contracts = {}
    for name in REQUIRED_SPONSORS:
        contract = adapters[name].run(ctx)
        contracts[name] = contract
        mode_style = "green" if contract.mode == SponsorMode.live else "yellow"
        status_style = {
            AdapterStatus.ready: "green",
            AdapterStatus.degraded: "yellow",
            AdapterStatus.failed: "red",
        }[contract.status]
        proof_key = _first_proof(contract.proof)
        table.add_row(
            name,
            f"[{mode_style}]{contract.mode.value}[/]",
            contract.credential_state.value,
            f"[{status_style}]{contract.status.value}[/]",
            proof_key,
        )
        if contract.status == AdapterStatus.failed:
            failed = True

    console.print(table)

    present = [s for s in REQUIRED_SPONSORS if s in contracts]
    console.print(
        f"\nSponsors present: [bold]{len(present)}/{len(REQUIRED_SPONSORS)}[/] "
        f"({', '.join(present)})"
    )

    if failed:
        console.print("[bold red]SMOKE FAILED[/]: a sponsor adapter reported status=failed")
        return 1
    console.print("[bold green]SMOKE PASSED[/]: all sponsor adapters ready (live or fixture)")
    return 0


def _first_proof(proof: dict) -> str:
    for key in ("session_url", "call_sid", "baseline_run_id", "pipeline_id",
                "artifact_type", "eval_report_object"):
        if key in proof and proof[key]:
            return f"{key}={proof[key]}"
    for k, v in proof.items():
        if isinstance(v, (str, int, float)) and v:
            return f"{k}={v}"
    return "-"


if __name__ == "__main__":
    sys.exit(main())
