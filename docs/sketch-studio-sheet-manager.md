# Sketch Studio: managing drawing sheets and drawing one part (Phase S)

Status: spec 2026-11-08, for Opus 5.5 at effort high. The main loop audits the result.
Builds on Phase R (`docs/sketch-studio-drawing-fit.md`, uncommitted).

## 1. Problem (verified in source)

- **Sheets cannot be deleted.** No command, button or model helper removes a sheet:
  - grep for `sheets.filter` / `removeSheet` finds nothing;
  - the only way a sheet disappears is `removePart` (`model.js` ~266).
- **Sheets pile up.**
  - **Add part sheets** (`CadWorkspace.jsx` ~1662) appends one sheet per part **on every click**, even when that part already has a sheet.
  - **New engineering sheet**, **Section sheet** and **Exploded sheet** always append.
- **The sheet list is only a `<select>` of titles** (`CadWorkspace.jsx` ~2576). Duplicate titles cannot be told apart, and there is no rename/duplicate/delete.
- **Drawing one specific part is hard.** The user wants, say, only "Profile part 1". Today they must:
  1. find it in the tree or the viewport (inside a group they must open the group first);
  2. find **Drawing sheet** in the Properties panel, or run **New engineering sheet** from the ribbon.

  The Drawings tab itself offers no way to say "draw this part".

- **Generate views projects every sheet** (`kernel.js drawings()` maps `model.sheets`; `kernel.worker.js:33`):
  - with many sheets it is slow;
  - one bad sheet makes the whole request throw, so every preview fails. Example: a section that no longer crosses the model.
  - The SVG/DXF export (`exportFile`, ~1353) also projects all sheets just to take one.
- Model invariant: `normalizeModel` rejects a model with no sheets (`model.js:103`, "Keep at least one drawing sheet."). `kernel.js:765` reads `model.sheets[0]`.

## 2. Goals

1. Delete, rename and duplicate sheets, one at a time or several at once. Every change is undoable, and the model always keeps at least one sheet.
2. Drawing one part takes one or two clicks from the Drawings tab:
   - pick the part by name;
   - or click a draw icon on its row in the tree.

   The resulting sheet is fitted to the page (Phase R `scaleMode: 'fit'`) and its views appear without pressing anything.

3. Asking to draw a subject that already has a sheet **opens that sheet**, not a duplicate.
4. Previews generate **only the sheet being viewed**. A broken sheet only breaks itself.

## 3. Model helpers (`model.js`, pure, tested)

- `removeSheets(model, ids)`:
  - Returns the model without those sheets.
  - Throws `'Keep at least one drawing sheet.'` if that would leave none. Callers disable the action instead of relying on the throw.
- `duplicateSheet(model, id)`:
  - Deep copy with a new id and the title `"<title> (copy)"`, cut to the 65-character title-block limit.
  - Annotation ids are re-issued with `uid('annotation')`.
  - The copy is inserted right after the original.
- `sheetSubject(sheet, model)` returns `{ kind: 'part' | 'parts' | 'assembly', partId?, instanceIds?, label }`. Labels:
  - "Part · Profile part 1";
  - "Group · Frame", when the `instanceIds` set equals one group's members (use `memberIds` from `groups.js`);
  - "3 parts";
  - "Whole assembly".

  A section or exploded sheet appends " · section" / " · exploded".

- `findSheetFor(model, subject)`: the first **plain** engineering sheet with the same subject:
  - same `partId`, or the same `instanceIds` as a set, or both empty;
  - no `section`, and views that are not just `['exploded']`.

## 4. One "new sheet" path

Fold `newEngineeringSheet()` (Phase R, ~1361) into `openOrCreateSheet(subject, { forceNew = false })`:

- `subject` is `{ partId }`, `{ instanceIds, title }` or `{}` (whole assembly).
- If `findSheetFor` finds a match and `forceNew` is false, select that sheet; there is no commit.
- Otherwise create the sheet exactly as Phase R does: fit mode, title rules, pending generate.
- In both cases switch to the Drawings tab and split view.

These callers use it:

- the ribbon **New engineering sheet** (3D selection);
- `drawSelection`;
- the panel's New drawing row (§5);
- the tree draw icons (§6).

**Add part sheets** becomes **Add missing part sheets**:

- add sheets only for parts that have no plain sheet with that `partId`;
- new sheets get `scaleMode: 'fit'`;
- show the result inline: "Added 3 sheets" / "Every part already has a sheet".

## 5. Sheets panel (`SheetsPanel.jsx`, Properties `panel === 'sheets'`)

Opened in three ways:

- a ribbon command **Sheets** on the Drawings tab, placed first;
- a **Manage sheets** button next to the sheet `<select>` in the drawing pane;
- automatically when the Drawings tab opens and no other panel is shown. Leave this out if it would fight existing panel logic, and say so.

Contents, top to bottom:

1. **New drawing of** `[subject select]` `[Create]`. The select holds:
   - Whole assembly;
   - "3D selection (N)", only when something is selected;
   - optgroup **Parts**: one entry per part definition, by name, in tree order;
   - optgroup **Groups**.

   When `findSheetFor` matches, the button reads **Open sheet**, and a small **Create another** link calls `forceNew`.

