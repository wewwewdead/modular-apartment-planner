import { distanceToSegment } from '@/geometry/line';
import { add, dot, normalize, scale, subtract } from '@/geometry/point';
import { buildFloorTrussGeometry, buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import {
  detachBeamSupportedTrussInstances,
  hasBeamSupportedTrussInstances,
  TRUSS_SUPPORT_MODES,
} from '@/domain/trussModels';
import { deriveBeamSupportedInstanceGeometry } from '@/truss/beamSupports';
import {
  angleFromPivot,
  deltaAngleDegrees,
  MIN_TRUSS_SYSTEM_LENGTH,
  normalizePlanLengthScale,
  normalizePlanOffset,
  normalizeRotationDegrees,
} from '@/truss/systemTransform';

const DRAG_THRESHOLD_PX = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clearInteractionState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      pendingDrag: false,
      dragging: false,
      dragType: null,
      startPos: null,
      trussDragInstanceId: null,
      trussDragBaseOffset: null,
      trussDragCurrentOffset: null,
      trussDragMaxOffset: null,
      trussRotateSystemId: null,
      trussRotatePivot: null,
      trussRotateStartAngle: null,
      trussRotateBaseOffsetDegrees: null,
      trussRotateCurrentOffsetDegrees: null,
      trussMoveSystemId: null,
      trussMoveBaseOffset: null,
      trussMoveCurrentOffset: null,
      trussResizeSystemId: null,
      trussResizeHandleSide: null,
      trussResizeBaseScale: null,
      trussResizeCurrentLengthScale: null,
      trussResizeBaseOffset: null,
      trussResizeCurrentOffset: null,
      trussResizeDisplayAxis: null,
      trussResizeRawLength: null,
      trussResizeStartAlong: null,
      trussResizeEndAlong: null,
    },
  });
}

function findTrussInstanceParent(trussSystems, trussInstanceId) {
  for (const trussSystem of trussSystems) {
    const trussInstance = (trussSystem.trussInstances || []).find((entry) => entry.id === trussInstanceId) || null;
    if (trussInstance) {
      return { trussSystem, trussInstance };
    }
  }
  return { trussSystem: null, trussInstance: null };
}

function findTrussSystem(trussSystems, trussSystemId) {
  return trussSystems.find((entry) => entry.id === trussSystemId) || null;
}

function offsetsDiffer(a, b) {
  return Math.abs((a?.x || 0) - (b?.x || 0)) > 1e-6 || Math.abs((a?.y || 0) - (b?.y || 0)) > 1e-6;
}

function getDisplayedLayoutAxis(trussSystem, trussInstanceId) {
  const systemGeometry = buildTrussSystemGeometry(trussSystem);
  const instanceGeometry = systemGeometry.instances.find((entry) => entry.instance.id === trussInstanceId) || null;
  if (!instanceGeometry) return null;

  return normalize(subtract(instanceGeometry.layoutLineEndPoint, instanceGeometry.layoutLineStartPoint));
}

function hitTestTrusses(modelPos, trussSystems, viewport) {
  const tolerance = (SNAP_DISTANCE_PX / viewport.zoom) * 2.5;
  const floorGeometry = buildFloorTrussGeometry(trussSystems);

  for (const systemGeometry of floorGeometry.systems) {
    for (const instanceGeometry of systemGeometry.instances) {
      for (const copy of instanceGeometry.copies) {
        if (distanceToSegment(modelPos, copy.overallStartPoint, copy.overallEndPoint) <= tolerance) {
          return {
            id: instanceGeometry.instance.id,
            type: 'trussInstance',
          };
        }
      }
    }
  }

  for (const systemGeometry of floorGeometry.systems) {
    const bounds = systemGeometry.planBounds;
    if (
      modelPos.x >= bounds.minX - tolerance
      && modelPos.x <= bounds.maxX + tolerance
      && modelPos.y >= bounds.minY - tolerance
      && modelPos.y <= bounds.maxY + tolerance
    ) {
      return {
        id: systemGeometry.trussSystem.id,
        type: 'trussSystem',
      };
    }
  }

  return null;
}

