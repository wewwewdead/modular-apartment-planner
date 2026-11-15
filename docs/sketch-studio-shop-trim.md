# Sketch Studio shop: no Weld station, no Assembly station (ST-1)

Status: spec, 2026-11-14. Not built.

## 1. What the user asked for

"In shop can we remove the welding and the assembly? I can combine the parts
using the Move part and Rotate part tools, so if I have metals that are cut
and bent I can form them into one form. In the real world I need to weld and
assemble the parts, but here it is a visualization and simulation of
products." Then: remove welding and assembly, and let users put the parts
together themselves.

Agreed, with the consequences in §2 stated to the user. The shop becomes
**Draw → Cut → Bend → Paint → Print**. Putting parts together is not a
station: it is Move part, Rotate part, snapping, Mate faces and Group, which
exist already.

## 2. What goes, what stays (read on today's code)

The Weld station (fab-shop SM-3) and the Assembly station (shop-floor SF-2)
only write records the kernel never reads (`model.welds`, `model.assembly`,
`KERNEL_INERT_KEYS` in `model.js`). Neither changes a part's shape or where
it stands. What they give today, and what happens to each:

| Today                                                                                                                                                           | After ST-1                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Route steps Weld (4) and Assembly (7), their panels, pick tools, state machines (`toolSession.js` `WELD`, `ASSEMBLY`)                                           | Removed. Five stations, renumbered 1–5                                          |
| Weld beads drawn on the model, the weld bench and assembly bench scenery (`shopDecor.js`), the assembly build-up mask and fly-in (`shopLayer.js` `setAssembly`) | Removed                                                                         |
| A weld makes a weldment: one group, moved as one, painted as one (`weldStation.js` `joinWeldment`, `weldedTo`; group flag `weldment`)                           | An ordinary group does this (`groups.js`). Paint offers the part's group (§4.4) |
| Assembly steps: order, approach side, which fasteners go on when; `stepsHolding`                                                                                | Removed                                                                         |
| Job sheet steps Weld and Assemble with seam time and assembly time (`jobSheet.js`)                                                                              | Removed; the sheet says what it no longer counts (§4.5)                         |
| Replay film's weld and assembly scenes (`shopFilm.js`)                                                                                                          | Removed (§4.6)                                                                  |
| Shop order rule: a welded or assembled part cannot go back on the brake (`brakeStation.js` `shopOrderBlock`, `finishedHere`)                                    | Only paint and print block                                                      |
| Cut list / shop record export rows and columns for welds (`shopRecords.js`, `fabrication.js`)                                                                   | Removed                                                                         |
| "Add bought-in item…" lives in the Assembly station (`boughtInItem`, `CadWorkspace.jsx`)                                                                        | Moves to Shop → More (§4.3)                                                     |
| Round corner pieces of the panel maker are welded to the flanges (weld records, weldment)                                                                       | Placed as today, grouped with their panel, no record (§4.7)                     |

Kept as they are, because they describe what a part **is**, not a step:
`part.purchased` (bought-in items), hardware parts (fasteners), and the rule
that Cut and Paint count fabricated parts only (`isHardware`, `isPurchased`,
`isFabricated`, `instanceKind`, `fastenerLabel`, `boughtInItem` in
`assemblyStation.js` — move these to a module that stays).

**Not the shop, not touched**: the Assemble tab's _Connections / welds_
(`model.connections` with `type: 'weld'`, `ConnectionEditor.jsx`, weld notes
on drawings in `drawings.js`, the welded tube table in `examples.js` and its
`weldGap` parameter), Mate faces (`mate.js`), Group / Ungroup, Add hardware
and its hole picking, `assembleAndDraw.test.js`, `verify-assemble-and-draw.mjs`,
the default "Assembly" drawing sheet, `assembly.step` and `ASSEMBLY.md` in
`exports.js`, "Whole assembly" in `groups.js`. These use the same words for
other things: do not remove by name.

## 3. Safety

Nothing in this tree is committed, so a deleted file cannot be recovered from
git. A copy of `src/features/sketchstudio/cad`, `docs` and `scripts` as they
stood before this work is at
`C:\Users\johnm\modular-apartment-planner-backups\2026-11-14-before-shop-weld-assembly-removal`.
Read from it if needed; never write to it. No git commit, stash, reset or
checkout.

## 4. The change

### 4.1 The route

`shopRoute.js` `ROUTE`: Draw, Cut, Bend, Paint, Print, numbered 1–5.
`routeProgress` and `partProgress` lose `weld` and `assembly`; `next` is the
first of Draw, Cut, Bend, Paint not done (Print optional, as now).
`stationEntry` loses the assembly case. The route bar, the job board, the
Back / Next buttons of every station and the keyboard order follow the list.
Bend's Next is Paint.

### 4.2 The records

