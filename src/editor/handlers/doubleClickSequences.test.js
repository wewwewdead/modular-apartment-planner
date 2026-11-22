import { describe, expect, it } from 'vitest';
import { createFloor, createProject } from '@/domain/models';
import { createRoofSystem } from '@/domain/roofModels';
import floorplanReducer, { initializeFloorplanState } from '@/features/floorplan/store/floorplanReducer';
import { createCeilingPlaceHandler } from './ceilingPlaceHandler';
import { createColumnPlaceHandler } from './columnPlaceHandler';
import { createFixturePlaceHandler } from './fixturePlaceHandler';
import { createLandingPlaceHandler } from './landingPlaceHandler';
import { createRoofDrainPlaceHandler } from './roofDrainPlaceHandler';
import { createRoofOpeningPlaceHandler } from './roofOpeningPlaceHandler';
import { createRoofParapetPlaceHandler } from './roofParapetPlaceHandler';
import { createSlabPlaceHandler } from './slabPlaceHandler';

/**
 * A real double-click reaches a tool as press, press, then the double-click
 * itself — the second press lands exactly where the first did. Each tool here
 * has to read that sequence as one gesture: an outline finishes on the corner
 * that was double-clicked rather than on two copies of it, and a placement
 * tool does not stack a second object on the first.
 */

const LEFT = { button: 0 };

function edgesOf(points) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
}

function createOutlineHarness(createHandler, context = {}) {
  let toolState = {};
  const dispatched = [];
  const handler = createHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    viewport: { zoom: 0.1 },
    activePhaseId: null,
    ...context,
  });

  return {
    dispatched,
    getToolState: () => toolState,
    press: (point) => handler.onMouseDown(point, LEFT, toolState),
    doubleClick(point) {
      handler.onMouseDown(point, LEFT, toolState);
      handler.onMouseDown(point, LEFT, toolState);
      handler.onDoubleClick(point, LEFT, toolState);
    },
  };
}

const A = { x: 1000, y: 1000 };
const B = { x: 4000, y: 1000 };
const C = { x: 4000, y: 3000 };
const D = { x: 1000, y: 3000 };

function slabHarness() {
  const floor = createFloor('Ground', 0);
  return createOutlineHarness(createSlabPlaceHandler, { getFloor: () => floor, activeFloorId: floor.id });
}

function ceilingHarness() {
  const floor = createFloor('Ground', 0, { elevation: 0, floorToFloorHeight: 2800 });
  const project = { floors: [floor], trussSystems: [], ceilings: [] };
  return createOutlineHarness(createCeilingPlaceHandler, {
    getProject: () => project,
    getFloor: () => floor,
    activeFloorId: floor.id,
  });
}

function roofOpeningHarness() {
  const roofSystem = createRoofSystem('Flat Roof', {
    roofType: 'flat',
    boundaryPolygon: [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 6000 },
      { x: 0, y: 6000 },
    ],
  });
  return createOutlineHarness(createRoofOpeningPlaceHandler, { roofSystem });
}

const OUTLINE_TOOLS = [
  { name: 'slab', harness: slabHarness, pointsKey: 'slabPoints', outline: (action) => action.slab.boundaryPoints },
  {
    name: 'ceiling',
    harness: ceilingHarness,
    pointsKey: 'ceilingPoints',
    outline: (action) => action.ceiling.boundaryPolygon,
  },
  {
    name: 'roof opening',
    harness: roofOpeningHarness,
    pointsKey: 'roofOpeningPoints',
    outline: (action) => action.roofOpening.boundaryPoints,
  },
];

describe('an outline finished by double-clicking its last corner', () => {
  it.each(OUTLINE_TOOLS)('$name: commits that corner once, with no zero-length edge', ({ harness, outline }) => {
    const tool = harness();

    [A, B, C].forEach(tool.press);
    tool.doubleClick(D);

    expect(tool.dispatched).toHaveLength(1);
    const points = outline(tool.dispatched[0]);
    expect(points).toEqual([A, B, C, D]);
    expect(Math.min(...edgesOf(points))).toBeGreaterThan(0);
  });

  it('a slab with only two distinct corners is not committed', () => {
    const tool = slabHarness();

    tool.press(A);
    tool.doubleClick(B);

    expect(tool.dispatched).toHaveLength(0);
  });
});

describe('an outline double-clicked before it can close', () => {
  it.each(OUTLINE_TOOLS)('$name: keeps that corner once and goes on from it', ({ harness, outline }) => {
    const tool = harness();

    tool.press(A);
    tool.doubleClick(B);
    [C, D, A].forEach(tool.press);

    expect(tool.dispatched).toHaveLength(1);
    const points = outline(tool.dispatched[0]);
    expect(points).toEqual([A, B, C, D]);
    expect(Math.min(...edgesOf(points))).toBeGreaterThan(0);
  });

  it.each(OUTLINE_TOOLS)('$name: a double-click to start puts down one corner', ({ harness, pointsKey }) => {
    const tool = harness();

    tool.doubleClick(A);

    expect(tool.dispatched).toHaveLength(0);
    expect(tool.getToolState()[pointsKey]).toEqual([A]);
  });
});

describe('an outline closed by double-clicking its first corner', () => {
  it.each(OUTLINE_TOOLS)('$name: commits it once and starts nothing new', ({ harness, pointsKey }) => {
    const tool = harness();

    [A, B, C].forEach(tool.press);
    tool.doubleClick(A);

    expect(tool.dispatched).toHaveLength(1);
    expect(tool.getToolState()[pointsKey]).toEqual([]);
  });
});

