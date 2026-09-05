import { z } from "zod";
import { repeatMessage } from "@/lib/research/service";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { attempt } = z.object({ attempt: z.number().int().positive() }).strict().parse(await request.json()); return Response.json(repeatMessage((await context.params).id, attempt), { status: 202 }); }
  catch (error) { return researchApiError(error); }
}
