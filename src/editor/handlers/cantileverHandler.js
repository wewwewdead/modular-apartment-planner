import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import { TOOLS } from '@/editor/tools';
import { MIN_REPORTED_OVERHANG_MM, overhangRunRetractionMm } from '@/geometry/floorOverhang';
import { distanceToSegment } from '@/geometry/line';
import { distance } from '@/geometry/point';
import { polygonSelfIntersects, signedPolygonArea } from '@/geometry/polygon';
import { offsetSlabEdge, slabEdgeOutwardNormal } from '@/geometry/slabGeometry';
import { findParallelSupportLine } from './referenceSnap';

/**
 * Cantilevering a plate by the numbers.
 *
 * Dragging a slab edge outward already works, and it is the right gesture when
 * you are still deciding. It is the wrong one when the answer is known: "600
 * past the beam" is a decision, and hunting for it with a cursor is a way of
 * approximating a number you already have.
 *
 * So this tool asks for the two things that actually specify a cantilever —
 * which side, and how far — and takes them one at a time. The edge is picked on
 * the plan, because a side is a thing you point at. The distance is typed in the
 * panel, because a dimension is a thing you write down. Nothing is committed
 * until Apply: one SLAB_UPDATE, one undo step.
 *
 * The distance is measured FROM THE SUPPORT LINE BELOW wherever one exists — see
 * `findParallelSupportLine`. That is what makes the number mean what a drawing
 * would mean by it. With nothing below to measure from it falls back to the
 * edge's current position and the panel says so, rather than quietly changing
 * what the number means.
 */

/** What a cantilever is if you do not say otherwise. */
export const CANTILEVER_DEFAULT_DISTANCE_MM = 600;

/**
 * A cantilever reaches OUT. Pulling an edge in is a different operation with a
 * different gesture (drag it), so the distance is floored rather than allowed to
 * go negative and quietly become a setback.
 */
export const CANTILEVER_MIN_DISTANCE_MM = 1;

const EMPTY_CANTILEVER_STATE = Object.freeze({ cantileverHoverEdge: null, cantileverPick: null });

export function resetCantileverToolState(editorDispatch) {
  editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { ...EMPTY_CANTILEVER_STATE } });
}

/** What the typed distance is measured from, in the words the panel uses. */
export function describeCantileverBasis(support) {
  if (support?.kind === 'wall') return 'from wall line below';
  if (support?.kind === 'beam') return 'from beam below';
  return 'from current edge';
}

/**
 * How far the edge actually travels to land `distanceMm` outside its basis.
 *
 * `support.offsetMm` is signed along the outward normal, so this is one formula
 * for both cases: a beam 400 inside the edge (-400) with a 600 reach moves the
 * edge out 200; a wall line 250 outside it (+250) moves it out 850. Either way
 * the edge finishes exactly `distanceMm` beyond the support line. With no
 * support line the basis is the edge itself and the travel is the reach.
 */
export function cantileverAppliedOffset(support, distanceMm) {
  return (support ? support.offsetMm : 0) + distanceMm;
}

/** The boundary a cantilever would produce, or null when the edge cannot move. */
export function cantileverBoundary(boundaryPoints, edgeIndex, support, distanceMm) {
  if (!Number.isFinite(distanceMm)) return null;
  return offsetSlabEdge(boundaryPoints || [], edgeIndex, cantileverAppliedOffset(support, distanceMm));
}

/** Nearest edge of the ring within reach of the cursor, by index, or null. */
function findEdgeAtPoint(boundaryPoints, point, tolerance) {
  const count = boundaryPoints.length;
  if (count < 3) return null;

  let bestIndex = null;
  let bestDistance = Infinity;
  for (let index = 0; index < count; index += 1) {
    const gap = distanceToSegment(point, boundaryPoints[index], boundaryPoints[(index + 1) % count]);
    if (gap > tolerance || gap >= bestDistance) continue;
    bestIndex = index;
    bestDistance = gap;
  }
  return bestIndex;
}

/**
 * Commit the cantilever the panel is holding. Called by the Apply button and by
 * Enter in the distance field, which are the same act.
 *
 * A refusal leaves EVERYTHING standing — the pick, the distance, the tool — and
 * says why on the status line, because the fix is to change the number, and
 * that is only possible if the field is still there to change it in.
 *
 * @returns {boolean} whether the plate was updated
 */
