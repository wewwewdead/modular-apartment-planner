import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createFloor, createSlab } from '@/domain/models';
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

  it('hangs the ceiling from a single picked beam, which encloses no area to draw', () => {
    const harness = createHarness();

    harness.pick('beam_s');
    harness.handler.onKeyDown({ key: 'Enter' }, harness.getToolState());

    // One beam bounds no rectangle, so the boundary has to come from elsewhere
    // — but it carries the ceiling all the same, and at its own level rather
    // than at the top of the storey.
    const { ceiling } = harness.dispatched[0];
    expect(ceiling.attachment).toEqual({ mode: 'beam', beamIds: ['beam_s'] });
    expect(ceiling.baseElevation).toBe(3200);
    expect(harness.statusMessages().at(-1)).toBe('Ceiling added — hangs from 1 beam at 3200 mm.');
  });

  it('says the ceiling fell back to a manual datum when the picked beam is gone', () => {
    const harness = createHarness();

    harness.pick('beam_s');
    // Deleted between the pick and the Enter: the request survives, the beam
    // does not, and there is nothing left to read a plane off.
    harness.floor.beams = harness.floor.beams.filter((beam) => beam.id !== 'beam_s');
    harness.handler.onKeyDown({ key: 'Enter' }, harness.getToolState());

    const { ceiling } = harness.dispatched[0];
    expect(ceiling.attachment).toEqual({ mode: 'manual', beamIds: [] });
    expect(harness.statusMessages().at(-1)).toBe(
      'The beam picked is no longer on this floor — ceiling added on a manual datum at 2800 mm.',
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

/* ── Anchored on a plate ──────────────────────────────────────────────────
 *
 * Started from a slab, the tool is arming a pick on the storey BELOW the plan
 * on screen — the frame that carries the plate is down there, and so is the
 * ceiling that closes it. The floor on screen contributes the plate, and the
 * ceiling covers the part of it the picked beams frame: bay ∩ slab, never the
 * bare bay, or a ceiling would be built out past the plate it is under.
 *
 * The plate here stops at x = 3000, halfway across a bay whose east face is at
 * 5875. Every assertion about the clip is that difference.
 */

const HALF_DECK = [
  { x: 0, y: 0 },
  { x: 3000, y: 0 },
  { x: 3000, y: 4000 },
  { x: 0, y: 4000 },
];

const DECK_CLEAR_OF_THE_BAY = [
  { x: 10000, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 4000 },
  { x: 10000, y: 4000 },
];

// Two beams on one grid line, which enclose an area exactly as wide as they are
// long and nothing deep.
const SPLIT_SOUTH_COLUMNS = [
  ['col_sw', 0, 0],
  ['col_mid', 3000, 0],
  ['col_se', 6000, 0],
].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: 3200 }), id }));

const ON_SPLIT_BEAM = { beam_s1: { x: 1500, y: 0 }, beam_s2: { x: 4500, y: 0 } };

function extent(points) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function createAnchoredHarness({
  beams = beamRing(3200),
  columns = RING_COLUMNS,
  deck = HALF_DECK,
  clipSlabId = 'slab_upper',
} = {}) {
  const ground = Object.assign(createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: 3200 }), {
    id: 'floor_ground',
    columns,
    beams,
  });
  const upper = Object.assign(createFloor('First Floor', 1, { elevation: 3200, floorToFloorHeight: 2800 }), {
    id: 'floor_upper',
    slabs: [{ ...createSlab('floor_upper', deck, 200, 3200), id: 'slab_upper' }],
  });
  const project = { floors: [ground, upper], trussSystems: [], ceilings: [] };

  // What `enterPickCeilingBeamsUnderSlab` leaves behind, verbatim.
  let toolState = { ceilingTargetFloorId: ground.id, ceilingClipSlabId: clipSlabId };
  const dispatched = [];
  const editorActions = [];
  const handler = createCeilingBeamPickHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      editorActions.push(action);
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    getProject: () => project,
    // The whole point of the anchored flow: the active floor is the one on
    // screen, and the beams being clicked are on another one — so the lookup
    // has to answer about whichever it is asked for.
    getFloor: (floorId) => project.floors.find((entry) => entry.id === floorId) || null,
    activeFloorId: upper.id,
    viewport: { zoom: 0.1 },
    activePhaseId: 'phase_1',
  });

  const click = (point) => handler.onMouseDown(point, { button: 0 }, toolState);

  return {
    handler,
    ground,
    upper,
    dispatched,
    editorActions,
    click,
    pick: (...beamIds) => beamIds.forEach((beamId) => click(ON_BEAM[beamId] || ON_SPLIT_BEAM[beamId])),
    commit: () => handler.onKeyDown({ key: 'Enter' }, toolState),
    actionTypes: () => editorActions.map((action) => action.type),
    statusMessages: () => editorActions.filter((a) => a.type === 'SET_STATUS_MESSAGE').map((a) => a.message),
    getToolState: () => toolState,
  };
}

