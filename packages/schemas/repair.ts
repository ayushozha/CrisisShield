/**
 * VoiceShield Forge — FailureCluster + RepairPack Zod schemas.
 * Mirror of services/voice-backend/app/models.py.
 */
import { z } from "zod";
import { FailureLayer, Severity } from "./trace";

export const FailureCluster = z.object({
  cluster_id: z.string(),
  failed_layer: FailureLayer,
  secondary_layers: z.array(FailureLayer).default([]),
  severity: Severity.default("high"),
  frequency: z.number().min(0).max(1).default(0),
  evidence_turn_ids: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  root_cause: z.string().default(""),
  judge_story: z.string().default(""),
});
export type FailureCluster = z.infer<typeof FailureCluster>;

export const RepairArtifact = z.object({
  type: z.string(),
  provider: z.string().nullable().optional(),
  terms: z.array(z.string()).nullable().optional(),
  rule: z.string().nullable().optional(),
  tool: z.string().nullable().optional(),
  allow_when: z.array(z.string()).nullable().optional(),
  detail: z.record(z.string(), z.any()).default({}),
});
export type RepairArtifact = z.infer<typeof RepairArtifact>;

export const RepairPack = z.object({
  repair_id: z.string(),
  target_layers: z.array(FailureLayer).default([]),
  artifacts: z.array(RepairArtifact).default([]),
  generated_eval_ids: z.array(z.string()).default([]),
  rationale: z.string().default(""),
});
export type RepairPack = z.infer<typeof RepairPack>;
