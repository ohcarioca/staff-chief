import { getMessage } from "@/lib/research/repository";
import { isPending } from "@/lib/research/contracts";
import { researchApiError } from "@/lib/research/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { getMessage(id); } catch (error) { return researchApiError(error); }
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const close = () => {
        if (closed) return;
        stop(); controller.close();
      };
      stop = () => { closed = true; clearTimeout(timer); request.signal.removeEventListener("abort", close); };
      const emit = () => {
        if (closed) return;
        try {
          const message = getMessage(id);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
          if (!isPending(message.status)) return close();
          timer = setTimeout(emit, 750);
        } catch { close(); }
      };
      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) close(); else emit();
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