describe('ceiling beam pick anchored on a slab', () => {
  it('picks the beams of the storey below rather than the plan on screen', () => {
    const harness = createAnchoredHarness();

    harness.handler.onMouseMove(ON_BEAM.beam_e, {}, harness.getToolState());
    expect(harness.getToolState().ceilingPickHoverBeamId).toBe('beam_e');

    harness.pick('beam_s');
    expect(harness.getToolState().ceilingPickBeamIds).toEqual(['beam_s']);
  });

  it('covers the plate inside the picked beams and files it on the storey below', () => {
    const harness = createAnchoredHarness();

    harness.pick('beam_s', 'beam_n', 'beam_w', 'beam_e');
    harness.commit();

    expect(harness.dispatched).toHaveLength(1);
    const { ceiling } = harness.dispatched[0];
    expect(ceiling.floorId).toBe('floor_ground');
    expect(ceiling.attachment).toEqual({ mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] });
    // LOAD-BEARING: an 'auto' boundary is re-derived from beam coverage on
    // every read, which would throw the plate away and put the bay back.
    expect(ceiling.boundarySource).toBe('drawn');
    // Three sides are the beams' inner faces; the east side is the plate,
    // which stops 2875 short of the beam face at 5875.
    expect(extent(ceiling.boundaryPolygon)).toEqual({ minX: 125, maxX: 3000, minY: 125, maxY: 3875 });
  });

  it('returns to select, opens what it built, and names the storey last of all', () => {
    const harness = createAnchoredHarness();

    harness.pick('beam_s', 'beam_n', 'beam_w', 'beam_e');
    harness.commit();

    const { ceiling } = harness.dispatched[0];
    expect(harness.editorActions).toContainEqual({ type: 'SET_TOOL', tool: 'select' });
    expect(harness.editorActions).toContainEqual({ type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceiling.id });
    expect(harness.getToolState()).toMatchObject({ ceilingPickBeamIds: [], ceilingPickHoverBeamId: null });
    // Both SET_TOOL and opening the editor wipe the status line.
    expect(harness.actionTypes().at(-1)).toBe('SET_STATUS_MESSAGE');
    expect(harness.statusMessages().at(-1)).toBe(
      'Ceiling added to Ground Floor — covers the plate inside 4 beams, hangs at 3200 mm.',
    );
  });

  it('refuses a single beam, which frames no area to cut the plate with', () => {
    const harness = createAnchoredHarness();

    harness.pick('beam_s');
    harness.commit();

    expect(harness.dispatched).toHaveLength(0);
    // Still in the tool with the pick intact: what is missing is one more click.
    expect(harness.getToolState().ceilingPickBeamIds).toEqual(['beam_s']);
    expect(harness.actionTypes()).not.toContain('SET_TOOL');
    expect(harness.statusMessages().at(-1)).toBe(
      'One beam frames no area — pick the beams on both sides of the ceiling, then press Enter.',
    );
  });

  it('refuses a set of beams that collapses onto one line', () => {
    const harness = createAnchoredHarness({
      beams: [ringBeam('beam_s1', 'col_sw', 'col_mid', 3200), ringBeam('beam_s2', 'col_mid', 'col_se', 3200)],
      columns: SPLIT_SOUTH_COLUMNS,
    });

    harness.pick('beam_s1', 'beam_s2');
    harness.commit();

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState().ceilingPickBeamIds).toEqual(['beam_s1', 'beam_s2']);
    expect(harness.statusMessages().at(-1)).toBe(
      'Beams on one line frame no area — pick the beams on both sides of the ceiling, then press Enter.',
    );
  });

  it('refuses beams that frame nothing under this plate', () => {
    const harness = createAnchoredHarness({ deck: DECK_CLEAR_OF_THE_BAY });

    harness.pick('beam_s', 'beam_n', 'beam_w', 'beam_e');
    harness.commit();

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState().ceilingPickBeamIds).toEqual(['beam_s', 'beam_n', 'beam_w', 'beam_e']);
    expect(harness.actionTypes()).not.toContain('SET_TOOL');
    expect(harness.statusMessages().at(-1)).toBe(
      'The picked beams frame no area under this plate — pick the beams that carry it.',
    );
  });

  it('drops a pick whose beams were deleted between the click and the Enter', () => {
    const harness = createAnchoredHarness();

    harness.pick('beam_s', 'beam_n');
    harness.ground.beams = [];
    harness.commit();

    expect(harness.dispatched).toHaveLength(0);
    // Nothing resolves, so the request itself goes — there is no plane and no
    // area left in it to build a ceiling on a manual datum from.
    expect(harness.getToolState().ceilingPickBeamIds).toEqual([]);
    expect(harness.statusMessages().at(-1)).toBe(
      'The beams picked are no longer on Ground Floor — pick again on the plan.',
    );
  });

  it('falls back to the bay when the plate the pick was anchored on is gone', () => {
    const harness = createAnchoredHarness({ clipSlabId: 'slab_deleted' });

    harness.pick('beam_s', 'beam_n', 'beam_w', 'beam_e');
    harness.commit();

    const { ceiling } = harness.dispatched[0];
    expect(extent(ceiling.boundaryPolygon)).toEqual({ minX: 125, maxX: 5875, minY: 125, maxY: 3875 });
    // Nothing was cut to a plate, so the message does not claim one.
    expect(harness.statusMessages().at(-1)).toBe('Ceiling added to Ground Floor — hangs from 4 beams at 3200 mm.');
  });

  it('stamps the active phase and commits on a double click too', () => {
    const harness = createAnchoredHarness();

    harness.pick('beam_s', 'beam_n', 'beam_w', 'beam_e');
    harness.handler.onDoubleClick(ON_BEAM.beam_e, {}, harness.getToolState());

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0].ceiling.phaseId).toBe('phase_1');
    expect(harness.dispatched[0].ceiling.boundarySource).toBe('drawn');
  });
});
