import { z } from "zod";
import { apiError } from "@/lib/api";
import { updateObject } from "@/lib/db/repository";

const objectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    updateObject({ id, ...objectSchema.parse(await request.json()) });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
