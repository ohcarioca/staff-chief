"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Circle, LoaderCircle, RefreshCw, Sparkles, Square, X } from "lucide-react";
import type { AnalysisDateRange, AnalysisRunRecord, AnalysisScope, AnalysisSnapshot, AnalysisType, FindingRecord, KnowledgeObjectRecord, NoteRecord } from "@/lib/contracts";
import { FindingDeepen } from "./finding-deepen";
import { FindingContent, SuggestedAction } from "./finding-content";
import { FindingConnection } from "./finding-connection";
import { AnalysisProgress, findingStatusLabels, periodLabel, priorityLabels, priorityOrder, runStatusLabels, useAnalysisDialog } from "./analysis-ui";

interface AnalysisDialogProps {
  scope: AnalysisScope | null;
  existingRunId?: string | null;
  initialFindingId?: string | null;
  initialNoteIds?: string[];
  dateRange?: AnalysisDateRange;
  mode?: "full" | "incremental";
  notes: NoteRecord[];
  objects: KnowledgeObjectRecord[];
  onOpenSource(type: "note" | "object", id: string, runId: string, findingId: string): void;
  onClose(): void;
  onBack?(): void;
  onChanged(): void | Promise<void>;
  analysisTypes?: AnalysisType[];
}

const stepLabels: Record<string, string> = { macro: "Análise integrada", connections: "Conexões e oportunidades", risks: "Riscos", contradictions: "Contradições", gaps: "Lacunas", follow_ups: "Próximos passos", consolidation: "Consolidação" };
const categoryLabels: Record<string, string> = { connection: "Conexão", risk: "Risco", contradiction: "Contradição", gap: "Lacuna", follow_up: "Próximo passo" };
const stepStatusLabels: Record<string, string> = { queued: "aguardando", running: "analisando", completed: "concluído", failed: "falhou", cancelled: "cancelado" };
const isTerminal = (run: AnalysisRunRecord) => ["completed", "partial", "failed", "cancelled"].includes(run.status);

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "A operação falhou.");
  return data;
}

