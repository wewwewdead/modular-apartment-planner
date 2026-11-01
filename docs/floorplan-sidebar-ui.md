# Floorplan sidebar: fit fix and lifecycle-panel polish

Spec written 2026-11-01 by Fable (audit owner). Build owner: Opus. Status: built and audited 2026-11-01 (all three phases; Fable removed the duplicated panel heading after the audit). Guards: `ProjectLifecyclePanel.layout.test.js` and `scripts/verify-sidebar-fit.mjs`.

## 0. Summary

The left sidebar of the floor-plan workspace hosts the **Apartment Design
Engineer** lifecycle panel (`src/features/floorplan/components/ProjectLifecyclePanel.jsx`,
~6,000 lines, styles in `ProjectLifecyclePanel.module.css`). Its Site stage has a
**Surveyed lot boundary** form whose bearing row is wider than the sidebar, so the
E/W select is cut off and the remove button is unreachable. Four other row grids
in the same stylesheet have the same defect by construction.

This spec has three phases. Phase 1 is the fix plus a guard that makes the whole
class of bug impossible to reintroduce. Phase 2 restyles the lifecycle panel so
it reads like the rest of the app's "drafting instrument" language and is easier
to navigate. Phase 3 (optional) adds a resizable sidebar.

## 1. The bug, measured

Measured headless at 1366×768, `/playground`, Site stage, Surveyed boundary mode
(script: `scratchpad/measure-surveyed.mjs`, baseline screenshots
`baseline-site-stage.png` / `baseline-sidebar.png`).

| Element                                                      | left    | right   | width                         |
| ------------------------------------------------------------ | ------- | ------- | ----------------------------- |
| Sidebar (`App.module.css .sidebar`, `--sidebar-width`)       | 0       | 256     | 256                           |
| Stage card (`.stageContent`, 10px padding, 1px border)       | 16      | 239     | 223 (client 221)              |
| Boundary-line card (`.traverseRow`, 6px padding, 1px border) | 27      | 228     | 201                           |
| Bearing grid (`.traverseBearing`)                            | 34      | 221     | **187** (scrollWidth **234**) |
| Degrees input                                                | 112     | 150     | 38                            |
| Minutes input                                                | 154     | 192     | 38                            |
| E/W select                                                   | 196     | **240** | 44                            |
| Remove button                                                | **244** | **268** | 24                            |

Root cause: `.traverseBearing { grid-template-columns: 26px 44px minmax(38px, 1fr)
minmax(38px, 1fr) 44px 24px; gap: 4px }` has a minimum width of 234px (214px of
tracks + 20px of gaps) inside a 187px cell. CSS Grid never shrinks tracks below
their minimums, so the row overflows its card by 47px. The E/W select's right
edge lands past the stage card; the remove button lands past the sidebar edge and
is simply not visible. Nothing scrolls horizontally, so to the user the controls
are missing.

Width budget to design to (default sidebar width, Chrome, 6px custom scrollbar):

- `W_card` = **201px** for anything that is a direct child of `.stageContent`
  (`.formGrid`, `.metricsGrid`, `.lotModeToggle`, buttons).
- `W_row` = **187px** inside a bordered row card with 6px padding (`.traverseRow`
  and anything styled like it).
- Design to **6px less** than each budget so a 1px rounding never clips a border.

The same stylesheet has four more grids whose minimums exceed `W_card`
(numbers are track minimums only; gaps make them worse):

| Selector (line)                                                                                             | Minimum width | Budget |
| ----------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| `.quantityRow` (492) `minmax(100px,1.4fr) minmax(68px,.65fr) minmax(76px,.8fr)`                             | 244           | 201    |
| `.mappingRow` (551) `minmax(70px,.8fr) minmax(120px,1.5fr) minmax(90px,1fr)`                                | 280           | 201    |
| `.placementRow` (575) `minmax(86px,1.4fr) repeat(3, minmax(48px,.65fr)) 40px`                               | 270           | 201    |
| `.structuralIntentRow` (613) `minmax(82px,1fr) minmax(74px,.7fr) minmax(62px,.6fr) minmax(90px,1.2fr) 40px` | 348           | 201    |

