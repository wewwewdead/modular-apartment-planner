# Assembly editor UI overhaul

Spec for the wall and ceiling assembly editors (`WallDetailEditor`, `CeilingDetailEditor`).
Written 2026-11-11 from a headless walkthrough of both editors at 1600×900 and 1366×768.

The user's complaint, verbatim: "the UI and UX there is terrible to use. I want it to be more
intuitive and easy to use. also improve the colors and make it more professional."

This is a presentation and layout pass. No domain, geometry, store, persistence, export or
tool-behaviour change is in scope.

## 1. What is wrong today (measured)

| Problem                                 | Evidence                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The drawing gets a sliver of the screen | Split view canvas frame is 244 px tall at 1366×768 and 348 px at 1600×900. Above it: 84 px header, 80 px two-row tool palette, 44 px view/snap/layers row, 30 px status row. Below it: a ~50 px readout bar, then the 3D pane.                                                                                                           |
| Text is too small to read               | Wall editor: 539 of 576 non-SVG text elements compute to ≤ 10 px (205 at 8 px, 179 at 9 px, 155 at 10 px).                                                                                                                                                                                                                               |
| The left panel is an endless accordion  | `scrollHeight` 2440 px (wall) / 1512 px (ceiling) with every step opened; a "Workflow" pill strip wraps to two rows above it and duplicates the section headers under it.                                                                                                                                                                |
| Colours are off-system and noisy        | ~250 hard-coded hex values in `WallDetailEditor.module.css`, none from `src/styles/variables.css`. Dark navy shell + mint accent + orange hint text + yellow + red, wrapped around a light 3D pane, opened from a light app. Mint is used for active tool, step badges, eyebrows, snap state and focus rings alike, so it means nothing. |
| The 3D pane wastes its own space        | In split view its header (two rows of mode toggles + selects), a "Live wall preview" badge, a "Selected object" card, and a two-line footer leave the model ~100 px of picture. Several of those controls (Walk, floor scope) are meaningless for one wall.                                                                              |
| Section header grid bug                 | `.sectionHeader` is a 4-column grid that assumes a step badge. Right-panel sections have none, so the title lands in the `auto` column, the count badge stretches across the `1fr` column (the wide red "66" bar) and the chevron hugs the title.                                                                                        |
| Jargon                                  | "Wall-local assembly editor", "Construction-detail workspace", raw ids (`wall_mmhou12u_i7`) in the header.                                                                                                                                                                                                                               |

Reference screenshots of the current state (read them before starting):
`C:\Users\johnm\AppData\Local\Temp\claude\C--Users-johnm-modular-apartment-planner\34247c3d-bc25-44a8-8e0f-3a7a007f9c8e\scratchpad\shots\`
— `10-wall-editor.png`, `13-wall-editor-board-selected.png`, `17-wall-editor-1366.png`, `20-ceiling-editor.png`.

## 2. Design direction

One sentence: **the editor becomes a quiet, light drafting workspace in the app's own design
language, where the drawing owns the screen and the chrome fits in two fixed rows.**

### 2.1 Theme: light, on the app's tokens

The floorplan workspace is light (warm paper `#fafaf8`, panels `#f4f3f0`, ink `#1e2433`, teal accent
`#1a7a68`, Manrope + JetBrains Mono). The editor opens from it and embeds its light 3D pane, so it
adopts the same language instead of being a dark island.

Every colour in the editor goes through a semantic token layer declared once on `.overlay`
(prefix `--ae-`), with values taken from `variables.css` wherever a matching variable exists.
After this pass **no hex/rgb literal may appear in `WallDetailEditor.module.css` outside that token
block**. A dark variant is NOT built now; the token layer is what makes one a single-block addition
later.

Roles (suggested values; tune by eye, but keep the roles and the contrast floor):

