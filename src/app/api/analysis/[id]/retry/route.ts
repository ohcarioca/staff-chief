import { apiError } from "@/lib/api";
import { retryAnalysis } from "@/lib/analysis/pipeline";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    retryAnalysis(id);
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