- `emptyModel()` no longer has `welds` or `assembly`; they leave
  `KERNEL_INERT_KEYS`, `SHOP_RECORD_KEYS`, validation and `removeInstance`.
- **A file saved before this still opens** (`CAD_VERSION` stays 1): `welds`
  and `assembly` are dropped on load without being validated (a malformed one
  must not block the file), a group's `weldment` flag is dropped and the
  group stays an ordinary group with its name and members; parts, poses,
  finishes, prints, bought-in items and fasteners are untouched. If opening a
  file already has a place to say something to the user, say once: "This file
  had N weld seams and M assembly steps. The shop no longer has those
  stations, so they were left out." If there is no such place, say so in the
  report and leave it silent.
- Before changing anything, save today's kiosk and box example models (they
  hold seams, weldments and steps) as JSON fixtures, and test the load rule
  against them: every instance's part, position, rotation, group membership,
  finish and print equal before and after.

### 4.3 Putting parts together

No new tool. In the Shop tab, with no station open, Move part and Rotate
part (viewport toolbar) work on every part whatever its route state (cut,
bent, painted, printed), with the snapping they have (`boxSnap.js`). Shop →
More gains the commands a user needs without leaving the tab, each the same
command the Assemble tab runs (one implementation):

- **Group** / **Ungroup** (the selection),
- **Mate faces**,
- **Add bought-in item…** (the form the Assembly station had: name, W × D ×
  H, colour, reference). The item lands where a new part lands today
  (project rule: on the ground under the view centre, the camera does not
  refit) and is selected.

If any of these is not reachable or does not work from the Shop tab today,
fix that; if Move part / Rotate part are refused anywhere in the Shop for a
reason that came from welds or steps, remove the refusal.

### 4.4 Paint

`paintStation.js`: a pick paints the part; when the part is in a group, the
panel offers the group it belongs to (its own, innermost group) in place of
"the whole weldment" — fabricated members only, as the count rule has it. The
rule that painting or stripping removes prints stays. "Paint comes after
welding" goes.

### 4.5 Job sheet and exports

