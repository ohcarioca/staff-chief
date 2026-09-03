import { z } from "zod";
import { apiError } from "@/lib/api";
import { acceptFinding, updateFinding } from "@/lib/db/repository";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["open", "resolved", "dismissed"]) }),
  z.object({ action: z.literal("accept") }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = actionSchema.parse(await request.json());
    if (input.action === "accept") return Response.json({ id: acceptFinding(id) });
    updateFinding(id, input.status);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
