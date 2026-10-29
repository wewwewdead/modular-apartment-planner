Twin-Deck Utility Table — Sketch Studio modeling guide

A distinctive table with two wood worktop panels, a recessed center tool channel,
inset square-tube stands and concealed steel mounting tabs. Proposed finish:
natural birch, charcoal steel and an orange removable channel.

This is a dimensioned CAD concept, not an industrial-rated fabrication design.
No allowable load is assigned. Confirm the intended distributed load, point loads,
vise/machine forces, height, steel grade, joints, bracing and test criteria before
releasing it for manufacture. The app's interference check does not assess strength.
The dimensions below describe a seated-height concept; they are not a recommendation
for a standing industrial workstation.

**1. Start the project.**

Save existing work. Open Sketch Studio → 3D Model & workshop → New. Name the
document `Twin-Deck Utility Table — concept`. Work in millimetres. X runs along
the 1,600 mm length, Y runs along the 800 mm depth, and Z points up from the floor.
Overall concept dimensions are 1,600 × 800 × 750 mm.

Use Move part for rough positioning and Position (mm) for the final coordinates.
After each edit, press Enter and wait for Model current. Use Fit when needed.

**2. Create the two wood panels.**

Solid → Board / plate. Name the part `Wood worktop panel`. Select Birch plywood
from Material. Select its box feature and set width=1600, depth=360, height=36.
Set instance Position to [0,0,714], with Rotation [0,0,0]. This places the top
surface at Z=750.

Assemble → Duplicate instance. Set the second instance Position to [1600,800,714]
and Rotation to [0,0,180]. It occupies X=0…1600 and Y=440…800, leaving an 80 mm
channel between the panels. The rotated instance also mirrors any shared underside
mounting pattern to the opposite panel.

Duplicate instance shares the same part definition: editing a panel dimension or
hole changes both panels. Add a new Board / plate instead if you need different
panel shapes. Treat 36 mm as a provisional panel specification and choose the
actual supplier's construction and grade before fabrication.

**3. Add the feet.**

Create a Board / plate, name it `Steel foot plate`, and choose Mild steel.
Set width=100, depth=100, height=8. Duplicate it until there are four instances.
Use these Position values, with all rotations zero:

| Foot        | Position X, Y, Z |
| ----------- | ---------------- |
| Left front  | 200, 50, 0       |
| Left rear   | 200, 650, 0      |
| Right front | 1300, 50, 0      |
| Right rear  | 1300, 650, 0     |

These are floor-contact plates in the concept, not specified anchors or leveling
feet. Floor protection, anchorage or rated leveling feet require a later detail;
adding their height changes the leg length needed to retain a 750 mm overall height.

**4. Create the four tube legs.**

Solid → Tube / member. Name it `Main leg`, and choose Mild steel. Open the member
feature's section editor. The current section control uses a structured values box;
replace its contents with the following and choose Apply changes:

```json
{ "type": "tube", "width": 50, "height": 50, "wall": 3 }
```

Set start=[0,0,0], end=[0,0,656], gapStart=0, gapEnd=0, angleStart=0, angleEnd=0.
Create four instances with these positions and zero rotations:

| Leg         | Position X, Y, Z |
| ----------- | ---------------- |
| Left front  | 250, 100, 8      |
| Left rear   | 250, 700, 8      |
| Right front | 1350, 100, 8     |
| Right rear  | 1350, 700, 8     |

Member endpoints locate the tube centerline. A 50 mm tube extends 25 mm to each
side of that centerline. Its finished ends are at Z=8 and Z=664.

The zero gaps describe nominal fit in this model. Production weld preparation and
gaps must be specified by the fabricator; they are not established by this guide.

**5. Add the upper crossrails.**

Create a NEW Tube / member definition called `Upper crossrail`. Use the same
50 × 50 × 3 section, zero gaps and zero end angles. Set start=[0,0,0] and
end=[0,650,0]. Make two instances:

| Crossrail | Position X, Y, Z |
| --------- | ---------------- |
| Left      | 250, 75, 689     |
| Right     | 1350, 75, 689    |

Their undersides are at Z=664, meeting the leg ends. Their top surfaces are at
Z=714, meeting the wood undersides.

**6. Add four rails along the table length.**

Create a NEW Tube / member definition called `Long support rail`. Use the same
section, zero gaps and zero end angles. Set start=[0,0,0], end=[1050,0,0].
Use these four instance positions, with zero rotations:

| Rail        | Position X, Y, Z |
| ----------- | ---------------- |
| Front outer | 275, 100, 689    |
| Front inner | 275, 335, 689    |
| Rear inner  | 275, 465, 689    |
| Rear outer  | 275, 700, 689    |

These fit between the inner faces of the crossrails. The inner pair runs along
the edges of the center opening. Each wood panel has an outer and an inner support
rail. The 250 mm end overhangs must be included in the eventual point-load and
deflection assessment, rather than assumed to have the same capacity as midspan.

**7. Add lower ties to the stands.**

Create `Lower crossrail`, also 50 × 50 × 3, with start=[0,0,0], end=[0,550,0],
zero gaps and zero end angles. Its two positions are [250,125,180] and
[1350,125,180]. They fit between the front and rear legs.

The two stands now read visually as closed rectangular frames. The central area
under the table remains open. These ties are not a substitute for a designed
lateral bracing system. The engineer must detail suitable diagonal bracing,
gussets or moment connections in both table directions before manufacture.

**8. Model concealed mounting tabs and holes.**

