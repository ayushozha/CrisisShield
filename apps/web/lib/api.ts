// Backend client with an offline fallback. The dashboard ALWAYS renders:
// it tries the live backend, then falls back to the bundled seeded report
// in /public (degradation Level C/D, spec.md §16).

import type { DemoReport, LiveTraceSnapshot, SponsorMode, TwilioReadiness } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function tryFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchLatestReport(): Promise<{ report: DemoReport; source: string }> {
  const live = await tryFetch<DemoReport>(`${API_BASE}/api/demo/latest`);
  if (live) return { report: live, source: "backend" };
  // Offline fallback: the seeded report served as a static asset.
  const seed = await tryFetch<DemoReport>("/seed-report.json");
  if (seed) return { report: seed, source: "seed" };
  throw new Error("no report available (backend offline and no seed)");
}

export async function fetchCachedReport(): Promise<{ report: DemoReport; source: string }> {
  const seed = await tryFetch<DemoReport>("/seed-report.json");
  if (seed) return { report: seed, source: "seed" };
  throw new Error("no cached report available");
}

export async function runDemo(
  mode: SponsorMode,
  scenario = "crisis_escalation_001",
): Promise<DemoReport | null> {
  const out = await tryFetch<{ report: DemoReport }>(
    `${API_BASE}/api/demo/run?mode=${mode}&scenario=${scenario}`,
    { method: "POST" },
  );
  return out?.report ?? null;
}

export async function createDailySession(mode: SponsorMode) {
  return tryFetch<Record<string, any>>(`${API_BASE}/api/daily/session?mode=${mode}`, {
    method: "POST",
  });
}

export async function fetchSponsors(mode: SponsorMode) {
  return tryFetch<{ mode: string; sponsors: Record<string, any> }>(
    `${API_BASE}/api/sponsors?mode=${mode}`,
  );
}

export async function fetchLiveTraces(): Promise<LiveTraceSnapshot[]> {
  const out = await tryFetch<{ traces: LiveTraceSnapshot[] }>(`${API_BASE}/api/trace/live`);
  return out?.traces ?? [];
}

export async function fetchTwilioReadiness(): Promise<TwilioReadiness | null> {
  return tryFetch<TwilioReadiness>(`${API_BASE}/api/twilio/readiness`);
}

export { API_BASE };
