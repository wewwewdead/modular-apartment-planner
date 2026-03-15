# Render Fixtures on Sheet Viewports

## Context

Fixtures (toilet, bed, sofa, kitchen top, etc.) are placed on the plan but do not appear in sheet viewports. The `PlanViewportContent` in `SheetViewportContent.jsx` renders walls, rooms, doors, windows, beams, stairs, landings, columns, slabs, section cuts, and annotations — but **not fixtures**. Additionally, `collectPlanPoints()` in `sources.js` doesn't include fixture geometry, so fixtures wouldn't affect viewport bounds either.

## Files to Modify

### 1. `src/renderers/SheetViewportContent.jsx`

**Add imports** for `FixtureDefs` and `FixtureRenderer`:
```jsx
import FixtureDefs from './FixtureDefs';
import FixtureRenderer from './FixtureRenderer';
```

**Add to `PlanViewportContent`** — insert between `ColumnRenderer` and `DoorRenderer` (matching z-order from `SvgCanvas.jsx` line 333):
```jsx
<FixtureDefs />
<FixtureRenderer fixtures={floor.fixtures || []} />
```

`FixtureDefs` provides the SVG `<defs>` (gradients + shadow filter) that `FixtureRenderer` references via `url(#grad-*)` fills. Both must be present in the sheet SVG context.

### 2. `src/sheets/sources.js`

**Add import** for `fixtureOutline`:
```jsx
import { fixtureOutline } from '@/geometry/fixtureGeometry';
```

**Add fixture points to `collectPlanPoints()`** — append after the windows loop (line 84), before the return:
```js
for (const fixture of floor.fixtures || []) {
  points.push(...fixtureOutline(fixture));
}
```

This ensures fixtures are included in the viewport bounds calculation so the auto-fit doesn't cut them off.

## Verification

1. Run `npm run dev`, open the app
2. Place several fixtures on the plan (toilet, bed, sofa, etc.)
3. Switch to sheet workspace
4. Confirm fixtures appear in the plan viewport on the sheet
5. Confirm fixture gradients/styling render correctly (not plain fills)
6. Place a fixture far from other geometry — confirm the viewport auto-fits to include it
