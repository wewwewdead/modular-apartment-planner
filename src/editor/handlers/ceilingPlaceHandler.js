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
      // The anchored flow's target storey goes with the outline. Abandoning a
      // trace has to abandon which floor it was for, or the next plain trace
      // would silently land a storey down.
      ceilingTargetFloorId: null,
    },
  });
}

// What the ceiling ended up hanging from, said plainly: the tool draws only the
// area, and the plane it hangs at is decided for the user by whichever beams
// cross what was drawn, by the bay it was drawn inside, or by the deck it was
// drawn under. A ceiling that found none is not broken, it just has nothing to
// attach to yet — so the message names the fix. Which fix depends on whether the
// floor had beams to miss or none at all.
//
// A floor name means the trace was anchored on a slab rather than drawn on the
// storey being edited, and then WHICH storey it landed on is the one thing the
// message cannot leave out: the ceiling is not on the floor the user is looking
// at, and it is filed under that other floor in the sidebar.
function describeCommit(ceiling, floorHasSupportBeams, floorName = null) {
  const lead = floorName ? `Ceiling added to ${floorName}` : 'Ceiling drawn';

  if (ceiling.attachment?.mode !== CEILING_ATTACHMENT_MODES.BEAM) {
    return floorHasSupportBeams
      ? `${lead} on a manual datum — no beam, bay or slab above reaches the area drawn.`
      : `${lead} on a manual datum — place top beams on the columns to attach it.`;
  }
  const beamCount = ceiling.attachment.beamIds.length;
  return `${lead} — hangs from ${beamCount} beam${beamCount === 1 ? '' : 's'} at ${Math.round(
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
  /**
   * `toolState.ceilingTargetFloorId` is the anchored flow's override: a ceiling
   * hangs under the deck OVERHEAD, so tracing the underside of the slab you are
   * standing on files the ceiling one storey down. Without it nothing changes —
   * a plain trace is still a ceiling on the floor being edited.
   *
   * The target floor governs everything the ceiling is decided by, not just the
   * id it stores: the beam ladder, the eligibility the message reads, and the
   * obstructions that follow from `floorId` on every later read.
   */
  function commitCeiling(points, toolState = {}) {
    const project = getProject();
    const targetFloorId = toolState.ceilingTargetFloorId || activeFloorId;
    const anchored = Boolean(toolState.ceilingTargetFloorId);
    const floor = getFloor(targetFloorId);
    if (!project || !floor || points.length < 3) return;

    // Only the beams the traced area actually runs under. A ceiling over one
    // room says nothing about the structure over the next one, so the beams
    // elsewhere on the floor get no vote on how high this one hangs. The whole
    // project goes with it because an area traced under an overhang hangs from
    // the beams the deck above rests on, and the deck belongs to the next storey.
    const beamIds = selectCeilingBeamsForArea(floor, points, project);
    const ceiling = createCeilingForProject(project, {
      floorId: targetFloorId,
      phaseId: activePhaseId || null,
      attachment: {
        mode: beamIds.length ? CEILING_ATTACHMENT_MODES.BEAM : CEILING_ATTACHMENT_MODES.MANUAL,
        beamIds,
      },
      boundaryPolygon: points,
      boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
    });

    dispatch({ type: 'CEILING_ADD', ceiling });
    const message = describeCommit(
      ceiling,
      getEligibleCeilingSupportBeams(floor).length > 0,
      anchored ? floor.name : null,
    );

    // The detail editor deliberately stays shut: an area with no ceiling is
    // planned by drawing the areas that do have one, several in a row, and a
    // full-screen editor between each would break that up. The sidebar list is
    // still the way in.
    //
    // The anchored flow is the exception, and for the same reason. It is one
    // trace of one overhang, started from the plate it belongs to, and the
    // ceiling it makes is not even on the floor being edited — leaving it armed
    // for a second trace would leave the tool pointing at a storey the user is
    // no longer thinking about, and the ceiling itself out of sight in another
    // floor's list. So it finishes: back to select, and open what was made.
    if (anchored) {
      // SET_TOOL clears the target floor along with the rest of the tool state,
      // and takes the status line with it — so the report comes last.
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
      editorDispatch({ type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceiling.id });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message });
      return;
    }

    editorDispatch({ type: 'SET_STATUS_MESSAGE', message });
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
        commitCeiling(points, toolState);
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
      commitCeiling(points, toolState);
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
