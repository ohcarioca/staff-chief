/** Read-only comparison. Never starts the provider or changes notes. */
import fs from "node:fs";
import { z } from "zod";
import { getAnalysisRun, getRunSnapshot } from "../src/lib/db/repository";

const assessment = z.object({
  runId: z.string(), usefulFindingIds: z.array(z.string()), supportedFindingIds: z.array(z.string()),
  repeatedFindingIds: z.array(z.string()), expectedSignals: z.number().int().min(0), foundSignals: z.number().int().min(0),
});
const schema = z.object({ baseline: assessment, candidate: assessment });
const filename = process.argv[2];
if (!filename) {
  console.error("Usage: pnpm compare:ai <human-ratings.json>. See docs/AI_EVALUATION.md. No model calls are made.");
  process.exitCode = 1;
} else {
  const ratings = schema.parse(JSON.parse(fs.readFileSync(filename, "utf8")));
  const reports = Object.entries(ratings).map(([label, rating]) => {
    const run = getAnalysisRun(rating.runId);
    if (!run) throw new Error(`Run not found: ${rating.runId}`);
    const findings = run.findings ?? [];
    for (const ids of [rating.usefulFindingIds, rating.supportedFindingIds, rating.repeatedFindingIds]) {
      if (new Set(ids).size !== ids.length || ids.some((id) => !findings.some((f) => f.id === id))) throw new Error(`Invalid finding IDs in ${label}`);
    }
    if (rating.foundSignals > rating.expectedSignals) throw new Error("Found signals cannot exceed expected signals.");
    const snapshot = getRunSnapshot(run.id);
    return {
      label, runId: run.id, scope: snapshot.scope, status: run.status, sourceNotes: snapshot.notes.length,
      contextCharacters: snapshot.notes.reduce((n, note) => n + note.content.length, 0), findings: findings.length,
      usefulFindings: rating.usefulFindingIds.length,
      precision: findings.length ? rating.supportedFindingIds.length / findings.length : null,
      signalRecall: rating.expectedSignals ? rating.foundSignals / rating.expectedSignals : null,
      falsePositives: findings.length - rating.supportedFindingIds.length,
      repeatedFindings: rating.repeatedFindingIds.length,
      latencyMs: run.completedAt ? Date.parse(run.completedAt) - Date.parse(run.createdAt) : null,
    };
  });
  console.log(JSON.stringify({ note: "Avaliação humana de utilidade, suporte, cobertura, repetição e latência. Considere diferenças de contexto ao comparar cobertura.", reports }, null, 2));
}
