import { distanceToSegment } from '@/geometry/line';
import { polygonArea, pointInPolygon } from '@/geometry/polygon';
import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import {
  buildRoofBoundaryEdges,
  projectPointToRoofEdge,
  resolveParapetLine,
  buildRoofPlanGeometry,
  drainContainsPoint,
  parapetContainsPoint,
  roofContainsPoint,
  roofOpeningContainsPoint,
} from '@/geometry/roofPlanGeometry';

function hitTestRoof(modelPos, roofSystem, viewport) {
  for (const drain of roofSystem.drains || []) {
    if (drainContainsPoint(drain, modelPos)) {
      return { id: drain.id, type: 'drain' };
    }
  }

  for (const parapet of roofSystem.parapets || []) {
    if (parapetContainsPoint(parapet, modelPos, roofSystem)) {
      return { id: parapet.id, type: 'parapet' };
    }
  }

  for (const opening of roofSystem.roofOpenings || []) {
    if (roofOpeningContainsPoint(opening, modelPos)) {
      return { id: opening.id, type: 'roofOpening' };
    }
  }

  const plan = buildRoofPlanGeometry(roofSystem);
  const hitDistance = SNAP_DISTANCE_PX / Math.max(viewport?.zoom || 1, 0.01);

  for (const roofEdge of plan.roofEdges || []) {
    if (distanceToSegment(modelPos, roofEdge.startPoint, roofEdge.endPoint) <= hitDistance) {
      return { id: roofEdge.id, type: 'roofEdge' };
    }
  }

  const sortedPlanes = [...(plan.roofPlanes || [])]
    .sort((a, b) => polygonArea(a.outline || []) - polygonArea(b.outline || []));
  for (const roofPlane of sortedPlanes) {
    if (pointInPolygon(modelPos, roofPlane.outline || [])) {
      return { id: roofPlane.id, type: 'roofPlane' };
    }
  }

  if (roofContainsPoint(roofSystem, modelPos)) {
    return { id: roofSystem.id, type: 'roofSystem' };
  }

  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointAlongEdge(edge, offset) {
  return {
    x: edge.start.x + (edge.direction.x * offset),
    y: edge.start.y + (edge.direction.y * offset),
  };
}

function shiftOffsetsOnEdge(startOffset, endOffset, delta, edgeLength) {
  let nextStart = startOffset + delta;
  let nextEnd = endOffset + delta;
  const nextMin = Math.min(nextStart, nextEnd);
  const nextMax = Math.max(nextStart, nextEnd);

  if (nextMin < 0) {
    nextStart -= nextMin;
    nextEnd -= nextMin;
  }
  if (nextMax > edgeLength) {
    const overflow = nextMax - edgeLength;
    nextStart -= overflow;
    nextEnd -= overflow;
  }

  return {
    startOffset: clamp(nextStart, 0, edgeLength),
    endOffset: clamp(nextEnd, 0, edgeLength),
  };
}

export function createRoofSelectHandler({ dispatch, editorDispatch, roofSystem, viewport }) {
  return {
    onMouseDown(modelPos, e) {
      if (e.button !== 0 || !roofSystem) return;

      const target = e.target;
      if (target.dataset.handle) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: true,
            dragType: 'handle',
            handle: target.dataset.handle,
            handleIndex: target.dataset.index != null ? Number(target.dataset.index) : null,
            startPos: modelPos,
          },
        });
        return;
      }

      const hit = hitTestRoof(modelPos, roofSystem, viewport);
      if (!hit) {
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: hit.id, objectType: hit.type });
      const draggableTypes = new Set(['parapet', 'drain', 'roofOpening', 'roofPlane']);
      if (!draggableTypes.has(hit.type)) return;

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          dragging: true,
          dragType: 'move',
          startPos: modelPos,
        },
      });
    },

    onMouseMove(modelPos, e, toolState, selectedId, selectedType) {
      if (!toolState.dragging || !selectedId || !roofSystem) return;

      const dx = modelPos.x - toolState.startPos.x;
      const dy = modelPos.y - toolState.startPos.y;

      if (selectedType === 'roofSystem') {
        if (toolState.dragType !== 'handle' || toolState.handle !== 'roof-boundary-vertex' || toolState.handleIndex == null) {
          return;
        }

        const boundaryPolygon = (roofSystem.boundaryPolygon || []).map((point, index) => (
          index === toolState.handleIndex ? { x: modelPos.x, y: modelPos.y } : point
        ));

        dispatch({
          type: 'ROOF_UPDATE',
          roofSystem: {
            id: roofSystem.id,
            boundaryPolygon,
          },
        });
      } else if (selectedType === 'parapet') {
        const parapet = (roofSystem.parapets || []).find((entry) => entry.id === selectedId);
        if (!parapet) return;
        const resolved = resolveParapetLine(parapet, roofSystem);
        if (!resolved) return;

        if (parapet.attachment?.type === 'roof_edge' && resolved.edge) {
          if (toolState.dragType === 'handle') {
            const projected = projectPointToRoofEdge(resolved.edge, modelPos);
            if (!projected) return;

            const nextAttachment = {
              ...parapet.attachment,
              [toolState.handle === 'start' ? 'startOffset' : 'endOffset']: projected.offset,
            };

            dispatch({
              type: 'PARAPET_UPDATE',
              parapet: {
                id: parapet.id,
                attachment: nextAttachment,
                startPoint: toolState.handle === 'start' ? projected.point : resolved.startPoint,
                endPoint: toolState.handle === 'end' ? projected.point : resolved.endPoint,
              },
            });
          } else {
            const edge = buildRoofBoundaryEdges(roofSystem).find((entry) => entry.index === parapet.attachment.edgeIndex) || resolved.edge;
            const previousProjection = projectPointToRoofEdge(edge, toolState.startPos);
            const nextProjection = projectPointToRoofEdge(edge, modelPos);
            if (!previousProjection || !nextProjection) return;

            const nextOffsets = shiftOffsetsOnEdge(
              Number(parapet.attachment.startOffset ?? 0),
              Number(parapet.attachment.endOffset ?? edge.length),
              nextProjection.offset - previousProjection.offset,
              edge.length
            );

            dispatch({
              type: 'PARAPET_UPDATE',
              parapet: {
                id: parapet.id,
                attachment: {
                  ...parapet.attachment,
                  ...nextOffsets,
                },
                startPoint: pointAlongEdge(edge, nextOffsets.startOffset),
                endPoint: pointAlongEdge(edge, nextOffsets.endOffset),
              },
            });
            editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { startPos: modelPos } });
          }
        } else {
          if (toolState.dragType === 'handle') {
            const handle = toolState.handle === 'start' ? 'startPoint' : 'endPoint';
            dispatch({
              type: 'PARAPET_UPDATE',
              parapet: {
                id: parapet.id,
                attachment: null,
                [handle]: { x: modelPos.x, y: modelPos.y },
              },
            });
          } else {
            dispatch({
              type: 'PARAPET_UPDATE',
              parapet: {
                id: parapet.id,
                attachment: null,
                startPoint: { x: parapet.startPoint.x + dx, y: parapet.startPoint.y + dy },
                endPoint: { x: parapet.endPoint.x + dx, y: parapet.endPoint.y + dy },
              },
            });
            editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { startPos: modelPos } });
          }
        }
      } else if (selectedType === 'drain') {
        const drain = (roofSystem.drains || []).find((entry) => entry.id === selectedId);
        if (!drain) return;

        dispatch({
          type: 'DRAIN_UPDATE',
          drain: {
            id: drain.id,
            position: { x: drain.position.x + dx, y: drain.position.y + dy },
          },
        });
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { startPos: modelPos } });
      } else if (selectedType === 'roofOpening') {
        const roofOpening = (roofSystem.roofOpenings || []).find((entry) => entry.id === selectedId);
        if (!roofOpening) return;

        if (toolState.dragType === 'handle' && toolState.handle === 'roof-opening-vertex' && toolState.handleIndex != null) {
          dispatch({
            type: 'ROOF_OPENING_UPDATE',
            roofOpening: {
              id: roofOpening.id,
              boundaryPoints: roofOpening.boundaryPoints.map((point, index) => (
                index === toolState.handleIndex ? { x: modelPos.x, y: modelPos.y } : point
              )),
            },
          });
        } else {
          dispatch({
            type: 'ROOF_OPENING_UPDATE',
            roofOpening: {
              id: roofOpening.id,
              boundaryPoints: roofOpening.boundaryPoints.map((point) => ({
                x: point.x + dx,
                y: point.y + dy,
              })),
            },
          });
          editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { startPos: modelPos } });
        }
      } else if (selectedType === 'roofPlane') {
        const roofPlane = (roofSystem.roofPlanes || []).find((entry) => entry.id === selectedId);
        if (!roofPlane) return;

        if (toolState.dragType === 'handle' && toolState.handle === 'roof-plane-vertex' && toolState.handleIndex != null) {
          dispatch({
            type: 'ROOF_PLANE_UPDATE',
            roofPlane: {
              id: roofPlane.id,
              boundaryPoints: (roofPlane.boundaryPoints || []).map((point, index) => (
                index === toolState.handleIndex ? { x: modelPos.x, y: modelPos.y } : point
              )),
            },
          });
        } else {
          dispatch({
            type: 'ROOF_PLANE_UPDATE',
            roofPlane: {
              id: roofPlane.id,
              boundaryPoints: (roofPlane.boundaryPoints || []).map((point) => ({
                x: point.x + dx,
                y: point.y + dy,
              })),
            },
          });
          editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { startPos: modelPos } });
        }
      }
    },

    onMouseUp() {
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          dragging: false,
          dragType: null,
          handle: null,
          handleIndex: null,
          startPos: null,
        },
      });
    },

    onKeyDown(e, toolState, selectedId, selectedType) {
      if (!selectedId) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedType === 'roofSystem') {
          dispatch({ type: 'ROOF_DELETE' });
        } else if (selectedType === 'parapet') {
          dispatch({ type: 'PARAPET_DELETE', parapetId: selectedId });
        } else if (selectedType === 'drain') {
          dispatch({ type: 'DRAIN_DELETE', drainId: selectedId });
        } else if (selectedType === 'roofOpening') {
          dispatch({ type: 'ROOF_OPENING_DELETE', roofOpeningId: selectedId });
        } else if (selectedType === 'roofPlane') {
          dispatch({ type: 'ROOF_PLANE_DELETE', roofPlaneId: selectedId });
        } else if (selectedType === 'roofEdge') {
          dispatch({ type: 'ROOF_EDGE_DELETE', roofEdgeId: selectedId });
        } else {
          return;
        }
        editorDispatch({ type: 'DESELECT' });
      }

      if (e.key === 'Escape' && toolState.dragging) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: false,
            dragType: null,
            handle: null,
            handleIndex: null,
            startPos: null,
          },
        });
      }
    },

    getCursor(toolState) {
      if (toolState.dragging) return 'grabbing';
      return 'default';
    },
  };
}
