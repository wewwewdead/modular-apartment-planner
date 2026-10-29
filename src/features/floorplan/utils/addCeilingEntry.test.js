import { describe, expect, it } from 'vitest';
import { createFloor, createSlab } from '@/domain/models';
import { addCantileverCeilings, enterAddCeiling, enterPickCeilingBeamsUnderSlab } from './addCeilingEntry';

function rectangle(x0, y0, x1, y1) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function createStack() {
  const ground = Object.assign(createFloor('Ground Floor', 0, { elevation: 0 }), { id: 'floor_ground' });
  const upper = Object.assign(createFloor('First Floor', 1, { elevation: 3200 }), { id: 'floor_upper' });
  ground.slabs = [{ ...createSlab(ground.id, rectangle(0, 0, 6000, 4000), 200, 0), id: 'slab_ground' }];
  upper.slabs = [{ ...createSlab(upper.id, rectangle(0, 0, 7500, 4000), 200, 3200), id: 'slab_upper' }];
  return { project: { floors: [ground, upper] }, ground, upper };
}

function record() {
  const actions = [];
  return { actions, dispatch: (action) => actions.push(action) };
}

describe('enterAddCeiling', () => {
  it('anchors the trace on the storey below when a plate on this floor is selected', () => {
    const { project, ground, upper } = createStack();
    const editor = record();

    const target = enterAddCeiling({
      project,
      activeFloorId: upper.id,
      selectedId: 'slab_upper',
      selectedType: 'slab',
      editorDispatch: editor.dispatch,
    });

    expect(target?.id).toBe(ground.id);
    // SET_TOOL clears the selection and the tool state together, so the plate
    // and then the target floor have to follow it, in that order.
    expect(editor.actions).toEqual([
      { type: 'SET_TOOL', tool: 'ceiling' },
      { type: 'SELECT_OBJECT', id: 'slab_upper', objectType: 'slab' },
      { type: 'UPDATE_TOOL_STATE', payload: { ceilingTargetFloorId: 'floor_ground' } },
      {
        type: 'SET_STATUS_MESSAGE',
        message: 'Trace the ceiling area under this slab — click points, close on the first point.',
      },
    ]);
  });

  it('arms a plain trace when nothing is selected', () => {
    const { project, upper } = createStack();
    const editor = record();

    expect(
      enterAddCeiling({
        project,
        activeFloorId: upper.id,
        selectedId: null,
        selectedType: null,
        editorDispatch: editor.dispatch,
      }),
    ).toBeNull();
    expect(editor.actions.map((action) => action.type)).toEqual(['SET_TOOL', 'SET_STATUS_MESSAGE']);
    expect(editor.actions[0]).toEqual({ type: 'SET_TOOL', tool: 'ceiling' });
  });

  it('arms a plain trace for a selection that is not a plate', () => {
    const { project, upper } = createStack();
    const editor = record();

    enterAddCeiling({
      project,
      activeFloorId: upper.id,
      selectedId: 'wall_1',
      selectedType: 'wall',
      editorDispatch: editor.dispatch,
    });

    expect(editor.actions.map((action) => action.type)).toEqual(['SET_TOOL', 'SET_STATUS_MESSAGE']);
  });

  it('arms a plain trace on the lowest floor — there is no storey under it to file one on', () => {
    const { project, ground } = createStack();
    const editor = record();

    expect(
      enterAddCeiling({
        project,
        activeFloorId: ground.id,
        selectedId: 'slab_ground',
        selectedType: 'slab',
        editorDispatch: editor.dispatch,
      }),
    ).toBeNull();
    expect(editor.actions.map((action) => action.type)).toEqual(['SET_TOOL', 'SET_STATUS_MESSAGE']);
  });

  it('ignores a plate selected on some other storey', () => {
    const { project, upper } = createStack();
    const editor = record();

    enterAddCeiling({
      project,
      activeFloorId: upper.id,
      selectedId: 'slab_ground',
      selectedType: 'slab',
      editorDispatch: editor.dispatch,
    });

    expect(editor.actions.map((action) => action.type)).toEqual(['SET_TOOL', 'SET_STATUS_MESSAGE']);
  });
});

