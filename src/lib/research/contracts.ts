import { z } from "zod";

export const researchLimits = { documents: 20, characters: 5_000_000, question: 4000, chunk: 1600, overlap: 200, chunks: 12, historyBytes: 16 * 1024, contextBytes: 64 * 1024 } as const;
export const statusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled", "interrupted"]);
export type ResearchStatus = z.infer<typeof statusSchema>;
export const answerSchema = z.object({
  blocks: z.array(z.object({
    text: z.string().min(1).max(6000),
    citations: z.array(z.object({ chunkId: z.string(), quote: z.string().min(1).max(2400) }).strict()).max(12),
  }).strict()).min(1).max(12),
  insufficientEvidence: z.boolean(),
}).strict();
export type ResearchAnswer = z.infer<typeof answerSchema>;
export const answerJsonSchema = z.toJSONSchema(answerSchema);
export const messageInputSchema = z.object({ requestId: z.string().uuid(), question: z.string().trim().min(1).max(researchLimits.question) }).strict();
export const conversationUpdateSchema = z.object({ title: z.string().trim().min(1).max(240).optional(), archived: z.boolean().optional() }).strict();

export interface ResearchSourceSummary { id: string; documentId: string; title: string; revision: number }
/** Namespaced identities distinguish note snapshots from library document UUIDs. */
export function isNoteSource(source: Pick<ResearchSourceSummary, "documentId">) { return source.documentId.startsWith("note:"); }
export const researchSourceIdentitySchema = z.union([z.string().uuid(), z.string().startsWith("note:").min(6)]);
export interface ResearchSource extends ResearchSourceSummary { markdown: string }
export interface ResearchChunk { id: string; sourceId: string; documentId: string; title: string; revision: number; start: number; end: number; section: string; content: string }
export interface ResearchContext {
  question: string; chunks: ResearchChunk[]; history: Array<{ question: string; answer: ResearchAnswer }>;
  historyOmitted: number; prompt: string; schema: Record<string, unknown>;
}
export interface ResearchMessage {
  id: string; conversationId: string; requestId: string; question: string; status: ResearchStatus;
  answer: ResearchAnswer | null; error: string | null; createdAt: string; completedAt: string | null;
  attempt: number; historyOmitted: number; chunks: ResearchChunk[];
}
export interface ResearchConversationSummary { id: string; title: string; createdAt: string; updatedAt: string; archivedAt: string | null }
export interface ResearchConversation extends ResearchConversationSummary { sources: ResearchSourceSummary[]; messages: ResearchMessage[] }
export interface ResearchPreview { id: string; expiresAt: string; characters: number; sources: ResearchSourceSummary[] }
export function isPending(status: ResearchStatus) { return status === "queued" || status === "running"; }
export class ResearchError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
