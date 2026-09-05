import "server-only";

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type {
  AnalysisRunRecord,
  AnalysisDateRange,
  AnalysisScopeType,
  AnalysisSnapshot,
  AnalysisType,
  AppState,
  FindingCategory,
  FindingRecord,
  FindingStatus,
  GraphEdgeRecord,
  KnowledgeObjectRecord,
  NoteRecord,
  ObjectTypeRecord,
  RelationshipRecord,
  SpecialistFinding,
} from "@/lib/contracts";
import { getDataDirectory, getDatabase, normalizeName } from "./client";
import { getAiRecord, putAiRecord } from "./ai-store";
import { libraryBackupRowSchema } from "@/lib/library/contracts";
import { markdownText } from "@/lib/library/repository";
import { researchBackupColumns, researchBackupTables, validateResearchBackup } from "@/lib/research/backup";
import { clearResearchPreviews } from "@/lib/research/repository";

type Row = Record<string, unknown>;

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function json<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function mapType(row: Row): ObjectTypeRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    icon: String(row.icon),
    color: String(row.color),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

function mapObject(row: Row): KnowledgeObjectRecord {
  return {
    id: String(row.id),
    typeId: String(row.type_id),
    typeName: String(row.type_name),
    typeIcon: String(row.type_icon),
    typeColor: String(row.type_color),
    name: String(row.name),
    description: String(row.description ?? ""),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

function mapRelationship(row: Row): RelationshipRecord {
  return {
    id: String(row.id),
    sourceObjectId: String(row.source_object_id),
    targetObjectId: String(row.target_object_id),
    label: String(row.label),
    origin: row.origin === "analysis" ? "analysis" : "manual",
    findingId: row.finding_id ? String(row.finding_id) : null,
    createdAt: String(row.created_at),
  };
}

function getSources(findingId: string) {
  const { sqlite } = getDatabase();
  const rows = sqlite
    .prepare("SELECT source_type, source_id FROM finding_sources WHERE finding_id = ?")
    .all(findingId) as Row[];
  return {
    sourceNoteIds: rows.filter((row) => row.source_type === "note").map((row) => String(row.source_id)),
    sourceObjectIds: rows.filter((row) => row.source_type === "object").map((row) => String(row.source_id)),
  };
}

function mapFinding(row: Row): FindingRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    category: String(row.category) as FindingCategory,
    title: String(row.title),
    explanation: String(row.explanation),
    priority: String(row.priority) as FindingRecord["priority"],
    confidence: Number(row.confidence),
    suggestedAction: String(row.suggested_action),
    status: String(row.status) as FindingStatus,
    ...getSources(String(row.id)),
    createdAt: String(row.created_at),
    detail: json(row.detail_json, undefined),
  };
}

function allTypes(includeArchived = false) {
  const { sqlite } = getDatabase();
  const where = includeArchived ? "" : "WHERE archived_at IS NULL";
  return (sqlite.prepare(`SELECT * FROM object_types ${where} ORDER BY name`).all() as Row[]).map(mapType);
}

function allObjects(includeArchived = false) {
  const { sqlite } = getDatabase();
  const where = includeArchived ? "" : "WHERE o.archived_at IS NULL AND t.archived_at IS NULL";
  return (sqlite.prepare(`
    SELECT o.*, t.name AS type_name, t.icon AS type_icon, t.color AS type_color
    FROM objects o JOIN object_types t ON t.id = o.type_id
    ${where} ORDER BY t.name, o.name
  `).all() as Row[]).map(mapObject);
}

function noteMentions(noteId: string, objectMap?: Map<string, KnowledgeObjectRecord>) {
  const objects = objectMap ?? new Map(allObjects(true).map((item) => [item.id, item]));
  const { sqlite } = getDatabase();
  return (sqlite.prepare("SELECT object_id FROM note_mentions WHERE note_id = ?").all(noteId) as Row[])
    .map((row) => objects.get(String(row.object_id)))
    .filter((item): item is KnowledgeObjectRecord => Boolean(item));
}

