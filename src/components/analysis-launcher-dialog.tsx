"use client";

import { ArrowRight, CalendarDays, Check, Lightbulb, ListChecks, SearchCheck, ShieldAlert, Sparkles, Unplug, X } from "lucide-react";
import { useState } from "react";
import type { AnalysisDateRange, AnalysisScope, AnalysisType, NoteRecord } from "@/lib/contracts";

type CollectionMode = "general" | "selection";

const analysisOptions: Array<{ id: AnalysisType; label: string; description: string; icon: typeof Sparkles }> = [
  { id: "connections", label: "Conexões e oportunidades", description: "Encontra relações, padrões e sinergias entre seus registros.", icon: Lightbulb },
  { id: "risks", label: "Riscos", description: "Aponta dependências frágeis, atrasos e sinais de atenção.", icon: ShieldAlert },
  { id: "contradictions", label: "Contradições", description: "Compara informações incompatíveis e mudanças de direção.", icon: Unplug },
  { id: "gaps", label: "Lacunas", description: "Identifica contexto, responsáveis, critérios ou decisões ausentes.", icon: SearchCheck },
  { id: "follow_ups", label: "Follow-ups", description: "Sugere próximos passos objetivos sustentados pelas notas.", icon: ListChecks },
];

interface AnalysisLauncherDialogProps {
  notes: NoteRecord[];
  dateRange: AnalysisDateRange;
  onContinue(scope: AnalysisScope, analysisTypes: AnalysisType[], noteIds: string[], dateRange: AnalysisDateRange): void;
  onClose(): void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function dateRangeLabel(dateRange: AnalysisDateRange) {
  if (dateRange.start && dateRange.end) return `${formatDate(dateRange.start)} a ${formatDate(dateRange.end)}`;
  if (dateRange.start) return `Desde ${formatDate(dateRange.start)}`;
  if (dateRange.end) return `Até ${formatDate(dateRange.end)}`;
  return "Todo o histórico";
}

function noteLabel(note: NoteRecord) {
  return note.title || note.contentText.slice(0, 70) || "Nota sem título";
}

export function AnalysisLauncherDialog({ notes, dateRange, onContinue, onClose }: AnalysisLauncherDialogProps) {
  const [mode, setMode] = useState<CollectionMode>("general");
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(() => new Set(notes.slice(0, 50).map((note) => note.id)));
  const [selectedTypes, setSelectedTypes] = useState<Set<AnalysisType>>(() => new Set(["connections"]));
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
    <section className="analysis-dialog analysis-launcher" role="dialog" aria-modal="true" aria-labelledby="analysis-launcher-title">
      <header className="dialog-header">
        <div className="dialog-title-mark"><Sparkles size={18} /></div>
        <div><span className="eyebrow">Codex · execução manual</span><h2 id="analysis-launcher-title">Configurar análise IA</h2></div>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </header>
      <div className="dialog-body launcher-body">
        <section className="launcher-section">
          <div className="launcher-section-heading"><div><span className="launcher-step">1</span><strong>Defina o conjunto de notas</strong></div><small>O calendário do dashboard delimita o período.</small></div>
          <div className="analysis-period-card">
            <CalendarDays size={17} />
            <span><small>Filtro do calendário</small><strong>{dateRangeLabel(dateRange)}</strong></span>
            <b>{notes.length} nota{notes.length === 1 ? "" : "s"}</b>
          </div>
          <div className="scope-tabs" role="tablist" aria-label="Conjunto de notas">
            <button role="tab" aria-selected={mode === "general"} className={mode === "general" ? "is-active" : ""} onClick={() => setMode("general")}>Todas no período <span>{notes.length}</span></button>
            <button role="tab" aria-selected={mode === "selection"} className={mode === "selection" ? "is-active" : ""} onClick={() => setMode("selection")}>Selecionar notas <span>{selectedNotes.size}</span></button>
          </div>
          {mode === "general" ? <div className={`collection-summary ${selectionIsValid ? "" : "has-warning"}`}>
            <strong>{notes.length ? `A análise cruzará ${notes.length} nota${notes.length === 1 ? "" : "s"}.` : "Nenhuma nota encontrada neste período."}</strong>
            <small>{notes.length > 50 ? "O limite é de 50 notas. Reduza o período no calendário ou use a seleção manual." : "Todas as notas exibidas pelo filtro serão revisadas juntas."}</small>
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
          <div className="launcher-section-heading"><div><span className="launcher-step">2</span><strong>Selecione as lentes de análise</strong></div><button className="select-all-analysis" onClick={toggleAllAnalysisTypes}>{allTypesSelected ? "Desmarcar todas" : "Selecionar todas"}</button></div>
          <div className="analysis-type-grid">{analysisOptions.map(({ id, label, description, icon: Icon }) => {
            const checked = selectedTypes.has(id);
            return <button key={id} className={`analysis-type-card ${checked ? "is-selected" : ""}`} onClick={() => toggleAnalysisType(id)} aria-pressed={checked}>
              <span className="analysis-type-icon"><Icon size={17} /></span><span><strong>{label}</strong><small>{description}</small></span><span className="analysis-type-check">{checked ? <Check size={13} /> : null}</span>
            </button>;
          })}</div>
        </section>
        <div className="launcher-privacy"><ShieldAlert size={15} /><span>Nenhum dado será enviado até você revisar todas as notas incluídas e confirmar na próxima etapa.</span></div>
      </div>
      <footer className="dialog-footer"><button className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!selectionIsValid || selectedTypes.size === 0} onClick={() => onContinue({ type: "collection", id: mode }, analysisOptions.map((option) => option.id).filter((type) => selectedTypes.has(type)), activeNoteIds, dateRange)}><span>Revisar contexto</span><ArrowRight size={15} /></button></footer>
    </section>
  </div>;
}
