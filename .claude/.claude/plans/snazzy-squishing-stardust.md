# Fix: Kill the AI-Slop Color Palette

## Context

The previous "Precision Atelier" redesign introduced amber-gold (`#D4A94C`) active states — the classic move where AI tries to be "warm" by adding buttery gold to everything. At low opacity on cream backgrounds, these colors become washed-out, indecisive, and scream "generated." The structural changes (tooltips, micro-interactions, toast) are solid. The **colors** are the problem.

### What's wrong specifically
- `--color-active-glow: #D4A94C` — generic "warm gold," muddy on cream
- All `rgba(212, 169, 76, ...)` variants — invisible at 10-12% opacity on warm backgrounds
- The warm-on-warm combination (gold accent + cream surface) = zero contrast, everything blurs together
- DM Sans + Plus Jakarta Sans — functional but trending toward AI-overused territory

---

## Design Direction: "Architect's Ink"

**One rule: cool accent on warm surface.** This is how actual architectural drawings work — deep ink marks on warm vellum paper. The contrast between cool precision marks and warm paper is what makes blueprints visually compelling.

**Active state color: Prussian Ink `#2D5F8E`**
- Deep, saturated blue referencing architectural ink / cyanotype blueprints
- Creates natural warm/cool contrast against the cream `#F4F3F0` panels
- Clearly distinct from both teal accent (`#1A7A68`) and danger red (`#DC2626`)
- Professional CAD tools universally use blue for selection — it's domain-appropriate, not arbitrary
- At 10% opacity on cream, it produces a visible cool-tinted wash (unlike amber which disappeared)

**Font: Manrope**
- Geometric sans-serif with genuine character (distinctive 'a', 'g', numeral forms)
- Single font family for both UI and headings (weight variation for hierarchy)
- On Google Fonts, weights 400-700
- NOT in the AI-overused tier (unlike DM Sans, Inter, Plus Jakarta Sans)

---

## Changes

### 1. `index.html` — Font import
Replace DM Sans + Plus Jakarta Sans with Manrope:
```
family=Manrope:wght@400;500;600;700
```
Keep JetBrains Mono.

### 2. `src/styles/variables.css` — Design tokens
**Font vars:**
- `--font-ui: 'Manrope', system-ui, -apple-system, sans-serif`
- `--font-heading: 'Manrope', system-ui, -apple-system, sans-serif` (same family, just heavier weights — no visual break from consuming CSS)

**Active state vars (replace amber → ink blue):**
- `--color-active-glow: #2D5F8E`
- `--color-active-glow-subtle: rgba(45, 95, 142, 0.10)`
- `--color-active-glow-border: rgba(45, 95, 142, 0.25)`
- `--shadow-active-glow: 0 0 0 2px rgba(45, 95, 142, 0.18), 0 0 8px rgba(45, 95, 142, 0.08)`

### 3. `src/styles/global.css` — Keyframes
Update `@keyframes warmPulse` rgba values from `(212, 169, 76, ...)` → `(45, 95, 142, ...)`

### 4. `src/ui/Toolbar.module.css` — Hardcoded amber values
- `.saveBtn::after` — update `box-shadow` rgba values
- `@keyframes warmPulse` (local copy) — update rgba values
- `.toolPaletteBtnActive:hover` — `rgba(212, 169, 76, 0.18)` → `rgba(45, 95, 142, 0.15)`
- `.toggleBtn.toggleActive:hover` — same replacement

### 5. `src/ui/Sidebar.module.css` — Hardcoded amber values
- `.itemSelected:hover` — `rgba(212, 169, 76, 0.18)` → `rgba(45, 95, 142, 0.15)`

### 6. `src/renderers/SvgCanvas.module.css`
- `.toastProgress` — already uses `var(--color-active-glow)`, no change needed

### 7. No changes needed to:
- `PropertiesPanel.module.css` — uses only CSS vars, not hardcoded rgba
- `InputField.module.css` — uses only CSS vars
- `Modal.module.css` — uses only CSS vars
- `Tooltip.jsx` / `Tooltip.module.css` — no color refs
- `Toolbar.jsx` / `SvgCanvas.jsx` — no color refs

---

## Files Changed (6 files)

| File | Change |
|---|---|
| `index.html` | Swap font import to Manrope |
| `src/styles/variables.css` | 2 font vars + 4 active-state color vars |
| `src/styles/global.css` | 2 rgba values in warmPulse keyframe |
| `src/ui/Toolbar.module.css` | 6 hardcoded rgba values |
| `src/ui/Sidebar.module.css` | 1 hardcoded rgba value |

Everything else picks up the changes through CSS variables automatically.

---

## Verification

1. Load app — Manrope font renders everywhere. JetBrains Mono still on blueprint dimensions.
2. Select a tool — active state shows crisp blue highlight, clearly visible on cream background.
3. Toggle sidebar/grid/snap — active toggles show blue, not washed-out amber.
4. Click sidebar items — selected items have blue left-border + blue text on cool-tinted background.
5. Focus any input — blue focus ring, clearly visible.
6. Trigger undo — toast progress bar is blue.
7. Mark project dirty — save dot pulses blue, not gold.
8. Overall impression: warm cream surface + cool blue active marks = ink on vellum, not AI-slop.
