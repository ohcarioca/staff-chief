import "server-only";

import type { AnalysisSnapshot, SpecialistOutput } from "@/lib/contracts";

export type SpecialistName =
  | "connections"
  | "risks"
  | "contradictions"
  | "gaps"
  | "follow_ups"
  | "consolidation";

export interface AnalysisProvider {
  readonly id: string;
  runStep(input: {
    step: SpecialistName;
    snapshot: AnalysisSnapshot;
    previousOutputs: Array<{ specialist: string; output: SpecialistOutput }>;
    signal: AbortSignal;
  }): Promise<SpecialistOutput>;
}
