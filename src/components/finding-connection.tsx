"use client";

import { useEffect, useState } from "react";
import type { FindingRecord, KnowledgeObjectRecord } from "@/lib/contracts";

export function FindingConnection({ findingId, objects, busy, onAccept }: { findingId: string; objects: KnowledgeObjectRecord[]; busy: boolean; onAccept(ids: [string, string]): void }) {
  const [current, setCurrent] = useState<FindingRecord | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`/api/findings/${findingId}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível conferir os objetos.");
      if (active) setCurrent(data);
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Não foi possível conferir os objetos."); });
    return () => { active = false; };
  }, [findingId, version]);
  const pair = current?.sourceObjectIds.slice(0, 2).map((id) => objects.find((object) => object.id === id && !object.archivedAt));
  return <div className="connection-preview">
    <h3>Vínculo no mapa</h3>
    {error ? <><p role="alert">{error}</p><button onClick={() => { setError(""); setVersion((v) => v + 1); }}>Conferir novamente</button></> : !current ? <p role="status">Conferindo os objetos do vínculo…</p> : pair?.length === 2 && pair[0] && pair[1] && current.status === "open" ? <>
      <p><strong>{pair[0].name}</strong> ↔ <strong>{pair[1].name}</strong></p>
      <p className="analysis-help">Cria este vínculo no mapa e marca a sugestão como resolvida. As outras recomendações continuam dependendo de você.</p>
      <button className="secondary-button" disabled={busy} onClick={() => onAccept([pair[0]!.id, pair[1]!.id])}>Criar vínculo no mapa</button>
    </> : <p>Este vínculo não está disponível. Confira se os objetos ainda estão ativos e se a sugestão continua pendente.</p>}
  </div>;
}