export function applyCantilever({ slab, floorId, pick, distanceMm, dispatch, editorDispatch }) {
  if (!slab || !pick || pick.slabId !== slab.id) return false;

  const requested = Number(distanceMm);
  if (!Number.isFinite(requested)) return false;
  const reach = Math.max(CANTILEVER_MIN_DISTANCE_MM, requested);

  const boundaryPoints = cantileverBoundary(slab.boundaryPoints, pick.edgeIndex, pick.support, reach);
  if (!boundaryPoints) {
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: 'That edge has no outward direction to project from.',
    });
    return false;
  }

  // A plate folded through itself is not a floor. Same rule the edge drag
  // enforces frame by frame — it just has somewhere to say so here.
  if (polygonSelfIntersects(boundaryPoints)) {
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: `A ${Math.round(reach)} mm cantilever folds this plate through itself — try a shorter reach or another edge.`,
    });
    return false;
  }

  dispatch({ type: 'SLAB_UPDATE', floorId, slab: { id: slab.id, boundaryPoints } });

  resetCantileverToolState(editorDispatch);
  // SET_TOOL drops the selection along with the tool, so the plate has to be
  // put back — you are meant to land on it, look at what you just made, and
  // keep going. Both SET_TOOL and the reselect wipe the status line, so the
  // report of what happened is said last.
  editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
  editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
  editorDispatch({
    type: 'SET_STATUS_MESSAGE',
    message: `Cantilever applied — ${Math.round(reach)} mm ${describeCantileverBasis(pick.support)}.`,
  });

  return true;
}

/* ── Taking a cantilever back ────────────────────────────────────────────
 *
 * A cantilever is not an object, so it cannot be deleted like one. What exists
 * is a slab edge drawn past the storey below; removing the cantilever means
 * pulling that edge back until it lands on the footprint underneath, and the
 * overhang stops being measurable because it is no longer there.
 *
 * The whole boundary edge retracts, not just the stretch that was hanging: a
 * boundary edge is a straight line between two corners, and retracting part of
 * one would mean inventing two corners the plate never had. So a run that
 * covers only part of its edge takes the rest of the edge back with it — the
 * same thing dragging that edge in by hand would do.
 */

/**
 * How much further in than measured the edge goes when nobody can check.
 *
 * With the footprint below in hand the travel is measured exactly and this is
 * not used at all. Without it, all there is to go on is the run's own depth —
 * which is sampled every 100 mm, and a distance field is 1-Lipschitz along the
 * edge, so the deepest point BETWEEN two samples can be up to 50 mm deeper than
 * the deepest sample. That is exactly the depth at which an overhang starts
 * being reported again, so the fallback goes half of it further in and caps the
 * residue under the threshold.
 */
export const CANTILEVER_RETRACTION_CLEARANCE_MM = MIN_REPORTED_OVERHANG_MM / 2;

/** Two vertices closer than this are the same corner. */
const COINCIDENT_VERTEX_MM = 1;

function distinctVertexCount(points = []) {
  const kept = [];
  for (const point of points) {
    if (kept.some((entry) => distance(entry, point) <= COINCIDENT_VERTEX_MM)) continue;
    kept.push(point);
  }
  return kept.length;
}

/**
 * Has the plate stopped being a plate?
 *
 * Two ways to lose one by pulling an edge in: run it into its neighbours until
 * there are no longer three separate corners, or run it clean past the far side
 * so the ring turns inside out. The second is not a self-intersection — pull the
 * top edge of a rectangle down below its bottom edge and what is left is a
 * perfectly simple rectangle, wound the other way — so it has to be caught by
 * the winding rather than by the crossing test.
 */
function retractionCollapses(before = [], after = []) {
  if (distinctVertexCount(after) < 3) return true;
  const areaAfter = signedPolygonArea(after);
  if (!(Math.abs(areaAfter) > 0)) return true;
  return Math.sign(areaAfter) !== Math.sign(signedPolygonArea(before));
}

