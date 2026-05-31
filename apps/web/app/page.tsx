"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCachedReport, fetchLatestReport, fetchLiveTraces, fetchSponsors, fetchTwilioReadiness, runDemo } from "@/lib/api";
import type { AdapterContract, CallTrace, DemoReport, LiveTraceSnapshot, SponsorMode, TwilioReadiness } from "@/lib/types";
import { Icon, IC } from "@/components/timbre/ui";
import { TIMBRE } from "@/components/timbre/data";
import type { TimbreDataset } from "@/components/timbre/data";
import { LiveCall } from "@/components/timbre/LiveCall";
import { ConversationHistory } from "@/components/timbre/ConversationHistory";
import { SponsorDirectory } from "@/components/timbre/SponsorDirectory";
import { datasetSurfaceKey, traceToTimbreDataset } from "@/components/timbre/trace";
import {
  CekuraPipeline,
  HeroSpeed,
  HeroReliability,
  LayerRouter,
  RepairPatch,
  SponsorStripTimbre,
} from "@/components/timbre/Engine";

/* ---- nav items ---- */
const NAV = [
  { key: "live", label: "Live Call", icon: IC.waveform },
  { key: "router", label: "Layer Router", icon: IC.branch },
  { key: "repair", label: "Repair Patch", icon: IC.wrench },
  { key: "evals", label: "Cekura Loop", icon: IC.beaker },
  { key: "runs", label: "Runs", icon: IC.loop },
  { key: "history", label: "History", icon: IC.history },
  { key: "sponsors", label: "Sponsors", icon: IC.plug },
];

