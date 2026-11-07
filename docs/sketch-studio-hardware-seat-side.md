# Sketch Studio — Hardware seat side (Phase Q)

Status: spec (2026-11-08). Builds on Phase J (cut placement), Phase K (hole
rows), Phase M (hardware in chosen holes, `docs/sketch-studio-hardware-holes.md`)
and Phase P (angle bar).

## 1. User report

> "can we make adding hardware like screw and other to be more easy on tight
> areas? like for example i want to add a screw under the angle bar and instead
> from bottom direction it added on the top direction and for example if put a
> angle bar and it has wood behind it so the angle bar have hole through the
> wood so wood also have hole then when i tried to put a screw on it, it sit on
> the wood instead the screwhead should sit on the anglebar."

Two bugs and one ease-of-use ask:

- **B1 wrong side.** A screw put in a hole from underneath ends up on top.
- **B2 wrong host.** Angle bar on a wood board, coaxial holes in both; the
  screw seats in the wood's hole instead of the angle bar's.
- **E1 tight areas.** Getting the camera under a part to reach the far
  opening is awkward; the user needs a way to put the hardware on the other
  side without orbiting there.

## 2. Verified causes (read before building)

### B1 — a hole only has ONE seat: where it was drilled from

- `kernel.js` `place()` → `c.type === 'concentric'` (≈ line 468): `getAxis`
  takes the hole's `origin` = `metrics[hole].row.centres[i]` or
  `resolvedCut.position` (the ENTRY point on the face the hole was drilled
  from) and `direction` = `resolvedCut.direction` (the drill direction). The
  hardware axis (`[0,0,-1]` for hardware, head at local z = 0) is rotated onto
  the drill direction and translated to the entry point. **Which side the user
  clicked is never stored, so the kernel always seats at the drill side.**
- `placementCuts.js` `holeCentres(ctx)` (≈ line 299) emits ONE candidate per
  hole centre: `point` = entry, `normal` = −drill direction. There is no
  candidate at the far opening, so:
  - `placementLayer.js` `holeOpeningAt` (≈ line 437) skips every hole seen
    from below (`h.normal · toEye <= 0`);
  - `holeCentresOn(face, hit)` (≈ line 409) only offers centres in the hovered
    face's plane, and the entry lies in the top face's plane, not the bottom.
- `cutPlacement.js` `resolveCutPlacement`: a through-all hole's `depth` runs
  to the part's BOUNDING BOX (`farthest + 0.01`). For an angle bar a hole in
  leg A gets depth ≈ leg B height (50 mm), not the 5 mm leg thickness, so
  `cut.depth` can NOT be used as "where the hole comes out". The far opening
  must be measured on the real solid (§4.1).

### B2 — coincident openings: the first in the list wins

`holeOpeningAt` keeps the candidate with the smallest SCREEN distance
(`distance >= best.distance → continue`). Coaxial holes of the angle bar and
the wood project to the same pixel in an ortho view (and within a pixel or two
in perspective), so the tie goes to whichever comes first in
`view.holeCentres` (snapshot part order). Pointing at the centre of a through
hole, the ray goes down the bore, so `hit` is null / the ground / the far part
and the occlusion test never rejects the deeper hole. Result: the wood's hole
(deeper, behind the angle bar) can be picked → screw head on the wood face.

Also note: if the angle bar's hole was itself drilled from the wood side (from
its inside face), even a correct pick of the angle bar's hole seats the head
BETWEEN the angle bar and the wood (B1 again). §4 fixes both together: the
opening the user points at is the opening the head sits on.

## 3. Siblings read (contract the fix keeps)

- Free seat (`placementCuts.js` `placeHardware`, Phase J): `placeFrame(point,
normal)` + `frameToInstance` → part Z = clicked face's outward normal,
  hardware points into −Z (into the face). Already correct from any side.
- Phase M (`placementHardware.js`): chosen holes are draft-only records
  `{ instanceId, partId, name, featureId, index, point, normal, faceFrame }`;
  `finishHardware` poses each instance from `hole.point/normal` and writes one
  concentric connection per hole (`holeIndex` omitted for 0). Nothing new
  persisted; `CAD_VERSION` stays 1.
- Kernel concentric offset: translation `b.origin − a.origin + b.direction ×
offset` — positive offset sinks the hardware deeper along the drill
  direction. Keep "positive = deeper into the hole" on the far side too.
