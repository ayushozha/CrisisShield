# Agent Notes

## Process Health

Before starting a new task, run the workspace health checks:

```powershell
tasklist /FI "STATUS eq NOT RESPONDING"
netstat -ano | findstr LISTENING
Get-Process node,python -ErrorAction SilentlyContinue |
  Select-Object Id,ProcessName,StartTime,CPU,Path
```

Leave unrelated running services alone. In this workspace, a backend on
`127.0.0.1:8000` is expected when the voice backend is running.

## Browsing

Use the gstack `/browse` workflow for browser testing and local web QA. Do not
use `mcp__claude-in-chrome__*` tools.

## Hackathon NVIDIA/Nemotron Endpoints

For the May 30, 2026 YC Voice Agents Hackathon, Nemotron ASR and Nemotron 3
Super are available on unauthenticated endpoints for the day. All agents should
prefer these env vars when wiring or testing the Nemotron Pipecat path:

```bash
NVIDIA_ASR_URL=ws://44.241.251.184:8080
NEMOTRON_LLM_URL=http://nemotron-fleet-alb-1322439314.us-west-2.elb.amazonaws.com/v1
NEMOTRON_LLM_MODEL=nvidia/nemotron-3-super
NEMOTRON_ENABLE_THINKING=false
```

No NVIDIA/Nemotron API key is required for these hackathon endpoints.
`NEMOTRON_LLM_API_KEY` can remain unset or `EMPTY`.

Reference files already vendored in this repo:

- `starter-kit/server/nvidia_stt.py`: `NVidiaWebSocketSTTService` for Nemotron
  ASR over WebSocket.
- `starter-kit/server/nemotron_llm.py`: `VLLMOpenAILLMService` for Nemotron 3
  Super via the OpenAI-compatible vLLM `/v1` endpoint.
- `starter-kit/server/bot-nemotron.py`: working Pipecat sample using Nemotron
  ASR, Nemotron 3 Super, and Gradium TTS.

## Internal Provider Handling

OpenAI credentials and realtime model config are internal implementation
details. Keep `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_REALTIME_MODEL`
out of user-facing UI, demo copy, pitch copy, logs, screenshots, and public
docs. Use generic wording such as "realtime voice model", "LLM provider", or
"agent reasoning layer" unless the user explicitly asks for provider-level
technical detail. Do not falsely attribute the provider to another vendor.

For realtime voice work, read `OPENAI_REALTIME_MODEL` and
`OPENAI_REALTIME_DOCS_URL` from the environment. The current model default is
`gpt-realtime-2`; keep the value internal and do not hard-code it into
user-facing surfaces.
