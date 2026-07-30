import { describe, expect, it } from 'vitest';
import { deriveWallNeighborhood, propagateWallEdit, validateWallEdit, MAX_EXTENSION_SLACK } from './modelGraph';
import { MIN_WALL_LENGTH } from './defaults';

/**
 * Fixture (plan view, mm):
 *
 *   N(0,-3000)                          B(4000,-3000)
 *      │                                   │
 *      │           S(2000,-3000)           │
 *      │                │                  │
 *   (0,0) ●────────────●(2000,0)──────────● (4000,0)
 *          M: (0,0) ─────────────── (4000,0)
 */
function makeFloor({ extraWalls = [], doors = [], windows = [] } = {}) {
  return {
    walls: [
      { id: 'M', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 },
      { id: 'N', start: { x: 0, y: -3000 }, end: { x: 0, y: 0 }, thickness: 100 },
      { id: 'B', start: { x: 4000, y: 0 }, end: { x: 4000, y: -3000 }, thickness: 100 },
      { id: 'S', start: { x: 2000, y: -3000 }, end: { x: 2000, y: 0 }, thickness: 100 },
      ...extraWalls,
    ],
    doors,
    windows,
  };
}

function translateM(floor, dy, dx = 0) {
  return propagateWallEdit(floor, {
    id: 'M',
    start: { x: 0 + dx, y: 0 + dy },
    end: { x: 4000 + dx, y: 0 + dy },
  });
}

describe('deriveWallNeighborhood', () => {
  it('classifies corners, T-stems and clusters within tolerance', () => {
    const floor = makeFloor();
    const hood = deriveWallNeighborhood(floor.walls, 'M');
    expect(hood.start.cluster.map((m) => m.wall.id)).toEqual(['N']);
    expect(hood.end.cluster.map((m) => m.wall.id)).toEqual(['B']);
    expect(hood.stems.map((s) => s.wall.id)).toEqual(['S']);
  });

  it('clusters endpoints 0.5mm apart but not 2mm apart (1mm tolerance)', () => {
    const close = makeFloor({
      extraWalls: [{ id: 'C1', start: { x: 0.5, y: 0.3 }, end: { x: -2000, y: 2000 }, thickness: 100 }],
    });
    expect(
      deriveWallNeighborhood(close.walls, 'M')
        .start.cluster.map((m) => m.wall.id)
        .includes('C1'),
    ).toBe(true);

    const far = makeFloor({
      extraWalls: [{ id: 'C2', start: { x: 2, y: 0 }, end: { x: -2000, y: 2000 }, thickness: 100 }],
    });
    expect(
      deriveWallNeighborhood(far.walls, 'M')
        .start.cluster.map((m) => m.wall.id)
        .includes('C2'),
    ).toBe(false);
  });

  it('excludes arc walls and column-pinned endpoints from every set', () => {
    const floor = makeFloor({
      extraWalls: [
        {
          id: 'ARC',
          start: { x: 0, y: 0 },
          end: { x: -1000, y: 1000 },
          controlPoint: { x: -400, y: 300 },
          thickness: 100,
        },
        {
          id: 'PINNED',
          start: { x: 0, y: 0 },
          end: { x: -2000, y: 0 },
          startAttachment: { kind: 'column', columnId: 'col_1', featureType: 'corner', featureIndex: 0 },
          thickness: 100,
        },
      ],
    });
    const hood = deriveWallNeighborhood(floor.walls, 'M');
    const startIds = hood.start.cluster.map((m) => m.wall.id);
    expect(startIds).not.toContain('ARC');
    expect(startIds).not.toContain('PINNED');
  });
});

