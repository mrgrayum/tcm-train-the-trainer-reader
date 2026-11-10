# TCM Train the Trainer — Digital Book Reader

Private repo for the TCM Train the Trainer browser-based PDF reader and note-taking tool.

## What's here

- `TCM-Train-the-Trainer-Reader-Build-Prompt.md` — the full build prompt / spec for the reader:
  - 6 PDF books, rendered as real two-page spreads (cover alone, then spreads, back cover alone)
  - PDF.js rendering, pdf-lib export of annotated PDFs
  - Sticky notes, highlights, and text boxes saved to IndexedDB, with backup/restore and annotated-PDF export
  - Quanta branding, accessibility, file structure, and testing checklist

## Status

Build prompt uploaded 2026-11-10. The reader app itself has **not** been built yet.

## Next step to build it

The 6 course PDFs are needed to inspect page counts/sizes and to test the reader and the annotated-PDF export against the real files. They are not in this repo — the prompt notes they are internal/confidential training material (171 MB combined), so do not commit them to a public repo or public host without a hosting/protection plan.

## Notes on hosting (from the prompt)

- Static site only (HTML/CSS/JS, libraries bundled locally), deployable to Netlify, Azure Static Web Apps, SharePoint/IIS, etc.
- Watch single-file host limits — some hosts cap files below the largest book (43 MB).
- A password gate on a static site is not real protection for confidential PDFs; see the prompt for details.
