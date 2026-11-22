import { describe, expect, it, vi } from 'vitest';

// The beam geometry is not what is under test: every press finds a beam and
// any two beams make a valid pair, so the test is about where the truss goes.
vi.mock('@/truss/beamSupports', () => ({
  findBeamSupportAtPoint: (floor, point) => ({ beam: { id: point.x < 5000 ? 'beam_a' : 'beam_b' } }),
  getBeamSupportCountLimit: () => 10,
  resolveBeamPairSupport: () => ({
    valid: true,
    baseElevation: 3000,
    supportLength: 6000,
    span: 6000,
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 6000, y: 0 },
    supportBeamIds: { start: 'beam_a', end: 'beam_b' },
  }),
}));

const { createTrussDrawHandler } = await import('./trussDrawHandler');

/**
 * The status line after a truss is drawn says which way it went
 * (docs/multi-roof.md §5.4): a run that joined a system shares that system's
 * one roof, so the user has to be able to tell it from a new system.
 */
function draw({ trussSystems = [], toolState = {}, selectedId = null, selectedType = null, project = null }) {
  const actions = [];
  const send = (action) => actions.push(action);
  const handler = createTrussDrawHandler({
    dispatch: send,
    editorDispatch: send,
    getFloor: () => ({ id: 'floor_1', beams: [] }),
    getProject: () => project || { trussSystems },
    activeFloorId: 'floor_1',
    trussSystems,
    viewport: { zoom: 0.1 },
    selectedId,
    selectedType,
    activePhaseId: null,
  });
  handler.onMouseDown({ x: 6000, y: 0 }, { button: 0 }, { startTrussBeamId: 'beam_a', ...toolState });
  const status = actions.filter((action) => action.type === 'SET_STATUS_MESSAGE').map((action) => action.message);
  return { actions, status: status[status.length - 1] };
}

const existing = { id: 'ts_main', name: 'Main trusses', baseElevation: 3000, trussInstances: [] };

describe('truss draw status', () => {
  it('says a new system was created when nothing is targeted or selected', () => {
    const { actions, status } = draw({ trussSystems: [existing] });
    expect(actions.some((action) => action.type === 'TRUSS_SYSTEM_ADD')).toBe(true);
    expect(status).toBe('New truss system created above the selected beams.');
  });

  it('gives a new system a name no other system has, on any floor', () => {
    const project = {
      trussSystems: [
        { ...existing, name: 'Truss System' },
        { id: 'ts_upper', name: 'Truss System 2', floorId: 'floor_2' },
      ],
    };
    const { actions } = draw({ trussSystems: [existing], project });
    expect(actions.find((action) => action.type === 'TRUSS_SYSTEM_ADD').trussSystem.name).toBe('Truss System 3');
    const first = draw({ trussSystems: [] });
    expect(first.actions.find((action) => action.type === 'TRUSS_SYSTEM_ADD').trussSystem.name).toBe('Truss System');
  });

  it('names the system a targeted draw joined', () => {
    const { actions, status } = draw({ trussSystems: [existing], toolState: { targetTrussSystemId: 'ts_main' } });
    expect(actions.find((action) => action.type === 'TRUSS_INSTANCE_ADD').trussSystemId).toBe('ts_main');
    expect(status).toBe('Truss added to Main trusses.');
  });

  it('names the selected system a draw with no target joined', () => {
    const { status } = draw({ trussSystems: [existing], selectedId: 'ts_main', selectedType: 'trussSystem' });
    expect(status).toBe('Truss added to Main trusses.');
  });
});
