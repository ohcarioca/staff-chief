"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, BookOpen, MessageSquare, Plus, Send, X } from "lucide-react";
import { LibraryMarkdown } from "./library-view";
import type { LibraryDocumentSummary } from "@/lib/library/contracts";
import { isNoteSource, isPending, researchLimits, type ResearchChunk, type ResearchConversation, type ResearchConversationSummary, type ResearchMessage, type ResearchSource } from "@/lib/research/contracts";

async function request<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, signal, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Não foi possível concluir a operação.");
  return value;
}
const statusLabels = { queued: "Preparando resposta…", running: "Consultando o Codex…", completed: "Concluída", failed: "Falha na resposta", cancelled: "Resposta cancelada", interrupted: "Execução interrompida" };

function ResearchSetup({ onClose, onCreated }: { onClose: () => void; onCreated: (conversation: ResearchConversation) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [documents, setDocuments] = useState<LibraryDocumentSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const creationId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    request<LibraryDocumentSummary[]>("/api/library/documents")
      .then((value) => { if (active) setDocuments(value); }).catch((error) => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function next() {
    setBusy(true); setError("");
    try {
      onCreated(await request<ResearchConversation>("/api/research/conversations", "POST", { requestId: creationId.current, documentIds: selected }));
    } catch (error) { setError(error instanceof Error ? error.message : "Falha ao preparar conversa."); }
    finally { setBusy(false); }
  }
  return <dialog className="research-dialog" ref={dialog} aria-labelledby="research-setup-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><span className="eyebrow">Nova conversa</span><h2 id="research-setup-title">Adicionar documentos</h2></div><button className="icon-button" disabled={busy} aria-label="Fechar seleção" onClick={onClose}><X size={18} /></button></header>
      <p>Todas as notas ativas entram automaticamente, sem filtro por data. Você pode adicionar até 20 documentos da biblioteca. O limite total é de 5 milhões de caracteres. Para incluir notas novas ou atualizadas depois, inicie outra conversa.</p>
      <input className="research-input" aria-label="Buscar fontes" placeholder="Buscar documento pelo título…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="research-source-picker">{loading ? <p>Carregando documentos…</p> : !documents.length ? <p>Nenhum documento na biblioteca. Você pode continuar apenas com suas notas.</p> : documents.filter((document) => document.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((document) => <label key={document.id}>
        <input type="checkbox" checked={selected.includes(document.id)} disabled={busy || (!selected.includes(document.id) && selected.length >= researchLimits.documents)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} />
        <span>{document.title}<small>{document.originalFormat.toUpperCase()} · Revisão {document.revision}</small></span>
      </label>)}</div>
      <p className="research-muted">{selected.length} de 20 documentos selecionados</p>
    {error && <p role="alert" className="research-error">{error}</p>}
    <footer><button className="primary-button" disabled={busy || loading} onClick={() => void next()}>{busy ? "Preparando…" : "Iniciar conversa"}</button></footer>
  </dialog>;
}

function SourceDialog({ conversationId, sourceId, chunk, quote, onClose }: { conversationId: string; sourceId: string; chunk?: ResearchChunk; quote?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<ResearchSource | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    request<ResearchSource>(`/api/research/conversations/${conversationId}/sources/${sourceId}`).then((value) => { if (active) setSource(value); })
      .catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [conversationId, sourceId]);
  const position = chunk && quote ? chunk.content.indexOf(quote) : -1;
  return <dialog ref={dialog} className="research-dialog research-source-dialog" aria-labelledby="research-source-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><div><span className="eyebrow">Cópia preservada na conversa</span><h2 id="research-source-title">{source?.title ?? chunk?.title ?? "Fonte"}</h2></div><button className="icon-button" aria-label="Fechar fonte" onClick={onClose}><X size={18} /></button></header>
    {error && <p role="alert">{error}</p>}
    {chunk && <><p>Revisão {chunk.revision} · {chunk.section}</p><blockquote className="research-evidence">{position >= 0 ? <>{chunk.content.slice(0, position)}<mark>{quote}</mark>{chunk.content.slice(position + quote!.length)}</> : chunk.content}</blockquote></>}
    {source ? chunk ? <details><summary>Ver documento completo · revisão {source.revision}</summary><LibraryMarkdown markdown={source.markdown} /></details> : <LibraryMarkdown markdown={source.markdown} /> : !error && <p>Carregando fonte…</p>}
  </dialog>;
}

