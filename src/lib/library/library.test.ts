import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDatabase, resetDatabaseForTests } from "@/lib/db/client";
import { exportBackup, restoreBackup, saveNote, getAppState } from "@/lib/db/repository";
import { convertDocument } from "./conversion";
import { getDocument, getLibraryContext, importDocument, listDocuments, updateDocument } from "./repository";
import { MAX_FILE_BYTES, MAX_MARKDOWN_CHARACTERS } from "./contracts";
import { POST, GET } from "@/app/api/library/documents/route";
import { PATCH } from "@/app/api/library/documents/[id]/route";
import { GET as download } from "@/app/api/library/documents/[id]/download/route";

const fixture = (name: string) => fs.readFileSync(path.resolve("src/test/fixtures/library", name));
const bytes = (text: string) => Buffer.from(text);
let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "staff-chief-library-test-"));
  process.env.STAFF_CHIEF_DATA_DIR = directory;
  resetDatabaseForTests();
});
afterEach(() => {
  resetDatabaseForTests();
  delete process.env.STAFF_CHIEF_DATA_DIR;
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("local document conversion", () => {
  it("preserves Markdown and escapes plain text semantics, including accents and paragraphs", async () => {
    const md = fixture("reference.md");
    expect((await convertDocument("reference.md", md)).markdown).toBe(md.toString().replaceAll("\r\n", "\n"));
    const txt = await convertDocument("note.txt", bytes("# Gestão\r\n\r\n*literal*"));
    expect(txt.markdown).toBe("\\# Gestão\n\n\\*literal\\*");
    expect((await convertDocument("utf16.txt", Buffer.concat([Buffer.from([255, 254]), Buffer.from("Gestão", "utf16le")]))).markdown).toBe("Gestão");
  });
  it("converts a real DOCX with headings, accents and tables", async () => {
    const result = await convertDocument("structured.docx", fixture("structured.docx"));
    expect(result.markdown).toContain("# Gestão e decisões");
    expect(result.markdown).toContain("Biblioteca");
    expect(result.markdown).toContain("|");
  });
  it("extracts real PDF pages and reports partially missing text", async () => {
    const result = await convertDocument("multipage.pdf", fixture("multipage.pdf"));
    expect(result.markdown).toContain("## Página 1");
    expect(result.markdown).toContain("## Página 2");
    expect(result.markdown).toContain("Gestão de projetos");
    const partial = await convertDocument("partial.pdf", fixture("partial.pdf"));
    expect(partial.warnings.join(" ")).toContain("Páginas sem texto extraível: 2");
  });
  it("rejects empty, binary, malformed, encrypted, scanned and oversized inputs without saving", async () => {
    const cases: Array<[string, Buffer, string]> = [
      ["empty.txt", bytes(""), "vazio"], ["blank.md", bytes(" \n"), "não contém texto"],
      ["bad.txt", Buffer.from([0xff]), "Codificação"], ["binary.txt", Buffer.from([0]), "Codificação"],
      ["bad.exe", bytes("text"), "Formato"], ["bad.docx", bytes("bad"), "íntegro"],
      ["bad.pdf", bytes("bad"), "íntegro"], ["protected.pdf", fixture("protected.pdf"), "senha"],
      ["empty.pdf", fixture("empty.pdf"), "OCR"],
      ["huge.txt", Buffer.alloc(MAX_FILE_BYTES + 1), "20 MB"],
      ["long.md", bytes("a".repeat(MAX_MARKDOWN_CHARACTERS + 1)), "2 milhões"],
    ];
    for (const [name, content, error] of cases) await expect(importDocument(name, content)).rejects.toThrow(error);
    expect(listDocuments()).toEqual([]);
  });
});

describe("library persistence and HTTP", () => {
  it("preserves edits on duplicates, supports search, archive, restore and explicit context snapshots", async () => {
    const imported = await importDocument("source.md", bytes("# Gestão\n\nInicial"));
    const updated = updateDocument(imported.document.id, { markdown: "# Corrigido\n\nDecisão estratégica", revision: 1 });
    expect(updated.revision).toBe(2);
    const snapshot = getLibraryContext([updated.id]);
    const duplicate = await importDocument("renamed.md", bytes("# Gestão\n\nInicial"));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.document.markdown).toBe(updated.markdown);
    expect(listDocuments("decisao estrategica").map((doc) => doc.id)).toEqual([updated.id]);
    expect(listDocuments("Inicial")).toEqual([]);
    expect(listDocuments()[0]).not.toHaveProperty("markdown");
    const renamed = updateDocument(updated.id, { title: "Nova referência", revision: 2 });
    expect(listDocuments("referencia")).toHaveLength(1);
    expect(() => updateDocument(updated.id, { markdown: "stale", revision: 1 })).toThrow("outra janela");
    updateDocument(updated.id, { archived: true, revision: renamed.revision });
    expect(listDocuments()).toEqual([]);
    expect(listDocuments("", true)).toHaveLength(1);
    expect(() => getLibraryContext([updated.id])).toThrow("arquivado");
    expect(snapshot[0].title).toBe("source");
    updateDocument(updated.id, { archived: false, revision: renamed.revision });
    expect(getLibraryContext([updated.id, updated.id])).toHaveLength(1);
    expect((await importDocument("source.md", bytes("Different"))).document.id).not.toBe(updated.id);
    resetDatabaseForTests();
    expect(getDocument(updated.id).markdown).toBe(updated.markdown);
  });
  it("upgrades a populated old database additively and round-trips backups v3/v2/v1", async () => {
    const note = saveNote({ title: "Existing", contentJson: { type: "doc", content: [] } });
    getDatabase().sqlite.exec("DROP TABLE library_documents_fts; DROP TABLE library_documents;");
    resetDatabaseForTests();
    expect(getAppState().notes[0].id).toBe(note.id);
    const { document } = await importDocument("backup.md", bytes("Restauração indexada"));
    const backup = exportBackup();
    expect(backup.version).toBe(4);
    updateDocument(document.id, { markdown: "Changed", revision: 1 });
    restoreBackup(backup);
    expect(listDocuments("restauracao")).toHaveLength(1);
    expect(getDocument(document.id).markdown).toBe("Restauração indexada");
    const missingTable = structuredClone(backup);
    delete missingTable.tables.library_documents;
    expect(() => restoreBackup(missingTable)).toThrow("library_documents ausente");
    const invalidWarnings = structuredClone(backup);
    invalidWarnings.tables.library_documents[0].warnings_json = "invalid JSON";
    expect(() => restoreBackup(invalidWarnings)).toThrow();
    expect(listDocuments("restauracao")).toHaveLength(1);
    for (const version of [2, 1]) {
      const legacy = structuredClone(missingTable);
      if (version === 1) delete legacy.tables.ai_records;
      restoreBackup({ ...legacy, version });
      expect(listDocuments()).toEqual([]);
      expect(getAppState().notes[0].id).toBe(note.id);
    }
  });
  it("imports multipart, returns failures individually, updates and downloads the saved Markdown", async () => {
    const request = (name: string, content: string) => {
      const form = new FormData(); form.set("file", new File([content], name));
      return new Request("http://localhost/api/library/documents", { method: "POST", body: form });
    };
    expect((await POST(request("bad.pdf", "bad"))).status).toBe(400);
    const response = await POST(request("good.md", "# Olá"));
    expect(response.status).toBe(201);
    const { document } = await response.json();
    expect((await POST(request("good.md", "# Olá"))).status).toBe(200);
    const context = { params: Promise.resolve({ id: document.id }) };
    expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: "invalid json" }), context)).status).toBe(400);
    expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "Título corrigido", markdown: "Novo conteúdo", revision: 1 }) }), context)).status).toBe(200);
    const file = await download(new Request("http://localhost"), context);
    expect(file.headers.get("content-disposition")).toContain("attachment;");
    expect(await file.text()).toBe("Novo conteúdo");
    expect(await (await GET(new Request("http://localhost/api/library/documents?q=conteudo"))).json()).toHaveLength(1);
    expect((await POST(new Request("http://localhost", { method: "POST", headers: { "content-length": String(MAX_FILE_BYTES * 2) }, body: "x" }))).status).toBe(413);
  });
});
