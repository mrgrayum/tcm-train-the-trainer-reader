# TCM Train the Trainer — Digital Book Reader

A browser-based reader for the TCM Train the Trainer course books.
Students open a link, follow along in the real books (shown as a cover, then
two-page spreads, then the back cover), take notes right on the pages, and
save a personal annotated PDF at the end.

It is a **static site**: plain HTML, CSS, and JavaScript. No server code, no
build step. PDF.js, pdf-lib, and JSZip are bundled in `lib/` — nothing is
loaded from the internet at runtime, so it works on restrictive corporate
networks.

**Live site (GitHub Pages):** https://mrgrayum.github.io/tcm-train-the-trainer-reader/
The books are hosted in this repo under `books/` — they are not hosted on
anyone's personal Google Drive. (Per the course owner, 2026-11-10, these
books do not need to be treated as confidential; the repo and site are
public so students can open the link without a sign-in.)

The file `TCM-Train-the-Trainer-Reader-Build-Prompt.md` is the original
build spec.

---

## The books (verified by inspection, 2026-11-10)

Book titles/files are listed in `books/books.json` — edit that file (not the
code) to change a title, description, or accent colour.

| File | Title (from the PDF itself) | Pages | Size | Page size |
|---|---|---|---|---|
| `QUANTA-PERFORMANCE-TRAINEE.pdf` | Quanta Human Performance Principles — Trainee Manual | 40 | 37.8 MB | 576 × 780 pt |
| `QUANTA-PERFORMANCE-TRAINER.pdf` | Quanta Human Performance Principles — Instructor Manual | 62 | 41.0 MB | 576 × 775.7 pt |
| `QUANTA-HUMAN-ADDITIONAL.pdf` | Quanta Human Performance Principles — Additional Materials | 6 | 5.9 MB | 604.8 × 775.2 pt |
| `STKY-ENERGY-WHEEL-TRAINEE.pdf` | STKY and the Energy Wheel — Trainee Manual | 56 | 33.5 MB † | 576 × 777.1 pt |
| `STKY-ENERGY-WHEEL-TRAINER.pdf` | STKY and the Energy Wheel — Instructor Manual | 68 | 33.4 MB † | 576 × 774.2 pt |
| `STKY-ENERGY-WHEEL-ADDITIONAL.pdf` | STKY and the Energy Wheel — Additional Materials | 5 | 5.0 MB | 604.8 × 774.2 pt |
| `Presentation-Evaluation-Rubric_cleaned.pdf` | Presentation Evaluation Rubric | 4 | 4.2 MB | 612 × 792 pt (letter) |

Inspection notes:

- All seven are PDF 1.3, unencrypted, no rotation, and every page within a
  book is the same size — no mixed sizes to handle.
- Interior pages are text-based (sampled pages extracted 600–2,000
  characters of text each), including the STKY Instructor Manual, whose
  PDF title says "Cleaned Scan" — text highlighting should work. Covers
  carry almost no text (they are graphic covers), and the last page of
  each manual has no text — a true back cover.
- The two "Additional Materials" books are the exception: page 1 already
  contains full content text (no graphic cover). Page 1 still displays on
  its own, exactly like a cover, per the spread rules.
- Manual page counts are all even (40/62/56/68), Additional Materials
  are 6 and 5. With cover-alone + back-cover-alone spread logic, the
  second-to-last spread of an even-count book is a single middle page —
  that is expected, not a bug.
- The Presentation Evaluation Rubric (added 2026-11-10) is a cleaned scan:
  its text layer is spotty (page 4 has none), so text highlighting is
  limited there — pages render normally and sticky notes work throughout.
- Combined size as hosted ≈ 161 MB. Largest single file ≈ 41 MB — under
  GitHub's 100 MB per-file limit; the whole site is well under the 1 GB
  GitHub Pages limit.
- † The two STKY manuals were originally 45.0 MB each (300 dpi page
  scans), which exceeded the GitHub API's per-file upload limit. Their
  page images were recompressed from 300 dpi to 200 dpi (JPEG quality
  80) for hosting: 45.0 MB → 33.5 MB / 33.4 MB. Page count, page size,
  text layer (verified character-for-character on sampled pages), and
  on-screen appearance are unchanged — a side-by-side render check of a
  text-and-diagram page was indistinguishable. The untouched 300 dpi
  originals remain in the owner's Google Drive folder.

## Test it on your own computer (2 minutes)

From this folder, run a tiny local web server, then open the address it shows:

```bash
python3 -m http.server 8080
# open http://localhost:8080 in Chrome or Edge
```

(Double-clicking `index.html` will NOT work — browsers block PDF loading
from `file://` pages.)

