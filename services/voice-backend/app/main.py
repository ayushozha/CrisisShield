"""
VoiceShield Forge — FastAPI control plane (spec.md §5 voice-backend).

Endpoints the Next.js dashboard calls. Every route works in fixture mode with
placeholder keys; live mode is unlocked per-sponsor by real keys in .env. The
demo loop is the SAME orchestrator used by the CLI harness.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .config import fixture_root, settings
from .harness import fixtures
from .models import CallTrace, SponsorMode
from .orchestrator import build_demo_report, build_report_from_trace
from .pipecat_pipeline import describe_pipeline, pipecat_available
from .sponsor_adapters import REQUIRED_SPONSORS, build_adapters
from .sponsor_adapters.base import AdapterContext

app = FastAPI(title="VoiceShield Forge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory live telephony stream registry (populated by /ws/twilio).
LIVE_STREAMS: dict[str, dict[str, Any]] = {}

# In-memory normalized live traces (populated by the Pipecat trace bridge).
LIVE_TRACES: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _remember_live_trace(
    trace: CallTrace,
    status: str = "streaming",
    report_run_id: str | None = None,
) -> dict[str, Any]:
    snapshot = {
        "call_id": trace.call_id,
        "source": trace.source.value,
        "scenario_id": trace.scenario_id,
        "transport": trace.transport,
        "turn_count": len(trace.turns),
        "status": status,
        "updated_at": _now_iso(),
        "report_run_id": report_run_id,
        "trace": trace.model_dump(mode="json"),
    }
    LIVE_TRACES[trace.call_id] = snapshot
    return snapshot


def _with_trailing_path(base: str, path: str) -> str:
    return f"{base.rstrip('/')}{path}"


def _stream_url(public_base: str) -> str | None:
    if not public_base:
        return None
    return (
        public_base.rstrip("/")
        .replace("https://", "wss://")
        .replace("http://", "ws://")
        + "/ws/twilio"
    )


def _same_url(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    return left.rstrip("/") == right.rstrip("/")


def _safe_iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _latest(items: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    if not items:
        return None
    return max(items.values(), key=lambda item: str(item.get("updated_at", "")))


def _twilio_account_snapshot(expected_voice_urls: list[str]) -> dict[str, Any]:
    """Read Twilio phone-number wiring without exposing credentials."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    number_sid = os.getenv("TWILIO_PHONE_NUMBER_SID", "").strip()
    env_number = os.getenv("TWILIO_PHONE_NUMBER", "").strip()
    snapshot: dict[str, Any] = {
        "configured_number": env_number or None,
        "number_sid": number_sid or None,
        "number_config": None,
        "latest_call": None,
        "lookup_error": None,
    }
    if not account_sid or not auth_token:
        snapshot["lookup_error"] = "Twilio credentials are not available in this process."
        return snapshot
    try:
        from twilio.rest import Client  # type: ignore

        client = Client(account_sid, auth_token)
        number = None
        if number_sid:
            number = client.incoming_phone_numbers(number_sid).fetch()
        elif env_number:
            matches = client.incoming_phone_numbers.list(phone_number=env_number, limit=1)
            number = matches[0] if matches else None

        phone_number = env_number
        if number is not None:
            phone_number = getattr(number, "phone_number", env_number)
            voice_url = getattr(number, "voice_url", None)
            snapshot["number_config"] = {
                "sid": getattr(number, "sid", None),
                "phone_number": phone_number,
                "voice_url": voice_url,
                "voice_method": getattr(number, "voice_method", None),
                "status_callback": getattr(number, "status_callback", None),
                "webhook_matches": any(_same_url(voice_url, url) for url in expected_voice_urls),
            }
        elif env_number:
            snapshot["lookup_error"] = f"Twilio number {env_number} was not found on this account."

        if phone_number:
            calls = client.calls.list(to=phone_number, limit=1)
            if calls:
                call = calls[0]
                snapshot["latest_call"] = {
                    "sid": getattr(call, "sid", None),
                    "from": getattr(call, "_from", None) or getattr(call, "from_formatted", None),
                    "to": getattr(call, "to", None),
                    "status": getattr(call, "status", None),
                    "direction": getattr(call, "direction", None),
                    "started_at": _safe_iso(getattr(call, "start_time", None)),
                    "ended_at": _safe_iso(getattr(call, "end_time", None)),
                    "duration": getattr(call, "duration", None),
                    "error_code": getattr(call, "error_code", None),
                }
    except Exception as exc:  # pragma: no cover - depends on live Twilio account/network.
        snapshot["lookup_error"] = f"{type(exc).__name__}: {str(exc)[:180]}"
    return snapshot


