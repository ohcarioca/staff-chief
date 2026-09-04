# Contributing to Staff Chief

Thank you for helping improve Staff Chief. The project is an early local-first MVP, so contributions should preserve its narrow security and product boundaries.

## Before contributing

- Search existing issues and pull requests.
- Open an issue before a large architectural, schema, security-boundary, or product-scope change.
- Do not include real notes, databases, exports, credentials, or company information in issues, tests, screenshots, or commits.
- Read [Architecture](docs/ARCHITECTURE.md), [Development guide](docs/DEVELOPMENT.md), and [Security and privacy](docs/SECURITY_AND_PRIVACY.md).

## Development workflow

1. Fork or branch from the latest `main`.
2. Install dependencies with `pnpm install`.
3. Use a disposable `STAFF_CHIEF_DATA_DIR` for manual testing.
4. Make focused changes with tests.
5. Run the full verification suite.
6. Update documentation when behavior, storage, security, or operations change.
7. Submit a pull request with the problem, approach, risks, and verification evidence.

## Required checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

UI changes should also be verified in a real browser at the supported desktop layout. Include a sanitized screenshot when it materially helps review.

## Language policy

- Write source identifiers, comments, tests, scripts, prompts, commit messages, and documentation in English.
- Write user-facing interface copy in Brazilian Portuguese (`pt-BR`).
- Keep persisted enums, API fields, and programmatic identifiers in English.
- English prompts may instruct the AI to produce Brazilian Portuguese fields displayed to the user.
- Do not mix Portuguese into internal names as a shortcut for UI copy.

## Coding expectations

- Prefer small, explicit modules and typed boundaries.
- Validate external and user-controlled input with Zod.
- Keep database access in the repository layer.
- Use transactions for multi-record invariants.
- Bind SQL values and allowlist dynamic SQL identifiers.
- Preserve stable object IDs across renames.
- Preserve manual save, explicit AI confirmation, and soft-delete semantics.
- Keep suggestions visually and structurally distinct from confirmed relationships.
- Maintain keyboard access, focus states, and unsaved-change protection.
- Do not add telemetry, cloud persistence, background AI work, or automatic knowledge mutations without an approved design change.

## Database and backup compatibility

Schema changes must account for existing local databases. Update both the initialization SQL and Drizzle schema, add migration or compatibility logic, test restoration, and document any backup-version change.

Never use a developer's personal Staff Chief database in an automated test.

## AI changes

Changes to prompts, schemas, provider execution, snapshots, source validation, or consent screens are security-sensitive. A pull request must explain:

- what data can leave the workstation;
- when the external process starts;
- how outputs are constrained and validated;
- how cancellation, timeout, partial failure, and retry behave;
- whether any finding can mutate knowledge.

Tests must use a mocked executor. Routine CI and unit tests must not invoke the real Codex CLI or make model calls.

## Commit and pull request style

Use concise imperative commit messages. Conventional Commit prefixes are encouraged:

- `feat:` new user-visible capability;
- `fix:` defect correction;
- `docs:` documentation only;
- `test:` test-only change;
- `refactor:` behavior-preserving code change;
- `chore:` maintenance.

Keep unrelated changes in separate commits. Pull requests should include:

- summary and motivation;
- user-visible impact;
- security and privacy impact;
- test results;
- screenshots for meaningful UI changes;
- documentation updates;
- known limitations or follow-up work.

## Reporting security issues

Follow [SECURITY.md](SECURITY.md). Do not disclose exploit details or sensitive data in a public issue.

## License status

The repository does not currently include an open-source license. Discuss licensing with the maintainer before contributing code intended for redistribution.
