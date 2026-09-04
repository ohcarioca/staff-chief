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

Use the calendar controls in the inspector to select all time, today, the last 7 days, the last 30 days, or a custom date range. The priority section follows the same filter.

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

Open findings appear in the priority panel and in analysis reports. A finding includes a category, priority, confidence score, explanation, suggested action, and source references.

Available actions are:

- **Resolve:** mark the finding as handled.
- **Dismiss:** retain it in history but remove it from open priorities.
- **Accept relationship:** for supported connection findings with at least two object sources, create a confirmed relationship and resolve the finding.

Findings never rewrite note content.

For the complete consent and execution model, see [AI analysis](AI_ANALYSIS.md).

## Backup

Use **Exportar backup** to download a versioned JSON export. Use **Restaurar base** to validate and restore a compatible export. Restore replaces the current logical database only after creating a local safety copy.

See [Backup and recovery](BACKUP_AND_RECOVERY.md) before restoring important data.
