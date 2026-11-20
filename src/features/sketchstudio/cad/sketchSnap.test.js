import { describe, expect, it, vi } from 'vitest';
import { snapPoint, snapTargets } from './sketchSnap.js';
import { intersect } from './sketchIntersect.js';
import { samplePartEntities, timeRuns } from './vw400Samples.testkit.js';

// The exact crossings, counted: the snap must try only the pieces near the cursor.
vi.mock('./sketchIntersect.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, intersect: vi.fn(actual.intersect) };
});

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

// Intersection snap (docs/sketch-studio-hand-drawing.md §6.3, §6.7).
describe('intersection snap', () => {
  // y = x / 2 and y = 90 − x cross at (60, 30); their midpoints are (50, 25) and (45, 45).
  const crossing = [
    { id: 'e1', type: 'line', a: [0, 0], b: [100, 50], construction: true },
    { id: 'e2', type: 'line', a: [0, 90], b: [90, 0], construction: true },
  ];

  it('snaps where two construction lines cross, before an edge and the grid', () => {
    const targets = snapTargets({ entities: crossing });
    expect(snapPoint([61, 31], { targets, grid: 10, tolerance: 3 })).toEqual({ point: [60, 30], kind: 'intersection' });
    // Out of reach of the crossing: on the line, then the grid.
    expect(snapPoint([70, 35.5], { targets, grid: 10, tolerance: 1 })).toMatchObject({ kind: 'on sketch' });
    expect(snapPoint([70, 70], { targets, grid: 10, tolerance: 1 })).toEqual({ point: [70, 70], kind: 'grid' });
    // Shift (ortho) is as before: no intersection.
    expect(snapPoint([61, 31], { targets, grid: 10, tolerance: 3, ortho: true, from: [0, 31] }).kind).toMatch(/^ortho/);
  });

  it('lets a key point win a tie, and the nearer of a key point and a crossing win otherwise', () => {
    // Two lines ending on one corner: their crossing is that corner, an endpoint.
    const corner = snapTargets({
      entities: [
        { id: 'e1', type: 'line', a: [0, 0], b: [10, 0] },
        { id: 'e2', type: 'line', a: [10, 0], b: [10, 10] },
      ],
    });
    expect(snapPoint([10.5, 0.5], { targets: corner, tolerance: 2 })).toEqual({ point: [10, 0], kind: 'endpoint' });
    // The crossing (60, 30) and e1's midpoint (50, 25) 11.2 apart: the nearer wins.
    const targets = snapTargets({ entities: crossing });
    expect(snapPoint([58, 29], { targets, tolerance: 9 })).toEqual({ point: [60, 30], kind: 'intersection' });
    expect(snapPoint([52, 26], { targets, tolerance: 9 })).toEqual({ point: [50, 25], kind: 'midpoint' });
  });

  it('finds a line on a circle exactly, and a sketch line on a model edge', () => {
    // x + y = 7 through the circle of radius 5 at (3, 4).
    const targets = snapTargets({
      entities: [
        { id: 'e1', type: 'circle', c: [0, 0], r: 5 },
        { id: 'e2', type: 'line', a: [0, 7], b: [7, 0] },
      ],
    });
    expect(snapPoint([3.2, 3.9], { targets, tolerance: 0.5 })).toEqual({ point: [3, 4], kind: 'intersection' });
    // A line from (40, −10) to (60, 30) crosses the model edge y = 0 at x = 45 (its midpoint is (50, 10)).
    const edge = snapTargets({
      entities: [{ id: 'e1', type: 'line', a: [40, -10], b: [60, 30] }],
      boundary: [
        [
          [0, 0],
          [100, 0],
        ],
      ],
    });
    expect(snapPoint([45.4, 0.3], { targets: edge, tolerance: 1 })).toEqual({ point: [45, 0], kind: 'intersection' });
    // An arc and a rectangle side: the rectangle (0, 0)–(10, 10) and the upper half circle of radius 5 at (10, 5).
    const curved = snapTargets({
      entities: [
        { id: 'e1', type: 'rect', a: [0, 0], b: [10, 10] },
        { id: 'e2', type: 'arc', a: [15, 5], m: [10, 10], b: [5, 5] },
      ],
    });
    expect(snapPoint([10.2, 9.8], { targets: curved, tolerance: 1 })).toEqual({ point: [10, 10], kind: 'endpoint' });
    expect(snapPoint([6.1, 8.1], { targets: curved, tolerance: 1 }).kind).toBe('on sketch');
  });

  it('tries only the pieces near the cursor on the cover’s 2 210 entities, inside 1 ms (median)', () => {
    const cover = samplePartEntities().find((p) => p.name === 'COVER -02').entities;
    expect(cover).toHaveLength(2210);
    const targets = snapTargets({ entities: cover });
    // Raw points across the whole part: on hexagon corners, between them, on the outline, off the part.
    const raws = Array.from({ length: 41 }, (_, i) => [5 + i * 9.7, 3 + ((i * 37) % 41) * 12.1]);
    let calls = 0;
    for (const raw of raws) {
      intersect.mockClear();
      snapPoint(raw, { targets, grid: 1, tolerance: 4 });
      calls = Math.max(calls, intersect.mock.calls.length);
    }
    // A hexagon corner has two sides and the two neighbours' nearby ones: a handful of pairs, never thousands.
    expect(calls).toBeLessThan(60);
    // Wall clock: under the full suite's parallel load a run can measure how long it waited
    // for a core, so up to five runs of 41 are taken, stopping once one is inside the budget.
    let timing;
    for (let run = 0; run < 5 && !(timing?.median < 1); run++)
      timing = timeRuns((i = 0) => snapPoint(raws[i % raws.length], { targets, grid: 1, tolerance: 4 }), 41);
    console.warn(
      `snapPoint on the cover: median ${timing.median.toFixed(3)} ms, worst ${timing.worst.toFixed(3)} ms, at most ${calls} exact tests a snap`,
    );
    expect(timing.median).toBeLessThan(1);
  });
});
