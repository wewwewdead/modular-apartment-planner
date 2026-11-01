# Sketch Studio: build your first model and engineering drawing

This tutorial takes you from a blank project to an editable mounting plate,
a dimensioned drawing, and exported files. You can complete the main example
using the buttons and fields in Sketch Studio; no code or JSON editing is needed.

## What you will build

A rectangular plate with four through holes:

| Property                                     | Value          |
| -------------------------------------------- | -------------- |
| Part name                                    | Mounting plate |
| Length along X                               | 100 mm         |
| Width along Y                                | 50 mm          |
| Thickness along Z                            | 3 mm           |
| Hole diameter                                | 6 mm           |
| Number of holes                              | 4              |
| Hole-center distance from each adjacent edge | 10 mm          |

The finished drawing will include top, front, right, and isometric views,
overall dimensions, a hole-spacing dimension chain, a grouped hole callout,
and a title block.

These are practice dimensions. A material label does not calculate the plate's
load capacity or select a suitable material grade.

## 1. Open the modeling workspace

1. Open the project in your browser or desktop app.
2. Open **Sketch Studio**.
3. Click **3D Model & workshop**.
4. If you already have work open, save it before clicking **New**.
5. Start a new document.
6. Change the document name at the top to **Mounting plate tutorial**.
7. Press Enter or click outside the name field to finish editing.

If you need to start the browser app from the project folder, run:

```powershell
npm run dev
```

Open the local address printed by the terminal, then navigate to Sketch Studio.

**Checkpoint:** you should see the **Sketch**, **Solid**, **Assemble**,
**Drawings**, and **Manufacture** tabs, and the three origin planes
(**Top · XY**, **Front · XZ**, **Right · YZ**) meeting at the origin in the
centre of the view, with the **Start** list in the Properties panel. Clicking
a plane would start a sketch on it; this tutorial starts from a board instead.

## 2. Create the plate

1. Open the **Solid** tab.
2. Click **Board / plate**.
3. Select the new part in the left parts tree if it is not already selected.
4. In Properties, set **Part name** to `Mounting plate`.
5. Set **Material** to `Aluminium - practice model`.
6. In the feature list under the part, select **1. box**.
7. Enter these dimensions in the box feature's fields:

   | Field shown in Properties | Value | Meaning     |
   | ------------------------- | ----- | ----------- |
   | `width`                   | `100` | X length    |
   | `depth`                   | `50`  | Y width     |
   | `height`                  | `3`   | Z thickness |

8. Press Enter after each value, and wait for **Model current** in the footer.
9. Open **Placement & rotation** and set **Position (mm)** X, Y and Z to `0`.
   A new board lands centred under the centre of your view and the camera
   does not move, so its position does not start at zero.
10. Click **Fit** above the viewport.

Keep the part's position and rotation at zero for this tutorial.

**Checkpoint:** the viewport shows a thin rectangular plate. The box starts
at X=0, Y=0, Z=0 and ends at X=100, Y=50, Z=3.

## 3. Add the first through hole

1. Keep **Mounting plate** selected.
2. In **Solid**, click **Hole**. The hint under the view reads "Hole: click a
   flat face to drill there".
3. Click anywhere on the top face of the plate. A red arrow, a square and a
   grip appear on the new hole, and Properties shows **Place hole**.
4. Set **Diameter (mm)** to `6`.
5. Keep **Cut extent** at **Through all — both tube walls** (a new hole starts
   there). This shared option also cuts completely through a solid plate.
6. Open **Exact placement (mm)**. Set **Cut placement** to **Part side** and
   **Cut side** to **Top**.
7. Set **First face axis (%)** to `10`.
8. Set **Second face axis (%)** to `20`.
9. Press Enter after each numeric entry, wait for **Preview ready**, then click
   **Apply hole** and wait for **Model current**.

On the Top side, the first face axis is X and the second is Y:

- 10% of 100 mm = X=10 mm.
- 20% of 50 mm = Y=10 mm.

The percentages are measured from the smaller coordinate toward the larger
coordinate. They are not distances in millimetres.

**Checkpoint:** one Ø6 hole passes through the plate at X=10, Y=10.
Use the standard-view dropdown above the viewport to choose **top**, then
click **Fit** if the hole is difficult to see.

## 4. Add the other three holes

Add each hole separately with **Solid → Hole**: click the plate's top face,
then set the exact position under **Exact placement (mm)** before **Apply
hole**. All four holes use **Part side**, **Top**, Ø6, and **Through all**.
**Apply and place another** applies the hole and starts the next one with the
same diameter and extent.
**Solid → Hole row** can instead place the two holes of one edge at once:
click the first hole, press ↓ twice (or set _Holes in row_ to 2), then click
the second (see Hole rows in `sketch-studio-cad.md`); the two holes are then
one feature.

