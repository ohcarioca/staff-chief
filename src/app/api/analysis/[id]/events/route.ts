import { getAnalysisRun } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getAnalysisRun(id)) return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  const encoder = new TextEncoder();
  const terminal = new Set(["completed", "partial", "failed", "cancelled"]);
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      const emit = () => {
        if (closed) return;
        const run = getAnalysisRun(id);
        if (!run) return close();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(run)}\n\n`));
        if (terminal.has(run.status)) return close();
        setTimeout(emit, 750);
      };
      request.signal.addEventListener("abort", close, { once: true });
      emit();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
