"""
SponsorAdapter — the uniform live-or-fixture contract.

Each adapter declares which env vars are its credentials. The base class then:
  1. resolves credential_state (present / placeholder / missing),
  2. picks the effective mode (live only if desired AND creds present),
  3. runs the live path with automatic degrade-to-fixture on any failure,
  4. always returns the same AdapterContract shape.

This is what lets the demo run end-to-end with placeholder keys while staying
honest: a degraded adapter is clearly labelled, never silently dropped.
"""

from __future__ import annotations

import traceback
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from ..config import credential_state
from ..models import (
    AdapterContract,
    AdapterStatus,
    CredentialState,
    SponsorMode,
)


@dataclass
class AdapterContext:
    """Shared inputs passed to an adapter for a given run."""

    run_id: str
    scenario_id: str = "crisis_escalation_001"
    desired_mode: SponsorMode = SponsorMode.fixture
    # Free-form domain payload (trace, repair pack, etc.) used by richer methods.
    payload: dict[str, Any] = field(default_factory=dict)


class SponsorAdapter(ABC):
    #: short, stable sponsor key (matches env var prefix, e.g. "daily")
    sponsor: str = "sponsor"

    # ── subclass surface ────────────────────────────────────────────────────
    @abstractmethod
    def credential_vars(self) -> list[str]:
        """Env var names that must be real (non-placeholder) for live mode."""

    @abstractmethod
    def run_fixture(self, ctx: AdapterContext) -> dict[str, Any]:
        """Return a deterministic, live-shaped proof dict."""

    def run_live(self, ctx: AdapterContext) -> dict[str, Any]:
        """Return a real proof dict. Default: not implemented -> degrade."""
        raise NotImplementedError(f"{self.sponsor} live mode not implemented")

    # ── shared machinery ──────────────────────────────────────────────────────
    def credential_state(self) -> CredentialState:
        return credential_state(*self.credential_vars())

    def effective_mode(self, desired: SponsorMode) -> SponsorMode:
        if desired == SponsorMode.live and self.credential_state() == CredentialState.present:
            return SponsorMode.live
        return SponsorMode.fixture

    def run(self, ctx: AdapterContext) -> AdapterContract:
        desired = ctx.desired_mode
        cred = self.credential_state()
        mode = self.effective_mode(desired)

        if mode == SponsorMode.live:
            try:
                proof = self.run_live(ctx)
                return AdapterContract(
                    sponsor=self.sponsor,
                    mode=SponsorMode.live,
                    credential_state=cred,
                    status=AdapterStatus.ready,
                    proof=proof,
                    note="live",
                )
            except Exception as exc:  # noqa: BLE001 - degrade, never crash the demo
                proof = self.run_fixture(ctx)
                return AdapterContract(
                    sponsor=self.sponsor,
                    mode=SponsorMode.fixture,
                    credential_state=cred,
                    status=AdapterStatus.degraded,
                    proof=proof,
                    note=f"live call failed ({exc.__class__.__name__}: {exc}); "
                    f"degraded to fixture",
                )

        # Fixture path.
        proof = self.run_fixture(ctx)
        note: Optional[str] = "fixture"
        status = AdapterStatus.ready
        if desired == SponsorMode.live and cred != CredentialState.present:
            status = AdapterStatus.degraded
            note = f"credentials {cred.value}; running fixture (add a real key to go live)"
        return AdapterContract(
            sponsor=self.sponsor,
            mode=SponsorMode.fixture,
            credential_state=cred,
            status=status,
            proof=proof,
            note=note,
        )

    # Convenience for adapters that want to log the live failure traceback.
    @staticmethod
    def _fmt_exc(exc: Exception) -> str:
        return "".join(traceback.format_exception_only(type(exc), exc)).strip()
