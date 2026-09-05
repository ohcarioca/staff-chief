import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { getLibraryContext } from "@/lib/library/repository";
import { chunkSource, ftsQuery, inventoryCategory, inventoryChunks, prepareContext } from "./context";
import { conversationUpdateSchema, isPending, messageInputSchema, ResearchError, researchLimits,
  type ResearchAnswer, type ResearchChunk, type ResearchContext, type ResearchConversation,
  type ResearchConversationSummary, type ResearchMessage, type ResearchPreview, type ResearchSource, type ResearchStatus } from "./contracts";

const runtime = globalThis as unknown as { staffChiefResearchPreviews?: Map<string, { preview: ResearchPreview; sources: ResearchSource[]; databasePath: string }> };
const previews = runtime.staffChiefResearchPreviews ??= new Map();
const database = () => getDatabase().sqlite;
const conversationColumns = "id,title,created_at AS createdAt,updated_at AS updatedAt,archived_at AS archivedAt";
const sourceColumns = "id,document_id AS documentId,title,revision";
const messageColumns = `id,conversation_id AS conversationId,request_id AS requestId,question,status,answer_json AS answerJson,
  context_json AS contextJson,error,attempt,created_at AS createdAt,completed_at AS completedAt`;
type MessageRow = Omit<ResearchMessage, "answer" | "historyOmitted" | "chunks"> & { answerJson: string | null; contextJson: string };
function messageFromRow(row: MessageRow): ResearchMessage {
  const { answerJson, contextJson, ...message } = row;
  const context = JSON.parse(contextJson) as ResearchContext;
  return { ...message, answer: answerJson ? JSON.parse(answerJson) : null, historyOmitted: context.historyOmitted, chunks: context.chunks };
}