function ConversationThread({ initial, onChanged, onDirtyChange }: { initial: ResearchConversation; onChanged: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [conversation, setConversation] = useState(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [source, setSource] = useState<{ sourceId: string; chunk?: ResearchChunk; quote?: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const pending = conversation.messages.find((message) => isPending(message.status));
  const pendingId = pending?.id;
  const pendingAttempt = pending?.attempt;
  const requestIdentity = useRef<{ question: string; id: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const dirty = !!question.trim() || (renaming && title !== conversation.title);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [conversation.messages.length]);
  const mergeMessage = useCallback((message: ResearchMessage) => setConversation((current) => ({ ...current,
    messages: current.messages.some((item) => item.id === message.id) ? current.messages.map((item) => item.id === message.id ? message : item) : [...current.messages, message],
  })), []);
  useEffect(() => {
    if (!pendingId) return;
    const events = new EventSource(`/api/research/messages/${pendingId}/events`);
    events.onmessage = (event) => {
      const message = JSON.parse(event.data) as ResearchMessage;
      setReconnecting(false); mergeMessage(message);
      if (!isPending(message.status)) { events.close(); onChanged(); }
    };
    events.onerror = () => setReconnecting(true);
    return () => events.close();
  }, [pendingId, pendingAttempt, mergeMessage, onChanged]);

  async function send() {
    if (busy || pending || !question.trim()) return;
    setBusy(true); setError("");
    if (requestIdentity.current?.question !== question.trim()) requestIdentity.current = { id: crypto.randomUUID(), question: question.trim() };
    try {
      const message = await request<ResearchMessage>(`/api/research/conversations/${conversation.id}/messages`, "POST", { question: question.trim(), requestId: requestIdentity.current!.id });
      mergeMessage(message); setQuestion(""); requestIdentity.current = null; onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "Falha ao enviar pergunta."); }
    finally { setBusy(false); }
  }
  async function messageAction(message: ResearchMessage, action: "cancel" | "retry") {
    setBusy(true); setError("");
    try { mergeMessage(await request<ResearchMessage>(`/api/research/messages/${message.id}/${action}`, "POST", action === "retry" ? { attempt: message.attempt } : undefined)); }
    catch (error) { setError(error instanceof Error ? error.message : "Falha ao atualizar resposta."); }
    finally { setBusy(false); }
  }
  async function update(body: { title?: string; archived?: boolean }) {
    setBusy(true); setError("");
    try { setConversation(await request<ResearchConversation>(`/api/research/conversations/${conversation.id}`, "PATCH", body)); setRenaming(false); onChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : "Falha ao atualizar conversa."); }
    finally { setBusy(false); }
  }

  return <section className="research-thread" aria-label="Conversa de pesquisa">
    <header className="research-thread-header">
      <span className="eyebrow">{conversation.sources.length} fontes fixadas (notas e documentos){conversation.archivedAt ? " · Conversa arquivada" : ""}</span>
      {renaming ? <form onSubmit={(event) => { event.preventDefault(); void update({ title }); }}><input className="research-input" aria-label="Título da conversa" maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} /><button className="secondary-button" disabled={busy || !title.trim()}>Salvar título</button><button className="secondary-button" type="button" onClick={() => { setRenaming(false); setTitle(conversation.title); }}>Cancelar</button></form> : <div className="research-title-row"><h2>{conversation.title}</h2><button className="secondary-button compact" disabled={busy} onClick={() => setRenaming(true)}>Renomear</button><button className="secondary-button compact" disabled={busy || !!pending} onClick={() => void update({ archived: !conversation.archivedAt })}><Archive size={14} />{conversation.archivedAt ? "Restaurar" : "Arquivar"}</button></div>}
      <div className="research-source-chips">{conversation.sources.map((item) => <button key={item.id} onClick={() => setSource({ sourceId: item.id })}><BookOpen size={13} />{item.title}<small>{isNoteSource(item) ? "Nota" : `v${item.revision}`}</small></button>)}</div>
    </header>
    <div className="research-messages" aria-live="polite">
      {!conversation.messages.length && <div className="research-welcome"><MessageSquare size={32} /><h3>O que você quer entender?</h3><p>Faça uma pergunta específica, peça uma explicação ou compare informações. As respostas mostrarão os trechos usados como evidência.</p></div>}
      {conversation.messages.map((message, index) => <article key={message.id} className="research-turn">
        <div className="research-question"><span className="eyebrow">Você</span><p>{message.question}</p></div>
        <div className="research-answer"><span className="eyebrow">Pesquisa · {statusLabels[message.status]}</span>
          {!!message.historyOmitted && <p className="research-context-notice">{message.historyOmitted} pergunta(s) anterior(es) ficaram fora do contexto desta resposta por limite de tamanho.</p>}
          {message.answer?.blocks.map((block, blockIndex) => <div key={blockIndex}><LibraryMarkdown markdown={block.text} /><div className="research-citations">{block.citations.map((citation, citationIndex) => {
            const chunk = message.chunks.find((item) => item.id === citation.chunkId);
            return chunk ? <button key={citationIndex} onClick={() => setSource({ sourceId: chunk.sourceId, chunk, quote: citation.quote })}><BookOpen size={12} />{chunk.title} · {chunk.section}</button> : null;
          })}</div></div>)}
          {message.answer?.insufficientEvidence && <p className="research-context-notice">Evidência limitada nos trechos consultados.</p>}
          {message.error && <p className="research-error">{message.error}</p>}
          {isPending(message.status) && <button className="secondary-button compact" disabled={busy} onClick={() => void messageAction(message, "cancel")}>Cancelar resposta</button>}
          {["failed", "cancelled", "interrupted"].includes(message.status) && index === conversation.messages.length - 1 && !conversation.archivedAt && <button className="secondary-button compact" disabled={busy || !!pending} onClick={() => void messageAction(message, "retry")}>Tentar novamente</button>}
        </div>
      </article>)}<div ref={end} />
    </div>
    <footer className="research-composer">
      {error && <p role="alert" className="research-error">{error}</p>}
      {reconnecting && pending && <p role="status">Reconectando ao andamento da resposta…</p>}
      {conversation.archivedAt ? <p>Restaure esta conversa para continuar perguntando.</p> : <>
        <form onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea aria-label="Pergunta" placeholder="Pergunte sobre suas notas e documentos…" maxLength={researchLimits.question} rows={3} value={question} disabled={busy} onChange={(event) => setQuestion(event.target.value)} /><button className="primary-button" disabled={busy || !!pending || !question.trim()}><Send size={16} />Enviar</button></form>
        <small>Enviar compartilha a pergunta, o histórico recente e trechos das notas e dos documentos fixados com o Codex. {question.length}/4.000</small>
      </>}
    </footer>
    {source && <SourceDialog key={source.sourceId + (source.chunk?.id ?? "")} conversationId={conversation.id} {...source} onClose={() => setSource(null)} />}
  </section>;
}

