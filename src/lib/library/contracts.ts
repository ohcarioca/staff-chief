import { z } from "zod";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_MARKDOWN_CHARACTERS = 2_000_000;
export const documentFormatSchema = z.enum(["txt", "md", "docx", "pdf"]);
export type DocumentFormat = z.infer<typeof documentFormatSchema>;

export const documentUpdateSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  markdown: z.string().max(MAX_MARKDOWN_CHARACTERS).refine((text) => text.trim().length > 0, "O documento está vazio.").optional(),
  archived: z.boolean().optional(),
  revision: z.number().int().positive(),
}).strict();

export const libraryBackupRowSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(240),
  original_name: z.string().min(1), original_format: documentFormatSchema,
  original_size: z.number().int().positive().max(MAX_FILE_BYTES),
  file_hash: z.string().regex(/^[a-f0-9]{64}$/),
  markdown: z.string().min(1).max(MAX_MARKDOWN_CHARACTERS), content_text: z.string(),
  warnings_json: z.string().refine((value) => {
    try { return z.array(z.string()).safeParse(JSON.parse(value)).success; } catch { return false; }
  }),
  revision: z.number().int().positive(), created_at: z.iso.datetime(), updated_at: z.iso.datetime(), archived_at: z.iso.datetime().nullable(),
}).strict();

export interface LibraryDocumentSummary {
  id: string;
  title: string;
  originalName: string;
  originalFormat: DocumentFormat;
  originalSize: number;
  warnings: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface LibraryDocument extends LibraryDocumentSummary {
  markdown: string;
}

export class LibraryError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
