# Improve Measurement Precision for Real Construction Use

## Context
The user is using this tool to plan an actual apartment build and needs precise, trustworthy measurements. The internal model already stores values as floating-point millimeters (precise), but several display and interaction layers introduce unnecessary rounding or coarse tolerances that degrade accuracy.

## Changes (4 files, ~10 lines)

### 1. `src/domain/defaults.js` — Tighten snap grid & merge tolerance

| Constant | Current | New | Why |
|---|---|---|---|
| `GRID_MINOR` (line 19) | `100` | `50` | 100mm grid can't represent common dimensions like 3750mm. 50mm divides cleanly into 1000mm (20 minor lines per major). |
| `ENDPOINT_MERGE_TOLERANCE` (line 43) | `5` | `1` | 5mm silently moves wall endpoints. 1mm still catches floating-point drift but won't hide real differences. |

### 2. `src/annotations/dimensions.js` — Tighten dimension merge tolerance

| Constant | Current | New | Why |
|---|---|---|---|
| `VALUE_MERGE_TOLERANCE` (line 14) | `5` | `1` | Dimension chains hide misalignments up to 5mm. With 1mm, small alignment errors become visible on the drawing. |

### 3. `src/ui/PropertiesPanel.jsx` — Show precise values in property inputs

**`useUnits()` line 34** — Stop rounding mm to integers:
```
Current: toDisplay: (mm) => isMm ? Math.round(mm) : +(mm / 1000).toFixed(3)
New:     toDisplay: (mm) => isMm ? +mm.toFixed(1) : +(mm / 1000).toFixed(4)
```
- mm mode: show 1 decimal place (3750.5 instead of 3751). Trailing zeros stripped by unary `+`.
- m mode: bump to 4 decimal places (0.1mm resolution) to match.

**Line 455** — Stair direction angle:
```
Current: value={Math.round(directionAngle)}
New:     value={+directionAngle.toFixed(1)}
```

**Line 545** — Landing rotation:
```
Current: value={Math.round(landing.rotation || 0)}
New:     value={+(landing.rotation || 0).toFixed(1)}
```

### 4. `src/annotations/format.js` — Show small measurements in mm

```javascript
// Current (always meters):
return `${(Math.abs(mm) / 1000).toFixed(3)} m`;

// New (mm below 1m, meters above):
const abs = Math.abs(mm);
if (abs < 1000) return `${Math.round(abs)} mm`;
return `${(abs / 1000).toFixed(3)} m`;
```

This affects dimension labels on the plan, wall preview labels while drawing, and 3D inspection tooltips.

## Verification
1. `npm run dev` — open app
2. Draw walls — verify grid snaps at 50mm intervals (not 100mm)
3. Place two wall endpoints ~3mm apart — verify they do NOT merge
4. Select a wall — verify Properties Panel shows exact length (e.g. `3750` not `3800`)
5. Enter a decimal value like `3750.5` in a wall coordinate field — confirm it round-trips
6. Check dimension annotations on walls — small walls (< 1m) show `750 mm`, large walls show `3.750 m`
7. Check overall dimension chains — verify closely-spaced values aren't merged away
8. Check stair direction and landing rotation fields show decimal precision when applicable
