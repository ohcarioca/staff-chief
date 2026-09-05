import { sendMessage } from "@/lib/research/service";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(sendMessage((await context.params).id, await request.json()), { status: 202 }); }
  catch (error) { return researchApiError(error); }
}
