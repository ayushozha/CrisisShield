"use client";

import { ListChecks } from "lucide-react";
import type { DemoReport, ScenarioResult } from "@/lib/types";
import { Card, Pill } from "./ui";

function PassDot({ passed }: { passed: boolean }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-[3px]"
      style={{ background: passed ? "var(--color-ok)" : "var(--color-bad)" }}
      title={passed ? "pass" : "fail"}
    />
  );
}

export function EvalCurriculumPanel({ report }: { report: DemoReport }) {
  const baseById = new Map<string, ScenarioResult>(
    report.baseline_eval.scenario_results.map((r) => [r.scenario_id, r]),
  );
  const regById = new Map<string, ScenarioResult>(
    report.regression_eval.scenario_results.map((r) => [r.scenario_id, r]),
  );
  const titleById = new Map<string, { title: string; layer?: string | null; critical: boolean; cat: string }>();
  for (const s of report.baseline_scenarios)
    titleById.set(s.scenario_id, { title: s.title, layer: s.targets_layer, critical: s.critical, cat: "baseline" });
  for (const s of report.generated_scenarios)
    titleById.set(s.scenario_id, { title: s.title, layer: s.targets_layer, critical: s.critical, cat: "generated" });

  const basePass = report.baseline_eval.scenario_results.filter((r) => r.passed).length;
  const baseTotal = report.baseline_eval.scenario_results.length;
  const genIds = new Set(report.generated_scenarios.map((s) => s.scenario_id));
  const genResults = report.regression_eval.scenario_results.filter((r) => genIds.has(r.scenario_id));
  const genPass = genResults.filter((r) => r.passed).length;

  const rows = [...report.baseline_scenarios, ...report.generated_scenarios];

  return (
    <Card
      title="Eval Curriculum"
      subtitle="baseline suite + generated harder evals"
      icon={<ListChecks size={15} />}
      right={
        <div className="flex gap-1">
          <Pill tone="info">baseline {basePass}/{baseTotal}</Pill>
          <Pill tone="violet">generated {genPass}/{genResults.length}</Pill>
        </div>
      }
    >
      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-[var(--color-panel)]">
            <tr className="text-left text-[var(--color-faint)]">
              <th className="py-1 font-medium">Scenario</th>
              <th className="py-1 font-medium">Targets</th>
              <th className="py-1 text-center font-medium">Base</th>
              <th className="py-1 text-center font-medium">Repaired</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const meta = titleById.get(s.scenario_id);
              const b = baseById.get(s.scenario_id);
              const r = regById.get(s.scenario_id);
              const generated = meta?.cat === "generated";
              return (
                <tr key={s.scenario_id} className="border-t border-[var(--color-line)]">
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      {generated && <span className="text-[var(--color-violet)]">✦</span>}
                      <span className="text-[var(--color-fg)]">{s.title}</span>
                      {s.critical && <Pill tone="bad">critical</Pill>}
                    </div>
                    <span className="mono text-[9px] text-[var(--color-faint)]">{s.scenario_id}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    {s.targets_layer && (
                      <span className="mono text-[9.5px] text-[var(--color-muted)]">{s.targets_layer}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-center">{b && <PassDot passed={b.passed} />}</td>
                  <td className="py-1.5 text-center">{r && <PassDot passed={r.passed} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mono mt-2 text-[9.5px] text-[var(--color-faint)]">
        turn-taking & reasoning layers are intentionally unrepaired → they stay red in the repaired
        column (honest gating, not a blanket pass).
      </p>
    </Card>
  );
}