2. **Sheet list**, one row per sheet in model order. Each row has:
   - a checkbox;
   - the title as a button that opens the sheet. Rename by double-click or F2, like tree rows (`commitRename` pattern); Enter commits, Escape cancels, an empty name is refused.
   - the `sheetSubject` label in `<small>`;
   - the page and resolved scale, e.g. "A3 · 1:50", with `resolveSheetScale` when the views are generated, else "A3 · Fit" / "A3 · 1:20";
   - **Duplicate** and **Delete** icon buttons with `aria-label`s that include the title.

   The current sheet is marked `is-selected` / `aria-current`.

3. **Bulk bar**, shown when any row is checked:
   - "N selected · **Delete selected** · Clear";
   - a **Select all** checkbox in the list header.
4. **Deletion rules:**
   - **Delete** is disabled on the last remaining sheet, and **Delete selected** is disabled when every sheet is checked. Both carry the title text "A model keeps at least one drawing sheet."
   - There is no confirm dialog; deletion is one commit, so Undo restores it.
   - After deleting, show an inline notice "Deleted N sheet(s) — Undo" with a button that calls the existing `undo`. It clears on the next commit.
   - If the open sheet was deleted, select the next row, else the previous one.
   - Clear any `scaleDraft` and the dimension tool that belong to a deleted sheet.

The sheet `<select>` in the drawing pane stays for quick switching. Its options read `"<title> — <subject label>"` so duplicate titles can be told apart.

## 6. Tree shortcut

While `tab === 'Drawings'`, every instance row and group row in the PARTS & FEATURES tree gets a trailing icon button, "Draw <name>":

- for an instance it calls `openOrCreateSheet({ partId: instance.partId })`;
- for a group it calls `openOrCreateSheet({ instanceIds: memberIds(model, [group.id]), title: group.name })`.

Its title is "Open or create a drawing sheet of this part". It shows only on the Drawings tab, so the other tabs don't get cluttered. It must not change the 3D selection or start a rename; stop propagation.

## 7. Generate only the viewed sheet

- `kernel.js drawings({ includeParts = false, sheetIds = null } = {})`. With `sheetIds`, map only those sheets. `includeParts` is unchanged.

  Also guard `model.sheets[0]` at ~765 with `?.` defaults. The invariant makes this belt-and-braces, but it costs nothing.

- `kernel.worker.js:33`: pass `data.payload` through. Check how `workerClient.request(type, payload, revision)` sends payload and match it.
- `CadWorkspace`:
  - `requestDrawings(ids = [sheet.id])` requests `drawings` with `{ sheetIds: ids }`.
  - It **merges** the results into the `drawings` cache when the cached `source` has the same geometry keys (`parameters, sketches, parts, instances, connections`); otherwise it replaces the cache.
  - The cache needs, per sheet, the sheet definition it was generated from, because `activeDrawing` compares `views/section/partId/instanceIds/explodeDistance` against it. Today it reads `drawings.source.sheets`, which a merge would make wrong. Store `{ sheet: definition, result }` per id, or an equivalent, and keep `generated` / `activeDrawing` / `drawingStale` semantics identical.
  - A per-sheet failure is stored as that sheet's error and shown in place of its preview. It does not throw away other sheets' results.
- **Auto-generate on view.** When the open sheet has no current views, generate it, but only when all of these hold:
  - `drawingStale` is "This sheet has no views yet" or a subject/view change;
  - `split` is on and `runtime.ready` and not `busy`;
  - no operation draft is open.

  Reuse the Phase R `pendingDrawings` effect pattern. Remember failed `(sheetId, source)` pairs so an error never loops; the **Update drawing preview** button still retries by hand.

- **Refresh drawings** and **Generate views** regenerate the current sheet.
- `exportFile('svg' | 'dxf')` requests only `[sheet.id]`.
- Vector PDF and the workshop ZIP stay on `export` (all sheets plus `includeParts`).

## 8. Tests

**`model.test.js`:**

- `removeSheets`: removes the sheets, and refuses to remove the last one.
- `duplicateSheet`: new ids, annotation ids re-issued, inserted after the original.
- `sheetSubject`: every label, including the group match.
- `findSheetFor`: ignores section and exploded sheets.

**`kernel.test.js`:**

- `drawings({ sheetIds })` returns only those sheets.
- A bad section sheet does not affect another sheet's request.

**`SheetsPanel.dom.test.jsx`:**

- row open, rename, duplicate and delete;
- delete is disabled on the last sheet;
- bulk Delete selected is disabled when all rows are checked;
- the Undo notice;
- New drawing of → Open sheet when one exists, and Create another.

**`CadWorkspace` dom tests:**

- the tree draw icon appears only on the Drawings tab and opens the existing sheet instead of duplicating;
- Add missing part sheets is idempotent;
- deleting the open sheet selects its neighbour;
- switching to an ungenerated sheet generates only that sheet: assert the request payload;
- a failing sheet shows its own error while another sheet still previews.

**Gate:**

- the full `npx vitest run` is green. Baseline is the Phase R result, about 5578 passing and 1 skipped. The known-flaky `CadWorkspace.place` "Flip side" test passes when run alone.
- `npm run lint` reports 0 errors;
- `npm run build` succeeds.

## 9. Keep / don't

- Keep Phase R behaviour and tests, including the `sheetBytes.test.js` digests.
- Keep the exports' refuse-overflow contract.
- Keep the rule that changing the subject clears annotations.
- Don't touch `src/export/sheetExport.js` (the 2D floor-plan sheets).
- Don't revert or reformat unrelated files; the worktree holds much uncommitted work. Don't commit.
- Update `docs/sketch-studio-cad.md` § Engineering drawings to cover:
  - the Sheets panel;
  - the tree draw icon;
  - Add missing part sheets;
  - deletion and Undo.
