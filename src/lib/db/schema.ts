import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const researchConversations = sqliteTable("research_conversations", {
  id: text("id").primaryKey(), title: text("title").notNull(), createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(), archivedAt: text("archived_at"),
});
export const researchSources = sqliteTable("research_sources", {
  id: text("id").primaryKey(), conversationId: text("conversation_id").notNull().references(() => researchConversations.id, { onDelete: "cascade" }),
  documentId: text("document_id").notNull(), title: text("title").notNull(), revision: integer("revision").notNull(), markdown: text("markdown").notNull(),
}, (table) => [uniqueIndex("research_sources_document_uq").on(table.conversationId, table.documentId)]);
export const researchChunks = sqliteTable("research_chunks", {
  id: text("id").primaryKey(), conversationId: text("conversation_id").notNull().references(() => researchConversations.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull().references(() => researchSources.id, { onDelete: "cascade" }),
  startOffset: integer("start_offset").notNull(), endOffset: integer("end_offset").notNull(), section: text("section").notNull(), content: text("content").notNull(),
}, (table) => [index("research_chunks_conversation_idx").on(table.conversationId)]);
export const researchMessages = sqliteTable("research_messages", {
  id: text("id").primaryKey(), conversationId: text("conversation_id").notNull().references(() => researchConversations.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(), question: text("question").notNull(), status: text("status").notNull(),
  contextJson: text("context_json").notNull(), answerJson: text("answer_json"), error: text("error"), attempt: integer("attempt").notNull().default(1),
  createdAt: text("created_at").notNull(), completedAt: text("completed_at"),
}, (table) => [uniqueIndex("research_messages_request_uq").on(table.conversationId, table.requestId),
  uniqueIndex("research_messages_pending_uq").on(table.conversationId).where(sql`${table.status} IN ('queued','running')`)]);

export const objectTypes = sqliteTable(
  "object_types",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    createdAt: text("created_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [uniqueIndex("object_types_name_normalized_uq").on(table.nameNormalized)],
);

export const objects = sqliteTable(
  "objects",
  {
    id: text("id").primaryKey(),
    typeId: text("type_id").notNull().references(() => objectTypes.id),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    description: text("description").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("objects_type_name_uq").on(table.typeId, table.nameNormalized),
    index("objects_type_idx").on(table.typeId),
  ],
);

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  contentJson: text("content_json").notNull(),
  contentText: text("content_text").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
});

export const libraryDocuments = sqliteTable("library_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  originalName: text("original_name").notNull(),
  originalFormat: text("original_format", { enum: ["txt", "md", "docx", "pdf"] }).notNull(),
  originalSize: integer("original_size").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  markdown: text("markdown").notNull(),
  contentText: text("content_text").notNull(),
  warningsJson: text("warnings_json").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
});

export const noteMentions = sqliteTable(
  "note_mentions",
  {
    noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
    objectId: text("object_id").notNull().references(() => objects.id),
  },
  (table) => [uniqueIndex("note_mentions_uq").on(table.noteId, table.objectId)],
);

export const relationships = sqliteTable("relationships", {
  id: text("id").primaryKey(),
  sourceObjectId: text("source_object_id").notNull().references(() => objects.id),
  targetObjectId: text("target_object_id").notNull().references(() => objects.id),
  label: text("label").notNull(),
  origin: text("origin", { enum: ["manual", "analysis"] }).notNull(),
  findingId: text("finding_id"),
  createdAt: text("created_at").notNull(),
  archivedAt: text("archived_at"),
});

export const analysisRuns = sqliteTable("analysis_runs", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  scopeType: text("scope_type", { enum: ["note", "object", "collection"] }).notNull(),
  scopeId: text("scope_id").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const analysisSteps = sqliteTable("analysis_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => analysisRuns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  status: text("status").notNull(),
  outputJson: text("output_json"),
  error: text("error"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

export const findings = sqliteTable("findings", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => analysisRuns.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  explanation: text("explanation").notNull(),
  priority: text("priority").notNull(),
  confidence: integer("confidence").notNull(),
  suggestedAction: text("suggested_action").notNull(),
  detailJson: text("detail_json"),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull(),
});

export const aiRecords = sqliteTable("ai_records", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  dataJson: text("data_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const findingSources = sqliteTable(
  "finding_sources",
  {
    findingId: text("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
    sourceType: text("source_type", { enum: ["note", "object"] }).notNull(),
    sourceId: text("source_id").notNull(),
  },
  (table) => [uniqueIndex("finding_sources_uq").on(table.findingId, table.sourceType, table.sourceId)],
);
