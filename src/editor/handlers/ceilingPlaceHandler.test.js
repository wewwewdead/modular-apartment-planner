import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createFloor } from '@/domain/models';
import { createCeilingPlaceHandler } from './ceilingPlaceHandler';

// A 6000 × 4000 column grid, as in the ceiling domain tests: a ring of beams
// closing it gives a ceiling something to hang from.
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

// A room-sized area inside the grid, deliberately smaller than the extent the
// beams would derive on their own — and clear of every ring beam, so nothing
// overhead crosses it. It still sits in the bay those beams frame, which is how
// a room's ceiling is actually traced.
const DRAWN_AREA = [
  { x: 1000, y: 1000 },
  { x: 3000, y: 1000 },
  { x: 3000, y: 2500 },
  { x: 1000, y: 2500 },
];

// The same area moved off the end of the frame: no beam crosses it and no bay
// contains it either.
const OFF_FRAME_AREA = DRAWN_AREA.map((point) => ({ ...point, x: point.x + 10000 }));

// The same grid traced out to the column centres, so all four ring beams run
// under part of what was drawn.
const SPANNING_AREA = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

// The deck of the storey above, pulled 1500 mm east of the frame, and the strip
// a user traces under that overhang: it starts on the east beam's outer face, so
// it crosses no beam and lies in no bay.
const CANTILEVERED_DECK = [
  { x: 0, y: 0 },
  { x: 7500, y: 0 },
  { x: 7500, y: 4000 },
  { x: 0, y: 4000 },
];
const OVERHANG_AREA = [
  { x: 6125, y: 500 },
  { x: 7500, y: 500 },
  { x: 7500, y: 3500 },
  { x: 6125, y: 3500 },
];

function createHarness({ beams = [], deckAbove = null } = {}) {
  const floor = createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: 2800 });
  floor.columns = RING_COLUMNS;
  floor.beams = beams;
  const above = deckAbove
    ? Object.assign(createFloor('First Floor', 1, { elevation: 3200, floorToFloorHeight: 2800 }), {
        slabs: [{ id: 'slab_above', floorId: 'floor_2', elevation: 3200, thickness: 200, boundaryPoints: deckAbove }],
      })
    : null;
  const project = { floors: [floor, above].filter(Boolean), trussSystems: [], ceilings: [] };

  let toolState = {};
  const dispatched = [];
  const editorActions = [];
  const handler = createCeilingPlaceHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      editorActions.push(action);
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    getProject: () => project,
    getFloor: (floorId) => project.floors.find((entry) => entry.id === floorId) || null,
    activeFloorId: floor.id,
    // SNAP_DISTANCE_PX / 0.1 => a 100 mm close radius at the default zoom.
    viewport: { zoom: 0.1 },
    activePhaseId: 'phase_1',
  });

  const click = (point) => handler.onMouseDown(point, { button: 0 }, toolState);
  const drawArea = (points = DRAWN_AREA) => points.forEach(click);

  return {
    handler,
    floor,
    dispatched,
    editorActions,
    click,
    drawArea,
    statusMessages: () => editorActions.filter((a) => a.type === 'SET_STATUS_MESSAGE').map((a) => a.message),
    getToolState: () => toolState,
  };
}

