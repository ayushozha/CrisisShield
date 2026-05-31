/**
 * VoiceShield Forge — Scenario / EvalRun / RegressionRun Zod schemas + the
 * top-level DemoReport bundle the dashboard loads. Mirror of models.py.
 */
import { z } from "zod";
import { FailureLayer, SponsorMode, CallTrace, SponsorProof } from "./trace";
import { FailureCluster, RepairPack } from "./repair";

export const Scenario = z.object({
  scenario_id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  category: z.string().default("baseline"),
  targets_layer: FailureLayer.nullable().optional(),
  knobs: z.record(z.string(), z.any()).default({}),
  critical: z.boolean().default(false),
});
export type Scenario = z.infer<typeof Scenario>;

export const ScenarioResult = z.object({
  scenario_id: z.string(),
  passed: z.boolean(),
  task_success: z.boolean(),
  entity_accuracy: z.number().min(0).max(1),
  missed_escalation: z.number().default(0),
  unsafe_events: z.number().default(0),
  p95_latency_ms: z.number().default(0),
  time_to_escalation_s: z.number().default(0),
  handoff_score: z.number().nullable().optional(),
  failure_labels: z.array(z.string()).default([]),
  detail: z.string().default(""),
});
export type ScenarioResult = z.infer<typeof ScenarioResult>;

export const EvalRun = z.object({
  run_id: z.string(),
  kind: z.string(),
  mode: SponsorMode,
  scenario_results: z.array(ScenarioResult).default([]),
  aggregate: z.record(z.string(), z.number()).default({}),
  cekura_run_id: z.string().nullable().optional(),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const MetricDelta = z.object({
  before: z.number(),
  after: z.number(),
});

export const GateCheck = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string().default(""),
});
export type GateCheck = z.infer<typeof GateCheck>;

export const PromotionDecision = z.enum(["promote", "hold", "staging_pass"]);

export const RegressionRun = z.object({
  run_id: z.string(),
  baseline_run_id: z.string(),
  repair_id: z.string(),
  metrics: z.record(z.string(), MetricDelta).default({}),
  gate_checks: z.array(GateCheck).default([]),
  promotion_decision: PromotionDecision,
  promotion_reason: z.string().default(""),
});
export type RegressionRun = z.infer<typeof RegressionRun>;

export const DemoReport = z.object({
  run_id: z.string(),
  scenario_id: z.string(),
  mode: SponsorMode,
  created_at: z.string(),
  trace: CallTrace,
  secondary_trace: CallTrace.nullable().optional(),
  failure_clusters: z.array(FailureCluster).default([]),
  repair_pack: RepairPack,
  baseline_eval: EvalRun,
  regression_eval: EvalRun,
  regression: RegressionRun,
  sponsor_proof: SponsorProof,
  baseline_scenarios: z.array(Scenario).default([]),
  generated_scenarios: z.array(Scenario).default([]),
});
export type DemoReport = z.infer<typeof DemoReport>;

export * from "./trace";
export * from "./repair";
