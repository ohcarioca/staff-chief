import "server-only";

import type { SpecialistFinding, SpecialistOutput } from "@/lib/contracts";
import {
  getAnalysisRun,
  getRunSnapshot,
  getStepOutputs,
  replaceFindings,
  updateRun,
  updateStep,
} from "@/lib/db/repository";
import { CodexCliProvider } from "./codex-provider";
import type { SpecialistName } from "./provider";

const specialists: SpecialistName[] = ["connections", "risks", "contradictions", "gaps", "follow_ups"];
const controllers = new Map<string, AbortController>();

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Falha desconhecida na análise.";
}

function deduplicate(findings: SpecialistFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.category}:${finding.title.trim().toLocaleLowerCase("pt-BR")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

async function executePipeline(runId: string, retryOnly: boolean) {
  const provider = new CodexCliProvider();
  const controller = new AbortController();
  controllers.set(runId, controller);
  const snapshot = getRunSnapshot(runId);
  let failed = 0;
  try {
    updateRun(runId, "running");
    const existing = getAnalysisRun(runId);
    const failedNames = new Set(existing?.steps?.filter((step) => step.status === "failed").map((step) => step.name) ?? []);
    for (const specialist of specialists) {
      if (retryOnly && !failedNames.has(specialist)) continue;
      if (controller.signal.aborted) throw new DOMException("Análise cancelada.", "AbortError");
      updateStep(runId, specialist, "running");
      try {
        const output = await provider.runStep({ step: specialist, snapshot, previousOutputs: [], signal: controller.signal });
        updateStep(runId, specialist, "completed", { output });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        failed += 1;
        updateStep(runId, specialist, "failed", { error: errorMessage(error) });
      }
    }
    if (controller.signal.aborted) throw new DOMException("Análise cancelada.", "AbortError");
    const outputs = getStepOutputs(runId)
      .filter((step) => specialists.includes(step.name as SpecialistName) && step.status === "completed" && step.output)
      .map((step) => ({ specialist: step.name, output: step.output as unknown as SpecialistOutput }));
    updateStep(runId, "consolidation", "running");
    let finalFindings: SpecialistFinding[];
    try {
      const consolidated = await provider.runStep({ step: "consolidation", snapshot, previousOutputs: outputs, signal: controller.signal });
      updateStep(runId, "consolidation", "completed", { output: consolidated });
      finalFindings = consolidated.findings;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      failed += 1;
      updateStep(runId, "consolidation", "failed", { error: errorMessage(error) });
      finalFindings = deduplicate(outputs.flatMap((item) => item.output.findings));
    }
    replaceFindings(runId, finalFindings);
    updateRun(runId, failed > 0 ? "partial" : "completed", failed > 0 ? `${failed} etapa(s) não concluída(s).` : null);
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      getAnalysisRun(runId)?.steps?.filter((step) => step.status === "running").forEach((step) => updateStep(runId, step.name, "cancelled"));
      updateRun(runId, "cancelled", "Cancelada pelo usuário.");
    } else {
      updateRun(runId, "failed", errorMessage(error));
    }
  } finally {
    controllers.delete(runId);
  }
}

export function startAnalysis(runId: string, retryOnly = false) {
  if (controllers.has(runId)) throw new Error("Esta análise já está em execução.");
  setImmediate(() => { void executePipeline(runId, retryOnly); });
}

export function cancelAnalysis(runId: string) {
  const controller = controllers.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function retryAnalysis(runId: string) {
  const run = getAnalysisRun(runId);
  if (!run) throw new Error("Análise não encontrada.");
  if (!run.steps?.some((step) => step.status === "failed")) throw new Error("Não há etapas com falha para repetir.");
  updateStep(runId, "consolidation", "queued", { error: null });
  startAnalysis(runId, true);
}
