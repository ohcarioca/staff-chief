# Security and privacy

## Security objective

Staff Chief minimizes infrastructure and keeps the primary knowledge base on one workstation. It is intended for a trusted local user, not for hostile multi-user environments or internet deployment.

## Data locations

| Data                                                  | Location                                              | Persistence                     |
| ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| Notes, objects, relationships, analyses, and findings | `%LOCALAPPDATA%\StaffChief\staff-chief.db` by default | Persistent                      |
| SQLite WAL and shared-memory files                    | Same directory as the database while in use           | Runtime-managed                 |
| Pre-restore safety copies                             | `%LOCALAPPDATA%\StaffChief\backups\`                  | Persistent                      |
| Codex output schema and working directory             | Operating-system temporary directory                  | Deleted after each step         |
| Codex credentials                                     | Managed by the Codex CLI, outside Staff Chief         | Never read or copied by the app |

`STAFF_CHIEF_DATA_DIR` changes the application data directory.

## Implemented controls

### Local binding

Development and production scripts bind Next.js to `127.0.0.1:3000`. The application is not intended to listen on `0.0.0.0` or a LAN interface.

### Request validation

The Next.js proxy accepts only `127.0.0.1:3000` and `localhost:3000` host headers. For methods other than `GET`, `HEAD`, and `OPTIONS`, it also requires a matching local `Origin` header.

This reduces accidental network exposure and common cross-origin browser requests. It is not authentication and does not defend against malicious software already running as the same user, which can forge HTTP headers or read user-accessible files.

### Explicit AI consent

Preview generation is local. No Codex process starts until the user reviews the snapshot and confirms it. Submitted data is limited to the saved notes, objects, and relationships shown in that snapshot.

### Restricted execution context

Codex runs in an empty temporary directory with ephemeral execution and a read-only sandbox. The prompt explicitly prohibits tools, file reads, and web browsing. The temporary directory is deleted after completion, failure, timeout, or cancellation.

### Structured validation

Codex responses must satisfy both a JSON Schema and a Zod schema. Finding sources are intersected with IDs from the immutable submitted snapshot. Unsupported sources and unsourced findings are discarded.

### Local database safeguards

SQLite foreign keys are enabled and note/mention writes are transactional. Restore accepts only the versioned table set and allowlisted columns, creates a safety copy before changing logical table contents, and rebuilds the FTS index after success.

## Security limitations

- There is no app login or user isolation.
- The database is not encrypted by Staff Chief; protection depends on Windows account security, disk encryption, filesystem permissions, and device controls.
- A user or process with access to the Windows profile can read or alter the database.
- AI analysis sends confirmed content to the Codex service and is therefore not offline.
- Dependency installation and Codex authentication may access external services.
- Localhost and origin checks are defense-in-depth, not protection from a compromised workstation.
- The app has not been designed or audited for regulated data, shared terminals, remote access, or untrusted backup files.
- There is no automatic retention policy for notes, analyses, findings, exports, or safety copies.

## Company workstation checklist

Before storing company information:

1. Confirm that local storage of the information is allowed.
2. Confirm that the Codex workspace and account are approved for the data classification involved.
3. Verify that BitLocker or the organization's equivalent disk encryption is active.
4. Keep Windows, Node.js, pnpm, Codex CLI, and dependencies patched according to company policy.
5. Do not configure port forwarding, reverse proxies, tunnels, or firewall exceptions for the app.
6. Store exported backups only in approved locations.
7. Review the exact snapshot before each analysis submission. For research, confirm the fixed sources at conversation creation and review the Send notice for each question.
8. Stop the server when the application is not in use on a shared or unattended machine.

## Data minimization

- Prefer concise notes that contain the management context needed for the task.
- Avoid secrets, passwords, private keys, access tokens, and unnecessary personal data.
- Remove unrelated notes from the analysis preview.
- Archive stale records and manage backup retention outside the app.

## Telemetry

Staff Chief does not implement application telemetry, analytics, crash reporting, or cloud synchronization. This does not make guarantees about telemetry implemented by the operating system, browser, package manager, Codex CLI, or upstream services.

## Vulnerability reporting

See the repository-level [security policy](../SECURITY.md). Do not place secrets, sensitive notes, or exploit details in a public issue.


## Document library

Document conversion, indexing, reading and editing run locally and never call Codex. Imported Markdown is rendered with raw HTML disabled; images are replaced with placeholders and cannot trigger remote image requests. Only HTTP(S) and mail links are clickable, and external links open with opener isolation. DOCX conversion disables external file access and omits images. PDF text extraction does not execute document actions or use OCR.

The library retains only Markdown and metadata in the local database and version 4 backups. Original files are not preserved. Import limits are 20 MiB per file and 2 million converted characters. Research conversations explicitly confirm and capture all active notes and optional selected library documents once. Each Send authorizes the question, recent history and retrieved excerpts from those fixed sources. Importing a file itself is not AI submission authorization. See [Conversational research](CONVERSATIONAL_RESEARCH.md).
