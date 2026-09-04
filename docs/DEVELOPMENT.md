# Development guide

## Prerequisites

- Windows with PowerShell
- Node.js 22 or newer
- pnpm 11 or compatible
- Codex CLI for real analysis runs

Check the environment:

```powershell
node --version
pnpm --version
codex --version
```

## Install and run

```powershell
pnpm install
pnpm dev
```

The development server listens on `http://127.0.0.1:3000`.

For a production-mode local run:

```powershell
pnpm build
pnpm start
```

Or use the Windows helper:

```powershell
pnpm start:local
```

## Environment variables

| Variable               | Purpose                                             | Default                                                           |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `STAFF_CHIEF_DATA_DIR` | Overrides the directory containing `staff-chief.db` | `%LOCALAPPDATA%\StaffChief` on Windows; `~/.staff-chief` fallback |
| `CODEX_BIN`            | Overrides the executable used by `CodexCliProvider` | `codex`                                                           |

Do not commit `.env` files. They are ignored by Git.

For manual development with disposable data:

```powershell
$env:STAFF_CHIEF_DATA_DIR = Join-Path $env:TEMP "staff-chief-dev"
pnpm dev
```

Use a task-specific directory and never point tests or experiments at the personal production database.

## Project structure

```text
src/
  app/                  Next.js pages, route handlers, styles, and metadata
  components/           Interactive workspace, editor, graph, and dialogs
  lib/
    analysis/           Provider contract, Codex CLI provider, and pipeline
    db/                 SQLite initialization, schema definitions, repository
    api.ts              Shared API error mapping
    contracts.ts        Shared application records and state contracts
  proxy.ts              Local Host and Origin validation
scripts/
  start-local.ps1       Windows startup helper
docs/                   User, architecture, security, and operations guides
```

## Language convention

- Source identifiers, comments, tests, scripts, prompts, commit messages, and documentation must be in English.
- User-facing application copy must be in Brazilian Portuguese (`pt-BR`).
- AI prompt instructions are written in English but require Brazilian Portuguese output fields intended for the user.
- Domain values that are persisted or exchanged programmatically use stable English identifiers, such as `follow_up` and `consolidation`.
- Portuguese seed labels and UI fixtures are allowed only when they represent displayed product content.

When adding UI copy, keep business logic independent from the wording. If more interface languages are introduced, migrate display strings to a dedicated localization layer instead of mixing locales in components.

## Database changes

Database initialization currently lives in `src/lib/db/client.ts`; Drizzle declarations live in `src/lib/db/schema.ts`. Keep both representations synchronized.

Before changing the schema:

1. Design backward compatibility for existing local databases.
2. Update initialization or add an explicit migration mechanism.
3. Update the Drizzle schema.
4. Update backup validation and format version when required.
5. Add integration tests for a populated pre-change database.
6. Update [Data model](DATA_MODEL.md) and [Backup and recovery](BACKUP_AND_RECOVERY.md).

Never solve a development problem by deleting the user's database.

## API and mutation rules

- Validate request bodies with Zod at route boundaries.
- Keep SQL and transactions in the repository layer.
- Use parameter binding for values and allowlists for any dynamic identifier.
- Return user-safe errors; do not expose credentials, prompts, stack traces, or full Codex stderr.
- Preserve explicit confirmation before external AI execution.
- Do not add background retries or automatic knowledge mutations.

## UI rules

- Preserve the three-column desktop model.
- Provide keyboard access and visible focus for interactive controls.
- Guard unsaved notes before navigation or archival can discard edits.
- Treat graph edges according to their provenance: derived, confirmed, or suggested.
- Keep the right inspector usable at its minimum supported width.
- Do not replace manual save with silent background persistence without a product decision.

## Test commands

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests cover name normalization, TipTap text extraction, transactional mention creation, object reuse, FTS search, subgraph construction, backup/restore, archival, immutable analysis snapshots, selective specialists, structured provider output, invalid JSON, timeout, cancellation, and analysis preview cleanup.

## Manual verification

After a UI or workflow change, verify at minimum:

1. Dashboard loads without browser console errors.
2. The sidebar expands and collapses.
3. The inspector resizes with pointer and keyboard.
4. A note can mention a new object and reuse it in another note.
5. Object type pages show lists; the map shows the graph.
6. The AI launcher can select a scope and a subset of lenses.
7. Preview does not start an analysis.
8. Closing preview does not modify data.
9. Host and Origin restrictions still reject external requests.

Do not confirm a real AI run during routine visual verification unless the test explicitly requires it and approved test data is used.
