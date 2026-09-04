"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Circle, LoaderCircle, RefreshCw, Sparkles, Square, X } from "lucide-react";
import type { AnalysisRunRecord, AnalysisSnapshot, AnalysisType, FindingRecord, KnowledgeObjectRecord, NoteRecord } from "@/lib/contracts";

type Scope = { type: "note" | "object"; id: string };

interface AnalysisDialogProps {
  scope: Scope | null;
  existingRunId?: string | null;
  notes: NoteRecord[];
  objects: KnowledgeObjectRecord[];
  onOpenSource(type: "note" | "object", id: string): void;
  onClose(): void;
  onChanged(): void | Promise<void>;
  analysisTypes?: AnalysisType[];
}

const stepLabels: Record<string, string> = {
  connections: "Conexões e oportunidades",
  risks: "Riscos",
  contradictions: "Contradições",
  gaps: "Lacunas",
  follow_ups: "Follow-ups",
  consolidation: "Consolidação",
};

const categoryLabels: Record<string, string> = {
  connection: "Conexão", risk: "Risco", contradiction: "Contradição", gap: "Lacuna", follow_up: "Follow-up",
};

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "A operação falhou.");
  return data;
}

export function AnalysisDialog({ scope, existingRunId, notes, objects, onOpenSource, onClose, onChanged, analysisTypes }: AnalysisDialogProps) {
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<AnalysisRunRecord | null>(null);
  const [runId, setRunId] = useState<string | null>(existingRunId ?? null);
  const [loading, setLoading] = useState(Boolean(scope && !existingRunId));
  const [error, setError] = useState("");
  const [streamVersion, setStreamVersion] = useState(0);
  const terminal = run ? ["completed", "partial", "failed", "cancelled"].includes(run.status) : false;

  useEffect(() => {
    if (!scope || existingRunId) return;
    let active = true;
    fetch("/api/analysis/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id }),
    }).then(readJson).then((data: AnalysisSnapshot) => {
      if (!active) return;
      setSnapshot(data);
      setSelectedNotes(new Set(data.notes.slice(0, 50).map((note) => note.id)));
    }).catch((previewError) => {
      if (!active) return;
      setError(previewError instanceof Error ? previewError.message : "Falha ao preparar a análise.");
    })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, existingRunId]);

  useEffect(() => {
    if (!runId) return;
    const source = new EventSource(`/api/analysis/${runId}/events`);
    source.onmessage = (event) => {
      const nextRun = JSON.parse(event.data) as AnalysisRunRecord;
      setRun(nextRun);
      if (["completed", "partial", "failed", "cancelled"].includes(nextRun.status)) {
        source.close();
        void onChanged();
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [runId, onChanged, streamVersion]);

  const selectedCount = selectedNotes.size;
  const highCount = useMemo(() => run?.findings?.filter((finding) => finding.priority === "high" && finding.status === "open").length ?? 0, [run]);

  if (!scope && !existingRunId) return null;

  const start = async () => {
    if (!scope || !snapshot || selectedCount > 50) return;
    setLoading(true);
    setError("");
    try {
      const result = await readJson(await fetch("/api/analysis/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, selectedNoteIds: [...selectedNotes], analysisTypes }),
      }));
      setRunId(result.runId);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Falha ao iniciar.");
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (!runId) return;
    await fetch(`/api/analysis/${runId}/cancel`, { method: "POST" });
  };

  const retry = async () => {
    if (!runId) return;
    setError("");
    try {
      await readJson(await fetch(`/api/analysis/${runId}/retry`, { method: "POST" }));
      setRun((current) => current ? { ...current, status: "running" } : current);
      setStreamVersion((version) => version + 1);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Falha ao repetir.");
    }
  };

  const actOnFinding = async (finding: FindingRecord, action: "resolved" | "dismissed" | "accept") => {
    try {
      const body = action === "accept" ? { action: "accept" } : { action: "status", status: action };
      await readJson(await fetch(`/api/findings/${finding.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      setRun((current) => current ? { ...current, findings: current.findings?.map((item) => item.id === finding.id ? { ...item, status: action === "dismissed" ? "dismissed" : "resolved" } : item) } : current);
      void onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível atualizar o achado.");
    }
  };

  return <div className="dialog-backdrop" role="presentation">
    <section className="analysis-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-title">
      <header className="dialog-header">
        <div className="dialog-title-mark"><Sparkles size={18} /></div>
        <div><span className="eyebrow">Codex · execução manual</span><h2 id="analysis-title">{runId ? "Relatório de análise" : "Revisar contexto"}</h2></div>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </header>

      {!runId && <div className="dialog-body preview-body">
        {loading && <div className="loading-row"><LoaderCircle className="spin" size={18} /> Preparando o subgrafo…</div>}
        {snapshot && <>
          <div className="scope-card"><span>Escopo selecionado</span><strong>{snapshot.scope.label}</strong><small>{snapshot.objects.length} objetos · {snapshot.notes.length} notas relacionadas</small></div>
          {analysisTypes?.length && <div className="analysis-selection-summary"><span>Especialistas selecionados</span><div>{analysisTypes.map((type) => <strong key={type}>{stepLabels[type]}</strong>)}</div></div>}
          <div className="privacy-notice"><AlertTriangle size={17} /><p><strong>Confirme antes do envio.</strong> Somente os itens marcados abaixo serão enviados ao Codex usando sua sessão local. Nada será alterado automaticamente.</p></div>
          <div className="preview-section-title"><strong>Notas incluídas</strong><span>{selectedCount}/50</span></div>
          <div className="preview-list">
            {snapshot.notes.map((note) => <label key={note.id} className="preview-note">
              <input type="checkbox" checked={selectedNotes.has(note.id)} onChange={(event) => setSelectedNotes((current) => {
                const next = new Set(current); if (event.target.checked) next.add(note.id); else next.delete(note.id); return next;
              })} />
              <span><strong>{note.title}</strong><small>{note.content.slice(0, 140) || "Nota vazia"}</small></span>
            </label>)}
          </div>
          {!!snapshot.objects.length && <div className="object-preview-row">{snapshot.objects.map((object) => <span key={object.id}>{object.type}: {object.name}</span>)}</div>}
        </>}
        {error && <p className="inline-error">{error}</p>}
      </div>}

      {runId && <div className="dialog-body report-body">
        {!run && <div className="loading-row"><LoaderCircle className="spin" size={18} /> Abrindo relatório…</div>}
        {run && <>
          <div className={`run-banner run-${run.status}`}>
            <div><span className="status-pulse" /><strong>{run.status === "running" || run.status === "queued" ? "Análise em andamento" : run.status === "completed" ? "Análise concluída" : run.status === "partial" ? "Relatório parcial" : run.status === "cancelled" ? "Análise cancelada" : "Falha na análise"}</strong></div>
            {highCount > 0 && <span>{highCount} prioridade{highCount === 1 ? "" : "s"} alta{highCount === 1 ? "" : "s"}</span>}
          </div>
          <div className="step-list">
            {run.steps?.map((step) => <div className={`step-row step-${step.status}`} key={step.id}>
              {step.status === "running" ? <LoaderCircle className="spin" size={15} /> : step.status === "completed" ? <Check size={15} /> : step.status === "failed" ? <AlertTriangle size={15} /> : <Circle size={13} />}
              <span>{stepLabels[step.name] ?? step.name}</span>
              <small>{step.status === "running" ? "analisando" : step.status === "completed" ? "concluído" : step.status === "failed" ? "falhou" : step.status}</small>
            </div>)}
          </div>
          {!!run.findings?.length && <div className="finding-list">
            {run.findings.map((finding) => <article key={finding.id} className={`finding-card priority-${finding.priority} finding-${finding.status}`}>
              <div className="finding-meta"><span>{categoryLabels[finding.category]}</span><span>{finding.priority === "high" ? "Alta" : finding.priority === "medium" ? "Média" : "Baixa"} · {finding.confidence}%</span></div>
              <h3>{finding.title}</h3><p>{finding.explanation}</p>
              {finding.suggestedAction && <div className="suggested-action"><ChevronRight size={14} /><span>{finding.suggestedAction}</span></div>}
              <div className="finding-sources">
                {finding.sourceNoteIds.map((sourceId) => <button key={`note:${sourceId}`} onClick={() => onOpenSource("note", sourceId)}>Nota: {notes.find((note) => note.id === sourceId)?.title || notes.find((note) => note.id === sourceId)?.contentText.slice(0, 32) || sourceId}</button>)}
                {finding.sourceObjectIds.map((sourceId) => <button key={`object:${sourceId}`} onClick={() => onOpenSource("object", sourceId)}>Objeto: {objects.find((object) => object.id === sourceId)?.name || sourceId}</button>)}
              </div>
              {finding.status === "open" && <div className="finding-actions">
                {finding.category === "connection" && finding.sourceObjectIds.length >= 2 && <button onClick={() => actOnFinding(finding, "accept")}>Aceitar relação</button>}
                <button onClick={() => actOnFinding(finding, "resolved")}>Resolver</button>
                <button onClick={() => actOnFinding(finding, "dismissed")}>Descartar</button>
              </div>}
            </article>)}
          </div>}
          {terminal && !run.findings?.length && <div className="empty-report"><Sparkles size={24} /><h3>Nenhum achado sustentado pelas fontes</h3><p>O relatório foi preservado, mas os especialistas não encontraram evidências suficientes.</p></div>}
          {(run.error || error) && <p className="inline-error">{error || run.error}</p>}
        </>}
      </div>}

      <footer className="dialog-footer">
        {!runId ? <><button className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={start} disabled={loading || !snapshot || selectedCount > 50}><Sparkles size={15} /> Confirmar e analisar</button></>
          : run && !terminal ? <button className="danger-button" onClick={cancel}><Square size={13} /> Cancelar execução</button>
            : <><button className="ghost-button" onClick={onClose}>Fechar</button>{run?.steps?.some((step) => step.status === "failed") && <button className="secondary-button" onClick={retry}><RefreshCw size={14} /> Tentar falhas novamente</button>}</>}
      </footer>
    </section>
  </div>;
}
