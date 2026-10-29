import { describe, expect, it } from 'vitest';
import { createFloor, createSlab, createWall } from '@/domain/models';
import { computeFloorOverhangs, computeSlabOverhang, overhangRunRetractionMm } from '@/geometry/floorOverhang';
import {
  applyCantilever,
  applyProjectingBay,
  cantileverAppliedOffset,
  CANTILEVER_RETRACTION_CLEARANCE_MM,
  cantileverRetraction,
  createCantileverHandler,
  describeCantileverBasis,
  projectingBayBoundary,
  projectingBayWalls,
  removeCantilever,
} from './cantileverHandler';

/**
 * A 6000 × 4000 plate with its top-left corner on the origin. Traced in this
 * order the ring winds positive, which puts edge 0's outward normal at (0, -1)
 * — up the page, away from the plate, in a y-down plan space. Every offset
 * below is read against that.
 */
const PLATE = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

/**
 * The same plate with a notch cut up into it from below, between x=2000 and
 * x=4000. Pull the top edge down past y=1500 and it crosses the notch's sides —
 * the one shape a plate must never be committed in.
 */
const NOTCHED_PLATE = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 4000, y: 4000 },
  { x: 4000, y: 1500 },
  { x: 2000, y: 1500 },
  { x: 2000, y: 4000 },
  { x: 0, y: 4000 },
];

/**
 * A plate with a keyhole notch cut into its top edge: 2000 across at the floor
 * of the notch and only 400 at its mouth. A bay projected out of that floor has
 * to squeeze through the throat, and a long enough one runs straight through
 * the plate either side of the mouth.
 */
const KEYHOLE_PLATE = [
  { x: 0, y: 0 },
  { x: 2800, y: 0 },
  { x: 2000, y: 2000 },
  { x: 4000, y: 2000 },
  { x: 3200, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

// 100 mm: SNAP_DISTANCE_PX (10) at the default 0.1 zoom.
const ON_TOP_EDGE = { x: 3000, y: 40 };
const ON_BOTTOM_EDGE = { x: 3000, y: 3960 };
const MIDDLE_OF_NOWHERE = { x: 3000, y: 2000 };

function wallBelow(y) {
  return { id: `wall_${y}`, start: { x: -1000, y }, end: { x: 7000, y }, thickness: 200 };
}

function createHarness({ boundaryPoints = PLATE, floorBelow = null, selected = true, mode = null, walls = [] } = {}) {
  const floor = { ...createFloor('First', 1, { elevation: 3000 }), id: 'floor_first' };
  const slab = { ...createSlab(floor.id, boundaryPoints, 200, 3000), id: 'slab_upper' };
  floor.slabs = [slab];
  floor.walls = walls;

  // The panel sets the mode before the first click; SET_TOOL is what forgets it.
  let toolState = mode ? { cantileverMode: mode } : {};
  const dispatched = [];
  const editorActions = [];

  const handler = createCantileverHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      editorActions.push(action);
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    getFloor: () => floor,
    activeFloorId: floor.id,
    viewport: { zoom: 0.1 },
    selectedId: selected ? slab.id : null,
    selectedType: selected ? 'slab' : null,
    floorBelow,
  });

  return {
    handler,
    floor,
    slab,
    dispatched,
    editorActions,
    move: (point) => handler.onMouseMove(point, {}, toolState),
    click: (point) => handler.onMouseDown(point, { button: 0 }, toolState),
    key: (key) => handler.onKeyDown({ key }, toolState),
    actionTypes: () => editorActions.map((action) => action.type),
    statusMessages: () => editorActions.filter((a) => a.type === 'SET_STATUS_MESSAGE').map((a) => a.message),
    getToolState: () => toolState,
  };
}

