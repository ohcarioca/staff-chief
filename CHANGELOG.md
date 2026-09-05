# Changelog

All notable changes to Staff Chief are documented in this file. The format follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project intends to use semantic versioning once tagged releases begin.

## [Unreleased]

### Added

- Manual draft improvement, local object suggestions, separate note connections and per-finding deepening.
- Shared context selection, internal size safeguards, session response reuse, and read-only human-rated report comparisons.

- Comprehensive English project, user, architecture, data, AI, security, backup, development, troubleshooting, contribution, and security-policy documentation.
- Public repository metadata and explicit project language conventions.
- Isolated synthetic AI test data with three diagnostic scenarios, one false-positive control, custom object types, and a documented evaluation rubric.
- Calendar-constrained general and multi-note AI analysis from the dashboard, with manual note selection and immutable range metadata.

### Changed

- New analyses use one macro call with selected lenses, excerpts, evidence and historical finding continuity.
- Backup v2 preserves report occurrences and AI metadata while accepting v1 imports.

- Internal Codex prompt instructions, automated test descriptions, test fixtures, and startup-helper messages now use English.
- User-facing application copy and AI result language remain Brazilian Portuguese.

### Fixed

- Completed reports no longer reopen SSE on callback changes; object refreshes no longer recreate the editor.

- Analysis findings now open as a single-expand accordion, preserving the finding selected from the dashboard instead of expanding the entire report.

## [0.1.0] - 2026-09-04

### Added

- Local-first three-column management workspace.
- Rich TipTap note editor with structured typed mentions.
- Default and custom object types with stable object references.
- SQLite persistence, FTS5 search, archival, and versioned JSON backup/restore.
- Obsidian-inspired 2D force graph for co-occurrences, relationships, suggestions, and optional notes.
- Manual Codex CLI analysis with preview, selective specialists, structured output, SSE progress, cancellation, partial reports, and retry.
- Dashboard metrics, date filters, recent analyses, priority findings, collapsible sidebar, and resizable inspector.
- Unit and integration coverage for core repository and analysis invariants.

[Unreleased]: https://github.com/ohcarioca/staff-chief/compare/8030cb2...HEAD
[0.1.0]: https://github.com/ohcarioca/staff-chief/tree/8030cb2
