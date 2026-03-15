# Freedom Wall UI Enhancement

## Context
The Freedom Wall is a collaborative weekly canvas with a chalkboard aesthetic. It works well functionally (Konva drawing, real-time collaboration, tools, time capsule) but the visual design can be elevated to feel more premium and memorable. This plan adds Framer Motion animations, refined micro-interactions, better visual hierarchy, and polished loading/error states — all while preserving the existing 2,789-line component structure and chalkboard theme.

## Files to Modify
- `client/src/components/HomePage/freedomWall/FreedomWallPage.jsx`
- `client/src/components/HomePage/freedomWall/freedomWall.css`

---

## Changes

### 1. Add Framer Motion import (JSX top)
Add `import { AnimatePresence, motion } from "framer-motion";` — needed for areas 2, 4, 7 below.

### 2. Header Enhancement (JSX ~lines 2215-2244, CSS)
- Wrap title text in `<span className="fw-title-chalk">` with chalk glow gradient (uses `Patrick Hand` font already loaded globally)
- Restructure countdown pill: add clock icon with wobble animation, separate label/value spans, value animates on change via `key={countdownText}`
- Add active users indicator pill after countdown (conditionally shown when `remoteCursorItems.length > 0`) with pulsing green dot
- Add subtle `border-bottom` separator on `.freedom-wall-header`

### 3. Toolbar Enhancement (JSX ~lines 2246-2357, CSS)
- Add `<span className="fw-tool-emoji">` with `TOOL_EMOJIS` constant (already exists at line 51, currently unused in buttons) before each tool label for scannability
- Add `<span className="fw-tool-divider" />` vertical line before the settings toggle button
- Wrap `.fw-dock-controls-popover` in `<AnimatePresence>` + `<motion.div>` with spring entrance (stiffness: 420, damping: 22 — matches app pattern from PieMenu)
- Add `fw-fab-pulse` class to mobile FAB for subtle glow pulse animation

### 4. Draft Panels Animation (JSX ~lines 2359-2551, CSS)
- Wrap all three draft panels (note, sticker, stamp) in `<AnimatePresence mode="wait">` with `<motion.div>` — slide-up + fade spring entrance (stiffness: 260, damping: 20)
- Wrap the selected note editor in same `<AnimatePresence>` + `<motion.div>` pattern
- Add section dividers: `border-top` on `.fw-draft-note-controls` and `.fw-draft-note-actions`
- Custom range slider styling: yellow chalk-colored thumb with glow, scale on hover (both webkit and moz)

### 5. Canvas Frame (CSS + 2 JSX string changes)
- Add `::before` pseudo-element on `.freedom-wall-canvas-shell` for decorative chalk dust radial gradients in top corners with slow drift animation
- Increase grid line opacity from `0.04` to `0.055` (lines 2589 and 2597) for slightly better spatial orientation

### 6. Footer Enhancement (JSX ~lines 2774-2783, CSS)
- Wrap item count in `.fw-footer-count` with `<strong>` on the number
- Add `.fw-sync-dot` colored indicator: green (synced) with glow, yellow with pulse animation (syncing)
- Add `border-top` separator on `.freedom-wall-footer`

### 7. Loading & Error States (JSX ~lines 2206-2210, 2561-2562, CSS)
- Replace "Loading wall..." with chalk-themed skeleton shimmer (3 animated bars + text)
- Enhance error state with warning icon and "Please refresh" hint text

### 8. Modal Animation (JSX ~lines 2739-2772)
- Wrap clear doodles modal in `<AnimatePresence>` — backdrop fades in/out, card springs in with scale (stiffness: 400, damping: 30)
- Add `.fw-modal-btn` class with min-width, hover lift, active press

### 9. Micro-interactions (CSS-only)
- Tool button: `::after` radial gradient ripple on `:active`, `scale(0.96)` press
- Stamp/sticker buttons: `scale(0.92)` on active
- Apply/delete buttons: `scale(0.97)` on active
- Error toast: slide-down entrance animation
- Swatch: `scale(0.88)` click feedback
- Font chip: `scale(0.95)` click feedback

---

## Implementation Order
1. Framer Motion import
2. CSS micro-interactions (Area 9) — zero risk, immediate tactile improvement
3. Footer (Area 6) — small, self-contained
4. Header (Area 2) — moderate JSX, new CSS
5. Canvas frame (Area 5) — CSS + 2 string literals
6. Loading/error states (Area 7) — small JSX restructure
7. Toolbar (Area 3) — AnimatePresence wrapping
8. Draft panels (Area 4) — largest set of motion.div wrappings
9. Modal (Area 8) — self-contained AnimatePresence

## Verification
1. Run dev server, navigate to Freedom Wall page
2. Verify header: chalk title renders with gradient glow, countdown ticks with animation, active users pill appears when others are on the wall
3. Verify toolbar: emoji icons show before tool labels, divider visible before settings gear, popover slides in/out smoothly
4. Verify draft panels: creating a note/sticker/stamp shows panel with spring animation, dismissing animates out
5. Verify canvas: chalk dust gradient visible at top, grid lines slightly more visible
6. Verify footer: sync dot pulses yellow during saves, turns green when synced
7. Verify loading state: skeleton shimmer bars appear while wall loads
8. Verify modal: clear doodles confirmation scales in with spring, backdrop fades
9. Verify all tool buttons have press feedback (scale down on click)
10. Verify mobile: FAB has pulse glow, toolbar slides up correctly, all panels work
11. Verify focus mode: header/footer/panels hidden, canvas fills space correctly
12. Verify time capsule mode: read-only pill still shows, tools disabled
