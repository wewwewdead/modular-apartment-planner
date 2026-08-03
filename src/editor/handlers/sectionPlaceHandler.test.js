import { describe, expect, it } from 'vitest';
import { createSectionPlaceHandler } from './sectionPlaceHandler';

function createHarness(activePhaseId) {
  let toolState = {};
  const dispatched = [];
  const handler = createSectionPlaceHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    getFloor: () => ({ id: 'floor_1', sectionCuts: [] }),
    activeFloorId: 'floor_1',
    snapEnabled: false,
    activePhaseId,
  });

  handler.onMouseDown({ x: 0, y: 0 }, { button: 0 }, toolState);
  handler.onMouseDown({ x: 4000, y: 0 }, { button: 0 }, toolState);

  return dispatched;
}

describe('section cut placement phase assignment', () => {
  it('stamps new section cuts with the active phase', () => {
    const dispatched = createHarness('phase_1');

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe('SECTION_ADD');
    expect(dispatched[0].sectionCut.phaseId).toBe('phase_1');
  });

  it('leaves the phase unassigned when no phase is active', () => {
    const dispatched = createHarness(null);

    expect(dispatched[0].sectionCut.phaseId).toBeNull();
  });
});
