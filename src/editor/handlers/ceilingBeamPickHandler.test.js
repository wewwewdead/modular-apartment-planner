import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createFloor } from '@/domain/models';
import { createCeilingBeamPickHandler } from './ceilingBeamPickHandler';

// The same 6000 × 4000 column grid the trace-tool tests use, so a ring of beams
// gives a ceiling something to hang from.
const RING_COLUMNS = [
  ['col_sw', 0, 0],
  ['col_se', 6000, 0],
  ['col_ne', 6000, 4000],
  ['col_nw', 0, 4000],
].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: 3200 }), id }));

function ringBeam(id, startId, endId, level) {
  return {
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, 250, 450, level),
    id,
  };
}

function beamRing(level) {
  return [
    ringBeam('beam_s', 'col_sw', 'col_se', level),
    ringBeam('beam_n', 'col_nw', 'col_ne', level),
    ringBeam('beam_w', 'col_sw', 'col_nw', level),
    ringBeam('beam_e', 'col_se', 'col_ne', level),
  ];
}

// A point on the centreline of each ring beam, well clear of the others.
const ON_BEAM = {
  beam_s: { x: 3000, y: 0 },
  beam_n: { x: 3000, y: 4000 },
  beam_w: { x: 0, y: 2000 },
  beam_e: { x: 6000, y: 2000 },
};

const OFF_ANY_BEAM = { x: 3000, y: 2000 };

function createHarness({ beams = beamRing(3200), activePhaseId = 'phase_1' } = {}) {
  const floor = createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: 2800 });
  floor.columns = RING_COLUMNS;
  floor.beams = beams;
  const project = { floors: [floor], trussSystems: [], ceilings: [] };

  let toolState = {};
  const dispatched = [];
  const editorActions = [];
  const handler = createCeilingBeamPickHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      editorActions.push(action);
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    getProject: () => project,
    getFloor: () => floor,
    activeFloorId: floor.id,
    viewport: { zoom: 0.1 },
    activePhaseId,
  });

  const click = (point) => handler.onMouseDown(point, { button: 0 }, toolState);
  const pick = (...beamIds) => beamIds.forEach((beamId) => click(ON_BEAM[beamId]));

  return {
    handler,
    floor,
    dispatched,
    editorActions,
    click,
    pick,
    actionTypes: () => editorActions.map((action) => action.type),
    statusMessages: () => editorActions.filter((a) => a.type === 'SET_STATUS_MESSAGE').map((a) => a.message),
    getToolState: () => toolState,
  };
}

describe('ceiling beam picking', () => {
  it('adds a clicked beam to the selection and takes it back out on a second click', () => {
    const harness = createHarness();

    harness.pick('beam_s', 'beam_n');
    expect(harness.getToolState().ceilingPickBeamIds).toEqual(['beam_s', 'beam_n']);

    harness.pick('beam_s');
    expect(harness.getToolState().ceilingPickBeamIds).toEqual(['beam_n']);
    expect(harness.dispatched).toHaveLength(0);
  });

  it('keeps the count and the keys on the status line while the selection is open', () => {
    const harness = createHarness();

    harness.pick('beam_s');
    harness.pick('beam_n');
    harness.pick('beam_n');

    expect(harness.statusMessages()).toEqual([
      '1 beam selected — Enter to create the ceiling, Esc to cancel.',
      '2 beams selected — Enter to create the ceiling, Esc to cancel.',
      '1 beam selected — Enter to create the ceiling, Esc to cancel.',
    ]);
  });

  it('says why a beam at the floor datum cannot be picked, and does not pick it', () => {
    const harness = createHarness({
      beams: [ringBeam('beam_tie', 'col_sw', 'col_se', 0), ringBeam('beam_n', 'col_nw', 'col_ne', 3200)],
    });

    harness.click(ON_BEAM.beam_s);

    expect(harness.getToolState().ceilingPickBeamIds).toBeUndefined();
    expect(harness.statusMessages()).toEqual([
      'That beam sits at this floor level — a ceiling can only hang from a beam above it.',
    ]);
  });

  it('asks for a beam when the click lands on empty plan', () => {
    const harness = createHarness();

    harness.click(OFF_ANY_BEAM);

    expect(harness.getToolState().ceilingPickBeamIds).toBeUndefined();
    expect(harness.statusMessages()).toEqual(['Click a beam to hang the ceiling from it.']);
  });

  it('ignores non-primary buttons', () => {
    const harness = createHarness();
    harness.handler.onMouseDown(ON_BEAM.beam_s, { button: 2 }, harness.getToolState());

    expect(harness.getToolState().ceilingPickBeamIds).toBeUndefined();
  });

  it('tracks the beam under the cursor for the plan highlight', () => {
    const harness = createHarness();

    harness.handler.onMouseMove(ON_BEAM.beam_e, {}, harness.getToolState());
    expect(harness.getToolState().ceilingPickHoverBeamId).toBe('beam_e');

    harness.handler.onMouseMove(OFF_ANY_BEAM, {}, harness.getToolState());
    expect(harness.getToolState().ceilingPickHoverBeamId).toBeNull();
  });
});