These render only when the project has unit placements, beam intents, quantity
items or service mappings, which is why nobody has reported them yet. They are in
scope for Phase 1.

## 2. Design direction

The app already has a considered visual language; deepen it, do not replace it.
Tokens live in `src/styles/variables.css`:

- Paper panel `--color-panel-bg #f4f3f0`, elevated surface `#ffffff`, hairline
  borders `rgba(0,0,0,.08)`.
- Teal accent `--color-accent #1a7a68` for actions; blue `--color-active-glow
#2d5f8e` for the _current_ thing; `--color-danger` for attention.
- Type: `--font-ui`/`--font-heading` Manrope, `--font-display` Instrument Serif,
  `--font-blueprint` JetBrains Mono. **No new fonts.**
- Motion tokens: `--duration-fast`, `--duration-micro`, `--ease-out`.

The properties panel on the right already embodies the direction in
`src/features/floorplan/components/properties/PanelKit.jsx` + `PanelKit.module.css`:
editable things are `Field`s on a shared label gutter (30px controls, 13px
`--font-ui`, inset shadow, active-glow focus ring); derived things are
`Readout`s set on a dotted leader in the blueprint mono face with tabular
numerals. **A derived value rendered as an input box is a bug.** The lifecycle
panel on the left ignores all of this: 9px labels, 11px inputs, metrics as bold
Manrope in grey boxes, stage buttons as a 2×4 grid of cards.

Direction for this work, in one line: **the lifecycle panel should read like a
surveyor's field book inside a title block**: numbered stages on a rail,
engraved readouts with leaders, measurement entry with units set inside the
field, hairline rules, mono numerals, nothing decorative that does not carry
information. Restraint and precision, not ornament.

Specific moves:

- Stage titles may use `--font-display` (Instrument Serif) at 17–18px, the one
  place the serif appears in the workspace; everything else stays Manrope/Mono.
- Units are adornments inside the control (`°`, `′`, `m`), set in
  `--font-blueprint` 10px tertiary, not parentheses in the label.
- Numeric entry is right-aligned with `font-variant-numeric: tabular-nums`.
- Section captions stay uppercase/tracked 10px but gain a hairline rule to the
  right of the caption so sections scan as a list.
- One subtle motion: on stage change the stage content fades in over
  `--duration-fast` with a 4px rise, `--ease-out`; honour
  `prefers-reduced-motion`.

## 3. Constraints and invariants

- JavaScript only (no TypeScript), CSS Modules, `@/` alias, React 19. No new
  runtime dependencies.
- **Every `aria-label` on a form control stays byte-identical** (tests and the
  verify scripts select by them). Stage buttons keep `aria-current="step"` on
  the active stage and keep their visible label text in the markup.
- No domain or command changes: do not touch `src/domain/**`,
  `buildingCommands.js`, `surveyTraverse.js`, the command payloads built in
  `apply()` functions, or any `seedKey`/form-key logic in `ProjectLifecyclePanel`.
- The lifecycle panel is memoised and is "the most expensive child" of the
  sidebar (comment in `Sidebar.jsx` ~line 186). Do not add work to its render.
- The repo has a large **unrelated uncommitted change set under
  `src/features/sketchstudio/`, `scripts/verify-*.mjs`, and `docs/`**. Do not
  touch, revert, format or stage any of it. Do not commit anything; the user
  commits.
- The sidebar overlays at `--sidebar-width` (256px) under 1024px wide, so the
  budget above is the floor everywhere; a wider sidebar (Phase 3) never relaxes
  it.