describe('cantileverAppliedOffset', () => {
  /*
   * The one piece of arithmetic the whole feature rests on. `offsetMm` is signed
   * along the plate edge's OUTWARD normal, so a support line under the floor
   * reads negative and one already out past the edge reads positive — and a
   * single sum has to land the edge the wanted reach outside the line either
   * way. Getting this backwards would double the cantilever in one case and
   * negate it in the other, and both would look plausible on screen.
   */
  it('lands the edge outside a support line that sits INSIDE the plate', () => {
    // Beam 400 into the plate; the edge must finish 600 beyond it, so it travels
    // 200 outward.
    expect(cantileverAppliedOffset({ kind: 'beam', offsetMm: -400 }, 600)).toBe(200);
  });

  it('lands the edge outside a support line that is already OUTSIDE the edge', () => {
    // Wall line 250 past the edge; 600 beyond THAT is 850 of travel.
    expect(cantileverAppliedOffset({ kind: 'wall', offsetMm: 250 }, 600)).toBe(850);
  });

  it('measures from the edge itself when there is no line below', () => {
    expect(cantileverAppliedOffset(null, 600)).toBe(600);
  });
});

describe('describeCantileverBasis', () => {
  it('names the line the number is counted from', () => {
    expect(describeCantileverBasis({ kind: 'wall', offsetMm: -400 })).toBe('from wall line below');
    expect(describeCantileverBasis({ kind: 'beam', offsetMm: -400 })).toBe('from beam below');
    expect(describeCantileverBasis(null)).toBe('from current edge');
  });
});

describe('cantilever edge picking', () => {
  it('highlights the edge under the cursor and drops it when the cursor leaves', () => {
    const harness = createHarness();

    harness.move(ON_TOP_EDGE);
    expect(harness.getToolState().cantileverHoverEdge).toBe(0);

    harness.move(ON_BOTTOM_EDGE);
    expect(harness.getToolState().cantileverHoverEdge).toBe(2);

    harness.move(MIDDLE_OF_NOWHERE);
    expect(harness.getToolState().cantileverHoverEdge).toBeNull();
  });

  it('says nothing when the hovered edge has not changed', () => {
    const harness = createHarness();

    harness.move(ON_TOP_EDGE);
    const after = harness.editorActions.length;
    harness.move({ x: 4000, y: 30 });

    expect(harness.editorActions).toHaveLength(after);
  });

  it('picks the clicked side and attaches the support line it will be measured from', () => {
    const harness = createHarness({ floorBelow: { walls: [wallBelow(400)], columns: [], beams: [] } });

    harness.click(ON_TOP_EDGE);

    expect(harness.getToolState().cantileverPick).toEqual({
      kind: 'cantilever',
      slabId: 'slab_upper',
      edgeIndex: 0,
      // 400 into the plate, against an outward normal of -y.
      support: { kind: 'wall', offsetMm: -400 },
      defaultDistanceMm: 600,
      distanceMm: 600,
    });
    expect(harness.statusMessages().at(-1)).toContain('from wall line below');
    // Nothing is committed by picking a side.
    expect(harness.dispatched).toHaveLength(0);
  });

  it('picks with no support line when nothing below runs parallel', () => {
    const harness = createHarness({ floorBelow: { walls: [], columns: [], beams: [] } });

    harness.click(ON_TOP_EDGE);

    expect(harness.getToolState().cantileverPick).toMatchObject({ edgeIndex: 0, support: null });
    expect(harness.statusMessages().at(-1)).toContain('from current edge');
  });

  it('asks again when the click lands on no edge at all', () => {
    const harness = createHarness();

    harness.click(MIDDLE_OF_NOWHERE);

    expect(harness.getToolState().cantileverPick).toBeUndefined();
    expect(harness.statusMessages().at(-1)).toBe('Click an edge of the slab to cantilever that side.');
  });

  it('leaves a picked side alone while the panel is driving', () => {
    const harness = createHarness();

    harness.click(ON_TOP_EDGE);
    const after = harness.editorActions.length;
    harness.move(ON_BOTTOM_EDGE);
    harness.click(ON_BOTTOM_EDGE);

    expect(harness.getToolState().cantileverPick).toMatchObject({ edgeIndex: 0 });
    expect(harness.editorActions).toHaveLength(after);
  });

  it('ignores a right-click', () => {
    const harness = createHarness();

    harness.handler.onMouseDown(ON_TOP_EDGE, { button: 2 }, harness.getToolState());

    expect(harness.editorActions).toHaveLength(0);
  });

  it('reports a crosshair while picking and a plain cursor once the panel has the pick', () => {
    const harness = createHarness();

    expect(harness.handler.getCursor(harness.getToolState())).toBe('crosshair');
    harness.click(ON_TOP_EDGE);
    expect(harness.handler.getCursor(harness.getToolState())).toBe('default');
  });
});

