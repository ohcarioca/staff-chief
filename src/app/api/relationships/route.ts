import { z } from "zod";
import { apiError } from "@/lib/api";
import { createRelationship } from "@/lib/db/repository";

const relationshipSchema = z.object({
  sourceObjectId: z.string().min(1),
  targetObjectId: z.string().min(1),
  label: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  try {
    return Response.json({ id: createRelationship(relationshipSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
