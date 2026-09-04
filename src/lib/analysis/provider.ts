import "server-only";

import type { AnalysisSnapshot, AnalysisType, SpecialistOutput } from "@/lib/contracts";

export type SpecialistName = AnalysisType | "consolidation";

export interface AnalysisProvider {
  readonly id: string;
  runStep(input: {
    step: SpecialistName;
    snapshot: AnalysisSnapshot;
    previousOutputs: Array<{ specialist: string; output: SpecialistOutput }>;
    signal: AbortSignal;
  }): Promise<SpecialistOutput>;
}