- Hole tool snapping also consumes `view.holeCentres` (snap kind
  `'hole centre'`). Far openings becoming snap points for the Hole tool is
  fine and useful (drilling the board under an angle bar's exit), but must not
  break `CadViewport.place.dom.test.jsx` / `CadViewport.snap.dom.test.jsx`.
- `ConnectionEditor.jsx` shows concentric connections (from/to features,
  offset). It must show the new field.
- `verify-hole-hardware.mjs` depends on _Attach to selected hole_ (single
  hole) committing at once with the Phase J connection — keep it byte-
  identical (no `side` key).

## 4. Design

### 4.1 Kernel: measure each hole's far opening

In `kernel.js`, `case 'hole'` (only `f.type === 'hole'`, not pockets), for each
tool centre, measure on the PRE-CUT solid (`shape` before this feature) where
the hole axis last leaves material:

- Build a straight edge on the axis from `centre − dir × 0.02` to
  `centre + dir × (cut.depth + 0.02)` and intersect it with the pre-cut solid
  (`shape.intersect(edge)` = BRepAlgoAPI_Common solid ∩ edge, which returns the
  edge segments inside the solid). Project every resulting vertex onto `dir`
  relative to `centre`; `exit = max(t)`.
- It is a far OPENING only when the tool passes beyond it:
  `exit < cut.depth − 1e-6` (a blind hole that stops inside the material has no
  far opening). Else store `null`.
- Store on the feature metrics: `featureMetrics[f.id].exits = [t0, t1, …]`
  (one per centre, `null` where there is none), alongside `cut` and `row`.
- If the Common is unsupported/throws or returns no vertices, fall back to
  `null` for that centre (never fail the build because of this measurement).
  The builder must confirm the Common really works with an edge tool in this
  replicad build (a kernel test with a 5 mm plate and a 2-wall tube); if it
  does not, use the next cheapest exact method and say which in the report.
- Measure the cost: a model with a 20-hole row, build time before/after. If
  the extra cost is more than ~15 % of the build, report it (do not silently
  ship a big regression).

Tube with a through hole: the axis enters wall 1, leaves it, enters wall 2,
leaves it → `exit` = outer face of the far wall. That is the right seat for a
bolt from the far side.

### 4.2 Kernel: the `side: 'far'` concentric seat

New optional connection field `side`: absent = drill side (today, byte-
identical); `'far'` = seated on the far opening.

In `getAxis` for the TARGET when `c.side === 'far'`:

- `t = metrics[part][feature].exits?.[holeIndex]`; if `t == null` throw
  `"<hole> has no far opening for <hardware>: seat it on the drill side or make the hole go through."`
  (the same style as "Broken cylindrical axis reference").
- origin = centre + dir × t (in part coordinates, before `mapPlacement`),
  direction = −dir.

Everything after that (rotation onto `b.direction`, translation with
`b.direction × offset`) is unchanged, so a positive offset still sinks the
hardware deeper into the hole. Only hole features (`feature.type === 'hole'`)
accept `side: 'far'`; any other target type with `side: 'far'` throws.

### 4.3 Openings in the view (`holeCentres`)

`holeCentres(ctx)` emits, for each centre with an `exits[index]` number, a
SECOND candidate:
`{ …same, side: 'far', point: map(centre + dir × exit), normal: +dir (world) }`.
Entry candidates get `side: 'entry'` (or no key — pick one and use it
consistently; the drawings/hole tool must not care).

`placementLayer.js`:

- `holeOpeningAt` passes `holeSide: h.side` in the click info.
- `holeAt(point, instanceId)` already matches by point; pass `holeSide` the
  same way in the ordinary snap path.
- **B2 rule — nearest opening wins.** Among candidates within reach, choose
  the one NEAREST THE CAMERA (smallest `depth`); screen distance only breaks
  ties within 0.5 mm of depth. This makes the angle bar's opening win over the
  wood's coaxial one, and the top opening win over the bottom one of the same
  hole when looking from above.

### 4.4 Choosing holes (`placementHardware.js`)

- Chosen-hole records gain `side` (`'far'` or the entry value).
  `holeOfClick` copies `info.holeSide`.
- `holeKey` stays `instance/feature/index` (side NOT in the key): a hole is
  chosen once. Clicking the OTHER opening of an already chosen hole switches
  that hole's side (keeps its position in the list); clicking the same opening
  removes it, as today.
- `toggleRowHoles` / `rowHoles` / `pickRowHoles`: the row's holes take the
  clicked hole's side when every centre of the row has that opening, else the
  entry side (state it in the hint only if it actually happens — keep it
  simple).
- `finishHardware`: pose from `hole.point/normal` (already the clicked
  opening, so the preview is right), and the connection gets `side: 'far'`
  ONLY for far holes (entry: no key → Phase M byte-identical).
- `chosenHoleRows` / `holeLabel`: far holes read "… · far side" (e.g.
  "Hole · Angle bar · Ø 6.6 · far side"). `seatedIn` counts hardware per hole
  regardless of side.

### 4.5 Flip side (E1, tight areas)

The user picks the hole from wherever the camera already is and flips:

- Pure `flipHardwareSide(draft, ctx)` in `placementHardware.js`: in Shape with
  connections, every chosen hole that has the other opening switches to it
  (point/normal from `holeCentres`), then `finishHardware`. Holes with no
  other opening (blind) stay and the placement problem/hint says
  "N holes have no far opening" (one line, no error). In Place with chosen
  holes it flips the chosen list (rings move). Undo granularity: draft-only,
  Apply is still one history step.
- Panel (`OperationPanel.jsx` hardware Shape/Place section): button
  **Flip side** next to Re-place, disabled when no chosen hole has another
  opening. Keyboard: **F** while the hardware tool is in Place/Shape with
  chosen holes — ONLY if F is not already bound in Sketch Studio's CAD
  workspace/viewport (grep `CadWorkspace.jsx`, `CadViewport.jsx`,
  `rotateKeys.js`, `viewMode.js`); otherwise pick a free key and say so.
  Show it in the hint: "… · F flips to the other side".
- Free seat (no hole): no flip (the face already decides the side).

### 4.6 Connection editor

`ConnectionEditor.jsx`, concentric: a **Seat side** select (Drill side / Far
side) shown when the target feature is a hole; Drill side removes the key.

### 4.7 Hardware panel "Attach to selected hole"

Unchanged (drill side, no `side` key). Do not add a side choice there.

## 5. Not in scope

Nut/washer stacks on the far side, automatic screw length to the stack,
auto-detect "the screw must go through both holes", multi-select from the
tree, changing `CAD_VERSION`, pockets.

## 6. Acceptance

1. Kernel tests (`kernel.cuts.test.js` or a new `kernel.seatSide.test.js`):
   - 10 mm board, through hole drilled from the top: `exits[0] = 10` (±1e-6);
     a screw with `side: 'far'` has its head plane at the bottom face, axis
     pointing up (+Z); no `side` = today's pose exactly.
   - Angle bar 50×50×5, through-all hole in leg A: `exits[0] = 5`, not ≈ 50.
   - SHS tube with a through-both-walls hole: `exits[0]` = far outer wall.
   - Blind hole inside the material: `exits[0] = null`; `side: 'far'` throws
     the §4.2 message.
   - Hole row: one exit per centre.
   - `offset` positive sinks the hardware on both sides.
2. `placementCuts.test.js`: `holeCentres` emits far candidates with the right
   world point/normal on a rotated instance.
3. `placementHardware.test.js`: far pick → connection `side: 'far'`, pose at
   the far opening; entry pick → connection byte-identical to Phase M;
   other-opening click switches side; Flip side round-trips; Flip with a blind
   hole leaves it and reports it.
4. Layer (`CadViewport.place.dom.test.jsx` or new): two coaxial holes (angle
   bar on a board) seen from above → the angle bar's opening is picked; seen
   from below → the board's far opening is picked.
5. Browser: a new `scripts/verify-hardware-seat-side.mjs` (model on the
   recipe of `scripts/verify-hardware-holes.mjs`, `CAD_VERIFY_URL`): angle bar
   lying on a wood board with coaxial holes; pick from above → screw head on
   the angle bar top (read the saved instance position / connection, not
   pixels); Flip side → head on the board's underside, axis up; orbit below
   and pick the bottom opening directly → same as flip. Save screenshots under
   `artifacts/sketch-cad/hardware-seat-side/`.
6. No regressions: `npx vitest run src/features/sketchstudio/cad` and the full
   suite counts reported before/after, `npm run lint` clean, and the browser
   scripts `verify-hardware-holes.mjs`, `verify-hole-hardware.mjs`,
   `verify-angle-bar.mjs` pass.
