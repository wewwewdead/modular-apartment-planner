# Ink Physics for Freedom Wall Doodles

## Context
The doodle tool currently draws uniform-width strokes. The goal is to make strokes feel like real ink: thin when swiping fast, thick/pooling when moving slowly, with smooth Catmull-Rom curves via Konva's canvas API.

## Files to Modify
1. **`client/src/components/HomePage/freedomWall/FreedomWallPage.jsx`** - All client changes
2. **`server/services/freedomWallService.js`** - Accept `widths` array in `sanitizeDoodlePayload` (line 73-97)

## Plan

### 1. Add ink physics constants (FreedomWallPage.jsx, near line 100)

```js
const INK_SPEED_MIN = 0.1;    // px/ms - below this = max width (pooling)
const INK_SPEED_MAX = 8.0;    // px/ms - above this = min width (thin)
const INK_WIDTH_MIN = 0.3;    // multiplier at max speed
const INK_WIDTH_MAX = 1.5;    // multiplier at min speed
const INK_SMOOTH_FACTOR = 0.35;

const speedToWidthMultiplier = (speed) => {
    const t = clamp((speed - INK_SPEED_MIN) / (INK_SPEED_MAX - INK_SPEED_MIN), 0, 1);
    return INK_WIDTH_MAX - (t * t) * (INK_WIDTH_MAX - INK_WIDTH_MIN);
};
```

### 2. Add `makeInkSceneFunc` helper (before the component)

A pure function that returns a Konva `sceneFunc` closure. It draws smooth variable-width curves using midpoint quadratic beziers (same technique Konva uses for `tension`), but with per-segment `ctx.lineWidth`:

- For each segment: `ctx.beginPath()` → set `lineWidth` from widths array → `ctx.moveTo(prevMidpoint)` → `ctx.quadraticCurveTo(currentPoint, nextMidpoint)` → `ctx.stroke()`
- First and last segments use the actual endpoints instead of midpoints
- End cap: small filled circle at the last point

### 3. Add new refs (inside component, near line 632)

```js
const draftWidthsRef = useRef([]);
const lastDoodlePointRef = useRef(null);  // { x, y, t }
```

### 4. Modify `handleStagePointerDown` (doodle branch, ~line 1710)

After initializing `draftDoodleRef.current` and `setDraftDoodlePoints`:
- Set `lastDoodlePointRef.current = { x: normalizedPointer.x, y: normalizedPointer.y, t: performance.now() }`
- Set `draftWidthsRef.current = []` (no width for the first point - widths are per-segment)

### 5. Modify `handleStagePointerMove` (doodle branch, ~line 1812)

Before appending to `draftDoodleRef.current`, compute velocity-based width:
- `dt = performance.now() - lastDoodlePointRef.current.t`
- `speed = pixelDistance / max(dt, 1)` where pixelDistance uses `stageWidth`/`stageHeight` to de-normalize
- `rawWidth = speedToWidthMultiplier(speed)`
- Exponential smoothing: `smoothed = prev + INK_SMOOTH_FACTOR * (raw - prev)`
- Push `smoothed` to `draftWidthsRef.current`
- Update `lastDoodlePointRef.current`

### 6. Modify `handleStagePointerUp` (doodle branch, ~line 1843)

Include widths in the payload sent to `createWallItem`:
```js
createWallItem("doodle", {
    points: normalizedPoints,
    widths: draftWidthsRef.current.slice(0, normalizedPoints.length / 2 - 1),
    color: doodleColor,
    size: doodleSize
});
```
Reset `draftWidthsRef.current = []` and `lastDoodlePointRef.current = null`.

### 7. Modify saved doodle rendering (~line 2007-2031)

Add a branch: if `item.payload.widths` exists and has entries, render `<Shape sceneFunc={makeInkSceneFunc(...)}>` instead of `<Line>`. Old doodles without `widths` keep the existing `<Line tension={0.12}>` unchanged.

### 8. Modify draft doodle rendering (~line 2546-2557)

Replace the draft `<Line>` with `<Shape sceneFunc={makeInkSceneFunc(...)}>` using `draftWidthsRef.current`. Fall back to `<Line>` if no widths collected yet (first couple points).

### 9. Server: update `sanitizeDoodlePayload` (freedomWallService.js:73-97)

Add optional `widths` validation after the existing size validation:
- If `payload.widths` is an array, parse each as Number, filter NaN, clamp to `[0.1, 3.0]`
- Include `widths` in the returned object only if valid entries exist
- No schema migration needed (JSONB column accepts any shape)

## Backward Compatibility
- Old doodles without `widths` render with the existing `<Line>` path - zero visual change
- The `widths` field is optional in the payload - server accepts doodles with or without it
- Eraser (`isPointerNearDoodle`) works unchanged - it uses centerline distance which is unaffected by variable width

## Verification
1. Start the dev server, open the Freedom Wall
2. Draw doodles with varying speed - fast strokes should be thin, slow strokes thick
3. Verify old doodles (already in DB) still render normally
4. Verify new doodles persist correctly after page refresh
5. Test eraser still works on ink physics doodles
6. Test on mobile (touch events) - velocity tracking should work the same
