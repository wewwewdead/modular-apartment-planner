# Sketch Studio — Angle bar (Phase P)

Status: spec 2026-11-07 (Fable). Builder: Opus 5.5 high. Auditor: Fable.

User request: "add angle bar on the sketch 3d model and workshop".
"3D Model & workshop" is the CAD workspace (`src/features/sketchstudio/cad/`);
"workshop" also covers its fabrication outputs (cutting list panel, Workshop
ZIP / PDF in `exports.js`).

## 1. What already exists (research, read before building)

An angle is not a new part type. It is a **member** (`feature.type ===
'member'`) with `section.type === 'angle'`, and that section type already
half-exists:

| Place                                                                                       | Today                                                                                                                                                                                                                     | File                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Section validation                                                                          | `resolveSection` accepts `angle` with width/height/wall; `wall >= min(w,h)` rejected                                                                                                                                      | `model.js:241-256`                                                                 |
| Kernel solid                                                                                | box `[-w/2,-h/2]…[w/2,h/2]` minus box `[-w/2+t,-h/2+t]…[w,h]` → **sharp-cornered L**, heel at local (−w/2, −h/2), leg A along +x (width), leg B along +y (height), axis through the section's **bounding-box centre**     | `kernel.js:134-197` (angle at 161-171)                                             |
| Mitre / gaps / trimming                                                                     | generic for every member (end planes about local Y, extension uses `width/2`)                                                                                                                                             | `model.js:258-287`, `kernel.js:173-196`                                            |
| Properties editor                                                                           | Type dropdown already lists `['angle','Angle']`; switching keeps width/height/wall; field labels are the raw key (`width`, `height`) except diameter/wall                                                                 | `CadEditors.jsx:432-479`                                                           |
| New part                                                                                    | `createPart(kind)` only knows `'board'` and `'member'` (a 40×40×2 tube, start (0,0,0) → end (0,0,700), "Square tube", Steel, grain null)                                                                                  | `model.js:378-404`                                                                 |
| Add commands                                                                                | ribbon `{ tab:'Solid', label:'Tube / member' }` and Start-list button; `addPart` drops non-box bodies at `[x, y, 0]` (view drop point, no Fit — keep that rule, see project memory part-drop-point)                       | `CadWorkspace.jsx:464-473, 1182-1183, 3113-3114`                                   |
| Member-placed cuts ("Cut placement → On tube / member")                                     | flat sections put the cut on the bounding-box face: front y=−h/2, rear y=+h/2, left x=−w/2, right x=+w/2. For an angle **rear and right land on the leg tips** (wrong)                                                    | `cutPlacement.js:94-150` (flat branch 125-131); side list `CadEditors.jsx:742-790` |
| Clicked holes on a flat face                                                                | become exact coordinates, generic — already fine on angle legs. A click on the root fillet is a curved face → `CUT_CURVED` ("pick a flat face") because `roundMemberPlacement` only matches round members — fine          | `placementCuts.js:200-250, 500-530`                                                |
| End-section copy (Extrude on a selected square-ended member starts from its own hollow end) | `memberEndSketch` returns **null** for angle                                                                                                                                                                              | `operations.js:72-130` (angle at 101), used at 153 and 212                         |
| Cut list                                                                                    | `section: JSON.stringify(sourceMember.section)` (also the stock-grouping key in `planLinearStock`); CSV column "Stock section (mm)" holds that JSON; the panel row (`CadWorkspace.jsx:2817-2845`) never shows the section | `fabrication.js:22-90, 170-200`                                                    |
| Drawings, X-ray, box snap, mates, measure, hardware                                         | generic on the built solid — no change                                                                                                                                                                                    | —                                                                                  |

Kernel path profiles support `line`, `arc` (three-point, `threePointsArcTo`)
and `spline` segments (`kernel.js:74-84`), so an L with arcs can be expressed
as an ordinary `{ type:'path', start, segments, closed:true }` profile and
drawn by the existing `drawing()` helper. Replicad is 1.2.0.

## 2. Decisions

1. **Section model.** `angle` gains two optional fields: `rootRadius` (r1,
   inner fillet between the legs) and `toeRadius` (r2, rounds the inner corner
   of each leg tip). Both accept numbers or `=expressions` like every other
   section field; absent ≡ 0. Hot-rolled shape (EN 10056-1 style). No heel
   (outer) radius — a bent sheet-metal angle is a possible follow-up, not
   this phase.
