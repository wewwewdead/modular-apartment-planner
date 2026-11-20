# Sketch Studio — corner gaps (CG)

Status

- CG-1 (see the gaps): BUILT + audited 2026-11-18, uncommitted (as built and audit: §3.5).
- CG-2 (set a gap): BUILT + audited 2026-11-18, uncommitted (as built and audit: §4.5).
- CG-3 (the brake checks the sheet's thickness): BUILT + audited 2026-11-18, uncommitted (as built and audit: §5.2).
- CG-4 (what the real shop holds): BUILT + audited 2026-11-18, uncommitted (as built and audit: §6.3; the band's formula revised at the audit, §6.1).

All lengths in mm. "Flange" here is any rigid piece of the folded part other
than the base (`fold.rootPiece`); "end" is a cut edge of the blank seen folded
(a face one sheet thickness high).

## 1 · The request

2026-11-18, the user: "how can we make the bending gaps more closer to each
other? … why i cant close the gaps as much as 0.2mm. I want the bending shop
to be more precise and robust to use so that when i go to the real physical
world, i can be more ready". Their file:
`C:\Users\johnm\OneDrive\Documents\sample_bending.json` (read it, never write
it). One sheet-metal part, t 1.2 SPCC, a tray with a wall and a returned lip on
all four sides: eight 90° up bends (A 102 punch, V8 88° die), lips mitred 45°,
a 2 × 2 relief notch at each corner.

### 1.1 What the file folds to (probe, plain node on `sheetMetal.js`)

Every bend: r 1.28, K 0.43, BA 2.8212 (h = BA/2 = 1.4106), OSSB 2.48, BD 2.1388.
A flange's inside face stands h − r = **0.1306 inside its bend line**, its
outside face 1.0694 outside it. The bend line is the middle of the bend zone.

Top-right corner, folded (the other three are the same to ± 0.02):

| Pair                                                    | Gap today                   |
| ------------------------------------------------------- | --------------------------- |
| bend 8 flange (rear wall), end → bend 5 flange, inside  | 0.734 (and 1.219 beside it) |
| bend 5 flange (right wall), end → bend 8 flange, inside | 1.219 (and 0.734 beside it) |
| bend 1 flange ↔ bend 3 flange (the lip mitres)          | 1.352                       |

The full table: walls 0.717 – 0.734 one way and 1.219 the other, mitres 1.329 –
1.352. The front and rear walls are 0.5 lower than the left and right ones
(inner bends 19.5 from the outer ones against 20), so the lips do not meet
level either.

### 1.2 Why 0.2 mm could not be reached

The fold itself takes it: with the two wall-end edges moved to computed places
the same part folds with both wall gaps at 0.5, 0.2, 0.1 and 0.0. What stops
the user is everything around it:

1. **Nothing shows a gap.** No readout of how far two flanges stand apart;
   Measure is off in a shop session; the only clearance check
   (`pieceClearances`, `panelMaker.js`) runs for the flanged-panel maker alone.
2. **A flange does not land on its bend line** but 0.13 inside it (inside
   face), and the brake's L is a flat distance. The edge that sets a gap has to
   be placed against a face nobody is shown.
3. **An outline edge cannot be moved.** The sketcher has no move or nudge: an
   edge is deleted and redrawn, clicks within 8 px of a corner snap to it, the
   grid is 1 mm by default (`sketchReducer` has `select` and `delete` only).
4. **The refusal is a cliff with no words.** A relief that leaves metal within
   h of both bend lines is refused with "Bend 8 crosses bend 5." Probe: notch
   edge at x = 286.84 folds, 286.83 is refused (the line is at 286.835).
5. **Nothing checks the sheet's thickness.** The brake's own "part hits
   itself" test is on the mid-surface: an overlap under t/2 = 0.6 goes unseen,
   so there is no floor to tune against either.

### 1.3 The answer in one line

Show every gap to 0.01 mm, let the user type the gap and have the app move the
outline edge, and make the brake refuse metal inside metal.

### 1.4 Proof it works on the user's part (scratchpad prototype, not kept)

`flangeGaps` as specced below gives 16 rows on the file (12 after the two
sides of a mitre are one row). Moving each row's edge once by (gap − 0.2) / k
(half each for a mitre), sliding the corners along the neighbouring edges:
**every row 0.200 (worst 0.0004 off) after one pass**, the part folds, the
brake's `sequenceChecks` passes all 8 steps, `pieceClearances` reads least
0.200. Two new warnings: `outline-not-square` on bends 3 and 4 (the mitre now
starts 0.05 inside the lip bend's line; before it started 0.15 outside it).
Blank after, top-right corner: (321.8347, 67.9947) (306.7813, 83.0481)
(287.0007, 83.0481) (286.9706, 81.0294) (284.9706, 81.0294) (284.9706, 83.0294)
(286.5042, 83.0294) (286.5042, 103.3104) (271.9359, 117.8787).

Prototype files, for reference only (the `beside` there is sampled; build it
exact): scratchpad `gaps.mjs`, `probe4.mjs`, `mkafter.mjs`, `probe5.mjs` under
`C:\Users\johnm\AppData\Local\Temp\claude\C--Users-johnm-modular-apartment-planner\e71efd46-151d-4923-a4bd-a2f7bc051ec6\scratchpad\`.

## 2 · What exists (anchors, verified 2026-11-18)

- `sheetMetal.js`: `foldSheet` → `{ thickness, blank: { outer, holes }, pieces:
[{ id, outer, holes, path (bend ids from the root), matrix }], bends: [{ id,
index, fixedPiece, movingPieces, allowance, radius, … }], warnings }`.
  `cutBlank` (973): strips of two bends may not overlap inside the material
  (> 1e-6 mm²) → `crossingError` (`error.crossing { bend, other, along }`).
  Pieces are `material − strips`; metal of a flange beyond the end of its bend
  interval stays rigid with the flange (an "ear": correct, the user's part has
  them).
- `panelMaker.js` 1019 – 1126: `pieceSolid`, `pointTriangle`, `pieceClearances`
  (points every 2 mm against triangles, pairs joined by a bend left out).
  `PANEL_DEFAULTS.gap = 0.2`.
- `brakeCollisions.js`: `triangulateRing` (146), `trianglesCross` (291, strict:
  touching is no crossing), the part-itself test on the mid-surface (993 –
  1005, `SIMPLIFY = 0.25`).
- Outline write path: `sketch.profile` is what folds; `sketch.entities` is the
  editing copy, reused by `editableEntities` (`sketchOperations.js:231`) only
  while `entitiesToProfile(entities).profile` equals the profile as JSON.
  `outlineEditRefusal(model, sketchId, profile, params)` (`shopRoute.js:139`)
  is the guard; one `commit({ ...model, sketches })` (`CadWorkspace.jsx:954`)
  is one undo entry; `perform` (2920) shows errors. `sketchEditProblem`
  disables "Edit outline" (`ShopPanels.jsx:956`).
- Panels: `SheetMetalForm` (`ShopPanels.jsx:945`), `PressBrakePanel`
  (`PressBrakePanel.jsx:647`, `station.fold`), `MachineNumbers` / `Readout` /
  `ProblemCard` (`ShopFloor.jsx:435 / 474 / 414`), styles in `cad/cad.css`
  (`--shop-*` tokens at 2664).
- 3D at the brake: `shopLayer.js` `showHit` (477) and `markPunchLine` (452) are
  the overlay precedents; the view is fed by the brake's `view`. Flat map:
  `FlatPatternMap.jsx` (SVG in flat mm, y flipped).

## 3 · CG-1 — see the gaps

### 3.1 `cornerGaps.js` (new, pure: no three, no DOM)

```js
export const GAP_REACH = 3; // rows further apart than this are left out
export const FACING = 0.94; // cos 20°: two faces face each other
export const OVERLAP_SKIN = 0.005; // deeper than this is metal inside metal

straightEdges(profile, (params = {}));
// every straight cut edge of the blank, in profile order:
// [{ loop (0 = outline, 1 … = cut-outs), index (its place among that loop's
//    segments / edges), a, b }]  — path `line` segments, polygon and rectangle
//    edges; arcs, circles and splines have none.

flangeGaps(fold, profile, (params = {}), ({ reach = GAP_REACH } = {}));
// → { rows, overlaps, least }
```

**Faces.** Of a piece, posed by `piece.matrix`: its two sheet faces (flat
z = 0 and z = t) and one end face per edge of `piece.outer` / `piece.holes`
that lies on a straight cut edge of the blank (`straightEdges`; both ends on
it within 1e-6). An edge of a piece made by a bend zone's strip is no face. A
chord of a sampled curve is no face.

**A row** is an end face A of one piece against a face B of another piece
that is not joined to it by a bend, when

- they face each other: −(n_A · n_B) ≥ `FACING` (unit normals, folded frame;
  an end's normal is its flat outward normal turned by the piece's matrix),
- `gap`: the least, over A's four corners, of the signed distance along n_A to
  B's plane; |gap| ≤ reach,
- `beside`: A's four corners pushed along n_A onto B's plane, then the exact
  distance in that plane between that quadrilateral and B's face (0 when they
  overlap; segment–segment distances and containment, no sampling);
  beside ≤ reach.

```js
row = {
  key,        // stable across an outline edit: a.path > b.path > b.kind/side, numbered when not unique
  a: { piece, bend (index of the bend whose flange it is, null: the base), path, segment: { loop, index }, flat: [p, q] },
  b: { piece, bend, path, kind: 'face' | 'edge', side: 'inside' | 'outside' (a sheet face, by b's own bend direction; the base: 'top' | 'underside'), segment?, flat? },
  gap, beside,
  distance,   // beside ? hypot(max(gap, 0), beside) : max(gap, 0)
  k,          // −(n_A · n_B): the gap closes k mm per mm the edge moves out
  at: [P, Q], // the closest points on A and on B, folded part frame (for the marker)
  both,       // true: edge against edge; the mirror row is folded into this one
  overlap,    // gap < −OVERLAP_SKIN and beside = 0
}
```

Several rows of one blank segment against one face of one piece: keep the
smallest gap. `rows` sorted: overlaps first, then by `distance`.

**`overlaps`**: pairs of pieces not joined by a bend whose solids cross at the
sheet's true thickness, each sheet face pulled in by `OVERLAP_SKIN` (so a
flange lying against a face, gap 0, is no overlap): `[{ pieces: [id, id],
bends: [index | null, index | null], row: key | null }]`. Reuse
`triangulateRing` / `trianglesCross`; box test first. `least`: the smallest
`distance` over the rows, 0 when anything overlaps, null with no rows.

`gapLabel(row)`: "Bend 8 flange, end → bend 5 flange, inside face" /
"Bend 1 flange ↔ bend 3 flange, edge to edge" / "… → the base, top".
`gapText(row)`: "0.73 mm", with " · passes 1.22 mm beside it" when beside >
0.005, "runs 0.30 mm into it" for an overlap. Two decimals, as every length
in the shop.

Cost: on the user's part (9 pieces) under 5 ms; measured and written in §3.5.

### 3.2 `FlangeGaps.jsx` (new)

`FlangeGaps({ fold, profile, params, onHover = null, children })`: computes
`flangeGaps` in a memo and renders

- one line always in sight: "Flange gaps: least 0.72 mm · 12 within 3 mm"
  (or "Flange gaps: none within 3 mm"; nothing at all for a part with no two
  flanges near each other and no bends),
- a `ProblemCard` (tone warning, label "Overlap") per overlap: "Bend 8's
  flange runs 0.30 mm into bend 5's flange. Real sheet cannot: give that gap
  0 mm or more.",
- the rows in a `<details>` (open by default while any row is under 1 mm or
  overlaps; the user's toggle remembered like `MachineNumbers`, key
  `cad-shop-numbers:gaps`): label, text; `onPointerEnter` / `onFocus` →
  `onHover(row)`, leave / blur → `onHover(null)`,
- a thumbnail of the flat blank (inline SVG, the outline + the bend lines,
  ≤ 180 px budget of the sidebar stylesheet respected): every row's edge(s)
  marked, the hovered row's drawn in `--shop-accent`,
- `children` (CG-2 puts its controls here).

### 3.3 Where it shows

- **`SheetMetalForm`** (`ShopPanels.jsx`): after the fold's own warnings,
  before "Bends, in the order they are made". Hover marks the thumbnail only.
- **`PressBrakePanel`**: after the "Folded X × Y × Z" line, read from the part
  as made so far (every stored bend at its made angle, not the scrubbed or
  pending pose). Hover → the brake's view gets `gap: { at, overlap }` → a
  marker in the 3D view (`shopLayer.js`, a `showGap` beside `showHit`: a line
  between the two points with end ticks, in the part's frame so it follows
  the part, `depthTest: false`, no raycast, `--shop-accent` / red for an
  overlap) and the row's edge(s) drawn on `FlatPatternMap` (a new optional
  prop, e.g. `gapEdges`). `cadShop()` (the test hook) reports the marker.

No new session state beyond the hovered row; `docs/state-machines.md` gets a
line under `cad-brake` only if a session field is added.

### 3.4 Acceptance

Unit (`cornerGaps.test.js`), on a fixture of the user's part (copy the
feature and the profile into `cornerGaps.fixtures.js`):

1. 12 rows; the eight wall rows 0.717 – 0.734 / 1.219 with `beside` the other
   number (± 0.002); the four mitre rows `both`, 1.329 – 1.352; no overlaps;
   `least` ≈ 0.72.
2. `k` = 1 on every row (± 1e-9); `at` points lie on the two faces.
3. A two-flange L-corner fixture built for the test with the wall end drawn
   0.3 past the neighbour's inside face: one overlap, `overlap` row, text
   "runs 0.30 mm into it"; drawn exactly on it (gap 0): no overlap.
4. A flat blank, a single bend, a 180° hem (flange lying on the base: joined,
   no row), a part with a curved cut edge next to a flange (no row from the
   chords).
5. `controlBoxBody` (`shopExamples.js`, fit gap 0.1): its closed corners read
   0.10; a flanged panel from `flangedPanel` (gap 0.2) reads ≥ 0.20 and agrees
   with `pieceClearances` to 0.01.

DOM: `FlangeGaps.dom.test.jsx` (line, rows, overlap card, hover callback);
the brake panel and the sheet-metal form each show it.

Script `scripts/verify-corner-gaps-cg1.mjs` (Playwright, as the other verify
scripts): load the user's file through the app's own open path (a copy placed
under the script's fixtures), read "least 0.72 mm" in the Sheet metal panel,
go to the brake, hover a row, the marker is in `cadShop()` and on the map,
screenshots at 1600 × 1000 and 1366 × 768, no page errors.

### 3.5 CG-1 as built

**(a) `cornerGaps.js` (new, pure).** `GAP_REACH`, `FACING`, `OVERLAP_SKIN` as
§3.1; `straightEdges`, `flangeGaps`, `gapLabel`, `gapText` and `flangeName`
(a flange in a sentence: "Bend 8's flange" / "the base", for the overlap
card). Faces per piece (`pieceFaces`): the two sheet faces (outline + holes in
the piece's plane) and an end face per piece edge lying on a straight blank
edge (both ends within 1e-6), the edge at least 0.01 long (`SLIVER`). A row
(`faceRow`): k ≥ `FACING`; `gap` the least of the four corners' distances
along n_A to B's plane (`(c − b0)·n_B / k`); the corners pushed onto B's plane
and taken into B's face's own 2D frame (a sheet face: the piece's flat x, y;
an end face: along the edge × across the thickness); `quadToFace` is exact
plane geometry: any side of the pushed quadrilateral meeting a side of the
face, a corner inside the other, else the least point–segment distance over
all side pairs. `at`: beside > 0, the closest pair, the quadrilateral's point
carried back onto A along n_A; beside 0, of the points of the shared area's
outline (side crossings and corners inside), the one of A nearest B's plane.
`flatAt` (not in §3.1): the same two points in each piece's own flat frame, for
the marker. Pairs skipped before any face is looked at: one piece, joined by a
bend (fixed ↔ moving, as `pieceClearances`), lying as cut (identical
matrices), folded boxes further apart than `reach`. One row per (A piece, A
blank segment, B piece, B face; an end face by its blank segment), the
smallest gap kept. Mirror end-against-end rows become one (`both: true`): the
mirror with the smaller gap stands for both. `overlaps`: the not-joined,
not-as-cut pairs whose boxes touch, each piece triangulated with
`triangulateWithHoles` at z = skin and t − skin plus its side walls, per-
triangle boxes first, then `trianglesCross`; `row` the overlapping row between
them, else any row between them, else null; `pieces` / `bends` in that row's a
→ b order.

**(b) `cornerGaps.fixtures.js` (new).** `USER_TRAY_FEATURE` and
`USER_TRAY_PROFILE` copied from the user's file; `L_CORNER` / `lCorner({ gap,
cover, flush, arc, tooth })`: a 120 × 100 blank, rear wall (bend 1, y = 80)
and right wall (bend 2, x = 100), 90° up, A 102 / V8, a 6 × 6 relief, an ear
on the rear wall whose end stands `gap` from the right wall's inside face
(that face's place from `bendNumbers`: h − r); `cover`: the right wall stops at
the relief and the rear end stands `flush` short of the right wall's outside
face; `arc`: the rear end an arc; `tooth`: a tooth `out` mm proud of the rear
end, `length` long.

**(c) `FlangeGaps.jsx` (new).** As §3.2; the line has `aria-label="Flange gaps
summary"`, the rows are an `<ol aria-label="Flange gaps, nearest first">` of
focusable `<li>`s (label, then the figure in `<strong>`), the thumbnail an
`<svg role="img" aria-label="Flange gaps on the flat blank">` (blank, dashed
bend lines, each row's edge(s) as a line and a dot; the hovered row's drawn
last, in `--shop-accent`, a larger dot; overlap rows in `--shop-stop`). The
disclosure: the stored toggle (`cad-shop-numbers:gaps`, 'open' / 'closed')
when there is one, else open while an overlap or a non-covering row under
1 mm is there. The hovered row is followed by key: when the rows are read
again (a new fold of the same part) it is handed to `onHover` again as it reads
now, or `onHover(null)` when it is gone; unmounting with a row hovered calls
`onHover(null)`.

**(d) `ShopPanels.jsx`.** `SheetMetalForm` renders `<FlangeGaps fold profile
params>` after the fold's own (bend-less) warnings, before "Bends, in the order
they are made"; no `onHover` (the thumbnail only).

**(e) `PressBrakePanel.jsx`.** New prop `onGapHover`; `<FlangeGaps>` right
after the sequence's "Folded …" line, on `madeFold`: `station.fold` memoised on
`[station.feature, station.profile]` — see (j); `onHover` is null while a
stroke runs. Params: the `ParameterContext` values (or a module-level `{}`).

**(f) `FlatPatternMap.jsx`.** New optional prop `gapEdges` ([[p, q], …], flat
mm): per edge a `<g class="cad-map-gap">` (the first `aria-label="Flange gap
edge"`) with the line and a ring round its middle, drawn after the segments and
before the two-point marks, `pointer-events: none`. Absent, nothing is
rendered for it (the existing map tests pass untouched).

**(g) `shopLayer.js`.** `setGap(gap)` (`{ flat: [P, Q], overlap }` or null) on
the layer's API; `placeGap()` at the end of `poseStation` and on `setGap`. The
marker `press-brake-gap` is a `LineSegments` (the line P → Q and a cross of
two 2.5 mm half-ticks at each end) with a child `press-brake-gap-ends`
(`Points`, two 9 px dots, `sizeAttenuation: false`), both `depthTest: false`,
`renderOrder` 6, `raycast = () => {}`, `#287fb3` (the `--shop-accent` value) or
the collision red `#e03131` for an overlap. Each flat point is placed on the
piece of the pose on show that holds it (inside its outline, else the nearest
within 0.01: a point on a cut edge) by that piece's posed matrix, and the
marker is a child of the part's own group (`station.part.group`), so it
follows every pose, scrub, turn and grip drag. Cleared (not just hidden) when
`poseStation` runs with a stroke going, and on `closeStation`; hidden when a
point is on no piece. `cadShop().station.gap`: `{ overlap, length, points (the
two points in the machine frame), inPartGroup }` or null.

**(h) `CadViewport.jsx`.** New prop `brakeGap`; an effect after the station's
calls `shopLayer.setGap(brakeView && brakeGap ? brakeGap : null)` on
`[brakeGap, brakeView]`.

**(i) `CadWorkspace.jsx`.** `brakeGapHover` state set by `hoverBrakeGap(row)`
(PressBrakePanel's `onGapHover`): the row's `at`, `flatAt`, `overlap`, its
edge(s), and the `feature`, `profile` and instance it was read on. `brakeGap`
(derived, no effect) is that hover only while the brake view is open, the
stage is `setup`, and the station's feature, profile and instance are the
ones it was read on; it goes to `CadViewport` (`brakeGap`, null in a film) and
to `FlatPatternMap` (`gapEdges`). No `brakeSession` field:
`docs/state-machines.md` untouched.

**(j) What the brake reads.** `station.fold` is `foldSheet(feature, profile,
params)` on the stored feature (`brakeStation.js:2048`): every stored bend at
its final (made) angle, unposed. The pending hit lives in `pending.fold`, a
scrub's pose in `view.fold` / `view.angles`, a stroke in the view: none of them
touch `station.fold`. So the card reads `station.fold`, memoised on the
feature and profile (both model objects: the same across picks), so a drag of
L or a new line does not read the gaps again.

**(k) `cad.css`.** `.cad-gaps*` (the card, the thumbnail: `width: 100%`,
`max-width: 180px`, `max-height: 120px`, no grid tracks) and `.cad-map-gap`.

**Judgment calls.**

- **`least` and the order are by `gap`, not `distance`** (see below).
  `distance` is kept on the row as §3.1 has it.
- Covering rows (the coordinator's addition, §4.2): `cover` only for a face
  row (an end against an end has no far face); they sort after the open rows
  by |flush|, and `least` leaves them out (their gap is −t / k by design).
- A pair of pieces lying as cut against each other (identical matrices, e.g.
  two tabs of one stroke with a slot between) makes no row: that gap is the
  cut's, not the fold's.
- Mirror rows: the one with the smaller gap is kept (so a later Set never
  leaves a gap under the target); the key of a `both` row is the two paths
  sorted, `>edge`, so it does not flip when the other mirror wins.
- Keys numbered `#1`, `#2` in the order of the A edge's middle (x, then y).
  On the L corner the relief side and the ear end of the rear wall share
  `bend-rear>bend-right>inside`.
- `b.side` is absent on an edge row; an end-to-end row that is not mutual
  reads "Bend 8 flange, end → bend 3 flange, end".
- `straightEdges`: a path's index is its `segments` index (construction
  segments skipped but counted); a path that does not end on its start closes
  with an edge numbered `segments.length`; a rectangle's edges in its corner
  order from the origin.
- `gapText` writes |value| < 0.005 as 0.00 (no "−0.00").
- Nothing at all when there are no rows, no overlaps and fewer than two
  flanges (a flat blank, a single bend); two flanges far apart: the one line
  "Flange gaps: none within 3 mm", no card, list or thumbnail.
- The marker's end dots (constant 9 px) are not in §3.3: on the user's tray
  at the brake's framing a 1 mm line with 2.5 mm crosses is two or three
  pixels; the dots make it findable. Bend names are the fold's ("Bend
  {index + 1}"), as the Sheet metal panel and the fold's own messages name
  them; at the brake a stroke of several tabs numbers its rows by step.

**Where the spec meets the code differently.**

- **`least` / sort by `distance` vs "least 0.72 mm".** §3.1 says `least` is the
  smallest `distance` and the rows sort by `distance`, but on the user's tray
  every wall row passes beside its face (distance = hypot(0.72, 1.22) = 1.42)
  and the mitres are 1.33, so `least` by distance is 1.33 while §3.2, §3.4 and
  the script want "least 0.72 mm". Built: `least` = the smallest
  max(gap, 0) over the non-covering rows, the rows sorted by it (overlaps
  first, covering rows last); the first row is the least one.
- **§3.4 item 2, `k` = 1 ± 1e-9 on every row.** Eleven rows hold it; the left
  rear mitre (lip 4's segment 28 against lip 1's segment 35) reads k =
  0.99999984, because the user's segment 35 is drawn at 45.032°, not 45°
  (its neighbour at 45.000°). The test holds that row to 1e-6 and says why.
- **The view does not get `gap`.** §3.3's "the brake's view gets `gap`" would
  make every hover a new view object, and a new view re-poses the station
  (`setStation`: re-pose, turn re-planned, side view): the gap goes to the
  layer by its own prop and `setGap`, as the grip's outcomes do (`setGrip`,
  "never inside the view").
- **`showGap` is `setGap` + `placeGap`**: the marker must be re-placed on
  every pose (scrub, a new view), not only when the hover changes.
- **The stylesheet budget test is not cad.css's.** The 180 px test
  (`ProjectLifecyclePanel.layout.test.js`) reads the lifecycle panel's module
  CSS only; the new cad.css rules add no grid and cap the thumbnail at
  180 px.
- **Open in the verify script.** Headless Chrome's File System Access picker
  refuses the call that follows the app's confirm, so the script deletes
  `window.showOpenFilePicker` before load: the Open button then takes the
  app's own fallback (its hidden file input, the same `importSketchFile`).

**Measured.** The user's tray (9 pieces, 36 outline segments): **12 rows** —
eight wall rows (gap 0.7170 / 0.7187 / 0.7187 / 0.7336 with beside 1.2187 /
1.2188, and the four the other way: gap 1.2187 – 1.2188, beside 0.7170 –
0.7336), four mitres `both` (1.3295, 1.3402, 1.3414, 1.3520, beside 0), no
overlaps, `least` 0.7170. `flangeGaps` on it: 1.05 ms (plain node, mean of 50
after warm-up); 0.93 ms median, 3.2 ms worst of 25 in the verify run; the
kiosk face frame (flangedPanel, 4 flanges) 0.8 ms. The L corner: gap −0.3 →
one overlap, the row "runs 0.30 mm into it"; gap 0 → "0.00 mm", no overlap;
the covering end at flush 0 / 0.15 / −0.1 → "flush with its outside face" /
"0.15 mm short of flush" / "0.10 mm proud of it". The control box body: four
corner rows 0.1000 (± 0.001), its four side-wall ends covering, flush ± 1e-3;
the kiosk face frame: four rows 0.2000, four covering, `least` 0.2000,
`pieceClearances` 0.2000. In the app: hover → marker reported 97 ms (the
script's poll); the wall row's marker 1.414 mm long (hypot(0.717, 1.219)), the
mitre's 1.330 mm.

**Files.** `cornerGaps.js`, `cornerGaps.fixtures.js`, `FlangeGaps.jsx` (new);
`ShopPanels.jsx`, `PressBrakePanel.jsx`, `FlatPatternMap.jsx`, `shopLayer.js`,
`CadViewport.jsx`, `CadWorkspace.jsx`, `cad.css`. Tests `cornerGaps.test.js`
(19), `FlangeGaps.dom.test.jsx` (10: the card, hover, re-read, overlap,
toggle, nothing to read, children, the Sheet metal panel, the brake panel,
the map's `gapEdges`), `CadViewport.gaps.dom.test.jsx` (3: the marker, its
following a pose and going with the station, a stroke clearing it and the
overlap red). Script `scripts/verify-corner-gaps-cg1.mjs` (fixture
`scripts/fixtures/corner-gaps-sample-bending.json`, screenshots in
`artifacts/sketch-cad/corner-gaps-cg1`). Docs: `sheet-metal-shop-guide.md`
("Flange gaps: how close the flanges stand").

**Run (2026-11-18).** The full suite: 573 files passed, 1 skipped; 6983 tests
passed, 1 skipped (the cad folder alone before the DOM tests were added: 149
files, 1771 tests). `npm run lint`: 0 errors, 40 warnings, none in a file
touched here. `verify-corner-gaps-cg1` passed twice (flangeGaps median
0.93 / 1.04 ms, hover → marker 97 / 96 ms), no page error.

**Audit (2026-11-18).** Read `cornerGaps.js` and `FlangeGaps.jsx` whole. My
own probe on the built module (scratchpad `cg1-audit.mjs`): the user's part
12 rows, walls 0.7170 – 0.7336 / 1.2187 – 1.2188, mitres 1.3295 – 1.3520,
~1 ms; my prototype's "set to 0.2" blank reads 0.20 on all twelve; the
covering corner of §4.2 reads "runs past its end: flush with its outside
face" with the covered wall at 0.20, beside 0; 0.15 short reads so. Reran the
three focused files (32), the cad folder (151 files, 1784) and the script
(passed). Accepted: `least` and the order by gap, not distance (the spec
contradicted itself). Changed by me: at the brake the rows start closed
(`station="gaps-brake"`, `openNear={false}`: twelve rows stood between the
Folded line and the sequence), the script opens them; `URL` declared in the
script's globals (eslint). Known, left: a jog laid exactly on a bend zone's
edge merges with the strip's own edge in the clipped piece, so that stretch
is no face and makes no row (the ear's top and bottom edges of a covering
corner; such rows are no corner rows anyway); the 3D marker is a few pixels
at the brake's framing and the camera does not go to it.

## 4 · CG-2 — set a gap

### 4.1 Moving one edge: `outlineMove.js` (new, pure)

```js
moveProfileEdge(profile, { loop, index }, distance, ({ span = null } = {}));
// → a new profile: that straight edge moved parallel to itself, `distance`
//   out of the metal (negative: in). `span` ([p, q] on the edge): only that
//   stretch of it moves. Throws in shop words.
```

- **Slide** where the neighbour is a straight edge not parallel to it: the
  shared corner moves along the neighbour's own line (a mitre keeps its line,
  a notch keeps its side). The neighbour must keep its direction: otherwise
  "This edge can move at most X mm: its neighbour ends there." A neighbour
  brought to no length is taken out, and edges left in one line are one edge.
- **Jog** where the neighbour is parallel, an arc, or absent, and at each end
  of a `span` that is not the edge's own end: the rest keeps its place and a
  new straight edge, square to the moved one, joins the two.
- Literal numbers only: a profile holding an expression is refused ("This
  outline is driven by parameters: change the parameter instead."). A
  `rectangle` stays a rectangle (origin / width / height); `polygon` and
  `path` keep their type; arcs elsewhere in a path are untouched.
- The result must be a simple outline (no edge crossing another, cut-outs
  still inside); points rounded to 1e-6 (`roundPoint`).

### 4.2 From gaps to moves (`cornerGaps.js`)

```js
gapMoves(rows, target, { keys = null, styles = {} })
// → [{ segment: { loop, index }, span?, distance }]
setGaps({ feature, profile, params, target, keys = null, styles = {} })
// → { profile, passes, moved: [{ segment, distance }], rows (after), residual, newWarnings }
// styles: row key → 'short' | 'cover' (a face row) or 'both' | 'a' | 'b' (an edge-to-edge row)
```

The user (2026-11-18): a wall "sometimes runs past and cover the others and
sometimes both stop", a mitre "sometimes both lips move half each sometimes
only one". So each row carries its way:

- **A face row, `short`** (stops short, the default for a row that stops
  short today): its edge moves (gap − target) / k, the whole blank edge,
  sliding (§4.1).
- **A face row, `cover`** (runs past the neighbour's end, flush with its far
  face): only the flange's own stretch of the edge moves (`span` = the row's
  `a.flat`: from the flange's bend zone to its next one), to gap = −t / k, so
  the end stands in the plane of the neighbour's other face. The bend zones
  beside it keep their ends: the metal that runs past is an ear of the rigid
  flange (as `panelMaker.js` lays out its closed corners). Probe before
  trusting it: on the user's part the rear wall covering the right wall needs
  the ear to start at the rear bend's outer tangent (y = line + h); a move of
  the whole edge instead would put the rear bend's zone through the right
  wall's metal.
  A row reads as covering when gap < −`OVERLAP_SKIN` and beside > 0; then its
  text is "runs past its end: flush with its outside face" (or "… 0.15 mm
  short of flush" / "… 0.10 mm proud of it"), `row.cover` true, and `flush`
  (gap + t / k) is what Set brings to 0. The neighbour's own row (its end
  against this flange's inside face) is the corner's fit-up gap and takes the
  typed gap. "Set all" keeps each row's way as it reads today.
- **An edge-to-edge row**: `both` (each edge half, the default), `a` or `b`
  (that flange's edge takes the whole move).
- An edge asked for by several rows takes the smallest move: no gap ends
  under the target. Rows within 0.0005 of their target are left alone.
- Both walls of one corner set to cover would stand in the same place: the
  set is refused before anything is committed, "Both flanges cannot cover the
  same corner: let one of them stop short." (found as an overlap in the
  result, §3.1).
- **Every bend stays on the metal it bends today.** A stored punch line runs
  the whole blank (the brake stores it 1 mm past both ends) and bends every
  stretch of metal it crosses, so an ear that crosses a neighbour's line would
  become part of that neighbour's bend. Probe (user's part, rear wall
  covering): with the lines as stored the fold refuses "Bend 5 crosses bend
  1."; with bend 5's line clipped to its own tab it folds, the rear wall's row
  reads −1.200 (flush), the right wall's 0.200 with beside 0, `sequenceChecks`
  passes all eight. So `setGaps` also returns `bends`: after the move, an
  interval of a bend that overlaps none of that bend's intervals before the
  move is new metal on its line, and the record's `a` / `b` are clipped to the
  intervals it had, by `strokeBends`' own rule (min(0.5, a quarter of the
  interval) inside the first and the last, rounded to 1e-6). New metal between
  two of a bend's old intervals cannot be clipped away: refused, "This would
  put new metal on bend {n}'s line between the tabs it bends." The commit
  replaces the sketch and the feature's `bends` together, one undo entry.
- **Corner rows.** `cornerRows(rows)`: a row is a corner row when its two
  faces face each other (beside ≤ 0.005), or it is edge to edge, or the other
  flange has an end row back against this flange (the two walls of an open
  corner). "Set all" moves the corner rows only; any other row (an ear's top
  edge passing under a lip, a relief's side) is listed, can be set on its own,
  and is left alone by "Set all". Probe: the covering ear's top edge makes
  such a row against the right lip's underside (1.78, passes 1.98 beside).
- A piece's edge shorter than 0.01 is no face (a jog laid on a zone's edge
  leaves such slivers).
- `setGaps` folds, reads the rows, moves, refolds: at most 4 passes, done when
  every asked row is within 0.001. Rows are followed by `key`.
- `target` from 0 to `GAP_REACH`; negative: "Flanges cannot overlap: give
  0 mm or more."
- A move the fold refuses is given back in shop words, the fold's own message
  kept inside: for a crossing of two bends that do not run together
  (`error.crossing`, `along` false) "… Bend 8 crosses bend 5: their bend zones
  would share metal at the corner. The relief must reach {h} mm (half the bend
  zone) past each bend line: cut it wider, or ask for a wider gap." The same
  hint is added by `outlineEditRefusal` and by `SheetMetalForm`'s own error
  line; the fold's message itself is unchanged (it is pinned in many tests).
- `newWarnings`: fold warnings present after and not before (by code + bend).

### 4.3 The controls (in `SheetMetalForm` only)

Inside `FlangeGaps` (`children`): a field "Gap (mm)" (default 0.2, the panel
maker's fit-up gap; `useNumericDraft` like every number box), on each row its
way and a "Set" button, and "Set all". The way is a small select with plain
words: a face row "Stops short" / "Runs past (covers)", showing what the row
is today; an edge-to-edge row "Both edges" / "Bend 1's edge" / "Bend 3's
edge" (the choice lives in the component, by row key, until the part is left).
Set is offered whenever the row is not at its target or its way was changed.
Disabled, with the same title, whenever "Edit outline" is disabled
(`sketchEditProblem`).

Commit (a handler in `CadWorkspace.jsx`, passed down like `onEditOutline`):
`setGaps` → `outlineEditRefusal(model, sketch.id, profile, params)` (other
parts cut from the same outline) → ONE `commit` of the model with that
sketch's `profile` and `entities` replaced, through `perform`. `entities`:
when the stored ones are in step with the old profile, the same entities with
their points moved (ids kept, so reference dimensions keep their anchors);
otherwise `profileToEntities(profile)`. After the commit
`entitiesToProfile(entities).profile` must equal the profile as JSON. What
happens to `sketch.dimensions` is tested and written in §4.5. Undo takes the
whole set back in one step.

After a set, a `role="status"` line: "Set 12 gaps to 0.20 mm: 16 edges moved,
the most 1.02 mm. Undo takes it back." and, for new warnings, "Bends 3 and 4:
the outline now crosses the bend zone at an angle." A refusal shows as the
form's error line; nothing is committed.

The brake's card stays read-only and says where to set: "To change a gap, set
it in the part's Sheet metal panel."

### 4.4 Acceptance

Unit (`outlineMove.test.js`, `cornerGapsSet.test.js`):

1. `moveProfileEdge`: slide on both ends; jog at a parallel neighbour and at
   an arc; rectangle stays a rectangle; the "at most X mm" refusal; an
   expression refused; a hole's edge; a move that would self-cross refused.
2. The user's part, `setGaps` all at 0.2: one or two passes, every row
   0.200 ± 0.001, 16 edges moved, the blank's top-right corner as §1.4
   (± 0.001), `newWarnings` = `outline-not-square` on bends 3 and 4, the fold
   and `sequenceChecks` pass, `pieceClearances` least 0.200 ± 0.005.
3. One row only (a wall row): that row 0.200, the others unchanged ± 1e-6
   except the row sharing a corner with it.
4. Target 0: every row 0.000 ± 0.001, no overlap reported.
   4a. Cover: the user's part, the rear wall's row to the right wall set to
   `cover` and the right wall's row at 0.2: the rear wall's end is flush with
   the right wall's outside face (± 0.001), the right wall's row reads 0.200
   with beside 0, the rear row reads as covering, no overlap, the fold and
   `sequenceChecks` pass, the kernel builds it; back to `short`: 0.200 again
   and the outline has no edge shorter than 0.01. Both walls of that corner
   to `cover`: refused, nothing changed.
   4b. A mitre with `a`: only that flange's edge moved, the row 0.200; with
   `both` the two moves are equal.
   4c. `moveProfileEdge` with a `span`: jogs square at both span ends; a span
   end on the edge's own end slides as without a span.
5. The crossing refusal with its hint: the user's part with the notch's side
   moved to x = 286.83 first.
6. The kernel builds the set part: `kernel` test, no `not-fused` warning
   (as `kernel.test.js` runs the sheet-metal build today).

DOM: Set, Set all, the status line, Undo restores the profile byte for byte,
disabled with "Edit outline".

Script `scripts/verify-corner-gaps-cg2.mjs`: the user's file, "Set all" at
0.2, the line reads "least 0.20 mm", the 3D part redraws, the brake still
shows all eight steps made and clear, Undo, screenshots, timing of the set
(one click to the committed model) written down.

### 4.5 CG-2 as built

**(a) `outlineMove.js` (new, pure).** `moveProfileEdge(profile, { loop,
index }, distance, { span })` as §4.1, on top of `outlineEditor(profile)`: the
outline held as loops of nodes (a corner and the segment starting there), each
segment keeping its object while edges move (`origin`: its `{ loop, index }`
in the outline read, null for an edge a move made), so several moves read from
one outline apply one after the other although a jog shifts the indexes
behind it (`edge({ loop, index })` → a handle; `move(handle, d, { span })`;
`check()`; `profile()`; `trace()` → `{ loops: [[origin | null]], corners:
[{ from, to }] }`; `moved()` → `[{ segment, origin, distance }]`).
Out of the metal: out of the outline, into a cut-out (the loop's turning sense
from its corners and arcs' mid points). Slide where the neighbour is a straight
edge at an angle (sine > 1e-6); jog (square to the moved edge) at a parallel
neighbour, an arc or a spline, and at a span end inside the edge (a span end
within 1e-6 of the edge's end is that end). A neighbour brought to ≤ 1e-6 is
taken out (its corner merges, `into`), edges then in one line are one edge
(the moved one keeps its object); past its end: "This edge can move at most
X mm: its neighbour ends there." (X: the neighbour's far end's distance from
the edge's line). `outlineMoveProblem(profile)`: literal numbers only
("This outline is driven by parameters: change the parameter instead."), no
offset, no construction segment, closed. `check()`: no two edges of a loop
meet but neighbours at their corner, no edge folds back on its neighbour, every
cut-out inside the outline and clear of it and of the others (arcs sampled 32,
splines 16). New points `roundPoint`. A rectangle stays a rectangle while its
four corners are square; untouched loops and segments are given back as the
same objects, a moved line as `{ ...segment, end }`, a path's implicit closing
edge stays implicit while it is still the last. `carryEntities(entities,
profile, next, trace)`: for entities in step with `profile`, the same entities
moved (ids and sense kept; a rect entity's corners follow the rectangle; a new
edge gets the next free `e` id and goes in after the entity before it in the
loop), checked to rebuild `next` exactly (as JSON), else null.
`carryDimensions(dimensions, trace)`: see (j).

**(b) `cornerGaps.js`.** `isEdgeRow`, `cornerRows`, `gapMoves`, `setGaps`,
`setGapsText`. `gapMoves(rows, target, { keys, styles, thickness })` as §4.2
(merged per segment: the smallest move, its span). `setGaps` checks the target
and the outline, folds, reads, fixes each asked row's way from that reading (a
face row: `short` | `cover`, absent = as it reads; an edge row's chosen flange
by its bend path, as `a` / `b` swap when the other mirror wins), refuses two
walls of one corner covering (the partner asked to cover, or covering already
and not asked), then up to 4 passes: rows followed by key → `gapMoves` →
every handle taken before any move → moves → `check()` → bends kept on their
metal (c) → fold → read; done when every asked row is within 0.001 (a pass
moves nothing for a row within 0.0005). New overlaps in the result are
refused ("Bend 8's flange would run into bend 5's flange: nothing was
changed."). Returns `{ profile, bends, passes, moved, rows, residual,
newWarnings, fold, trace, asked }`. `setGapsText(result, target)` → `{ text,
warnings }` for the status line and its note.

**(c) Every bend stays on the metal it bends today.** Per made record (bend-on
entries skipped): `lineSegments` of its own a → b on the blank before the set
and after the move. An old interval no longer under the line is refused ("This
would take bend n off metal it bends today."); a new interval between the
first and the last kept one is refused (§4.2's words); otherwise, when there
are new ones, a / b are set by `strokeBends`' rule inside the first and last
kept intervals (as they read after the move), rounded to 1e-6, and the
clipped line is checked to take exactly the kept intervals. Every other record
is returned as the same object (so a stroke group's others, old files and
bend-on records are byte-identical; a clipped record keeps every other key,
`stroke` too). Clipped from the stored record every pass (idempotent).

**(d) The crossing hint.** `crossingError` (`sheetMetal.js`) also puts
`halfZones` ([bend, other] allowance / 2) on the error; `error.crossing` and
the message are unchanged (both pinned). `crossingText(error)` (new, exported):
for `crossing` with `along` false, "{message without its period}: their bend
zones would share metal at the corner. The relief must reach 1.41 mm (half the
bend zone) past each bend line: cut it wider, or ask for a wider gap." (two
different halves: "… 1.41 mm past bend 8's line and 1.20 mm past bend 5's (half
of each bend zone) …"); any other error: its message. Used by `setGaps`
(prefixed "These gaps cannot be set: " / "This gap cannot be set: ", or "The
part does not fold as it stands: " before any move), `outlineEditRefusal`
(`shopRoute.js`) and `SheetMetalForm`'s fold error line and its refused-change
lines.

**(e) `FlangeGaps.jsx`.** New prop `rowExtra(row)` (rendered in each row after
its figure); `children` may be a function, handed the reading `{ rows,
overlaps, least }`. Without them nothing changes (CG-1's tests untouched).

**(f) `ShopPanels.jsx`.** `FlangeGapsSet` (in the file, used by
`SheetMetalForm` when it has the new `onSetGaps` prop; without it the plain
card): the "Gap (mm)" `NumericInput` (useNumericDraft, default 0.2, min 0 max 3
step 0.05) and "Set all" (disabled with no corner rows); per row a select
(`aria-label="Way for {label}"`: "Stops short" / "Runs past (covers)", or
"Both edges" / "Bend 1's edge" / "Bend 3's edge", "The base's edge" for the
base) and "Set" (`aria-label="Set {label}"`) while the row is more than 0.001
from what its way asks or its way was changed. Every control disabled with
Edit outline's title (`sketchEditProblem`). The refusal on the card's
`cad-shop-error` line (`role="alert"`); the status line `role="status"`, its
warnings in a `role="note"` under it, shown while the outline is the one the
set committed (Undo hides it). `FeatureForm` (`CadEditors.jsx`) passes
`onSetGaps` through.

**(g) `CadWorkspace.jsx`.** `setFlangeGaps(partId, featureId, { target, keys,
styles })`, wired as the part's `FeatureForm` `onSetGaps`: the blank sketch
(gone / `sketchEditProblem` refused), `setGaps` with the workspace's resolved
parameters; nothing moved → no commit; else `outlineEditRefusal` on the model
with the new bends (every part cut from the outline, named), then the sketch
(`profile`, `entities` by `carryEntities` or else `profileToEntities`,
`dimensions` by `carryDimensions` when the key is there) and the feature's
`bends` in ONE `commit` through `perform`. Refusals are thrown back to the
panel before anything is committed; a commit failure would show in both
places. Returns the result and `committed` (the stored profile).

**(h) `PressBrakePanel.jsx`.** The card gets one child: "To change a gap, set
it in the part's Sheet metal panel." No controls. **(i) `cad.css`.**
`.cad-gaps-set`, `.cad-gaps-controls` (flex, wrapping, no grid tracks).
`docs/state-machines.md` untouched: no session or flow field (the ways, the
gap and the status line are the panel's own state).

**(j) What happens to `sketch.dimensions`.** They anchor by point, not by
entity id (`docs/sketch-studio-sketch-dimensions.md` §3.1: `from` / `to`,
`center`), so keeping ids does not keep them. Built: a linear dimension's end
within 1e-3 of a corner of the outline that moved goes with the corner (a
corner taken out goes where it merged); any other end (on an edge, free) and
every radial dimension stay; the list is the same array when nothing of it
moved; a sketch without the key keeps none. Nothing is dropped, nothing
invalid is written (`normalizeModel` accepts the result). Tested in
`outlineMove.test.js` and in the workspace (a dimension on the rear wall
end's two corners follows them after Set all; one to the middle of the rear
lip's edge stays).

**Judgment calls.**

- **`cornerRows` is narrower than §4.2's three rules.** On the CG-1 L corner
  the literal rules make the rear wall's relief side (behind its ear's end,
  facing the right wall, beside 0) and the right wall's relief top (its
  partner rule) corner rows; "Set all" then drives the relief into the zones
  and is refused. Built: of several ends of one flange against one face (keys
  `#1`, `#2`) only the nearest is the corner's, and the partner rule counts
  only when the partner passes beside too (an open corner) or this row
  covers. The user's tray is unchanged by it (12 corner rows); the L corner
  sets its ear end alone.
- **"Set all" takes the ways the selects show** (changed after the first
  audit, B): as each row reads today unless its select was changed. After a
  Set the rows set forget their choice (a face row then reads its way; a mitre
  shows "Both edges" again).
- **`gapMoves` takes `thickness`** (a covering move needs t; §4.2's signature
  has no place for it).
- **Slivers are refused, not snapped.** A move that would leave an edge, a
  jog or a stretch beside a span between 1e-6 and 0.01 long throws "This would
  leave an edge 0.005 mm long beside it, too short to cut: move it further or
  less far." (0.01: CG-1's `SLIVER`).
- **A rectangle that takes a jog** becomes a closed path from its origin
  corner (it cannot stay a rectangle); its rect entity cannot be carried, so
  the entities are rebuilt.
- **Back to "Stops short" leaves the step.** The ear's end moves back to the
  gap; the zones' stretches of the old edge keep their place, so the jogs stay
  (0.53 mm on the user's tray), not one straight edge again (§4.4 4a asks for
  no edge under 0.01: the shortest is 0.5336).
- **Status words** beyond §4.3: a covering end "Set 1 gap to 0.20 mm and 1
  covering end flush: 2 edges moved, the most 1.93 mm. Undo takes it back.";
  one edge "1 edge moved 0.53 mm"; nothing to move "These gaps are already as
  asked: nothing moved." (no commit); a residual over 0.001 adds "The nearest
  it came: x mm off." (not seen on the user's part). Other new fold warnings
  are given in their own words after the outline-not-square sentence.
- **Extra refusals**: a target over 3 ("Gaps are read up to 3 mm: give 3 mm or
  less."), not a number ("Type the gap in mm."), a key not read ("That gap is
  no longer on the part: read the gaps again."), a row lost between passes,
  no corner rows ("This part has no corner gaps to set."), a clipped line
  that would not keep its tabs, a bend line driven by parameters needing a
  clip.

**Where the spec meets the code differently.**

- **"ids kept, so reference dimensions keep their anchors"** (§4.3): they have
  none by id; see (j).
- **Entities are carried only when they rebuild the profile exactly.** A move
  that shifts the sketch's first entity off the path's start corner (a jog at
  that corner) would start the rebuilt path elsewhere: then
  `profileToEntities` (fresh ids) — the in-step invariant holds either way.
  On the user's part every set carries them (36 ids kept; a cover adds 4, e97
  – e100).
- **"Both flanges cannot cover the same corner"** is found from the rows
  before anything moves (the spec: as an overlap in the result); the result's
  overlaps are refused as well.
- **The covering corner's new warning.** Covering the rear wall and setting
  the right wall's row from the file as saved adds `outline-not-square` on
  bend 3: the right wall's top end moved 1.02 up, so the right lip's mitre
  now starts inside bend 3's zone (as §1.4 found for a full set).

**Measured.** The user's part, "Set all" at 0.2: **1 pass**, all twelve rows
0.2000 (worst 0.2003, the left rear mitre), 16 edges moved, the most 1.0188;
the blank's top-right corner equal to §1.4 to 1e-4 at all nine points (the
start corner, the left rear mitre's, slides 0.80 along the top edge);
`newWarnings` outline-not-square on bends 3 and 4; `sequenceChecks` all eight
ok; `pieceClearances` least 0.2000; every bend record the stored object.
Target 0: worst 0.00037, no overlap. One wall row: only that gap changes,
its partner now passes 0.20 beside. Mitre: `a` one edge 1.152, `both` 0.576
each. The covering corner (rear wall covers, right wall 0.2, from the file as
saved): the rear row gap −1.2000, flush 0.0000, "runs past its end: flush
with its outside face" (beside 0.20); the right row 0.2000, beside 0; bend 5
clipped to a (286.834742, −446.16916) b (286.834742, 80.529437), the other
seven the stored objects; no overlap; all eight steps ok; the ear's end
against the right lip, "1.78 mm · passes 2.54 mm beside it" (1.99 from the
set tray), no corner row. Back to "Stops short": one edge −1.40, 0.2000.
Crossing: the notch side at x 286.84 sets (residual 0.0003), at 286.83
"These gaps cannot be set: Bend 8 crosses bend 5: their bend zones would share
metal at the corner. The relief must reach 1.41 mm (half the bend zone) past
each bend line: cut it wider, or ask for a wider gap." Kernel: the set tray
and the covering corner each one fused solid, no `not-fused`, volume / (blank
× t) within 2 %. Time: `setGaps` on the user's part 6.5 – 12.9 ms warm in
node (median 7.12 ms of 25 in the verify run, worst 11.4; the first, cold,
call 49.5 ms); in the page, one click of "Set all" to the committed model (the
handler: setGaps, the guard, the entities, the commit) 16.3 / 8.9 / 6.9 ms
over three clicks (a temporary `performance.mark`, removed); click → status
line rendered 106 ms; click → solids rebuilt ("Model current") 580 ms.

**Files.** `outlineMove.js` (new); `cornerGaps.js`, `sheetMetal.js`,
`shopRoute.js`, `FlangeGaps.jsx`, `ShopPanels.jsx`, `CadEditors.jsx`,
`CadWorkspace.jsx`, `PressBrakePanel.jsx`, `cad.css`. Tests
`outlineMove.test.js` (13), `cornerGapsSet.test.js` (18),
`kernel.cornerGaps.test.js` (2), `CadWorkspace.gaps.dom.test.jsx` (7: Set all
with the status line, the entities and Undo byte for byte; one row run past
and its Set, bend 5 clipped, two Undos; a refusal on the line with no commit;
another part cut from the outline refusing by name with the hint; disabled as
Edit outline; dimensions; the brake's card). Script
`scripts/verify-corner-gaps-cg2.mjs` (screenshots in
`artifacts/sketch-cad/corner-gaps-cg2`). Docs: `sheet-metal-shop-guide.md`
("Flange gaps: how close the flanges stand", setting a gap).

**After the first audit (2026-11-18).** Three changes asked for by the lead.

- **A. The punch and the die keep their length.** How the brake measures a
  tooling run (`docs/sketch-studio-brake-tool-length.md` §3.1 – §3.2,
  `pressBrake.js`): `toolingRuns` — the material the bend's line crosses that
  the step bends, a gap with no material not breaking a run — measured per
  step by `strokeTooling(fold, step.bendIds).fitted`; the trim is mm off each
  end of every run (`trimRuns`), so a set that lengthens the run lengthened
  the tool with it (bends 7 / 8 of the user's part, 367.70 mm with
  `punchTrim` 5.999242 / 5.990937: 369.14 mm at a set to 0). Built:
  `holdToolLengths` at the end of `setGaps` (after a pass moved something):
  per step of `hitSequence` with one run before and after whose length
  changed by more than 1e-6, every record of the step with a trim set (a
  number, not 0 — 0 is fitted to the bend, as `trimRuns` reads it) takes half
  the change on each trim it sets, rounded to 1e-6. A bend-on record hits its
  bend's line: the same rule (its own trims move, tested). Several runs, or a
  trim that is an expression: the record as it was. Every other record is the
  same object; a record changed this way is committed and undone with the
  set. Measured: 367.7000 ± 1e-6 on bends 7 and 8 at gaps 0, 0.01 and 0.2
  (trims 6.517073 on both at 0.2, 6.717 at 0).
  **The lead's cause was not the refusal's.** With the length held, steps 7
  and 8 are still refused at 0 and 0.01 ("Bend 7: the part hits the punch at
  32.5°…"), and the same with the trims as stored or the punch 2 mm shorter
  (365.7 – 369.7 mm all refuse); without the hold 0.02 already passes. The
  threshold is between 0.012 and 0.014, held or not. What hits in step 7 is
  piece-5, bend 7's lip (path 7 > 2), against the punch at 32.5° (step 8:
  the same words and angle; its piece not looked at): walls only or mitres only at 0 both pass, the two together do not —
  at 0 every mitre moves 0.67 mm out (0.576 at 0.2), the lips run 0.14 mm
  longer at each end (379.075 against 378.792 mm). So the tooling clearance
  of the user's returned lips ends near 0.013 mm; nothing the set can mend.
  It is what the safety net is for.
- **The safety net.** After a set that moved something the panel checks the
  brake's sequence on the part as committed (`sequenceChecks`, the shop's
  machine: `model.fabrication.shop.machine`, else the default, as
  `brakeStation` takes it) against the part before the set, and adds to the
  note "Step 7 no longer goes at the brake: {the check's message}" (steps
  numbered as the brake's rows), or "… does not go at the brake (nor did it
  before the set): …". Nothing is refused; the set stands. Two
  `sequenceChecks` on the user's part cost 120 – 180 ms each warm in node
  (276 ms cold), over the ~250 ms the click may take, so it runs off the
  click: in `FlangeGapsSet`, an effect after the commit (`setTimeout` 0); the
  status line carries `data-brake="checking"` → `"checked"`. In the app:
  click → status line 113 ms (as before), click → steps checked 606 ms,
  click → solids current 1036 ms (580 before: the check shares the main
  thread with the rebuild's hand-off).
- **B. "Set all" takes the ways the selects show**: `styles` for every corner
  row whose select was changed (an edge row's flange resolved from its bend
  path, as the row's own Set does); title "Set every corner gap to this gap,
  each its way as shown". On the user's part, cover chosen on the rear wall
  row and Set all: "Set 11 gaps to 0.20 mm and 1 covering end flush: 16 edges
  moved, the most 1.93 mm. Undo takes it back." — the rear row flush, the
  right wall 0.20, every other corner 0.20.
- **C. The controls stand above the rows.** `FlangeGaps` renders a function
  child right under the summary line (after any overlap card), before the
  disclosure; a plain-node child (the brake's pointer sentence) stays under
  the rows (screenshots `02-set-all`, `04b-set-all-zero`).
- Tests added: `cornerGapsSet.test.js` 3 (the length held at 0 / 0.01 / 0.2
  and only 7 / 8 changed; the brake at 0.2 / 0.02 all ok and at 0 / 0.01 the
  lips' hit whatever the punch's length; a bend-on record's trims and an
  expression trim), `CadWorkspace.gaps.dom.test.jsx` 2 (Set all with a
  changed way; the deferred note at gap 0) and the first DOM test now checks
  the trims, the note after the check and the controls above the list. The
  script gains step 4b: Set all at 0 → the note names steps 7 and 8, the
  brake refuses them, Undo → 0.2 and all eight ok.

**Run after the first audit (2026-11-18).** The corner-gap and outline files
(the four above, CG-1's three, `CadWorkspace.outline.dom.test.jsx`,
`outlineEdit.test.js`, `shopRoute.test.js`): 10 files, 106 tests passed.
`npm run lint`: 0 errors, 40 warnings, none in a file touched here.
`verify-corner-gaps-cg2` passed (setGaps median 6.28 ms; click → status
103 ms, → steps checked 550 ms, → solids current 937 ms);
`verify-corner-gaps-cg1` passed. The whole suite was started again and
stopped by the session for low memory before it reported: not rerun; the run
below is the one before these changes.

**Run (2026-11-18).** The full suite: 577 files passed, 1 skipped; 7023 tests
passed, 1 skipped (CG-1's run plus the 40 here). The seven corner-gap files
(the four above and CG-1's three) after the last edit: 72 passed. `npm run
lint`: 0 errors, 40 warnings, none in a file touched here.
`verify-corner-gaps-cg2` passed (setGaps median 7.12 ms, worst 11.4; click →
status 106 ms, → solids current 580 ms; no page error); `verify-corner-gaps-cg1`
passed again (flangeGaps median 1.10 ms, hover → marker 150 ms).

**Audit (2026-11-18).** Read `setGaps`, `gapMoves`, `cornerRows`,
`keepBendsOnTheirMetal`, `holdToolLengths`, `FlangeGapsSet` and the
workspace's `setFlangeGaps`. My own probes on the built code (scratchpad
`cg2-audit.mjs`, `cg2-zero.mjs`, `cg2-audit2.mjs`): Set all at 0.2 = my
prototype's blank to 1.5e-4, one pass, sixteen edges, bends untouched but
7 / 8's trims; the covering corner, Set all on a covering tray (the cover
stays, the rest follow), both walls covering refused, back to short, one lip
of a mitre, a negative gap refused; inputs and the user's file untouched.
Sent back once (A – C above). My test for A was wrong and the builder said
so: the refusal at 0 / 0.01 is the bent wall's own lip against the punch, not
the punch's length; my rerun agrees (punch 367.7000 at every gap, steps 7 / 8
refused at 0.012 and under, clear from 0.014). Changed by me: the deferred
brake note reads the part before the set only when a step fails now (click →
steps checked 409 ms, → solids current 789 ms in my run of the script).
Reran: cad folder 155 files / 1824, the whole suite 577 files / 7028 passed
(1 skipped), `verify-corner-gaps-cg2` passed. One cad test failed once under
load and passed on two reruns (not identified). Accepted: `cornerRows`
narrower than §4.2 (the nearest of several ends, the partner rule), a move
that would leave an edge under 0.01 refused.

## 5 · CG-3 — the brake checks the sheet's thickness

Today a flange may end up to 0.6 mm inside another and the brake says "Clear
through the stroke" (§1.2 item 5).

- `foldOverlaps(fold, { moved = null })` in `cornerGaps.js` (the `overlaps` of
  §3.1 on a posed fold; `moved`: piece ids, pairs with neither in it skipped).
- Where a step's verdict is put together (the builder reads
  `brakeCollisions`, `brakeStation.js`'s `collision` wrapper and
  `sequenceChecks` and picks the one layer every verdict passes through, so
  the pending hit, a stored step's row and the Sheet metal panel's note after
  a set (§4.5) all say the same; the candidate searches of the tries must not
  each pay for it): when a stroke is otherwise clear (`hit` null), the pose
  at the end of the stroke (this step's bends at their angle, the earlier
  ones as made) is tested with `foldOverlaps`, `moved` = the pieces this
  stroke carries. An overlap is a hit: `{ tool: 'part', thickness: true,
angle: the stroke's end, pieces, message }`, message "Bend 8: the flange
  ends 0.30 mm inside bend 5's flange (the sheet is 1.2 mm thick). Give that
  gap 0 mm or more in the part's Sheet metal panel." (the depth from the
  facing row when there is one, else "ends inside"). It refuses Bend like any
  collision, shows on a stored step's row, and `showHit` marks the two pieces.
- The stroke itself (between start and end) stays on the mid-surface: said so
  in the guide.
- The tries (`wayTries`, `sequenceTries`, `punchFix`, try 3) get no new search:
  a thickness hit is not something another order, angle or punch cures, so the
  card offers none for it and says the outline has to change.
- Budget: the test adds under 3 ms to a clear stroke on the user's part and
  the advice timings of `docs/sketch-studio-shop-punches.md` §6.9 (92 / 162 /
  300 / 534 ms) grow by no more than 10 %; measured with several steps made.
- Every example and verify script that bends a part today must still pass. A
  shipped example that turns out to overlap at thickness is reported, not
  hidden (fix the example's blank, say so in §5.2).

### 5.1 Acceptance

Unit (`cornerGapsBrake.test.js`): the §3.4 L-corner with the end 0.3 inside:
the second stroke is refused with the message, 0.0 and +0.2 are clear; the
user's part as saved and set to 0.2: all eight strokes clear; a hem; the
control box (0.1) clear. Timing test in the style of the existing budget
tests. Script `scripts/verify-corner-gaps-cg3.mjs`: draw the L-corner
overlap, the Bend button is refused with the card, set the gap to 0.2 in the
Sheet metal panel, Bend goes.

### 5.2 CG-3 as built

**Where the test lives, and why.** In `brakeStation.js`, one layer above
`brakeCollisions`: `thicknessHit(options)` (new, exported), called by the two
places every verdict a user sees is put together — `collision()` (the pending
hit: its card, the pedal, the blade picker's cards, the grip's outcomes, all
through `brakeStation`) and `stepCheck()` (a stored step's row, so
`sequenceChecks`: the brake's rows, the Sheet metal panel's deferred note, the
panel maker's report, `changeBrakeBends`' re-check) — plus an offset's hits
(`offsetPair`'s `hitOf`, not in its `quick` searches). Not inside
`brakeCollisions`: that is what every candidate search calls directly (the
quick punch check, the hanging side's shorter side and other order, the
offset searches), and a thickness verdict depends on the end pose alone, not
on the punch, the die's side, the way round or the stroke, so the searches
gain nothing from it; and `cornerGaps.js` already imports `brakeCollisions.js`
(a cycle). `brakeStation({ thickness = true })` is the switch: every remedy
trial that runs a whole station passes `thickness: false` (punchFix,
hornFix, lengthFix's two, hangingStep, the Turn the sheet around trial,
`wayTries`' armed runs), and `stepCheck` / `sequenceChecks` take `{ thickness }`
the same way (`worseFrom`, try 3's step check, `wayTries`' own `today`,
`sequenceTries`' trials). Those searches count the part as made by the same
rule (`failedMid`: a refusal, or a collision that is not a thickness hit), so
they behave exactly as before CG-3.

**(a) `cornerGaps.js`.** `foldOverlaps(fold, { moved })` (new): flangeGaps'
`overlaps` without the rows — pairs not joined by a bend, not lying as cut
(`samePose`), boxes touching, either piece in `moved` (null: all) — whose
solids cross at the true thickness, each sheet face pulled in by
`OVERLAP_SKIN`; `[{ pieces, bends }]`. `flangeGaps` now shares its pieces'
boxes (`pieceEntries`), the joined pairs (`joinedPairs`) and the crossing test
(`crossingPairs`) with it: its results are unchanged (the CG-1 / CG-2 suites
pass untouched). `pieceTriangles(piece)` (new, exported): a piece's flat
triangulation cached by its outline array (a posed fold's pieces share it with
the fold they were posed from), used by the solids and by the brake's red
faces.

**(b) `brakeStation.js`.** `thicknessHit({ fold, bendIds, angles, target,
start, number, machine, die, gaugePoint, turned, profile, params })`: the end
pose is `poseFold(fold, { ...angles, ...ids → target })` (a round bend's with
`machineFrom` as `brakeCollisions` poses it), i.e. this step's bends at the
angle it leaves them (a bend-on step's part-way `to`), the earlier steps as
made, the later ones at the `angles` the caller gives (stepPose's: flat);
`moved` = the pieces whose path holds one of the stroke's bends. On an
overlap only: `flangeGaps` on that pose (the blank's `profile` when the caller
has it; else the blank's polygons — then a curve's chords are faces too, for
the depth only) for the facing row (`overlap`, between the two pieces, the
deepest), the hit `{ tool: 'part', thickness: true, phase: 'end', angle,
owner, pieces (the end that runs in first), bends (brake numbers), depth,
triangles, message, ms }` (+ `bump` / `bumps` = the bend's last hit on a round
bend, so the view frames that hit). `collision(options, { thickness, profile,
params })` runs it when `brakeCollisions` found nothing; such a hit has
`turnedClears: false` and `takeOff: null`. `stepCheck(…, { thickness, profile,
params })` likewise after both ways round cleared. `sequenceChecks({ fold,
machine, profile, params, thickness = true })`. In the station a thickness hit
skips `punchFix` (`thick`); `hornFix`, `lengthFix`, the ram / punch advice and
`wayTries` already do nothing for a tool they do not know; `sequenceTries`
skips a row refused for it. `offsetProblem` gives such a hit as it is (not
"Neither order clears."). `hitName` (`brakeCollisions.js`, new, exported: the
"Bend 2" / "Bend 3 on to 90°" of every message, the same code the messages
used) names it.

**(c) The message.** "Bend 2: bend 1's flange ends 0.30 mm inside bend 2's
flange (the sheet is 1.2 mm thick). Give that gap 0 mm or more in the part's
Sheet metal panel." The subject is the piece whose end runs in (the facing
row's `a`; with no row, the piece this stroke carries): "the flange" when it is
this stroke's own flange, else "bend n's flange" / "the base"; the other is
always named by number ("bend 2's flange", this hit's own included). No depth
→ "ends inside". Bend numbers are the brake's (the step that first makes the
bend, as `culprit` names them).

**(d) The card and the view.** `PressBrakePanel` is untouched: the card is the
ordinary Collision card with the message and no button (the tries add none),
the pedal is disabled as for any collision, a stored row shows "refused" with
the message and gets no row button. `showHit` takes the hit's `triangles` as
it is: both sheet faces (z 0 and t) of the two pieces in the machine frame of
the end pose (`brakeFrame` with the hit's die, gauge point and way round, the
round bend's last hit): the two flanges drawn red (16 triangles on the L
corner). `BrakeSideView.jsx`: a `part` hit marks the sheet and the context as a
`self` hit does ("Hits the part at 90°"). `shopLayer.js`: `cadShop().station.collision`
gains `marked` (the red triangles drawn; `CadViewport.brake.dom.test.jsx`'s one
`toEqual` of it updated).

**(e) Callers given the profile.** `CadWorkspace.jsx` (`brakeChecks`,
`changeBrakeBends`), `ShopPanels.jsx` (`FlangeGapsSet`'s deferred note, before
and after), `panelMaker.js` (its two `sequenceChecks`) pass the blank profile;
`docs/state-machines.md` (`cad-brake`): a CG-3 paragraph (no stage, no session
field; a collision kind in the facts, never in a search) and the new test
file. Guide: "The brake checks the sheet's thickness" under Flange gaps.

**Judgment calls.**

- **The tries are not checked at thickness.** An offer (Turn the sheet
  around, another punch, horns, a length, an order, a part-way bend) is tried
  on the mid-surface as before; the pending hit with the offer applied is a
  new station with the thickness on, so the pedal still refuses an end that
  lies in metal. The same for the "no worse" rule of an armed order: the
  later steps are checked on the mid-surface there; the stored rows after the
  commit read them at thickness.
- **Every user-visible station keeps it**: the facts (`advise: false`, what the
  card and the pedal show first) as well as the advice; the blade picker's
  cards; the grip's two outcomes.
- **The other piece is named by its number even when it is this hit's**
  ("inside bend 2's flange" on bend 2), not "this flange": the first wording
  read oddly when the flange made earlier is the one that runs in.
- **`phase: 'end'`** (not one of approach / bend / return): nothing reads a
  collision's phase but `brakeCollisions`' own words.
- **A hit refused for thickness still has `hooked`** when the horns are on:
  the warning is the horn's, unrelated.

**Where the spec meets the code differently.**

- "`showHit` marks the two pieces if the existing triangle highlight can take
  them cheaply": it can, unchanged; the pieces' outlines are triangulated once
  (cached) and only on a hit.
- "the candidate searches of the tries must not each pay for it": none pays at
  all; the cost of the clear stroke is the one test per verdict.
- The spec's foldOverlaps returns `row`; built without (no profile there): the
  brake reads the row itself on an overlap.

**Measured** (this machine; plain node on the app's modules, warm medians).
The test on a clear stroke of the user's tray, per step end (8 steps):
0.02 / 0.02 / 0.02 / 0.03 / 0.04 / 0.03 / 0.06 / 0.07 ms (the box test
prunes every pair but the touching ones; worst 0.24 ms in the verify run,
with Chrome running); `sequenceChecks` on the tray 195.0 ms with it, 196.3
without; the station's facts with bend 8 pending 31.4 / 32.1 ms before, 31.2 /
34.9 ms after (noise). The L corner's refusal path (flangeGaps for the depth
included): the advised station 18 ms. Advice timings of shop punches §6.9
(lip 20 / web 10, n − 1 creases before the lip, the inner bend pending,
nothing clears; `brakeStation` with advice, median of 7), before → after,
two alternating runs: 1 made 150.0 → 154.9 and 152.4 → 150.9 ms; 3 made
237.2 → 263.4 and 247.4 → 246.0; 5 made 435.1 → 447.6 and 453.2 → 451.2; 7 made
745.6 → 777.0 and 754.7 → 754.8 (§6.9's own 92 / 162 / 300 / 534 were another
machine: ×1.5 here). That case makes no thickness test at all (the pending hit
collides on the mid-surface; every trial runs without it), so the spread is
the machine's. Examples, every step at thickness against the mid-surface
alone (`sequenceChecks`, scratchpad `cg3-examples.mjs`): the pump bracket
2 steps (refused both, as before: the machine's refusal), the control box body
4 ok and lid 2 ok, the kiosk face frame 4, shelf tray 4, base channel 2, lower
cover 4, corner piece 1 (round) all ok, the user's tray 8 ok — no verdict
changed, no shipped example overlaps at thickness. The L corner: −0.3 / −0.05
/ −0.006 refused at step 2 ("0.30" / "0.05" / "0.01 mm inside"), −0.004 (inside
the skin), 0 and +0.2 clear; covering flush 0 / proud 0.1 / short 0.15 clear.
A third pair, after the verify run on a quiet machine: 159.7 → 157.7, 263.6 →
258.3, 476.2 → 452.7, 788.5 → 803.2 ms. Worst ratio over the three pairs
1.11 (3 made, the first pair; the other two 0.99 / 0.98), every other within
± 4 %.

**Files.** `cornerGaps.js` (`foldOverlaps`, `pieceTriangles`, the shared
helpers), `brakeStation.js` (`thicknessHit`, `collision`, `stepCheck`,
`sequenceChecks`, the searches' `thickness: false`, `failedMid`, the offset's
hits, `sequenceTries`), `brakeCollisions.js` (`hitName`), `BrakeSideView.jsx`,
`shopLayer.js` (`marked`), `ShopPanels.jsx`, `CadWorkspace.jsx`,
`panelMaker.js`; test `cornerGapsBrake.test.js` (14), the one line of
`CadViewport.brake.dom.test.jsx`; script `scripts/verify-corner-gaps-cg3.mjs`
with its fixture `scripts/fixtures/corner-gaps-l-overlap.json` (the §3.4 L
corner at −0.3, both bends stored, entities in step; written by scratchpad
`cg3-mkfixture.mjs`), screenshots in `artifacts/sketch-cad/corner-gaps-cg3`.
Docs: this section, `docs/state-machines.md` (`cad-brake`),
`sheet-metal-shop-guide.md`.

**Run (2026-11-18).** The brake's unit suites early (brake*, tightBends*,
roundBend, roundCorner, shopPunches*, panelMaker, kiosk, strokes, pressBrake,
bendQueue, shopRoute, shopFilm, cornerGaps*: 32 files, 597 tests): all
passed but one timeout under that parallel load (`cornerGapsSet.test.js`'s
"whatever its length", 6.6 s against 5 s; 1.9 s alone, passed; the thickness
test adds < 1 ms to its eight sequenceChecks). Then the brake and gap DOM
files with the unit ones (19 files, 221 passed). The whole suite once: 579
files (577 passed, 1 skipped, 1 failed), 7041 tests passed, 1 skipped, 1
failed — `src/analysis/shadowProjection.test.js`'s frame budget (134.9 ms
against 120 under the full run's load; 33 / 33 passed alone), not a file this
touches. `npm run lint`: 0 errors, 40 warnings (none in a file touched here).
Every verify script that bends a part (28: bq1, bt1, bt2, hands-on, tool
length, cg1 – cg3, sm1 – sm4, oe1, pl1, rb1 – rb3, sn1, sf1, sf3 – sf5, sp1,
sp2, st1, tb1 – tb3) passed against the dev server on 5180 (sf3 – sf5 default
to 5173 and were rerun with `CAD_VERIFY_URL`). `verify-corner-gaps-cg3`:
passed (thicknessHit 0.05 – 0.24 ms a step on the tray, 16 red triangles, no
page error).

**Audit (2026-11-18, the spec's author).** Read: `thicknessHit`, `collision`,
`stepCheck`, `failedMid`, the offset's `hitOf`, `sequenceTries`' skip, the
pending card's remedies (`punchFix` skipped; `hornFix`, `lengthFix` and
`WAY_TOOLS` do not take a `part` hit), `foldOverlaps` / `crossingPairs`. The
layer is right: one level above `brakeCollisions`, on by default for every
verdict, off (`thickness: false`) in every search. My probe (scratchpad
`cg3-audit-l.mjs`, the L-corner fixture, the row's edge moved with
`moveProfileEdge`): with the end 0.55 / 0.3 / 0.05 / 0.006 inside, the
mid-surface run says "ok ok" and the thickness run refuses step 2 with the
depth; −0.004 (inside the skin), 0 and +0.2 are clear. The user's tray as
saved: all eight ok with the check on, `sequenceChecks` no slower. Whole suite
run alone after both phases: 7055 passed, 1 skipped, 2 failed under the load of
the parallel run and passed alone (`kernel.sheetmetal.test.js`'s 250 ms build
budget at 260 ms; `tightBends.test.js`' kiosk parity test timed out at 5 s — it
takes 1.7 s alone). Lint 0 errors, 40 warnings. `verify-corner-gaps-cg1` … `-cg4`
passed against the running app. Accepted as the builder left it: the tries and
the armed order stay on the mid-surface (an applied offer is checked again, at
thickness, by the station); no dedicated test for an offset bend whose end
overlaps; the stroke between its start and its end stays on the mid-surface
(parked, §7).

## 6 · CG-4 — what the real shop holds

The user, asked how close their brake holds a flange: "i dunno maybe you do
research so you can know". What I found (2026-11-18, vendor and fabricator
pages, indicative):

| What                               | Figure                                                    | Source                        |
| ---------------------------------- | --------------------------------------------------------- | ----------------------------- |
| Back-gauge repeatability (machine) | ± 0.01 – 0.05 mm                                          | Durma, ADH                    |
| A flange after bending             | ± 0.2 – 0.5 mm usual, ± 0.1 mm on a good servo back gauge | ADH, Durma planning table     |
| A flange, job-shop promise         | ± 0.25 mm (± 0.010")                                      | Protocase                     |
| Bend angle                         | ± 0.5 – 1°, ± 1° promised                                 | Durma, SendCutSend, Protocase |
| Sheet 0.05 mm off in thickness     | 0.5° or more off in angle                                 | ADH                           |
| Angle error at a flange's tip      | height × tan(error): 0.35 mm per degree at 20 mm          | Fabcon                        |
| Laser cut edge                     | about ± 0.1 mm (not confirmed by a source found today)    | general practice              |

Machine repeatability is not part accuracy: the flat pattern, the sheet's
thickness and its springback decide the part. A 0.2 mm gap drawn is therefore
"between touching and about 0.6 mm" on the bench of an ordinary shop.

Sources: <https://www.adhmt.com/how-accurate-is-a-press-brake/>,
<https://durmapress.com/sheet-metal-tolerances-a-practical-guide-to-accuracy>,
<https://www.durmapress.com/press-brake-back-gauge-guide/>,
<https://www.protocase.com/resources/tolerances/bending.php>,
<https://sendcutsend.com/faq/what-are-your-tolerances-for-bending/>,
<https://fabcon.com/articles/?p=1518>.

### 6.1 The band

- `shopCatalog.js`: `SHOP_TOLERANCE = { flange: 0.2, cut: 0.1, angle: 1 }`
  (mm, mm, degrees; the sources in a comment). The model may carry its own in
  `fabrication.shop.tolerance` (any of the three; absent = the catalogue's);
  `normalizeModel` keeps it, old files load unchanged.
- `gapBand(row, fold, tolerance)` in `cornerGaps.js`: how far the row's gap
  may be off on the bench. **Revised at the audit (2026-11-18): every error is
  projected on the gap's own direction.** The first form, √(cut² · ends +
  flange² · bends + (lever · tan(angle))²) with one lever about the last bend
  of the flange met, counted a bend line that only slides a wall along its own
  face, and on a mitre took the lip's angle instead of the two walls' — about
  right on a 20 mm wall, four times too small on a 100 mm one. The form to
  build:

  band = √(cut² · ends + Σ over the bends between the two flanges of
  ((flange · slide)² + (lever · tan(angle))²))
  - `ends`: the cut edges that set the gap (1 for a face row, 2 for edge to
    edge).
  - The bends between the two flanges: the symmetric difference of the two
    pieces' `path` lists, as built.
  - n_B: the unit normal of the plane the gap is read to (B's sheet face for a
    face row, B's end for an edge row), posed. k the row's own (−n_A · n_B).
  - `slide` of a bend (mm of gap per mm its line lies off): a bend line laid ε
    off across itself moves everything it carries, as one rigid body, by
    ε · (d_fixed − d_moved), d the flat direction across the line as the
    bend's fixed side poses it and as the piece it bends poses it (a 90° wall:
    ε outward and ε lower). slide = |(d_fixed − d_moved) · n_B| / k.
  - `lever` of a bend (mm of gap per radian its angle is off): everything it
    carries turns about its axis (O, D: the line through its centre of
    curvature along the bend, in the folded frame); lever = the largest, over
    the four corners c of the row's end face, of |(D × (c − O)) · n_B| / k.
  - `bandTerms(row, fold)` → `{ ends, bends: [{ bend (index), slide, lever }] }`.

  On the user's part as saved, at the defaults (my probe, scratchpad
  `cg34-audit.mjs`): rear wall end → bend 5's inside face ± 0.367 (bend 8:
  slide 0, lever 0; bend 5: slide 1, lever 16.68), the side walls' ends ±
  0.374 (lever 17.18), the mitres ± 0.462 (each wall: slide 0.707, lever
  13.55; each lip: slide 0.707, lever 1.40 – 1.75) and ± 0.469 for the one at
  bends 4 / 1.

- The row shows it: "0.20 mm · ± 0.45 on the bench: may touch" when gap −
  band < 0, else "0.80 mm · ± 0.45 on the bench". The summary line adds "N
  may touch on the bench" when any does. Nothing is refused: it is what the
  bench will show, not a fault of the drawing.
- A `<details>` "What the shop holds" in the card (Sheet metal panel only):
  three number fields (flange ± mm, cut ± mm, angle ± °), written to
  `fabrication.shop.tolerance` (one commit per settled field, as the other
  shop settings are), with a line: "Typical figures: a good CNC brake holds a
  flange to ± 0.1 mm, an ordinary shop ± 0.2 – 0.5 mm; ± 1° on the angle.
  Put in what your own brake gives you once you have measured a few parts."
- The guide gets "How close is 0.2 mm on the bench" with the table above in
  shop words.

### 6.2 Acceptance

Unit: the band on the user's wall and mitre rows (numbers written down from
the formula by hand in the test), a model tolerance overrides the catalogue,
"may touch" at 0.2 and not at 0.8. DOM: the fields write the model, Undo
restores. Script `scripts/verify-corner-gaps-cg4.mjs`: the user's part set to
0.2 reads "may touch"; flange ± 0.05, cut ± 0.05, angle ± 0.25 and it no
longer does.

### 6.3 CG-4 as built

**(a) `shopCatalog.js`.** `SHOP_TOLERANCE = { flange: 0.2, cut: 0.1, angle: 1 }`
with the sources of §6 in its comment, `TOLERANCE_KEYS`, `toleranceValue`
(a finite number ≥ 0) and `shopTolerance(shop)`: the model's own
(`shop.tolerance`, any of the three that is such a number) over the
catalogue's; `SHOP_TOLERANCE` itself when the model has none.

**(b) `model.js`.** `normalizeFabrication` is untouched: it already keeps any
key of `shop` and returns the same object when the three names are there, so
an old file loads and saves byte for byte (tested on the user's file). The
validation (`validateShopRecords`) refuses a `tolerance` that is present and
not an object, or holds flange / cut / angle that is not a finite number ≥ 0:
"Invalid shop settings: the tolerances must be numbers of 0 or more." (other
keys inside it are let through, as `shop`'s own are).

**(c) `cornerGaps.js`.** (As rebuilt after the audit, §6.1 as revised.)
`bandTerms(row, fold)` → `{ ends, bends: [{ bend (index), slide, lever }] }`:
`ends` 1 for an end against a face, 2 for an end against an end
(`isEdgeRow`); one entry per bend of the symmetric difference of `row.a.path`
and `row.b.path`. n_B is B's posed sheet-face normal (its matrix's Z) for a
face row, B's posed end normal (from `b.flat`) for an edge row; k the row's
own `k`; signs play no part (each term is read as a size). `slide` =
|(d_fixed − d_moved) · n_B| / k, d = `bend.n` (the flat unit direction across
the line) turned by the bend's `fixedMatrix` and by the matrix of the piece
whose path ends with that bend (the piece it bends directly). `lever` = max
over the four corners c of A's end face (`a.flat` × z 0 and t, posed by A's
matrix) of |(D × (c − O)) · n_B| / k, O and D the bend's centre-of-curvature
line (`transform.origin` / `axis` carried by `fixedMatrix`). A bend standing
flat (no `origin`) has slide 0 and lever 0. `gapBand(row, fold, tolerance)` =
√(cut² · ends + Σ ((flange · slide)² + (lever · tan(angle))²)).
`benchVerdict(row, band)`: 'touch' when gap − band < 0, for a covering row
'proud' when flush − band < 0 (the same band), null otherwise and on an
overlap. `gapText(row, band = null)`: with a band, " · ± 0.37 on the bench"
after the CG-1 words, then ": may touch" / ": may stand proud"; an overlap row
keeps "runs 0.30 mm into it" alone. Pure, on the fold the row was read on.

**(d) `FlangeGaps.jsx`.** New prop `tolerance` (null: no band, CG-1's words):
the rows' bands in one memo by key; each row's figure and `aria-label` carry
it; the summary adds " · N may touch on the bench" (the rows whose verdict is
'touch'; covering rows that may stand proud are not counted).

**(e) `ShopPanels.jsx`.** `SheetMetalForm` reads `shopTolerance(model.fabrication
.shop)` (memo on the shop object) and hands it to the card (with or without
Set); new prop `onShopTolerance(key, value)`. `FlangeGapsSet` renders, under
its status line and note, `ShopTolerance`: a closed `<details>` "What the
shop holds" with three `NumericInput`s ("Flange ± (mm)", "Cut ± (mm)", "Angle
± (°)"; `allowEmpty`, min 0, steps 0.05 / 0.05 / 0.25; the value shown is the
one in force) and §6.1's line. A settled field calls `onTolerance(key,
max(0, v))`, an emptied one `onTolerance(key, null)`. `CadEditors.jsx`
`FeatureForm` passes `onShopTolerance` through.

**(f) `CadWorkspace.jsx`.** `changeShopTolerance(key, value)`, written as
`changeLaserSheet` writes the shop's other settings: one `commit` of
`fabrication.shop.tolerance` with that key set (or taken out for null; with
none left the `tolerance` key itself goes). The catalogue's own figure counts
as no value of the model's (after the audit): typed with none held it commits
nothing (no Undo entry with nothing to see); typed over a model's own it takes
that key away, as emptying the field does — so a model only ever holds
figures that differ from the catalogue's. The same value as held commits
nothing. Wired as the part's `onShopTolerance` through `perform`.
`PressBrakePanel` gets `tolerance={shopTolerance(model.fabrication?.shop)}`,
and `PressBrakePanel.jsx` passes it to its card (read only: no fields there).
No session or flow field: `docs/state-machines.md` untouched.

**(g) Tests and scripts touched for the new words.** `CadWorkspace.gaps.dom
.test.jsx` (the pinned texts carry the band or the "may touch" count),
`verify-corner-gaps-cg1.mjs` (the first row's figure matched as a prefix),
`verify-corner-gaps-cg2.mjs` (its "least 0.20 / 0.00 mm" lines with "· 12 may
touch on the bench", the covering row as a prefix) and
`verify-corner-gaps-cg3.mjs` (one row check made a prefix).

**The band on the user's tray, by hand from the geometry**
(`cornerGapsBand.test.js`; every bend t 1.2, r 1.28, BA 2.82115, h = BA / 2 =
1.410575; every centre of curvature t + r = 2.48 over the face its bend
starts from; the front and rear walls 19.5 between their lines, the sides 20).

- Wall row, "Bend 8 flange, end → bend 5 flange, inside face" (the file as
  saved, 0.73 mm), n_B = X, k = 1, ends 1. Bend 8 (the rear wall's own): its
  line off moves the wall along Y and Z, its angle turns it about an X axis —
  slide 0, lever 0. Bend 5 (the right wall's): its line off moves the right
  wall ε along X — slide 1; its angle turns it about a Y axis 2.48 up, so the
  end's top corners, 2.48 + (19.5 − 2h) up, give lever 19.5 − 2h = 16.678850.
  Defaults: √(0.1² + (0.2 · 1)² + (16.678850 · tan 1°)²) = √(0.01 + 0.04 +
  0.291130²) = √0.134757 = **0.367093**. Flange 0.05 / cut 0.05 / angle 0.25°:
  √(0.0025 + 0.0025 + 0.072776²) = √0.010296 = **0.101471**.
- Mitre row, "Bend 1 flange ↔ bend 3 flange, edge to edge": both lips lie flat
  on top, the mitre at 45° in the horizontal, n_B = (X ± Y) / √2, k = 1, ends 2.
  Each of bends 8, 1 (the rear wall, its lip), 5, 3 (the right wall, its lip)
  moves what it carries one unit along X or Y per unit off: slide 1/√2 each.
  Each angle turns about a horizontal axis, a point v_z above it moving v_z · θ
  horizontally, 1/√2 of it along n_B. The lips' top (the end's top corners):
  2.48 + (19.5 − 2h) + 2.48 = 21.638850. Levers: bend 8 and bend 5 (axes 2.48
  up) 19.158850 / √2 = 13.547353 each; bend 1 (centre 19.158850 up) 2.48 / √2
  = 1.753625; bend 3 (centre 2.48 + (20 − 2h) = 19.658850 up) 1.98 / √2 =
  1.400071; Σ lever² = 372.0971. Defaults: √(2 · 0.1² + 4 · (0.2 / √2)² +
  tan²1° · 372.0971) = √(0.02 + 0.08 + 0.113370) = **0.461920**. Tight:
  √(0.005 + 0.005 + 0.0070843) = **0.130707**.
- The other rows as saved: the side walls' ends ± 0.374 (lever 17.18), the
  bend 4 / 1 mitre ± 0.469 (its segment 35 drawn at 45.032°: slides 0.7075 /
  0.7067, levers 13.91 / 13.89, lips 1.75 / 2.11). These equal the coordinator's
  independent probe (`cg34-audit.mjs`, `projected`) to the digits given. On the
  set tray (every row 0.2): walls ± 0.37 / 0.39 (levers 16.68 / 18.53: the
  front and rear walls stand 0.5 lower, and the set moved the side walls' top
  ends up), mitres ± 0.46 / 0.47; all twelve "may touch" at the defaults, none
  at 0.05 / 0.05 / 0.25 (walls ± 0.10 / 0.11, mitres ± 0.13).
- The reason for the revision, pinned: the same tray with every outline point
  and bend line beyond a wall's line moved 80 mm on out (walls 99.5 / 100 mm,
  lips and mitres as before) reads its mitre ± 1.760 (height over the walls'
  axes 99.158850, × tan 1° = 1.731; ratio 1.017) and its wall ± 1.702; the
  wall's own bend 8 still slide 0, lever 0. At 180 mm more: mitre ± 3.491, wall
  ± 3.440. The first form read about ± 0.49 for that mitre whatever the height.

**Judgment calls.**

- **0.54 against 0.462 (asked at the audit): 0.462 is right, and my 0.54 was
  inconsistent.** My earlier figure projected the four angle terms on the
  gap's direction (the two walls' 13.55 each, the lips' 1.40 / 1.75) but kept
  §6.1's first flange term unprojected, 4 × 0.2² = 0.16: √(0.02 + 0.16 +
  0.1134) = 0.54. A bend line off by ε moves all it carries by ε · (d_fixed −
  d_moved); across a 45° mitre that vector (one unit horizontal along X or Y,
  one unit vertical) has 1/√2 along n_B, so each of the four bends gives (0.2
  / √2)² = 0.02, 0.08 in all: √(0.02 + 0.08 + 0.1134) = 0.462. Projecting the
  angle and not the line mixes the two forms; projected throughout is the
  consistent one, and it is what is built.
- **"May touch" reads the gap only**, as §6.1 says: a wall end that also passes
  beside its face (0.2 beside on the set tray) is still said to may touch.
- **Every row gets a band**, corner row or not; an overlap none; a covering
  row the same band, read against its `flush`. The summary counts 'touch'
  rows only.
- **Shown wherever a card reads the model**: the Sheet metal panel (with or
  without the Set controls) and the brake; `FlangeGaps` without a `tolerance`
  (none of the app's callers) keeps CG-1's words.
- **Fields show the figure in force** (the catalogue's until the model has its
  own); emptying one, or typing the catalogue's own figure, takes the model's
  own away (with none held: nothing committed); the same value commits
  nothing; below 0 is 0; no upper bound.
- **Invalid tolerances are refused on load** (the shop names' precedent),
  rather than silently dropped.
- **The disclosure lives in the card**, so a part with no gaps to read (a
  single bend, a flat blank) shows no fields.

**Where the spec meets the code differently.**

- §6.1's `normalizeModel` "keeps it": no change was needed there; the
  validation is where a bad value is caught.
- §6.2's DOM "Undo restores": each settled field is one commit and one Undo
  (tested back to the file's own `fabrication`, byte for byte).

**Files.** `shopCatalog.js`, `model.js`, `cornerGaps.js`, `FlangeGaps.jsx`,
`ShopPanels.jsx`, `CadEditors.jsx`, `CadWorkspace.jsx`, `PressBrakePanel.jsx`;
tests `cornerGapsBand.test.js` (13: the two rows by hand at both tolerances,
the base, the tall tray, the words, `shopTolerance`, the model),
`CadWorkspace.gaps.dom.test.jsx` (+2: the fields, the catalogue's figure
committing nothing and taking the model's own away, the band following, an
emptied field, Undo; the band at the brake); script
`scripts/verify-corner-gaps-cg4.mjs` (screenshots
`artifacts/sketch-cad/corner-gaps-cg4`). Guide: "How close is 0.2 mm on the
bench" (the table in shop words, the band as built, the deep-tray figures,
the fields, the sources).

**Run (2026-11-18, before the audit).** The whole suite once: 580 files (578
passed, 1 skipped, 1 failed), 7055 tests passed, 1 skipped, 1 failed —
`kernel.sheetmetal.test.js`'s build budget (258 ms against 250 under the full
run's load; 11 / 11 passed alone). `npm run lint`: 0 errors, 40 warnings.
verify cg1 – cg4 passed.

**After the audit (2026-11-18).** The band rebuilt projected (§6.1 as
revised; (c), the hand calculations and the first judgment call above are the
rebuilt ones) and `changeShopTolerance`'s catalogue rule ((f)). Focused run
(cornerGaps*, FlangeGaps*, CadWorkspace.gaps, model, shopCatalog,
PressBrakePanel\*: 14 files, 164 tests) all passed; `npm run lint` 0 errors, 40
warnings; the whole suite not rerun (the coordinator runs it alone). verify
cg1 – cg4 passed against 5180 (cg4: the saved rear wall "0.73 mm · passes 1.22
mm beside it · ± 0.37 on the bench"; at 0.2 all twelve may touch, ± 0.37 /
0.39 / 0.46 / 0.47; at 0.05 / 0.05 / 0.25 none, the rear wall ± 0.10; the
brake's card the same, no fields; three Undos → the file's `fabrication.shop`).

**Audit (2026-11-18, the spec's author).** The first build followed my §6.1 to
the letter, and §6.1 was wrong: the builder's own note (a wall row counts a
bend that only slides the wall along its face; a mitre takes the lip's angle,
not the walls') made me work the errors out as displacements projected on the
gap's direction, and on a deep tray the first form reads a mitre four or more
times too small. §6.1 rewritten, sent back, rebuilt. My probe (scratchpad
`cg34-audit.mjs`, `projected`, written before the rebuild from the fold's
matrices alone) and the built `gapBand` agree on all twelve rows of the user's
part to four places: walls 0.3671 / 0.3741, mitres 0.4619 / 0.4691; the terms
too (a wall's own bend: slide 0, lever 0; the wall met: slide 1, lever 16.68 /
17.18; a mitre: 0.707 a bend, levers 13.55 for each wall, 1.40 – 2.11 for each
lip). The builder's earlier 0.54 for a mitre had projected the angles and not
the bend lines; 0.462 stands. Read: `bandTerms`, `gapBand`, `benchVerdict`,
`gapText`, `shopTolerance`, the model's validation, `ShopTolerance`,
`changeShopTolerance` (the catalogue's own figure is never stored: typed with
none held it commits nothing, typed over the model's own it takes the key
out). Suite, lint and scripts: as in §5.2's audit (one run after both phases).
Limits, accepted: "may touch" reads the row's gap alone, so a wall end that
also passes 0.2 beside its face is flagged although it would have to close
both ways to touch (the safe side); the errors are taken as independent and the
figure is one in quadrature, not a worst case; the sheet's own thickness
tolerance is inside `angle`, not a term of its own; a bend standing part-way
has no test.

## 7 · Not in this spec (parked), and the user's answers

The user's answers (2026-11-18): the brake's tolerance — unknown to them,
researched (§6); walls — "it depends sometimes runs past and cover the others
and sometimes both stop" (so each row chooses, §4.2); a mitre — "sometimes
both lips move half each sometimes only one" (so each row chooses, §4.2).

Parked, each a real loss of precision found on 2026-11-18:

- The brake takes a flat L only: no "Flange (outside) mm" field that places
  the line through the bend deduction with the hit's own tooling.
- A made bend's line cannot be moved (remove and make again, or Model JSON).
- The sketcher cannot move or nudge an entity; Measure is off in the shop.
- A bend zone is the rectangle over its interval: where a mitre crosses a
  zone its corners are approximate (`outline-not-square`); a zone clipped to
  the metal would be exact.
- A gap marker in the ordinary 3D view (outside the brake).
- The stroke between its start and end is tested on the mid-surface.

Questions:

1. How close does the user's real brake hold a flange (back-gauge
   repeatability, and the spread of the bend deduction from sheet to sheet)?
   With it the readout could say "0.20 ± 0.15: may close" instead of a bare
   number. Not built without their numbers.
2. Walls: should one wall run past the other and cover its end (a closed
   corner, as the panel maker makes), or both stop short as drawn? Set keeps
   the user's own layout.
3. A mitre: both lips move half each (built), or one of them?
