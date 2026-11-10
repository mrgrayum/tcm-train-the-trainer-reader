# Build Prompt: TCM Train the Trainer Digital Book Reader

Copy everything below the line into a new Claude session. Attach or connect the folder containing the six PDFs so the build can be tested against the real files.

---

## ROLE AND GOAL

You are building a hosted, browser-based PDF reader and note-taking tool for a live in-person course: the **TCM Train the Trainer** course (replace "TCM" with the full course name if I provide it). Each student will open a link on their own laptop and follow along in digital copies of the course books. It must feel like a real book on a desk, not a generic PDF viewer. I need to use it tomorrow, so prioritize a rock-solid core over extra features.

Work in this order: (1) confirm your understanding in a short summary and list anything blocking, (2) inspect the PDFs, (3) build, (4) test, (5) give me deployment steps. Do not ask me more than one batch of questions, and make reasonable assumptions for anything non-blocking and list them at the end.

## THE CONTENT

- 6 PDF books, each under 43 MB, 171 MB combined. They are internal training material and may be confidential.
- **Original PDF page numbers must be preserved and visible.** Render the actual PDF pages. Never rebuild or reflow content.
- Before building, inspect each PDF: page count, page dimensions, whether page 1 is a true cover and the last page a true back cover, whether any pages have mixed sizes or rotations, and whether any are scanned images (very large) versus text-based. Report anything unusual, and handle odd page counts and blank inside-cover pages correctly (see Spread Logic).
- Book titles come from a `books.json` manifest I can edit (title, file name, short description, optional accent color), not hardcoded.

## TECHNICAL REQUIREMENTS

- Static site: plain HTML, CSS, and JavaScript, no server-side code and no build step I have to run. Libraries are bundled locally in the project (not loaded from a CDN at runtime) so it works on restrictive corporate networks.
- **PDF.js** (Mozilla) for rendering. Render only the visible spread plus a small look-ahead (about 2 pages each direction). Never load or render a whole book at once. Cache rendered pages and discard distant ones. Render at devicePixelRatio for sharp text.
- **pdf-lib** for export (writing annotations into the PDF).
- Load PDFs with range requests/streaming so the first spread appears quickly even on a 43 MB file. Show a progress indicator while a book loads.
- Support current Chrome and Edge on Windows first, then Safari and Firefox on Mac. Mouse and keyboard first, with touch/tablet working but secondary.
- Hosting: deployable to any static host. Document the exact steps for the simplest option (for example Netlify or an internal SharePoint/IIS/Azure Static Web Apps site), and call out host limits that matter (for example some hosts cap single files below 43 MB, and some need caching headers set for PDFs). Include an optional shared-password gate suggestion since the books may be confidential. State clearly what is and is not real protection on a static site.

## LAYOUT AND UX

**Overall:** a full-window app with a left sidebar (the library), a main reading stage, and a slim top bar.

**Sidebar (library):**
- Shows the course title and all six books as cards: cover thumbnail (rendered from page 1 of each PDF), title, page count, and a small indicator if the book has notes (with a count).
- Click a book to open it in the stage. The currently open book is highlighted.
- Sidebar is collapsible to give more reading room.
- Include a "Notes" panel or tab listing all of the current book's notes, in page order. Clicking a note jumps to its page. Include an "All books" view option that shows notes across all six.

**Book stage (the book experience):**
- Opening a book shows **the front cover alone, centered**, as a closed book with a subtle shadow and thickness edge.
- Flipping forward opens the book into **two-page spreads** (left page and right page side by side) with a center gutter shadow and a stack-of-pages edge effect that grows or shrinks as the reader moves through the book.
- At the end, the **back cover is shown alone**, centered, as the book closes.
- Spread Logic: page 1 = cover alone. Then pairs (2-3), (4-5), and so on. If the page count makes the last page land alone, show it alone as the back cover; if the last page would pair with the previous one but should be the back cover, show the final page alone. Show the real PDF page number under each page.
- **Page turning:** click the page edges or the on-screen arrows, use the left/right arrow keys, Page Up/Page Down, swipe on touch, or drag. Add a "Go to page" box (type a PDF page number) and a thin page slider. The flip animation should be a smooth, fast CSS 3D page turn (about 400 to 500 ms) that never blocks input. Respect the `prefers-reduced-motion` setting by switching to a quick fade. Do not do a heavy physics page curl that lags on large PDFs.
- Zoom controls (fit to window, zoom in/out, and a focus mode that hides the sidebar). Notes must stay correctly positioned at every zoom level (store positions as fractions of the page, not pixels).
- Remember last book and last page per student locally, and reopen to it.

