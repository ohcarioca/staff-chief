# AI analysis

Staff Chief uses the locally installed Codex CLI as an explicit, user-initiated analysis provider. The application does not schedule analyses or retry failed work in the background.

## Analysis lenses

The launcher lets the user select any non-empty combination of:

| Lens                          | Purpose                                                                     | Finding category |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------- |
| Connections and opportunities | Detect useful relationships, patterns, and concrete opportunities           | `connection`     |
| Risks                         | Identify fragile dependencies, delays, and management concerns              | `risk`           |
| Contradictions                | Find incompatible statements and direction changes that need reconciliation | `contradiction`  |
| Gaps                          | Identify missing context, ownership, criteria, decisions, or data           | `gap`            |
| Follow-ups                    | Propose specific next actions grounded in the notes                         | `follow_up`      |

A consolidation step always follows the selected specialists.

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

After the user selects notes, the final snapshot contains only:

- selected note IDs, titles, extracted text, timestamps, and object IDs;
- included object IDs, types, names, and descriptions;
- confirmed relationships whose endpoints are both included.

The snapshot is stored immutably with the run before execution.

## Codex CLI execution

For every step, the provider:

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

Each specialist may return up to 20 findings. The provider enforces:

- a known finding category;
- title, explanation, and suggested-action length limits;
- `low`, `medium`, or `high` priority;
- an integer confidence score from 0 to 100;
- source note and object ID arrays.

Specialist steps are forced to their assigned category. Source IDs not present in the submitted snapshot are removed, and findings with no valid source are discarded.

Consolidation receives successful specialist outputs and the same snapshot. It deduplicates conclusions while preserving meaningful disagreements. If consolidation fails, Staff Chief applies a deterministic fallback deduplication to the successful specialist results.

## Progress and status

The browser receives run updates through Server-Sent Events. A run may become:

- `completed`: all selected steps and consolidation succeeded;
- `partial`: at least one step failed but a report could still be produced;
- `failed`: orchestration failed before a usable report was produced;
- `cancelled`: the user cancelled the active run.

A specialist failure does not stop later specialists. Manual retry repeats only failed specialists and consolidation. Staff Chief never retries automatically.

## Findings and knowledge changes

Findings are stored separately from notes and relationships. Resolving or dismissing a finding changes only its lifecycle state.

A connection finding can become a confirmed relationship only when it has at least two valid object sources and the user explicitly accepts it. No other finding mutates the knowledge base.

## Operational considerations

- Confirm that company policy permits sending the selected content to the Codex account used by the CLI.
- Treat descriptions and related notes as potentially sensitive because they may enter the snapshot.
- Review source links and confidence as aids, not guarantees of correctness.
- Do not expose the local application server to a network interface.
- Export a backup before high-value analysis or relationship cleanup work.
