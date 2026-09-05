"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Archive, ArrowUpRight, BrainCircuit, CalendarDays, CircleDot, DatabaseBackup, FileText, LayoutDashboard,
  Link2, Map as MapIcon, Network, PanelLeftClose, PanelLeftOpen, Plus, Search, Sparkles, Upload, X,
} from "lucide-react";
import type { AnalysisDateRange, AnalysisScope, AnalysisType, AppState, FindingRecord, KnowledgeObjectRecord, NoteRecord, ViewName } from "@/lib/contracts";
import { AnalysisDialog } from "./analysis-dialog";
import { AnalysisLauncherDialog } from "./analysis-launcher-dialog";
import { priorityLabels, priorityOrder, runStatusLabels } from "./analysis-ui";

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
  objects: { title: "Objetos", subtitle: "Conhecimento organizado por tipo" },
};
const categoryLabels: Record<string, string> = { connection: "Conexão", risk: "Risco", contradiction: "Contradição", gap: "Lacuna", follow_up: "Próximo passo" };

type DateRange = AnalysisDateRange;

function dateInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function isWithinRange(value: string, range: DateRange) {
  const timestamp = new Date(value).getTime();
  const start = range.start ? new Date(`${range.start}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const end = range.end ? new Date(`${range.end}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  return timestamp >= start && timestamp <= end;
}

function relativeDate(value: string) {
  const date = new Date(value);
  const difference = Date.now() - date.getTime();
  if (difference < 60_000) return "agora";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} min`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} h`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function analysisRunLabel(scopeType: AnalysisScope["type"]) {
  if (scopeType === "collection") return "Análise geral";
  return scopeType === "note" ? "Análise de nota" : "Análise de objeto";
}

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "A operação falhou.");
  return data;
}

function Dashboard({ state, dateRange, onOpenRun, onNewNote, onGoToNotes, onComposerSaved, onComposerDirty, onSelectObject }: { state: AppState; dateRange: DateRange; onOpenRun(id: string): void; onNewNote(): void; onGoToNotes(): void; onComposerSaved(note: NoteRecord): void; onComposerDirty(dirty: boolean): void; onSelectObject(objectId: string): void }) {
  const [composerVersion, setComposerVersion] = useState(0);
  const filteredNotes = state.notes.filter((note) => isWithinRange(note.updatedAt, dateRange));
  const filteredRuns = state.recentRuns.filter((run) => isWithinRange(run.createdAt, dateRange));
  const filteredFindings = state.priorityFindings.filter((finding) => isWithinRange(finding.createdAt, dateRange));
  const linkedObjectIds = new Set(filteredNotes.flatMap((note) => note.mentions.map((object) => object.id)));
  const isAllTime = !dateRange.start && !dateRange.end;
  const noteCount = isAllTime ? state.metrics.notes : filteredNotes.length;
  const objectCount = isAllTime ? state.metrics.objects : linkedObjectIds.size;
  const unlinkedNotes = isAllTime ? state.metrics.unlinkedNotes : filteredNotes.filter((note) => note.mentions.length === 0).length;
  const metrics = [
    { label: "Notas ativas", value: noteCount, icon: FileText, tone: "green" },
    { label: "Objetos", value: objectCount, icon: CircleDot, tone: "violet" },
    { label: "Achados abertos", value: isAllTime ? state.metrics.openFindings : filteredFindings.length, icon: Sparkles, tone: "gold" },
    { label: "Próximos passos", value: isAllTime ? state.metrics.pendingFollowUps : filteredFindings.filter((finding) => finding.category === "follow_up").length, icon: ArrowUpRight, tone: "coral" },
    { label: "Sem vínculos", value: unlinkedNotes, icon: Link2, tone: "stone" },
  ];
  const health = noteCount ? Math.round(((noteCount - unlinkedNotes) / noteCount) * 100) : 0;
  return <div className="dashboard-view">
    <div className="metric-grid">{metrics.map(({ label, value, icon: Icon, tone }) => <article className={`metric-card tone-${tone}`} key={label}><div className="metric-icon"><Icon size={18} /></div><div><strong>{value}</strong><span>{label}</span></div></article>)}</div>
    <section className="dashboard-section knowledge-health">
      <div className="section-heading"><div><span className="eyebrow">Saúde da base</span><h2>Conhecimento conectado</h2></div><span className="health-score">{health}%</span></div>
      <div className="health-bar"><span style={{ width: `${health}%` }} /></div>
      <p>{unlinkedNotes ? `${unlinkedNotes} nota(s) ainda não mencionam pessoas, projetos ou ideias.` : noteCount ? "Todas as notas ativas possuem ao menos uma conexão." : "O indicador cresce quando suas notas começam a se conectar."}</p>
    </section>
    <section className="dashboard-section activity-section">
      <div className="section-heading"><div><span className="eyebrow">Atividade</span><h2>Análises recentes</h2></div></div>
      {filteredRuns.length ? <div className="run-table">{filteredRuns.map((run) => <button key={run.id} onClick={() => onOpenRun(run.id)}><span className={`run-dot run-dot-${run.status}`} /><span><strong>{analysisRunLabel(run.scopeType)}</strong><small>{relativeDate(run.createdAt)} · Codex</small></span><span className="run-status">{runStatusLabels[run.status]}</span><ArrowUpRight size={15} /></button>)}</div>
        : <div className="soft-empty"><div className="soft-empty-mark"><BrainCircuit size={23} /></div><div><strong>Ainda não há análises</strong><p>Crie uma nota conectada e peça ao Codex para olhar além do óbvio.</p></div><button className="secondary-button" onClick={state.notes.length ? onGoToNotes : onNewNote}>{state.notes.length ? "Ver notas" : "Criar primeira nota"}</button></div>}
    </section>
    <div className="dashboard-composer">
      <RichNoteEditor key={`dashboard-composer-${composerVersion}`} note={null} isNew objectTypes={state.objectTypes} objects={state.objects} compact onDirtyChange={onComposerDirty} onSaved={(note) => { onComposerDirty(false); onComposerSaved(note); setComposerVersion((version) => version + 1); }} onAnalyze={() => undefined} onArchive={() => undefined} onSelectObject={onSelectObject} />
    </div>
  </div>;
}