describe('propagateWallEdit — translation healing', () => {
  it('re-intersects perpendicular corner neighbors and trims the inbound stem', () => {
    const result = translateM(makeFloor(), 300);
    expect(result.ok).toBe(true);

    const nEdit = result.secondary.find((edit) => edit.id === 'N');
    expect(nEdit.end.x).toBeCloseTo(0, 5);
    expect(nEdit.end.y).toBeCloseTo(300, 5);

    const bEdit = result.secondary.find((edit) => edit.id === 'B');
    expect(bEdit.start.x).toBeCloseTo(4000, 5);
    expect(bEdit.start.y).toBeCloseTo(300, 5);

    const sEdit = result.secondary.find((edit) => edit.id === 'S');
    expect(sEdit.end.x).toBeCloseTo(2000, 5);
    expect(sEdit.end.y).toBeCloseTo(300, 5);

    expect(result.changedWallIds.sort()).toEqual(['B', 'M', 'N', 'S']);
  });

  it('re-intersection closes angled corners on both walls (M endpoint slides along its line)', () => {
    // Diagonal neighbor at 45°: line through (-1000,-1000)→(0,0). After M moves
    // to y=300 the corner closes at (300,300).
    const floor = makeFloor({
      extraWalls: [{ id: 'D', start: { x: -1000, y: -1000 }, end: { x: 0, y: 0 }, thickness: 100 }],
    });
    // Remove N so the start cluster is just the diagonal.
    floor.walls = floor.walls.filter((w) => w.id !== 'N');
    const result = translateM(floor, 300);
    expect(result.ok).toBe(true);

    const dEdit = result.secondary.find((edit) => edit.id === 'D');
    expect(dEdit.end.x).toBeCloseTo(300, 5);
    expect(dEdit.end.y).toBeCloseTo(300, 5);
    expect(result.primary.start.x).toBeCloseTo(300, 5);
    expect(result.primary.start.y).toBeCloseTo(300, 5);
  });

  it('rigid-follows collinear neighbors instead of re-intersecting (no NaN, no runaway)', () => {
    const floor = makeFloor({
      extraWalls: [{ id: 'COL', start: { x: -3000, y: 0 }, end: { x: 0, y: 0 }, thickness: 100 }],
    });
    floor.walls = floor.walls.filter((w) => w.id !== 'N');
    const result = translateM(floor, 300);
    expect(result.ok).toBe(true);

    const colEdit = result.secondary.find((edit) => edit.id === 'COL');
    expect(colEdit.end).toMatchObject({ x: 0, y: 300 });
    expect(Number.isFinite(colEdit.end.x)).toBe(true);
  });

  it('star junctions follow the moved endpoint as a single shared point', () => {
    const floor = makeFloor({
      extraWalls: [{ id: 'X', start: { x: 0, y: 0 }, end: { x: -2500, y: 1500 }, thickness: 100 }],
    });
    // start junction now has N + X + M = 3 endpoints → star → rigid follow.
    const result = translateM(floor, 300);
    expect(result.ok).toBe(true);
    expect(result.secondary.find((e) => e.id === 'N').end).toMatchObject({ x: 0, y: 300 });
    expect(result.secondary.find((e) => e.id === 'X').start).toMatchObject({ x: 0, y: 300 });
    // Star = rigid: M's endpoint is NOT corner-adjusted.
    expect(result.primary.start).toMatchObject({ x: 0, y: 300 });
  });
});

describe('propagateWallEdit — endpoint edits', () => {
  it('corner neighbors rigid-follow a dragged endpoint (the junction moved)', () => {
    const result = propagateWallEdit(makeFloor(), {
      id: 'M',
      start: { x: 200, y: 400 },
      end: { x: 4000, y: 0 },
    });
    expect(result.ok).toBe(true);
    expect(result.secondary.find((e) => e.id === 'N').end).toMatchObject({ x: 200, y: 400 });
    // The unmoved end's junction stays intact — no edit for B.
    expect(result.secondary.find((e) => e.id === 'B')).toBeUndefined();
  });

  it('keeps inbound stems on the rotated span when an endpoint drags', () => {
    const result = propagateWallEdit(makeFloor(), {
      id: 'M',
      start: { x: 0, y: 800 },
      end: { x: 4000, y: 0 },
    });
    expect(result.ok).toBe(true);
    const sEdit = result.secondary.find((e) => e.id === 'S');
    // S is vertical at x=2000; M's new line from (0,800) to (4000,0) passes y=400 there.
    expect(sEdit.end.x).toBeCloseTo(2000, 5);
    expect(sEdit.end.y).toBeCloseTo(400, 5);
  });
});

