import { z } from "zod";
import { apiError } from "@/lib/api";
import { prepareMacro } from "@/lib/analysis/assistance";

const scopeSchema = z.object({
  scopeType: z.enum(["note", "object", "collection"]),
  scopeId: z.string().min(1),
  analysisTypes: z.array(z.enum(["connections", "risks", "contradictions", "gaps", "follow_ups"])).min(1).max(5).optional(),
  mode: z.enum(["full", "incremental"]).optional(),
  selectedNoteIds: z.array(z.string()).min(1).max(50).optional(),
  dateRange: z.object({
    start: z.union([z.literal(""), z.iso.date()]),
    end: z.union([z.literal(""), z.iso.date()]),
  }).refine((range) => !range.start || !range.end || range.start <= range.end, "Intervalo de datas inválido.").optional(),
}).superRefine((input, context) => {
  if (input.scopeType === "collection" && !input.selectedNoteIds?.length) {
    context.addIssue({ code: "custom", path: ["selectedNoteIds"], message: "Selecione ao menos uma nota." });
  }
});

export async function POST(request: Request) {
  try {
    const input = scopeSchema.parse(await request.json());
    return Response.json(prepareMacro(input));
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_MANY_NOTES") {
      return Response.json({ error: "O contexto ultrapassa 50 notas. Desmarque algumas antes de continuar.", code: "TOO_MANY_NOTES" }, { status: 422 });
    }
    return apiError(error);
  }
}