export function prepareConversation(documentIds: unknown, identity: string = randomUUID()): ResearchPreview {
  const ids = z.array(z.string().uuid()).max(researchLimits.documents).parse(documentIds);
  const documents = getLibraryContext([...new Set(ids)]);
  // Read every active note, independently of the workspace search/date filters.
  const notes = database().prepare("SELECT id,title,content_text,content_json FROM notes WHERE archived_at IS NULL ORDER BY created_at,id").all() as Array<{ id: string; title: string; content_text: string; content_json: string }>;
  const literal = (text: string) => text.replace(/([\\`*_{}\[\]<>()#+.!|>~-])/g, "\\$1");
  const mentions = (json: string) => {
    const labels = new Set<string>();
    const walk = (node: { type?: string; attrs?: { typeLabel?: string; label?: string }; content?: typeof node[] }) => {
      if (node.type === "mention" && node.attrs?.typeLabel && node.attrs.label) labels.add(`- ${literal(node.attrs.typeLabel)}: ${literal(node.attrs.label)}`);
      node.content?.forEach(walk);
    };
    walk(JSON.parse(json));
    return labels.size ? `## Menções estruturadas da nota\n\nClassificação das menções; não indica que estejam ativas ou em execução.\n\n${[...labels].join("\n")}\n\n## Conteúdo\n\n` : "";
  };
  const sources: ResearchSource[] = [
    ...documents.map((doc) => ({ id: randomUUID(), documentId: doc.id, title: doc.title, revision: doc.revision, markdown: doc.markdown })),
    ...notes.map((note) => ({ id: randomUUID(), documentId: `note:${note.id}`, title: `Nota: ${note.title || "Sem título"}`.slice(0, 240), revision: 1,
      markdown: `# ${literal(note.title || "Nota sem título")}\n\n${mentions(note.content_json)}${literal(note.content_text)}` })),
  ];
  if (!sources.length) throw new ResearchError("Crie uma nota ou selecione um documento para iniciar a pesquisa.");
  const characters = sources.reduce((sum, source) => sum + source.markdown.length, 0);
  if (characters > researchLimits.characters) throw new ResearchError("As notas e os documentos excedem 5 milhões de caracteres. Nenhuma fonte foi omitida. Reduza os documentos selecionados ou arquive notas que não precisam participar.");
  for (const [id, item] of previews) if (Date.parse(item.preview.expiresAt) <= Date.now()) previews.delete(id);
  if (previews.size >= 10) previews.delete(previews.keys().next().value!);
  const preview: ResearchPreview = { id: identity, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), characters,
    sources: sources.map(({ id, documentId, title, revision }) => ({ id, documentId, title, revision })) };
  previews.set(preview.id, { preview, sources, databasePath: getDatabase().path });
  return preview;
}

export function createConversation(documentIds: unknown, requestId: string): ResearchConversation {
  if (database().prepare("SELECT id FROM research_conversations WHERE id=?").get(requestId)) return getConversation(requestId);
  return confirmConversation(prepareConversation(documentIds, requestId).id);
}

export function confirmConversation(previewId: string): ResearchConversation {
  if (database().prepare("SELECT id FROM research_conversations WHERE id=?").get(previewId)) return getConversation(previewId);
  const prepared = previews.get(previewId);
  if (!prepared || prepared.databasePath !== getDatabase().path || Date.parse(prepared.preview.expiresAt) <= Date.now()) throw new ResearchError("A prévia expirou. Selecione e confira as fontes novamente.");
  return database().transaction(() => {
    const now = new Date().toISOString();
    database().prepare("INSERT INTO research_conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)")
      .run(previewId, `Pesquisa: ${prepared.sources[0].title}`.slice(0, 240), now, now);
    for (const source of prepared.sources) {
      database().prepare("INSERT INTO research_sources (id,conversation_id,document_id,title,revision,markdown) VALUES (?,?,?,?,?,?)")
        .run(source.id, previewId, source.documentId, source.title, source.revision, source.markdown);
      for (const chunk of chunkSource(source)) {
        database().prepare("INSERT INTO research_chunks (id,conversation_id,source_id,start_offset,end_offset,section,content) VALUES (?,?,?,?,?,?,?)")
          .run(chunk.id, previewId, source.id, chunk.start, chunk.end, chunk.section, chunk.content);
        database().prepare("INSERT INTO research_chunks_fts (chunk_id,title,section,content) VALUES (?,?,?,?)").run(chunk.id, source.title, chunk.section, chunk.content);
      }
    }
    previews.delete(previewId);
    return getConversation(previewId);
  })();
}

export function clearResearchPreviews() { previews.clear(); }
export function listConversations(archived = false): ResearchConversationSummary[] {
  return database().prepare(`SELECT ${conversationColumns} FROM research_conversations WHERE archived_at IS ${archived ? "NOT " : ""}NULL ORDER BY updated_at DESC, rowid DESC`).all() as ResearchConversationSummary[];
}
export function getConversation(id: string): ResearchConversation {
  const row = database().prepare(`SELECT ${conversationColumns} FROM research_conversations WHERE id=?`).get(id) as ResearchConversationSummary | undefined;
  if (!row) throw new ResearchError("Conversa não encontrada.", 404);
  const sources = database().prepare(`SELECT ${sourceColumns} FROM research_sources WHERE conversation_id=? ORDER BY rowid`).all(id) as ResearchSource[];
  const messages = (database().prepare(`SELECT ${messageColumns} FROM research_messages WHERE conversation_id=? ORDER BY rowid`).all(id) as MessageRow[]).map(messageFromRow);
  return { ...row, sources, messages };
}
export function updateConversation(id: string, input: unknown) {
  const update = conversationUpdateSchema.parse(input);
  const current = getConversation(id);
  if (update.archived && current.messages.some((message) => isPending(message.status))) throw new ResearchError("Aguarde ou cancele a resposta antes de arquivar.", 409);
  const now = new Date().toISOString();
  database().prepare("UPDATE research_conversations SET title=?,updated_at=?,archived_at=? WHERE id=?")
    .run(update.title ?? current.title, now, update.archived === undefined ? current.archivedAt : update.archived ? now : null, id);
  return getConversation(id);
}
export function getSource(conversationId: string, sourceId: string): ResearchSource {
  const source = database().prepare(`SELECT ${sourceColumns},markdown FROM research_sources WHERE conversation_id=? AND id=?`).get(conversationId, sourceId) as ResearchSource | undefined;
  if (!source) throw new ResearchError("Fonte não encontrada nesta conversa.", 404);
  return source;
}
export function getMessage(id: string): ResearchMessage {
  const row = database().prepare(`SELECT ${messageColumns} FROM research_messages WHERE id=?`).get(id) as MessageRow | undefined;
  if (!row) throw new ResearchError("Mensagem não encontrada.", 404);
  return messageFromRow(row);
}
export function getMessageContext(id: string): ResearchContext {
  const row = database().prepare("SELECT context_json FROM research_messages WHERE id=?").get(id) as { context_json: string } | undefined;
  if (!row) throw new ResearchError("Mensagem não encontrada.", 404);
  return JSON.parse(row.context_json);
}

export function retrieveChunks(conversationId: string, question: string, previousQuestions: string[]): ResearchChunk[] {
  const find = (query: string) => {
    const match = ftsQuery(query);
    if (!match) return [];
    return database().prepare(`SELECT c.id,c.source_id AS sourceId,s.document_id AS documentId,s.title,s.revision,
      c.start_offset AS start,c.end_offset AS end,c.section,c.content
      FROM research_chunks_fts f JOIN research_chunks c ON c.id=f.chunk_id JOIN research_sources s ON s.id=c.source_id
      WHERE research_chunks_fts MATCH ? AND c.conversation_id=? ORDER BY bm25(research_chunks_fts,0,2,2,1), c.id LIMIT 120`).all(match, conversationId) as ResearchChunk[];
  };
  const current = find(question);
  const category = inventoryCategory(question);
  if (category) {
    // Inventory needs broad coverage, including older snapshots without typed mentions.
    // Read only this conversation; never supplement it with today's live objects.
    const all = database().prepare(`SELECT c.id,c.source_id AS sourceId,s.document_id AS documentId,s.title,s.revision,
      c.start_offset AS start,c.end_offset AS end,c.section,c.content
      FROM research_chunks c JOIN research_sources s ON s.id=c.source_id WHERE c.conversation_id=? ORDER BY c.rowid`).all(conversationId) as ResearchChunk[];
    return inventoryChunks([...current, ...all.filter((chunk) => !current.some((item) => item.id === chunk.id))], category);
  }
  const previous = find(previousQuestions.slice(-2).join(" "));
  const ranked = [...current, ...previous.filter((chunk) => !current.some((item) => item.id === chunk.id))];
  // Reserve the first relevant hit per source, then fill with ranked detail.
  const diversified: ResearchChunk[] = [];
  for (const chunk of ranked) if (!diversified.some((item) => item.sourceId === chunk.sourceId)) diversified.push(chunk);
  return [...diversified, ...ranked.filter((chunk) => !diversified.includes(chunk))].slice(0, researchLimits.chunks);
}

export function enqueueMessage(conversationId: string, input: unknown): { message: ResearchMessage; created: boolean } {
  const parsed = messageInputSchema.parse(input);
  return database().transaction(() => {
    const existing = database().prepare("SELECT id,question FROM research_messages WHERE conversation_id=? AND request_id=?").get(conversationId, parsed.requestId) as { id: string; question: string } | undefined;
    if (existing) {
      if (existing.question !== parsed.question) throw new ResearchError("Identificador já utilizado por outra pergunta.", 409);
      return { message: getMessage(existing.id), created: false };
    }
    const conversation = getConversation(conversationId);
    if (conversation.archivedAt) throw new ResearchError("Restaure a conversa antes de enviar perguntas.", 409);
    if (conversation.messages.some((message) => isPending(message.status))) throw new ResearchError("Já existe uma resposta em andamento nesta conversa.", 409);
    const complete = conversation.messages.filter((message) => message.status === "completed" && message.answer);
    const ranked = retrieveChunks(conversationId, parsed.question, complete.slice(-2).map((message) => message.question));
    const context = prepareContext(parsed.question, ranked, complete.map((message) => ({ question: message.question, answer: message.answer! })));
    const id = randomUUID(); const now = new Date().toISOString();
    database().prepare("INSERT INTO research_messages (id,conversation_id,request_id,question,status,context_json,created_at) VALUES (?,?,?,?,'queued',?,?)")
      .run(id, conversationId, parsed.requestId, parsed.question, JSON.stringify(context), now);
    database().prepare("UPDATE research_conversations SET updated_at=? WHERE id=?").run(now, conversationId);
    return { message: getMessage(id), created: true };
  })();
}

export function finishMessage(id: string, status: ResearchStatus, answer: ResearchAnswer | null = null, error: string | null = null, attempt?: number) {
  const now = new Date().toISOString();
  database().prepare(`UPDATE research_messages SET status=?,answer_json=?,error=?,completed_at=?
    WHERE id=? AND status IN ('queued','running') ${attempt === undefined ? "" : "AND attempt=?"}`)
    .run(status, answer ? JSON.stringify(answer) : null, error, isPending(status) ? null : now, id, ...(attempt === undefined ? [] : [attempt]));
}
export function retryMessage(id: string, expectedAttempt: number) {
  return database().transaction(() => {
    const message = getMessage(id);
    if (message.attempt !== expectedAttempt || isPending(message.status)) return { message, created: false };
    const conversation = getConversation(message.conversationId);
    if (conversation.archivedAt || conversation.messages.at(-1)?.id !== id) throw new ResearchError("Só é possível repetir a última pergunta de uma conversa ativa.", 409);
    if (!["failed", "cancelled", "interrupted"].includes(message.status)) throw new ResearchError("Esta mensagem não precisa ser repetida.", 409);
    if (conversation.messages.some((item) => isPending(item.status))) throw new ResearchError("Já existe uma resposta em andamento.", 409);
    database().prepare("UPDATE research_messages SET status='queued',error=NULL,answer_json=NULL,completed_at=NULL,attempt=attempt+1 WHERE id=?").run(id);
    return { message: getMessage(id), created: true };
  })();
}
