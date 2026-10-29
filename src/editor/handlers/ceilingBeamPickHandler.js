import { MIN_CANTILEVER_CEILING_AREA_MM2 } from '@/domain/cantileverCeiling';
import {
  deriveCeilingBoundaryFromBeams,
  isCeilingSupportBeam,
  resolveCeilingSupportBeams,
} from '@/domain/ceilingBeamAttachment';
import { CEILING_ATTACHMENT_MODES, CEILING_BOUNDARY_SOURCES, createCeilingForProject } from '@/domain/ceilingModels';
import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import { TOOLS } from '@/editor/tools';
import { polygonArea } from '@/geometry/polygon';
import { intersectPolygons } from '@/geometry/polygonBoolean';
import { findBeamSupportAtPoint } from '@/truss/beamSupports';

function resetPickState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      ceilingPickBeamIds: [],
      ceilingPickHoverBeamId: null,
    },
  });
}

function plural(count) {
  return count === 1 ? '' : 's';
}

// What is still needed, said while the selection is open. The count is the only
// thing that changes between clicks, so the keys stay on screen rather than
// being announced once and forgotten.
function describePicking(beamIds) {
  if (!beamIds.length) return 'Click the beams the ceiling should hang from, then press Enter.';
  return `${beamIds.length} beam${plural(beamIds.length)} selected — Enter to create the ceiling, Esc to cancel.`;
}

/**
 * What the ceiling actually ended up hanging from. The picked beams are a
 * request, not a result: a beam deleted between the pick and the commit resolves
 * to nothing at all, and the domain hands back a manual datum instead — so the
 * message reports the mode that came back rather than the one asked for. What a
 * pick can NO LONGER fall back over is enclosing too little to draw: one beam,
 * or a set collapsed onto one line, still carries a ceiling perfectly well and
 * only leaves the boundary to be found elsewhere.
 *
 * A floor name means the pick was anchored on a plate rather than made on the
 * storey being edited, and then WHICH storey it landed on is the one thing the
 * message cannot leave out: the ceiling is not on the floor the user is looking
 * at, and it is filed under that other floor in the sidebar. `clipped` is the
 * difference between a ceiling that stops where the plate stops and one that
 * fills the bay, which is the whole point of the anchored flow.
 */
function describeCommit(ceiling, pickedCount, { floorName = null, clipped = false } = {}) {
  const elevation = Math.round(ceiling.baseElevation);
  if (ceiling.attachment?.mode !== CEILING_ATTACHMENT_MODES.BEAM) {
    const subject = pickedCount === 1 ? 'The beam picked is' : `The ${pickedCount} beams picked are`;
    return `${subject} no longer on this floor — ceiling added on a manual datum at ${elevation} mm.`;
  }
  const beamCount = ceiling.attachment.beamIds.length;
  const beams = `${beamCount} beam${plural(beamCount)}`;
  if (!floorName) return `Ceiling added — hangs from ${beams} at ${elevation} mm.`;
  return clipped
    ? `Ceiling added to ${floorName} — covers the plate inside ${beams}, hangs at ${elevation} mm.`
    : `Ceiling added to ${floorName} — hangs from ${beams} at ${elevation} mm.`;
}

/**
 * The plate the anchored pick was started from, wherever it is filed. It is on
 * the storey ABOVE the floor being picked on — a floor's slabs are the deck it
 * stands on — so the search runs the whole stack rather than one floor.
 */
function findSlabRing(project, slabId) {
  if (!slabId) return null;
  for (const floor of project?.floors || []) {
    const slab = (floor.slabs || []).find((entry) => entry.id === slabId);
    if (!slab) continue;
    const ring = (slab.boundaryPoints || []).map((point) => ({ x: point.x, y: point.y }));
    return ring.length >= 3 ? ring : null;
  }
  return null;
}

/**
 * The bay trimmed to the plate overhead: what the picked beams frame AND the
 * slab actually covers. Slivers go the way the cantilever planner sends them —
 * a bay and a plate agreeing along an edge come out of the boolean micrometres
 * wide, and a ceiling of one is a row in the list nobody can find or delete.
 */
function clipBayToSlab(bay, ring) {
  return intersectPolygons(bay, ring)
    .map((region) => region.outline)
    .filter((outline) => outline.length >= 3 && polygonArea(outline) >= MIN_CANTILEVER_CEILING_AREA_MM2)
    .sort((first, second) => polygonArea(second) - polygonArea(first));
}