export function AnalysisDialog({ scope, existingRunId, initialFindingId, initialNoteIds, dateRange, mode = "full", notes, objects, onOpenSource, onClose, onBack, onChanged, analysisTypes }: AnalysisDialogProps) {
  const dialogRef = useAnalysisDialog(onClose);
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [run, setRun] = useState<AnalysisRunRecord | null>(null);
  const [runId, setRunId] = useState<string | null>(existingRunId ?? null);
  const [loading, setLoading] = useState(Boolean(scope && !existingRunId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [streamError, setStreamError] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(initialFindingId ?? null);
  const requestPending = useRef(false);
  const terminal = run ? isTerminal(run) : false;
  const reportChanged = useEffectEvent(() => { void onChanged(); });

  useEffect(() => {
    if (!scope || existingRunId) return;
    let active = true;
    fetch("/api/analysis/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, selectedNoteIds: initialNoteIds, dateRange, mode, analysisTypes }),
    }).then(readJson).then((data: AnalysisSnapshot) => { if (active) setSnapshot(data); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Falha ao preparar a análise."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, existingRunId, initialNoteIds, dateRange, mode, analysisTypes, previewVersion]);

  useEffect(() => {
    if (!runId) return;
    let active = true;
    const source = new EventSource(`/api/analysis/${runId}/events`);
    source.onmessage = (event) => {
      if (!active) return;
      try {
        const nextRun = JSON.parse(event.data) as AnalysisRunRecord;
        setRun(nextRun);
        setStreamError(false);
        if (isTerminal(nextRun)) { source.close(); reportChanged(); }
      } catch { source.close(); setStreamError(true); }
    };
    source.onerror = () => { source.close(); if (active) setStreamError(true); };
    return () => { active = false; source.close(); };
  }, [runId, streamVersion]);

  const hasInitialFinding = Boolean(run?.findings?.some((finding) => finding.id === initialFindingId));
  useEffect(() => {
    if (!hasInitialFinding || !initialFindingId) return;
    const button = document.getElementById(`finding-toggle-${initialFindingId}`);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView?.({ block: "start" });
  }, [hasInitialFinding, initialFindingId]);

  if (!scope && !existingRunId) return null;

  const selectedCount = snapshot?.notes.length ?? 0;
  const pending = (run?.findings ?? []).filter((finding) => finding.status === "open").sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  const closed = (run?.findings ?? []).filter((finding) => finding.status !== "open");
  const focusedFinding = initialFindingId ? run?.findings?.find((finding) => finding.id === initialFindingId) ?? null : null;
  const isFocusedReport = Boolean(initialFindingId && (!run || focusedFinding));
  const visiblePending = focusedFinding ? focusedFinding.status === "open" ? [focusedFinding] : [] : pending;
  const visibleClosed = focusedFinding ? focusedFinding.status === "open" ? [] : [focusedFinding] : closed;
  const highCount = pending.filter((finding) => finding.priority === "high").length;
  const canStart = !loading && !busy && Boolean(snapshot?.prepared && !snapshot.prepared.overLimit) && selectedCount > 0 && selectedCount <= 50;

  const start = async () => {
    if (!scope || !snapshot || !canStart || requestPending.current) return;
    requestPending.current = true; setBusy(true); setError("");
    try {
      const result = await readJson(await fetch("/api/analysis/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewId: snapshot.prepared?.previewId, scopeType: scope.type, scopeId: scope.id, selectedNoteIds: snapshot.notes.map((note) => note.id), dateRange, analysisTypes }),
      }));
      setRunId(result.runId);
      void onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao iniciar."); }
    finally { requestPending.current = false; setBusy(false); }
  };

  const controlRun = async (action: "cancel" | "retry") => {
    if (!runId || requestPending.current) return;
    requestPending.current = true; setBusy(true); setError("");
    try {
      const result = await readJson(await fetch(`/api/analysis/${runId}/${action}`, { method: "POST" }));
      if (action === "retry") { setRun((current) => current ? { ...current, status: "running", error: null } : current); setMessage(""); }
      else setMessage(result.cancelled === false ? "Nenhuma execução ativa foi encontrada para cancelar. Consulte o estado pelo acompanhamento." : "Cancelamento solicitado. Aguardando a confirmação da execução.");
      setStreamError(false); setStreamVersion((version) => version + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar a execução."); }
    finally { requestPending.current = false; setBusy(false); }
  };

  const actOnFinding = async (finding: FindingRecord, action: "resolved" | "dismissed" | "accept", expectedObjectIds?: [string, string]) => {
    if (requestPending.current) return;
    requestPending.current = true; setBusy(true); setError("");
    try {
      const body = action === "accept" ? { action: "accept", expectedObjectIds } : { action: "status", status: action };
      await readJson(await fetch(`/api/findings/${finding.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      setRun((current) => current ? { ...current, findings: current.findings?.map((item) => item.id === finding.id ? { ...item, status: action === "dismissed" ? "dismissed" : "resolved" } : item) } : current);
      setMessage(action === "accept" ? "Vínculo criado no mapa. Sugestão marcada como resolvida." : action === "resolved" ? "Sugestão marcada como resolvida. Isso atualiza apenas o acompanhamento." : "Sugestão descartada. Ela continua disponível no histórico deste relatório.");
      void onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar a sugestão."); }
    finally { requestPending.current = false; setBusy(false); }
  };

  const renderFinding = (finding: FindingRecord) => {
    const isExpanded = expandedFindingId === finding.id;
    const openSource = (type: "note" | "object", id: string) => onOpenSource(type, id, runId!, finding.id);
    return <article key={finding.id} className={`finding-card priority-${finding.priority} finding-${finding.status} ${isExpanded ? "is-expanded" : ""}`}>
      <button id={`finding-toggle-${finding.id}`} type="button" className="finding-toggle" aria-expanded={isExpanded} aria-controls={`finding-details-${finding.id}`} onClick={() => setExpandedFindingId((current) => current === finding.id ? null : finding.id)}>
        <span className="finding-heading"><span className="finding-meta"><span>{categoryLabels[finding.category]}</span><span>{priorityLabels[finding.priority]} · {findingStatusLabels[finding.status]}</span></span><span className="finding-title">{finding.title}</span><span className="finding-expand-label">{isExpanded ? "Ocultar explicação" : "Entender esta sugestão"}</span></span><ChevronRight className="finding-chevron" size={20} />
      </button>
      <SuggestedAction action={finding.suggestedAction} />
      {isExpanded && <div className="finding-details" id={`finding-details-${finding.id}`}>
        <FindingContent finding={finding} notes={notes} objects={objects} onOpenSource={openSource} />
        {finding.status === "open" && <section className="finding-management"><h3>Acompanhar esta sugestão</h3><p className="analysis-help">Marcar como resolvido atualiza apenas o acompanhamento. A ação sugerida precisa ser realizada por você.</p><div className="finding-actions"><button disabled={busy} onClick={() => void actOnFinding(finding, "resolved")}>Marcar como resolvido</button><button disabled={busy} onClick={() => void actOnFinding(finding, "dismissed")}>Descartar sugestão</button></div>
          {finding.category === "connection" && finding.sourceObjectIds.length >= 2 && <FindingConnection findingId={finding.id} objects={objects} busy={busy} onAccept={(ids) => void actOnFinding(finding, "accept", ids)} />}
        </section>}
        <FindingDeepen findingId={finding.id} runId={runId!} notes={notes} objects={objects} onOpenSource={openSource} />
      </div>}
    </article>;
  };

  return <div className="dialog-backdrop" role="presentation">
    <section ref={dialogRef} tabIndex={-1} className={`analysis-dialog ${runId ? "analysis-report" : ""} ${isFocusedReport ? "focused-finding-report" : ""}`} role="dialog" aria-modal="true" aria-labelledby="analysis-title">
      <header className="dialog-header"><div className="dialog-title-mark"><Sparkles size={20} /></div><div><span className="eyebrow">Análise das suas notas</span><h2 id="analysis-title">{runId ? isFocusedReport ? "Detalhes da sugestão" : terminal ? "Resultados da análise" : "Acompanhar análise" : "Conferir envio"}</h2></div><button className="icon-button dialog-close" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header>
      <div className={`dialog-body ${runId ? "report-body" : "preview-body"}`}>
        {!isFocusedReport && <AnalysisProgress current={runId ? terminal ? 3 : 2 : 1} />}
        {!runId && <>
          {loading && <div className="loading-row" role="status"><LoaderCircle className="spin" size={20} /> Preparando as fontes para você conferir…</div>}
          {snapshot && <>
            <div className="scope-card"><span>Contexto da análise</span><strong>{snapshot.scope.label}</strong><small>{periodLabel(snapshot.scope.dateRange ?? dateRange)} · {selectedCount} notas incluídas · {snapshot.objects.length} objetos</small></div>
            <div className="analysis-selection-summary"><span>O que vamos procurar</span><div>{(snapshot.analysisTypes ?? analysisTypes ?? ["connections"]).map((type) => <strong key={type}>{stepLabels[type]}</strong>)}</div></div>
            <p>{snapshot.prepared?.notice}</p>
            {initialNoteIds && selectedCount < initialNoteIds.length && <p className="analysis-help">Você selecionou {initialNoteIds.length} notas; a preparação incluiu {selectedCount}. Confira a lista abaixo antes de enviar.</p>}
            {snapshot.prepared?.overLimit && <p className="inline-error" role="alert">O contexto está amplo demais. Volte e selecione menos notas para preparar uma nova prévia.</p>}
            <div className="privacy-notice"><AlertTriangle size={20} /><p><strong>Você decide o que enviar.</strong> Os trechos, objetos, vínculos e histórico apresentados aqui serão enviados ao Codex pela sua sessão local. As sugestões não alteram suas notas automaticamente.</p></div>
            <h3>Notas incluídas ({selectedCount})</h3>
            <div className="analysis-source-list">{snapshot.notes.map((note) => <details key={note.id}><summary>{note.title || "Nota sem título"}</summary><small>Atualizada em {new Date(note.updatedAt).toLocaleString("pt-BR")}</small><blockquote>{note.content || "Nota vazia"}</blockquote></details>)}</div>
            {!!snapshot.objects.length && <details className="preview-context"><summary>Objetos e vínculos incluídos ({snapshot.objects.length})</summary><div className="object-preview-row">{snapshot.objects.map((object) => <span key={object.id}>{object.type}: {object.name}{object.description ? ` — ${object.description}` : ""}</span>)}</div>{snapshot.relationships.map((relation) => <p key={relation.id}>{snapshot.objects.find((o) => o.id === relation.sourceObjectId)?.name ?? "Objeto indisponível"} ↔ {snapshot.objects.find((o) => o.id === relation.targetObjectId)?.name ?? "Objeto indisponível"}: {relation.label}</p>)}</details>}
            {!!snapshot.previousFindings?.length && <details className="preview-context"><summary>Sugestões anteriores incluídas ({snapshot.previousFindings.length})</summary>{snapshot.previousFindings.map((finding) => <p key={finding.id}>{finding.title} · {findingStatusLabels[finding.status]}</p>)}</details>}
          </>}
        </>}
        {runId && <>
          {!run && !streamError && <div className="loading-row" role="status"><LoaderCircle className="spin" size={20} /> Abrindo análise…</div>}
          {streamError && <div className="analysis-recovery" role="alert"><strong>O acompanhamento foi interrompido.</strong><p>A execução pode continuar. Reconecte para consultar o estado atual sem iniciar outra análise.</p><button className="secondary-button" onClick={() => { setStreamError(false); setStreamVersion((version) => version + 1); }}>Reconectar acompanhamento</button></div>}
          {run && <>
            {!isFocusedReport && <div className={`run-banner run-${run.status}`} role="status"><div><span className="status-pulse" /><strong>{runStatusLabels[run.status]}</strong></div></div>}
            {!isFocusedReport && <div className="report-summary"><h3>{pending.length} sugestão{pending.length === 1 ? " pendente" : "s pendentes"}</h3><p>{highCount ? `${highCount} de prioridade alta. Comece pelos próximos passos abaixo.` : pending.length ? "Confira os próximos passos e decida o que fazer." : closed.length ? "Todas as sugestões deste relatório já foram avaliadas." : ""}</p></div>}
            {!terminal && <p>{run.status === "queued" ? "Aguardando o início da leitura das fontes." : "A IA está cruzando as fontes para preparar sugestões com evidências."} Você pode fechar esta janela e voltar pelas análises recentes.</p>}
            {run.status === "partial" && <p className="analysis-recovery">Algumas etapas falharam. Os resultados disponíveis estão abaixo; a revisão ficou incompleta.</p>}
            {run.status === "failed" && <p className="analysis-recovery">Não foi possível concluir a análise. Isso não significa que não há problemas nas notas.</p>}
            {run.status === "cancelled" && <p className="analysis-recovery">A análise foi interrompida a seu pedido. Os resultados disponíveis foram preservados.</p>}
            <div className="finding-list" aria-label={isFocusedReport ? "Sugestão selecionada" : "Sugestões pendentes"}>{visiblePending.map(renderFinding)}</div>
            {!!visibleClosed.length && <section className="closed-findings"><h3>Resolvidas e descartadas ({visibleClosed.length})</h3><div className="finding-list">{visibleClosed.map(renderFinding)}</div></section>}
            {!isFocusedReport && run.status === "completed" && !run.findings?.length && <div className="empty-report"><Sparkles size={28} /><h3>Nenhuma sugestão sustentada pelas fontes</h3><p>A análise terminou sem sugestões para o contexto enviado. Isso não garante que todas as situações estejam resolvidas.</p></div>}
            {!isFocusedReport && !!run.steps?.length && <details className="execution-details"><summary>Detalhes da execução</summary><div className="step-list">{run.steps.map((step) => <div className={`step-row step-${step.status}`} key={step.id}>{step.status === "running" ? <LoaderCircle className="spin" size={18} /> : step.status === "completed" ? <Check size={18} /> : step.status === "failed" ? <AlertTriangle size={18} /> : <Circle size={16} />}<span>{stepLabels[step.name] ?? step.name}</span><small>{stepStatusLabels[step.status] ?? step.status}</small>{step.error && <p>{step.error}</p>}</div>)}</div></details>}
            {!isFocusedReport && run.error && <details className="execution-details"><summary>Detalhes do problema</summary><p>{run.error}</p></details>}
          </>}
        </>}
        {message && <p className="analysis-feedback" role="status">{message}</p>}
        {error && <div className="inline-error" role="alert"><p>{error}</p>{!runId && <button className="secondary-button" disabled={loading || busy} onClick={() => { setSnapshot(null); setError(""); setLoading(true); setPreviewVersion((v) => v + 1); }}>Preparar prévia novamente</button>}</div>}
      </div>
      <footer className="dialog-footer">
        {!runId ? <><button className="ghost-button" disabled={busy} onClick={onBack ?? onClose}>Voltar e editar</button><button className="primary-button" onClick={() => void start()} disabled={!canStart}><Sparkles size={18} />{busy ? "Iniciando…" : "Confirmar e analisar"}</button></> : <>
          <button className="ghost-button" onClick={onClose}>Fechar</button>
          {run && !terminal && <button className="danger-button" disabled={busy} onClick={() => void controlRun("cancel")}><Square size={16} /> Cancelar análise</button>}
          {terminal && run?.steps?.some((step) => step.status === "failed") && <button className="secondary-button" disabled={busy} onClick={() => void controlRun("retry")}><RefreshCw size={18} /> Tentar etapas com falha</button>}
        </>}
      </footer>
    </section>
  </div>;
}
