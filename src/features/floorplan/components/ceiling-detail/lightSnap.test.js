import { describe, expect, it } from 'vitest';
import { collectLightSnapTargets, panelAtPoint, snapLightPoint } from './lightSnap';

// One pixel per millimetre keeps the radius arithmetic readable: 12 px is 12 mm.
const SCREEN = { pixelsPerU: 1, pixelsPerV: 1, radiusPx: 12 };
const BOUNDS = { length: 6000, depth: 4000 };
const GRID = { enabled: true, step: 50 };

const PANELS = [
  { id: 'c:panel:a', localId: 'a', label: 'P1', u0: 0, u1: 1200, v0: 0, v1: 2400 },
  { id: 'c:panel:b', localId: 'b', label: 'P2', u0: 1200, u1: 2400, v0: 0, v1: 2400 },
];
const REGIONS = [
  {
    outline: [
      { u: 3000, v: 0 },
      { u: 6000, v: 0 },
      { u: 6000, v: 4000 },
      { u: 3000, v: 4000 },
    ],
    holes: [],
  },
];

function targetsFor(fixtures, extra = {}) {
  return collectLightSnapTargets({ panels: PANELS, regions: REGIONS, fixtures, ...BOUNDS, ...extra });
}

function snap(point, targets, options = {}) {
  return snapLightPoint(point, targets, { ...SCREEN, grid: GRID, bounds: BOUNDS, ...options });
}

describe('collectLightSnapTargets', () => {
  it('collects lines, midpoints, the run, board and room centres', () => {
    const fixtures = [
      { id: 'l1', u: 1000, v: 3000 },
      { id: 'l2', u: 2500, v: 3000 },
    ];
    const targets = targetsFor(fixtures);
    const kinds = (kind) => targets.filter((target) => target.kind === kind);

    expect(kinds('fixture_line')).toHaveLength(4);
    expect(kinds('midpoint')).toEqual([
      expect.objectContaining({ u: 1750, v: 3000, label: 'Midway Light 1 – Light 2' }),
    ]);
    // The step back from the first light would land off the ceiling, so only
    // the step forward is offered.
    expect(kinds('run').map((target) => [target.u, target.v])).toEqual([[4000, 3000]]);
    expect(kinds('run')[0].label).toBe('Next in run · 1,500 mm');
    expect(kinds('board_centre').map((target) => [target.u, target.v, target.label])).toEqual([
      [600, 1200, 'Board P1 · centre'],
      [1800, 1200, 'Board P2 · centre'],
    ]);
    expect(kinds('region_centre')).toEqual([expect.objectContaining({ u: 4500, v: 2000, label: 'Room centre' })]);
  });

  it('only pairs lights that share a line into midpoints', () => {
    const targets = targetsFor([
      { id: 'l1', u: 1000, v: 1000 },
      { id: 'l2', u: 2000, v: 2000 },
    ]);
    expect(targets.some((target) => target.kind === 'midpoint')).toBe(false);
  });

  it('leaves the light being moved out, and keeps the others named as they were', () => {
    const targets = targetsFor(
      [
        { id: 'l1', u: 1000, v: 1000 },
        { id: 'l2', u: 2000, v: 1000 },
        { id: 'l3', u: 3000, v: 1000 },
      ],
      { excludeId: 'l2' },
    );
    const lines = targets.filter((target) => target.kind === 'fixture_line');
    expect(lines.map((line) => line.fixtureId)).not.toContain('l2');
    expect(lines.map((line) => line.label)).toContain('Light 3');
  });
});

