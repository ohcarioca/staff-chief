import { getConversation, updateConversation } from "@/lib/research/repository";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return Response.json(getConversation((await context.params).id)); }
  catch (error) { return researchApiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { return Response.json(updateConversation((await context.params).id, await request.json())); }
  catch (error) { return researchApiError(error); }
}
