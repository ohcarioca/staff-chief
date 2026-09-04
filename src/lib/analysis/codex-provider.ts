import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import type { AnalysisSnapshot, FindingCategory, SpecialistOutput } from "@/lib/contracts";
import type { AnalysisProvider, SpecialistName } from "./provider";

const categorySchema = z.enum(["connection", "risk", "contradiction", "gap", "follow_up"]);
const outputSchema = z.object({
  summary: z.string().max(2000),
  findings: z.array(z.object({
    category: categorySchema,
    title: z.string().min(1).max(180),
    explanation: z.string().min(1).max(3000),
    priority: z.enum(["low", "medium", "high"]),
    confidence: z.number().int().min(0).max(100),
    suggestedAction: z.string().max(1000),
    sourceNoteIds: z.array(z.string()),
    sourceObjectIds: z.array(z.string()),
  })).max(20),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string", enum: ["connection", "risk", "contradiction", "gap", "follow_up"] },
          title: { type: "string" },
          explanation: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          suggestedAction: { type: "string" },
          sourceNoteIds: { type: "array", items: { type: "string" } },
          sourceObjectIds: { type: "array", items: { type: "string" } },
        },
        required: ["category", "title", "explanation", "priority", "confidence", "suggestedAction", "sourceNoteIds", "sourceObjectIds"],
      },
    },
  },
  required: ["summary", "findings"],
} as const;

const specialties: Record<Exclude<SpecialistName, "consolidation">, { label: string; category: FindingCategory; instruction: string }> = {
  connections: {
    label: "connections and opportunities", category: "connection",
    instruction: "Identify useful connections, patterns, and concrete opportunities across people, projects, and ideas.",
  },
  risks: {
    label: "risks", category: "risk",
    instruction: "Identify concrete management risks, fragile dependencies, delay signals, and issues that need attention.",
  },
  contradictions: {
    label: "contradictions", category: "contradiction",
    instruction: "Identify incompatible statements, changes in direction, or information that needs reconciliation.",
  },
  gaps: {
    label: "gaps", category: "gap",
    instruction: "Identify missing context, owners, criteria, decisions, or next pieces of information.",
  },
  follow_ups: {
    label: "follow-ups", category: "follow_up",
    instruction: "Propose specific, useful, and actionable follow-ups derived directly from the notes.",
  },
};

function buildPrompt(step: SpecialistName, snapshot: AnalysisSnapshot, previousOutputs: Array<{ specialist: string; output: SpecialistOutput }>) {
  const rules = `You are part of a personal management knowledge system. Analyze only the supplied data.
Do not use tools, read files, or browse the web. Do not invent facts.
Every conclusion must cite at least one existing ID in sourceNoteIds or sourceObjectIds.
Write all user-facing content in Brazilian Portuguese, be direct, and return only the requested JSON.`;
  if (step === "consolidation") {
    return `${rules}\n\nTask: consolidate the specialist results. Remove duplicates, preserve relevant disagreements, and keep at most 20 priority findings. Do not create new sources.\n\nDATA:\n${JSON.stringify({ snapshot, specialistOutputs: previousOutputs })}`;
  }
  const specialty = specialties[step];
  return `${rules}\n\nYou are the ${specialty.label} specialist. ${specialty.instruction}
Every finding must use category="${specialty.category}". If there is insufficient evidence, return an empty findings array.\n\nDATA:\n${JSON.stringify(snapshot)}`;
}

export function validateSources(output: SpecialistOutput, snapshot: AnalysisSnapshot, expectedCategory?: FindingCategory): SpecialistOutput {
  const noteIds = new Set(snapshot.notes.map((note) => note.id));
  const objectIds = new Set(snapshot.objects.map((object) => object.id));
  return {
    summary: output.summary,
    findings: output.findings
      .map((finding) => ({
        ...finding,
        category: expectedCategory ?? finding.category,
        sourceNoteIds: [...new Set(finding.sourceNoteIds.filter((sourceId) => noteIds.has(sourceId)))],
        sourceObjectIds: [...new Set(finding.sourceObjectIds.filter((sourceId) => objectIds.has(sourceId)))],
      }))
      .filter((finding) => finding.sourceNoteIds.length + finding.sourceObjectIds.length > 0),
  };
}

export class CodexCliProvider implements AnalysisProvider {
  readonly id = "codex-cli";

  constructor(private readonly executor?: (prompt: string, schemaPath: string, cwd: string, signal: AbortSignal) => Promise<string>) {}

  async runStep({ step, snapshot, previousOutputs, signal }: Parameters<AnalysisProvider["runStep"]>[0]) {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "staff-chief-analysis-"));
    const schemaPath = path.join(temporaryDirectory, "output-schema.json");
    await fs.writeFile(schemaPath, JSON.stringify(jsonSchema), "utf8");
    const prompt = buildPrompt(step, snapshot, previousOutputs);
    try {
      const rawOutput = await this.execute(prompt, schemaPath, temporaryDirectory, signal);
      const start = rawOutput.indexOf("{");
      const end = rawOutput.lastIndexOf("}");
      if (start < 0 || end < start) throw new Error("O Codex não retornou JSON válido.");
      const parsed = outputSchema.parse(JSON.parse(rawOutput.slice(start, end + 1)));
      const expectedCategory = step === "consolidation" ? undefined : specialties[step].category;
      return validateSources(parsed, snapshot, expectedCategory);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  protected execute(prompt: string, schemaPath: string, cwd: string, signal: AbortSignal) {
    if (this.executor) return this.executor(prompt, schemaPath, cwd, signal);
    return new Promise<string>((resolve, reject) => {
      const codexBinary = process.env.CODEX_BIN || "codex";
      const child = spawn(/* turbopackIgnore: true */ codexBinary, [
        "exec", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check",
        "--output-schema", schemaPath, "-",
      ], { cwd, windowsHide: true, shell: false });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(stdout.trim());
      };
      const abort = () => {
        child.kill();
        finish(new DOMException("Análise cancelada.", "AbortError"));
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish(new Error("O especialista excedeu o limite de três minutos."));
      }, 180_000);
      signal.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", (error) => finish(new Error(`Não foi possível iniciar o Codex CLI: ${error.message}`)));
      child.on("close", (code) => {
        if (signal.aborted) return abort();
        if (code !== 0) finish(new Error(stderr.trim().slice(-1200) || `Codex encerrou com código ${code}.`));
        else finish();
      });
      child.stdin.end(prompt, "utf8");
    });
  }
}