- Memory rules that apply: derived values are engraved, never fake inputs
  (properties-panel-kit); typed numeric entry must not be clobbered mid-word
  (useNumericDraft exists in `components/useNumericDraft.js`; the lifecycle
  forms use their own draft state and explicit Apply buttons, keep that model).

## 4. Phase 1: Fit (must)

### 4.1 Boundary-line card

Replace the single six-track bearing row with a three-line card:

```
┌ ─────────────────────────────── ┐
│ LINE 1–2                      × │  header: mono label left, remove right
│ [N ▾] [  45 °] [  30 ′] [E ▾]   │  bearing: 4 fluid tracks, no px minimums
│ Distance            Setback     │
│ [       12.50 m] [     3.00 m]  │  measures: 2 fluid tracks, unit adornments
└ ─────────────────────────────── ┘
```

- Header: `.traverseLineLabel` in `--font-blueprint` 10px tracked uppercase
  ("LINE 1–2"); `.traverseRemove` 22×22 at the right edge; `justify-content:
space-between`. The remove button keeps `aria-label="Remove line N"` and the
  `rows.length <= 3` disabled rule.
- Bearing: `grid-template-columns: minmax(0, 3fr) minmax(0, 4fr) minmax(0, 4fr)
minmax(0, 3fr); gap: 4px`. At `W_row` 187 that is ~37px selects and ~50px
  fields. Selects keep `padding: 0 2px`. Degrees/minutes become right-aligned
  with a persistent adornment (`°`, `′`) inside the field; drop the `°`/`′`
  placeholders (an empty field showing "°" reads as a label, which is what the
  user hit). Placeholder for degrees becomes `0`.
- Measures: labels "Distance" / "Setback"; adornment `m` inside each field.
  Keep both inputs' `aria-label`s and `min`/`step`.
- Adornment pattern (reuse for Phase 2): wrapper `span.adorned { position:
relative; display: flex; min-width: 0 }`, `input { padding-right: 16px }`,
  `span.adornment { position: absolute; right: 6px; top: 50%; transform:
translateY(-50%); pointer-events: none; font: 10px var(--font-blueprint);
color: var(--color-text-tertiary) }`. Make it a tiny component in the panel
  file (`Adorned({ unit, children })`) so JSX stays readable.

### 4.2 Every other grid in the stylesheet

Apply one rule to the whole file: **the sum of fixed `px` tracks, `minmax()`
minimums and gaps in any `grid-template-columns` must be ≤ 180px.** `fr`,
`auto`, and `minmax(0, …)` count as 0. Fix the four rows in §1 either by
switching minimums to `minmax(0, Nfr)` (and letting cell text ellipsize with
`min-width: 0; overflow: hidden; text-overflow: ellipsis`) or by restacking a
row into a two-line card like §4.1 when four or more controls would otherwise
drop below ~40px each. Judgment per row; say which you chose and why.

### 4.3 Guard: stylesheet budget test

Add `src/features/floorplan/components/ProjectLifecyclePanel.layout.test.js`
(vitest, node environment, no DOM): read the module CSS as text, find every
rule block containing `grid-template-columns`, compute the minimum track width
with the rule above (`repeat(n, X)` → n×X; `gap`/`column-gap` in the same block
→ (tracks − 1) × gap; default gap 0) and assert ≤ 180 with a message naming the
selector and the computed minimum. **Run it first against the current CSS and
paste the red output in your report**, then make it green. Keep the parser
small and tolerant (skip values it cannot parse with a `console.warn`, do not
fail on them).

### 4.4 Guard: browser fit script

Add `scripts/verify-sidebar-fit.mjs` following the conventions of
`scripts/verify-gizmo-hud.mjs` (`chromium.launch({ channel: 'chrome', headless:
true })`, `page.on('pageerror')`, a `checks` list, screenshots under
`artifacts/floorplan/sidebar-fit/`, URL from `FLOORPLAN_VERIFY_URL` defaulting
to `http://localhost:5199/playground`, non-zero exit on failure). A Vite server
is already listening on 5199 during this session; start your own on another
port only if that one is gone (`npx vite --port 5199 --strictPort`).

