# voice-backend — VoiceShield Forge harness

Harness-first backend: sponsor adapters, failure router, repair compiler,
regression gate, and the FastAPI control plane.

## Quick start (fixture mode, no real keys needed)

```bash
cd services/voice-backend
uv sync
uv run python -m app.harness.smoke --mode fixture
uv run python -m app.harness.run_demo --mode fixture --scenario pharmacy_refill_001
uv run uvicorn app.main:app --reload --port 8000
```

Live mode (once keys are in the repo-root `.env`):

```bash
uv sync --extra all
uv run python -m app.harness.smoke --mode live
uv run python -m app.harness.run_demo --mode live --scenario pharmacy_refill_001
```

See `../../docs/sponsor-integration.md` for the adapter contract.
