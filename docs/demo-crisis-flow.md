# Demo Crisis Flow

This is the saved hackathon demo flow for the Twilio inbound call.

The caller reaches the Twilio number. Twilio connects the call to the Pipecat
agent. The live dashboard transcript is populated only from the call trace
posted by the Pipecat bot to `/api/trace/live`.

## First Agent Line

Agent: Hi, you are connected. I am here with you. I am not a therapist, but I
can help you stay connected and route you to trained crisis support. What is
happening right now?

## Demo Beats

1. Caller says they do not feel safe being alone.
2. Agent asks a direct immediate-danger question.
3. Caller says they might hurt themselves.
4. Agent stays on the line and asks whether the caller is alone.
5. Agent asks the caller to contact a trusted nearby person.
6. Agent asks the caller to move to a shared space.
7. Agent confirms callback safety and rough city/state.
8. Agent creates a handoff summary.
9. Agent routes to trained human support and keeps the caller engaged.
10. Agent shows final handoff events in Agent Mind:
    - crisis route selected
    - handoff package created
    - trained human support transfer initiated
    - Twilio call SID attached
    - Daily session ID attached
    - Cekura regression run ID attached
    - human review required

## Demo Guardrails

Do not say provider names in the spoken call. The visible product story is
Twilio ingress, Pipecat live voice agent, VoiceShield trace, Agent Mind, and
Cekura-style regression proof.
