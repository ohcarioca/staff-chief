// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchView } from "./research-view";
import type { ResearchConversation, ResearchMessage } from "@/lib/research/contracts";

const source = { id: "source-1", documentId: "document-1", title: "Compras Aurora", revision: 1 };
const conversation: ResearchConversation = { id: "chat-1", title: "Pesquisa Aurora", createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z", archivedAt: null, sources: [source], messages: [] };
const message: ResearchMessage = { id: "message-1", conversationId: "chat-1", requestId: "request-1", question: "Quem aprova compras?", status: "running", answer: null, error: null, attempt: 1, createdAt: "2026-09-05T12:00:00.000Z", completedAt: null, historyOmitted: 0,
  chunks: [{ id: "chunk-1", sourceId: source.id, documentId: source.documentId, title: source.title, revision: 1, start: 0, end: 20, section: "Aprovação", content: "Sofia aprova compras." }] };
class FakeEvents {
  static instances: FakeEvents[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) { FakeEvents.instances.push(this); }
}
beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEvents); FakeEvents.instances = [];
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("conversational research UI", () => {
  it("ignores obsolete list responses when filters change and unmounts without aborting fetch", async () => {
    const pending: { resolve: (response: Response) => void; signal?: AbortSignal | null }[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve) => {
      pending.push({ resolve, signal: init?.signal });
    })));
    const view = render(<ResearchView onDirtyChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => { pending[1].resolve(Response.json([{ ...conversation, title: "Archived result" }])); });
    expect(screen.getByRole("button", { name: /Archived result/ })).toBeTruthy();
    await act(async () => { pending[0].resolve(Response.json([conversation])); });
    expect(screen.queryByRole("button", { name: /Pesquisa Aurora/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    view.unmount();
    await act(async () => { pending[2].resolve(Response.json([])); });
    expect(pending.every((item) => !item.signal)).toBe(true);
  });
  it("starts notes-only research directly without a confirmation or AI request", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "POST" ? conversation : []));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchView onDirtyChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
    expect(await screen.findByRole("textbox", { name: "Pergunta" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("/api/research/conversations");
    expect(JSON.parse(posts[0][1]!.body as string)).toMatchObject({ documentIds: [], requestId: expect.any(String) });
  });
  it("adds optional documents in one step without confirming notes or sending an AI message", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/library/documents") return Response.json([{ id: source.documentId, title: source.title, originalFormat: "md", revision: 1 }]);
      return Response.json(init?.method === "POST" ? conversation : []);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchView onDirtyChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Com documentos" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Compras Aurora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar conversa" }));
    expect(await screen.findByRole("textbox", { name: "Pergunta" })).toBeTruthy();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("/api/research/conversations");
    expect(JSON.parse(posts[0][1]!.body as string).documentIds).toEqual([source.documentId]);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/messages") || url.includes("/preview"))).toBe(false);
  });
  it("subscribes to saved running messages, shows verified citations and opens the preserved source", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/sources/")) return Response.json({ ...source, markdown: "Sofia aprova compras." });
      if (url.includes("?")) return Response.json([conversation]);
      return Response.json({ ...conversation, messages: [message] });
    }));
    render(<ResearchView onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Pesquisa Aurora/ }));
    await screen.findByText(/Consultando o Codex/);
    expect(FakeEvents.instances[0].url).toContain(message.id);
    act(() => FakeEvents.instances[0].onerror?.());
    expect(screen.getByText(/Reconectando/)).toBeTruthy();
    act(() => FakeEvents.instances[0].onmessage?.({ data: JSON.stringify({ ...message, status: "completed", historyOmitted: 2, answer: { insufficientEvidence: false, blocks: [{ text: "Sofia é a responsável.", citations: [{ chunkId: "chunk-1", quote: "Sofia aprova compras." }] }] } }) }));
    expect(await screen.findByText("Sofia é a responsável.")).toBeTruthy();
    expect(screen.getByText(/2 pergunta\(s\) anterior/)).toBeTruthy();
    expect(FakeEvents.instances[0].close).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Compras Aurora · Aprovação/ }));
    expect(await screen.findByText("Cópia preservada na conversa")).toBeTruthy();
    expect(screen.getByText("Sofia aprova compras.", { selector: "mark" })).toBeTruthy();
  });
  it("preserves the request identifier after a network error and protects a draft when switching conversations", async () => {
    const sent: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/messages")) {
        sent.push(JSON.parse(init!.body as string));
        if (sent.length === 1) throw new Error("Falha de rede");
        return Response.json(message);
      }
      return Response.json(url.includes("?") ? [conversation, { ...conversation, id: "chat-2", title: "Outra conversa" }] : conversation);
    });
    vi.stubGlobal("fetch", fetchMock); const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ResearchView onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Pesquisa Aurora/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Pergunta" }), { target: { value: message.question } });
    fireEvent.click(screen.getByRole("button", { name: /Outra conversa/ })); expect(confirm).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Pergunta" }) as HTMLTextAreaElement).value).toBe(message.question);
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(sent).toHaveLength(2)); expect(sent[0]).toEqual(sent[1]);
    await screen.findByRole("button", { name: "Cancelar resposta" });
    cleanup(); expect(FakeEvents.instances[0].close).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/cancel"))).toBe(false);
  });
});
