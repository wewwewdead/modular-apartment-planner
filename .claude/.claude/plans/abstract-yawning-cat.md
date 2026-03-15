# Revert Dark Theme + Light-Theme UX Enhancement

## Context
The dark chrome panel theme was applied across 12 files but the user doesn't like it. This plan reverts ALL dark-theme colors back to the original light theme, then applies UX improvements to button placement, grouping, and panel arrangement — all within the light color scheme. Zero JS behavior logic changes.

---

## Part 1: Revert Dark Theme (restore original light colors)

### 1. `src/styles/variables.css` — Restore all original light-theme tokens
- All `--color-*` variables back to original light values (dark text on light bg)
- `--color-panel-bg: #F3F3F0`, `--color-surface-elevated: #FFFFFF`, `--color-text-primary: #1A1D23`, etc.
- `--color-accent: #0D7C66` (original teal), `--color-danger: #DC2626`
- Shadows back to lighter opacities (`rgba(0,0,0,0.05)` not `0.12`)
- **Keep** new utility tokens: `--radius-xs`, `--space-xxl`, `--ease-spring`, `--duration-smooth`
- **Keep** `--toolbar-height: 56px` (extra 4px gives breathing room for UX improvements)
- **Keep** `--font-ui: 'Outfit'` (better weight range than DM Sans)

### 2. `index.html` — Keep Outfit font (no change needed)

### 3. `src/styles/global.css` — Restore light globals
- Body background → `var(--color-background)` (was `var(--color-panel-bg)`)
- Scrollbar thumbs → `rgba(0,0,0,0.15)` (was white-alpha)
- Selection highlight → `rgba(13,124,102,0.15)` (original accent)
- Focus ring → `rgba(13,124,102,0.15)`

### 4. `src/ui/Toolbar.module.css` — Restore light colors + apply UX improvements (see Part 2)

### 5. `src/ui/Sidebar.module.css` — Revert dark-specific values
- Remove `box-shadow` on sidebar (wasn't in original)
- All `rgba(255,255,255,X)` hovers → `rgba(0,0,0,X)`
- `.projectName` bg → `var(--color-surface-elevated)` (was `#171920`)
- `.contextHeader` backdrop-filter → `blur(6px)` (was 8px)
- `.count` bg → `rgba(0,0,0,0.04)`

### 6. `src/ui/PropertiesPanel.module.css` — Revert dark inputs
- `.colorHexInput` bg → `var(--color-surface-elevated)`, color → `var(--color-text-secondary)`
- `.exportMenuList` shadow → `rgba(0,0,0,0.1)`
- `.exportMenuItem:hover` → `rgba(0,0,0,0.06)`
- **Keep** `.revisionCard` class (user/linter addition)

### 7. `src/ui/InputField.module.css` — Revert dark inputs
- `.input` bg → `var(--color-surface-elevated)`, height → `28px`

### 8. `src/ui/Modal.module.css` — Revert to light modal
- Overlay → `rgba(10,12,15,0.45)` + `blur(4px)`
- Dialog bg → `#FAFAF8`
- Hover states → `rgba(0,0,0,X)` instead of white-alpha

### 9. `src/renderers/SvgCanvas.module.css` — Revert expand button
- `.statusBar` — add back `box-shadow: inset 0 1px 2px rgba(0,0,0,0.03)`
- `.expandBtn` bg → `var(--color-surface-elevated)`, border → `var(--color-border)`
- `.expandBtn:hover` bg → `white`

### 10. `src/three/viewer/ThreePreviewPanel.module.css` — Revert to light panel
- Panel bg gradient → original light gradient
- Header/footer → light translucent gradients
- `.modeToggle` bg → `rgba(255,255,255,0.88)`
- `.modeButtonActive` → original green gradient
- `.floorSelect`, `.button` bg → `rgba(255,255,255,0.88)`
- `.emptyState` → light gradient
- Footer border → `rgba(0,0,0,0.05)`
- **Keep** walkOverlay + inspectCard light (they were already light-on-3D)

### 11. `src/app/App.module.css` — Restore light shadows
- Canvas inset shadow → `inset 1px 0 3px rgba(0,0,0,0.04)`
- `.previewFallback` bg → original light gradient

---

## Part 2: UX Improvements (light-theme compatible)

### A. Toolbar — Better grouping & visual hierarchy (`Toolbar.module.css`)

**Keep JSX additions from Toolbar.jsx** (group labels "Tools", "Panels", "Display" are good UX):
- `.groupLabel` class: 9px uppercase, `--color-text-tertiary`, letter-spacing 0.1em
- Works well in light theme to label button groups

**Subtle group containers** (new — not in original, light-theme version):
- `.group`, `.toolPalette`, `.fixturePalette` get `background: rgba(0,0,0,0.02)` + `border-radius: var(--radius-md)` + `padding: var(--space-xs) var(--space-sm)`
- Removes old `border-left` separators between groups — rounded containers replace them
- Creates clear visual grouping without heavy dividers

**Improved responsive breakpoints:**
- 1100px: hide fixture label first, shrink tool buttons to 28px
- 900px: hide all group labels, tighten padding

### B. Sidebar — Minor polish (`Sidebar.module.css`)
- Keep `border-bottom` on section headers (from dark theme change — cleaner than original)
- No other structural changes needed

### C. Properties Panel — Keep existing structure
- The `.revisionCard` addition is kept
- No layout changes needed

---

## Files Modified (11 files)

| File | Change Type |
|---|---|
| `src/styles/variables.css` | Full rewrite — restore light tokens + keep new utility tokens |
| `src/styles/global.css` | Revert body bg, scrollbars, selection, focus |
| `src/ui/Toolbar.module.css` | Revert dark colors + apply group container UX improvements |
| `src/ui/Toolbar.jsx` | **No change** — keep existing group labels |
| `src/ui/Sidebar.module.css` | Revert dark hover/bg values |
| `src/ui/PropertiesPanel.module.css` | Revert dark inputs, keep `.revisionCard` |
| `src/ui/InputField.module.css` | Revert dark input bg + height |
| `src/ui/Modal.module.css` | Revert overlay/dialog to light |
| `src/renderers/SvgCanvas.module.css` | Revert expand btn + status bar |
| `src/three/viewer/ThreePreviewPanel.module.css` | Revert to light panel chrome |
| `src/app/App.module.css` | Revert shadows + preview fallback |

## What Does NOT Change
- Zero JS logic, event handlers, state management, reducers
- Toolbar.jsx group labels stay (UX improvement)
- index.html stays (Outfit font)
- All domain/editor/persistence files untouched
- Canvas drawing surface stays light `#FAFAF8`

## Verification
1. `npm run dev` — loads without errors
2. All panels are light-themed with clear visual hierarchy
3. Toolbar groups have subtle rounded backgrounds with labels
4. Active tool shows accent highlight (no glow — clean light theme)
5. Hover states use subtle dark-alpha overlays
6. Sidebar sections expand/collapse with proper colors
7. Properties panel inputs readable on light background
8. Modal appears with proper light styling
9. Responsive: check 1100px and 900px breakpoints