2. **Convention unchanged:** heel at local (−w/2, −h/2), leg A = `width`
   along local +x, leg B = `height` along local +y, member axis through the
   bounding-box centre, length along local +z. Old saved angles therefore
   keep their pose. (Judgment call: a heel-on-axis datum would be nicer for
   frames, but it would move every saved angle and break the shared mitre
   maths. Builder: do not change it.)
3. **Byte compatibility.** An angle with both radii 0/absent is built by the
   **existing** box-minus-box code, untouched. `resolveSection` must not add
   `rootRadius`/`toeRadius` keys to the resolved object when they are absent,
   so `JSON.stringify(section)` (cut-list grouping key, CSV) of every old
   save is unchanged. Tube/pipe/bar/round-bar code paths untouched. No
   `CAD_VERSION` bump.
4. **Validation** (in `resolveSection`, messages user-facing):
   r1 ≥ 0, r2 ≥ 0; `r2 < wall` ("Toe radius must be less than the
   thickness."); `r1 + r2 < width − wall` and `< height − wall` ("Root and toe
   radii do not fit on the legs."). Existing `wall >= min(w,h)` rule stays.
5. **New part kind `'angle'`** in `createPart`: same member feature as the
   tube (start (0,0,0), end (0,0,700), gaps/angles 0) with
   `section: { type:'angle', width:50, height:50, wall:5, rootRadius:7, toeRadius:3.5 }`,
   name **"Angle bar"**, material **Steel**, grain null. `addPart('angle')`
   needs no position change (non-box body → `[x, y, 0]`, no Fit).
6. **Add commands:** ribbon `{ tab:'Solid', label:'Angle bar', run: () => addPart('angle') }`
   right after "Tube / member"; Start list gets an **Angle bar** button
   after "Tube / member" in the same `.cad-inline` row.
7. **Standard sizes.** New pure module `cad/stockSections.js` holding:
   - `ANGLE_SIZES`: equal angles, EN 10056-1 nominal radii (mm) —
     `[w, h, t, r1, r2]`: 20×20×3 (3.5, 2), 25×25×3 (3.5, 2), 30×30×3 (5, 2.5),
     40×40×4 (6, 3), 40×40×5 (6, 3), 50×50×5 (7, 3.5), 50×50×6 (7, 3.5),
     60×60×6 (8, 4), 80×80×8 (10, 5), 100×100×10 (12, 6). Label `L 50×50×5`.
   - `angleSectionProfile(section)` → closed `path` profile of the resolved
     section (numbers), arcs only where a radius > 0 (zero radius = plain
     corner, no zero-length segments). Outline, with a = −w/2, b = −h/2:
     heel (a,b) → (a+w, b) → (a+w, b+t−r2) → toe arc to (a+w−r2, b+t) →
     (a+t+r1, b+t) → root arc (concave) to (a+t, b+t+r1) → (a+t, b+h−r2) →
     toe arc to (a+t−r2, b+h) → (a, b+h) → close. Arc `mid` = centre ± r·(√½, √½)
     (toe centres (a+w−r2, b+t−r2) and (a+t−r2, b+h−r2), mid on the +,+
     diagonal; root centre (a+t+r1, b+t+r1), mid on the −,− diagonal).
   - `angleSectionArea(section)` = t(w + h − t) + (1 − π/4)(r1² − 2·r2²)
     (50×50×5 r7/3.5 → ≈ 480.3 mm², matches the EN table's 4.80 cm²).
   - `sectionLabel(section)` for every member type: tube `SHS 40×40×2` (or
     `RHS 60×40×3` when w≠h), pipe `CHS Ø48.3×3`, bar `Flat 40×10`,
     round-bar `Round Ø20`, angle `L 50×50×5` (unequal `L 75×50×6`). Numbers
     via a compact formatter (no trailing `.0`).
8. **Kernel.** In `member()`, for `angle` with r1 > 0 or r2 > 0: build
   `drawing(angleSectionProfile(s))` on plane XY at z = −extra, extrude
   `length + 2·extra`, then the existing end-plane trimming and rotation/
   translation unchanged. Radius-free angle → existing code.
9. **Properties editor** (`CadEditors.jsx` section fieldset):
   - Field labels: `width` → "Leg A (width)" and `height` → "Leg B (height)"
     for angle only (tube/bar keep their current label text — tests may
     depend on it; check), `wall` → "Thickness" for angle (keep "Wall
     thickness" for tubes), `rootRadius` → "Root radius", `toeRadius` →
     "Toe radius".
   - For angle, a **Standard size** select above the fields: "Custom" + every
     `ANGLE_SIZES` entry; choosing one writes all five numbers in one update;
     the select shows the matching entry when all five current values equal
     one (numbers only; any expression → Custom).
   - Switching Type to angle keeps width/height/wall as today and adds
     `rootRadius`/`toeRadius` from the `ANGLE_SIZES` entry matching
     (w,h,t) if one does, else 0. Switching away from angle drops them.
10. **Member-placed cuts on an angle** (`resolveCutPlacement` flat branch,
    `section.type === 'angle'` only): front = outside of leg A (y = −h/2,
    unchanged), left = outside of leg B (x = −w/2, unchanged), **rear =
    inside of leg A at y = −h/2 + t**, **right = inside of leg B at
    x = −w/2 + t**; drilling directions unchanged (−side.sign along the
    side axis). Reject an offset that puts the centre off the leg: the
    coordinate across the face must lie within the leg's extent (leg A:
    x ∈ [−w/2, w/2] outside, [−w/2 + t, w/2] inside; leg B likewise in y) —
    message "Cut offset must land on the angle leg.". In the Cut side select,
    for an angle member the option texts read "Front — outside of leg A",
    "Rear — inside of leg A", "Left — outside of leg B", "Right — inside of
    leg B" (values unchanged).
11. **End-section copy.** `memberEndSketch` for a square-ended angle returns
    the `angleSectionProfile` (radius-free → same path without arcs) instead
    of null, same plane/origin/xDirection logic as the tube branch.
12. **Cutting list panel:** member rows show `sectionLabel(...)` as the first
    `<span>` (e.g. "L 50×50×5 · CL 700.00 mm" or its own span — builder's
    choice, keep the CL/long/short spans). CSV and ZIP files unchanged.

## 3. Out of scope

Bent (cold-formed) angles with heel radius; unequal-angle catalogue; channel /
I-beam / T sections; heel-datum placement; section callouts on drawings;
weight per metre. Mention them as follow-ups only.

## 4. Tests (vitest, run from the repo root — never from inside `cad/`)

- `stockSections.test.js`: profile closes, no zero-length segment for r = 0,
  area formula vs shoelace+arc area of the profile, labels for all five types.
- `model.test.js`: `resolveSection` radii validation messages; absent radii
  not added; `createPart('angle')` shape.
- `kernel.test.js` (real OpenCascade): angle 50×50×5 r7/3.5, 700 long →
  volume ≈ `angleSectionArea × 700` (rel. 1e-3), bounds 50×50×700;
  radius-free angle volume = t(w+h−t)·L exactly as before; mitred angle builds.
- `cutPlacement` tests: rear/right on an angle land on the inner faces;
  off-leg offset rejected; tube rear/right unchanged.
- `operations.test.js`: `memberEndSketch` for an angle returns the L path.
- `CadWorkspace.place.dom.test.jsx`: ribbon **Angle bar** lands like the
  tube (axis through `[1250, −480, 0]`, no fitKey change) and the Start list
  button exists.
- Editor DOM test: Standard size select fills all five fields; labels.
- Full suite + `npm run lint` clean.

## 5. Browser verification

New `scripts/verify-angle-bar.mjs` following `scripts/verify-start-sketch.mjs`
/ `sketch-cad-steps.mjs` (Playwright `channel:'chrome'`, headless; dev server
on 5180 listens on `[::1]` → `CAD_VERIFY_URL=http://localhost:5180/sketch`):
fresh model → Start list **Angle bar** → wait for rebuild → saved part has
the default section, instance position read from the save (never assume the
origin) → screenshot iso → Properties: Standard size `L 100×100×10` →
rebuild OK → place a hole by clicking the outside face of leg A (hole stored,
rebuild OK) → open Cutting list, the row shows `L 100×100×10` → no page
errors. Screenshots to `artifacts/sketch-cad/angle-bar/`. Rerun
`verify-direct-placement.mjs` and `verify-start-sketch.mjs` (Start list
changed).

## 6. Docs

Update `docs/sketch-studio-cad.md` where it lists Board / plate and Tube /
member, and the member-cut paragraph (§ "On tube / member") for the angle
side meanings. Add §7 "Outcome" to this file after the build.

## 7. Outcome (2026-11-07, Opus 5.5 high)

Shipped §2 items 1–12, the §4 tests, the §5 script and the §6 docs. Not
committed.

**Files**

- `cad/stockSections.js` (new): `ANGLE_SIZES` (frozen `{ label, width,
height, wall, rootRadius, toeRadius }` objects built from the §2.7 table),
  `angleSizeOf(section, match)` (exact five-number match, or `'leg'` = w/h/t
  only; numbers only, so an expression never matches), `angleSectionProfile`,
  `angleSectionArea`, `sectionLabel` (compact `mm()` formatter: ≤ 2 decimals,
  no trailing zeros).
- `cad/model.js`: `resolveSection` angle branch copies `rootRadius` /
  `toeRadius` only when present (`!= null`), messages "Root radius cannot be
  negative.", "Toe radius cannot be negative.", "Toe radius must be less than
  the thickness.", "Root and toe radii do not fit on the legs." (checked
  against `min(w, h) − t`, after the unchanged wall rule). `createPart('angle')`.
- `cad/kernel.js` `member()`: new `else if (angle && (r1 > 0 || r2 > 0))`
  branch, `drawing(angleSectionProfile(s)).sketchOnPlane('XY', [0, 0, −extra])
.extrude(length + 2·extra)`; the box-minus-box branch is untouched.
- `cad/cutPlacement.js` `resolveCutPlacement`: angle branch before the generic
  flat one (rear/right one thickness in, off-leg check inclusive ± 1e-9).
- `cad/operations.js` `memberEndSketch`: angle → `angleSectionProfile(s)`.
- `cad/CadEditors.jsx`: section fieldset (angle labels, Standard size select,
  type switch adds/drops radii), Cut side option texts on an angle member.
- `cad/CadWorkspace.jsx`: ribbon + Start-list **Angle bar**, cut-list row's
  first span `sectionLabel(r.member.section)`, addPart comment.
- Tests: `stockSections.test.js` (new, 7), `CadEditors.section.dom.test.jsx`
  (new, 6), `model.test.js` (+2), `kernel.test.js` (+4: default angle volume
  and bounds, radius-free exact volume with and without zero radii, default
  hole through one leg from all four sides, mitre volume = A·L + (tan s − tan
  e)·Sx), `cutPlacement.test.js` (+3), `operations.test.js` (+2),
  `CadWorkspace.place.dom.test.jsx` (+2), `CadWorkspace.start.dom.test.jsx`
  (Start list now includes Angle bar).
- `scripts/verify-angle-bar.mjs` (new); `docs/sketch-studio-cad.md`.

**Numbers.** Default angle (L 50×50×5 r7 / r3.5 × 700): kernel volume
336 180.4215 mm³ vs `angleSectionArea × 700` = 480.25774 × 700 = 336 180.4215
mm³ (relative difference 5e-16); bounds exactly [−25, −25, 0]–[25, 25, 700].
cad folder 55 files / 647 tests pass. Full suite 439 files passed, 1 skipped;
5361 tests passed, 1 skipped. `npm run lint`: 0 errors, 42 warnings, none in
the files touched.

**Browser.** `verify-angle-bar.mjs` passed (Start list → default section at
the saved position (0, 0, 0); Standard size L 100×100×10 → all five values,
Model current; Hole over the root fillet from the rear view reads "Curved face
· pick a flat face or a round tube"; click on the outside of leg A → hole at
(20, −50, 350) direction (0, 1, 0), through all, 282.74 mm³ removed = π·3²·10;
cutting-list row "L 100×100×10 · CL 700.00 mm"; no page errors).
`verify-direct-placement.mjs` and `verify-start-sketch.mjs` passed.

**Judgment calls**

- Old angles without radii still show **Root radius** / **Toe radius** fields
  reading 0 (absent ≡ 0); nothing is written until one is edited.
- `ANGLE_SIZES` entries are objects with a `label` rather than bare arrays.
- The Standard size select's option values are the labels; "Custom" is a
  no-op.
- Tube/bar field labels keep the raw `width` / `height` text; resolver error
  labels ("Section width", "Wall thickness") are unchanged for angles.
- Cut-list section span shows only on unmodified member rows (`r.member`), not
  on modified-member rows.

**Warts / follow-ups**

- Through all on an angle's cut extent select still reads "Through all — both
  tube walls" (it goes through one leg).
- The inside-face offset check uses the flat extent `[−w/2 + t, w/2]`, so a
  centre inside the root-fillet band is accepted and drills partly through the
  fillet.
- The first two full-suite runs each had one 5 s timeout, in the
  pre-existing `CadWorkspace.place.dom.test.jsx` "Hardware: three holes…"
  test under load (2.25 s alone, file passes alone); the third run and a run
  with `--testTimeout=20000` passed completely.
- Out of scope, as §3: bent angles, unequal catalogue, other sections,
  heel-datum placement, section callouts, weight per metre.

## 8. Phase P.1 — custom angle sizes and member length (spec 2026-11-07, Fable)

User request: "allow users to resize angle bar length or height … right now it
has only the standard size. You dont need to remove the standard sizes
selections, you just need to allow users to use customize size they want."

### 8.1 What the user sees today (research)

Headless screenshot of a fresh Start list → Angle bar, Properties panel
(1600×1000): Part name, Material, Search materials, Definition line, `Size 50 ×
50 × 700 mm`, **Placement & rotation (open)**, then `MEMBER · FEATURE 1` with raw
`start` X/Y/Z and `end` X/Y/Z vectors. The fold is at the `end` vector. The
section fieldset (Type, Standard size, Leg A, Leg B, Thickness, Root radius, Toe
radius) and raw `gapStart` / `gapEnd` / `angleStart` / `angleEnd` are all below
it. So:

1. **There is no Length field.** You change length only by typing the raw `end`
   Z, which the panel never calls a length. The member form is the generic
   `FeatureForm` key loop (`CadEditors.jsx:269-583`). `start` / `end` go
   through `VectorFields` with `labels[key] || key`, so they read "start" /
   "end".
2. **The Leg A / Leg B / Thickness fields exist** (`CadEditors.jsx:432-529`), but
   they are below the fold, under the standard-size select. They read as a
   catalogue-only control.
3. **Custom sizes break on the radii.** The default carries r1 7 / r2 3.5.
   `resolveSection` (`model.js:364-378`) rejects `r2 >= t` and
   `r1 + r2 >= min(w,h) − t`. Thickness 3 → "Toe radius must be less than the
   thickness."; Leg A 10 → "Root and toe radii do not fit on the legs.". Editing
   a leg or the thickness never touches the radii. Worse: fields are live
   (`ValueField`, 150 ms settle, Phase L). Typing "60" passes through "6", and
   that intermediate value already fails.

Siblings read: Board / plate is a `box` feature whose width/depth/height are
plain `ValueField`s, i.e. directly editable size. Tube / member is the same
`member` feature, so it has the same missing Length. Extrude has a `length`
field labelled "Length (mm)" (`labels.length`). The live-field contract
(memory: never key a `ValueField` on its value; Esc reverts; one undo step per
field session via `FieldSessionContext`) applies to everything below. The cut
list's finished length comes from `memberMetrics` (`model.js:383+`). Gaps and
mitres trim from the start→end axis length.

### 8.2 Decisions

1. **Member "Size" block first.** For `feature.type === 'member'` (every
   section type, not just angle), `FeatureForm` renders in this order:
   - **Length (mm)**: `|end − start|` evaluated with the model parameters,
     shown rounded like the other readouts. Editing it keeps `start` and sets
     `end = start + û·L`, where û is the current unit axis (+Z if start ≡ end).
     It is written as numbers. It must be > 0 ("Length must be more than 0.").
     If `start` or `end` holds any `=expression`, the field is read-only, with a
     help line: "End points use expressions — edit them under End points." Help
     text under the field: "Start to end along the axis; gaps and mitres trim
     from this."
   - The **Stock section (mm)** fieldset as today: Type, Standard size (angle
     only, unchanged list, "Custom" still a no-op), Leg A (width), Leg B
     (height), Thickness, Root radius, Toe radius. Tube/bar/pipe labels stay
     unchanged.
   - Then **End points (part mm)**: a `<details>` (closed by default) with the
     `start` / `end` `VectorFields` labelled "Start" and "End".
   - Then **Ends & gaps**: a `<details>` (closed by default) with gapStart /
     gapEnd / angleStart / angleEnd. Give them labels: "Gap at start (mm)", "Gap
     at end (mm)", "Mitre at start (degrees)", "Mitre at end (degrees)".
     Builder: check the existing tests and scripts for the raw names and the
     open-by-default `start` / `end` before renaming. Keep or update them so
     everything passes, and list what changed.
2. **Radii follow the size until the user sets them.** Add a pure
   `angleRadiiFor({ width, height, wall })` to `stockSections.js`:
   - If an exact catalogue match on (w, h, t) exists, return its radii.
   - Otherwise take r1 / r2 from the catalogue entry with the nearest thickness
     (tie → the smaller entry).
   - Then clamp so the pair always validates with margin: `r2 ≤ 0.5·t`, and
     `r1 + r2 ≤ 0.5·(min(w,h) − t)`, scaling r1 and r2 down together and
     rounding to 0.1 mm.
   - It returns `{ rootRadius: 0, toeRadius: 0 }` when `t ≥ min(w,h)` or any
     input is not a positive number. That section is invalid anyway, and the
     existing wall message shows.
   - It is a function of the three values only, never of the previous radii. So
     intermediate keystrokes cannot ratchet the radii down: typing "6" then "60"
     ends with the radii of 60.

   **Rule in the editor:** editing Leg A, Leg B or Thickness of an angle also
   rewrites both radii to `angleRadiiFor(new values)` **iff** the current radii
   equal `angleRadiiFor(old values)` (numbers; within 1e-9). That means they
   are still "automatic", which includes every catalogue size and the default
   part. If the user typed their own radii (or either is an expression), the
   radii are left alone, and an invalid combination shows the existing resolver
   message as today. Picking a Standard size and switching Type to angle keep
   their current behaviour. The type switch's 'leg' lookup may become
   `angleRadiiFor` for consistency (builder's call, flag it). The update is one
   `update('section', …)` call, so it stays one undo step with the field
   session.

3. **No model or kernel change.** No new keys; `end` stores the length. Old
   saves are byte-identical. No `CAD_VERSION` bump. Cut list, CSV and ZIP are
   unchanged. `sectionLabel` already prints custom sizes (`L 63×47×4.5`).
4. Both legs are independent, so unequal custom angles work. The label is
   already `L w×h×t`.

### 8.3 Out of scope

A viewport drag grip for member length (the extrude distance-arrow pattern).
It is a candidate follow-up, so mention it only. Also out of scope: a tube
standard-size catalogue, the unequal-angle catalogue, and the §7 warts.

### 8.4 Tests (vitest from the repo root)

- `stockSections.test.js`: `angleRadiiFor` returns the catalogue match; the
  nearest-thickness pick; clamping always passes `resolveSection` over a sweep
  of (w, h, t) (e.g. w,h ∈ {10…120}, t ∈ {1…min−1}); zero for invalid input;
  "6" then "60" gives the radii of 60.
- `CadEditors.section.dom.test.jsx`:
  - Length shows 700 for the default. Typing 1200 → `end` = start + 1200·û
    (also on a non-Z axis member, e.g. start (0,0,0) → end (300,400,0), Length
    reads 500, set 1000 → end (600,800,0)). An expression end → read-only with
    the help line.
  - Leg A 63 / Thickness 3 on the default angle → section valid, radii
    automatic, Standard size reads Custom.
  - Custom radii are preserved when a leg changes.
  - Standard size still fills all five values.
  - End points / Ends & gaps are collapsed and labelled.
- Full suite + `npm run lint` clean (note the known 5 s flake from §7).

### 8.5 Browser

Extend `scripts/verify-angle-bar.mjs`, or add `scripts/verify-angle-custom-size.mjs`
(builder's call):

1. Fresh model → Start list Angle bar.
2. Properties **Length** = 1250 → Model current; the saved `end` is
   (0,0,1250) relative to start; the Size readout says `50 × 50 × 1250`.
3. Leg A 75, Leg B 40, Thickness 4 → Model current, no "Rebuild failed";
   Standard size reads Custom; the saved section has valid auto radii.
4. Cutting list row `L 75×40×4 · CL 1250.00 mm`.
5. Standard size L 40×40×4 → all five values from the catalogue.
6. No page errors; screenshot of the Properties panel showing Length above the
   fold at 1600×1000.

Rerun `verify-angle-bar.mjs` (if not the same file) and `verify-start-sketch.mjs`.
The dev server is `npx vite --port 5180` → `CAD_VERIFY_URL=http://localhost:5180/sketch`.

### 8.6 Docs

Update `docs/sketch-studio-cad.md` where it describes member properties. Add
§8.7 "Outcome" here after the build (files, numbers, judgment calls, warts).

### 8.7 Outcome (2026-11-07, Opus 5.5 high)

Shipped §8.2 items 1–4, the §8.4 tests, the §8.5 script and the §8.6 docs.
No model, kernel, schema or export change; no `CAD_VERSION` bump. Not
committed.

**Files**

- `cad/stockSections.js`: `angleRadiiFor({ width, height, wall })` (exact
  `angleSizeOf(…, 'leg')` match → its radii; else the first entry with the
  nearest thickness, scaled by `min(1, 0.5t / r2, 0.5(min(w,h) − t) / (r1 +
r2))`, each floored to 0.1 mm with a 1e-6 epsilon; `{ 0, 0 }` for any input
  that is not a finite positive number or `t ≥ min(w, h)`) and
  `angleRadiiAutomatic(section, size = section)` (both radii are numbers
  within 1e-9 of `angleRadiiFor(size)`).
- `cad/CadEditors.jsx`:
  - `FeatureForm` reads `ParameterContext` (first statement, before the early
    returns). The key loop body became `renderField([key, value])` (Prettier
    re-indented it; the per-key logic is unchanged). For `feature.type ===
'member'` it renders, in order: `MemberLengthField`, the section fieldset,
    `<details>` **End points (part mm)** (the `start` / `end` `VectorFields`,
    legends **Start** / **End**) and `<details>` **Ends & gaps** (**Gap at
    start (mm)**, **Gap at end (mm)**, **Mitre at start (degrees)**, **Mitre
    at end (degrees)**; absent keys read 0). Both are closed by default. Any
    other member key is rendered after them as before. Those labels apply to
    members only.
  - `MemberLengthField` (new): a `ValueField` keyed `member-length` (never on
    its value) showing `+|end − start|.toFixed(3)` (the Size readout's
    rounding), with the help line. A commit evaluates the text (`numeric` with
    the parameter values, so `=len` writes a number) and writes `end = start +
û·L`, rounded to 1e-9 mm, as one `onChange`. û is the current unit axis, or
    +Z when |end − start| ≤ 1e-9. L ≤ 0 or text that does not resolve is not
    applied. Live, it is ignored silently. On Enter / blur it shows `<p
role="alert">Length must be more than 0.</p>` until the next valid value.
    Esc (`meta.revert`) writes back the exact `end` captured at the session's
    first call, not one recomputed from the rounded value. Any non-number in
    `start` / `end` → a `readOnly` input plus "End points use expressions — edit
    them under End points."
  - Section fieldset: a `dimensions(section)` helper resolves width / height /
    wall through `numeric` with the parameter values (NaN when unresolvable).
    A Leg A / Leg B / Thickness edit on an angle whose radii are automatic for
    the old values writes `{ ...section, [field]: next, ...angleRadiiFor(new)
}` in the same single `update('section', …)`. The Type switch to Angle now
    uses `angleRadiiFor(dimensions(next))`. Standard size is unchanged.
- `cad/cad.css`: `.cad-field input[readonly]` (grey fill) for the read-only
  Length.
- Tests: `stockSections.test.js` +5 (7 → 12): catalogue match, nearest-thickness
  and tie cases with exact values, a 12 856-size sweep (w, h ∈ 10…120 step 10,
  t ∈ 0.5…min − 0.5 step 0.5) that always passes `resolveSection` (margin
  asserted off the catalogue), zero cases, "6" → "60".
  `CadEditors.section.dom.test.jsx` +11 (6 → 17): order and folding, absent
  gaps, Length on +Z and on a tilted axis from a non-origin start (500 → 1000,
  via `=len`), zero-length member and the ≤ 0 alert, live Length + Esc
  restoring an exact non-round end, read-only on an expression end, Leg A 63 /
  Thickness 3 (then Leg B 10 and back to L 50×50×5), live "6" → "60",
  expression leg by value, preserved custom radii and radius-free angle,
  Standard size after a custom size. One existing expectation changed (see
  judgment calls).
- `scripts/verify-angle-custom-size.mjs` (new); `docs/sketch-studio-cad.md`
  (Angle bar paragraph: custom sizes and automatic radii; new **Member
  properties** paragraph).

**Label / layout changes checked against tests and scripts.** I grepped every
`*.test.*` under `src/features/sketchstudio` and every `scripts/*.mjs` for the
raw `start` / `end` / `gapStart` / `gapEnd` / `angleStart` / `angleEnd`
labels, member X/Y/Z field lookups and member `fieldset` / `details` /
`legend` selectors. Nothing reads them. The tests that use those keys are
model-level (`model`, `kernel`, `cutPlacement`, `operations`,
`placementCuts`), and the scripts' X/Y/Z lookups are scoped to the instance
**Position (mm)** / **Rotation (degrees)** groups. So no test or script needed
updating for the renames or the folding.

**Numbers.** `angleRadiiFor`: 63×50×5 → r5 / r2.5; 63×50×3 → r2.6 / r1.5;
75×40×4 → r4 / r2; 6×50×5 → r0.3 / r0.1; 40×40×2 → r1.7 / r1; 10×10×3 →
r2.2 / r1.2. Every one of the 10 catalogue sizes returns its own radii.
Tests: cad folder 59 files / 698 tests pass (run alone). The whole
`src/features/sketchstudio` tree passes too: 182 files / 2092 tests. Full
suite, three runs:

1. Run alongside a second vitest process (my mistake). 6 failed: five 5 s
   timeouts and the `shadowProjection` U3 timing budget (234.8 < 120 ms).
   All were load.
2. Run alone. 441 files passed, 2 failed, 1 skipped; 5410 tests passed, 2
   failed, 1 skipped. Both failures were 5 s timeouts: the known
   `CadWorkspace.place.dom.test.jsx` "Hardware: three holes…" (2.69 s alone)
   and `CadWorkspace.groups.dom.test.jsx` "a viewport click takes the group…"
   (1.94 s alone; Part groups phase). Both files pass alone (37 / 37).
3. `--testTimeout=20000`: 443 files passed, 1 skipped; 5412 tests passed, 1
   skipped.

`npm run lint`: 0 errors, 42 warnings, none in the files touched. Prettier is
clean on every touched file.

**Browser.** `verify-angle-custom-size.mjs` passed at 1600×1000:

- Start list Angle bar → start (0, 0, 0), end (0, 0, 700) from the save.
- Member Properties: Length 700 at y 225–253 px as selected (the panel scrolls
  to the feature heading), and 834–862 px with the panel scrolled to its top
  (panel bottom 968 px), so it is above the fold either way. Both groups are
  closed.
- Length 1250 + Enter → saved end − start = (0, 0, 1250), "Size 50 × 50 ×
  1250 mm". One Undo → 700, Redo → 1250 (one undo step).
- Leg A 75, Leg B 40, Thickness 4, each followed by Model current and no
  "Rebuild failed" → section `{ angle, 75, 40, 4, rootRadius 4, toeRadius 2
}` = `angleRadiiFor`, Standard size Custom, "Size 75 × 40 × 1250 mm".
- Cutting list row first span "L 75×40×4", "CL 1250.00 mm".
- Standard size L 40×40×4 → `{ 40, 40, 4, 6, 3 }`, Length still 1250.
- No page errors. Screenshots in `artifacts/sketch-cad/angle-custom-size/`.

`verify-angle-bar.mjs` and `verify-start-sketch.mjs` passed again unchanged.

**Judgment calls**

- New script rather than extending `verify-angle-bar.mjs`, so the Phase P
  script stays as audited.
- The Type switch to Angle uses `angleRadiiFor` (the §8.2.2 option). A
  catalogue match gives the same radii as before. Off the catalogue it now
  gives scaled radii instead of 0, e.g. tube 40×40×2 → angle r1.7 / r1. That
  changes one Phase P expectation in `CadEditors.section.dom.test.jsx`, and
  the test title was reworded to match.
- "Automatic" needs both radii to be stored numbers. An old radius-free angle
  (keys absent) is never automatic, so a leg edit on it writes only that leg
  and adds no radius keys (tested). The Phase P "nothing is written until
  edited" holds.
- A leg or thickness given as an `=expression` counts by its parameter value
  (the editor resolves it before `angleRadiiFor`), not as "not a number".
  Otherwise typing `=leg` into Leg A would have zeroed the radii (sharp
  corners) on an automatic angle. `angleRadiiFor` itself stays numbers-only.
- Clamp rounding is a floor to 0.1 mm, not round-to-nearest, so the margin
  holds at every size, including sub-millimetre thicknesses where rounding
  up to 0.1 could reach t. The catalogue radii are returned unclamped. The
  spec's "includes every catalogue size and the default part" requires this,
  because every EN toe radius is 0.58–0.83 t, above the t / 2 clamp.
- Tie on nearest thickness = first (smallest) catalogue entry, as specified.
  This also applies to an exact-thickness tie: t 5 off-catalogue uses L
  40×40×5's r6 / r3, not L 50×50×5's.
- Length: written as numbers; `=expression` input is evaluated, not stored.
  The ≤ 0 message is local to the field (`role="alert"`) and does not go
  through the workspace error, because `FeatureForm` commits never throw
  (a throw from a blur commit would be an uncaught page error). When the
  field is editable only the trim help line shows. When it is read-only only
  the expression help line shows.
- Length's Esc restores the captured original `end` rather than recomputing
  from the shown (rounded) value, so a non-round end comes back exactly
  (tested).

**Warts / follow-ups**

- Moving 1 mm off a catalogue size makes the radii jump, e.g. L 50×50×5 r7 /
  r3.5 → 51×50×5 r5 / r2.5. Two things cause it: the nearest-thickness tie
  picks the smaller entry, and the t / 2 clamp is tighter than the EN toe
  radii. The section stays valid; it just looks less like the standard.
- If a parameter used by an angle leg changes in the parameters table, the
  radii do not follow, because only leg and thickness edits re-derive them.
  From then on the radii count as custom.
- The Length field does not show a member's finished (trimmed) length. The
  cut list's CL does.
- Out of scope, as §8.3: a viewport drag grip for member length, a tube
  catalogue, the unequal-angle catalogue, the §7 warts.