Steps Cut, Bend, Paint, Print. The total is their sum. Under the steps, an
untimed line per product for what is in it but not made here: bought-in
items and fasteners by label and count ("1 × Display 21.5 in (bought in), 8 ×
M4 × 12 pan head"). The estimate note says welding and assembly are not
counted. `shopRecords.js` and the CSV in `fabrication.js` lose the weld rows
and the weld-only columns.

### 4.6 Replay

Scenes: cut, bend, paint, print, finished. A fabricated part shows from its
first scene as today; bought-in items and fasteners, which the assembly
scenes used to bring on, show in the finished scene. The kiosk film's scene
count and length change: report both.

### 4.7 Panel maker, examples

- Round corners (`panelMaker.js` `cornerPieces`, `CadWorkspace.jsx`
  `cutFromSheet` companions): the corner pieces are cut, placed and grouped
  with their panel so they move as one; no weld record. The form's and the
  guide's wording says "set in the corner", not "welded".
- Box example: its seams go; the box and its lid stay one group.
- Kiosk example (`shopExamples.js`): the same parts, instances, poses,
  finishes, prints, bought-in items and fasteners; the product group and the
  frame group built directly with `groups.js` under the same names; no seam,
  no step. Assert the poses against the fixture of §4.2.

### 4.8 Remove, do not hide

Delete what is left without a caller: `weldStation.js`, `assemblyStation.js`
(after moving what §2 keeps), `AssemblyStation.jsx`, the weld panel in
`ShopStationPanels.jsx`, the weld and assembly branches of `CadWorkspace.jsx`,
`CadViewport.jsx`, `shopLayer.js`, `shopDecor.js`, `PressBrakePanel.jsx`, the
weld data in `shopCatalog.js` if nothing else reads it, their styles in
`cad.css`, the `ShopWeld` / `ShopAssembly` icons. No dead exports, no flags.
`partThickness` (in `weldStation.js`) is read by the job sheet: keep it where
it belongs if anything still needs it.

## 5. Tests, scripts, docs

- Delete only tests of removed behaviour; update the rest. Report the suite's
  count before and after, and every test file deleted or changed with one
  line why. A test of kept behaviour that sat in a removed file moves.
- Verify scripts: `verify-shop-floor-sf2.mjs` (the Assembly station) is
  deleted; the others that touch a seam or a step (`sm3`, `sm4`, `sf1`, `sf3`,
  `sf4`, `sf5`, `rb3` at least) are updated and must pass, keeping their
  paint, print, kiosk and replay coverage. New `scripts/verify-shop-trim-st1.mjs`,
  screenshots to `artifacts/sketch-cad/shop-trim-st1`:
  1. the route bar shows five stations, 1–5;
  2. Example: kiosk loads with its parts in place, painted, printed, no seam;
  3. an old-file fixture (§4.2) opens with the same poses;
  4. in the Shop tab: two parts cut and bent, one moved until it snaps flush
     to the other, rotated, the two grouped from Shop → More, then moved as
     one; the group painted in one pick;
  5. Add bought-in item… from Shop → More;
  6. Replay plays to the finished scene.
- `docs/sheet-metal-shop-guide.md`: Weld and Assembly sections go, stations
  renumbered, a new section **Putting the parts together** (Move part, Rotate
  part, snapping, Mate faces, Group, bought-in items, fasteners), the kiosk
  walk-through, Job sheet, Replay and Limits brought in line.
  `docs/state-machines.md`: the two machines removed.
  `docs/sketch-studio-fab-shop.md` and `docs/sketch-studio-shop-floor.md`: a
  dated note at the top that the Weld station and the Assembly station were
  removed by this spec; their history stays. Append "ST-1 as built" here.

## 6. Acceptance

`npm test`, `npm run lint` (0 errors), `npm run build`, every remaining
`verify-fab-shop-*`, `verify-shop-floor-*`, `verify-round-bend-*`,
`verify-brake-*` script and the new one pass. No file under
`src/features/sketchstudio/cad` mentions the shop's weld or assembly
stations except the load rule of §4.2 and the things §2 lists as not the
shop. The press brake, laser, paint and print stations behave as before
apart from §4.1 – §4.4.

## 7. Not in scope

The Assemble tab's Connections / welds; new snapping or mating tools; a
bill of fasteners beyond the job sheet line; costing.

## 8. ST-1 as built (2026-11-14)

- **Route**: Draw, Cut, Bend, Paint, Print (1–5). `toolSession.js` keeps
  paint, print, laser and film; `docs/state-machines.md` loses `cad-weld` and
  `cad-assembly`.
- **Deleted**: `weldStation.js`, `assemblyStation.js`, `AssemblyStation.jsx`,
  their tests, `CadWorkspace.assembly.dom.test.jsx`, the weld panel, the
  weld/assembly branches of the workspace, viewport, shop layer, decor and
  press brake card, the weld catalog data, their styles, the `ShopWeld` /
  `ShopAssembly` icons, `scripts/verify-shop-floor-sf2.mjs`.
- **Kept helpers** moved to the new `shopParts.js` (`isHardware`,
  `isPurchased`, `isFabricated`, `instanceKind`, `fastenerLabel`,
  `boughtInItem`, and `notMadeHere` for the job sheet line); the hole
  line-up tests moved to `mate.test.js`, the blank-hole test to
  `sheetMetal.test.js`. `partThickness` had no reader left and went.
- **Old files**: `normalizeModel` drops `welds` and `assembly` unread and a
  group's `weldment` flag (`withoutShopStations` in `model.js`). Opening a
  file has no place to tell the user, so it is silent. Fixtures
  `cad/fixtures/kiosk-before-shop-trim.json` and
  `control-box-before-shop-trim.json` were saved before any change; every
  instance's part, position, rotation, group, finish and print match after
  load, and the rebuilt examples equal the fixtures less those three keys.
- **Shop → More** gains Group, Ungroup, Mate faces (the Assemble tab's
  commands) and Add bought-in item… (lands under the view centre, selected).
  Move part / Rotate part work on painted and printed parts; the press brake
  says the shop order is cut → bend → paint → print.
- **Paint** offers "Paint the whole {group} (N parts)", the part's innermost
  group, fabricated members only.
- **Job sheet**: Cut, Bend, Paint, Print; a "Not made here (not timed)" line
  per product (bought in first, then fasteners, × batch) and a CSV row; the
  note says welding and assembly are not counted. `shopRecords.js` and the
  shop CSV lose weld rows and weld-only columns.
- **Replay**: cut, bend, paint, print, finished; bought-in items and
  fasteners are hidden until the finished scene (`filmHidden` mask in the
  shop layer). Kiosk 36 scenes / 97.7 s → 25 / 66.9 s; control box 14 /
  36.2 s → 12 / 30.7 s.
- **Panel maker**: round-corner pieces are cut, placed and grouped with their
  panel (group named after the panel), "set in the corner".
- **Examples**: kiosk 8 parts, 37 instances, 2 groups (product, "Kiosk
  frame"), 11 finishes, 2 prints, 64 bend hits — unchanged; box 2 parts, one
  group. No seams, no steps.
- **Verify**: new `scripts/verify-shop-trim-st1.mjs` (six checks);
  `sm1`–`sm4`, `sf1`, `sf3`, `sf4`, `sf5`, `rb3` updated.
- **Audit follow-up**: `jobProducts` takes a top-level node as a product only
  when one member is made here, so a loose bought-in item (like a loose
  fastener) has no job board card, job sheet product, route or Replay; with
  it selected the route shows the one product, if there is one, or none.
  After Add bought-in item… the status line says once, while the item stays
  selected: "{name} is in the view. Move it into place, then group it with
  its product (More → Group)."