export default function Dashboard() {
  /* ---- API state ---- */
  const [report, setReport] = useState<DemoReport | null>(null);
  const [liveTraces, setLiveTraces] = useState<LiveTraceSnapshot[]>([]);
  const [twilioReadiness, setTwilioReadiness] = useState<TwilioReadiness | null>(null);
  const [sponsorContracts, setSponsorContracts] = useState<Record<string, AdapterContract> | null>(null);
  const [sponsorMode, setSponsorMode] = useState<SponsorMode>("fixture");
  const [busy, setBusy] = useState(false);

  /* ---- UI state ---- */
  const [collapsed, setCollapsed] = useState(false);
  const [nav, setNav] = useState("live");
  const [aurora, setAurora] = useState(true);

  /* ---- run state machine ---- */
  const [mode, setMode] = useState<"baseline" | "repaired">("baseline");
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const [callDone, setCallDone] = useState(false);
  const [compiledCount, setCompiledCount] = useState(0);
  const [compiling, setCompiling] = useState(false);
  const [gen, setGen] = useState(0);
  const [activeAgentLatencyMs, setActiveAgentLatencyMs] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);
  const [selectedSurfaceKey, setSelectedSurfaceKey] = useState<string | null>(null);

  /* ---- load from API ---- */
  const loadReport = useCallback(async (demoMode: SponsorMode) => {
    try {
      const { report } =
        demoMode === "fixture"
          ? await fetchCachedReport()
          : await fetchLatestReport();
      if (
        demoMode === "live" &&
        report.mode !== "live" &&
        !report.run_id.startsWith("live_")
      ) {
        setReport(null);
        return null;
      }
      setReport(report);
      return report;
    } catch {
      /* stay with null — panels will use TIMBRE demo data */
      if (demoMode === "live") setReport(null);
      return null;
    }
  }, []);

  useEffect(() => { void loadReport(sponsorMode); }, [loadReport, sponsorMode]);

  const loadSponsorContracts = useCallback(async () => {
    const out = await fetchSponsors(sponsorMode);
    setSponsorContracts(out?.sponsors ?? null);
  }, [sponsorMode]);

  useEffect(() => { loadSponsorContracts(); }, [loadSponsorContracts]);

  const loadLiveTraces = useCallback(async () => {
    const traces = await fetchLiveTraces();
    setLiveTraces(traces.filter((item) => item.trace.turns.length > 0));
  }, []);

  const loadTwilioReadiness = useCallback(async () => {
    const readiness = await fetchTwilioReadiness();
    setTwilioReadiness(readiness);
    return readiness;
  }, []);

  useEffect(() => {
    if (sponsorMode !== "live") {
      setLiveTraces([]);
      setTwilioReadiness(null);
      return;
    }
    loadLiveTraces();
    loadTwilioReadiness();
    const id = window.setInterval(loadLiveTraces, 1500);
    return () => window.clearInterval(id);
  }, [loadLiveTraces, loadTwilioReadiness, sponsorMode]);

  useEffect(() => {
    if (sponsorMode !== "live") return;
    const id = window.setInterval(loadTwilioReadiness, 5000);
    return () => window.clearInterval(id);
  }, [loadTwilioReadiness, sponsorMode]);

  useEffect(() => {
    if (sponsorMode !== "live") return;
    const id = window.setInterval(() => void loadReport("live"), 4000);
    return () => window.clearInterval(id);
  }, [loadReport, sponsorMode]);

  /* ---- run handlers ---- */
  function runBaseline() {
    setMode("baseline");
    setApplied(false);
    setGen(0);
    setActiveAgentLatencyMs(null);
    setCallDone(false);
    setPlaying(true);
    setRunId((n) => n + 1);
  }

  function runRepaired() {
    setMode("repaired");
    setGen((g) => Math.min(g + 1, TIMBRE.speed.generations.length - 1));
    setActiveAgentLatencyMs(null);
    setCallDone(false);
    setPlaying(true);
    setRunId((n) => n + 1);
  }

  function onDone() {
    setPlaying(false);
    setCallDone(true);
    if (mode === "repaired") setApplied(true);
  }

  function compile() {
    if (compiling || compiledCount >= TIMBRE.repairs.length) return;
    setCompiling(true);
    const total = TIMBRE.repairs.length;
    let i = 0;
    const tick = () => {
      i += 1;
      setCompiledCount(i);
      if (i < total) setTimeout(tick, 420);
      else setCompiling(false);
    };
    setTimeout(tick, 250);
  }

  function resetRunState() {
    setPlaying(false);
    setMode("baseline");
    setCallDone(false);
    setCompiledCount(0);
    setCompiling(false);
    setGen(0);
    setActiveAgentLatencyMs(null);
    setApplied(false);
    setRunId((n) => n + 1);
  }

  async function reset() {
    resetRunState();
    if (sponsorMode === "fixture") {
      await loadReport("fixture");
    } else {
      setSelectedSurfaceKey(null);
      await Promise.all([loadLiveTraces(), loadTwilioReadiness()]);
    }
  }

  function onModeChange(nextMode: SponsorMode) {
    if (nextMode === sponsorMode) return;
    setSponsorMode(nextMode);
    setSelectedSurfaceKey(null);
    if (nextMode === "fixture") setLiveTraces([]);
    resetRunState();
  }

  async function runLiveCall() {
    if (busy) return;
    setBusy(true);
    setPlaying(false);
    setMode("baseline");
    setCallDone(false);
    setActiveAgentLatencyMs(null);
    setSelectedSurfaceKey(null);
    try {
      await Promise.all([loadTwilioReadiness(), loadLiveTraces(), loadReport("live")]);
    } catch { /* ignore */ }
    setBusy(false);
  }

  async function runCekuraLoop() {
    if (busy) return;
    setBusy(true);
    setPlaying(false);
    setSelectedSurfaceKey(null);
    try {
      const r = await runDemo(sponsorMode);
      if (r) {
        setReport(r);
        setCallDone(true);
        setApplied(r.regression?.promotion_decision === "promote");
        setMode("repaired");
      }
      await loadSponsorContracts();
      if (sponsorMode === "live") await Promise.all([loadLiveTraces(), loadTwilioReadiness()]);
    } catch { /* ignore */ }
    setBusy(false);
  }

  const compiled = compiledCount >= TIMBRE.repairs.length;
  const liveMode = sponsorMode === "live";
  const liveWaitingDataset = useMemo<TimbreDataset>(() => {
    const latestCall = twilioReadiness?.latest_call;
    const latestStream = twilioReadiness?.streams.latest;
    return {
      callId: latestStream?.call_sid || latestCall?.sid || "waiting_for_twilio_call",
      source: "twilio",
      transport: "Twilio Media Streams",
      scenario: "crisis_escalation_001",
      turns: [],
    };
  }, [twilioReadiness]);
  const liveDatasets = useMemo(
    () => liveMode ? liveTraces.map((item) => traceToTimbreDataset(item.trace)) : [],
    [liveMode, liveTraces],
  );
  const reportDatasets = useMemo(() => {
    if (!report) return [];
    return [report.trace, report.secondary_trace]
      .filter((trace): trace is CallTrace => Boolean(trace?.turns.length))
      .map((trace) => traceToTimbreDataset(trace));
  }, [report]);
  const externalLive = liveMode && liveDatasets.length > 0;
  const callSurfaces =
    liveMode
      ? liveDatasets
      : reportDatasets;
  const fallbackDataset = liveMode
    ? liveWaitingDataset
    : mode === "repaired"
    ? TIMBRE.repaired
    : TIMBRE.baseline;
  const historySurfaces = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof liveDatasets = [];
    const source = liveMode
      ? [...liveDatasets, ...reportDatasets]
      : [...reportDatasets, TIMBRE.baseline, TIMBRE.repaired];
    for (const item of source) {
      const key = datasetSurfaceKey(item);
      if (seen.has(key) || item.turns.length === 0) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [liveDatasets, liveMode, reportDatasets]);
  const selectedDataset =
    historySurfaces.find((item) => datasetSurfaceKey(item) === selectedSurfaceKey) ??
    callSurfaces[0] ??
    fallbackDataset;
  const activeSurfaceKey = callSurfaces.length ? datasetSurfaceKey(selectedDataset) : undefined;
  const liveStatusByKey = useMemo(() => {
    return new Map(
      liveTraces.map((item) => [
        datasetSurfaceKey(traceToTimbreDataset(item.trace)),
        item.status,
      ]),
    );
  }, [liveTraces]);
  const liveStatus = activeSurfaceKey ? liveStatusByKey.get(activeSurfaceKey) : undefined;
  const twilioLiveStatus =
    liveStatus ||
    twilioReadiness?.streams.latest?.status ||
    twilioReadiness?.latest_call?.status ||
    undefined;

  useEffect(() => {
    if (callSurfaces.length === 0) return;
    setSelectedSurfaceKey((current) =>
      current && callSurfaces.some((item) => datasetSurfaceKey(item) === current)
        ? current
        : datasetSurfaceKey(callSurfaces[0]),
    );
  }, [callSurfaces]);

  /* ---- run button label ---- */
  const runLabel = playing
    ? "Running…"
    : busy
    ? "Checking..."
    : liveMode
    ? "Check live call"
    : !callDone
    ? "Run cached demo"
    : compiled
    ? "Re-run repaired"
    : "Run cached demo";

  function onRunBtn() {
    if (playing || busy) return;
    if (liveMode) {
      void runLiveCall();
      return;
    }
    if (!callDone || !compiled) runBaseline();
    else runRepaired();
  }

  const modeHelp =
    sponsorMode === "fixture"
      ? "Fixture mode replays the cached demo flow."
      : "Live mode shows only real Twilio streams and live traces.";

  return (
    <div
      className={`tb-shell ${collapsed ? "collapsed" : ""} ${aurora ? "aurora-on" : ""}`}
      data-density="regular"
    >
      {/* ======== Sidebar ======== */}
      <aside className="tb-side">
        <div className="tb-brand">
          <span className="tb-logo">
            <Icon d={IC.waveform} size={18} />
          </span>
          {!collapsed && (
            <span className="tb-brand-tx">
              <b>Timbre</b>
              <small>voice reliability</small>
            </span>
          )}
        </div>

        <nav className="tb-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`tb-navitem ${nav === n.key ? "on" : ""}`}
              onClick={() => setNav(n.key)}
              title={n.label}
            >
              <span className="tb-navic">
                <Icon d={n.icon} size={18} />
              </span>
              {!collapsed && <span>{n.label}</span>}
              {nav === n.key && <span className="tb-navmark" />}
            </button>
          ))}
        </nav>

        <div className="tb-side-foot">
          <button
            className={`tb-navitem ${nav === "settings" ? "on" : ""}`}
            onClick={() => setNav("settings")}
            title="Settings"
          >
            <span className="tb-navic">
              <Icon d={IC.gear} size={18} />
            </span>
            {!collapsed && <span>Settings</span>}
          </button>
          {!collapsed && (
            <div className="tb-user">
              <span className="tb-ava">OJ</span>
              <span className="tb-user-tx">
                <b>Ops console</b>
                <small>{sponsorMode} mode</small>
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* ======== Main ======== */}
      <div className="tb-mainwrap">
        {/* Top nav */}
        <header className="tb-topnav">
          <button
            className="tb-iconbtn"
            onClick={() => setCollapsed((c) => !c)}
            title="Toggle sidebar"
          >
            <Icon d={IC.collapse} size={18} />
          </button>

          <div className="tb-crumb">
            <span>Sessions</span>
            <Icon d={IC.chevron} size={14} />
            <span className="tb-crumb-2">Crisis escalation · #001</span>
          </div>

          <label className="tb-search">
            <Icon d={IC.search} size={15} />
            <input placeholder="Search calls, layers, repairs…" />
            <span className="tb-kbd mono">⌘K</span>
          </label>

          <div className="tb-modeswitch mono" title={modeHelp} aria-label={modeHelp}>
            {(["fixture", "live"] as const).map((m) => (
              <button
                key={m}
                className={sponsorMode === m ? "on" : ""}
                onClick={() => onModeChange(m)}
                aria-pressed={sponsorMode === m}
                title={m === "fixture" ? "Cached demo flow" : "Live call demo"}
              >
                {m}
              </button>
            ))}
          </div>

          <button className="tb-iconbtn" title="Notifications">
            <Icon d={IC.bell} size={17} />
            <span className="tb-notif" />
          </button>

          <button
            className="tb-ghostbtn"
            onClick={reset}
            title="Reset demo"
          >
            <Icon d={IC.loop} size={15} />
          </button>

          <button
            className="tb-ghostbtn"
            onClick={() => setAurora((a) => !a)}
            title="Toggle aurora"
            style={{ marginRight: 4 }}
          >
            <Icon d={IC.spark} size={15} />
          </button>

          <button
            className="tb-runbtn"
            onClick={onRunBtn}
            disabled={playing || busy}
          >
            <Icon d={IC.play} size={14} fill />
            {runLabel}
          </button>
        </header>

        {/* Content */}
        <main className="tb-content">
          {nav === "history" ? (
            <ConversationHistory
              conversations={historySurfaces}
              selectedKey={selectedSurfaceKey}
              liveStatusByKey={liveStatusByKey}
              onSelect={setSelectedSurfaceKey}
              onOpen={(key) => {
                setSelectedSurfaceKey(key);
                setNav("live");
              }}
            />
          ) : nav === "evals" ? (
            <CekuraPipeline
              report={report}
              mode={sponsorMode}
              busy={busy}
              onRun={runCekuraLoop}
            />
          ) : nav === "sponsors" ? (
            <SponsorDirectory
              contracts={sponsorContracts}
              report={report}
              requestedMode={sponsorMode}
            />
          ) : (
            <>
              {/* Live call + thinking rail */}
              <LiveCall
                dataset={selectedDataset}
                surfaces={callSurfaces}
                runId={runId}
                playing={playing}
                autoShow={externalLive}
                liveStatus={twilioLiveStatus}
                liveReadiness={twilioReadiness}
                speedMul={1}
                onDone={onDone}
                onAgentLatency={setActiveAgentLatencyMs}
                demoMode={sponsorMode}
                repaired={mode === "repaired"}
              />

          {/* Live metrics */}
          <div className="tb-row tb-row-hero tb-row-metrics">
            <HeroSpeed
              gen={gen}
              liveLatencyMs={activeAgentLatencyMs}
              callRunning={playing}
            />
            <HeroReliability applied={applied} report={report} />
          </div>

          {/* Engine section */}
          <div className="tb-section-label">
            <span className="tb-sec-line" />
            <span className="tb-sec-tx">
              <Icon d={IC.layers} size={14} />
              THE ENGINE · diagnose → repair → verify
            </span>
            <span className="tb-sec-line" />
          </div>

          <div className="tb-row tb-row-engine">
            <LayerRouter resolved={applied} report={report} />
            <RepairPatch
              compiledCount={compiledCount}
              onCompile={compile}
              compiling={compiling}
              report={report}
            />
          </div>

          {/* Sponsor strip */}
          <SponsorStripTimbre
            report={report}
            onSponsorClick={(key) => setNav(key === "cekura" ? "evals" : "sponsors")}
          />

          {/* Footer */}
          <footer
            style={{
              fontSize: "10.5px",
              color: "var(--ink-faint)",
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 8,
              fontFamily: "var(--mono)",
            }}
          >
            <span>
              Timbre · scenario crisis_escalation_001 ·{" "}
              {report
                ? `run ${report.run_id}`
                : "demo mode"}
            </span>
            {report && (
              <span>
                {new Date(report.created_at).toLocaleString()}
              </span>
            )}
          </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
