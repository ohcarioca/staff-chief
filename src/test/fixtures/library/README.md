# Synthetic library fixtures

These documents contain only generated test content, without user data.

- `structured.docx`: minimal OOXML with a heading, accented text and a table without an explicit header row.
- `multipage.pdf`: two pages with selectable Windows-1252 text and Helvetica.
- `partial.pdf`: one text page and one blank page.
- `empty.pdf`: a blank page, exercising the no-extractable-text/OCR error.
- `protected.pdf`: password-protected PDF; test password is `test-password`.
- `reference.txt` and `reference.md`: UTF-8 text with accents; Markdown includes a list and table.

The DOCX was generated with Python's standard `zipfile`; PDFs were generated with `pypdf`. Fixtures are committed so tests need only the application's Node dependencies, not Python or network access.