describe('ceiling placement point collection', () => {
  it('accumulates a point per click and tracks the cursor between them', () => {
    const harness = createHarness();

    harness.click({ x: 1000, y: 1000 });
    expect(harness.getToolState().ceilingPoints).toEqual([{ x: 1000, y: 1000 }]);

    harness.click({ x: 3000, y: 1000 });
    harness.handler.onMouseMove({ x: 3000, y: 2500 }, {}, harness.getToolState());

    expect(harness.getToolState().ceilingPoints).toHaveLength(2);
    expect(harness.getToolState().ceilingPreviewPoint).toEqual({ x: 3000, y: 2500 });
    expect(harness.dispatched).toHaveLength(0);
  });

  it('ignores non-primary buttons', () => {
    const harness = createHarness();
    harness.handler.onMouseDown({ x: 1000, y: 1000 }, { button: 2 }, harness.getToolState());

    expect(harness.getToolState().ceilingPoints).toBeUndefined();
  });

  it('commits when the last click lands back on the first point', () => {
    const harness = createHarness();
    harness.drawArea();
    harness.click({ x: 1050, y: 1000 });

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0].type).toBe('CEILING_ADD');
    // The closing click is a gesture, not a vertex: the ceiling keeps the four
    // corners that were drawn.
    expect(harness.dispatched[0].ceiling.boundaryPolygon).toEqual(DRAWN_AREA);
    expect(harness.getToolState()).toMatchObject({ ceilingPoints: [], ceilingPreviewPoint: null });
  });

  it('will not close on the first point before there are three of them', () => {
    const harness = createHarness();
    harness.click({ x: 1000, y: 1000 });
    harness.click({ x: 3000, y: 1000 });
    harness.click({ x: 1000, y: 1000 });

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState().ceilingPoints).toHaveLength(3);
  });

  it('commits on a double click', () => {
    const harness = createHarness();
    harness.drawArea();
    harness.handler.onDoubleClick({ x: 1000, y: 2500 }, {}, harness.getToolState());

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0].ceiling.boundaryPolygon).toEqual(DRAWN_AREA);
  });

  it('ignores a double click before there is an area', () => {
    const harness = createHarness();
    harness.click({ x: 1000, y: 1000 });
    harness.handler.onDoubleClick({ x: 3000, y: 1000 }, {}, harness.getToolState());

    expect(harness.dispatched).toHaveLength(0);
  });

  it('clears the in-progress outline and returns to select on Escape', () => {
    const harness = createHarness();
    harness.drawArea();
    harness.handler.onKeyDown({ key: 'Escape' });

    expect(harness.getToolState()).toMatchObject({ ceilingPoints: [], ceilingPreviewPoint: null });
    expect(harness.editorActions).toContainEqual({ type: 'SET_TOOL', tool: 'select' });
    expect(harness.dispatched).toHaveLength(0);
  });
});