describe('ceiling beam pick commit', () => {
  it('builds the ceiling from the picked beams alone and opens its editor', () => {
    const harness = createHarness();

    harness.pick('beam_s', 'beam_n');
    harness.handler.onKeyDown({ key: 'Enter' }, harness.getToolState());

    expect(harness.dispatched).toHaveLength(1);
    const { ceiling } = harness.dispatched[0];
    expect(harness.dispatched[0].type).toBe('CEILING_ADD');
    expect(ceiling.attachment).toEqual({ mode: 'beam', beamIds: ['beam_s', 'beam_n'] });
    // The two beams left out of the pick are nowhere in the result.
    expect(ceiling.boundarySource).toBe('auto');
    expect(ceiling.baseElevation).toBe(3200);
    expect(ceiling.floorId).toBe(harness.floor.id);
    expect(harness.editorActions).toContainEqual({ type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceiling.id });
    expect(harness.editorActions).toContainEqual({ type: 'SET_TOOL', tool: 'select' });
    expect(harness.getToolState()).toMatchObject({ ceilingPickBeamIds: [], ceilingPickHoverBeamId: null });
  });

  it('reports the beam count and the plane it settled at, last of all', () => {
    const harness = createHarness();

    harness.pick('beam_s', 'beam_n', 'beam_w');
    harness.handler.onKeyDown({ key: 'Enter' }, harness.getToolState());

    // Both SET_TOOL and opening the editor wipe the status line, so the report
    // is worthless unless it is the last thing said.
    expect(harness.actionTypes().at(-1)).toBe('SET_STATUS_MESSAGE');
    expect(harness.statusMessages().at(-1)).toBe('Ceiling added — hangs from 3 beams at 3200 mm.');
  });

  it('says the ceiling fell back to a manual datum when one beam cannot enclose an area', () => {
    const harness = createHarness();

    harness.pick('beam_s');
    harness.handler.onKeyDown({ key: 'Enter' }, harness.getToolState());

    const { ceiling } = harness.dispatched[0];
    expect(ceiling.attachment).toEqual({ mode: 'manual', beamIds: [] });
    expect(harness.statusMessages().at(-1)).toBe(
      '1 beam encloses no ceiling area — ceiling added on a manual datum at 2800 mm. Pick beams on opposite sides of the area.',
    );
  });

  it('commits on a double click too', () => {
    const harness = createHarness();

    harness.pick('beam_w', 'beam_e');
    harness.handler.onDoubleClick(ON_BEAM.beam_e, {}, harness.getToolState());

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0].ceiling.attachment.beamIds).toEqual(['beam_w', 'beam_e']);
  });

  it('does nothing with no beam picked', () => {
    const harness = createHarness();

    harness.handler.onKeyDown({ key: 'Enter' }, harness.getToolState());
    harness.handler.onDoubleClick(OFF_ANY_BEAM, {}, harness.getToolState());

    expect(harness.dispatched).toHaveLength(0);
  });

  it('stamps the active phase on the ceiling, and none when no phase is active', () => {
    const phased = createHarness();
    phased.pick('beam_s', 'beam_n');
    phased.handler.onKeyDown({ key: 'Enter' }, phased.getToolState());
    expect(phased.dispatched[0].ceiling.phaseId).toBe('phase_1');

    const unphased = createHarness({ activePhaseId: null });
    unphased.pick('beam_s', 'beam_n');
    unphased.handler.onKeyDown({ key: 'Enter' }, unphased.getToolState());
    expect(unphased.dispatched[0].ceiling.phaseId).toBeNull();
  });

  it('drops the selection and returns to select on Escape', () => {
    const harness = createHarness();

    harness.pick('beam_s', 'beam_n');
    harness.handler.onKeyDown({ key: 'Escape' }, harness.getToolState());

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState()).toMatchObject({ ceilingPickBeamIds: [], ceilingPickHoverBeamId: null });
    expect(harness.editorActions).toContainEqual({ type: 'SET_TOOL', tool: 'select' });
    expect(harness.statusMessages().at(-1)).toBe('Ceiling attachment cancelled.');
  });
});
