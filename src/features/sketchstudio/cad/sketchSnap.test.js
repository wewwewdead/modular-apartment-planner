import { expect, it } from 'vitest';
import { snapPoint, snapTargets } from './sketchSnap.js';

it('snaps to measure mark points projected onto the sketch plane', () => {
  const targets = snapTargets({ entities: [], boundary: [], marks: [[600, 0]] });
  expect(targets.points).toContainEqual({ point: [600, 0], kind: 'mark' });
  expect(snapPoint([599.2, 0.5], { targets, grid: 10, tolerance: 2 })).toEqual({ point: [600, 0], kind: 'mark' });
  // Ortho keeps the locked axis and aligns the free one to the mark.
  expect(snapPoint([599.4, 30], { targets, grid: 10, tolerance: 2, ortho: true, from: [0, 30] })).toEqual({
    point: [600, 30],
    kind: 'ortho · mark',
  });
  // Without marks nothing changes.
  expect(snapTargets({}).points).toEqual([{ point: [0, 0], kind: 'origin' }]);
});
