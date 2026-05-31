"use client";

import { Icon, Panel, PanelHead, Pill, useCountTo, IC } from "./ui";
import { TIMBRE, type TimbreLayer, type TimbreRepair, type TimbreMetric } from "./data";
import type { DemoReport, EvalRun, SponsorMode } from "@/lib/types";

/* ===== HeroSpeed ===== */
export function HeroSpeed({
  gen,
  liveLatencyMs,
  callRunning = false,
}: {
  gen: number;
  liveLatencyMs?: number | null;
  callRunning?: boolean;
}) {
  const D = TIMBRE.speed;
  const cur = D.generations[Math.min(gen, D.generations.length - 1)];
  const displayMs = liveLatencyMs ?? cur.ms;
  const ms = useCountTo(displayMs, [displayMs], 650);
  const first = D.generations[0].ms;
  const drop = Math.round((1 - displayMs / first) * 100);

  const W = 220, H = 56, pad = 6;
  const xs = D.generations.map(
    (_, i) => pad + (i * (W - pad * 2)) / (D.generations.length - 1)
  );
  const max = Math.max(...D.generations.map((g) => g.ms));
  const min = Math.min(...D.generations.map((g) => g.ms));
  const ys = D.generations.map(
    (g) =>
      pad +
      ((g.ms - min) / (max - min || 1)) * (H - pad * 2)
  );
  const pts = xs.map((x, i) => `${x},${ys[i]}`);
  const nearestLiveIndex =
    liveLatencyMs == null
      ? null
      : D.generations.reduce(
          (best, item, index) =>
            Math.abs(item.ms - liveLatencyMs) <
            Math.abs(D.generations[best].ms - liveLatencyMs)
              ? index
              : best,
          0,
        );
  const upto = nearestLiveIndex ?? Math.min(gen, D.generations.length - 1);
  const live = liveLatencyMs != null;

  return (
    <Panel
      className={`tb-hero tb-hero-speed tb-hero-speed-small ${
        live || callRunning ? "is-live" : ""
      }`}
      glow
    >
      <div className="tb-hero-grad" />
      <PanelHead
        icon={<Icon d={IC.bolt} size={16} />}
        accent="amber"
        title="Response Speed"
        sub={
          live
            ? "agent response latency, live call wired"
            : "first-response latency, optimised per generation"
        }
      />
      <div className="tb-speed-body">
        <div className="tb-speed-num">
          <span className="tb-bignum mono">
            {Math.round(ms)}
            <small>ms</small>
          </span>
          {live ? (
            <span className="tb-speed-sub">
              agent turn -{" "}
              <b className={drop >= 0 ? "mint" : "amber"}>
                {Math.abs(drop)}% {drop >= 0 ? "faster" : "slower"}
              </b>{" "}
              than baseline
            </span>
          ) : (
            <span className="tb-speed-sub">
            gen {cur.gen} · <b className="mint">{drop}% faster</b> than baseline
            </span>
          )}
        </div>
        <svg
          className="tb-spark"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="sparkg" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--coral)" />
              <stop offset="1" stopColor="var(--mint)" />
            </linearGradient>
          </defs>
          <polyline
            className="tb-spark-line"
            points={pts.slice(0, upto + 1).join(" ")}
            stroke="url(#sparkg)"
          />
          {xs.map((x, i) => (
            <circle
              key={i}
              cx={x}
              cy={ys[i]}
              r={i === upto ? 4 : 2.4}
              className={`tb-spark-dot ${i <= upto ? "on" : ""} ${
                i === upto ? "cur" : ""
              }`}
            />
          ))}
        </svg>
      </div>
    </Panel>
  );
}

