# Sketch Studio shop — a deleted sheet gives its drawing back (RC-1), the Cut station picks drawings (RC-2)

Status: **RC-1 + RC-2 built + audited 2026-11-19 (§8, §9), uncommitted; awaiting the user's verdict.**

Related: `docs/sketch-studio-outline-edit-sheet-nest.md` (OE-1 outlines, SN-1 the batch cut
and the shared sheet, §4.8), `docs/sketch-studio-shop-floor.md` (§4.3 the one way into a
station), `docs/sketch-studio-remove-part.md` (removePart, §3.3), `docs/state-machines.md`.

## 1. What the user said (2026-11-19)

"the bug i encounter is when i delete the bended sheet and i want to cut it again then when
i go to laser shop the drawing is not showing there so i can cut. My idea is if … i draw 5
drawings different parts … if i go to lasers shop i can pick and select the drawing i want
to cut like select all grab and it will select all the lines that are connected or the
drawing then i can click cut then it will cut on the laser. … this is better Ux"

## 2. What was read and found

### 2.1 The bug (reproduced on the user's tray, `scripts/fixtures/corner-gaps-sample-bending.json`)

| After                                               | parts | instances | outlines ready | Cut opens                                     |
| --------------------------------------------------- | ----- | --------- | -------------- | --------------------------------------------- |
| as saved                                            | 1     | 1         | 0              | the laser on the part                         |
| Delete key / **Remove instance** (`removeInstance`) | 1     | 0         | **0**          | "Nothing to cut yet: draw the outline first." |
| **Remove part** (`removePart`)                      | 0     | 0         | 1              | Cut from sheet on the outline                 |

- The Delete key and the tree go through `removeBody` (CadWorkspace.jsx :1298), the
  Properties button through **Remove instance** (:7675): both call `removeInstance`
  (model.js :443), which leaves the part definition. Only hardware loses its definition
  with its last instance (remove-part §3.3).
- `isShopOutline` (shopRoute.js :66) calls a sketch an outline only while
  `sketchConsumer` finds no part made from it. The definition with no instance still
  counts, so the drawing never comes back: not in Draw, not at Cut.
- The definition is still listed under "Reusable definitions" (CadWorkspace.jsx :5473,
  "Place an instance"), which no shop user looks at.

### 2.2 How Cut is entered today

- `stationEntry` (shopRoute.js :313) for Cut: a chosen part → the laser on it; else one
  sheet-metal part → the laser on it; several → the "which part" gate; **only with no
  part at all** the outlines (one → `{ kind: 'sketch' }`, several → `{ kind: 'batch' }`
  of all of them). So with one part cut, four more drawings are invisible from Cut: they
  are reached only through Draw → Cut this / Cut all.
