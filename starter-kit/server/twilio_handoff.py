"""Twilio front door for the VoiceShield demo.

Inbound calls hear two ringback tones, then Twilio connects the call to the
Pipecat Cloud agent over Media Streams. Spoken prompts live in Pipecat so the
full flow uses NVIDIA/Nemotron STT+LLM and Gradium TTS instead of Twilio's IVR
voice.
"""

from __future__ import annotations

import math
import os
import struct
import wave
from functools import lru_cache
from html import escape
from io import BytesIO

from fastapi import FastAPI
from fastapi.responses import Response

app = FastAPI()


def _env(name: str, default: str) -> str:
    value = os.getenv(name, "").strip()
    return value or default


def _public_base() -> str:
    return _env("PUBLIC_HANDOFF_BASE_URL", "https://empty-brooms-stand.loca.lt").rstrip("/")


def _xml(body: str) -> str:
    return f"<?xml version='1.0' encoding='UTF-8'?><Response>{body}</Response>"


def _connect_agent(reason: str) -> str:
    agent_service_host = _env(
        "PIPECAT_CLOUD_SERVICE_HOST",
        "voiceshield-forge-agent.ayushojha",
    )
    stream_url = _env("PIPECAT_TWILIO_STREAM_URL", "wss://api.pipecat.daily.co/ws/twilio")
    return (
        f"<Connect><Stream url='{escape(stream_url)}'>"
        f"<Parameter name='_pipecatCloudServiceHost' value='{escape(agent_service_host)}'/>"
        "<Parameter name='handoff_flow' value='pipecat_full_duplex_agent_gate'/>"
        f"<Parameter name='transfer_reason' value='{escape(reason)}'/>"
        "</Stream></Connect>"
    )


def _ringback() -> str:
    public_base = _public_base()
    ringback_url = _env("TWILIO_RINGBACK_URL", f"{public_base}/ringback.wav")
    return f"<Play>{escape(ringback_url)}</Play>"


def build_twiml() -> str:
    # Two quick ringback tones, then immediately bridge into the full-duplex
    # Pipecat/Nemotron agent. The agent speaks the opt-in and emergency flow.
    return _xml(_ringback() + _connect_agent("front_door_pipecat_gate"))


@lru_cache(maxsize=1)
def ringback_wav() -> bytes:
    """Generate a short two-ring US-style ringback tone."""
    sample_rate = 8000
    amplitude = 10500
    segments = [
        ("tone", 1.1),
        ("silence", 0.45),
        ("tone", 1.1),
        ("silence", 0.2),
    ]
    frames: list[bytes] = []
    sample_index = 0
    for kind, seconds in segments:
        count = int(sample_rate * seconds)
        for _ in range(count):
            if kind == "tone":
                t = sample_index / sample_rate
                sample = int(
                    amplitude
                    * (
                        math.sin(2 * math.pi * 440 * t)
                        + math.sin(2 * math.pi * 480 * t)
                    )
                    / 2
                )
            else:
                sample = 0
            frames.append(struct.pack("<h", sample))
            sample_index += 1

    buf = BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"".join(frames))
    return buf.getvalue()


@app.get("/")
def health() -> dict[str, str]:
    return {"status": "ready", "flow": "pipecat_full_duplex_agent_gate"}


@app.post("/")
def twilio_voice() -> Response:
    return Response(content=build_twiml(), media_type="application/xml")


@app.get("/ringback.wav")
def twilio_ringback() -> Response:
    return Response(content=ringback_wav(), media_type="audio/wav")
