import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createWall } from './models';
import {
  WALL_HEIGHT_MODES,
  fitWallToStructure,
  resolveWallClearRun,
  resolveWallStructureFit,
  syncFloorWallHeights,
  syncProjectWallHeights,
} from './wallFit';

// A 3400 column carrying a 450-deep beam leaves 2950 of clear height under it.
const COLUMN_HEIGHT = 3400;
const BEAM_DEPTH = 450;
const CLEAR_HEIGHT = COLUMN_HEIGHT - BEAM_DEPTH;
const EPSILON_MM = 1e-6;

function buildFloor({ beams = [], walls = [], elevation = 0 } = {}) {
  const columns = [
    { ...createColumn(0, 0, 300, 300, { height: COLUMN_HEIGHT }), id: 'col_a' },
    { ...createColumn(6000, 0, 300, 300, { height: COLUMN_HEIGHT }), id: 'col_b' },
  ];
  return { id: 'floor_1', elevation, floorToFloorHeight: COLUMN_HEIGHT, columns, beams, walls };
}

function spanningBeam(overrides = {}) {
  return {
    ...createBeam(
      { kind: 'column', id: 'col_a' },
      { kind: 'column', id: 'col_b' },
      250,
      BEAM_DEPTH,
      overrides.floorLevel ?? COLUMN_HEIGHT,
    ),
    id: overrides.id || 'beam_top',
    ...overrides,
  };
}

function wallUnderBeam(overrides = {}) {
  return {
    ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200, overrides),
    id: overrides.id || 'wall_1',
  };
}

describe('resolveWallStructureFit', () => {
  it('takes the clear height between the floor and the soffit of the beam above', () => {
    const floor = buildFloor({ beams: [spanningBeam()] });

    const fit = resolveWallStructureFit(wallUnderBeam(), floor);

    expect(fit).toMatchObject({ beamId: 'beam_top', base: 0, top: CLEAR_HEIGHT, height: CLEAR_HEIGHT });
  });

  it('measures from the floor the wall stands on, not from datum', () => {
    const floor = buildFloor({
      elevation: 3400,
      beams: [spanningBeam({ floorLevel: 3400 + COLUMN_HEIGHT })],
    });

    expect(resolveWallStructureFit(wallUnderBeam(), floor).height).toBe(CLEAR_HEIGHT);
  });

  it('picks the lowest soffit when several beams cross the wall', () => {
    const floor = buildFloor({
      beams: [
        spanningBeam(),
        // Deeper beam crossing the same run: the wall has to clear this one.
        { ...spanningBeam({ id: 'beam_deep' }), depth: 700 },
      ],
    });

    expect(resolveWallStructureFit(wallUnderBeam(), floor)).toMatchObject({
      beamId: 'beam_deep',
      height: COLUMN_HEIGHT - 700,
    });
  });

  it('ignores beams that miss the wall in plan', () => {
    const floor = buildFloor({ beams: [spanningBeam()] });
    const elsewhere = wallUnderBeam({ id: 'wall_far' });
    elsewhere.start = { x: 0, y: 4000 };
    elsewhere.end = { x: 6000, y: 4000 };

    expect(resolveWallStructureFit(elsewhere, floor)).toBeNull();
  });

  it('ignores beams at or below the floor the wall stands on', () => {
    const floor = buildFloor({ beams: [spanningBeam({ id: 'beam_tie', floorLevel: 0 })] });
    const wall = wallUnderBeam();

    // The tie beam is reported as crossing the wall — that is what tells the
    // panel a mis-levelled beam is present rather than none at all — but it
    // neither caps the wall nor lifts it.
    expect(resolveWallStructureFit(wall, floor)).toMatchObject({
      crossingCount: 1,
      beamId: null,
      supportBeamId: null,
      top: null,
      height: null,
      baseOffset: 0,
    });
    expect(fitWallToStructure(wall, floor)).toBe(wall);
  });

  it('returns nothing when the floor has no beams', () => {
    expect(resolveWallStructureFit(wallUnderBeam(), buildFloor())).toBeNull();
    expect(resolveWallStructureFit(null, buildFloor({ beams: [spanningBeam()] }))).toBeNull();
  });
});

