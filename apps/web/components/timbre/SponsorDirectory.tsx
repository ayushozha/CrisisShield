"use client";

import { Icon, Panel, PanelHead, Pill, IC } from "./ui";
import type { AdapterContract, DemoReport, SponsorMode } from "@/lib/types";
import { SPONSOR_ORDER } from "@/lib/types";

type SponsorDirectoryProps = {
  contracts: Record<string, AdapterContract> | null;
  report: DemoReport | null;
  requestedMode: SponsorMode;
};

const SPONSOR_META: Record<
  string,
  {
    label: string;
    icon: string | string[];
    accent: string;
    role: string;
    usedFor: string;
    demoBeat: string;
    proofKeys: string[];
  }
> = {
  daily: {
    label: "Daily",
    icon: IC.waveform,
    accent: "violet",
    role: "Realtime AI media",
    usedFor: "Daily is the browser/mobile realtime call surface. It proves media state, joining, interruption handling, and the Daily transport feeding the normalized trace.",
    demoBeat: "Start here for the live caller moment.",
    proofKeys: ["session_url", "media_state", "live_call_id", "interruption_events"],
  },
  pipecat: {
    label: "Pipecat",
    icon: IC.layers,
    accent: "sky",
    role: "Voice agent pipeline",
    usedFor: "Pipecat carries the transport, ASR, LLM, TTS, turn-taking, and trace hooks used by both Daily and Twilio surfaces.",
    demoBeat: "Use this as the bridge from audio to reliability telemetry.",
    proofKeys: ["pipeline_id", "transport", "frame_count", "p95_frame_latency_ms"],
  },
  cekura: {
    label: "Cekura",
    icon: IC.beaker,
    accent: "mint",
    role: "Evaluation loop",
    usedFor: "Cekura runs the baseline failure suite and the post-repair regression gate, producing the before/after run IDs the demo promotes from.",
    demoBeat: "Use this when explaining why the repair is measurable.",
    proofKeys: ["baseline_run_id", "regression_run_id", "suite", "agent_id"],
  },
  twilio: {
    label: "Twilio",
    icon: IC.plug,
    accent: "amber",
    role: "PSTN telephony",
    usedFor: "Twilio proves real phone-network ingress through Programmable Voice and Media Streams, then normalizes into the same CallTrace contract.",
    demoBeat: "Use this as the phone-call proof, separate from Daily.",
    proofKeys: ["call_sid", "stream_sid", "phone_number", "stream_status"],
  },
  nvidia: {
    label: "NVIDIA",
    icon: IC.shield,
    accent: "violet",
    role: "ASR and guardrail repair target",
    usedFor: "NVIDIA is where the repair becomes model-facing: ASR vocabulary boosts, Nemotron/NIM routing metadata, and NeMo guardrail policy artifacts.",
    demoBeat: "Use this when showing the generated repair is deployable.",
    proofKeys: ["artifact_path", "artifact_type", "mode_detail"],
  },
  aws: {
    label: "AWS",
    icon: IC.history,
    accent: "sky",
    role: "Persistence and artifact store",
    usedFor: "AWS stores trace, eval report, repair pack, sponsor proof, and run index records so the demo has production-shaped artifacts.",
    demoBeat: "Use this at the end as the audit trail.",
    proofKeys: ["trace_object", "eval_report_object", "repair_pack_object", "sponsor_proof_object"],
  },
};

const FLOW = [
  { label: "Daily", copy: "Realtime session" },
  { label: "Twilio", copy: "PSTN stream" },
  { label: "Pipecat", copy: "Agent pipeline" },
  { label: "Cekura", copy: "Baseline and regression" },
  { label: "NVIDIA", copy: "Repair artifact" },
  { label: "AWS", copy: "Persisted proof" },
];

export function SponsorDirectory({
  contracts,
  report,
  requestedMode,
}: SponsorDirectoryProps) {
  const readyCount = SPONSOR_ORDER.filter((key) => sponsorContract(key, contracts, report)).length;

  return (
    <Panel className="tb-sponsor-page" glow>
      <PanelHead
        icon={<Icon d={IC.plug} size={16} />}
        accent="amber"
        title="Sponsors"
        sub="demo usage map and adapter proof"
        right={
          <>
            <Pill tone="violet">{requestedMode}</Pill>
            <Pill tone={readyCount === SPONSOR_ORDER.length ? "mint" : "coral"}>
              {readyCount}/{SPONSOR_ORDER.length} wired
            </Pill>
          </>
        }
      />

      <div className="tb-sponsor-flow" aria-label="Sponsor demo flow">
        {FLOW.map((step, index) => (
          <div key={step.label} className="tb-sponsor-flow-step">
            <span className="tb-sponsor-flow-num mono">{index + 1}</span>
            <b>{step.label}</b>
            <span>{step.copy}</span>
          </div>
        ))}
      </div>

      <div className="tb-sponsor-grid">
        {SPONSOR_ORDER.map((key) => {
          const meta = SPONSOR_META[key];
          const contract = sponsorContract(key, contracts, report);
          return (
            <article key={key} className="tb-sponsor-card">
              <header className="tb-sponsor-card-head">
                <span className={`tb-sponsor-bigic tb-ic-${meta.accent}`}>
                  <Icon d={meta.icon} size={17} />
                </span>
                <span className="tb-sponsor-card-title">
                  <b>{meta.label}</b>
                  <small>{meta.role}</small>
                </span>
                <span className={`tb-sponsor-state ${statusTone(contract?.status)}`}>
                  {contract?.status ?? "missing"}
                </span>
              </header>

              <p className="tb-sponsor-used">{meta.usedFor}</p>

              <div className="tb-sponsor-mode-row">
                <span className={`tb-sponsor-mode ${contract?.mode ?? "fixture"}`}>
                  {contract?.mode ?? "fixture"}
                </span>
                <span className={`tb-sponsor-cred ${credentialTone(contract?.credential_state)}`}>
                  {contract?.credential_state ?? "missing"} credential
                </span>
              </div>

              <div className="tb-sponsor-demo-beat">
                <span className="mono">DEMO BEAT</span>
                <p>{meta.demoBeat}</p>
              </div>

              <div className="tb-sponsor-proof-list">
                {proofRows(meta.proofKeys, contract).map((row) => (
                  <div key={row.key} className="tb-sponsor-proof-row">
                    <span className="mono">{row.key}</span>
                    <b>{row.value}</b>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function sponsorContract(
  key: string,
  contracts: Record<string, AdapterContract> | null,
  report: DemoReport | null,
) {
  return contracts?.[key] ?? report?.sponsor_proof?.sponsors?.[key] ?? null;
}

function proofRows(keys: string[], contract: AdapterContract | null) {
  if (!contract) {
    return [{ key: "proof", value: "not reported" }];
  }
  const rows = keys
    .map((key) => ({ key, value: formatProofValue(contract.proof?.[key]) }))
    .filter((row) => row.value.length > 0);
  return rows.length ? rows : [{ key: "proof", value: contract.note ?? "ready" }];
}

function formatProofValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    return "object";
  }
  return String(value);
}

function statusTone(status: AdapterContract["status"] | undefined) {
  if (status === "ready") return "ready";
  if (status === "degraded") return "degraded";
  return "failed";
}

function credentialTone(state: AdapterContract["credential_state"] | undefined) {
  if (state === "present") return "present";
  if (state === "placeholder") return "placeholder";
  return "missing";
}
