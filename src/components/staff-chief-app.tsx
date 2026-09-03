"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Archive, ArrowUpRight, BrainCircuit, CircleDot, DatabaseBackup, FileText, LayoutDashboard,
  Link2, Map as MapIcon, Network, Plus, Search, Sparkles, Upload, X,
} from "lucide-react";
import type { AppState, FindingRecord, KnowledgeObjectRecord, NoteRecord, ViewName } from "@/lib/contracts";
import { AnalysisDialog } from "./analysis-dialog";

const KnowledgeMap = dynamic(() => import("./knowledge-map").then((module) => module.KnowledgeMap), {
  loading: () => <div className="loading-row">Carregando mapa…</div>,
  ssr: false,
});
const RichNoteEditor = dynamic(() => import("./rich-note-editor").then((module) => module.RichNoteEditor), {
  loading: () => <div className="loading-row">Carregando editor…</div>,
});

const viewTitles: Record<ViewName, { title: string; subtitle: string }> = {
  dashboard: { title: "Visão geral", subtitle: "O que merece sua atenção agora" },
  map: { title: "Mapa", subtitle: "Relações explícitas e sinais emergentes" },
  notes: { title: "Notas", subtitle: "Sua memória gerencial, conectada" },
};
const categoryLabels: Record<string, string> = { connection: "Conexão", risk: "Risco", contradiction: "Contradição", gap: "Lacuna", follow_up: "Follow-up" };

function relativeDate(value: string) {
  const date = new Date(value);
  const difference = Date.now() - date.getTime();
  if (difference < 60_000) return "agora";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} min`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} h`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "A operação falhou.");
  return data;
}

function Dashboard({ state, onOpenRun, onNewNote, onGoToNotes }: { state: AppState; onOpenRun(id: string): void; onNewNote(): void; onGoToNotes(): void }) {
  const metrics = [
    { label: "Notas ativas", value: state.metrics.notes, icon: FileText, tone: "green" },
    { label: "Objetos", value: state.metrics.objects, icon: CircleDot, tone: "violet" },
    { label: "Achados abertos", value: state.metrics.openFindings, icon: Sparkles, tone: "gold" },
    { label: "Follow-ups", value: state.metrics.pendingFollowUps, icon: ArrowUpRight, tone: "coral" },
    { label: "Sem vínculos", value: state.metrics.unlinkedNotes, icon: Link2, tone: "stone" },
  ];
  return <div className="dashboard-view">
    <div className="metric-grid">{metrics.map(({ label, value, icon: Icon, tone }) => <article className={`metric-card tone-${tone}`} key={label}><div className="metric-icon"><Icon size={18} /></div><div><strong>{value}</strong><span>{label}</span></div></article>)}</div>
    <section className="dashboard-section">
      <div className="section-heading"><div><span className="eyebrow">Atividade</span><h2>Análises recentes</h2></div></div>
      {state.recentRuns.length ? <div className="run-table">{state.recentRuns.map((run) => <button key={run.id} onClick={() => onOpenRun(run.id)}><span className={`run-dot run-dot-${run.status}`} /><span><strong>{run.scopeType === "note" ? "Análise de nota" : "Análise de objeto"}</strong><small>{relativeDate(run.createdAt)} · Codex</small></span><span className="run-status">{run.status === "completed" ? "Concluída" : run.status === "partial" ? "Parcial" : run.status === "running" ? "Em curso" : run.status}</span><ArrowUpRight size={15} /></button>)}</div>
        : <div className="soft-empty"><div className="soft-empty-mark"><BrainCircuit size={23} /></div><div><strong>Ainda não há análises</strong><p>Crie uma nota conectada e peça ao Codex para olhar além do óbvio.</p></div><button className="secondary-button" onClick={state.notes.length ? onGoToNotes : onNewNote}>{state.notes.length ? "Ver notas" : "Criar primeira nota"}</button></div>}
    </section>
    <section className="dashboard-section knowledge-health">
      <div className="section-heading"><div><span className="eyebrow">Saúde da base</span><h2>Conhecimento conectado</h2></div><span className="health-score">{state.metrics.notes ? Math.round(((state.metrics.notes - state.metrics.unlinkedNotes) / state.metrics.notes) * 100) : 0}%</span></div>
      <div className="health-bar"><span style={{ width: `${state.metrics.notes ? ((state.metrics.notes - state.metrics.unlinkedNotes) / state.metrics.notes) * 100 : 0}%` }} /></div>
      <p>{state.metrics.unlinkedNotes ? `${state.metrics.unlinkedNotes} nota(s) ainda não mencionam pessoas, projetos ou ideias.` : state.metrics.notes ? "Todas as notas ativas possuem ao menos uma conexão." : "O indicador cresce quando suas notas começam a se conectar."}</p>
    </section>
  </div>;
}

