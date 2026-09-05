# Conversational research

Research answers specific questions using all active notes plus optional selected library documents. The UI is **Pesquisa**; documents and conversations remain local, while each submitted question uses the authenticated Codex CLI when relevant excerpts are found.

## Start and resume a conversation

1. Open **Pesquisa** and choose **Nova conversa**.
2. All active notes are included automatically, without date/search filters or a note-count cap. Optionally select up to 20 library documents. The combined source content must fit within 5 million Markdown characters; an excess blocks creation explicitly rather than omitting notes.
3. Choose **Conferir fontes** and review titles and revisions. The local preview expires after 30 minutes.
4. Choose **Confirmar fontes e criar conversa**. This stores the exact previewed versions and makes no AI call.
5. Enter a specific question (up to 4,000 characters) and click **Enviar**.

Each **Enviar** authorizes the question, recent conversation history and retrieved excerpts from the confirmed notes and documents to be sent to Codex. Sources, including every active note, are confirmed once for the conversation. To use revised documents or a different selection, create a new conversation. Editing or archiving the original notes/documents does not alter existing conversations. Existing conversations retain their original sources; start a new conversation to include all current notes.

Conversations are saved automatically after submission. Rename them, archive them, or enable **Conversas arquivadas** to restore one. Unsaved question/title drafts require confirmation before navigation. Leaving the view does not cancel an ongoing answer. Reopening a conversation reconnects to its saved execution state.

## Sources and limitations

Source chips open preserved documents. Citation buttons open the exact excerpt and highlight its quoted evidence, with an option to read the complete preserved document. Document IDs and quote text are checked on the server before an answer is displayed. This verifies citation existence, not the correctness of every model inference.

The search uses local SQLite FTS5 over approximately 1,600-character chunks, with 200-character overlap and section/page labels. It ranks the current question first and also uses the two previous completed questions for follow-ups. Up to 12 relevant chunks are selected, with coverage across matching sources. Search is lexical: synonyms or vague questions may require rephrasing with document terms.

History includes only complete recent question/answer pairs, up to 16 KiB. The full prompt plus output schema is capped at 64 KiB in UTF-8; older history and lower-ranked chunks are removed before the question is ever cut. The UI indicates omitted history. Old assistant answers are context, never documentary evidence. No matching excerpts produces a local limitation response without calling Codex.

This version does not perform complete-document synthesis, OCR, web research, embeddings, or automatic source refresh. Excerpt-based answers must not be treated as exhaustive coverage.

## Execution and failure behavior

Only one response may run per conversation. A client request UUID prevents duplicate submission, including after network errors. Retry uses the expected attempt number and preserves the original submitted context; only the last unsuccessful question in an active conversation can be retried.

Progress is reported as queued, running, completed, failed, cancelled or interrupted. Text appears only after output and citations are validated. Invalid references reject the whole answer while retaining the question. Errors do not expose Codex stderr or private prompts. The existing three-minute Codex timeout applies.

**Cancelar resposta** aborts execution explicitly. Closing the event stream does not cancel the job. After server restart, unfinished messages become interrupted and require a manual retry. No restart or reconnection automatically sends another AI request.

## Storage and backup

- `research_conversations`: title, timestamps and archival state.
- `research_sources`: immutable Markdown, original source identity, title and revision; independent of the library row lifecycle.
- `research_chunks`: source-relative offsets, labels and text. `research_chunks_fts` is a derived index.
- `research_messages`: request UUID, question, status, exact submitted prompt/schema/history/excerpts, validated answer/citations, attempt and completion details.

Note sources use the identity `note:<original note ID>` in the existing `document_id` field, while library sources retain their UUID. Note snapshots use revision 1 within the conversation and are labeled as notes in the UI. This avoids collisions between entity tables and preserves compatibility with earlier document-only version 4 backups.

Version 4 backups contain these tables. Restore validates relationships, offsets, quoted evidence and stored context, reconstructs FTS, invalidates pending creation previews, and marks restored unfinished messages interrupted. Versions 1-3 restore an empty research history. Restoring while a research answer is queued/running is blocked until it completes or is cancelled.

## Local API

All routes inherit the local Host/Origin checks and run in Node.js.

| Method and path | Purpose |
| --- | --- |
| `POST /api/research/conversations/preview` | `{ documentIds }` (an empty array is allowed) produces a local expiring preview including all active notes |
| `GET /api/research/conversations?archived=true` | List archived conversations; default lists active ones |
| `POST /api/research/conversations` | `{ previewId }` confirms exact source versions |
| `GET /api/research/conversations/:id` | Sources metadata, messages and execution state |
| `PATCH /api/research/conversations/:id` | Optional `{ title, archived }` |
| `GET /api/research/conversations/:id/sources/:sourceId` | Full preserved source, scoped to its conversation |
| `POST /api/research/conversations/:id/messages` | `{ requestId, question }`; starts at most one job and returns 202 |
| `GET /api/research/messages/:id/events` | Reconnectable SSE with persisted message state |
| `POST /api/research/messages/:id/cancel` | Explicit cancellation |
| `POST /api/research/messages/:id/retry` | `{ attempt }`; manual, idempotent retry |

Validation uses status 400, missing records 404, and conflicting submissions or archived conversations 409. The answer contract contains `blocks: [{ text, citations: [{ chunkId, quote }] }]` and `insufficientEvidence`. Every factual block requires evidence; uncited blocks are reserved for limitation statements.
