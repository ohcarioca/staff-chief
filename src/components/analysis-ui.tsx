"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type { AnalysisDateRange, AnalysisStatus, FindingPriority, FindingStatus } from "@/lib/contracts";

export const priorityLabels: Record<FindingPriority, string> = { high: "Prioridade alta", medium: "Prioridade média", low: "Prioridade baixa" };
export const findingStatusLabels: Record<FindingStatus, string> = { open: "Pendente", resolved: "Resolvida", dismissed: "Descartada" };
export const runStatusLabels: Record<AnalysisStatus, string> = { queued: "Aguardando análise", running: "Análise em andamento", completed: "Análise concluída", partial: "Resultado parcial", failed: "Falha na análise", cancelled: "Análise cancelada" };
export const priorityOrder: Record<FindingPriority, number> = { high: 0, medium: 1, low: 2 };

export function periodLabel(range?: AnalysisDateRange) {
  const format = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  if (range?.start && range.end) return `${format(range.start)} a ${format(range.end)}`;
  if (range?.start) return `Desde ${format(range.start)}`;
  if (range?.end) return `Até ${format(range.end)}`;
  return "Todo o histórico";
}

export function AnalysisProgress({ current }: { current: number }) {
  return <ol className="analysis-progress" aria-label="Etapas da análise">
    {["Configurar", "Conferir envio", "Analisar", "Resultados"].map((label, index) => <li key={label} aria-current={index === current ? "step" : undefined} className={index === current ? "is-current" : index < current ? "is-done" : ""}><span>{index + 1}</span>{label}</li>)}
  </ol>;
}

// Keep keyboard focus in the active dialog and restore it to the entry point.
export function useAnalysisDialog(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = ref.current;
    if (!element) return;
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex='0']")).filter((node) => node.getClientRects().length > 0);
    element.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); element.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    element.addEventListener("keydown", keydown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.removeEventListener("keydown", keydown); document.body.style.overflow = originalOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return ref;
}
