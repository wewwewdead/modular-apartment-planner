# Sketch Studio — export drawing sheets to PDF (Phase T)

Status: spec 2026-11-08, for Opus 5.5 at effort high. The main loop audits the result.
Builds on Phase R (`docs/sketch-studio-drawing-fit.md`) and Phase S (`docs/sketch-studio-sheet-manager.md`). Both are built and uncommitted.

## 1. What exists today (verified)

- The Drawings ribbon has **Vector PDF**, which calls `exportFile('pdf')` in `CadWorkspace.jsx`:
  1. `runtime.request('export')`;
  2. `vectorPdf(data.drawings, model, snapshot)` (`exports.js` ~71);
  3. `download(blob, 'workshop.pdf')`.

Problems:

1. **Heavy.** `export` in `kernel.worker.js` runs `exportSolids()`, which builds a STEP and an STL for every part, plus `planarProfiles()`. A PDF needs only `drawings`.
2. **No choice of sheets.** It always exports every sheet plus the automatic part detail sheets (`includeParts: true`). The user wants to send chosen sheets.
3. **All-or-nothing.** One sheet that throws fails the whole file. A fixed scale that overflows (Phase R), a broken reference, or notes that are too long all do this. The user learns only from a generic error.
4. **No file name or location.** The file is always `workshop.pdf` through an `<a download>`. There is no save dialog, even though the app has one: `src/persistence/fileTransfer.js` uses `showSaveFilePicker` with a download fallback and `isFilePickerAbortError`.
5. **Not optimized.**
   - `exports.js` imports JSZip, jsPDF and svg2pdf statically, so every lazy load of exports pulls all three.
   - `vectorPdf` renders every page in one synchronous-ish loop, with no progress or yielding.
6. **Untested.** No test touches `vectorPdf` or `workshopZip`.
7. **Text encoding is unverified.**
   - svg2pdf maps `font-family="sans-serif"` to jsPDF's standard Helvetica, which only covers WinAnsi (cp1252).
   - The sheets print Ø × ± ° — · characters.
   - Titles and notes are free user text, which may contain characters outside cp1252.

## 2. Goals

- **One-click PDF of the current sheet**, and a PDF of chosen sheets or all sheets. Each is one file with true-size pages: A3 prints 1:1 at the stated scale.
- **A real Save dialog** with a sensible file name. Fall back to a download where the dialog API is missing.
- **Problems before writing.** A preflight lists the sheets that can't be exported, each with a one-click fix. The user can then export the rest explicitly. Nothing is skipped silently.
- **Fast and responsive.**
  - Generate only the needed sheets' views, reusing the Phase S per-sheet cache where it is current.
  - Never build STEP/STL for a PDF.
  - Lazy-load the PDF libraries.
  - Yield between pages, show progress, and allow cancelling.
- **Verified text.** What the PDF shows matches the sheet. Characters the font cannot draw are reported, never silently turned into "?".

## 3. Module split (optimization)

- New `sheetPdf.js` holds the PDF code. It is the only importer of `jspdf` and `svg2pdf.js`, and is loaded with `await import('./sheetPdf.js')` only when a PDF is made.
- Its main function:

  ```js
  sheetsPdf(sheets, model, snapshot, { title, onProgress, signal, pageOffset = 0, pageTotal }) → Promise<Blob>
  ```

  - **Page size:** every page is landscape at `PAGE_SIZES[sheet.size]` (the Phase R table, including A2–A0).
  - **Page number:** page `n of N` is the export set's numbering, passed to `sheetSvg(sheet, model, snapshot, n, N)`.
  - **Before each page:** check `signal.aborted` and throw an `AbortError`.
  - **Between pages:** yield with `await new Promise((r) => setTimeout(r, 0))`, then call `onProgress({ done, total, title })`.
  - **Metadata** via `pdf.setProperties`:
    - title = the PDF title;
    - subject = "Engineering drawings";
    - creator = "Sketch Studio";
    - keywords = the sheet titles.
  - **Exports must refuse overflow.** Render with `allowOverflow: false` (Phase R): an export never shrinks or overflows.

