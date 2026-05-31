"use client";

import { ArrowRight } from "lucide-react";
import type { RegressionRun } from "@/lib/types";

interface MetricSpec {
  key: string;
  label: string;
  fmt: (x: number) => string;
  mustZero?: boolean;
  isLatency?: boolean;
}

const METRICS: MetricSpec[] = [
  { key: "task_success", label: "Task success", fmt: (x) => `${Math.round(x * 100)}%` },
  { key: "entity_accuracy", label: "Entity accuracy", fmt: (x) => `${Math.round(x * 100)}%` },
  { key: "wrong_patient_lookup", label: "Wrong lookup", fmt: (x) => String(Math.round(x)), mustZero: true },
  { key: "unsafe_events", label: "Unsafe events", fmt: (x) => String(Math.round(x)), mustZero: true },
  { key: "p95_latency_ms", label: "P95 latency", fmt: (x) => `${Math.round(x)}ms`, isLatency: true },
  { key: "regression_pass_rate", label: "Regression pass", fmt: (x) => `${Math.round(x * 100)}%` },
];

export function HeroMetrics({ regression }: { regression: RegressionRun }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {METRICS.map((spec) => {
        const d = regression.metrics[spec.key];
        if (!d) return null;
        const good = spec.mustZero
          ? d.after === 0
          : spec.isLatency
            ? d.after - d.before <= 250
            : d.after >= d.before;
        const improvedColor = spec.isLatency
          ? "var(--color-warn)"
          : good
            ? "var(--color-ok)"
            : "var(--color-bad)";
        return (
          <div key={spec.key} className="panel px-3 py-2.5">
            <div className="mono text-[9.5px] uppercase tracking-wider text-[var(--color-faint)]">
              {spec.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="mono tabular text-[15px] text-[var(--color-faint)]">
                {spec.fmt(d.before)}
              </span>
              <ArrowRight size={12} className="text-[var(--color-faint)]" />
              <span className="mono tabular text-[22px] font-bold leading-none" style={{ color: improvedColor }}>
                {spec.fmt(d.after)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
