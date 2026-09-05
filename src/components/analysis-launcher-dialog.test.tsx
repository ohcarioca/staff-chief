// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteRecord } from "@/lib/contracts";
import { AnalysisLauncherDialog } from "./analysis-launcher-dialog";

const notes: NoteRecord[] = [
  {
    id: "note-1",
    title: "Primeira nota",
    contentJson: { type: "doc" },
    contentText: "Conteúdo da primeira nota.",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
    archivedAt: null,
    mentions: [],
  },
  {
    id: "note-2",
    title: "Segunda nota",
    contentJson: { type: "doc" },
    contentText: "Conteúdo da segunda nota.",
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    archivedAt: null,
    mentions: [],
  },
];

const dateRange = { start: "2026-09-01", end: "2026-09-30" };

afterEach(() => cleanup());

describe("analysis launcher", () => {
  it("blocks an empty selection or no objectives", () => {
    const onContinue = vi.fn();
    render(<AnalysisLauncherDialog notes={notes} dateRange={dateRange} onContinue={onContinue} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Conexões e oportunidades/ }));
    const next = screen.getByRole("button", { name: "Conferir envio" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Riscos/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Selecionar notas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(next.disabled).toBe(true);
    fireEvent.click(next);
    expect(onContinue).not.toHaveBeenCalled();
  });
  it("requires reducing a set over 50 notes and caps manual selection", () => {
    const candidates = Array.from({ length: 51 }, (_, i) => ({ ...notes[0], id: `note-${i}` }));
    render(<AnalysisLauncherDialog notes={candidates} dateRange={dateRange} onContinue={vi.fn()} onClose={vi.fn()} />);
    const next = screen.getByRole("button", { name: "Conferir envio" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: /Selecionar notas/ }));
    expect(next.disabled).toBe(false);
    expect((screen.getAllByRole("checkbox")[50] as HTMLInputElement).disabled).toBe(true);
  });
  it("continues with every note in the calendar range by default", () => {
    const onContinue = vi.fn();
    render(<AnalysisLauncherDialog notes={notes} dateRange={dateRange} onContinue={onContinue} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Conferir envio/ }));

    expect(onContinue).toHaveBeenCalledOnce();
    expect(onContinue.mock.calls[0]?.[0]).toEqual({ type: "collection", id: "general" });
    expect(onContinue.mock.calls[0]?.[2]).toEqual(["note-1", "note-2"]);
    expect(onContinue.mock.calls[0]?.[3]).toEqual(dateRange);
  });

  it("continues with only the manually selected notes", () => {
    const onContinue = vi.fn();
    render(<AnalysisLauncherDialog notes={notes} dateRange={dateRange} onContinue={onContinue} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: /Selecionar notas/ }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Conferir envio/ }));

    expect(onContinue).toHaveBeenCalledOnce();
    expect(onContinue.mock.calls[0]?.[0]).toEqual({ type: "collection", id: "selection" });
    expect(onContinue.mock.calls[0]?.[2]).toEqual(["note-2"]);
  });
});