// A plinth beam whose TOP is above the slab: the wall has to start on it.
function plinthBeam(floorLevel, id = 'beam_plinth') {
  return spanningBeam({ id, floorLevel });
}

describe('the beam a wall stands on', () => {
  it('starts the wall on top of the plinth beam instead of burying it', () => {
    const floor = buildFloor({ beams: [spanningBeam(), plinthBeam(450)] });

    expect(resolveWallStructureFit(wallUnderBeam(), floor)).toMatchObject({
      supportBeamId: 'beam_plinth',
      beamId: 'beam_top',
      base: 450,
      baseOffset: 450,
      top: CLEAR_HEIGHT,
      height: CLEAR_HEIGHT - 450,
    });
  });

  it('records the lift on the wall so every view draws it off the slab', () => {
    const floor = buildFloor({ beams: [spanningBeam(), plinthBeam(450)] });

    const fitted = fitWallToStructure(wallUnderBeam(), floor);

    expect(fitted.baseOffset).toBe(450);
    expect(fitted.height).toBe(CLEAR_HEIGHT - 450);
  });

  // The beam under a ground slab tops out at the floor, so there is nothing to
  // climb: this is the common case and must not lift anything.
  it('leaves the wall on the slab when the beam below tops out at the floor', () => {
    const floor = buildFloor({ beams: [spanningBeam(), spanningBeam({ id: 'beam_tie', floorLevel: 0 })] });

    expect(resolveWallStructureFit(wallUnderBeam(), floor)).toMatchObject({
      supportBeamId: null,
      base: 0,
      baseOffset: 0,
      height: CLEAR_HEIGHT,
    });
  });

  it('climbs a stack of beams underfoot', () => {
    const floor = buildFloor({
      beams: [spanningBeam(), plinthBeam(450, 'beam_lower'), plinthBeam(900, 'beam_upper')],
    });

    expect(resolveWallStructureFit(wallUnderBeam(), floor)).toMatchObject({
      supportBeamId: 'beam_upper',
      base: 900,
      height: CLEAR_HEIGHT - 900,
    });
  });

  it('stands the wall on its support even with nothing overhead, keeping the height', () => {
    const floor = buildFloor({ beams: [plinthBeam(450)] });
    const wall = wallUnderBeam();

    const fitted = fitWallToStructure(wall, floor);

    expect(fitted.baseOffset).toBe(450);
    expect(fitted.height).toBe(wall.height);
  });

  it('ignores a beam underfoot that misses the wall in plan', () => {
    const floor = buildFloor({ beams: [spanningBeam(), plinthBeam(450)] });
    const elsewhere = wallUnderBeam({ id: 'wall_far' });
    elsewhere.start = { x: 0, y: 4000 };
    elsewhere.end = { x: 6000, y: 4000 };

    expect(resolveWallStructureFit(elsewhere, floor)).toBeNull();
  });
});

