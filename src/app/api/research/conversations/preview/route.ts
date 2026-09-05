import { z } from "zod";
import { prepareConversation } from "@/lib/research/repository";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return Response.json(prepareConversation(z.object({ documentIds: z.array(z.string()) }).strict().parse(await request.json()).documentIds)); }
  catch (error) { return researchApiError(error); }
}
