"""
VoiceShield Forge — configuration & credential resolution.

Loads the repo-root .env (the single, gitignored home for every API key),
then exposes per-sponsor credential state. The cardinal rule (spec.md §2/§7):
a placeholder_* key keeps a sponsor in fixture mode; a real key flips it live
WITHOUT any product-code change. Nothing here ever raises on a missing key —
absence simply means fixture.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from .models import CredentialState

# Markers that mean "this is not a real credential".
_PLACEHOLDER_PREFIXES = ("placeholder", "changeme", "your_", "xxx", "todo")
_PLACEHOLDER_SUBSTRINGS = ("placeholder", ".example")


def _repo_root() -> Path:
    # app/config.py -> app -> voice-backend -> services -> <repo root>
    return Path(__file__).resolve().parents[3]


def _load_env() -> None:
    """Load .env from the repo root (and a couple of fallback locations)."""
    here = Path(__file__).resolve()
    candidates = [
        _repo_root() / ".env",
        here.parents[2] / ".env",  # services/voice-backend/.env
        Path.cwd() / ".env",
    ]
    for path in candidates:
        if path.exists():
            # override=False: real process env wins over the file, which lets
            # CI / a shell `export REAL_KEY=...` flip live mode without edits.
            load_dotenv(dotenv_path=path, override=False)


_load_env()


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default) or default


def _is_placeholder(value: str) -> bool:
    v = value.strip().lower()
    if not v:
        return True
    if any(v.startswith(p) for p in _PLACEHOLDER_PREFIXES):
        return True
    if any(s in v for s in _PLACEHOLDER_SUBSTRINGS):
        return True
    return False


def credential_state(*var_names: str) -> CredentialState:
    """Resolve the credential state for a set of required env vars."""
    values = [os.getenv(n) for n in var_names]
    if any(v is None or v.strip() == "" for v in values):
        # Missing if truly unset; otherwise it's an explicit placeholder.
        if all(v is None for v in values):
            return CredentialState.missing
    if any(v is None or _is_placeholder(v) for v in values):
        return CredentialState.placeholder
    return CredentialState.present


@lru_cache(maxsize=1)
def repo_root() -> Path:
    return _repo_root()


@lru_cache(maxsize=1)
def fixture_root() -> Path:
    return repo_root() / "demo"


@lru_cache(maxsize=1)
def aws_fixture_store() -> Path:
    """Local, AWS-shaped object store used when AWS runs in fixture mode."""
    p = repo_root() / "services" / "voice-backend" / ".aws-fixture-store"
    p.mkdir(parents=True, exist_ok=True)
    return p


class Settings:
    """Thin typed view over the environment used across the harness."""

    @property
    def app_env(self) -> str:
        return env("APP_ENV", "local")

    @property
    def harness_mode(self) -> str:
        return env("HARNESS_MODE", "fixture")

    @property
    def public_base_url(self) -> str:
        return env("PUBLIC_BASE_URL", "")

    # Per-sponsor *_MODE preferences (the CLI --mode flag overrides globally).
    def sponsor_mode_pref(self, sponsor: str) -> str:
        return env(f"{sponsor.upper()}_MODE", "fixture")


settings = Settings()