def _mode(request: Request) -> SponsorMode:
    raw = request.query_params.get("mode") or settings.harness_mode
    return SponsorMode(raw if raw in ("live", "fixture") else "fixture")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "app_env": settings.app_env,
        "harness_mode": settings.harness_mode,
        "pipecat_available": pipecat_available(),
        "required_sponsors": REQUIRED_SPONSORS,
    }


@app.get("/api/config")
def config() -> dict[str, Any]:
    return {
        "demo_mode": settings.harness_mode,
        "public_base_url": settings.public_base_url,
        "pipeline": describe_pipeline(),
    }


@app.get("/api/twilio/readiness")
def twilio_readiness() -> dict[str, Any]:
    """Expose the live Twilio ingress state the dashboard needs.

    This is intentionally read-only: it verifies webhook wiring, recent calls,
    websocket streams, and trace ingestion without placing calls or changing the
    Twilio number configuration.
    """
    public_base = settings.public_base_url.rstrip("/")
    cloud_voice_webhook = os.getenv("PIPECAT_CLOUD_VOICE_WEBHOOK", "").rstrip("/")
    cloud_agent_host = os.getenv("PIPECAT_CLOUD_AGENT_HOST", "voiceshield-forge-agent.ayushojha")
    cloud_handoff_ready = bool(cloud_voice_webhook or cloud_agent_host)
    expected_voice_urls = (
        [_with_trailing_path(public_base, "/api/twilio/voice"), public_base]
        if public_base
        else []
    )
    if cloud_voice_webhook:
        expected_voice_urls.append(cloud_voice_webhook)
    expected_stream = _stream_url(public_base)
    twilio = _twilio_account_snapshot(expected_voice_urls)

    latest_stream = _latest(LIVE_STREAMS)
    latest_trace = _latest(LIVE_TRACES)
    stream_count = len(LIVE_STREAMS)
    active_streams = sum(1 for stream in LIVE_STREAMS.values() if stream.get("status") == "streaming")
    trace_count = len(LIVE_TRACES)
    pipeline = describe_pipeline()

    issues: list[str] = []
    if not public_base and not cloud_handoff_ready:
        issues.append("PUBLIC_BASE_URL is empty, so Twilio cannot reach this localhost backend.")

    number_config = twilio.get("number_config") or {}
    if cloud_handoff_ready and not number_config:
        number_config = {
            "phone_number": twilio.get("configured_number"),
            "voice_url": cloud_voice_webhook or "Pipecat Cloud handoff server",
            "webhook_matches": True,
        }
    voice_url = number_config.get("voice_url")
    webhook_matches = number_config.get("webhook_matches")
    if voice_url and webhook_matches is False:
        expected = expected_voice_urls[0] if expected_voice_urls else "/api/twilio/voice on the active tunnel"
        issues.append(f"Twilio voice webhook is {voice_url}; expected {expected}.")
    elif not voice_url and not twilio.get("lookup_error"):
        issues.append("Twilio voice webhook is not configured on the phone number.")

    latest_call = twilio.get("latest_call")
    if latest_call and stream_count == 0 and not cloud_handoff_ready:
        issues.append("Twilio shows a recent call, but this backend has not received its Media Stream.")

    if not pipeline.get("available") and not cloud_handoff_ready:
        issues.append(
            "Pipecat pipeline is unavailable here; stream metadata can be recorded, "
            "but transcript requires the starter bot trace bridge."
        )
    if stream_count == 0 and not cloud_handoff_ready:
        issues.append("No Twilio Media Stream has reached /ws/twilio yet.")
    if twilio.get("lookup_error") and not cloud_handoff_ready:
        issues.append(str(twilio["lookup_error"]))

    if active_streams:
        status = "receiving"
    elif trace_count:
        status = "tracing"
    elif issues and (not public_base or webhook_matches is False):
        status = "blocked"
    else:
        status = "waiting"

    return {
        "status": status,
        "checked_at": _now_iso(),
        "public_base_url": public_base,
        "expected_voice_webhook": expected_voice_urls[0] if expected_voice_urls else None,
        "accepted_voice_webhooks": expected_voice_urls,
        "expected_stream_url": expected_stream,
        "configured_number": twilio.get("configured_number"),
        "number_sid": twilio.get("number_sid"),
        "number_config": number_config or None,
        "latest_call": latest_call,
        "streams": {
            "total": stream_count,
            "active": active_streams,
            "latest": latest_stream,
        },
        "traces": {
            "total": trace_count,
            "latest": latest_trace,
        },
        "pipeline": pipeline,
        "handoff": {
            "mode": "pipecat_cloud" if cloud_handoff_ready else "backend_ws",
            "agent_host": cloud_agent_host if cloud_handoff_ready else None,
            "voice_webhook": cloud_voice_webhook or None,
        },
        "issues": issues,
    }