export function createCeilingBeamPickHandler({
  dispatch,
  editorDispatch,
  getProject,
  getFloor,
  activeFloorId,
  viewport,
  activePhaseId,
}) {
  const hitTolerance = () => SNAP_DISTANCE_PX / Math.max(viewport.zoom, 0.001);

  /**
   * `toolState.ceilingTargetFloorId` is the anchored flow's override, exactly as
   * it is for the draw tool: the beams that carry a plate are on the storey
   * BELOW the plan being edited, so a pick started from a plate clicks them
   * there and files the ceiling there. Plan coordinates are shared across the
   * stack, so the clicks land on the same drawing either way.
   *
   * Without it nothing changes — a plain pick is still a ceiling on the floor
   * being edited, bounded by the beams alone.
   */
  const resolveTargetFloorId = (toolState) => toolState.ceilingTargetFloorId || activeFloorId;

  function commitCeiling(beamIds, toolState = {}) {
    const project = getProject();
    const targetFloorId = resolveTargetFloorId(toolState);
    const anchored = Boolean(toolState.ceilingTargetFloorId);
    const floor = getFloor(targetFloorId);
    if (!project || !floor || !beamIds.length) return;

    let boundaryPolygon = null;
    let clipped = false;

    if (anchored) {
      // A pick is a request, and a beam can be deleted between the click and
      // the Enter. Nothing resolving means there is nothing left to frame
      // anything with, so the request is dropped rather than turned into a
      // ceiling on a manual datum the user never asked for.
      const resolved = resolveCeilingSupportBeams(floor, beamIds);
      if (!resolved.length) {
        resetPickState(editorDispatch);
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: `The beam${plural(beamIds.length)} picked ${
            beamIds.length === 1 ? 'is' : 'are'
          } no longer on ${floor.name} — pick again on the plan.`,
        });
        return;
      }

      // The anchored flow's whole answer is an AREA — the part of the plate
      // these beams frame — so unlike a plain pick it cannot fall back on beams
      // that enclose nothing. Staying in the tool with the picks intact is the
      // useful refusal: what is missing is one more click.
      const bay = deriveCeilingBoundaryFromBeams(resolved, floor);
      if (!bay) {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: `${
            resolved.length === 1 ? 'One beam frames no area' : 'Beams on one line frame no area'
          } — pick the beams on both sides of the ceiling, then press Enter.`,
        });
        return;
      }

      const ring = findSlabRing(project, toolState.ceilingClipSlabId);
      const regions = ring ? clipBayToSlab(bay, ring) : [];
      if (ring && !regions.length) {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'The picked beams frame no area under this plate — pick the beams that carry it.',
        });
        return;
      }

      // No plate to clip to — the anchor named one that has since been deleted,
      // or was never on the project — leaves the bay itself, which is what the
      // beams say and still the right ceiling to be looking at.
      boundaryPolygon = regions[0] || bay;
      clipped = Boolean(ring);
    }

    const ceiling = createCeilingForProject(project, {
      floorId: targetFloorId,
      phaseId: activePhaseId || null,
      attachment: { mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds },
      ...(boundaryPolygon
        ? {
            boundaryPolygon,
            // LOAD-BEARING. `resolveCeilingBoundary` re-derives any other source
            // from beam coverage on every read, which would throw the plate away
            // and put the bare bay rectangle back.
            boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
          }
        : {
            // Nothing was traced, so the picked beams keep the right to redraw
            // the extent whenever one of them moves.
            boundarySource: CEILING_BOUNDARY_SOURCES.AUTO,
          }),
    });

    dispatch({ type: 'CEILING_ADD', ceiling });
    resetPickState(editorDispatch);
    // Both SET_TOOL and opening the editor clear the status line, so the report
    // of what was built has to be the last thing said.
    editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
    editorDispatch({ type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceiling.id });
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: describeCommit(ceiling, beamIds.length, { floorName: anchored ? floor.name : null, clipped }),
    });
  }

  return {
    onMouseMove(modelPos, e, toolState = {}) {
      const floor = getFloor(resolveTargetFloorId(toolState));
      if (!floor) return;

      const hovered = findBeamSupportAtPoint(floor, modelPos, hitTolerance());
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { ceilingPickHoverBeamId: hovered?.beam.id || null },
      });
    },

    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const floor = getFloor(resolveTargetFloorId(toolState));
      if (!floor) return;

      const picked = toolState.ceilingPickBeamIds || [];
      const hit = findBeamSupportAtPoint(floor, modelPos, hitTolerance());
      if (!hit) {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'Click a beam to hang the ceiling from it.',
        });
        return;
      }

      // A beam at the storey datum frames the deck this floor stands on, so a
      // ceiling hung from it would be built into the floor. Say why rather than
      // letting the click do nothing.
      if (!isCeilingSupportBeam(hit.beam, floor)) {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'That beam sits at this floor level — a ceiling can only hang from a beam above it.',
        });
        return;
      }

      const beamId = hit.beam.id;
      const nextPicked = picked.includes(beamId) ? picked.filter((id) => id !== beamId) : [...picked, beamId];
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          ceilingPickBeamIds: nextPicked,
          ceilingPickHoverBeamId: beamId,
        },
      });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: describePicking(nextPicked) });
    },

    onMouseUp() {},

    onDoubleClick(modelPos, e, toolState) {
      // The click that opened the double-click has already toggled its beam, so
      // this only has to close the selection.
      commitCeiling(toolState.ceilingPickBeamIds || [], toolState);
    },

    onKeyDown(e, toolState = {}) {
      if (e.key === 'Enter') {
        commitCeiling(toolState.ceilingPickBeamIds || [], toolState);
        return;
      }
      if (e.key !== 'Escape') return;
      resetPickState(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Ceiling attachment cancelled.' });
    },

    getCursor(toolState) {
      return (toolState?.ceilingPickBeamIds || []).length ? 'copy' : 'crosshair';
    },
  };
}
