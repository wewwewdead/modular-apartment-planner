import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createWall } from './models';
import {
  WALL_FRAMING_MODES,
  WALL_HEIGHT_MODES,
  fitWallToStructure,
  normalizeWallFramingMode,
  resolveWallBaseBearing,
  resolveWallClearRun,
  resolveWallSlabBands,
  resolveWallStructureFit,
  resolveWallVerticalSpan,
  syncFloorWallHeights,
  syncProjectWallHeights,
  wallBaseOffset,
  wallOutboardOffset,
} from './wallFit';

// A 3400 column carrying a 450-deep beam leaves 2950 of clear height under it.
const COLUMN_HEIGHT = 3400;
const BEAM_DEPTH = 450;
const CLEAR_HEIGHT = COLUMN_HEIGHT - BEAM_DEPTH;
const EPSILON_MM = 1e-6;

function buildFloor({ beams = [], walls = [], slabs = [], elevation = 0, id = 'floor_1' } = {}) {
  const columns = [
    { ...createColumn(0, 0, 300, 300, { height: COLUMN_HEIGHT }), id: 'col_a' },
    { ...createColumn(6000, 0, 300, 300, { height: COLUMN_HEIGHT }), id: 'col_b' },
  ];
  return { id, elevation, floorToFloorHeight: COLUMN_HEIGHT, columns, beams, walls, slabs };
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

/* ── The wall's vertical extent ─────────────────────────────────────────── */

const SLAB_THICKNESS = 200;
// The wall runs (0,0) → (6000,0) and is 200 thick, so its body covers y -100..100.
const PLATE_UNDER_THE_WALL = [
  { x: -1000, y: -1000 },
  { x: 7000, y: -1000 },
  { x: 7000, y: 1000 },
  { x: -1000, y: 1000 },
];
const PLATE_ELSEWHERE = [
  { x: -1000, y: 20_000 },
  { x: 7000, y: 20_000 },
  { x: 7000, y: 24_000 },
  { x: -1000, y: 24_000 },
];

function plate(boundaryPoints, thickness = SLAB_THICKNESS, id = 'slab_1') {
  return { id, boundaryPoints, thickness, elevation: 0 };
}

function bypassWall(overrides = {}) {
  return wallUnderBeam({ framingMode: WALL_FRAMING_MODES.BYPASS, ...overrides });
}

describe('normalizeWallFramingMode', () => {
  it('keeps bypass and reads everything else as platform', () => {
    expect(normalizeWallFramingMode('bypass')).toBe(WALL_FRAMING_MODES.BYPASS);
    for (const junk of ['platform', 'balloon', '', null, undefined, 0, {}]) {
      expect(normalizeWallFramingMode(junk)).toBe(WALL_FRAMING_MODES.PLATFORM);
    }
  });

  it('is what a new wall is built with, so nothing unrecognized ever gets stored', () => {
    expect(wallUnderBeam({ framingMode: 'bypass' }).framingMode).toBe(WALL_FRAMING_MODES.BYPASS);
    expect(wallUnderBeam({ framingMode: 'balloon' }).framingMode).toBe(WALL_FRAMING_MODES.PLATFORM);
    expect(wallUnderBeam().framingMode).toBe(WALL_FRAMING_MODES.PLATFORM);
  });
});

// Every view used to work this out for itself. The resolver is only safe to
// swap in if it answers the old expression to the last millimetre.
describe('resolveWallVerticalSpan for a platform wall', () => {
  it('is the floor elevation plus the base offset, plus the height', () => {
    const floor = buildFloor({
      elevation: 3400,
      beams: [spanningBeam({ floorLevel: 3400 + COLUMN_HEIGHT }), plinthBeam(3400 + 450)],
    });
    const fitted = fitWallToStructure(wallUnderBeam(), floor);

    // The fit really did lift this wall, so the base offset is carrying weight.
    expect(fitted.baseOffset).toBe(450);

    const span = resolveWallVerticalSpan(fitted, floor);
    expect(span.base).toBe(3400 + wallBaseOffset(fitted));
    expect(span.top).toBe(3400 + wallBaseOffset(fitted) + fitted.height);
    expect(span).toMatchObject({ mode: WALL_FRAMING_MODES.PLATFORM, drop: 0, datum: span.base });
  });

  it('answers zero height for a wall that has none, the way the old expression did', () => {
    const wall = wallUnderBeam();
    delete wall.height;

    expect(resolveWallVerticalSpan(wall, buildFloor({ elevation: 3400 }))).toMatchObject({ base: 3400, top: 3400 });
  });

  it('reads an unknown framing mode as platform rather than inventing a span', () => {
    const floor = buildFloor({ elevation: 3400, slabs: [plate(PLATE_UNDER_THE_WALL)] });
    const wall = wallUnderBeam();
    wall.framingMode = 'balloon';

    expect(resolveWallVerticalSpan(wall, floor)).toMatchObject({
      mode: WALL_FRAMING_MODES.PLATFORM,
      base: 3400,
      top: 3400 + wall.height,
      drop: 0,
    });
  });
});

describe('resolveWallVerticalSpan for a bypass wall', () => {
  it('starts below its floor by the plate it crosses and finishes at the floor above', () => {
    const floor = buildFloor({ elevation: 3400, slabs: [plate(PLATE_UNDER_THE_WALL)] });

    expect(resolveWallVerticalSpan(bypassWall(), floor)).toEqual({
      mode: WALL_FRAMING_MODES.BYPASS,
      drop: SLAB_THICKNESS,
      base: 3400 - SLAB_THICKNESS,
      top: 3400 + COLUMN_HEIGHT,
      // Openings stay on the floor the wall passes, not on its underside.
      datum: 3400,
    });
  });

  it('falls past the deeper of the plate and the beam framing it', () => {
    const floor = buildFloor({
      elevation: 3400,
      slabs: [plate(PLATE_UNDER_THE_WALL)],
      beams: [spanningBeam({ id: 'beam_deck', floorLevel: 3400 })],
    });

    expect(resolveWallVerticalSpan(bypassWall(), floor).drop).toBe(BEAM_DEPTH);
  });

  // A beam drawn at the head of this storey's columns is the ceiling, not the
  // deck, and it must not deepen the drop at the wall's foot.
  it('ignores a beam that caps the storey instead of forming its floor', () => {
    const floor = buildFloor({
      elevation: 3400,
      slabs: [plate(PLATE_UNDER_THE_WALL)],
      beams: [spanningBeam({ floorLevel: 3400 + COLUMN_HEIGHT })],
    });

    expect(resolveWallVerticalSpan(bypassWall(), floor).drop).toBe(SLAB_THICKNESS);
  });

  it('measures the plate it actually stands on, not the deepest one on the floor', () => {
    const floor = buildFloor({
      elevation: 0,
      slabs: [plate(PLATE_UNDER_THE_WALL, 200, 'slab_here'), plate(PLATE_ELSEWHERE, 400, 'slab_far')],
    });

    expect(resolveWallVerticalSpan(bypassWall(), floor).drop).toBe(200);
  });

  it('lets a stored drop stand in for the derivation, the way a manual height does', () => {
    const floor = buildFloor({ elevation: 3400, slabs: [plate(PLATE_UNDER_THE_WALL)] });

    expect(resolveWallVerticalSpan(bypassWall({ bypassDrop: 600 }), floor)).toMatchObject({
      drop: 600,
      base: 3400 - 600,
    });

    // Nothing that is not a real depth: the structure still answers.
    for (const junk of [0, -100, Number.NaN, Infinity, 'deep', null, undefined]) {
      expect(resolveWallVerticalSpan(bypassWall({ bypassDrop: junk }), floor).drop).toBe(SLAB_THICKNESS);
    }
  });

  it('falls back to the deepest plate on the floor when it crosses none of them', () => {
    const floor = buildFloor({ elevation: 0, slabs: [plate(PLATE_ELSEWHERE, 400, 'slab_far')] });

    expect(resolveWallVerticalSpan(bypassWall(), floor).drop).toBe(400);
  });

  it('has nothing to fall past on a floor with no plate at all', () => {
    const floor = buildFloor({ elevation: 0 });

    expect(resolveWallVerticalSpan(bypassWall(), floor)).toMatchObject({ drop: 0, base: 0, top: COLUMN_HEIGHT });
  });

  // The point of the whole mode: no line across the facade at the floor.
  it('meets the storey above with an overlap exactly as deep as the structure between them', () => {
    const ground = buildFloor({ id: 'floor_g', elevation: 0, slabs: [plate(PLATE_UNDER_THE_WALL)] });
    const first = buildFloor({ id: 'floor_1', elevation: COLUMN_HEIGHT, slabs: [plate(PLATE_UNDER_THE_WALL)] });

    const below = resolveWallVerticalSpan(bypassWall(), ground);
    const above = resolveWallVerticalSpan(bypassWall({ id: 'wall_above' }), first);

    expect(below.top).toBe(first.elevation);
    expect(above.base).toBe(below.top - SLAB_THICKNESS);
    expect(below.top - above.base).toBe(SLAB_THICKNESS);
  });
});

describe('the beam fit leaves a bypass wall alone', () => {
  it('never rewrites its height or its base offset', () => {
    const floor = buildFloor({ beams: [spanningBeam(), plinthBeam(450)] });
    const platform = wallUnderBeam({ height: 2400 });
    const wall = bypassWall({ height: 2400 });

    // A platform wall in the same position is lifted onto the plinth and cut
    // to the soffit; the bypass wall is handed straight back.
    expect(fitWallToStructure(platform, floor)).not.toBe(platform);
    expect(fitWallToStructure(wall, floor)).toBe(wall);
    expect(wall.height).toBe(2400);
    expect(wall.baseOffset).toBe(0);
  });

  it('leaves the floor identity intact through the whole-floor sync', () => {
    const floor = buildFloor({ beams: [spanningBeam(), plinthBeam(450)], walls: [bypassWall({ height: 2400 })] });

    expect(syncFloorWallHeights(floor)).toBe(floor);
  });
});

/**
 * The plan half of "is this wall standing on anything". Sampled along the built
 * run, because the answer that matters is WHICH STRETCHES are hanging — the
 * whole-body overlap the bypass drop uses cannot tell half a wall from all of it.
 */
describe('resolveWallBaseBearing', () => {
  // The wall runs (0,0) → (6000,0); this plate is under all of it.
  const fullPlate = () => ({
    id: 'slab_full',
    thickness: 200,
    boundaryPoints: [
      { x: -1000, y: -2000 },
      { x: 7000, y: -2000 },
      { x: 7000, y: 2000 },
      { x: -1000, y: 2000 },
    ],
  });

  // Stops halfway along the wall.
  const halfPlate = () => ({
    ...fullPlate(),
    id: 'slab_half',
    boundaryPoints: [
      { x: -1000, y: -2000 },
      { x: 3000, y: -2000 },
      { x: 3000, y: 2000 },
      { x: -1000, y: 2000 },
    ],
  });

  it('finds a wall fully carried by the plate it stands on', () => {
    const bearing = resolveWallBaseBearing(wallUnderBeam(), buildFloor({ slabs: [fullPlate()] }));

    expect(bearing).toMatchObject({ bearingRatio: 1, unsupportedRatio: 0, unsupportedRunMm: 0 });
    expect(bearing.runMm).toBeCloseTo(6000, 6);
  });

  it('measures the stretch of a wall that runs off the end of its plate', () => {
    const bearing = resolveWallBaseBearing(wallUnderBeam(), buildFloor({ slabs: [halfPlate()] }));

    expect(bearing.bearingRatio).toBeCloseTo(0.5, 1);
    expect(bearing.unsupportedRunMm).toBeGreaterThan(2500);
    expect(bearing.unsupportedRunMm).toBeLessThan(3500);
  });

  it('counts a wall drawn along the plate edge as carried, not as hanging', () => {
    // Where the bay macro puts one: the axis IS the boundary, and half the body
    // is over the plate. An exact point-in-polygon test would answer by luck.
    const edgePlate = {
      ...fullPlate(),
      boundaryPoints: [
        { x: -1000, y: 0 },
        { x: 7000, y: 0 },
        { x: 7000, y: 4000 },
        { x: -1000, y: 4000 },
      ],
    };

    expect(resolveWallBaseBearing(wallUnderBeam(), buildFloor({ slabs: [edgePlate] })).bearingRatio).toBe(1);
  });

  it('accepts a beam underfoot as bearing where there is no plate', () => {
    const plinth = spanningBeam({ id: 'beam_plinth', floorLevel: 0 });

    expect(resolveWallBaseBearing(wallUnderBeam(), buildFloor({ beams: [plinth] })).bearingRatio).toBe(1);
  });

  it('reports a wall over open air as carried by nothing', () => {
    const bearing = resolveWallBaseBearing(wallUnderBeam(), buildFloor({ slabs: [] }));

    expect(bearing).toMatchObject({ bearingRatio: 0, unsupportedRatio: 1, bearingSourceCount: 0 });
    expect(bearing.unsupportedRunMm).toBeCloseTo(6000, 6);
  });

  it('follows the body to where it is BUILT', () => {
    // Drawn over the plate, built 3000 clear of it.
    const offset = wallUnderBeam({ outboardOffset: 3000 });

    expect(resolveWallBaseBearing(offset, buildFloor({ slabs: [fullPlate()] })).bearingRatio).toBe(0);
  });

  it('has no answer about a wall with no run', () => {
    const degenerate = { ...createWall({ x: 0, y: 0 }, { x: 0, y: 0 }, 200), id: 'wall_point' };

    expect(resolveWallBaseBearing(degenerate, buildFloor())).toBeNull();
  });
});

describe('resolveWallSlabBands', () => {
  it('answers the deck a bypass wall runs past, as a band in the wall’s own elevation', () => {
    const floor = buildFloor({ slabs: [plate(PLATE_UNDER_THE_WALL)] });
    const wall = bypassWall();
    const span = resolveWallVerticalSpan(wall, floor);

    // The plane starts one slab below the floor, so the deck is the bottom
    // SLAB_THICKNESS of it: [drop − T, drop], with the top on the storey line.
    expect(resolveWallSlabBands(wall, floor)).toEqual([
      expect.objectContaining({ slabId: 'slab_1', thickness: SLAB_THICKNESS, v0: 0, v1: SLAB_THICKNESS }),
    ]);
    expect(span.drop).toBe(SLAB_THICKNESS);
    expect(span.base + SLAB_THICKNESS).toBe(span.datum);
  });

  it('keeps the band under an overridden drop, where the deck actually is', () => {
    const floor = buildFloor({ slabs: [plate(PLATE_UNDER_THE_WALL)] });

    expect(resolveWallSlabBands(bypassWall({ bypassDrop: 400 }), floor)).toEqual([
      expect.objectContaining({ v0: 400 - SLAB_THICKNESS, v1: 400 }),
    ]);
  });

  // A platform wall stands ON its deck: its v = 0 IS the slab top, so there is
  // nothing crossing it to draw. Derived, not special-cased.
  it('finds nothing crossing a platform wall', () => {
    const floor = buildFloor({ slabs: [plate(PLATE_UNDER_THE_WALL)] });

    expect(resolveWallSlabBands(wallUnderBeam(), floor)).toEqual([]);
  });

  it('ignores a plate the wall never crosses in plan', () => {
    const floor = buildFloor({ slabs: [plate(PLATE_ELSEWHERE)] });

    expect(resolveWallSlabBands(bypassWall(), floor)).toEqual([]);
  });
});

describe('wallOutboardOffset', () => {
  it('reads a stored offset with its sign', () => {
    expect(wallOutboardOffset(wallUnderBeam({ outboardOffset: 200 }))).toBe(200);
    expect(wallOutboardOffset(wallUnderBeam({ outboardOffset: -200 }))).toBe(-200);
  });

  it('answers zero for a wall that was never offset', () => {
    const legacy = wallUnderBeam();
    delete legacy.outboardOffset;

    expect(wallOutboardOffset(legacy)).toBe(0);
    expect(wallOutboardOffset(wallUnderBeam({ outboardOffset: 0 }))).toBe(0);
    expect(wallOutboardOffset(null)).toBe(0);
    expect(wallOutboardOffset(undefined)).toBe(0);
  });

  it('refuses anything that is not a finite number', () => {
    for (const junk of [Number.NaN, Infinity, -Infinity, 'far', {}, null]) {
      expect(wallOutboardOffset(wallUnderBeam({ outboardOffset: junk }))).toBe(0);
    }
  });

  // Offsetting a curve is not translating it: the radii and the end tangents
  // move with it. Refused outright rather than applied as a translation that
  // would look plausible in plan and be wrong in every other view.
  it('forces an arc wall back onto its axis', () => {
    const arc = wallUnderBeam({ outboardOffset: 300, controlPoint: { x: 3000, y: 400 } });
    expect(wallOutboardOffset(arc)).toBe(0);
  });
});
