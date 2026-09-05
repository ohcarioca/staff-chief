import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase, resetDatabaseForTests } from "@/lib/db/client";
import { exportBackup, restoreBackup, saveNote, archiveItem } from "@/lib/db/repository";
import { importDocument, updateDocument } from "@/lib/library/repository";
import { chunkSource, ftsQuery, inventoryCategory, noEvidenceAnswer, prepareContext, validateAnswer } from "./context";
import { researchLimits, type ResearchAnswer, type ResearchContext } from "./contracts";
import { confirmConversation, enqueueMessage, getConversation, getMessage, getMessageContext, getSource, listConversations, prepareConversation, retrieveChunks, retryMessage, updateConversation } from "./repository";
import { cancelMessage, executeMessage } from "./service";
import { GET as events } from "@/app/api/research/messages/[id]/events/route";
import { POST as create } from "@/app/api/research/conversations/route";

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "staff-chief-research-")); process.env.STAFF_CHIEF_DATA_DIR = directory; resetDatabaseForTests(); });
afterEach(() => { resetDatabaseForTests(); delete process.env.STAFF_CHIEF_DATA_DIR; fs.rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); });
async function conversation(text = "# Projeto Aurora\n\nO lançamento do projeto Aurora será em 15 de outubro. A responsável é Ana.", name = "Aurora") {
  const { document } = await importDocument(`${name}.md`, Buffer.from(text));
  return { document, conversation: confirmConversation(prepareConversation([document.id]).id) };
}
const send = (id: string, question = "Quando será o lançamento do projeto Aurora?") => enqueueMessage(id, { requestId: randomUUID(), question }).message;
const answerFor = (context: ResearchContext): ResearchAnswer => ({ insufficientEvidence: false, blocks: [{ text: "O lançamento está descrito na fonte.", citations: [{ chunkId: context.chunks[0].id, quote: context.chunks[0].content }] }] });
const providerFor = (id: string) => ({ runStructured: vi.fn(async () => answerFor(getMessageContext(id))) });