describe('cantilever escape', () => {
  it('gives the side back first, and only then leaves', () => {
    const harness = createHarness();

    harness.click(ON_TOP_EDGE);
    harness.key('Escape');

    expect(harness.getToolState()).toMatchObject({ cantileverPick: null, cantileverHoverEdge: null });
    expect(harness.actionTypes()).not.toContain('SET_TOOL');

    harness.key('Escape');

    expect(harness.editorActions).toContainEqual({ type: 'SET_TOOL', tool: 'select' });
    // The plate you came in on is the plate you leave with.
    expect(harness.editorActions).toContainEqual({ type: 'SELECT_OBJECT', id: 'slab_upper', objectType: 'slab' });
    expect(harness.dispatched).toHaveLength(0);
  });

  it('stands the tool down when the plate it was working goes away', () => {
    const harness = createHarness({ selected: false });

    harness.move(ON_TOP_EDGE);

    expect(harness.editorActions).toContainEqual({ type: 'SET_TOOL', tool: 'select' });
    expect(harness.getToolState()).toMatchObject({ cantileverPick: null, cantileverHoverEdge: null });
  });
});

describe('applying a cantilever', () => {
  it('commits one boundary measured out from the support line below', () => {
    const harness = createHarness({ floorBelow: { walls: [wallBelow(400)], columns: [], beams: [] } });
    harness.click(ON_TOP_EDGE);

    const applied = applyCantilever({
      slab: harness.slab,
      floorId: harness.floor.id,
      pick: harness.getToolState().cantileverPick,
      distanceMm: 600,
      dispatch: (action) => harness.dispatched.push(action),
      editorDispatch: (action) => harness.editorActions.push(action),
    });

    expect(applied).toBe(true);
    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0]).toEqual({
      type: 'SLAB_UPDATE',
      floorId: 'floor_first',
      // Support line at y=400, reach 600 outward: the edge lands on y=-200.
      slab: {
        id: 'slab_upper',
        boundaryPoints: [
          { x: 0, y: -200 },
          { x: 6000, y: -200 },
          { x: 6000, y: 4000 },
          { x: 0, y: 4000 },
        ],
      },
    });
  });

  it('commits one boundary measured from the current edge when nothing is below', () => {
    const harness = createHarness({ floorBelow: null });
    harness.click(ON_TOP_EDGE);

    applyCantilever({
      slab: harness.slab,
      floorId: harness.floor.id,
      pick: harness.getToolState().cantileverPick,
      distanceMm: 600,
      dispatch: (action) => harness.dispatched.push(action),
      editorDispatch: (action) => harness.editorActions.push(action),
    });

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0].slab.boundaryPoints).toEqual([
      { x: 0, y: -600 },
      { x: 6000, y: -600 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
  });

  it('hands the plate back to the select tool, still selected, and says what it did last', () => {
    const harness = createHarness();
    harness.click(ON_TOP_EDGE);
    harness.key('Enter');

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.getToolState()).toMatchObject({ cantileverPick: null, cantileverHoverEdge: null });
    expect(harness.editorActions).toContainEqual({ type: 'SET_TOOL', tool: 'select' });
    expect(harness.editorActions).toContainEqual({ type: 'SELECT_OBJECT', id: 'slab_upper', objectType: 'slab' });
    // SET_TOOL and the reselect both wipe the status line, so the report has to
    // be the last thing said.
    expect(harness.actionTypes().at(-1)).toBe('SET_STATUS_MESSAGE');
    expect(harness.statusMessages().at(-1)).toBe('Cantilever applied — 600 mm from current edge.');
  });

  it('refuses a reach that folds the plate through itself, and keeps everything standing', () => {
    const harness = createHarness({ boundaryPoints: NOTCHED_PLATE });
    harness.click(ON_TOP_EDGE);
    const before = harness.getToolState().cantileverPick;

    // A support line 2600 into the plate pulls the top edge down to y=2000 —
    // straight through the sides of the notch.
    const applied = applyCantilever({
      slab: harness.slab,
      floorId: harness.floor.id,
      pick: { ...before, support: { kind: 'beam', offsetMm: -2600 } },
      distanceMm: 600,
      dispatch: (action) => harness.dispatched.push(action),
      editorDispatch: (action) => harness.editorActions.push(action),
    });

    expect(applied).toBe(false);
    expect(harness.dispatched).toHaveLength(0);
    expect(harness.statusMessages().at(-1)).toContain('folds this plate through itself');
    // The tool is still open on the same edge, because the fix is a new number.
    expect(harness.getToolState().cantileverPick).toEqual(before);
    expect(harness.actionTypes()).not.toContain('SET_TOOL');
  });

  it('floors the reach at 1 mm — a cantilever reaches out, and pulling in is what dragging is for', () => {
    const harness = createHarness();
    harness.click(ON_TOP_EDGE);

    applyCantilever({
      slab: harness.slab,
      floorId: harness.floor.id,
      pick: harness.getToolState().cantileverPick,
      distanceMm: -900,
      dispatch: (action) => harness.dispatched.push(action),
      editorDispatch: (action) => harness.editorActions.push(action),
    });

    expect(harness.dispatched[0].slab.boundaryPoints[0]).toEqual({ x: 0, y: -1 });
  });

  it('does nothing without a pick, or with one belonging to another plate', () => {
    const harness = createHarness();
    const dispatch = (action) => harness.dispatched.push(action);
    const editorDispatch = (action) => harness.editorActions.push(action);
    const pick = { slabId: 'slab_other', edgeIndex: 0, support: null, distanceMm: 600 };

    expect(applyCantilever({ slab: harness.slab, floorId: 'floor_first', pick: null, dispatch, editorDispatch })).toBe(
      false,
    );
    expect(
      applyCantilever({ slab: harness.slab, floorId: 'floor_first', pick, distanceMm: 600, dispatch, editorDispatch }),
    ).toBe(false);
    expect(
      applyCantilever({
        slab: harness.slab,
        floorId: 'floor_first',
        pick: { ...pick, slabId: 'slab_upper' },
        distanceMm: Number.NaN,
        dispatch,
        editorDispatch,
      }),
    ).toBe(false);
    expect(harness.dispatched).toHaveLength(0);
  });
});

