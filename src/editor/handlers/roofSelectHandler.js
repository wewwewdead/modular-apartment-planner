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
import { findContextRoofAt } from './roofContextPick';

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

  const sortedPlanes = [...(plan.roofPlanes || [])].sort(
    (a, b) => polygonArea(a.outline || []) - polygonArea(b.outline || []),
  );
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
    x: edge.start.x + edge.direction.x * offset,
    y: edge.start.y + edge.direction.y * offset,
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

/** The roof drag's fields at rest: what a release, Escape and Delete each write. */
const IDLE_ROOF_DRAG_STATE = Object.freeze({
  dragging: false,
  dragType: null,
  handle: null,
  handleIndex: null,
  startPos: null,
});

export function createRoofSelectHandler({ dispatch, editorDispatch, roofSystem, contextRoofSystems = [], viewport }) {
  return {
    onMouseDown(modelPos, e) {
      if (e.button !== 0) return;
      if (!roofSystem) {
        // The roof being edited is hidden by the phase view; the others it
        // shows can still be switched to.
        const contextRoof = findContextRoofAt(contextRoofSystems, modelPos);
        if (contextRoof) editorDispatch({ type: 'SELECT_OBJECT', id: contextRoof.id, objectType: 'roofSystem' });
        return;
      }

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

      // The active roof first, exactly as with one roof. A miss that lands in
      // another roof drawn as context makes that roof the active one
      // (SELECT_OBJECT of a roof does) and selects it; no drag starts, so a
      // press meant as a switch never moves anything. A miss on every roof
      // deselects.
      const hit = hitTestRoof(modelPos, roofSystem, viewport);
      if (!hit) {
        const contextRoof = findContextRoofAt(contextRoofSystems, modelPos);
        if (contextRoof) {
          editorDispatch({ type: 'SELECT_OBJECT', id: contextRoof.id, objectType: 'roofSystem' });
          return;
        }
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
        if (
          toolState.dragType !== 'handle' ||
          toolState.handle !== 'roof-boundary-vertex' ||
          toolState.handleIndex == null
        ) {
          return;
        }

        const boundaryPolygon = (roofSystem.boundaryPolygon || []).map((point, index) =>
          index === toolState.handleIndex ? { x: modelPos.x, y: modelPos.y } : point,
        );

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
            const edge =
              buildRoofBoundaryEdges(roofSystem).find((entry) => entry.index === parapet.attachment.edgeIndex) ||
              resolved.edge;
            const previousProjection = projectPointToRoofEdge(edge, toolState.startPos);
            const nextProjection = projectPointToRoofEdge(edge, modelPos);
            if (!previousProjection || !nextProjection) return;

            const nextOffsets = shiftOffsetsOnEdge(
              Number(parapet.attachment.startOffset ?? 0),
              Number(parapet.attachment.endOffset ?? edge.length),
              nextProjection.offset - previousProjection.offset,
              edge.length,
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

        if (
          toolState.dragType === 'handle' &&
          toolState.handle === 'roof-opening-vertex' &&
          toolState.handleIndex != null
        ) {
          dispatch({
            type: 'ROOF_OPENING_UPDATE',
            roofOpening: {
              id: roofOpening.id,
              boundaryPoints: roofOpening.boundaryPoints.map((point, index) =>
                index === toolState.handleIndex ? { x: modelPos.x, y: modelPos.y } : point,
              ),
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

        if (
          toolState.dragType === 'handle' &&
          toolState.handle === 'roof-plane-vertex' &&
          toolState.handleIndex != null
        ) {
          dispatch({
            type: 'ROOF_PLANE_UPDATE',
            roofPlane: {
              id: roofPlane.id,
              boundaryPoints: (roofPlane.boundaryPoints || []).map((point, index) =>
                index === toolState.handleIndex ? { x: modelPos.x, y: modelPos.y } : point,
              ),
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
      editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: IDLE_ROOF_DRAG_STATE });
    },

    onKeyDown(e, toolState, selectedId, selectedType) {
      // Ahead of the selection check: a drag can outlive its selection (Ctrl+Z
      // deselects mid-drag), and Escape still has to end it.
      if (e.key === 'Escape' && toolState.dragging) {
        // Every roof drag commits on each pointer frame, so cancelling means
        // putting back the project the store held when the press opened the
        // drag gesture — the plan's select tool does the same. A drag that has
        // not moved yet recorded nothing, and the cancel leaves it alone. With
        // the selection gone there is nothing to put back: Ctrl+Z already took
        // the gesture's entry, and cancelling would restore the one before it.
        if (selectedId) dispatch({ type: 'CANCEL_DRAG_GESTURE' });
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: IDLE_ROOF_DRAG_STATE });
        return;
      }

      if (!selectedId) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedType === 'roofSystem') {
          dispatch({ type: 'ROOF_DELETE', roofId: selectedId });
        } else if (selectedType === 'parapet') {
          dispatch({ type: 'PARAPET_DELETE', parapetId: selectedId });
        } else if (selectedType === 'drain') {
          dispatch({ type: 'DRAIN_DELETE', drainId: selectedId });
        } else if (selectedType === 'roofOpening') {
          dispatch({ type: 'ROOF_OPENING_DELETE', roofOpeningId: selectedId });
        } else if (selectedType === 'roofPlane') {
          dispatch({ type: 'ROOF_PLANE_DELETE', roofPlaneId: selectedId });
        } else if (selectedType === 'roofEdge') {
          dispatch({ type: 'ROOF_EDGE_DELETE', roofId: roofSystem?.id || null, roofEdgeId: selectedId });
        } else {
          return;
        }
        editorDispatch({ type: 'DESELECT' });
        // A drag of what was just deleted ends with it; left standing, a later
        // Escape would cancel the gesture and bring the deleted object back.
        if (toolState.dragging) editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: IDLE_ROOF_DRAG_STATE });
      }
    },

    getCursor(toolState) {
      if (toolState.dragging) return 'grabbing';
      return 'default';
    },
  };
}