/**
 * The boundary left by pulling this overhanging run back onto the storey below.
 *
 * The travel is MEASURED against the same footprint the overhang was measured
 * against — `overhangRunRetractionMm` — rather than taken from the run's depth.
 * They are the same number on an ordinary rectangular plate and different
 * whenever the support line below is not parallel to the edge, and in that case
 * the depth always understates the travel: it is the distance to the nearest
 * thing below in whatever direction that thing lies, and an edge can only move
 * along its own normal.
 *
 * The travel is CAPPED at the run's measured depth (plus the clearance).
 * Removing a cantilever means taking back the offset that made it, not chasing
 * full coverage: against an L-shaped or sharply skewed footprint the measured
 * travel is the distance to whatever the normal happens to hit — a notch, a
 * recessed wing — and following it amputates supported plate ("remove the
 * cantilever" once took half a slab this way). Under the cap the edge comes
 * back by at most the overhang that was measured; anything still hanging past
 * a recess after that re-measures honestly as a smaller cantilever, visible
 * and removable on its own.
 *
 * Measuring it also detects the runs that no retraction of THIS edge can clear.
 * The short tail at the corner of a projecting bay hangs over nothing because of
 * the edge next to it; pulling its own edge in just narrows the plate, forever.
 *
 * @param {Array<{x: number, y: number}>} boundaryPoints
 * @param {{boundaryEdgeIndex: number, depthMm: number}} run one entry of an
 *   overhang's `overhangEdges`, as measured by `computeFloorOverhangs`
 * @param {Array<Array<{x: number, y: number}>>} [belowPolygons] the footprint
 *   the run was measured against. Without it the retraction falls back to the
 *   measured depth plus the clearance, and nothing checks it.
 * @returns {{ok: true, boundaryPoints: Array<{x: number, y: number}>,
 *   distanceMm: number, depthMm: number, edgeIndex: number}
 *   | {ok: false, reason: 'no-edge' | 'unclearable'}}
 */
export function cantileverRetraction(boundaryPoints, run, belowPolygons = []) {
  const edgeIndex = run?.boundaryEdgeIndex;
  const depthMm = Number(run?.depthMm);
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0) return { ok: false, reason: 'no-edge' };
  if (!Number.isFinite(depthMm) || depthMm <= 0) return { ok: false, reason: 'no-edge' };

  const polygons = (belowPolygons || []).filter((polygon) => (polygon || []).length >= 3);
  let distanceMm = depthMm + CANTILEVER_RETRACTION_CLEARANCE_MM;

  if (polygons.length) {
    const travelMm = overhangRunRetractionMm(run, boundaryPoints || [], polygons);
    if (!(travelMm > 0)) return { ok: false, reason: 'unclearable' };
    distanceMm = Math.min(travelMm, depthMm + CANTILEVER_RETRACTION_CLEARANCE_MM);
  }

  const retracted = offsetSlabEdge(boundaryPoints || [], edgeIndex, -distanceMm);
  if (!retracted) return { ok: false, reason: 'no-edge' };

  return { ok: true, boundaryPoints: retracted, distanceMm, depthMm, edgeIndex };
}

/**
 * Pull one overhanging run back onto the storey below.
 *
 * A refusal changes nothing at all — the plate, the selection and the run are
 * all still there to try something else with, and the reason is said on the
 * status line. A success commits ONE `SLAB_UPDATE`, so it is one undo step, and
 * leaves the plate selected: you are meant to look at what you just took away.
 *
 * @returns {boolean} whether the plate was updated
 */
export function removeCantilever({ slab, floorId, run, belowPolygons = [], dispatch, editorDispatch }) {
  if (!slab || !run) return false;

  const retraction = cantileverRetraction(slab.boundaryPoints, run, belowPolygons);
  if (!retraction.ok) {
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message:
        retraction.reason === 'unclearable'
          ? 'This run hangs out because of the edge beside it — pull that edge back instead.'
          : 'That overhang has no slab edge left to pull back.',
    });
    return false;
  }

  const reach = Math.round(retraction.distanceMm);
  const { boundaryPoints } = retraction;

  // Same rule the edge drag enforces frame by frame — it just has somewhere to
  // say so here.
  if (polygonSelfIntersects(boundaryPoints)) {
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: `Pulling that edge back ${reach} mm folds this plate through itself — reshape it first.`,
    });
    return false;
  }

  if (retractionCollapses(slab.boundaryPoints || [], boundaryPoints)) {
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: `Pulling that edge back ${reach} mm would leave no plate behind it.`,
    });
    return false;
  }

  dispatch({ type: 'SLAB_UPDATE', floorId, slab: { id: slab.id, boundaryPoints } });

  // The plate stays selected, and the run that no longer exists does not: the
  // reselect is what drops the sub-selection. Both it and SET_TOOL wipe the
  // status line, so the report of what happened is said last.
  editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
  editorDispatch({
    type: 'SET_STATUS_MESSAGE',
    message: `Cantilever removed — edge pulled back ${reach} mm.`,
  });

  return true;
}

