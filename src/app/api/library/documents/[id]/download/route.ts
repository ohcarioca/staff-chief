import { getDocument } from "@/lib/library/repository";
import { libraryApiError } from "@/lib/library/http";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const document = getDocument((await context.params).id);
    const filename = `${document.title.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")}.md`;
    return new Response(document.markdown, { headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="documento.md"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return libraryApiError(error); }
}