## NOTE-TAKING (v1 scope)

Tools in a small floating toolbar:
1. **Sticky note:** click anywhere on a page and a small note appears there. Click to edit and drag to move. It collapses to a small icon; clicking expands it. Delete option.
2. **Text highlight:** select text on the page, pick one of 4 colors, and it highlights. Click to remove or change color. Requires a PDF.js text layer.
3. **Text box:** place typed text directly on the page (margins, blanks). Move, resize, and delete.
4. Undo and redo for the last several actions.

Every annotation stores: book id, PDF page number, position as fractions of page width and height, type, color, text, created time. Notes are shown on screen exactly where placed. (Freehand pen is out of scope for v1. Mention it as a v2 idea.)

**Persistence:** autosave continuously to the browser's IndexedDB, keyed per book. Show a small "Saved" indicator. Because browser storage can be lost (cleared data, different computer, private window), add:
- A visible reminder banner on first load explaining notes live in this browser and to export before leaving.
- A "Back up my notes" button that downloads a small `.json` of all notes for all books, and a "Restore notes" button to load it back.
- A gentle prompt at the end of a session (on `beforeunload` when there are unexported changes) reminding them to export.

## EXPORT / SAVE TO COMPUTER (critical)

- "Save annotated PDF" for the current book, and "Save all books" (downloads each annotated PDF, or a ZIP if a ZIP library is bundled).
- The saved PDF must be the **original PDF with the student's notes embedded as real PDF annotations**: sticky notes become Text annotations with their contents, highlights become Highlight annotations with the correct quad points and color, text boxes become FreeText annotations. They must be visible and editable when opened in **Adobe Acrobat/Reader, Edge, Chrome, and macOS Preview**.
- Original page numbers, page sizes, bookmarks, and links are preserved. Notes carry the student's name if they entered one (optional field in settings).
- Also offer a "Print/Flatten" option that burns notes into the page content permanently, labeled clearly as non-editable.
- Use `showSaveFilePicker` where available and fall back to a normal download. Name files like `Book Title - Annotated - YYYY-MM-DD.pdf`.
- Memory safety: export must work for a 43 MB PDF without freezing the tab. Show progress and run heavy work off the main thread if feasible. Test it.
- Verify export by re-opening the exported PDF with PDF.js and checking that annotation count and positions match. Report the result.

## VISUAL DESIGN: QUANTA BRANDING (use these specs exactly, they are self-contained)

Brand personality: bold, energetic, professional, confident, warm. Clean, modern, and purposeful, not busy.