- `CutFromSheetPanel` (ShopPanels.jsx :239): `SingleCutPanel` (one outline: stock,
  thickness, Quantity, Edit outline) and `BatchCutPanel` (:431: the outlines handed
  over, each with Quantity and **Leave out**, one stock and thickness, "Cut on the
  laser" → `onCreate({ items })` → `cutFromSheet`, CadWorkspace.jsx :1376). A row left
  out is gone until the user goes back to Draw.
- The view draws the outlines only while Draw is open (`outlinesShown`, CadWorkspace.jsx
  :4288; `shopOutlineView(model, params, chosen)`, shopRoute.js :111, one chosen id;
  `drawShopOutlines`, CadViewport.jsx :3633: lines one pixel wide, a fill for the chosen
  one only). Nothing in the view can be clicked.
- The laser panel offers "Draw another part" when the sheet has room (LaserStation.jsx
  :216), never "cut another outline".

## 3. RC-1 — a sheet-metal part goes with its last blank

A sheet-metal part is its blanks on the floor (job sheet, film and route all count
instances). With none left it is no part.

- `model.js`: removing an instance that is the **last instance of a part with a
  sheet-metal feature** removes the part too (`removePart`), unless another part uses it
  as a Boolean tool (then the instance only, as today). One helper, used by every path
  that removes instances by hand: `removeBody` (Delete key, tree, several selected at
  once), **Remove instance**. Its drawing sheets go with it, as `removePart` already does.
  The laser's Quantity (:2660–2672) never removes the lead and is untouched.
- On load (`sketchDocumentUtils.js` :133, beside `removeEmptyParts`): a sheet-metal part
  with no instance, not a Boolean tool, is removed, so files saved with the bug get their
  drawings back. The sketch stays.
- One Undo brings instance and part back together (it is one commit).
- Nothing else changes for boards, tubes and other parts: their definitions stay.

Acceptance: the table of §2.1 with the middle row reading 0 parts, 1 outline ready, Cut on
the outline; two blanks of one part: deleting one keeps the part; a part used as a Boolean
tool keeps its definition; load prunes; Undo restores.

## 4. RC-2 — Cut picks the drawings

### 4.1 When the picker opens (`stationEntry`)

Cut, in this order:

1. a chosen sheet-metal part → the laser on it (as today);
2. **any outline ready to cut and (several outlines, or at least one sheet-metal part)**
   → the picker (new), nothing selected;
3. exactly one outline ready and no part → Cut from sheet on it (as today);
4. no outline ready → as today (one part: the laser; several: the gate; none: "Nothing
   to cut yet: draw the outline first.").

Draw → **Cut this** keeps opening `SingleCutPanel` on that outline. Draw → **Cut all N
outlines** opens the picker with all of them selected. The 2D drawing's "Cut all" and the
Rectangle tile keep today's panels.

### 4.2 The picker (panel `shop-cut`, region "Cut from sheet")

One screen: choose, set the sheet, cut. It replaces `BatchCutPanel` for sketch outlines.

- Lead: "Choose the outlines to cut, then the sheet stock."
- List `aria-label="Outlines to cut"`: **every** outline ready to cut, in model order.
  Each row: a checkbox (`aria-label="Select {name}"`), the thumbnail, name, W × H,
  `Quantity of {name}` (shown while selected, 1 – `MAX_LASER_QUANTITY`), and **Edit**
  (`aria-label="Edit {name}"`: the sketcher, back to the picker with the selection, the
  quantities and the sheet as they were). A row that does not make a blank at this stock
  says why and cannot be selected.
- **Select all** / **Select none**, and a count: "2 of 5 selected".
- The view shows every outline while the picker is open: a selected one opaque with its
  face filled, the others faded. **A click inside an outline in the view toggles it**
  (the whole drawing: its outline and cut-outs are one thing). A part in front of it
  takes the click as today. The cursor says it can be clicked. Camera untouched.
- Stock and thickness (`StockFields`), then the line "One sheet is one stock and
  thickness: every outline selected is cut from it." and the figure `aria-label="Batch"`:
  "N blanks from M outlines".
- Primary **Cut on the laser**: off with nothing selected; calls `onCreate({ items })`
  exactly as the batch does today (one item when one is selected).
- Below, when there are sheet-metal parts: **Already cut** (`aria-label="Already cut"`):
  each part (name, t and stock, × blanks) with **Open on the laser**
  (`aria-label="Open {name} on the laser"`) → `goStation('cut', { instanceId })`.
- Not ready outlines are not listed here (Draw has them, with why).

### 4.3 The laser panel

When outlines are ready to cut, the laser panel shows "N outline(s) waiting to be cut."
with **Cut another outline** → the picker. Off while cutting.

### 4.4 Not in RC-2

Cutting a second separate part from a drawing that already has one (use Quantity; or
delete the part). Box selection in the view. Mixed thicknesses in one cut. Rotating or
dragging blanks on the sheet.

## 5. Acceptance

### 5.1 Unit and DOM tests

- `model` tests: RC-1's helper (last blank, one of two, Boolean tool, several ids at
  once, groups pruned); the load prune.
- `shopRoute` tests: `stationEntry` rows 1–4 of §4.1 (one outline + one part → picker;
  five outlines → picker; one outline alone → single; a chosen part wins); `readyOutlines`
  after a removal.
- `shopOutlineView` with several selected ids.
- Picker DOM tests (new file): rows, select / none / all, the count, quantities kept
  while a row is unticked and ticked again, a problem row, the primary off with none,
  `onCreate` items for one and for three, Already cut rows and their button, Edit hands
  the state back.
- A `CadViewport` DOM test: a click inside an outline calls the pick callback with its
  sketch id; outside, nothing; with no callback (Draw) nothing changes.
- A `CadWorkspace` DOM test: cut one of two outlines → the route's Cut opens the picker
  with the other one listed and the part under Already cut; delete the bent sheet with
  the Delete key → its outline is back in the picker and in Draw; Undo → the part again.
- Existing assertions that pinned **Leave out**, or Cut opening straight on a part or a
  batch where §4.1 now gives the picker, are rewritten deliberately: list each one in the
  as-built section. Nothing else is edited.

### 5.2 Browser — `scripts/verify-cut-pick-rc.mjs`

Style of `scripts/verify-sheet-nest-sn1.mjs`, screenshots at 1600 × 1000 and 1366 × 768
into `artifacts/sketch-cad/cut-pick-rc`:

1. Shop → Draw: five rectangles side by side in one sketch → Finish → five outlines.
2. Route **Cut** → the picker, "0 of 5 selected", the view shows five outlines.
3. Click two outlines in the view → their rows are ticked, "2 of 5 selected"; untick one
   in the list → the view follows.
4. **Select all** → 5; set one Quantity to 2; 1.2 mm SPCC → "6 blanks from 5 outlines".
5. Untick three → **Cut on the laser** → the laser, the cut runs, two parts.
6. Route **Cut** again → the picker: three outlines, two parts under Already cut.
7. Select a cut part in the view, press Delete → the picker lists four outlines, one
   part under Already cut; Draw lists four. Undo → three and two.
8. Bend one part (one bend), delete it → its outline is back; cut it again from the
   picker → a flat blank, no bends.
9. On the laser: "… waiting to be cut" → **Cut another outline** → the picker.
10. No page error, no `.cad-error`.

Still passing (update only the steps §4.1 changes, and say which): `verify-sheet-nest-sn1`,
`verify-bend-queue-bq1`, `verify-outline-edit-oe1`, `verify-shop-floor-sf1`,
`verify-fab-shop-sm1` … `sm4`, `verify-bend-relief-br1`, `verify-corner-gaps-cg1`; the
whole unit suite (7123 before), lint 0 errors, `npm run build`.

## 6. Words for the user

`docs/sheet-metal-shop-guide.md`: "2 · Cut — the laser" gains **Choosing what to cut**
(the picker, clicking drawings in the view, Select all, Already cut) and one paragraph
"Cutting a part again" (delete the sheet: its drawing is back; more of the same: Quantity).
"Several parts in one go" is brought in line (ticks, not Leave out). `docs/state-machines.md`:
the Cut entry and the picker's state.

## 7. Design calls that are the spec's own (the user has not ruled)

- Deleting the last blank deletes the sheet-metal part (bends and all), also on load.
- Route Cut opens the picker with **nothing** selected (the user's words: "pick and
  select"); Draw's Cut all opens it with all selected.
- One outline and no part still skips the picker.
- A click anywhere inside a drawing selects it (a one-pixel line is hard to hit).
- One screen (choose + sheet + cut), not a step before today's panel.

## 8. RC-1 + RC-2 as built (2026-11-19)

Built as §3 and §4 say, with the differences below. No model key, nothing persisted: the
picker is pane state (`cutOutline = { kind: 'pick', selected, quantities, stock, thickness }`).

**Files.** Changed: `model.js` (`removeInstances`, `removeBlanklessParts`, both on one
private `removeBlanklessSheetParts`), `sketchDocumentUtils.js` (the load prune, after
`removeEmptyParts`), `shopRoute.js` (`stationEntry`'s Cut rows and `fromSelection`,
`cutParts`, `shopOutlineView` takes several chosen ids), `ShopPanels.jsx` (`PickCutPanel`
behind `CutFromSheetPanel`), `ShopFloor.jsx` (Cut all outlines → `{ kind: 'pick',
selected }`), `LaserStation.jsx` (`waiting`, `onCutAnother`), `CadViewport.jsx`
(`onPickOutline`, `outlinePickAreas` / `outlineAt`, the pointer cursor, `cadOutlineAt`
for browser checks), `CadWorkspace.jsx` (`removeBody` and Remove instance through
`removeInstances`, `goStation` passes `fromSelection`, `pickShown` / `toggleCutOutline`,
`waitingOutlines`, Edit back to the picker), `cad.css`. Tests: new
`ShopPanels.pick.dom.test.jsx`, `CadViewport.cutPick.dom.test.jsx`,
`CadWorkspace.cutPick.dom.test.jsx`; cases added to `model.test.js` and
`shopRoute.test.js`. Script: new `scripts/verify-cut-pick-rc.mjs`. Docs: the guide
("Choosing what to cut", "Cutting a part again", "Several parts in one go"),
`state-machines.md` (the Shop floor route row, the viewport row, `cad-laser`).

**Differences from §3 / §4 and choices.**

1. `fromSelection` (§4.1 row 1). "A chosen part → the laser" would have sent the
   route's Cut straight back to the laser after every cut, because the part just cut
   stays selected: §5.2 step 6 could never show the picker. So a part the route was
   **sent to** (a job board row, a gate row, Back / Next, Open on the laser, the bend
   queue: `goStation('cut', { instanceId })`) opens the laser; a part that is only the
   selection does not skip the picker while an outline waits. With no outline waiting
   the selection's part opens the laser as before.
2. `BatchCutPanel` (and its **Leave out**) stays for the 2D drawing's Cut all {n}; the
   picker replaces it for sketch outlines only (§4.2 said so; §6's "ticks, not Leave
   out" holds for outlines).
3. Cut another outline (§4.3) opens the picker on the laser's stock and thickness, not
   the defaults.
4. A click in the view that hits neither an outline nor a part does nothing (the
   picker stays, the selection stays). The origin plane tiles are off under the picker.
   Of two outlines one inside the other, the smaller is the one picked. Only an outline
   ready to cut can be picked.
5. Edit from the picker always comes back to the picker; an outline the edit left not
   ready leaves the list and a line says "{name} is not ready to cut now: Draw lists it
   with why."
6. A ticked row that makes no blank at the chosen stock is not cut and does not count
   ("N of M selected" counts what will be cut); its tick comes back with a stock that
   takes it. A quantity is kept while its row is unticked.
7. The panel adds one help line: "Or click a drawing in the view to select it; click it
   again to leave it out."

**Wrong in §2 / §5.** §2.1 says the Delete key removes a part: parts have no Delete key
in the 3D workspace (CadWorkspace.jsx :1135, Delete removes a mark only). The ways a
blank is removed by hand are **Remove instance** and **Remove N parts** / **Remove
group** (`removeBody`), and both go through `removeInstances`. §5.1's workspace test and
§5.2 step 7 therefore use Remove instance.

**Existing assertions rewritten (§5.1).**

- `shopRoute.test.js`: Cut with several outlines and no part → `{ kind: 'pick',
selected: [] }` (was the batch of all); a non-sheet part beside them → `'pick'` (was
  `'batch'`).
- `ShopPanels.dom.test.jsx`: Draw's Cut all outlines calls `onOutline({ kind: 'pick',
selected: ['a', 'b'] })` (was the batch). Its `BatchCutPanel` cases (Leave out) are
  unchanged.
- `CadWorkspace.nest.dom.test.jsx`: the picker's lead and "3 of 3 selected"; a row
  unticked instead of Leave out (the list keeps 3 rows); the route's Cut reads "0 of 3
  selected".
- `scripts/verify-sheet-nest-sn1.mjs`: the same step (untick instead of Leave out).
- `scripts/verify-outline-edit-oe1.mjs` step 8 (changed in the audit): with a part bent
  and another outline waiting, the route's Cut is the picker; the script goes on through
  Already cut → Open on the laser.

## 9. Audit (2026-11-19)

The builder's session was closed before it reported, so §8 is written from the code.
Read: `removeInstance` / `removePart` / `removeInstances` / `removeBlanklessParts`
(model.js), the load chain (sketchDocumentUtils.js), `stationEntry`, `cutParts`,
`shopOutlineView` (shopRoute.js), `PickCutPanel` (ShopPanels.jsx), `goStation`,
`pickShown`, `toggleCutOutline`, `waitingOutlines`, the two Remove buttons, Edit's return
(CadWorkspace.jsx), `outlineTarget` and the click order in `pointerUp` (CadViewport.jsx),
the laser's waiting line (LaserStation.jsx), the three new test files, and the
screenshots of `verify-cut-pick-rc`.

Reran: the whole suite (589 files, 7144 passed, 1 skipped; 7123 before), lint (0
errors), `npm run build` (pass), and in the browser `verify-cut-pick-rc`,
`verify-sheet-nest-sn1`, `verify-bend-queue-bq1`, `verify-shop-floor-sf1`,
`verify-fab-shop-sm1` … `sm4`, `verify-bend-relief-br1`, `verify-corner-gaps-cg1` (all
pass). `verify-outline-edit-oe1` failed at step 8 on the new Cut entry and passes with
the step updated (§8). No code was sent back.

Left as built, for the user to rule on: with a part selected and another outline
waiting, the route's **Cut** opens the picker, and the part's laser is one more click
(Already cut → Open on the laser).
