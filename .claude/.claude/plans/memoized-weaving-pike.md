# Plan: Add drag threshold so clicking a column doesn't move it immediately

## Context
When the user clicks a column (or fixture, door, window, etc.) on the plan to select it, the object immediately enters drag mode. Any slight mouse movement during the click causes the object to jump. The user wants to click to select without accidental movement — dragging should only start after the mouse moves beyond a small threshold.

**Root cause:** In `selectHandler.js` `onMouseDown` (line 148-161), `dragging: true` is set immediately for any hit on a draggable object. There is no distance check before `onMouseMove` starts dispatching position updates.

## Changes

### 1. `src/editor/handlers/selectHandler.js` — onMouseDown (~line 148-161)

Instead of setting `dragging: true` immediately, set a `pendingDrag` state that records intent without actually entering drag mode:

```js
// Before (current):
editorDispatch({
  type: 'UPDATE_TOOL_STATE',
  payload: { dragging: true, dragType: 'move', startPos: modelPos, originalPos: modelPos },
});

// After:
editorDispatch({
  type: 'UPDATE_TOOL_STATE',
  payload: { pendingDrag: true, dragging: false, dragType: 'move', startPos: modelPos, originalPos: modelPos },
});
```

### 2. `src/editor/handlers/selectHandler.js` — onMouseMove (~line 175+)

At the top of `onMouseMove`, before processing any drag logic, add a threshold check that promotes `pendingDrag` to `dragging`:

```js
const DRAG_THRESHOLD_PX = 4;

if (toolState.pendingDrag && !toolState.dragging) {
  const dx = modelPos.x - toolState.startPos.x;
  const dy = modelPos.y - toolState.startPos.y;
  const distPx = Math.sqrt(dx * dx + dy * dy) * viewport.zoom;
  if (distPx < DRAG_THRESHOLD_PX) return; // not enough movement yet
  // Promote to real drag
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: { pendingDrag: false, dragging: true },
  });
}
```

Once promoted, the existing drag logic runs normally. Below the threshold, mouse movements are ignored (no position updates dispatched).

### 3. `src/editor/handlers/selectHandler.js` — onMouseUp (~line 440+)

Clear `pendingDrag` on mouse up so a simple click-and-release never enters drag mode:

```js
// In the existing cleanup at the end of onMouseUp, ensure pendingDrag is also reset:
editorDispatch({
  type: 'UPDATE_TOOL_STATE',
  payload: { dragging: false, pendingDrag: false, ... },
});
```

## Files to modify
- `src/editor/handlers/selectHandler.js` — all three changes above

## Verification
1. Run the app, place a column
2. Click it — it should select (highlight) without moving
3. Click and drag deliberately — it should move after ~4px of mouse movement
4. Same behavior for fixtures, doors, windows, walls, stairs, etc.
5. Marquee selection (clicking empty space and dragging) should still work as before