function NotesList({ notes, selectedId, onSelect, onNew }: { notes: NoteRecord[]; selectedId: string | null; onSelect(id: string): void; onNew(): void }) {
  return <div className="notes-view">
    <div className="view-toolbar"><div><span className="eyebrow">Biblioteca</span><strong>{notes.length} nota{notes.length === 1 ? "" : "s"}</strong></div><button className="primary-button compact" onClick={onNew}><Plus size={15} /> Nova</button></div>
    {notes.length ? <div className="note-list">{notes.map((note) => <button key={note.id} className={selectedId === note.id ? "note-row is-selected" : "note-row"} onClick={() => onSelect(note.id)}><div className="note-row-top"><strong>{note.title || note.contentText.slice(0, 54) || "Nota sem título"}</strong><time>{relativeDate(note.updatedAt)}</time></div><p>{note.contentText || "Sem conteúdo"}</p><div className="note-tags">{note.mentions.slice(0, 4).map((object) => <span key={object.id} style={{ "--tag-color": object.typeColor } as React.CSSProperties}>{object.typeIcon} {object.name}</span>)}{note.mentions.length > 4 && <span>+{note.mentions.length - 4}</span>}</div></button>)}</div>
      : <div className="center-empty"><div className="empty-orbit">✎</div><h2>Capture o que está na sua cabeça</h2><p>Uma nota rápida pode virar contexto valioso amanhã.</p><button className="primary-button" onClick={onNew}><Plus size={15} /> Criar primeira nota</button></div>}
  </div>;
}

function ObjectsList({ typeName, objects, notes, selectedId, onSelect }: { typeName: string; objects: KnowledgeObjectRecord[]; notes: NoteRecord[]; selectedId: string | null; onSelect(id: string): void }) {
  return <div className="objects-view">
    <div className="view-toolbar"><div><span className="eyebrow">Tipo de objeto</span><strong>{typeName}</strong></div><span className="object-total">{objects.length} objeto{objects.length === 1 ? "" : "s"}</span></div>
    {objects.length ? <div className="object-list">{objects.map((object) => {
      const linkedNotes = notes.filter((note) => note.mentions.some((mention) => mention.id === object.id)).length;
      return <button key={object.id} className={selectedId === object.id ? "object-row is-selected" : "object-row"} onClick={() => onSelect(object.id)} style={{ "--object-color": object.typeColor } as React.CSSProperties}>
        <span className="object-row-icon">{object.typeIcon}</span><span className="object-row-copy"><strong>{object.name}</strong><small>{object.description || "Sem descrição"}</small></span><span className="object-row-notes"><FileText size={13} />{linkedNotes}</span><ArrowUpRight size={15} />
      </button>;
    })}</div> : <div className="center-empty"><div className="empty-orbit">{typeName.slice(0, 1)}</div><h2>Nenhum objeto deste tipo</h2><p>Crie o primeiro usando uma menção @ em uma nota.</p></div>}
  </div>;
}

