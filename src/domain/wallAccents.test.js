import { describe, expect, it } from 'vitest';
import { createFloor, createSlab, createWall, createWindow } from './models';
import { createWallAssembly } from './wallAssemblies';
import {
  ACCENT_PLACEMENTS,
  accentAtPoint,
  createAccentAtOpening,
  placeAccentAt,
  resolveWallAccents,
  splitRectByAccents,
  wallFaceAcceptsAccents,
} from './wallAccents';
import { WALL_ACCENT_LIMIT, defaultAccentFinish, normalizeWallAccents } from './wallAccentModel';
import { deriveWallDetailOpenings, resolveWallDetailFrame } from './wallDetailing';

const ORANGE = {
  kind: 'paint',
  colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
  sheen: 'matte',
};

function fixture({ accents = [], framingMode, height = 2700, exterior = {} } = {}) {
  const floor = { ...createFloor('First', 1, { elevation: 3000 }), id: 'floor_1' };
  const wall = {
    ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, {
      height,
      assembly: { preset: 'fiber_cement', exterior: { material: 'fiber_cement', accents, ...exterior } },
    }),
    id: 'wall_1',
    ...(framingMode ? { framingMode } : {}),
  };
  floor.walls = [wall];
  floor.windows = [{ ...createWindow('wall_1', 3000, 1200), id: 'win_1', height: 1200, sillHeight: 900 }];
  floor.slabs = [
    createSlab(
      floor.id,
      [
        { x: -500, y: -2000 },
        { x: 6500, y: -2000 },
        { x: 6500, y: 2000 },
        { x: -500, y: 2000 },
      ],
      250,
      3000,
    ),
  ];
  return { floor, wall };
}

const accent = (id, rect, extra = {}) => ({
  id,
  u: rect.u,
  v: rect.v,
  width: rect.w,
  height: rect.h,
  finish: ORANGE,
  ...extra,
});

