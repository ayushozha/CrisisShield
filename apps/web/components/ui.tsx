"use client";

import type { AdapterStatus, SponsorMode } from "@/lib/types";
import type { ReactNode } from "react";

export function ModeBadge({ mode }: { mode: SponsorMode }) {
  const live = mode === "live";
  return (
    <span
      className="mono inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        background: live ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)",
        color: live ? "var(--color-ok)" : "var(--color-warn)",
        border: `1px solid ${live ? "rgba(52,211,153,0.35)" : "rgba(251,191,36,0.35)"}`,
      }}
    >
      {mode}
    </span>
  );
}

const STATUS_COLOR: Record<AdapterStatus, string> = {
  ready: "var(--color-ok)",
  degraded: "var(--color-warn)",
  failed: "var(--color-bad)",
};

export function StatusDot({ status, live = false }: { status: AdapterStatus; live?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${live ? "live-dot" : ""}`}
      style={{ background: STATUS_COLOR[status], boxShadow: `0 0 8px ${STATUS_COLOR[status]}` }}
    />
  );
}

export function Card({
  title,
  subtitle,
  icon,
  right,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex flex-col overflow-hidden ${className}`}>
      <header className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[var(--color-muted)]">{icon}</span>}
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
            {subtitle && (
              <p className="mono text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {right}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad" | "info" | "violet";
}) {
  const map: Record<string, string> = {
    neutral: "var(--color-muted)",
    ok: "var(--color-ok)",
    warn: "var(--color-warn)",
    bad: "var(--color-bad)",
    info: "var(--color-info)",
    violet: "var(--color-violet)",
  };
  const c = map[tone];
  return (
    <span
      className="mono inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
      style={{ background: `color-mix(in srgb, ${c} 12%, transparent)`, color: c, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.85 ? "var(--color-ok)" : value >= 0.6 ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-[var(--color-line-bright)]">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </span>
      <span className="mono tabular text-[10px]" style={{ color: tone }}>
        {pct}%
      </span>
    </span>
  );
}
