import { getEligibleCeilingSupportBeams, selectCeilingBeamsForArea } from '@/domain/ceilingBeamAttachment';
import { CEILING_ATTACHMENT_MODES, CEILING_BOUNDARY_SOURCES, createCeilingForProject } from '@/domain/ceilingModels';
import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import { distance } from '@/geometry/point';

function resetCeilingToolState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      ceilingPoints: [],
      ceilingPreviewPoint: null,
    },
  });
}

// What the ceiling ended up hanging from, said plainly: the tool draws only the
// area, and the plane it hangs at is decided for the user by whichever beams
// cross what was drawn. A ceiling that found none is not broken, it just has
// nothing to attach to yet — so the message names the fix. Which fix depends on
// whether the floor had beams to miss or none at all.
function describeCommit(ceiling, floorHasSupportBeams) {
  if (ceiling.attachment?.mode !== CEILING_ATTACHMENT_MODES.BEAM) {
    return floorHasSupportBeams
      ? 'Ceiling drawn on a manual datum — no beam above this floor crosses the area drawn.'
      : 'Ceiling drawn on a manual datum — place top beams on the columns to attach it.';
  }
  const beamCount = ceiling.attachment.beamIds.length;
  return `Ceiling drawn — hangs from ${beamCount} beam${beamCount === 1 ? '' : 's'} at ${Math.round(
    ceiling.baseElevation,
  )} mm.`;
}

export function createCeilingPlaceHandler({
  dispatch,
  editorDispatch,
  getProject,
  getFloor,
  activeFloorId,
  viewport,
  activePhaseId,
}) {
  function commitCeiling(points) {
    const project = getProject();
    const floor = getFloor(activeFloorId);
    if (!project || !floor || points.length < 3) return;

    // Only the beams the traced area actually runs under. A ceiling over one
    // room says nothing about the structure over the next one, so the beams
    // elsewhere on the floor get no vote on how high this one hangs.
    const beamIds = selectCeilingBeamsForArea(floor, points);
    const ceiling = createCeilingForProject(project, {
      floorId: activeFloorId,
      phaseId: activePhaseId || null,
      attachment: {
        mode: beamIds.length ? CEILING_ATTACHMENT_MODES.BEAM : CEILING_ATTACHMENT_MODES.MANUAL,
        beamIds,
      },
      boundaryPolygon: points,
      boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
    });

    dispatch({ type: 'CEILING_ADD', ceiling });
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: describeCommit(ceiling, getEligibleCeilingSupportBeams(floor).length > 0),
    });

    // The detail editor deliberately stays shut: an area with no ceiling is
    // planned by drawing the areas that do have one, several in a row, and a
    // full-screen editor between each would break that up. The sidebar list is
    // still the way in.
    resetCeilingToolState(editorDispatch);
  }

  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const points = toolState.ceilingPoints || [];
      const closeDistance = SNAP_DISTANCE_PX / viewport.zoom;

      if (points.length === 0) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            ceilingPoints: [{ x: modelPos.x, y: modelPos.y }],
            ceilingPreviewPoint: { x: modelPos.x, y: modelPos.y },
          },
        });
        return;
      }

      if (points.length >= 3 && distance(modelPos, points[0]) <= closeDistance) {
        commitCeiling(points);
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          ceilingPoints: [...points, { x: modelPos.x, y: modelPos.y }],
          ceilingPreviewPoint: { x: modelPos.x, y: modelPos.y },
        },
      });
    },

    onMouseMove(modelPos, e, toolState) {
      if (!(toolState.ceilingPoints || []).length) return;
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          ceilingPreviewPoint: { x: modelPos.x, y: modelPos.y },
        },
      });
    },

    onDoubleClick(modelPos, e, toolState) {
      const points = toolState.ceilingPoints || [];
      if (points.length < 3) return;
      commitCeiling(points);
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      resetCeilingToolState(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