function placementHarness(createHandler) {
  let state = initializeFloorplanState(createProject('Double click'));
  const send = (action) => {
    state = floorplanReducer(state, action);
  };
  const handler = createHandler({
    dispatch: send,
    editorDispatch: send,
    getFloor: (floorId) => state.project.floors.find((floor) => floor.id === floorId) || null,
    activeFloorId: state.editor.activeFloorId,
    snapEnabled: true,
    activePhaseId: null,
  });

  return {
    floor: () => state.project.floors.find((floor) => floor.id === state.editor.activeFloorId),
    setToolState: (payload) => send({ type: 'UPDATE_TOOL_STATE', payload }),
    press: (point) => handler.onMouseDown(point, LEFT, state.editor.toolState),
    doubleClick(point) {
      handler.onMouseDown(point, LEFT, state.editor.toolState);
      handler.onMouseDown(point, LEFT, state.editor.toolState);
      handler.onDoubleClick?.(point, LEFT, state.editor.toolState);
    },
  };
}

describe('a placement tool double-clicked in one spot', () => {
  it('fixture: places one, then another only somewhere else or turned', () => {
    const tool = placementHarness(createFixturePlaceHandler);
    tool.setToolState({ fixtureType: 'bed' });

    tool.doubleClick(A);
    expect(tool.floor().fixtures).toHaveLength(1);

    tool.press(B);
    expect(tool.floor().fixtures).toHaveLength(2);

    // Same spot, but turned, or a different piece: not the same object.
    tool.setToolState({ previewRotation: 90 });
    tool.press(A);
    tool.setToolState({ previewRotation: 0, fixtureType: 'sofa' });
    tool.press(A);
    expect(tool.floor().fixtures).toHaveLength(4);
  });

  it('column: places one', () => {
    const tool = placementHarness(createColumnPlaceHandler);

    tool.doubleClick(A);
    expect(tool.floor().columns).toHaveLength(1);

    tool.press(B);
    expect(tool.floor().columns).toHaveLength(2);
  });

  it('landing: places one', () => {
    const tool = placementHarness(createLandingPlaceHandler);

    tool.doubleClick(A);
    expect(tool.floor().landings).toHaveLength(1);

    tool.press(B);
    expect(tool.floor().landings).toHaveLength(2);
  });
});

// The roof tools read the roof they were built with, and the canvas rebuilds
// them whenever the roof changes, so each event gets one built from the roof
// as the store has it now.
function roofPlacementHarness(createHandler) {
  const roofSystem = createRoofSystem('Flat Roof', {
    roofType: 'flat',
    boundaryPolygon: [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 6000 },
      { x: 0, y: 6000 },
    ],
  });
  let state = initializeFloorplanState({ ...createProject('Roof double click'), roofSystems: [roofSystem] });
  state = floorplanReducer(state, { type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
  const send = (action) => {
    state = floorplanReducer(state, action);
  };
  const handler = () =>
    createHandler({
      dispatch: send,
      editorDispatch: send,
      roofSystem: state.project.roofSystems[0],
      viewport: { zoom: 0.1 },
    });

  return {
    roof: () => state.project.roofSystems[0],
    toolState: () => state.editor.toolState,
    move: (point) => handler().onMouseMove?.(point, {}, state.editor.toolState),
    press: (point) => handler().onMouseDown(point, LEFT, state.editor.toolState),
    doubleClick(point) {
      handler().onMouseDown(point, LEFT, state.editor.toolState);
      handler().onMouseDown(point, LEFT, state.editor.toolState);
      handler().onDoubleClick?.(point, LEFT, state.editor.toolState);
    },
  };
}

describe('a roof tool double-clicked in one spot', () => {
  const ON_EDGE = { x: 4000, y: 20 };

  it('parapet: a double-click on an edge makes one parapet and starts no free one', () => {
    const tool = roofPlacementHarness(createRoofParapetPlaceHandler);
    tool.move(ON_EDGE);
    expect(tool.toolState().roofParapetSnapEdge).toBeTruthy();

    tool.doubleClick(ON_EDGE);

    expect(tool.roof().parapets).toHaveLength(1);
    expect(tool.toolState().roofParapetStart).toBeFalsy();
  });

  it('parapet: a second press after a move over the same edge does not stack another', () => {
    const tool = roofPlacementHarness(createRoofParapetPlaceHandler);
    tool.move(ON_EDGE);
    tool.press(ON_EDGE);
    tool.move(ON_EDGE);
    tool.press(ON_EDGE);

    expect(tool.roof().parapets).toHaveLength(1);
  });

  it('parapet: another edge still takes one', () => {
    const tool = roofPlacementHarness(createRoofParapetPlaceHandler);
    tool.move(ON_EDGE);
    tool.press(ON_EDGE);
    tool.move({ x: 20, y: 3000 });
    tool.press({ x: 20, y: 3000 });

    expect(tool.roof().parapets).toHaveLength(2);
  });

  it('drain: places one, then another only somewhere else', () => {
    const tool = roofPlacementHarness(createRoofDrainPlaceHandler);

    tool.doubleClick(A);
    expect(tool.roof().drains).toHaveLength(1);

    tool.press(B);
    expect(tool.roof().drains).toHaveLength(2);
  });
});
