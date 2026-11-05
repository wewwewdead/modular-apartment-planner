import { describe, expect, it } from 'vitest';
import { CLICK_DISTANCE_THRESHOLD } from '@/features/floorplan/components/preview/previewConfig';
import {
  LIGHT_RUN_CLICK_PX,
  adjustLightRun,
  clampLightCount,
  describeLightRun,
  isLightRunDrag,
  layoutLightGrid,
  layoutLightRun,
  moveLightRun,
  resolveLightRunPoints,
  startLightRun,
} from './lightRun';

describe('layoutLightRun', () => {
  it('spaces the lights evenly from A to B, both ends included', () => {
    expect(layoutLightRun({ u: 1000, v: 1000 }, { u: 4000, v: 1000 }, 3)).toEqual([
      { u: 1000, v: 1000 },
      { u: 2500, v: 1000 },
      { u: 4000, v: 1000 },
    ]);
    // A diagonal run keeps its line.
    expect(layoutLightRun({ u: 0, v: 0 }, { u: 300, v: 400 }, 2)).toEqual([
      { u: 0, v: 0 },
      { u: 300, v: 400 },
    ]);
  });

  it('is one light when A and B are under 1 mm apart, or the count is one', () => {
    expect(layoutLightRun({ u: 500, v: 500 }, { u: 500.4, v: 500.4 }, 6)).toEqual([{ u: 500, v: 500 }]);
    expect(layoutLightRun({ u: 0, v: 0 }, { u: 3000, v: 0 }, 1)).toEqual([{ u: 0, v: 0 }]);
  });
});

describe('layoutLightGrid', () => {
  it('fills the rectangle row by row from A: columns along U, rows along V', () => {
    expect(layoutLightGrid({ u: 1000, v: 1000 }, { u: 4000, v: 2200 }, 3, 2)).toEqual([
      { u: 1000, v: 1000 },
      { u: 2500, v: 1000 },
      { u: 4000, v: 1000 },
      { u: 1000, v: 2200 },
      { u: 2500, v: 2200 },
      { u: 4000, v: 2200 },
    ]);
  });

  it('runs from A wherever B is, so a grid dragged up-left still starts at A', () => {
    const points = layoutLightGrid({ u: 3000, v: 3000 }, { u: 1000, v: 1000 }, 2, 2);
    expect(points[0]).toEqual({ u: 3000, v: 3000 });
    expect(points.at(-1)).toEqual({ u: 1000, v: 1000 });
  });

  it('collapses a side under 1 mm to one light, so a flat grid is a row and a point is one light', () => {
    expect(layoutLightGrid({ u: 0, v: 1000 }, { u: 3000, v: 1000.5 }, 4, 3)).toEqual([
      { u: 0, v: 1000 },
      { u: 1000, v: 1000 },
      { u: 2000, v: 1000 },
      { u: 3000, v: 1000 },
    ]);
    expect(layoutLightGrid({ u: 800, v: 0 }, { u: 800, v: 2000 }, 3, 2)).toEqual([
      { u: 800, v: 0 },
      { u: 800, v: 2000 },
    ]);
    expect(layoutLightGrid({ u: 5, v: 5 }, { u: 5, v: 5 }, 3, 3)).toEqual([{ u: 5, v: 5 }]);
  });
});

describe('clampLightCount', () => {
  it('keeps a count to a whole number from 2 to 24', () => {
    expect(clampLightCount(1)).toBe(2);
    expect(clampLightCount(-5)).toBe(2);
    expect(clampLightCount(7)).toBe(7);
    expect(clampLightCount(7.6)).toBe(8);
    expect(clampLightCount(25)).toBe(24);
    expect(clampLightCount('nope')).toBe(2);
  });
});

