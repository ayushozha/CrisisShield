#
# VoiceShield Forge — live trace bridge for the hackathon starter bot.
#
# Drop this processor into the Pipecat pipeline and it captures the call as a
# normalized VoiceShield `CallTrace`, then POSTs it to the Forge backend on
# disconnect. The backend runs the SAME failure-router -> repair-compiler ->
# Cekura -> regression-gate loop on the real call that it runs on the fixture.
#
# Wiring (2 lines in bot-gpt.py / bot-nemotron.py):
#
#     from voiceshield_trace import VoiceShieldTraceProcessor
#     vsf = VoiceShieldTraceProcessor(scenario_id="pharmacy_refill_001", source="daily")
#     pipeline = Pipeline([
#         transport.input(), stt, user_aggregator, llm, tts, transport.output(),
#         assistant_aggregator, vsf,           # <- add at the end of the pipeline
#     ])
#     # ...and in on_client_disconnected:  await vsf.flush()
#
# It is fully best-effort: any failure is logged and swallowed so it can never
# break a live call.

from __future__ import annotations

import asyncio
import os
import time
import uuid
from datetime import UTC, datetime

import aiohttp
from loguru import logger
from pipecat.frames.frames import Frame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

# Frame types vary slightly across pipecat versions; resolve by name defensively.
try:
    from pipecat.frames.frames import TranscriptionFrame
except Exception:  # pragma: no cover
    TranscriptionFrame = None  # type: ignore
try:
    from pipecat.frames.frames import LLMTextFrame
except Exception:  # pragma: no cover
    LLMTextFrame = None  # type: ignore
try:
    from pipecat.frames.frames import LLMFullResponseEndFrame
except Exception:  # pragma: no cover
    LLMFullResponseEndFrame = None  # type: ignore
try:
    from pipecat.frames.frames import FunctionCallInProgressFrame
except Exception:  # pragma: no cover
    FunctionCallInProgressFrame = None  # type: ignore
try:
    from pipecat.frames.frames import CancelFrame, EndFrame
except Exception:  # pragma: no cover
    EndFrame = CancelFrame = None  # type: ignore


