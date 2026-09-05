# AI analysis

Staff Chief uses the locally installed Codex CLI as an explicit, user-initiated analysis provider. The application does not schedule analyses or retry failed work in the background.

## Current economical workflow

New runs use one `macro` step, without specialist fan-out or consolidation. The default lens is connections; users can enable the other lenses in the same call. Legacy reports remain readable and legacy failed steps can still be retried manually.

Local ranking combines text terms, existing objects, confirmed relationships and a reserved portion of candidates from other projects. The preview shows up to 20 notes as excerpts, their dates, object context and relevant historical finding titles/statuses. It does not promise exhaustive coverage. Collection candidates remain within the selected calendar-constrained set; note/object scopes may offer additional relevant notes as bridges. Users can remove candidates. No embeddings or AI-generated indexing summaries are used.

The server freezes previews for 30 minutes. Execution requires the returned preview ID and accepts only a subset of reviewed sources. Oversized contexts are rejected before starting the executor. Internal byte limits protect each operation from sending an unnecessarily broad context; they are implementation safeguards and are not shown as token or cost estimates.

Full review analyzes the selected context. Incremental review prioritizes changed notes and related history using saved version markers. A scope with no changes requests a full review instead of making another call. A note marker records the version of an included excerpt, not proof that every statement in the full note has been analyzed.

Each current finding has literal evidence quotes, impact, limitations, a priority justification, and qualitative evidence strength. Invalid evidence is rejected. Connection findings require two note sources. Quotation matching establishes textual provenance, not semantic correctness. Matching earlier findings reuse the canonical ID and lifecycle state; historical report occurrences retain their original text/evidence. Discarded findings are not automatically reopened.

## Draft assistance

Existing object-name suggestions run locally while typing. `Melhorar` prepares the selected text or current draft, then requires confirmation for one call. Results contain up to five block changes and five object suggestions. Protected blocks containing mentions or rich marks are not rewritten. Number changes are rejected; semantic changes still require user review. Accepted edits remain unsaved and can be undone. A changed draft invalidates pending suggestions.

`Buscar conexoes` is separate: it selects at most five related notes, shows their excerpts before confirmation, and returns at most three connections. `Aprofundar` uses preserved finding sources for one optional call and returns at most one expanded finding. Neither operation confirms relationships automatically.

Identical requests reuse a bounded server-session cache keyed by content, source versions, operation and configuration. Concurrent duplicate requests are rejected. Failed requests are not automatically retried. The product does not calculate or display token consumption; efficiency comes from local retrieval, compact excerpts, one macro call, incremental review and optional deepening.

See [AI evaluation](AI_EVALUATION.md) for read-only comparison of legacy/current reports and human quality ratings. Simulated integration tests do not establish model quality.

## Analysis lenses

The launcher lets the user select any non-empty combination of:

| Lens                          | Purpose                                                                     | Finding category |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------- |
| Connections and opportunities | Detect useful relationships, patterns, and concrete opportunities           | `connection`     |
| Risks                         | Identify fragile dependencies, delays, and management concerns              | `risk`           |
| Contradictions                | Find incompatible statements and direction changes that need reconciliation | `contradiction`  |
| Gaps                          | Identify missing context, ownership, criteria, decisions, or data           | `gap`            |
| Follow-ups                    | Propose specific next actions grounded in the notes                         | `follow_up`      |

All selected lenses share one macro call for new runs. The legacy pipeline has a consolidation step.

## Consent boundary

Opening the launcher does not start Codex. Requesting the preview builds a candidate subgraph locally and still does not start Codex.

The preview shows:

- the selected scope;
- the selected analysis lenses;
- every candidate note;
- the objects and confirmed relationships derived from those notes.

The user can remove notes from the snapshot. A maximum of 50 notes can be submitted. Codex starts only after the user activates the final confirmation control.

Unsaved editor content is not part of a snapshot. Save a note before analyzing it.

## Snapshot construction

For a note scope, Staff Chief includes the selected note, its mentioned objects, and active notes that directly share those objects.

For an object scope, Staff Chief includes the object, active notes that mention it, and the other objects mentioned by those notes.

For a dashboard collection scope, Staff Chief first restricts active notes by the dashboard calendar range. The user can analyze every note in that period or select a subset manually. The server reapplies both the date range and selected note IDs when it builds the final snapshot. If a period contains more than 50 notes, the user must narrow the period or use manual selection.

After the user selects notes, the final snapshot contains only:

- selected note IDs, titles, extracted text, timestamps, and object IDs;
- included object IDs, types, names, and descriptions;
- confirmed relationships whose endpoints are both included.

The snapshot is stored immutably with the run before execution.

Collection snapshots also store the calendar range used to assemble them.

## Codex CLI execution and legacy specialist compatibility

The shared provider uses the existing ephemeral, read-only CLI executor. Legacy specialist calls follow these steps:

1. Creates an empty temporary directory.
2. Writes a JSON Schema for the expected output.
3. Builds an English system prompt that requires Brazilian Portuguese user-facing results.
4. Starts the following command with the prompt on standard input:

   ```text
   codex exec --ephemeral --sandbox read-only --skip-git-repo-check --output-schema <schema-path> -
   ```

5. Reuses the authentication already maintained by the Codex CLI.
6. Applies a three-minute timeout to the step.
7. Parses the structured output with Zod.
8. Deletes the temporary directory.

The application does not copy, inspect, or persist Codex credentials. `CODEX_BIN` can override the CLI executable for testing or a custom installation.

## Output validation

In preserved legacy runs, each specialist may return up to 20 findings. The provider enforces:

- a known finding category;
- title, explanation, and suggested-action length limits;
- `low`, `medium`, or `high` priority;
- an integer confidence score from 0 to 100;
- source note and object ID arrays.

Specialist steps are forced to their assigned category. Source IDs not present in the submitted snapshot are removed, and findings with no valid source are discarded.

Legacy consolidation receives successful specialist outputs and the same snapshot. It deduplicates conclusions while preserving meaningful disagreements. If consolidation fails, Staff Chief applies a deterministic fallback deduplication to the successful specialist results.

## Progress and status

The browser receives run updates through Server-Sent Events. A run may become:

- `completed`: all selected steps and consolidation succeeded;
- `partial`: at least one step failed but a report could still be produced;
- `failed`: orchestration failed before a usable report was produced;
- `cancelled`: the user cancelled the active run.

A macro failure marks its single step failed. For legacy runs, a specialist failure does not stop later specialists. Manual retry repeats the failed macro step, or failed legacy specialists and consolidation. Staff Chief never retries automatically.

## Findings and knowledge changes

Findings are stored separately from notes and relationships. Resolving or dismissing a finding changes only its lifecycle state.

A connection finding can become a confirmed relationship only when it has at least two valid object sources and the user explicitly accepts it. No other finding mutates the knowledge base.

## Operational considerations

- Confirm that company policy permits sending the selected content to the Codex account used by the CLI.
- Treat descriptions and related notes as potentially sensitive because they may enter the snapshot.
- Review source links and confidence as aids, not guarantees of correctness.
- Do not expose the local application server to a network interface.
- Export a backup before high-value analysis or relationship cleanup work.
