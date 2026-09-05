"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, BookOpen, Download, FileText, Upload } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MAX_FILE_BYTES, MAX_MARKDOWN_CHARACTERS, type LibraryDocument, type LibraryDocumentSummary } from "@/lib/library/contracts";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir a operação.");
  return body;
}

export function LibraryMarkdown({ markdown }: { markdown: string }) {
  return <div className="library-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    img: ({ alt }) => <span className="library-image-placeholder">[Imagem omitida{alt ? `: ${alt}` : ""}]</span>,
    a: ({ href, children }) => <a href={href && /^(https?:|mailto:)/i.test(href) ? href : undefined} target="_blank" rel="noopener noreferrer">{children}</a>,
  }}>{markdown}</Markdown></div>;
}

export function LibraryView({ search, onDirtyChange, onBusyChange }: { search: string; onDirtyChange: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const [documents, setDocuments] = useState<LibraryDocumentSummary[]>([]);
  const [selected, setSelected] = useState<LibraryDocument | null>(null);
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [editing, setEditing] = useState(false);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [results, setResults] = useState<Array<{ name: string; message: string; id?: string; error?: boolean }>>([]);
  const [reload, setReload] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const selectionRequest = useRef(0);
  const uploadLock = useRef(false);
  const dirty = !!selected && (title !== selected.title || markdown !== selected.markdown);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(uploading || busy);
    return () => onBusyChange?.(false);
  }, [uploading, busy, onBusyChange]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || uploading || busy) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, uploading, busy]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/library/documents?q=${encodeURIComponent(search)}&archived=${archived}`, { signal: controller.signal, cache: "no-store" });
        const next = await readResponse<LibraryDocumentSummary[]>(response);
        if (!controller.signal.aborted) setDocuments(next);
      } catch (error) {
        if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Falha ao buscar documentos.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 220);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [search, archived, reload]);

  const select = useCallback((document: LibraryDocument) => {
    setSelected(document); setTitle(document.title); setMarkdown(document.markdown); setEditing(false);
  }, []);

  async function open(id: string) {
    if (busy || (dirty && !window.confirm("Há alterações não salvas. Descartar e abrir outro documento?"))) return;
    const requestId = ++selectionRequest.current;
    setOpening(true); setNotice("");
    try {
      const document = await readResponse<LibraryDocument>(await fetch(`/api/library/documents/${id}`, { cache: "no-store" }));
      if (selectionRequest.current === requestId) select(document);
    } catch (error) { if (selectionRequest.current === requestId) setNotice(error instanceof Error ? error.message : "Falha ao abrir documento."); }
    finally { if (selectionRequest.current === requestId) setOpening(false); }
  }

  async function upload(files: File[]) {
    if (uploadLock.current || !files.length) return;
    uploadLock.current = true; setUploading(true); setResults([]);
    try {
      for (const file of files) {
        try {
          if (file.size > MAX_FILE_BYTES) throw new Error("O arquivo excede o limite de 20 MB.");
          const form = new FormData(); form.set("file", file);
          const result = await readResponse<{ document: LibraryDocument; duplicate: boolean }>(await fetch("/api/library/documents", { method: "POST", body: form }));
          setResults((current) => [...current, { name: file.name, id: result.document.id, message: result.duplicate ? `Já existe${result.document.archivedAt ? " nos arquivados" : ""}; conteúdo preservado.` : "Importado." }]);
          setReload((value) => value + 1);
        } catch (error) {
          setResults((current) => [...current, { name: file.name, error: true, message: error instanceof Error ? error.message : "Falha ao importar." }]);
        }
      }
    } finally { uploadLock.current = false; setUploading(false); }
  }

  async function save(archive?: boolean) {
    if (!selected || busy || opening) return;
    if (archive !== undefined && dirty && !window.confirm("Descartar as alterações não salvas e continuar?")) return;
    setBusy(true); setNotice("");
    try {
      const update = archive === undefined ? { title, markdown, revision: selected.revision } : { archived: archive, revision: selected.revision };
      const document = await readResponse<LibraryDocument>(await fetch(`/api/library/documents/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) }));
      if (archive === undefined) { select(document); setNotice("Documento salvo."); }
      else { setSelected(null); setNotice(archive ? "Documento arquivado." : "Documento restaurado."); }
      setReload((value) => value + 1);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }

  return <div className="library-layout">
    <section className="library-catalog" aria-label="Documentos da biblioteca">
      <div className={`library-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)); }}>
        <Upload size={24} aria-hidden="true" /><strong>Seus arquivos, prontos para consultar</strong>
        <p>Arraste arquivos aqui ou escolha no computador.</p>
        <button className="primary-button" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? "Importando arquivos…" : "Importar arquivos"}</button>
        <input ref={input} type="file" multiple accept=".txt,.md,.docx,.pdf" aria-label="Selecionar arquivos" hidden onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <small>TXT, MD, DOCX e PDF · até 20 MB por arquivo<br />Conversão local · PDFs precisam conter texto</small>
      </div>
      {results.length > 0 && <ul className="library-upload-results" aria-label="Resultados da importação" aria-live="polite">{results.map((result, index) => <li key={index} className={result.error ? "is-error" : ""}><strong>{result.name}</strong><span>{result.message}</span>{result.id && <button className="secondary-button compact" disabled={busy} onClick={() => void open(result.id!)}>Abrir documento</button>}</li>)}</ul>}
      <div className="library-list-toolbar"><strong>{documents.length} documento{documents.length !== 1 ? "s" : ""}</strong><label><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} /> Arquivados</label></div>
      <div className="library-list" aria-busy={loading}>
        {loading ? <p className="library-muted">Buscando documentos…</p> : documents.length ? documents.map((document) => <button key={document.id} className={`library-list-item ${selected?.id === document.id ? "is-selected" : ""}`} disabled={busy} onClick={() => void open(document.id)}>
          <FileText size={19} aria-hidden="true" /><span><strong>{document.title}</strong><small>{document.originalFormat.toUpperCase()} · {new Date(document.updatedAt).toLocaleDateString("pt-BR")}</small></span>
        </button>) : <div className="library-list-empty"><BookOpen size={24} /><strong>{search ? "Nenhum documento encontrado" : archived ? "Nenhum documento arquivado" : "Sua biblioteca começa aqui"}</strong><p>{search ? "Tente outro título ou trecho do conteúdo." : "Importe materiais de referência para ler, organizar e consultar depois."}</p></div>}
      </div>
    </section>
    <section className="library-reader" aria-label="Leitor de documento" aria-busy={opening || busy}>
      {notice && <div className="library-notice" role="status">{notice}<button aria-label="Fechar mensagem" onClick={() => setNotice("")}>×</button></div>}
      {opening && <p className="library-muted" role="status">Abrindo documento…</p>}
      {selected ? <>
        <header className="library-reader-header"><span className="eyebrow">{selected.originalFormat.toUpperCase()} · Revisão {selected.revision}{selected.archivedAt ? " · Arquivado" : ""}</span>
          {editing ? <input aria-label="Título do documento" maxLength={240} value={title} disabled={busy || opening} onChange={(event) => setTitle(event.target.value)} /> : <h2>{title}</h2>}
          <small>{selected.originalName}</small>
          <div className="library-reader-actions">
            <button className="secondary-button compact" disabled={busy || opening} onClick={() => setEditing((value) => !value)}>{editing ? "Visualizar" : "Editar Markdown"}</button>
            <button className="primary-button compact" disabled={!dirty || busy || opening || !title.trim() || !markdown.trim()} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar"}</button>
            <a className="secondary-button compact" href={`/api/library/documents/${selected.id}/download`} download title="Baixar versão salva"><Download size={14} /> Baixar .md</a>
            <button className="secondary-button compact" disabled={busy || opening} onClick={() => void save(!selected.archivedAt)}><Archive size={14} />{selected.archivedAt ? "Restaurar" : "Arquivar"}</button>
          </div>
          <span className={`library-save-state ${dirty ? "is-dirty" : ""}`}>{dirty ? "Alterações não salvas · o download contém a versão salva" : "Todas as alterações salvas"}</span>
        </header>
        {!!selected.warnings.length && <ul className="library-warnings">{selected.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        {editing ? <textarea className="library-markdown-editor" aria-label="Conteúdo Markdown" spellCheck={false} maxLength={MAX_MARKDOWN_CHARACTERS} value={markdown} disabled={busy || opening} onChange={(event) => setMarkdown(event.target.value)} /> : <LibraryMarkdown markdown={markdown} />}
      </> : <div className="library-reader-empty"><BookOpen size={36} /><h2>Uma base para suas próximas perguntas</h2><p>Abra um documento para ler e corrigir o Markdown. Seus materiais ficam disponíveis para a futura pesquisa conversacional.</p><small>Somente o texto convertido é guardado; mantenha os originais no seu computador.</small></div>}
    </section>
  </div>;
}