describe('enterPickCeilingBeamsUnderSlab', () => {
  it('arms the pick on the storey below and carries the plate to cut against', () => {
    const { project, ground, upper } = createStack();
    const editor = record();

    const target = enterPickCeilingBeamsUnderSlab({
      slab: upper.slabs[0],
      targetFloor: ground,
      editorDispatch: editor.dispatch,
    });

    expect(target).toBe(ground);
    expect(project.floors).toHaveLength(2);
    // SET_TOOL clears the selection and the tool state together, so the plate
    // and then the anchor have to follow it, in that order.
    expect(editor.actions).toEqual([
      { type: 'SET_TOOL', tool: 'ceiling_beam_pick' },
      { type: 'SELECT_OBJECT', id: 'slab_upper', objectType: 'slab' },
      {
        type: 'UPDATE_TOOL_STATE',
        payload: { ceilingTargetFloorId: 'floor_ground', ceilingClipSlabId: 'slab_upper' },
      },
      {
        type: 'SET_STATUS_MESSAGE',
        message:
          'Click the beams on Ground Floor, the storey below this one, then press Enter — the ceiling covers the plate inside them.',
      },
    ]);
  });

  it('does nothing without both a plate and a storey to file the ceiling on', () => {
    const { upper } = createStack();
    const editor = record();

    expect(
      enterPickCeilingBeamsUnderSlab({ slab: upper.slabs[0], targetFloor: null, editorDispatch: editor.dispatch }),
    ).toBeNull();
    expect(
      enterPickCeilingBeamsUnderSlab({ slab: null, targetFloor: upper, editorDispatch: editor.dispatch }),
    ).toBeNull();
    expect(editor.actions).toEqual([]);
  });
});

describe('addCantileverCeilings', () => {
  const floorBelow = { id: 'floor_ground', name: 'Ground Floor' };
  const beamCeiling = {
    id: 'ceiling_1',
    baseElevation: 3200,
    attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] },
  };
  const manualCeiling = { id: 'ceiling_2', baseElevation: 3200, attachment: { mode: 'manual', beamIds: [] } };

  it('commits every region and opens the largest, then says what it did', () => {
    const store = record();
    const editor = record();

    const opened = addCantileverCeilings({
      plan: { floorBelow, ceilings: [beamCeiling, manualCeiling] },
      dispatch: store.dispatch,
      editorDispatch: editor.dispatch,
    });

    expect(opened).toBe(beamCeiling);
    expect(store.actions).toEqual([
      { type: 'CEILING_ADD', ceiling: beamCeiling },
      { type: 'CEILING_ADD', ceiling: manualCeiling },
    ]);
    // Opening the editor clears the status line, so the report goes after it.
    expect(editor.actions).toEqual([
      { type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: 'ceiling_1' },
      {
        type: 'SET_STATUS_MESSAGE',
        message: '2 cantilever ceilings added to Ground Floor — the largest hangs from 4 beams at 3200 mm.',
      },
    ]);
  });

  it('names the fix when the overhang found nothing to hang from', () => {
    const store = record();
    const editor = record();

    addCantileverCeilings({
      plan: { floorBelow, ceilings: [manualCeiling] },
      dispatch: store.dispatch,
      editorDispatch: editor.dispatch,
    });

    expect(editor.actions.at(-1).message).toBe(
      'Cantilever ceiling added to Ground Floor — sits on a manual datum; place top beams on the columns to attach it.',
    );
  });

  it('does nothing at all with an empty plan', () => {
    const store = record();
    const editor = record();

    expect(
      addCantileverCeilings({
        plan: { floorBelow: null, ceilings: [] },
        dispatch: store.dispatch,
        editorDispatch: editor.dispatch,
      }),
    ).toBeNull();
    expect(store.actions).toEqual([]);
    expect(editor.actions).toEqual([]);
  });
});
