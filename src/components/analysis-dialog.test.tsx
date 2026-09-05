// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisRunRecord, FindingRecord } from "@/lib/contracts";
import { AnalysisDialog } from "./analysis-dialog";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("analysis preview", () => {
  it("does not reopen a completed stream when the refresh callback changes", () => {
    const opened = vi.fn();
    let publish: (run: AnalysisRunRecord) => void = () => {};
    class Stream {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { opened(); publish = (run) => this.onmessage?.({ data: JSON.stringify(run) } as MessageEvent); }
      close() {}
    }
    vi.stubGlobal("EventSource", Stream);
    const props = { scope: null, existingRunId: "r", notes: [], objects: [], onOpenSource: vi.fn(), onClose: vi.fn() };
    const changed = vi.fn();
    const view = render(<AnalysisDialog {...props} onChanged={changed} />);
    act(() => publish({ id: "r", provider: "test", scopeType: "note", scopeId: "n", status: "completed", error: null, createdAt: "", completedAt: "", steps: [], findings: [] }));
    view.rerender(<AnalysisDialog {...props} onChanged={() => changed()} />);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    view.unmount();
  });
  it("can unmount while loading without aborting the fetch request", () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Promise<Response>(() => undefined);
    });
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<AnalysisDialog
      scope={{ type: "note", id: "note-1" }}
      notes={[]}
      objects={[]}
      onOpenSource={vi.fn()}
      onClose={vi.fn()}
      onChanged={vi.fn()}
    />);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("signal");
    view.unmount();
    expect(abortSpy).not.toHaveBeenCalled();
  });

  it("expands only the selected finding", () => {
    let publishRun: (run: AnalysisRunRecord) => void = () => undefined;
    class EventSourceMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        publishRun = (run) => this.onmessage?.({ data: JSON.stringify(run) } as MessageEvent);
      }

      close() {}
    }
    vi.stubGlobal("EventSource", EventSourceMock);

    const findings: FindingRecord[] = [
      {
        id: "finding-1",
        runId: "run-1",
        category: "risk",
        title: "Primeiro achado",
        explanation: "Detalhes exclusivos do primeiro achado.",
        priority: "high",
        confidence: 92,
        suggestedAction: "Tratar o primeiro risco.",
        status: "open",
        sourceNoteIds: [],
        sourceObjectIds: [],
        createdAt: "2026-09-04T12:00:00.000Z",
      },
      {
        id: "finding-2",
        runId: "run-1",
        category: "gap",
        title: "Segundo achado",
        explanation: "Detalhes exclusivos do segundo achado.",
        priority: "medium",
        confidence: 84,
        suggestedAction: "Preencher a segunda lacuna.",
        status: "open",
        sourceNoteIds: [],
        sourceObjectIds: [],
        createdAt: "2026-09-04T12:01:00.000Z",
      },
    ];

    render(<AnalysisDialog
      scope={null}
      existingRunId="run-1"
      initialFindingId="finding-2"
      notes={[]}
      objects={[]}
      onOpenSource={vi.fn()}
      onClose={vi.fn()}
      onChanged={vi.fn()}
    />);

    act(() => publishRun({
      id: "run-1",
      provider: "codex",
      scopeType: "object",
      scopeId: "object-1",
      status: "completed",
      error: null,
      createdAt: "2026-09-04T12:00:00.000Z",
      completedAt: "2026-09-04T12:02:00.000Z",
      steps: [],
      findings,
    }));

    const firstToggle = screen.getByRole("button", { name: /Primeiro achado/ });
    const secondToggle = screen.getByRole("button", { name: /Segundo achado/ });
    expect(firstToggle.getAttribute("aria-expanded")).toBe("false");
    expect(secondToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText("Detalhes exclusivos do primeiro achado.")).toBeNull();
    expect(screen.getByText("Detalhes exclusivos do segundo achado.")).not.toBeNull();

    fireEvent.click(firstToggle);
    expect(firstToggle.getAttribute("aria-expanded")).toBe("true");
    expect(secondToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Detalhes exclusivos do primeiro achado.")).not.toBeNull();
    expect(screen.queryByText("Detalhes exclusivos do segundo achado.")).toBeNull();

    fireEvent.click(firstToggle);
    expect(firstToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Detalhes exclusivos do primeiro achado.")).toBeNull();
  });
});
