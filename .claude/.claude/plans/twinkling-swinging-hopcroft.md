# Improve Measurement Precision

## Context

Dimension labels and area tags throughout the app lose precision due to aggressive rounding in display formatting. A wall of 5432mm shows as "5.43 m" (10mm precision) instead of "5.432 m" (1mm precision). Room areas show only 1 decimal place in SVG tags but 2 in the properties panel. The wall preview while drawing has its own inline formatting instead of using the shared function. Internally, all calculations and storage use full floating-point precision in mm — the issue is purely in how values are formatted for display.

## Changes (3 files, 4 lines)

### 1. `src/annotations/format.js` line 2 — Core formatting precision
- `.toFixed(2)` → `.toFixed(3)` in `formatMeasurement()`
- All dimension labels across plan view, elevation view, and manual dimensions flow through this single function
- Gives 1mm precision (architectural standard) instead of 10mm

### 2. `src/renderers/WallPreview.jsx` lines 1, 12 — Eliminate duplicate formatting
- Add import: `import { formatMeasurement } from '@/annotations/format'`
- Replace inline `(len / 1000).toFixed(2) + ' m'` with `formatMeasurement(len)`
- Preview label now matches committed dimension labels

### 3. `src/annotations/tags.js` line 8 — Room area tag precision
- `.toFixed(1)` → `.toFixed(2)` in `formatRoomArea()`
- Now consistent with PropertiesPanel room area (already `.toFixed(2)`)
- 0.01 m² precision instead of 0.1 m²

## What is NOT changed (and why)

- **`useUnits().toDisplay`** in PropertiesPanel: The `+` coercion stripping trailing zeros is intentional UX for input fields (users don't want to type over "5.000")
- **Geometry/calculation code**: `point.js`, `line.js`, `polygon.js` etc. already use full IEEE 754 precision — no changes needed
- **`Math.hypot` vs `Math.sqrt`**: Equivalent for this domain, changing would be churn
- **Coordinate rounding on creation**: Would change stored data, not just display — too invasive for this scope
- **Slab area** (PropertiesPanel line 155): Already `.toFixed(2)`, consistent with target
- **Serialization/persistence**: No changes

## Verification

After changes, visually confirm:
- Wall dimension labels show 3 decimal places (e.g., "3.000 m")
- Wall preview label while drawing matches committed dimension labels
- Room area tags in SVG show 2 decimal places (e.g., "12.35 m²")
- Elevation view dimensions show 3 decimal places
- Manual dimensions with text overrides still show override text
- mm/m unit toggle in PropertiesPanel still works correctly