| Hole              | First face axis (%) | Second face axis (%) | Resulting center X, Y (mm) |
| ----------------- | ------------------- | -------------------- | -------------------------- |
| 1 — already added | 10                  | 20                   | 10, 10                     |
| 2                 | 90                  | 20                   | 90, 10                     |
| 3                 | 90                  | 80                   | 90, 40                     |
| 4                 | 10                  | 80                   | 10, 40                     |

Wait for **Model current** after applying each hole.

A new hole starts where you click. Set its listed position before applying,
so it does not land on an existing hole.

**Checkpoint:** the top view shows four holes, each 10 mm from its two
adjacent edges. The feature tree contains one box and four hole features.

## 5. Save the editable project

1. Click **Save as**.
2. Save the project using a descriptive filename, such as
   `mounting-plate-tutorial.json`.
3. If your browser downloads the file instead of displaying a file picker,
   keep that downloaded project file.

This project file contains your editable model and drawing definitions.
PDF, SVG, and DXF exports do not replace it.

## 6. Create an engineering drawing sheet

1. Select **Mounting plate** in the left parts tree.
2. Open **Drawings**.
3. Click **New engineering sheet**.
4. In the Drawing sheet properties, enter:

   | Field                       | Value                      |
   | --------------------------- | -------------------------- |
   | Layout                      | Engineering drawing        |
   | Drawing title               | Mounting plate             |
   | Drawing subject             | Mounting plate             |
   | Page                        | A3                         |
   | Units                       | mm                         |
   | Sheet scale (1 = full size) | 1                          |
   | Drawing number              | MP-001                     |
   | Revision                    | A                          |
   | Material / finish           | Aluminium - practice model |
   | Tolerance                   | Not specified              |
   | Drawn by                    | Your initials              |
   | Drawing date                | Today's date               |

5. Under **Views & linework**, keep the four directions: **top**,
   **isometric**, **front**, and **right**.
6. For the **isometric** view only, set **View scale (blank = sheet)** to
   `0.5`. Leave this field blank for the other three views.
7. Enable **Hidden lines**, **Hole center marks**, and **Overall dimensions**.
8. Click **Generate views** in the ribbon.

The orthographic views are now 1:1. The isometric view is 1:2 so it fits
comfortably. Each view states its scale; the title block indicates that the
sheet contains different scales.

**Checkpoint:** the top view shows the four circular holes and overall
100 × 50 dimensions. The side views show the 3 mm thickness.

If you leave the properties panel, reopen it using **Sheet properties**.
Select this sheet using the **Drawing sheet** dropdown above the preview.

## 7. Add a hole-spacing dimension chain

1. Open **Sheet properties**.
2. Scroll to **Hole dimensions & callouts**.
3. Set **Annotation view** to **top**.
4. Check **Hole 1 · Ø6** and **Hole 2 · Ø6** only.
5. Click **Add chain dimension**.
6. In the new annotation's controls, leave **Dimension direction** as
   **Horizontal**.
7. Keep **Include distance from view edge** checked.
8. Leave **Dimension offset** at `12`.
9. Click **Update drawing preview** or **Generate views**.

**Checkpoint:** the dimension chain shows `10` from the left edge to the
first center, followed by `80` between the two hole centers. The overall
length remains `100`.

The offset is measured in paper millimetres. It controls where the dimension
line is drawn; it does not move the holes.

## 8. Add a grouped hole callout

1. In **Hole dimensions & callouts**, keep **Annotation view** set to **top**.
2. Check all four holes.
3. Click **Add hole callout**.
4. Leave the leader offsets at their defaults to start with.
5. Regenerate the preview.

**Checkpoint:** a leader identifies the group as **4 × Ø6 THRU**.

The earlier chain still references only holes 1 and 2. Changing the
checkboxes selects holes for the next annotation; it does not edit an
annotation you already added.

For this plate, use the top view for hole annotations because that view
looks along the drilling direction and shows the holes as circles.

## 9. Add drawing notes

1. Under **Title block & notes**, enter the following in **Drawing notes**:

   ```text
   PRACTICE DRAWING - dimensions in millimetres.
   Four diameter 6 through holes.
   Material grade, finish and tolerances to be specified for production.
   ```

2. Click outside the notes field to apply the edit.
3. Wait for **Model current**.
4. Click **Generate views**.

**Checkpoint:** the notes appear beside the title block, and the title block
shows MP-001, revision A, your initials, and the date you entered.

## 10. Optional: add a section drawing

