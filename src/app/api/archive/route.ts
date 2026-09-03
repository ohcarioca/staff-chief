import { z } from "zod";
import { apiError } from "@/lib/api";
import { archiveItem } from "@/lib/db/repository";

const archiveSchema = z.object({
  kind: z.enum(["note", "object", "type"]),
  id: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = archiveSchema.parse(await request.json());
    archiveItem(input.kind, input.id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
