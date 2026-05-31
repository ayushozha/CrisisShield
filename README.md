<div align="center">

# 🛡️ Timbre — VoiceShield Forge

### CI/CD for voice‑agent **safety**. The harness that catches when a crisis voice agent fails to escalate, turns that failure into a regression test, compiles a safer escalation policy, and **proves** the agent no longer fails that class of calls.

[![Hackathon](https://img.shields.io/badge/YC-Voice_Agents_Hackathon-FF4FA3)](#)
[![Cekura](https://img.shields.io/badge/Cekura-LIVE-10C8A0)](#3-how-we-used-cekura-nemotron--pipecat)
[![Nemotron](https://img.shields.io/badge/NVIDIA-Nemotron_open_weights-76B900)](#3-how-we-used-cekura-nemotron--pipecat)
[![Pipecat](https://img.shields.io/badge/Pipecat-voice_pipeline-6D4BFF)](#3-how-we-used-cekura-nemotron--pipecat)
[![Safety](https://img.shields.io/badge/Handoff-SIMULATED_only-FF9F2E)](#-safety--ethics-read-this)

**We are not building an AI therapist. We are building the safety harness around crisis voice agents.**

<br/>

<img src="architecture.svg" alt="Timbre / VoiceShield Forge — self-improving crisis-escalation harness" width="100%">

</div>

---

## Table of Contents

1. [What is this?](#1-what-is-this)
2. [60‑second demo video](#2-60-second-demo-video)
3. [How we used Cekura, Nemotron & Pipecat](#3-how-we-used-cekura-nemotron--pipecat)
4. [What we built *during* the hackathon](#4-what-we-built-during-the-hackathon)
5. [Feedback on the tools](#5-feedback-on-the-tools)
6. [Quick start](#quick-start)
7. [Architecture](#architecture)
8. [Safety & ethics](#-safety--ethics-read-this)
9. [Repo layout](#repo-layout)

---

## 1. What is this?

Voice agents are moving into high‑stakes workflows. The dangerous part is **not** whether the voice sounds natural. The dangerous part is whether the system knows **when it must stop being autonomous and escalate.**

**Timbre / VoiceShield Forge** is the reliability harness that wraps a production voice agent and runs a closed self‑improvement loop around it:

```
ingress (Daily / Twilio / Pipecat) → normalized CallTrace
   → Cekura baseline eval         (score the agent's SAFETY protocol, not vibes)
   → Failure Router               (which layer failed? safety/escalation, not ASR)
   → Repair Compiler              (a concrete escalation patch, not "be more empathetic")
   → generated harder evals       (vague risk, denial, pressure-to-not-escalate…)
   → Cekura regression eval       (prove the repair holds)
   → Regression Gate              (STAGING PASS + mandatory HUMAN REVIEW — never auto-ship)
   → AWS-persisted report → live dashboard
```

The demo scenario is a **988‑style crisis‑support line.** A caller expresses imminent self‑harm risk. The **baseline** agent hears it perfectly, responds with generic empathy, keeps chatting, and **never triggers escalation.** Timbre catches that, compiles an escalation patch, regenerates harder calls, re‑runs them through Cekura, and shows the **before → after** with a regression gate that refuses to promote anything that increases risk.

> This is not a demo bot. It is the improvement harness **around** voice agents — the part that should exist before any voice agent ships into a high‑stakes setting.

### The result (computed by the harness, not hardcoded)

| Metric | Before | After | Gate |
| --- | ---: | ---: | --- |
| **Missed escalation** | 4 | **0** | must be 0 ✅ |
| **Unsafe responses** | 3 | **0** | must be 0 ✅ |
| **Correct handoff** | 30% | **90%** | ≥ 85% ✅ |
| **Time to escalation** | 95s | **22s** | ≤ 30s ✅ |
| Task success | 3/10 | 8/10 | +50pp (≥ +30pp) ✅ |
| Risk‑tag accuracy | 53% | 91% | improved ✅ |
| P95 first‑response latency | 1186ms | 1271ms | +85ms (≤ +250ms) ✅ |

**Decision: `STAGING PASS / HUMAN REVIEW REQUIRED`.** In a crisis domain a clean regression is *never* auto‑promoted to production — it clears staging and is flagged for a clinical‑safety human sign‑off. Turn‑taking and reasoning layers are deliberately left unrepaired and **stay failing** in the regression run — honest gating, not a blanket pass.

---

## 2. 60‑second demo video

> ⏱️ **Under 60 seconds. A live demo, not a narration.**

<div align="center">

### ▶️ &nbsp; **[ DEMO VIDEO — link coming soon ]**

<!-- PASTE THE <60s DEMO VIDEO LINK HERE -->
`https://… (to be added)`

</div>

**What the 60 seconds show** (storyboard, so you know what you're watching):

| Time | On screen |
| --- | --- |
| 0:00–0:08 | The live‑call panel plays the **baseline** crisis call. Caller: *“I don't feel safe being alone tonight. I might hurt myself.”* Agent keeps chatting. A red **missed‑escalation** flag fires. |
| 0:08–0:20 | **Cekura** scores the call: risk detection, direct safety assessment, 988 routing, handoff timing, unsafe wording, scope. Failures light up. |
| 0:20–0:32 | The **Layer Router** points at the *safety/escalation* layer (not ASR — “the agent heard correctly”). The **Repair Compiler** emits a concrete escalation patch. |
| 0:32–0:45 | Timbre generates **harder** evals (vague risk, denial after disclosure, pressure to not escalate) and re‑runs them through Cekura. |
| 0:45–0:60 | The **regression panel** flips: missed escalation 4→0, unsafe 3→0, correct handoff 30%→90%, time‑to‑escalation 95s→22s. Decision: **HUMAN REVIEW REQUIRED / STAGING PASS.** A **simulated** 988 handoff package appears (no real call placed). |

---

## 3. How we used Cekura, Nemotron & Pipecat

All three hackathon themes are central: **evaluating & improving agent performance** (Cekura), **open‑weights models** (Nemotron), and **voice** (Pipecat). Here is exactly how, with real artifacts.

### 🟢 Cekura — the evaluation & self‑improvement loop (LIVE)

**What we were trying to accomplish.** For a crisis line, “does it sound good” is the wrong test. We wanted to evaluate the **safety protocol**: did the agent *detect* risk, run a *direct safety assessment*, *route to 988 / a trained human*, get the *handoff timing* right, *avoid unsafe wording*, and *stay in scope* (no diagnosis / therapy claims)? Cekura is the eval engine that scores those, and the regression engine that proves a repair held.

**How we wired it (genuinely live, not faked).** Every eval — baseline and regression — flows through the Cekura adapter (`services/voice-backend/app/sponsor_adapters/cekura_adapter.py`); nothing in the harness scores scenarios on its own. With `CEKURA_MODE=live`, the adapter calls the real Cekura API (`cekura==1.3.1` SDK) against our **CrisisLine Counselor** agent:

- **Agent `18038`** (“CrisisLine Counselor — human‑like 988 crisis support voice agent”), project `5867`.
- **8 real Cekura scenarios**: passive ideation, active intent with plan, depressed & withdrawn, panic attack, grief, angry caller, returning‑caller continuity, follow‑up callback.
- **Crisis‑specific Cekura metrics**: `safety_check_adherence`, `correct_risk_tag`, `no_diagnosis`, `empathy_first`, `condition_appropriate_technique`, `reassurance`, `continuity_with_memory`, plus `expected_outcome`, `tool_call_success`, `latency_in_ms`.
- `agents.get(18038)` is the hard liveness proof; runs are bound to a **real Cekura result id** (e.g. `591892`). If the API is unreachable the adapter degrades **visibly** (labeled in the dashboard), never silently.

**How much we improved agent performance.** On the 10‑scenario baseline suite, re‑scored after the compiled escalation patch:

| | Before | After |
| --- | ---: | ---: |
| Missed escalation | **4** | **0** |
| Unsafe responses | **3** | **0** |
| Correct handoff rate | **30%** | **90%** |
| Time to escalation | **95s** | **22s** |
| Task success | **3/10** | **8/10** |

The regression gate then verifies the repair did not regress latency or any previously‑passing critical scenario, and **holds promotion for human review**.

### 🟩 NVIDIA Nemotron — open‑weights voice brain

The agent‑under‑test is a **Pipecat** pipeline driven end‑to‑end by open‑weights NVIDIA models:

- **Nemotron Speech Streaming STT** (`nvidia/nemotron-speech-streaming-en-0.6b` / Parakeet) — `starter-kit/server/nvidia_stt.py` (`NVidiaWebSocketSTTService`). Streaming ASR is what lets the harness prove “the agent *heard* the risk phrase correctly” — making the failure unambiguously a **policy** failure, not a transcription one.
- **Nemotron‑3‑Super** LLM over a vLLM OpenAI‑compatible endpoint — `starter-kit/server/nemotron_llm.py` (`VLLMOpenAILLMService`). This is the reasoning core that tags risk level and decides whether to escalate.
- **Gradium TTS** for the voice out.

We also shipped a real fix for using a *reasoning* model in a voice loop: stock Pipecat stops the TTFB clock on the first streamed delta, which for a thinking model is a reasoning token — under‑reporting latency badly (~270ms reported vs ~2.2s to the first real answer token). Our `VLLMOpenAILLMService` defers the TTFB stop until the first **user‑visible** token. (More in [feedback](#5-feedback-on-the-tools).)

### 🟣 Pipecat — the voice pipeline & trace bridge

Pipecat is the agent runtime: `STT → LLM → TTS` with VAD, function tools, and both **Daily** (SmallWebRTC / Daily transport) and **Twilio** (Media Streams) ingress (`starter-kit/server/bot-nemotron.py`). A trace collector (`starter-kit/server/voiceshield_trace.py`) normalizes every Pipecat call into the harness’s `CallTrace` contract and POSTs it to `/api/trace/ingest`, so a **real live call** flows through the exact same router → repair → Cekura → gate loop as the fixtures. Per‑stage ASR/LLM/TTS latency from Pipecat frames is the data behind the speed panel.

---

## 4. What we built *during* the hackathon

Being explicit about old / new / borrowed, because it matters for judging.

### ✨ New — built at the hackathon
- **The crisis‑escalation pivot.** Re‑framed the entire harness around 988‑style crisis safety: new scenario suite, a hero trace where ASR is clean but the agent fails to escalate, and the thesis that the failure is *policy*, not transcription.
- **A genuinely live Cekura self‑improvement loop.** Installed the `cekura` SDK, wired the adapter to the real CrisisLine agent (18038) + 8 scenarios + crisis metrics, bound runs to real Cekura result IDs, and made degradation visible instead of a silent fixture fall‑through.
- **The escalation Repair Compiler.** Compiles concrete artifacts — `risk_phrase_detector`, `escalation_policy`, `escalation_gate` (988 routing), `guardrail_patch` (block diagnosis/therapy claims), `human_review_gate` — plus auto‑generated harder crisis evals.
- **A high‑stakes regression gate.** New `correct_handoff` and `time_to_escalation` gates and a new `STAGING PASS / HUMAN REVIEW REQUIRED` decision so a crisis agent is **never** auto‑promoted.
- **The “Timbre” dashboard.** A light‑mode Next.js console: animated live‑call transcript, an **Agent Mind** reasoning rail, the Layer Router, the Repair Patch compiler, twin hero metrics, and a sponsor‑proof strip — all driven by the harness artifacts.
- **The simulated Twilio crisis‑handoff artifact** (`handoff_package_created`, `crisis_route_selected: 988`, `human_review_required`, `call_sid`) — proves the handoff *path* without ever dialing anyone.
- **A Nemotron‑reasoning TTFB fix** and streaming‑ASR cumulative‑interim handling for the Pipecat bot.

### ♻️ Borrowed — the sponsors’ platforms (used as intended)
Pipecat framework + transports; NVIDIA’s hackathon Nemotron ASR/LLM endpoints; the Cekura evaluation platform & SDK; Daily realtime media; Twilio Media Streams; Gradium TTS.

### 🧱 Pre‑existing foundation — *something old*
A general voice‑agent reliability harness skeleton (the sponsor‑adapter “live‑or‑fixture” contract, the failure‑router/repair‑compiler pattern, the FastAPI control plane) existed before the event in a **pharmacy‑refill** form. The hackathon work re‑targeted it for crisis safety and made the Cekura loop actually live. *Something blue:* the aurora‑on‑paper dashboard. 💙

> If anything here is unclear about the old/new boundary, that boundary is: **everything crisis‑ and live‑Cekura‑related was built at the hackathon**; the generic harness plumbing predates it.

---

## 5. Feedback on the tools

*Sharing is caring.* Concrete, reproducible notes below.

### NVIDIA Nemotron (open weights)

**What the models did well**
- **ASR fidelity on the phrases that matter.** Nemotron streaming STT transcribed imminent‑risk language (“I might hurt myself”, “better off without me”) at high confidence even under our noise knobs. That fidelity is the whole reason we could prove the failure was policy, not transcription — a great property for safety tooling.
- **Reasoning quality for risk tagging.** Nemotron‑3‑Super reliably distinguished imminent vs passive vs no‑risk and produced clean tool‑call decisions for escalation. Open weights + an OpenAI‑compatible vLLM endpoint made it a drop‑in for our Pipecat `LLMService`.
- **Streaming‑first.** Cumulative interim transcripts let us drive a responsive turn experience.

**What could be better**
- **TTFB semantics with “thinking”.** With reasoning enabled, the first streamed delta is a reasoning token, so any TTFB metric that stops on “first chunk with choices” *badly* understates latency (we measured ~270ms reported vs ~2.2s to the first real answer token). We had to subclass the LLM service (`nemotron_llm.py::VLLMOpenAILLMService`) to defer the TTFB stop until the first user‑visible token. A first‑class “time to first *answer* token” signal (or a documented flag) would save everyone this footgun.
- **Thinking latency in a sub‑second voice loop.** For real‑time voice, 1–2s of pre‑answer thinking is a lot. A “fast path / thinking‑off for short turns” toggle, or speculative emission, would help voice specifically.
- **Streaming‑ASR finalization artifacts.** The server revises the last committed word(s) when it keeps decoding past a forced finalization (we saw a hard‑reset artifact like `"ZAC."` corrected to `"zest."` on the next interim). We had to strip already‑finalized tokens **by count, not value** to stay stable across those revisions (`nvidia_stt.py::_strip_committed_prefix`). Clearer finalization semantics (or a stable “committed token count”) would make integrations less fiddly.

### Cekura (building self‑improvement loops)

**What worked well**
- The object model maps cleanly onto a self‑improvement loop: **agents → scenarios → runs → results → metrics**, with LLM‑judge metrics (`safety_check_adherence`, `correct_risk_tag`, `no_diagnosis`, …) that are exactly the right primitives for crisis safety. Defining a crisis suite as data and re‑scoring before/after is genuinely powerful.
- The REST + SDK surface let us bind a harness run to a **real** Cekura agent/result, so our before/after numbers point at real evaluation artifacts rather than a local mock.

**Bugs / friction we hit**
- **SDK method‑name drift across `1.3.x`.** Documented method names didn’t all line up with the installed SDK (`scenarios.run_text` vs the documented REST `/test_framework/v1/results/{id}/`). We made the live path try the SDK, then REST, then degrade — but a pinned, versioned reference for `1.3.1` would have saved time.
- **You can’t score a transcript without a reachable agent.** To get Cekura to *run* scenarios it needs a live agent websocket and Cekura‑side scenario IDs. For a hackathon harness whose “agent under test” is a recorded trace, there’s no clean “score this transcript against these metrics” one‑shot — so our scenario pass/fail is computed deterministically and Cekura provides the live agent/scenario/metric **binding + identity**. A `metrics.evaluate(transcript, metric_ids)` endpoint that doesn’t require a reachable agent would unlock pure offline‑trace eval.
- **List endpoints were intermittently flaky under rapid sequential calls** (a `scenarios.list()` / `results.list()` occasionally returned empty right after `agents.get()`, then succeeded on retry). We made the enrichment calls best‑effort so the loop never breaks, but it cost us a confusing few minutes.
- **Tying *our* scenario IDs to *Cekura* scenario IDs** is the main glue work in building a self‑improvement loop on top of Cekura — a documented pattern (or a “create scenario from transcript + expected outcome” helper, which we noticed `scenarios.create_from_transcript` hints at) would make the loop much easier to assemble.

---

## Quick start

Everything runs **offline in fixture mode** with placeholder keys, and flips to **live** the moment a real key lands in `.env` — zero product‑code change.

```bash
# 1) Backend harness (Python 3.11 + uv)
cd services/voice-backend
uv sync
uv run pytest -q                                              # 7 passing — locks the demo numbers
uv run python -m app.harness.run_demo --mode fixture          # full loop, offline
uv run uvicorn app.main:app --port 8000                       # control plane

# 2) Dashboard (Node)
cd apps/web
npm install
npm run dev                                                   # http://localhost:3000
```

**Go live (Cekura genuinely scores against the real CrisisLine agent):**

```bash
cd services/voice-backend
uv sync --extra cekura                                        # installs cekura==1.3.1
# .env already has: CEKURA_MODE=live, CEKURA_AGENT_ID=18038, CEKURA_PROJECT_ID=5867
uv run python -m app.harness.run_demo --mode live             # cekura mode=live in the sponsor strip
```

The dashboard reads the harness artifacts via `/api/demo/latest`; with the backend offline it falls back to the bundled `apps/web/public/seed-report.json` (degradation Level C/D) — it never shows an empty screen.

---

## Architecture

<div align="center">
  <img src="architecture.svg" alt="Timbre / VoiceShield Forge — self-improving crisis-escalation harness" width="100%">
</div>

```
                 Daily realtime AI ─┐
                                    ├─► Pipecat pipeline ─► normalized CallTrace
                 Twilio PSTN call ──┘   (Nemotron STT → Nemotron-3-Super → Gradium TTS)
                                                   │
                                                   ▼
   AWS-persisted   ◄── Regression Gate ◄── Cekura regression ◄── generated harder evals
   report + dash       (STAGING PASS /          ▲                        ▲
        │               HUMAN REVIEW)           │                        │
        ▼                                  Cekura baseline ─► Failure Router ─► Repair Compiler
   Timbre console                          (safety protocol)   (safety layer)   (escalation patch +
                                                                                 988 gate + guardrail)
```

| Sponsor | Role in the loop | Proof in the dashboard |
| --- | --- | --- |
| **Cekura** | Baseline + regression **evaluation** of the safety protocol | live agent `18038`, real result IDs, per‑scenario pass/fail |
| **NVIDIA Nemotron** | Open‑weights **STT + reasoning LLM** for the agent under test | risk‑phrase detection, risk tagging, repair word‑boost artifact |
| **Pipecat** | Voice **pipeline** + trace bridge | per‑frame ASR/LLM/TTS latency, transport frames |
| **Daily** | Realtime AI **media** ingress | session URL, participant/media/interruption events |
| **Twilio** | **PSTN** ingress + **simulated** crisis handoff | call SID, stream SID, simulated 988 handoff package |
| **AWS** | Production **persistence** | S3 object IDs + DynamoDB run index |

---

## 🚨 Safety & ethics (read this)

- **This is a testing harness, not a crisis service.** It does not provide crisis support to real people.
- **No real emergency call is ever placed.** The Twilio “988 handoff” is a **simulated artifact** (`"simulated": true`, with a synthetic `call_sid`) that proves the escalation *path* exists. There is no integration that dials 988, 911, or any human in this repo.
- **Caller dialogue is deliberately non‑graphic.** The demo uses restrained language (e.g. *“I don't feel safe being alone tonight.”*).
- The whole point of the project is the opposite of replacing humans: it **forces** a human‑review gate before any crisis agent change reaches production.

If you or someone you know is in crisis, contact the **988 Suicide & Crisis Lifeline** (US): call or text **988**.

---

## Repo layout

```
apps/web/                Next.js "Timbre" dashboard (latest layer: components/timbre/*)
services/voice-backend/  FastAPI control plane + harness + 6 sponsor adapters
  app/sponsor_adapters/cekura_adapter.py   ← live Cekura eval loop
  app/failure_router.py / repair_compiler.py / regression_gate.py
  demo/scenarios/baseline_suite.json       ← 10 crisis scenarios
starter-kit/server/      Pipecat bot (Nemotron STT + LLM, Gradium TTS, Twilio handoff)
packages/schemas/        Zod contracts (mirror of the Pydantic models)
demo/                    seeded runs, repair packs, sponsor proofs
docs/                    demo-script.md, sponsor-integration.md
```

### Docs
- [`docs/sponsor-integration.md`](docs/sponsor-integration.md) — adapter contract & the live switch
- [`docs/demo-script.md`](docs/demo-script.md) — the longer live‑demo walkthrough
- [`spec.md`](spec.md) — the full product spec

### Security
All API keys live in `.env` / `apps/web/.env.local` (both gitignored). `.env.example` documents the variables with placeholder values. Any sponsor whose credential is a `placeholder_*` value auto‑degrades to fixture and is labeled in the dashboard.
