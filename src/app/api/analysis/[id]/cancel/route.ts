import { apiError } from "@/lib/api";
import { cancelAnalysis } from "@/lib/analysis/pipeline";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json({ cancelled: cancelAnalysis(id) });
  } catch (error) {
    return apiError(error);
  }
}