describe("research sources and retrieval", () => {
  it("retains category words and normalizes Portuguese plurals in search", () => {
    expect(ftsQuery("Quais projetos citados?")).toBe('"projeto"*');
    expect(ftsQuery("Projeto ativo")).toBe(ftsQuery("Projetos ativos"));
    expect(inventoryCategory("Quais projetos são citados nas notas?")).toBe("projeto");
    expect(inventoryCategory("Quais projetos citam Aurora?")).toBeNull();
  });
  it("retrieves six distinct typed projects despite many repeated mentions and freezes their classification", () => {
    const names = ["Safira", "Boreal", "Cedro", "Delta", "Estrela", "Farol"];
    const note = (name: string) => saveNote({ title: `Registro ${name}`, contentJson: { type: "doc", content: [{ type: "paragraph", content: [
      { type: "mention", attrs: { typeId: "type-project", label: name } }, { type: "text", text: " tem uma proposta em avaliação; o status não foi confirmado." },
    ] }] } });
    for (let index = 0; index < 15; index++) note(names[0]);
    const saved = names.slice(1).map(note);
    const chat = confirmConversation(prepareConversation([]).id);
    const result = retrieveChunks(chat.id, "Quais projetos citados?", []);
    expect(result.length).toBeLessThanOrEqual(12);
    for (const name of names) expect(result.some((chunk) => chunk.content.includes(`Projeto: ${name}`))).toBe(true);
    expect(result.some((chunk) => chunk.content.includes("não indica que estejam ativas"))).toBe(true);
    archiveItem("note", saved[0].id);
    getDatabase().sqlite.prepare("UPDATE objects SET name='Renamed project' WHERE name=?").run("Boreal");
    expect(retrieveChunks(chat.id, "projetos ativos", []).some((chunk) => chunk.content.includes("Projeto: Boreal"))).toBe(true);
    const backup = exportBackup(); restoreBackup(backup);
    expect(retrieveChunks(chat.id, "projetos", []).map((chunk) => chunk.content).join("\n")).toContain("Projeto: Farol");
  });
  it("broadens inventory retrieval within legacy snapshots without importing live sources", async () => {
    const first = await importDocument("Overview.md", Buffer.from("# Visão geral\n\nO projeto Aurora está em revisão."));
    const second = await importDocument("Boreal.md", Buffer.from("# Boreal\n\nA iniciativa Boreal depende de orçamento."));
    const chat = confirmConversation(prepareConversation([first.document.id, second.document.id]).id);
    await conversation("Projeto Externo não faz parte desta conversa.", "Externo");
    expect(retrieveChunks(chat.id, "Quais projetos citados?", [])).toHaveLength(2);
    expect(retrieveChunks(chat.id, "Boreal", []).every((chunk) => chunk.documentId === second.document.id)).toBe(true);
    expect(retrieveChunks(chat.id, "Quais projetos citados?", []).some((chunk) => chunk.content.includes("Externo"))).toBe(false);
  });
  it("migrates a cached pre-research database without reopening it or losing notes", () => {
    const note = saveNote({ title: "Preserved", contentJson: { type: "doc", content: [] } });
    const cached = getDatabase();
    cached.sqlite.exec("DROP TABLE research_messages; DROP TABLE research_chunks; DROP TABLE research_chunks_fts; DROP TABLE research_sources; DROP TABLE research_conversations;");
    delete cached.schemaVersion;
    expect(() => cached.sqlite.prepare("SELECT * FROM research_conversations")).toThrow(/no such table/);
    expect(listConversations()).toEqual([]);
    expect(getDatabase().sqlite).toBe(cached.sqlite);
    expect(cached.sqlite.prepare("SELECT id FROM notes WHERE id=?").get(note.id)).toBeTruthy();
    expect(confirmConversation(prepareConversation([]).id).sources).toHaveLength(1);
  });
  it("does not interrupt a live research message when updating cached schema metadata", async () => {
    const { conversation: chat } = await conversation();
    const message = send(chat.id);
    delete getDatabase().schemaVersion;
    expect(getMessage(message.id).status).toBe("queued");
    resetDatabaseForTests();
    expect(getMessage(message.id).status).toBe("interrupted");
  });
  it("creates a notes conversation directly and deduplicates creation retries without starting AI", async () => {
    saveNote({ title: "Automatic note", contentJson: { type: "doc", content: [] } });
    const body = JSON.stringify({ requestId: randomUUID(), documentIds: [] });
    const request = () => new Request("http://localhost:3000/api/research/conversations", { method: "POST", body });
    const first = await create(request());
    expect(first.status).toBe(201);
    const chat = await first.json();
    expect(chat.sources).toHaveLength(1);
    expect(chat.messages).toEqual([]);
    expect(await (await create(request())).json()).toEqual(chat);
    expect(listConversations()).toHaveLength(1);
  });
  it("automatically includes all active notes without date or count filters, supports notes-only research and preserves snapshots", async () => {
    const notes = Array.from({ length: 25 }, (_, index) => saveNote({ title: `Registro ${index}`, contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: index === 0 ? "A gerente Zuleica aprova o orçamento do projeto Safira." : `Registro histórico ${index}.` }] }] } }));
    const archived = saveNote({ title: "Arquivada", contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Exclusiva arquivada" }] }] } });
    archiveItem("note", archived.id);
    getDatabase().sqlite.prepare("UPDATE notes SET updated_at=? WHERE id=?").run("2020-01-01T00:00:00.000Z", notes[0].id);
    const preview = prepareConversation([]);
    expect(preview.sources).toHaveLength(25);
    expect(preview.sources.every((source) => source.documentId.startsWith("note:"))).toBe(true);
    saveNote({ id: notes[0].id, title: "Registro editado", contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Novo responsável" }] }] } });
    const chat = confirmConversation(preview.id);
    const chunks = retrieveChunks(chat.id, "Zuleica orçamento Safira", []);
    expect(chunks[0].documentId).toBe(`note:${notes[0].id}`);
    expect(chunks[0].content).toContain("Zuleica");
    expect(retrieveChunks(chat.id, "Exclusiva arquivada", [])).toEqual([]);
    const message = send(chat.id, "Quem aprova o orçamento Safira?");
    await executeMessage(message.id, providerFor(message.id));
    expect(getMessage(message.id).answer?.blocks[0].citations.length).toBeGreaterThan(0);
    const backup = exportBackup(); restoreBackup(backup);
    expect(getConversation(chat.id).sources).toHaveLength(25);
    expect(getMessage(message.id).answer).not.toBeNull();
    const newer = confirmConversation(prepareConversation([]).id);
    expect(getSource(newer.id, newer.sources.find((source) => source.documentId === `note:${notes[0].id}`)!.id).markdown).toContain("Novo responsável");
  });
  it("combines selected documents and notes with distinct identities and rejects an empty source set", async () => {
    expect(() => prepareConversation([])).toThrow("Crie uma nota");
    const { document, conversation: original } = await conversation();
    const note = saveNote({ title: "Nota complementar", contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Aurora terá revisão da equipe comercial." }] }] } });
    // Identical UUIDs across different entity tables must not collide.
    getDatabase().sqlite.prepare("UPDATE notes SET id=? WHERE id=?").run(document.id, note.id);
    const chat = confirmConversation(prepareConversation([document.id]).id);
    expect(chat.sources.map((source) => source.documentId)).toEqual([document.id, `note:${document.id}`]);
    expect(getConversation(original.id).sources).toHaveLength(1);
    expect(retrieveChunks(chat.id, "Aurora", [])).toHaveLength(2);
  });
  it("confirms exact preview versions, deduplicates confirmation and keeps copies after library edits/archive", async () => {
    const { document } = await importDocument("source.md", Buffer.from("Versão original Aurora"));
    const preview = prepareConversation([document.id]);
    updateDocument(document.id, { revision: 1, markdown: "Versão alterada", archived: true });
    const chat = confirmConversation(preview.id);
    expect(confirmConversation(preview.id).id).toBe(chat.id);
    expect(chat.messages).toEqual([]);
    expect(getSource(chat.id, chat.sources[0].id).markdown).toBe("Versão original Aurora");
    expect(chat.sources[0].revision).toBe(1);
    expect(() => prepareConversation([document.id])).toThrow("arquivado");
    expect(listConversations()).toHaveLength(1);
  });
  it("expires previews, enforces document/character limits and isolates conversation sources", async () => {
    const first = await conversation();
    const second = await conversation("# Projeto Boreal\n\nBoreal tem orçamento de 900 reais.", "Boreal");
    expect(() => getSource(first.conversation.id, second.conversation.sources[0].id)).toThrow("não encontrada");
    expect(retrieveChunks(first.conversation.id, "Boreal orçamento", [])).toEqual([]);
    expect(() => prepareConversation(Array.from({ length: 21 }, () => randomUUID()))).toThrow();
    const largeIds: string[] = [];
    for (let i = 0; i < 3; i++) largeIds.push((await importDocument(`large${i}.md`, Buffer.from(`${i}${"x".repeat(1_699_999)}`))).document.id);
    expect(() => prepareConversation(largeIds)).toThrow("5 milhões");
    const preview = prepareConversation([first.document.id]);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    expect(() => confirmConversation(preview.id)).toThrow("expirou");
  });
  it("chunks with stable offsets, paragraph overlap and page labels", () => {
    const source = { id: randomUUID(), documentId: randomUUID(), title: "PDF", revision: 1, markdown: `## Página 1\n\n${"texto ".repeat(330)}\n\n## Página 2\n\n${"😀 mais conteúdo ".repeat(220)}` };
    const chunks = chunkSource(source);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.at(-1)?.end).toBe(source.markdown.length);
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.content).toBe(source.markdown.slice(chunk.start, chunk.end));
      expect(chunk.content.length).toBeLessThanOrEqual(researchLimits.chunk);
      if (index) expect(chunk.start).toBeLessThan(chunks[index - 1].end);
    }
    expect(chunks.some((chunk) => chunk.section === "Página 2")).toBe(true);
    const boundary = chunkSource({ ...source, markdown: `${"x".repeat(1600)}\n\nmais texto` });
    expect(boundary[0].content.length).toBe(1600);
    const heading = chunkSource({ ...source, markdown: `# ${"h".repeat(4000)}` });
    expect(heading[0].section.length).toBe(180);
  });
  it("supports follow-up retrieval and diversifies relevant sources", async () => {
    const { document: first } = await importDocument("aurora.md", Buffer.from("Aurora entrega em outubro."));
    const { document: second } = await importDocument("aurora2.md", Buffer.from("Aurora depende da validação de Ana."));
    const chat = confirmConversation(prepareConversation([first.id, second.id]).id);
    const chunks = retrieveChunks(chat.id, "Explique esse ponto", ["Como será a entrega Aurora?"]);
    expect(new Set(chunks.map((chunk) => chunk.sourceId)).size).toBe(2);
  });
});

