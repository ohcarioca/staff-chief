import { z } from "zod";
import { apiError } from "@/lib/api";
import { buildAnalysisSnapshot } from "@/lib/db/repository";

const scopeSchema = z.object({
  scopeType: z.enum(["note", "object"]),
  scopeId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = scopeSchema.parse(await request.json());
    return Response.json(buildAnalysisSnapshot(input.scopeType, input.scopeId));
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_MANY_NOTES") {
      return Response.json({ error: "O contexto ultrapassa 50 notas. Desmarque algumas antes de continuar.", code: "TOO_MANY_NOTES" }, { status: 422 });
    }
    return apiError(error);
  }
}
