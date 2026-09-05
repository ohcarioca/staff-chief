import { getSource } from "@/lib/research/repository";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string; sourceId: string }> }) {
  try { const { id, sourceId } = await context.params; return Response.json(getSource(id, sourceId)); }
  catch (error) { return researchApiError(error); }
}
