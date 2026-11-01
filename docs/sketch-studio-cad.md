# Sketch Studio model and workshop workspace

New to the workspace? Follow the [step-by-step mounting plate tutorial](sketch-studio-step-by-step.md)
to build a part, add holes, create engineering drawings, and export your work.

Open Sketch Studio and choose **3D Model & workshop**. Existing 2D drafting,
joinery, hardware, materials and exports remain available under **2D drafting**.
To copy a drawing into the workshop, select its outlines and choose **Send
selection to 3D**, or choose **Import drawing into 3D** to review the whole
drawing. The workshop's Sketch tab also has **Import 2D profiles**. Choose
the profiles and their extrusion depth, then import them as separate parts.
Supported profiles include rotated rectangles, circles, closed polylines and
closed loops of lines with coincident endpoints. Open, branching, intersecting
and isometric outlines are reported rather than reconstructed automatically.
Nested outlines remain separate parts; use a Boolean cut or holes in the
workshop when needed. Import preserves drawing coordinates and assigned
materials. It copies the profiles: later drafting edits do not change the
3D parts, and the original drafting entities remain editable.

A new model opens on an empty view with the grid, the origin and three
translucent origin planes meeting at it: **Top · XY**, **Front · XZ** and
**Right · YZ** (each is centred on the origin, so sketch (0, 0) is the
tile's centre). There is no welcome dialog: click
a plane, or its label, and the sketch starts on it straight away (the view
turns square to it and the sketch bar opens). The Properties panel lists the
other ways in under **Start**: **New sketch**, **Board / plate**, **Tube /
member**, **Design parameters**, the examples and **Import 2D profiles**.

**Where a new Board or Tube lands.** **Board / plate** and **Tube / member**
(Solid tab or the Start list) put the new part on the ground (Z = 0) at the
centre of your current view, snapped to the Move part grid (1 mm when moving
freely), and the camera does not move. A board is centred on that point (its
Position is its corner, so a 600 × 400 board dropped at the origin reads
Position −300, −200, 0); a tube stands upright with its axis through it. On a
new model, before you orbit or pan, the centre of the view is the origin. In a
front or side view, where the centre of the view never meets the ground, the
part lands under the orbit centre instead. Fit and the Standard view list
still reframe the model when you ask. A model opened with parts (Open, Import,
reloading the page) is framed once when it appears; parts you add afterwards
never reframe it.

**New sketch** (Sketch tab, the Start list, or the **S** key) is the one
command for sketching on anything: the origin planes appear (sized to the
model), flat faces outline as you hover them, and a click on a flat face or a
plane starts the sketch there. Curved faces cannot hold a sketch; the hint
says so. For an exact plane, use **Exact plane** in the Properties panel:
choose XY, XZ or YZ, type a **Plane offset (mm)** (XY moves along Z, XZ along
Y, YZ along X; the planes in the view move with it) and choose **Start
sketch**, or type the offset and click the plane in the view. Esc cancels.
The form-based **Sketch from fields** and the **Precision path** editor
remain on the Sketch tab. After a sketch finishes, **Extrude** has the focus,
so Enter extrudes a closed profile.

## Typical workflow

Part properties, the Hardware library and drawing-sheet properties offer a
grouped material dropdown (metals, wood/sheet goods, plastics and other materials).
Expand **Search materials** to filter it. **Custom material…** lets you enter a
company grade or finish; existing custom names remain editable, and materials
already assigned to parts appear under **Project materials**. Choosing a material
records its name for the model and workshop output; dimensions stay separate.

1. Click an origin plane (or **New sketch**, or S) and draw a profile, or add
   a board/plate, a tube/member, or an example from the Start list or the
   parts tree.
2. Enter section sizes, wall thickness, lengths and placements in millimetres.
   Expressions such as =width-section\*2 explicitly link dimensions.
   Select a part and use **Move part** above the viewport: drag an X/Y/Z arrow
   or a plane square. Movement snaps to 1 mm by default; set Snap to 0 for free
   movement. Escape cancels a drag, and one Undo reverts a completed drag.
   Exact Position and Rotation fields are expanded in the properties panel.
   Dragging preserves parameter expressions by adding an explicit offset.
   Attached parts must be repositioned through their connection or parent;
   turn off Exploded view before moving. Camera orientation and zoom remain
   unchanged after a placement rebuild; use Fit when desired.
   **Rotate part** shows three rings (X red, Y green, Z blue). Grab a ring
   and circle the cursor around the centre like a dial: the grabbed point of
   the ring follows the cursor, the turn keeps counting past 180°, and a
   shaded sector plus a faint outline of the starting pose show the sweep.
   A ring seen edge-on turns by sliding along it instead. Turns snap to the
   Angle snap step (presets Free, 1°, 5°, 15°, 45°, 90°, or a custom value);
   hold Alt for a free turn. Type a number and press Enter during a ring drag
   for an exact angle. **World / Local** chooses world axes or the part's own
   axes for the rings and the X/Y/Z 90° buttons. **Rotate about: Picked
   point** turns about a point clicked on the selected part (corners within
   8 px snap). Keys, with a part selected: R rotate, M move, ] / [ turn by
   the snap step about Z, Shift+] / Shift+[ about X.
3. Add sketches and solid features. Feature order is the construction history.
   Features can be edited, suppressed or removed. Definitions can have multiple
   assembly instances; a definition edit updates every instance.
   Extrude, Revolve, Sweep, Loft and the other solid modifiers open a separate
   setup preview. Configure the operation, inspect it, then choose Apply.
4. Use the Assemble tab for placements, attachments, weld notes, hide/isolate,
   exploded display, sections and solid interference inspection.
5. Generate linked drawing views. Set scale, page size, units, revision and
   annotations in Sheet properties. A scale of 0.05 is 1:20. Oversized views
   report an error instead of silently changing a stated scale.
6. Set stock lengths, sheet sizes, kerf and allowances in Manufacture. Export a
   STEP assembly, a selected STL part, a CSV cutting list or the workshop ZIP.

The ZIP contains assembly and part STEP, part STL, vector PDF/SVG sheets,
dimensioned DXF sheets, separate model-space DXF views, eligible planar SVG/DXF
profiles, stock layouts, quantities, resolved assembly placements, the model
definition and assembly/weld documentation. Missing individual part
and drilling sheets are generated automatically during workshop export.

## Engineering drawings from a company blueprint

Open **3D Model & workshop → Drawings → Pump bracket example** (also available
on the empty workspace). This appends an editable reference study without
replacing existing work. Choose **Generate views**, then select **Pump bracket —
dimensioned part** in the sheet selector. The Drawings tab gives the sheet the
full central viewport; switch to Solid or Assemble to see the model again.

The example uses a folded channel, five opening features, six mounting holes,
and four simplified standoffs. Its named parameters include 166 mm length,
52.5 mm height, 1.5 mm thickness, 30 mm hole pitch and 31.1 mm standoff length.
These values are a reading of the reference photo, not verified source CAD.
The 25 mm opening diameter, 8 mm flange depth, standoff outside diameter,
mounting locations and installation-hole diameters are assumptions. Square
bends and plain bores simplify the geometry; tabs, PEM nuts and threads are
omitted. The example sheets carry these limitations as drawing notes.

For your own model, select a part and choose **New engineering sheet**.
**Sheet properties** now provides ordinary form controls for the drawing
subject, A3/A4/Letter paper, scale, units, view labels and scales, revision,
drawing number, material/finish, tolerance, drawn-by/date and drawing notes.
Engineering sheets have a bordered title block and up to four explicitly
labeled views. The layout places top/isometric above front/right; it does not
assert a first-angle or third-angle projection standard. Overall dimensions
have extension lines and arrowheads. Paper scale is preserved; an oversized
view reports an error instead of silently shrinking.

Under **Hole dimensions & callouts**, select Hole features and a face-on view,
then add a horizontal/vertical chain or a grouped diameter/depth callout.
Chains can include the distance from the view's minimum edge (left/top).
Offsets are paper millimetres. Center marks, dimensions and leaders are
recomputed from the model's cut positions, diameters and assembly placements.
Grouped callouts require matching diameters and depths. Missing/suppressed
references and invalid annotation views report errors. Features followed by
patterns, mirrors or transforms need revised references; their centers are
not guessed. Sectioned/detail views do not support these hole annotations.

Choose **Section sheet** for a separate hatched section. Use its Cut normal,
Cut position and Retain side controls, and choose a view facing the cut plane.
The default cut is perpendicular to X. It does not add an A-A cutting-plane
marker to the parent sheet. Advanced sheet definitions remain available.

After editing, choose **Generate views** or **Update drawing preview**.
Use **SVG sheet** or **DXF sheet** for the selected sheet, or **Vector PDF** for
the drawing set (including automatically generated part details). All three
use the same rendered drawing. DXF carries linework and text, not native
associative CAD DIMENSION entities. Print the PDF at actual size to preserve
the stated scale. Save/open, recovery and Undo/Redo retain the sheet settings
and linked references.

This is model-driven drawing authoring, not automatic photo-to-CAD tracing.
Confirm the original drawing's dimensions, material grade, bends, hardware
specifications and tolerances before treating the study as a manufacturing
drawing. Sheet-metal unfolding and bend allowance development remain outside
the current toolset.

## Guided solid operations

Every guided operation runs in three stages: Place, Shape and Apply. The
mouse does the placing; the Properties panel holds the same values as fields
for exact numbers and parameter expressions.

**Place.** Choose the tool, then point at the model. Extrude and Revolve put a
profile on the flat face under the cursor, shown as a blue ghost. Sweep takes
its path corners as clicks, Loft one face per section, Fillet, Chamfer and
Shell the face whose edges (or opening) they change, Mirror and Trim the face
that gives their plane. Corners, edge midpoints, face centres and marks snap
within 8 px; any other point on a face snaps to the Snap (mm) grid measured
from the face's lower-left corner; Alt places freely. The readout by the
cursor names the snap and the coordinates, and the hint under the view says
what the next click does. A click on empty space puts Extrude, Revolve, Sweep
or Loft on the ground (Z = 0) as a new part; this is how the first part of an
empty model is made. A curved face is refused. Orbit, pan and zoom keep
working, and clicks never change the selection.

The part you click is the part you shape: the feature goes into that part's
definition (every instance of it changes), whatever was selected before. A
profile on an existing part is stored in that part's coordinates (a named
plane when the face is square to the part, otherwise an explicit plane), so it
extrudes square to the face even on a turned part. A new part's profile lies
on its own XY plane and the new instance is posed where you clicked. While
placing, every part stays visible; the shaped part is isolated once it is
known.

