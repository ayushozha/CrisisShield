# Field & Flower × VoiceShield Forge

The Pipecat bot in `server/` is the **live voice agent**. VoiceShield Forge (in
`../services/voice-backend` + `../apps/web`) is the **reliability harness that
wraps it**: it ingests the real call, routes the failure layer, compiles a
concrete repair, reruns regression through Cekura, and shows the promotion
decision on the dashboard.

This is exactly the hackathon's brief: *use Pipecat to build the agent, use
Cekura to evaluate and improve it, use NVIDIA open models.*

```
[ bot-gpt.py / bot-nemotron.py ]  ── real call (SmallWebRTC or Twilio) ──┐
   Hosted LLM  or  NVIDIA Nemotron + Parakeet ASR                         │
            │  VoiceShieldTraceProcessor (voiceshield_trace.py)          │
            │  collects turns/transcripts/tool-calls -> CallTrace        │
            ▼                                                            │
   POST /api/trace/ingest  ──►  VoiceShield Forge backend ──────────────┘
            │ failure router → repair compiler → Cekura eval → regression gate → AWS
            ▼
   VoiceShield dashboard (localhost:3000) shows the live call + the repair loop
```

## Setup (already done)

- `cd server && uv sync` — Pipecat 1.3.0 + Gradium/hosted LLM/Nemotron extras installed.
- `server/.env` created (placeholders + the hackathon NVIDIA endpoints). Fill in
  the LLM provider key + `GRADIUM_API_KEY` (hosted LLM path) or rely on the NVIDIA endpoints
  (Nemotron path). `.env` is gitignored.
- `server/voiceshield_trace.py` — the live-trace bridge.

## The pharmacy agent (bridge already wired)

`server/bot-pharmacy.py` is the demo's live agent — a pharmacy refill / intake
line (`server/pharmacy_backend.py` holds the mock patients + formulary). The
VoiceShield trace bridge is **already wired** into its pipeline and flushed on
disconnect, so you don't have to touch anything. It runs in two variants:

```bash
AGENT_VARIANT=baseline uv run bot-pharmacy.py   # the unrepaired agent (fails)
AGENT_VARIANT=repaired uv run bot-pharmacy.py   # AFTER Forge's compiled repair
```

- **baseline** — looks the patient up eagerly, doesn't spell back low-confidence
  names, and gives in to "skip the questions" pressure. This is what Forge catches.
- **repaired** — the SAME bot with Forge's repair applied: `lookup_patient` and
  `request_refill` are gated on verified identity, the prompt requires spell-back
  on low-confidence names + medication confirmation, and a guardrail refuses to
  skip verification under pressure.

That baseline→repaired diff is the repair compiler's artifacts (tool gate,
spell-back dialog policy, guardrail) applied to a real agent.

> To add the bridge to the flower bots instead, append `VoiceShieldTraceProcessor`
> as the last pipeline processor and `await vsf.flush()` in `on_client_disconnected`
> (see how `bot-pharmacy.py` does it). `VOICESHIELD_INGEST_URL` is already set in
> `.env`; the bridge is best-effort and never breaks a live call.

## Run the full live loop

Needs the LLM provider key + `GRADIUM_API_KEY` in `server/.env` (get Gradium free at
gradium.ai; credits at the event).

```bash
# Terminal 1 — Forge backend (the harness)
cd ../services/voice-backend && uv run uvicorn app.main:app --port 8000

# Terminal 2 — Forge dashboard
cd ../apps/web && npm run dev            # http://localhost:3000

# Terminal 3 — the live pharmacy bot
cd server && AGENT_VARIANT=baseline uv run bot-pharmacy.py
# open http://localhost:7860, click Connect, run the refill call, hang up
```

On hangup the bot POSTs the call trace to Forge; the dashboard (auto-loads
`/api/demo/latest`, or re-fetch) shows the live call routed and repaired. Run
`AGENT_VARIANT=repaired` and call again to show the failures gone.

## Evaluate with Cekura (the judging criterion)

Two ways, both supported:

1. **Cekura's own Pipecat integration (recommended at the event):** install the
   Cekura Claude Code plugin and run `/cekura-report` against the bot — it spins
   up 10–20 evaluators and returns transcripts + scores. Select **Pipecat** as
   the provider. See the starter README "Test your agent with Cekura".
2. **Through Forge's Cekura adapter:** set `CEKURA_AGENT_ID=<your agent id>` in
   the repo-root `.env` and run Forge in live mode — baseline + regression evals
   submit to your Cekura agent (`client.scenarios.run_text`), falling back to the
   deterministic sim if the agent/keys aren't reachable.

## Hosted LLM vs NVIDIA Nemotron

Run both bots and let Forge compare them: each produces a CallTrace, Forge scores
both through Cekura and shows which model+config promotes. This is the
"side-by-side, data not vibes" story the judges want.
