import { z } from "zod";
import { apiError } from "@/lib/api";
import { startAnalysis } from "@/lib/analysis/pipeline";
import { createAnalysisRun } from "@/lib/db/repository";
import { confirmMacro } from "@/lib/analysis/assistance";

const runSchema = z.object({
  previewId: z.string().min(1),
  scopeType: z.enum(["note", "object", "collection"]),
  scopeId: z.string().min(1),
  selectedNoteIds: z.array(z.string()).min(1).max(50),
  dateRange: z.object({
    start: z.union([z.literal(""), z.iso.date()]),
    end: z.union([z.literal(""), z.iso.date()]),
  }).refine((range) => !range.start || !range.end || range.start <= range.end, "Intervalo de datas inválido.").optional(),
  analysisTypes: z.array(z.enum(["connections", "risks", "contradictions", "gaps", "follow_ups"])).min(1).max(5).optional(),
});

export async function POST(request: Request) {
  try {
    const input = runSchema.parse(await request.json());
    const snapshot = confirmMacro(input.previewId, input.selectedNoteIds);
    const runId = createAnalysisRun(snapshot, snapshot.analysisTypes);
    startAnalysis(runId);
    return Response.json({ runId }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