/* ===== HeroReliability ===== */
export function HeroReliability({
  applied,
  report,
}: {
  applied: boolean;
  report: DemoReport | null;
}) {
  const R = TIMBRE.reliability;

  // Override with real data if available
  const metrics =
    report?.regression
      ? buildMetricsFromReport(report)
      : R.metrics;

  const decision = report?.regression
    ? decisionLabel(report.regression.promotion_decision)
    : R.decision;

  return (
    <Panel className="tb-hero tb-hero-rel" glow>
      <PanelHead
        icon={<Icon d={IC.shield} size={16} />}
        accent="mint"
        title="Reliability"
        sub="failed → repair → verified"
        right={
          <span className={`tb-promote ${applied ? "on" : ""}`}>
            {applied ? (
              <>
                <Icon d={IC.check} size={13} /> {decision}
              </>
            ) : (
              "PENDING"
            )}
          </span>
        }
      />
      <div className="tb-rel-grid">
        {metrics.map((m) => (
          <div key={m.label} className="tb-rel-row">
            <span className="tb-rel-lab">{m.label}</span>
            <span className="tb-rel-before mono">{m.before}</span>
            <Icon d={IC.arrowRight} size={12} />
            <span className={`tb-rel-after mono ${applied ? "on" : ""}`}>
              {applied ? m.after : "—"}
            </span>
            <span
              className={`tb-rel-delta mono ${m.good ? "good" : "warn"} ${
                applied ? "on" : ""
              }`}
            >
              {applied ? m.delta : ""}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function decisionLabel(decision?: string) {
  if (decision === "staging_pass") return "HUMAN REVIEW";
  if (decision === "promote") return "PROMOTE";
  return "HOLD";
}

function isPass(decision?: string) {
  return decision === "promote" || decision === "staging_pass";
}

function buildMetricsFromReport(report: DemoReport): TimbreMetric[] {
  const reg = report.regression;
  const m = reg.metrics || {};
  const intMetric = (key: string) => ({
    before: String(Math.round(m[key]?.before ?? 0)),
    after: String(Math.round(m[key]?.after ?? 0)),
  });
  const pctMetric = (key: string) => ({
    before: `${Math.round((m[key]?.before ?? 0) * 100)}%`,
    after: `${Math.round((m[key]?.after ?? 0) * 100)}%`,
  });

  const missed = intMetric("missed_escalation");
  const unsafe = intMetric("unsafe_events");
  const handoff = pctMetric("correct_handoff");
  const task = pctMetric("task_success");
  const tteBefore = Math.round(m["time_to_escalation_s"]?.before ?? 0);
  const tteAfter = Math.round(m["time_to_escalation_s"]?.after ?? 0);
  const pass = isPass(reg.promotion_decision);

  return [
    { label: "Missed escalation", before: missed.before, after: missed.after, delta: `−${missed.before}`, good: true },
    { label: "Unsafe responses", before: unsafe.before, after: unsafe.after, delta: `−${unsafe.before}`, good: true },
    { label: "Correct handoff", before: handoff.before, after: handoff.after, delta: "▲", good: true },
    { label: "Time to escalation", before: `${tteBefore}s`, after: `${tteAfter}s`, delta: `−${tteBefore - tteAfter}s`, good: true },
    { label: "Task success", before: task.before, after: task.after, delta: "▲", good: true },
    {
      label: "Patch status",
      before: "—",
      after: decisionLabel(reg.promotion_decision),
      delta: "staging",
      good: pass,
    },
  ];
}

/* ===== LayerRouter ===== */
export function LayerRouter({
  resolved,
  report,
}: {
  resolved: boolean;
  report: DemoReport | null;
}) {
  const R = TIMBRE.router;

  // Build layers from real data if available
  const layers = report?.failure_clusters?.length
    ? buildLayersFromReport(report)
    : R.layers;

  const failedLayer = layers.find((l) => l.failed)?.label ?? R.failedLayer;
  const secondaryLayer = layers.find((l) => l.secondary)?.label ?? R.secondary;

  return (
    <Panel className="tb-engine-router">
      <PanelHead
        icon={<Icon d={IC.branch} size={16} />}
        accent="sky"
        title="Layer Router"
        sub="diagnostic engine"
        right={<Pill tone="sky" soft>{R.model}</Pill>}
      />
      <div className="tb-router-body">
        <div className={`tb-failcard ${resolved ? "resolved" : ""}`}>
          <span className="tb-failcard-tag mono">
            {resolved ? "REPAIRED LAYER" : "FAILED LAYER"}
          </span>
          <span className="tb-failcard-name">{failedLayer}</span>
          <span className="tb-failcard-sec mono">
            Secondary: {secondaryLayer}
          </span>
          {resolved && (
            <span className="tb-failcard-badge">
              <Icon d={IC.check} size={14} /> verified clean
            </span>
          )}
        </div>
        <div className="tb-layerlist">
          <div className="tb-layerlist-head mono">
            <span>LAYER</span>
            <span>CONFIDENCE</span>
          </div>
          {layers.map((l) => (
            <div
              key={l.key}
              className={`tb-layerrow ${l.failed ? "failed" : ""} ${
                l.failed && resolved ? "fixed" : ""
              }`}
            >
              <span className="tb-layer-name">{l.label}</span>
              <span className="tb-layer-bar">
                <span className="tb-layer-track">
                  <span
                    className={`tb-layer-fill ${
                      l.failed && !resolved
                        ? "hot"
                        : l.failed && resolved
                        ? "good"
                        : ""
                    }`}
                    style={{ width: Math.round(l.conf * 100) + "%" }}
                  />
                </span>
                <span className="tb-layer-pct mono">
                  {Math.round(l.conf * 100)}%
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="tb-router-foot mono">
          <span>Confidence threshold</span>
          <span className="sky">{Math.round(R.threshold * 100)}%</span>
        </div>
      </div>
    </Panel>
  );
}

function buildLayersFromReport(report: DemoReport): TimbreLayer[] {
  const clusters = report.failure_clusters;
  const layerMap: Record<string, { conf: number; failed: boolean; secondary: boolean }> = {
    asr: { conf: 0.92, failed: false, secondary: false },
    safety: { conf: 0.95, failed: false, secondary: false },
    tool: { conf: 0.95, failed: false, secondary: false },
    reason: { conf: 0.95, failed: false, secondary: false },
    turn: { conf: 0.95, failed: false, secondary: false },
  };

  clusters.forEach((c, idx) => {
    const layer = c.failed_layer;
    const key = layer.includes("safety")
      ? "safety"
      : layer.includes("asr")
      ? "asr"
      : layer.includes("tool")
      ? "tool"
      : layer.includes("turn")
      ? "turn"
      : "reason";
    const freq = Math.min(1, c.frequency);
    layerMap[key] = {
      conf: Math.max(0.05, 1 - freq),
      failed: idx === 0,
      secondary: idx === 1,
    };
  });

  return TIMBRE.router.layers.map((l) => ({
    ...l,
    ...layerMap[l.key],
  }));
}

/* ===== RepairPatch ===== */
export function RepairPatch({
  compiledCount,
  onCompile,
  compiling,
  report,
}: {
  compiledCount: number;
  onCompile: () => void;
  compiling: boolean;
  report: DemoReport | null;
}) {
  const reps: TimbreRepair[] = report?.repair_pack?.artifacts?.length
    ? report.repair_pack.artifacts.map((a) => ({
        title: a.type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
        detail:
          (a.terms?.join(", ") ??
            a.rule ??
            a.tool ??
            JSON.stringify(a.detail).slice(0, 60)),
        layer: (a.provider ?? "asr").toLowerCase(),
      }))
    : TIMBRE.repairs;

  const allDone = compiledCount >= reps.length;

  return (
    <Panel className="tb-engine-repair">
      <PanelHead
        icon={<Icon d={IC.wrench} size={16} />}
        accent="violet"
        title="Repair Patch"
        sub="generated · concrete fixes"
        right={<LoopBadge active={compiling || allDone} />}
      />
      <div className="tb-repair-list">
        {reps.map((r, i) => {
          const done = i < compiledCount;
          return (
            <div key={i} className={`tb-repair ${done ? "done" : ""}`}>
              <span className={`tb-repair-ck ${done ? "on" : ""}`}>
                {done ? (
                  <Icon d={IC.check} size={13} />
                ) : (
                  <span className="tb-repair-num mono">{i + 1}</span>
                )}
              </span>
              <div className="tb-repair-tx">
                <span className="tb-repair-title">{r.title}</span>
                <span className="tb-repair-detail">{r.detail}</span>
              </div>
            </div>
          );
        })}
      </div>
      <button
        className={`tb-compile ${allDone ? "done" : ""}`}
        onClick={onCompile}
        disabled={compiling}
      >
        {allDone ? (
          <>
            <Icon d={IC.check} size={14} /> Patch compiled
          </>
        ) : compiling ? (
          "Compiling…"
        ) : (
          <>
            <Icon d={IC.wrench} size={14} /> Compile repair
          </>
        )}
      </button>
    </Panel>
  );
}

/* ===== CekuraPipeline ===== */
export function CekuraPipeline({
  report,
  mode,
  busy,
  onRun,
}: {
  report: DemoReport | null;
  mode: SponsorMode;
  busy: boolean;
  onRun: () => void | Promise<void>;
}) {
  const baseline = evalSummary(report?.baseline_eval);
  const regression = evalSummary(report?.regression_eval);
  const cekuraProof = report?.sponsor_proof?.sponsors?.cekura;
  const baselineRunId =
    report?.baseline_eval?.cekura_run_id ??
    cekuraProof?.proof?.baseline_run_id ??
    "cek_base_demo_001";
  const regressionRunId =
    report?.regression_eval?.cekura_run_id ??
    cekuraProof?.proof?.regression_run_id ??
    "cek_reg_demo_001";
  const agentId = cekuraProof?.proof?.agent_id ?? "fixture-agent";
  const apiUrl = cekuraProof?.proof?.api_url ?? "https://api.cekura.ai";
  const primaryCluster = report?.failure_clusters?.[0];
  const generatedEvalIds =
    report?.repair_pack?.generated_eval_ids?.length
      ? report.repair_pack.generated_eval_ids
      : ["eval_vague_risk_001", "eval_denial_after_disclosure_003", "eval_anti_escalation_pressure_006"];
  const generatedTitles =
    report?.generated_scenarios?.length
      ? report.generated_scenarios.slice(0, 4).map((s) => s.title)
      : generatedEvalIds.slice(0, 4);
  const repairArtifacts =
    report?.repair_pack?.artifacts?.length
      ? report.repair_pack.artifacts.map((artifact) => ({
          title: artifact.type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
          detail:
            artifact.terms?.join(", ") ??
            artifact.rule ??
            artifact.tool ??
            (JSON.stringify(artifact.detail) ?? "").slice(0, 72),
        }))
      : TIMBRE.repairs.map((repair) => ({ title: repair.title, detail: repair.detail }));
  const promoted = isPass(report?.regression?.promotion_decision);
  const decision = report ? decisionLabel(report.regression?.promotion_decision) : "READY";

  const stages = [
    {
      step: "01",
      title: "Ingress trace",
      detail: "Daily, Twilio, or Pipecat produces the normalized CallTrace that failed.",
      proof: report?.trace?.call_id ?? TIMBRE.baseline.callId,
      stat: report?.trace?.source ?? TIMBRE.baseline.source,
      tone: "sky",
    },
    {
      step: "02",
      title: "Cekura baseline",
      detail: "Cekura scores the crisis agent's safety protocol before any patch.",
      proof: baselineRunId,
      stat: `${baseline.passed}/${baseline.total || 10} pass`,
      tone: "coral",
    },
    {
      step: "03",
      title: "Failure routing",
      detail: primaryCluster?.judge_story ?? "The caller was in danger and the agent failed to escalate.",
      proof: primaryCluster?.failed_layer ?? TIMBRE.router.failedLayer,
      stat: primaryCluster ? `${primaryCluster.frequency} hits` : "root cause",
      tone: "amber",
    },
    {
      step: "04",
      title: "Repair compiler",
      detail: "Forge turns failure evidence into deployable agent patches.",
      proof: report?.repair_pack?.repair_id ?? "repair_demo_001",
      stat: `${repairArtifacts.length} patches`,
      tone: "violet",
    },
    {
      step: "05",
      title: "Generated evals",
      detail: "New Cekura scenarios are written from the failure so the next agent gets a harder test.",
      proof: generatedEvalIds.join(", "),
      stat: `${generatedEvalIds.length} evals`,
      tone: "sky",
    },
    {
      step: "06",
      title: "Cekura regression",
      detail: "The repaired agent must pass the full suite without safety or latency regression.",
      proof: regressionRunId,
      stat: `${regression.passed}/${regression.total || 10} pass`,
      tone: "mint",
    },
  ];

  return (
    <Panel className="tb-cekura-page" glow>
      <div className="tb-cekura-hero">
        <div className="tb-cekura-title">
          <span className="tb-cekura-kicker mono">Cekura pipeline</span>
          <h2>Self-improving agent cycle</h2>
          <p>
            Baseline eval, failure routing, repair artifacts, generated scenarios, and
            regression gate run as one closed loop around the voice agent.
          </p>
        </div>

        <div className="tb-cekura-actions">
          <span className={`tb-sponsor-mode ${mode}`}>{mode}</span>
          <span className={`tb-cekura-decision ${promoted ? "promote" : "hold"}`}>
            {decision}
          </span>
          <button
            type="button"
            className="tb-cekura-run"
            onClick={() => {
              void onRun();
            }}
            disabled={busy}
          >
            <Icon d={busy ? IC.loop : IC.play} size={14} fill={!busy} />
            {busy ? "Running Cekura..." : "Run Cekura loop"}
          </button>
        </div>
      </div>

      <div className="tb-cekura-grid">
        <div className="tb-cekura-timeline" aria-label="Cekura self-improvement pipeline">
          {stages.map((stage, index) => (
            <div key={stage.step} className={`tb-cekura-step ${stage.tone}`}>
              <span className="tb-cekura-node mono">{stage.step}</span>
              {index < stages.length - 1 && <span className="tb-cekura-line" />}
              <div className="tb-cekura-step-main">
                <div className="tb-cekura-step-head">
                  <b>{stage.title}</b>
                  <span className="mono">{stage.stat}</span>
                </div>
                <p>{stage.detail}</p>
                <code>{stage.proof}</code>
              </div>
            </div>
          ))}
        </div>

        <aside className="tb-cekura-rail">
          <div className="tb-cekura-agent">
            <div>
              <span className="mono">agent under test</span>
              <b>{agentId}</b>
            </div>
            <div>
              <span className="mono">results endpoint</span>
              <b>{apiUrl}</b>
            </div>
          </div>

          <div className="tb-cekura-metrics">
            <Metric label="Task success" value={metricPair(report, "task_success", formatPct, "30% -> 80%")} />
            <Metric label="Missed escalation" value={metricPair(report, "missed_escalation", formatInt, "4 -> 0")} />
            <Metric label="Correct handoff" value={metricPair(report, "correct_handoff", formatPct, "30% -> 90%")} />
            <Metric label="Time to escalation" value={metricPair(report, "time_to_escalation_s", formatSeconds, "95s -> 22s")} />
          </div>

          <div className="tb-cekura-feed">
            <PanelHead
              icon={<Icon d={IC.wrench} size={15} />}
              accent="violet"
              title="What feeds back"
              sub="patches and harder evals"
            />
            <div className="tb-cekura-feed-list">
              {repairArtifacts.slice(0, 4).map((artifact) => (
                <div key={artifact.title} className="tb-cekura-feed-row">
                  <b>{artifact.title}</b>
                  <span>{artifact.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="tb-cekura-generated">
            <span className="mono">generated Cekura scenarios</span>
            <div>
              {generatedTitles.map((title) => (
                <Pill key={title} tone="sky" soft>
                  {title}
                </Pill>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </Panel>
  );
}

function evalSummary(run?: EvalRun | null) {
  const rows = run?.scenario_results ?? [];
  const passed = rows.filter((row) => row.passed).length;
  return { passed, total: rows.length };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="tb-cekura-metric">
      <span>{label}</span>
      <b className="mono">{value}</b>
    </div>
  );
}

function metricPair(
  report: DemoReport | null,
  key: string,
  formatter: (value: number) => string,
  fallback: string,
) {
  const metric = report?.regression?.metrics?.[key];
  if (!metric) return fallback;
  return `${formatter(metric.before)} -> ${formatter(metric.after)}`;
}

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatInt(value: number) {
  return String(Math.round(value));
}

function formatMs(value: number) {
  return `${Math.round(value)}ms`;
}

function formatSeconds(value: number) {
  return `${Math.round(value)}s`;
}

/* ===== LoopBadge ===== */
export function LoopBadge({ active }: { active: boolean }) {
  return (
    <span className={`tb-loop ${active ? "spin" : ""}`} title="Self-improving loop">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {(IC.loop as string[]).map((p, i) => <path key={i} d={p} />)}
      </svg>
    </span>
  );
}

/* ===== SponsorStripTimbre ===== */
export function SponsorStripTimbre({
  report,
  onSponsorClick,
}: {
  report: DemoReport | null;
  onSponsorClick?: (key: string) => void;
}) {
  const sponsors = report?.sponsor_proof?.sponsors
    ? Object.entries(report.sponsor_proof.sponsors).map(([key, val]) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        role: (val as any).proof?.media_state ?? val.mode,
        mode: val.mode as "fixture" | "live",
      }))
    : TIMBRE.sponsors;

  return (
    <div className="tb-sponsors">
      {sponsors.map((s) => (
        <button
          key={s.key}
          type="button"
          className="tb-sponsor"
          onClick={() => onSponsorClick?.(s.key)}
          title={s.key === "cekura" ? "Open Cekura self-improvement loop" : "Open sponsor proof"}
        >
          <b>{s.label}</b>
          <span className="tb-sponsor-role">{s.role}</span>
          <span className={`tb-sponsor-mode ${s.mode}`}>{s.mode}</span>
        </button>
      ))}
    </div>
  );
}
