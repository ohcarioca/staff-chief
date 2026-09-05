"use client";

import { ArrowRight, CalendarDays, Check, Lightbulb, ListChecks, SearchCheck, ShieldAlert, Sparkles, Unplug, X } from "lucide-react";
import { useState } from "react";
import type { AnalysisDateRange, AnalysisScope, AnalysisType, NoteRecord } from "@/lib/contracts";
import { AnalysisProgress, periodLabel, useAnalysisDialog } from "./analysis-ui";

type CollectionMode = "general" | "selection";

const analysisOptions: Array<{ id: AnalysisType; label: string; description: string; icon: typeof Sparkles }> = [
  { id: "connections", label: "Conexões e oportunidades", description: "O que pode ser conectado ou reaproveitado entre seus projetos?", icon: Lightbulb },
  { id: "risks", label: "Riscos", description: "Aponta dependências frágeis, atrasos e sinais de atenção.", icon: ShieldAlert },
  { id: "contradictions", label: "Contradições", description: "Compara informações incompatíveis e mudanças de direção.", icon: Unplug },
  { id: "gaps", label: "Lacunas", description: "Identifica contexto, responsáveis, critérios ou decisões ausentes.", icon: SearchCheck },
  { id: "follow_ups", label: "Próximos passos", description: "O que precisa de uma ação ou acompanhamento?", icon: ListChecks },
];

interface AnalysisLauncherDialogProps {
  notes: NoteRecord[];
  dateRange: AnalysisDateRange;
  scope?: AnalysisScope;
  scopeLabel?: string;
  initialNoteIds?: string[];
  initialTypes?: AnalysisType[];
  initialMode?: "full" | "incremental";
  onContinue(scope: AnalysisScope, analysisTypes: AnalysisType[], noteIds: string[], dateRange: AnalysisDateRange, mode: "full" | "incremental"): void;
  onClose(): void;
}

function noteLabel(note: NoteRecord) {
  return note.title || note.contentText.slice(0, 70) || "Nota sem título";
}

