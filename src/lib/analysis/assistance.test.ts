import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabaseForTests } from "../db/client";
import { getAiRecord } from "../db/ai-store";
import { createAnalysisRun, exportBackup, getAnalysisRun, getAppState, listFindings, restoreBackup, saveMacroReport, saveNote, updateFinding } from "../db/repository";
import { confirmMacro, executePayload, getPrepared, prepareDeepen, prepareDraft, prepareMacro, validateAssistance } from "./assistance";
import { CodexCliProvider } from "./codex-provider";
import { containsName, diverseNotes, nameRange, preservesCriticalValues } from "./context";

let directory = "";
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "staff-chief-assist-test-")); process.env.STAFF_CHIEF_DATA_DIR = directory; resetDatabaseForTests(); });
afterEach(() => { resetDatabaseForTests(); delete process.env.STAFF_CHIEF_DATA_DIR; fs.rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); });
const note = (title: string, text: string) => saveNote({ title, contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } });
const empty = { changes: [], objects: [], findings: [] };

describe("efficient assistance", () => {
  it("prepares drafts locally without invoking the provider", () => {
    const run = vi.spyOn(CodexCliProvider.prototype, "runStructured");
    const preview = prepareDraft("improve", [{ id: "b", text: "Ana confirmou entrega em 15/10.", protected: false }], "Entrega");
    expect(run).not.toHaveBeenCalled();
    expect(preview.overLimit).toBe(false);
    expect(preview.sources).toEqual([]);
  });
  it("rejects oversized inputs before executing and caches identical valid results", async () => {
    const provider = new CodexCliProvider();
    const execute = vi.spyOn(provider, "runStructured").mockResolvedValue(empty);
    const huge = prepareDraft("improve", [{ id: "b", text: "longa ".repeat(3000), protected: false }], "");
    await expect(executePayload(getPrepared(huge.previewId, "improve"), new AbortController().signal, provider)).rejects.toThrow("amplo demais");
    expect(execute).not.toHaveBeenCalled();
    const preview = prepareDraft("improve", [{ id: "b", text: "Entrega confirmada.", protected: false }], "");
    const payload = getPrepared(preview.previewId, "improve");
    const first = await executePayload(payload, new AbortController().signal, provider);
    const second = await executePayload(payload, new AbortController().signal, provider);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
  it("does not cache failures or retry them automatically", async () => {
    const provider = new CodexCliProvider();
    const execute = vi.spyOn(provider, "runStructured").mockRejectedValue(new Error("falha"));
    const preview = prepareDraft("improve", [{ id: "b", text: "Outra nota.", protected: false }], "");
    await expect(executePayload(getPrepared(preview.previewId, "improve"), new AbortController().signal, provider)).rejects.toThrow("falha");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("rejects number changes, protected blocks and invented object types", () => {
    const preview = prepareDraft("improve", [{ id: "b", text: "Ana confirmou 15/10.", protected: false }, { id: "p", text: "@Ana", protected: true }], "");
    const output = validateAssistance({ ...empty, changes: [
      { blockId: "b", before: "Ana confirmou 15/10.", after: "Ana confirmou 16/10.", format: "paragraph", reason: "Data" },
      { blockId: "p", before: "@Ana", after: "@Outra", format: "paragraph", reason: "Nome" },
    ], objects: [{ blockId: "b", text: "Ana", typeId: "fake", objectId: null }] }, getPrepared(preview.previewId, "improve"));
    expect(output).toEqual(empty);
    expect(preservesCriticalValues("R$ 1.200 e 15/10 na terça-feira", "Na terça-feira: 15/10, R$ 1.200")).toBe(true);
    expect(preservesCriticalValues("Entrega na terça-feira", "Entrega na quarta-feira")).toBe(false);
    expect(containsName("Mariana conversou com Ana.", "Ana")).toBe(true);
    expect(containsName("Mariana", "Ana")).toBe(false);
    expect(nameRange("Reunião com João.", "Joao")).toEqual({ from: 12, to: 16 });
  });
  it("rejects mismatched existing objects and duplicate model suggestions", () => {
    const preview = prepareDraft("improve", [{ id: "b", text: "Ana lidera a entrega.", protected: false }], "");
    const payload = getPrepared(preview.previewId, "improve");
    payload.types = [{ id: "person", name: "Pessoa" }];
    payload.candidates = [{ id: "joao", name: "João", typeId: "person" }];
    const change = { blockId: "b", before: "Ana lidera a entrega.", after: "Ana lidera a entrega principal.", format: "paragraph" as const, reason: "Clareza" };
    const output = validateAssistance({ changes: [change, change], findings: [], objects: [
      { blockId: "b", text: "Ana", typeId: "person", objectId: "joao" },
      { blockId: "b", text: "Ana", typeId: "person", objectId: null },
      { blockId: "b", text: "Ana", typeId: "person", objectId: null },
    ] }, payload);
    expect(output.changes).toHaveLength(1);
    expect(output.objects).toEqual([{ blockId: "b", text: "Ana", typeId: "person", objectId: null }]);
  });
  it("freezes preview, disallows unreviewed sources, validates quotes and keeps two-note connections", () => {
    const first = note("Atlas", "Atlas precisa de tradutores para o lançamento.");
    const second = note("Horizonte", "Horizonte tem tradutores disponíveis.");
    const snapshot = prepareMacro({ scopeType: "collection", scopeId: "selection", selectedNoteIds: [first.id, second.id] });
    note("Outro", "Conteúdo posterior.");
    expect(() => confirmMacro(snapshot.prepared!.previewId, ["invented"])).toThrow("revisado");
    const confirmed = confirmMacro(snapshot.prepared!.previewId, [first.id, second.id]);
    expect(confirmed.notes).toHaveLength(2);
    const payload = getPrepared(snapshot.prepared!.previewId, "macro");
    const finding = { category: "connection", title: "Compartilhar tradutores", explanation: "Necessidade e capacidade complementares.", priority: "medium", suggestedAction: "Confirmar disponibilidade", sourceObjectIds: [], detail: { evidence: [{ noteId: first.id, quote: first.contentText }, { noteId: second.id, quote: second.contentText }], impact: "Apoiar lançamento", limitation: "Capacidade não validada", priorityReason: "Lançamento", evidenceStrength: "supported", previousFindingId: null } };
    expect(validateAssistance({ ...empty, findings: [finding] }, payload).findings).toHaveLength(1);
    expect(validateAssistance({ ...empty, findings: [{ ...finding, detail: { ...finding.detail, evidence: [{ noteId: first.id, quote: "Inventado" }] } }] }, payload).findings).toHaveLength(0);
    expect(validateAssistance({ ...empty, findings: [{ ...finding, detail: { ...finding.detail, evidence: [finding.detail.evidence[0]] } }] }, payload).findings).toHaveLength(0);
  });
  it("preserves dismissed identity and old report evidence across runs and backup", () => {
    const first = note("Um", "Existe uma dependência.");
    const snapshot = prepareMacro({ scopeType: "note", scopeId: first.id });
    const run1 = createAnalysisRun(confirmMacro(snapshot.prepared!.previewId, [first.id]));
    const finding = { category: "risk" as const, title: "Dependência", explanation: "Versão original", priority: "medium" as const, confidence: 0, suggestedAction: "Verificar", sourceNoteIds: [first.id], sourceObjectIds: [], detail: { evidence: [{ noteId: first.id, quote: first.contentText }], impact: "Entrega", limitation: "Validar", priorityReason: "Dependência", evidenceStrength: "supported" as const, previousFindingId: null } };
    saveMacroReport(run1, [finding]);
    const id = getAnalysisRun(run1)!.findings![0].id;
    updateFinding(id, "dismissed");
    const run2 = createAnalysisRun(confirmMacro(snapshot.prepared!.previewId, [first.id]));
    saveMacroReport(run2, [{ ...finding, explanation: "Nova evidência", detail: { ...finding.detail, evidence: [{ noteId: first.id, quote: "Existe uma dependência" }], previousFindingId: id } }]);
    expect(listFindings()).toHaveLength(1);
    expect(getAnalysisRun(run2)!.findings![0]).toMatchObject({ id, status: "dismissed", explanation: "Nova evidência" });
    expect(getAnalysisRun(run2)!.findings![0].detail?.evidence).toHaveLength(2);
    expect(getAnalysisRun(run1)!.findings![0].explanation).toBe("Versão original");
    const historicalDeepen = prepareDeepen(id, run1);
    expect(getPrepared(historicalDeepen.previewId, "deepen").focus?.explanation).toBe("Versão original");
    restoreBackup(exportBackup());
    expect(getAnalysisRun(run1)!.findings![0].explanation).toBe("Versão original");
    expect(getAnalysisRun(run2)!.findings![0].status).toBe("dismissed");
    expect(getAiRecord(`report:${run2}`)).not.toBeNull();
  });
  it("loads v1 backups without AI columns and requires changes for incremental mode", () => {
    const first = note("Um", "Conteúdo completo.");
    const legacy = { ...exportBackup(), version: 1 };
    delete legacy.tables.ai_records;
    legacy.tables.findings.forEach((row) => { delete row.detail_json; });
    restoreBackup(legacy);
    const snapshot = prepareMacro({ scopeType: "note", scopeId: first.id });
    const run = createAnalysisRun(confirmMacro(snapshot.prepared!.previewId, [first.id]));
    saveMacroReport(run, []);
    expect(() => prepareMacro({ scopeType: "note", scopeId: first.id, mode: "incremental" })).toThrow("Nenhuma nota alterada");
    expect(getAppState().notes).toHaveLength(1);
  });
  it("reserves candidate space for another project", () => {
    const base = note("Base", "Compartilhar capacidade.");
    const project = (id: string) => ({ id, typeId: "type-project", typeName: "Projeto", typeIcon: "P", typeColor: "#000", name: id, description: "", archivedAt: null });
    const ranked = Array.from({ length: 10 }, (_, i) => ({ ...base, id: String(i), mentions: [project(i === 9 ? "cross" : "seed")] }));
    expect(diverseNotes(ranked, new Set(["seed"]), 5).some((n) => n.id === "9")).toBe(true);
  });
});