- `exports.js vectorPdf` becomes a thin wrapper that calls `sheetsPdf`, so the workshop ZIP's `drawings/workshop.pdf` uses the same code.
- Remove the static `jspdf` / `svg2pdf.js` imports from `exports.js`. The ZIP awaits the same dynamic import.
- Check `npm run build` output: jsPDF and svg2pdf should land in their own lazy chunk. Report the chunk names and sizes.

## 4. Text and fonts

1. **Add `pdfTextIssues(svgString)`.**
   - It collects the text of every `<text>` element.
   - It returns the characters outside cp1252 (WinAnsi), with the sheet title. Use a hard-coded cp1252 table; Latin-1 plus the 0x80–0x9F extras such as — ’ • €.
2. **Prove the symbols the sheets print every time come out correctly.** The symbols are Ø × ± ° — · and the en-dash.
   - Build a pump-bracket sheet PDF with compression off: `new jsPDF({ compress: false })`, behind an option used only by tests.
   - Assert that the content stream's text operators hold the right WinAnsi bytes.
   - If any of these symbols comes out wrong, fix it at the source with a WinAnsi-safe mapping inside `sheetPdf.js`. Explain what you found.
3. **Don't embed a font in this phase.**
   - Characters outside cp1252, for example in user notes, show in the preflight as a warning: "‘Frame’: these characters can't be shown in the PDF: 日本".
   - Export can still continue. The warning text states what will print instead; check what jsPDF actually does and say it.

## 5. Choosing sheets and preflight (`CadWorkspace` + `SheetsPanel`)

### `exportSheetsPdf(ids, { includeParts = false })` in CadWorkspace

Use one guarded path, like `exportFile`. Reuse `exportGeneration`, `assertCurrent`, `busy` / `exportingType` and the `operationDraft` refusal.

1. **Pick the file first.** If `showSaveFilePicker` exists, open it **first**, synchronously inside the click, before any await. Transient user activation expires during a long render, and late pickers throw `SecurityError`.
   - Suggested name:
     - one sheet: `<document> - <sheet title>.pdf`;
     - several: `<document> - drawings.pdf`.
     - Sanitize the name the way `fileTransfer.js sanitizeFileNamePart` does; reuse it if it is exported, otherwise move it somewhere shared.
   - Types: `[{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }]`.
   - An `AbortError` cancels quietly.
2. **Get the views.**
   - Take current entries from the Phase S `drawings` cache: `sameDrawingSource` and `sameDrawnSheet`.
   - Request the rest with `runtime.request('drawings', { sheetIds: missing, includeParts })`, and merge them into the cache so the previews benefit.
   - Confirm in `kernel.js` how `includeParts` combines with `sheetIds`. The automatic part sheets must be added only when `includeParts` is set, and only for parts that have no sheet. Fix and test it if it doesn't behave that way.
3. **Preflight.** For each sheet, in model order:
   - render it with `sheetSvg(..., { allowOverflow: false })` inside try/catch;
   - collect `{ sheet, error }` and `pdfTextIssues`.

   Rendering an SVG string is cheap, and the strings are reused for the PDF, so don't render twice. Accept pre-rendered SVG strings in `sheetsPdf` (e.g. `pages: [{ svg, size, title }]`).

4. **If any sheet failed:**
   - don't write anything yet;
   - show the preflight report (§6) and keep the save handle;
   - write once the user chooses **Export the other N sheets**;
   - if they cancel, drop the handle. A picked file that was never written stays empty or untouched. Check what `createWritable` does if it is never closed; prefer not creating the writable until writing.
5. **Write.**
   - Run `sheetsPdf` with progress and abort. The busy label reads "Rendering sheet 3 of 12 — <title>" (add a `LOADING_COPY` entry).
   - Then `handle.createWritable()` → write → close, or `download(blob, name)` without a picker.
   - Report "Saved Frame.pdf (3 pages)" inline in the Sheets panel. The File System Access API gives the name via `handle.name`.
6. **Cancelling.** **Cancel** next to the progress aborts the run. Nothing is written, and any created writable is aborted with `writable.abort()`.

### Entry points

- **Drawing pane:** a **PDF** button beside **Manage sheets** exports the current sheet. Its title is "Save this sheet as a PDF".
- **Sheets panel:**
  - a new **Export PDF** section at the top, above New drawing of, holding:
    - a scope radio: **This sheet** / **Selected (N)** (disabled with none checked) / **All sheets (N)**;
    - a checkbox **Include automatic part detail sheets**, off by default and only offered for All sheets;
    - an **Export PDF** button;
  - the bulk bar gets **Export selected as PDF**.
