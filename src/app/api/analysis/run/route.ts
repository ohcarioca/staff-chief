import { z } from "zod";
import { apiError } from "@/lib/api";
import { startAnalysis } from "@/lib/analysis/pipeline";
import { buildAnalysisSnapshot, createAnalysisRun } from "@/lib/db/repository";

const runSchema = z.object({
  scopeType: z.enum(["note", "object"]),
  scopeId: z.string().min(1),
  selectedNoteIds: z.array(z.string()).max(50),
  analysisTypes: z.array(z.enum(["connections", "risks", "contradictions", "gaps", "follow_ups"])).min(1).max(5).optional(),
});

export async function POST(request: Request) {
  try {
    const input = runSchema.parse(await request.json());
    const snapshot = buildAnalysisSnapshot(input.scopeType, input.scopeId, input.selectedNoteIds);
    const runId = createAnalysisRun(snapshot, input.analysisTypes);
    startAnalysis(runId);
    return Response.json({ runId }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