/* ── Taking one back ──────────────────────────────────────────────────────
 *
 * A cantilever cannot be deleted, only un-drawn: the edge that projects gets
 * pulled back until the measurement that reported the overhang stops finding
 * one. So every test here ends by MEASURING AGAIN — the claim is not that the
 * offset arithmetic is right, it is that computeFloorOverhangs no longer
 * reports the run.
 */
describe('removeCantilever', () => {
  function rectangle(x, y, width, depth) {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + depth },
      { x, y: y + depth },
    ];
  }

  /** 5 m square below; the plate above it reaches 600 mm past its far edge. */
  const BELOW = [rectangle(0, 0, 5000, 5000)];
  const PROJECTING_PLATE = rectangle(0, 0, 5000, 5600);

  function measuredRuns(boundaryPoints = PROJECTING_PLATE, below = BELOW) {
    return computeSlabOverhang({ id: 'slab_upper', boundaryPoints }, below).overhangEdges;
  }

  /** The long run along the edge that actually projects, not a corner tail. */
  function projectingRun(runs) {
    return runs.reduce((longest, run) => (run.lengthMm > longest.lengthMm ? run : longest), runs[0]);
  }

  function createRemovalHarness(boundaryPoints = PROJECTING_PLATE) {
    const floor = { ...createFloor('First', 1, { elevation: 3000 }), id: 'floor_first' };
    const slab = { ...createSlab(floor.id, boundaryPoints, 200, 3000), id: 'slab_upper' };
    const dispatched = [];
    const editorActions = [];

    return {
      slab,
      dispatched,
      editorActions,
      remove: (run, below = BELOW) =>
        removeCantilever({
          slab,
          floorId: floor.id,
          run,
          belowPolygons: below,
          dispatch: (action) => dispatched.push(action),
          editorDispatch: (action) => editorActions.push(action),
        }),
      statusMessages: () => editorActions.filter((a) => a.type === 'SET_STATUS_MESSAGE').map((a) => a.message),
    };
  }

  it('lands the projecting edge flush on the footprint below', () => {
    const harness = createRemovalHarness();

    expect(harness.remove(projectingRun(measuredRuns()))).toBe(true);
    expect(harness.dispatched[0].slab.boundaryPoints).toEqual(rectangle(0, 0, 5000, 5000));
  });

  it('leaves nothing for computeFloorOverhangs to report', () => {
    // The whole point, checked the only way that counts: rebuild the project
    // around the committed boundary and measure the stack again.
    const harness = createRemovalHarness();
    harness.remove(projectingRun(measuredRuns()));

    const project = {
      floors: [
        {
          id: 'ground',
          levelIndex: 0,
          elevation: 0,
          slabs: [{ id: 'slab_lower', boundaryPoints: BELOW[0], thickness: 200 }],
        },
        {
          id: 'first',
          levelIndex: 1,
          elevation: 3000,
          slabs: [{ id: 'slab_upper', boundaryPoints: harness.dispatched[0].slab.boundaryPoints, thickness: 200 }],
        },
      ],
    };

    expect(computeFloorOverhangs(project)).toEqual([]);
  });

  it('commits one plate edit, keeps the plate selected, and reports last', () => {
    const harness = createRemovalHarness();
    harness.remove(projectingRun(measuredRuns()));

    // One SLAB_UPDATE: one undo step for one act.
    expect(harness.dispatched.filter((action) => action.type === 'SLAB_UPDATE')).toHaveLength(1);
    expect(harness.editorActions.map((action) => action.type)).toEqual(['SELECT_OBJECT', 'SET_STATUS_MESSAGE']);
    // The reselect is what drops the sub-selection, and it wipes the status
    // line — so the report of what happened has to come after it.
    expect(harness.editorActions[0]).toEqual({ type: 'SELECT_OBJECT', id: 'slab_upper', objectType: 'slab' });
    expect(harness.statusMessages()).toEqual(['Cantilever removed — edge pulled back 600 mm.']);
  });

  it('refuses a corner tail, which its own edge can never pull back', () => {
    // The short run at the corner of a projecting bay hangs over nothing
    // because of the edge NEXT to it. Retracting its own edge only makes the
    // plate narrower — forever — so this must be caught, not attempted.
    const tail = measuredRuns().find((run) => run.boundaryEdgeIndex === 1);
    const harness = createRemovalHarness();

    expect(harness.remove(tail)).toBe(false);
    expect(harness.dispatched).toHaveLength(0);
    expect(harness.statusMessages()).toEqual([
      'This run hangs out because of the edge beside it — pull that edge back instead.',
    ]);
  });

  it('takes back the measured overhang and no more when flush would cost supported plate', () => {
    // A footprint below whose edge is not parallel to the plate's: landing the
    // whole edge flush would mean travelling 2600 at the far end — more than
    // any overhang that was measured, most of it supported plate. The travel
    // is capped at the measured depth plus the clearance; the sliver still
    // hanging at the far end re-measures as its own smaller run, in the open,
    // rather than being chased at the plate's expense.
    const slanted = [
      [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 3000 },
        { x: 0, y: 5000 },
      ],
    ];
    const run = projectingRun(measuredRuns(PROJECTING_PLATE, slanted));
    const retraction = cantileverRetraction(PROJECTING_PLATE, run, slanted);

    expect(overhangRunRetractionMm(run, PROJECTING_PLATE, slanted)).toBeCloseTo(2600, 6);
    expect(retraction.ok).toBe(true);
    expect(retraction.distanceMm).toBeCloseTo(run.depthMm + CANTILEVER_RETRACTION_CLEARANCE_MM, 6);
    const remaining = measuredRuns(retraction.boundaryPoints, slanted).filter((left) => left.boundaryEdgeIndex === 2);
    expect(remaining.length).toBeGreaterThan(0);
    for (const left of remaining) expect(left.depthMm).toBeLessThan(run.depthMm / 2);
  });

  it('does not amputate the plate when the footprint below is L-shaped', () => {
    // The storey below spans the plate's full width except a 2000-wide bay
    // recessed to y=2500 — an L. The plate reaches 600 past the wings. Along
    // the recess the edge's own normal meets nothing until 3100 in — over half
    // the plate — and following that measurement is exactly how "remove the
    // cantilever" once took half a slab. Under the cap the edge comes back by
    // the overhang that was measured; the stretch over the recess re-measures
    // as a smaller cantilever of its own.
    const lShaped = [
      [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 5000 },
        { x: 3500, y: 5000 },
        { x: 3500, y: 2500 },
        { x: 1500, y: 2500 },
        { x: 1500, y: 5000 },
        { x: 0, y: 5000 },
      ],
    ];
    const run = projectingRun(measuredRuns(PROJECTING_PLATE, lShaped));
    const retraction = cantileverRetraction(PROJECTING_PLATE, run, lShaped);

    expect(overhangRunRetractionMm(run, PROJECTING_PLATE, lShaped)).toBeCloseTo(3100, 6);
    expect(retraction.ok).toBe(true);
    expect(retraction.distanceMm).toBeCloseTo(run.depthMm + CANTILEVER_RETRACTION_CLEARANCE_MM, 6);
    expect(retraction.distanceMm).toBeLessThan(1500);

    // The wings land covered; only the stretch over the recess still hangs,
    // and by less than it did.
    const remaining = measuredRuns(retraction.boundaryPoints, lShaped).filter((left) => left.boundaryEdgeIndex === 2);
    expect(remaining.length).toBeGreaterThan(0);
    for (const left of remaining) {
      expect(Math.min(left.start.x, left.end.x)).toBeGreaterThan(1300);
      expect(Math.max(left.start.x, left.end.x)).toBeLessThan(3700);
      expect(left.depthMm).toBeLessThan(run.depthMm);
    }
  });

  it('refuses to fold the plate through itself', () => {
    // A plate with a notch cut up into it: pulling its top edge back onto the
    // footprint below crosses the notch's sides.
    const harness = createRemovalHarness(NOTCHED_PLATE);
    const below = [rectangle(0, 3100, 6000, 3000)];
    const run = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, depthMm: 3100, boundaryEdgeIndex: 0 };

    expect(harness.remove(run, below)).toBe(false);
    expect(harness.dispatched).toHaveLength(0);
    expect(harness.statusMessages()).toEqual([
      'Pulling that edge back 3100 mm folds this plate through itself — reshape it first.',
    ]);
  });

  it('refuses when there would be no plate left behind the edge', () => {
    // 4200 back on a 4000-deep plate: the edge comes out the far side and the
    // ring turns inside out — a simple polygon, and not a floor.
    const harness = createRemovalHarness(PLATE);

    expect(harness.remove({ boundaryEdgeIndex: 2, depthMm: 4200 }, [])).toBe(false);
    expect(harness.dispatched).toHaveLength(0);
    expect(harness.statusMessages()).toEqual(['Pulling that edge back 4225 mm would leave no plate behind it.']);
  });

  it('has nothing to do without a run, or with one that names no edge', () => {
    const harness = createRemovalHarness();

    expect(harness.remove(null)).toBe(false);
    expect(harness.remove({ depthMm: 600 })).toBe(false);
    expect(harness.remove({ boundaryEdgeIndex: 2, depthMm: 0 })).toBe(false);
    expect(harness.dispatched).toHaveLength(0);
    expect(new Set(harness.statusMessages())).toEqual(new Set(['That overhang has no slab edge left to pull back.']));
  });

  it('falls back to depth plus clearance when there is no footprint to check against', () => {
    // Nothing to re-measure with, so the retraction claims only what it can:
    // the measured depth and the clearance that keeps it under the reporting
    // threshold.
    const retraction = cantileverRetraction(PROJECTING_PLATE, { boundaryEdgeIndex: 2, depthMm: 600 }, []);

    expect(retraction).toMatchObject({ ok: true, distanceMm: 625 });
    expect(retraction.boundaryPoints).toEqual(rectangle(0, 0, 5000, 4975));
  });
});

