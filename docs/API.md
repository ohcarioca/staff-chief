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

Builds and returns a candidate snapshot locally. This endpoint does not start Codex.

```json
{
  "scopeType": "note",
  "scopeId": "note-id"
}
```

`scopeType` is `note` or `object`.

### `POST /api/analysis/run`

Rebuilds the final snapshot from the allowed note selection, stores the run, schedules the selected specialists, and returns status `202`.

```json
{
  "scopeType": "note",
  "scopeId": "note-id",
  "selectedNoteIds": ["note-id"],
  "analysisTypes": ["risks", "gaps"]
}
```

`selectedNoteIds` accepts at most 50 IDs and is intersected with the candidate subgraph. `analysisTypes` is an optional non-empty subset of:

- `connections`
- `risks`
- `contradictions`
- `gaps`
- `follow_ups`

Omitting `analysisTypes` runs every specialist. Consolidation is always added.

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

Queues failed specialists and consolidation for a manual retry. Returns status `202`. It rejects runs that do not exist or contain no failed step.

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

Acceptance requires a connection finding with at least two valid object sources.

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
