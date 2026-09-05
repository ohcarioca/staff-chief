"use client";

import { useState } from "react";
import type { AiPreview, AssistanceResult, KnowledgeObjectRecord, NoteRecord } from "@/lib/contracts";
import { FindingContent, SuggestedAction } from "./finding-content";

export function FindingDeepen({ findingId, runId, notes, objects, onOpenSource }: { findingId: string; runId: string; notes: NoteRecord[]; objects: KnowledgeObjectRecord[]; onOpenSource(type: "note" | "object", id: string): void }) {
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [result, setResult] = useState<AssistanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = async (execute: boolean) => {
    if (busy || (execute && (!preview || preview.overLimit))) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/assistance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(execute ? { action: "execute", operation: "deepen", previewId: preview?.previewId } : { action: "deepen", findingId, runId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível obter mais detalhes.");
      if (execute) { setResult(data); setPreview(null); } else { setPreview(data); setResult(null); }
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível obter mais detalhes."); }
    finally { setBusy(false); }
  };
  return <div className="ai-deepen">
    <button type="button" disabled={busy} onClick={() => void request(false)}>{busy ? "Aguarde…" : "Pedir mais detalhes"}</button>
    <p className="analysis-help">Prepara uma nova consulta à IA com as fontes desta sugestão. Você confere antes do envio.</p>
    {preview && <div className="ai-review"><h3>Conferir envio para obter mais detalhes</h3><p>{preview.notice}</p>{preview.sources.map((source) => <details key={source.id}><summary>{source.title || "Nota sem título"}</summary><blockquote>{source.content}</blockquote></details>)}{preview.overLimit && <p role="alert">O contexto está amplo demais para aprofundar com qualidade.</p>}<div className="ai-actions"><button disabled={busy || preview.overLimit} onClick={() => void request(true)}>Confirmar e pedir detalhes</button><button disabled={busy} onClick={() => setPreview(null)}>Cancelar</button></div></div>}
    {result && <div className="ai-review" role="region" aria-label="Mais detalhes da sugestão"><h3>Mais detalhes</h3><p className="analysis-help">Esta consulta não altera a sugestão original.</p>{!result.findings.length && <p>Nenhuma evidência adicional sustentada pelas fontes.</p>}{result.findings.map((finding, index) => <article key={index}><h3>{finding.title}</h3><SuggestedAction action={finding.suggestedAction} /><FindingContent finding={finding} notes={notes} objects={objects} onOpenSource={onOpenSource} /></article>)}<button onClick={() => setResult(null)}>Fechar detalhes adicionais</button></div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
