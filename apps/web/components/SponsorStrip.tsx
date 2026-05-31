"use client";

import { SPONSOR_ORDER, type SponsorProof } from "@/lib/types";
import { ModeBadge, StatusDot } from "./ui";

const SPONSOR_META: Record<string, { label: string; role: string }> = {
  daily: { label: "Daily", role: "Realtime AI media" },
  pipecat: { label: "Pipecat", role: "Agent pipeline" },
  cekura: { label: "Cekura", role: "Eval loop" },
  twilio: { label: "Twilio", role: "PSTN telephony" },
  nvidia: { label: "NVIDIA", role: "ASR/guardrail repair" },
  aws: { label: "AWS", role: "Persistence" },
};

function proofLine(name: string, proof: Record<string, any>): string {
  switch (name) {
    case "daily": {
      const url = proof.session_url || proof.session_id || "—";
      return proof.backed_by ? `${url}  ·  via ${proof.backed_by}` : url;
    }
    case "pipecat":
      return `${proof.pipeline_id} · ${proof.frame_count ?? "?"} frames · p95 ${proof.p95_frame_latency_ms ?? "?"}ms${proof.pipecat_cloud ? " · cloud" : ""}`;
    case "cekura":
      return `${proof.baseline_run_id ?? "—"} / ${proof.regression_run_id ?? "—"}`;
    case "twilio":
      // After a real call: SID/stream. Liveness-only: account + number.
      return proof.call_sid
        ? `${proof.call_sid} · ${proof.stream_sid ?? "—"}`
        : `${proof.phone_number || "no number"} · ${proof.account_sid ?? "—"}`;
    case "nvidia":
      return proof.artifact_path || proof.artifact_type || "—";
    case "aws":
      return proof.eval_report_object || proof.s3_bucket || "—";
    default:
      return "—";
  }
}

export function SponsorStrip({ proof }: { proof: SponsorProof }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {SPONSOR_ORDER.map((name) => {
        const c = proof.sponsors[name];
        const meta = SPONSOR_META[name];
        if (!c) {
          return (
            <div key={name} className="panel-2 px-3 py-2 opacity-60">
              <div className="text-[12px] font-semibold">{meta.label}</div>
              <div className="mono text-[10px] text-[var(--color-bad)]">ADAPTER ABSENT</div>
            </div>
          );
        }
        return (
          <div key={name} className="panel-2 flex flex-col gap-1 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <StatusDot status={c.status} live={c.mode === "live" && c.status === "ready"} />
                <span className="text-[12px] font-semibold">{meta.label}</span>
              </div>
              <ModeBadge mode={c.mode} />
            </div>
            <div className="mono text-[9px] uppercase tracking-wider text-[var(--color-faint)]">
              {meta.role}
            </div>
            <div
              className="mono truncate text-[10px] text-[var(--color-muted)]"
              title={proofLine(name, c.proof)}
            >
              {proofLine(name, c.proof)}
            </div>
            {c.credential_state !== "present" && (
              <div className="mono text-[9px] text-[var(--color-warn)]">
                creds: {c.credential_state}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