export function createTrussSelectHandler({ dispatch, editorDispatch, getFloor, activeFloorId, trussSystems, viewport }) {
  return {
    onMouseDown(modelPos, e) {
      if (e.button !== 0) return;
      const target = e.target;

      if (target.dataset.handle === 'truss-rotate' && target.dataset.systemId) {
        const trussSystem = findTrussSystem(trussSystems, target.dataset.systemId);
        if (!trussSystem) {
          clearInteractionState(editorDispatch);
          return;
        }

        const systemGeometry = buildTrussSystemGeometry(trussSystem);
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            pendingDrag: false,
            dragging: true,
            dragType: 'truss-rotate',
            startPos: modelPos,
            trussRotateSystemId: trussSystem.id,
            trussRotatePivot: systemGeometry.transform.pivot,
            trussRotateStartAngle: angleFromPivot(systemGeometry.transform.pivot, modelPos),
            trussRotateBaseOffsetDegrees: normalizeRotationDegrees(trussSystem.planRotationOffsetDegrees || 0),
            trussRotateCurrentOffsetDegrees: normalizeRotationDegrees(trussSystem.planRotationOffsetDegrees || 0),
          },
        });
        return;
      }

      if (target.dataset.handle === 'truss-move-system' && target.dataset.systemId) {
        const trussSystem = findTrussSystem(trussSystems, target.dataset.systemId);
        if (!trussSystem) {
          clearInteractionState(editorDispatch);
          return;
        }

        if (hasBeamSupportedTrussInstances(trussSystem)) {
          editorDispatch({
            type: 'SET_STATUS_MESSAGE',
            message: 'Moving this truss system will detach its beam-supported instances.',
          });
        }

        const baseOffset = normalizePlanOffset(trussSystem.planOffset);
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            pendingDrag: false,
            dragging: true,
            dragType: 'truss-system-move',
            startPos: modelPos,
            trussMoveSystemId: trussSystem.id,
            trussMoveBaseOffset: baseOffset,
            trussMoveCurrentOffset: baseOffset,
          },
        });
        return;
      }

      if (target.dataset.handle === 'truss-resize-system' && target.dataset.systemId) {
        const trussSystem = findTrussSystem(trussSystems, target.dataset.systemId);
        if (!trussSystem) {
          clearInteractionState(editorDispatch);
          return;
        }

        const systemGeometry = buildTrussSystemGeometry(trussSystem);
        if (!systemGeometry.transform?.resizable || systemGeometry.transform.rawLength <= 1e-6) {
          clearInteractionState(editorDispatch);
          return;
        }

        if (hasBeamSupportedTrussInstances(trussSystem)) {
          editorDispatch({
            type: 'SET_STATUS_MESSAGE',
            message: 'Resizing this truss system will detach its beam-supported instances.',
          });
        }

        const baseOffset = normalizePlanOffset(trussSystem.planOffset);
        const baseScale = normalizePlanLengthScale(trussSystem.planLengthScale);
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            pendingDrag: false,
            dragging: true,
            dragType: 'truss-system-resize',
            startPos: modelPos,
            trussResizeSystemId: trussSystem.id,
            trussResizeHandleSide: target.dataset.side === 'start' ? 'start' : 'end',
            trussResizeBaseScale: baseScale,
            trussResizeCurrentLengthScale: baseScale,
            trussResizeBaseOffset: baseOffset,
            trussResizeCurrentOffset: baseOffset,
            trussResizeDisplayAxis: systemGeometry.transform.displayAxis,
            trussResizeRawLength: systemGeometry.transform.rawLength,
            trussResizeStartAlong: systemGeometry.transform.startAlong,
            trussResizeEndAlong: systemGeometry.transform.endAlong,
          },
        });
        return;
      }

      const hit = hitTestTrusses(modelPos, trussSystems, viewport);
      if (!hit) {
        clearInteractionState(editorDispatch);
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: hit.id, objectType: hit.type });

      if (hit.type !== 'trussInstance') {
        clearInteractionState(editorDispatch);
        return;
      }

      const floor = getFloor(activeFloorId);
      const { trussInstance } = findTrussInstanceParent(trussSystems, hit.id);
      if (!floor || !trussInstance || trussInstance.supportMode !== TRUSS_SUPPORT_MODES.BEAM_PAIR) {
        clearInteractionState(editorDispatch);
        return;
      }

      const derived = deriveBeamSupportedInstanceGeometry(trussInstance, floor);
      if (!derived.valid || derived.maxOffset <= 0) {
        clearInteractionState(editorDispatch);
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          pendingDrag: true,
          dragging: false,
          dragType: 'truss-move',
          startPos: modelPos,
          trussDragInstanceId: hit.id,
          trussDragBaseOffset: derived.effectiveOffset,
          trussDragCurrentOffset: derived.effectiveOffset,
          trussDragMaxOffset: derived.maxOffset,
        },
      });
    },

    onMouseMove(modelPos, e, toolState) {
      if (toolState.dragType === 'truss-rotate') {
        if (!toolState.dragging || !toolState.trussRotateSystemId || !toolState.trussRotatePivot) return;

        const currentAngle = angleFromPivot(toolState.trussRotatePivot, modelPos);
        const nextRotation = normalizeRotationDegrees(
          (Number(toolState.trussRotateBaseOffsetDegrees) || 0)
          + deltaAngleDegrees(toolState.trussRotateStartAngle, currentAngle)
        );

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            trussRotateCurrentOffsetDegrees: nextRotation,
          },
        });
        return;
      }

      if (toolState.dragType === 'truss-system-move') {
        if (!toolState.dragging || !toolState.trussMoveSystemId) return;

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            trussMoveCurrentOffset: add(
              normalizePlanOffset(toolState.trussMoveBaseOffset),
              subtract(modelPos, toolState.startPos)
            ),
          },
        });
        return;
      }

      if (toolState.dragType === 'truss-system-resize') {
        if (!toolState.dragging || !toolState.trussResizeSystemId || !toolState.trussResizeDisplayAxis) return;

        const rawLength = Number(toolState.trussResizeRawLength) || 0;
        if (rawLength <= 1e-6) return;

        const baseScale = normalizePlanLengthScale(toolState.trussResizeBaseScale);
        const baseLength = rawLength * baseScale;
        const delta = dot(subtract(modelPos, toolState.startPos), toolState.trussResizeDisplayAxis);
        const nextLength = Math.max(
          MIN_TRUSS_SYSTEM_LENGTH,
          toolState.trussResizeHandleSide === 'start'
            ? baseLength - delta
            : baseLength + delta
        );
        const nextScale = normalizePlanLengthScale(nextLength / rawLength);
        const anchorAlong = toolState.trussResizeHandleSide === 'start'
          ? Number(toolState.trussResizeEndAlong) || 0
          : Number(toolState.trussResizeStartAlong) || 0;
        const offsetAdjustment = scale(
          toolState.trussResizeDisplayAxis,
          -anchorAlong * (nextScale - baseScale)
        );

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            trussResizeCurrentLengthScale: nextScale,
            trussResizeCurrentOffset: add(
              normalizePlanOffset(toolState.trussResizeBaseOffset),
              offsetAdjustment
            ),
          },
        });
        return;
      }

      if (toolState.dragType !== 'truss-move') return;

      if (toolState.pendingDrag && !toolState.dragging) {
        const dx = modelPos.x - toolState.startPos.x;
        const dy = modelPos.y - toolState.startPos.y;
        const distPx = Math.sqrt(dx * dx + dy * dy) * viewport.zoom;
        if (distPx < DRAG_THRESHOLD_PX) return;
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            pendingDrag: false,
            dragging: true,
          },
        });
      }

      if (!toolState.dragging || !toolState.trussDragInstanceId) return;

      const floor = getFloor(activeFloorId);
      const { trussSystem, trussInstance } = findTrussInstanceParent(trussSystems, toolState.trussDragInstanceId);
      if (!floor || !trussSystem || !trussInstance || trussInstance.supportMode !== TRUSS_SUPPORT_MODES.BEAM_PAIR) {
        return;
      }

      const derived = deriveBeamSupportedInstanceGeometry(trussInstance, floor);
      if (!derived.valid) return;

      const displayedAxis = getDisplayedLayoutAxis(trussSystem, trussInstance.id) || derived.axis;
      const axisDelta = dot(subtract(modelPos, toolState.startPos), displayedAxis);
      const nextOffset = clamp(
        (Number(toolState.trussDragBaseOffset) || 0) + axisDelta,
        0,
        derived.maxOffset
      );

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          trussDragCurrentOffset: nextOffset,
          trussDragMaxOffset: derived.maxOffset,
        },
      });
    },

    onMouseUp(modelPos, e, toolState) {
      if (toolState.dragType === 'truss-rotate') {
        if (toolState.dragging && toolState.trussRotateSystemId) {
          dispatch({
            type: 'TRUSS_SYSTEM_UPDATE',
            trussSystem: {
              id: toolState.trussRotateSystemId,
              planRotationOffsetDegrees: toolState.trussRotateCurrentOffsetDegrees,
            },
          });
        }

        clearInteractionState(editorDispatch);
        return;
      }

      if (toolState.dragType === 'truss-system-move') {
        if (toolState.dragging && toolState.trussMoveSystemId) {
          const trussSystem = findTrussSystem(trussSystems, toolState.trussMoveSystemId);
          const nextOffset = normalizePlanOffset(toolState.trussMoveCurrentOffset);
          const baseOffset = normalizePlanOffset(toolState.trussMoveBaseOffset);

          if (trussSystem && offsetsDiffer(baseOffset, nextOffset)) {
            dispatch({
              type: 'TRUSS_SYSTEM_UPDATE',
              trussSystem: {
                id: trussSystem.id,
                planOffset: nextOffset,
                ...(hasBeamSupportedTrussInstances(trussSystem)
                  ? { trussInstances: detachBeamSupportedTrussInstances(trussSystem.trussInstances || []) }
                  : {}),
              },
            });
          }
        }

        clearInteractionState(editorDispatch);
        return;
      }

      if (toolState.dragType === 'truss-system-resize') {
        if (toolState.dragging && toolState.trussResizeSystemId) {
          const trussSystem = findTrussSystem(trussSystems, toolState.trussResizeSystemId);
          const nextScale = normalizePlanLengthScale(toolState.trussResizeCurrentLengthScale);
          const baseScale = normalizePlanLengthScale(toolState.trussResizeBaseScale);

          if (trussSystem && Math.abs(nextScale - baseScale) > 1e-6) {
            dispatch({
              type: 'TRUSS_SYSTEM_UPDATE',
              trussSystem: {
                id: trussSystem.id,
                planLengthScale: nextScale,
                planOffset: normalizePlanOffset(toolState.trussResizeCurrentOffset),
                ...(hasBeamSupportedTrussInstances(trussSystem)
                  ? { trussInstances: detachBeamSupportedTrussInstances(trussSystem.trussInstances || []) }
                  : {}),
              },
            });
          }
        }

        clearInteractionState(editorDispatch);
        return;
      }

      if (toolState.dragType !== 'truss-move') return;

      if (toolState.dragging && toolState.trussDragInstanceId) {
        const { trussSystem } = findTrussInstanceParent(trussSystems, toolState.trussDragInstanceId);
        if (trussSystem) {
          dispatch({
            type: 'TRUSS_INSTANCE_UPDATE',
            trussSystemId: trussSystem.id,
            trussInstance: {
              id: toolState.trussDragInstanceId,
              supportOffsetAlongAxis: toolState.trussDragCurrentOffset,
            },
          });
        }
      }

      clearInteractionState(editorDispatch);
    },

    onDoubleClick() {},

    onKeyDown(e, toolState, selectedId, selectedType) {
      if (e.key === 'Escape' && (toolState.dragging || toolState.pendingDrag)) {
        clearInteractionState(editorDispatch);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if (selectedType === 'trussSystem') {
          dispatch({ type: 'TRUSS_SYSTEM_DELETE', trussSystemId: selectedId });
          clearInteractionState(editorDispatch);
          editorDispatch({ type: 'DESELECT' });
        } else if (selectedType === 'trussInstance') {
          const { trussSystem: parentSystem } = findTrussInstanceParent(trussSystems, selectedId);
          if (parentSystem) {
            dispatch({
              type: 'TRUSS_INSTANCE_DELETE',
              trussSystemId: parentSystem.id,
              trussInstanceId: selectedId,
            });
            clearInteractionState(editorDispatch);
            editorDispatch({ type: 'DESELECT' });
          }
        }
      }
    },

    getCursor(toolState) {
      if (toolState.dragging && toolState.dragType === 'truss-rotate') return 'grabbing';
      if (toolState.dragType === 'truss-rotate') return 'grab';
      if (toolState.dragging && toolState.dragType === 'truss-system-move') return 'grabbing';
      if (toolState.dragType === 'truss-system-move') return 'grab';
      if (toolState.dragging && toolState.dragType === 'truss-system-resize') return 'ew-resize';
      if (toolState.dragType === 'truss-system-resize') return 'ew-resize';
      if (toolState.dragging && toolState.dragType === 'truss-move') return 'grabbing';
      if (toolState.pendingDrag && toolState.dragType === 'truss-move') return 'grab';
      return 'default';
    },
  };
}