describe('snapLightPoint', () => {
  const placed = [
    { id: 'l1', u: 1000, v: 3000 },
    { id: 'l2', u: 2500, v: 3000 },
  ];

  it('lets a point target in reach beat the line it sits on', () => {
    const result = snap({ u: 1755, v: 3006 }, targetsFor(placed));
    expect(result.point).toEqual({ u: 1750, v: 3000 });
    expect(result.snap).toEqual({ kind: 'midpoint', label: 'Midway Light 1 – Light 2' });
    expect(result.guides).toEqual([{ axis: 'v', value: 3000 }]);
  });

  it('offers the next light of a run at the same spacing', () => {
    const result = snap({ u: 3992, v: 2995 }, targetsFor(placed));
    expect(result.point).toEqual({ u: 4000, v: 3000 });
    expect(result.snap.label).toBe('Next in run · 1,500 mm');
  });

  it('locks a U line and a V line in reach to their crossing', () => {
    const fixtures = [
      { id: 'l1', u: 1000, v: 500 },
      { id: 'l2', u: 5000, v: 3500 },
    ];
    // Clear of the run points (9000/−3000) and of every centre.
    const result = snap({ u: 1008, v: 3492 }, targetsFor(fixtures));
    expect(result.point).toEqual({ u: 1000, v: 3500 });
    expect(result.snap.label).toBe('In line with Light 1 and Light 2');
    expect(result.guides).toEqual([
      { axis: 'u', value: 1000 },
      { axis: 'v', value: 3500 },
    ]);
  });

  it('holds one line and grids the other coordinate, naming the spacing', () => {
    const result = snap({ u: 1007, v: 1612 }, targetsFor([{ id: 'l1', u: 1000, v: 3000 }]));
    expect(result.point).toEqual({ u: 1000, v: 1600 });
    expect(result.snap).toEqual({ kind: 'fixture_line', label: 'In line with Light 1 · 1,400 mm' });
    expect(result.guides).toEqual([{ axis: 'u', value: 1000 }]);
  });

  it('falls to a board centre, then a room centre, then the grid', () => {
    const targets = targetsFor([]);
    expect(snap({ u: 1795, v: 1207 }, targets)).toMatchObject({
      point: { u: 1800, v: 1200 },
      snap: { kind: 'board_centre', label: 'Board P2 · centre' },
    });
    expect(snap({ u: 4495, v: 2006 }, targets)).toMatchObject({
      point: { u: 4500, v: 2000 },
      snap: { kind: 'region_centre', label: 'Room centre' },
    });
    expect(snap({ u: 3333, v: 777 }, targets)).toMatchObject({
      point: { u: 3350, v: 800 },
      snap: { kind: 'grid', label: 'Grid' },
    });
  });

  it('judges reach in screen pixels, so zooming out widens it in millimetres', () => {
    const targets = targetsFor([]);
    // 30 mm off the board centre: out of reach at 1 px/mm, in reach at 0.25 px/mm.
    expect(snap({ u: 1830, v: 1200 }, targets).snap.kind).toBe('grid');
    expect(snap({ u: 1830, v: 1200 }, targets, { pixelsPerU: 0.25, pixelsPerV: 0.25 }).snap.kind).toBe('board_centre');
  });

  it('snaps nothing with snapping off, unless Shift holds a line', () => {
    const targets = targetsFor(placed);
    expect(snap({ u: 1751, v: 3001 }, targets, { enabled: false })).toEqual({
      point: { u: 1751, v: 3001 },
      snap: null,
      guides: [],
    });
    const held = snap({ u: 1751, v: 3201 }, targets, {
      enabled: false,
      shiftAnchor: placed[1],
      shiftLabel: 'Light 2',
    });
    expect(held.point).toEqual({ u: 1751, v: 3000 });
    expect(held.guides).toEqual([{ axis: 'v', value: 3000 }]);
  });

  it('with Shift, replaces the lines with the anchor light’s nearer line, held whatever the distance', () => {
    const targets = targetsFor(placed);
    // 400 mm off the anchor's V line and 900 off its U line: the V line holds.
    const result = snap({ u: 1611, v: 3400 }, targets, { shiftAnchor: placed[1], shiftLabel: 'Light 2' });
    expect(result.point).toEqual({ u: 1600, v: 3000 });
    expect(result.snap.label).toBe('In line with Light 2');
    expect(result.guides).toEqual([{ axis: 'v', value: 3000 }]);
    // Along the held line a midpoint still catches it.
    const midway = snap({ u: 1745, v: 3400 }, targets, { shiftAnchor: placed[1], shiftLabel: 'Light 2' });
    expect(midway.point).toEqual({ u: 1750, v: 3000 });
    expect(midway.snap.label).toBe('In line with Light 2 · Midway Light 1 – Light 2');
  });

  it('keeps the light on the ceiling', () => {
    expect(snap({ u: -40, v: 4100 }, [], { grid: null }).point).toEqual({ u: 0, v: 4000 });
  });
});

describe('panelAtPoint', () => {
  it('finds the board under a point by its rectangle', () => {
    expect(panelAtPoint(PANELS, { u: 1300, v: 10 })?.label).toBe('P2');
    expect(panelAtPoint(PANELS, { u: 5000, v: 10 })).toBeNull();
  });

  it('names no board over the part of a clipped board that was cut away', () => {
    // A 1200 × 2400 board whose top-right quarter lies outside an L-shaped ceiling.
    const clipped = {
      ...PANELS[0],
      regions: [
        {
          outline: [
            { u: 0, v: 0 },
            { u: 1200, v: 0 },
            { u: 1200, v: 1200 },
            { u: 600, v: 1200 },
            { u: 600, v: 2400 },
            { u: 0, v: 2400 },
          ],
          holes: [],
        },
      ],
    };
    expect(panelAtPoint([clipped], { u: 300, v: 2000 })?.label).toBe('P1');
    expect(panelAtPoint([clipped], { u: 900, v: 2000 })).toBeNull();
  });
});