describe('resolving accents on a face', () => {
  it('places a free accent from the finished floor, and clips it to the face', () => {
    const { wall, floor } = fixture({
      accents: [accent('a', { u: 500, v: 900, w: 600, h: 600 }), accent('edge', { u: 5800, v: 2500, w: 600, h: 600 })],
    });
    const [free, edge] = resolveWallAccents(wall, floor, 'exterior');
    expect(free).toMatchObject({ u0: 500, u1: 1100, v0: 900, v1: 1500, netArea: 360000, visible: true });
    // Clipped at the wall end and at the top of the frame.
    expect(edge).toMatchObject({ u0: 5800, u1: 6000, v0: 2500, v1: 2700 });
    expect(edge.requested).toEqual({ u0: 5800, u1: 6400, v0: 2500, v1: 3100 });
  });

  it('measures v from the floor datum on a bypass wall, not from the bottom of its frame', () => {
    const platform = fixture({ accents: [accent('a', { u: 500, v: 900, w: 600, h: 600 })] });
    const bypass = fixture({ accents: [accent('a', { u: 500, v: 900, w: 600, h: 600 })], framingMode: 'bypass' });
    const frame = resolveWallDetailFrame(bypass.wall, bypass.floor);
    expect(frame.datumV).toBeGreaterThan(0);
    const [onPlatform] = resolveWallAccents(platform.wall, platform.floor, 'exterior');
    const [onBypass] = resolveWallAccents(bypass.wall, bypass.floor, 'exterior');
    expect(onPlatform.v0).toBe(900);
    expect(onBypass.v0).toBe(frame.datumV + 900);
    // And a window's sill sits the same height above that floor on both.
    const [window] = deriveWallDetailOpenings(bypass.wall, bypass.floor);
    expect(onBypass.v0 - window.v0).toBe(0);
  });

  it('follows its opening, and falls back to its stored place when the opening is gone', () => {
    const { wall, floor } = fixture();
    const frame = resolveWallDetailFrame(wall, floor);
    const [window] = deriveWallDetailOpenings(wall, floor);
    const right = createAccentAtOpening({
      opening: window,
      placement: ACCENT_PLACEMENTS.RIGHT,
      size: 600,
      id: 'r',
      system: 'framed',
      material: 'fiber_cement',
      frame,
    });
    expect(right).toMatchObject({
      u: 3600,
      v: 900,
      width: 600,
      height: 1200,
      anchor: { openingId: 'win_1', du: 1200, dv: 0 },
    });
    const anchoredWall = {
      ...wall,
      assembly: createWallAssembly('fiber_cement', {
        ...wall.assembly,
        exterior: { ...wall.assembly.exterior, accents: [right] },
      }),
    };
    const [placed] = resolveWallAccents(anchoredWall, floor, 'exterior');
    expect(placed).toMatchObject({ u0: 3600, u1: 4200, v0: 900, v1: 2100, anchorMissing: false });

    // The window moves 300 mm along the wall: the accent goes with it.
    const moved = { ...floor, walls: [anchoredWall], windows: [{ ...floor.windows[0], offset: 3300 }] };
    expect(resolveWallAccents(anchoredWall, moved, 'exterior')[0]).toMatchObject({ u0: 3900, u1: 4500 });

    // The window is deleted: the accent stays where it was last stored.
    const gone = { ...floor, walls: [anchoredWall], windows: [] };
    expect(resolveWallAccents(anchoredWall, gone, 'exterior')[0]).toMatchObject({
      u0: 3600,
      v0: 900,
      anchorMissing: true,
    });
  });

  it('makes the four placements around an opening', () => {
    const opening = { id: 'w', u0: 2400, u1: 3600, v0: 900, v1: 2100 };
    const make = (placement) =>
      createAccentAtOpening({
        opening,
        placement,
        size: 500,
        system: 'framed',
        material: 'fiber_cement',
        frame: { datumV: 0 },
      });
    const rect = (entry) => [entry.u, entry.u + entry.width, entry.v, entry.v + entry.height];
    expect(rect(make('left'))).toEqual([1900, 2400, 900, 2100]);
    expect(rect(make('right'))).toEqual([3600, 4100, 900, 2100]);
    expect(rect(make('above'))).toEqual([2400, 3600, 2100, 2600]);
    expect(rect(make('below'))).toEqual([2400, 3600, 400, 900]);
  });

  it('rewrites an anchored accent’s offsets when it is moved, and keeps u/v current', () => {
    const opening = { id: 'w', u0: 2400, u1: 3600, v0: 900, v1: 2100 };
    const stored = {
      id: 'r',
      u: 3600,
      v: 900,
      width: 600,
      height: 1200,
      finish: ORANGE,
      anchor: { openingId: 'w', du: 1200, dv: 0 },
    };
    const moved = placeAccentAt(
      stored,
      { u0: 3700, u1: 4300, v0: 1000, v1: 2200 },
      { frame: { datumV: 250 }, openings: [opening] },
    );
    expect(moved).toMatchObject({ u: 3700, v: 750, anchor: { openingId: 'w', du: 1300, dv: 100 } });
  });

  it('nets out openings, and flags an accent with nothing left to show', () => {
    const { wall, floor } = fixture({
      accents: [
        accent('inside', { u: 2500, v: 1000, w: 300, h: 300 }),
        accent('off', { u: 9000, v: 100, w: 300, h: 300 }),
      ],
    });
    const [inside, off] = resolveWallAccents(wall, floor, 'exterior');
    expect(inside).toMatchObject({ netArea: 0, visible: false });
    expect(off).toMatchObject({ netArea: 0, visible: false });
  });

  it('refuses masonry, arcs and bare faces, and is memoised per wall and floor', () => {
    const { wall, floor } = fixture({ accents: [accent('a', { u: 100, v: 100, w: 100, h: 100 })] });
    expect(wallFaceAcceptsAccents(wall, 'exterior')).toBe(true);
    expect(wallFaceAcceptsAccents({ ...wall, controlPoint: { x: 3000, y: 800 } }, 'exterior')).toBe(false);
    expect(wallFaceAcceptsAccents({ ...wall, assembly: createWallAssembly('chb', {}, 150) }, 'exterior')).toBe(false);
    expect(resolveWallAccents(wall, floor, 'exterior')).toBe(resolveWallAccents(wall, floor, 'exterior'));
    expect(resolveWallAccents(wall, floor, 'interior')).toEqual([]);
  });
});

