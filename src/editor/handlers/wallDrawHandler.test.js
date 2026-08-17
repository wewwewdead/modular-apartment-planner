import { describe, expect, it } from 'vitest';
import { createBeamPlaceHandler } from './beamPlaceHandler';
import { createWallDrawHandler } from './wallDrawHandler';
import { createColumn } from '@/domain/models';
import { DEFAULT_ZOOM } from '@/domain/defaults';
import { fitWallToStructure, resolveWallClearRun } from '@/domain/wallFit';
import { wallLength } from '@/geometry/wallGeometry';

// A ground-floor bay as it gets built: 300 square columns 3000 tall, gridded at
// 3500 centres, carrying a 450-deep beam. The wall under that beam is 2550 tall
// and its centreline is the 3500 the grid is dimensioned to.
const COLUMN_HEIGHT = 3000;
const BEAM_DEPTH = 450;
const BAY = 3500;
const COLUMN_SIZE = 300;

function groundFloor() {
  return {
    id: 'floor_ground',
    elevation: 0,
    floorToFloorHeight: COLUMN_HEIGHT,
    walls: [],
    beams: [],
    columns: [
      { ...createColumn(0, 0, COLUMN_SIZE, COLUMN_SIZE, { height: COLUMN_HEIGHT }), id: 'col_a' },
      { ...createColumn(BAY, 0, COLUMN_SIZE, COLUMN_SIZE, { height: COLUMN_HEIGHT }), id: 'col_b' },
    ],
  };
}

function trackToolState() {
  let toolState = {};
  return {
    read: () => toolState,
    editorDispatch: (action) => {
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
  };
}

// Places a beam the way the toolbar does out of the box: no placement mode
// chosen, both ends clicked on a column.
function placeBeam(floor) {
  const tool = trackToolState();
  const dispatched = [];
  const handler = createBeamPlaceHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: tool.editorDispatch,
    getFloor: () => floor,
    activeFloorId: floor.id,
    activePhaseId: null,
  });

  handler.onMouseDown({ x: 0, y: 0 }, { button: 0 }, tool.read());
  handler.onMouseDown({ x: BAY, y: 0 }, { button: 0 }, tool.read());

  return dispatched.find((action) => action.type === 'BEAM_ADD').beam;
}

function drawWall(floor, clicks, options = {}) {
  const tool = trackToolState();
  const dispatched = [];
  const handler = createWallDrawHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: tool.editorDispatch,
    getFloor: () => floor,
    activeFloorId: floor.id,
    viewport: { zoom: DEFAULT_ZOOM },
    snapEnabled: true,
    activePhaseId: null,
    ...options,
  });

  for (const click of clicks) {
    handler.onMouseDown(click, { button: 0, shiftKey: false }, tool.read());
  }

  return dispatched.find((action) => action.type === 'WALL_ADD')?.wall || null;
}

describe('drawing a wall across a column bay', () => {
  // Aiming at a column is a hand gesture, not a coordinate: these land inside
  // both columns but on nothing in particular.
  const sloppyClicks = [
    { x: 40, y: -30 },
    { x: BAY - 40, y: 25 },
  ];

  it('lands the endpoints on the column centres, so the wall measures the bay', () => {
    const wall = drawWall(groundFloor(), sloppyClicks);

    expect(wall.start).toEqual({ x: 0, y: 0 });
    expect(wall.end).toEqual({ x: BAY, y: 0 });
    expect(wallLength(wall)).toBeCloseTo(BAY, 6);
  });

  it('records both ends against their column, so they follow it', () => {
    const wall = drawWall(groundFloor(), sloppyClicks);

    expect(wall.startAttachment).toMatchObject({ columnId: 'col_a', featureType: 'centerline', offset: 0 });
    expect(wall.endAttachment).toMatchObject({ columnId: 'col_b', featureType: 'centerline', offset: 0 });
  });

  it('reports the built run between the column faces alongside the grid dimension', () => {
    const floor = groundFloor();
    const wall = drawWall(floor, sloppyClicks);

    const run = resolveWallClearRun(wall, floor);

    expect(run.centrelineLength).toBeCloseTo(BAY, 6);
    expect(run.length).toBeCloseTo(BAY - COLUMN_SIZE, 6);
    expect(run.trimmed).toBe(true);
  });

  it('builds the wall to the beam soffit: column height less beam depth', () => {
    const floor = groundFloor();
    const beam = placeBeam(floor);
    const wall = drawWall(floor, sloppyClicks);

    // The beam bears on the 3000 columns, not on some separate storey number.
    expect(beam.floorLevel).toBe(COLUMN_HEIGHT);
    // A freshly drawn wall carries the default until the structure fits it.
    expect(wall.height).toBe(3000);

    const fitted = fitWallToStructure(wall, { ...floor, beams: [beam], walls: [wall] });

    expect(fitted.height).toBeCloseTo(COLUMN_HEIGHT - BEAM_DEPTH, 6);
  });

  it('follows a retyped column height rather than the storey height', () => {
    const floor = groundFloor();
    floor.columns = floor.columns.map((column) => ({ ...column, height: 3400 }));

    const beam = placeBeam(floor);
    const wall = drawWall(floor, sloppyClicks);
    const fitted = fitWallToStructure(wall, { ...floor, beams: [beam], walls: [wall] });

    expect(beam.floorLevel).toBe(3400);
    expect(fitted.height).toBeCloseTo(3400 - BEAM_DEPTH, 6);
  });
});

