import { z } from "zod";
import { apiError } from "@/lib/api";
import { executePreview, prepareDeepen, prepareDraft } from "@/lib/analysis/assistance";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), operation: z.enum(["improve", "connections"]), title: z.string().max(240), noteId: z.string().optional(),
    blocks: z.array(z.object({ id: z.string(), text: z.string().max(30000), protected: z.boolean() })).min(1).max(200) }),
  z.object({ action: z.literal("deepen"), findingId: z.string(), runId: z.string().optional() }),
  z.object({ action: z.literal("execute"), operation: z.enum(["improve", "connections", "deepen"]), previewId: z.string(), sourceIds: z.array(z.string()).max(50).optional() }),
]);
export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    if (input.action === "preview") return Response.json(prepareDraft(input.operation, input.blocks, input.title, input.noteId));
    if (input.action === "deepen") return Response.json(prepareDeepen(input.findingId, input.runId));
    return Response.json(await executePreview(input.previewId, input.operation, input.sourceIds, request.signal));
  } catch (error) { return apiError(error); }
}
