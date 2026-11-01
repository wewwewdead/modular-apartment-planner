// Phase K (docs/sketch-studio-hole-row.md): the pure rules of a hole row —
// rowFromEnd's rounding and snap rules (§3.2), the default spacing (§3.3),
// the count clamps (§3.4), Flip direction, the row length, the edge margin
// (§7) and the direction label. The flow on boards lives in
// placementCuts.test.js.
import { describe, expect, it } from 'vitest';
import {
  AXIS_SNAP_DEGREES,
  changeRowCount,
  clampCount,
  defaultPitch,
  edgeMargin,
  flipRow,
  isFeatureSnap,
  rowDefaults,
  rowDirectionLabel,
  rowFromEnd,
  setRowLength,
} from './placementRows.js';

const close = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};
const GRID = { origin: [0, 0, 18], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] };
const SEED = [100, 100, 18];
const at = (length, degrees) => {
  const t = (degrees * Math.PI) / 180;
  return [SEED[0] + length * Math.cos(t), SEED[1] + length * Math.sin(t), 18];
};
const row = (patch) => rowFromEnd({ origin: SEED, count: 4, step: 1, grid: GRID, ...patch });

describe('defaultPitch', () => {
  it('is 4 × Ø, at least 10 mm, rounded up to 5 mm', () => {
    expect(defaultPitch(6.6)).toBe(30);
    expect(defaultPitch(3)).toBe(15);
    expect(defaultPitch(10)).toBe(40);
    expect(defaultPitch(6)).toBe(25);
    expect(defaultPitch(1)).toBe(10);
    expect(defaultPitch(0)).toBe(10);
  });
});

describe('rowFromEnd', () => {
  it('ignores an end on the first hole (the second click of a double click)', () => {
    expect(row({ end: SEED })).toBeNull();
    expect(row({ end: [100.05, 100, 18] })).toBeNull();
  });
  it('rounds a grid end to the Move grid: 150.4 mm at count 4 → pitch 50', () => {
    const r = row({ end: [250.4, 100, 18], snapKind: 'grid' });
    expect(r.pitch).toBe(50);
    expect(r.length).toBe(150);
    expect(r.direction).toEqual([1, 0, 0]);
    expect(r.snapKind).toBe('axis');
  });
  it('keeps the exact length to a feature snap (pitch 33.3333, direction not snapped)', () => {
    const r = row({ end: [200, 100, 18], snapKind: 'vertex' });
    expect(r.pitch).toBeCloseTo(100 / 3, 9);
    expect(r.snapKind).toBe('vertex');
    const mark = row({ end: at(90, 1), snapKind: 'mark' });
    expect(mark.pitch).toBeCloseTo(30, 9);
    close(mark.direction, [Math.cos(Math.PI / 180), Math.sin(Math.PI / 180), 0]);
    expect(isFeatureSnap('ortho · hole centre')).toBe(true);
    expect(isFeatureSnap('grid')).toBe(false);
  });
  it(`snaps a free end within ${AXIS_SNAP_DEGREES}° onto the face axis, not at 10°, not with Alt`, () => {
    const near = row({ end: at(150, 2) });
    expect(near.direction).toEqual([1, 0, 0]);
    expect(near.snapKind).toBe('axis');
    const minus = row({ end: at(150, 180 - 2.5) });
    expect(minus.direction).toEqual([-1, 0, 0]);
    const y = row({ end: at(150, 91) });
    expect(y.direction).toEqual([0, 1, 0]);
    const off = row({ end: at(150, 10) });
    close(off.direction, [Math.cos(Math.PI / 18), Math.sin(Math.PI / 18), 0]);
    expect(off.snapKind).toBe('free');
    const alt = row({ end: at(150, 2), free: true, step: 0 });
    close(alt.direction, [Math.cos(Math.PI / 90), Math.sin(Math.PI / 90), 0]);
    expect(alt.pitch).toBeCloseTo(50, 9);
  });
  it('keeps Shift ortho as the snap kind (the viewport already locked the end to an axis)', () => {
    const r = row({ end: [100, 40, 18], snapKind: 'ortho' });
    expect(r.direction).toEqual([0, -1, 0]);
    expect(r.pitch).toBe(20);
    expect(r.snapKind).toBe('ortho');
  });
  it('uses the length along the snapped axis, never a pitch under 0.1 mm', () => {
    const r = row({ end: at(60, 2), step: 0 });
    expect(r.pitch).toBeCloseTo((60 * Math.cos(Math.PI / 90)) / 3, 9);
    expect(row({ end: [100.2, 100, 18], step: 1 }).pitch).toBe(0.1);
  });
});

