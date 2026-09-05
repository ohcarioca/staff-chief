import { cancelMessage } from "@/lib/research/service";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(cancelMessage((await context.params).id)); }
  catch (error) { return researchApiError(error); }
}
