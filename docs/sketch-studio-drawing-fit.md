# Sketch Studio — drawing scale that fits, and choosing what to draw (Phase R)

Status: spec 2026-11-08, for Opus 5.5 (effort high). Main loop audits.

## 1. Problem

"Engineering drawing: isometric does not fit at 1:20. Use a larger page or smaller view scale."

What causes it (verified in source):

- **New engineering sheet** (`CadWorkspace.jsx` ~1557–1580) guesses a scale from the
  selected part's bounds: `[1, 0.5, …].find((s) => span * s < 60)`.
  - When the selection is **not exactly one part**, `part` is undefined, so `partId` is undefined.
    Covered cases: nothing selected, a group, or a multi-selection.
  - The sheet then draws the **whole assembly**, titled "Engineering drawing", with `span` falling back to **1000 mm**. That gives 1:20 whatever the real size is.
  - The guess also ignores the real view boxes:
    - an isometric is about √3 × span;
    - cell size depends on the page and the view count.
- The renderers throw the moment one view overflows its cell:
  - `engineeringSheet.js:148`;
  - `drawings.js:113`.
  - The preview then shows only the error text (`CadWorkspace.jsx` ~1792), so the user can't see what went wrong.
- Scale can only be typed, as a decimal (`SheetEditor.jsx` ~131, "Sheet scale (1 = full size)"). Pages are only A3/A4/Letter (`drawings.js:15`).
- Choosing the subject is weak:
  - The sheet's "Drawing subject" select (`SheetEditor.jsx` ~97) offers Whole assembly or one part.
  - `sheet.instanceIds` (kernel `drawings()` ~782 already supports it) has **no UI**.
  - The 3D selection (a group, or multiple parts) is ignored.
- `kernel.js drawings({ includeParts })` (~751) guesses `s * maxSize < 55` for the automatic detail sheets. A big part breaks the workshop ZIP/PDF export the same way.
- The default sheet in `model.js emptyModel()` (~29) is fixed at 1:20 (`scale: 0.05`).

## 2. Goals and contract

1. New sheets **fit by default**. The renderer picks the largest standard scale at which every view fits its cell. That scale is printed as a real ratio ("1:50"), never "FIT".
2. The user rescales with a **standard-scale slider** that snaps to drafting ratios. The preview updates live, and the slider shows where the views stop fitting. A custom "1 : N" entry remains for odd scales.
3. An overflowing **fixed** scale never blanks the preview:
   - The sheet renders with the overflowing view flagged.
   - A banner offers one-click fixes.
4. **Exports keep the existing contract**: an explicit scale is never silently changed, and an overflowing fixed scale still throws. That keeps `docs/sketch-studio-cad.md`'s "Paper scale is preserved" and the existing tests true:
   - `engineeringSheet.test.js:81`
   - `reliability.test.js:165`
5. Picking a drawing subject is direct:
   - the current 3D selection (part / group / multi-selection) becomes the sheet subject;
   - the sheet editor can pick parts from a list.

## 3. Data model (no schema bump)

- Add an optional `sheet.scaleMode: 'fit' | 'fixed'`.
  - **Absent means `'fixed'`**, so old files and examples behave exactly as before.
  - `sheet.scale` stays a number or expression, and is used when the mode is fixed.
  - In fit mode, `scale` is kept as the last chosen fixed value. Switching to fixed starts from the fitted value; see §5.
- New sheets get `scaleMode: 'fit'`. That covers New engineering sheet, Section sheet and Exploded sheet (both clone the current sheet, so they inherit its mode), and `emptyModel()`'s Assembly sheet.
- Kernel auto detail sheets (`includeParts`) also get `scaleMode: 'fit'`. Keep the numeric `scale` field as a fallback.
- `normalizeModel`/validation: accept the field. Reject unknown values the same way other enums are rejected. Unknown values must never crash a render.
- A per-view `view.scale` is unchanged: an explicit per-view override is always fixed.

## 4. One layout geometry, shared by fit and render

Create a new pure module `sheetLayout.js`, or put it in `drawings.js` if that reads better. It holds:

- `standardScales()`: the ISO 5455 1-2-5 series.
  - Enlargements: 50:1, 20:1, 10:1, 5:1, 2:1.
  - Then 1:1.
  - Then reductions: 1:2, 1:5, 1:10, 1:20, 1:50, 1:100, 1:200, 1:500 … down to 1:10 000.
  - Generate the series rather than hand-listing it. Fit must always find an answer for any finite geometry. If even the smallest stop doesn't fit, continue the 1-2-5 series downward.