// The guarantee the whole mechanism exists to provide: a fitted wall touches
// the beams around it and occupies none of the space they do.
describe('a fitted wall never intrudes into a beam', () => {
  const layouts = [
    { name: 'top beam only', levels: [COLUMN_HEIGHT] },
    { name: 'plinth and top beam', levels: [450, COLUMN_HEIGHT] },
    { name: 'beam under the slab and a top beam', levels: [0, COLUMN_HEIGHT] },
    { name: 'stacked plinths under a top beam', levels: [450, 900, COLUMN_HEIGHT] },
    { name: 'two beams overhead', levels: [450, 2400, COLUMN_HEIGHT] },
  ];

  for (const layout of layouts) {
    it(`holds for ${layout.name}`, () => {
      const beams = layout.levels.map((floorLevel, index) => spanningBeam({ id: `beam_${index}`, floorLevel }));
      const floor = buildFloor({ beams });

      const fitted = fitWallToStructure(wallUnderBeam(), floor);
      const base = fitted.baseOffset || 0;
      const top = base + fitted.height;

      expect(top).toBeGreaterThan(base);
      for (const beam of beams) {
        const beamSoffit = beam.floorLevel - beam.depth;
        const beamTop = beam.floorLevel;
        // Overlap of [base,top] with [soffit,top] must be zero or negative:
        // touching is allowed, sharing any thickness is not.
        const overlap = Math.min(top, beamTop) - Math.max(base, beamSoffit);
        expect(overlap).toBeLessThanOrEqual(EPSILON_MM);
      }
    });
  }
});

describe('fitting walls to the structure', () => {
  it('drops a default-height wall onto the beam soffit', () => {
    const floor = buildFloor({ beams: [spanningBeam()] });
    const wall = wallUnderBeam();

    expect(wall.height).toBe(3000);
    expect(fitWallToStructure(wall, floor).height).toBe(CLEAR_HEIGHT);
  });

  it('leaves a wall the user pinned to a fixed height alone', () => {
    const floor = buildFloor({ beams: [spanningBeam()] });
    const wall = wallUnderBeam({ height: 2400, heightMode: WALL_HEIGHT_MODES.MANUAL });

    expect(fitWallToStructure(wall, floor)).toBe(wall);
  });

  it('treats a wall with no stored mode as automatic, so old plans get fitted', () => {
    const floor = buildFloor({ beams: [spanningBeam()] });
    const legacy = wallUnderBeam();
    delete legacy.heightMode;

    expect(fitWallToStructure(legacy, floor).height).toBe(CLEAR_HEIGHT);
  });

  it('keeps object identity when nothing needs to move', () => {
    const floor = buildFloor({ beams: [spanningBeam()], walls: [wallUnderBeam({ height: CLEAR_HEIGHT })] });

    expect(syncFloorWallHeights(floor)).toBe(floor);
    expect(syncFloorWallHeights(buildFloor({ walls: [wallUnderBeam()] }))).not.toBeNull();

    const project = { floors: [floor] };
    expect(syncProjectWallHeights(project)).toBe(project);
  });

  it('refits every wall on the floor through the project sync', () => {
    const project = {
      floors: [buildFloor({ beams: [spanningBeam()], walls: [wallUnderBeam(), wallUnderBeam({ id: 'wall_2' })] })],
    };

    const synced = syncProjectWallHeights(project);

    expect(synced).not.toBe(project);
    expect(synced.floors[0].walls.map((wall) => wall.height)).toEqual([CLEAR_HEIGHT, CLEAR_HEIGHT]);
  });
});

describe('resolveWallClearRun', () => {
  it('reports the built run between column faces alongside the centreline', () => {
    const floor = buildFloor({ beams: [spanningBeam()] });
    const wall = wallUnderBeam({
      startAttachment: { kind: 'column', columnId: 'col_a', featureType: 'centerline', featureIndex: 0, offset: 0 },
      endAttachment: { kind: 'column', columnId: 'col_b', featureType: 'centerline', featureIndex: 0, offset: 0 },
    });

    const run = resolveWallClearRun(wall, floor);

    // Centres are 6000 apart; each 300 column eats half its width.
    expect(run.centrelineLength).toBeCloseTo(6000, 6);
    expect(run.length).toBeCloseTo(6000 - 300, 6);
    expect(run.trimmed).toBe(true);
  });

  it('reports no trim for a wall that lands on nothing', () => {
    const run = resolveWallClearRun(wallUnderBeam(), buildFloor());

    expect(run.length).toBeCloseTo(6000, 6);
    expect(run.trimmed).toBe(false);
  });
});
