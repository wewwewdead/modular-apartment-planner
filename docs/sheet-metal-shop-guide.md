# Sheet metal shop guide (Sketch Studio)

How to make a sheet-metal product in Sketch Studio the way a shop makes it:
draw it, cut it, bend it, paint it, print on it, put the parts together, and
read the job sheet. Everything is in the **Shop** tab of the 3D workstation,
and this guide follows its route bar, station by station:

**1 · Draw → 2 · Cut → 3 · Bend → 4 · Paint → 5 · Print**,
then **More** (putting the parts together, the job sheet, drawings, the
examples). **Replay** plays the whole route as a film. The last section walks
the whole route on **Example: kiosk**, a product like the shop's own.

This is a visualisation of the product, not of every shop job: welding and
assembly are not stations. The parts are put together where they belong with
**Move part**, **Rotate part**, snapping, **Mate faces** and **Group** (see
Putting the parts together).

## The route bar

The Shop tab's ribbon is the **route**: Draw · Cut · Bend · Paint · Print, in
shop order, then **Replay** (the product being made, as a film: see Replay
below) and **More** (Add bend by numbers, Unfold / Fold, Group, Ungroup, Mate
faces, Add bought-in item…, Job sheet, Flat pattern sheet and the examples). Each station shows, for the
current product, what has been done there — "2 blanks", "6 hits", "RAL 7035"
— with a mark: filled when done, half when part done, hollow when not yet.
The next step to take is outlined. Click a station to go there: the station
that is open is left (nothing is lost) and the new one opens on the same
product and part. The stations wait only while the press brake strokes, the
laser cuts, or a sketch, an operation or a mate is open. The search box still
finds every Shop command by its own name.

The **current product** is what you last selected (a part or a group); a
station that clears the selection keeps it. On the Shop tab the left pane
opens on the **job board** (switch to **Tree** for the parts tree): every
product, each of its sheet-metal parts with its outline, its blank (t 1.5
SPCC · 120 × 80) and five pips for the five stations, and its next step.
Clicking a part's row selects it, or moves the open press brake or laser to
it, or makes it the paint booth's target.

Every station panel has the same shape: its number and name and the part it
works on; its steps, its fields, any problem (what is wrong, then what to do,
with a one-click fix where one field cures it — a smaller die for a short
flange, a wider one for too much force); what the station makes, in large
figures; then **Machine numbers**, closed until you open it (it stays open
for that station next time). At the foot, always in view however long the
panel is: the station's one main button (Bend, Paint, Cut …), then **← Back**,
the station's own Leave button, and **Next →**. A station never stops at an error
line: with nothing to work on it says what is missing and offers the station
that makes it, the first station that can ("Nothing to bend yet: draw the
outline first." → Go to Draw on an empty model; → Go to Cut once an outline is
ready); with several parts it asks which one. More → Add bend by numbers works
on the current part from any station (with several parts it asks which).

The rule behind all of it: **the flat blank is the part**. You draw the blank
you would program on the laser; the bends fold it. Nothing is ever unfolded
from a 3D shape. If the blank is cut the wrong size, the flanges come out the
wrong length, exactly as on the machine.

## 1 · Draw — the blank

**Draw** (it opens by itself when you first come to the Shop tab of an empty
model) asks what you are making:

- **Rectangle** — W × H, straight to Cut;
- **Flanged panel** — describe the finished part and the blank is laid out
  for you (see below);
- **Draw the outline** — the 3D sketcher on the XY plane at the origin: a
  closed outline, and circles or closed shapes inside it for the holes.
  Finishing the sketch brings you back to Draw with that outline chosen (a
  closed sketch on XY finished anywhere else offers **Cut from sheet →**);
- **From the 2D drawing** — the closed outlines of the 2D drafting view; an
  outline strictly inside another becomes its cut-out, and a loop inside a
  cut-out is skipped and reported.

Below them, **Outlines ready to cut** lists every closed XY sketch no part is
made from yet, with its size.

