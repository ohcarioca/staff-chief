"use client";

import { ArrowRight, Check, Lightbulb, ListChecks, SearchCheck, ShieldAlert, Sparkles, Unplug, X } from "lucide-react";
import { useState } from "react";
import type { AnalysisType, KnowledgeObjectRecord, NoteRecord } from "@/lib/contracts";

type Scope = { type: "note" | "object"; id: string };

const analysisOptions: Array<{ id: AnalysisType; label: string; description: string; icon: typeof Sparkles }> = [
  { id: "connections", label: "Conexões e oportunidades", description: "Encontra relações, padrões e sinergias entre seus registros.", icon: Lightbulb },
  { id: "risks", label: "Riscos", description: "Aponta dependências frágeis, atrasos e sinais de atenção.", icon: ShieldAlert },
  { id: "contradictions", label: "Contradições", description: "Compara informações incompatíveis e mudanças de direção.", icon: Unplug },
  { id: "gaps", label: "Lacunas", description: "Identifica contexto, responsáveis, critérios ou decisões ausentes.", icon: SearchCheck },
  { id: "follow_ups", label: "Follow-ups", description: "Sugere próximos passos objetivos sustentados pelas notas.", icon: ListChecks },
];

interface AnalysisLauncherDialogProps {
  notes: NoteRecord[];
  objects: KnowledgeObjectRecord[];
  onContinue(scope: Scope, analysisTypes: AnalysisType[]): void;
  onClose(): void;
}

export function AnalysisLauncherDialog({ notes, objects, onContinue, onClose }: AnalysisLauncherDialogProps) {
  const initialScopeType = notes.length ? "note" : "object";
  const [scopeType, setScopeType] = useState<"note" | "object">(initialScopeType);
  const [scopeId, setScopeId] = useState(notes[0]?.id ?? objects[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<AnalysisType>>(new Set(analysisOptions.map((option) => option.id)));
  const allSelected = selected.size === analysisOptions.length;
  const availableItems = scopeType === "note" ? notes : objects;

  const changeScopeType = (nextType: "note" | "object") => {
    setScopeType(nextType);
    setScopeId((nextType === "note" ? notes[0]?.id : objects[0]?.id) ?? "");
  };
  const toggleType = (type: AnalysisType) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(analysisOptions.map((option) => option.id)));

  return <div className="dialog-backdrop" role="presentation">
    <section className="analysis-dialog analysis-launcher" role="dialog" aria-modal="true" aria-labelledby="analysis-launcher-title">
      <header className="dialog-header">
        <div className="dialog-title-mark"><Sparkles size={18} /></div>
        <div><span className="eyebrow">Codex · execução manual</span><h2 id="analysis-launcher-title">Configurar análise IA</h2></div>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </header>
      <div className="dialog-body launcher-body">
        <section className="launcher-section">
          <div className="launcher-section-heading"><div><span className="launcher-step">1</span><strong>Escolha o ponto de partida</strong></div><small>A análise inclui conexões diretas e notas relacionadas.</small></div>
          <div className="scope-tabs" role="tablist" aria-label="Tipo de item">
            <button role="tab" aria-selected={scopeType === "note"} className={scopeType === "note" ? "is-active" : ""} onClick={() => changeScopeType("note")} disabled={!notes.length}>Nota <span>{notes.length}</span></button>
            <button role="tab" aria-selected={scopeType === "object"} className={scopeType === "object" ? "is-active" : ""} onClick={() => changeScopeType("object")} disabled={!objects.length}>Objeto <span>{objects.length}</span></button>
          </div>
          <select className="scope-picker" value={scopeId} onChange={(event) => setScopeId(event.target.value)} aria-label={scopeType === "note" ? "Nota para analisar" : "Objeto para analisar"}>
            {availableItems.map((item) => <option key={item.id} value={item.id}>{"contentText" in item ? item.title || item.contentText.slice(0, 70) || "Nota sem título" : `${item.typeIcon} ${item.name} · ${item.typeName}`}</option>)}
          </select>
        </section>
        <section className="launcher-section">
          <div className="launcher-section-heading"><div><span className="launcher-step">2</span><strong>Selecione as lentes de análise</strong></div><button className="select-all-analysis" onClick={toggleAll}>{allSelected ? "Desmarcar todas" : "Selecionar todas"}</button></div>
          <div className="analysis-type-grid">{analysisOptions.map(({ id, label, description, icon: Icon }) => {
            const checked = selected.has(id);
            return <button key={id} className={`analysis-type-card ${checked ? "is-selected" : ""}`} onClick={() => toggleType(id)} aria-pressed={checked}>
              <span className="analysis-type-icon"><Icon size={17} /></span><span><strong>{label}</strong><small>{description}</small></span><span className="analysis-type-check">{checked ? <Check size={13} /> : null}</span>
            </button>;
          })}</div>
        </section>
        <div className="launcher-privacy"><ShieldAlert size={15} /><span>Nenhum dado será enviado até você revisar o contexto e confirmar na próxima etapa.</span></div>
      </div>
      <footer className="dialog-footer"><button className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!scopeId || selected.size === 0} onClick={() => onContinue({ type: scopeType, id: scopeId }, analysisOptions.map((option) => option.id).filter((type) => selected.has(type)))}><span>Revisar contexto</span><ArrowRight size={15} /></button></footer>
    </section>
  </div>;
}
