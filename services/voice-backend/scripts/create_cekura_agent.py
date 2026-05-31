#!/usr/bin/env python
"""
Create (or update) a Cekura AI agent from the API key in .env, and write the
resulting CEKURA_AGENT_ID back into the repo-root .env.

Cekura requires a real connection method — it will NOT create a bare agent.
For our self-hosted Pipecat bot that's a reachable websocket URL. Once you have
a public URL (ngrok/cloudflared on the backend, or a Pipecat Cloud deploy),
run:

    uv run python -m scripts.create_cekura_agent --websocket-url wss://<host>/ws/twilio

With no --websocket-url it derives one from PUBLIC_BASE_URL, or (with
--placeholder) creates the agent against a valid-but-not-yet-reachable URL just
to mint the agent id (tests will fail until you re-run with the real URL).

Auth: the Cekura REST API uses the `X-CEKURA-API-KEY` header (NOT Bearer).
"""

from __future__ import annotations

import argparse
import os
import sys

import httpx

# Import the app's config so the repo-root .env is loaded the same way the
# harness loads it.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import config  # noqa: E402
from app.config import repo_root  # noqa: E402

AGENTS_PATH = "/test_framework/v1/aiagents/"


def _ws_from_public() -> str | None:
    public = os.getenv("PUBLIC_BASE_URL", "").strip()
    if not public:
        return None
    return public.replace("https://", "wss://").replace("http://", "ws://") + "/ws/twilio"


def _write_env_agent_id(agent_id: str) -> None:
    env_path = repo_root() / ".env"
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    out, found = [], False
    for line in lines:
        if line.strip().startswith("CEKURA_AGENT_ID="):
            out.append(f"CEKURA_AGENT_ID={agent_id}")
            found = True
        else:
            out.append(line)
    if not found:
        # Insert near the other Cekura vars if present, else append.
        inserted = False
        final = []
        for line in out:
            final.append(line)
            if line.strip().startswith("CEKURA_BASE_URL="):
                final.append(f"CEKURA_AGENT_ID={agent_id}")
                inserted = True
        if not inserted:
            final.append(f"CEKURA_AGENT_ID={agent_id}")
        out = final
    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a Cekura agent from the API key")
    parser.add_argument("--websocket-url", default=None, help="Reachable wss:// URL of the bot")
    parser.add_argument("--name", default="VoiceShield Pharmacy Refill Bot")
    parser.add_argument(
        "--description",
        default="Pipecat pharmacy refill/intake agent wrapped by VoiceShield Forge",
    )
    parser.add_argument("--provider", default="pipecat")
    parser.add_argument(
        "--placeholder",
        action="store_true",
        help="Allow creating against a valid-but-unreachable placeholder URL to mint the id",
    )
    parser.add_argument("--no-write-env", action="store_true", help="Do not modify .env")
    args = parser.parse_args(argv)

    key = os.getenv("CEKURA_API_KEY", "")
    base = os.getenv("CEKURA_BASE_URL", "https://api.cekura.ai")
    if not key or key.lower().startswith("placeholder"):
        print("CEKURA_API_KEY is missing/placeholder in .env", file=sys.stderr)
        return 2

    ws_url = args.websocket_url or _ws_from_public()
    if not ws_url:
        if args.placeholder:
            ws_url = "wss://voiceshield-pharmacy.ngrok.app/ws/twilio"
            print(f"[placeholder] using {ws_url} — UPDATE this to the real bot URL before testing")
        else:
            print(
                "No --websocket-url and PUBLIC_BASE_URL is unset.\n"
                "Provide --websocket-url wss://<host>/ws/twilio, or pass --placeholder "
                "to mint an id against a stand-in URL.",
                file=sys.stderr,
            )
            return 2

    body = {
        "agent_name": args.name,
        "description": args.description,
        "provider": args.provider,
        "inbound": True,
        "assistant_provider": "self_hosted",
        "websocket_url": ws_url,
    }
    resp = httpx.post(
        base + AGENTS_PATH,
        headers={"X-CEKURA-API-KEY": key, "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"Create failed ({resp.status_code}): {resp.text[:800]}", file=sys.stderr)
        return 1

    data = resp.json()
    agent_id = str(data.get("id") or data.get("agent_id") or data.get("pk") or "")
    print(f"Created Cekura agent: id={agent_id} name={data.get('agent_name', args.name)}")
    print(f"  websocket_url={ws_url}")
    if agent_id and not args.no_write_env:
        _write_env_agent_id(agent_id)
        print(f"  wrote CEKURA_AGENT_ID={agent_id} to {repo_root() / '.env'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
