"use client";

import { useState } from "react";
import { Phone, Radio, Bot } from "lucide-react";
import type { CallTrace, SponsorProof } from "@/lib/types";
import { Card, ConfidenceBar, ModeBadge, Pill } from "./ui";
import { DailyJoin } from "./DailyJoin";

const SOURCE_ICON: Record<string, any> = {
  daily: Radio,
  twilio: Phone,
  cekura: Bot,
  agent_sim: Bot,
};

export function LiveCallPanel({
  primary,
  secondary,
  proof,
  mode,
}: {
  primary: CallTrace;
  secondary?: CallTrace | null;
  proof: SponsorProof;
  mode: "live" | "fixture";
}) {
  const surfaces = [primary, ...(secondary ? [secondary] : [])];
  const [idx, setIdx] = useState(0);
  const trace = surfaces[idx];
  const daily = proof.sponsors.daily;
  const twilio = proof.sponsors.twilio;
  const Icon = SOURCE_ICON[trace.source] ?? Radio;

  return (
    <Card
      title="Live Call"
      subtitle="ingress · transcript · entities · latency"
      icon={<Icon size={15} />}
      right={
        <div className="flex items-center gap-1">
          {surfaces.map((s, i) => (
            <button
              key={s.source}
              onClick={() => setIdx(i)}
              className="mono rounded px-2 py-0.5 text-[10px] uppercase tracking-wider"
              style={{
                background: i === idx ? "var(--color-line-bright)" : "transparent",
                color: i === idx ? "var(--color-fg)" : "var(--color-faint)",
                border: "1px solid var(--color-line)",
              }}
            >
              {s.source}
            </button>
          ))}
        </div>
      }
    >
      {/* Surface state row */}
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StateBox label="Source" value={trace.source} sub={trace.transport ?? ""} />
        <StateBox
          label="Daily session"
          value={daily ? "active" : "—"}
          sub={daily?.proof?.media_state ?? ""}
          mode={daily?.mode}
        />
        <StateBox
          label="Participants"
          value={String(daily?.proof?.participant_count ?? 0)}
          sub={`${daily?.proof?.interruption_events ?? 0} interruptions`}
        />
        <StateBox
          label="Twilio PSTN"
          value={twilio?.proof?.call_sid ? "call" : "—"}
          sub={twilio?.proof?.stream_sid ?? ""}
          mode={twilio?.mode}
        />
      </div>

      {/* Daily live join */}
      <DailyJoin daily={daily} mode={mode} />

      {/* Transcript */}
      <div className="mt-3 space-y-2">
        {trace.turns.map((t) => {
          const lookupCall = t.tool_calls.find((c) => c.name === "patient_lookup");
          return (
            <div key={t.turn_id} className="panel-2 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="mono text-[10px] uppercase tracking-wider"
                    style={{ color: t.speaker === "agent" ? "var(--color-accent)" : "var(--color-info)" }}
                  >
                    {t.speaker}
                  </span>
                  <span className="mono text-[9px] text-[var(--color-faint)]">{t.turn_id}</span>
                  {t.asr_confidence != null && <ConfidenceBar value={t.asr_confidence} />}
                </div>
                {t.latency_ms?.end_to_end != null && (
                  <span className="mono tabular text-[10px] text-[var(--color-faint)]">
                    asr {t.latency_ms.asr ?? 0} · llm {t.latency_ms.llm ?? 0} · tts{" "}
                    {t.latency_ms.tts ?? 0} ·{" "}
                    <span className="text-[var(--color-muted)]">e2e {t.latency_ms.end_to_end}ms</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-fg)]">{t.transcript}</p>
              {Object.keys(t.entities).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(t.entities).map(([k, e]) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className="mono text-[10px] text-[var(--color-faint)]">{k}=</span>
                      <span className="mono text-[10px] text-[var(--color-fg)]">{e.value}</span>
                      <ConfidenceBar value={e.confidence} />
                    </span>
                  ))}
                </div>
              )}
              {lookupCall && (
                <div className="mt-1.5">
                  <Pill tone="bad">⚠ patient_lookup fired — {JSON.stringify(lookupCall.args)}</Pill>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {trace.safety_events.length > 0 && (
        <div className="mt-2 rounded-md border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] px-3 py-2">
          {trace.safety_events.map((s, i) => (
            <div key={i} className="text-[11px] text-[var(--color-bad)]">
              <span className="mono uppercase">{s.kind}</span> — {s.detail}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StateBox({
  label,
  value,
  sub,
  mode,
}: {
  label: string;
  value: string;
  sub?: string;
  mode?: "live" | "fixture";
}) {
  return (
    <div className="panel-2 px-2.5 py-1.5">
      <div className="flex items-center justify-between">
        <span className="mono text-[9px] uppercase tracking-wider text-[var(--color-faint)]">
          {label}
        </span>
        {mode && <ModeBadge mode={mode} />}
      </div>
      <div className="truncate text-[13px] font-semibold">{value}</div>
      {sub && <div className="mono truncate text-[9px] text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}
