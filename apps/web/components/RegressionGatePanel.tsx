"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { RegressionRun } from "@/lib/types";
import { Card } from "./ui";

export function RegressionGatePanel({ regression }: { regression: RegressionRun }) {
  const m = regression.metrics;
  const promoted = regression.promotion_decision === "promote";

  const pctData = [
    { name: "Task success", before: pct(m.task_success?.before), after: pct(m.task_success?.after) },
    { name: "Entity acc.", before: pct(m.entity_accuracy?.before), after: pct(m.entity_accuracy?.after) },
    { name: "Pass rate", before: pct(m.regression_pass_rate?.before), after: pct(m.regression_pass_rate?.after) },
  ];

  return (
    <Card
      title="Regression Gate"
      subtitle="before / after · promotion decision"
      icon={promoted ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
      right={
        <span
          className="mono rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
          style={{
            background: promoted ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
            color: promoted ? "var(--color-ok)" : "var(--color-bad)",
            border: `1px solid ${promoted ? "rgba(52,211,153,0.4)" : "rgba(248,113,113,0.4)"}`,
          }}
        >
          {regression.promotion_decision}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Percent metrics chart */}
        <div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={pctData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barGap={2}>
              <XAxis dataKey="name" tick={{ fill: "#8a97ad", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#5b6678", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Bar dataKey="before" radius={[3, 3, 0, 0]} maxBarSize={26}>
                {pctData.map((_, i) => (
                  <Cell key={i} fill="#4b5670" />
                ))}
              </Bar>
              <Bar dataKey="after" radius={[3, 3, 0, 0]} maxBarSize={26}>
                {pctData.map((_, i) => (
                  <Cell key={i} fill="#34d399" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mono flex justify-center gap-3 text-[9px] text-[var(--color-faint)]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#4b5670" }} /> before
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#34d399" }} /> after
            </span>
          </div>
        </div>

        {/* Hard safety/latency stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Wrong lookup" before={m.wrong_patient_lookup?.before} after={m.wrong_patient_lookup?.after} mustZero />
          <Stat label="Unsafe" before={m.unsafe_events?.before} after={m.unsafe_events?.after} mustZero />
          <Stat
            label="P95 ms"
            before={m.p95_latency_ms?.before}
            after={m.p95_latency_ms?.after}
            suffix=""
            isLatency
          />
        </div>
      </div>

      {/* Gate checks */}
      <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {regression.gate_checks.map((c) => (
          <div key={c.name} className="flex items-center justify-between rounded border border-[var(--color-line)] px-2 py-1">
            <span className="mono text-[10px] text-[var(--color-muted)]">{c.name}</span>
            <span
              className="mono text-[10px] font-semibold"
              style={{ color: c.passed ? "var(--color-ok)" : "var(--color-bad)" }}
            >
              {c.passed ? "PASS" : "FAIL"} <span className="text-[var(--color-faint)]">{c.detail}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-[var(--color-muted)]">{regression.promotion_reason}</p>
    </Card>
  );
}

function pct(x?: number): number {
  return Math.round((x ?? 0) * 100);
}

function Stat({
  label,
  before,
  after,
  mustZero = false,
  isLatency = false,
}: {
  label: string;
  before?: number;
  after?: number;
  mustZero?: boolean;
  isLatency?: boolean;
  suffix?: string;
}) {
  const good = mustZero ? (after ?? 0) === 0 : isLatency ? (after ?? 0) - (before ?? 0) <= 250 : true;
  return (
    <div className="panel-2 px-2 py-1.5 text-center">
      <div className="mono text-[9px] uppercase tracking-wider text-[var(--color-faint)]">{label}</div>
      <div className="mono tabular mt-0.5 text-[15px] font-bold">
        <span className="text-[var(--color-faint)]">{fmt(before)}</span>
        <span className="mx-1 text-[var(--color-faint)]">→</span>
        <span style={{ color: good ? "var(--color-ok)" : "var(--color-bad)" }}>{fmt(after)}</span>
      </div>
    </div>
  );
}

function fmt(x?: number): string {
  if (x == null) return "—";
  return Number.isInteger(x) ? String(x) : x.toFixed(0);
}
