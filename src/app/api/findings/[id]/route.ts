import { z } from "zod";
import { apiError } from "@/lib/api";
import { acceptFinding, listFindings, updateFinding } from "@/lib/db/repository";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["open", "resolved", "dismissed"]) }),
  z.object({ action: z.literal("accept"), expectedObjectIds: z.tuple([z.string(), z.string()]).optional() }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = actionSchema.parse(await request.json());
    if (input.action === "accept") return Response.json({ id: acceptFinding(id, input.expectedObjectIds) });
    updateFinding(id, input.status);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const finding = listFindings().find((item) => item.id === id);
    if (!finding) return Response.json({ error: "Sugestão indisponível." }, { status: 404 });
    return Response.json(finding, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
