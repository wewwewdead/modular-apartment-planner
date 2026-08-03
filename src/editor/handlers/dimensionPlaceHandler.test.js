import { describe, expect, it } from 'vitest';
import { createDimensionPlaceHandler } from './dimensionPlaceHandler';

function createHarness(activePhaseId) {
  let toolState = {};
  const dispatched = [];
  const handler = createDimensionPlaceHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    activeFloorId: 'floor_1',
    snapEnabled: false,
    activePhaseId,
  });

  handler.onMouseDown({ x: 0, y: 0 }, { button: 0 }, toolState);
  handler.onMouseDown({ x: 4000, y: 0 }, { button: 0 }, toolState);

  return dispatched;
}

describe('dimension placement phase assignment', () => {
  it('stamps new dimension annotations with the active phase', () => {
    const dispatched = createHarness('phase_1');

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe('ANNOTATION_ADD');
    expect(dispatched[0].annotation.phaseId).toBe('phase_1');
  });

  it('leaves the phase unassigned when no phase is active', () => {
    const dispatched = createHarness(null);

    expect(dispatched[0].annotation.phaseId).toBeNull();
  });
});
