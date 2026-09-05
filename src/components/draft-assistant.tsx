"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { AiPreview, AssistanceResult, DraftBlock, DraftSuggestion, KnowledgeObjectRecord, ObjectSuggestion, ObjectTypeRecord } from "@/lib/contracts";
import { containsName, nameRange } from "@/lib/analysis/context";

type BlockRange = DraftBlock & { from: number; to: number; whole: boolean; nodeFrom: number; nodeTo: number };
export function editorBlocks(editor: Editor, selectedOnly = false): BlockRange[] {
  const { from, to } = editor.state.selection;
  const result: BlockRange[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if (selectedOnly && (to <= pos + 1 || from >= pos + node.nodeSize - 1)) return false;
    const start = selectedOnly ? Math.max(from, pos + 1) : pos + 1;
    const end = selectedOnly ? Math.min(to, pos + node.nodeSize - 1) : pos + node.nodeSize - 1;
    let protectedBlock = false;
    node.descendants((child) => { if (!child.isText || child.marks.length) protectedBlock = true; });
    const text = editor.state.doc.textBetween(start, end, "\n", (leaf) => leaf.type.name === "mention" ? `@${leaf.attrs.label}` : " ");
    if (text.trim()) result.push({ id: `block-${pos}`, text, protected: protectedBlock, from: start, to: end,
      whole: start === pos + 1 && end === pos + node.nodeSize - 1, nodeFrom: pos, nodeTo: pos + node.nodeSize });
    return false;
  });
  return result;
}
async function post(body: unknown) {
  const response = await fetch("/api/assistance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

export function DraftAssistant({ editor, title, noteId, objects, types }: { editor: Editor; title: string; noteId?: string; objects: KnowledgeObjectRecord[]; types: ObjectTypeRecord[] }) {
  const [version, setVersion] = useState(() => JSON.stringify(editor.getJSON()));
  const [operation, setOperation] = useState<"improve" | "connections">("improve");
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [result, setResult] = useState<AssistanceResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ranges, setRanges] = useState<BlockRange[]>([]);
  const [baseline, setBaseline] = useState("");
  const [baselineTitle, setBaselineTitle] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const update = () => setVersion(JSON.stringify(editor.getJSON()));
    editor.on("update", update);
    return () => { mounted.current = false; editor.off("update", update); };
  }, [editor]);
  const stale = !!baseline && (version !== baseline || title !== baselineTitle);
  const blocks = editorBlocks(editor);
  const local = blocks.filter((b) => !b.protected).flatMap((block) => objects.filter((o) => !o.archivedAt && containsName(block.text, o.name)).map((object) => ({ block, object })))
    .filter(({ block, object }) => !dismissed.has(`local:${version}:${block.id}:${object.id}`)).slice(0, 5);

  const prepare = async (nextOperation: "improve" | "connections") => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setResult(null); setPreview(null); setOperation(nextOperation); setDismissed(new Set());
    const useSelection = nextOperation === "improve" && !editor.state.selection.empty;
    const captured = editorBlocks(editor, useSelection); setRanges(captured);
    setBaseline(JSON.stringify(editor.getJSON())); setBaselineTitle(title);
    try {
      const next: AiPreview = await post({ action: "preview", operation: nextOperation, title, noteId, blocks: captured.map(({ id, text, protected: protectedBlock }) => ({ id, text, protected: protectedBlock })) });
      if (mounted.current) { setPreview(next); setSelected(next.sources.map((s) => s.id)); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Falha na revisão."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const execute = async () => {
    if (!preview || stale || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const next: AssistanceResult = await post({ action: "execute", operation, previewId: preview.previewId, sourceIds: selected });
      if (mounted.current) { setResult(next); setPreview(null); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Falha na assistência."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const ignore = (key: string) => setDismissed((current) => new Set([...current, key]));
  const applyChange = (change: DraftSuggestion, key: string) => {
    if (JSON.stringify(editor.getJSON()) !== baseline || title !== baselineTitle) return;
    const block = ranges.find((b) => b.id === change.blockId);
    if (!block || block.protected || editor.state.doc.textBetween(block.from, block.to) !== change.before) return;
    const tr = editor.state.tr;
    if (block.whole && change.format !== "paragraph") {
      const schema = editor.schema;
      const text = schema.text(change.after);
      const replacement = change.format === "heading" ? schema.nodes.heading.create({ level: 2 }, text)
        : schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, text)));
      tr.replaceWith(block.nodeFrom, block.nodeTo, replacement);
    } else tr.insertText(change.after, block.from, block.to);
    setRanges((current) => current.filter((b) => b.id !== block.id).map((b) => ({ ...b, from: tr.mapping.map(b.from), to: tr.mapping.map(b.to), nodeFrom: tr.mapping.map(b.nodeFrom), nodeTo: tr.mapping.map(b.nodeTo) })));
    setBaseline(JSON.stringify(tr.doc.toJSON()));
    editor.view.dispatch(tr); ignore(key);
  };
  const applyObject = (suggestion: ObjectSuggestion, key: string, localBlock?: BlockRange) => {
    if (!localBlock && (JSON.stringify(editor.getJSON()) !== baseline || title !== baselineTitle)) return;
    const block = localBlock ?? ranges.find((b) => b.id === suggestion.blockId);
    if (!block || block.protected) return;
    let matchPosition = -1;
    let matchEnd = -1;
    editor.state.doc.nodesBetween(block.from, block.to, (node, pos) => {
      if (matchPosition >= 0 || !node.isText) return;
      const match = nameRange(node.text!, suggestion.text);
      if (match && pos + match.from >= block.from && pos + match.to <= block.to) { matchPosition = pos + match.from; matchEnd = pos + match.to; }
    });
    if (matchPosition < 0) { setError("O nome não corresponde ao trecho atual. Use @ para selecionar o objeto."); return; }
    const type = types.find((t) => t.id === suggestion.typeId);
    if (!type) return;
    const object = objects.find((o) => o.id === suggestion.objectId);
    const mention = editor.schema.nodes.mention.create({ id: object?.id ?? `new:${crypto.randomUUID()}`, label: object?.name ?? suggestion.text, typeId: type.id, typeLabel: type.name, color: type.color, isNew: !object });
    const tr = editor.state.tr.replaceWith(matchPosition, matchEnd, mention);
    setRanges((current) => current.map((b) => ({ ...b, from: tr.mapping.map(b.from, -1), to: tr.mapping.map(b.to, 1), nodeFrom: tr.mapping.map(b.nodeFrom, -1), nodeTo: tr.mapping.map(b.nodeTo, 1) })));
    if (!localBlock) setBaseline(JSON.stringify(tr.doc.toJSON()));
    editor.view.dispatch(tr); ignore(key);
  };
  return <section className="draft-assistant" aria-label="Assistência à escrita">
    <div className="ai-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void prepare("improve")}>✦ Melhorar</button><button type="button" className="ghost-button" disabled={busy} onClick={() => void prepare("connections")}>Buscar conexões</button><small>IA somente ao confirmar · selecione um trecho para economizar</small></div>
    {!!local.length && <div className="local-objects"><small>Objetos encontrados · busca local, sem IA</small>{local.map(({ block, object }) => <div key={`${block.id}:${object.id}`}><button type="button" onClick={() => applyObject({ blockId: block.id, text: object.name, typeId: object.typeId, objectId: object.id }, "", block)}>Vincular {object.name} · {object.typeName}</button><button type="button" aria-label={`Ignorar ${object.name}`} onClick={() => ignore(`local:${version}:${block.id}:${object.id}`)}>×</button></div>)}</div>}
    {busy && <p role="status">{preview ? "Analisando…" : "Preparando contexto…"}</p>}
    {stale && (preview || result) && <p role="status">O rascunho mudou. Clique novamente em Melhorar ou Buscar conexões para atualizar as sugestões.</p>}
    {preview && <div className="ai-review"><strong>Revisar envio · {operation === "improve" ? "Melhorar rascunho" : "Buscar conexões"}</strong><p>{preview.notice}</p>
      {preview.overLimit && <p className="inline-error">O contexto está amplo demais. Selecione um trecho menor ou remova fontes.</p>}
      {operation === "improve" && ranges.map((b) => <blockquote key={b.id}>{b.text}{b.protected && <small> · formatação/menções preservadas</small>}</blockquote>)}
      {!!preview.candidateObjects.length && <p>Objetos candidatos: {preview.candidateObjects.map((o) => o.name).join(", ")}</p>}
      {preview.sources.map((source) => <details key={source.id} open={source.id === "draft"}><summary><input aria-label={`Incluir ${source.title}`} type="checkbox" disabled={source.id === "draft"} checked={selected.includes(source.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, source.id] : ids.filter((id) => id !== source.id))} /> {source.title} · {source.updatedAt}</summary><blockquote>{source.content}</blockquote></details>)}
      <div className="ai-actions"><button type="button" className="primary-button" disabled={busy || stale || (preview.overLimit && selected.length === preview.sources.length)} onClick={() => void execute()}>Confirmar e enviar</button><button type="button" className="ghost-button" onClick={() => setPreview(null)}>Fechar</button></div>
    </div>}
    {result && <div className="ai-review">
      {!result.changes.length && !result.objects.length && !result.findings.length && <p>Nenhuma sugestão sustentada pelo contexto.</p>}
      {result.changes.map((c, i) => !dismissed.has(`change:${i}`) && <article key={`change:${i}`}><strong>{c.reason}</strong><p><del>{c.before}</del></p><p><ins>{c.after}</ins></p><small>Formato: {c.format === "heading" ? "Título" : c.format === "bullet" ? "Lista" : "Texto"}</small><div className="ai-actions"><button disabled={stale || !ranges.some((b) => b.id === c.blockId)} onClick={() => applyChange(c, `change:${i}`)}>Aplicar alteração</button><button onClick={() => ignore(`change:${i}`)}>Rejeitar</button></div></article>)}
      {result.objects.map((o, i) => !dismissed.has(`object:${i}`) && <article key={`object:${i}`}><p>{o.objectId ? "Vincular" : "Criar ao salvar"}: {o.text} · {types.find((t) => t.id === o.typeId)?.name}</p><div className="ai-actions"><button disabled={stale || !ranges.some((b) => b.id === o.blockId)} onClick={() => applyObject(o, `object:${i}`)}>Aceitar objeto</button><button onClick={() => ignore(`object:${i}`)}>Rejeitar</button></div></article>)}
      {result.findings.map((f, i) => <article key={i}><strong>{f.title}</strong><p>{f.explanation}</p><p>{f.detail?.impact}</p>{f.detail?.evidence.map((e, j) => <blockquote key={j}>{e.quote}<small>Fonte: {e.noteId === "draft" ? "Rascunho" : e.noteId}</small></blockquote>)}<p>Limitação: {f.detail?.limitation}</p><p>Próximo passo: {f.suggestedAction}</p></article>)}
      <div className="ai-actions"><button onClick={() => editor.commands.undo()}>Desfazer última edição</button><button onClick={() => setResult(null)}>Fechar sugestões</button></div>
    </div>}
    {error && <p role="alert" className="inline-error">{error}</p>}
  </section>;
}
