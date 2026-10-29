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

## Typical workflow

Part properties, the Hardware library and drawing-sheet properties offer a
grouped material dropdown (metals, wood/sheet goods, plastics and other materials).
Expand **Search materials** to filter it. **Custom material…** lets you enter a
company grade or finish; existing custom names remain editable, and materials
already assigned to parts appear under **Project materials**. Choosing a material
records its name for the model and workshop output; dimensions stay separate.

1. Add a board/plate, a tube/member, or an example from the parts tree.
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

Extrude, Revolve, Sweep and Loft can create a new part without selecting an
existing part. With a part selected, they modify that definition. Their setup
panel provides starter profiles, existing-sketch selectors, editable sketch
planes/origins and size fields. Existing sketches can be copied as unconstrained
profiles before editing; the original sketch is retained.
For square-ended straight tubes and pipes, Extrude starts with a copy of the
actual hollow section at the finished end, including its orientation. This
preserves the opening instead of capping it. The copied sketch is independent;
its dimensions and origin can be edited explicitly in the setup panel.

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
For cylindrical surfaces use the existing **Hole → On tube / member** controls,
which resolve the true radial surface; mesh picking is limited to flat faces.

### Hardware and metric threads

**Hardware library** in Solid or Assemble adds hex bolts, nuts, washers,
threaded standoffs, self-clinching nuts/standoffs/studs, rivet nuts and threaded
inserts. Choose M2–M12 and enter body, head, bore and length dimensions. These
are generic editable envelopes, not certified supplier models. Add supplier
part number, installation hole, minimum sheet thickness and installation notes;
the quantities CSV retains these details. Threads and clinching teeth are not
modeled. The supplied size suggestions must be replaced by the purchased
product's dimensions when manufacturing fit matters.

With a hole selected, **Attach to selected hole** creates a concentric connection.
The hardware seating plane follows that hole, including subsequent hole moves
and assembly rotations. Bolts/studs extend into the hole; spacer/nut bodies
extend outward. Set axial offset under **Connections / welds** to place hardware
on the other side of a plate or space stacked hardware. Installation holes are
not automatically cut or inferred from thread size. Without a selected hole,
hardware is an ordinary part at the origin: move its center handle freely in
the screen plane, use the axis/plane handles, or enter exact placement values.

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

Select a part, then choose **Hole** or **Pocket** in the Solid tab. Holes start
on a member side and cut through both walls by default. Pockets start as a
rectangular recess and do not require a sketch. Set **Cut side**, **Along
member (%)** (or distance from the finished start), across-side offset, size
and **Cut extent** in Properties. On round members the cutting direction is
radial at the actual cylindrical surface. Member references follow changes
to length, section, endpoints and weld gaps, before assembly placement.

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

For other parts, the default starts at the center of the top side. Part-side
positions use the two increasing coordinate axes of that side. Exact part
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
