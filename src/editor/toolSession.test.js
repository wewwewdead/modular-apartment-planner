import { describe, expect, it } from 'vitest';
import { createFloor, createProject } from '@/domain/models';
import floorplanReducer, { initializeFloorplanState } from '@/features/floorplan/store/floorplanReducer';
import { TOOLS } from './tools';
import {
  ARMED_SETTING_KEYS,
  FLOW_MARKER_KEYS,
  enterTool,
  isToolFlowInProgress,
  keepArmedSettings,
} from './toolSession';
import { createBeamPlaceHandler } from './handlers/beamPlaceHandler';
import { createCantileverHandler } from './handlers/cantileverHandler';
import { createCeilingBeamPickHandler } from './handlers/ceilingBeamPickHandler';
import { createCeilingPlaceHandler } from './handlers/ceilingPlaceHandler';
import { createDimensionPlaceHandler } from './handlers/dimensionPlaceHandler';
import { createElevationSelectHandler } from './handlers/elevationSelectHandler';
import { createRailingPlaceHandler } from './handlers/railingPlaceHandler';
import { createRoofOpeningPlaceHandler } from './handlers/roofOpeningPlaceHandler';
import { createRoofParapetPlaceHandler } from './handlers/roofParapetPlaceHandler';
import { createRoofSelectHandler } from './handlers/roofSelectHandler';
import { createSectionPlaceHandler } from './handlers/sectionPlaceHandler';
import { createSelectHandler } from './handlers/selectHandler';
import { createSlabPlaceHandler } from './handlers/slabPlaceHandler';
import { createStairPlaceHandler } from './handlers/stairPlaceHandler';
import { createTrussDrawHandler } from './handlers/trussDrawHandler';
import { createTrussSelectHandler } from './handlers/trussSelectHandler';
import { createWallDrawHandler } from './handlers/wallDrawHandler';

function twoFloorState() {
  let state = initializeFloorplanState(createProject('Session'));
  const upper = createFloor('Upper', 1);
  state = floorplanReducer(state, { type: 'FLOOR_ADD', floor: upper });
  return { state, groundId: state.project.floors[0].id, upperId: upper.id };
}

function armed(state, tool, payload) {
  const withTool = floorplanReducer(state, { type: 'SET_TOOL', tool });
  return floorplanReducer(withTool, { type: 'UPDATE_TOOL_STATE', payload });
}

describe('keepArmedSettings', () => {
  it('keeps what a tool is armed with and nothing else', () => {
    expect(
      keepArmedSettings({
        fixtureType: 'bed',
        previewX: 100,
        previewY: 200,
        deviceType: 'switch',
        beamPlacementMode: 'floor',
        startColumnId: 'col_1',
        radius: 900,
        hoveredCorner: { wall1: {} },
        previewGeometry: {},
      }),
    ).toEqual({ fixtureType: 'bed', deviceType: 'switch', beamPlacementMode: 'floor', radius: 900 });
  });

  it('leaves floor-bound and flow state behind', () => {
    expect(
      keepArmedSettings({
        trussTypeId: 'fink',
        trussMaterial: 'timber',
        targetTrussSystemId: 'truss_1',
        cantileverMode: 'bay',
        cantileverPick: { slabId: 'slab_1', edgeIndex: 0 },
        ceilingTargetFloorId: 'floor_1',
      }),
    ).toEqual({});
    for (const key of ['trussTypeId', 'trussMaterial', 'targetTrussSystemId', 'cantileverMode', 'cantileverPick']) {
      expect(ARMED_SETTING_KEYS).not.toContain(key);
    }
  });

  it('answers an empty bag for an empty or missing tool state', () => {
    expect(keepArmedSettings({})).toEqual({});
    expect(keepArmedSettings(undefined)).toEqual({});
  });
});

