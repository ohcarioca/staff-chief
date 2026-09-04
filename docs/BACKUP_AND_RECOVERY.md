# Backup and recovery

Staff Chief supports complete, versioned JSON exports and validated restore operations from the sidebar.

## What an export contains

An export contains all rows from the primary application tables, including:

- active and archived object types;
- active and archived objects;
- notes and structured mentions;
- relationships;
- analysis runs and step outputs;
- findings and source references.

The derived FTS5 index is omitted because it can be rebuilt from note data. Codex credentials and application dependencies are never included.

The downloaded filename follows this pattern:

```text
staff-chief-backup-YYYY-MM-DD.json
```

## Export procedure

1. Open Staff Chief.
2. Select **Exportar backup** in the sidebar.
3. Store the JSON file in an organization-approved location.
4. Verify that the file is non-empty and begins with a supported `version` value.

Export before restoring another database, upgrading across significant schema changes, or performing high-value cleanup work.

## Restore behavior

Restore is destructive to the current logical dataset, so the UI requires confirmation. The server then:

1. Validates the backup version, exact table set, value types, and allowlisted columns.
2. Checkpoints the SQLite WAL.
3. Copies the current database into the local `backups` directory.
4. Replaces primary table contents in a transaction.
5. Rebuilds `notes_fts` from restored notes.
6. Returns the safety-copy path to the UI.

If a database transaction fails, SQLite rolls back the table replacement. The safety copy remains available.

## Restore procedure

1. Export the current database and keep that JSON file separately.
2. Select **Restaurar base**.
3. Choose a Staff Chief JSON backup with a supported version.
4. Read the confirmation carefully and continue.
5. Record the safety-copy path displayed after success.
6. Verify note counts, object types, a sample note, graph relationships, and analysis history.

Do not edit backup JSON manually unless you understand the schema and have an untouched copy.

## Safety copies

Before restore, Staff Chief creates a file similar to:

```text
%LOCALAPPDATA%\StaffChief\backups\before-restore-2026-09-04T12-30-00.000Z.db
```

Safety copies are not pruned automatically. Review their retention periodically and delete them only according to your data-handling policy.

## Recovering from a safety copy

The application UI restores JSON exports, not raw `.db` files. To recover a safety-copy database:

1. Stop every Staff Chief server process.
2. Make an additional copy of the current `staff-chief.db` and any adjacent `staff-chief.db-wal` or `staff-chief.db-shm` files.
3. Copy the selected safety `.db` file over `staff-chief.db` in the configured data directory.
4. Remove stale WAL and shared-memory files only after confirming no Staff Chief process is running.
5. Start Staff Chief and verify the data.
6. Export a fresh JSON backup after successful recovery.

If company data is involved, ask the appropriate IT or data-recovery team to perform raw database replacement.

## Compatibility

The current export format is version `1`. Restore rejects other versions. Future schema changes must either preserve version 1 compatibility or introduce an explicit migration path and new format version.

## Backup strategy

For important data, keep multiple dated exports and follow the 3-2-1 principle within the limits of company policy: three copies, on two approved storage types, with one approved off-device copy. Staff Chief itself does not schedule or synchronize backups.
