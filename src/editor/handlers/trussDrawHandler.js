import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import {
  createTrussInstance,
  createTrussSystemForProject,
  getDefaultTrussTypes,
  resolveTrussType,
  TRUSS_SUPPORT_MODES,
} from '@/domain/trussModels';
import {
  findBeamSupportAtPoint,
  getBeamSupportCountLimit,
  resolveBeamPairSupport,
} from '@/truss/beamSupports';

const ELEVATION_TOLERANCE = 10;

function getTargetTrussSystem(trussSystems, toolState, selectedId, selectedType) {
  if (toolState.targetTrussSystemId) {
    return trussSystems.find((trussSystem) => trussSystem.id === toolState.targetTrussSystemId) || null;
  }

  if (selectedType === 'trussSystem') {
    return trussSystems.find((trussSystem) => trussSystem.id === selectedId) || null;
  }
  if (selectedType === 'trussInstance') {
    return trussSystems.find((trussSystem) => (
      (trussSystem.trussInstances || []).some((trussInstance) => trussInstance.id === selectedId)
    )) || null;
  }
  return null;
}

function clampCount(count, limit) {
  if (!Number.isFinite(count)) return limit;
  return Math.max(1, Math.min(Math.round(count), limit));
}

function clearDrawState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      startTrussBeamId: null,
      hoveredTrussBeamId: null,
    },
  });
}

export function createTrussDrawHandler({
  dispatch,
  editorDispatch,
  getFloor,
  activeFloorId,
  trussSystems,
  viewport,
  selectedId,
  selectedType,
  activePhaseId,
}) {
  const catalog = getDefaultTrussTypes();

  return {
    onMouseMove(modelPos, e, toolState) {
      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const tolerance = SNAP_DISTANCE_PX / Math.max(viewport.zoom, 0.001);
      const hoveredBeam = findBeamSupportAtPoint(floor, modelPos, tolerance);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          hoveredTrussBeamId: hoveredBeam?.beam.id || null,
        },
      });
    },

    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const tolerance = SNAP_DISTANCE_PX / Math.max(viewport.zoom, 0.001);
      const hitBeam = findBeamSupportAtPoint(floor, modelPos, tolerance);
      if (!hitBeam) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Click an existing beam to support the truss.' });
        return;
      }

      if (!toolState.startTrussBeamId) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            startTrussBeamId: hitBeam.beam.id,
            hoveredTrussBeamId: hitBeam.beam.id,
          },
        });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Select the second support beam.' });
        return;
      }

      if (toolState.startTrussBeamId === hitBeam.beam.id) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Select a different second beam.' });
        return;
      }

      const support = resolveBeamPairSupport(floor, toolState.startTrussBeamId, hitBeam.beam.id);
      if (!support.valid) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: support.message || 'Selected beams cannot support a truss.' });
        return;
      }

      const targetSystem = getTargetTrussSystem(trussSystems, toolState, selectedId, selectedType);
      if (
        targetSystem
        && Number.isFinite(targetSystem.baseElevation)
        && Math.abs((targetSystem.baseElevation || 0) - support.baseElevation) > ELEVATION_TOLERANCE
      ) {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'Selected truss system is attached to beams at a different elevation.',
        });
        return;
      }
      const templateInstance = targetSystem && (targetSystem.trussInstances || []).length
        ? targetSystem.trussInstances[targetSystem.trussInstances.length - 1]
        : null;
      const trussTypeId = toolState.trussTypeId
        || templateInstance?.trussTypeId
        || catalog[0]?.id
        || null;
      const trussType = resolveTrussType(trussTypeId, catalog);
      const trussMaterial = toolState.trussMaterial
        || templateInstance?.material
        || trussType.material;
      const spacing = Number.isFinite(toolState.trussSpacing)
        ? Math.max(300, toolState.trussSpacing)
        : (Number.isFinite(templateInstance?.spacing)
          ? Math.max(300, templateInstance.spacing)
          : 1200);
      const countLimit = getBeamSupportCountLimit(support.supportLength, spacing);
      const nextCount = clampCount(
        Number.isFinite(toolState.trussCount) ? toolState.trussCount : templateInstance?.count,
        countLimit
      );
      const nextInstance = createTrussInstance({
        trussTypeId: trussType.id,
        material: trussMaterial,
        floorId: floor.id,
        startPoint: support.startPoint,
        endPoint: support.endPoint,
        span: Number.isFinite(templateInstance?.span)
          ? Math.max(1000, templateInstance.span)
          : support.span,
        rise: templateInstance && templateInstance.trussTypeId === trussType.id
          ? templateInstance.rise
          : trussType.defaultRise,
        pitch: templateInstance && templateInstance.trussTypeId === trussType.id
          ? templateInstance.pitch
          : trussType.defaultPitch,
        spacing,
        count: nextCount,
        bearingOffsets: templateInstance?.bearingOffsets,
        overhangs: templateInstance?.overhangs,
        supportMode: TRUSS_SUPPORT_MODES.BEAM_PAIR,
        supportBeamIds: support.supportBeamIds,
      });

      if (targetSystem) {
        dispatch({
          type: 'TRUSS_INSTANCE_ADD',
          trussSystemId: targetSystem.id,
          trussInstance: nextInstance,
        });
      } else {
        const nextTrussSystem = createTrussSystemForProject(null, floor.id, {
          baseElevation: support.baseElevation,
          phaseId: activePhaseId || null,
          trussInstances: [nextInstance],
        });
        dispatch({ type: 'TRUSS_SYSTEM_ADD', trussSystem: nextTrussSystem });
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: nextInstance.id, objectType: 'trussInstance' });
      clearDrawState(editorDispatch);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Truss created above the selected beams.' });
    },

    onMouseUp() {},

    onDoubleClick() {},

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      clearDrawState(editorDispatch);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Truss draw cancelled.' });
    },

    getCursor(toolState) {
      return toolState.startTrussBeamId ? 'copy' : 'crosshair';
    },
  };
}