export function ResearchView({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [conversations, setConversations] = useState<ResearchConversationSummary[]>([]);
  const [selected, setSelected] = useState<ResearchConversation | null>(null);
  const [archived, setArchived] = useState(false);
  const [setup, setSetup] = useState(false);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const selection = useRef(0);
  const creationId = useRef<string | null>(null);
  const creating = useRef(false);
  const changed = useCallback(() => setReload((value) => value + 1), []);
  const dirtyChanged = useCallback((value: boolean) => { dirty.current = value; onDirtyChange(value); }, [onDirtyChange]);
  useEffect(() => {
    let active = true;
    request<ResearchConversationSummary[]>(`/api/research/conversations?archived=${archived}`).then((value) => { if (active) { setConversations(value); setError(""); } })
      .catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [archived, reload]);
  const guard = () => !dirty.current || window.confirm("Há uma pergunta ou título não salvo. Descartar e continuar?");
  const created = (conversation: ResearchConversation) => {
    selection.current++; setSelected(conversation); setSetup(false); setArchived(false); setError(""); changed();
  };
  async function start() {
    if (creating.current || !guard()) return;
    creating.current = true; setLoading(true); setError("");
    creationId.current ??= crypto.randomUUID();
    try {
      created(await request<ResearchConversation>("/api/research/conversations", "POST", { requestId: creationId.current, documentIds: [] }));
      creationId.current = null;
    } catch (error) { setError(error instanceof Error ? error.message : "Falha ao iniciar conversa."); }
    finally { creating.current = false; setLoading(false); }
  }
  async function open(id: string) {
    if (id === selected?.id || !guard()) return;
    const token = ++selection.current; setLoading(true); setError("");
    try { const conversation = await request<ResearchConversation>(`/api/research/conversations/${id}`); if (token === selection.current) setSelected(conversation); }
    catch (error) { if (token === selection.current) setError(error instanceof Error ? error.message : "Falha ao abrir conversa."); }
    finally { if (token === selection.current) setLoading(false); }
  }
  return <div className="research-layout">
    <aside className="research-history" aria-label="Histórico de pesquisas"><button className="primary-button" disabled={loading} onClick={() => void start()}><Plus size={16} />Nova conversa</button><button className="secondary-button" disabled={loading} onClick={() => { if (guard()) setSetup(true); }}>Com documentos</button>
      <label className="research-archived"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />Conversas arquivadas</label>
      {!conversations.length && <p className="research-muted">{archived ? "Nenhuma conversa arquivada." : "Suas conversas aparecerão aqui."}</p>}
      {conversations.map((conversation) => <button className={`research-history-item ${selected?.id === conversation.id ? "is-selected" : ""}`} key={conversation.id} onClick={() => void open(conversation.id)}><MessageSquare size={16} /><span>{conversation.title}<small>{new Date(conversation.updatedAt).toLocaleDateString("pt-BR")}</small></span></button>)}
    </aside>
    <div className="research-main" inert={loading}>{error && <p role="alert" className="research-error">{error}</p>}{loading && <p role="status">Abrindo conversa…</p>}
      {selected ? <ConversationThread key={selected.id} initial={selected} onChanged={changed} onDirtyChange={dirtyChanged} /> : <div className="research-welcome"><BookOpen size={38} /><h2>Converse com sua biblioteca</h2><p>Pesquise todas as suas notas ativas e, se desejar, adicione documentos da biblioteca. As fontes e o histórico ficam preservados em cada conversa.</p><button className="secondary-button" disabled={loading} onClick={() => void start()}>Iniciar conversa com notas</button></div>}
    </div>
    {setup && <ResearchSetup onClose={() => setSetup(false)} onCreated={created} />}
  </div>;
}