Leave the corner reliefs in the outline wherever two bends meet: the bend
zones of two bends may not overlap (see the control box example's corners).

### Flanged panel

For face frames, covers and trays: you give the finished part, the maker
gives the blank a programmer would send to the laser.

1. **Face (outside size)**: a rectangle (W × H), a trapezoid (bottom, top,
   height) or a closed straight-edged sketch on XY (convex). These are the
   outside mould lines of the finished face.
2. **Flanges**: click an edge in the preview to put a flange on it (again to
   take it off), or **Flange all edges**. Each has a depth (the outside
   height) and goes up or down. Square corners between two flanges are
   closed: the longer edge's flange runs to the corner and the other stops
   the 0.2 mm fit-up gap short of it; other corners
   (45° – 135°) stay open with a relief; sharper ones are refused.
   **Round corners**: below the edges the form lists every square corner with
   a flange on both its edges; tick **Round corner** and give its **Radius**
   (the outside of the corner, 30 mm to start with) and **Leg** (15 mm). Both
   flanges then stop square `radius + leg` from the sharp corner (45 mm for
   R30), the face is cut back by the sheet thickness along that stretch and
   round the arc (radius − t), and a **corner piece** closes the corner: a
   strip as wide as the flanges are deep, with one 90° round bend made by
   bump hits (3 · Bend, Round bends), set in the corner with its two straight
   legs against the two flange ends. The two flanges must be 90°, bent the same way and the
   same depth (the corner piece is one strip); anything else is refused by
   name, and so is a radius one ordinary hit would already make (R3.1 or less
   on 1.5 mm sheet in the V10 die: leave that corner square), a window inside
   the arc and a crease through the corner piece. Each flange's bend ends
   square at the flange's end, with a 1 mm relief in the face beyond it.
3. **Creases**: a shallow bend across the face (click the face in the
   preview for one at that height; angle and side in the form). Creases run
   one way (parallel). Where a crease crosses a flange the flange is notched,
   wider when the flange stands on the inside of the crease (its two ends
   lean together as the crease closes).
4. **Windows and holes**: rectangles (with a corner radius, kept as true
   arcs for the laser and the DXF) and round holes, by centre. They must stay
   clear of the bends and of the creases.

The preview shows the finished face beside the blank the laser cuts, the
bend lines numbered in brake order (the longest flanges first, then the
creases), and the press brake's verdict on that order, before anything is
made: "every hit clears", or the hit it refuses and why (an acute corner's
first wall stands where the second flange's punch goes, for one). The form
reads the blank size, the folded size and the number of hits, and with round
corners the **Corner pieces** it will cut ("2 pieces · blank 75.9 × 40 mm ·
R30 outside in 10 hits"; a corner piece the brake would refuse shows as a
problem too). The preview rounds those corners, stops the flanges short and
draws each corner piece in its corner. Every number is the brake's own
(3 · Bend): the bend allowances, deductions and setbacks of the default
tooling for the thickness.

Two endings, both to the laser with the cut running:

- **Cut the blank — I will bend it**: the part and one etched line per hit,
  carrying its angle and side. At the brake each hit is one click on its
  etched line and the pedal.
- **Cut and bend it for me**: the same part with the bends made.

With round corners both endings also make the corner pieces: one part per
size ("Flanged panel corner piece"), an instance set in each of its corners,
and the panel and its corner pieces one group (named after the panel), so
they move as one. Its etched line carries the round bend too: at the brake
one click on it sets Round, the inside radius and the hits.

A blank too tall for the model's stock sheet is cut from the smallest sheet
that holds it (a 600 × 1400 face frame's 675 × 1475 blank needs the 1500 ×
3000 sheet: the laser never turns a blank).

## 2 · Cut — the laser

### An outline with no part yet

**Cut this** in Draw goes to **Cut** with the outline: choose the stock
(SPCC, SECC, SUS304, A5052, A6061) and the thickness. The panel reads the
blank size, the laser cut length (outline plus every cut-out) and the pierces
(one per contour). **Cut on the laser** makes the part — it lands flat on the
ground under the view centre — and opens the laser on it with the cut already
running. (The search box's **Cut from sheet** opens Draw.)

### A blank: the laser station

**Cut** on a part that is already a blank opens the laser on it (the search
box's **Laser** works on the selected part). The laser bed covers the view: the stock
sheet at true scale with the blank nested on it in the sketch's own X and Y
(+Y up, as in the flat DXF). Close-up frames the blanks; Whole sheet shows
the sheet.

- **Stock sheet**: 1219 × 2438, 1250 × 2500 or 1500 × 3000 mm (saved with the
  model). Blanks stay 10 mm clear of the sheet edge.
- **Quantity**: how many blanks to cut. They are nested in rows with the cut
  list's shelf packer (never turned), 3 mm apart. More than fit on one sheet
  spill onto further sheets; the bed shows the first.
- **Cut** runs the head along the cut path: a pierce (the glow), then the
  contour; every cut-out first, nearest next, and the outline last, so the
  part never drops out of the sheet before its holes are cut. The clock shows
  the machine's time; the animation is stretched to at least 6 s or squeezed
  to at most 15 s so it can be watched, and the panel says by how much
  ("shown at 1/2.9 speed"). **Stop** (or Esc) stops it.
- **Etch bend lines** writes each bend's punch line onto the blank as an
  etched mark (low-power marking, no cut), so the brake operator sees where
  each hit goes. They show on the bed, on the press brake's flat-blank card and
  in the flat DXF (layer ETCH). They do not change the folded part. **Clear
  marks** removes them.

Readouts:

| Readout       | What it is                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Cut length    | The outline plus every cut-out, exact for lines, arcs and circles.                                                        |
| Pierces       | One per contour × the pierce time: 0.1 s at 1 mm rising to 1 s at 6 mm.                                                   |
| Cutting speed | 2 kW fiber, m/min, interpolated on thickness from the steel, stainless or aluminium table.                                |
| Kerf          | The width the beam burns: 0.10 mm up to 2 mm, 0.15 up to 3, 0.25 above. Drawn 2.5 px wide on the bed so it can be seen.   |
| Cut time      | pierces × pierce time + cut length / speed, per blank and for the quantity. Rapid moves between contours are not counted. |
| Sheet use     | The blanks' area over the sheets' area.                                                                                   |
| Narrowest web | The least distance between two cut-outs, or from a cut-out to the outline.                                                |

Checks, each with its remedy: a cut-out narrower than the thickness t is
flagged (rough, tapered wall: make it bigger or drill it after); narrower
than 0.5 t, Cut is refused. A web below 0.5 t is flagged. A blank larger than
the sheet (less the 10 mm margin) is refused, naming a sheet that holds it.

### Several parts in one go

Draw as many outlines as the job needs — several in one sketch, or one
sketch after another. Each closed outline is its own blank and shows under
**Outlines ready to cut**. With two or more there, **Cut all {n} outlines**
takes them all to Cut from sheet together: give each its **Quantity**, take
out any you do not want now (**Leave out**), choose the one stock and
thickness they share, and **Cut on the laser**. That is one job: every part is
made at once (one Undo takes it all back), each named after its outline, and
the laser cuts every blank on the same sheet, nested side by side. An outline
of another thickness goes on its own (**Cut this**), because one sheet is one
stock and one thickness.

New parts land flat in the view next to what is already there, never on top
of it. While the laser is open on the job, a click on one of its parts in the
job board (or in **This cut**) makes that part the one Quantity and Edit
outline work on; the job stays as it is.

**More → Job sheet** ends with **Sheets to buy**: for each stock and
thickness, how many blanks, how many sheets and how much of them is used —
the laser's own numbers, for the batch you ask for.

## 3 · Bend — the press brake

Two ways, both ending in the same bend records:

- **Add bend** (in the part's sheet-metal form): a bend parallel to an edge at
  distance D, or the outside flange length you want (the two drive each other
  through the bend deduction), or through two points.
- **Press brake** (the route's **Bend**): put the blank on a 50 t × 2 m, 80 t
  × 2.5 m or 100 t × 3 m press brake (under Machine and tooling). On the flat-blank card (or on the sheet itself) click the edge that goes against the
  backgauge and set L, or click two points. Set the angle, Flip sheet for a
  down bend, the punch and the die on the **Blades** row (below; Automatic
  picks the die for the thickness). **Bend**, Enter or Space is the pedal.
  The side view shows the section of the hit through the stroke.

**Etched lines** (from the laser's Etch bend lines or the Flanged panel) are
buttons on the flat-blank card: one click puts the punch line on it, and a
line etched with its bend sets the angle and Flip sheet too.

### Bending the parts one by one

With more than one sheet-metal part in the model, the press brake shows
**Parts to bend** at the top of its panel: every part, flat or bent, and a
count ("1 of 3 bent", then "Every part is bent."). Copies of one part are one
row ("× 2"): a bend belongs to the part, so both copies fold together — bend
it once. **Next part** (blue once this part has a bend and the next is still
flat) and **Previous part** step through the list; a click on a row goes
straight to that part. A part already painted or printed shows its finished
card, and Next part still takes you on from there.

The punch and the die stay in the machine as you go from part to part, as on
a real brake; the gauge edge, L, the angle and the rest are set again for
each part. If the die does not suit the next part's thickness the brake says
so. Leave the press brake (or go to another station) and the next visit
starts with the standard tooling again.

**One stroke, several bends.** A punch line across several separate tabs (a
flange notched where a crease crosses it, a comb) bends them all in one
stroke, as the machine does; each tab is its own bend record (one hinge),
the stroke counts as one hit, and the sequence list shows it as "1 · UP 90°
R1.6 · 2 flanges". The tabs must still be in line: once a crease (or any
bend) between them has been made they are not, and the stroke is refused;
bend them one at a time. With a line chosen, the material it crosses shows
as segments on the card: **click a segment to leave it out of the hit** (or
put it back). The control box's front wall is one gauge pick with the two
side-flange ends clicked out.

**Sectional tooling.** The punch, its holders and the die are set up only
where the hit bends: one section per stretch of tabs (a gap with no material
does not break it, material left out of the hit does). Under the full-length
ram the punch stands on 100 mm punch holders (Promecam intermediates), so
walls already standing beside the punch clear the ram. The tall straight
punch (H 105) raises the holders by 38.5 mm.

**Blades.** The punch (top) and the die (bottom) are always in view on the
**Blades** row, under the angle and Bend shape: each button shows the tool's
section (the shape the 3D scene and the collision check use), its name and
one fact (the tip radius; the V opening, "(automatic)" when the station
chose it). Click one to open the picker: every punch, or every die with
Automatic first, as a card drawn at one common scale with its numbers
(angle, tip radius, height, load; V, angle, shoulder radius, load), what it
is for, and — once a punch line is picked — whether this hit clears with it
("Clears this hit", or the refusal). A refused tool can still be chosen. The
picker and the Punch and Die selects under Machine and tooling are the same
choice; a radius punch is Round · Radius punch either way.

- **Straight 88°** everyday bends; **sharp** thin sheet and a tight inside
  radius; **tall** (H 105) deep boxes, its holders 38.5 mm higher;
  **acute 30°** bends past 90° in a 30° die; **radius R10 … R30** round
  bends in one hit.
- **Gooseneck 88°** (H 104.5) and **Gooseneck 88° deep** (H 145): a flange
  already standing that would hit a straight punch. The neck leans back over
  the tip and the throat opens to the operator (20 mm behind the tip line,
  29 mm on the deep one), so the flange swings into the throat. A plain bend
  clears them too. **Reverse punch** turns a gooseneck round in its clamps,
  the throat to the backgauge (for a flange standing at the back).
- **A collision card says what was tried.** When the part hits the punch,
  its holders or the ram, the station tries turning the sheet around and the
  punch that would make room (the gooseneck; the tall straight punch for the
  holders) before it advises. The card names a remedy only when the hit
  really clears with it, each as one click: **Turn the sheet around**, **Use
  the gooseneck punch** (a reversed gooseneck is first offered **Turn the
  punch round**). What was tried and does not clear is said plainly, so it
  is not tried again: "Bend 2: the part hits the punch at 64°. Bend this one
  earlier (before the flange in the way). Turning the sheet around and the
  gooseneck punch either way round were tried: neither clears." (a web
  between two standing flanges: one swings in from each side, a throat takes
  one). "Bend this one earlier" is general advice, not tried. A step already
  in the sequence is refused only when both ways round collide, so its card
  never says to turn the sheet around.
- **The advice follows the line.** While you drag the punch line or type a
  number, the card shows the fact at once ("the part hits the punch at
  64°", an offset's hits and lines); the remedies, and an offset's smallest
  step, die, shorter side and larger step, come once the line has been still
  for a moment (0.15 s). Bend, pressed before then, still says why with the
  full advice.
- **Punch and die length.** Under each blade, one line: **Length [391.8]
  mm · fitted** — the station sets the punch, its holders and the die to the
  bend's own length. Type a length (Enter or leaving the box sets it; the
  arrows step 5 mm) to shorten the tool so it stands clear of flanges already
  standing at the ends of the line, as a shop does with sectional tooling:
  the note says how far ("5.9 mm short at each end"), **Fit to bend** or an
  empty box puts it back. A longer tool runs past each end (up to the bed),
  so it really can meet the sides. Where the line bends several separate
  tabs, the line reads **2 sections · fitted** and the box is **Shorter at
  each end**. The length is kept with the hit made, so a step in the sequence
  is checked, replayed and listed with it ("Straight 88° punch, 380 mm"); a
  new line puts both back to fitted.
  - A tool shorter than the bend leaves the ends unpressed: a note, not a
    refusal ("The punch stops 5.9 mm short of each end of the bend: the ends
    are not pressed and come out a little open"). Refused: a tool under half
    the bend, none over a tab, or shorter than 10 mm (the shortest section of
    a sectional set). The tool's kN/m counts over the length of it under the
    bend, so a much shorter punch can be refused for the force.
  - When the part hits the punch or its holders at the punch's ends, the card
    tries it shorter (5, 10, 20, 40 mm off each end) and offers the first that
    clears, **Shorten the punch to 348 mm**; a punch set longer than the bend
    is tried fitted (**Fit the punch to the bend**). The same for the die.
- **The ram.** No punch length helps when the part reaches the ram: it runs
  the whole bed. The card says how high this punch and its holder stand it
  ("166.5 mm above the tip"), tries every taller punch in the list and offers
  the first that clears; when none does, it says so with the tallest set-up's
  height and about the height this bend needs ("No punch in the list holds
  the ram high enough (the tallest gives 245 mm): this bend needs about 315
  mm" — a 600 × 400 tray with 200 mm sides).
- **Limits.** The ram goes back up 40 mm above the sheet and the part is
  taken off there: a flange in the throat higher than the neck rises in
  those 40 mm is fine; one the neck would lift sooner is refused ("as the
  ram goes back up"). A throat takes a flange only as deep as it reaches:
  a U channel with a 50 mm web clears with the gooseneck up to a 60 mm
  flange; deeper, the flange meets the punch or its holders.

**Flipping, turning and offset bends.** The machine always bends up, so a
bend down is made with the sheet turned over.

- **Flip sheet** sits beside the angle as two states, **This side up ·
  Flipped over**. Changing it turns the sheet over on the die (about half a
  second, a view only); the side view says which side is up, and bends
  already made then hang down, as they would.
- **Turn sheet around** puts the other side of the punch line to the
  backgauge: with a gauge edge picked it moves to the opposite parallel edge
  and sets L to the same line from there (the same hit, the other way
  round); on a two-point line, or a blank with no edge opposite, it turns the
  sheet round as it lies ("Turned around: the other side to the
  backgauge."). A new line starts the right way round. When a collision card
  finds that turned around the hit clears (every check, not just the
  collision), it carries a **Turn the sheet around** button.

**Hands on the sheet.** Flip and turn are also done on the sheet itself, in
the 3D view, the way Rotate part puts rings on a part in the workshop:

- At the middle of the sheet's front edge (the edge nearest you) stand two
  handles: a hoop with an arrow at each end (**Flip sheet**, F) and, once a
  punch line is picked, a flat ring with one arrow (**Turn sheet around**,
  T). They are quiet until the pointer nears; then the handle lights up and
  a card by it gives its name, its key and, with a hit pending, what the act
  would leave: "Flipped over it clears", or "Turned around: the part hits
  the punch at 74.5°".
- **Click** a handle: the act at once, the sheet turning as it would by the
  panel's control. **Drag** it: the sheet follows your hand round, lifted
  clear of the punch and the die; let go at 90° or more and it finishes the
  turn from where it is, under 90° it goes back and nothing changes. Esc or a
  right click mid-drag puts it back too; Alt turns freely, and typing an
  angle then Enter sets it exactly.
- At the press brake the view toolbar shows **Flip over** and **Turn
  around** in place of the model's part commands (Move part, Rotate part,
  Flip Horizontal / Vertical, the hole tools, Measure); hovering one lights
  its handle. The panel keeps its own Flip sheet and Turn sheet around: all
  of them make the same change.
- The sheet turns on the die whenever the edge that faces the backgauge
  changes, not only when it is flipped: Turn sheet around swings it round,
  and a newly picked gauge edge brings that edge to the fingers. A new L, a
  new angle or other tooling never moves it about.
- **Click an edge of the sheet** to put it to the backgauge, the same as
  clicking it on the flat-blank card. Near an edge (within about 10 px) it
  lights blue along its length, in parts where an earlier bend crosses it,
  and a card says "Edge 3 · 300 mm · click: to the backgauge". Two points,
  etched lines and leaving a segment out stay on the card.
- **Drag the amber backgauge fingers** to set L, as on a real machine: L
  follows your hand along the bed's depth in whole millimetres (Alt: tenths),
  the sheet riding with the fingers, a card by the cursor reading "L 187 mm ·
  flange 114.34" (the panel's own Flange figure). Type a number then Enter
  mid-drag for an exact L; Esc puts the line back as it was. A click on the
  fingers opens the panel on **Backgauge L (mm)**, ready to type. Where the
  fingers do not stand at L (an offset's hit gauged for its other line or off
  the opposite edge) they only say why; on a two-point line there are none.
- **Click the punch or the die** to change it: on approach it lights up and
  names itself ("Straight 88° punch · click to change"), and a click opens
  the panel with that blade's picker open. The holder, the ram, the bed and
  the backgauge beam only name themselves. What the pointer reaches first,
  where they overlap: a ring on the sheet, the fingers, the punch or die,
  an edge.
- None of this is offered while a stroke runs, a made step is shown (Before
  / After) or the replay plays; the edges and the fingers only in Backgauge
  edge mode.
- **Bend shape → Offset** makes a step (a joggle) of two bends of the angle
  set, one up and one down, in **one press of Bend**: hit one, the sheet
  turned over, hit two, as in a shop when the first bend hangs in front of
  the die while the second is made against the stops. Set **Offset (mm)**,
  the step between the two faces on the same side of the sheet (outside to
  outside it is the offset + t); Flip sheet says which way it goes. Line A
  is the punch line you picked; line B is worked out and drawn on the flat
  blank, the spacing nearer the backgauge. Before the pedal the panel shows
  the **Spacing** (line to line), the **Web** (the flat between the two bend
  zones), each hit with its line, its direction and its backgauge reading,
  and the force. The order is chosen for you: A then B, and when only B then
  A clears the panel says "Made the other way round: the shorter side hangs
  down." The two bends are ordinary records in the order made (two hits in
  the sequence).
- **When a side hangs into the bed or the die** from a neighbouring bend
  made the other way, the card gives the facts ("Bend 2: the 100 mm side
  hangs down beside the die and meets the bed (the V10 88° die stands 80 mm
  above it).") and only remedies that were tried: bend the other one first,
  so the other side hangs; or, when neither order clears, the length the
  side that hangs may have and the step that hangs clear (each found by
  trying the hit). An offset too small for the die says the smallest this
  die makes at that angle and offers a catalogue die that makes the one
  asked for, when there is one.
- **Limits.** What can hang down is decided by the bed and the die's height
  (the V10 88° die stands 80 mm above a bed 60 mm wide, schematic sizes):
  a side longer than that hangs into the bed unless the web carries it past.
  The smallest offset is limited by the die twice — the web must reach the
  die's shortest leg, and the side bent first must hang clear of the die's
  body — so it is found by trying, not by a formula (at 45° on 1.5 mm SPCC:
  5.9 mm with the V10 die, 4.5 mm with the V6). A tight joggle in one stroke
  needs offset (joggle) tooling, which this shop does not have.

On show at the brake: both outside legs of the hit (the flange and the other
leg; per tab when they differ) and the force against the press and the
tooling; between hits, the folded size. Under Machine numbers: inside radius, bend allowance and
deduction, backgauge L, ram depth, springback and the angle the machine
overbends to. Refused with the
remedy: too much force, a bend longer than the bed, a flange too short for
the die, an angle beyond the die, a punch blunter than its die, a backgauge
reading out of reach, and any collision through the stroke (drawn red).
A collision's advice names the earlier hit to make it after ("Bend this one
before bend 1 …") only when the brake would take that order: when moving it
would put it between the tabs of a stroke of several flanges (which would
then be out of line) the advice is the flange depth the die clears, the tabs
one at a time, or the sheet the other way up instead.

**Shop order.** A part that is already painted or printed does not go back
on the brake. When its hits are made it is simply **finished here**: Bend
says so ("Bending is done on this part: 4 hits made. It has gone on down the
route: powder-coated RAL 9005 Jet black."), lists the hits made and its
folded size, and **Watch the bends** replays its hits on the press brake (the
film, below; **Back to the press brake** returns to the card). Bending it
again stays one click away under **Bend it again?** — it removes what came
after the brake (and loses it). The counts there are the part's, every
copy's together: a part made twice (the kiosk's face frames) carries both
frames' paint, and the card says so. A part that is painted or printed but
has no hits yet is refused as before, with the same one-click remedy. Moving
or turning a part never counts: Move part and Rotate part work on a part
whatever has been done to it.

**Unfold** shows a bent part flat with its bend labels ("UP 90° R1.6") and
folds it back; it is a view only.

### Round bends

A rounded corner (a large inside radius, R40 on 1.5 mm sheet) is not one hit
of the ordinary punch: one hit in a V10 die forms about R1.6, whatever you
ask for. The shop makes a large radius one of two ways, and **Bend shape →
Round** asks which (**Made by**):

- **Bump hits** (bump bending, also called step bending): the ordinary
  straight punch makes many small hits side by side across the bend zone,
  each a few degrees, the sheet moved one step toward the backgauge between
  them. The flats between the hits are so small that the corner reads as one
  curve. Any radius; short legs are fine (the small die carries them).
- **Radius punch**: one hit of a punch with a large round nose (Radius R10,
  R15, R20, R25 or R30) in a wide die. The inside radius is the punch's. Quick
  (one stroke) and smooth, but only in the radii the shop has, and the wide
  die needs long legs.

Which fits: a punch of that radius and long legs → the radius punch, one hit.
Short legs, or a radius no punch has → bump hits.

**Bump hits:**

- **At the press brake**, under Bend angle choose **Bend shape → Round**, Made
  by **Bump hits**, set **Inside radius (mm)** and, if you want, **Hits**
  (empty is automatic; the automatic count shows in the box). **Bend** makes the whole round bend: the
  ram cycles once per hit (lifting only 10 mm between hits), the backgauge
  fingers step one pitch nearer each time and the curve grows hit by hit in
  the 3D scene and the side view. It is still one bend record and one row of
  the sequence: "1 · UP 90° R40 · 13 hits". Before / After, Re-run, Earlier,
  Later and Remove treat it as one step.
- **Add bend** (the part's sheet-metal form) has the same Sharp · Round
  choice, radius and hits.
- **How many hits.** Automatic: the pitch (the flat distance between hits)
  is half the die opening, the die the sheet uses anyway — the shop rule "die
  opening = 2 × pitch" read backwards. R40 on 1.5 SPCC: the bend zone is
  64.01 mm, the V10 die gives a 5 mm pitch, so 13 hits of 6.92° every 4.92
  mm. The results show the hits and how high the **flats** stand off the true
  curve (0.08 mm there); more hits make it smoother.
- **What the machine checks, per hit.** The die's angle limit applies to one
  hit's angle (a 180° round bend is allowed; the collision check decides).
  Each side must reach the die's minimum leg from the outermost hit on that
  side (the sheet beside a hit is carried whether it is bumped or not). The
  force is one hit's. The backgauge must reach both the first hit (farthest
  from the gauge edge) and the last one; Machine numbers show the reading
  first → last ("329.54 → 270.46 mm"), the ram depth and the angle the
  machine bends to per hit. A die more than 2.5 times the pitch is a warning
  (the bumped part sinks into the die), with the narrower die as a one-click
  fix. A cut-out within half the zone plus 2.5 t of the bend line is flagged.
  The collision check walks the hits in order, the punch coming down and
  going up for each, and names the hit (R40 bent to 180° in 26 hits, 300 mm
  legs: "Bend 1, hit 14 of 26: the part hits the ram at 95.5°.").
- **Refused:** fewer than 2 or more than 200 hits, no radius, a radius no
  larger than one hit of the tooling already makes (make it an ordinary
  bend), or hits closer than 1 mm. An ordinary bend whose radius you typed is
  three times what its tooling forms is warned: make it a round bend.
- The folded part is the true arc (the flats are within the drawing
  tolerance). The flat-blank card shows a round bend's zone (its two tangent
  lines on a light band) and its hit lines, faint.
- The job sheet times a round bend as its hits (short lifts), the 20 s
  handling once and 3 s per further hit (an estimate); "13 hits" counts in
  the Bend step. The replay plays all the hits in one scene.

**Radius punch:**

- **At the press brake**, Round, Made by **Radius punch**, then choose the
  punch (Radius R10 … R30) in place of the radius and hits. Choosing a radius
  punch under Machine and tooling is the same thing; Sharp or Bump hits puts
  the straight punch back. The die is automatic: the narrowest with an
  opening at least 2.2 × (R + t) — for 1.5 mm sheet R10 → V32, R15 → V40, R20
  → V50, R25 → V63, R30 → V80 (all 60° dies). You can still choose the die by
  hand.
- It is one ordinary hit: the results read like a sharp bend's with the
  inside radius, the sequence row is "2 · UP 90° R30" and its tooling line
  names the punch. A strip 1000 × 40 bent up 90° at 300 and 700 with the R30
  punch folds to 414.70 × 40 × 307.35 mm in 2 hits.
- **Checked:** a die narrower than 2.2 × (R + t) is refused with the die it
  needs as the fix ("The Radius R30 punch with 1.5 mm sheet needs a die at
  least 69.3 mm wide; the V25 88° die is 25 mm. Use the V80 60° die."). A die
  so wide that it forms a rounder bend on its own than the punch is a warning
  (the bend comes out at the die's radius). The wide die needs long legs (the
  V80 at 90°: 66.57 mm from the punch line); a leg too short is refused, and
  when bump hits would carry it the card offers them as the fix ("… or make it
  with bump hits: they need only about 27.95 mm."). The punch-blunter-than-die
  rule does not apply to a round nose. Force, bed, backgauge and collisions
  are checked as for any hit, with the punch's real section (the round nose
  on its ruler, 2 R wide, on a 41 mm holder).
- The other way round: the bump-die warning and the "make it a round bend"
  warning name the radius punch when the shop has one of that radius.
- Either way, a round bend shows its zone on the flat-blank card (bump hits
  add their hit lines), draws its two tangent lines on the drawing sheets and
  the flat DXF, and flags a cut-out within half the zone plus 2.5 t.
- **Not modelled:** a large radius air-formed in one hit springs back far more
  than the springback readout says, and a sheet can lift off the punch nose
  (the bend opens wider than the punch, "multi-breakage"); the readout is a
  rule of thumb.

### Bending a bend on: part-way first, finished later

Two bends close together — a return lip a few mm from a flange — often will
not go in the order you first try. The shop cure is to bend the first one only
part-way, make the tight one, then come back and finish the first. The brake
lets you do exactly that (docs/sketch-studio-tight-bends.md §4).

- **Make the first hit part-way.** Set its line and a small angle (30°, say)
  and Bend, as any hit.
- **Make the tight hit** in between, as any hit.
- **Come back to the first line.** Pick the same gauge edge and L you used (or
  press **Bend on** on that bend's row of the sequence: it puts the line back
  on the bend for you, gauged off the nearest parallel edge). The station
  says **"This is bend 1's line: it stands at 30°. This hit bends it on."**
  The angle box now reads **Bend on to (°)**: the angle the bend has _after_
  this hit, as the brake's angle setting reads, not the amount added; under
  it "now 30° · this hit adds 60°". Arriving on the line with an angle not
  above the bend's, the box is set to 90° (180° for a bend already at 90° or
  more) for you; what you type after that is yours. Flip sheet and Sharp /
  Round / Offset are off: the side and the shape are the bend's own. The
  punch, die and their lengths are chosen as for any hit.
- **Bend.** The stroke starts from the part-bent sheet: the side view shows
  the sheet sitting in the V at 30° and the ram taking it on to 90°. The
  check runs over the same stretch: from where the bend stands to where it
  ends, with everything else as it stands now.
- **The sequence** keeps every hit in the order made: "1 · UP 30° R1.28",
  "2 · UP 90° R1.28", "3 · bend 1 on: 30° → 90°". The bend-on row has the
  usual Before / After, Re-run, Earlier, Later and Remove. Remove takes that
  hit away (the bend goes back to 30°); removing the bend's own first row
  takes its bend-on rows with it. A move that would put a bend-on row before
  its bend is refused ("Step 2 bends a bend on before it is made …"), and so
  is any move that makes a step collide. The job sheet counts a bend-on hit as
  one hit, the replay plays it as its own scene ("Bend 1 on to 90°"), and the
  part's own form lists it as "Bend 1 on to" with its angle and Remove.
- **Refused:** an angle not above the bend's ("Bend 1 is already at 30°: a
  hit only bends it further." — opening a bend back is not offered), over
  180°, a round bend (it is made in its own hits), and a radius punch.
- **What the part becomes.** The finished part is the same whatever order made
  it: the user's tray, lip and inner flange both at 90°, folds to
  577.47 × 420.4 × 20.14 mm made lip first, or inner to 30°, lip, inner on to
  90°. Only the stroke-by-stroke path differs, and so whether the brake can
  make it. (Simplification: the
  bend zone is drawn with the finished angle's allowance from the first hit.)

**When it helps and when it does not.** A part-way bend helps when something
stands in the tool's way at the **start** of the tight hit — the long side
swinging up into the ram, a flange standing where the punch comes down. On the
605.4 × 420.4 tray (t 1.2, lines 11 and 29 mm from the right edge) the lip
cannot be made after the inner bend at 90° (the body stands up beside the punch
and the ram meets it), nor after the inner bend at 45° (the ram, at about 79°)
or 60° (about 50°); after the inner bend at **30°** it clears, and the inner
bend is then finished from 30° to 90° cleanly. The angle you pick matters: try
it on the brake. It **cannot** help when the two flanges foul the punch in the
**finished** shape — the last hit ends in the same pose whatever came before
it. For that you need another order (here, simply the lip first, then the inner
bend, which clears with the straight punch), a narrower punch, or a different
part. Since TB-2 the brake tries the order and the part-way angle for you:
see the next section.

### When a bend will not go in

The brake tries the cures a bend shop tries, in the order a shop tries them,
each on its own collision check — nothing is offered that the brake has not
tried and seen clear (docs/sketch-studio-tight-bends.md §5).

1. **The order first.** It costs nothing: a lip is bent while the body still
   lies flat. When the hit you are setting up hits the ram, the punch, its
   holder, the die or the bed, the brake tries making it earlier — before the
   last hit you made, then before the one before that — and keeps the latest
   place where this hit clears _and_ every hit after it still clears. The card
   then has a button, **Make this hit before bend 1** (or "before step 3" when
   that step is a bend-on hit), and its words say "Bend this one earlier".
2. **A part-way bend second.** When no place in the order works, it tries your
   own method: one hit already made taken only part-way (60°, then 45°, 30°,
   15°, the largest that works), this hit, then that bend finished. Every one
   of those hits must clear. The button reads **Bend 1 to 60° first, finish it
   after this hit**. A round bend, a hit across several tabs, a bend already
   bent on, and the bend you are bending now are not taken part-way.
3. **The tooling third** — Turn the sheet around, another punch, a shorter
   punch or die — as before; these come with their own buttons.

**What the buttons do.** One click _arms_ the cure; nothing is changed yet.
The card says where the hit goes ("This hit goes in before bend 1: the view
shows the sheet as it is then", or "Bend 1 goes to 60° first and is finished
after this hit …") and the 3D and side views pose the sheet as it would really
be then: the later lines still flat, or bend 1 standing at 60°. The hit is
checked again in that state, with whatever punch and die you now choose, and
**Bend** makes it:

- _before bend 1_: the hit goes into the sequence at that place, the others
  shift down one row. One commit, one Undo.
- _bend 1 to 60° first_: in one commit, the hit is made, bend 1's own row is
  set to 60°, and a row "bend 1 on: 60° → 90°" is added after this hit. The
  panel then says "Bend 1 now stands at 60° and is finished in step 3." One
  Undo takes all three back.

**Cancel**, **Esc** (the first Esc only puts the armed cure down; your line
stays), or a new line (another edge, L, points, a segment toggled, Flip sheet,
another bend shape) disarms it. Changing the punch, the die, a length or the
angle keeps it armed, and the brake checks the hit again.

**When nothing works**, the card says so plainly: what was tried, then "No
order and no part-way bend clears it with this punch either: the shape cannot
be closed with the tools in this rack. Make the web wider or the flange
shorter, or use tooling this rack does not hold." Then the part needs a
design change (or a narrower or taller punch than the simulated rack has).

**A sequence that is already stored** (a saved file, a part made by data, or a
machine changed under it) shows "refused" on the row that collides. A moment
after the brake opens, that row gets the same two cures as buttons: **Move step
2 before step 1** or **Bend 1 to 60° first** (the bend-on row then goes right
after the refused step). They are tried on the whole new order: the button is
there only when that step then clears and no other step is refused.

Examples from the user's tray (605.4 × 420.4, t 1.2, lines from the right
edge): inner at 29 mm made first, then the lip at 11 → the card offers _Make
this hit before bend 1_; Bend makes the lip first, both rows ok, 577.47 × 420.4
× 20.14 mm. A tight Z (315 × 200, a 150 mm side up, a 15 mm web, a 150 mm side
down) → _Bend 1 to 60° first, finish it after this hit_. A 15 mm lip with a 15
mm web, in either order → no button, the "No order and no part-way bend" words.

## 4 · Paint

**Paint**: the current part is the target (or click the part, or pick its row
on the job board). When the part is in a group the panel offers the whole
group in one click — **Paint the whole Kiosk frame (9 parts)**: its own,
innermost group, the parts made here only (a bought-in item or a fastener is
not painted). Choose a RAL colour or a custom one, powder or wet, the gloss
and the film. Painting or stripping a part takes its prints off (they go on
after paint; the panel asks first). On show: the
painted area and the powder to spray; under Machine numbers the coverage
(1000 / (1.5 × µm) × 0.6 m²/kg) and the cure (200 °C part temperature for 10
min). A film outside 50 – 125 µm and holes
under 1 mm (they fill) are flagged.

## 5 · Print

**Print**: text or an uploaded image, its size, rotation, ink and
method (silk-screen, UV flatbed, pad), then click a flat face. Drag it on the
face. Flagged: artwork off the face, within 6.35 mm of its edge, over a bend
zone, silk-screen text under 9 pt.

## Putting the parts together

The shop welds and assembles; here the parts are simply put where they
belong, by hand, and nothing on the route has to be done first. In the Shop
tab, with no station open (Leave the station, or Esc), select a part:

- **Move part** (M) — drag the gizmo: an arrow, a plane square, or the centre
  handle in the screen plane. A part dragged near another **snaps** to it:
  face to face, flush, within about 8 mm (more on a large model). Typing a
  position, or Move by under a group, works too.
- **Rotate part** (R) — drag a ring to turn it about X, Y or Z; **]** and
  **[** turn it 15° at a time; Flip Horizontal / Flip Vertical turn it 180° in
  place.
- **More → Mate faces** — click a flat face of the part to move, then the face
  it sits against on another part: the two are put face to face (an offset
  if you want one), then Done. The same command as on the Assemble tab.
- **More → Group** (Ctrl+G) — the selected parts (Shift+click, or Ctrl+A for
  every part) become one group: a click selects the whole group, it moves,
  turns and paints as one, and the job sheet and the route take it as one
  product. **More → Ungroup** (Ctrl+Shift+G) splits a group one level. A
  group can hold groups (the kiosk: the frame inside the product).
- **More → Add bought-in item…** — a part the shop buys (a display, a lock, a
  fan): its name, W × D × H, colour and reference. It lands on the ground
  under the middle of the view (the camera does not move), in its own colour,
  and is selected, ready to move into place; the status line says so. It is
  never cut or painted, so on its own it is no product (no job board card, no
  route of its own): group it with its product (More → Group) and the job
  sheet lists it there as not made here.

Painted and printed parts move like any others: their paint and prints go
with them. **Fasteners** (screws, nuts, rivets) come from the Assemble tab's
**Add hardware**: pick the round holes they go in (drilled holes, and the
round cut-outs of a sheet-metal blank clear of every bend zone) and each is
seated in its hole, its head on the side you clicked; it then follows that
part. A laser-cut hole is known by its place in the blank's list of
cut-outs: if the outline is redrawn with its circles in another order, the
fasteners move to the holes now in those places. To check that nothing
overlaps, the Assemble tab's **Interference** lists any two parts whose
solids intersect.

## Replay — the whole route as a film

**Replay**, at the end of the route bar, plays the current product being
made, in the shop's order, without touching the model: every blank cut on
the laser bed (the head along its contours, copies of one part nested
together), every hit on the press brake with the side view (the earlier hits
already bent, the later ones flat), the powder arriving (a paint scene shows
the parts in the booth), each print; it ends on the finished product, where
the bought-in items and fasteners come on with the parts made here. A
caption over the view names each step in shop words ("Bend one long-side
flange up 90°, two tabs in one stroke", "Powder-coat the kiosk frame (9
parts) RAL 9005 Jet black", "Silk-screen “KIOSK” on the front cover").

The panel has **Play / Pause**, **Previous step** and **Next step**, the
**speed** (0.5×, 1×, 2×, 4×) and every step of the film: click one to jump to
it. **Esc**, **End replay** (in the panel or on the route bar) ends it and
everything is back as it was — the station that was open, the panel, the
camera, the selection. While it plays the stations, the job board, the tree
and the view settings wait, and Undo, Redo, New and Open are off: the film
changes nothing, so the model needs no rebuild and nothing is saved.

Each scene's length comes from the job sheet's estimate of the work, pressed
so a product plays in about a minute at 1× (the kiosk: 25 steps, ≈ 1 min 7 s;
the control box: 12 steps, ≈ 31 s): a hit plays at the machine's own speed
(about 2 s with the hold after it), a cut 3 – 4 s, a coat or a print 3 – 4 s,
with the result held a moment before the next. Replay is off, with the reason, on an empty workspace, with
no product chosen, or for a product with no laser blank and nothing done in
the shop.

## More · Job sheet

More → **Job sheet**: for each product — a top-level group or a lone part; a
fastener not yet in a product is not one — the route **Cut → Bend → Paint →
Print**, with a marker per step (✓ done, ◐ part done, ○ not yet, – not
needed), what was done (blank size and stock, cut length and time; each bend
with angle, direction, tooling and force; the finish with its area and
powder; each print with its method and size), the quantity per step (what the
step was done to: the oven cure is timed as one load but not counted, so
Paint reads 7 for seven painted parts) and the estimated time per step and
in total, their sum. Under the steps, **Not made here** lists what is in the
product but is not made in the shop, by label and count, untimed: "2 ×
Display (bought in), 16 × M4 × 12 pan head, 8 × M4 hex nut". **Batch**
multiplies everything but the oven cure (one load). **Download job sheet
CSV** writes it all, one row per item (and one per thing not made here).

A step counts as done when: Cut — every fabricated part of the product is a
cut blank; Bend — at least one hit was made (flat parts are named); Paint —
every fabricated part has a finish; Print — at least one print. Fabricated
means made in the shop: not bought in and not hardware, so a bolt or a
bought-in display never leaves Cut or Paint part done. Print, optional, is
**not needed** while the product has no print (the route bar and the job
board's pips show the same dash). A product is done when every step it needs
is ("All steps done").

Estimated times: the laser's cut time; each press brake hit its stroke at the
machine's speeds plus **20 s handling** (an estimate: pick up, gauge, turn
over); paint the oven cure only; each print **60 s** (an estimate: load,
register, print, unload; screens and plates not counted). **Welding and
assembly are not counted**, nor are rapid moves, set-ups and transport. In
the cut list a bought-in item reads "Bought in"; the workshop ZIP gives it no
cutting profile and never nests it.

## More · Drawings

Drawings (or the Shop route's More) → **Flat pattern sheet** (with a sheet-metal part selected) makes a
drawing of the flat blank: outline and cut-outs in the sketch's own X and Y,
every bend line (dash-dot) with its label, the overall blank dimensions and a
bend table in the order made (angle, direction, inside radius, allowance,
deduction, punch and die). It fits to the page, exports to PDF, SVG and DXF
like any sheet, and the view kind **flat** can be chosen on any sheet whose
subject is a sheet-metal part. A round bend draws its centre line with the label
("UP 90° R40 · 13 hits") and the two tangent lines where its zone starts and
ends (thin and continuous, unlabelled); its table cell reads "R40.00 · 13 HITS".
The flat DXF (Manufacture) writes the tangent lines on the BEND layer with
the centre line.

## More · The examples

- **Example: pump bracket** — a channel folded from a flat A5052 blank.
- **Example: control box** — a 160 × 100 × 25 mm SPCC 1.2 enclosure: the body
  folded from one blank with corner reliefs and four bends (the side walls
  gauged off the blank's ends, the front and rear by two points), four Ø5.5
  mounting holes and a Ø12.5 cable entry (the front and rear flanges stop
  0.1 mm short of the side flanges: the fit-up gap at each corner); a lid with
  two flanges folded down, sitting on the body's walls; body and lid one
  group, "Control box"; both powder-coated RAL 7035; a logo (UV flatbed) and a
  "CONTROL BOX" label (silk-screen) on the lid; etched bend lines; a
  flat-pattern sheet. Its job sheet shows every step done.
- **Example: kiosk** — a double-sided screen kiosk like the shop's photo,
  made through the whole route: see the walk-through below.

## Walk-through: the kiosk

**More → Example: kiosk** loads a product modelled on the shop's photo of
the kiosk frame and its design proposal (two screens back to back, an
A-frame, white lower covers with a printed name). **It is sized by eye from
the two photos**: no drawing came with them. The numbers are the named
sizes of `KIOSK` in `src/features/sketchstudio/cad/shopExamples.js`; change
them there for the shop's real ones and the whole route (blanks, bends,
poses, fixings) is laid out again from them:

| Size                          | Default                                    | What it is                                                                                                                          |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `width`                       | 640                                        | the face frames' outside width                                                                                                      |
| `height`                      | 1700                                       | floor to the top of the face frames                                                                                                 |
| `depth`                       | 110                                        | front face to rear face, outside, across the screen housing                                                                         |
| `thickness`, `stock`          | 1.5, SPCC                                  | face frames, shelf, base channels                                                                                                   |
| `flange`                      | 40                                         | the face frames' return flanges (both sides and the top)                                                                            |
| `corner`                      | R30, legs 15                               | the face frames' round top corners: the outside radius and the corner pieces' straight legs                                         |
| `creaseHeight`, `creaseAngle` | 760, 15°                                   | where the lower face leans out, and by how much                                                                                     |
| `screen`                      | 480 × 620, R12                             | the screen window (W × H), centred on the upper face                                                                                |
| `lowerWindow`                 | 440 × 420, R12                             | the lower window, centred on the lower face                                                                                         |
| `display`                     | 520 × 660 × 40, inserts 12 in              | the bought-in display; its four M4 inserts                                                                                          |
| `shelf`                       | top at 715, flanges 30 and 20              | the shelf tray                                                                                                                      |
| `base`                        | 50 high, 80 wide, 40 in, 40 past the faces | the two base channels                                                                                                               |
| `cover`                       | t 1.2, flanges 15, 30 past the window      | the lower covers                                                                                                                    |
| `hole`, `fitGap`, `text`      | Ø4.5, 0.1, KIOSK                           | the M4 clearance holes, the face frames' fit-up gap (the least the panel maker keeps between folded flange ends), the covers' print |

What it holds (37 instances in one product group "Kiosk", the frame a group "Kiosk frame" inside it):

- **Two face frames** (one part made twice): Draw → Flanged panel, a 1675 ×
  640 face drawn lying down (the laser never turns a blank, and the
  1712 × 715 blank only fits the 1219 × 2438 sheet along its length), 40 mm
  flanges up on both long edges and the top, its two top corners round (R30
  outside: the flanges stop 45 mm short of each sharp corner and the face is
  cut back round the arc), a 15° crease down 735 mm from the bottom edge, the
  two windows, four M4 holes round the screen window and four round the
  lower one. Four hits each: the two side flanges (two tabs each, the flange
  is notched at the crease), the top flange, then the crease; 176 kN for the
  side strokes on the 50 t × 2 m press.
- **Four corner pieces** (one part made four times), closing the screen
  housing's rounded top corners: a 75.9 × 40 mm strip with one round bend
  up 90°, R28.5 inside (R30 outside), made in 10 bump hits of 9° in the V10
  die, two 15 mm straight legs. Folded 45 × 45 × 40; each is set in its
  corner, its outside flush with the side and top flanges' outsides, its
  legs against the flange ends, its inside on the face's cut-back.
- **A shelf tray** (632.8 × 146.6, its front and rear flanges bent down 75°
  so they lie on the leaning lower faces, its sides down 90°) and **two base
  channels** (570 long, 80 wide, 50 mm legs down) under the faces' bottom
  edges.
- **The frame**: the two face frames, the four corner pieces, the shelf and
  the two channels (9 parts) are one group, "Kiosk frame", in place (the
  shelf's flange tips on the faces, the faces' bottom edges on the
  channels), moved and painted as one.
- **Paint**: the frame (9 parts) RAL 9005 Jet black (textured powder, 80 µm),
  the covers RAL 9003 Signal white (satin).
- **Print**: "KIOSK", 180 × 40 mm, silk-screen, on each cover's outside,
  where it shows through the lower window.
- **Put together**: each display (Add bought-in item, 520 × 660 × 40) on
  its face frame's four holes, held by four M4 × 12 pan-head screws from
  outside; each cover (a flanged tray behind the lower window) on its four
  holes, held by four screws and four M4 nuts. 24 fasteners in all, each in
  a laser-cut hole; the displays, covers and fasteners are in the "Kiosk"
  group with the frame.

Walk it:

1. **Route bar**: every station reads done ("5 outlines", "11 blanks", "64
   hits" — each corner piece's round bend counts its 10 hits —, "RAL 9005,
   RAL 9003", "2 prints"); More → **Job sheet** says All steps done, with
   the estimated times, and lists what is not made here (2 displays, 16
   screws, 8 nuts).
2. **Draw** shows the outlines; **Cut** asks which part, then puts it on the
   laser bed (Cut plays the head along the face frame's eleven contours,
   the windows and holes first).
3. **Bend** asks which part, then says the face frame is finished here and
   lists the hits made on it ("1 · UP 90° R1.6 · 2 flanges" … "4 · DOWN 15°
   R1.6") with its folded size; **Watch the bends** plays its four hits on
   the press brake. To bend one yourself: Draw → Flanged panel with the
   numbers above → Cut the blank — I will bend it, and click its four etched
   lines at the brake in order. On a corner piece the card lists its one hit,
   "1 · UP 90° R28.5 · 10 hits", and Watch the bends plays the ten hits.
4. **Paint** and **Print** show the finishes and the two prints; clicking a
   face frame in the booth offers the whole Kiosk frame (9 parts).
5. **Putting it together**: click the kiosk to select it, or double-click
   into a group for one part; Move part, Rotate part and More → Group work on
   them as on any part. The Assemble tab's **Interference** finds no two
   parts overlapping.
6. **Replay** plays it all, from the five blanks on the laser to the
   finished kiosk, where the displays and the fasteners come on (25 scenes;
   the corner pieces' round bend is one scene with its ten hits inside).

## Limits

What this simulation does not do, and the rules of thumb it uses:

- Bends are straight-line air bends only: no hems, rolling, stamping, louvres
  or staged tooling. Holes inside a bend zone are flagged, not deformed.
- Round bends are bump bends with the ordinary punch and die, or one hit of
  a radius punch (R10 – R30) in a wide 60° die: no urethane die, no plate
  rolls (very large radii are better rolled), no cones or radii that change
  along the line. A radius punch's springback and lift-off from its nose are
  not modelled; the 2.2 × (R + t) die rule is a vendor rule of thumb. The hit count, the 10 mm lift
  between hits, the 3 s per further hit and the 2.5 × pitch die warning are
  rules of thumb. A large radius springs back much more than the springback
  readout shows (it stops growing at r/t = 8): the per-hit figure is display
  only. Part-way, the 3D scene, the side view and the collision check sit the
  hit in the die with its two sides symmetric on the shoulders, as for an
  ordinary bend; the curve already made is not rested on the die.
- The collision check opens a part's cut-outs (a tab bends up through its
  own window); a piece whose cut-outs do not triangulate cleanly keeps them
  closed, erring toward caution. Before SF-3 every cut-out was closed and a
  tab in the middle of a plate reported a die collision.
- Box bending (SF-3): the punch, its 100 mm holders and the die are sectional
  (set up only under the hit), the ram a 60 mm beam over the whole bed above
  the holders. The deepest flanges the standard set-up clears, measured with
  the panel maker on the 50 t × 2 m press, straight punch, t 1.5 SPCC: a 600
  × 1400 face frame with four flanges, 98 mm (deeper, the bottom flange's
  stroke brings the side walls over the holders into the ram); with a 12°
  down crease bent last, 81 mm (deeper, the flanges hang below the 80 mm die
  onto the bed). The control box layout (160 × 100) clears up to 81 mm deep
  (deeper, its last wall swings into the holders). Before SF-3 the ram sat on
  the punch and boxes deeper than about 25 mm hit it.
- The punch holders' width across the bed (26 mm, the punch's clamp
  shoulder) is an assumption: no catalogue read states it. The holder height
  (100 mm) and the tall punch (105 mm, Tecnostamp 11.228) are sourced
  (docs/sketch-studio-fab-shop.md §12); the tall punch's body is drawn as the
  straight blade (assumed). The two goosenecks are drawn as the Tecnostamp
  catalogue draws them (11.147 and 11.148, docs/sketch-studio-fab-shop.md
  §12); their tang is not modelled: the holders stand centred on the punch
  line for every punch (the catalogue's tang sits 13.5 mm behind the tip).
- Punch and die length (docs/sketch-studio-brake-tool-length.md): one trim
  per end for every section of a tool (not a different trim at each end, no
  sliding along the bed, no segment library, no horn segments that reach
  under a return lip). The 10 mm shortest section is the Amada sectionalized
  set's (Tooling Price List 2025). The "covers at least half the bend" rule
  is this simulation's own (no sourced limit); ends left unpressed are a
  note, their opening is not modelled. The deepest tray side the tallest
  set-up clears is about 150 mm (the deep gooseneck, 145 + 100 mm under the
  ram); there is no taller holder or riser yet.
- When a bend will not go in (docs/sketch-studio-tight-bends.md §5): the
  brake moves only the hit you are setting up (or one refused row of a stored
  sequence) and opens at most one bend part-way, at 60°, 45°, 30° or 15°. It
  does not search a whole part's order, open two bends at once, or try another
  punch together with another order. The tries take one pause once the line
  is still, longer on parts with many hits made where nothing works (about
  0.4 s measured with seven).
- A flange along an oblique edge (a trapezoid side) crossing a crease is
  two strokes, not one: the crease's deduction moves its two tabs a fraction
  of a millimetre apart along the edge, so they are not on one flat line.
- The Flanged panel lays out convex faces with parallel creases, flange
  angles up to 90°, windows clear of every bend. A round corner is a square
  corner between two 90° flanges of one depth, closed by a corner piece (not
  a flange bent round, and not one strip wrapped round the whole housing);
  the face's arc is cut as short straight chords on the arc, no more than
  0.05 mm inside it.
- There is no Weld station and no Assembly station: no seams, no weld or
  assembly time, no order in which the parts go on. Welding and assembly are
  shop work this visualisation leaves out; the parts are put in place by hand
  (Putting the parts together) and the job sheet says it does not count them.
  A file saved while the shop had those stations still opens: its seams and
  assembly steps are left out, its weldments become ordinary groups, and
  every part stays where it stood.
- Springback is a readout, not animated. The collision check ignores holes
  (it errs toward caution).
- On the press brake, Enter is the pedal only when no field has focus.
- Several constants are rules of thumb: the K-factor table, the springback
  scaling, the ram depth, the tonnage constant (1.42), the RAL screen colours,
  the laser speed table (one vendor), kerf and pierce times, the 20 s bend
  handling and 60 s print handling.
- The laser times only pierces and cutting: no rapid moves, lead-ins,
  micro-joints or common-line cutting; nesting is the simple shelf packer
  (rows, never rotated), not an optimiser. Etching is not timed.
- The Unfold preview shows only the blank's own cut-outs, not holes drilled
  after bending.
- Prints do not appear on drawing sheets; nothing from paint or print goes
  into STEP or STL.
- Large image prints make the browser's autosave copy large (it may hit the
  storage quota).
- The drawing sheet's ordinary "top" view of a part looks with Y down; the
  flat pattern view and the flat DXF use the blank's own X and Y.
- No costs in currency, no paint masking per face.
- A fastener is seated in one hole (it follows that part). A bought-in part's
  threaded inserts are drawn as plain clearance holes (the kiosk's displays:
  Ø4.5 blind holes).
- The kiosk is sized by eye. Its face frames' side flanges end square to the
  leaning lower face, so at the floor their ends hang about 10 mm below the
  bottom edge, beside the base channels (a shop would trim them level). Threads,
  torque, washers that are not placed and nut runs are not modelled. A
  laser-cut hole in a bend zone takes no fastener.
