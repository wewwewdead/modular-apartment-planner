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
member**, **Angle bar**, **Design parameters**, the examples and **Import 2D
profiles**.

**Angle bar.** **Angle bar** (Solid tab, right after Tube / member, or the
Start list) adds a steel member with a hot-rolled angle section: L 50×50×5
with a 7 mm root radius and 3.5 mm toe radii (EN 10056-1), 700 mm long. In
its member feature the section fields read **Leg A (width)** (along the
member's local X), **Leg B (height)** (local Y), **Thickness**, **Root
radius** (the fillet between the legs) and **Toe radius** (the inner corner
of each leg tip); radii of 0 give a sharp-cornered L. **Standard size** sets
all five from the equal-angle list (L 20×20×3 … L 100×100×10) and reads
Custom when the values match none (or any is an expression). Any other size
is a custom angle: type Leg A, Leg B (they need not be equal) and Thickness.
While the radii are still the automatic ones (a standard size, a new Angle
bar, or radii you never typed), they follow the size: the standard size's
radii on an exact match, else those of the standard size with the nearest
thickness, scaled down to fit (toe radius at most half the thickness, root +
toe at most half of the shorter leg less the thickness, to 0.1 mm), so a
custom size like L 63×50×3 or a 10 mm leg never fails on the radii. They
depend only on the current legs and thickness, so typing 60 through 6 ends
with the radii of 60. Once you type a radius yourself (or give one as an
expression) it stays, and a size it does not fit shows the radius error.
Switching a member's Type to Angle takes the same automatic radii. The heel
(outside corner) sits at local (−w/2, −h/2): the member's axis runs through
the centre of the section's bounding box, as for every member. The cutting
list names member sections (SHS 40×40×2, CHS Ø48.3×3, Flat 40×10, Round Ø20,
L 50×50×5, a custom L 75×40×4); the CSV is unchanged.

**Member properties.** A member's feature (Tube / member, Angle bar, every
section type) shows its size first. **Length (mm)** is the distance from
start to end; typing a length keeps the start and moves the end along the
member's axis (straight up, +Z, when start and end coincide); it must be more
than 0, and gaps and mitres trim from it. While either end point holds an
expression the Length is read-only: edit the end points instead. Below it
the **Stock section (mm)** fields, then two folded groups: **End points (part
mm)** (the raw Start and End X/Y/Z) and **Ends & gaps** (Gap at start / end
in mm, Mitre at start / end in degrees).

