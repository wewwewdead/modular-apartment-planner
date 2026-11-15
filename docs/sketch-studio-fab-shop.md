# Sketch Studio fabrication shop (sheet metal: cut → bend → weld → paint → print)

Status: spec, 2026-11-12. Build in phases SM-1 … SM-4 (§9). Each phase is one
builder run and is audited before the next starts.

> **2026-11-14: the Weld station (SM-3) was removed** by
> `docs/sketch-studio-shop-trim.md` (ST-1). The shop is Draw → Cut → Bend →
> Paint → Print; parts are put together with Move part, Rotate part, Mate
> faces and Group. `model.welds` and the weldment group flag are gone (an old
> file drops them on load). What follows is the history as specified and
> built; read the weld station's parts of it as such.

## 1. What the user asked for

"A fabrication shop simulator": draw a shape, use that drawing to **cut** sheet
metal, **bend** it on a press brake the way an operator does on an Amada
(choose the angle, the machine does what a real one would), then **weld**,
**paint** and **print** on it, ending with a complete simulated product.

## 2. First principle: the model is the process

A CAD program models the finished folded part and unfolds it. A shop does the
opposite, and so does this feature:

- **The flat blank is the source of truth.** It is a closed 2D profile (the
  drawing) plus a stock thickness. Nothing is ever "unfolded".
- **A bend is a machine hit**: a punch line across the flat blank, an angle, a
  direction and the tooling that made it. Bends are kept in the order they are
  performed.
- **The 3D part is derived** by folding the blank forward along those lines.
  The material under the punch becomes the arc; the rest stays rigid. If the
  blank was cut the wrong size the flange comes out the wrong length, exactly
  as on the real machine. The software reports the resulting sizes; it never
  silently corrects the blank.
- Weld, paint and print are records layered on the folded parts in shop order.

Consequences worth keeping in mind: the flat-pattern DXF is exact by
construction (it is the input), bend allowance is applied physically instead of
being "compensated", and bend **order** matters only for the machine
(collisions), never for the final shape.

## 3. What was read (sibling contracts this must match)

- `cad/model.js`: `emptyModel` / `normalizeModel` (:15, :60; the id loop over
  top-level lists is at :66; `version !== CAD_VERSION` refuses the file, so
  **CAD_VERSION stays 1** and every new key is optional with a default),
  `removeInstance` cascade (:228), `profileToPart` (:592).
- `cad/kernel.js`: the per-part feature loop `build()` (:282), the base-feature
  whitelist that decides fuse vs replace (:482 — a base type missing from it
  silently replaces the earlier solid), `snapshot()` (:714; world-space typed
  meshes, **no face ids**), `planarProfiles()` (:879; a bent part gets no flat
  profile today), per-feature metrics `snapshot.parts[].features[id]` as the
  only kernel → UI data channel.
- `cad/useCadModel.js`: every model identity change triggers a full
  OpenCascade rebuild (:39-85).