describe('propagateWallEdit — rejections', () => {
  it('rejects when a healed neighbor would collapse below MIN_WALL_LENGTH', () => {
    const floor = makeFloor({
      extraWalls: [{ id: 'SHORT', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 100 }],
    });
    floor.walls = floor.walls.filter((w) => w.id !== 'N');
    const result = translateM(floor, 300 - (MIN_WALL_LENGTH - 1));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wall-too-short');
    expect(result.wallId).toBe('SHORT');
  });

  it('rejects pathological over-extension beyond factor AND slack', () => {
    const floor = makeFloor({
      extraWalls: [{ id: 'TINY', start: { x: 0, y: -300 }, end: { x: 0, y: 0 }, thickness: 100 }],
    });
    floor.walls = floor.walls.filter((w) => w.id !== 'N');
    const dy = MAX_EXTENSION_SLACK + 200; // extension 700 > slack, newLen 1000 > 2×300
    const result = translateM(floor, dy);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('over-extension');
    expect(result.wallId).toBe('TINY');
  });

  it('allows small absolute extensions even past the factor (slack rule)', () => {
    const floor = makeFloor({
      extraWalls: [{ id: 'TINY', start: { x: 0, y: -150 }, end: { x: 0, y: 0 }, thickness: 100 }],
    });
    floor.walls = floor.walls.filter((w) => w.id !== 'N');
    const result = translateM(floor, 300); // newLen 450 > 2×150 but extension 300 ≤ 500
    expect(result.ok).toBe(true);
  });

  it('rejects when a hosted door would no longer fit a shrinking wall', () => {
    const floor = {
      walls: [{ id: 'M', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 }],
      doors: [{ id: 'door_1', wallId: 'M', offset: 2000, width: 900 }],
      windows: [],
    };
    const result = propagateWallEdit(floor, {
      id: 'M',
      start: { x: 0, y: 0 },
      end: { x: 800, y: 0 },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('opening-no-fit');
    expect(result.wallId).toBe('M');
  });

  it('rejects a stem translation that slides its T-junction off the host span', () => {
    const floor = {
      walls: [
        { id: 'STEM', start: { x: 2000, y: 0 }, end: { x: 2000, y: -3000 }, thickness: 100 },
        { id: 'HOST', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 },
      ],
      doors: [],
      windows: [],
    };
    const result = propagateWallEdit(floor, {
      id: 'STEM',
      start: { x: 9000, y: 0 },
      end: { x: 9000, y: -3000 },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('t-out-of-span');
  });

  it('keeps a stem translation on the host when it stays in span', () => {
    const floor = {
      walls: [
        { id: 'STEM', start: { x: 2000, y: 0 }, end: { x: 2000, y: -3000 }, thickness: 100 },
        { id: 'HOST', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 },
      ],
      doors: [],
      windows: [],
    };
    const result = propagateWallEdit(floor, {
      id: 'STEM',
      start: { x: 3000, y: 0 },
      end: { x: 3000, y: -3000 },
    });
    expect(result.ok).toBe(true);
    expect(result.primary.start).toMatchObject({ x: 3000, y: 0 });
  });
});

describe('propagateWallEdit — exclusions', () => {
  it('arc walls translate rigidly with no secondary edits', () => {
    const floor = makeFloor({
      extraWalls: [
        {
          id: 'ARC',
          start: { x: 0, y: 0 },
          end: { x: -1000, y: 1000 },
          controlPoint: { x: -400, y: 300 },
          thickness: 100,
        },
      ],
    });
    const result = propagateWallEdit(floor, {
      id: 'ARC',
      start: { x: 0, y: 500 },
      end: { x: -1000, y: 1500 },
      controlPoint: { x: -400, y: 800 },
    });
    expect(result.ok).toBe(true);
    expect(result.secondary).toEqual([]);
  });

  it('column-pinned neighbor endpoints stay anchored (no secondary edit)', () => {
    const floor = makeFloor({
      extraWalls: [
        {
          id: 'PINNED',
          start: { x: 0, y: 0 },
          end: { x: -2000, y: 0 },
          startAttachment: { kind: 'column', columnId: 'col_1', featureType: 'corner', featureIndex: 0 },
          thickness: 100,
        },
      ],
    });
    const result = translateM(floor, 300);
    expect(result.ok).toBe(true);
    expect(result.secondary.find((e) => e.id === 'PINNED')).toBeUndefined();
  });

  it('walls with no junctions move freely with empty secondary', () => {
    const floor = {
      walls: [{ id: 'LONE', start: { x: 0, y: 0 }, end: { x: 2000, y: 0 }, thickness: 100 }],
      doors: [],
      windows: [],
    };
    const result = propagateWallEdit(floor, {
      id: 'LONE',
      start: { x: 0, y: 500 },
      end: { x: 2000, y: 500 },
    });
    expect(result.ok).toBe(true);
    expect(result.secondary).toEqual([]);
  });
});

describe('validateWallEdit', () => {
  it('mirrors propagate results as valid/invalid with reasons', () => {
    expect(validateWallEdit(makeFloor(), { id: 'M', start: { x: 0, y: 300 }, end: { x: 4000, y: 300 } })).toEqual({
      valid: true,
    });

    const loneWithDoor = {
      walls: [{ id: 'M', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 }],
      doors: [{ id: 'd', wallId: 'M', offset: 400, width: 900 }],
      windows: [],
    };
    const shrink = validateWallEdit(loneWithDoor, {
      id: 'M',
      start: { x: 0, y: 0 },
      end: { x: 700, y: 0 },
    });
    expect(shrink.valid).toBe(false);
    expect(shrink.reason).toBe('opening-no-fit');
  });
});
