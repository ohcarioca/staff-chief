# Troubleshooting

## The startup script cannot find a dependency

Check each required command in a new PowerShell window:

```powershell
node --version
pnpm --version
codex --version
```

Staff Chief requires Node.js 22 or newer. If a command was installed after the terminal opened, close and reopen PowerShell so the updated `PATH` is loaded.

## Port 3000 is already in use

Check which process owns the port:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess
```

Close the other Staff Chief or development-server process, then run `pnpm dev` or `pnpm start:local` again. Do not start multiple instances against the same SQLite database.

## The browser shows a forbidden response

Use exactly one of these addresses:

- `http://127.0.0.1:3000`
- `http://localhost:3000`

The application intentionally rejects other hosts and non-local mutation origins. Disable reverse proxies, tunnels, custom hostnames, and browser extensions that rewrite `Host` or `Origin` headers for this site.

## The application opens but data is missing

Confirm the active data directory:

- Default Windows path: `%LOCALAPPDATA%\StaffChief`
- Override: the current value of `STAFF_CHIEF_DATA_DIR`

Starting the app from terminals with different environment variables can create separate databases. Do not copy database files while a server process is using them.

## SQLite reports that the database is locked

Close duplicate Staff Chief processes and wait for the remaining process to finish its current write. If the problem persists, stop all instances, preserve copies of the database and its WAL/SHM files, and restart one instance.

Do not delete the database as a troubleshooting step.

## Search does not find a note

- Confirm that the note was saved manually.
- Clear the current search and date filter.
- Archived notes do not appear in active search results.
- After restore, reload the page; the FTS index is rebuilt during restore.

## A mention does not create an object

Temporary objects are committed only when the note is saved. Confirm that you selected a type and used the explicit create option in the mention menu, then save the note.

Names that differ only by case or accents reuse the same object within a type. This is expected behavior.

## Codex cannot start

Run `codex --version` and open the Codex CLI directly to confirm that it is installed and authenticated. If the executable is installed in a non-standard location, set `CODEX_BIN` to its full path before starting Staff Chief.

The app reports only a limited tail of Codex stderr. Run the CLI directly for authentication or installation diagnostics, but never paste company notes into an ad hoc diagnostic command.

## An analysis times out

Each specialist has a three-minute limit. A timeout marks that step as failed, continues later specialists, and may produce a partial report.

Reduce the selected notes or lenses and use the manual retry control for failed steps. Staff Chief does not retry automatically.

## An analysis is partial

Open the report and inspect the failed step. Successful step outputs remain available for consolidation or fallback. Use **Tentar falhas novamente** to rerun only failed specialists and consolidation.

## An analysis returns no findings

This may be a valid result. Findings without a valid source in the submitted snapshot are discarded. Review the snapshot, ensure the notes contain enough concrete context, and avoid asking the model to infer facts that are not present.

## Restore fails

- Confirm that the file is valid JSON created by Staff Chief.
- Confirm that its top-level `version` is supported.
- Do not modify table or column names manually.
- Check available disk space in the data directory.
- Preserve the automatic safety copy if one was created.

See [Backup and recovery](BACKUP_AND_RECOVERY.md) before attempting raw database recovery.

## Native dependency installation fails

`better-sqlite3` is a native dependency. Confirm that Node.js meets the required version, remove only the disposable dependency installation directory if necessary, and run:

```powershell
pnpm install
pnpm build
```

Do not remove `%LOCALAPPDATA%\StaffChief`; that directory contains personal application data.

## Collecting a safe diagnostic report

Include:

- operating-system version;
- Node.js and pnpm versions;
- the failing command;
- the relevant stack trace with paths and personal data redacted;
- whether a disposable `STAFF_CHIEF_DATA_DIR` reproduces the problem;
- the latest commit hash from `git rev-parse --short HEAD`.

Never attach the SQLite database, JSON backups, Codex credentials, note content, or company-sensitive paths to a public issue.
