"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { IC } from "./icons";

/* -------- Icon -------- */
export function Icon({
  d,
  size = 18,
  fill = false,
  stroke = 2,
}: {
  d: string | string[];
  size?: number;
  fill?: boolean;
  stroke?: number;
}) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

/* -------- Panel -------- */
export function Panel({
  children,
  className = "",
  style = {},
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  glow?: boolean;
}) {
  return (
    <section
      className={`tb-panel ${glow ? "tb-panel-glow" : ""} ${className}`}
      style={style}
    >
      {children}
    </section>
  );
}

/* -------- PanelHead -------- */
export function PanelHead({
  icon,
  title,
  sub,
  accent = "violet",
  right,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  accent?: string;
  right?: ReactNode;
}) {
  return (
    <header className="tb-phead">
      <span className={`tb-phead-ic tb-ic-${accent}`}>{icon}</span>
      <div className="tb-phead-tx">
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="tb-phead-right">{right}</div>}
    </header>
  );
}

/* -------- Pill -------- */
export function Pill({
  children,
  tone = "neutral",
  soft = true,
  className = "",
}: {
  children: ReactNode;
  tone?: string;
  soft?: boolean;
  className?: string;
}) {
  return (
    <span className={`tb-pill tb-pill-${tone} ${soft ? "soft" : ""} ${className}`}>
      {children}
    </span>
  );
}

/* -------- ConfBar -------- */
export function ConfBar({ value, tone }: { value: number; tone?: string }) {
  const pct = Math.round(value * 100);
  const auto = value >= 0.85 ? "mint" : value >= 0.6 ? "amber" : "coral";
  return (
    <span className="tb-conf">
      <span className="tb-conf-track">
        <span
          className={`tb-conf-fill tone-${tone || auto}`}
          style={{ width: pct + "%" }}
        />
      </span>
      <span className="tb-conf-pct mono">{pct}%</span>
    </span>
  );
}

/* -------- useCountTo (animated counter) -------- */
export function useCountTo(target: number, deps: unknown[], dur = 700): number {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = target;
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return val;
}

/* -------- Equalizer (listening indicator) -------- */
export function Eq() {
  return (
    <span className="tb-eq">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}

/* Export IC so consumers can import from here */
export { IC };
