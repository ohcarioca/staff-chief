import { z } from "zod";
import { answerJsonSchema, answerSchema, researchLimits, researchSourceIdentitySchema, statusSchema, type ResearchContext } from "./contracts";
import { contextPrompt, validateAnswer } from "./context";

export const researchBackupTables = ["research_conversations", "research_sources", "research_chunks", "research_messages"] as const;
export const researchBackupColumns = {
  research_conversations: ["id", "title", "created_at", "updated_at", "archived_at"],
  research_sources: ["id", "conversation_id", "document_id", "title", "revision", "markdown"],
  research_chunks: ["id", "conversation_id", "source_id", "start_offset", "end_offset", "section", "content"],
  research_messages: ["id", "conversation_id", "request_id", "question", "status", "context_json", "answer_json", "error", "attempt", "created_at", "completed_at"],
} as const;
const uuid = z.string().uuid();
const title = z.string().min(1).max(240);
const date = z.iso.datetime();
const sourceSchema = z.object({ id: uuid, conversation_id: uuid, document_id: researchSourceIdentitySchema, title, revision: z.number().int().positive(), markdown: z.string().min(1).max(researchLimits.characters) }).strict();
const conversationSchema = z.object({ id: uuid, title, created_at: date, updated_at: date, archived_at: date.nullable() }).strict();
const chunkSchema = z.object({ id: z.string(), conversation_id: uuid, source_id: uuid, start_offset: z.number().int().nonnegative(), end_offset: z.number().int().positive(), section: z.string(), content: z.string().max(1600) }).strict();
const contextChunk = z.object({ id: z.string(), sourceId: uuid, documentId: researchSourceIdentitySchema, title, revision: z.number().int().positive(), start: z.number().int().nonnegative(), end: z.number().int().positive(), section: z.string(), content: z.string().max(1600) }).strict();
const contextSchema = z.object({ question: z.string().min(1).max(4000), chunks: z.array(contextChunk).max(12), history: z.array(z.object({ question: z.string().min(1).max(4000), answer: answerSchema }).strict()), historyOmitted: z.number().int().nonnegative(), prompt: z.string(), schema: z.record(z.string(), z.unknown()) }).strict();
const messageSchema = z.object({ id: uuid, conversation_id: uuid, request_id: uuid, question: z.string().min(1).max(4000), status: statusSchema, context_json: z.string(), answer_json: z.string().nullable(), error: z.string().nullable(), attempt: z.number().int().positive(), created_at: date, completed_at: date.nullable() }).strict();

export function validateResearchBackup(tables: Record<string, unknown[] | undefined>) {
  const conversations = z.array(conversationSchema).parse(tables.research_conversations);
  const sources = z.array(sourceSchema).parse(tables.research_sources);
  const chunks = z.array(chunkSchema).parse(tables.research_chunks);
  const messages = z.array(messageSchema).parse(tables.research_messages);
  const conversationIds = new Set(conversations.map((item) => item.id));
  const sourceMap = new Map(sources.map((item) => [item.id, item]));
  const chunkMap = new Map(chunks.map((item) => [item.id, item]));
  const invalid = () => { throw new Error("Backup inválido: fontes ou contexto de pesquisa inconsistentes."); };
  for (const conversation of conversations) {
    const selected = sources.filter((source) => source.conversation_id === conversation.id);
    if (!selected.length || selected.filter((source) => !source.document_id.startsWith("note:")).length > researchLimits.documents || selected.reduce((sum, source) => sum + source.markdown.length, 0) > researchLimits.characters) invalid();
  }
  for (const source of sources) if (!conversationIds.has(source.conversation_id)) invalid();
  for (const chunk of chunks) {
    const source = sourceMap.get(chunk.source_id);
    if (!source || source.conversation_id !== chunk.conversation_id || chunk.end_offset <= chunk.start_offset || source.markdown.slice(chunk.start_offset, chunk.end_offset) !== chunk.content || chunk.id !== `${source.id}:${chunk.start_offset}`) invalid();
  }
  for (const message of messages) {
    if (!conversationIds.has(message.conversation_id)) invalid();
    const context = contextSchema.parse(JSON.parse(message.context_json)) as ResearchContext;
    if (context.question !== message.question || context.prompt !== contextPrompt(context) || JSON.stringify(context.schema) !== JSON.stringify(answerJsonSchema)
      || Buffer.byteLength(context.prompt + JSON.stringify(context.schema)) > researchLimits.contextBytes || Buffer.byteLength(JSON.stringify(context.history)) > researchLimits.historyBytes) invalid();
    for (const chunk of context.chunks) {
      const original = chunkMap.get(chunk.id); const source = sourceMap.get(chunk.sourceId);
      if (!original || !source || original.conversation_id !== message.conversation_id || original.source_id !== chunk.sourceId || original.content !== chunk.content
        || original.start_offset !== chunk.start || original.end_offset !== chunk.end || original.section !== chunk.section || source.document_id !== chunk.documentId || source.title !== chunk.title || source.revision !== chunk.revision) invalid();
    }
    if (message.answer_json) validateAnswer(JSON.parse(message.answer_json), context);
    if ((message.status === "completed") !== !!message.answer_json) invalid();
  }
}