function DateFilter({ value, onChange }: { value: DateRange; onChange(value: DateRange): void }) {
  const applyDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    onChange({ start: dateInputValue(start), end: dateInputValue(end) });
  };
  const today = dateInputValue(new Date());
  const presetStart = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days + 1);
    return dateInputValue(date);
  };
  const activePreset = !value.start && !value.end ? "all"
    : value.end === today && value.start === today ? "today"
      : value.end === today && value.start === presetStart(7) ? "7"
        : value.end === today && value.start === presetStart(30) ? "30" : "custom";
  return <section className="date-filter" aria-label="Filtrar dashboard por data">
    <header><div className="date-filter-icon"><CalendarDays size={17} /></div><div><span className="eyebrow">Calendário</span><h2>Filtrar por data</h2></div></header>
    <div className="date-presets">
      <button className={activePreset === "all" ? "is-active" : ""} onClick={() => onChange({ start: "", end: "" })}>Todos</button>
      <button className={activePreset === "today" ? "is-active" : ""} onClick={() => applyDays(1)}>Hoje</button>
      <button className={activePreset === "7" ? "is-active" : ""} onClick={() => applyDays(7)}>7 dias</button>
      <button className={activePreset === "30" ? "is-active" : ""} onClick={() => applyDays(30)}>30 dias</button>
    </div>
    <div className="date-fields"><label><span>De</span><input type="date" value={value.start} max={value.end || undefined} onChange={(event) => onChange({ ...value, start: event.target.value })} /></label><label><span>Até</span><input type="date" value={value.end} min={value.start || undefined} onChange={(event) => onChange({ ...value, end: event.target.value })} /></label></div>
  </section>;
}

function FindingSummary({ findings, onOpenFinding, onAnalyze }: { findings: FindingRecord[]; onOpenFinding(runId: string, findingId: string): void; onAnalyze(): void }) {
  return <section className="finding-summary"><header className="inspector-title"><span className="eyebrow">Prioridades</span><div className="inspector-title-row"><h2>Sugestões pendentes</h2><button className="ai-analysis-button" onClick={onAnalyze}><Sparkles size={16} /> Analisar notas</button></div><p>Confira o próximo passo e abra a sugestão para entender o motivo.</p></header>
    <div className="compact-findings">{findings.length ? [...findings].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).map((finding) => <button key={finding.id} onClick={() => onOpenFinding(finding.runId, finding.id)} className={`compact-finding priority-${finding.priority}`}><span>{categoryLabels[finding.category]} · {priorityLabels[finding.priority]}</span><strong>{finding.title}</strong><span className="compact-next-step"><b>Próximo passo sugerido</b>{finding.suggestedAction.trim() || "Nenhuma ação específica registrada."}</span><small>Entender esta sugestão →</small></button>) : <div className="empty-inspector compact"><div className="empty-orbit">✓</div><h3>Nada pendente</h3><p>Sugestões das suas análises aparecerão aqui.</p></div>}</div>
  </section>;
}

