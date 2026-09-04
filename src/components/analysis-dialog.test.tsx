// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisDialog } from "./analysis-dialog";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prévia da análise", () => {
  it("pode ser desmontada durante o carregamento sem abortar o fetch", () => {
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
});