describe('ceiling placement commit', () => {
  it('keeps the drawn area as the extent and hangs it from the beams it was drawn under', () => {
    const harness = createHarness({ beams: beamRing(3200) });
    harness.drawArea(SPANNING_AREA);
    harness.handler.onDoubleClick({ x: 0, y: 4000 }, {}, harness.getToolState());

    const { ceiling } = harness.dispatched[0];
    expect(ceiling.boundarySource).toBe('drawn');
    expect(ceiling.boundaryPolygon).toEqual(SPANNING_AREA);
    expect(ceiling.floorId).toBe(harness.floor.id);
    expect(ceiling.phaseId).toBe('phase_1');
    // The beams still decide the plane, even though they had no say in the area.
    expect(ceiling.attachment).toEqual({
      mode: 'beam',
      beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'],
    });
    expect(ceiling.baseElevation).toBe(3200);
    expect(harness.statusMessages()).toEqual(['Ceiling drawn — hangs from 4 beams at 3200 mm.']);
  });

  it('hangs an area traced clear of every beam from the bay it was drawn in', () => {
    const harness = createHarness({ beams: beamRing(3200) });
    harness.drawArea();
    harness.handler.onDoubleClick({ x: 1000, y: 2500 }, {}, harness.getToolState());

    const { ceiling } = harness.dispatched[0];
    // Tracing the room means staying inside the beam faces, so crossing a beam
    // cannot be what attaches a ceiling: the bay overhead is what it hangs from.
    expect(ceiling.attachment).toEqual({ mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] });
    expect(ceiling.baseElevation).toBe(3200);
    expect(ceiling.boundaryPolygon).toEqual(DRAWN_AREA);
    expect(harness.statusMessages()).toEqual(['Ceiling drawn — hangs from 4 beams at 3200 mm.']);
  });

  it('hangs an area traced under a cantilever from the beams the deck rests on', () => {
    const harness = createHarness({ beams: beamRing(3200), deckAbove: CANTILEVERED_DECK });
    harness.drawArea(OVERHANG_AREA);
    harness.handler.onDoubleClick(OVERHANG_AREA[3], {}, harness.getToolState());

    const { ceiling } = harness.dispatched[0];
    // The draw tool is the way to get a ceiling out under an overhang, and this
    // is what makes it one: the traced strip is beside the bay, but it is under
    // the deck those beams carry, so it hangs from them.
    expect(ceiling.attachment).toEqual({ mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] });
    expect(ceiling.baseElevation).toBe(3200);
    expect(ceiling.boundaryPolygon).toEqual(OVERHANG_AREA);
    expect(harness.statusMessages()).toEqual(['Ceiling drawn — hangs from 4 beams at 3200 mm.']);
  });

  it('hangs from nothing when the traced area lies outside every bay on the floor', () => {
    const harness = createHarness({ beams: beamRing(3200) });
    harness.drawArea(OFF_FRAME_AREA);
    harness.handler.onDoubleClick(OFF_FRAME_AREA[3], {}, harness.getToolState());

    const { ceiling } = harness.dispatched[0];
    // Drawn out in the open: the beams framing the room next door say nothing
    // about how high this ceiling hangs, so it keeps its own datum.
    expect(ceiling.attachment).toEqual({ mode: 'manual', beamIds: [] });
    expect(ceiling.boundaryPolygon).toEqual(OFF_FRAME_AREA);
    expect(harness.statusMessages()).toEqual([
      'Ceiling drawn on a manual datum — no beam, bay or slab above reaches the area drawn.',
    ]);
  });

  it('falls back to a manual datum when nothing overhead can carry it', () => {
    const harness = createHarness();
    harness.drawArea();
    harness.handler.onDoubleClick({ x: 1000, y: 2500 }, {}, harness.getToolState());

    const { ceiling } = harness.dispatched[0];
    expect(ceiling.attachment).toEqual({ mode: 'manual', beamIds: [] });
    expect(ceiling.boundarySource).toBe('drawn');
    expect(ceiling.boundaryPolygon).toEqual(DRAWN_AREA);
    expect(harness.statusMessages()).toEqual([
      'Ceiling drawn on a manual datum — place top beams on the columns to attach it.',
    ]);
  });

  it('leaves the detail editor shut so several areas can be drawn in a row', () => {
    const harness = createHarness({ beams: beamRing(3200) });
    harness.drawArea();
    harness.handler.onDoubleClick({ x: 1000, y: 2500 }, {}, harness.getToolState());

    expect(harness.editorActions.map((action) => action.type)).not.toContain('OPEN_CEILING_DETAIL_EDITOR');
    expect(harness.editorActions.map((action) => action.type)).not.toContain('SET_TOOL');
  });

  it('stamps no phase when none is active', () => {
    const floor = createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: 2800 });
    const dispatched = [];
    let toolState = {};
    const handler = createCeilingPlaceHandler({
      dispatch: (action) => dispatched.push(action),
      editorDispatch: (action) => {
        if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      },
      getProject: () => ({ floors: [floor], trussSystems: [], ceilings: [] }),
      getFloor: () => floor,
      activeFloorId: floor.id,
      viewport: { zoom: 0.1 },
      activePhaseId: null,
    });

    DRAWN_AREA.forEach((point) => handler.onMouseDown(point, { button: 0 }, toolState));
    handler.onDoubleClick({ x: 1000, y: 2500 }, {}, toolState);

    expect(dispatched[0].ceiling.phaseId).toBeNull();
  });
});

/* ── Traced under a slab, filed a storey down ─────────────────────────────
 *
 * A floor's slabs are the deck it STANDS ON, so the ceiling closing the
 * underside of the plate you are standing on belongs to the storey below. The
 * slab panel arms the tool with that storey; the tool has to decide everything
 * against it, not just stamp its id on the result.
 */