/* ── Projecting bay ────────────────────────────────────────────────────────
 *
 * Edge 0 of PLATE runs (0,0) -> (6000,0) with an outward normal of (0,-1), so
 * every bay below grows up the page out of the top edge.
 */
describe('projectingBayBoundary', () => {
  it('inserts the four vertices of a protrusion centred on the click', () => {
    const bay = projectingBayBoundary(PLATE, 0, { alongMm: 3000, widthMm: 2400, projectionMm: 600 });

    expect(bay.boundaryPoints).toEqual([
      { x: 0, y: 0 },
      { x: 1800, y: 0 },
      { x: 1800, y: -600 },
      { x: 4200, y: -600 },
      { x: 4200, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
  });

  it('hands back the three edges the protrusion added, in ring order', () => {
    const bay = projectingBayBoundary(PLATE, 0, { alongMm: 3000, widthMm: 2400, projectionMm: 600 });

    expect(bay.edges).toEqual([
      { start: { x: 1800, y: 0 }, end: { x: 1800, y: -600 } },
      { start: { x: 1800, y: -600 }, end: { x: 4200, y: -600 } },
      { start: { x: 4200, y: -600 }, end: { x: 4200, y: 0 } },
    ]);
  });

  it('clamps a bay that would hang off the end of its edge back onto it', () => {
    const bay = projectingBayBoundary(PLATE, 0, { alongMm: 200, widthMm: 2400, projectionMm: 600 });

    // Centred at 200 the bay would start at -1000; it sits against the corner.
    expect(bay.edges[0].start).toEqual({ x: 0, y: 0 });
    expect(bay.edges[2].end).toEqual({ x: 2400, y: 0 });
  });

  it('degenerates to a cantilever of the whole edge when it is as wide as it', () => {
    const bay = projectingBayBoundary(PLATE, 0, { alongMm: 3000, widthMm: 99_000, projectionMm: 600 });

    // Both shoulders are gone: no vertex is duplicated on top of a corner.
    expect(bay.boundaryPoints).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: -600 },
      { x: 6000, y: -600 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
  });

  it('refuses an edge with no outward direction or no reach', () => {
    expect(projectingBayBoundary([{ x: 0, y: 0 }], 0, { alongMm: 0, widthMm: 2400, projectionMm: 600 })).toBeNull();
    expect(projectingBayBoundary(PLATE, 0, { alongMm: 3000, widthMm: 2400, projectionMm: 0 })).toBeNull();
    expect(projectingBayBoundary(PLATE, 0, { alongMm: 3000, widthMm: 0, projectionMm: 600 })).toBeNull();
  });
});

describe('projectingBayWalls', () => {
  const edges = projectingBayBoundary(PLATE, 0, { alongMm: 3000, widthMm: 2400, projectionMm: 600 }).edges;

  it('builds one wall per new edge, on the edge, with no offset of its own', () => {
    const walls = projectingBayWalls(edges, { walls: [] });

    expect(walls).toHaveLength(3);
    walls.forEach((wall, index) => {
      expect(wall.start).toEqual(edges[index].start);
      expect(wall.end).toEqual(edges[index].end);
      expect(wall.outboardOffset).toBe(0);
    });
  });

  it('gives all three one fresh stack id — a bay is one facade', () => {
    const walls = projectingBayWalls(edges, { walls: [] });
    const stackIds = new Set(walls.map((wall) => wall.stackId));

    expect(stackIds.size).toBe(1);
    expect([...stackIds][0]).toMatch(/^wallstack_/);
    // A second bay is a second facade.
    expect(projectingBayWalls(edges, { walls: [] })[0].stackId).not.toBe(walls[0].stackId);
  });

  it('is built the way the nearest wall on the floor is built', () => {
    const near = createWall({ x: 0, y: -2000 }, { x: 6000, y: -2000 }, undefined, {
      assembly: { preset: 'plywood' },
    });
    const far = createWall({ x: 0, y: 40_000 }, { x: 6000, y: 40_000 }, 400);

    const walls = projectingBayWalls(edges, { walls: [far, near] });

    expect(walls.every((wall) => wall.assembly.preset === 'plywood')).toBe(true);
    expect(walls.every((wall) => wall.thickness === near.thickness)).toBe(true);
  });

  it('takes the defaults when the floor has no wall to copy', () => {
    const walls = projectingBayWalls(edges, { walls: [] });
    expect(walls[0].assembly.preset).toBe('chb');
  });

  // A bay reads as one hung box. Its walls run past the plate they grow from
  // so the deck ends up behind the facade instead of drawing a line across it.
  it('runs all three past the plate rather than standing them on it', () => {
    const walls = projectingBayWalls(edges, { walls: [] });

    expect(walls.every((wall) => wall.framingMode === 'bypass')).toBe(true);
  });
});

describe('applyProjectingBay', () => {
  function bayHarness(overrides = {}) {
    return createHarness({ mode: 'bay', ...overrides });
  }

  it('commits the boundary and the three walls in ONE action', () => {
    const harness = bayHarness();
    harness.click(ON_TOP_EDGE);
    harness.key('Enter');

    expect(harness.dispatched).toHaveLength(1);
    const [action] = harness.dispatched;
    expect(action.type).toBe('SLAB_PROJECT_BAY');
    expect(action.slabId).toBe('slab_upper');
    expect(action.boundaryPoints).toHaveLength(8);
    expect(action.walls).toHaveLength(3);
  });

  it('leaves the plate standing and says why when the bay folds it', () => {
    // Out of the keyhole's floor, through its throat and clean past the plate
    // on either side of the mouth: a plate folded through itself is not a floor.
    const harness = bayHarness({ boundaryPoints: KEYHOLE_PLATE });

    const committed = applyProjectingBay({
      slab: harness.slab,
      floor: harness.floor,
      floorId: harness.floor.id,
      pick: { kind: 'bay', slabId: harness.slab.id, edgeIndex: 2, alongMm: 1000 },
      projectionMm: 3000,
      widthMm: 1000,
      dispatch: (action) => harness.dispatched.push(action),
      editorDispatch: (action) => harness.editorActions.push(action),
    });

    expect(committed).toBe(false);
    expect(harness.dispatched).toHaveLength(0);
    expect(harness.statusMessages().at(-1)).toContain('folds this plate through itself');
  });

  it('does nothing for a pick that belongs to another plate', () => {
    const harness = bayHarness();
    const committed = applyProjectingBay({
      slab: harness.slab,
      floor: harness.floor,
      floorId: harness.floor.id,
      pick: { kind: 'bay', slabId: 'slab_elsewhere', edgeIndex: 0, alongMm: 3000 },
      projectionMm: 600,
      widthMm: 2400,
      dispatch: (action) => harness.dispatched.push(action),
      editorDispatch: (action) => harness.editorActions.push(action),
    });

    expect(committed).toBe(false);
    expect(harness.dispatched).toHaveLength(0);
  });
});

describe('the cantilever tool in bay mode', () => {
  it('remembers where along the edge the click landed', () => {
    const harness = createHarness({ mode: 'bay' });
    harness.click({ x: 1500, y: 40 });

    expect(harness.getToolState().cantileverPick).toMatchObject({
      kind: 'bay',
      edgeIndex: 0,
      alongMm: 1500,
      distanceMm: 600,
      widthMm: 2400,
      // A bay is measured from the edge it grows out of, never from the storey
      // below, so no support line is looked for.
      support: null,
    });
  });

  it('keeps the mode when Escape gives the edge back', () => {
    const harness = createHarness({ mode: 'bay' });
    harness.click(ON_TOP_EDGE);
    harness.key('Escape');

    expect(harness.getToolState().cantileverPick).toBeNull();
    expect(harness.getToolState().cantileverMode).toBe('bay');
  });
});
