"""
Twilio adapter — PSTN telephony proof (spec.md §12 Twilio Role).

Proves: real phone-network ingress — a phone number, an inbound/outbound call
SID, a Media Streams stream SID, and media event timestamps. Live mode can
place an outbound call that opens a Media Stream into our websocket; fixture
mode replays a deterministic Twilio call SID + media event stream.

Twilio proves PSTN telephony — NOT browser/WebRTC media (that is Daily).
"""

from __future__ import annotations

import os
from html import escape
from typing import Any

from .base import AdapterContext, SponsorAdapter


class TwilioAdapter(SponsorAdapter):
    sponsor = "twilio"

    def credential_vars(self) -> list[str]:
        return ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]

    # ── fixture ───────────────────────────────────────────────────────────────
    def run_fixture(self, ctx: AdapterContext) -> dict[str, Any]:
        phone = os.getenv("TWILIO_PHONE_NUMBER", "+15555550100")
        suffix = ctx.run_id.replace("_", "")[:24].ljust(24, "0")
        return {
            "call_sid": f"CA{suffix}",
            "stream_sid": f"MZ{suffix}",
            "account_sid": os.getenv("TWILIO_ACCOUNT_SID", "ACfixture0000000000000000"),
            "phone_number": phone,
            "from": "+14155550123",
            "to": phone,
            "direction": "inbound",
            "media_format": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1},
            "media_events": [
                {"event": "connected", "t_ms": 0},
                {"event": "start", "t_ms": 40, "track": "inbound"},
                {"event": "media", "t_ms": 120, "chunk": 1},
                {"event": "media", "t_ms": 4200, "chunk": 210},
                {"event": "stop", "t_ms": 9800},
            ],
            "stream_status": "completed",
        }

    # ── live ───────────────────────────────────────────────────────────────────
    def run_live(self, ctx: AdapterContext) -> dict[str, Any]:
        """NON-DESTRUCTIVE liveness check: verify the credentials and list the
        account's owned numbers. It deliberately does NOT place a call — dialing
        is an explicit action (place_outbound_call / the inbound webhook), never
        a side effect of a smoke/proof check."""
        from twilio.rest import Client  # lazy import: only needed live

        account_sid = os.environ["TWILIO_ACCOUNT_SID"]
        auth_token = os.environ["TWILIO_AUTH_TOKEN"]
        client = Client(account_sid, auth_token)

        account = client.api.v2010.accounts(account_sid).fetch()
        owned = [n.phone_number for n in client.incoming_phone_numbers.list(limit=10)]
        env_number = os.getenv("TWILIO_PHONE_NUMBER", "")
        # Prefer a real owned number over the env placeholder.
        phone_number = owned[0] if owned else env_number

        public_base = os.getenv("PUBLIC_BASE_URL", "")
        voice_webhook = f"{public_base}/api/twilio/voice" if public_base else None
        return {
            "account_sid": account_sid,
            "account_status": getattr(account, "status", "active"),
            "phone_number": phone_number,
            "owned_numbers": owned,
            "number_provisioned": bool(owned),
            "voice_webhook": voice_webhook,
            "call_sid": None,  # no call placed by the liveness check
            "stream_sid": None,
            "stream_status": "verified (credentials live; no call placed)",
            "note": "Twilio credentials verified."
            + ("" if owned else " No phone number purchased yet — buy one to receive calls.")
            + ("" if public_base else " Set PUBLIC_BASE_URL (ngrok/cloudflared) to receive Media Streams."),
        }

    def place_outbound_call(self, ctx: AdapterContext, to_number: str) -> dict[str, Any]:
        """Explicitly place an outbound call that opens a Media Stream into our
        websocket. Called only on user action (dashboard button / API), never
        during a liveness/proof check."""
        from twilio.rest import Client

        account_sid = os.environ["TWILIO_ACCOUNT_SID"]
        auth_token = os.environ["TWILIO_AUTH_TOKEN"]
        from_number = os.environ["TWILIO_PHONE_NUMBER"]
        public_base = os.getenv("PUBLIC_BASE_URL", "")
        ws_url = (
            public_base.replace("https://", "wss://").replace("http://", "ws://") + "/ws/twilio"
            if public_base
            else "wss://example.invalid/ws/twilio"
        )
        client = Client(account_sid, auth_token)
        twiml = self.twiml_for_inbound(ws_url, ctx.run_id, ctx.scenario_id)
        call = client.calls.create(to=to_number, from_=from_number, twiml=twiml)
        return {"call_sid": call.sid, "from": from_number, "to": to_number, "ws_url": ws_url}

    def twiml_for_inbound(self, ws_url: str, run_id: str, scenario_id: str) -> str:
        """TwiML returned to Twilio for an inbound call -> opens a Media Stream."""
        safe_ws_url = escape(ws_url)
        safe_run_id = escape(run_id)
        safe_scenario_id = escape(scenario_id)
        ringback_url = os.getenv("TWILIO_RINGBACK_URL")
        ringback_twiML = (
            f"<Play>{escape(ringback_url)}</Play>" if ringback_url else '<Pause length="3"/>'
        )
        return (
            f"<?xml version='1.0' encoding='UTF-8'?>"
            f"<Response>"
            f"{ringback_twiML}"
            f"<Connect><Stream url='{safe_ws_url}'>"
            f"<Parameter name='run_id' value='{safe_run_id}'/>"
            f"<Parameter name='scenario_id' value='{safe_scenario_id}'/>"
            f"<Parameter name='handoff_flow' value='pipecat_full_duplex_agent_gate'/>"
            f"</Stream></Connect></Response>"
        )
