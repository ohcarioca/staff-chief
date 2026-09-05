import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabase, normalizeName, resetDatabaseForTests } from "./client";
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

describe("local knowledge base", () => {
  it("normalizes names without distinguishing accents or letter case", () => {
    expect(normalizeName("  LÉONARDO  ")).toBe("leonardo");
  });

  it("extracts searchable text from a TipTap document", () => {
    expect(textFromDocument({ type: "doc", content: [{ type: "paragraph", content: [{ text: "Meeting with " }, { type: "mention", attrs: { label: "Leonardo" } }] }] })).toBe("Meeting with @Leonardo");
  });

  it("creates an object from a mention and reuses it without duplication", () => {
    const document = (label: string) => ({
      type: "doc", content: [{ type: "paragraph", content: [{ text: "Spoke with " }, {
        type: "mention", attrs: { id: `new:${crypto.randomUUID()}`, label, typeId: "type-person", typeLabel: "Person", color: "#45A886", isNew: true },
      }] }],
    });
    const first = saveNote({ title: "First", contentJson: document("Leonardo") });
    const second = saveNote({ title: "Second", contentJson: document("LEONARDO") });
    const state = getAppState();
    expect(state.objects).toHaveLength(1);
    expect(first.mentions[0].id).toBe(second.mentions[0].id);
    expect(getAppState("Leonardo").notes).toHaveLength(2);
  });

  it("builds a subgraph from a note and its direct connections", () => {
    const state = getAppState();
    const snapshot = buildAnalysisSnapshot("note", state.notes[0].id);
    expect(snapshot.notes).toHaveLength(2);
    expect(snapshot.objects[0].name).toBe("Leonardo");
    expect(snapshot.scope.type).toBe("note");
  });

  it("builds a multi-note snapshot constrained by the calendar range", () => {
    const [recentNote, olderNote] = getAppState().notes;
    getDatabase().sqlite.prepare("UPDATE notes SET updated_at = ? WHERE id = ?").run("2026-09-04T12:00:00.000Z", recentNote.id);
    getDatabase().sqlite.prepare("UPDATE notes SET updated_at = ? WHERE id = ?").run("2026-08-15T12:00:00.000Z", olderNote.id);

    const dateRange = { start: "2026-09-01", end: "2026-09-30" };
    const snapshot = buildAnalysisSnapshot("collection", "selection", [recentNote.id, olderNote.id], dateRange);
    expect(snapshot.scope.type).toBe("collection");
    expect(snapshot.scope.dateRange).toEqual(dateRange);
    expect(snapshot.scope.label).toContain("Seleção de 1 nota");
    expect(snapshot.notes.map((note) => note.id)).toEqual([recentNote.id]);

    const runId = createAnalysisRun(snapshot, ["risks"]);
    expect(getAnalysisRun(runId)?.scopeType).toBe("collection");
  });

  it("exports and restores a versioned database with a safety copy", () => {
    const backup = exportBackup();
    const safetyPath = restoreBackup(backup);
    expect(backup.version).toBe(4);
    expect(fs.existsSync(safetyPath)).toBe(true);
    expect(getAppState().notes).toHaveLength(2);
  });

  it("rejects unexpected backup columns before executing restore SQL", () => {
    const backup = structuredClone(exportBackup());
    backup.tables.notes[0].unexpected_column = "unsafe";
    expect(() => restoreBackup(backup)).toThrow("colunas inesperadas");
    expect(getAppState().notes).toHaveLength(2);
  });

  it("keeps the snapshot immutable and records partial analysis states", () => {
    const snapshot = buildAnalysisSnapshot("note", getAppState().notes[0].id);
    const runId = createAnalysisRun(snapshot);
    updateStep(runId, "macro", "completed", { output: { summary: "ok", findings: [] } });
    updateStep(runId, "macro", "failed", { error: "simulated failure" });
    replaceFindings(runId, [{
      category: "follow_up", title: "Resume conversation", explanation: "The note needs follow-up.",
      priority: "medium", confidence: 70, suggestedAction: "Schedule a conversation",
      sourceNoteIds: [snapshot.notes[0].id], sourceObjectIds: [snapshot.objects[0].id],
    }]);
    updateRun(runId, "partial", "1 step did not complete.");
    const run = getAnalysisRun(runId);
    expect(run?.status).toBe("partial");
    expect(run?.steps?.find((step) => step.name === "macro")?.status).toBe("failed");
    expect(run?.findings?.[0].status).toBe("open");
    expect(getRunSnapshot(runId)).toEqual({ ...snapshot, analysisTypes: ["connections"] });
  });

  it("creates one macro step while preserving the selected lenses", () => {
    const snapshot = buildAnalysisSnapshot("note", getAppState().notes[0].id);
    const runId = createAnalysisRun(snapshot, ["risks", "gaps"]);
    expect(getAnalysisRun(runId)?.steps?.map((step) => step.name)).toEqual(["macro"]);
    expect(getRunSnapshot(runId).analysisTypes).toEqual(["risks", "gaps"]);
  });

  it("archives notes, objects, and types without removing them from the backup", () => {
    const typeId = createObjectType({ name: "Department", icon: "D", color: "#336699" });
    const note = saveNote({
      title: "Finance Department",
      contentJson: { type: "doc", content: [{ type: "paragraph", content: [{
        type: "mention", attrs: { id: "new:department", label: "Finance", typeId, typeLabel: "Department", color: "#336699", isNew: true },
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
