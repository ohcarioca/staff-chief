import "server-only";
import { getDatabase } from "./client";

export function putAiRecord(id: string, kind: string, data: unknown) {
  getDatabase().sqlite.prepare("INSERT OR REPLACE INTO ai_records (id,kind,data_json,created_at) VALUES (?,?,?,?)")
    .run(id, kind, JSON.stringify(data), new Date().toISOString());
}
export function getAiRecord<T>(id: string): T | null {
  const row = getDatabase().sqlite.prepare("SELECT data_json FROM ai_records WHERE id = ?").get(id) as { data_json: string } | undefined;
  return row ? JSON.parse(row.data_json) as T : null;
}
