// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryMarkdown, LibraryView } from "./library-view";
import type { LibraryDocument } from "@/lib/library/contracts";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const document: LibraryDocument = { id: "doc-1", title: "Referência", originalName: "reference.md", originalFormat: "md", originalSize: 10, markdown: "# Gestão", warnings: [], revision: 1, createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z", archivedAt: null };

describe("library reader", () => {
  it("renders formatting without executable HTML, image requests or unsafe links", () => {
    const { container } = render(<LibraryMarkdown markdown={'# Título\n\n<script>alert(1)</script>\n\n![remota](https://example.com/tracker.png)\n\n[perigo](javascript:alert(1))\n\n[local](/api/backup)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'} />);
    expect(screen.getByRole("heading", { name: "Título" })).toBeTruthy();
    expect(container.querySelector("script, img")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"], a[href^="/"]')).toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
  });
  it("imports files sequentially, keeps successful results after a failure, and never calls AI", async () => {
    const files: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const name = ((init.body as FormData).get("file") as File).name;
        files.push(name);
        return name === "bad.pdf" ? Response.json({ error: "PDF inválido" }, { status: 400 }) : Response.json({ document, duplicate: false });
      }
      expect(url).toContain("/api/library/documents");
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LibraryView search="" onDirtyChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Selecionar arquivos"), { target: { files: [new File(["bad"], "bad.pdf"), new File(["# Gestão"], "good.md")] } });
    expect(await screen.findByText("PDF inválido")).toBeTruthy();
    expect(await screen.findByText("Importado.")).toBeTruthy();
    expect(files).toEqual(["bad.pdf", "good.md"]);
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith("/api/library/"))).toBe(true);
  });
  it("saves manually, guards unsaved selection changes, and sends revision with edits", async () => {
    const onDirtyChange = vi.fn();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return Response.json({ ...document, ...JSON.parse(init.body as string), revision: 2 });
      return Response.json(url.includes("?") ? [document, { ...document, id: "doc-2", title: "Outra fonte" }] : document);
    });
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LibraryView search="" onDirtyChange={onDirtyChange} />);
    fireEvent.click(await screen.findByRole("button", { name: /Referência/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Editar Markdown" }));
    fireEvent.change(screen.getByLabelText("Conteúdo Markdown"), { target: { value: "# Corrigido" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Outra fonte/ }));
    expect(confirm).toHaveBeenCalled();
    expect((screen.getByLabelText("Conteúdo Markdown") as HTMLTextAreaElement).value).toBe("# Corrigido");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patch![1]!.body as string)).toEqual({ title: "Referência", markdown: "# Corrigido", revision: 1 });
    expect(await screen.findByRole("heading", { name: "Corrigido" })).toBeTruthy();
  });
});
