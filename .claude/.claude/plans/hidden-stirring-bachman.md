# Fix Purlin Start Offset Dimension Endpoint

## Context

The "Purlin Start" dimension in the truss detail view has its start endpoint pointing at the wrong location when the truss has overhangs. The dimension label value is correct (showing distance from bearing to first purlin), but the dimension line starts at the **overhang tip** instead of the **bearing point**.

**Root cause:** In `buildTrussDetailDimensions` (line 949–951), the `purlinStartPoint` is taken from `roofOutline[0]` / `roofOutline[last]`. But `roofOutline` includes overhang extensions:
```javascript
roofOutline: [
  { x: -metrics.overhangStart, z: ... },  // overhang tip, NOT bearing
  ...structuralOutline,                     // structural points
  { x: metrics.span + metrics.overhangEnd, z: ... },
]
```
Meanwhile, purlin `distanceAlong` is measured from the **top chord run** start, which uses `structuralOutline` (starts at x=0, the bearing point). So the dimension line endpoints don't match what the label measures.

## File to Modify

### `src/geometry/trussGeometry.js`

### Change: Use top chord run start point instead of roof outline endpoint (lines ~945–951)

**Current** (lines 948–951):
```javascript
const purlinSideOffset = side === 'right' ? DETAIL_PURLIN_OFFSET : -DETAIL_PURLIN_OFFSET;
const purlinStartPoint = side === 'right'
  ? (roofOutline[roofOutline.length - 1] || ridge)
  : (roofOutline[0] || ridge);
```

**New** — find the matching top chord run for this purlin group's `side`, and use its first point:
```javascript
const purlinSideOffset = side === 'right' ? DETAIL_PURLIN_OFFSET : -DETAIL_PURLIN_OFFSET;
const matchingRun = (instanceGeometry.topChordRuns || [])
  .find((run) => (run.side || run.id) === side);
const purlinStartPoint = matchingRun?.points?.[0]
  || (side === 'right'
    ? (roofOutline[roofOutline.length - 1] || ridge)
    : (roofOutline[0] || ridge));
```

- Finds the top chord run whose `side` matches the purlin group's side
- Uses the run's first point (the bearing/eave structural point) as the dimension start
- Falls back to the old behavior if no matching run is found (safety)
- `topChordRuns` is already available on `instanceGeometry` (line 426)

## Verification

1. Create a truss with overhangs (overhangStart > 0) and purlins enabled
2. Switch to detail view
3. Verify the "Purlin Start" dimension line starts at the bearing point, not the overhang tip
4. Verify the dimension value matches the actual distance between the two endpoints
5. Test with a truss with zero overhang — should be unchanged (roofOutline[0] == bearing)
6. Test with a dual-slope (gable) truss — both left and right purlin start dimensions should point correctly