describe('count, flip, length', () => {
  const seedDraft = (count) => ({
    feature: { type: 'hole' },
    placement: { stage: 'place', row: { count, seed: true } },
  });
  const shapeDraft = (count) => ({
    feature: { type: 'hole', row: { count, pitch: 20, direction: [1, 0, 0] } },
    placement: { stage: 'shape', row: { count, pitch: 20, seed: false } },
  });
  it('clamps the count to 2 … 100 in both stages; Shape keeps the spacing', () => {
    expect(clampCount(1)).toBe(2);
    expect(clampCount(101)).toBe(100);
    const up = changeRowCount(seedDraft(4), 1);
    expect(up.placement.row.count).toBe(5);
    const top = seedDraft(100);
    expect(changeRowCount(top, 1)).toBe(top);
    const bottom = shapeDraft(2);
    expect(changeRowCount(bottom, -1)).toBe(bottom);
    const grown = changeRowCount(shapeDraft(4), 1);
    expect(grown.feature.row).toEqual({ count: 5, pitch: 20, direction: [1, 0, 0] });
    expect(grown.placement.row.count).toBe(5);
    const fewer = changeRowCount(shapeDraft(4), -1);
    expect(fewer.feature.row.count).toBe(3);
  });
  it('counts from template defaults: 4 holes, spacing unset, or what was carried', () => {
    expect(rowDefaults()).toEqual({ count: 4, pitch: null });
    expect(rowDefaults({ row: { count: 6, pitch: 25 } })).toEqual({ count: 6, pitch: 25 });
  });
  it('Flip direction twice restores the vector', () => {
    const feature = { row: { count: 3, pitch: 10, direction: [0.6, -0.8, 0] } };
    const once = flipRow(feature);
    expect(once.row.direction).toEqual([-0.6, 0.8, 0]);
    expect(flipRow(once).row.direction).toEqual([0.6, -0.8, 0]);
  });
  it('a typed row length sets the spacing at the same count', () => {
    const feature = { row: { count: 4, pitch: 10, direction: [1, 0, 0] } };
    expect(setRowLength(feature, 100).row.pitch).toBe(33.3333);
    expect(setRowLength(feature, 150).row).toEqual({ count: 4, pitch: 50, direction: [1, 0, 0] });
    expect(() => setRowLength(feature, 0)).toThrow('Row length must be greater than zero.');
  });
});

describe('edge margin and direction label', () => {
  const box = [
    [
      [0, 0],
      [600, 0],
    ],
    [
      [600, 0],
      [600, 400],
    ],
    [
      [600, 400],
      [0, 400],
    ],
    [
      [0, 400],
      [0, 0],
    ],
  ];
  it('measures from the last centre to the outline along the row; outside is past the edge', () => {
    expect(edgeMargin(box, [500, 100], [1, 0])).toEqual({ inside: true, distance: 100 });
    expect(edgeMargin(box, [500, 100], [0, -1])).toEqual({ inside: true, distance: 100 });
    const oblique = edgeMargin(box, [300, 200], [3, 4]);
    expect(oblique.inside).toBe(true);
    expect(oblique.distance).toBeCloseTo(250, 9);
    expect(edgeMargin(box, [700, 100], [1, 0]).inside).toBe(false);
    expect(edgeMargin([], [0, 0], [1, 0])).toBeNull();
  });
  it('names the direction against the face grid, else gives the angle', () => {
    expect(rowDirectionLabel([1, 0, 0], GRID)).toBe('+X');
    expect(rowDirectionLabel([0, -1, 0], GRID)).toBe('−Y');
    expect(rowDirectionLabel([Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0], GRID)).toBe('at 30°');
  });
});
