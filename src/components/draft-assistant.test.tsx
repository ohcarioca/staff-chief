// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftAssistant, editorBlocks } from "./draft-assistant";
import type { AiPreview, AssistanceResult } from "@/lib/contracts";

let editor: Editor;
afterEach(() => { cleanup(); editor?.destroy(); vi.unstubAllGlobals(); });
const preview: AiPreview = { previewId: "p", overLimit: false, sources: [], candidateObjects: [], notice: "Revisar" };
const result: AssistanceResult = { changes: [{ blockId: "block-0", before: "Entrega em 15/10.", after: "A entrega será em 15/10.", format: "paragraph", reason: "Clareza" }], objects: [], findings: [] };
function setup() {
  editor = new Editor({ extensions: [StarterKit, Mention], content: "<p>Entrega em 15/10.</p>" });
  return render(<DraftAssistant editor={editor} title="Entrega" objects={[]} types={[]} />);
}
describe("draft assistant", () => {
  it("does not invoke any endpoint while typing; preview alone does not execute AI", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(preview)); vi.stubGlobal("fetch", fetchMock);
    setup();
    act(() => { editor.commands.insertContent("Nova "); });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "✦ Melhorar" }));
    await screen.findByRole("button", { name: "Confirmar e enviar" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe("preview");
  });
  it("requires confirmation and applies changes with undo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(preview)).mockResolvedValueOnce(Response.json(result)));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "✦ Melhorar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar e enviar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Aplicar alteração" }));
    expect(editor.getText()).toBe("A entrega será em 15/10.");
    fireEvent.click(screen.getByRole("button", { name: "Desfazer última edição" }));
    expect(editor.getText()).toBe("Entrega em 15/10.");
  });
  it("blocks a late response from replacing a newer draft", async () => {
    let resolve: (value: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(preview)).mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; })));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "✦ Melhorar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar e enviar" }));
    act(() => { editor.commands.setContent("<p>Entrega adiada para 20/10.</p>"); });
    await act(async () => { resolve(Response.json(result)); });
    await waitFor(() => expect((screen.getByRole("button", { name: "Aplicar alteração" }) as HTMLButtonElement).disabled).toBe(true));
    expect(editor.getText()).toBe("Entrega adiada para 20/10.");
  });
  it("protects mentions and rich formatting while supporting selected text", () => {
    editor = new Editor({ extensions: [StarterKit, Mention], content: { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Ana", marks: [{ type: "bold" }] }] },
      { type: "paragraph", content: [{ type: "mention", attrs: { id: "ana", label: "Ana" } }] },
      { type: "paragraph", content: [{ type: "text", text: "Texto selecionado." }] },
    ] } });
    expect(editorBlocks(editor).slice(0, 2).every((b) => b.protected)).toBe(true);
    const last = editorBlocks(editor)[2];
    editor.commands.setTextSelection({ from: last.from, to: last.from + 5 });
    expect(editorBlocks(editor, true)[0].text).toBe("Texto");
    expect(editorBlocks(editor, true)[0].whole).toBe(false);
  });
});