describe("bounded, verifiable answers", () => {
  it("keeps complete history pairs, drops older history, respects full UTF-8 budget without truncating the question", () => {
    const source = { id: randomUUID(), documentId: randomUUID(), title: "Fonte", revision: 1, markdown: "漢".repeat(30_000) };
    const history = Array.from({ length: 30 }, () => ({ question: "Pergunta", answer: { insufficientEvidence: true, blocks: [{ text: "a".repeat(6000), citations: [] }] } }));
    const question = "😀".repeat(2000);
    const context = prepareContext(question, chunkSource(source), history);
    expect(context.question).toBe(question);
    expect(context.historyOmitted).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(context.history))).toBeLessThanOrEqual(researchLimits.historyBytes);
    expect(Buffer.byteLength(context.prompt + JSON.stringify(context.schema))).toBeLessThanOrEqual(researchLimits.contextBytes);
    expect(context.chunks.length).toBeLessThanOrEqual(12);
  });
  it("rejects invented citations, changed quotes and unsourced factual blocks", async () => {
    const { conversation: chat } = await conversation(); const message = send(chat.id); const context = getMessageContext(message.id);
    expect(validateAnswer(answerFor(context), context).blocks).toHaveLength(1);
    const invented = answerFor(context); invented.blocks[0].citations[0].chunkId = "invented";
    expect(() => validateAnswer(invented, context)).toThrow("citação");
    const changed = answerFor(context); changed.blocks[0].citations[0].quote = "Uma informação inventada.";
    expect(() => validateAnswer(changed, context)).toThrow("citação");
    expect(() => validateAnswer({ insufficientEvidence: false, blocks: [{ text: "Afirmação", citations: [] }] }, context)).toThrow("evidências");
    expect(() => validateAnswer("not JSON", context)).toThrow("inválida");
  });
  it("answers missing evidence locally without calling Codex", async () => {
    const { conversation: chat } = await conversation(); const message = send(chat.id, "Qual o tamanho de Saturno?");
    const provider = { runStructured: vi.fn() }; await executeMessage(message.id, provider);
    expect(provider.runStructured).not.toHaveBeenCalled();
    expect(getMessage(message.id).answer).toEqual(noEvidenceAnswer);
  });
});