**Where a new Board or Tube lands.** **Board / plate**, **Tube / member** and
**Angle bar** (Solid tab or the Start list) put the new part on the ground
(Z = 0) at the centre of your current view, snapped to the Move part grid (1 mm when moving
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
5. Generate linked drawing views. New sheets fit the page; set a fixed scale,
   page size, units, revision and annotations in Sheet properties. A scale of
   0.05 is 1:20. An oversized fixed scale is flagged in the preview and
   refused by exports instead of silently changing a stated scale.
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

For your own model, select what to draw and choose **New engineering sheet**,
or **Drawing sheet** in the part's Properties or the group / multi-selection
panel (which also opens the Drawings tab). The 3D selection is the subject: one
part draws that part, a group draws its member instances under the group's
name, several parts draw those instances ("3 parts"), and nothing selected
draws the whole assembly under the document name. The new sheet fits the page
and its views are generated straight away. A subject that already has a plain
sheet (not a section or exploded sheet) opens that sheet instead of adding a
duplicate.

**Drawing one part.** On the Drawings tab every part and group row in the parts
tree has a draw icon (**Draw <name>**): it opens that part's or group's sheet,
or creates one fitted to the page, without changing the 3D selection. The
**Sheets** panel's **New drawing of** row does the same by name — Whole
assembly, the 3D selection, any part or any group — and reads **Open sheet**
when the subject already has one, with **Create another** to add a second.

**Managing sheets.** **Sheets** (first on the Drawings tab, also **Manage
sheets** beside the drawing pane's sheet selector, and shown when the Drawings
tab opens with nothing else in Properties) lists every sheet with its subject
("Part · Profile part 1", "Group · Frame", "3 parts", "Whole assembly", plus
" · section" / " · exploded") and its page and scale ("A3 · 1:50" once
generated, else "A3 · Fit"). Click a title to open it; double-click or F2
renames it (Enter keeps, Escape cancels, an empty name is refused). Each row
has Duplicate (inserted after it as "… (copy)") and Delete; tick rows for
**Delete selected**. A model keeps at least one sheet, so Delete is disabled on
the last one and Delete selected when every row is ticked. Deleting is one
Undo step, with a "Deleted N sheets — Undo" line until the next change; if the
open sheet goes, the next row (else the previous one) opens. The sheet selector
reads "title — subject" so sheets with the same title can be told apart.
**Add missing part sheets** adds a fitted sheet only for parts without a plain
sheet, so pressing it again adds nothing ("Every part already has a sheet").
**Sheet properties** now provides ordinary form controls for the drawing
subject, A4/A3/A2/A1/A0/Letter paper (all landscape), scale, units, view labels
and scales, revision, drawing number, material/finish, tolerance,
drawn-by/date and drawing notes. **Drawing subject** offers Whole assembly,
One part, or **Chosen parts**: a checklist of instances indented under their
group names, with **Use 3D selection (N)** to take the parts selected in the
3D view. At least one part stays chosen. Changing the subject clears that
sheet's annotations (Undo restores them) and asks for **Update drawing
preview**.
Engineering sheets have a bordered title block and up to four explicitly
labeled views. The layout places top/isometric above front/right; it does not
assert a first-angle or third-angle projection standard. Overall dimensions
have extension lines and arrowheads.

**Paper scale.** **Fit to page** (the default for new sheets and the automatic
part detail sheets) draws at the largest ISO 5455 standard scale — 50:1 … 2:1,
1:1, 1:2, 1:5, 1:10, 1:20, 1:50 … 1:10 000 — at which every view without its
own scale fits its cell, and prints that real ratio ("1:50") in the title
block. The **scale slider** (in the drawing pane beside the sheet selector and
in Sheet properties) snaps to those stops; dragging previews live and saves
one Undo step when released, as a fixed scale. Once views are generated, the
track turns red where they stop fitting and a **fits** tick marks the largest
stop that fits. **Custom** accepts `50`, `1:50` or `2:1`. **Screen zoom** only
zooms the preview; it never changes the printed scale. Scale changes need no
new Generate views. A per-view scale is always fixed.

Paper scale is preserved. A fixed scale that does not fit still shows the
sheet: the overflowing view's cell is outlined red and a banner offers **Fit to
page (1:50)**, **Use 1:50** or **Use A1 at 1:20** (each one Undo step; the page
button only when a page fits). Exports (SVG, DXF, PDF, workshop ZIP)
never change a stated scale: an overflowing fixed scale is refused with what to
do, for example "front does not fit on A3 at 1:20. Use Fit to page, choose 1:50
or smaller, or use A1." Files saved before fit-to-page keep their fixed scales.

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

Previews are generated one sheet at a time: opening a sheet with no views yet,
or whose subject or view list changed, generates it by itself; after a model
change choose **Generate views**, **Refresh drawings** or **Update drawing
preview** (all regenerate the open sheet only). A sheet the kernel cannot draw,
such as a section that no longer crosses the model, shows its own error while
the other sheets keep their previews.
Use **SVG sheet** or **DXF sheet** for the selected sheet. All exports use the
same rendered drawing. DXF carries linework and text, not native associative
CAD DIMENSION entities. Save/open, recovery and Undo/Redo retain the sheet
settings and linked references.

**Exporting PDFs.** The drawing pane's **PDF** button (beside **Manage
sheets**) saves the open sheet. The Sheets panel's **Export PDF** section, at
the top of the panel (the ribbon's **Export PDF…** opens it), chooses **This
sheet**, **Selected (N)** (the ticked rows; the bulk bar's **Export selected as
PDF** does the same) or **All sheets (N)**, which can add **Include automatic
part detail sheets** (a fitted detail sheet for each part with no sheet of its
own). Each choice is one PDF of true-size landscape pages, each at its sheet's
paper size (A4 … A0, Letter): print at **actual size** (not "fit to page") and
A3 at 1:20 measures 1:20. Pages are numbered within the file ("2 of 3"). The
Save dialog opens straight away with a suggested name ("Model - Frame.pdf", or
"Model - drawings.pdf" for several sheets); where the browser has no Save
dialog the PDF downloads under that name (the desktop app shows its own save
dialog for it). Only the chosen sheets' views are generated, and views already
current are reused; no STEP or STL is built.

Before anything is written every sheet is checked as it will print. If any
cannot be exported (a fixed scale that does not fit, a section that no longer
crosses the model, notes too long for the title block, a broken reference),
the panel lists them, "2 of 7 sheets can't be exported", each with what is
wrong, **Fit to page** where fitting fixes it (one Undo step; the check then
runs again and the file is written if all is now well) and **Open sheet**.
**Export the other N sheets** writes the rest, renumbered; **Cancel** writes
nothing. Progress reads "Rendering sheet 3 of 12 — Frame" with **Cancel**,
which also writes nothing. The result line reads "Saved Frame.pdf (3 pages)".

The PDF's text uses the standard Helvetica font, which can show only the
Windows-1252 (WinAnsi) characters: English and Western European letters and
symbols such as Ø × ± ° — – · …, all of which print correctly. Other
characters in titles, notes or other text (for example 日本, ≤ or ✓) cannot be
shown: the check lists them as a warning ("‘Frame’: these characters can't be
shown in the PDF: 日本 (they print as ?)") without stopping the export, and the
result line repeats it. They print as "?", except a few with close stand-ins
(≤ as <=, ≥ as >=, the minus sign as -, ⌀ as Ø). The PDF's title and keywords
(document properties) keep every character.

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

**Hardware library** in Solid or Assemble adds bolts, nuts, spacers, 22 kinds
of screw and 15 kinds of rivet. The **Hardware type** list is grouped:

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
- **Blind rivets**: open end or pop rivet (ISO 15977–15984 / DIN 7337), closed
  end or sealed (ISO 15973–15976 / ISO 16585), multi-grip (ISO 15977 type,
  manufacturer lengths), peel type (manufacturer), structural with a locked
  mandrel (Monobolt / Magna-Lok / Hemlok type, manufacturer), hammer drive or
  pin rivet (manufacturer).
- **Solid, tubular & special rivets**: solid rivet (DIN 660 / 661 / 662 / 674,
  ISO 1051; 10–16 mm from DIN 124 / 302), semi-tubular (DIN 7338), tubular
  (DIN 7340), split or bifurcated (manufacturer gauge tables), self-piercing
  or SPR (Henrob / Böllhoff type), lockbolt with a swaged collar (Huck C6L /
  Magna-Grip type), plastic push rivet or panel clip.
- **Blind rivet nuts & studs**: blind rivet nut or rivnut, blind rivet stud
  (PEM / Böllhoff type tables).

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

**Rivets.** Rivet sizes are body diameters: 2.4–6.4 for blind rivets (3.2,
4.0, 4.8 and 6.4 for the closed-end, multi-grip, peel and drive kinds; 4.8,
6.4, 9.5 and 12.7 for structural ones), 1–16 for solid rivets (2–5 for split
rivets), 2–10 for tubular and 3–10 for semi-tubular rivets, 3.3 and 5.3 for
self-piercing rivets, 4.8–12.7 for lockbolts and 5–10 (the panel hole) for push
rivets; rivet nuts take M3–M12 and rivet studs M4–M8 with their metric pitch.
Rivet kinds have no Drive or Point. Their **Head style** choices are dome
(protruding), countersunk 120° and large flange for blind rivets; round,
countersunk 90°, raised countersunk (oval), pan (flat round), universal
(MS20470) and countersunk 100° (MS20426) for solid rivets; flat or truss for
semi-tubular, flat or round for tubular, round or countersunk for split,
countersunk or flat for self-piercing rivets; flat, reduced (semi-flush) or
countersunk flanges for rivet nuts (flat or reduced for studs); dome or
countersunk 100° for lockbolts. Kinds without a published table
(multi-grip, peel, structural, drive, tubular, split, self-piercing, rivet
nut and stud, lockbolt, push rivet) use manufacturer-typical proportions,
and their cut-list note says "proportional defaults, no standard table".
A pop rivet, multi-grip, peel, drive and closed-end rivet default to
aluminium, a tubular rivet to brass, a push rivet to nylon and the others to
steel; switching the type takes the new kind's material unless you chose a
different one.

Every rivet has a **State** select. **Installed (set)**, the default, draws the
head on the sheet, the body across the grip and a schematic blind-side upset
below it: a barrel bulb for open-end, structural and closed-end rivets (the
closed one ends in a domed cup), two lobes for a multi-grip rivet, four petals
folded flat for a peel rivet, a flared tail for drive and self-piercing rivets,
a shop head for a solid rivet, a rolled lip for tubular rivets, two legs bent
flat for a split rivet, a bulge for rivet nuts and studs, a swaged collar for a
lockbolt and spread legs for a push rivet. A set blind rivet shows the recess
the broken mandrel leaves in its head (the structural rivet's locked pin sits
higher). **As supplied (unset)** draws the plain body with its mandrel or pin:
the mandrel standing above the head (the **Mandrel protrusion** field) and its
head under the body end, the drive or push pin raised, the split rivet's slot
open, a lockbolt's pin without its collar (its note says "collar not shown as
supplied"). The mandrel protrusion field shows only as supplied, the upset
height field only when set.

The **Grip / clamped thickness (mm)** field is the sheet stack the rivet
clamps, measured down from the seating plane; the upset starts there. A grip
must be shorter than the rivet, a countersunk head no deeper than the grip, and
for a blind or solid rivet the upset must fit in the tail left below the grip
(the panel says which rule an entry breaks). The library does not pick a body
length for a grip: grip ranges differ per manufacturer. For reference, ISO
15977 gives these grip ranges by body length: Ø3.2 — 6: 1–3, 8: 3–5,
10: 5–6.5, 12: 6.5–8.5, 16: 8.5–12.5, 20: 12.5–16.5, 25: 16.5–21; Ø4.0 and
Ø4.8 — 6: 1.5–2.5, 8: 2.5–4, 10: 4–6, 12: 6–8, 16: 8–12, 20: 12–15, 25: 15–20,
30: 20–25; Ø6.4 — 12: 3–6, 16: 6–10, 20: 10–14, 25: 14–18, 30: 18–23. The
default length and grip of each size are a mid-range pair from that table.

Blind rivet nuts and studs also have a **Body** select: a round body or a
hexagon body (the body field then reads across flats, and the hexagon runs
over the grip when set and over the whole body as supplied). Two rivet nuts are
in the list on purpose: **Rivet nut** in Bolts, nuts & spacers is the Phase J
PEM-style flanged bush that stands up out of the seating plane, unchanged;
**Blind rivet nut (rivnut)** is the blind-side insert with its body through the
sheet and a bulge below it. Not modeled as kinds: grooved rivets (a plain blind
rivet stands in), explosive and friction-lock aerospace rivets, Cherry-type
bulbed aerospace rivets (use the structural blind rivet), pull-through or
T-rivets, collar variants beyond the one flange, rivet washers and backing
plates, hollow-wall anchors, and hot-driven structural rivets above the 16 mm
size. Sheet deformation, mandrel grooves, knurled tubular heads, petal curl
and the far-side countersink are not drawn.

Countersunk (90°, and the 100° and 120° rivet heads), raised countersunk and
bugle heads are flush: the seating plane is
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
and assembly rotations. Bolts, studs, screws and rivets extend into the hole; spacer/nut bodies
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
plane on the face, bolts, studs, screws and rivets pointing into it, also on an underside or a
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
cylindrical surface. On an angle the sides are the faces of its legs:
**Front — outside of leg A**, **Rear — inside of leg A**, **Left — outside of
leg B**, **Right — inside of leg B** (the inside faces are one thickness in
from the heel); an offset that puts the centre off the leg is refused ("Cut
offset must land on the angle leg."). Member references follow changes to
length, section, endpoints and weld gaps, before assembly placement.

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

### Dimensions on a sketch (SD-1)

Inside the sketcher, **Dimension** (the last sketch tool, or D) measures the
drawing and can leave the result on it (docs/sketch-studio-sketch-dimensions.md).
Click two points, or one line, rectangle side, circle or arc, then click where
the dimension goes. A second click on the body of a straight edge (a line, a
rectangle side, a model edge in the plane) reads square to that edge: the
hole-to-edge distance. Placing the line beside the span gives a horizontal
dimension, beside its height a vertical one, anywhere else an aligned one (the
drawing sheets' rule); a circle gives Ø, an arc R. The box by the cursor reads
the value before the last click, so Esc there only measures; Esc steps back one
click at a time. Click a dimension's line or label (no tool on) to select it;
Delete removes it. Deleting an entity removes the dimensions that hung on it.

Dimensions are reference only: they are kept with the sketch
(`sketch.dimensions`, absent when there are none), come back on Edit sketch,
follow a split shop outline to the sketch they belong to, and never change the
profile, the part, the drawings or the shop. They show only while the sketch is
open.

## Sheet metal (Shop tab)

The **Shop** tab, between Assemble and Drawings, makes parts the way a sheet
metal shop does (docs/sketch-studio-fab-shop.md): the flat blank is the part,
and bends fold it. Nothing is ever unfolded from a 3D shape; if the blank was
cut the wrong size, the flange comes out the wrong length, as on the machine.

**Cut from sheet** opens its panel. The blank outline is a rectangle W × H,
a closed sketch of the model (an XY sketch at the origin is used as it is;
a sketch on another plane is copied flat), or the closed profiles of the 2D
drawing: an outline strictly inside another becomes its cut-out, an outline
inside a cut-out is not cut and is reported. Choose the sheet stock (SPCC
cold-rolled steel, SECC galvanised steel, SUS304 stainless, A5052 or A6061
aluminium) and a standard thickness, or Custom for any other. The panel
reads the blank size, the laser cut length (outline plus every cut-out) and
the pierces (one per loop). **Cut from sheet** places the new part with its
blank centred on the ground under the view centre and opens its feature;
the part's material is the stock's name.

The sheet-metal feature (feature 1 of the part) holds the stock, the
thickness (a number or =expression) and the K-factor (automatic from the
inside radius over the thickness and the stock's hardness, or typed), and the
bends in the order they are made. Each bend row has its angle (0 is flat, 90
a right angle; the bend angle, not the included angle), **Up** (the flange
rises toward the blank's top face) or **Down**, and the inside radius: from
the tooling (the default die for the thickness, V ≥ 6 t up to 2.5 mm, and the
88° punch: r = max(punch tip, stock fraction × V), never below 0.63 t), or
typed. Engraved under it: the bend allowance (the flat width that becomes the
arc), the bend deduction and both outside leg lengths (to the mould line of
the next parallel bend when the leg ends at one). **Move up**, **Move down**
and **Remove** reorder or drop a bend; the order never changes the shape.

**Add bend** (Shop → Add bend focuses it) runs a punch line parallel to the
blank's **Left**, **Right**, **Front** or **Rear** edge at distance D, or
through two points. The **Flange, outside** field and D drive each other
(D = flange − outside setback + allowance / 2). The new bend is folded with
the others before it is offered: a line that misses the blank, crosses
another bend's zone, does not separate the sheet (material beside the punch
line still connected: run it edge to edge or cut a relief), closes a loop
with other bends, or leaves no material beyond its zone is refused with the
reason, and so is an angle or value typed into a bend row that the fold
cannot make. Warnings stay readable without refusing: a cut-out within
2.5 t + r of the bend line (it will distort), a leg shorter than the die needs
to sit on both shoulders, a radius below the stock's minimum, a sharp bend,
and an outline that crosses the bend zone at an angle. Holes, pockets and
cuts added after the sheet-metal feature machine the folded part.

**Unfold** (in the view toolbar while a sheet-metal part with bends is
selected, or Shop → Unfold) animates every bend to flat in about 0.6 s and
shows each bend line with its label, for example "UP 90° R1.6"; **Fold** folds
it back. It is a view only: it is not saved, the move gizmo is off while it
shows, and another selection or any tool folds it back at once. A bare
sheet-metal part is drawn in its stock's colour.

The cutting list gives a sheet-metal part's blank size, thickness, stock,
bend count, cut length and pierces; the CSV gains those columns at the end
(a list without sheet metal keeps the columns it had). The workshop ZIP
writes the flat blank to cutting/ as its DXF, with the bend lines on a BEND
layer, and as an SVG with dashed bend lines. **Example: pump bracket** builds
the pump bracket channel (166 long, 52.5 outside, 8 mm flanges, A5052
t 1.5) from a flat blank with its openings and mounting holes and two 90°
bends; its 8 mm flanges read short for the default V10 die.

Welds, paint finishes and prints are kept with the model (they never cause a
solid rebuild: changing only them keeps the built solids); a finish already
colours its part. Their stations are described under "Weld, paint and print"
below.

### The press brake

Shop → **Press brake** puts the selected sheet-metal part on a generic press
brake, named by its capacity (50 t × 2 m, 80 t × 2.5 m or 100 t × 3 m; the
choice is saved with the model). Every other part hides and the sheet lies
on the die. The camera is the operator's: standing in front of the machine,
looking toward the backgauge and down about 25°, a little round toward the
bed's right end so the end of the punch (its profile) and of the die (its V)
show beside the part. It frames the part and the tooling round it, not the
whole bed, and comes back to that view after each hit; while the station is
open **Fit** returns to it and the standard views (Top, Front…) frame the
station from their side. Orbit, pan and zoom stay free, and leaving the brake
puts your own camera back. The die is drawn as long as the part plus 40 mm
each end (a sectional die, so its end face shows; the collision check still
uses a die along the whole bed, which only the part can touch). The punch line
of the pending hit is marked orange on the sheet. A part
that is already welded, painted or printed is refused (shop order is cut →
bend → weld → paint → print); one button removes those records and opens the
brake.

Set up each hit the way an operator does:

1. On the **Flat blank** card over the view, click a straight outline edge:
   that edge goes against the backgauge fingers. Or choose **Two points** and
   click the two ends of the punch line (corners and edge midpoints snap), or
   type them.
2. Set **Backgauge L** (the distance from the punch line to the gauge edge;
   type it, or drag the green punch line on the card), the **Bend angle**,
   **Flip sheet** for a bend that goes down (the machine always bends up, so
   the sheet is turned over), the **Punch** and the **Die** (Automatic picks the
   die for the thickness; the panel says when the thickness is beyond the
   catalogue).
3. Press **Bend**, Enter or Space (the pedal). The ram comes down, both wings
   rise about the punch line, the ram goes back (about 1.2 s at the machine's
   speeds), and the bend is saved as one ordinary edit (Undo takes it back).
   The station stays open for the next hit.

The **Side view** card (top left, over the flat blank) is the controller's
section of the hit, seen from the bed's right end with the backgauge to the
right: the punch, the die, the bottom of the ram and the backgauge finger at
L from the catalogue sections at true proportion, and the sheet's cross-section
through the bend with its true thickness and inside radius, resting on the die
shoulders. The rest of the part (the flanges earlier hits made) is cut at the
same plane — through the middle of the bend, or where a collision is. A wing
too long for the card is cut with a break mark, so the tooling keeps its size;
a finger beyond the card is pointed to at its edge. It moves with the stroke,
frame by frame, reading out the angle (of the target), the punch tip's height
above the die top and what the ram is doing; at rest it shows the angle made,
and a collision turns the tool that is hit red and names it with the angle.

The panel's engraved readouts show the inside radius, bend allowance and
deduction, both outside legs, the backgauge reading (or "no straight gauge"
when the gauge edge is on a face another bend separates from the punch
line), the ram depth, the springback and the angle the machine overbends to,
and the force against the press and the tooling as a bar. It also shows the
folded size of the part so far.

A hit the machine cannot make is refused, with the remedy: more force than
the press gives (a wider die or a bigger press), a bend longer than the bed,
a flange shorter than the die needs to rest on both shoulders (a smaller die,
named, or a larger blank), an angle beyond the die (180° − its V angle: use
the acute 30° tooling; when not even the smallest die carries the flange, the
message says how far from the punch line the blank must reach and which die
to use), a punch blunter than its die, more force than the
tooling is rated for, and a backgauge reading outside its 5–600 mm reach.
Before the pedal the stroke is also checked for collisions — the approach,
the bend in small steps and the return — against the punch (set up to the
bend's length, as a shop does for a box), the ram, the die, the bed and the
part itself. A collision is drawn red, with the part posed at the angle it
happens, and the pedal is refused with advice: bend earlier, turn the sheet
around or flip it, or use the gooseneck punch.

**Sequence** lists the hits made, in order, each checked as it would be made
then. **Before** and **After** show the part around one hit, **Re-run** plays
it again (view only), **Earlier** and **Later** reorder (refused when the new
order makes a step fail that did not before), **Remove** drops it. Esc clears
the pick (or a Before/After view); Esc again, or **Leave press brake**, leaves.
The backgauge reading is never stored: a bend keeps only its line, angle,
direction, radius and the punch and die that made it.

The status bar names the press and says whether the exact solid is current:
after a hit the part's solid rebuilds behind the station ("Rebuilding
solids…") until it reads "Model current". Choosing another press brake is
saved with the model without rebuilding anything.

### Weld, paint and print

After the brake come the finishing stations, in shop order: **Weld**, **Paint**
and **Print** (Shop tab). Each one takes over the view's clicks while it is
open (the parts tree, the move gizmo and the other tools wait), and none of
them rebuilds a solid: welds, paint and prints are records on the parts,
saved with the model, drawn in every view and listed in the cutting list.
Esc steps back one pick and then leaves; so does each station's Leave button.

**Weld.** Click an edge of a part (it lights orange as you point at it), then
the edge or face it touches: on another part, or on the same folded part to
close a box corner. The panel shows the seam the two picks make — its length,
the gap between them against what the process can bridge (TIG max(0.2,
0.1 t), MIG min(0.5 t, 1) on the thinner sheet), the sheet, the joint — and
the weld: **Fillet**, **Butt**, **Tack** or **Spot**, TIG or MIG, the size
(the fillet leg starts at the thinner sheet's thickness) and for tacks and
spots the pitch. Fillet and butt seams read their weld time (length / travel
speed / duty cycle); tacks their count; spots their count, the nugget
(5 √t) and the inset of two nuggets from the sheet edge and the seam ends, with
a pitch below 10 t refused. A gap too wide is refused with the remedy (close
it, or MIG when that bridges it). **Weld** saves the seam, its ends kept on
each part so it follows them, and puts the parts in one group, a
_Weldment_, so they select and move as one; welding a third part to it keeps
one weldment. Removing a weld (in the panel's list) keeps the group; Ungroup
in the Assemble tab splits it. A part that is already painted or printed is
refused (shop order: weld before paint), with one button that strips its
paint and prints. A welded part also cannot go back on the press brake.

The bead is drawn on the parts: a fillet as a rippled triangular bead in the
corner between the two faces, a butt seam (or a seam with no corner) as a
round bead, tacks as short beads at the pitch, spots as flat discs on the top
sheet. It hides with its parts, in the unfold view and on the press brake,
and takes the paint when the weldment is painted.

**Paint.** Click the part to paint (or open the booth with a part or group
selected); a part that is welded to others offers **Paint the whole
weldment**. Choose a RAL colour from the swatches (the hex values are screen
approximations of the printed RAL cards) or a custom colour and its name,
powder or wet paint, the gloss and the film thickness. The engraved readouts
give the painted area (every face of the part's solid), the powder to spray
(coverage = 1000 / (1.5 × µm) × 0.6 m²/kg) and the cure (200 °C part
temperature for 10 min); a film outside 50 – 125 µm and open holes under
1 mm (likely to fill) are noted. **Paint** writes one finish per part;
**Strip paint** removes it. Printing comes after paint, so painting or
stripping a part with prints asks first, in the panel, and removes them.
The selected part still shows blue; the booth outlines what it paints instead,
so the colour shows.

**Print.** Set the artwork — text (font, height, ink) or an uploaded image,
which is fitted to at most 1024 px and 512 KB and kept in the model — its
width, rotation and method (silk-screen, UV flatbed or pad print), then click
a flat face to place it there. Silk-screen and UV flatbed refuse a curved
face; pad printing takes one. The print is then the one being edited: drag it
on its face, change its fields, or click another face to move it there; **New
print** starts the next one. The panel warns when the artwork overhangs its
face, comes within 6.35 mm of the face edge, reaches over a bend zone of a
sheet-metal part, or is silk-screen text under 9 pt, and notes a print on a
bare (unpainted) part as a bare-metal marking.

The cutting list and the CSV (and the workshop ZIP's CSV) list the welds
(seam length, weld time or count), finishes (area, powder) and prints after
the parts, only when the model has any. STEP and STL carry none of them.

### Laser, job sheet and the finished product

The last steps of the shop (docs/sketch-studio-fab-shop.md §9 SM-4) are
described for the shop floor in **docs/sheet-metal-shop-guide.md**: draw →
cut → bend → weld → paint → print → job sheet, what each readout means, and
the limits. In short:

The Shop tab runs in process order: Cut from sheet, **Laser**, Add bend,
Press brake, Unfold, Weld, Paint, Print, **Job sheet**, then Example: pump
bracket and **Example: control box**.

**Laser** (with a sheet-metal part selected) covers the view with the laser
bed: the chosen stock sheet (1219 × 2438, 1250 × 2500 or 1500 × 3000 mm,
saved with the model) at true scale with the blank nested on it in the
sketch's own X and Y, and the quantity's copies in rows, 3 mm apart and 10 mm
clear of the sheet edge. The panel reads the cut length, the pierces and their
time, the 2 kW fiber's cutting speed for the stock and thickness, the kerf,
the cut time per blank and for the quantity, the sheet use and the narrowest
web; a cut-out under t is flagged, under 0.5 t refused, a web under 0.5 t
flagged and a blank larger than the sheet refused, each with its remedy.
**Cut** runs the head along the path — a pierce, then the contour, every
cut-out first and the outline last — with the machine's clock; the animation
lasts 6 – 15 s and the panel says by how much it is slowed or sped up. Stop or
Esc stops it; Esc again or Leave laser leaves. **Etch bend lines** writes the
bends' punch lines as etched marks on the blank (shown on the bed, on the
press brake's flat-blank card and in the flat DXF on layer ETCH; the folded
part does not change). A cut changes nothing in the model.

**Job sheet** lists each product (a top-level group or a lone part) with its
route Cut → Bend → Weld → Paint → Print, a done / part done / not yet marker
per step, what was done at each step, the quantities and the estimated times
per step and in total (a batch quantity multiplies them), and downloads it as
CSV. Bend handling (20 s per hit) and printing (60 s per print) are stated
estimates; the other times come from the stations' readouts.

Drawings → **Flat pattern sheet** draws the selected sheet-metal part's flat
blank: its outline and cut-outs, each bend line with its label, the overall
blank size and the bend table (order, angle, direction, radius, allowance,
deduction, tooling). The view kind **flat** is offered on any sheet whose
subject is a sheet-metal part, and fits, prints and exports like any view.

**Example: control box** is a powder-coated SPCC enclosure made through the
stations: a body folded from one blank with corner reliefs, four bends,
mounting holes and a cable entry, a lid folded down on two edges, the body's
corners fillet-welded, RAL 7035 paint, and a printed label and logo on the
lid; its job sheet shows all five steps done.

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
- Run node scripts/verify-hole-row.mjs (CAD*VERIFY_URL=http://localhost:5180/sketch)
  for Hole row: corner and grid snaps for the first hole, the rubber row and
  ↑ ↓ count, the second click 150 mm along +X, the end square with a typed
  spacing, Apply (camera held), Move holes moving the whole row, and the
  detail sheet's "4 ×" note in the workshop ZIP, then the live fields: \_Holes
  in row* 6 typed without Enter in Shape, and _Spacing (mm)_ 60 typed without
  Enter in the tree editor, undone in one step.
- Run node scripts/verify-fab-shop-sm1.mjs (CAD_VERIFY_URL=http://localhost:5180/sketch)
  for Shop → Cut from sheet (100 × 60, 1.5 SPCC), two bends added by edge
  distance and outside flange, the folded size read from Properties against
  the bend deduction, Unfold with its bend labels, Fold, and a reload that
  finds the part intact.
- Run node scripts/verify-fab-shop-sm2.mjs (CAD_VERIFY_URL=http://localhost:5180/sketch)
  for the press brake: the operator's camera, the side view at rest, its angle
  readout following the stroke to the target, two hits by the button and the
  pedal key, a short-flange refusal, a collision drawn red in 3D and on the side
  view, leaving and reloading.
- Run node scripts/verify-fab-shop-sm3.mjs (CAD_VERIFY_URL=http://localhost:5180/sketch)
  for weld, paint and print: an L laid on a plate welded along its foot (seam
  length, gap, the weldment moving as one, no kernel rebuild), the press brake
  refusing the welded part, the weldment powder-coated RAL 9005 (area, powder,
  the time to the painted frame), a silk-screen print dragged off its face
  (the overhang warning), welding the painted parts refused, two image prints
  with the model size and commit costs, and a reload that keeps it all.
- Run node scripts/verify-fab-shop-sm4.mjs (CAD_VERIFY_URL=http://localhost:5180/sketch)
  for the whole route from an empty workspace: an outline with a hole drawn in
  the sketcher, Cut from sheet, the laser's readouts and its cut (the hole
  before the outline, the clock on the readout), two press brake hits, Etch
  bend lines (the solid unchanged), a plate welded on, the weldment painted, a
  print, the job sheet with all five steps and times, the flat pattern sheet's
  bend labels and table, a reload, and Example: control box (built, painted,
  printed, its job sheet complete, its body on the laser and its flat sheet).
- Run node scripts/verify-sketch-cad-offline.mjs against the production preview
  on port 5181, after a build. It uses a hidden Electron window and a separate
  test profile; it does not touch the user's desktop profile.

Scripts use the installed Chrome browser through Playwright. Screenshots,
downloaded ZIPs and check reports go to ignored artifacts/sketch-cad/.
The kernel tests execute real WASM; reliability tests cover conflicts,
references, migrations, history, worker supersession, timeouts, units,
nominal/allowance separation and drawing/model agreement.

Machine-specific G-code, controller-accurate press brake motion (the press
brake station is a schematic simulation) and production weld validation are
not included.