describe('a reset that keeps the tool keeps what it is armed with', () => {
  it('another floor: the furniture tool still places the bed it was armed with', () => {
    const { state, upperId } = twoFloorState();
    const bed = armed(state, TOOLS.FIXTURE, { fixtureType: 'bed', previewX: 1000, previewY: 1000 });

    const switched = floorplanReducer(bed, { type: 'SET_ACTIVE_FLOOR', floorId: upperId });

    expect(switched.editor.activeTool).toBe(TOOLS.FIXTURE);
    expect(switched.editor.toolState).toEqual({ fixtureType: 'bed' });
  });

  it('another view and another workspace mode keep the setting too', () => {
    const { state } = twoFloorState();
    const outlet = armed(state, TOOLS.ELECTRICAL, { deviceType: 'switch', previewWallId: 'wall_1' });

    const elevation = floorplanReducer(outlet, { type: 'SET_VIEW_MODE', viewMode: 'elevation_north' });
    expect(elevation.editor.toolState).toEqual({ deviceType: 'switch' });

    const sheet = floorplanReducer(outlet, { type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
    expect(sheet.editor.toolState).toEqual({ deviceType: 'switch' });
  });

  it('the door keeps its swing and the furniture tool its turn', () => {
    const { state, upperId } = twoFloorState();
    const door = armed(state, TOOLS.DOOR, { openDirection: 'right', previewWallId: 'wall_1', previewOffset: 900 });
    const bed = armed(state, TOOLS.FIXTURE, { fixtureType: 'bed', previewRotation: 90, previewX: 10 });

    expect(floorplanReducer(door, { type: 'SET_VIEW_MODE', viewMode: 'elevation_north' }).editor.toolState).toEqual({
      openDirection: 'right',
    });
    expect(floorplanReducer(bed, { type: 'SET_ACTIVE_FLOOR', floorId: upperId }).editor.toolState).toEqual({
      fixtureType: 'bed',
      previewRotation: 90,
    });
  });

  it('a flow under way is still dropped by those resets', () => {
    const { state, upperId } = twoFloorState();
    const beam = armed(state, TOOLS.BEAM, { beamPlacementMode: 'floor', startColumnId: 'col_1' });

    const switched = floorplanReducer(beam, { type: 'SET_ACTIVE_FLOOR', floorId: upperId });

    expect(switched.editor.toolState).toEqual({ beamPlacementMode: 'floor' });
  });

  it('choosing a tool or a model target still starts from nothing', () => {
    const { state } = twoFloorState();
    const bed = armed(state, TOOLS.FIXTURE, { fixtureType: 'bed' });

    expect(floorplanReducer(bed, { type: 'SET_TOOL', tool: TOOLS.FIXTURE }).editor.toolState).toEqual({});
    expect(floorplanReducer(bed, { type: 'SET_MODEL_TARGET', modelTarget: 'roof' }).editor.toolState).toEqual({});
  });
});

/*
 * The ritual every site wrote by hand before `enterTool`, frozen as it was:
 * each step only when the site had something for it, always in this order.
 */
function handWrittenEntry(dispatch, { tool, selection, toolState, statusMessage }) {
  dispatch({ type: 'SET_TOOL', tool });
  if (selection) dispatch({ type: 'SELECT_OBJECT', id: selection.id, objectType: selection.objectType });
  if (toolState) dispatch({ type: 'UPDATE_TOOL_STATE', payload: toolState });
  if (statusMessage != null) dispatch({ type: 'SET_STATUS_MESSAGE', message: statusMessage });
}

function recordActions(enter, options) {
  const actions = [];
  enter((action) => actions.push(action), options);
  return actions;
}

describe('enterTool', () => {
  const SELECTIONS = [undefined, { id: 'slab_1', objectType: 'slab' }];
  const TOOL_STATES = [undefined, { cantileverMode: 'bay' }];
  const MESSAGES = [undefined, 'Click an edge of the slab.'];

  it('sends what the hand-written ritual sent, for every combination of its parts', () => {
    for (const selection of SELECTIONS) {
      for (const toolState of TOOL_STATES) {
        for (const statusMessage of MESSAGES) {
          const options = { tool: TOOLS.CANTILEVER, selection, toolState, statusMessage };
          expect(recordActions(enterTool, options)).toEqual(recordActions(handWrittenEntry, options));
        }
      }
    }
  });

  it('lands the store on the tool, the selection, the settings and the message together', () => {
    let state = initializeFloorplanState(createProject('Enter'));
    enterTool(
      (action) => {
        state = floorplanReducer(state, action);
      },
      {
        tool: TOOLS.CANTILEVER,
        selection: { id: 'slab_1', objectType: 'slab' },
        toolState: { cantileverMode: 'bay' },
        statusMessage: 'Click an edge of the slab.',
      },
    );

    expect(state.editor).toMatchObject({
      activeTool: TOOLS.CANTILEVER,
      selectedId: 'slab_1',
      selectedType: 'slab',
      toolState: { cantileverMode: 'bay' },
      statusMessage: 'Click an edge of the slab.',
    });
  });
});

describe('isToolFlowInProgress', () => {
  it('is false for an idle or merely armed tool', () => {
    expect(isToolFlowInProgress(undefined)).toBe(false);
    expect(isToolFlowInProgress({})).toBe(false);
    expect(isToolFlowInProgress({ fixtureType: 'bed', previewX: 10, previewY: 20, radius: 900 })).toBe(false);
  });

  it('does not count an empty point list or a cleared marker', () => {
    expect(isToolFlowInProgress({ slabPoints: [], ceilingPoints: [], roofOpeningPoints: [] })).toBe(false);
    expect(isToolFlowInProgress({ ceilingPickBeamIds: [] })).toBe(false);
    expect(isToolFlowInProgress({ dragging: false, pendingDrag: false, start: null, cantileverPick: null })).toBe(
      false,
    );
  });

  it('counts a first point, a first pick and a drag', () => {
    expect(isToolFlowInProgress({ slabPoints: [{ x: 0, y: 0 }] })).toBe(true);
    expect(isToolFlowInProgress({ ceilingPickBeamIds: ['beam_1'] })).toBe(true);
    expect(isToolFlowInProgress({ pendingDrag: true })).toBe(true);
  });
});

/*
 * Focus mode withholds an Escape while any of these markers is set, trusting
 * that the very Escape it withheld clears the marker. If one did not, the
 * second press would be withheld as well and the keyboard could never leave
 * focus. So every marker is put in place, its owning tool's Escape is sent
 * through the real store, and the flow must read as finished afterwards.
 */
const POINT = { x: 1000, y: 1000 };

const ESCAPE_CASES = [
  { marker: 'dragging', owner: 'select', tool: TOOLS.SELECT, create: createSelectHandler, select: ['wall_1', 'wall'] },
  {
    marker: 'dragging',
    owner: 'roof select',
    tool: TOOLS.SELECT,
    create: createRoofSelectHandler,
    select: ['parapet_1', 'parapet'],
  },
  { marker: 'dragging', owner: 'truss select', tool: TOOLS.SELECT, create: createTrussSelectHandler },
  {
    marker: 'dragging',
    owner: 'elevation window',
    tool: TOOLS.SELECT,
    create: createElevationSelectHandler,
    select: ['window_1', 'window'],
  },
  {
    marker: 'pendingDrag',
    owner: 'elevation window',
    tool: TOOLS.SELECT,
    create: createElevationSelectHandler,
    select: ['window_1', 'window'],
  },
  {
    marker: 'pendingDrag',
    owner: 'select',
    tool: TOOLS.SELECT,
    create: createSelectHandler,
    select: ['column_1', 'column'],
  },
  { marker: 'pendingDrag', owner: 'truss select', tool: TOOLS.SELECT, create: createTrussSelectHandler },
  { marker: 'start', owner: 'wall', tool: TOOLS.WALL, create: createWallDrawHandler, value: POINT },
  { marker: 'chainStart', owner: 'wall', tool: TOOLS.WALL, create: createWallDrawHandler, value: POINT },
  { marker: 'startColumnId', owner: 'beam', tool: TOOLS.BEAM, create: createBeamPlaceHandler, value: 'col_1' },
  {
    marker: 'dimensionStartPoint',
    owner: 'dimension',
    tool: TOOLS.DIMENSION,
    create: createDimensionPlaceHandler,
    value: POINT,
  },
  {
    marker: 'sectionStartPoint',
    owner: 'section',
    tool: TOOLS.SECTION,
    create: createSectionPlaceHandler,
    value: POINT,
  },
  { marker: 'stairStartPoint', owner: 'stair', tool: TOOLS.STAIR, create: createStairPlaceHandler, value: POINT },
  {
    marker: 'railingStartPoint',
    owner: 'railing',
    tool: TOOLS.RAILING,
    create: createRailingPlaceHandler,
    value: POINT,
  },
  { marker: 'slabPoints', owner: 'slab', tool: TOOLS.SLAB, create: createSlabPlaceHandler, value: [POINT] },
  { marker: 'ceilingPoints', owner: 'ceiling', tool: TOOLS.CEILING, create: createCeilingPlaceHandler, value: [POINT] },
  {
    marker: 'ceilingPickBeamIds',
    owner: 'ceiling beam pick',
    tool: TOOLS.CEILING_BEAM_PICK,
    create: createCeilingBeamPickHandler,
    value: ['beam_1'],
  },
  {
    marker: 'cantileverPick',
    owner: 'cantilever',
    tool: TOOLS.CANTILEVER,
    create: createCantileverHandler,
    value: { kind: 'cantilever', slabId: 'slab_1', edgeIndex: 0, support: null, distanceMm: 600 },
  },
  {
    marker: 'startTrussBeamId',
    owner: 'truss draw',
    tool: TOOLS.TRUSS_DRAW,
    create: createTrussDrawHandler,
    value: 'beam_1',
  },
  {
    marker: 'roofParapetStart',
    owner: 'roof parapet',
    tool: TOOLS.ROOF_PARAPET,
    create: createRoofParapetPlaceHandler,
    value: POINT,
  },
  {
    marker: 'roofOpeningPoints',
    owner: 'roof opening',
    tool: TOOLS.ROOF_OPENING,
    create: createRoofOpeningPlaceHandler,
    value: [POINT],
  },
];

function escapeThroughStore({ marker, tool, create, select, value = true }) {
  let state = armed(initializeFloorplanState(createProject('Escape')), tool, {});
  if (select) state = floorplanReducer(state, { type: 'SELECT_OBJECT', id: select[0], objectType: select[1] });
  state = floorplanReducer(state, { type: 'UPDATE_TOOL_STATE', payload: { [marker]: value } });
  const before = state.editor.toolState;

  const send = (action) => {
    state = floorplanReducer(state, action);
  };
  const handler = create({
    dispatch: send,
    editorDispatch: send,
    project: state.project,
    getProject: () => state.project,
    getFloor: (floorId) => state.project.floors.find((floor) => floor.id === floorId) || null,
    activeFloorId: state.editor.activeFloorId,
    viewport: { zoom: 0.1 },
    snapEnabled: true,
    activePhaseId: null,
    selectedId: state.editor.selectedId,
    selectedType: state.editor.selectedType,
    roofSystem: null,
    trussSystems: [],
  });

  handler.onKeyDown(
    { key: 'Escape', preventDefault() {} },
    state.editor.toolState,
    state.editor.selectedId,
    state.editor.selectedType,
  );
  return { before, after: state.editor.toolState };
}

describe('every flow marker is cleared by the Escape focus mode withholds', () => {
  it.each(ESCAPE_CASES)('$marker, by the $owner tool', (entry) => {
    const { before, after } = escapeThroughStore(entry);

    expect(isToolFlowInProgress(before)).toBe(true);
    expect(isToolFlowInProgress(after)).toBe(false);
  });

  it('has an Escape case for every marker it counts', () => {
    expect(new Set(ESCAPE_CASES.map((entry) => entry.marker))).toEqual(new Set(FLOW_MARKER_KEYS));
  });
});
