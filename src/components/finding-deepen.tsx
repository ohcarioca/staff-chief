"use client";
import { useState } from "react";
import type { AiPreview, AssistanceResult } from "@/lib/contracts";

export function FindingDeepen({ findingId, runId }: { findingId: string; runId: string }) {
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [result, setResult] = useState<AssistanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = async (execute: boolean) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/assistance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(execute ? { action: "execute", operation: "deepen", previewId: preview?.previewId } : { action: "deepen", findingId, runId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha no aprofundamento.");
      if (execute) { setResult(data); setPreview(null); } else setPreview(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no aprofundamento."); }
    finally { setBusy(false); }
  };
  return <div className="ai-deepen"><button type="button" disabled={busy} onClick={() => void request(false)}>{busy ? "Aguarde…" : "Aprofundar"}</button>
    {preview && <div className="ai-review"><p>{preview.notice}</p>{preview.sources.map((s) => <details key={s.id}><summary>{s.title} · {s.updatedAt}</summary><blockquote>{s.content}</blockquote></details>)}{preview.overLimit && <p>O contexto está amplo demais para aprofundar com qualidade.</p>}<button disabled={busy || preview.overLimit} onClick={() => void request(true)}>Confirmar aprofundamento</button><button onClick={() => setPreview(null)}>Cancelar</button></div>}
    {result && <div className="ai-review">{!result.findings.length && <p>Nenhuma evidência adicional sustentada.</p>}{result.findings.map((f, i) => <article key={i}><strong>{f.title}</strong><p>{f.explanation}</p><p>{f.detail?.impact}</p>{f.detail?.evidence.map((e, j) => <blockquote key={j}>{e.quote}<small>{e.noteId}</small></blockquote>)}<p>Limitação: {f.detail?.limitation}</p><p>{f.suggestedAction}</p></article>)}<button onClick={() => setResult(null)}>Fechar aprofundamento</button></div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