function NotesList({ notes, selectedId, onSelect, onNew }: { notes: NoteRecord[]; selectedId: string | null; onSelect(id: string): void; onNew(): void }) {
  return <div className="notes-view">
    <div className="view-toolbar"><div><span className="eyebrow">Biblioteca</span><strong>{notes.length} nota{notes.length === 1 ? "" : "s"}</strong></div><button className="primary-button compact" onClick={onNew}><Plus size={15} /> Nova</button></div>
    {notes.length ? <div className="note-list">{notes.map((note) => <button key={note.id} className={selectedId === note.id ? "note-row is-selected" : "note-row"} onClick={() => onSelect(note.id)}><div className="note-row-top"><strong>{note.title || note.contentText.slice(0, 54) || "Nota sem título"}</strong><time>{relativeDate(note.updatedAt)}</time></div><p>{note.contentText || "Sem conteúdo"}</p><div className="note-tags">{note.mentions.slice(0, 4).map((object) => <span key={object.id} style={{ "--tag-color": object.typeColor } as React.CSSProperties}>{object.typeIcon} {object.name}</span>)}{note.mentions.length > 4 && <span>+{note.mentions.length - 4}</span>}</div></button>)}</div>
      : <div className="center-empty"><div className="empty-orbit">✎</div><h2>Capture o que está na sua cabeça</h2><p>Uma nota rápida pode virar contexto valioso amanhã.</p><button className="primary-button" onClick={onNew}><Plus size={15} /> Criar primeira nota</button></div>}
  </div>;
}

function FindingSummary({ findings, onOpenRun }: { findings: FindingRecord[]; onOpenRun(id: string): void }) {
  return <div className="inspector-stack"><header className="inspector-title"><span className="eyebrow">Prioridades</span><h2>Achados abertos</h2><p>Sinais encontrados somente nas análises que você iniciou.</p></header>
    <div className="compact-findings">{findings.length ? findings.map((finding) => <button key={finding.id} onClick={() => onOpenRun(finding.runId)} className={`compact-finding priority-${finding.priority}`}><span>{categoryLabels[finding.category]}</span><strong>{finding.title}</strong><small>{finding.priority === "high" ? "Prioridade alta" : finding.priority === "medium" ? "Prioridade média" : "Prioridade baixa"} · {finding.confidence}%</small></button>) : <div className="empty-inspector compact"><div className="empty-orbit">✓</div><h3>Nada pendente</h3><p>Achados abertos aparecerão aqui.</p></div>}</div>
  </div>;
}