@app.get("/api/scenarios")
def scenarios() -> dict[str, Any]:
    return {"scenarios": [s.model_dump(mode="json") for s in fixtures.load_baseline_suite()]}


@app.get("/api/sponsors")
def sponsors(request: Request) -> dict[str, Any]:
    mode = _mode(request)
    adapters = build_adapters()
    ctx = AdapterContext(run_id="probe", desired_mode=mode)
    out = {}
    for name in REQUIRED_SPONSORS:
        out[name] = adapters[name].run(ctx).model_dump(mode="json")
    return {"mode": mode.value, "sponsors": out}


@app.post("/api/demo/run")
def demo_run(request: Request) -> dict[str, Any]:
    mode = _mode(request)
    scenario = request.query_params.get("scenario", "crisis_escalation_001")
    run_id = request.query_params.get("run_id", "demo_001")
    report, objects = build_demo_report(mode, scenario, run_id)
    return {"report": report.model_dump(mode="json"), "objects": objects}


@app.post("/api/trace/ingest")
def trace_ingest(trace: CallTrace, request: Request) -> dict[str, Any]:
    """Ingest a normalized CallTrace from a REAL Pipecat call (the starter bot's
    VoiceShield trace collector POSTs here) and run the full improvement loop on
    it: router -> repair -> Cekura -> regression gate -> persist. This is how a
    live call becomes a DemoReport the dashboard renders."""
    mode = _mode(request)
    run_id = request.query_params.get("run_id", f"live_{trace.call_id}")
    report, objects = build_report_from_trace(trace, desired_mode=mode, run_id=run_id)
    _remember_live_trace(trace, status="completed", report_run_id=run_id)
    return {"report": report.model_dump(mode="json"), "objects": objects}


@app.post("/api/trace/live")
def trace_live_update(trace: CallTrace, request: Request) -> dict[str, Any]:
    """Best-effort live transcript snapshot.

    The starter bot posts here after each finalized caller or agent turn. The
    payload is still the normalized CallTrace contract, just incomplete until
    /api/trace/ingest receives the final completed trace.
    """
    status = request.query_params.get("status") or "streaming"
    snapshot = _remember_live_trace(trace, status=status)
    return {"ok": True, "snapshot": snapshot}


@app.get("/api/trace/live")
def trace_live() -> dict[str, Any]:
    traces = sorted(
        LIVE_TRACES.values(),
        key=lambda item: str(item.get("updated_at", "")),
        reverse=True,
    )
    return {"traces": traces}