**Colors (CSS variables):**
```css
:root {
  --infrared: #CD0A1B;      /* primary red: primary actions, key accents */
  --infrared-dark: #AA0011; /* hover/pressed */
  --infrared-light: #EF1220;/* highlights */
  --bolt: #F0941C;          /* primary orange: sparing accents, highlights */
  --bolt-dark: #D87C0A;
  --bolt-light: #FFAE4D;
  --carbon: #221F1F;        /* primary dark: text, sidebar background */
  --carbon-1: #3C3A3A;
  --carbon-2: #575454;
  --carbon-3: #716F6F;
  --carbon-4: #8B8A8A;
  --carbon-5: #A5A4A4;
  --carbon-6: #C0BFBF;
  --carbon-7: #DAD9D9;
  --carbon-8: #F4F4F4;      /* light app background */
  --white: #FFFFFF;
}
```
- Primary combinations: Infrared + Carbon, Bolt + Carbon. **Never put Infrared text on a Bolt background or the reverse.** Maintain WCAG AA contrast (4.5:1 for text).
- Suggested use: Carbon sidebar with white text and an Infrared active-book indicator; Carbon +8 reading stage background (or Carbon for a darker "reading room" mode); Infrared primary buttons with white text and Proxima-style bold labels; Bolt for note markers and the "unsaved changes" indicator; dividers 2 to 4 px in Infrared or Bolt.
- Highlight colors for notes: Bolt +1 (#FFAE4D), plus three accessible, non-brand-conflicting options (yellow, green, blue) shown at reduced saturation.
- Provide a light/dark reading-stage toggle.

**Typography:**
- Headings and labels: **Alternate Gothic Extra Condensed ATF**, ALL CAPS, tracking about 100 to 200, used for large headings (over 30px), short callouts, and small labels. Color Infrared on light, White on dark, Bolt as an accent.
- Body and UI text: **Proxima Nova**, Regular for body and Bold for subheadings and buttons. ALL CAPS labels use tracking 200.
- These are licensed fonts. If I supply font files, bundle them with `@font-face`. If not, use the specified fallbacks without error: **Arial** for both (Arial in title case as the heading fallback is acceptable, though keep a condensed look using `font-stretch` or a condensed system stack if one is available). The design must still look good with fallbacks.
- Leading: about 175% for body text, 145% for headings in UI copy blocks.

**Brand elements:**
- Logo: if I supply the Quanta horizontal logo file, place it in the top-left of the sidebar on a solid Carbon background with clear space around it (minimum clear space equal to the width of the "QU" letters). Never stretch, recolor, rotate, add effects, or put it on a patterned or low-contrast background. If I don't supply it, leave a clearly marked placeholder slot and a TODO, and do not invent or imitate a logo.
- Patterns (optional): the diagonal hatched pattern at 45 degrees in subtle color (`#484545` on Carbon) is allowed on the welcome screen or sidebar footer only, never under small text (under 24px) or behind the logo except Carbon with the Carbon and Carbon +8 patterns.
- Icons: use simple stroke-style SVG icons (Lucide style) inline, with `aria-hidden="true"` on decorative ones and `aria-label` on icon-only buttons. No emojis. Use brand colors only.
- Buttons: primary = Infrared fill with white text, 4px radius, Bold. Secondary = Carbon outline or Bolt fill with Carbon text. Hover states use Infrared dark.
- Co-branding line (if wanted): "A QUANTA SERVICES COMPANY" below the company name, small and in tracking-200 caps. Ask me whether to include a division name (for example M. J. Electric).
- Photography: do not use stock photos. The app should work with no photography.

**Welcome screen:** shown on first load. Course title in Alternate Gothic caps ("TCM TRAIN THE TRAINER" with the key words in Infrared), a one-line instruction, three short steps (pick a book, take notes, save your PDF), and a "Start" button. Include a one-time notes-storage warning here.

## ACCESSIBILITY AND POLISH

- Full keyboard operation with visible focus rings and logical tab order. Screen reader labels on controls. Do not rely on color alone for note types.
- Responsive: usable from 1280 px laptop width up. On narrow screens, show a single page instead of a spread and say so.
- Clear loading, empty, and error states (for example PDF failed to load: show a plain-language message and a Retry button).
- No console errors. No external network calls at runtime other than fetching the PDFs from the same host.

## FILE STRUCTURE TO DELIVER

```
/index.html
/css/app.css
/js/app.js, reader.js, notes.js, export.js, storage.js
/lib/pdfjs/   (bundled)
/lib/pdf-lib/ (bundled)
/books/       (my 6 PDFs go here, plus books.json)
/assets/      (fonts, logo placeholder, icons)
README.md     (deployment and edit instructions in plain language)
```

## TESTING (do this before telling me it is done)

1. Open every book with the real PDFs; confirm cover-alone, spreads, and back-cover-alone behavior, including a book with an odd and a book with an even page count.
2. Confirm printed page numbers on screen match the PDF page numbers.
3. Place 3 sticky notes, 3 highlights, and 2 text boxes at different zoom levels; confirm positions hold after a refresh and after zooming.
4. Export a 43 MB-class book; reopen the result in PDF.js and confirm every annotation is present. Report time taken and any memory issues.
5. Test the backup and restore of notes.
6. Test rapid page flipping, keyboard navigation, and the go-to-page box.
7. Measure time to first spread on the largest book over a throttled connection (simulate a typical venue Wi-Fi) and report it.
8. Report what you could not test (for example real Adobe Acrobat) so I can check it myself.

## WHAT I EXPECT BACK

- The working project folder and a short, plain-language README.
- Step-by-step hosting instructions I can follow in under 15 minutes, including how to add a password if appropriate.
- A short "known limitations" list and a "v2 ideas" list (freehand pen, search across books, shared instructor notes, page-curl animation).
- A one-page student quick-start I can read aloud at the start of class.

## DEFAULTS TO ASSUME UNLESS I SAY OTHERWISE

Desktop Chrome/Edge on Windows laptops, venue Wi-Fi of unknown quality, books may be confidential, students are not technical, notes are personal (not shared between students), and the build must prioritize reliability over visual flourish if the two conflict.
