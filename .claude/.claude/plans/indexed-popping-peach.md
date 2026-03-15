# Plan: Freedom Wall Mobile Zoom/Pan + Mini-Map

## Context
On mobile, the Freedom Wall canvas is cramped (~332x420px on a 360px phone). Users can't see the full wall or zoom in for detail. The canvas has no zoom, pan, or pinch gesture support. Adding these will make the wall feel much larger and more interactive, especially on small screens.

## Files to Modify
- `client/src/components/HomePage/freedomWall/FreedomWallPage.jsx`
- `client/src/components/HomePage/freedomWall/freedomWall.css`

---

## Part 1: Zoom & Pan State + Stage Transform

### New state & refs
```js
const [stageScale, setStageScale] = useState(1);
const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
const stageRef = useRef(null);
const isPinchingRef = useRef(false);
const lastPinchDistRef = useRef(null);
const lastPinchCenterRef = useRef(null);
```

### Apply transform to Stage
```jsx
<Stage
    ref={stageRef}
    width={stageWidth}
    height={stageHeight}
    scaleX={stageScale}
    scaleY={stageScale}
    x={stagePosition.x}
    y={stagePosition.y}
    ...existing handlers...
    onWheel={handleWheel}
>
```

### Zoom bounds
- Min: `0.5` (see 2x the area — zoom out)
- Max: `3.0` (zoom in for detail)
- Default: `1.0`

---

## Part 2: Fix Pointer Position for Zoom

`getNormalizedPointerPosition` currently uses `stage.getPointerPosition()` which returns pixel coords relative to the canvas element — it does NOT account for Stage-level transforms. With zoom/pan active, we need logical (pre-transform) coordinates.

**Update the function:**
```js
const getNormalizedPointerPosition = (stage, snap = false) => {
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;

    // Convert from screen-space to logical canvas-space
    const logicalX = (pointer.x - stage.x()) / stage.scaleX();
    const logicalY = (pointer.y - stage.y()) / stage.scaleY();

    const px = snap ? snapToGrid(logicalX) : logicalX;
    const py = snap ? snapToGrid(logicalY) : logicalY;

    return {
        x: clamp(px / stageWidth, 0, 1),
        y: clamp(py / stageHeight, 0, 1)
    };
};
```

Same fix needed in `handleCursorBroadcast` where it reads `stage.getPointerPosition()` directly.

---

## Part 3: Scroll-Wheel Zoom (Desktop)

Standard Konva zoom-toward-cursor pattern:

```js
const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = stage.scaleX();
    const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale
    };

    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const factor = 1.08;
    const newScale = clamp(direction > 0 ? oldScale * factor : oldScale / factor, 0.5, 3);

    setStageScale(newScale);
    setStagePosition({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale
    });
}, []);
```

---

## Part 4: Pinch-to-Zoom + Two-Finger Pan (Mobile)

### Detection logic in touch handlers