/**
 * Tracing an upper floor over the ghost of the one below.
 *
 * The floor below is a REFERENCE, never a parent: it hands over bare
 * coordinates and nothing else. A wall on this floor attached to a column that
 * lives one storey down would resolve to nothing the moment the plan reloaded,
 * so the guarantee tested here is as much about what the wall does NOT carry.
 */
describe('drawing a wall over the floor below', () => {
  const BELOW_END = { x: 6000, y: 0 };

  function emptyUpperFloor() {
    return { id: 'floor_upper', elevation: 3000, walls: [], beams: [], columns: [] };
  }

  function floorBelow() {
    return {
      id: 'floor_ground',
      walls: [{ id: 'wall_below', start: { x: 0, y: 0 }, end: BELOW_END, thickness: 200 }],
      columns: [{ ...createColumn(0, 4000, COLUMN_SIZE, COLUMN_SIZE), id: 'col_below' }],
    };
  }

  // Aimed at the corner of the wall below, missed by 50mm — the ghost is 100mm
  // wide at the default zoom.
  const nearBelowCorner = { x: 6040, y: 30 };
  const clicks = [nearBelowCorner, { x: 6030, y: 3000 }];

  it('lands the endpoint on the wall corner below', () => {
    const wall = drawWall(emptyUpperFloor(), clicks, { floorBelow: floorBelow(), showFloorBelowUnderlay: true });

    expect(wall.start).toEqual(BELOW_END);
  });

  it('records NO attachment for a point taken from the floor below', () => {
    const wall = drawWall(emptyUpperFloor(), clicks, { floorBelow: floorBelow(), showFloorBelowUnderlay: true });

    // The whole point of the separate channel: no columnId can reach a wall on
    // another floor through it.
    expect(wall.startAttachment).toBeNull();
    expect(wall.endAttachment).toBeNull();
    expect(JSON.stringify(wall)).not.toContain('col_below');
  });

  it('snaps to a column centre below the same way, still without an attachment', () => {
    const wall = drawWall(
      emptyUpperFloor(),
      [
        { x: 60, y: 4040 },
        { x: 3000, y: 4000 },
      ],
      { floorBelow: floorBelow(), showFloorBelowUnderlay: true },
    );

    expect(wall.start).toEqual({ x: 0, y: 4000 });
    expect(wall.startAttachment).toBeNull();
  });

  it('ignores the floor below while the ghost is hidden', () => {
    const wall = drawWall(emptyUpperFloor(), clicks, { floorBelow: floorBelow(), showFloorBelowUnderlay: false });

    expect(wall.start).toEqual(nearBelowCorner);
  });

  it('lets this floor win: a column here outranks the ghost below', () => {
    const floor = emptyUpperFloor();
    floor.columns = [{ ...createColumn(6100, 0, COLUMN_SIZE, COLUMN_SIZE), id: 'col_upper' }];

    const wall = drawWall(floor, clicks, { floorBelow: floorBelow(), showFloorBelowUnderlay: true });

    expect(wall.start).toEqual({ x: 6100, y: 0 });
    expect(wall.startAttachment).toMatchObject({ columnId: 'col_upper' });
  });
});