Create a Board / plate named `Worktop mounting tab`, Material=Mild steel,
width=80, depth=60, height=6. Solid → Hole. Set Diameter=9, Cut extent=Through all,
Cut placement=Part side, Cut side=Top, Locate by=Fixed distance from edges (mm).
Set the minimum X edge distance to 40 and minimum Y edge distance to 30.
This is a provisional M8 clearance arrangement; it is not a connection capacity.

Create twelve instances, all with zero rotations. For each X below, place one at
each listed Y; all instances have Z=708:

| X positions    | Y positions        | Z   |
| -------------- | ------------------ | --- |
| 410, 760, 1110 | 125, 250, 490, 615 | 708 |

The tab tops are flush with the tube tops at Z=714. The edges meet the sides of
the support rails, with bolt access below. The tabs need a designed attachment
to the rails: touching solids in CAD does not create a weld.

To practice direct editing, choose Move holes and drag the orange center. Snap=0
allows free movement. Restore the exact 40/30 mm offsets for the final concept,
then Lock hole position. Editing this shared tab moves the hole on every tab.

**9. Choose the actual wood fasteners before drilling the panels.**

Use Hardware library for M8 bolts, washers and a threaded-insert envelope.
Choose a supplier insert explicitly suitable for the selected wood panel; its
installation diameter is NOT the M8 thread diameter. Enter the supplier's actual
body dimensions and installation notes. The library's generic threaded insert
does not automatically become a verified wood-insert product.

For the first panel, the proposed underside mounting centers in PANEL coordinates
are every combination of X=[450,800,1150] and Y=[155,280]. The rotated second
instance maps these to the rear tab rows. Wood drilling starts at local Z=0 and
points along +Z. Use the supplier's blind installation depth and diameter; do not
drill through the work surface or invent a thread-engagement depth.

Model and check the washer thickness, bolt length and insert seating together.
Metal-sheet PEM hardware should not be substituted for a wood-specific insert.
Supplier reference: [E-Z LOK wood-insert range](https://www.ezlok.com/for-wood).

If you substitute solid oak or another solid-wood top, revise the fastening
arrangement to accommodate cross-grain movement; the round-hole concept above
does not establish that allowance. Use properly detailed sliding/slotted
attachments or suitable tabletop fasteners. [Woodcraft tabletop-fastener guidance](https://www.woodcraft.com/blogs/cabinetry-furniture-making/tabletop-fasteners).

**10. Add the recessed center channel.**

Model a short, removable channel BETWEEN the crossrails so it does not intersect
them. Its provisional parts are below. All rotations are zero; dimensions are
box width × depth × height, and positions refer to box minimum corners.

| Part        | Dimensions    | Position      |
| ----------- | ------------- | ------------- |
| Tray bottom | 1000 × 76 × 2 | 300, 362, 690 |
| Front wall  | 1000 × 2 × 20 | 300, 360, 690 |
| Rear wall   | 1000 × 2 × 20 | 300, 438, 690 |

Use SPCC or another supplier-confirmed sheet material. The walls meet the inner
rail sides. Detail removable mounting clips to those rails before fabrication;
the channel is not supported merely because its parts appear in the model.
The ends are intentionally open in this concept. An orange finish gives a strong
contrast to the wood and charcoal frame. Record finish in drawing notes—the
material dropdown does not automatically simulate paint colors.

The three plates represent the channel envelope. They are not a bend-developed
flat pattern; bend radius, bend allowance, edge treatment and mounting clips
remain fabrication details. Treat the channel as a small-item/cable well, not
an additional rated work surface.

**11. Check the assembly and make drawings.**

Use top/front/right views and Fit. Confirm 750 mm overall height, 80 mm between
the wood panels, and the tube-to-panel contact height of 714 mm. Assemble →
Interference identifies overlapping solids, not missing welds or weak joints.
Inspect underside bolt access and wood-hole alignment with Section and Isolate.

Create an A3 assembly engineering sheet, starting at scale 0.02 (1:50) with top,
front, right and isometric views. Increase individual view scales only if they
fit. Create separate detail sheets for tabs, wood panels, bracing and weld joints.
Add hole chains/callouts and material/finish notes. Use a larger detail scale for
the 80 × 60 mm tabs. Label the set `CONCEPT — LOAD RATING NOT ESTABLISHED`.

Manufacture → cutting list gives nominal member quantities. The proposed tube
schedule, before allowances, is:

| 50 × 50 × 3 tube   | Quantity | Nominal length each |
| ------------------ | -------- | ------------------- |
| Legs               | 4        | 656 mm              |
| Upper crossrails   | 2        | 650 mm              |
| Long support rails | 4        | 1050 mm             |
| Lower crossrails   | 2        | 550 mm              |

Total nominal tube length is 9,224 mm, excluding bracing, saw kerf, preparation
and waste. Save the editable project. STEP and workshop ZIP exports can support
review, but a successful export is not fabrication approval.

**12. Establish an actual industrial working-load rating.**

First specify the intended use and maximum working load, including where loads
act. Distributed storage, a vise at an overhang, moving machinery and hammering
are different load cases. Then have a qualified engineer finalize and check the
steel grade/sections, worktop behavior, welds, brackets, bolts, insert pull-out,
lateral bracing, stability and floor interface. Have the prototype inspected and
tested against the agreed criteria before assigning a working-load label.

For desk/table use, ANSI/BIFMA X5.5 is a relevant standard family to discuss with
the test provider; do not treat it as an automatic industrial-workbench rating.
BIFMA's own compliance program requires testing through an appropriately scoped
ISO 17025 accredited laboratory. [BIFMA compliance requirements](https://www.bifma.org/page/bifma-compliant).

This guide supplies modeling dimensions and a design direction. The missing
load requirements, bracing and manufacturing connection details must be resolved
before this concept can be called industrial-rated.
