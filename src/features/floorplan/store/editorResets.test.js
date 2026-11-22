import { describe, expect, it } from 'vitest';
import { createProject } from '@/domain/models';
import { TOOLS } from '@/editor/tools';
import { isToolFlowInProgress } from '@/editor/toolSession';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

/**
 * The editor's own state across the actions that replace what is selected or
 * what project is open: whatever the outgoing selection, flow or project
 * owned has to go with it.
 */

function reduce(state, ...actions) {
  return actions.reduce(floorplanReducer, state);
}

function freshState() {
  return initializeFloorplanState(createProject('Resets'));
}

// A plate with one of its overhang runs picked: the finest selection there is.
function withOverhangRun(state) {
  return reduce(state, { type: 'SELECT_OVERHANG_EDGE', slabId: 'slab_1', edgeIndex: 2 });
}

describe('starting a paste preview', () => {
  it('drops the whole selection, overhang run included', () => {
    const state = reduce(withOverhangRun(freshState()), { type: 'START_PASTE_PREVIEW', point: { x: 0, y: 0 } });

    expect(state.editor).toMatchObject({
      selectedId: null,
      selectedType: null,
      selectedOverhangEdge: null,
      regionSelection: null,
      pastePreview: { active: true, point: { x: 0, y: 0 } },
    });
  });

  it('ends a tool flow under way and keeps what the tool is armed with', () => {
    const drawing = reduce(
      freshState(),
      { type: 'SET_TOOL', tool: TOOLS.WALL },
      { type: 'UPDATE_TOOL_STATE', payload: { start: { x: 1000, y: 1000 }, chainStart: { x: 1000, y: 1000 } } },
    );
    expect(isToolFlowInProgress(drawing.editor.toolState)).toBe(true);

    const pasting = reduce(drawing, { type: 'START_PASTE_PREVIEW', point: null });

    expect(pasting.editor.activeTool).toBe(TOOLS.WALL);
    expect(isToolFlowInProgress(pasting.editor.toolState)).toBe(false);

    const armed = reduce(
      freshState(),
      { type: 'SET_TOOL', tool: TOOLS.FIXTURE },
      { type: 'UPDATE_TOOL_STATE', payload: { fixtureType: 'bed', previewX: 10, previewY: 20 } },
      { type: 'START_PASTE_PREVIEW', point: null },
    );
    expect(armed.editor.toolState).toEqual({ fixtureType: 'bed' });
  });
});

describe.each([
  ['wall', { type: 'OPEN_WALL_DETAIL_EDITOR', floorId: 'floor_1', wallId: 'wall_1' }, ['wall_1', 'wall']],
  ['ceiling', { type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: 'ceiling_1' }, ['ceiling_1', 'ceiling']],
])('opening the %s detail editor', (name, open, [id, type]) => {
  it('selects what it opened and nothing besides', () => {
    const before = reduce(withOverhangRun(freshState()), { type: 'START_PASTE_PREVIEW', point: null });

    const state = reduce(before, open);

    expect(state.editor).toMatchObject({
      selectedId: id,
      selectedType: type,
      selectedOverhangEdge: null,
      regionSelection: null,
      pastePreview: { active: false, point: null },
      statusMessage: null,
    });
  });
});

describe.each(['PROJECT_LOAD', 'PROJECT_NEW'])('%s leaves the outgoing project behind', (type) => {
  function busyState() {
    let state = freshState();
    // View preferences, which stay.
    state = reduce(
      state,
      { type: 'SET_VIEWPORT', viewport: { panX: 12, panY: 34, zoom: 0.5 } },
      { type: 'TOGGLE_GRID' },
      { type: 'TOGGLE_SNAP' },
      { type: 'TOGGLE_FOCUS_PANEL', panel: 'canvas' },
    );
    // What the outgoing project's ids are bound up in, which goes.
    state = reduce(
      state,
      { type: 'SET_TOOL', tool: TOOLS.WALL },
      { type: 'UPDATE_TOOL_STATE', payload: { start: { x: 0, y: 0 } } },
      { type: 'SELECT_OVERHANG_EDGE', slabId: 'slab_1', edgeIndex: 0 },
      { type: 'START_PASTE_PREVIEW', point: null },
      { type: 'OPEN_WALL_DETAIL_EDITOR', floorId: 'floor_1', wallId: 'wall_1' },
      { type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: 'ceiling_1' },
    );
    return {
      ...state,
      editor: {
        ...state.editor,
        activeSectionCutId: 'section_1',
        hiddenWallBoards: { wall_1: ['interior'] },
        hiddenCeilingBoards: { ceiling_1: true },
      },
    };
  }

  it('drops the tool, the selection, the paste, the open editors and the section cut', () => {
    const state = reduce(busyState(), { type, project: createProject('Next') });

    expect(state.editor).toMatchObject({
      activeTool: 'select',
      toolState: {},
      selectedId: null,
      selectedType: null,
      selectedOverhangEdge: null,
      regionSelection: null,
      pastePreview: { active: false, point: null },
      wallDetailEditor: null,
      ceilingDetailEditor: null,
      activeSectionCutId: null,
      hiddenWallBoards: {},
      hiddenCeilingBoards: {},
    });
  });

  it('keeps every view preference', () => {
    const before = busyState();
    const state = reduce(before, { type, project: createProject('Next') });

    for (const key of [
      'viewport',
      'modelViewport',
      'sheetViewport',
      'showGrid',
      'snapEnabled',
      'planStyle',
      'showFloorBelowUnderlay',
      'viewMode',
      'workspaceMode',
      'modelTarget',
      'focusedPanel',
      'sunStudy',
      'daylight',
      'solarAccess',
    ]) {
      expect(state.editor[key], key).toEqual(before.editor[key]);
    }
  });
});
