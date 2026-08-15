import { isCeilingSupportBeam } from '@/domain/ceilingBeamAttachment';
import { CEILING_ATTACHMENT_MODES, CEILING_BOUNDARY_SOURCES, createCeilingForProject } from '@/domain/ceilingModels';
import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import { TOOLS } from '@/editor/tools';
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
 * request, not a result: the domain drops back to a manual datum when they
 * enclose no area to draw — a single beam, or a set collapsed onto one line —
 * so the message reports the mode that came back rather than the one asked for.
 */
function describeCommit(ceiling, pickedCount) {
  const elevation = Math.round(ceiling.baseElevation);
  if (ceiling.attachment?.mode !== CEILING_ATTACHMENT_MODES.BEAM) {
    const subject = pickedCount === 1 ? '1 beam encloses' : `${pickedCount} beams enclose`;
    return `${subject} no ceiling area — ceiling added on a manual datum at ${elevation} mm. Pick beams on opposite sides of the area.`;
  }
  const beamCount = ceiling.attachment.beamIds.length;
  return `Ceiling added — hangs from ${beamCount} beam${plural(beamCount)} at ${elevation} mm.`;
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

  function commitCeiling(beamIds) {
    const project = getProject();
    const floor = getFloor(activeFloorId);
    if (!project || !floor || !beamIds.length) return;

    const ceiling = createCeilingForProject(project, {
      floorId: activeFloorId,
      phaseId: activePhaseId || null,
      attachment: { mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds },
      // Nothing was traced, so the picked beams keep the right to redraw the
      // extent whenever one of them moves.
      boundarySource: CEILING_BOUNDARY_SOURCES.AUTO,
    });

    dispatch({ type: 'CEILING_ADD', ceiling });
    resetPickState(editorDispatch);
    // Both SET_TOOL and opening the editor clear the status line, so the report
    // of what was built has to be the last thing said.
    editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
    editorDispatch({ type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceiling.id });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: describeCommit(ceiling, beamIds.length) });
  }

  return {
    onMouseMove(modelPos) {
      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const hovered = findBeamSupportAtPoint(floor, modelPos, hitTolerance());
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { ceilingPickHoverBeamId: hovered?.beam.id || null },
      });
    },

    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
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
      commitCeiling(toolState.ceilingPickBeamIds || []);
    },

    onKeyDown(e, toolState = {}) {
      if (e.key === 'Enter') {
        commitCeiling(toolState.ceilingPickBeamIds || []);
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
