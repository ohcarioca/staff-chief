import { importDocument, listDocuments } from "@/lib/library/repository";
import { LibraryError, MAX_FILE_BYTES } from "@/lib/library/contracts";
import { libraryApiError } from "@/lib/library/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json(listDocuments(url.searchParams.get("q") ?? "", url.searchParams.get("archived") === "true"));
  } catch (error) { return libraryApiError(error); }
}

export async function POST(request: Request) {
  try {
    // Bound the actual stream, including requests without Content-Length.
    const maxBody = MAX_FILE_BYTES + 64 * 1024;
    if (Number(request.headers.get("content-length")) > maxBody) throw new LibraryError("O arquivo excede o limite de 20 MB.", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new LibraryError("Envie um arquivo.");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBody) { await reader.cancel(); throw new LibraryError("O arquivo excede o limite de 20 MB.", 413); }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    let form: FormData;
    try { form = await new Response(Buffer.concat(parts), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); }
    catch { throw new LibraryError("Upload inválido. Envie um arquivo por requisição."); }
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1) throw new LibraryError("Envie um arquivo por requisição.");
    const result = await importDocument(file.name, new Uint8Array(await file.arrayBuffer()));
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return libraryApiError(error); }
}