The script, at viewports 1366×768 and 1920×1080:

1. Waits for `svg[class*="_svg"]`, finds the stage nav
   (`getByRole('navigation', { name: 'Building lifecycle stages' })`).
2. For each of the 8 stages: activates it, then walks **every element** under
   the sidebar root and asserts `rect.right <= sidebar.right + 0.5` and
   `rect.left >= sidebar.left - 0.5` for elements with non-zero size, and
   `scrollWidth <= clientWidth + 1` for every element. Reports the first ten
   offenders with their class names.
3. On the Site stage, in **Surveyed boundary** mode: clicks "Add boundary line"
   so there are 5 lines, then types the user's real lot from
   `src/domain/surveyTraverse.test.js` (Lot 812-I-1-A, 5 lines, closes at ~6 mm,
   1:5,938, 59.91 m²) into the fields by `aria-label`, asserts the closure
   readout shows a `1:` ratio and the computed area reads `59.91 m²`, asserts
   `Remove line 5` is enabled and fully inside the sidebar, clicks **Apply
   surveyed boundary**, and asserts "Surveyed boundary applied and checked."
   appears. Repeat the fit walk after apply.
4. Also in **Rectangular lot** mode, run the fit walk.
5. Saves `site-surveyed-after.png` (stage card) and `sidebar-after.png` for the
   report.

## 5. Phase 2: Lifecycle panel polish (should)

Do Phase 1 completely, run everything in §7, and only then start Phase 2.

### 5.1 Stage rail and stage header

Replace the 2×4 `stageNav` grid of cards with:

- **Rail**: one row of 8 chips, `grid-template-columns: repeat(8, minmax(0,
1fr))`, 24px tall, number only, 2px gap. Active chip: filled
  `--color-active-glow`, white numeral. Chips whose status `state` is `ready`:
  outlined active-glow. `attention`: a 5px `--color-danger` dot at the chip's
  top-right. Others: hairline outline, secondary text. Each chip is a `<button
type="button">` with `aria-current="step"` when active and an accessible name
  of the form `"2 Site — 49 issues"` (label and status text live in a
  visually-hidden span, so the existing static-markup test still finds every
  stage label and so screen readers hear the status). A `title` carries the
  same text for hover.
