# Sponsor Integration — adapter contract & live switch

The harness is the product, and it must run before any real key exists. Every
sponsor is reached through an adapter implementing one uniform contract, so the
demo runs end-to-end with placeholder keys and flips to live with zero
product-code change.

## The mode contract

Every adapter returns the same shape (`AdapterContract` in
`services/voice-backend/app/models.py`):

```json
{
  "sponsor": "daily",
  "mode": "live | fixture",
  "credential_state": "present | placeholder | missing",
  "status": "ready | degraded | failed",
  "proof": { "...": "live-shaped proof, identical schema in both modes" },
  "note": "human-readable explanation"
}
```

Resolution rules (`app/sponsor_adapters/base.py`):

1. `credential_state` is `present` only when every required env var is a real
   value (not `placeholder_*`, not empty, not a `*.example` host).
2. Effective `mode` is `live` only when the run requests live **and**
   credentials are present; otherwise `fixture`.
3. The live path is wrapped: any exception **degrades** to fixture with
   `status=degraded` and a note. The demo never crashes on a live failure.
4. A sponsor running fixture under a live request is marked `degraded` and
   labelled — never silently dropped (spec §7, §16).

`smoke` fails (exit 1) if any of the six required adapters is absent.

## Per-sponsor live switch

All keys live in the gitignored repo-root `.env`. Set the key **and** the
matching `*_MODE=live` (or run the harness with `--mode live`). Install the live
SDKs once: `uv sync --extra all`.

| Sponsor | Required env vars | Live path | Fixture proof |
| --- | --- | --- | --- |
| **Daily** | `DAILY_API_KEY` | `POST https://api.daily.co/v1/rooms` (Bearer) → real room URL. If the key is a **Pipecat-Cloud** key (prefix `cloud-`, as provisioned by a Pipecat Cloud org) the REST API 401s, so it falls back to the realtime-transport proof (Daily transport in Pipecat: SmallWebRTC locally / Pipecat Cloud in prod) and stays live. | deterministic session URL, participant/media/interruption events |
| **Pipecat** | (none — framework) | `pipecat-ai` installed → real `Pipeline`/`PipelineWorker`, frames from `pipecat.frames.frames` | replayed frame stream + per-stage p95 from the trace |
| **Cekura** | `CEKURA_API_KEY` (+ `CEKURA_AGENT_ID`) | SDK `Cekura(...).scenarios.run_text(...)`, then REST `/test_framework/v1/results/{id}/` (`X-CEKURA-API-KEY`), then degrade | deterministic eval_sim run + run IDs |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Live proof is a **non-destructive** verify: fetch the account + list owned numbers (no call placed). Dialing is the explicit `place_outbound_call(...)` action (`<Connect><Stream>` TwiML → Media Streams into `/ws/twilio`), never a side effect of a proof check. | deterministic call SID, stream SID, media events |
| **NVIDIA** | `NVIDIA_API_KEY`, `NVIDIA_NIM_BASE_URL` | `GET {NIM}/v1/models` reachability + generated artifact | Riva `speech_contexts` word boost + NeMo Guardrails config |
| **AWS** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | boto3 S3 `put_object` + DynamoDB `put_item` | AWS-shaped local store (`.aws-fixture-store/`), same `s3://` URIs + DDB schema |

### Twilio live: public tunnel

Twilio Media Streams needs a public `wss://`. Expose port 8000 (ngrok /
Cloudflare Tunnel), set `PUBLIC_BASE_URL=https://<tunnel-host>`, and point your
Twilio number's Voice webhook at `POST {PUBLIC_BASE_URL}/api/twilio/voice`. The
backend replies with TwiML that opens a Media Stream into `/ws/twilio`; the
`start`/`media`/`stop` events appear in `GET /api/twilio/streams`.

### Daily live: dashboard join

`POST /api/daily/session?mode=live` mints a real room; the dashboard's "Join
live" button uses `@daily-co/daily-js` (an optional dependency, dynamically
imported) to join. If the SDK isn't installed, it opens the room URL in a tab.

### NVIDIA/Nemotron hackathon endpoints

For the May 30, 2026 YC Voice Agents Hackathon, Nemotron ASR and Nemotron 3
Super are being run on unauthenticated endpoints for the day. Use the starter
project env vars below for the Pipecat voice pipeline. This is separate from
the backend harness's existing NVIDIA repair-adapter contract in the table
above.

```bash
NVIDIA_ASR_URL=ws://44.241.251.184:8080
NEMOTRON_LLM_URL=http://nemotron-fleet-alb-1322439314.us-west-2.elb.amazonaws.com/v1
NEMOTRON_LLM_MODEL=nvidia/nemotron-3-super
NEMOTRON_ENABLE_THINKING=false
```

The local starter-kit already includes the reference classes and sample
pipeline:

- `starter-kit/server/nvidia_stt.py` exposes `NVidiaWebSocketSTTService` for the
  Nemotron ASR WebSocket endpoint.
- `starter-kit/server/nemotron_llm.py` exposes `VLLMOpenAILLMService` for the
  Nemotron 3 Super vLLM/OpenAI-compatible endpoint.
- `starter-kit/server/bot-nemotron.py` shows both services in a Pipecat pipeline
  with Gradium TTS.

`NEMOTRON_LLM_API_KEY` is not required for these hackathon endpoints; the sample
bot defaults it to `EMPTY` because the vLLM service ignores it unless the server
is configured to require one.

## Verifying

```bash
uv run python -m app.harness.smoke --mode fixture   # all 6 ready/fixture
uv run python -m app.harness.smoke --mode live      # present→live, placeholder→degraded
uv run pytest -q                                    # locks the gate numbers + degradation
```

## Artifacts

`run_demo` (and `POST /api/demo/run`) persist via the AWS adapter and mirror to
`demo/seeded-runs/<run_id>/`:

- `trace.json` (+ `trace-secondary.json` for the Twilio surface)
- `eval-report.json` (baseline + regression + gate)
- `repair-pack.json`
- `sponsor-proof.json`
- `nvidia-repair.json`
- `demo-report.json` (the full bundle the dashboard reads)

`demo/seeded-runs/latest.json` always points at the most recent run.
