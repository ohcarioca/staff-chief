import { describe, expect, it } from "vitest";
import type { AnalysisSnapshot, SpecialistOutput } from "@/lib/contracts";
import { CodexCliProvider, validateSources } from "./codex-provider";

const snapshot: AnalysisSnapshot = {
  scope: { type: "note", id: "note-1", label: "Teste" },
  notes: [{ id: "note-1", title: "Teste", content: "Conteúdo", updatedAt: new Date(0).toISOString(), objectIds: ["object-1"] }],
  objects: [{ id: "object-1", type: "Pessoa", name: "Leonardo", description: "" }],
  relationships: [],
};

describe("validação de saída dos especialistas", () => {
  it("remove fontes inventadas e descarta achados sem evidência válida", () => {
    const output: SpecialistOutput = {
      summary: "Resumo",
      findings: [
        { category: "risk", title: "Válido", explanation: "Há evidência.", priority: "high", confidence: 80, suggestedAction: "Revisar", sourceNoteIds: ["note-1", "inventada"], sourceObjectIds: [] },
        { category: "risk", title: "Inválido", explanation: "Sem evidência.", priority: "low", confidence: 30, suggestedAction: "", sourceNoteIds: ["inventada"], sourceObjectIds: [] },
      ],
    };
    const validated = validateSources(output, snapshot, "gap");
    expect(validated.findings).toHaveLength(1);
    expect(validated.findings[0].sourceNoteIds).toEqual(["note-1"]);
    expect(validated.findings[0].category).toBe("gap");
  });

  it("aceita JSON estruturado do processo Codex e fixa a categoria do especialista", async () => {
    const provider = new CodexCliProvider(async () => JSON.stringify({
      summary: "Um risco encontrado.",
      findings: [{
        category: "connection", title: "Dependência", explanation: "A nota indica dependência.",
        priority: "high", confidence: 85, suggestedAction: "Revisar",
        sourceNoteIds: ["note-1"], sourceObjectIds: ["object-1"],
      }],
    }));
    const output = await provider.runStep({ step: "risks", snapshot, previousOutputs: [], signal: new AbortController().signal });
    expect(output.findings[0].category).toBe("risk");
  });

  it("rejeita JSON inválido devolvido pelo processo", async () => {
    const provider = new CodexCliProvider(async () => "resposta sem json");
    await expect(provider.runStep({ step: "gaps", snapshot, previousOutputs: [], signal: new AbortController().signal }))
      .rejects.toThrow("JSON válido");
  });

  it.each([
    ["timeout", new Error("O especialista excedeu o limite de três minutos.")],
    ["cancelamento", new DOMException("Análise cancelada.", "AbortError")],
  ])("propaga %s do processo sem salvar uma resposta", async (_case, processError) => {
    const provider = new CodexCliProvider(async () => { throw processError; });
    await expect(provider.runStep({ step: "connections", snapshot, previousOutputs: [], signal: new AbortController().signal }))
      .rejects.toThrow(processError.message);
  });
});