export function createCantileverHandler({
  dispatch,
  editorDispatch,
  getFloor,
  activeFloorId,
  viewport,
  selectedId,
  selectedType,
  floorBelow = null,
}) {
  const hitTolerance = () => SNAP_DISTANCE_PX / Math.max(viewport.zoom, 0.001);

  function targetSlab() {
    if (selectedType !== 'slab' || !selectedId) return null;
    const floor = getFloor(activeFloorId);
    return (floor?.slabs || []).find((slab) => slab.id === selectedId) || null;
  }

  /**
   * The whole flow hangs off ONE selected plate. Lose it — deselected, deleted,
   * or a floor change that took the selection with it — and there is nothing
   * left to cantilever, so the tool stands down instead of waiting for clicks it
   * could not answer.
   */
  function standDown() {
    resetCantileverToolState(editorDispatch);
    editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
  }

  function returnToSelect(slab) {
    resetCantileverToolState(editorDispatch);
    editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
    if (slab) editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
  }

  return {
    onMouseMove(modelPos, e, toolState = {}) {
      const slab = targetSlab();
      if (!slab) {
        standDown();
        return;
      }
      // Once a side is picked the panel is driving. Re-highlighting edges under
      // a cursor that is on its way to the distance field would say the pick is
      // still up for grabs, and it is not — Escape takes it back.
      if (toolState.cantileverPick) return;

      const edgeIndex = findEdgeAtPoint(slab.boundaryPoints || [], modelPos, hitTolerance());
      if ((toolState.cantileverHoverEdge ?? null) === edgeIndex) return;
      editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { cantileverHoverEdge: edgeIndex } });
    },

    onMouseDown(modelPos, e, toolState = {}) {
      if (e?.button !== 0) return;

      const slab = targetSlab();
      if (!slab) {
        standDown();
        return;
      }
      if (toolState.cantileverPick) return;

      const boundaryPoints = slab.boundaryPoints || [];
      const edgeIndex = findEdgeAtPoint(boundaryPoints, modelPos, hitTolerance());
      if (edgeIndex === null) {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'Click an edge of the slab to cantilever that side.',
        });
        return;
      }

      const normal = slabEdgeOutwardNormal(boundaryPoints, edgeIndex);
      if (!normal) {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'That edge has no outward direction to project from.',
        });
        return;
      }

      const support = findParallelSupportLine(
        { start: boundaryPoints[edgeIndex], end: boundaryPoints[(edgeIndex + 1) % boundaryPoints.length] },
        normal,
        floorBelow,
      );

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          cantileverHoverEdge: edgeIndex,
          cantileverPick: {
            slabId: slab.id,
            edgeIndex,
            support,
            defaultDistanceMm: CANTILEVER_DEFAULT_DISTANCE_MM,
            distanceMm: CANTILEVER_DEFAULT_DISTANCE_MM,
          },
        },
      });
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: `Edge picked — set the reach ${describeCantileverBasis(support)} in the panel, then Enter to apply.`,
      });
    },

    onMouseUp() {},

    onKeyDown(e, toolState = {}) {
      const pick = toolState.cantileverPick || null;

      // The panel's Apply button and Enter in its distance field are the same
      // act; so is Enter with the canvas focused, which is where the pointer
      // already is when the edge has just been clicked.
      if (e.key === 'Enter' && pick) {
        applyCantilever({
          slab: targetSlab(),
          floorId: activeFloorId,
          pick,
          distanceMm: pick.distanceMm ?? pick.defaultDistanceMm ?? CANTILEVER_DEFAULT_DISTANCE_MM,
          dispatch,
          editorDispatch,
        });
        return;
      }

      if (e.key !== 'Escape') return;

      // One step at a time: the first Escape gives the side back, the second
      // leaves. Dropping straight out of a mis-picked edge would throw away the
      // distance typed against it as well.
      if (pick) {
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { ...EMPTY_CANTILEVER_STATE } });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Pick the slab edge to cantilever.' });
        return;
      }

      returnToSelect(targetSlab());
    },

    getCursor(toolState) {
      return toolState?.cantileverPick ? 'default' : 'crosshair';
    },
  };
}