function allNotes(search = "", includeArchived = false) {
  const { sqlite } = getDatabase();
  const objectMap = new Map(allObjects(true).map((item) => [item.id, item]));
  let rows: Row[];
  if (search.trim()) {
    const tokens = search.trim().split(/\s+/).filter(Boolean).map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
    try {
      rows = sqlite.prepare(`
        SELECT n.* FROM notes n JOIN notes_fts f ON f.note_id = n.id
        WHERE notes_fts MATCH ? ${includeArchived ? "" : "AND n.archived_at IS NULL"}
        ORDER BY n.updated_at DESC
      `).all(tokens) as Row[];
    } catch {
      rows = sqlite.prepare(`SELECT * FROM notes WHERE (title LIKE ? OR content_text LIKE ?)
        ${includeArchived ? "" : "AND archived_at IS NULL"} ORDER BY updated_at DESC`)
        .all(`%${search}%`, `%${search}%`) as Row[];
    }
  } else {
    rows = sqlite.prepare(`SELECT * FROM notes ${includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY updated_at DESC`).all() as Row[];
  }
  return rows.map((row): NoteRecord => ({
    id: String(row.id),
    title: String(row.title),
    contentJson: json<Record<string, unknown>>(row.content_json, { type: "doc", content: [] }),
    contentText: String(row.content_text),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    mentions: noteMentions(String(row.id), objectMap),
  }));
}

function recentRuns() {
  const { sqlite } = getDatabase();
  return (sqlite.prepare("SELECT * FROM analysis_runs ORDER BY created_at DESC LIMIT 8").all() as Row[])
    .map((row): AnalysisRunRecord => ({
      id: String(row.id), provider: String(row.provider),
      scopeType: mapAnalysisScopeType(row.scope_type), scopeId: String(row.scope_id),
      status: String(row.status) as AnalysisRunRecord["status"], error: row.error ? String(row.error) : null,
      createdAt: String(row.created_at), completedAt: row.completed_at ? String(row.completed_at) : null,
    }));
}

export function getAnalysisRun(runId: string): AnalysisRunRecord | null {
  const { sqlite } = getDatabase();
  const row = sqlite.prepare("SELECT * FROM analysis_runs WHERE id = ?").get(runId) as Row | undefined;
  if (!row) return null;
  const steps = (sqlite.prepare("SELECT * FROM analysis_steps WHERE run_id = ? ORDER BY position").all(runId) as Row[])
    .map((step) => ({
      id: String(step.id), name: String(step.name), position: Number(step.position),
      status: String(step.status) as "queued" | "running" | "completed" | "failed" | "cancelled",
      error: step.error ? String(step.error) : null,
      startedAt: step.started_at ? String(step.started_at) : null,
      completedAt: step.completed_at ? String(step.completed_at) : null,
    }));
  const preserved = getAiRecord<{ findings: FindingRecord[] }>(`report:${runId}`);
  const runFindings = preserved ? preserved.findings.map((finding) => {
    const current = sqlite.prepare("SELECT status FROM findings WHERE id = ?").get(finding.id) as { status: FindingStatus } | undefined;
    return { ...finding, status: current?.status ?? finding.status };
  }) : (sqlite.prepare("SELECT * FROM findings WHERE run_id = ? ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at").all(runId) as Row[]).map(mapFinding);
  return {
    id: String(row.id), provider: String(row.provider), scopeType: mapAnalysisScopeType(row.scope_type),
    scopeId: String(row.scope_id), status: String(row.status) as AnalysisRunRecord["status"],
    error: row.error ? String(row.error) : null, createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null, steps, findings: runFindings,
  };
}

export function getAppState(search = ""): AppState {
  const { sqlite } = getDatabase();
  const objectTypes = allTypes();
  const objects = allObjects();
  const notes = allNotes(search);
  const relationships = (sqlite.prepare("SELECT * FROM relationships WHERE archived_at IS NULL ORDER BY created_at DESC").all() as Row[]).map(mapRelationship);
  const metrics = {
    notes: Number((sqlite.prepare("SELECT COUNT(*) count FROM notes WHERE archived_at IS NULL").get() as Row).count),
    objects: Number((sqlite.prepare("SELECT COUNT(*) count FROM objects WHERE archived_at IS NULL").get() as Row).count),
    openFindings: Number((sqlite.prepare("SELECT COUNT(*) count FROM findings WHERE status = 'open'").get() as Row).count),
    pendingFollowUps: Number((sqlite.prepare("SELECT COUNT(*) count FROM findings WHERE status = 'open' AND category = 'follow_up'").get() as Row).count),
    unlinkedNotes: Number((sqlite.prepare("SELECT COUNT(*) count FROM notes n WHERE n.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM note_mentions nm WHERE nm.note_id = n.id)").get() as Row).count),
  };
  const graphEdges: GraphEdgeRecord[] = [];
  const cooccurrences = sqlite.prepare(`
    SELECT a.object_id source, b.object_id target, COUNT(DISTINCT a.note_id) weight
    FROM note_mentions a JOIN note_mentions b ON a.note_id = b.note_id AND a.object_id < b.object_id
    JOIN notes n ON n.id = a.note_id AND n.archived_at IS NULL
    GROUP BY a.object_id, b.object_id
  `).all() as Row[];
  for (const row of cooccurrences) graphEdges.push({
    id: `co-${row.source}-${row.target}`, source: String(row.source), target: String(row.target),
    kind: "cooccurrence", label: `${row.weight} nota${Number(row.weight) === 1 ? "" : "s"}`, weight: Number(row.weight),
  });
  for (const relation of relationships) graphEdges.push({
    id: relation.id, source: relation.sourceObjectId, target: relation.targetObjectId,
    kind: "relationship", label: relation.label, weight: 1,
  });
  const suggestions = sqlite.prepare(`
    SELECT f.id finding_id, MIN(fs.source_id) source, MAX(fs.source_id) target, f.title
    FROM findings f JOIN finding_sources fs ON fs.finding_id = f.id AND fs.source_type = 'object'
    WHERE f.category = 'connection' AND f.status = 'open'
      AND NOT EXISTS (SELECT 1 FROM relationships r WHERE r.finding_id = f.id AND r.archived_at IS NULL)
    GROUP BY f.id HAVING COUNT(DISTINCT fs.source_id) >= 2
  `).all() as Row[];
  for (const row of suggestions) graphEdges.push({
    id: `suggestion-${row.finding_id}`, source: String(row.source), target: String(row.target),
    kind: "suggestion", label: String(row.title), weight: 1, findingId: String(row.finding_id),
  });
  const priorityFindings = (sqlite.prepare(`
    SELECT * FROM findings WHERE status = 'open'
    ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 12
  `).all() as Row[]).map(mapFinding);
  return { metrics, objectTypes, objects, notes, relationships, graphEdges, recentRuns: recentRuns(), priorityFindings };
}