export function AnalysisLauncherDialog({ notes, dateRange, scope, scopeLabel, initialNoteIds, initialTypes, initialMode, onContinue, onClose }: AnalysisLauncherDialogProps) {
  const dialogRef = useAnalysisDialog(onClose);
  const [mode, setMode] = useState<CollectionMode>(scope?.type === "collection" && scope.id === "general" ? "general" : initialNoteIds ? "selection" : "general");
  const [reviewMode, setReviewMode] = useState<"full" | "incremental">(initialMode ?? "full");
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(() => new Set(initialNoteIds ?? notes.slice(0, 50).map((note) => note.id)));
  const [selectedTypes, setSelectedTypes] = useState<Set<AnalysisType>>(() => new Set(initialTypes ?? ["connections"]));
  const allTypesSelected = selectedTypes.size === analysisOptions.length;
  const activeNoteIds = mode === "general" ? notes.map((note) => note.id) : [...selectedNotes];
  const selectionIsValid = activeNoteIds.length > 0 && activeNoteIds.length <= 50;

  const toggleAnalysisType = (type: AnalysisType) => {
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };
  const toggleAllAnalysisTypes = () => {
    setSelectedTypes(allTypesSelected ? new Set() : new Set(analysisOptions.map((option) => option.id)));
  };
  const toggleNote = (noteId: string) => {
    setSelectedNotes((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else if (next.size < 50) next.add(noteId);
      return next;
    });
  };
  const toggleAllNotes = () => {
    setSelectedNotes((current) => current.size ? new Set() : new Set(notes.slice(0, 50).map((note) => note.id)));
  };

  return <div className="dialog-backdrop" role="presentation">
    <section ref={dialogRef} tabIndex={-1} className="analysis-dialog analysis-launcher" role="dialog" aria-modal="true" aria-labelledby="analysis-launcher-title">
      <header className="dialog-header">
        <div className="dialog-title-mark"><Sparkles size={18} /></div>
        <div><span className="eyebrow">Análise das suas notas</span><h2 id="analysis-launcher-title">Configurar análise IA</h2></div>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </header>
      <div className="dialog-body launcher-body">
        <AnalysisProgress current={0} />
        <section className="launcher-section">
          <div className="launcher-section-heading"><strong>Quais notas você quer analisar?</strong></div>
          <div className="analysis-period-card">
            <CalendarDays size={17} />
            <span><small>{scopeLabel ? "Notas relacionadas a" : "Período do dashboard"}</small><strong>{scopeLabel || periodLabel(dateRange)}</strong></span>
            <b>{notes.length} nota{notes.length === 1 ? "" : "s"}</b>
          </div>
          <div className="scope-tabs" role="tablist" aria-label="Conjunto de notas">
            <button role="tab" aria-selected={mode === "general"} className={mode === "general" ? "is-active" : ""} onClick={() => setMode("general")}>{scopeLabel ? "Todas relacionadas" : "Todas no período"} <span>{notes.length}</span></button>
            <button role="tab" aria-selected={mode === "selection"} className={mode === "selection" ? "is-active" : ""} onClick={() => setMode("selection")}>Selecionar notas <span>{selectedNotes.size}</span></button>
          </div>
          {mode === "general" ? <div className={`collection-summary ${selectionIsValid ? "" : "has-warning"}`}>
            <strong>{notes.length ? `${notes.length} nota${notes.length === 1 ? "" : "s"} para preparar a análise.` : "Nenhuma nota encontrada."}</strong>
            <small>{notes.length > 50 ? "O limite é de 50 notas. Reduza o período no calendário ou use a seleção manual." : "Na próxima etapa, confira os trechos que serão incluídos. A preparação pode selecionar um conjunto menor."}</small>
          </div> : <>
            <div className="launcher-note-actions"><span>{selectedNotes.size}/50 selecionadas</span><button type="button" onClick={toggleAllNotes}>{selectedNotes.size ? "Limpar seleção" : "Selecionar até 50"}</button></div>
            <div className="launcher-note-list">
              {notes.map((note) => {
                const checked = selectedNotes.has(note.id);
                return <label className="launcher-note" key={note.id}>
                  <input type="checkbox" checked={checked} disabled={!checked && selectedNotes.size >= 50} onChange={() => toggleNote(note.id)} />
                  <span><strong>{noteLabel(note)}</strong><small>{note.contentText.slice(0, 120) || "Nota vazia"}</small></span>
                </label>;
              })}
            </div>
          </>}
        </section>
        <section className="launcher-section">
          <div className="launcher-section-heading"><strong>O que você quer descobrir?</strong><button className="select-all-analysis" onClick={toggleAllAnalysisTypes}>{allTypesSelected ? "Desmarcar todas" : "Selecionar todas"}</button></div>
          <div className="analysis-type-grid">{analysisOptions.map(({ id, label, description, icon: Icon }) => {
            const checked = selectedTypes.has(id);
            return <button key={id} className={`analysis-type-card ${checked ? "is-selected" : ""}`} onClick={() => toggleAnalysisType(id)} aria-pressed={checked}>
              <span className="analysis-type-icon"><Icon size={17} /></span><span><strong>{label}</strong><small>{description}</small></span><span className="analysis-type-check">{checked ? <Check size={13} /> : null}</span>
            </button>;
          })}</div>
        </section>
        <details className="analysis-advanced" open={reviewMode === "incremental" ? true : undefined}><summary>Opções avançadas</summary><label>Modo de revisão <select value={reviewMode} onChange={(event) => setReviewMode(event.target.value as "full" | "incremental")}><option value="full">Revisão completa</option><option value="incremental">Somente alterações e histórico relacionado</option></select></label><p>A revisão completa considera as notas selecionadas. A revisão por alterações foca nas notas modificadas desde a última análise e inclui histórico relacionado.</p></details>
        <div className="launcher-privacy"><ShieldAlert size={15} /><span>Nenhum dado será enviado até você revisar todas as notas incluídas e confirmar na próxima etapa.</span></div>
      </div>
      <footer className="dialog-footer"><button className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!selectionIsValid || selectedTypes.size === 0} onClick={() => onContinue(scope && scope.type !== "collection" ? scope : { type: "collection", id: mode }, analysisOptions.map((option) => option.id).filter((type) => selectedTypes.has(type)), activeNoteIds, dateRange, reviewMode)}><span>Conferir envio</span><ArrowRight size={15} /></button></footer>
    </section>
  </div>;
}
