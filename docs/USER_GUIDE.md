# User guide

Staff Chief is a personal management knowledge base. It turns notes into a navigable network of typed objects and lets you request evidence-linked AI reviews when you choose.

The current interface is in Brazilian Portuguese.

## Workspace layout

The application uses three persistent columns:

1. **Navigation sidebar:** dashboard, graph, notes, object types, backup actions, and the new-note command.
2. **Main workspace:** metrics, the graph, note lists, or object lists, depending on the active view.
3. **Inspector:** date filters, findings, the note editor, or details for the selected object.

The left sidebar can collapse to an icon rail. Drag the divider at the left edge of the inspector to resize the right column. Use the Left and Right arrow keys while the divider is focused for keyboard resizing; double-click it to restore the default width.

## Dashboard

The dashboard summarizes:

- active notes;
- active objects;
- open findings;
- pending follow-ups;
- notes without object links;
- knowledge-base connection health;
- recent analysis runs.

Use the calendar controls in the inspector to select all time, today, the last 7 days, the last 30 days, or a custom date range. The priority section and dashboard AI analysis follow the same filter.

Select **Analisar notas** in the priority header to analyze all notes updated during the active period or choose a manual subset. The flow is **Configurar → Conferir envio → Analisar → Resultados**. Select up to 50 candidate notes, then review the actual excerpts included by local preparation (up to 20 notes). Use **Voltar e editar** to change your choices and prepare a fresh preview. Only **Confirmar e analisar** sends content to Codex.

The complete editor at the bottom of the dashboard creates a new note without leaving the overview.

## Notes

Use **Nova nota** from the sidebar or note list to open a blank editor. A note supports:

- an optional title;
- bold, italic, and strikethrough text;
- level-two headings;
- bulleted and numbered lists;
- block quotes;
- undo and redo;
- structured object mentions.

Saving is manual. The application marks unsaved edits and asks for confirmation before navigation would discard them. Closing the browser with pending edits also triggers the browser's unsaved-change protection.

Archived notes disappear from active views but remain in backups and historical analysis snapshots.

## Mentions and objects

Type `@` in a note to open the mention workflow:

1. Select an object type, such as **Pessoa**, **Projeto**, or **Ideia**.
2. Search the existing objects in that type.
3. Select an existing object, or choose the explicit create option for a new name.
4. Save the note.

New objects and their note mentions are committed in the same SQLite transaction. Names are compared without case or accents inside the selected type, so `Leonardo`, `LEONARDO`, and `Léonardo` resolve to the same person object.

Mentions store object IDs. Renaming an object therefore preserves every reference to it.

## Custom object types

Use the plus button beside **Tipos de objeto** to define a type with a name, icon, and color. Selecting a type in the sidebar opens a list of its active objects in the main workspace. The inspector lets you rename an object, add a description, inspect related notes, and create labeled manual relationships.

Archiving a type or object hides it from active views. Historical records are retained.

## Knowledge graph

The 2D graph represents objects as nodes. It distinguishes three connection kinds:

- **Co-occurrence:** two objects appear in the same active note. This is derived evidence, not a confirmed relationship.
- **Confirmed relationship:** a manually created relationship or an AI suggestion explicitly accepted by the user.
- **Suggestion:** an open AI connection finding. Suggestions remain visually distinct until accepted.

The optional note layer adds notes to the graph. Use the graph controls to zoom and fit the network to the available space. Selecting an object opens its inspector.

## Search

The note search uses local SQLite FTS5 indexing over note titles and extracted plain text. Object lists use local filtering by object name and description.

Search does not call an external service.

## AI findings

Open findings appear in the priority panel and in analysis reports. Current findings include a category, justified priority, evidence strength, literal source excerpts, impact, limitations, and suggested action. Legacy confidence is retained internally, not shown as a calibrated probability.

Analysis can start from three scopes:

- a note and its directly connected context;
- an object and the notes that mention it;
- a dashboard collection containing all or selected notes from the active calendar period.

Available actions are:

- **Marcar como resolvido:** update tracking only; the recommended action remains yours to perform.
- **Descartar sugestão:** retain it in history but remove it from open priorities.
- **Criar vínculo no mapa:** review the displayed pair of objects, then create that relationship and resolve the finding.

The report shows pending suggestions in priority order, with the next step visible even when a card is closed. Expand **Entender esta sugestão** for the observation and impact; **Evidências e limites** contains preserved citations and available sources. Resolved and dismissed items appear separately. After opening a source, **Voltar à sugestão** returns to the selected result.

If live updates disconnect, **Reconectar acompanhamento** reads the existing run without starting another analysis. Failure, cancellation and partial results are distinct from a completed analysis without suggestions.

Findings never rewrite note content.

For the complete consent and execution model, see [AI analysis](AI_ANALYSIS.md).

## Backup

Use **Exportar backup** to download a versioned JSON export. Use **Restaurar base** to validate and restore a compatible export. Restore replaces the current logical database only after creating a local safety copy.

See [Backup and recovery](BACKUP_AND_RECOVERY.md) before restoring important data.


## Improve a draft and review connections economically

Object suggestions during typing are local and do not call the model. Accept an existing object to insert a mention, or ignore the suggestion. Ambiguous names can show more than one typed object.

Select text to limit the scope, then click **Melhorar**. Review the captured blocks and candidates; **Confirmar e enviar** starts the only model call. Apply or reject each suggestion. Saving is still separate, and **Desfazer** restores an accepted edit. Editing the draft while the request runs invalidates its suggestions. Blocks with existing mentions or rich marks are protected from rewriting.

**Buscar conexoes** is a separate operation for up to three connections to other notes. Review and remove candidate sources before confirming. These suggestions do not create confirmed relationships.

For broader review, **Analisar notas** starts with connections selected. All selected objectives share one call. Full review is the default; **Opções avançadas** offers review of changed notes and related history. Edit note selection in configuration, then inspect the frozen excerpts before confirming. **Pedir mais detalhes** prepares a separately confirmed call and uses the same next-step, explanation and evidence layout. Recurring findings preserve earlier resolved/dismissed decisions.


## Document library

Open **Biblioteca** in the sidebar and click **Importar arquivos**, or drop files into the upload area. Supported formats are TXT, MD, DOCX and PDF with extractable text. Each file may be up to 20 MB; converted content is limited to 2 million characters. Uploads run sequentially, with independent results so a failed file does not block the others. Import does not start Codex or send content outside the workstation.

Only converted Markdown and original-file metadata are stored. Keep original files separately. TXT accepts UTF-8 or BOM-marked UTF-16 and preserves literal text; Markdown retains its markup. DOCX preserves supported structure and tables. PDF text is grouped by page; layout and table extraction can differ from the original. OCR and password-protected PDFs are not supported. Conversion warnings appear above the reader.

Search the library by title or content. Open a document, choose **Editar Markdown**, correct the title or text, and click **Salvar**. **Visualizar** previews unsaved changes; **Baixar .md** downloads the saved version. Leaving with pending edits asks before discarding them. The editor detects conflicting revisions from another window. There is no revision history.

**Arquivar** removes a document from active results. Enable **Arquivados** to find it and use **Restaurar** to reactivate it. Reimporting identical bytes opens the existing document without overwriting edits, even if archived. Different content with the same filename creates a separate document.

Documents remain separate from notes and the map. Open **Pesquisa** to create a saved conversation containing all active notes and optional selected library documents. Existing conversations preserve their original sources; create a new conversation to include current notes. See [Conversational research](CONVERSATIONAL_RESEARCH.md) for consent, citations and execution details.