---

## Deploy — GitHub Pages (how this site is hosted)

1. The repo `mrgrayum/tcm-train-the-trainer-reader` is public, with the
   seven PDFs committed in `books/`.
2. GitHub Pages is enabled for the `main` branch, root folder.
3. Any push to `main` republishes the site at
   https://mrgrayum.github.io/tcm-train-the-trainer-reader/ within a
   few minutes.
4. To update a book: replace the PDF in `books/` (keep the same file
   name, or update `books/books.json` to match) and push.
5. To update a title: edit `books/books.json` and push — no code changes.

### Alternative hosts (if you ever move it)

- **Netlify Drop:** drag the whole project folder onto
  <https://app.netlify.com/drop>. Watch free-tier file/bandwidth limits
  with ~180 MB of PDFs.
- **Azure Static Web Apps / internal IIS:** upload all files keeping the
  folder structure; make sure the server allows range requests for PDFs
  (IIS/Azure do by default) so first pages stream quickly.
- Any host: total site ≈ 182 MB. Confirm storage/bandwidth quotas before
  class day, and test on the actual training network.

## Password protection — the honest version

- **A password gate written in JavaScript on a static site is NOT real
  protection.** Anyone can view the page source, find the password, or
  open a PDF URL directly. It only stops casual browsing.
- **The PDFs themselves are just files on a static host.** Anyone who
  knows or guesses a book's URL can download it, gate or no gate.
- **Real protection** means server-enforced authentication (company
  single sign-on, VPN-only internal hosting, or a host plan with real
  access control).
- For this course, the owner decided the books do not need that
  protection, so the public GitHub Pages site above is the end product.

## How student notes work

- Notes (sticky notes and highlights) autosave to the student's
  browser **IndexedDB** on that computer only. (The text box tool was
  removed Nov 10 2026 at the owner's direction — its editing was
  unreliable and sticky notes cover the same need. Any text boxes
  created before the removal still render and export.)
- **Save annotated PDF** embeds the notes as real, editable PDF
  annotations in a copy of the original book (opens in Acrobat, Edge,
  Chrome, Preview). **Save all books** does the same for every book and
  bundles them in a ZIP.
- **Print / Flatten** burns the notes into the pages permanently — that
  copy's notes are **not editable**. The button is labelled accordingly.
- **Back up my notes / Restore notes** downloads/uploads a small JSON
  file of all notes — the safety net if a student changes computers.

## Known limitations

- Export is verified programmatically (annotations re-read and counted
  after export) and was confirmed by the owner on Nov 10 2026: both the
  editable-comments export and the flattened export work.
- FreeText (text box) appearance is generated for common viewers; exact
  rendering can vary slightly between Acrobat, Edge, and Preview.
  (Legacy support only — the text box tool itself was removed.)
- Notes are per-browser/per-computer by design (personal, not shared).
  Nothing syncs between students.
- Book cover thumbnails load each PDF's first page — on very slow
  networks the library cards may show page counts before thumbnails.
- No logo is used (removed at the owner's request, Nov 10 2026). The
  licensed fonts (Alternate Gothic, Proxima Nova) were not supplied;
  the layout uses the specified Arial fallbacks.
- On screens narrower than ~900 px the reader switches to one page at a
  time and says so on screen.
- Export runs in the page (not a background worker); on a ~45 MB book it
  shows progress text and may take several seconds.

## v2 ideas

- Freehand pen / drawing annotations
- Full-text search across all the books
- Shared instructor notes (a master annotation set shown to every student)
- Realistic page-curl animation
- Synced notes (sign-in + cloud storage) so notes follow a student
- Bookmarks / table-of-contents sidebar from the PDFs' outlines
- Offline mode (service worker) for venues with unreliable Wi-Fi

## File map

```
/index.html            welcome screen, sidebar, stage, toolbar
/css/app.css           Quanta-branded styles
/js/app.js             wiring: library, navigation, notes list, backup/restore
/js/reader.js          PDF.js loading, spread logic, page rendering + cache
/js/notes.js           sticky / highlight / text-box model, undo/redo, autosave
/js/storage.js         IndexedDB (db "tcm-reader"), keyed per book
/js/export.js          pdf-lib export: real annotations + flatten, ZIP of all books
/lib/pdfjs/            PDF.js 3.11.174 (bundled, no CDN)
/lib/pdf-lib/          pdf-lib 1.17.1 (bundled)
/lib/jszip/            JSZip 3.10.1 (bundled)
/books/books.json      EDIT THIS: the book titles / file names
/books/                the course PDFs (committed; hosted by Pages)
QUICKSTART.md          one-page student quick-start — read it aloud in class
```
