// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisRunRecord, AnalysisSnapshot, FindingRecord, KnowledgeObjectRecord, NoteRecord } from "@/lib/contracts";
import { AnalysisDialog } from "./analysis-dialog";
import { AnalysisLauncherDialog } from "./analysis-launcher-dialog";
import { FindingDeepen } from "./finding-deepen";

const note: NoteRecord = { id: "n1", title: "Métrica de ativação", contentText: "Produto e Growth usam critérios diferentes.", contentJson: {}, createdAt: "2026-09-05T12:00:00Z", updatedAt: "2026-09-05T12:00:00Z", archivedAt: null, mentions: [] };
const finding: FindingRecord = { id: "f1", runId: "r1", category: "risk", title: "Critérios diferentes de ativação", explanation: "Há dois critérios nas notas. A comparação pode estar distorcida.", suggestedAction: "Definir o critério usado no relatório.", priority: "high", confidence: 0, status: "open", sourceNoteIds: [note.id], sourceObjectIds: [], createdAt: note.createdAt, detail: { evidence: [{ noteId: note.id, quote: note.contentText }], impact: "A meta pode ser medida incorretamente.", limitation: "Não sabemos qual critério foi aprovado.", priorityReason: "A próxima medição depende desta decisão.", evidenceStrength: "strong", previousFindingId: null } };
const snapshot: AnalysisSnapshot = { scope: { type: "collection", id: "selection", label: "Seleção de notas" }, analysisTypes: ["risks"], notes: [{ id: note.id, title: note.title, content: note.contentText, updatedAt: note.updatedAt, objectIds: [] }], objects: [], relationships: [], prepared: { previewId: "preview-1", overLimit: false, sources: [], candidateObjects: [], notice: "Uma nota selecionada." } };
const run: AnalysisRunRecord = { id: "r1", provider: "test", scopeType: "collection", scopeId: "selection", status: "completed", error: null, createdAt: note.createdAt, completedAt: note.createdAt, steps: [], findings: [finding] };
const props = { scope: null, existingRunId: "r1", notes: [note], objects: [], onClose: vi.fn(), onChanged: vi.fn(), onOpenSource: vi.fn() };
class Stream {
  static instances: Stream[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() { Stream.instances.push(this); }
  publish(value: AnalysisRunRecord) { act(() => this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent)); }
}
function installStream() { Stream.instances = []; vi.stubGlobal("EventSource", Stream); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("analysis decisions and recovery", () => {
  it("only sends the reviewed snapshot after explicit confirmation", async () => {
    installStream();
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(snapshot)).mockResolvedValueOnce(Response.json({ runId: "r1" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AnalysisDialog {...props} existingRunId={null} scope={{ type: "collection", id: "selection" }} initialNoteIds={[note.id, "not-included"]} analysisTypes={["risks"]} />);
    await screen.findByText("Uma nota selecionada.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/Você selecionou 2 notas/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e analisar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/analysis/run");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ previewId: "preview-1", selectedNoteIds: [note.id] });
  });

  it("blocks oversized context and returns to editing without executing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...snapshot, prepared: { ...snapshot.prepared, overLimit: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const back = vi.fn();
    render(<AnalysisDialog {...props} existingRunId={null} scope={{ type: "note", id: note.id }} onBack={back} />);
    await screen.findByText(/O contexto está amplo demais/);
    expect((screen.getByRole("button", { name: "Confirmar e analisar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Voltar e editar" }));
    expect(back).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("recovers a failed preview with a fresh preview before enabling confirmation", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Falha local")).mockResolvedValueOnce(Response.json(snapshot));
    vi.stubGlobal("fetch", fetchMock);
    render(<AnalysisDialog {...props} existingRunId={null} scope={{ type: "note", id: note.id }} />);
    await screen.findByText("Falha local");
    expect((screen.getByRole("button", { name: "Confirmar e analisar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Preparar prévia novamente" }));
    await screen.findByText("Uma nota selecionada.");
    expect((screen.getByRole("button", { name: "Confirmar e analisar" }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/analysis/preview")).toBe(true);
  });

  it("preserves note, category and advanced choices when returning to configuration", () => {
    const next = vi.fn();
    render(<AnalysisLauncherDialog notes={[note, { ...note, id: "n2", title: "Outra nota" }]} dateRange={{ start: "", end: "" }} initialNoteIds={[note.id]} initialTypes={["risks"]} initialMode="incremental" onContinue={next} onClose={vi.fn()} />);
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(true);
    expect((screen.getAllByRole("checkbox")[1] as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("button", { name: /^Riscos/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Conferir envio" }));
    expect(next.mock.calls[0].slice(1)).toEqual([["risks"], [note.id], { start: "", end: "" }, "incremental"]);
  });

  it("shows next steps while collapsed and separates closed items after priority ordering", () => {
    installStream(); render(<AnalysisDialog {...props} />);
    Stream.instances[0].publish({ ...run, findings: [{ ...finding, id: "low", title: "Baixa prioridade", priority: "low", suggestedAction: "Rever depois." }, { ...finding, id: "closed", title: "Já resolvida", status: "resolved" }, finding] });
    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => within(card).getByRole("button").textContent)).toEqual([expect.stringContaining(finding.title), expect.stringContaining("Baixa prioridade"), expect.stringContaining("Já resolvida")]);
    expect(within(cards[0]).getByText(finding.suggestedAction)).toBeTruthy();
    expect(screen.queryByText(finding.explanation)).toBeNull();
    expect(screen.getByText("Resolvidas e descartadas (1)")).toBeTruthy();
  });

  it("preserves the selected result and run when opening a source", () => {
    installStream(); const open = vi.fn(); render(<AnalysisDialog {...props} initialFindingId={finding.id} onOpenSource={open} />);
    Stream.instances[0].publish(run);
    const evidence = screen.getByText(/Evidências e limites/).closest("details")!;
    expect(evidence.open).toBe(false);
    fireEvent.click(within(evidence).getByText(/Evidências e limites/));
    fireEvent.click(screen.getByRole("button", { name: `Abrir nota: ${note.title}` }));
    expect(open).toHaveBeenCalledWith("note", note.id, run.id, finding.id);
  });

  it("marks a suggestion as resolved without executing its recommended action", async () => {
    installStream(); const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal("fetch", fetchMock);
    render(<AnalysisDialog {...props} initialFindingId={finding.id} />); Stream.instances[0].publish(run);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como resolvido" }));
    await screen.findByText("Resolvidas e descartadas (1)");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/findings/f1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "status", status: "resolved" });
    expect(screen.getByText(/Isso atualiza apenas o acompanhamento/)).toBeTruthy();
  });

  it.each(["partial", "failed", "cancelled"] as const)("does not present %s as a successful empty analysis", (status) => {
    installStream(); render(<AnalysisDialog {...props} />);
    Stream.instances[0].publish({ ...run, status, findings: [] });
    expect(screen.queryByText("Nenhuma sugestão sustentada pelas fontes")).toBeNull();
    expect(document.querySelector(`.run-${status}`)).toBeTruthy();
  });

  it("reconnects a failed initial stream without starting another analysis", () => {
    installStream(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<AnalysisDialog {...props} />);
    act(() => Stream.instances[0].onerror?.());
    fireEvent.click(screen.getByRole("button", { name: "Reconectar acompanhamento" }));
    expect(Stream.instances).toHaveLength(2);
    Stream.instances[1].publish({ ...run, findings: [] });
    expect(screen.getByText("Nenhuma sugestão sustentada pelas fontes")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows cancellation errors and retries failed steps through the existing endpoints", async () => {
    installStream(); const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ error: "Não cancelou" }, { status: 500 })).mockResolvedValueOnce(Response.json({ ok: true })); vi.stubGlobal("fetch", fetchMock);
    render(<AnalysisDialog {...props} />); Stream.instances[0].publish({ ...run, status: "running", findings: [] });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar análise" })); await screen.findByText("Não cancelou");
    Stream.instances[0].publish({ ...run, status: "failed", findings: [], steps: [{ id: "s", name: "macro", position: 0, status: "failed", error: "Falha", startedAt: null, completedAt: null }] });
    fireEvent.click(screen.getByRole("button", { name: "Tentar etapas com falha" }));
    await waitFor(() => expect(Stream.instances).toHaveLength(2));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/analysis/r1/cancel", "/api/analysis/r1/retry"]);
  });

  it("reads the current connection pair before offering acceptance of an older report", async () => {
    installStream();
    const object = (id: string): KnowledgeObjectRecord => ({ id, name: `Projeto ${id}`, description: "", typeId: "p", typeName: "Projeto", typeIcon: "P", typeColor: "#000", archivedAt: null });
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ...finding, category: "connection", sourceObjectIds: ["b", "c"] })).mockResolvedValueOnce(Response.json({ id: "relation" })); vi.stubGlobal("fetch", fetchMock);
    render(<AnalysisDialog {...props} objects={[object("a"), object("b"), object("c")]} initialFindingId={finding.id} />);
    Stream.instances[0].publish({ ...run, findings: [{ ...finding, category: "connection", sourceObjectIds: ["a", "b"] }] });
    const accept = await screen.findByRole("button", { name: "Criar vínculo no mapa" });
    expect(document.querySelector(".connection-preview")?.textContent).toContain("Projeto b ↔ Projeto c");
    fireEvent.click(accept);
    await screen.findByText(/Vínculo criado no mapa/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "accept", expectedObjectIds: ["b", "c"] });
  });

  it("shows an explicit fallback for legacy findings and unavailable sources", () => {
    installStream(); render(<AnalysisDialog {...props} notes={[]} initialFindingId={finding.id} />);
    Stream.instances[0].publish({ ...run, findings: [{ ...finding, detail: undefined, suggestedAction: "" }] });
    expect(screen.getByText(/Nenhuma ação específica foi registrada/)).toBeTruthy();
    expect(screen.getByText(/Relatório anterior ao registro/)).toBeTruthy();
    expect(screen.getByText(/Nota indisponível ou arquivada/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Abrir nota/ })).toBeNull();
  });

  it("requires a second explicit confirmation for more details and uses the same result structure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ...snapshot.prepared, sources: snapshot.notes })).mockResolvedValueOnce(Response.json({ changes: [], objects: [], findings: [finding] })); vi.stubGlobal("fetch", fetchMock);
    render(<FindingDeepen findingId={finding.id} runId={run.id} notes={[note]} objects={[]} onOpenSource={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Pedir mais detalhes" }));
    await screen.findByText("Conferir envio para obter mais detalhes");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe("deepen");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e pedir detalhes" }));
    await screen.findByText(finding.suggestedAction);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "execute", operation: "deepen", previewId: "preview-1" });
    expect(screen.getByText("O que foi identificado")).toBeTruthy();
  });
});