class VoiceShieldTraceProcessor(FrameProcessor):
    """Collects a live Pipecat call into a VoiceShield CallTrace and ships it."""

    def __init__(
        self,
        scenario_id: str = "live_call",
        source: str = "daily",
        ingest_url: str | None = None,
    ) -> None:
        super().__init__()
        self.scenario_id = scenario_id
        self.source = source  # "daily" | "twilio"
        self.ingest_url = ingest_url or os.getenv(
            "VOICESHIELD_INGEST_URL", "http://localhost:8000/api/trace/ingest"
        )
        self.live_url = os.getenv(
            "VOICESHIELD_LIVE_TRACE_URL",
            self.ingest_url.replace("/api/trace/ingest", "/api/trace/live"),
        )
        self.call_id = f"call_{source}_{uuid.uuid4().hex[:10]}"
        self.started_at = datetime.now(UTC).isoformat()
        self._turns: list[dict] = []
        self._safety_events: list[dict] = []
        self._tool_events: list[dict] = []
        self._pending_tool_calls: list[dict] = []
        self._bot_buffer: list[str] = []
        self._turn_n = 0
        self._t0 = time.monotonic()
        self._shipped = False

    def _next_turn_id(self) -> str:
        self._turn_n += 1
        return f"t{self._turn_n}"

    def _caller_entities(self, text: str) -> dict:
        lowered = text.lower()
        entities: dict[str, dict] = {}
        if any(phrase in lowered for phrase in ("hurt myself", "not feel safe", "don't feel safe", "do not feel safe", "unsafe")):
            entities["risk_phrase"] = {
                "value": "might hurt myself" if "hurt myself" in lowered else "does not feel safe",
                "confidence": 0.96,
            }
            entities["risk_level"] = {"value": "imminent", "confidence": 0.94}
        if any(phrase in lowered for phrase in ("roommate", "living room", "trusted person")):
            entities["safety_plan"] = {"value": "trusted person and shared space", "confidence": 0.9}
        return entities

    def _record_safety_event(
        self, turn_id: str, kind: str, detail: str, severity: str = "high"
    ) -> None:
        key = (turn_id, kind, detail)
        if any((e.get("turn_id"), e.get("kind"), e.get("detail")) == key for e in self._safety_events):
            return
        self._safety_events.append(
            {"turn_id": turn_id, "kind": kind, "detail": detail, "severity": severity}
        )

    def _attach_demo_safety_events(self, turn_id: str, text: str, tool_calls: list[dict]) -> None:
        names = {call.get("name") for call in tool_calls}
        lowered = text.lower()
        if "detect_imminent_risk" in names or "immediate danger" in lowered:
            self._record_safety_event(
                turn_id,
                "crisis_safety_path",
                "Imminent-risk language detected; direct safety assessment and escalation path active.",
                "critical",
            )
        if "request_human_support_transfer" in names or "trained crisis support" in lowered:
            self._record_safety_event(
                turn_id,
                "warm_handoff",
                "Caller remains engaged while a trained human support handoff is prepared.",
                "high",
            )

    async def record_agent_text(self, text: str) -> None:
        """Record agent speech that is queued directly as TTS, bypassing the LLM."""
        await self._flush_bot_turn()
        clean = text.strip()
        if not clean:
            return
        self._turns.append(
                {
                    "turn_id": self._next_turn_id(),
                    "speaker": "agent",
                    "transcript": clean,
                "asr_confidence": None,
                "entities": {},
                "latency_ms": {},
                "tool_calls": [],
                    "interruption": False,
                }
        )
        self._schedule_live_update()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        try:
            await self._observe(frame)
        except Exception as e:  # never break the call
            logger.debug(f"VoiceShield trace observe error: {e}")
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)

    async def _observe(self, frame: Frame) -> None:
        # Caller (final ASR transcript) -> caller turn.
        if TranscriptionFrame and isinstance(frame, TranscriptionFrame):
            await self._flush_bot_turn()
            text = getattr(frame, "text", "") or ""
            conf = getattr(frame, "confidence", None)
            self._turns.append(
                {
                    "turn_id": self._next_turn_id(),
                    "speaker": "caller",
                    "transcript": text,
                    "asr_confidence": conf,
                    "entities": self._caller_entities(text),
                    "latency_ms": {},
                    "tool_calls": [],
                    "interruption": False,
                }
            )
            self._schedule_live_update()
            return

        # Assistant text chunks -> buffer until the response ends.
        if LLMTextFrame and isinstance(frame, LLMTextFrame):
            self._bot_buffer.append(getattr(frame, "text", "") or "")
            return
        if LLMFullResponseEndFrame and isinstance(frame, LLMFullResponseEndFrame):
            await self._flush_bot_turn()
            return

        # Tool calls -> tool_event + attach to the latest agent turn.
        if FunctionCallInProgressFrame and isinstance(frame, FunctionCallInProgressFrame):
            name = getattr(frame, "function_name", None) or getattr(frame, "name", "tool")
            args = getattr(frame, "arguments", None) or {}
            if not isinstance(args, dict):
                args = {"raw": str(args)}
            self._pending_tool_calls.append(
                {
                    "name": name,
                    "args": args,
                    "allowed": True,
                    "blocked_reason": None,
                    "at_turn": None,
                }
            )
            self._tool_events.append(
                {
                    "turn_id": None,
                    "tool": name,
                    "fired": True,
                    "preconditions_met": True,
                    "detail": str(args)[:200],
                }
            )
            return

        # End of call -> ship.
        if (EndFrame and isinstance(frame, EndFrame)) or (
            CancelFrame and isinstance(frame, CancelFrame)
        ):
            await self.flush()
            return

    async def _flush_bot_turn(self) -> None:
        if not self._bot_buffer:
            return
        text = "".join(self._bot_buffer).strip()
        self._bot_buffer = []
        if not text:
            return
        turn_id = self._next_turn_id()
        tool_calls = self._pending_tool_calls
        self._pending_tool_calls = []
        for call in tool_calls:
            call["at_turn"] = turn_id
        for event in self._tool_events:
            if event.get("turn_id") is None:
                event["turn_id"] = turn_id
        self._attach_demo_safety_events(turn_id, text, tool_calls)
        self._turns.append(
            {
                "turn_id": turn_id,
                "speaker": "agent",
                "transcript": text,
                "asr_confidence": None,
                "entities": {},
                "latency_ms": {},
                "tool_calls": tool_calls,
                "interruption": False,
            }
        )
        self._schedule_live_update()

    def to_trace(self) -> dict:
        return {
            "call_id": self.call_id,
            "source": self.source,
            "scenario_id": self.scenario_id,
            "started_at": self.started_at,
            "transport": "daily" if self.source == "daily" else "twilio_media_streams",
            "turns": self._turns,
            "safety_events": self._safety_events,
            "tool_events": self._tool_events,
        }

    def _schedule_live_update(self, status: str = "streaming") -> None:
        try:
            asyncio.create_task(self._post_live_update(status=status))
        except RuntimeError:
            # No running loop; live call should never fail because telemetry did.
            return

    async def _post_live_update(self, status: str = "streaming") -> None:
        if not self._turns:
            return
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.live_url}?mode=live&status={status}",
                    json=self.to_trace(),
                    timeout=aiohttp.ClientTimeout(total=3),
                ):
                    return
        except Exception as e:
            logger.debug(f"VoiceShield: live trace update failed ({e})")

    async def flush(self) -> None:
        """Assemble and POST the trace to the Forge backend. Idempotent."""
        if self._shipped:
            return
        self._shipped = True
        await self._flush_bot_turn()
        trace = self.to_trace()
        if not trace["turns"]:
            logger.info("VoiceShield: no turns captured, skipping ingest")
            return
        await self._post_live_update(status="completed")
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ingest_url}?mode=live&run_id=live_{self.call_id}",
                    json=trace,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    body = await resp.text()
                    logger.info(
                        f"VoiceShield: shipped {len(trace['turns'])} turns -> "
                        f"{self.ingest_url} ({resp.status})"
                    )
                    logger.debug(f"VoiceShield ingest response: {body[:300]}")
        except Exception as e:
            logger.warning(f"VoiceShield: ingest POST failed ({e}); call unaffected")