**In `handleStagePointerDown` / `onTouchStart`:**
- If `event.evt.touches.length === 2`: set `isPinchingRef.current = true`, record initial pinch distance and center, `return` early (don't start doodle).

**In `handleStagePointerMove` / `onTouchMove`:**
- If `isPinchingRef.current` and `event.evt.touches.length === 2`:
  - Compute new distance between the two touches → derive scale delta
  - Compute new center between the two touches → derive pan delta
  - Apply new scale (clamped) and position
  - Update `lastPinchDistRef` and `lastPinchCenterRef`
  - `return` early (skip doodle drawing)

**In `handleStagePointerUp` / `onTouchEnd`:**
- If `isPinchingRef.current`: reset pinch state, `return` early (don't commit doodle)

### Helper: compute distance between two touches
```js
const getTouchDistance = (t1, t2) =>
    Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2);

const getTouchCenter = (t1, t2, stage) => {
    const rect = stage.container().getBoundingClientRect();
    return {
        x: ((t1.clientX + t2.clientX) / 2) - rect.left,
        y: ((t1.clientY + t2.clientY) / 2) - rect.top
    };
};
```

---

## Part 5: Pan Clamping

After any zoom/pan operation, clamp the position so at least 30% of the canvas stays visible:

```js
const clampStagePosition = (pos, scale) => {
    const minX = -(stageWidth * scale - stageWidth * 0.3);
    const maxX = stageWidth * 0.7;
    const minY = -(stageHeight * scale - stageHeight * 0.3);
    const maxY = stageHeight * 0.7;
    return {
        x: clamp(pos.x, minX, maxX),
        y: clamp(pos.y, minY, maxY)
    };
};
```

Apply this in every place that updates `stagePosition`.

---

## Part 6: Zoom Controls UI

A small floating button group inside `.freedom-wall-canvas-shell`, positioned bottom-right:

```jsx
{stageScale !== 1 && (
    <div className="fw-zoom-controls">
        <button onClick={handleZoomIn}>+</button>
        <span className="fw-zoom-level">{Math.round(stageScale * 100)}%</span>
        <button onClick={handleZoomOut}>−</button>
        <button onClick={handleZoomReset}>Reset</button>
    </div>
)}
```

- `handleZoomIn`: scale * 1.3, zoom toward center
- `handleZoomOut`: scale / 1.3, zoom toward center
- `handleZoomReset`: scale = 1, position = {0, 0}
- Always show the controls (not just when `scale !== 1`) so users discover zoom exists — but make the Reset button only appear when zoomed

**Revised:** Always show +/− buttons; show zoom level + Reset only when `scale !== 1`.

---

## Part 7: Mini-Map

A small HTML overlay (not Konva) in the bottom-left corner of `.freedom-wall-canvas-shell`. Only visible when `stageScale !== 1`.

### Structure
```jsx
{stageScale !== 1 && (
    <div className="fw-minimap" onClick={handleMinimapClick}>
        <div className="fw-minimap-viewport" style={viewportStyle} />
    </div>
)}
```

### Sizing
- Mini-map container: `100px` wide, height based on canvas aspect ratio (~64px for 0.64 ratio)
- Viewport rectangle: position and size derived from `stagePosition` and `stageScale`

### Viewport rect style calculation
```js
const minimapWidth = 100;
const minimapHeight = Math.round(minimapWidth * (stageHeight / stageWidth));
const vpLeft = (-stagePosition.x / stageScale) / stageWidth * minimapWidth;
const vpTop = (-stagePosition.y / stageScale) / stageHeight * minimapHeight;
const vpWidth = (1 / stageScale) * minimapWidth;
const vpHeight = (1 / stageScale) * minimapHeight;
```

### Click-to-navigate
On click: compute where the user clicked within the mini-map, convert to canvas position, center the viewport there.

---

## Part 8: CSS Additions

```css
/* Prevent browser handling of touch on canvas */
.freedom-wall-canvas-shell {
    position: relative;    /* for absolute-positioned children */
    touch-action: none;    /* prevent browser pinch/scroll */
}

.fw-zoom-controls {
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 8px;
    padding: 3px 6px;
    z-index: 5;
    font-size: 0.7rem;
}

.fw-zoom-controls button {
    width: 26px;
    height: 26px;
    border: 1px solid var(--border-card);
    background: var(--bg-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.82rem;
    color: var(--text-secondary);
    font-weight: 700;
}

.fw-zoom-level {
    min-width: 36px;
    text-align: center;
    color: var(--text-faint);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.fw-minimap {
    position: absolute;
    bottom: 10px;
    left: 10px;
    width: 100px;
    background: rgba(0, 0, 0, 0.06);
    border: 1px solid var(--border-card);
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    z-index: 5;
}

.fw-minimap-viewport {
    position: absolute;
    border: 2px solid var(--accent-sage);
    background: rgba(162, 28, 175, 0.08);
    border-radius: 2px;
    pointer-events: none;
}
```

---

## Part 9: Guard Doodle Drawing During Pinch

In the three Stage pointer handlers, add early returns when a pinch is active:

- `handleStagePointerDown`: if `touches.length >= 2`, start pinch mode, skip doodle/placement
- `handleStagePointerMove`: if `isPinchingRef.current`, process pinch, skip doodle
- `handleStagePointerUp`: if `isPinchingRef.current`, end pinch, skip doodle commit

This ensures single-finger drawing still works naturally alongside two-finger zoom/pan.

---

## Verification
1. **Desktop scroll zoom:** hover over canvas, scroll up → zoom in toward cursor, scroll down → zoom out. Items stay correctly positioned under cursor.
2. **Zoom controls:** click +/− buttons → zoom in/out from center. Click Reset → returns to 1x at origin.
3. **Mini-map:** appears when zoomed. Shows viewport rectangle. Click on mini-map → viewport jumps to that area.
4. **Mobile pinch:** two-finger pinch in/out on canvas → smooth zoom. Two-finger drag → pans.
5. **Doodle while zoomed:** single-finger draw works correctly at any zoom level. Lines appear at the correct position.
6. **Item placement while zoomed:** tap to place sticker/stamp/note → appears at the correct logical position regardless of zoom/pan state.
7. **Pan clamping:** cannot pan canvas completely out of view. At least 30% always remains visible.
8. **Existing features unbroken:** puff animations, live cursors, item drag-to-move all work at any zoom level.
