import { z } from "zod";
import { apiError } from "@/lib/api";
import { createObjectType } from "@/lib/db/repository";

const typeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function POST(request: Request) {
  try {
    return Response.json({ id: createObjectType(typeSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
