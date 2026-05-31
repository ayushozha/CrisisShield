# LinkedIn post drafts — Timbre / VoiceShield Forge

> 📎 **Attach `architecture.png`** to the post (LinkedIn does not accept `.svg` uploads — use the PNG, the SVG is for the README/GitHub).
> 🎥 Drop the <60s demo video in the comments or as a native upload, and replace `[DEMO LINK]`.

---

## Option A — the punchy one (recommended)

We just spent the YC Voice Agents Hackathon building the thing nobody wants to demo but everybody needs: **the safety harness around crisis voice agents.**

We are NOT building an AI therapist. 🚫

We built **Timbre / VoiceShield Forge** — CI/CD for voice‑agent *safety*. The dangerous part of a voice agent in a high‑stakes setting isn't whether it sounds human. It's whether it knows the moment it must stop being autonomous and **escalate**.

So we built the loop that proves it does:

🟥 A simulated 988‑style crisis call. The caller expresses imminent risk. The baseline agent hears it perfectly… and just keeps chatting. No escalation.
🟢 **Cekura** scores the call's *safety protocol* — risk detection, direct safety assessment, 988 routing, handoff timing, unsafe wording, scope.
🧭 Our Failure Router proves the failure is **policy, not transcription** (the open‑weights **NVIDIA Nemotron** ASR heard every word).
🔧 The Repair Compiler emits a concrete escalation patch + generates *harder* calls (vague risk, denial after disclosure, pressure to not escalate).
🔁 We re‑run everything through Cekura and gate the result.

The numbers, computed by the harness — not hardcoded:
• Missed escalation: **4 → 0**
• Unsafe responses: **3 → 0**
• Correct handoff: **30% → 90%**
• Time to escalation: **95s → 22s**

And the decision is deliberately **NOT "ship it."** It's **STAGING PASS · HUMAN REVIEW REQUIRED.** In a crisis domain, a clean eval should never auto‑promote to production.

Built on the hackathon themes end‑to‑end:
🟢 **Cekura** — the live evaluation + self‑improvement loop
🟩 **NVIDIA Nemotron** — open‑weights streaming STT + reasoning LLM
🟣 **Pipecat** — the voice pipeline + trace bridge
+ Daily, Twilio, AWS

⚠️ Safety note: the 988 handoff is a *simulated* artifact. No real emergency call is ever placed. This is a testing harness, not a crisis service. If you're in crisis, call or text 988 (US).

🎥 60‑second demo: [DEMO LINK]
⭐ Code + full write‑up: https://github.com/ayushozha/CrisisShield

#VoiceAI #AIsafety #Cekura #Nemotron #NVIDIA #Pipecat #YCHackathon #AgentEvals #VoiceAgents

---

## Option B — the builder/technical one

"Evaluating and improving agent performance" is a hackathon theme. We took it literally and built **CI/CD for voice‑agent safety.**

**Timbre / VoiceShield Forge** wraps a voice agent and runs a closed self‑improvement loop:
ingress → normalized CallTrace → **Cekura** baseline eval → failure router → repair compiler → generated harder evals → **Cekura** regression → regression gate → persisted report → live dashboard.

The demo is a 988‑style crisis line. The whole point: the baseline agent *hears* the risk correctly (open‑weights **Nemotron** streaming STT) but fails the **policy** — it never escalates. Our router sends that to the safety/escalation layer, the compiler ships a concrete escalation patch + a 988 routing gate + a guardrail blocking diagnosis claims, and Cekura re‑scores it.

Result (harness‑computed): missed escalation 4→0, unsafe 3→0, correct handoff 30%→90%, time‑to‑escalation 95s→22s. Decision: STAGING PASS / HUMAN REVIEW REQUIRED — crisis agents never auto‑promote.

A few things we shipped that I'm proud of:
• A genuinely **live** Cekura loop bound to a real crisis agent + scenario suite + LLM‑judge safety metrics.
• A TTFB fix for reasoning models in a voice loop — stock Pipecat stops the clock on the first *reasoning* token (~270ms reported vs ~2.2s to the first real answer token).
• An honest regression gate that leaves un‑repaired layers failing instead of a blanket pass.

Themes hit: agent evals (Cekura), open weights (Nemotron), voice (Pipecat). 🟢🟩🟣

🎥 [DEMO LINK] · ⭐ https://github.com/ayushozha/CrisisShield

#AIEngineering #VoiceAgents #LLMEvals #OpenWeights #Nemotron #Cekura #Pipecat #YC

---

### Posting checklist
- [ ] Replace `[DEMO LINK]` (keep it under 60s) and `https://github.com/ayushozha/CrisisShield`.
- [ ] Upload `architecture.png` as the post image (1600px wide, ready to attach).
- [ ] Keep the safety disclaimer — it reads as responsible, and judges/NVIDIA/Cekura care.
- [ ] Tag teammates and the sponsor orgs (Cekura, NVIDIA, Pipecat/Daily, Twilio, AWS).