**Shape.** Handles appear on the placed profile:

- The blue distance arrow sets the extrude length. Drag it out of the part to
  add material. Drag it into the part and the operation becomes a cut: the
  arrow and ghost turn red and the badge reads "Cut preview — Apply to save".
  Past the far side of the part it becomes Through all; dragging back out
  returns to add. Choosing Operation in the panel (marked "(auto)" while the
  drag direction decides) stops this. The length never goes below 0.1 mm.
- The square at the profile centre slides the profile on its face: snap
  points, then the grid; Shift keeps the move on one grid axis.
- The corner grip resizes a rectangle about its centre; a circle's grip sets
  its diameter.

While dragging, type a number and press Enter for an exact value (in the
arrow's current direction; a leading minus means against the face normal);
Esc cancels the drag and restores the value. Snap (mm) applies and Alt drags
freely. The ghost follows the cursor; the kernel preview rebuilds once the
drag ends, and a failed preview never blocks the handles. A value that was a
parameter expression is replaced by a number when it is dragged (the readout
says so). The panel starts with a placement line ("On Part 2 · top face ·
profile 40 × 40 mm at (120, 60) · along +Z") and Re-place, then the profile
size, Part name for a new part, Length and Operation; the stored sketch plane
and origin are under Exact placement (mm).

Per tool:

- Sweep: the first click fixes the start and the path plane (the face under
  it, or the ground); later clicks add corners on that plane, snapped like the
  sketcher, and Shift locks each segment horizontal or vertical. Double-click,
  Enter or Finish path ends the path; Esc removes the last point. Corners are
  rounded by tangent arcs of the Bend radius (default twice the section radius;
  0 keeps sharp corners, which self-intersect for most real sections). A
  segment too short for its bends is reported instead of built. The grip at the
  start sets the section diameter; the panel also offers a rectangular section
  and a wall thickness for a hollow tube. Redraw path starts the path again.
- Revolve: the axis is the face edge nearest the click (dashed orange); Change
  axis picks another edge, which must lie in the profile plane. The 10 × 40 mm
  profile is kept on one side of the axis. The angle is a panel field.
- Loft: each face click adds a circular section, in click order; Enter or
  Finish sections ends it (two or more); a grip sizes the last section.
- Union, Subtract and Intersect: the tool part is a translucent ghost with the
  move/rotate gizmo (M and R switch it while the operation is open). It starts
  at the target's centre so the volumes overlap; moves snap to the target's
  faces and are stored in the target part's coordinates.
- Fillet, Chamfer and Shell: a face click picks the reference plane that
  contains it (all of that face's edges, or that face opened). A face that is
  not one of the six boundary planes the kernel lists is reported; choose a
  reference in the panel.
- Mirror needs a face square to the part's X, Y or Z. Trim takes any flat face,
  starts half-way into the part and keeps the half with the part's centre
  (Keep other side flips it). The plane arrow moves either plane along its
  normal.
- Pattern: an arrow along the step direction sets the spacing.
- Transform (select the part first): a translucent ghost of the part itself
  carries the move/rotate gizmo (M and R switch it). A drag is stored as the
  feature's Position and Rotation in the part's own coordinates; the preview
  shows the moved solid under the ghost. Moves snap to the other parts' faces.
  A dragged value that was a parameter expression becomes a number.
- Hole, Pocket and Add hardware place with a click too; see Holes and pockets.
- Editing an existing Revolve, Sweep or Loft keeps the field panel.

**Apply.** Apply, or Enter while the preview is ready and the focus is not in
a field, commits the draft as one undoable edit and selects the part and the
new feature. Apply keeps the camera where you left it; Fit reframes the model.
Esc walks back one step (a sweep point, a loft section, the axis pick) and
otherwise cancels the operation, restoring the selection and isolation.

New sketch on a face → Extrude shows the same distance arrow on the finished
sketch, with the same rule: dragged into the part it was drawn on, it becomes a
cut of that part. "Edit extrude with preview" puts the arrow, square and grip
on the stored feature: a drag changes its length or moves its sketch, unless
another feature shares that sketch.

A sketch selected in the tree is still used as the profile (Extrude shows the
arrow on it; Revolve, Sweep and Loft open their fields). For square-ended
straight tubes and pipes, Extrude starts with a copy of the actual hollow
section at the finished end, including its orientation, with the arrow on it.
This preserves the opening instead of capping it. The copied sketch is
independent; its dimensions and origin can be edited explicitly in the panel,
and Re-place puts a square profile elsewhere instead.

Sweep needs a path and a different closed cross section. Loft needs at least
two distinct closed section sketches, with controls for their order and plane
origins. Revolve requires a nonzero axis and an angle up to 360 degrees. Add,
Cut, Intersect and Replace describe how the new solid affects an existing part.

Union, Subtract and Intersect require another part definition. Tool translation
and rotation are in the target part's coordinate system; assembly placements
are independent. Position the tool so the intended volumes overlap.

Fillet, Chamfer and Shell list the edges or planar faces actually present at
the selected part's axis-aligned boundaries. They retain the plane, offset and
expected match count so an ambiguous later edit is reported. Custom reference
fields remain available. Tight corners and thin walls can limit radii and shell
thickness; a failed preview explains what to adjust. Mirror, Pattern and Trim
provide named plane, spacing, count and retained-side controls.

The preview runs in its own worker and is labelled in the viewport. **Apply**
is enabled only when the current candidate builds successfully. **Cancel
operation** discards it. A failed preview does not alter the saved feature
history or make the current model invalid. Applying is one undoable edit,
including any profiles created for it. To revise a saved feature, select it
and choose **Edit … with preview**. Changing the document while a preview is
open invalidates that preview; reopen it before applying. Exports require
applying or cancelling first, and save/recovery retains only applied geometry.

## Holes and pockets

**Solid → Hole** and **Solid → Pocket** run the same Place → Shape → Apply
steps as Extrude; nothing needs to be selected first.

**Place.** Point at a flat face: a red circle (Hole, at its diameter) or
rectangle (Pocket, oriented exactly as the kernel will cut it) follows the
cursor. Corners, edge midpoints, face centres, marks and the centres of
existing holes and pockets on that face snap within 8 px; anything else snaps
to the Snap (mm) grid in the face plane; Alt places freely. The click puts the
cut on the part you clicked, square to that face, stored as exact part
coordinates (a start point and a direction into the material), so it stays
square to the face on turned and tilted parts and drills up from an
underside. A hole starts through all; a pocket starts 12 × 20 mm and 5 mm
deep (on a tube or pipe, the sizes follow its section and wall).

A click on the curved face of a round tube or bar drills radially there: the
cut is stored as a member placement (side, distance from the finished start in
mm, offset across the side), so it follows the member when its length, section
or ends change. Other curved faces are refused.

**Shape.** The red arrow into the material sets the depth. Dragged past the
far face of the part it becomes **Through all** (the readout says so); dragged
back inside it is a blind cut of that depth. It cannot point out of the part;
it stops at 0.1 mm. Type a number and Enter during the drag for an exact depth.
The square slides the cut on its face (snap points, then the grid); on a round
member it moves along and around the member. Hole's grip sets the diameter
(at least 0.1 mm); Pocket's corner grip sets width and length about the
centre. The panel holds the placement line ("On Part 2 · top face · Ø 6 mm at
(120, 60) · through all") with **Re-place** and **Apply and place another**,
then Hole purpose, Thread size, Diameter or Pocket profile and size, Cut extent
and Depth. The full location fieldset (Cut placement, side, Locate by,
percentages or edge distances, member position, Cut start and Cut direction) is
under the collapsed **Exact placement (mm)**; editing it moves the handles.
**Pocket profile → Existing closed sketch** lets the sketch place the pocket and
hides the handles; **Rectangle** brings them back where the pocket was.

**Apply** (or Enter) adds the feature to the part definition and selects it;
**Apply and place another** also reopens the tool with the same sizes. Select
a hole or pocket in the tree and choose **Edit hole with preview** (or pocket)
for the same handles on the stored cut. Sliding a cut placed by part side or on
a square tube stores exact coordinates; a cut on a round member keeps its
member placement. A locked hole has no square; a cut followed by a transform,
mirror or pattern has no handles.

### Hole rows

**Solid → Hole row** (directly after Hole; also in the command search) places a
straight line of identical, equally spaced holes in two clicks. The first click
is the first hole, exactly as for Hole (corners, midpoints, face centres, marks
and existing hole centres snap; otherwise the Move grid). The tool stays in
Place and draws the row from that hole to the cursor: a red circle for every
hole, a dashed construction line through them with a tick at each, and the
readout "4 holes · pitch 50 mm · 150 mm". The second click is the last hole.
The count stays fixed (4 to start) and the spacing follows: spacing = distance
/ (count − 1). When the second click lands on a snap point the row fits exactly
between the two points (a spacing of 33.3333 is kept); otherwise the spacing is
rounded to the Move grid, so the row reads "pitch 50", not "pitch 50.33". A
direction within 3° of a face axis snaps onto it; Shift locks it to the face
axes; Alt places freely. **↑** and **↓** change the count (2 to 100) before
and after the second click; **Enter** before it makes a default row along the
face's +X (spacing 4 × the diameter, at least 10 mm, rounded up to 5 mm); typed
digits + Enter before it set the spacing along the direction under the cursor;
**Esc** before it goes back to the first hole. When the last hole lands outside
the face the readout says "past the edge", otherwise how far it is from the
edge. On a round tube or bar the first click drills radially and the row runs
along the member's axis, toward the second click.

After the second click the row has the Hole handles (depth arrow, the square
that moves the whole row, the diameter grip; all holes follow them) plus an
**end square** on the last hole: drag it to change the spacing and direction
with the count fixed (same snapping, Shift and grid rules), or type a value +
Enter during the drag for an exact spacing. The panel's **Row** fieldset has
_Holes in row_, _Spacing (mm)_, _Row length (mm)_ (editing it sets the spacing
for the same count), the direction ("+X of face · 0°" or "at 30°") with **Flip
direction**, and a warning when the spacing is less than the diameter (the
holes overlap into a slot; it is still cut). _Row direction (part mm)_ is under
Exact placement. **Apply hole row** adds one feature; **Apply and place
another** reopens Hole row with the same count and spacing.

A row is one hole feature with a row record (count, spacing, direction in part
coordinates), so the tree shows one entry, "hole ×4 · feature 2". Spacing and
count accept parameters (`=pitch`): changing the parameter moves every hole
after the first. In the tree editor the **Row of holes** block edits the same
values; _Holes in row_ 1 makes it a single hole again, and 2 or more on a single
hole makes a row from it. A hole that misses the part names itself ("Hole 4 of
4 removes no material"). **Move holes** shows a handle on every hole of the row;
dragging any of them moves the whole row, and one Undo restores it. Hardware
seated on any hole of a row stays in that hole when the spacing changes. On
drawings, a hole callout over the row reads "4 × Ø6.6 THRU", a hole chain across
it gives the spacing between each pair, and the detail sheet's hole note reads
"4 × Ø6.00 …; 4 holes, pitch 50.00". Files without rows are unchanged; a file
with a row opened by an older version cuts only the first hole.

The Row fields apply as you type: _Holes in row_ 6 moves the ghost and handles
to six holes without Enter, and in the tree editor the part rebuilds with each
spacing you type (one Undo per edit). _Holes in row_ 1 removes the row only on
Enter or click-away, so typing 1 on the way to 12 keeps it.

### Placing and moving holes by hand

For direct manipulation, select a part and choose **Place holes** above the
viewport or in Solid. Click any flat face to drill there; orbit to reach another
face. Set diameter, **Tapped hole** or **Screw clearance**, metric size and depth
before clicking. Each click adds one undoable feature. Hole snap is in part
millimetres; use **0** for free placement. Snap occurs within the face plane,
including rotated parts. Finish with **Done placing holes** or Escape.

Choose **Move holes** and drag an orange center to reposition an existing bore
on its plane. One Undo restores the entire drag; Escape cancels it. Select the
hole in the parts tree for exact coordinates. **Lock hole position** prevents
manual relocation; unlock it to drag again. Locked centers are gray. Holes with
later transforms, mirrors or patterns have no drag handles because the original
center no longer describes the final geometry. Cuts still affect every instance
of the part definition. A location outside the stock fails rebuilding and blocks
exports; Undo restores the previous location.

For constant edge offsets, choose **Cut placement → Part side → Locate by →
Fixed distance from edges (mm)**. The named minimum-coordinate edges are the
datum. These distances stay fixed as the stock grows; relative percentages grow
with the stock. A picked center instead stays at its explicit part coordinates.
Place holes picks flat faces only; for a round tube use **Solid → Hole** (a
click on its surface drills radially) or the **On tube / member** controls,
which resolve the true radial surface.

### Hardware and metric threads

**Hardware library** in Solid or Assemble adds bolts, nuts, spacers and 22
kinds of screw. The **Hardware type** list is grouped:

- **Bolts, nuts & spacers**: hex bolt, hex nut, washer, threaded standoff,
  self-clinching nut, standoff and stud (PEM style), rivet nut, threaded insert.
- **Machine screws**: pan head (ISO 7045 / ISO 14583), countersunk (ISO 7046 /
  ISO 14581 / DIN 965), raised countersunk or oval (ISO 7047 / DIN 966), cheese
  head (ISO 1207 / DIN 84), truss or mushroom head (JIS B 1111 / ASME
  B18.6.7M), hex flange (DIN 6921 / EN 1665).
- **Socket screws**: socket head cap (ISO 4762 / DIN 912), button head
  (ISO 7380-1), countersunk socket (ISO 10642 / DIN 7991), shoulder (ISO 7379,
  M5–M12), socket set or grub screw (ISO 4026–4029 / DIN 913–916).
- **Tapping & self-drilling**: pan head tapping (ISO 7049 / DIN 7981),
  countersunk tapping (ISO 7050 / DIN 7982), self-drilling (DIN 7504 /
  ISO 15480–15482, ST3.5–ST6.3).
- **Wood & construction**: wood screw (DIN 7997 / DIN 7995 / DIN 7996),
  chipboard screw (DIN 7505), drywall screw (DIN 18182-2), lag or coach screw
  (DIN 571).
- **Special**: knurled thumb screw (DIN 464 / DIN 653), wing screw (DIN 316),
  eye bolt (DIN 444), carriage bolt with square neck (DIN 603).

The **Metric size** list shows the sizes of the chosen kind: M2–M12 for bolts,
nuts and machine, socket and special screws; ST2.9–ST6.3 for tapping screws;
3.0–6.0 for wood and chipboard screws; 3.5, 3.9, 4.2 and 4.8 for drywall
screws; 5–12 for lag screws. A size that the new kind does not offer falls back
to the kind's default size (M6, ST4.2, 4.0, 3.5 or 8), and the last size used
in each list is remembered, so a bolt at M6 switched to a wood screw shows 4.0
and switched back shows M6 again.

**Head style** appears where one standard family offers several heads: cheese
or fillister; countersunk or raised countersunk tapping screws; hex washer,
pan or countersunk self-drilling screws; countersunk, raised countersunk or
round wood screws; countersunk, raised countersunk or pan chipboard screws;
high or low thumb screws; hex or hex washer lag screws. **Drive** appears when
the kind offers more than one: slotted, Phillips, Pozidriv, Torx, security
Torx (pin), hex socket, square (Robertson), spanner (two holes) or one-way.
Hex, flange, wing, thumb, eye and carriage heads are driven from outside and
have no drive. **Point** appears for set screws only: flat, cone, dog or cup.
Changing the head re-derives the head diameter, head height, dome height and
drive size from the standard; changing the drive re-derives the drive size;
changing the point re-derives the point diameter and dog length. The length,
material, supplier fields and notes are kept. The same selects appear when you
edit a hardware feature in the tree and while choosing holes in Place.

The default numbers come from the standards' size tables. Where a size lies
outside the standard's table (for example a button head screw at M2, a truss
head at M12 or an eye bolt at M4), a stated proportional rule fills it and the
cut-list note says "sizes outside <standard> estimated". Every number stays an
editable field, and the parameter expressions work in every field. These are
generic editable envelopes, not certified supplier models: threads, knurls,
drill flutes and clinching teeth are not modeled, and drive recesses are
schematic prisms (a Pozidriv is drawn like a Phillips; the cut-list note names
it). The rounded pan head rim and the concave bugle (drywall) flank are drawn
as four short cone segments on the same arc. Add supplier part number,
installation hole, minimum sheet thickness and installation notes; the
quantities CSV retains these details. The supplied size suggestions must be
replaced by the purchased product's dimensions when manufacturing fit matters.

Countersunk, raised countersunk and bugle heads are flush: the seating plane is
the top rim of the head and the cone runs below it, so seating one in a plain
hole puts the cone inside the plate. No countersink is cut in the hole, and the
hole has no countersink option. A set screw's socket end is on the seating
plane and its body runs below it. Not modeled as kinds: masonry or concrete
screws, decking screws, hanger bolts and dowel screws, Chicago screws (binding
posts), hammer-drive screws, MDF screws, structural or framing screws, SEMS
screws with a captive washer, thread-forming screws (Taptite), and security
screws (those are the security Torx, spanner and one-way drives on any screw).

With a hole selected, **Attach to selected hole** creates a concentric connection.
The hardware seating plane follows that hole, including subsequent hole moves
and assembly rotations. Bolts, studs and screws extend into the hole; spacer/nut bodies
extend outward. Set axial offset under **Connections / welds** to place hardware
on the other side of a plate or space stacked hardware. Installation holes are
not automatically cut or inferred from thread size. When the selected hole is a
hole row, **Attach to selected hole** does not commit at once: it opens Place
with every hole of that row already chosen, so you remove the ones you don't
want and press Enter.

Without a selected hole (or with **Attach to selected hole** cleared), **Add
hardware** opens Place, where you choose the holes the hardware goes in. Click
the centre of an existing hole to choose it (a blue ring marks it, and the
cursor readout says "chosen · click to remove"); click it again to remove it.
Shift+click on a hole of a hole row chooses the whole row, or removes it when
every hole of the row is already chosen. The **Chosen holes** list in the panel
names each one ("Hole 2 of 4 · Board", "Hole · Board · Ø 6.6", with "has Hex
nut M6" when hardware already sits in it) and has a **Remove** button for each.
Press Enter, click **Seat in N holes**, or double-click the last hole to seat
the hardware: Apply then adds **one** part with one instance in each chosen
hole, each with its own concentric connection (so the cut list counts them and
editing the part's sizes changes every one). After seating, **Remove** in the
list takes a hole out again, **Re-place** chooses the holes from scratch, and
**Axial offset (mm)** sets the same offset on every connection. Esc removes the
last chosen hole, and cancels the command when none is chosen. With no hole
chosen, a click on a plain flat face seats a single one there (its seating
plane on the face, bolts, studs and screws pointing into it, also on an underside or a
turned part) and a click on empty ground stands it on the ground; the square
slides that single one on the face, and **Apply** adds it as an ordinary part,
which **Move part** can still move. The sizes are the panel fields in both
cases.

To delete one bolt, select it and use **Remove instance**. A part's only
feature cannot be removed or suppressed on its own: the button becomes
**Remove part** and removes the definition with every instance of it.

Tapped-hole presets create cutting-tap pilot bores and preserve the metric thread
designation in drawing callouts and CSV notes. M3 × 0.5 starts with a 2.5 mm
pilot bore. Diameter remains editable for the actual process. These are not
forming-tap drills, modeled helical threads or a specified usable thread depth.
The specified depth is the drill depth; usable thread depth remains unspecified.
Clearance presets use an editable allowance rather than asserting a fit standard.

References: [Guhring metric tap-drill table](https://guhring.com/media/support/Tapping-Tap-Drill-Sizes-Metric.pdf)
and [PennEngineering self-clinching technology](https://www.pemnet.com/eu/products-overview/self-clinching-technology/).
Select the actual PEM supplier item for its sheet, material and installation requirements.

### Rear-cover reference and furniture

**Solid → Rear cover example** appends a study from the supplied company photo:
350 × 376 mm frame, 245 × 337 mm opening, 1.2 mm sheet, 16.2 mm return depth
and fourteen Ø6.6 mounting holes. Hole centers are assumptions. The opening is
centered because the photo's 20.70 offsets conflict with its overall/opening
heights; the 53.70 offset also needs confirmation. The drawing notes retain these
assumptions. The square return omits bend radii, corner radii and development.
Use it to practice placement, not as a verified reconstruction of the DWG.

The same workspace retains the table, chair and shelf examples, boards, members,
profiles and solid operations. Hardware and holes are ordinary editable features
within those assemblies; the workspace is not limited to sheet-metal covers.

On a tube or member, choose **Cut placement → On tube / member** (in the tree
editor, or under Exact placement while placing) to locate a cut by **Cut
side**, **Along member (%)** (or distance from the finished start) and
across-side offset. Pockets are a rectangular recess and do not require a
sketch. On round members the cutting direction is radial at the actual
cylindrical surface. Member references follow changes to length, section,
endpoints and weld gaps, before assembly placement.

**Specified depth from surface** makes a blind cut. **Through all** also cuts
the opposite tube wall. **View cut close up** looks at the cutting location;
use Fit to return to the assembly. A successful operation reports the removed
volume. A tool outside the stock, inside a hollow region or duplicating a cut
reports that it removes no material. Edit its location/depth or Undo; the last
valid solid stays visible and stale exports remain blocked.

To repair a hole saved with the old off-part defaults, select its feature and
set **Cut placement → On tube / member**. For an old pocket with no sketch,
choose **Pocket profile → Rectangle**. Then adjust side, position and depth.
These changes retain the part and feature identifiers.

**Cut placement → Part side** locates a cut on one of the part's six sides by
percentages or edge distances. Part-side positions use the two increasing
coordinate axes of that side. Exact part
coordinates and directions remain available. Existing sketch-based pockets
retain their original sketch plane and positive extrusion direction; choose
a closed sketch explicitly for custom outlines. Cuts edit the reusable part
definition, so every instance receives them. A pattern, mirror or part transform
between the referenced member and the cut invalidates that reference rather
than silently relocating the cut; switch to a part side or explicit coordinates
in that case.

## Geometry and units

Replicad/OpenCascade computes B-rep solids, including hollow rectangular tubes,
round tubes/pipes, rectangular/round bars and angles. Booleans, extrusions,
revolves, hollow sweeps, lofts, fillets, chamfers, shells, mirrors, patterns and
plane trims execute in the kernel. The Three.js viewer displays kernel meshes.
Drawing curves come from kernel hidden-line projection, with an adapter for
views whose hidden-edge set is empty.

Internal lengths and STEP/DXF units are millimetres. STL has no unit field;
import it as millimetres. Drawing sheets can display inches without changing
the nominal model. PDF pages and SVG physical sizes are specified explicitly.
DXF exports use polylines with a 0.02 mm sampled chord-error target, rather than
analytic DXF spline entities. STEP remains the solid interchange format.

Straight member end angles are measured from square about the member's local
Y axis. Weld gaps shorten the centerline at each end. Cutting lists distinguish
finished centerline, long-point and short-point measurements. Blank reservations
add the explicit allowance; stock allocation also reserves kerf. Later trims,
extrusions, Boolean changes or patterns require inspection of the part STEP.
Those modified members retain their source section for reference but have no
automatic finished cutting length and are excluded from linear stock allocation;
the original member length is never labelled as the changed part's final length.
Bent/swept tubing gets a solid and detail drawings, not a fictitious straight
stock length or bend-development calculation.

Flat profiles are deliberately limited to constant-thickness XY extrusions or
boxes, optionally with perpendicular through holes. Pockets, angled bores,
fillets and non-planar features are excluded from flat cutting files. Sheet
packing is conservative, preserves orientation/grain and does not rotate parts.
Material and quantity rows come from assembly instances, including hidden ones.

## Sketches, constraints and advanced fields

**Typing values.** Every field in the Properties panel (operation sizes, the
tree editor's feature fields, Position / Rotation, connections, sheets,
hardware, fabrication) applies its value as you type, about 150 ms after the
last keystroke: the preview, the ghost and the model follow. Enter, Tab or a
click elsewhere confirm; **Esc** puts back the value the field had before you
started typing; **↑** / **↓** step a plain number by 1 (Shift: 10). One edit
of a field is one Undo step, however many digits you typed. Text that cannot
be used yet (empty, `-`, `12.`, an `=expression` naming a missing parameter)
waits for Enter and then shows the usual error. The 2D drafting panel, the
Named parameters table and the sketcher's typed readout keep their own
type-then-Enter behaviour.

The sketch/profile controls provide rectangles, circles, closed polylines,
exact coordinate fields, grid/endpoint snapping, path lines, three-point arcs,
cubic splines, construction segments, segment removal and profile offsets.
Closed paths can be extruded; open paths can drive sweeps. Advanced profile
definitions support holes and explicit sketch-plane origins.

Optional PlaneGCS solving is separate from legacy freehand drafting. Point and
line IDs are stable. The constraint controls support coincidence, horizontal,
vertical, parallel, perpendicular, line/circle tangent, equal line length,
fixed points, distance, circle radius and line angle. More primitive types can
be supplied through the sketch's structured definition. Polygon pointIds
and circle circleId bind solved geometry to solid profiles. Conflicting
constraints identify their IDs and block current-model exports.

Some advanced operations use structured fields rather than interactive face
picking: custom semantic edge/face references, detailed sheet annotations and
section planes. This is not a full topology-selection editor. Loft section
ordering and boundary edge/face selection have dedicated controls.
Fillet/chamfer/shell references specify a plane, an offset and an expected
match count; changed or ambiguous matches fail explicitly.

Supported annotation types are linear, aligned, angular, diameter, radius,
hole, part-number and weld-note. Annotations carry part/feature or connection
IDs. They are regenerated as dimension/callout notes; they are not freely
draggable paper-space leaders. Aligned member dimensions use the finished
centerline; other aligned dimensions require two explicit feature bounds
anchors. Overall orthographic views include horizontal and vertical dimensions
derived from projection geometry.

Example detail view:

    { "name": "Detail A", "view": "front", "crop": [0, -50, 60, 50], "scale": 2 }

Example section, with an optional viewing depth:

    { "origin": [0, 0, 400], "normal": [0, 0, 1], "side": "negative", "depth": 200 }

Section sheets project the clipped solids and hatch their actual cut faces.
The interactive section control is a display clipping plane; it does not
change the manufacturing solid. Exploded sheets use explicit display offsets.

Connections support world-bound alignment, fixed target-relative placement,
parallel planar face offsets and cylindrical-axis concentric placement.
Fixed and concentric connections compose through nested target placements.
Circular or conflicting attachments fail explicitly. Weld sizes/processes are user notes;
the app does not infer or certify weld design.

## Measuring and marks

**Measure** (above the viewport, in the Assemble tab, or the D key; no
selection needed) measures between two points on the model and leaves the
result on screen as a dimension mark. Click the first point, then the
second. Points snap within 8 px to part corners (edge ends), the midpoints of
edges at least 24 px long on screen, and the ends and midpoints of existing
marks; otherwise to the nearest point of an edge, and otherwise to the
surface under the cursor. Corners hidden behind the surface under the cursor
are skipped; when two corners line up on screen the one nearest you wins. The
readout by the cursor shows the snap kind, then the straight distance and
ΔX/ΔY/ΔZ. The tool stays on for the next mark: Esc clears a first point,
Esc again (or **Done measuring**, or D) ends it. Orbit, pan and zoom still
work, and clicks never change the selection while measuring. Measure is not
available in Exploded view, during an operation preview or while sketching,
mating or placing holes; starting it turns off the gizmo, section and
isolation.

Each mark end is fixed to the part it was picked on, in that part's own
coordinates, so a mark follows its parts when they are moved or turned
(including during a gizmo drag) and disappears while a part is hidden.
Removing an instance removes its marks. The label shows the value in mm;
click it to select the mark. The **Marks** panel lists every mark: its
value, what it reads (**Aligned** straight distance, or the distance along
**X**, **Y** or **Z**), and where each end is. **Save as parameter** stores
the value (to 0.001 mm) as a named parameter (mark1, mark2, … by default; an
existing name is updated), so sizes and positions can be typed as =name.
**Copy** puts the value on the clipboard; **Delete**, or the Delete key with
a mark selected, removes it. **Show marks** hides or shows them all (not
saved). Marks are saved with the model; they never change the solids or the
drawings.

Marks are placement guides:

- **Move part**: while dragging, a box face (min or max) or the box centre
  snaps onto the X, Y or Z coordinate of a nearby mark point, wherever the
  mark is; the readout says "mark" or "mark centre" and the outline turns
  purple. A part does not snap to marks on itself. Alt or Snap 0 moves freely.
- **Sketches**: every mark point is projected square onto the sketch plane as
  a purple diamond and snaps like a sketch point ("mark"). A width measured
  on a front edge can be picked up on a top-face sketch.
- **Place holes**: clicking within 8 px of a mark point puts the hole exactly
  on that point, dropped square onto the clicked face, without hole-snap
  rounding.

## Persistence and recovery

Document v4 adds a model alongside existing entities, layers, materials and
joints. Workspace v2 persists the selected model workspace. Older documents
migrate without inventing solids or restoring legacy drafting constraints.
Unknown future versions are rejected. Save/open, recovery snapshots and
undo/redo carry the complete model definition; meshes are rebuilt on load.

Modeling and solving use dedicated revision-tagged workers. A new edit
terminates superseded work. Timeouts, cancellation and worker errors allow a
fresh worker to be started. The last successful display remains visible after
an invalid edit, while current-model exports are blocked. A model changed
during export cannot download an outdated workshop package.

CAD dependencies are pinned, bundled locally and included in offline caching.
Licenses and source/build links are in public/cad-notices/NOTICE.txt.

## Verification

- Run npm test -- src/features/sketchstudio src/pages/SketchStudio.test.jsx.
- Run npm run build.
- Run node scripts/verify-sketch-cad.mjs against the dev server on port 5180.
- Run node scripts/verify-sketch-cad-editing.mjs for axis dragging, snapping,
  Escape cancellation, undo/redo, reopen, drafting-to-solid import, holes and
  pockets, and configure/preview/apply/cancel checks for the solid operations.
- Run node scripts/verify-hole-hardware.mjs for surface picking, hole dragging,
  snapping, M3 pilot bores, Undo/Redo, Escape, position locking, hardware
  attachment and recovery.
- Run node scripts/verify-engineering-drawings.mjs for the pump bracket,
  dimension chains, PDF/SVG/DXF downloads, title-block edits, parameter changes,
  Undo, recovery and appending another example without losing existing sheets.
- Run node scripts/verify-measure-marks.mjs (CAD_VERIFY_URL=http://localhost:5180/sketch)
  for Measure, mark labels, saving a mark as a parameter and mark box-snap.
- Run node scripts/verify-direct-placement.mjs (CAD_VERIFY_URL=http://localhost:5180/sketch)
  for direct placement: Extrude on a face corner, the distance arrow with a
  typed value and the cut inference, a Sweep path with a bend and the radius
  grip, the Subtract tool gizmo, Edit with preview, the Sketch-on-face arrow,
  ground placement in an empty model, a part turned 37°, Fillet, Trim and
  Mirror face picks, the perspective camera, Revolve's axis and Loft sections.
- Run node scripts/verify-cut-placement.mjs (CAD_VERIFY_URL=http://localhost:5180/sketch)
  for Hole on a board corner (vertex snap) with the depth arrow dragged blind
  and back to Through all, Edit hole with preview, Pocket's corner grip and a
  typed depth, Add hardware seated on the board top, and the Transform gizmo.
- Run node scripts/verify-hole-row.mjs (CAD_VERIFY_URL=http://localhost:5180/sketch)
  for Hole row: corner and grid snaps for the first hole, the rubber row and
  ↑ ↓ count, the second click 150 mm along +X, the end square with a typed
  spacing, Apply (camera held), Move holes moving the whole row, and the
  detail sheet's "4 ×" note in the workshop ZIP, then the live fields: _Holes
  in row_ 6 typed without Enter in Shape, and _Spacing (mm)_ 60 typed without
  Enter in the tree editor, undone in one step.
- Run node scripts/verify-sketch-cad-offline.mjs against the production preview
  on port 5181, after a build. It uses a hidden Electron window and a separate
  test profile; it does not touch the user's desktop profile.

Scripts use the installed Chrome browser through Playwright. Screenshots,
downloaded ZIPs and check reports go to ignored artifacts/sketch-cad/.
The kernel tests execute real WASM; reliability tests cover conflicts,
references, migrations, history, worker supersession, timeouts, units,
nominal/allowance separation and drawing/model agreement.

Sheet-metal unfolding, bend development, machine-specific G-code, motion
simulation and production weld validation
are not included.
