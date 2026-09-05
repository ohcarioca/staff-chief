"use client";

import type { KnowledgeObjectRecord, NoteRecord, SpecialistFinding } from "@/lib/contracts";

type FindingContentProps = {
  finding: SpecialistFinding;
  notes: NoteRecord[];
  objects: KnowledgeObjectRecord[];
  onOpenSource(type: "note" | "object", id: string): void;
};

export function SuggestedAction({ action }: { action: string }) {
  return <div className="suggested-action"><strong>Próximo passo sugerido</strong><p>{action.trim() || "Nenhuma ação específica foi registrada para esta sugestão."}</p></div>;
}

export function FindingContent({ finding, notes, objects, onOpenSource }: FindingContentProps) {
  const noteSource = (id: string) => {
    const note = notes.find((item) => item.id === id && !item.archivedAt);
    return note ? <button type="button" onClick={() => onOpenSource("note", id)}>Abrir nota: {note.title || "Nota sem título"}</button> : <span className="source-unavailable">Nota indisponível ou arquivada. A evidência do relatório foi preservada.</span>;
  };
  return <>
    <section className="finding-section"><h3>O que foi identificado</h3><p>{finding.explanation}</p></section>
    <section className="finding-section"><h3>Por que importa</h3><p>{finding.detail?.impact || "Este relatório não registrou o impacto separadamente."}</p>{finding.detail?.priorityReason && <p className="priority-reason"><strong>Por que priorizar: </strong>{finding.detail.priorityReason}</p>}</section>
    <details className="finding-evidence"><summary>Evidências e limites <span>({finding.detail?.evidence.length ?? finding.sourceNoteIds.length} citações/fontes)</span></summary>
      {finding.detail ? <>
        <p>Base da sugestão: evidência {finding.detail.evidenceStrength === "strong" ? "forte" : finding.detail.evidenceStrength === "supported" ? "sustentada" : "limitada"}. Isso não indica certeza sobre o resultado.</p>
        {finding.detail.previousFindingId && <p>Sugestão recorrente. A decisão anterior foi preservada.</p>}
        {finding.detail.evidence.map((evidence, index) => <blockquote key={`${evidence.noteId}:${index}`}><p>{evidence.quote}</p>{noteSource(evidence.noteId)}</blockquote>)}
        <p><strong>O que ainda não sabemos: </strong>{finding.detail.limitation || "Nenhuma limitação foi registrada."}</p>
      </> : <p>Relatório anterior ao registro de citações e limitações estruturadas. Consulte as fontes disponíveis.</p>}
      <div className="finding-sources">
        {finding.sourceNoteIds.filter((id) => !finding.detail?.evidence.some((item) => item.noteId === id)).map((id) => <div key={id}>{noteSource(id)}</div>)}
        {finding.sourceObjectIds.map((id) => {
          const object = objects.find((item) => item.id === id && !item.archivedAt);
          return object ? <button key={id} type="button" onClick={() => onOpenSource("object", id)}>Ver {object.typeName}: {object.name}</button> : <span className="source-unavailable" key={id}>Objeto indisponível ou arquivado.</span>;
        })}
      </div>
    </details>
  </>;
}
