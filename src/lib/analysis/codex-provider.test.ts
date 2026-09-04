import { describe, expect, it } from "vitest";
import type { AnalysisSnapshot, SpecialistOutput } from "@/lib/contracts";
import { CodexCliProvider, validateSources } from "./codex-provider";

const snapshot: AnalysisSnapshot = {
  scope: { type: "note", id: "note-1", label: "Test" },
  notes: [{ id: "note-1", title: "Test", content: "Content", updatedAt: new Date(0).toISOString(), objectIds: ["object-1"] }],
  objects: [{ id: "object-1", type: "Person", name: "Leonardo", description: "" }],
  relationships: [],
};

describe("specialist output validation", () => {
  it("removes invented sources and drops findings without valid evidence", () => {
    const output: SpecialistOutput = {
      summary: "Summary",
      findings: [
        { category: "risk", title: "Valid", explanation: "Evidence exists.", priority: "high", confidence: 80, suggestedAction: "Review", sourceNoteIds: ["note-1", "invented"], sourceObjectIds: [] },
        { category: "risk", title: "Invalid", explanation: "No evidence.", priority: "low", confidence: 30, suggestedAction: "", sourceNoteIds: ["invented"], sourceObjectIds: [] },
      ],
    };
    const validated = validateSources(output, snapshot, "gap");
    expect(validated.findings).toHaveLength(1);
    expect(validated.findings[0].sourceNoteIds).toEqual(["note-1"]);
    expect(validated.findings[0].category).toBe("gap");
  });

  it("accepts structured JSON from Codex and enforces the specialist category", async () => {
    const provider = new CodexCliProvider(async () => JSON.stringify({
      summary: "One risk found.",
      findings: [{
        category: "connection", title: "Dependency", explanation: "The note indicates a dependency.",
        priority: "high", confidence: 85, suggestedAction: "Review",
        sourceNoteIds: ["note-1"], sourceObjectIds: ["object-1"],
      }],
    }));
    const output = await provider.runStep({ step: "risks", snapshot, previousOutputs: [], signal: new AbortController().signal });
    expect(output.findings[0].category).toBe("risk");
  });

  it("rejects invalid JSON returned by the process", async () => {
    const provider = new CodexCliProvider(async () => "response without json");
    await expect(provider.runStep({ step: "gaps", snapshot, previousOutputs: [], signal: new AbortController().signal }))
      .rejects.toThrow("JSON válido");
  });

  it.each([
    ["timeout", new Error("O especialista excedeu o limite de três minutos.")],
    ["cancellation", new DOMException("Análise cancelada.", "AbortError")],
  ])("propagates a process %s without saving a response", async (_case, processError) => {
    const provider = new CodexCliProvider(async () => { throw processError; });
    await expect(provider.runStep({ step: "connections", snapshot, previousOutputs: [], signal: new AbortController().signal }))
      .rejects.toThrow(processError.message);
  });
});