- `cad/CadWorkspace.jsx`: ribbon `tabs` (:128) and flat `commands` list
  (:1836-2076, React key = label, so labels are unique); right pane is one
  ternary on `panel` (:3191-3905); `commit(next)` (:476) / `perform(action)`
  (:1397); tools that do not fit the feature-draft flow follow the
  `mateSession` pattern (own state + `defineMachine` table in
  `toolSession.js` + `activeTool()` + the hand-listed "another tool is
  active" sites named in `docs/state-machines.md:276`).
- `cad/CadViewport.jsx`: snapshot → one `Group` per instance (:1746-1789);
  colour comes only from `bodyColorKey(part, selected)` (viewMode.js:93, no
  per-part colour); rendering is **on demand** (`ctx.render()`, no rAF loop);
  overlay objects must stay out of `ctx.group` or every raycast sees them;
  `pickedFace(hit)` (:2314) returns a planar face frame; placementLayer
  `edgeAt` (:680) returns a tessellated edge segment.
- `cad/DraftingImport.jsx` + `draftingProfiles.js` (`collectDraftingProfiles`
  :317): 2D drafting loops → profiles; inner loops are **not** inferred as
  holes today. `sketchProfile.js` `entitiesToProfile` (:253) already nests
  loops for in-viewport sketches.
- `cad/fabrication.js` (`buildCutList` reads `features[0]`), `cad/exports.js`
  (`workshopZip` writes `cutting/<part>.svg|.dxf` from `planarProfiles`).
- `cad/groups.js`: groups are an editing aid (`groupNodes` :150); weld
  connections are notes only and anchor nothing.
- Spike (2026-11-12, real OpenCascade in node): flat extrude → cut strips →
  `iterTopo(..., 'solid')` → rigid transforms + revolved sectors → fuse. A
  100 × 60 × 1.5 blank with two 90° bends rebuilt in 60–120 ms and matched the
  bend-deduction arithmetic to 0.001 mm.

## 4. Data

All new keys are optional. Old files load unchanged; `CAD_VERSION` is not
bumped.

### 4.1 The `sheetmetal` base feature (first feature of a part)

```js
{
  id, type: 'sheetmetal',
  sketchId,            // closed profile on plane 'XY': the flat blank; its holes are the laser cut-outs
  thickness: 1.5,      // mm, number or expression
  stock: 'spcc',       // key of SHEET_STOCK (§8); part.material holds the display name
  kFactor: null,       // null = automatic from r/t (§5.2); a number overrides
  base: null,          // [x, y] flat point inside the face that keeps its place; null = largest face
  marks: [],           // optional [{ id, a:[x,y], b:[x,y] }] etched lines (SM-4), display + snap only
  bends: [             // in the order they are performed
    { id,
      a: [x, y], b: [x, y],    // punch line on the flat blank, numbers or expressions
      angle: 90,               // BEND angle in degrees: 0 = flat, 90 = right angle (not the included angle)
      direction: 'up',         // 'up' = flange rises toward the blank's top face (+Z), 'down' = toward the bottom
      radius: null,            // inside radius mm; null = from the tooling (§5.2)
      punch: 'straight-88', die: 'v12-88' } // tooling keys (§8); absent = automatic choice
  ],
}
```

Later features on the same part (holes, pockets, cuts) apply to the folded
solid and mean "machined after bending".

### 4.2 New top-level lists (kernel-inert: display and reports only)

```js
model.welds = [
  {
    id,
    a: { instanceId, local: [x, y, z] },
    b: { instanceId, local: [x, y, z] }, // seam ends, PART frame of each (marks.js anchors)
    kind: 'fillet' | 'butt' | 'tack' | 'spot',
    process: 'tig' | 'mig' | 'spot',
    size: 2,
    pitch: 40,
    note: '',
  },
];
model.finishes = [
  {
    id,
    instanceId, // at most one per instance
    kind: 'powder' | 'wet',
    name: 'RAL 7035 Light grey',
    colour: '#c5c7c4',
    gloss: 'matte' | 'satin' | 'gloss' | 'texture',
    thickness: 70 /* µm */,
  },
];
model.prints = [
  {
    id,
    instanceId,
    origin: [x, y, z],
    x: [x, y, z],
    normal: [x, y, z], // PART frame; origin = artwork centre
    width,
    height,
    rotation: 0,
    method: 'silk' | 'uv' | 'pad',
    kind: 'text' | 'image',
    text,
    font,
    colour,
    image /* data URL ≤ 512 KB */,
  },
];
model.fabrication.shop = { machine: 'brake-50-2000', laser: 'fiber-2kw', sheet: '1219x2438' };
```

`emptyModel` defaults them; `normalizeModel` adds the three lists to its id
loop and validates shape; `removeInstance` drops rows that name the instance.

### 4.3 Rebuild rule

`useCadModel` must **not** rebuild when only kernel-inert keys changed.
`KERNEL_INERT_KEYS = ['welds', 'finishes', 'prints']`: if every other
top-level key is `===` to the model the current snapshot was built from, keep
the snapshot and only move `state.source` to the new model (same `revision`,
so `request()` still works). Existing keys keep today's behaviour exactly.
Painting a part must repaint the viewport without "Rebuilding solids…".
SM-2b adds `'fabrication'` to the list (checked: the kernel, its worker
requests, the sketch solver and the projection never read it; the cut list
and the workshop ZIP read it from the current model on the main thread), so
choosing another press brake no longer rebuilds the solids.

## 5. Fold maths — `cad/sheetMetal.js` (pure JS, no three, no DOM, no WASM)

Runs in the worker (kernel) and on the main thread (panel readouts, preview,
simulation). Single source of truth for every number below.

### 5.1 Frames

Blank in XY, material z ∈ [0, t]; bottom face z = 0, top face z = t. For a
bend with resolved ends a, b: `u = (b − a)/|b − a|`, `n = (−u.y, u.x)` (left of
a → b), so `u × n = +Z`. Flat coordinates of a point relative to the bend:
`s = (p − a)·u`, `v = (p − a)·n`.

### 5.2 Per-bend numbers (θ = bend angle in radians)

- Inside radius `r` = `bend.radius` if set, else the air-bend rule
  `max(punch tip radius, stock.radiusOfV × die.V)` (§8).
- K-factor `k` = `feature.kFactor` if set, else from the r/t table (§8).
- Bend allowance `BA = θ · (r + k·t)` — the flat width that becomes the arc.
- Outside setback `OSSB = (r + t) · tan(θ/2)` for θ ≤ 90°, `(r + t)` above.
- Bend deduction `BD = 2·OSSB − BA`.
- Outside leg length of the piece on one side:
  `leg = d − BA/2 + OSSB`, `d` = that side's greatest flat distance |v| from
  the bend line. Inverse (used by "flange length" fields and the backgauge):
  `d = leg − OSSB + BA/2` (= `leg − BD/2`).

### 5.3 Topology

1. `profilePolygon(profile, params)` → `{ outer, holes }` polylines (arcs,
   circles and splines sampled to ≤ 0.05 mm chord error). One outer loop only;
   refuse `profile.offset`.
2. For each bend, clip the infinite line through a, b against the material to
   get intervals `[s0, s1]`. **Every interval the segment a–b touches bends
   over its whole length** (a punch never stops mid-material); intervals it
   does not touch are left alone. No interval → error.
3. Each chosen interval is a strip rectangle `s ∈ [s0, s1]`, `|v| ≤ BA/2`.
   Strips of different bends must not overlap inside the material → error
   "Bend N crosses bend M".
4. `pieces = blank − all strips` (`polygon-clipping`, already a dependency).
   Each strip joins the piece touching its `v = −BA/2` edge to the piece
   touching its `v = +BA/2` edge (probe a point 0.01 mm outside each edge
   midpoint). Several strips of the **same** bend may join the same pair (a
   bend line crossing a window). The graph (pieces, joins) must be a tree:
   - both sides are the same piece → error "This bend does not separate the
     sheet: material beside the punch line is still connected. Run the bend
     edge to edge or cut a relief."
   - a cycle → error naming the bends.
5. Root = piece containing `feature.base`, else the largest piece. For every
   bend the side nearer the root is **fixed**; flip a ↔ b where needed so the
   fixed side is always `v < 0`.

### 5.4 Transforms (flat → folded), per bend

With the fixed side at `v < 0`:

- centre line of curvature: through `c = a − n·BA/2 + Z·(t + r)` for `up`,
  `c = a − n·BA/2 − Z·r` for `down`, direction `u`;
- moving side: `T = Rot(axis u through c, +θ for up / −θ for down) ∘ Translate(−n·BA)`;
- arc material: flat `v ∈ [−BA/2, +BA/2]` maps to angle
  `φ = (v + BA/2)/BA · θ` around the same axis, at radius `t + r − z` (up) or
  `r + z` (down).

A piece's pose is the product of the bends on its path from the root, nearest
the root first: `M = T₁ · T₂ · … · Tₖ` (every `Tᵢ` expressed in flat
coordinates). A bend's arc gets the pose of its fixed side.

`foldSheet(feature, profile, params, { angles })` returns
`{ thickness, stock, pieces: [{ id, outer, holes, area, centroid, path, matrix }],
bends: [{ id, index, a, b, u, n, angle, direction, radius, kFactor, allowance,
setback, deduction, intervals, fixedPiece, movingPieces, legs: { fixed, moving },
length }], flat: { width, height, area, cutLength, pierces }, warnings }`.
`angles` (optional, per bend id) overrides the angles — that is how a
half-finished stroke, "first k bends" and the unfold animation are posed.

### 5.5 Validation (errors refuse the build; warnings are data)

Errors: thickness ≤ 0; angle outside (0, 180]; line misses the blank; crossing
bends; non-separating bend; cycle.
Warnings (`{ code, bendId, message }`): `hole-near-bend` (a cut-out edge closer
than the distortion distance to the bend line, §8), `outline-not-square` (the
blank outline crosses the bend zone obliquely; the zone is built from the
centre-line interval), `short-leg` (leg below the die's minimum, §8),
`tight-radius` (r below the stock's minimum).

## 6. Kernel — `case 'sheetmetal'` in `build()`

1. `fold = foldSheet(feature, sketch.profile, params)` (errors propagate with
   the usual `part / feature` prefix).
2. `flat = drawing(profile).sketchOnPlane('XY').extrude(t)` — exact arcs and
   circles, not the sampled polygon.
3. Cut every strip box (interval extended 0.01 mm at both ends, full
   thickness ± 1) from `flat`; `iterTopo(result.wrapped, 'solid')` gives the
   rigid pieces. Match each to a `fold.pieces` entry by centroid + area
   (`measureShapeVolumeProperties`); a miss is an internal error, not a
   silent guess.
4. Apply each piece's pose (the same rotate/translate sequence as §5.4).
5. One revolved sector per interval: rectangle `[s0, s1] × thickness` at
   `v = −BA/2`, revolved by θ about the bend axis, then the fixed side's pose.
6. Fuse everything into one solid. If a fuse throws, fall back to
   `makeCompound(...)` and add warning `not-fused`. Budget: a 6-bend part
   builds in ≤ 250 ms in the node kernel test (report the measured number).
7. `featureMetrics[f.id].sheet = { flat, bends (numbers only), warnings }`.
8. Add `'sheetmetal'` to the base-feature whitelist at :482.
9. `planarProfiles()`: a part whose first feature is `sheetmetal` returns its
   **flat blank** projection with `thickness` and
   `bendLines: [{ a, b, angle, direction, radius }]`, whatever follows it.

## 7. Viewport — `cad/sheetMetalPreview.js` + `cad/shopLayer.js`

- `sheetMetalPreview.js` (three): builds a `Group` from a `foldSheet` result —
  one `ExtrudeGeometry` per piece (holes included), one generated arc strip per
  interval — and `pose(group, fold)` updates matrices and arc vertices in
  place. No kernel round trip: this is what animates.
- `shopLayer.js`: created by `CadViewport` beside the placement layer
  (`createShopLayer(ctx)`, `setView(view)`, `dispose()`), objects parented
  outside `ctx.group`. It owns: the preview group standing in for a part (the
  kernel group of that instance is hidden meanwhile), the machine scene
  (SM-2), weld beads, print decals (SM-3) and the laser animation (SM-4). It
  runs its own `requestAnimationFrame` loop **only while something animates**
  and calls `ctx.render()`; it stops the loop when idle and on dispose.
- Finishes: the look effect (:1790-1836) uses the instance's finish colour
  instead of `BODY_COLORS.metal` when one exists (selection colour still
  wins); gloss maps to roughness (matte 0.9, satin 0.6, gloss 0.25, texture
  0.95). Bare sheet stock gets its own colour from `SHEET_STOCK`.
- Script handle on the host element: `cadShop()` → `{ station, flat, bends,
animating, welds, prints }` for the verify scripts.

## 8. Shop data — `cad/shopCatalog.js`

All numbers are defaults a user may override per bend or per part. Sources are
listed in the appendix (§12).

### 8.1 Sheet stock (`SHEET_STOCK`)

| key      | name                   | Rm MPa | Y MPa | E GPa | density g/cm³ | radiusOfV | hardness | springback at 90° | min radius | thicknesses mm                  |
| -------- | ---------------------- | ------ | ----- | ----- | ------------- | --------- | -------- | ----------------- | ---------- | ------------------------------- |
| `spcc`   | SPCC cold-rolled steel | 330    | 210   | 205   | 7.85          | 0.16      | medium   | 1.0°              | 0.63 t     | 0.6 0.8 1.0 1.2 1.6 2.0 2.3 3.2 |
| `secc`   | SECC galvanised steel  | 330    | 210   | 205   | 7.85          | 0.16      | medium   | 1.0°              | 0.63 t     | 0.6 0.8 1.0 1.2 1.6 2.0 2.3 3.2 |
| `sus304` | SUS304 stainless       | 579    | 215   | 193   | 7.93          | 0.21      | hard     | 2.5°              | 0.63 t     | 0.8 1.0 1.2 1.5 2.0 3.0         |
| `a5052`  | A5052-H32 aluminium    | 228    | 193   | 70.3  | 2.68          | 0.135     | soft     | 2.0°              | 0.63 t     | 0.8 1.0 1.2 1.5 2.0 3.0         |
| `a6061`  | A6061-T6 aluminium     | 310    | 276   | 68.9  | 2.70          | 0.17      | hard     | 3.0°              | 1.5 t      | 1.0 1.6 2.0 3.2                 |

Each also carries a bare-metal viewport colour. `part.material` is set to the
name so `MaterialSelect`, the cut list and drawings keep working.

### 8.2 K-factor (air bending), by r/t and hardness

| r/t   | soft | medium | hard |
| ----- | ---- | ------ | ---- |
| < 1   | 0.33 | 0.38   | 0.40 |
| 1 – 3 | 0.40 | 0.43   | 0.45 |
| > 3   | 0.50 | 0.50   | 0.50 |

### 8.3 Air-bend rules

- Inside radius `r = max(punch.radius, stock.radiusOfV × die.V)`; a result
  below `0.63 t` is a **sharp bend**: the radius stays at `0.63 t` and warning
  `sharp-bend` is raised. Below the stock's min radius → `tight-radius`.
- Default die: smallest catalogue V ≥ `m × t`, with m = 6 for t ≤ 2.5, 8 for
  t ≤ 8, 10 for t ≤ 10, 12 above (Amada table).
- Without tooling on a bend (SM-1, before the station exists) the radius is
  computed with the default die and the default punch.
- Largest bend angle a die allows: `180° − die.angle` (88° die → 92°, 30° die
  → 150°). The punch angle must not exceed the die angle.
- Minimum leg, from the bend line to the leg's end in the flat:
  `V / (2·cos(A/2)) + die.shoulderRadius` (0.707 V at 90°; Amada charts 0.7 V).
- Distortion distance for `hole-near-bend`: a cut-out edge closer than
  `2.5 t + r` to the bend line.
- Tonnage `F[kN] = 1.42 · Rm · t² · L[mm] / (1000 · V)` (L = summed interval
  length). Refuse above the machine force or above
  `min(punch, die).loadPerMetre × L`.
- Springback readout (approximate, display only):
  `stock.springback90 × (A / 90) × sqrt(clamp(r/t, 1, 8))`; the machine "bends
  to" `A + springback`.
- Ram depth readout (derived three-point contact, display only), die top at
  y = 0, shoulder radius Rd, die angle δ, `φ = (A + springback)/2`:
  `c = V/2 + Rd·tan((90° − δ/2)/2)`,
  `yc = (r + t + Rd − c·sin φ)/cos φ − Rd`, depth `D = t − (yc − r)`.

### 8.4 Machines and tooling (SM-2)

Generic machines sized like the Amada HFE M2 series (the UI says "50 t ×
2 m press brake", not a brand):

| key              | force kN | bed mm | stroke | open height | throat | approach / bend / return mm/s |
| ---------------- | -------- | ------ | ------ | ----------- | ------ | ----------------------------- |
| `brake-50-2000`  | 500      | 2090   | 200    | 470         | 420    | 100 / 10 / 100                |
| `brake-80-2500`  | 800      | 2570   | 200    | 470         | 420    | 100 / 10 / 100                |
| `brake-100-3000` | 1000     | 3110   | 200    | 470         | 420    | 100 / 10 / 100                |

Backgauge range 5 – 600 mm (assumed).

Punches (Promecam style, height from clamp shoulder to tip, 26 mm shoulder):

| key                       | angle | tip R | height | load kN/m |
| ------------------------- | ----- | ----- | ------ | --------- |
| `straight-88`             | 88°   | 0.8   | 66.5   | 1000      |
| `straight-88-sharp`       | 88°   | 0.25  | 66.5   | 1000      |
| `gooseneck-88`            | 88°   | 0.6   | 95     | 500       |
| `acute-30`                | 30°   | 0.6   | 80     | 500       |
| `straight-88-tall` (SF-3) | 88°   | 0.8   | 105    | 1000      |

Punch holders (SF-3, docs/sketch-studio-shop-floor.md §6.2): every machine
carries `holder: { height: 100, width: 26 }`, the sectional Promecam
"intermediates" between the punch and the ram, set up over the punch's
sections only; the full-length ram stands `tipZ + punch.height +
holder.height`. The punch, the holders and the die stand over the stroke's
tooling runs; the ram and the bed run the bed's length.

Single-V dies, height 80:

| key                       | V                  | angle | shoulder R                  | body width           | load kN/m |
| ------------------------- | ------------------ | ----- | --------------------------- | -------------------- | --------- |
| `v6-88` … `v25-88`        | 6 8 10 12 16 20 25 | 88°   | 0.8 1.0 1.2 1.5 2.0 2.0 3.0 | 14 14 18 18 24 30 35 | 1000      |
| `v8-30` `v12-30` `v16-30` | 8 12 16            | 30°   | 1.0 1.5 2.0                 | 18 24 30             | 400       |

Section polygons are generated from these numbers. The gooseneck relief shape
is schematic (no sourced dimensions): a relief about 30 mm deep starting 20 mm
above the tip.

### 8.5 Laser (SM-4)

- Kerf: 0.10 mm for t ≤ 2, 0.15 for t ≤ 3, 0.25 above.
- Cutting speed for the default 2 kW fiber, m/min, interpolated on thickness:
  steel 1 → 25, 2 → 5.5, 3 → 4.0, 6 → 2.3; stainless 1 → 30, 2 → 10, 3 → 5.8,
  6 → 1.0; aluminium 1 → 26, 2 → 11.5, 3 → 5.8, 6 → 0.75.
- Pierce time 0.1 s at 1 mm rising linearly to 1 s at 6 mm.
- Time = pierces × pierce time + cut length / speed.
- Warn: hole smaller than `t` (refuse below `0.5 t`), web between cuts below
  `0.5 t`. Sheets: 1219 × 2438, 1250 × 2500, 1500 × 3000.

### 8.6 Weld, paint, print (SM-3)

- Weld: default fillet leg = the thinner sheet's thickness. Largest gap: TIG
  `max(0.2, 0.1 t)`, MIG `min(0.5 t, 1)` mm. Travel speed TIG 300, MIG 650
  mm/min; duty cycle TIG 0.3, MIG 0.4; time = length / speed / duty. Spot:
  nugget `5·√t`, pitch default `20 t` (refuse below `10 t`), edge distance
  ≥ 2 nuggets.
- Powder coat: film 70 µm (50 – 125), specific gravity 1.5, transfer
  efficiency 0.6; coverage `m²/kg = 1000 / (SG × µm) × TE`; cure 200 °C part
  temperature for 10 min. Open holes below 1.0 mm are flagged as likely to
  fill.
- Print: silk-screen text ≥ 9 pt, artwork ≥ 6.35 mm from the face edge and
  never over a bend zone; UV flatbed needs a flat face; pad print for small
  marks. All printing happens after forming and after paint.

## 9. Phases

Every phase: pure logic in its own module with unit tests; `*.dom.test.jsx`
for panels; kernel tests with real OpenCascade; one Playwright script
`scripts/verify-fab-shop-<phase>.mjs` (pattern of the existing `verify-*.mjs`
with `scripts/sketch-cad-steps.mjs`); `docs/state-machines.md` updated for any
new session; a user section appended to `docs/sketch-studio-cad.md`; full
`npm test`, `npm run lint`, `npm run build` green at the end. New ribbon tab
**Shop** sits between Assemble and Drawings; its commands appear in process
order.

### SM-1 — Sheet-metal part: cut a blank, fold it by numbers

1. `sheetMetal.js` (§5) + `shopCatalog.js` stock/K tables (§8) + tests,
   including hand-computed cases: L 50 × 30, U channel, Z (up + down), a bend
   line through a window (two intervals), a comb (three pieces on one side),
   the three topology errors.
2. Model (§4.1, §4.2 lists and their validation/cascade, §4.3 rebuild rule).
3. Kernel (§6) + `kernel.sheetmetal.test.js`: bounds of the folded L/U/Z match
   §5.2 to 0.01 mm; volume within 2 % of the blank's; a hole feature after the
   bends still cuts; `planarProfiles` returns the blank with bend lines.
4. **Cut from sheet** (Shop tab → panel `shop-cut`): source = a closed sketch
   of the model, or the 2D drawing's closed profiles (reuse
   `collectDraftingProfiles`; a loop strictly inside another becomes its hole,
   a loop inside a hole is skipped and reported), or a quick rectangle W × H.
   Stock = material + thickness from `SHEET_STOCK` (custom thickness
   allowed). Creates sketch (if needed) + part + instance at
   `viewDropPoint`. Result line: blank size, cut length, pierces.
5. `FeatureForm` for `sheetmetal`: thickness, stock, K (auto/override), and a
   bend table — order, angle, Up/Down, radius (auto/override), engraved
   readouts (allowance, deduction, both outside leg lengths), move up/down,
   remove. **Add bend** form: "parallel to the blank's Left / Right / Front /
   Rear edge at distance D" (D or the wanted outside flange length — the two
   fields drive each other through §5.2) or "two points" (a, b), angle,
   direction. Live field rules of `liveField.js` apply. Solver errors show
   in the form before commit (never commit a model the kernel will refuse).
6. Preview layer (§7) + **Unfold / Fold** toggle for the selected sheet-metal
   part in the view toolbar: animates all bends to flat and back (≈ 600 ms),
   shows bend lines with "UP 90° R1.5" labels while flat. View state only.
7. Cut list: sheet-metal rows carry blank size, thickness, stock, bend count,
   cut length; CSV gains trailing columns. Workshop ZIP writes the flat DXF
   with a `BEND` layer.
8. Example: Shop tab → "Example: pump bracket" builds the user's 166 × 52.5
   t 1.5 channel with 8 mm flanges **from a flat blank and two bends**, with
   its holes in the blank (leave `pumpBracket.js` as is).
9. Verify script: cut a 100 × 60 rectangle of 1.5 SPCC, add two bends, read the
   folded bounds from the Properties readout, unfold, refold, reload the page
   and find the part intact.

### SM-2 — Press brake station

A session in the `mateSession` pattern (`brakeSession`, machine `BRAKE` in
`toolSession.js`: `idle → setup ⇄ stroke`), opened by Shop → **Press brake**
on a selected sheet-metal part.

1. Catalogue (§8): machines (tonnage, bed length, open height, stroke,
   backgauge range), punches and dies as 2D section polygons.
2. Viewport: other instances hidden; machine scene (bed, die, ram, punch,
   backgauge) drawn from the catalogue sections at true size; the part's
   preview group posed for the pending hit — bend line on the die centre,
   sheet symmetric about the punch plane, outer surface resting on both die
   shoulders, flipped over when the bend is `down` (the machine always bends
   up), gauge edge against the backgauge fingers.
3. Flat-pattern map: an SVG card over the viewport showing the blank, existing
   bends (numbered, in order) and etched marks. Picking happens here: click a
   straight outline edge = the edge on the backgauge, then type or drag the
   gauge distance L; or two-point mode with vertex/midpoint snap. The 3D pose
   follows live.
4. NC panel: machine, punch, die (auto-suggested from thickness, overridable),
   angle, Flip sheet, and engraved readouts — inside radius, allowance,
   deduction, both leg lengths, backgauge L (shown when gauge edge and bend
   line share one flat face, otherwise "no straight gauge"), ram depth,
   springback overbend, tonnage against capacity as a bar.
5. Refusals, each with the remedy in the message: tonnage over capacity, bend
   longer than the bed, leg shorter than the die minimum, angle beyond what
   the die angle allows, tooling load limit.
6. **Bend** (button, Enter or Space as the pedal): the ram comes down, both
   wings rise, ≈ 1.2 s, then the bend is committed and the station stays open
   for the next hit. Esc clears the pick, then leaves.
7. Collision check before the stroke, sampled through it (`brakeCollisions`
   in pure JS: part mid-surface triangles against punch, ram, die, bed and the
   part itself; contact inside the die opening is exempt): a hit is drawn red
   at the angle it happens and the stroke is refused with advice (bend
   earlier, flip, gooseneck punch).
8. Sequence list: reorder, re-run a step (scrub shows the part before/after
   each hit), remove. Reordering re-checks every step.
9. Shop-order rules start here: a part with welds or a finish cannot go back
   on the brake until they are removed (the message offers to remove them).

### SM-3 — Weld, paint, print

Three small stations sharing the shop layer; all kernel-inert (§4.3).

- **Weld**: pick an edge on one part and the touching edge or face on another
  (or on the same folded part, to close a box corner) → seam a–b; gap over the
  tolerance for the thickness is refused. Kinds fillet / butt / tack / spot
  with size and pitch; beads drawn as real geometry (triangular or round
  section along the seam, discs for tack/spot). Welded instances are put in
  one group via `groupNodes` so they move as a weldment. Readouts: seam
  length, weld time. Painted parts are refused ("strip the paint first", one
  click).
- **Paint**: pick a part or weldment → colour (RAL list + custom), finish,
  film thickness. Applies one finish row per instance. Readouts: painted area
  (from the mesh), powder mass, cure schedule. Painting removes prints on
  those instances after confirmation.
- **Print**: pick a planar face (`pickedFace`) → place text or an uploaded
  image (downscaled to ≤ 1024 px, ≤ 512 KB) with size, rotation, colour and
  method; drawn as a textured quad on the face (`CanvasTexture`, polygon
  offset), dragged on the face to position. Warn when the artwork overhangs
  the face or sits over a bend.

### SM-4 — Laser station, job sheet, finished example

- **Laser**: the blank nested on the chosen sheet size, cut-path animation
  (inner contours first, then the outline, with pierce points), etched bend
  marks from open lines inside the profile, checks (hole smaller than the
  minimum for the thickness, web too thin, part larger than the sheet),
  readouts (cut length, pierces, cut time, sheet use).
- **Job sheet**: per product (group or lone part) the route Cut → Bend → Weld →
  Paint → Print with quantities and estimated times, as a panel and CSV.
- Drawing view kind `flat` for a sheet-metal part (blank + bend lines + bend
  table).
- Example product built entirely through the stations (a powder-coated
  enclosure with a printed logo) and `docs/sheet-metal-shop-guide.md`.

## 10. Not in scope

Forming beyond straight-line press-brake bends (rolling, stamping, louvres),
hems and flattening tools, staged tooling set-ups, deformation of holes inside
a bend zone (warned, not modelled), weld distortion, paint masking per face,
nesting optimisation beyond the existing shelf packer, cost in currency.

## 11. Builder rules

- Do not bump `CAD_VERSION`. Do not rename or reorder existing exports.
- `model.js`, `sheetMetal.js`, `shopCatalog.js` run in the worker: no three,
  no DOM.
- Match the surrounding code (dense modules, short comments that state a
  constraint, CRLF/LF as each file already is). New files: LF.
- Run vitest from the repository root, never from inside `cad/`.
- Stop the dev server you start and confirm the port is free.
- Report: files touched, measured build times, every judgment call, anything
  in this spec you found wrong or could not do.

## 12. Appendix — sources for §8

Researched 2026-11-12. Rules of thumb disagree between vendors; the defaults
above follow the Amada charts where one exists.

- Air-bend radius as a fraction of V, sharp-bend limit 0.63 t: The Fabricator
  (S. Benson, "How to predict an air-formed inside bend radius", "How an air
  bend turns sharp"), Mate "Choosing correct punch tip radius". 5052 figures
  vary 9 – 15 % between articles; 6061-T6 rests on one reported 18 %;
  galvanised is treated as cold-rolled steel.
- V opening by thickness, min flange 0.7 V, tonnage chart, punch and die
  dimensions and load limits: Amada-Promecam tooling catalogue (Tecnostamp,
  a compatible maker). Bystronic gives 0.77 V and the "rule of 8".
- K-factor table: Xometry. DIN 6935 alternative `k = 0.65 + 0.5·log10(r/t)`
  (K = k/2) not used: unrealistic below r/t ≈ 0.6.
- Bend deduction above 90° measured to the outer tangent: DIN 6935 (via
  de.wikipedia "Biegeverkürzung").
- Tonnage constant 1.42: Engineers Edge; matches the Amada chart within 6 %.
  Benson's imperial form is about 12 % higher.
- Springback degrees: The Fabricator, Xometry (steel 0.75 – 1°, 304 2 – 3°),
  Protocase (higher). The Kalpakjian formula underestimates at small r/t, so
  the empirical values are used. The scaling with angle and r/t is ours.
- Ram depth: derived here from three-point contact; not checked against a
  control maker.
- Machines: Amada EU HFE M2 pages. Backgauge travel for the larger machines
  was not found.
- Punch holders (SF-3, researched 2026-11-13): Rolleri INT100, "Intermediate
  R1 Type with Working height=100mm… Max. load=1000kN/m", 130 mm overall, 150
  mm long (rolleritools.com/int100.html); INT120 120 useful / 150 overall
  (rolleritools.com/int120.html); INT150-40HD 150 useful, 1600 kN/m
  (rolleritools.com/int150-40hd.html). Wilson Tool European-Style catalogue
  B374C (Sept 2025) p. 94: Z1 Narrow Punch Holder #43000 130 / 100, Z2 #43001
  150 / 120, both 100 t/m; p. 33–34: punches "commonly loaded into a
  segmented holder", holders spaced along the ram or interlocked. The 100 mm
  working height is the standard one used. **Assumed**: the holder's width
  across the bed (26 mm, the punch's clamp shoulder) — no catalogue page read
  states it; Rolleri's INT150 page lists the same heights as INT120 (a page
  error or a heavier body: not used).
- Tall straight punch (SF-3): Tecnostamp "Red Line – Amada-Promecam Style"
  catalogue (via pilses.com/image/catalog/catalogos-pdf/utillaje-amada-promecam.pdf)
  pp. 13–14, code 11.228: 88°, R0.80, H 105, 100 t/m (the same table lists
  11.145, 88° R0.80 H 66.5 100 t/m — the existing `straight-88`). **Assumed**:
  its body is drawn as the straight blade (the catalogue drawing was not
  read); its 100 t/m rating suggests a straight body. Rolleri's tall punch
  P.150.88.R08 (120 useful, 500 kN/m) was not used. Die heights (Tecnostamp
  H=80 series, V6–V25, 100 t/m) agree with the 80 mm dies above.
- Laser speeds: one vendor table (StyleCNC); kerf and pierce from guide sites.
  Min hole: SendCutSend 0.5 t, Protolabs 1 t.
- Welding: AWS D1.3 (fillet leg = thinner sheet), TWI (spot nugget 5√t, duty
  cycles), Miller/ESAB (thin-sheet gaps). Travel speeds are blog-grade.
- Powder coating: SendCutSend, Freilacke, PF Online coverage formula.
- Printing: Protocase (silk-screen on powder coat, 9 pt, 6.35 mm edge, no bend
  zones; UV flatbed needs a flat face).
- Round bends by bump bending (docs/sketch-studio-round-bend.md, RB-1,
  researched 2026-11-14): pitch = arc length / number of hits, ideal die
  opening = 2 × pitch, a wider die lets the part already bumped sink into the
  opening: Steve Benson, The Fabricator, "Bumping up large-radius bends" and
  "Bump bending and air forming sheet metal on the press brake"
  (thefabricator.com/thefabricator/article/bending/bumping-up-large-radius-bends,
  …/bump-bending-and-air-forming-sheet-metal-on-the-press-brake), read as
  search summaries (the pages refused a direct fetch): a rule of thumb, medium
  confidence; Benson also notes very large radii are better rolled. The 2.5 ×
  pitch die warning, the 1 mm minimum pitch, the 10 mm lift between hits and
  the 3 s per further hit are the spec's own choices, not sourced. The
  springback readout caps at r/t = 8, far below a large radius's real
  springback: display only.
- Radius punches and wide dies (RB-2, researched 2026-11-14): Amada GmbH
  "High Tonnage Tools" catalogue, release 19.05.2021
  (amada.eu/fileadmin/user_upload/HighTonnage_Catalog.pdf), its text read with
  pdftotext. Radius rulers HT-R10 / R12.5 / R15 / R17.5 / R20 / R25 / R30
  (order HT0170102 … HT0170302): height 114.3 / 119.7 / 125.1 / 130.5 / 135.9
  / 146.7 / 157.4 mm, width 2 R (R10 prints 10.0, taken as a misprint for
  20), 1300 kN/m; radius punch holders HH-015 (100 high) and HH-016 (103.5),
  both 41 wide, 1300 kN/m; the drawings put the R10 on the HH-015 and the R25
  and R30 on the HH-016. 1-V 60° dies (order HT0356502 … HT0186122): V32 R5
  60 wide, V40 R5 60, V50 R6 80, V63 R8 80, V80 R10 100, V100 R12 135, all
  1300 kN/m; the heights (80, 80, 85, 95, 100, 125) are read from each row's
  drawing, its Height field printing 0.0 — medium confidence. The same
  catalogue lists V125 and V160 at 80° (not added) and R12.5 and R17.5 rulers
  (not added). **Assumed**: the R15 and R20 sit on the HH-015 (the drawings do
  not say); the dies are drawn as plain blocks of their base width (the
  drawings show a narrower upper body on the V50 – V100). The earlier search
  summary of the same PDF was wrong in places (it gave the V160's order number
  for the V80 and called the V63 a V32); the rows above are from the PDF's
  own text.
- V between 2.2 and 2.5 × (t + inside radius) for radius air bending: Harsle's
  radius air bending calculator (harsle.com; from the round-bend spec's
  research, not re-read for RB-2), a vendor rule of thumb, low to medium
  confidence; the lower bound is used as the minimum. A large radius
  air-formed in one hit springs back far more than the `springback` rule shows
  and can lift off the punch nose ("multi-breakage"); neither is modelled.
- Goosenecks (brake blades BT-1, researched 2026-11-14): the same Tecnostamp
  "Red Line – Amada-Promecam Style" PDF, p. 15: code 11.147 88° R0.80 H 104.50
  50 t/m, head 56 wide (`gooseneck-88`, which replaces the schematic R0.6 H 95
  of the §8.4 table) and code 11.148 88° R0.80 H 145.00 70 t/m, head 75
  (`gooseneck-88-deep`). The outlines are the PDF's own vector drawings,
  scaled by each row's H and head width (they agree to 0.1 %): high
  confidence for the shape, which is the maker's drawing, not a dimensioned
  section. **Not modelled**: the tang (13.5 mm behind the tip in the
  drawing). Same page: the tall 11.228 is drawn with a front relief (the
  SF-3 entry draws it as the straight blade).
