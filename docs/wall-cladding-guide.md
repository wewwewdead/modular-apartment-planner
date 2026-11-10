# Wall cladding: step-by-step guide

How to paint walls, add plank siding and add accent panels. The design notes
are in `wall-cladding-finishes.md`; this is only how to use it.

## Before you start

- Select a wall by clicking it on the plan. If a beam sits over the wall and
  takes the click, click the wall in the 3D preview instead.
- Every setting below is in the wall's properties panel on the right.
- "Outside" and "Inside" follow the **Inside side** setting under **Assembly**.
  If the colour lands on the wrong face, press **Flip Inside / Outside**.

## 1. Paint a wall

1. Open **Finishes**.
2. Set **Outside finish** to **Paint** (or **Render** for a stucco texture).
3. Pick the **Outside colour**: a swatch from Facade or RAL, the colour picker,
   or type a hex.
4. Set **Outside sheen**: Matte, Satin or Gloss.

To go back, set the finish to **Stock**.

Works on CHB walls and on framed walls with a board on that face. A framed
face with no board has nothing to paint — pick a board under **Assembly**
first.

## 2. Repeat a finish on other walls

Under **Apply this finish to**, press one of:

- **Whole facade stack** — this wall and the ones above and below it.
- **Matching walls on this floor** — same build-up, same board on that face.
- **Matching walls in the building**.

Each is one undo step.

## 3. Add plank siding

1. Open **Assembly** and choose a framed assembly (for example
   **HardieFlex / fiber cement**).
2. Set **Outside board** to **Plank siding**.
3. Set **Outside boards run** (Horizontal or Vertical), **Outside exposure**
   (board face, default 140 mm) and **Outside joint** (gap, default 6 mm).
4. In **Finishes**, choose **Timber stain** and a timber tone, or **Paint**.

Boards line up around corners and between storeys on their own.

## 4. Add accent panels

Accents are blocks of a second colour on a face. They need a framed wall with
a board on that face.

1. In **Finishes**, press **Edit accents**. The wall detail editor opens on
   that face.
2. Add an accent either way:
   - **Beside a door or window:** in **Accent panels**, choose the **Opening**,
     a **Placement** (Left of it, Right of it, Above it, Below it) and a
     **Size**, then press **Add accent at opening**. It moves with the opening.
   - **Anywhere:** press **Accent** (key **A**) and drag a rectangle.
3. Click an accent to edit it: label, **From wall start**, **Above floor**,
   **Width**, **Height**, **Finish**, **Colour**, **Sheen**, **Attach to**.
4. Drag to move it. **Delete accent** or the Delete key removes it.
5. Press **Close**.

Back in **Finishes**:

- **Copy accents to the facade stack** puts the same accents on the walls
  above and below.
- **Clear accents** removes them from this face.

## 5. Check the result

- **3D preview:** use the Realistic style for the finished look. Shaded keeps
  the colours and board lines.
- **Takeoff:** one line per finish and colour in m², plus siding area and
  board run in metres.

## Limits to know

- No accents on CHB walls or arc walls.
- Columns and beams keep their own colour. To hide them, use an outboard
  facade (the **Facade** section) so the cladding runs past them.
- The plan shows finish colours only on framed walls in the drafting style.
- Accent colours in the editor come from the catalogues only; there is no hex
  field there.
- Changing the **Assembly** preset clears that wall's finishes and accents.
- Where two accents overlap, the takeoff counts the hidden part too.
