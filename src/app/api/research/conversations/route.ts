import { z } from "zod";
import { confirmConversation, listConversations } from "@/lib/research/repository";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return Response.json(listConversations(new URL(request.url).searchParams.get("archived") === "true")); }
  catch (error) { return researchApiError(error); }
}
export async function POST(request: Request) {
  try { return Response.json(confirmConversation(z.object({ previewId: z.string().uuid() }).strict().parse(await request.json()).previewId), { status: 201 }); }
  catch (error) { return researchApiError(error); }
}