function ObjectInspector({ object, state, onAnalyze, onArchive, onChanged }: { object: KnowledgeObjectRecord | null; state: AppState; onAnalyze(id: string): void; onArchive(id: string): void; onChanged(): void }) {
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [name, setName] = useState(object?.name ?? "");
  const [description, setDescription] = useState(object?.description ?? "");
  const [error, setError] = useState("");
  if (!object) return <div className="empty-inspector"><div className="empty-orbit">◎</div><h3>Explore um objeto</h3><p>Selecione um objeto para ver suas notas e relações.</p></div>;
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
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(initialState.objectTypes[0]?.id ?? null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [composerDirty, setComposerDirty] = useState(false);
  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeIcon, setTypeIcon] = useState("○");
  const [typeColor, setTypeColor] = useState("#4F7D70");
  const [notice, setNotice] = useState("");
  const [analysisScope, setAnalysisScope] = useState<AnalysisScope | null>(null);
  const [analysisTypes, setAnalysisTypes] = useState<AnalysisType[] | undefined>(undefined);
  const [analysisNoteIds, setAnalysisNoteIds] = useState<string[] | undefined>(undefined);
  const [analysisDateRange, setAnalysisDateRange] = useState<AnalysisDateRange | undefined>(undefined);
  const [analysisCandidateNotes, setAnalysisCandidateNotes] = useState<NoteRecord[]>([]);
  const [analysisLauncherOpen, setAnalysisLauncherOpen] = useState(false);
  const [launcherScope, setLauncherScope] = useState<AnalysisScope | undefined>(undefined);
  const [launcherLabel, setLauncherLabel] = useState<string | undefined>(undefined);
  const [analysisMode, setAnalysisMode] = useState<"full" | "incremental">("full");
  const [returnAnalysis, setReturnAnalysis] = useState<{ runId: string; findingId: string } | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [openFindingId, setOpenFindingId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState<number | null>(null);
  const [resizingInspector, setResizingInspector] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ start: "", end: "" });
  const restoreInput = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async (query = search) => {
    const result = await readJson(await fetch(`/api/state?q=${encodeURIComponent(query)}`, { cache: "no-store" })) as AppState;
    setState(result);
    return result;
  }, [search]);

  useEffect(() => {
    if (view === "objects") return;
    const timer = setTimeout(() => { void refresh(search); }, 220);
    return () => clearTimeout(timer);
  }, [search, refresh, view]);

  useEffect(() => {
    if (!resizingInspector) return;
    const resize = (event: PointerEvent) => {
      const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width ?? (sidebarCollapsed ? 72 : 275);
      const maximum = Math.max(300, Math.min(960, window.innerWidth - sidebarWidth - 430));
      setInspectorWidth(Math.min(maximum, Math.max(300, window.innerWidth - event.clientX)));
    };
    const finish = () => setResizingInspector(false);
    document.body.classList.add("is-resizing-panel");
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [resizingInspector, sidebarCollapsed]);

  const selectedNote = state.notes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedObject = state.objects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedType = state.objectTypes.find((type) => type.id === selectedTypeId) ?? null;
  const currentViewTitle = view === "objects" && selectedType ? { title: selectedType.name, subtitle: "Objetos" } : viewTitles[view];

  const guardUnsaved = () => {
    const dirty = view === "notes" ? editorDirty : view === "dashboard" ? composerDirty : false;
    return !dirty || window.confirm("Há alterações não salvas. Descartar e continuar?");
  };
  const changeView = (next: ViewName) => {
    if (next !== view && !guardUnsaved()) return;
    if (view === "dashboard" && next !== "dashboard") setComposerDirty(false);
    setView(next); if (next !== "notes") setIsNewNote(false);
  };
  const newNote = () => {
    if (!guardUnsaved()) return;
    if (view === "dashboard") setComposerDirty(false);
    setView("notes"); setSelectedNoteId(null); setIsNewNote(true); setEditorDirty(true);
  };
  const selectNote = (noteId: string) => {
    if (!guardUnsaved()) return;
    setSelectedNoteId(noteId); setIsNewNote(false); setEditorDirty(false);
  };
  const selectObject = (objectId: string) => {
    if (!guardUnsaved()) return;
    if (view === "dashboard") setComposerDirty(false);
    setSelectedObjectId(objectId); setView("map"); setIsNewNote(false); setEditorDirty(false);
  };
  const openAnalysisSource = (type: "note" | "object", sourceId: string, runId: string, findingId: string) => {
    if (!guardUnsaved()) return;
    if (view === "dashboard") setComposerDirty(false);
    setReturnAnalysis({ runId, findingId });
    setAnalysisScope(null); setOpenRunId(null); setOpenFindingId(null); setAnalysisTypes(undefined); setAnalysisNoteIds(undefined); setAnalysisDateRange(undefined);
    if (type === "note") {
      setView("notes"); setSelectedNoteId(sourceId); setIsNewNote(false); setEditorDirty(false);
    } else {
      setView("map"); setSelectedObjectId(sourceId); setIsNewNote(false); setEditorDirty(false);
    }
  };

  const createType = async () => {
    try {
      await readJson(await fetch("/api/types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: typeName, icon: typeIcon, color: typeColor }) }));
      setTypeName(""); setTypeFormOpen(false); await refresh(view === "objects" ? "" : search); setNotice("Tipo criado.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha ao criar tipo."); }
  };

  const archive = async (kind: "note" | "object" | "type", itemId: string) => {
    const label = kind === "note" ? "registro" : kind === "object" ? "objeto" : "tipo";
    if (!window.confirm(`Arquivar este ${label}? As referências históricas serão preservadas.`)) return;
    await readJson(await fetch("/api/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id: itemId }) }));
    if (kind === "note") { setSelectedNoteId(null); setIsNewNote(false); }
    if (kind === "object") setSelectedObjectId(null);
    if (kind === "type" && itemId === selectedTypeId) { setSelectedTypeId(null); setSelectedObjectId(null); setView("dashboard"); }
    await refresh(view === "objects" ? "" : search);
  };

  const restore = async (file: File) => {
    if (!window.confirm("A restauração substituirá a base atual. Um backup de segurança será criado automaticamente. Continuar?")) return;
    try {
      const payload = JSON.parse(await file.text());
      const result = await readJson(await fetch("/api/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      await refresh(""); setSearch(""); setSelectedNoteId(null); setSelectedObjectId(null); setSelectedTypeId(null); setNotice(`Base restaurada. Cópia de segurança: ${result.safetyBackup}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Arquivo de backup inválido."); }
  };

  const filteredPriorityFindings = state.priorityFindings.filter((finding) => isWithinRange(finding.createdAt, dateRange));
  const openDashboardAnalysis = async () => {
    try {
      const fullState = await refresh("");
      setAnalysisCandidateNotes(fullState.notes.filter((note) => isWithinRange(note.updatedAt, dateRange)));
      setLauncherScope(undefined); setLauncherLabel(undefined); setAnalysisNoteIds(undefined); setAnalysisTypes(undefined); setAnalysisMode("full"); setAnalysisDateRange(dateRange);
      setSearch("");
      setAnalysisLauncherOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível preparar as notas para análise.");
    }
  };
  const openScopedAnalysis = async (scope: AnalysisScope) => {
    try {
      const fullState = await refresh("");
      const root = fullState.notes.find((note) => note.id === scope.id);
      const relatedIds = new Set(root?.mentions.map((object) => object.id) ?? [scope.id]);
      const candidates = fullState.notes.filter((note) => note.id === root?.id || note.mentions.some((object) => relatedIds.has(object.id)));
      setAnalysisCandidateNotes(candidates);
      setLauncherScope(scope); setLauncherLabel(root?.title || fullState.objects.find((object) => object.id === scope.id)?.name || "Nota sem título");
      setAnalysisNoteIds(undefined); setAnalysisTypes(undefined); setAnalysisMode("full"); setAnalysisDateRange({ start: "", end: "" });
      setSearch(""); setAnalysisLauncherOpen(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível preparar a análise."); }
  };
  const openReport = async (runId: string, findingId: string | null = null) => {
    try {
      await refresh(""); setSearch(""); setOpenFindingId(findingId); setOpenRunId(runId); setReturnAnalysis(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível abrir a análise."); }
  };
  const resizeInspectorBy = (delta: number) => {
    const current = inspectorWidth ?? inspectorRef.current?.getBoundingClientRect().width ?? 390;
    const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width ?? (sidebarCollapsed ? 72 : 275);
    const maximum = Math.max(300, Math.min(960, window.innerWidth - sidebarWidth - 430));
    setInspectorWidth(Math.min(maximum, Math.max(300, current + delta)));
  };

  const visibleObjects = state.objects.filter((object) => object.typeId === selectedTypeId && (!search.trim() || `${object.name} ${object.description}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))));

  return <main className="app-shell" style={{ "--sidebar-width": sidebarCollapsed ? "72px" : "275px", ...(inspectorWidth ? { "--inspector-width": `${inspectorWidth}px` } : {}) } as React.CSSProperties}>
    <aside className={`sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`} ref={sidebarRef}>
      <button className="sidebar-collapse" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}</button>
      <div className="brand"><div className="brand-mark"><BrainCircuit size={20} /></div><div className="brand-copy"><strong>Staff Chief</strong><span>segundo cérebro</span></div></div>
      <button className="new-note-button" onClick={newNote} title="Nova nota"><Plus size={17} /><span className="sidebar-label">Nova nota</span></button>
      <nav className="main-nav" aria-label="Navegação principal">
        <button title="Dashboard" className={view === "dashboard" ? "is-active" : ""} onClick={() => changeView("dashboard")}><LayoutDashboard size={17} /><span className="sidebar-label">Dashboard</span></button>
        <button title="Mapa" className={view === "map" ? "is-active" : ""} onClick={() => changeView("map")}><MapIcon size={17} /><span className="sidebar-label">Mapa</span><span className="sidebar-count">{state.objects.length}</span></button>
        <button title="Notas" className={view === "notes" ? "is-active" : ""} onClick={() => changeView("notes")}><FileText size={17} /><span className="sidebar-label">Notas</span><span className="sidebar-count">{state.notes.length}</span></button>
      </nav>
      <div className="type-heading"><span>Tipos de objeto</span><button className="icon-button small" onClick={() => { if (sidebarCollapsed) setSidebarCollapsed(false); setTypeFormOpen((value) => !value); }} aria-label="Novo tipo"><Plus size={14} /></button></div>
      <div className="type-list">{state.objectTypes.map((type) => <div className={`type-row ${view === "objects" && selectedTypeId === type.id ? "is-active" : ""}`} key={type.id}><button className="type-select" onClick={() => { if (!guardUnsaved()) return; if (view === "dashboard") setComposerDirty(false); setSearch(""); setSelectedTypeId(type.id); setView("objects"); setIsNewNote(false); setEditorDirty(false); const first = state.objects.find((object) => object.typeId === type.id); setSelectedObjectId(first?.id ?? null); void refresh(""); }}><span className="type-dot" style={{ background: type.color }}>{type.icon}</span><span>{type.name}</span><small>{state.objects.filter((object) => object.typeId === type.id).length}</small></button><button className="type-archive" title={`Arquivar ${type.name}`} aria-label={`Arquivar ${type.name}`} onClick={() => void archive("type", type.id)}><Archive size={12} /></button></div>)}</div>
      {typeFormOpen && <div className="type-form"><div><input className="icon-field" value={typeIcon} onChange={(event) => setTypeIcon(event.target.value)} maxLength={8} aria-label="Ícone" /><input value={typeName} onChange={(event) => setTypeName(event.target.value)} placeholder="Nome do tipo" maxLength={60} /></div><div><input type="color" value={typeColor} onChange={(event) => setTypeColor(event.target.value)} /><button onClick={createType} disabled={!typeName.trim()}>Criar tipo</button></div></div>}
      <div className="sidebar-footer"><a className="utility-button" title="Exportar backup" href="/api/backup" download><DatabaseBackup size={15} /><span className="sidebar-label">Exportar backup</span></a><button className="utility-button" title="Restaurar base" onClick={() => restoreInput.current?.click()}><Upload size={15} /><span className="sidebar-label">Restaurar base</span></button><input ref={restoreInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ""; }} /><div className="local-badge"><span /><strong>Somente local</strong><small>127.0.0.1</small></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="eyebrow">{currentViewTitle.subtitle}</span><h1>{currentViewTitle.title}</h1></div><div className="topbar-tools"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === "objects" ? "Buscar objetos…" : "Buscar notas…"} />{search && <button onClick={() => setSearch("")} aria-label="Limpar"><X size={13} /></button>}</label></div></header>
      <div className="center-pane">
        {returnAnalysis && <div className="analysis-return"><span>Consultando uma fonte da análise</span><button className="secondary-button" onClick={() => { if (guardUnsaved()) void openReport(returnAnalysis.runId, returnAnalysis.findingId); }}>Voltar à sugestão</button></div>}
        {view === "dashboard" && <Dashboard state={state} dateRange={dateRange} onOpenRun={(runId) => void openReport(runId)} onNewNote={newNote} onGoToNotes={() => changeView("notes")} onComposerDirty={setComposerDirty} onComposerSaved={() => { void refresh(); setNotice("Nota adicionada."); }} onSelectObject={selectObject} />}
        {view === "map" && <KnowledgeMap state={state} selectedObjectId={selectedObjectId} onSelectObject={setSelectedObjectId} />}
        {view === "notes" && <NotesList notes={state.notes} selectedId={selectedNoteId} onSelect={selectNote} onNew={newNote} />}
        {view === "objects" && <ObjectsList typeName={selectedType?.name ?? "Objetos"} objects={visibleObjects} notes={state.notes} selectedId={selectedObjectId} onSelect={setSelectedObjectId} />}
      </div>
    </section>

    <aside className="inspector" ref={inspectorRef}>
      <div className="inspector-resizer" role="separator" aria-label="Redimensionar painel direito" aria-orientation="vertical" tabIndex={0} onPointerDown={(event) => { event.currentTarget.focus(); event.preventDefault(); setResizingInspector(true); }} onDoubleClick={() => setInspectorWidth(null)} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); resizeInspectorBy(16); } if (event.key === "ArrowRight") { event.preventDefault(); resizeInspectorBy(-16); } }} />
      {view === "dashboard" && <div className="inspector-stack dashboard-inspector"><DateFilter value={dateRange} onChange={setDateRange} /><FindingSummary findings={filteredPriorityFindings} onOpenFinding={(runId, findingId) => void openReport(runId, findingId)} onAnalyze={() => void openDashboardAnalysis()} /></div>}
      {view === "map" && <ObjectInspector key={selectedObject?.id ?? "no-object"} object={selectedObject} state={state} onAnalyze={(id) => openScopedAnalysis({ type: "object", id })} onArchive={(id) => void archive("object", id)} onChanged={() => void refresh()} />}
      {view === "objects" && <ObjectInspector key={selectedObject?.id ?? "no-object"} object={selectedObject} state={state} onAnalyze={(id) => openScopedAnalysis({ type: "object", id })} onArchive={(id) => void archive("object", id)} onChanged={() => void refresh("")} />}
      {view === "notes" && <RichNoteEditor key={isNewNote ? "new-note" : selectedNote?.id ?? "no-note"} note={selectedNote} isNew={isNewNote} objectTypes={state.objectTypes} objects={state.objects} onDirtyChange={setEditorDirty} onSaved={(note) => { setSelectedNoteId(note.id); setIsNewNote(false); setEditorDirty(false); void refresh(); }} onAnalyze={(id) => openScopedAnalysis({ type: "note", id })} onArchive={(id) => void archive("note", id)} onSelectObject={selectObject} />}
    </aside>

    {analysisLauncherOpen && <AnalysisLauncherDialog notes={analysisCandidateNotes} dateRange={analysisDateRange ?? dateRange} scope={launcherScope} scopeLabel={launcherLabel} initialNoteIds={analysisNoteIds} initialTypes={analysisTypes} initialMode={analysisMode} onClose={() => { setAnalysisLauncherOpen(false); setAnalysisCandidateNotes([]); }} onContinue={(scope, types, noteIds, selectedDateRange, mode) => { setAnalysisLauncherOpen(false); setLauncherScope(scope); setAnalysisTypes(types); setAnalysisNoteIds(noteIds); setAnalysisDateRange(selectedDateRange); setAnalysisMode(mode); setAnalysisScope(scope); }} />}
    {(analysisScope || openRunId) && <AnalysisDialog key={openRunId ? `${openRunId}:${openFindingId ?? "report"}` : `${analysisScope?.type}:${analysisScope?.id}`} scope={analysisScope} existingRunId={openRunId} initialFindingId={openFindingId} initialNoteIds={analysisNoteIds} dateRange={analysisDateRange} mode={analysisMode} analysisTypes={analysisTypes} notes={state.notes} objects={state.objects} onOpenSource={openAnalysisSource} onBack={() => { setAnalysisScope(null); setAnalysisLauncherOpen(true); }} onClose={() => { setAnalysisScope(null); setOpenRunId(null); setOpenFindingId(null); setAnalysisTypes(undefined); setAnalysisNoteIds(undefined); setAnalysisDateRange(undefined); }} onChanged={() => { void refresh(view === "objects" ? "" : search); }} />}
    {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice("")}><X size={14} /></button></div>}
  </main>;
}
