# Local API reference

Staff Chief exposes a small HTTP API to its own browser interface. It is an internal, same-origin API rather than a public integration contract, and it may change with the application.

## Security requirements

All routes are served from `http://127.0.0.1:3000` or `http://localhost:3000`.

- Every request must use an allowed `Host` header.
- `POST` requests must include a matching local `Origin` header.
- There is no bearer token, session, or user account.
- The API must not be exposed through a proxy, tunnel, or non-loopback interface.
- JSON mutation bodies use `Content-Type: application/json`.

Validation errors normally return status `400` with a Brazilian Portuguese user-facing error:

```json
{
  "error": "Dados inválidos.",
  "details": []
}
```

## State and search

### `GET /api/state?q=<query>`

Returns the current `AppState`: metrics, active object types, active objects, matching active notes, active relationships, derived graph edges, recent analysis runs, and open priority findings.

The optional `q` value applies to note full-text search. The response uses `Cache-Control: no-store`.

## Notes and objects

### `POST /api/notes`

Creates or updates a note and returns its canonical record with resolved mention object IDs.

```json
{
  "id": "optional-existing-note-id",
  "title": "Optional title",
  "contentJson": {
    "type": "doc",
    "content": []
  }
}
```

`id` and `title` are optional. `title` is limited to 240 characters. Missing objects represented by valid temporary mention nodes are created in the same transaction.

### `POST /api/types`

Creates a custom object type.

```json
{
  "name": "Department",
  "icon": "D",
  "color": "#336699"
}
```

The name is limited to 60 characters, the icon to 8 characters, and color must be a six-digit hexadecimal value.

### `POST /api/objects/:id`

Updates an active object.

```json
{
  "name": "Leonardo",
  "description": "Optional description"
}
```

The name is limited to 120 characters and the description to 2,000 characters.

### `POST /api/relationships`

Creates a manual labeled relationship between two different objects.

```json
{
  "sourceObjectId": "object-a",
  "targetObjectId": "object-b",
  "label": "depends on"
}
```

The label is required and limited to 120 characters.

### `POST /api/archive`

Soft-deletes an active note, object, or object type.

```json
{
  "kind": "note",
  "id": "note-id"
}
```

`kind` is one of `note`, `object`, or `type`.

## Analysis

### `POST /api/analysis/preview`

Builds and returns a candidate snapshot locally, including `prepared` (preview ID, internal size status and notice). Accepts optional `analysisTypes` (default connections) and `mode` (`full` or `incremental`). This endpoint does not start Codex.

```json
{
  "scopeType": "collection",
  "scopeId": "general",
  "selectedNoteIds": ["note-1", "note-2"],
  "dateRange": {
    "start": "2026-09-01",
    "end": "2026-09-30"
  }
}
```

`scopeType` is `note`, `object`, or `collection`. Collection previews require one to 50 selected note IDs. `dateRange` is optional for item scopes and records the dashboard filter for collection scopes.

### `POST /api/analysis/run`

Uses the frozen `previewId` from preview, checks the selected subset and internal context limit, stores the snapshot, and starts one macro step. Returns status `202`. Preview context cannot be extended or have its lenses changed at execution time.

```json
{
  "scopeType": "collection",
  "scopeId": "selection",
  "previewId": "preview-id-from-previous-response",
  "selectedNoteIds": ["note-1", "note-2"],
  "dateRange": {
    "start": "2026-09-01",
    "end": "2026-09-30"
  },
  "analysisTypes": ["risks", "gaps"]
}
```

`selectedNoteIds` accepts one to 50 IDs. For item scopes, IDs are intersected with the candidate subgraph. For collection scopes, IDs are intersected with the active notes inside `dateRange`. `analysisTypes` is an optional non-empty subset of:

- `connections`
- `risks`
- `contradictions`
- `gaps`
- `follow_ups`

Set `analysisTypes` during preview. Omitting it selects connections. The frozen selection is authoritative at execution; no consolidation is added to new runs.

Response:

```json
{
  "runId": "analysis-id"
}
```

### `GET /api/analysis/:id/events`

Streams complete `AnalysisRunRecord` snapshots as Server-Sent Events approximately every 750 milliseconds until the run reaches a terminal state. Returns `404` for an unknown run.

### `POST /api/analysis/:id/cancel`

Aborts an analysis process that is active in the current server process.

```json
{
  "cancelled": true
}
```

`cancelled: false` means no active in-memory controller was found.

### `POST /api/analysis/:id/retry`

Retries the failed macro step, or failed specialists and consolidation for legacy runs. Returns status `202`. It rejects runs that do not exist or contain no failed step.

### `GET /api/findings/:id`

Returns the current canonical `FindingRecord` without caching, or `404` when unavailable. The UI uses its first two `sourceObjectIds` to preview the actual relationship pair, since an immutable historical report may contain different sources.

### `POST /api/findings/:id`

Changes a finding status:

```json
{
  "action": "status",
  "status": "resolved"
}
```

`status` is `open`, `resolved`, or `dismissed`.

To accept a supported connection and create a confirmed relationship:

```json
{
  "action": "accept"
}
```

Acceptance requires a connection finding with at least two valid object sources. The UI also sends optional `expectedObjectIds: [sourceId, targetId]` from the current finding preview. If that ordered pair has changed, acceptance fails before creating a relationship and the user must review the pair again. Existing clients omitting this field remain compatible.

## Backup

### `GET /api/backup`

Downloads a versioned JSON export with `Cache-Control: no-store` and an attachment filename based on the current date.

### `POST /api/restore`

Validates and restores a versioned JSON backup after creating a local safety copy. The request body is the backup document itself.

```json
{
  "ok": true,
  "safetyBackup": "C:\\...\\StaffChief\\backups\\before-restore-....db"
}
```

The browser interface requires confirmation before calling this endpoint. Direct API clients are responsible for their own explicit confirmation.


## Draft assistance and deepening

`POST /api/assistance` supports three actions:

- `{ action: "preview", operation: "improve" | "connections", title, noteId?, blocks: [{ id, text, protected }] }`: prepares a frozen context and returns `AiPreview`; no model call.
- `{ action: "deepen", findingId }`: prepares preserved evidence for optional deepening; no model call.
- `{ action: "execute", operation: "improve" | "connections" | "deepen", previewId, sourceIds? }`: executes the reviewed context and returns `{ changes, objects, findings }`. Sources can only be removed. Draft source remains included for connections.

Previews expire after 30 minutes. Oversized contexts, invalid sources, and duplicate in-flight executions are rejected. Draft edits do not save notes; accepted mention nodes go through `/api/notes` as before.
