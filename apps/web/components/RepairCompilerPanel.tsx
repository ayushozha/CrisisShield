"use client";

import { Wrench } from "lucide-react";
import type { RepairPack } from "@/lib/types";
import { Card, Pill } from "./ui";

const ARTIFACT_META: Record<string, { label: string; tone: "info" | "ok" | "warn" | "violet" }> = {
  asr_vocabulary_boost: { label: "ASR Vocabulary Boost", tone: "info" },
  dialog_policy_patch: { label: "Dialog Policy Patch", tone: "violet" },
  tool_gate: { label: "Tool Gate", tone: "ok" },
  guardrail_patch: { label: "Guardrail Patch", tone: "warn" },
};

export function RepairCompilerPanel({ pack }: { pack: RepairPack }) {
  return (
    <Card
      title="Repair Compiler"
      subtitle={`${pack.repair_id} · concrete artifacts`}
      icon={<Wrench size={15} />}
      right={
        <div className="flex gap-1">
          {pack.target_layers.map((l) => (
            <Pill key={l} tone="ok">
              {l}
            </Pill>
          ))}
        </div>
      }
    >
      <div className="space-y-2">
        {pack.artifacts.map((a, i) => {
          const meta = ARTIFACT_META[a.type] ?? { label: a.type, tone: "info" as const };
          return (
            <div key={i} className="panel-2 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold">{meta.label}</span>
                {a.provider && <Pill tone={meta.tone}>{a.provider}</Pill>}
              </div>
              {a.terms && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {a.terms.map((t) => (
                    <span key={t} className="mono rounded bg-[var(--color-line-bright)] px-1.5 py-0.5 text-[10px]">
                      {t}
                    </span>
                  ))}
                  {a.detail?.boost != null && (
                    <span className="mono text-[10px] text-[var(--color-faint)]">boost={a.detail.boost}</span>
                  )}
                </div>
              )}
              {a.rule && (
                <pre className="mono mt-1 overflow-x-auto rounded bg-[var(--color-ink)] px-2 py-1 text-[10px] text-[var(--color-info)]">
                  {a.rule}
                </pre>
              )}
              {a.tool && (
                <div className="mono mt-1 text-[10.5px] text-[var(--color-muted)]">
                  gate <span className="text-[var(--color-ok)]">{a.tool}</span> allow_when:{" "}
                  {(a.allow_when ?? []).join(", ")}
                </div>
              )}
              {a.detail?.behavior && (
                <p className="mt-1 text-[10.5px] text-[var(--color-muted)]">{a.detail.behavior}</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 rounded-md border border-[var(--color-line)] px-3 py-1.5">
        <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
          generated harder evals
        </span>
        <div className="mt-1 flex flex-wrap gap-1">
          {pack.generated_eval_ids.map((id) => (
            <span key={id} className="mono rounded bg-[var(--color-line-bright)] px-1.5 py-0.5 text-[9px] text-[var(--color-violet)]">
              {id}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
