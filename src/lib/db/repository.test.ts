import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeName, resetDatabaseForTests } from "./client";
import {
  archiveItem, buildAnalysisSnapshot, createAnalysisRun, createObjectType, exportBackup,
  getAnalysisRun, getAppState, getRunSnapshot, replaceFindings, restoreBackup, saveNote, textFromDocument,
  updateRun, updateStep,
} from "./repository";

let temporaryDirectory = "";

beforeAll(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "staff-chief-test-"));
  process.env.STAFF_CHIEF_DATA_DIR = temporaryDirectory;
  resetDatabaseForTests();
});

afterAll(() => {
  resetDatabaseForTests();
  delete process.env.STAFF_CHIEF_DATA_DIR;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("base local de conhecimento", () => {
  it("normaliza nomes sem diferenciar acentos e maiúsculas", () => {
    expect(normalizeName("  LÉONARDO  ")).toBe("leonardo");
  });

  it("extrai texto pesquisável de um documento TipTap", () => {
    expect(textFromDocument({ type: "doc", content: [{ type: "paragraph", content: [{ text: "Reunião com " }, { type: "mention", attrs: { label: "Leonardo" } }] }] })).toBe("Reunião com @Leonardo");
  });

  it("cria um objeto pela menção e o reutiliza sem duplicar", () => {
    const document = (label: string) => ({
      type: "doc", content: [{ type: "paragraph", content: [{ text: "Conversei com " }, {
        type: "mention", attrs: { id: `new:${crypto.randomUUID()}`, label, typeId: "type-person", typeLabel: "Pessoa", color: "#45A886", isNew: true },
      }] }],
    });
    const first = saveNote({ title: "Primeira", contentJson: document("Leonardo") });
    const second = saveNote({ title: "Segunda", contentJson: document("LEONARDO") });
    const state = getAppState();
    expect(state.objects).toHaveLength(1);
    expect(first.mentions[0].id).toBe(second.mentions[0].id);
    expect(getAppState("Leonardo").notes).toHaveLength(2);
  });

  it("monta um subgrafo de uma nota e suas conexões diretas", () => {
    const state = getAppState();
    const snapshot = buildAnalysisSnapshot("note", state.notes[0].id);
    expect(snapshot.notes).toHaveLength(2);
    expect(snapshot.objects[0].name).toBe("Leonardo");
    expect(snapshot.scope.type).toBe("note");
  });

  it("exporta e restaura uma base versionada criando cópia de segurança", () => {
    const backup = exportBackup();
    const safetyPath = restoreBackup(backup);
    expect(backup.version).toBe(1);
    expect(fs.existsSync(safetyPath)).toBe(true);
    expect(getAppState().notes).toHaveLength(2);
  });

  it("mantém o snapshot imutável e registra estados parciais da análise", () => {
    const snapshot = buildAnalysisSnapshot("note", getAppState().notes[0].id);
    const runId = createAnalysisRun(snapshot);
    updateStep(runId, "connections", "completed", { output: { summary: "ok", findings: [] } });
    updateStep(runId, "risks", "failed", { error: "falha simulada" });
    replaceFindings(runId, [{
      category: "follow_up", title: "Retomar conversa", explanation: "A nota pede acompanhamento.",
      priority: "medium", confidence: 70, suggestedAction: "Agendar conversa",
      sourceNoteIds: [snapshot.notes[0].id], sourceObjectIds: [snapshot.objects[0].id],
    }]);
    updateRun(runId, "partial", "1 etapa não concluída.");
    const run = getAnalysisRun(runId);
    expect(run?.status).toBe("partial");
    expect(run?.steps?.find((step) => step.name === "risks")?.status).toBe("failed");
    expect(run?.findings?.[0].status).toBe("open");
    expect(getRunSnapshot(runId)).toEqual(snapshot);
  });

  it("arquiva notas, objetos e tipos sem removê-los do backup", () => {
    const typeId = createObjectType({ name: "Área", icon: "A", color: "#336699" });
    const note = saveNote({
      title: "Área Financeira",
      contentJson: { type: "doc", content: [{ type: "paragraph", content: [{
        type: "mention", attrs: { id: "new:area", label: "Financeiro", typeId, typeLabel: "Área", color: "#336699", isNew: true },
      }] }] },
    });
    const objectId = note.mentions[0].id;
    archiveItem("note", note.id);
    archiveItem("object", objectId);
    archiveItem("type", typeId);
    expect(getAppState().notes.some((item) => item.id === note.id)).toBe(false);
    const backup = exportBackup();
    expect(backup.tables.notes.some((item) => item.id === note.id && item.archived_at)).toBe(true);
    expect(backup.tables.objects.some((item) => item.id === objectId && item.archived_at)).toBe(true);
    expect(backup.tables.object_types.some((item) => item.id === typeId && item.archived_at)).toBe(true);
  });
});