@app.get("/api/demo/latest")
def demo_latest() -> JSONResponse:
    """Return the most recently persisted DemoReport (degradation Level C/D:
    the dashboard works even with the backend offline by reading this file)."""
    latest_ptr = fixture_root() / "seeded-runs" / "latest.json"
    if latest_ptr.exists():
        run_id = json.loads(latest_ptr.read_text(encoding="utf-8")).get("run_id", "demo_001")
    else:
        run_id = "demo_001"
    report_path = fixture_root() / "seeded-runs" / run_id / "demo-report.json"
    if not report_path.exists():
        # Generate it on the fly (fixture mode) so the dashboard is never empty.
        report, _ = build_demo_report(SponsorMode.fixture)
        return JSONResponse(report.model_dump(mode="json"))
    return JSONResponse(json.loads(report_path.read_text(encoding="utf-8")))


@app.get("/api/demo/runs/{run_id}")
def demo_run_by_id(run_id: str) -> JSONResponse:
    path = fixture_root() / "seeded-runs" / run_id / "demo-report.json"
    if not path.exists():
        return JSONResponse({"error": f"run {run_id} not found"}, status_code=404)
    return JSONResponse(json.loads(path.read_text(encoding="utf-8")))


@app.post("/api/daily/session")
def daily_session(request: Request) -> dict[str, Any]:
    mode = _mode(request)
    run_id = request.query_params.get("run_id", "live_session")
    adapters = build_adapters()
    ctx = AdapterContext(run_id=run_id, desired_mode=mode)
    return adapters["daily"].run(ctx).model_dump(mode="json")


def _twilio_voice_response(request: Request) -> Response:
    """TwiML webhook for inbound Twilio calls -> opens a Media Stream into us."""
    public = settings.public_base_url or str(request.base_url).rstrip("/")
    ws_url = public.replace("https://", "wss://").replace("http://", "ws://") + "/ws/twilio"
    adapters = build_adapters()
    twiml = adapters["twilio"].twiml_for_inbound(ws_url, "live_call", "crisis_escalation_001")
    return Response(content=twiml, media_type="application/xml")


@app.post("/")
async def twilio_voice_root(request: Request) -> Response:
    return _twilio_voice_response(request)


@app.post("/api/twilio/voice")
async def twilio_voice(request: Request) -> Response:
    return _twilio_voice_response(request)


@app.get("/api/twilio/streams")
def twilio_streams() -> dict[str, Any]:
    return {"streams": LIVE_STREAMS}


@app.websocket("/ws/twilio")
async def ws_twilio(websocket: WebSocket) -> None:
    """Twilio Media Streams ingress. Handles connected/start/media/stop. When
    pipecat + service keys are present this is where the live pipeline attaches;
    otherwise we record stream metadata into the live registry so the dashboard
    still shows a real call SID / stream SID."""
    await websocket.accept()
    call_sid = None
    stream_sid = None
    media_frames = 0
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            event = msg.get("event")
            if event == "start":
                start = msg.get("start", {})
                stream_sid = msg.get("streamSid") or start.get("streamSid")
                call_sid = start.get("callSid")
                LIVE_STREAMS[call_sid or stream_sid or "unknown"] = {
                    "call_sid": call_sid,
                    "stream_sid": stream_sid,
                    "media_format": start.get("mediaFormat"),
                    "media_frames": 0,
                    "status": "streaming",
                    "updated_at": _now_iso(),
                }
            elif event == "media":
                media_frames += 1
                key = call_sid or stream_sid or "unknown"
                if key in LIVE_STREAMS:
                    LIVE_STREAMS[key]["media_frames"] = media_frames
                    LIVE_STREAMS[key]["updated_at"] = _now_iso()
            elif event == "stop":
                key = call_sid or stream_sid or "unknown"
                if key in LIVE_STREAMS:
                    LIVE_STREAMS[key]["status"] = "completed"
                    LIVE_STREAMS[key]["updated_at"] = _now_iso()
                break
    except WebSocketDisconnect:
        pass