| Token role                                               | Use                                                                                       | Start from                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--ae-bg`, `--ae-surface`, `--ae-surface-sunken`         | panel ground, cards/controls, wells                                                       | `--color-panel-bg`, `--color-surface-elevated`, `--color-panel-bg-alt`                                                    |
| `--ae-border`, `--ae-border-strong`                      | hairlines, control outlines                                                               | `rgba(0,0,0,.08)` / `.16`                                                                                                 |
| `--ae-text`, `--ae-text-2`, `--ae-text-3`                | primary, secondary, tertiary                                                              | `--color-text-primary/secondary/tertiary`                                                                                 |
| `--ae-accent`, `--ae-accent-hover`, `--ae-accent-subtle` | the ONE interactive colour: active tool, active step, focus ring, primary button, toggles | `--color-accent*`                                                                                                         |
| `--ae-selected-line/face/wash`                           | the selected piece on the drawing, and only that                                          | orange family of today's `#ffb45c` (see 2.4)                                                                              |
| `--ae-warn*`, `--ae-danger*`, `--ae-ok*`, `--ae-info*`   | status only: checks, clashes, tolerance, destructive buttons                              | `--color-warning/danger/success/info` darkened for text                                                                   |
| `--ae-canvas`, `--ae-canvas-sheet`, `--ae-canvas-halo`   | void around the drawing, the wall/ceiling backdrop rect, text halo                        | a neutral slightly darker than the panels so light boards read against it                                                 |
| `--ae-grid-minor/major`, `--ae-ruler-*`                  | grid, rulers                                                                              | `--color-grid-minor/major`                                                                                                |
| `--ae-dim-user`, `--ae-dim-auto`, `--ae-dim-selected`    | dimension linework and text                                                               | user = `--color-active-glow` (ink blue), auto = a muted neutral, selected = selection orange (darkened for line contrast) |
| `--ae-frame-fill/line`, `--ae-guide`, `--ae-snap`        | framing wash, construction guides, snap acquisition                                       | tuned for the light canvas                                                                                                |

Rules:

- Text ≥ 4.5:1 against its ground; glyphs, control borders and canvas linework ≥ 3:1.
- Hints and helper copy are neutral secondary text. Orange/amber is never used for plain
  instructions (today's status hint is orange and reads as a warning).
- Material tints computed in JS (`faceColor`, fastener head colours, board fills in
  `CeilingPlanLayers`) are materials, not chrome: leave them.
- Chrome/guide colours hard-coded in JSX (`#202830` backdrop rects, `#ffb85c` / `#67c5a6` /
  `#72d0f5` / `#ffd166` guides, `CeilingPlanUnderlay` fills, `LIGHT_GUIDE_COLOR`,
  `FIXTURE_SYMBOL_COLOR`) move to classes or `var(--ae-…)`, or are retuned for the light canvas if
  they must stay constants. Tests that pin the old hex values are updated to the new ones.
- Every SVG text halo (`paint-order: stroke fill`) switches to `--ae-canvas-halo`; a dark halo on a
  light canvas is the most likely visual regression, so check each one.

### 2.2 Type and density (match `properties/PanelKit.module.css`)

- UI base 13 px; field labels 12 px; hints/meta/kbd 11 px. **Nothing in the dialog's HTML computes
  below 11 px.** Ruler labels on the canvas go to 10 px.
- Section titles: 13 px semibold, sentence case. Drop the all-caps letter-spaced 10 px headings.
- Mono (`--font-blueprint`) is for numbers and measured values only, never whole sentences.
- Controls 30 px tall; field label gutter ~104 px; side panels 280 px (left) and 320 px (right).

### 2.3 Layout: the drawing owns the screen

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ← Back to plan   Wall i7 · Inside face   3704 × 3000 mm · Fibre cement     │ 48 px
│                                              [Export ▾] [Focus] [Close ✕]  │
├──────────┬───────────────────────────────────────────────┬────────────────┤
│ Steps    │ tools … │ undo redo delete │      [2D|Split|3D] │ Selection      │ 44 px toolbar
│ 1 Face   │ ⌖ Select — hint… · selection   Snap Grid Layers  − 100% + Fit  │ 32 px context bar
│ 2 Assem. │ ┌───────────────────────────────────────────┐ │ Takeoff        │
│ ▾3 Boards│ │ drawing                                   │ │ Checks         │
│   body   │ └───────────────────────────────────────────┘ │                │
│   Next → │ ┌ 3D (compact chrome) ──────────────────────┐ │                │
│ 4 Framing│ └───────────────────────────────────────────┘ │                │
└──────────┴───────────────────────────────────────────────┴────────────────┘
```

**Header (48 px, one line).** Left: a "Back to plan" control, then the object's human name and the
face ("Wall i7 · Inside face" — the 3D pane's inspect card already derives "Wall i7"; reuse that
naming, never show the raw id), then one muted meta line item (size · board). Right: Export (one
button opening a two-item menu: Drawing SVG, Takeoff CSV — wall only), Focus, Close. The eyebrow
and the "Wall-local assembly editor" / "Ceiling assembly editor — reflected ceiling plan" titles go.
Keep the dialog `aria-label`s as they are.

**Toolbar (44 px, never wraps).** Drawing tools grouped as today (thin dividers between groups),
then Undo / Redo / Delete as icon-only buttons, then a spacer, then the view switch as a segmented
control (wall: Elevation · Split · 3D; ceiling: Plan · Split · 3D). Tool buttons are icon + label;
when the row would overflow, labels collapse to icon-only via a container query — the row keeps its
height at every width from 1280 to 1920. The shortcut letter stays visible on each tool as a quiet
11 px key hint (no boxed badge), and in the tooltip.

**Context bar (32 px, never wraps).** Left: active tool chip, its hint, the snap acquisition chip
when snapped, the selection summary — all `nowrap` with ellipsis, the hint yielding first. Right:
Snap toggle, Grid step select, a Layers menu (checkbox list in a popover; 5 layers on the wall, 9 on
the ceiling), zoom − / % / + / Fit. The static shortcut reminder sentence moves into a "?" popover
at the far right, together with the origin/face note from the old readout bar.

**The readout bar under the canvas (`.dimensionBar`) is removed.** Its one live alert ("N framing
members inside an opening") becomes a danger chip in the context bar; origin/face text goes to the
"?" popover; the U/V extents are already on the rulers.

**Split view** keeps elevation above, 3D below, but at about 62/38 and with the 3D pane's chrome
compacted (2.5). No draggable splitter in this pass.

**Left panel = the steps, one open at a time.** The `StepStrip` pill row is removed: the collapsed
section headers ARE the workflow map (number, title, live summary). Opening a step closes the other
steps in the left panel (exclusive accordion); bodies stay mounted and `hidden` as today, so nothing
is lost and DOM tests keep finding controls. Each open step ends with a "Next: <step>" button (last
step has none). Un-numbered optional sections (wall "Accent panels") keep their place in the order
with an "Optional" tag instead of a number. The first-run orientation card shrinks to two lines plus
"Got it" (same storage key).

**Right panel = the inspector.** Selection first and always open (not collapsible). Takeoff metrics
become a compact two-column readout list (label left, mono value right, the note as secondary text)
instead of a grid of tall cards. Checks keep their list but with calm severity styling: a thin left
rule and a small severity label in `--ae-warn` / `--ae-danger`, count badge sized to its content.
Fix the section-header layout so title flexes, badge is content-sized and the chevron sits at the
far right, with or without a step number.

**Focus mode** (panels as drawers, peek tabs, tool HUD) keeps working exactly as today; only restyled.

### 2.4 Selection colour

Selection orange is shared with the 3D pane (`SELECTION_ACCENTS.assembly` in
`buildPreviewObjects.js`, `#ffb45c`). Keep the 3D constant. On the light canvas keep the same hue
family but give the LINE enough contrast (a deeper orange); the face/wash may stay near today's.
The long-standing rule stands: **selection and hover change colour and fill, never line weight**
(`--cad-frame-line` / `--cad-board-line` / `--cad-profile-line` are untouched).

### 2.5 3D pane inside an assembly editor

`ThreePreviewPanel` already knows it is embedded (`assemblyDriven`). Under that flag only:

- one compact header row: Solid / X-ray / Wire, Lights / Night, render-style select, Reset view;
- hide the title group, Inspect / Walk toggle, the floor-scope select, the "Selected object" inspect
  card and the footer hint lines (move the orbit/pan/zoom hint to the Reset view button's tooltip);
- the editors' own `.liveBadge` overlay is removed.

Chrome only. Do not touch view-mode state, `sourceKey`, the scene cache, or anything the model
workspace's preview renders. The non-assembly preview must look exactly as it does now.

### 2.6 Kit

`WallDetailUiKit.jsx` stays the single kit. Add what the layout needs (a small `Popover`/menu, a
`SegmentedControl`, an icon-only button variant, a readout row) there, styled from tokens. Keep
`NumberField` / `SignedNumberField` on `useNumericDraft` unchanged in behaviour.

Popover Escape trap: both editors listen for keys on `window` in the capture phase and treat Escape
as "cancel gesture / return to Select". An open popover must close on Escape (and on outside
pointer-down) without that handler also firing, and without the popover swallowing Escape when it is
closed.

## 3. Constraints that must survive (each has bitten before)

1. **Nothing in the workspace rows may change height with editor state.** The canvas contain-fits
   its frame via `useWallCanvasMetrics` (ResizeObserver); a row that wraps or grows re-scales the
   drawing and looks like a zoom. Toolbar and context bar are fixed-height and `nowrap`.
2. **Pointer math is off limits.** `gestureRectRef` pinning, `eventToLocal`, `CANVAS_FIT_MARGIN`,
   ruler geometry: unchanged. New overlays must not sit inside `.canvasFrame` (it owns pan/zoom
   pointer handlers) unless they are `pointer-events: none`.
3. **Memo boundaries.** `CeilingPlanLayers`, `CeilingLivePreview`, `WallLivePreview` are `memo`'d
   and take primitives / ref-bridged callbacks so panning stays ~6 ms. Do not pass them new object
   or inline-function props.
4. **Shell-first mount.** `DetailEditorShell` (+ `wallDetailEditorShell.jsx`,
   `ceilingDetailEditorShell.jsx`) paints the same grid before the editor exists "so the swap moves
   nothing" (`docs/loading-states.md` §5.4–5.5). It must mirror the new header/toolbar/context-bar
   heights and panel widths, and the skeleton tone must match the light theme.
5. **No tool, gesture, loader or save flow changes.** `docs/state-machines.md` is the registry;
   nothing in it should need editing. Keyboard shortcuts are unchanged.
6. **CAD line weights and unitPx sizing** on the canvas are unchanged; only colours move.
7. **Tests are updated, never deleted.** Where copy or structure changes on purpose (header title,
   step strip, readout bar, pinned hex), update the assertion to the new truth and keep the coverage.
8. `src/export/wallDetailExport.js` (the exported SVG/CSV) is out of scope.

## 4. Phases

**AE-1 — foundation + wall editor.** Token layer and full restyle of
`WallDetailEditor.module.css`; kit additions; `DetailEditorShell` + wall shell; wall editor layout
(header, toolbar, context bar, exclusive steps, inspector); 3D pane compact chrome. The ceiling
editor shares the stylesheet and kit, so it must keep rendering and passing its tests at the end of
AE-1 (its own layout moves in AE-2 — do not remove a class or kit export it still uses).

**AE-2 — ceiling editor.** Same layout applied to `CeilingDetailEditor.jsx` and its shell;
`CeilingPlanLayers`, `CeilingPlanUnderlay`, `CeilingLightPlacement` colours retuned for the light
canvas; then delete the classes and kit exports nothing uses any more (`StepStrip`, `.dimensionBar`,
`.liveBadge`, …).

## 5. Acceptance (checked in a real browser, both editors)

1. Split view canvas frame height ≥ 370 px at 1366×768 and ≥ 450 px at 1600×900 (today 244 / 348).
2. No non-SVG text element inside the dialog computes below 11 px.
3. No hex/rgb literal in `WallDetailEditor.module.css` outside the `--ae-*` token block.
4. Left panel does not scroll at 1600×900 in its default state; at most one step is open.
5. Toolbar is 44 px and context bar 32 px at 1280, 1366, 1600 and 1920 px window widths, and
   selecting / deselecting a piece or switching tools does not move the canvas frame by a pixel.
6. Section headers: chevron at the far right, badge content-sized, in both panels.
7. The model workspace's 3D preview is pixel-identical in layout to before (non-assembly path).
8. `npx vitest run src/features/floorplan/components/wall-detail src/features/floorplan/components/ceiling-detail src/features/floorplan/components/preview`,
   `npm run lint` and `npm run build` pass.

## 6. Driving the editors for screenshots

Dev server: `npx vite --port 5199 --strictPort` (may already be running). Playwright with
`chromium.launch({ channel: 'chrome', headless: true })` — installed Chrome, fresh profile.
Working scripts (copy, do not rewrite):
`…\scratchpad\shoot.js` (wall: `/playground` → geometric wall hit-test → set the Assembly select to
`fiber_cement` → "Design Inside Face") and `…\scratchpad\ceiling.js` (ceiling: "Add Ceiling" → trace
four points → expand the sidebar's Ceilings list → Edit), both under
`C:\Users\johnm\AppData\Local\Temp\claude\C--Users-johnm-modular-apartment-planner\34247c3d-bc25-44a8-8e0f-3a7a007f9c8e\scratchpad\`
(`playwright` is installed in that folder's `node_modules`; run with `node shoot.js` from there).
With the editor open, the floorplan canvas is still in the DOM behind it: scope selectors to
`[role="dialog"]`.

## 7. AE-1 as built (2026-11-11)

Wall editor + foundation shipped as specced; measured in headless Chrome on `/playground`
(wall i7, fibre cement). Before → after: split canvas frame 244 → 399 px at 1366×768 and
348 → 481 px at 1600×900; dialog HTML text ≤ 10 px: 539 elements → 0 (sizes now 11/12/13/15/16 px);
toolbar 44 px and context bar 32 px at 1280 / 1366 / 1600 / 1920, neither overflowing; canvas frame
rect identical across select / deselect of a board, stud, screw and dimension, every tool switch and
every draw preview; left panel `scrollHeight` 852 = `clientHeight` 852 by default (one step open);
model-workspace 3D pane: all 60 element boxes identical before / after.

Deviations and judgment calls:

- **Token block has a second selector.** `.overlay[aria-label='Ceiling assembly detail editor']`
  re-declares the _canvas_ tokens with the old dark values, because the ceiling plan still paints its
  own `#202830` backdrop and dark-tuned `CeilingPlanUnderlay` / `CeilingPlanLayers`. It is the
  "dark variant is one block" the token layer promised, scoped to the ceiling; AE-2 deletes it after
  retuning those files. Both blocks sit at the top of the file; nothing below them holds a literal.
- `--ae-text-3` is `#646976`, not `--color-text-tertiary` (`#6e7280` is 4.32:1 on the panel ground).
- Selection: line `#b25800` (3.5:1 on cream board), face `#efb478` unchanged, wash 0.6. User
  dimensions are ink blue (`--color-active-glow`), automatic ones `#5d6676`, selected orange; the help
  copy that said "amber line" now says "blue line" (and its test).
- **Tool labels collapse earlier than hoped.** With labels the palette is 932 px plus the 169 px view
  switch, so labels only fit from a ~1150 px toolbar (window ≈ 1750 px). At 1280–1600 tools show icon
  - key; a tighter tier applies below 760 px; icon-only below 600 px is never reached in 1280–1920.
    The key hint is never dropped. Tools in each step body keep their labels.
- Context bar below 900 px (1280, 1366 windows) hides the tool hint outright (an 8-character stub was
  noise; the chip names the tool, the button tooltip has the hint) and the "Grid" / "Layers" words.
- Header keeps "Focus canvas" / "Show panels" rather than a bare "Focus". "Back to plan" and "Close"
  both dispatch `CLOSE_WALL_DETAIL_EDITOR`.
- 3D compact chrome also drops the compass (its N/E/S/W labels are 10 px HTML and it ate ~85 px of a
  ~250 px picture); the needle ref is null-safe. The wall pane's placeholder is `paper` tone (a string
  prop through `WallLivePreview`, memo-safe).
- Popover bodies stay mounted and `hidden` (like section bodies), so the layer toggles and the "?" note
  are always in the DOM. The help note restates the shortcuts as key → action pairs; the static test
  assertions were rewritten to the new phrases.
- Orientation card: one row (title + Got it) and one line of text; the six-item list is gone.
- Default left state opens only step 1 (it used to open 1 and 2). "Next" skips the optional Accent
  panels step; the accents step's own Next goes to Framing.
- Shell: `DetailEditorShell` now paints the new grid for both editors, so the ceiling's shell → editor
  swap shifts until AE-2 moves the ceiling's toolbar. The wall shell has no size line (a beam-fitted
  wall's drawn height is only known after derivation). `eyebrow` is accepted and ignored.
- Left ruler labels at 10 px overran the 34 px ruler from their `x = 21` anchor; CSS slides them 7 px
  right (above the tick, not across it). Anchor, tick math and ruler size are unchanged.
- Small fixes found on the way: the accent tool's drag rectangle had no style (it drew in the SVG
  default black) and `draw_accent` was missing from the crosshair cursor list; the "interior board"
  field label is now "Inside board".
- Not fixed (out of scope, pre-existing): the pointer chip reads "1194.00 mm × 1150.00 mm mm"
  (`formatMm` already carries the unit); the checks list logs duplicate React keys
  (`WALL.PRODUCT_PROFILE_NOT_FULLY_VERIFIED:wall:…` appears twice).

## 8. AE-2 as built (2026-11-11)

Ceiling editor moved to the AE-1 layout, its canvas retuned for the light ground, the AE-1 bridge
code deleted, and the two audit items done. Measured in headless Chrome on `/playground` (a traced
2800 × 3000 mm ceiling); wall re-measured with the AE-1 script.

- Ceiling split canvas frame: 481 px at 1600×900, 399 px at 1366×768 (plan-only 776 px at 1600).
  Shell → editor swap: header, toolbar, context bar, plan pane, 3D pane and left panel rects are
  identical between the opening shell and the editor.
- Dialog HTML text ≥ 11 px in both editors (ceiling: 11/12/13/15 px only).
- `WallDetailEditor.module.css`: one token block, no hex/rgb literal outside it (the
  `.overlay[aria-label='Ceiling…']` dark block is gone).
- Ceiling left panel `scrollHeight` 852 = `clientHeight` 852 by default (step 1 open).
- Toolbar 44 px and context bar 32 px at 1280 / 1366 / 1600 / 1920 for both editors, no overflow;
  ceiling canvas frame unchanged across select / deselect of a board, furring member, screw, light and
  opening, every tool switch, and every draw preview (board, furring, carrier, opening, trace, measure,
  light ghost, light row).

Deviations and judgment calls:

- **Toolbar density tiers** (container queries measure the content box, i.e. the bar less its 20 px
  padding). Names go last: full → names without the key hint → icon + key → tighter → icon only.
  Wall: full ≥ 1133, names 957–1132, icon + key ≤ 956 (1600 px window → names, 30 px spare).
  Ceiling has its own breakpoints and a slightly tighter names tier (5 px tool padding, 2 px cluster
  padding): full ≥ 1215, names 976–1214 (1600 px window → names, 12 px spare), icon + key ≤ 975,
  tighter ≤ 770, icon only ≤ 690 — so a 1280 px window shows the ceiling's tools as bare icons
  (tooltips and accessible names carry them); its icon + key row needs ~679 px there and has 660.
- **Ceiling step 1 restructured** to fit the panel: the joint gaps, grid origin, jurisdiction, the
  "Board this ceiling" toggle and the product-status card with its review copy moved behind one
  Advanced group ("Gaps, grid origin, and code profile"); the layout mode and Regenerate share one
  row. The step summary says "Not boarded" when the toggle is off. The review copy also stays on the
  Takeoff step. Header shows the ceiling's name (the shell knows only that, so it has no size line).
- **Light tool**: its options strip is now one select beside the tool chip in the context bar (same
  `data-tool-options="add_light"` hook and shared state); its hint hides below a 1080 px context box
  while that select is showing (it would have been a one-letter stub). The 3D pane shows one quiet
  pointer-transparent line only while the tool is armed ("Light tool: click a board here to place a
  light") — not the old permanent badge. The tool has its own sun glyph (kit `light`) instead of the
  screw's.
- **Canvas colours** (all tokens in the block, classes in the sheet; the plan layers stay memo-pure):
  hanger rings `--ae-hanger-line` `#2c6d94`; luminaire symbols draw in `currentColor`, set by
  `.fixtureSymbol` to `--ae-fixture-line` `#8a6100` (4.0:1 on fibre-cement board, 3.25:1 on plywood),
  selection orange when picked; the light ghost, row/grid outline and guides use the preview colour
  (`.lightGhost` / `.lightRunOutline` / `.lightGuide`). Underlay: walls/columns
  `rgba(62,70,86,.30)`, doors `rgba(196,128,32,.32)`, windows `rgba(40,128,188,.22)`, dashed room line
  `rgba(80,88,104,.60)`, furniture `rgba(80,88,104,.42)`, room names `#5b6275` on the canvas halo.
  Draw previews use the shared `.previewShape/.previewFrame/.previewTrace/.previewPoint` classes with
  `data-preview` hooks (tests now find them by those, not by hex). The backdrop rect is `.canvasSheet`.
  Board, framing-kind, screw-head and the unboarded grey fills are materials and were left alone.
- `FIXTURE_SYMBOL_COLOR` is kept as an export but is now the string `'currentColor'`;
  `LIGHT_GUIDE_COLOR` is gone.
- Right panel: Selection is static; takeoff / elevation / selected-member numbers are `ReadoutRow`s.
  Per-fixture lighting lines use a stacked variant (`.readoutListStacked`, value under label) because
  both halves are long. Openings and lights listed in steps 4–5 use a plain `.listCard`; only the
  selected one wears the selection rule (they used to all carry the orange `selectionCard` edge).
- Selection summaries now carry a size (board / member / opening) or the fixture type, as the wall's do.
- Help ("?") holds what the readout bar and status line said: origin, U/V extents, the counts, the
  measure precision, the 3D pane note, and the light-run keys.
- Wall step 1: the face switch reads "Inside face" / "Outside face" (one line, `aria-pressed`, the
  board in its tooltip) and the step summary says "Inside face · Fiber cement"; the separate notice
  is gone.
- Deleted: kit `StepStrip`, `Metric`; classes `.stepStrip*`, `.stepIndex`, `.stepName`,
  `.dimensionBar*`, `.liveBadge*`, `.canvasToolbar`, `.toolGroup`, `.statusBar` / `.status*`,
  `.eyebrow`, `.metric(s)`, `.activeFaceNotice`, `.orientationTip`, `.orientationCard ol`, the
  1050 px media rule and the step scroll margin. `DetailEditorShell` no longer mentions `eyebrow`.
- Not fixed (out of scope, pre-existing): `.frameShape`'s stylesheet fill overrides the per-kind
  `FRAMING_COLORS` fill attribute, so furring, carriers and trimmers all draw in the one frame tint on
  the plan; the wall checks list still logs duplicate React keys.