- **Stage header** directly under the rail: eyebrow "STAGE 2 OF 8" in
  `--font-blueprint` 10px tracked; the stage label in `--font-display` 18px; the
  active stage's status text on the right in the state colour; **Previous /
  Next** chevron buttons (`aria-label="Previous stage"` / `"Next stage"`,
  disabled at the ends). The existing `stageIntro` strong/span inside each stage
  stays (it is the stage's subtitle) but drops to 11px secondary.
- Keep `deriveLifecycleStatus` and the `status[stage.id]` shape untouched.

### 5.2 Readouts

`Metric` keeps its props (`label`, `value`, `note`) but renders as an engraved
readout: label 11px secondary, dotted leader, value in `--font-blueprint` 12px
tabular right-aligned, note on a second line 10px tertiary. `metricsGrid`
becomes a single column list with 1px hairline separators (`.metric + .metric {
border-top }`), not a 2×N grid of grey boxes. Prefer importing `Readout`/`Hint`
from `properties/PanelKit.jsx` where the API fits; otherwise mirror its CSS
values exactly (don't invent a third set of metrics).

### 5.3 Fields

Unify `.formGrid input/select/textarea` and `.traverse* input/select` with
PanelKit's `.control`: 30px height, 13px `--font-ui`, `--color-surface-elevated`
background, inset shadow `inset 0 1px 2px rgba(0,0,0,.04)`, border hairline,
focus `box-shadow: var(--shadow-active-glow); border-color:
var(--color-active-glow)`. Labels 11px/500 secondary (not 9px/600). Keep the
two-column `formGrid`; `wideField` spans. In the **Site stage only** (both lot
forms and the parking form), move units out of label parentheses into
adornments via `Adorned`; other stages keep their labels (there are hundreds;
out of scope).

### 5.4 Lot mode toggle

`.lotModeToggle` becomes a segmented control: one hairline-bordered pill on
`--color-panel-bg`, two segments, the pressed one lifted on
`--color-surface-elevated` with `--shadow-sm` and primary text; matches the
toolbar's `.segmentedBtn` family in `Toolbar.module.css`. Keep `role="group"`,
`aria-label="Lot input mode"` and `aria-pressed`.

### 5.5 Section captions and actions

`.formSection > strong` gains the hairline rule: `display: flex; align-items:
center; gap: 8px` with `::after { content: ''; flex: 1; border-top: 1px solid
var(--color-border) }`. `.primaryAction` is the stage's single CTA: 32px,
`--color-accent` fill, white text, `--shadow-cta-glow` on hover;
`.secondaryAction` is outlined. Disabled CTA: `opacity .45`, no glow.

### 5.6 Sidebar placement

Wrap the lifecycle panel in the sidebar's own `Section` (`Sidebar.jsx` line ~98)
titled "Design Engineer", collapsible through the existing `toggleSection`
mechanism, with the active stage shown in the header when collapsed (e.g. the
`count` slot showing "2 · Site", or an added `summary` prop mirroring
PanelKit's). Today the panel is the only top-level block without a header, and
the Floors/Roof/Trusses/Ceilings/Sheets/Phases sections sit below ~1,500px of
it. If `toggleSection`'s persisted state cannot take a new key without
migration pain, say so and leave it expanded by default.

## 6. Phase 3: Resizable sidebar (optional)

Only if Phases 1–2 are fully green. Otherwise report it as not done.

- A 6px grab strip on the sidebar's right edge in `FloorplanWorkspace.jsx`
  (`role="separator"`, `aria-orientation="vertical"`, `aria-valuemin=240`,
  `aria-valuemax=420`, `aria-valuenow`, `tabIndex=0`, ←/→ step 16px,
  `cursor: col-resize`, 2px active-glow highlight while dragging).
- Width is clamped to 240–420, persisted in `localStorage`
  `floorplan.sidebar.width`, double-click resets to 256.
- During a drag, set `--layout-sidebar-width` directly on the layout element
  from a `requestAnimationFrame`-coalesced `pointermove` (pointer capture on the
  strip); commit to React state on `pointerup`. Do not dispatch into the
  floorplan store per frame.
- Not rendered in focus mode or under the 1024px overlay breakpoint (the
  workspace already computes `isFocused`; add a `matchMedia` check).

## 7. Verification (run all, paste outputs)

```
npx vitest run src/features/floorplan/components/ProjectLifecyclePanel
npx vitest run src/features/floorplan
npm run lint
FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-sidebar-fit.mjs
npx vitest run
```

Expected: the layout test is red before §4.2 and green after; all existing
tests stay green (there are 17 + 7 in the two ProjectLifecyclePanel test files);
the fit script prints zero offenders for all 8 stages at both viewports and
confirms the surveyed-lot apply.

## 8. Out of scope (note, do not do)

- Toolbar overflow (the Display group sits ~2,385px in and the toolbar scrolls
  horizontally; `Toolbar.jsx` comments acknowledge it). Separate follow-up.
- The properties panel (already on PanelKit), the 3D preview, sheets.
- Any change to what the forms submit.

## 9. Report format

List: files changed (path + one line each); every judgment call you made and
the alternative you rejected; verbatim final outputs of each command in §7;
absolute paths of before/after screenshots; anything in this spec you did not
do, and why. Do not summarise test results — paste the pass/fail lines.
