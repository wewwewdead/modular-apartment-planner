# Industrial Shop Cabinet — Sketch Studio 3D build guide

A heavy-duty storage cabinet in birch plywood with screwed butt joints, a full
screwed-on back and 32 mm-system shelf pins. Modelled start to finish in
Sketch Studio → **3D Model & workshop**, then drawn, dimensioned and exported.

Every button name below is the one you will see in the app (checked
2026-10-28). Work in millimetres. X runs along the 800 mm width, Y along the
500 mm depth (front to back), Z up from the floor.

This is a dimensioned CAD design, not a load-rated one. The app's Interference
check finds overlaps; it does not assess strength. Confirm shelf loads before
building.

---

## 1. The design

**Overall:** 800 W × 500 D × 1800 H. 18 mm plywood carcass and shelves, 12 mm
back, 100 mm toe kick, one fixed shelf, two adjustable shelves.

Why these numbers:

- 18 mm (¾") plywood is the common choice for shop carcasses. Thicker panels
  cut sag far more than wider supports do, so shelves are kept under ~860 mm
  span and the fixed shelf gets a front stiffener — forum builders report that
  with heavy loads "it's always the plywood giving up", not the pins.
- A full, thick back is what stops the cabinet racking; a ¼" back is the
  residential minimum, so a 12 mm back is used here.
- Toe kick 100 mm (manufacturer guidance is 90–115 mm).
- Shelf pins on the 32 mm system: Ø5 holes, 32 mm apart, 37 mm in from the
  front and back edges.

### Parts (all plywood)

| #   | Part             | Qty | L × W × T (mm)  | Notes                                       |
| --- | ---------------- | --- | --------------- | ------------------------------------------- |
| 1   | Side             | 2   | 1800 × 500 × 18 | Full height, grain vertical                 |
| 2   | Bottom           | 1   | 764 × 500 × 18  | Sits at Z 100 (toe kick)                    |
| 3   | Top              | 1   | 764 × 500 × 18  |                                             |
| 4   | Fixed shelf      | 1   | 764 × 500 × 18  | Mid-height, ties the carcass                |
| 5   | Stiffener        | 1   | 764 × 60 × 18   | Glued + screwed under the fixed shelf front |
| 6   | Adjustable shelf | 2   | 762 × 480 × 18  | 1 mm side clearance, 20 mm shallower        |
| 7   | Plinth           | 1   | 764 × 100 × 18  | Set back 50 mm from the front               |
| 8   | Back             | 1   | 800 × 1700 × 12 | Covers the rear edges from Z 100 to 1800    |

### Screws and holes

- **Joints:** 4.5 × 50 wood screws, or 7 × 50 confirmat screws. Four per joint
  end, through the side into each panel edge, at Y = 50, 180, 320, 450.
  Pilot/clearance hole modelled: Ø4 through the side (Ø5 for confirmat).
- **Back:** screws every ~150 mm around the edge, 6 mm in.
- **Plinth:** two per end.
- **Shelf pins:** Ø5 × 10 mm deep, 32 mm pitch, 37 mm in from front and back.
- Glue every carcass joint.

> The Hardware library currently holds metric machine hardware only (bolts,
> nuts, standoffs, PEM inserts) — no wood screws. Screws are therefore
> modelled as pilot holes and listed in the drawing notes.

---

## 2. Setup

1. Open Sketch Studio → **3D Model & workshop** (top right). If a model is
   already open, click **New**.
2. Click **Design parameters** (on the empty-model screen, or in the Parts &
   features tree click **Named parameters** → **Design parameters**). Choose
   preset **Cabinet**; it fills in:

   | Name     | Value |
   | -------- | ----- |
   | `width`  | 800   |
   | `depth`  | 500   |
   | `height` | 1800  |
   | `t`      | 18    |
   | `backT`  | 12    |
   | `toe`    | 100   |

   Change any value in the form if your cabinet differs. Set **Default snap
   (mm)** to `1` (this sets the view toolbar's **Snap (mm)**). Leave **Build
   the starter model from these parameters** ticked and click **Apply &
   build**. The six parameters and the whole carcass are added in one step
   (untick the box, and the button reads **Apply**, to add only the
   parameters and build the parts yourself). The Named parameters table
   opens: each row shows Name, Value, the Resolved number, a note and how
   many model values use it. To add another, click **Add parameter**, type
   the name, Enter, the value, Enter.

   Anywhere you type a number you may type an expression instead, e.g.
   `=width-2*t`; the model then follows later changes. Typing `=` lists the
   parameter names: arrow keys and Enter or Tab insert one. In the sketch
   input box the expression is worked out when you press Enter, so the sketch
   keeps the number (for a value that should follow later changes, use an
   expression in the part or feature fields instead).

3. The carcass appears: 2 Sides, Bottom, Top, Fixed shelf, Stiffener,
   Plinth, Back and 2 Adjustable shelves (8 parts, 10 instances), with the
   pilot holes and a shelf-pin column in the sides. Adjust any parameter in
   the table and watch it update — e.g. `width` `900` moves the right side to
   X 882 and widens the Bottom to 864. The right side is the same Side part
   turned 180°, so its shelf-pin holes face inward; its Position X therefore
   reads `=width` (the panel spans X 882–900 at that width). The view
   toolbar's **Snap (mm)** shows the value you chose.

After every edit wait for **Model current** in the status bar. Use **Fit** to
frame the model.

---

## Building it by hand (optional — to learn the tools, or to change the design)

The generated model already contains these parts; sections 3–8 show how to
make them yourself (start from **New** and untick **Build the starter model**
in step 2), which is also how you add parts the preset does not have.

### 3. Left side (first part)

4. **Sketch** tab → **New sketch**. In the Properties panel, under **Exact
   plane**, set Sketch plane **YZ**, Plane offset `0` → **Start sketch** (or
   just click the **Right · YZ** origin plane in the view). The camera squares
   up to the plane.
5. Click **Rectangle**. Click the origin (it snaps), then type `500` → Tab →
   `1800` → Enter. Width runs along Y (depth), height along Z.
6. **Finish sketch** → Operation **Extrude**, Result **New part**, Part name
   `Side`, Distance `18` → **Apply**.
   Check Placement & rotation: position 0, 0, 0. If the panel grew toward −X,
   tick **Flip direction** before applying.

---

### 4. Bottom, top and fixed shelf

7. **New sketch** → Exact plane **XY**, Plane offset `100` → **Start sketch**
   (or type the offset and click the **Top** plane) →
   **Rectangle**: click the origin, type `764` → Tab → `500` → Enter →
   **Finish sketch** → Extrude, New part, Part name `Bottom`, Distance `18` →
   Apply.
8. Select Bottom in the tree → Placement & rotation → Position X `18`, so it
   sits between the sides. (This is the exact-number way; step 11 shows the
   click way.)
9. **New sketch** → Exact plane **XY**, offset `1782` → **Start sketch** (or
   type the offset and click the **Top** plane), same 764 × 500 rectangle →
   Extrude `18`, name `Top`. Position X `18`.
10. **Fixed shelf:** the same on **XY**, offset `900`, name `Fixed shelf`,
    Position X `18`.
11. **Stiffener:** **New sketch** → click the **underside of the fixed
    shelf** (choose **bottom** in the view box first). **Rectangle** from the
    front-left corner: `764` → Tab → `60` → Enter. **Finish sketch** → Extrude
    `18`, name `Stiffener`. The new part lands exactly on the face you drew
    on, under the shelf's front edge.

---

### 5. Right side with Mate faces

12. Select Side → **Assemble** tab → **Duplicate instance**. The copy appears
    100 mm to the right.
13. Place the copy either way:
    - **By number:** select the copy → Position X `782` (= 800 − 18).
    - **By clicking:** **Mate faces** → click the copy's inner face → click
      the **right end of the Bottom panel** → Offset `0` → **Done**. The side
      seats against the bottom's end. Then **Move part** and drag it along Y
      until the orange flush line shows it even with the other side.
14. Both sides are one definition ("Side"), so the parts list counts 2.
    Double-click (or F2) in the tree to rename an item.

---

### 6. Plinth and back

15. **New sketch** → Exact plane **XZ**, Plane offset `50` → **Start sketch**
    (or type the offset and click the **Front** plane) → **Rectangle** `764` ×
    `100` from the origin → Extrude `18`, name `Plinth`. Position X `18`,
    Z `0`. The board should occupy Y 50–68 — 50 mm back from the front; tick
    **Flip direction** if the preview grows the wrong way.
16. **New sketch** → Exact plane **XZ**, Plane offset `500` (the rear face) →
    **Start sketch** (or type the offset and click the **Front** plane) →
    **Rectangle** starting at (0, 100): type `0` → Tab → `100` → Enter for the
    first corner, then `800` → Tab → `1700` → Enter. **Finish sketch** →
    Extrude `12`, name `Back`. Tick **Flip direction** if the preview puts it
    inside the cabinet — the back stands off the rear edges (Y 500–512).

---

### 7. Screw pilot holes

17. Select the **left Side** → **Solid** tab → **Place holes** → Properties:
    Hole diameter `4`, tick **Through all**, Hole snap `1`. Click the side's
    **outer face** four times along the Bottom joint line (Z 109 = middle of
    the panel) at Y 50, 180, 320, 450. Clicks need not be exact: afterwards
    click each hole in the tree and type its position fields.
18. Repeat along the Top joint (Z 1791) and the Fixed shelf (Z 909). Click
    **Done placing holes**.
19. **Shelf pins:** still on the left Side, **Place holes** with Hole diameter
    `5`, **Through all** off, Hole depth `10`, **Hole snap `32`**. Click the
    **inner face** at Y 37 and Y 463 for each pin row (for example Z 300–800
    and Z 1000–1700 in 32 mm steps). The 32 mm snap keeps the rows exact.
    Note: **Pattern** copies the whole part, not a single hole, so pins are
    placed by clicking.
20. Both sides share one definition, so holes made on the left appear
    mirrored on the right automatically. Add Ø4 holes through the **Back**
    every 150 mm, 6 mm in from its edges, and two per end through the
    **Plinth**.

---

### 8. Adjustable shelves

21. **New sketch** → Exact plane **XY**, offset `500` → **Start sketch** (or
    type the offset and click the **Top** plane) → **Rectangle** starting at
    (19, 10): `19` → Tab → `10` → Enter, then `762` → Tab → `480` → Enter →
    Extrude `18`, name `Adjustable shelf`. **Duplicate instance** → set the
    copy's Position X `19`, Z `1300`.
22. **Assemble** → **Interference** to confirm nothing overlaps (the shelves
    clear the sides by 1 mm).

---

## 9. The 2D drawing

23. **Drawings** tab → **Generate views**. The Assembly sheet shows front,
    top, right and isometric views with the parts list (Side 2, Bottom 1, …)
    and numbered balloons.
24. **Dimension**: on the front view click the two outer side faces, then
    click below to place → `800`. Click the bottom and top edges, place to the
    side → `1800`. Add `100` for the toe kick, and `500` on the right view.
    Ø and R dimensions work the same way on a hole.
25. **Add part sheets** → one engineering sheet per part with its own
    dimensions and the "n × Ø4 THRU" / "Ø5 DEPTH 10" callouts.
    **Sheet properties** → notes: screw spec, glue all joints, 32 mm pin
    system, material, sand edges.
26. Export: **SVG sheet**, **DXF sheet** (CNC or print shop), **Vector PDF**
    (all sheets).

---

## 10. Workshop output

27. **Manufacture** tab → **Cutting list** (sizes, quantities, grain — sides
    vertical). **Fabrication settings**: sheet 2440 × 1220, kerf 3.
    **Export CSV** or **Workshop ZIP** for the whole package; **STEP assembly**
    for other CAD.
28. **Save** (top right) to keep the `.sketch.json`.

---

## Build order in the shop

1. Sides + bottom + top + fixed shelf: glue, square, screw.
2. Stiffener under the fixed shelf front.
3. Plinth.
4. Back — this squares the carcass.
5. Shelf pins and adjustable shelves.

---

## Sources

- [Shop cabinets under construction — Sawmill Creek](https://sawmillcreek.org/threads/shop-cabinets-under-construction.92322/)
- [Heavy duty adjustable shelf pins — Sawmill Creek](https://sawmillcreek.org/goto/post?id=2336904)
- [Heavy-Duty Shelf Support Ø5 mm / 32 mm](https://makerworld.com/en/models/3011482)
- [Build heavy duty shop shelves](https://cemindustrialsupply.com/build-heavy-duty-shop-shelves/)
- [Dadoing techniques — WoodWeb](https://www.woodweb.com/KnowledgeBase/KBCabinetmakingCustomCabinetConstruction.html?vm=308)
- [Parts of a cabinet](https://pineandpoplar.com/parts-of-cabinet/)
- [What size plywood for cabinets](https://engineerfix.com/what-size-plywood-do-you-need-for-cabinets/)
- [Garage storage cab ½" ply shelves — Sawmill Creek](https://sawmillcreek.org/threads/garage-storage-cab-1-2-ply-shelves.64709/latest)
- [Building cabinet – need a support rail? — UK Workshop](https://ukworkshop.co.uk/threads/building-cabinet-need-a-support-rail.90957)
- [Dado joint calculator](https://best-calculators.com/construction-diy/dado-joint-calculator/)