describe("research execution and recovery", () => {
  it("prevents duplicate sends and concurrent questions; stores exact context and only validated output", async () => {
    const { conversation: chat } = await conversation(); const input = { requestId: randomUUID(), question: "Aurora lançamento?" };
    const first = enqueueMessage(chat.id, input);
    expect(enqueueMessage(chat.id, input)).toEqual({ message: first.message, created: false });
    expect(() => enqueueMessage(chat.id, { ...input, question: "Changed" })).toThrow("Identificador");
    expect(() => send(chat.id)).toThrow("em andamento");
    const provider = providerFor(first.message.id); const context = getMessageContext(first.message.id);
    await executeMessage(first.message.id, provider);
    expect(provider.runStructured).toHaveBeenCalledWith(context.prompt, context.schema, expect.any(AbortSignal));
    expect(getMessage(first.message.id).status).toBe("completed");
    const next = send(chat.id, "Explique esse ponto");
    expect(getMessageContext(next.id).history).toHaveLength(1);
    expect(getMessageContext(next.id).chunks.length).toBeGreaterThan(0);
  });
  it.each(["timeout", "provider", "citation"])("handles %s failure with safe errors and permits an idempotent retry", async (failure) => {
    const { conversation: chat } = await conversation(); const message = send(chat.id);
    const provider = { runStructured: vi.fn(async () => {
      if (failure === "timeout") throw new Error("O especialista excedeu o limite de três minutos.");
      if (failure === "provider") throw new Error("SECRET diagnostic");
      return { insufficientEvidence: false, blocks: [{ text: "Bad", citations: [{ chunkId: "fake", quote: "invented" }] }] };
    }) };
    await executeMessage(message.id, provider);
    expect(getMessage(message.id).status).toBe("failed");
    expect(getMessage(message.id).answer).toBeNull();
    expect(getMessage(message.id).error).not.toContain("SECRET");
    const context = getMessageContext(message.id);
    expect(retryMessage(message.id, 1).created).toBe(true);
    expect(retryMessage(message.id, 1).created).toBe(false);
    expect(getMessageContext(message.id)).toEqual(context);
    await executeMessage(message.id, providerFor(message.id));
    expect(getMessage(message.id).status).toBe("completed");
  });
  it("disconnecting events does not cancel execution; explicit cancel prevents late output", async () => {
    const { conversation: chat } = await conversation(); const message = send(chat.id);
    let resolve!: (value: unknown) => void;
    const run = executeMessage(message.id, { runStructured: () => new Promise((done) => { resolve = done; }) });
    const stream = await events(new Request("http://localhost"), { params: Promise.resolve({ id: message.id }) });
    const reader = stream.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"running"');
    await reader.cancel();
    expect(getMessage(message.id).status).toBe("running");
    cancelMessage(message.id); resolve(answerFor(getMessageContext(message.id))); await run;
    expect(getMessage(message.id).status).toBe("cancelled");
    expect(getMessage(message.id).answer).toBeNull();
  });
  it("marks unfinished executions after restart without automatic resend", async () => {
    const { conversation: chat } = await conversation(); const message = send(chat.id);
    resetDatabaseForTests();
    expect(getMessage(message.id).status).toBe("interrupted");
    expect(retryMessage(message.id, 1).created).toBe(true);
    cancelMessage(message.id);
    updateConversation(chat.id, { archived: true, title: "Histórico preservado" });
    expect(listConversations()).toHaveLength(0);
    expect(listConversations(true)[0].title).toBe("Histórico preservado");
    expect(() => send(chat.id)).toThrow("Restaure");
  });
  it("backs up sources, history and citations, blocks active restore and supports old backups", async () => {
    const { conversation: chat } = await conversation(); const message = send(chat.id);
    const pendingBackup = exportBackup();
    expect(() => restoreBackup(pendingBackup)).toThrow("pesquisa em execução");
    await executeMessage(message.id, providerFor(message.id));
    const backup = exportBackup(); expect(backup.version).toBe(4);
    restoreBackup(backup);
    expect(getConversation(chat.id).messages[0].answer).not.toBeNull();
    expect(retrieveChunks(chat.id, "Aurora", [])).toHaveLength(1);
    const corrupted = structuredClone(backup); corrupted.tables.research_chunks[0].content = "tampered";
    expect(() => restoreBackup(corrupted)).toThrow("inconsistentes");
    restoreBackup(pendingBackup);
    expect(getMessage(message.id).status).toBe("interrupted");
    for (const version of [3, 2, 1]) {
      const old = structuredClone(backup);
      for (const key of ["research_messages", "research_chunks", "research_sources", "research_conversations"]) delete old.tables[key];
      if (version < 3) delete old.tables.library_documents;
      if (version < 2) delete old.tables.ai_records;
      restoreBackup({ ...old, version });
      expect(listConversations()).toEqual([]);
      expect((getDatabase().sqlite.prepare("SELECT COUNT(*) AS count FROM research_chunks_fts").get() as { count: number }).count).toBe(0);
    }
  });
});
