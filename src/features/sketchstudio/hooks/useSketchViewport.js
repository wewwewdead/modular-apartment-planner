import { useCallback, useEffect } from 'react';
import {
  applyOrthoPoint,
  getNextZoom,
  pixelsToWorldUnits,
  screenToWorld,
  zoomAtPoint,
} from '../utils/canvasMath';
import { applyIsometricOrthoPoint } from '../utils/isometricUtils';
import { findTopmostEntityAtPoint } from '../utils/hitTest';
import { snapWorldPoint } from '../utils/snapUtils';
import { setCanvasSize, setViewport, syncPointer } from '../store/sketchStudioActions';
import { HIT_TOLERANCE_PX, SNAP_TOLERANCE_PX, getEmptySnapState } from './sketchConstants';

export default function useSketchViewport(state, dispatch, canvasRef, { visibleEntities, editableEntities }) {
  const activeTool = state.ui.activeTool;

  const readCanvasPoint = useCallback((event) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, [canvasRef]);

  const readWorldPoint = useCallback(
    (screenPoint, nextViewport = state.viewport) => screenToWorld(screenPoint, nextViewport),
    [state.viewport],
  );

  const getOrthoReferencePoint = useCallback((toolId, draft) => {
    if (toolId === 'line' || toolId === 'rect' || toolId === 'circle' || toolId === 'holeCircle' || toolId === 'cutoutRect') {
      return draft.startPoint;
    }

    if (toolId === 'polyline') {
      return draft.points.at(-1) ?? null;
    }

    return null;
  }, []);

  const getConstrainedDraftPoint = useCallback((toolId, draft, point) => {
    if (!state.ui.orthoEnabled) {
      return point;
    }

    const referencePoint = getOrthoReferencePoint(toolId, draft);
    if (!(toolId === 'line' || toolId === 'polyline') || !referencePoint) {
      return point;
    }

    return state.ui.viewMode === 'isometric'
      ? applyIsometricOrthoPoint(referencePoint, point)
      : applyOrthoPoint(referencePoint, point);
  }, [getOrthoReferencePoint, state.ui.orthoEnabled, state.ui.viewMode]);

  const resolveSnap = useCallback((worldPoint, anchorPoint = null) => snapWorldPoint({
    worldPoint,
    entities: visibleEntities,
    toleranceWorld: pixelsToWorldUnits(SNAP_TOLERANCE_PX, state.viewport.zoom),
    enabled: state.ui.snapEnabled,
    anchorPoint,
    enableIsometricGrid: state.ui.viewMode === 'isometric',
    viewportZoom: state.viewport.zoom,
  }), [state.ui.snapEnabled, state.ui.viewMode, state.viewport.zoom, visibleEntities]);

  const resolvePointerState = useCallback((screenPoint, nextViewport = state.viewport, options = {}) => {
    const worldPoint = readWorldPoint(screenPoint, nextViewport);
    const shouldHoverEntities = activeTool === 'select' || activeTool === 'offset' || activeTool === 'fillet';
    const hoveredEntity = shouldHoverEntities
      ? findTopmostEntityAtPoint(editableEntities, worldPoint, pixelsToWorldUnits(HIT_TOLERANCE_PX, nextViewport.zoom))
      : null;
    const nextSnap = activeTool === 'select' || activeTool === 'pan' || activeTool === 'offset' || activeTool === 'fillet'
      ? getEmptySnapState()
      : resolveSnap(worldPoint, options.anchorPoint ?? null);

    dispatch(syncPointer({
      screenPoint,
      worldPoint,
      hoveredId: hoveredEntity?.id ?? null,
      snap: nextSnap,
    }));

    return { worldPoint, hoveredEntity, snap: nextSnap };
  }, [activeTool, editableEntities, readWorldPoint, resolveSnap, state.viewport, dispatch]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();

    const screenPoint = readCanvasPoint(event);
    const nextViewport = zoomAtPoint(state.viewport, screenPoint, getNextZoom(state.viewport.zoom, event.deltaY));
    dispatch(setViewport(nextViewport));
    resolvePointerState(screenPoint, nextViewport);
  }, [readCanvasPoint, resolvePointerState, state.viewport, dispatch]);

  // Canvas resize observer
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || typeof ResizeObserver !== 'function') {
      return undefined;
    }

    const updateSize = (width, height) => dispatch(setCanvasSize({ width, height }));
    const initialRect = canvas.getBoundingClientRect();
    updateSize(initialRect.width, initialRect.height);

    const observer = new ResizeObserver(([entry]) => {
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, dispatch]);

  // Native wheel handler
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const nativeWheelHandler = (event) => {
      handleWheel(event);
    };

    canvas.addEventListener('wheel', nativeWheelHandler, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', nativeWheelHandler);
    };
  }, [canvasRef, handleWheel]);

  return {
    readCanvasPoint,
    readWorldPoint,
    getOrthoReferencePoint,
    getConstrainedDraftPoint,
    resolveSnap,
    resolvePointerState,
    handleWheel,
  };
}
