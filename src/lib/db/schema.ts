import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  scopeType: text("scope_type", { enum: ["note", "object"] }).notNull(),
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
  status: text("status").notNull().default("open"),
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
