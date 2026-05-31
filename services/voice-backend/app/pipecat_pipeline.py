"""
Pipecat pipeline (spec.md §4 Pipecat, §12 Twilio/Daily transports).

Builds a Pipecat voice pipeline with INDEPENDENT Daily and Twilio transports
and a per-frame trace hook that normalizes ASR/LLM/TTS frames into our
CallTrace contract. Everything pipecat-specific is imported lazily so this
module is safe to import even when `pipecat-ai` is not installed (fixture mode
of the harness must never require the heavy voice stack).

Wired from the verified pipecat 1.3.0 telephony example:
  TwilioFrameSerializer + FastAPIWebsocketTransport, services under
  pipecat.services.<vendor>.<modality>, frames from pipecat.frames.frames.
"""

from __future__ import annotations

import importlib.util
from typing import Any


def pipecat_available() -> bool:
    return importlib.util.find_spec("pipecat") is not None


def make_trace_collector():
    """Return a Pipecat FrameProcessor subclass instance that records frames
    into a CallTrace-shaped buffer. Defined lazily so the import only happens
    when pipecat is present."""
    from pipecat.frames.frames import (  # type: ignore
        Frame,
        TranscriptionFrame,
        TTSAudioRawFrame,
    )
    from pipecat.processors.frame_processor import (  # type: ignore
        FrameDirection,
        FrameProcessor,
    )

    try:
        from pipecat.frames.frames import LLMTextFrame  # type: ignore
    except Exception:  # noqa: BLE001
        LLMTextFrame = None  # type: ignore

    class TraceCollector(FrameProcessor):
        """Captures per-frame events for the dashboard trace timeline."""

        def __init__(self) -> None:
            super().__init__()
            self.events: list[dict[str, Any]] = []

        async def process_frame(self, frame: "Frame", direction: "FrameDirection"):
            label = type(frame).__name__
            if isinstance(frame, TranscriptionFrame):
                self.events.append(
                    {"stage": "asr", "frame": label, "text": getattr(frame, "text", "")}
                )
            elif LLMTextFrame is not None and isinstance(frame, LLMTextFrame):
                self.events.append(
                    {"stage": "llm", "frame": label, "text": getattr(frame, "text", "")}
                )
            elif isinstance(frame, TTSAudioRawFrame):
                self.events.append({"stage": "tts", "frame": label})
            await self.push_frame(frame, direction)

    return TraceCollector()


def build_twilio_transport(websocket, call_data: dict[str, Any]):
    """Create a Pipecat FastAPI websocket transport with the Twilio serializer.
    Mirrors the pipecat 1.3.0 twilio-chatbot example."""
    import os

    from pipecat.serializers.twilio import TwilioFrameSerializer  # type: ignore
    from pipecat.transports.websocket.fastapi import (  # type: ignore
        FastAPIWebsocketParams,
        FastAPIWebsocketTransport,
    )

    serializer = TwilioFrameSerializer(
        stream_sid=call_data.get("stream_id", ""),
        call_sid=call_data.get("call_id", ""),
        account_sid=os.getenv("TWILIO_ACCOUNT_SID", ""),
        auth_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
    )
    return FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )


def build_daily_transport(room_url: str, token: str | None = None):
    """Create a Pipecat Daily transport for a realtime AI session."""
    from pipecat.transports.daily.transport import (  # type: ignore
        DailyParams,
        DailyTransport,
    )

    return DailyTransport(
        room_url,
        token,
        "VoiceShield Forge agent",
        DailyParams(audio_in_enabled=True, audio_out_enabled=True),
    )


def describe_pipeline() -> dict[str, Any]:
    """Static description of the pipeline shape (used by fixture mode / docs)."""
    return {
        "available": pipecat_available(),
        "order": [
            "transport.input()",
            "stt (ASR)",
            "user_aggregator",
            "llm",
            "tts",
            "transport.output()",
            "trace_collector",
        ],
        "frames": [
            "InputAudioRawFrame",
            "TranscriptionFrame",
            "LLMTextFrame",
            "TTSAudioRawFrame",
            "OutputAudioRawFrame",
        ],
        "transports": ["daily", "twilio_media_streams"],
    }
