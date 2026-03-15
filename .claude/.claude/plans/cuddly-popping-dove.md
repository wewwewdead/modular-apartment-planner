# Freedom Wall "Creative Atelier" UI Upgrade

## Context
The Freedom Wall is a collaborative Konva.js canvas with drawing, stickers, stamps, and notes. Currently styled as a chalkboard. We're upgrading it to feel like a physical, tactile workspace ("messy desk meets street art mural") with better aesthetics, animations, and mobile UX.

**Files to modify:**
- `client/src/components/HomePage/freedomWall/FreedomWallPage.jsx` (2536 lines)
- `client/src/components/HomePage/freedomWall/freedomWall.css` (681 lines)

No new files. No backend changes. No new dependencies (use Konva's built-in `node.to()` tween).

---

## Implementation Order

### Step 1: High-DPI Retina Support
- Add `pixelRatio={window.devicePixelRatio || 1}` prop to `<Stage>` (line 2318)

### Step 2: Tactile Background (Concrete/Paper Texture)
**CSS:**
- Update CSS variables to warm concrete gray tones (replace green chalkboard palette)
- Replace `.freedom-wall-page` background gradient with concrete-toned radial/linear gradients
- Upgrade SVG noise: `baseFrequency=0.65`, `numOctaves=6`, opacity `0.055`, `mix-blend-mode: soft-light`
- Add `box-shadow: inset 0 2px 12px rgba(0,0,0,0.15)` for depth
- Update canvas shell inset shadows for paper-like depth

**JSX:**
- Update `<Rect>` fills in background Layer to match new palette
- Update grid line stroke colors

### Step 3: Ambient Light Effects
**CSS only:**
- Add `::after` vignette on `.freedom-wall-canvas-shell` (radial-gradient, `pointer-events: none`, z-index 4)
- Add `@keyframes fw-ambient-pulse` - subtle 6s box-shadow breathing animation on canvas shell

### Step 4: Micro-Animations
**JSX:**
- `StickerNode`/`StampNode`: Add `scaleX/Y={isSelected ? 1.08 : 1}`, `shadowBlur={isSelected ? 12 : 0}`, `shadowOffsetY={isSelected ? 4 : 0}` to KonvaImage for "lift" effect
- All `onDragEnd` handlers: Add spring bounce via `node.to()` (squash/stretch sequence)
- Import `Konva` from `"konva"` for `Konva.Easings.EaseOut`
- Enhance `PuffEffect`: more particles (8+), second ring, longer duration (600ms)

### Step 5: Creative Tooling UI
**JSX:**
- Add `COLOR_PALETTES` constant (Pastels, Earth Tones, Neon, Classic - 6 colors each)
- Add `ColorSwatchPicker` component (defined outside `FreedomWallPage`, above it) - shows grouped swatch circles with "Custom" toggle for native picker
- Replace all `<input type="color">` (5 locations) with `<ColorSwatchPicker>`
- Update `NOTE_FONT_OPTIONS` to array of `{name, label}` objects
- Replace font `<select>` dropdowns (2 locations: draft note + note editor) with horizontal `.fw-font-carousel` of clickable chips showing live font preview

**CSS:**
- `.fw-font-carousel`: horizontal scroll, gap, thin scrollbar
- `.fw-font-chip`: pill buttons with font-family preview, `.is-active` glow
- `.fw-swatch`: 24px circles, scale on hover, border highlight on active
- `.fw-palette-group`, `.fw-palette-tabs`, `.fw-palette-label`, `.fw-custom-color-toggle`

### Step 6: Floating Bottom Dock Toolbar
**CSS:**
- Restyle `.freedom-wall-toolbar` to `position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); z-index: 50;` with stronger glassmorphism (`blur(14px) saturate(1.4)`)
- Enhance `.fw-tool-btn.is-active` glow (larger box-shadow spread)
- Add `.fw-dock-controls-popover` for tool-specific controls (positioned `bottom: 100%` above dock)
- Add `padding-bottom: 5rem` to `.freedom-wall-page` to account for fixed dock

**JSX:**
- Wrap tool-specific controls (color picker, sticker grid, stamp grid, etc.) in a `<div className="fw-dock-controls-popover">` inside the toolbar
- Move "Clear My Doodles" and readonly pills into the popover

### Step 7: Mobile Collapsible FAB
**JSX:**
- Add state: `isMobileToolbarOpen`
- Derive `isMobileView` from `shellWidth < 480`
- When mobile + collapsed: render `.fw-fab-orb` button showing current tool emoji
- When mobile + open: render toolbar as bottom sheet with close button

**CSS:**
- `.fw-fab-orb`: fixed position, 52px circle, glassmorphism, glow
- `.fw-fab-close`: small X button on expanded toolbar
- `@media (max-width: 480px)` toolbar: full-width bottom sheet, `border-radius: 16px 16px 0 0`, `max-height: 60vh`, `overflow-y: auto`

### Step 8: Focus Mode
**JSX:**
- Add state: `isFocusMode`
- Add toggle button in `.fw-zoom-controls` (eye icon or expand icon)
- Wrap header, toolbar, draft panels, note editor, selected actions, footer in `{!isFocusMode && (...)}`
- Add `fw-focus-mode` class to `.freedom-wall-page` when active

**CSS:**
- `.fw-focus-mode`: `padding: 0; gap: 0;`
- `.fw-focus-mode .freedom-wall-canvas-shell`: `border: none; border-radius: 0; border-image: none;`

---

## Verification
1. Run dev server (`npm run dev` or `vite dev` from client/)
2. Navigate to `#/home/freedom-wall`
3. Test each feature visually:
   - Background: concrete texture, grain, inset depth
   - Toolbar: floating at bottom, glassmorphism blur, active glow
   - Mobile: resize to <480px, FAB orb appears, tap to expand
   - Animations: select sticker (lifts), drag and drop (spring bounce)
   - Color picker: swatches appear, "Custom" toggles native picker
   - Font carousel: horizontal chips with live font preview
   - Ambient: vignette on corners, subtle pulse animation
   - Focus mode: toggle hides all chrome, only canvas + zoom controls remain
   - High-DPI: doodles look sharp on Retina displays
4. Test drawing, placing stickers/stamps/notes, eraser, zoom, minimap, time capsule
5. Test Supabase realtime sync (open two tabs)
