"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Icon, Panel, PanelHead, ConfBar, Eq, useCountTo, IC } from "./ui";
import type { TimbreDataset, TimbreTurn, TimbreThought, TimbreEntity } from "./data";
import type { TwilioReadiness } from "@/lib/types";

type TurnState = TimbreTurn & {
  phase: "typing" | "done";
  entShown: number;
};

type CallPhase = "idle" | "incoming" | "in_progress" | "completed";

export function LiveCall({
  dataset,
  surfaces = [],
  runId,
  playing,
  autoShow = false,
  liveStatus,
  liveReadiness,
  speedMul = 1,
  onDone,
  onAgentLatency,
  demoMode = "fixture",
  repaired,
}: {
  dataset: TimbreDataset;
  surfaces?: TimbreDataset[];
  runId: number;
  playing: boolean;
  autoShow?: boolean;
  liveStatus?: string;
  liveReadiness?: TwilioReadiness | null;
  speedMul?: number;
  onDone?: () => void;
  onAgentLatency?: (latencyMs: number | null) => void;
  demoMode?: "fixture" | "live";
  repaired: boolean;
}) {
  const [turns, setTurns] = useState<TurnState[]>([]);
  const [think, setThink] = useState<TimbreThought[]>([]);
  const [listening, setListening] = useState(false);
  const [agentTurnId, setAgentTurnId] = useState<string | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const at = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const patch = (id: string, p: Partial<TurnState>) =>
    setTurns((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  useEffect(() => {
    clearAll();
    if (!playing && completedRef.current) {
      completedRef.current = false;
      setListening(false);
      setAgentTurnId(null);
      setCallPhase("completed");
      return;
    }
    completedRef.current = false;
    setTurns([]);
    setThink([]);
    setListening(false);
    setAgentTurnId(null);
    onAgentLatency?.(null);
    setCallPhase("idle");
    if (!playing) {
      if (autoShow) {
        const doneTurns: TurnState[] = dataset.turns.map((turn) => ({
            ...turn,
            phase: "done" as const,
            entShown: turn.entities?.length ?? 0,
          }));
        setTurns(doneTurns);
        setCallPhase(liveStatus === "streaming" ? "in_progress" : "completed");
        const lastAgent = [...doneTurns]
          .reverse()
          .find((turn) => turn.speaker === "agent" && (turn.think?.length ?? 0) > 0);
        if (lastAgent) {
          setAgentTurnId(lastAgent.id);
          setThink(lastAgent.think ?? []);
        }
        const lastAgentLatency =
          [...doneTurns]
            .reverse()
            .find((turn) => turn.speaker === "agent" && turn.latency != null)
            ?.latency ?? null;
        onAgentLatency?.(lastAgentLatency);
      }
      return;
    }

    const sp = speedMul;
    setCallPhase("incoming");
    at(650 * sp, () => setCallPhase("in_progress"));
    let t = 900 * sp;

    dataset.turns.forEach((turn) => {
      at(t, () => {
        setCallPhase("in_progress");
        setTurns((prev) => [
          ...prev,
          { ...turn, phase: "typing", entShown: 0 },
        ]);
      });
      const typeDur = Math.max(600, turn.text.length * 24) * sp;

      if (turn.speaker === "caller") {
        at(t, () => {
          setListening(true);
          setThink([]);
          setAgentTurnId(null);
          onAgentLatency?.(null);
        });
        t += typeDur;
        at(t, () => patch(turn.id, { phase: "done" }));
        (turn.entities || []).forEach((_, ei) => {
          t += 220 * sp;
          at(t, () => patch(turn.id, { entShown: ei + 1 }));
        });
        at(t, () => setListening(false));
        t += 350 * sp;
      } else {
        at(t, () => {
          setListening(false);
          setThink([]);
          setAgentTurnId(turn.id);
          onAgentLatency?.(turn.latency ?? null);
        });
        (turn.think || []).forEach((th) => {
          t += 480 * sp;
          at(t, () => setThink((prev) => [...prev, th]));
        });
        t += 300 * sp;
        at(t, () => patch(turn.id, { phase: "typing" }));
        t += typeDur;
        at(t, () => patch(turn.id, { phase: "done" }));
        t += 400 * sp;
      }
    });

    at(t, () => {
      completedRef.current = true;
      setCallPhase("completed");
      onDone && onDone();
    });
    return clearAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, playing, autoShow, liveStatus, dataset.callId, dataset.turns, onAgentLatency]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, think]);

  const captured = useMemo(() => {
    const m: Record<string, TimbreEntity> = {};
    turns.forEach((t) =>
      (t.entities || []).slice(0, t.entShown).forEach((e) => (m[e.k] = e))
    );
    return m;
  }, [turns]);

  const displayedPhase = phaseFromLiveStatus(liveStatus) ?? callPhase;
  const statusMeta = phaseMeta(displayedPhase);
  const liveDot = displayedPhase === "incoming" || displayedPhase === "in_progress";
  const tagText = statusMeta.tag;
  const agentName = agentNameForDataset(dataset);
  const callerName = callerNameFrom(captured) || liveCallerFrom(liveReadiness);
  const callerDetail = callerDetailFrom(captured, displayedPhase, liveReadiness);
  const transcriptLabel = turns.length === 1 ? "1 turn" : `${turns.length} turns`;

  return (
    <div className="tb-live">
      {/* Transcript column */}
      <Panel className="tb-live-main" glow>
        <PanelHead
          icon={<Icon d={IC.waveform} size={17} />}
          accent="violet"
          title="Live Call"
          sub={headerSub(dataset, demoMode)}
          right={
            <div className="tb-live-head-actions">
              <span
                className="tb-sourcechip mono"
                title={
                  surfaces.length > 1 && demoMode === "fixture"
                    ? "Additional cached traces are available in History."
                    : undefined
                }
              >
                {sourceChipLabel(dataset, demoMode)}
              </span>
              <span className={`tb-livetag ${liveDot ? "on" : ""}`}>
                <span className="tb-livedot" /> {tagText}
              </span>
            </div>
          }
        />
        <div className="tb-callbar">
          <div className={`tb-callstage phase-${displayedPhase}`}>
            <span className="tb-callstage-dot" />
            <span className="tb-callstage-copy">
              <span className="tb-callstage-k mono">{statusMeta.kicker}</span>
              <b>{statusMeta.label}</b>
            </span>
          </div>
          <div className="tb-party">
            <span className="tb-party-k mono">AGENT</span>
            <b>{agentName}</b>
            <span>{agentTransportLabel(dataset, demoMode)}</span>
          </div>
          <div className={`tb-party ${callerName ? "filled" : ""}`}>
            <span className="tb-party-k mono">CALLER</span>
            <b>{callerName || "Identifying caller"}</b>
            <span>{callerDetail}</span>
          </div>
        </div>
        {demoMode === "live" && <LiveIngress readiness={liveReadiness} />}
        <div className="tb-transcript-head">
          <span>Live call transcript</span>
          <span className="mono">{transcriptLabel}</span>
        </div>
        <div className="tb-transcript" ref={scrollRef}>
          {turns.length === 0 && (
            <div className="tb-empty">
              <Icon d={IC.mic} size={26} />
              <p>{emptyCopy(displayedPhase, repaired, agentName, demoMode)}</p>
            </div>
          )}
          {turns.map((t) => (
            <Bubble
              key={t.id}
              turn={t}
              agentName={agentName}
              callerName={callerName}
            />
          ))}
        </div>
      </Panel>

      {/* Agent thinking rail */}
      <Panel className="tb-rail">
        <PanelHead
          icon={<Icon d={IC.spark} size={16} />}
          accent="pink"
          title="Agent Mind"
          sub="reasoning · next action"
          right={
            <span
              className={`tb-thinkdot ${
                agentTurnId ? "on" : listening ? "listen" : ""
              }`}
            />
          }
        />
        <div className="tb-rail-body">
          <div className="tb-railstate">
            {listening ? (
              <>
                <Eq /> <span>Listening · transcribing…</span>
              </>
            ) : agentTurnId ? (
              <>
                <span className="tb-spinner" /> <span>Reasoning…</span>
              </>
            ) : (
              <span className="muted">Idle</span>
            )}
          </div>

          <div className="tb-thoughts">
            {think.length === 0 && !listening && (
              <p className="tb-rail-hint">
                The agent&apos;s plan and tool calls appear here in real time.
              </p>
            )}
            {listening && think.length === 0 && (
              <p className="tb-rail-hint">Capturing entities from the caller…</p>
            )}
            {think.map((th, i) => (
              <Thought key={i} th={th} />
            ))}
          </div>

          <div className="tb-railsec">
            <span className="tb-railsec-h mono">CAPTURED ENTITIES</span>
            {Object.keys(captured).length === 0 ? (
              <p className="tb-rail-hint sm">none yet</p>
            ) : (
              ["risk_phrase", "risk_level", "safety_plan"]
                .filter((k) => captured[k])
                .map((k) => {
                  const e = captured[k];
                  return (
                    <div key={k} className="tb-ent">
                      <span className="tb-ent-k mono">{k}</span>
                      <span className="tb-ent-v mono">{e.v}</span>
                      <ConfBar value={e.c} />
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function headerSub(dataset: TimbreDataset, demoMode: "fixture" | "live") {
  if (demoMode === "fixture") return `Cached crisis flow · ${dataset.scenario}`;
  return `${dataset.transport} · ${dataset.callId}`;
}

function sourceChipLabel(dataset: TimbreDataset, demoMode: "fixture" | "live") {
  if (demoMode === "fixture") return "cached flow";
  if (dataset.source === "twilio") return "Twilio PSTN";
  if (dataset.source === "daily") return "Daily media";
  return "live trace";
}

function agentTransportLabel(dataset: TimbreDataset, demoMode: "fixture" | "live") {
  if (demoMode === "fixture") return "VoiceShield demo agent";
  return dataset.transport;
}

function phaseMeta(phase: CallPhase) {
  if (phase === "incoming") {
    return { tag: "INCOMING", kicker: "CALL STATE", label: "Incoming call" };
  }
  if (phase === "in_progress") {
    return { tag: "IN PROGRESS", kicker: "CALL STATE", label: "In progress" };
  }
  if (phase === "completed") {
    return { tag: "COMPLETED", kicker: "CALL STATE", label: "Completed" };
  }
  return { tag: "READY", kicker: "CALL STATE", label: "Ready for call" };
}

function phaseFromLiveStatus(status?: string): CallPhase | undefined {
  const normalized = status?.toLowerCase().replace("_", "-");
  if (!normalized) return undefined;
  if (["queued", "ringing", "incoming"].includes(normalized)) return "incoming";
  if (["streaming", "in-progress", "answered"].includes(normalized)) return "in_progress";
  if (["completed", "stopped"].includes(normalized)) return "completed";
  return undefined;
}

function agentNameForDataset(dataset: TimbreDataset) {
  if (dataset.source === "twilio") return "CrisisLine Agent (PSTN)";
  if (dataset.source === "agent_sim") return "CrisisLine Agent (sim)";
  return "CrisisLine Counselor";
}

function callerNameFrom(captured: Record<string, TimbreEntity>) {
  // Crisis calls are anonymous — no caller identity is captured.
  return "";
}

function callerDetailFrom(
  captured: Record<string, TimbreEntity>,
  phase: CallPhase,
  readiness?: TwilioReadiness | null,
) {
  const riskLevel = captured.risk_level?.v;
  const riskPhrase = captured.risk_phrase?.v;
  if (riskLevel) return `risk: ${riskLevel}`;
  if (riskPhrase) return `flagged: "${riskPhrase}"`;
  const latestCall = readiness?.latest_call;
  if (latestCall?.status) {
    const to = latestCall.to || readiness?.configured_number;
    return to ? `${latestCall.status} to ${to}` : latestCall.status;
  }
  if (phase === "incoming") return "waiting for pickup";
  if (phase === "in_progress") return "listening for risk signals";
  if (phase === "completed") return "call trace captured";
  return "awaiting caller";
}

function liveCallerFrom(readiness?: TwilioReadiness | null) {
  const from = readiness?.latest_call?.from;
  if (!from) return "";
  return `Caller ${from}`;
}

function LiveIngress({ readiness }: { readiness?: TwilioReadiness | null }) {
  if (!readiness) {
    return (
      <div className="tb-live-ingress waiting">
        <span className="tb-live-ingress-k mono">TWILIO INGRESS</span>
        <b>Checking live call wiring</b>
        <p>Waiting for the backend readiness check.</p>
      </div>
    );
  }

  const hasStream = readiness.streams.active > 0 || readiness.streams.total > 0;
  const blocked = readiness.status === "blocked";
  const tone = hasStream ? "ok" : blocked ? "blocked" : "waiting";
  const headline = hasStream
    ? "Twilio stream received by this backend"
    : blocked
    ? "Live Twilio call is not wired to this backend"
    : "Waiting for a real Twilio call";
  const detail =
    readiness.issues[0] ||
    (readiness.latest_call
      ? "Twilio has recent call activity. Waiting for media stream and transcript."
      : "Call the configured Twilio number and the transcript will appear here.");
  const webhook = readiness.number_config?.voice_url || "not configured";
  const number = readiness.number_config?.phone_number || readiness.configured_number || "unknown";
  const latestCall = readiness.latest_call?.sid
    ? `${readiness.latest_call.status || "call"} ${readiness.latest_call.sid}`
    : "none seen";

  return (
    <div className={`tb-live-ingress ${tone}`}>
      <span className="tb-live-ingress-k mono">TWILIO INGRESS</span>
      <b>{headline}</b>
      <p>{detail}</p>
      <div className="tb-live-facts mono">
        <span>number {number}</span>
        <span>webhook {webhook}</span>
        <span>last call {latestCall}</span>
      </div>
    </div>
  );
}

function emptyCopy(
  phase: CallPhase,
  repaired: boolean,
  agentName: string,
  demoMode: "fixture" | "live",
) {
  if (phase === "incoming") return `Incoming call. Routing caller to ${agentName}.`;
  if (phase === "in_progress") return "Call picked up. Live transcript will appear here.";
  if (phase === "completed") return "Call completed. No transcript turns were captured.";
  if (demoMode === "fixture") {
    return `Press Run cached demo to replay the ${repaired ? "repaired" : "baseline"} crisis-support session.`;
  }
  return "Call the configured Twilio number. Only real media streams and live transcript turns appear here.";
}

/* ---- Bubble ---- */
function Bubble({
  turn,
  agentName,
  callerName,
}: {
  turn: TurnState;
  agentName: string;
  callerName: string;
}) {
  const isAgent = turn.speaker === "agent";
  const full = turn.text;
  const [shown, setShown] = useState(turn.phase === "done" ? full : "");

  useEffect(() => {
    if (turn.phase !== "typing") {
      setShown(full);
      return;
    }
    let i = 0;
    setShown("");
    const step = Math.max(1, Math.round(full.length / 60));
    const iv = setInterval(() => {
      i += step;
      if (i >= full.length) {
        setShown(full);
        clearInterval(iv);
      } else {
        setShown(full.slice(0, i));
      }
    }, 26);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.phase]);

  const typing = turn.phase === "typing" && shown.length < full.length;

  return (
    <div className={`tb-bubble ${isAgent ? "agent" : "caller"}`}>
      <span className={`tb-bub-av ${isAgent ? "agent" : "caller"}`}>
        <Icon d={isAgent ? IC.bot : IC.user} size={15} />
      </span>
      <div className="tb-bub-body">
        <div className="tb-bub-meta">
          <span className="tb-bub-who">
            {isAgent ? agentName : callerName || "Caller"}
          </span>
          {turn.asr != null && (
            <span className="tb-bub-asr mono">
              ASR <ConfBar value={turn.asr} />
            </span>
          )}
          {turn.latency != null && (
            <LatencyChip
              ms={turn.latency}
              live={typing}
              good={isAgent && turn.latency < 700}
            />
          )}
        </div>
        <p className="tb-bub-text">
          {shown}
          {typing && <span className="tb-caret" />}
        </p>

        {turn.entities && turn.entShown > 0 && (
          <div className="tb-bub-ents">
            {turn.entities.slice(0, turn.entShown).map((e) => (
              <span key={e.k} className="tb-chip">
                <span className="mono k">{e.k}</span>
                <span className="mono v">{e.v}</span>
                <span
                  className={`tb-dot ${
                    e.c >= 0.85 ? "mint" : e.c >= 0.6 ? "amber" : "coral"
                  }`}
                />
              </span>
            ))}
          </div>
        )}

        {turn.toolFired && turn.toolFired.unsafe && (
          <div className="tb-toolbar danger">
            <Icon d={IC.alert} size={13} /> <b>{turn.toolFired.name}</b> fired
            without its safety preconditions · {turn.toolFired.args}
          </div>
        )}
        {turn.toolFired && !turn.toolFired.unsafe && (
          <div className="tb-toolbar ok">
            <Icon d={IC.check} size={13} /> <b>{turn.toolFired.name}</b> routed
            safely · {turn.toolFired.args}
          </div>
        )}
        {turn.gated && (
          <div className="tb-toolbar gate">
            <Icon d={IC.shield} size={13} /> <b>{turn.gated.name}</b> blocked ·{" "}
            {turn.gated.reason}
          </div>
        )}
        {turn.safety && (
          <div className="tb-toolbar danger soft">
            <Icon d={IC.alert} size={13} /> {turn.safety}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Thought bubble ---- */
function Thought({ th }: { th: TimbreThought }) {
  const map: Record<
    string,
    { ic: string | string[]; tone: string; lab: string }
  > = {
    reason: { ic: IC.spark, tone: "violet", lab: "reason" },
    plan: { ic: IC.arrowRight, tone: "sky", lab: "next" },
    tool: {
      ic: IC.wrench,
      tone: th.ok ? "mint" : th.danger ? "coral" : "amber",
      lab: "tool",
    },
    guard: { ic: IC.shield, tone: th.ok ? "mint" : "coral", lab: "guard" },
  };
  const m = map[th.kind] || map.reason;
  return (
    <div
      className={`tb-thought tone-${m.tone} ${th.danger ? "danger" : ""} ${
        th.ok ? "ok" : ""
      }`}
    >
      <span className="tb-thought-ic">
        <Icon d={m.ic} size={13} />
      </span>
      <div>
        <span className="tb-thought-lab mono">{m.lab}</span>
        <p>{th.text}</p>
      </div>
    </div>
  );
}

/* ---- Latency chip ---- */
function LatencyChip({
  ms,
  live,
  good,
}: {
  ms: number;
  live: boolean;
  good: boolean;
}) {
  const v = useCountTo(ms, [ms], 600);
  return (
    <span
      className={`tb-lat mono ${good ? "good" : ""} ${live ? "live" : ""}`}
    >
      <Icon d={IC.bolt} size={11} /> {Math.round(v)}ms
    </span>
  );
}