- `viewCells(sheet)`: for each view index, the slot rectangle and the drawable box in paper mm. It must use **exactly** the numbers each renderer uses today:
  - Engineering layout: `cellW/cellH`, `marginX 26`, `marginY 46`, the slot table `{top:0, isometric:1, front:2, right:3}` with fallback to the first free slot, and `divisions`.
  - Standard layout: `columns/rows`, `notesHeight` (it depends on notes and parts list), and the `-18 / -24` margins.

  Refactor both renderers to consume `viewCells` so the two can never drift apart. Output for the existing fixed-scale examples must stay **byte-identical**; add a test that snapshots the pump-bracket sheets before and after.

- `fitScale(sheet, views)`: for every view that has a positive `viewBox` and no explicit `view.scale`:
  - compute `min(availW / vw, availH / vh)`;
  - take the minimum across those views;
  - snap it **down** to the nearest `standardScales()` stop.

  Views with a zero-size viewBox are ignored. If no view qualifies, return the fixed `scale`.

- `resolveSheetScale(sheet, views)`: returns `fitScale(...)` when `scaleMode === 'fit'`, else `numeric(sheet.scale)`.
- `sheetFit(sheet, views, scale?)`: returns per-view `{ name, kind, need: [w, h], avail: [w, h], fits }` at the given or resolved scale. It also returns:
  - `largestFittingScale`;
  - `smallestFittingPage`: the smallest `PAGE_SIZES` entry where the current fixed scale fits, or null.

  The banner (§6) and the slider marks (§5) are built from this.

Renderers (`engineeringSheetSvg`, standard `sheetSvg`):

- Use `resolveSheetScale` for the default view scale **everywhere** it is read today:
  - engineering title block, `mixed` check (`engineeringSheet.js:306`);
  - standard title line (`drawings.js:153`).
- Standard layout view label: `drawings.js:120` prints `SCALE ${viewScale}:1`, so 1:2 shows as "SCALE 0.5:1". Use `scaleLabel`.
- New option argument: `sheetSvg(sheet, model, snapshot, page, pages, { allowOverflow = false } = {})`.
  - With `allowOverflow`, an overflowing view is still drawn, centred on its cell, and the cell gets a red dashed outline (`data-overflow="true"` on it for tests). No throw.
  - Without the option, behaviour is today's: throw. Improve the message to say what to do:
    `"<title>: <view> does not fit on A3 at 1:20. Use Fit to page, choose 1:50 or smaller, or use A1."`
    Fill it from `sheetFit`; leave the A-size clause out when none fits.
  - Keep the substring `does not fit`, because the existing tests match it.
- Exports (`exports.js` vectorPdf / zip / SVG / DXF in `CadWorkspace.exportFile`) call **without** `allowOverflow`.

## 5. Scale control UI: `SheetScaleControl.jsx`

There is one component, used in two places:

- the drawing pane header, next to the sheet selector (`CadWorkspace.jsx` ~2512);
- `SheetEditor`, replacing the "Sheet scale" ValueField (~131).

What it contains:

- **Fit to page** toggle (`aria-pressed`), on for `scaleMode === 'fit'`. It shows the resolved ratio, e.g. "Fit · 1:50".
- **Scale slider** (`input type=range`).
  - It moves over the indices of the `standardScales()` stops, in a sensible window: about 20:1 to 1:5000, widened so the current and fitted scales are always included.
  - The current label ("1:20") sits beside it.
  - Stops where the generated views don't fit are visibly marked, e.g. a red segment in the track gradient. The largest fitting stop carries a "fits" tick. This needs generated views; before Generate, the slider still works without marks.
  - Moving the slider sets `scaleMode: 'fixed'` and `scale` to the stop's value.
  - **Live preview while dragging, one commit (one undo entry) per gesture**:
    - keep a transient draft scale at workspace level;
    - the preview renders with it;
    - commit on pointerup / keyup / change-end.

    Use the established pattern in this codebase if there is one (`liveField.js`, `ValueField`). Otherwise add a small local draft.

- **Custom 1 : N** field, collapsed under "Custom". It accepts `50`, `1:50` or `2:1`, stores it as fixed, and validates to a positive value.
- Label the existing "Drawing zoom" slider **"Screen zoom"** and give it a help title ("Zoom the preview only — does not change the printed scale") so the two sliders can't be confused.
- Scale changes don't need **Generate views** again. Today `activeDrawing` (~1776) does not compare `scale`; keep it that way, and add `scaleMode` to nothing there either.

Pages: add `A2: [594, 420]`, `A1: [841, 594]` and `A0: [1189, 841]` to `PAGE_SIZES`. All landscape, like the others. Check:

- the jsPDF custom-format path in `vectorPdf`;
- that the title block and notes geometry (anchored on `width`/`height`) render correctly on A0.

## 6. Preview when a fixed scale overflows

In `CadWorkspace` (~1785):

- Render with `{ allowOverflow: true }`.
- When `sheetFit` reports an overflow, show a banner above the sheet (`role="status"`, not `alert`):
  > Isometric doesn't fit on A3 at 1:20. **[Fit to page (1:50)]** **[Use 1:50]** **[Use A1 at 1:20]**
- Each button is one commit.
- Omit the page button when no page fits.
- A thrown error that isn't an overflow (notes too long, a broken reference …) still shows as today.

## 7. Choosing what to draw

1. **New engineering sheet** takes its subject from the 3D selection (`selectedId`, `selectedGroup`, `selectionMembers`; `CadWorkspace.jsx` ~245–290):

   | Selection     | Subject                          | Title                          |
   | ------------- | -------------------------------- | ------------------------------ |
   | One part      | `partId` (as today)              | part name                      |
   | A group       | `instanceIds = selectionMembers` | group name                     |
   | Several parts | `instanceIds`                    | "`N` parts"                    |
   | Nothing       | whole assembly                   | document name, else "Assembly" |

   Set `scaleMode: 'fit'` and drop the span guess. Then **generate views straight away**: `perform(requestDrawings)`, guarded by `runtime.ready && !busy` like Refresh. The user immediately sees a sheet that fits.

2. **Selection entry point.** Add a "Drawing sheet" button where the selection's actions live:
   - the part Properties panel;
   - the group / multi-selection panel (find it via the "Move by" group panel).

   It runs the same command as item 1 and switches to the Drawings tab and split view.

3. **SheetEditor "Drawing subject"** becomes three choices:
   - **Whole assembly**;
   - **One part** (the existing part select);
   - **Chosen parts**:
     - an instance checklist, indented under group names (`groups.js` helpers);
     - a **"Use 3D selection (`N`)"** button, fed by a new prop `viewportSelection`: the member instance ids, plus the group name if there is one;
     - a count.

   Keep the existing rule "changing the subject clears this sheet's annotations; Undo restores them". An empty Chosen-parts list is not allowed: disable the last uncheck.

4. Changing the subject or the view list still needs Generate views; that is the existing `activeDrawing` key check. Replace the generic "Generate drawing views from the current model." with a clear call to action when the sheet is merely stale, e.g. "The drawing subject changed — Update drawing preview" plus a button.

## 8. Docs

Update `docs/sketch-studio-cad.md` § Engineering drawings:

- Fit to page is the default.
- Describe the slider and the overflow banner.
- Fixed scales are preserved and exports refuse overflow.
- Add the A2–A0 pages.
- Explain the subject from selection.

## 9. Tests (vitest; dom tests where UI)

- `sheetLayout`:
  - The series includes 1:20 and 1:50, is monotonic, and has no float noise in labels (`scaleLabel(0.02) === '1:50'`).
  - `fitScale` snaps down.
  - A 60 m × 40 m viewBox fits.
  - An explicit per-view scale is excluded from the fit.
  - `viewCells` equals the renderer's numbers.
- Fit mode never throws for huge geometry, and the title block shows the resolved ratio. Cover both layouts.
- With no `scaleMode`, behaviour is byte-identical to today, and both existing "does not fit" tests still pass unchanged.
- `allowOverflow` renders and marks `data-overflow`; without it, it throws with the actionable message.
- `SheetScaleControl`:
  - a slider drag commits once;
  - Fit toggles the mode;
  - Custom `1:50` → 0.02.
- `CadWorkspace`:
  - New engineering sheet with a group selected → `instanceIds` = members, title = group name, `scaleMode: 'fit'`, and views requested;
  - the overflow banner's buttons each do their thing in one commit.
- SheetEditor: Chosen parts checklist, and Use 3D selection.
- Kernel `includeParts` detail sheets carry `scaleMode: 'fit'`.

**Gate:** full `npx vitest run` green (baseline 5549 pass / 1 skip; one known-flaky `CadWorkspace.place` "Flip side" timeout that passes alone), `npm run lint` 0 errors, and `npm run build` OK.

## 10. Keep / don't

- Keep the existing fixed-scale output byte-identical.
- Keep the throwing export contract.
- Keep hole-chain / callout offsets in paper mm; they already stay inside cells at fit scale, so verify it.
- Keep annotation clearing on subject change.
- Don't touch the 2D floor-plan sheets (`src/export/sheetExport.js`). This phase is Sketch Studio CAD only.
- The worktree has large uncommitted work from earlier phases. Don't revert or reformat unrelated files, and don't commit.
