import { z } from "zod";
import { confirmConversation, createConversation, listConversations } from "@/lib/research/repository";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return Response.json(listConversations(new URL(request.url).searchParams.get("archived") === "true")); }
  catch (error) { return researchApiError(error); }
}
export async function POST(request: Request) {
  try {
    const input = z.union([
      z.object({ previewId: z.string().uuid() }).strict(),
      z.object({ requestId: z.string().uuid(), documentIds: z.array(z.string().uuid()).max(20).default([]) }).strict(),
    ]).parse(await request.json());
    return Response.json("previewId" in input ? confirmConversation(input.previewId) : createConversation(input.documentIds, input.requestId), { status: 201 });
  }
  catch (error) { return researchApiError(error); }
}
