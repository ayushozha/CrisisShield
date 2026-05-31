"use client";

import { GitBranch } from "lucide-react";
import { LAYER_LABEL, type FailureCluster } from "@/lib/types";
import { Card, Pill } from "./ui";

const SEV_TONE: Record<string, "bad" | "warn" | "info"> = {
  critical: "bad",
  high: "bad",
  medium: "warn",
  low: "info",
};

export function FailureRouterPanel({ clusters }: { clusters: FailureCluster[] }) {
  const primary = clusters[0];
  return (
    <Card
      title="Failure Router"
      subtitle="layer classification · evidence · severity"
      icon={<GitBranch size={15} />}
      right={
        primary && (
          <Pill tone="bad">
            failed: {primary.failed_layer}
            {primary.secondary_layers.length > 0 && ` +${primary.secondary_layers.length}`}
          </Pill>
        )
      }
    >
      <div className="space-y-2.5">
        {clusters.map((c, i) => (
          <div key={c.cluster_id} className="panel-2 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {i === 0 && <Pill tone="violet">PRIMARY</Pill>}
                <span className="text-[12.5px] font-semibold">{LAYER_LABEL[c.failed_layer]}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Pill tone={SEV_TONE[c.severity] ?? "warn"}>{c.severity}</Pill>
                <span className="mono tabular text-[10px] text-[var(--color-faint)]">
                  freq {Math.round(c.frequency * 100)}%
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">{c.root_cause}</p>
            {c.judge_story && (
              <p className="mt-1 text-[11px] italic text-[var(--color-warn)]">“{c.judge_story}”</p>
            )}
            <ul className="mt-1.5 space-y-0.5">
              {c.evidence.map((e, j) => (
                <li key={j} className="mono flex items-start gap-1.5 text-[10px] text-[var(--color-faint)]">
                  <span className="text-[var(--color-bad)]">›</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
            {c.evidence_turn_ids.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.evidence_turn_ids.map((t) => (
                  <span key={t} className="mono rounded bg-[var(--color-line-bright)] px-1 text-[9px]">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