function ObjectInspector({ object, state, onAnalyze, onArchive, onChanged }: { object: KnowledgeObjectRecord | null; state: AppState; onAnalyze(id: string): void; onArchive(id: string): void; onChanged(): void }) {
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [name, setName] = useState(object?.name ?? "");
  const [description, setDescription] = useState(object?.description ?? "");
  const [error, setError] = useState("");
  if (!object) return <div className="empty-inspector"><div className="empty-orbit">◎</div><h3>Explore uma conexão</h3><p>Selecione um objeto no mapa para ver suas notas e relações.</p></div>;
  const linkedNotes = state.notes.filter((note) => note.mentions.some((mention) => mention.id === object.id));
  const relations = state.relationships.filter((relation) => relation.sourceObjectId === object.id || relation.targetObjectId === object.id);
  const addRelation = async () => {
    setError("");
    try {
      await readJson(await fetch("/api/relationships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceObjectId: object.id, targetObjectId: target, label }) }));
      setTarget(""); setLabel(""); onChanged();
    } catch (relationError) { setError(relationError instanceof Error ? relationError.message : "Falha ao relacionar."); }
  };
  const saveObject = async () => {
    setError("");
    try {
      await readJson(await fetch(`/api/objects/${object.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description }) }));
      onChanged();
    } catch (objectError) { setError(objectError instanceof Error ? objectError.message : "Falha ao salvar objeto."); }
  };
  return <div className="object-inspector">
    <header className="object-hero" style={{ "--object-color": object.typeColor } as React.CSSProperties}><div className="object-icon">{object.typeIcon}</div><span className="eyebrow">{object.typeName}</span><h2>{object.name}</h2><div className="object-actions"><button className="secondary-button" onClick={() => onAnalyze(object.id)}><Sparkles size={15} /> Analisar</button><button className="icon-button" title="Arquivar objeto" onClick={() => onArchive(object.id)}><Archive size={15} /></button></div></header>
    <section className="inspector-section object-edit"><div className="mini-heading"><strong>Dados do objeto</strong></div><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome" maxLength={120} /><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição opcional" maxLength={2000} rows={3} /><button onClick={saveObject} disabled={!name.trim() || (name === object.name && description === object.description)}>Salvar dados</button></section>
    <section className="inspector-section"><div className="mini-heading"><strong>Relações confirmadas</strong><span>{relations.length}</span></div>{relations.map((relation) => { const otherId = relation.sourceObjectId === object.id ? relation.targetObjectId : relation.sourceObjectId; const other = state.objects.find((item) => item.id === otherId); return <div className="relation-row" key={relation.id}><Network size={14} /><span><strong>{other?.name ?? "Objeto arquivado"}</strong><small>{relation.label}</small></span></div>; })}
      <div className="relation-form"><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Relacionar com…</option>{state.objects.filter((item) => item.id !== object.id).map((item) => <option key={item.id} value={item.id}>{item.typeIcon} {item.name}</option>)}</select><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: depende de" maxLength={120} /><button onClick={addRelation} disabled={!target || !label.trim()}>Adicionar relação</button></div>
    </section>
    <section className="inspector-section"><div className="mini-heading"><strong>Notas relacionadas</strong><span>{linkedNotes.length}</span></div>{linkedNotes.map((note) => <div className="linked-note" key={note.id}><FileText size={14} /><span>{note.title || note.contentText.slice(0, 45) || "Nota sem título"}</span></div>)}</section>
    {error && <p className="inline-error">{error}</p>}
  </div>;
}

export function StaffChiefApp({ initialState }: { initialState: AppState }) {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<ViewName>("dashboard");
  const [search, setSearch] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialState.notes[0]?.id ?? null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeIcon, setTypeIcon] = useState("○");
  const [typeColor, setTypeColor] = useState("#4F7D70");
  const [notice, setNotice] = useState("");
  const [analysisScope, setAnalysisScope] = useState<{ type: "note" | "object"; id: string } | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (query = search) => {
    const result = await readJson(await fetch(`/api/state?q=${encodeURIComponent(query)}`, { cache: "no-store" }));
    setState(result);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => { void refresh(search); }, 220);
    return () => clearTimeout(timer);
  }, [search, refresh]);

  const selectedNote = state.notes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedObject = state.objects.find((object) => object.id === selectedObjectId) ?? null;

  const guardUnsaved = () => !editorDirty || window.confirm("Há alterações não salvas. Descartar e continuar?");
  const changeView = (next: ViewName) => {
    if (view === "notes" && next !== "notes" && !guardUnsaved()) return;
    setView(next); if (next !== "notes") setIsNewNote(false);
  };
  const newNote = () => {
    if (view === "notes" && !guardUnsaved()) return;
    setView("notes"); setSelectedNoteId(null); setIsNewNote(true); setEditorDirty(true);
  };
  const selectNote = (noteId: string) => {
    if (!guardUnsaved()) return;
    setSelectedNoteId(noteId); setIsNewNote(false); setEditorDirty(false);
  };
  const selectObject = (objectId: string) => {
    if (view === "notes" && !guardUnsaved()) return;
    setSelectedObjectId(objectId); setView("map"); setIsNewNote(false); setEditorDirty(false);
  };

  const createType = async () => {
    try {
      await readJson(await fetch("/api/types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: typeName, icon: typeIcon, color: typeColor }) }));
      setTypeName(""); setTypeFormOpen(false); await refresh(); setNotice("Tipo criado.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha ao criar tipo."); }
  };

  const archive = async (kind: "note" | "object" | "type", itemId: string) => {
    const label = kind === "note" ? "registro" : kind === "object" ? "objeto" : "tipo";
    if (!window.confirm(`Arquivar este ${label}? As referências históricas serão preservadas.`)) return;
    await readJson(await fetch("/api/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id: itemId }) }));
    if (kind === "note") { setSelectedNoteId(null); setIsNewNote(false); }
    if (kind === "object") setSelectedObjectId(null);
    await refresh();
  };

  const restore = async (file: File) => {
    if (!window.confirm("A restauração substituirá a base atual. Um backup de segurança será criado automaticamente. Continuar?")) return;
    try {
      const payload = JSON.parse(await file.text());
      const result = await readJson(await fetch("/api/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      await refresh(""); setSearch(""); setSelectedNoteId(null); setSelectedObjectId(null); setNotice(`Base restaurada. Cópia de segurança: ${result.safetyBackup}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Arquivo de backup inválido."); }
  };

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BrainCircuit size={20} /></div><div><strong>Staff Chief</strong><span>segundo cérebro</span></div></div>
      <button className="new-note-button" onClick={newNote}><Plus size={17} /> Nova nota</button>
      <nav className="main-nav" aria-label="Navegação principal">
        <button className={view === "dashboard" ? "is-active" : ""} onClick={() => changeView("dashboard")}><LayoutDashboard size={17} /> Dashboard</button>
        <button className={view === "map" ? "is-active" : ""} onClick={() => changeView("map")}><MapIcon size={17} /> Mapa <span>{state.objects.length}</span></button>
        <button className={view === "notes" ? "is-active" : ""} onClick={() => changeView("notes")}><FileText size={17} /> Notas <span>{state.notes.length}</span></button>
      </nav>
      <div className="type-heading"><span>Tipos de objeto</span><button className="icon-button small" onClick={() => setTypeFormOpen((value) => !value)} aria-label="Novo tipo"><Plus size={14} /></button></div>
      <div className="type-list">{state.objectTypes.map((type) => <div className="type-row" key={type.id}><button className="type-select" onClick={() => { setView("map"); const first = state.objects.find((object) => object.typeId === type.id); if (first) setSelectedObjectId(first.id); }}><span className="type-dot" style={{ background: type.color }}>{type.icon}</span><span>{type.name}</span><small>{state.objects.filter((object) => object.typeId === type.id).length}</small></button><button className="type-archive" title={`Arquivar ${type.name}`} aria-label={`Arquivar ${type.name}`} onClick={() => void archive("type", type.id)}><Archive size={12} /></button></div>)}</div>
      {typeFormOpen && <div className="type-form"><div><input className="icon-field" value={typeIcon} onChange={(event) => setTypeIcon(event.target.value)} maxLength={8} aria-label="Ícone" /><input value={typeName} onChange={(event) => setTypeName(event.target.value)} placeholder="Nome do tipo" maxLength={60} /></div><div><input type="color" value={typeColor} onChange={(event) => setTypeColor(event.target.value)} /><button onClick={createType} disabled={!typeName.trim()}>Criar tipo</button></div></div>}
      <div className="sidebar-footer"><a className="utility-button" href="/api/backup" download><DatabaseBackup size={15} /> Exportar backup</a><button className="utility-button" onClick={() => restoreInput.current?.click()}><Upload size={15} /> Restaurar base</button><input ref={restoreInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ""; }} /><div className="local-badge"><span /><strong>Somente local</strong><small>127.0.0.1</small></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="eyebrow">{viewTitles[view].subtitle}</span><h1>{viewTitles[view].title}</h1></div><div className="topbar-tools"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar notas…" />{search && <button onClick={() => setSearch("")} aria-label="Limpar"><X size={13} /></button>}</label></div></header>
      <div className="center-pane">
        {view === "dashboard" && <Dashboard state={state} onOpenRun={setOpenRunId} onNewNote={newNote} onGoToNotes={() => setView("notes")} />}
        {view === "map" && <KnowledgeMap state={state} selectedObjectId={selectedObjectId} onSelectObject={setSelectedObjectId} />}
        {view === "notes" && <NotesList notes={state.notes} selectedId={selectedNoteId} onSelect={selectNote} onNew={newNote} />}
      </div>
    </section>

    <aside className="inspector">
      {view === "dashboard" && <FindingSummary findings={state.priorityFindings} onOpenRun={setOpenRunId} />}
      {view === "map" && <ObjectInspector key={selectedObject?.id ?? "no-object"} object={selectedObject} state={state} onAnalyze={(id) => setAnalysisScope({ type: "object", id })} onArchive={(id) => void archive("object", id)} onChanged={() => void refresh()} />}
      {view === "notes" && <RichNoteEditor key={isNewNote ? "new-note" : selectedNote?.id ?? "no-note"} note={selectedNote} isNew={isNewNote} objectTypes={state.objectTypes} objects={state.objects} onDirtyChange={setEditorDirty} onSaved={(note) => { setSelectedNoteId(note.id); setIsNewNote(false); setEditorDirty(false); void refresh(); }} onAnalyze={(id) => setAnalysisScope({ type: "note", id })} onArchive={(id) => void archive("note", id)} onSelectObject={selectObject} />}
    </aside>

    {(analysisScope || openRunId) && <AnalysisDialog key={openRunId ?? `${analysisScope?.type}:${analysisScope?.id}`} scope={analysisScope} existingRunId={openRunId} notes={state.notes} objects={state.objects} onOpenSource={(type, sourceId) => { setAnalysisScope(null); setOpenRunId(null); if (type === "note") { setView("notes"); setSelectedNoteId(sourceId); setIsNewNote(false); setEditorDirty(false); } else { setView("map"); setSelectedObjectId(sourceId); } }} onClose={() => { setAnalysisScope(null); setOpenRunId(null); }} onChanged={refresh} />}
    {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice("")}><X size={14} /></button></div>}
  </main>;
}