describe('ceiling placement anchored on a slab', () => {
  function createAnchoredHarness({ groundBeams = beamRing(3200) } = {}) {
    const ground = Object.assign(createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: 3200 }), {
      columns: RING_COLUMNS,
      beams: groundBeams,
    });
    // The storey being edited, carrying the cantilevered deck and a ring of its
    // own two metres higher. Those beams are the wrong answer made available:
    // a ladder run against the active floor would have to reach for them.
    const upper = Object.assign(createFloor('First Floor', 1, { elevation: 3200, floorToFloorHeight: 2800 }), {
      columns: RING_COLUMNS,
      beams: beamRing(6000).map((beam) => ({ ...beam, id: `${beam.id}_up` })),
      slabs: [
        {
          id: 'slab_upper',
          floorId: 'floor_upper',
          elevation: 3200,
          thickness: 200,
          boundaryPoints: CANTILEVERED_DECK,
        },
      ],
    });
    const project = { floors: [ground, upper], trussSystems: [], ceilings: [] };

    let toolState = { ceilingTargetFloorId: ground.id };
    const dispatched = [];
    const editorActions = [];
    const handler = createCeilingPlaceHandler({
      dispatch: (action) => dispatched.push(action),
      editorDispatch: (action) => {
        editorActions.push(action);
        if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      },
      getProject: () => project,
      getFloor: (floorId) => project.floors.find((entry) => entry.id === floorId) || null,
      activeFloorId: upper.id,
      viewport: { zoom: 0.1 },
      activePhaseId: null,
    });

    return {
      handler,
      ground,
      upper,
      dispatched,
      editorActions,
      trace: (points = OVERHANG_AREA) => {
        points.forEach((point) => handler.onMouseDown(point, { button: 0 }, toolState));
        handler.onDoubleClick(points[points.length - 1], {}, toolState);
      },
      statusMessages: () => editorActions.filter((a) => a.type === 'SET_STATUS_MESSAGE').map((a) => a.message),
      getToolState: () => toolState,
    };
  }

  it('files the ceiling on the target storey and hangs it from THAT storey’s beams', () => {
    const harness = createAnchoredHarness();
    harness.trace();

    const { ceiling } = harness.dispatched[0];
    expect(ceiling.floorId).toBe(harness.ground.id);
    // The ground ring, at 3200 — not the first floor's own ring at 6000, which
    // is what an unanchored trace on the active floor would have had to find.
    expect(ceiling.attachment).toEqual({ mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] });
    expect(ceiling.baseElevation).toBe(3200);
    expect(ceiling.boundaryPolygon).toEqual(OVERHANG_AREA);
  });

  it('names the storey it landed on, because it is not the one on screen', () => {
    const harness = createAnchoredHarness();
    harness.trace();

    expect(harness.statusMessages()).toEqual(['Ceiling added to Ground Floor — hangs from 4 beams at 3200 mm.']);
  });

  it('reads eligibility off the target storey too, when nothing up there carries it', () => {
    const harness = createAnchoredHarness({ groundBeams: [] });
    harness.trace();

    expect(harness.dispatched[0].ceiling.attachment).toEqual({ mode: 'manual', beamIds: [] });
    expect(harness.statusMessages()).toEqual([
      'Ceiling added to Ground Floor on a manual datum — place top beams on the columns to attach it.',
    ]);
  });

  it('finishes the flow rather than arming for another trace', () => {
    const harness = createAnchoredHarness();
    harness.trace();

    const { ceiling } = harness.dispatched[0];
    // SET_TOOL clears the override with the rest of the tool state, and takes
    // the status line with it — hence the order.
    expect(harness.editorActions.slice(-3)).toEqual([
      { type: 'SET_TOOL', tool: 'select' },
      { type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceiling.id },
      { type: 'SET_STATUS_MESSAGE', message: 'Ceiling added to Ground Floor — hangs from 4 beams at 3200 mm.' },
    ]);
  });

  it('drops the target storey on Escape, so the next plain trace stays where it is drawn', () => {
    const harness = createAnchoredHarness();
    harness.handler.onMouseDown(OVERHANG_AREA[0], { button: 0 }, harness.getToolState());
    harness.handler.onKeyDown({ key: 'Escape' });

    expect(harness.getToolState()).toMatchObject({
      ceilingPoints: [],
      ceilingPreviewPoint: null,
      ceilingTargetFloorId: null,
    });
    expect(harness.dispatched).toHaveLength(0);
  });
});
