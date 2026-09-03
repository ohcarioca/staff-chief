import { z } from "zod";
import { apiError } from "@/lib/api";
import { saveNote } from "@/lib/db/repository";

const noteSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(240).optional(),
  contentJson: z.record(z.string(), z.unknown()),
});

export async function POST(request: Request) {
  try {
    const note = saveNote(noteSchema.parse(await request.json()));
    return Response.json(note, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
