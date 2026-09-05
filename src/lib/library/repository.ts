import "server-only";
import { randomUUID } from "node:crypto";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import { getDatabase } from "@/lib/db/client";
import { convertDocument, inspectFile } from "./conversion";
import { documentUpdateSchema, LibraryError, type LibraryDocument, type LibraryDocumentSummary } from "./contracts";

const summaryColumns = `id, title, original_name AS originalName, original_format AS originalFormat,
  original_size AS originalSize, warnings_json AS warningsJson, revision,
  created_at AS createdAt, updated_at AS updatedAt, archived_at AS archivedAt`;
type SummaryRow = Omit<LibraryDocumentSummary, "warnings"> & { warningsJson: string };
function mapRow<T extends SummaryRow>(row: T) {
  const { warningsJson, ...rest } = row;
  return { ...rest, warnings: JSON.parse(warningsJson) as string[] };
}
export function markdownText(markdown: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  return tree.children.map((node) => toString(node)).join("\n\n");
}
function indexDocument(id: string, title: string, text: string) {
  const { sqlite } = getDatabase();
  sqlite.prepare("DELETE FROM library_documents_fts WHERE document_id = ?").run(id);
  sqlite.prepare("INSERT INTO library_documents_fts (document_id, title, content) VALUES (?, ?, ?)").run(id, title, text);
}
export function listDocuments(query = "", archived = false): LibraryDocumentSummary[] {
  const { sqlite } = getDatabase();
  const terms = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 30) ?? [];
  const search = terms.map((term) => `"${term}"*`).join(" AND ");
  return (sqlite.prepare(`SELECT ${summaryColumns} FROM library_documents
    WHERE archived_at IS ${archived ? "NOT " : ""}NULL
    ${search ? "AND id IN (SELECT document_id FROM library_documents_fts WHERE library_documents_fts MATCH ?)" : ""}
    ORDER BY updated_at DESC, id DESC`).all(...(search ? [search] : [])) as SummaryRow[]).map(mapRow);
}
export function getDocument(id: string): LibraryDocument {
  const row = getDatabase().sqlite.prepare(`SELECT ${summaryColumns}, markdown FROM library_documents WHERE id = ?`).get(id) as (SummaryRow & { markdown: string }) | undefined;
  if (!row) throw new LibraryError("Documento não encontrado.", 404);
  return mapRow(row);
}
export async function importDocument(name: string, bytes: Uint8Array) {
  const metadata = inspectFile(name, bytes);
  const findExisting = () => getDatabase().sqlite.prepare("SELECT id FROM library_documents WHERE file_hash = ?").get(metadata.fileHash) as { id: string } | undefined;
  const existing = findExisting();
  if (existing) return { document: getDocument(existing.id), duplicate: true };
  const converted = await convertDocument(name, bytes);
  const contentText = markdownText(converted.markdown);
  return getDatabase().sqlite.transaction(() => {
    const concurrent = findExisting();
    if (concurrent) return { document: getDocument(concurrent.id), duplicate: true };
    const id = randomUUID();
    const now = new Date().toISOString();
    getDatabase().sqlite.prepare(`INSERT INTO library_documents
      (id,title,original_name,original_format,original_size,file_hash,markdown,content_text,warnings_json,revision,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`).run(id, converted.title, converted.originalName, converted.originalFormat,
      converted.originalSize, converted.fileHash, converted.markdown, contentText, JSON.stringify(converted.warnings), now, now);
    indexDocument(id, converted.title, contentText);
    return { document: getDocument(id), duplicate: false };
  })();
}
export function updateDocument(id: string, input: unknown) {
  const update = documentUpdateSchema.parse(input);
  return getDatabase().sqlite.transaction(() => {
    const current = getDocument(id);
    if (update.revision !== current.revision) throw new LibraryError("O documento foi alterado em outra janela. Reabra-o antes de salvar.", 409);
    const title = update.title ?? current.title;
    const markdown = update.markdown ?? current.markdown;
    const contentText = markdownText(markdown);
    const now = new Date().toISOString();
    const revision = current.revision + (markdown !== current.markdown || title !== current.title ? 1 : 0);
    const archivedAt = update.archived === undefined ? current.archivedAt : update.archived ? current.archivedAt ?? now : null;
    getDatabase().sqlite.prepare(`UPDATE library_documents SET title=?,markdown=?,content_text=?,revision=?,updated_at=?,archived_at=? WHERE id=?`)
      .run(title, markdown, contentText, revision, now, archivedAt, id);
    indexDocument(id, title, contentText);
    return getDocument(id);
  })();
}

/** Capture explicit sources in one read transaction; callers may persist this immutable value. */
export function getLibraryContext(ids: string[]) {
  return getDatabase().sqlite.transaction(() => [...new Set(ids)].map((id) => {
    const document = getDocument(id);
    if (document.archivedAt) throw new LibraryError("Documento arquivado não pode ser usado como contexto.");
    return { id: document.id, title: document.title, markdown: document.markdown, revision: document.revision };
  }))();
}
