# Staff Chief

Staff Chief is a local-first management knowledge base for capturing notes, connecting people, projects, ideas, and custom object types, and running deliberate AI-assisted reviews through the locally authenticated Codex CLI.

The application is designed for one person on one Windows workstation. It listens only on `127.0.0.1`, stores its database locally, performs no background analysis, and requires an explicit preview and confirmation before any note content is sent to Codex.

> **Project status:** MVP under active development. The user interface is in Brazilian Portuguese; source code and documentation are in English.

## What it does

- Provides a persistent three-column workspace with a collapsible navigation sidebar and a resizable inspector.
- Captures rich-text notes with headings, emphasis, lists, quotes, undo/redo, and structured `@` mentions.
- Creates or reuses typed objects from mentions while preventing case- and accent-insensitive duplicates within a type.
- Displays a 2D knowledge graph with co-occurrences, confirmed relationships, and pending AI suggestions.
- Lists objects by custom type and keeps references stable when objects are renamed.
- Searches notes locally with SQLite FTS5.
- Runs user-selected AI specialists for connections, risks, contradictions, gaps, and follow-ups.
- Preserves immutable analysis snapshots and source references without changing notes automatically.
- Exports and restores versioned JSON backups, with an automatic safety copy before restore.

## Privacy model

Staff Chief is local-first, not fully offline:

- The UI and SQLite database remain on the workstation.
- The server binds to `127.0.0.1:3000` and rejects unexpected `Host` and mutation `Origin` headers.
- No application login, cloud sync, telemetry, embeddings, or vector database is included.
- An AI analysis sends only the confirmed snapshot to the Codex service through the local Codex CLI session.
- The application never reads or stores Codex credentials.
- Analysis results do not alter notes or relationships unless the user explicitly accepts a suggested connection.

Read [Security and privacy](docs/SECURITY_AND_PRIVACY.md) before using the application with company information.

## Requirements

- Windows 10 or 11
- Node.js 22 or newer
- pnpm
- Codex CLI installed and authenticated for AI analysis

The core note-taking features work without starting an analysis, but the startup helper currently validates that the Codex CLI is available.

## Quick start

```powershell
git clone https://github.com/ohcarioca/staff-chief.git
Set-Location staff-chief
pnpm install
pnpm build
pnpm start:local
```

The PowerShell helper validates the runtime, prepares the application when needed, opens the browser, and starts the server at [http://127.0.0.1:3000](http://127.0.0.1:3000).

For development:

```powershell
pnpm install
pnpm dev
```

## Local data

The default database path is:

```text
%LOCALAPPDATA%\StaffChief\staff-chief.db
```

Set `STAFF_CHIEF_DATA_DIR` before starting the app to use a different data directory. Tests already use isolated temporary directories and do not touch the personal database.

Use the sidebar actions to export or restore a backup. See [Backup and recovery](docs/BACKUP_AND_RECOVERY.md) for the format, safeguards, and recovery procedure.

## AI analysis flow

1. Select a note or object and choose one or more analysis lenses.
2. Review the locally assembled subgraph and select up to 50 notes.
3. Confirm the exact context to send.
4. Staff Chief runs the selected specialists sequentially, followed by consolidation.
5. Structured outputs are validated against the immutable snapshot before they are stored.
6. Review, resolve, dismiss, or explicitly accept supported connection findings.

No Codex process starts before step 3. See [AI analysis](docs/AI_ANALYSIS.md) for execution details and failure behavior.

## Technology

| Area        | Implementation                                               |
| ----------- | ------------------------------------------------------------ |
| Application | Next.js App Router, React, TypeScript                        |
| Editor      | TipTap                                                       |
| Graph       | `react-force-graph-2d`                                       |
| Storage     | SQLite via `better-sqlite3`, with Drizzle schema definitions |
| Search      | SQLite FTS5                                                  |
| Validation  | Zod                                                          |
| AI provider | Codex CLI through an internal provider contract              |
| Tests       | Vitest and Testing Library                                   |

## Quality checks

Run the complete local verification set before submitting changes:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Documentation

- [Documentation index](docs/README.md)
- [User guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Local API reference](docs/API.md)
- [Data model](docs/DATA_MODEL.md)
- [AI analysis](docs/AI_ANALYSIS.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Backup and recovery](docs/BACKUP_AND_RECOVERY.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Scope

The MVP intentionally excludes authentication, remote hosting, cloud synchronization, database merging, attachments, calendar integration, notifications, external imports, embeddings, and autonomous background actions.

## License

No license has been selected yet. Public availability of the source code does not grant reuse, modification, or redistribution rights. Add an explicit license before accepting external code distribution or reuse.
