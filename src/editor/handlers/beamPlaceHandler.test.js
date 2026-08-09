import { describe, expect, it } from 'vitest';
import { createBeamPlaceHandler } from './beamPlaceHandler';

function createHarness(beamPlacementMode, columnHeight = null) {
  const floor = {
    id: 'floor_1',
    elevation: 3000,
    floorToFloorHeight: 3000,
    columns: [
      { id: 'column_a', x: 0, y: 0, width: 300, depth: 300, rotation: 0, height: columnHeight },
      { id: 'column_b', x: 4000, y: 0, width: 300, depth: 300, rotation: 0, height: columnHeight },
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
      message: 'Top / roof beam created at 6000 mm. Walls running under it build to 2550 mm.',
    });
  });

  // The beam bears on the columns, so a retyped column height moves it — the
  // storey's nominal floor-to-floor no longer gets to disagree with the steel.
  it('sits a top beam on the columns it spans rather than on the storey height', () => {
    const { dispatched } = createHarness('roof_ring', 3400);

    expect(dispatched[0].beam).toMatchObject({ floorLevel: 6400, placementRole: 'roof_ring' });
  });

  it('defaults to a top beam when no placement mode has been chosen', () => {
    const { dispatched } = createHarness(undefined, 3000);

    expect(dispatched[0].beam).toMatchObject({ floorLevel: 6000, placementRole: 'roof_ring' });
  });
});