- **Ribbon:** **Vector PDF** is renamed **Export PDF…**. It opens the Sheets panel scrolled to and focused on the Export PDF section. Keep `exportType: 'pdf'` busy behaviour.
- **Workshop ZIP** is unchanged in content. It still exports all sheets plus part sheets, now through `sheetsPdf`. Its preflight behaviour stays as today: it throws on the first bad sheet. Improve its message to name the sheet.

## 6. Preflight report UI (in `SheetsPanel`)

`role="status"` region:

> **2 of 7 sheets can't be exported**
> • Frame — isometric does not fit on A3 at 1:20. **[Fit to page]** **[Open sheet]**
> • Section details — Section does not cross the model. **[Open sheet]**
> ⚠ Bracket: these characters can't be shown in the PDF: 日本 (they print as …)
> **[Export the other 5 sheets]** **[Cancel]**

- **Fit to page** appears only for overflow errors that fit mode can fix, using the Phase R `sheetFit` rows. It is one commit.
- After a fix, the preflight reruns on the same ids with the same handle, and goes straight to writing if everything is now fine.
- Text warnings alone don't block. Show them in the success line as well.

## 7. Electron

- The desktop app (`electron/main.cjs`, Chromium) supports `showSaveFilePicker`. Confirm by reading the Electron version in `package.json`. No `will-download` handler exists, and the fallback `<a download>` shows Electron's default save dialog.
- Don't add IPC. If you find the picker isn't available in the packaged `file://` build, the download fallback must still work. Say which applies.

## 8. Tests

### `sheetPdf.test.js` (jsdom; `svg2pdf` needs DOM; tests use `compress: false`)

- Two pump-bracket sheets on A3 and A1 give 2 pages with mediaboxes 420×297 and 841×594 mm (in pt). Check the metadata title.
- The page-number text reads "1 of 2" / "2 of 2".
- `onProgress` is called once per page.
- An aborted signal rejects with `AbortError` and writes no further pages.
- The WinAnsi symbol check from §4.2.
- `pdfTextIssues` flags 日 and passes Ø×±°—·.

### `exports` / `workshopZip` smoke test

- `workshopZip` still contains `drawings/workshop.pdf`, and an import of `exports.js` no longer statically needs jspdf.

### CadWorkspace / SheetsPanel dom tests (mock `showSaveFilePicker` and the writable)

- **Current-sheet PDF:**
  - the picker is called **before** any `runtime.request`;
  - the request is `drawings` with that `sheetIds`, never `export`;
  - the writable gets a Blob of type `application/pdf`.
- **Cache reuse:** a cached current sheet makes no kernel request.
- **Selected and All:** the scopes give the right ids, and `includeParts` is passed only when the box is checked.
- **Preflight:**
  - an overflowing fixed sheet shows the report and nothing is written;
  - **Fit to page** commits once and then writes;
  - **Export the other N** writes N pages.
- **Cancel / Abort:** an aborted picker → no request, no error. Cancel mid-render → `writable.abort` or nothing written.
- **No picker:** the `download` fallback is called with the suggested name.
- **Ribbon:** **Export PDF…** opens and focuses the Sheets panel's export section.

### Gate

- Full `npx vitest run` green. The baseline is ≈5593 passed / 1 skipped; the known-flaky `CadWorkspace.place` "Flip side" test passes alone.
- `npm run lint` with 0 errors.
- `npm run build` OK; report the PDF chunk.

## 9. Keep / don't

- Keep the exports' refuse-overflow contract and the Phase R / S behaviour and tests, including the `sheetBytes.test.js` digests.
- Keep `exportFile('svg' | 'dxf')` as is.
- Don't touch `src/export/sheetExport.js`; the 2D floor-plan PDF writer is separate.
- No new dependencies and no embedded font files.
- Don't revert or reformat unrelated files, and don't commit. Watch line endings: don't use `sed -i` on CRLF files.
- Update `docs/sketch-studio-cad.md` § Engineering drawings on exporting PDFs. Cover:
  - the scope choices;
  - the preflight;
  - true-size printing;
  - the character limitation.