describe('describeLightRun', () => {
  it('reads a row as count × spacing and a grid as columns × rows · the two spacings', () => {
    expect(describeLightRun(layoutLightRun({ u: 1000, v: 1000 }, { u: 4000, v: 1000 }, 3))).toBe('3 × 1,500 mm');
    expect(
      describeLightRun(layoutLightGrid({ u: 1000, v: 1000 }, { u: 4000, v: 2200 }, 3, 2), {
        grid: true,
        columns: 3,
        rows: 2,
      }),
    ).toBe('3 × 2 · 1,500 × 1,200 mm');
  });

  it('reads a grid that collapsed to a line as the row it became, and one light as one light', () => {
    const flat = layoutLightGrid({ u: 0, v: 1000 }, { u: 3000, v: 1000 }, 4, 3);
    expect(describeLightRun(flat, { grid: true, columns: 4, rows: 3 })).toBe('4 × 1,000 mm');
    expect(describeLightRun([{ u: 1, v: 1 }], { grid: true, columns: 2, rows: 2 })).toBe('1 light');
    expect(describeLightRun([])).toBe('');
  });
});

describe('a run gesture', () => {
  const run = { start: { u: 1000, v: 1000 }, count: 2, columns: 2, rows: 2, grid: false, travelPx: 40 };

  it('uses the 3D pane’s own click threshold', () => {
    expect(LIGHT_RUN_CLICK_PX).toBe(CLICK_DISTANCE_THRESHOLD);
  });

  it('is a click, one light at A, until it has travelled more than the threshold', () => {
    expect(isLightRunDrag({ ...run, travelPx: LIGHT_RUN_CLICK_PX })).toBe(false);
    expect(isLightRunDrag({ ...run, travelPx: LIGHT_RUN_CLICK_PX + 0.5 })).toBe(true);
    expect(resolveLightRunPoints({ ...run, travelPx: 3 }, { u: 4000, v: 1000 })).toEqual([{ u: 1000, v: 1000 }]);
    expect(resolveLightRunPoints(run, { u: 4000, v: 1000 })).toHaveLength(2);
    expect(resolveLightRunPoints({ ...run, grid: true }, { u: 4000, v: 3000 })).toHaveLength(4);
  });

  it('takes ↑/↓ as the count of a row, ←/→ and ↑/↓ as the columns and rows of a grid, Shift as grid', () => {
    expect(adjustLightRun(run, 'ArrowUp')).toEqual({ count: 3 });
    expect(adjustLightRun(run, 'ArrowDown')).toEqual({ count: 2 });
    // Claimed, but a row has no columns to change.
    expect(adjustLightRun(run, 'ArrowRight')).toEqual({});
    const grid = { ...run, grid: true };
    expect(adjustLightRun(grid, 'ArrowRight')).toEqual({ columns: 3 });
    expect(adjustLightRun(grid, 'ArrowLeft')).toEqual({ columns: 2 });
    expect(adjustLightRun(grid, 'ArrowUp')).toEqual({ rows: 3 });
    expect(adjustLightRun({ ...grid, rows: 24 }, 'ArrowUp')).toEqual({ rows: 24 });
    expect(adjustLightRun(run, 'Shift')).toEqual({ grid: true });
    expect(adjustLightRun(run, 'Enter')).toBeNull();
  });

  it('starts as a row of two (or a 2 × 2 grid with Shift) and tracks B, Shift and screen travel', () => {
    const hover = { point: { u: 1003, v: 998 }, shift: false, pixelsPerU: 0.1, pixelsPerV: 0.1 };
    const pressed = startLightRun({ u: 1000, v: 1000 }, hover, { pointerId: 7, clientX: 100, clientY: 300 });
    expect(pressed).toMatchObject({
      kind: 'draw',
      tool: 'add_light',
      start: { u: 1000, v: 1000 },
      current: hover.point,
      count: 2,
      columns: 2,
      rows: 2,
      grid: false,
      travelPx: 0,
      pointerId: 7,
    });
    expect(startLightRun({ u: 0, v: 0 }, hover, { shiftKey: true }).grid).toBe(true);

    const later = { ...hover, point: { u: 4000, v: 1000 } };
    const moved = moveLightRun({ ...pressed, count: 3 }, { clientX: 130, clientY: 340, shiftKey: true }, later);
    expect(moved).toMatchObject({ current: later.point, hover: later, grid: true, travelPx: 50, count: 3 });
    expect(moved.start).toEqual({ u: 1000, v: 1000 });
  });
});