export function createObjectType(input: { name: string; icon: string; color: string }) {
  const { sqlite } = getDatabase();
  const record = { id: id("type"), name: input.name.trim(), normalized: normalizeName(input.name), icon: input.icon.trim() || "○", color: input.color, createdAt: now() };
  if (!record.normalized) throw new Error("O nome do tipo é obrigatório.");
  sqlite.prepare("INSERT INTO object_types (id,name,name_normalized,icon,color,created_at) VALUES (@id,@name,@normalized,@icon,@color,@createdAt)").run(record);
  return record.id;
}

type EditorNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: EditorNode[] };

export function textFromDocument(document: EditorNode) {
  const parts: string[] = [];
  const walk = (node: EditorNode) => {
    if (node.type === "mention") parts.push(`@${String(node.attrs?.label ?? "")}`);
    if (node.text) parts.push(node.text);
    node.content?.forEach(walk);
    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") parts.push("\n");
  };
  walk(document);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

function canonicalizeDocument(document: EditorNode, sqlite: ReturnType<typeof getDatabase>["sqlite"]) {
  const mentionedIds = new Set<string>();
  const clone = structuredClone(document);
  const objectQuery = sqlite.prepare(`
    SELECT o.*, t.name type_name, t.icon type_icon, t.color type_color
    FROM objects o JOIN object_types t ON t.id = o.type_id WHERE o.id = ? AND o.archived_at IS NULL
  `);
  const objectByName = sqlite.prepare(`
    SELECT o.*, t.name type_name, t.icon type_icon, t.color type_color
    FROM objects o JOIN object_types t ON t.id = o.type_id
    WHERE o.type_id = ? AND o.name_normalized = ? AND o.archived_at IS NULL
  `);
  const insertObject = sqlite.prepare(`
    INSERT INTO objects (id,type_id,name,name_normalized,description,created_at,updated_at)
    VALUES (@id,@typeId,@name,@normalized,'',@createdAt,@createdAt)
  `);
  const walk = (node: EditorNode) => {
    if (node.type === "mention") {
      const attrs = node.attrs ?? {};
      const requestedId = String(attrs.id ?? "");
      let object = requestedId && !requestedId.startsWith("new:") ? objectQuery.get(requestedId) as Row | undefined : undefined;
      if (!object) {
        const typeId = String(attrs.typeId ?? "");
        const name = String(attrs.label ?? "").trim();
        if (!typeId || !name) throw new Error("Menção inválida: tipo e nome são obrigatórios.");
        object = objectByName.get(typeId, normalizeName(name)) as Row | undefined;
        if (!object) {
          const createdAt = now();
          const objectId = id("object");
          insertObject.run({ id: objectId, typeId, name, normalized: normalizeName(name), createdAt });
          object = objectQuery.get(objectId) as Row;
        }
      }
      const canonicalId = String(object.id);
      node.attrs = {
        ...attrs, id: canonicalId, label: String(object.name), typeId: String(object.type_id),
        typeLabel: String(object.type_name), color: String(object.type_color), isNew: false,
      };
      mentionedIds.add(canonicalId);
    }
    node.content?.forEach(walk);
  };
  walk(clone);
  return { document: clone, mentionedIds: [...mentionedIds] };
}

export function saveNote(input: { id?: string; title?: string; contentJson: EditorNode }) {
  const { sqlite } = getDatabase();
  return sqlite.transaction(() => {
    const noteId = input.id || id("note");
    const canonical = canonicalizeDocument(input.contentJson, sqlite);
    const contentText = textFromDocument(canonical.document);
    const timestamp = now();
    const existing = sqlite.prepare("SELECT id FROM notes WHERE id = ?").get(noteId);
    if (existing) {
      sqlite.prepare("UPDATE notes SET title = ?, content_json = ?, content_text = ?, updated_at = ?, archived_at = NULL WHERE id = ?")
        .run(input.title?.trim() ?? "", JSON.stringify(canonical.document), contentText, timestamp, noteId);
    } else {
      sqlite.prepare("INSERT INTO notes (id,title,content_json,content_text,created_at,updated_at) VALUES (?,?,?,?,?,?)")
        .run(noteId, input.title?.trim() ?? "", JSON.stringify(canonical.document), contentText, timestamp, timestamp);
    }
    sqlite.prepare("DELETE FROM note_mentions WHERE note_id = ?").run(noteId);
    const insertMention = sqlite.prepare("INSERT INTO note_mentions (note_id, object_id) VALUES (?, ?)");
    canonical.mentionedIds.forEach((objectId) => insertMention.run(noteId, objectId));
    sqlite.prepare("DELETE FROM notes_fts WHERE note_id = ?").run(noteId);
    sqlite.prepare("INSERT INTO notes_fts (note_id, title, content) VALUES (?, ?, ?)").run(noteId, input.title?.trim() ?? "", contentText);
    return allNotes("", true).find((note) => note.id === noteId)!;
  })();
}

export function createRelationship(input: { sourceObjectId: string; targetObjectId: string; label: string; origin?: "manual" | "analysis"; findingId?: string }) {
  if (input.sourceObjectId === input.targetObjectId) throw new Error("Escolha dois objetos diferentes.");
  const { sqlite } = getDatabase();
  const relationId = id("relationship");
  sqlite.prepare(`INSERT INTO relationships
    (id,source_object_id,target_object_id,label,origin,finding_id,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(relationId, input.sourceObjectId, input.targetObjectId, input.label.trim() || "relacionado a", input.origin ?? "manual", input.findingId ?? null, now());
  return relationId;
}

export function updateObject(input: { id: string; name: string; description: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("O nome do objeto é obrigatório.");
  const { sqlite } = getDatabase();
  const result = sqlite.prepare("UPDATE objects SET name = ?, name_normalized = ?, description = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
    .run(name, normalizeName(name), input.description.trim(), now(), input.id);
  if (!result.changes) throw new Error("Objeto não encontrado.");
}

export function archiveItem(kind: "note" | "object" | "type", itemId: string) {
  const { sqlite } = getDatabase();
  const table = kind === "note" ? "notes" : kind === "object" ? "objects" : "object_types";
  sqlite.prepare(`UPDATE ${table} SET archived_at = ? WHERE id = ?`).run(now(), itemId);
}

function mapAnalysisScopeType(value: unknown): AnalysisScopeType {
  if (value === "object" || value === "collection") return value;
  return "note";
}

function noteIsWithinDateRange(note: NoteRecord, dateRange?: AnalysisDateRange) {
  if (!dateRange?.start && !dateRange?.end) return true;
  const timestamp = new Date(note.updatedAt).getTime();
  const start = dateRange.start ? new Date(`${dateRange.start}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const end = dateRange.end ? new Date(`${dateRange.end}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  return timestamp >= start && timestamp <= end;
}

function collectionScopeLabel(scopeId: string, noteCount: number, dateRange?: AnalysisDateRange) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const formatDate = (value: string) => formatter.format(new Date(`${value}T00:00:00Z`));
  const period = dateRange?.start && dateRange.end
    ? `${formatDate(dateRange.start)} a ${formatDate(dateRange.end)}`
    : dateRange?.start
      ? `desde ${formatDate(dateRange.start)}`
      : dateRange?.end
        ? `até ${formatDate(dateRange.end)}`
        : "todo o histórico";
  return scopeId === "general" ? `Visão geral · ${period}` : `Seleção de ${noteCount} nota${noteCount === 1 ? "" : "s"} · ${period}`;
}

export function buildAnalysisSnapshot(scopeType: AnalysisScopeType, scopeId: string, selectedNoteIds?: string[], dateRange?: AnalysisDateRange): AnalysisSnapshot {
  const { sqlite } = getDatabase();
  const allActiveNotes = allNotes();
  const allActiveObjects = allObjects();
  const noteMap = new Map(allActiveNotes.map((note) => [note.id, note]));
  const objectMap = new Map(allActiveObjects.map((object) => [object.id, object]));
  const scopeNote = scopeType === "note" ? noteMap.get(scopeId) : undefined;
  const scopeObject = scopeType === "object" ? objectMap.get(scopeId) : undefined;
  if (scopeType !== "collection" && !scopeNote && !scopeObject) throw new Error("O item selecionado não existe ou foi arquivado.");
  const objectIds = new Set<string>();
  const noteIds = new Set<string>();
  if (scopeType === "collection") {
    allActiveNotes.filter((note) => noteIsWithinDateRange(note, dateRange)).forEach((note) => noteIds.add(note.id));
  } else if (scopeNote) {
    noteIds.add(scopeNote.id);
    scopeNote.mentions.forEach((object) => objectIds.add(object.id));
    allActiveNotes.forEach((note) => {
      if (note.mentions.some((object) => objectIds.has(object.id))) noteIds.add(note.id);
    });
  } else if (scopeObject) {
    objectIds.add(scopeObject.id);
    allActiveNotes.forEach((note) => {
      if (note.mentions.some((object) => object.id === scopeObject.id)) {
        noteIds.add(note.id);
        note.mentions.forEach((object) => objectIds.add(object.id));
      }
    });
  }
  const allowedNoteIds = new Set(noteIds);
  const includedIds = selectedNoteIds ? [...new Set(selectedNoteIds.filter((noteId) => allowedNoteIds.has(noteId)))] : [...noteIds];
  const includedNotes = includedIds.map((noteId) => noteMap.get(noteId)).filter((note): note is NoteRecord => Boolean(note));
  if (!includedNotes.length) throw new Error("Selecione ao menos uma nota para analisar.");
  if (selectedNoteIds && includedNotes.length > 50) throw new Error("TOO_MANY_NOTES");
  const includedObjectIds = new Set<string>(scopeObject ? [scopeObject.id] : []);
  includedNotes.forEach((note) => note.mentions.forEach((object) => includedObjectIds.add(object.id)));
  const relationRows = sqlite.prepare("SELECT * FROM relationships WHERE archived_at IS NULL").all() as Row[];
  const relationshipRecords = relationRows.map(mapRelationship).filter((relation) => includedObjectIds.has(relation.sourceObjectId) && includedObjectIds.has(relation.targetObjectId));
  return {
    scope: {
      type: scopeType,
      id: scopeId,
      label: scopeType === "collection"
        ? collectionScopeLabel(scopeId, includedNotes.length, dateRange)
        : scopeNote
          ? (scopeNote.title || scopeNote.contentText.slice(0, 60) || "Nota sem título")
          : scopeObject!.name,
      ...(scopeType === "collection" ? { dateRange: dateRange ?? { start: "", end: "" } } : {}),
    },
    notes: includedNotes.map((note) => ({
      id: note.id, title: note.title || "Nota sem título", content: note.contentText,
      updatedAt: note.updatedAt, objectIds: note.mentions.map((object) => object.id),
    })),
    objects: [...includedObjectIds].map((objectId) => objectMap.get(objectId)).filter((object): object is KnowledgeObjectRecord => Boolean(object)).map((object) => ({
      id: object.id, type: object.typeName, name: object.name, description: object.description,
    })),
    relationships: relationshipRecords.map((relation) => ({
      id: relation.id, sourceObjectId: relation.sourceObjectId, targetObjectId: relation.targetObjectId, label: relation.label,
    })),
  };
}

const analysisTypes: AnalysisType[] = ["connections", "risks", "contradictions", "gaps", "follow_ups"];

export function createAnalysisRun(snapshot: AnalysisSnapshot, selectedTypes: AnalysisType[] = ["connections"]) {
  const { sqlite } = getDatabase();
  const runId = id("analysis");
  const selected = analysisTypes.filter((type) => selectedTypes.includes(type));
  if (!selected.length) throw new Error("Selecione ao menos um tipo de análise.");
  snapshot = { ...snapshot, analysisTypes: selected };
  sqlite.transaction(() => {
    sqlite.prepare(`INSERT INTO analysis_runs (id,provider,scope_type,scope_id,snapshot_json,status,created_at)
      VALUES (?,?,?,?,?,'queued',?)`).run(runId, "codex-cli", snapshot.scope.type, snapshot.scope.id, JSON.stringify(snapshot), now());
    const insertStep = sqlite.prepare(`INSERT INTO analysis_steps (id,run_id,name,position,status) VALUES (?,?,?,?,'queued')`);
    ["macro"].forEach((name, position) => insertStep.run(id("step"), runId, name, position));
  })();
  return runId;
}

export function getRunSnapshot(runId: string) {
  const row = getDatabase().sqlite.prepare("SELECT snapshot_json FROM analysis_runs WHERE id = ?").get(runId) as Row | undefined;
  if (!row) throw new Error("Análise não encontrada.");
  return json<AnalysisSnapshot>(row.snapshot_json, { scope: { type: "note", id: "", label: "" }, notes: [], objects: [], relationships: [] });
}

export function updateRun(runId: string, status: AnalysisRunRecord["status"], error: string | null = null) {
  const terminal = ["completed", "partial", "failed", "cancelled"].includes(status);
  getDatabase().sqlite.prepare("UPDATE analysis_runs SET status = ?, error = ?, completed_at = ? WHERE id = ?")
    .run(status, error, terminal ? now() : null, runId);
}

export function updateStep(runId: string, name: string, status: string, options: { output?: unknown; error?: string | null } = {}) {
  const timestamp = now();
  const startedAt = status === "running" ? timestamp : null;
  const completedAt = ["completed", "failed", "cancelled"].includes(status) ? timestamp : null;
  getDatabase().sqlite.prepare(`UPDATE analysis_steps SET status = ?, output_json = COALESCE(?, output_json),
    error = ?, started_at = COALESCE(started_at, ?), completed_at = ? WHERE run_id = ? AND name = ?`)
    .run(status, options.output === undefined ? null : JSON.stringify(options.output), options.error ?? null, startedAt, completedAt, runId, name);
}

export function getStepOutputs(runId: string) {
  const rows = getDatabase().sqlite.prepare("SELECT name, status, output_json FROM analysis_steps WHERE run_id = ? ORDER BY position").all(runId) as Row[];
  return rows.map((row) => ({ name: String(row.name), status: String(row.status), output: json(row.output_json, null) }));
}

export function replaceFindings(runId: string, findingsInput: SpecialistFinding[]) {
  const { sqlite } = getDatabase();
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM findings WHERE run_id = ?").run(runId);
    const insertFinding = sqlite.prepare(`INSERT INTO findings
      (id,run_id,category,title,explanation,priority,confidence,suggested_action,status,created_at)
      VALUES (?,?,?,?,?,?,?,?, 'open', ?)`);
    const insertSource = sqlite.prepare("INSERT OR IGNORE INTO finding_sources (finding_id,source_type,source_id) VALUES (?,?,?)");
    for (const finding of findingsInput) {
      const findingId = id("finding");
      insertFinding.run(findingId, runId, finding.category, finding.title, finding.explanation, finding.priority, Math.round(finding.confidence), finding.suggestedAction, now());
      finding.sourceNoteIds.forEach((sourceId) => insertSource.run(findingId, "note", sourceId));
      finding.sourceObjectIds.forEach((sourceId) => insertSource.run(findingId, "object", sourceId));
    }
  })();
}

export function listFindings(): FindingRecord[] {
  return (getDatabase().sqlite.prepare("SELECT * FROM findings ORDER BY created_at DESC").all() as Row[]).map(mapFinding);
}

export function saveMacroReport(runId: string, findingsInput: SpecialistFinding[]) {
  const { sqlite } = getDatabase();
  const snapshot = getRunSnapshot(runId);
  sqlite.transaction(() => {
    const records: FindingRecord[] = [];
    const knownFindings = listFindings();
    for (const finding of findingsInput) {
      const existing = knownFindings.find((f) => f.id === finding.detail?.previousFindingId)
        ?? knownFindings.find((f) => f.category === finding.category && normalizeName(f.title) === normalizeName(finding.title)
          && f.sourceNoteIds.some((noteId) => finding.sourceNoteIds.includes(noteId)));
      const findingId = existing?.id ?? id("finding");
      const evidence = [...(existing?.detail?.evidence ?? []), ...(finding.detail?.evidence ?? [])]
        .filter((item, index, all) => all.findIndex((other) => other.noteId === item.noteId && other.quote === item.quote) === index);
      const detail = finding.detail ? { ...finding.detail, evidence, previousFindingId: existing?.id ?? null } : undefined;
      const sourceNoteIds = [...new Set([...(existing?.sourceNoteIds ?? []), ...finding.sourceNoteIds])];
      const sourceObjectIds = [...new Set([...(existing?.sourceObjectIds ?? []), ...finding.sourceObjectIds])];
      if (existing) {
        // Old report occurrences remain immutable before updating the canonical finding.
        if (!getAiRecord(`report:${existing.runId}`)) {
          putAiRecord(`report:${existing.runId}`, "report", { findings: getAnalysisRun(existing.runId)?.findings ?? [] });
        }
        sqlite.prepare("UPDATE findings SET run_id=?,title=?,explanation=?,priority=?,suggested_action=?,detail_json=? WHERE id=?")
          .run(runId, finding.title, finding.explanation, finding.priority, finding.suggestedAction, JSON.stringify(detail), findingId);
      } else {
        sqlite.prepare("INSERT INTO findings (id,run_id,category,title,explanation,priority,confidence,suggested_action,status,created_at,detail_json) VALUES (?,?,?,?,?,?,0,?,'open',?,?)")
          .run(findingId, runId, finding.category, finding.title, finding.explanation, finding.priority, finding.suggestedAction, now(), JSON.stringify(detail));
      }
      for (const noteId of sourceNoteIds) sqlite.prepare("INSERT OR IGNORE INTO finding_sources VALUES (?,'note',?)").run(findingId, noteId);
      for (const objectId of sourceObjectIds) sqlite.prepare("INSERT OR IGNORE INTO finding_sources VALUES (?,'object',?)").run(findingId, objectId);
      const record = { ...finding, sourceNoteIds, sourceObjectIds, detail, id: findingId, runId, status: existing?.status ?? "open", createdAt: existing?.createdAt ?? now() };
      records.push(record);
      const knownIndex = knownFindings.findIndex((item) => item.id === findingId);
      if (knownIndex >= 0) knownFindings[knownIndex] = record;
      else knownFindings.push(record);
    }
    putAiRecord(`report:${runId}`, "report", { findings: records });
    const markerId = `baseline:${snapshot.scope.type}:${snapshot.scope.id}:${JSON.stringify(snapshot.scope.dateRange ?? {})}`;
    const baseline = getAiRecord<Record<string, string>>(markerId) ?? {};
    snapshot.notes.forEach((n) => { baseline[n.id] = n.updatedAt; });
    putAiRecord(markerId, "baseline", baseline);
  })();
}

export function updateFinding(findingId: string, status: FindingStatus) {
  getDatabase().sqlite.prepare("UPDATE findings SET status = ? WHERE id = ?").run(status, findingId);
}

export function acceptFinding(findingId: string, expectedObjectIds?: [string, string]) {
  const finding = mapFinding(getDatabase().sqlite.prepare("SELECT * FROM findings WHERE id = ?").get(findingId) as Row);
  if (finding.category !== "connection" || finding.sourceObjectIds.length < 2) throw new Error("Este achado não contém dois objetos para relacionar.");
  if (expectedObjectIds && expectedObjectIds.some((id, index) => id !== finding.sourceObjectIds[index])) throw new Error("Os objetos desta sugestão mudaram. Feche e abra os detalhes para conferir o vínculo novamente.");
  const relationId = createRelationship({
    sourceObjectId: finding.sourceObjectIds[0], targetObjectId: finding.sourceObjectIds[1],
    label: finding.title, origin: "analysis", findingId,
  });
  updateFinding(findingId, "resolved");
  return relationId;
}

const backupTables = ["object_types", "objects", "notes", "note_mentions", "relationships", "analysis_runs", "analysis_steps", "findings", "finding_sources", "ai_records", "library_documents", ...researchBackupTables] as const;
const backupColumns = {
  ...researchBackupColumns,
  object_types: ["id", "name", "name_normalized", "icon", "color", "created_at", "archived_at"],
  objects: ["id", "type_id", "name", "name_normalized", "description", "created_at", "updated_at", "archived_at"],
  notes: ["id", "title", "content_json", "content_text", "created_at", "updated_at", "archived_at"],
  note_mentions: ["note_id", "object_id"],
  relationships: ["id", "source_object_id", "target_object_id", "label", "origin", "finding_id", "created_at", "archived_at"],
  analysis_runs: ["id", "provider", "scope_type", "scope_id", "snapshot_json", "status", "error", "created_at", "completed_at"],
  analysis_steps: ["id", "run_id", "name", "position", "status", "output_json", "error", "started_at", "completed_at"],
  findings: ["id", "run_id", "category", "title", "explanation", "priority", "confidence", "suggested_action", "status", "created_at", "detail_json"],
  finding_sources: ["finding_id", "source_type", "source_id"],
  ai_records: ["id", "kind", "data_json", "created_at"],
  library_documents: ["id", "title", "original_name", "original_format", "original_size", "file_hash", "markdown", "content_text", "warnings_json", "revision", "created_at", "updated_at", "archived_at"],
} as const satisfies Record<(typeof backupTables)[number], readonly string[]>;
const backupValueSchema = z.union([z.string(), z.number(), z.null()]);
const backupRowSchema = z.record(z.string(), backupValueSchema);
const backupSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  exportedAt: z.iso.datetime(),
  tables: z.object({
    object_types: z.array(backupRowSchema),
    objects: z.array(backupRowSchema),
    notes: z.array(backupRowSchema),
    note_mentions: z.array(backupRowSchema),
    relationships: z.array(backupRowSchema),
    analysis_runs: z.array(backupRowSchema),
    analysis_steps: z.array(backupRowSchema),
    findings: z.array(backupRowSchema),
    finding_sources: z.array(backupRowSchema),
    ai_records: z.array(backupRowSchema).optional(),
    library_documents: z.array(backupRowSchema).optional(),
    research_conversations: z.array(backupRowSchema).optional(),
    research_sources: z.array(backupRowSchema).optional(),
    research_chunks: z.array(backupRowSchema).optional(),
    research_messages: z.array(backupRowSchema).optional(),
  }).strict(),
}).strict();

export function exportBackup() {
  const { sqlite } = getDatabase();
  const tables: Record<string, Row[]> = {};
  backupTables.forEach((table) => { tables[table] = sqlite.prepare(`SELECT * FROM ${table}`).all() as Row[]; });
  return { version: 4 as const, exportedAt: now(), tables };
}

export function restoreBackup(input: unknown) {
  if (getDatabase().sqlite.prepare("SELECT id FROM research_messages WHERE status IN ('queued','running') LIMIT 1").get()) throw new Error("Aguarde ou cancele a pesquisa em execução antes de restaurar a base.");
  const backup = backupSchema.parse(input);
  if (backup.version >= 2 && !backup.tables.ai_records) throw new Error("Backup inválido: ai_records ausente.");
  if (backup.version >= 3 && !backup.tables.library_documents) throw new Error("Backup inválido: library_documents ausente.");
  for (const table of researchBackupTables) {
    if (backup.version === 4 && !backup.tables[table]) throw new Error(`Backup inválido: ${table} ausente.`);
    if (backup.version < 4) backup.tables[table] = [];
  }
  validateResearchBackup(backup.tables);
  if (backup.version < 3) backup.tables.library_documents = [];
  if (backup.version === 1) backup.tables.findings.forEach((row) => { row.detail_json = row.detail_json ?? null; });
  backup.tables.ai_records ??= [];
  for (const row of backup.tables.library_documents ?? []) {
    const document = libraryBackupRowSchema.parse(row);
    row.content_text = markdownText(document.markdown);
  }
  for (const table of backupTables) {
    const expectedColumns = backupColumns[table] as readonly string[];
    const expectedColumnSet = new Set(expectedColumns);
    for (const row of backup.tables[table] ?? []) {
      const actualColumns = Object.keys(row);
      if (actualColumns.length !== expectedColumns.length || actualColumns.some((column) => !expectedColumnSet.has(column))) {
        throw new Error(`Backup inválido: colunas inesperadas na tabela ${table}.`);
      }
    }
  }
  const { sqlite, path: databasePath } = getDatabase();
  const backupsDirectory = path.join(getDataDirectory(), "backups");
  fs.mkdirSync(backupsDirectory, { recursive: true });
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  const safetyPath = path.join(backupsDirectory, `before-restore-${new Date().toISOString().replaceAll(":", "-")}.db`);
  fs.copyFileSync(databasePath, safetyPath);
  sqlite.transaction(() => {
    [...backupTables].reverse().forEach((table) => sqlite.prepare(`DELETE FROM ${table}`).run());
    for (const table of backupTables) {
      const rows = backup.tables[table] ?? [];
      const columns = backupColumns[table] as readonly string[];
      const placeholders = columns.map(() => "?").join(",");
      const insert = sqlite.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`);
      for (const row of rows) {
        insert.run(...columns.map((column) => row[column]));
      }
    }
    sqlite.prepare("DELETE FROM notes_fts").run();
    sqlite.prepare("INSERT INTO notes_fts (note_id,title,content) SELECT id,title,content_text FROM notes").run();
    sqlite.prepare("DELETE FROM library_documents_fts").run();
    sqlite.prepare("INSERT INTO library_documents_fts (document_id,title,content) SELECT id,title,content_text FROM library_documents").run();
    sqlite.prepare("DELETE FROM research_chunks_fts").run();
    sqlite.prepare("INSERT INTO research_chunks_fts (chunk_id,title,section,content) SELECT c.id,s.title,c.section,c.content FROM research_chunks c JOIN research_sources s ON s.id=c.source_id").run();
    sqlite.prepare("UPDATE research_messages SET status='interrupted', error='Execução interrompida. Tente novamente manualmente.', completed_at=? WHERE status IN ('queued','running')").run(now());
  })();
  clearResearchPreviews();
  return safetyPath;
}