1. With the mounting-plate drawing selected, click **Section sheet**.
2. In the new sheet's properties, find **Section cut**.
3. Set **Cut normal** to **X**.
4. Set **Cut position X** to `50`, Y to `0`, and Z to `0`.
5. Keep **Retain side** set to **Negative side**.
6. Keep the view direction as **right** and the label as **Section A-A**.
7. Click **Generate views**.

**Checkpoint:** a separate section sheet shows the cut through the plate's
middle, with hatching on the cut face. At X=50, the cut passes between the
holes rather than through them.

Section sheets are separate pages. The app does not automatically add an
A-A cutting-plane marker to the parent drawing.

## 11. Export your deliverables

Use the **Drawing sheet** dropdown to return to the main mounting-plate
sheet before exporting a selected sheet.

| Output           | Where to click                                | What it contains                                                |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------- |
| Editable project | Save / Save as                                | Model features, placements, and drawing settings                |
| SVG              | Drawings → SVG sheet                          | Selected drawing sheet as a vector image                        |
| DXF              | Drawings → DXF sheet                          | Selected drawing sheet as CAD linework and text                 |
| PDF              | Drawings → Vector PDF                         | Drawing set, including any automatically generated part details |
| STEP             | Manufacture → STEP assembly                   | 3D assembly geometry                                            |
| STL              | Select the plate, then Manufacture → STL part | Selected part as a mesh                                         |
| Workshop ZIP     | Manufacture → Workshop ZIP                    | Model, drawings, and available workshop outputs                 |

Click **Save** again after completing the drawing annotations.

Print the PDF at **Actual size / 100%** to preserve the stated scale.
DXF drawing dimensions are linework and text, not native associative CAD
DIMENSION objects.

## 12. Prove that the drawing follows the model

1. Open **Solid**.
2. Select **Mounting plate**, then its **1. box** feature.
3. Change `width` from `100` to `120`.
4. Press Enter and wait for **Model current**.
5. Return to **Drawings**, select the main sheet, and click **Generate views**.

The updated drawing should show:

- Overall length: **120 mm**.
- Left hole centers: **X=12 mm**, because their X position is 10%.
- Right hole centers: **X=108 mm**, because their X position is 90%.
- Horizontal chain: **12 mm**, then **96 mm**.
- Hole callout: still **4 × Ø6 THRU**.

This demonstrates the difference between a proportional placement and a
fixed edge distance. Percentage placement preserves the proportion. For a
fixed location, use **Exact part coordinates**; for a top-down cut on this
3 mm plate, the starting Z is 3 and the inward direction is `[0, 0, -1]`.

Click **Undo** to restore the 100 mm length, then regenerate the drawing.

## Next example: the company-style pump bracket

Once you finish the plate, try the example based on the blueprint photo:

1. Save your mounting-plate project.
2. Start a new document and enter **3D Model & workshop**.
3. Open **Drawings → Pump bracket example**.
4. Wait for **Model current**, then click **Generate views**.
5. Select **Pump bracket — dimensioned part** from the sheet dropdown.
6. Open **Named parameters** in the parts panel.
7. Change `holePitch` from `30` to `28` and press Enter.
8. Wait for **Model current** and regenerate the drawing.
9. Check that the repeated center spacing changes to **28 mm**.
10. Use **Undo** to restore the original pitch, regenerate, and save.

The example appends parts and sheets if you load it into an existing model.
Starting a new document keeps this exercise in its own project.

The pump bracket is a reference study. Its drawing notes identify assumed
dimensions and simplified geometry. It omits tabs, PEM nuts, and thread
geometry; accurate bend details and the original company's specifications
are still needed to reproduce the production part.

## Troubleshooting

| What you see                                   | What to do                                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A value does not update the model              | Press Enter or click outside the field, then wait for Model current.                                                                     |
| A new hole reports that it removes no material | Check that the hole lies on the plate and does not duplicate an existing hole. Move it to its listed position, or Undo and add it again. |
| A hole callout cannot find a face-on hole      | For this plate, choose top as the Annotation view and keep a top view on the sheet.                                                      |
| A drawing disappears after a model edit        | Wait for Model current, then Generate views again.                                                                                       |
| A view does not fit                            | Reduce that view's scale or the sheet scale. For the main tutorial, use A3, sheet scale 1, and isometric scale 0.5.                      |
| A leader or dimension leaves its view area     | Reduce its paper offset, or make the view smaller.                                                                                       |
| Export is disabled during an operation preview | Apply or cancel the operation, then wait for Model current.                                                                              |
| You want to edit a previously added hole       | Select the plate in the tree and click the corresponding hole feature.                                                                   |
| You want to reopen the editable project        | Use Open and select the saved project JSON file.                                                                                         |

For additional capabilities and current limitations, see
[Sketch Studio model and workshop workspace](sketch-studio-cad.md).
