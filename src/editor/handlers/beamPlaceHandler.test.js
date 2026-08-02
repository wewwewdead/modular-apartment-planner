import { describe, expect, it } from 'vitest';
import { createBeamPlaceHandler } from './beamPlaceHandler';

function createHarness(beamPlacementMode = 'floor') {
  const floor = {
    id: 'floor_1',
    elevation: 3000,
    floorToFloorHeight: 3000,
    columns: [
      { id: 'column_a', x: 0, y: 0, width: 300, depth: 300, rotation: 0 },
      { id: 'column_b', x: 4000, y: 0, width: 300, depth: 300, rotation: 0 },
    ],
  };
  let toolState = { beamPlacementMode };
  const dispatched = [];
  const editorActions = [];
  const handler = createBeamPlaceHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      editorActions.push(action);
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    getFloor: () => floor,
    activeFloorId: floor.id,
    activePhaseId: 'phase_1',
  });

  handler.onMouseDown({ x: 0, y: 0 }, { button: 0 }, toolState);
  handler.onMouseDown({ x: 4000, y: 0 }, { button: 0 }, toolState);

  return { dispatched, editorActions };
}

describe('beam placement elevation', () => {
  it('creates a normal beam at the active floor elevation', () => {
    const { dispatched } = createHarness('floor');

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      type: 'BEAM_ADD',
      beam: { floorLevel: 3000, placementRole: 'floor', phaseId: 'phase_1' },
    });
  });

  it('creates a roof ring beam at the top of the active storey', () => {
    const { dispatched, editorActions } = createHarness('roof_ring');

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      type: 'BEAM_ADD',
      beam: { floorLevel: 6000, placementRole: 'roof_ring', phaseId: 'phase_1' },
    });
    expect(editorActions).toContainEqual({
      type: 'SET_STATUS_MESSAGE',
      message: 'Top / roof beam created at 6000 mm.',
    });
  });
});
