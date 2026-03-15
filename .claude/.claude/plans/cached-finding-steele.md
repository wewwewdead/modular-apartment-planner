# Canvas Editor Atelier Rebuild

## Context
The Canvas Editor currently has a solid foundation (paper texture, lift effects, pinch-to-zoom, glassmorphism dock, 3-layer Konva stage) but needs enhancements to feel like a premium creative tool. This plan adds dynamic lighting, contextual menus, gesture shortcuts, polished animations, and smart object placement. **Scope: Phases 1-4 (all client-side). Phase 5 (real-time sync) deferred.**

---

## Phase 1: Visual Polish (CSS + trivial prop changes, no logic)

### 1A. Enhanced dock blur
**File:** `CanvasEditor.module.css`
- `.toolbarPanel` and `.doodleMiniBar`: Change `backdrop-filter: blur(10px)` to `blur(15px)`

### 1B. Grid fade based on zoom level
**File:** `CanvasEditor.jsx`
- Compute `gridOpacity` from `viewport.scale` (fade at low zoom, visible at high zoom)
- Apply as `opacity` prop on the grid `<Layer>`
- Zero perf cost (single `globalAlpha` on canvas context)

### 1C. Improved doodle smoothing
**Files:** `CanvasEditor.jsx` + `CanvasViewer.jsx`
- Change `tension={0.1}` to `tension={0.35}` on all `<Line>` doodle elements
- Backward compatible (rendering-only change, stored points unchanged)

---

## Phase 2: Interaction Enhancements

### 2A. Smart placement with random jitter
**File:** `CanvasEditor.jsx`
- New helper: `randomPlacement()` returning `{rotation: +-5deg, xOffset: +-3%, yOffset: +-3%}`
- Apply in `addSnippet()` and `addImageFromFile()` for hand-placed feel

### 2B. Delete "poof" animation
**File:** `CanvasEditor.jsx`
- New state: `animatingRemovalId`
- `removeSelectedObject()` triggers `node.to()` (scale to 0, opacity to 0, slight rotation) over 300ms
- Actual state removal via `setTimeout` after animation completes
- Apply to both Text nodes and CanvasImageNode via ref callback

### 2C. Gesture shortcuts (2-finger undo, 3-finger redo)
**File:** `CanvasEditor.jsx`
- New state: `doodleRedoStack` for redo capability
- New ref: `multiTapRef` to track multi-finger tap timing
- In `handleCanvasPointerDown`: record finger count + timestamp
- In `handleCanvasPointerUp`: if < 300ms elapsed, 2 fingers = undo doodle, 3 fingers = redo
- Doesn't conflict with pinch-to-zoom (pinch involves movement, tap doesn't)

---

## Phase 3: Dynamic Ambient Shadow

### Mouse-following light effect
**Files:** `CanvasEditor.jsx` + `CanvasEditor.module.css`
- New CSS class `.ambientLight` with `radial-gradient` positioned via CSS custom properties (`--cursor-x`, `--cursor-y`, `--cursor-opacity`)
- New div inside `.stageShell` with `pointer-events: none`
- `onMouseMove`/`onTouchMove` on shell sets CSS vars directly on DOM (no React re-renders)
- `onMouseLeave`/`onTouchEnd` fades opacity to 0 via CSS transition
- Different gradient color for dark theme (`soft-light` blend)
- Zero impact on Konva rendering performance

---

## Phase 4: Pie Menu (Radial context menu)

### New files
- `client/src/components/HomePage/Canvas/PieMenu.jsx`
- `client/src/components/HomePage/Canvas/PieMenu.module.css`

### Design
- Appears on long-press (400ms) or right-click on canvas objects
- Radial layout of 48px glassmorphism buttons at 72px radius
- Uses `framer-motion` `AnimatePresence` for spring entry/exit
- Items for selected object: Delete, Duplicate (clone at +20px offset with jitter), Bring Front, Send Back, Resize+, Resize-, Rotate, Flip
- In doodle mode: Undo, Redo, Clear, color shortcuts
- Duplicate action: clones the selected snippet/image with `x + 0.04`, `y + 0.04` offset and random +-3deg rotation jitter

### Integration in CanvasEditor.jsx
- New state: `pieMenu` with `{isOpen, position, items}`
- Long-press timer in `handleCanvasPointerDown` (cancelled on drag/move)
- `onContextMenu` handler on stageFrame div
- Rendered inside `.stageShell` as HTML overlay (not inside Konva)

---

## Files Summary

| File | Action | Phases |
|------|--------|--------|
| `client/src/components/HomePage/Canvas/CanvasEditor.module.css` | Modify | 1, 3 |
| `client/src/components/HomePage/Canvas/CanvasEditor.jsx` | Modify | 1-4 |
| `client/src/components/HomePage/Canvas/CanvasViewer.jsx` | Modify (tension only) | 1 |
| `client/src/components/HomePage/Canvas/PieMenu.jsx` | Create | 4 |
| `client/src/components/HomePage/Canvas/PieMenu.module.css` | Create | 4 |

## Verification
- **Phase 1:** Visual check - zoom in/out to see grid fade, draw doodles for smooth curves, check dock blur
- **Phase 2:** Place multiple items (verify random rotation), delete with animation, test 2/3-finger tap on touch device
- **Phase 3:** Move mouse over canvas to see light follow, test dark theme variant
- **Phase 4:** Right-click object for pie menu, long-press on mobile, verify Duplicate clones correctly
