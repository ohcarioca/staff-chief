import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

type DatabaseState = {
  sqlite: Database.Database;
  orm: ReturnType<typeof drizzle<typeof schema>>;
  path: string;
};

const globalForDatabase = globalThis as unknown as {
  staffChiefDatabase?: DatabaseState;
};

function resolveDataDirectory() {
  if (process.env.STAFF_CHIEF_DATA_DIR) return process.env.STAFF_CHIEF_DATA_DIR;
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData
    ? path.join(localAppData, "StaffChief")
    : path.join(os.homedir(), ".staff-chief");
}

export function normalizeName(value: string) {
  return value.trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function initialize(sqlite: Database.Database) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS object_types (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, name_normalized TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL, archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS objects (
      id TEXT PRIMARY KEY, type_id TEXT NOT NULL REFERENCES object_types(id),
      name TEXT NOT NULL, name_normalized TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
      UNIQUE(type_id, name_normalized)
    );
    CREATE INDEX IF NOT EXISTS objects_type_idx ON objects(type_id);
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content_json TEXT NOT NULL,
      content_text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS note_mentions (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      object_id TEXT NOT NULL REFERENCES objects(id), PRIMARY KEY(note_id, object_id)
    );
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY, source_object_id TEXT NOT NULL REFERENCES objects(id),
      target_object_id TEXT NOT NULL REFERENCES objects(id), label TEXT NOT NULL,
      origin TEXT NOT NULL CHECK(origin IN ('manual','analysis')), finding_id TEXT,
      created_at TEXT NOT NULL, archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, status TEXT NOT NULL,
      error TEXT, created_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS analysis_steps (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      name TEXT NOT NULL, position INTEGER NOT NULL, status TEXT NOT NULL,
      output_json TEXT, error TEXT, started_at TEXT, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      category TEXT NOT NULL, title TEXT NOT NULL, explanation TEXT NOT NULL,
      priority TEXT NOT NULL, confidence INTEGER NOT NULL, suggested_action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, detail_json TEXT
    );
    CREATE TABLE IF NOT EXISTS finding_sources (
      finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK(source_type IN ('note','object')), source_id TEXT NOT NULL,
      PRIMARY KEY(finding_id, source_type, source_id)
    );
    CREATE TABLE IF NOT EXISTS ai_records (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      note_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2'
    );
  `);
  const findingColumns = sqlite.prepare("PRAGMA table_info(findings)").all() as Array<{ name: string }>;
  if (!findingColumns.some((column) => column.name === "detail_json")) {
    sqlite.exec("ALTER TABLE findings ADD COLUMN detail_json TEXT");
  }

  const insertType = sqlite.prepare(`
    INSERT OR IGNORE INTO object_types
      (id, name, name_normalized, icon, color, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  insertType.run("type-person", "Pessoa", "pessoa", "◎", "#45A886", now);
  insertType.run("type-project", "Projeto", "projeto", "◇", "#D89B45", now);
  insertType.run("type-idea", "Ideia", "ideia", "✦", "#8A73D6", now);
}

function createDatabase(): DatabaseState {
  const directory = resolveDataDirectory();
  fs.mkdirSync(directory, { recursive: true });
  const databasePath = path.join(directory, "staff-chief.db");
  const sqlite = new Database(databasePath);
  initialize(sqlite);
  return { sqlite, orm: drizzle(sqlite, { schema }), path: databasePath };
}

export function getDatabase() {
  if (!globalForDatabase.staffChiefDatabase) {
    globalForDatabase.staffChiefDatabase = createDatabase();
  }
  return globalForDatabase.staffChiefDatabase;
}

export function resetDatabaseForTests() {
  globalForDatabase.staffChiefDatabase?.sqlite.close();
  delete globalForDatabase.staffChiefDatabase;
}

export function getDataDirectory() {
  return path.dirname(getDatabase().path);
}
