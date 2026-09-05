import { getDocument, updateDocument } from "@/lib/library/repository";
import { libraryApiError } from "@/lib/library/http";
import { LibraryError } from "@/lib/library/contracts";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return Response.json(getDocument((await context.params).id)); }
  catch (error) { return libraryApiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    let input: unknown;
    try { input = await request.json(); } catch { throw new LibraryError("JSON inválido."); }
    return Response.json(updateDocument((await context.params).id, input));
  }
  catch (error) { return libraryApiError(error); }
}