describe('splitRectByAccents', () => {
  const rect = { u0: 0, u1: 1000, v0: 0, v1: 600 };
  const total = (pieces) =>
    pieces.reduce((sum, piece) => sum + (piece.rect.u1 - piece.rect.u0) * (piece.rect.v1 - piece.rect.v0), 0);
  const overlaps = (pieces) => {
    for (let i = 0; i < pieces.length; i += 1) {
      for (let j = i + 1; j < pieces.length; j += 1) {
        const a = pieces[i].rect;
        const b = pieces[j].rect;
        if (Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > 1e-9 && Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > 1e-9)
          return true;
      }
    }
    return false;
  };
  const ownedArea = (pieces, id) =>
    pieces
      .filter((piece) => piece.accentId === id)
      .reduce((sum, piece) => sum + (piece.rect.u1 - piece.rect.u0) * (piece.rect.v1 - piece.rect.v0), 0);

  it('hands back a rectangle no accent touches as itself', () => {
    expect(splitRectByAccents(rect, [{ id: 'x', u0: 2000, u1: 2100, v0: 0, v1: 100 }])).toEqual([
      { rect, accentId: null },
    ]);
  });

  it.each([
    ['a single accent inside', [{ id: 'a', u0: 200, u1: 400, v0: 100, v1: 300 }], { a: 40000 }],
    [
      'nested — the later, inner one wins its own area',
      [
        { id: 'outer', u0: 100, u1: 900, v0: 100, v1: 500 },
        { id: 'inner', u0: 300, u1: 500, v0: 200, v1: 300 },
      ],
      { outer: 320000 - 20000, inner: 20000 },
    ],
    [
      'overlapping — the later one wins the overlap',
      [
        { id: 'first', u0: 0, u1: 600, v0: 0, v1: 400 },
        { id: 'second', u0: 400, u1: 1000, v0: 200, v1: 600 },
      ],
      { first: 240000 - 40000, second: 240000 },
    ],
    [
      'edge-touching neighbours and an accent past the edge',
      [
        { id: 'left', u0: 0, u1: 500, v0: 0, v1: 300 },
        { id: 'right', u0: 500, u1: 1000, v0: 0, v1: 300 },
        { id: 'past', u0: 900, u1: 1400, v0: 300, v1: 900 },
      ],
      { left: 150000, right: 150000, past: 30000 },
    ],
  ])('tiles exactly: %s', (_name, accents, expected) => {
    const pieces = splitRectByAccents(rect, accents);
    expect(total(pieces)).toBeCloseTo(600000, 6);
    expect(overlaps(pieces)).toBe(false);
    for (const piece of pieces) {
      expect(piece.rect.u0).toBeGreaterThanOrEqual(rect.u0);
      expect(piece.rect.u1).toBeLessThanOrEqual(rect.u1);
      expect(piece.rect.v0).toBeGreaterThanOrEqual(rect.v0);
      expect(piece.rect.v1).toBeLessThanOrEqual(rect.v1);
    }
    for (const [id, owned] of Object.entries(expected)) expect(ownedArea(pieces, id)).toBeCloseTo(owned, 6);
  });

  it('merges a plain stretch back into few pieces', () => {
    const pieces = splitRectByAccents(rect, [{ id: 'a', u0: 400, u1: 600, v0: 0, v1: 600 }]);
    expect(pieces).toHaveLength(3);
    expect(accentAtPoint([{ id: 'a', u0: 400, u1: 600, v0: 0, v1: 600 }], { u: 500, v: 10 })?.id).toBe('a');
  });
});

describe('stored accents', () => {
  it('normalises, rounds and limits a face’s accents, and drops one the face cannot carry', () => {
    const list = normalizeWallAccents(
      [
        { u: 10.4, v: -150.6, width: 3, height: 600, finish: ORANGE, anchor: { openingId: '', du: 1 } },
        { id: 'stain', u: 0, v: 0, width: 100, height: 100, finish: { ...ORANGE, kind: 'timber' } },
      ],
      'framed',
      'fiber_cement',
    );
    expect(list).toEqual([
      { id: 'accent-1', label: '', u: 10, v: -151, width: 10, height: 600, finish: ORANGE, anchor: null },
    ]);
    const many = Array.from({ length: 70 }, (_, index) => ({
      id: `a${index}`,
      u: 0,
      v: 0,
      width: 50,
      height: 50,
      finish: ORANGE,
    }));
    expect(normalizeWallAccents(many, 'framed', 'fiber_cement')).toHaveLength(WALL_ACCENT_LIMIT);
    expect(normalizeWallAccents([], 'framed', 'fiber_cement')).toBeNull();
    expect(normalizeWallAccents(many, 'masonry', 'none')).toBeNull();
    expect(normalizeWallAccents(many, 'framed', 'none')).toBeNull();
  });

  it('starts a new accent in Signal Orange paint, or Teak where paint is not offered', () => {
    expect(defaultAccentFinish('framed', 'plywood').colour.name).toBe('Signal Orange');
    expect(defaultAccentFinish('framed', 'siding')).toMatchObject({ kind: 'paint' });
  });
});
