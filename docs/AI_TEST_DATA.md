# AI test dataset

Staff Chief includes an optional synthetic dataset for evaluating AI analysis without mixing test content into the personal database. The dataset is stored under `.local-data/ai-test`, which is ignored by Git.

The notes are written in Brazilian Portuguese because they represent user-visible knowledge. Script names, source code, console output, and this documentation remain in English.

## Safety properties

- The seed command never uses the default `%LOCALAPPDATA%\StaffChief` directory.
- The command refuses to run when the isolated test database already exists; it never merges with or overwrites an existing database.
- Seeding creates notes, objects, mentions, and confirmed relationships locally. It does not invoke Codex or make an external request.
- Starting an AI analysis still requires the normal preview and explicit confirmation. Confirming it sends the selected synthetic snapshot through the authenticated Codex CLI.
- All people, companies, projects, amounts, and events in the dataset are fictional test fixtures.

## Create and open the dataset

Install dependencies, generate the isolated database, and start the application in test mode:

```powershell
pnpm install
pnpm seed:ai
pnpm dev:ai
```

`pnpm dev:ai` generates the dataset automatically when it is missing, sets `STAFF_CHIEF_DATA_DIR` only for that process, opens the browser, and runs the development server on `127.0.0.1:3000`.

To create the dataset in another isolated location, set `STAFF_CHIEF_AI_TEST_DATA_DIR` before running the seed command:

```powershell
$env:STAFF_CHIEF_AI_TEST_DATA_DIR = "C:\StaffChief-TestData"
pnpm seed:ai
```

Move or remove only the isolated test directory before regenerating a clean dataset. Never point the seed command at a directory containing personal data.

## Scenarios and expected signals

Select the project object as the analysis scope. Every note in that scenario mentions the same project, which keeps each test set self-contained.

| Scope                | Notes | Purpose               | Expected high-value signals                                                                                                                      |
| -------------------- | ----: | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Projeto Atlas`      |     5 | Delivery readiness    | October 1 versus October 15 date contradiction; unsigned supplier dependency; impossible supplier lead time; 62% versus 90% data gap; pilot opportunity; named follow-up. |
| `Projeto Horizonte`  |     5 | Workforce capacity    | Six versus three hires and R$ 480k versus R$ 240k contradiction; missing recruiting inputs and owners; overtime and vacation risk; Recife rotation opportunity; capacity follow-up. |
| `Projeto Enterprise` |     5 | Commercial decision   | R$ 99/minimum 200 versus R$ 79/no minimum contradiction; margin below target; DPA and security gaps; unclear decision authority; onboarding opportunity; executive follow-up. |
| `Projeto Aurora`     |     4 | False-positive control | Consistent owner, cadence, dates, target, result, evidence, dependencies, and next action. The model should avoid inventing material risks or contradictions. |

The database also includes the custom object types `Fornecedor`, `Decisão`, `Métrica`, `Cliente`, and `Local`. This verifies that custom types appear in mentions, filters, object lists, and the graph.

## Suggested evaluation procedure

1. Open a project from the object-type list.
2. Select **Análise IA** and enable all available analysis lenses.
3. Confirm that the preview contains only the intended scenario notes and related objects.
4. Confirm the analysis and wait for consolidation.
5. Compare each finding with the expected signals above.
6. Check that every finding cites only notes or objects from the preview snapshot.
7. Confirm that suggestions do not change notes or relationships until explicitly accepted.
8. Run the same analysis on `Projeto Aurora` and record any unsupported risk, contradiction, or gap as a false positive.

Useful quality measures are:

- **Recall:** how many expected signals were identified.
- **Precision:** how many findings are directly supported by the supplied notes.
- **Source validity:** whether every cited source belongs to the immutable snapshot.
- **Actionability:** whether follow-ups name a concrete action, owner, and useful timing when the notes support them.
- **Restraint:** whether the control scenario avoids unsupported findings.

Model outputs can vary between runs. Treat the expected signals as an evaluation guide, not as exact required wording.
