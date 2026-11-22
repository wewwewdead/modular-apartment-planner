import { useCallback, useEffect, useMemo, useRef } from 'react';
import { applyOrthoPoint, getNextZoom, pixelsToWorldUnits, screenToWorld, zoomAtPoint } from '../utils/canvasMath';
import { applyIsometricOrthoPoint } from '../utils/isometricUtils';
import { findTopmostEntityAtPoint } from '../utils/hitTest';
import { collectSnapSources, snapWorldPoint } from '../utils/snapUtils';
import { setCanvasSize, setViewport, syncPointer } from '../store/sketchStudioActions';
import {
  HIT_TOLERANCE_PX,
  HOVER_ENTITY_TOOLS,
  SNAP_TOLERANCE_PX,
  getEmptySnapState,
  shouldSnapOverrideOrtho,
} from './sketchConstants';

export default function useSketchViewport(
  state,
  dispatch,
  canvasRef,
  { visibleEntities, editableEntities, cursorChannel = null },
) {
  const activeTool = state.ui.activeTool;

  // The canvas rect, read once and kept until something can have moved the
  // canvas: a resize (the observer below, the window), a scroll, the pointer
  // entering or pressing the canvas, or a different canvas element. Reading it
  // on every pointer move forced a layout after every render that changed the
  // drawing.
  const canvasRectRef = useRef(null);
  const invalidateCanvasRect = useCallback(() => {
    canvasRectRef.current = null;
  }, []);

  const readCanvasPoint = useCallback(
    (event) => {
      const canvas = canvasRef.current;

      if (!canvas) {
        return { x: 0, y: 0 };
      }

      let cached = canvasRectRef.current;
      if (!cached || cached.element !== canvas) {
        cached = { element: canvas, rect: canvas.getBoundingClientRect() };
        canvasRectRef.current = cached;
      }
      return { x: event.clientX - cached.rect.left, y: event.clientY - cached.rect.top };
    },
    [canvasRef],
  );

  const readWorldPoint = useCallback(
    (screenPoint, nextViewport = state.viewport) => screenToWorld(screenPoint, nextViewport),
    [state.viewport],
  );

  const getOrthoReferencePoint = useCallback((toolId, draft) => {
    if (
      toolId === 'line' ||
      toolId === 'rect' ||
      toolId === 'circle' ||
      toolId === 'holeCircle' ||
      toolId === 'cutoutRect'
    ) {
      return draft.startPoint;
    }

    if (toolId === 'polyline') {
      return draft.points.at(-1) ?? null;
    }

    return null;
  }, []);

  // `snap` is the snap hit that produced `point` (or null). A point snap on an
  // entity wins over Ortho -- see shouldSnapOverrideOrtho. Preview (pointer
  // move) and commit (click) both come through here, so they always agree.
  const getConstrainedDraftPoint = useCallback(
    (toolId, draft, point, snap = null) => {
      if (!state.ui.orthoEnabled || shouldSnapOverrideOrtho(snap)) {
        return point;
      }

      const referencePoint = getOrthoReferencePoint(toolId, draft);
      if (!(toolId === 'line' || toolId === 'polyline') || !referencePoint) {
        return point;
      }

      return state.ui.viewMode === 'isometric'
        ? applyIsometricOrthoPoint(referencePoint, point)
        : applyOrthoPoint(referencePoint, point);
    },
    [getOrthoReferencePoint, state.ui.orthoEnabled, state.ui.viewMode],
  );

  // The snap points and segments of the visible entities, collected on the
  // first snap after each document change and reused by every pointer move
  // until the next one. Lazy: tools that never snap (select, a drag) never pay.
  const visibleSnapSources = useMemo(() => {
    let sources = null;
    return () => {
      sources ??= collectSnapSources(visibleEntities);
      return sources;
    };
  }, [visibleEntities]);

  // `excludeEntityIds` keeps an entity from snapping to itself -- a dragged
  // handle would otherwise lock onto its own (one-render-stale) endpoint. That
  // path snaps against a filtered copy, so it collects its own sources.
  const resolveSnap = useCallback(
    (worldPoint, anchorPoint = null, { excludeEntityIds = null } = {}) => {
      const isFiltered = Boolean(excludeEntityIds?.length);
      return snapWorldPoint({
        worldPoint,
        entities: isFiltered
          ? visibleEntities.filter((entity) => !excludeEntityIds.includes(entity.id))
          : visibleEntities,
        toleranceWorld: pixelsToWorldUnits(SNAP_TOLERANCE_PX, state.viewport.zoom),
        enabled: state.ui.snapEnabled,
        anchorPoint,
        enableIsometricGrid: state.ui.viewMode === 'isometric',
        viewportZoom: state.viewport.zoom,
        sources: isFiltered || !state.ui.snapEnabled ? null : visibleSnapSources(),
      });
    },
    [state.ui.snapEnabled, state.ui.viewMode, state.viewport.zoom, visibleEntities, visibleSnapSources],
  );

  const resolvePointerState = useCallback(
    (screenPoint, nextViewport = state.viewport, options = {}) => {
      const worldPoint = readWorldPoint(screenPoint, nextViewport);
      const hoveredEntity = HOVER_ENTITY_TOOLS.has(activeTool)
        ? findTopmostEntityAtPoint(
            editableEntities,
            worldPoint,
            pixelsToWorldUnits(HIT_TOLERANCE_PX, nextViewport.zoom),
          )
        : null;
      const nextSnap =
        activeTool === 'select' || activeTool === 'pan' || activeTool === 'offset' || activeTool === 'fillet'
          ? getEmptySnapState()
          : resolveSnap(worldPoint, options.anchorPoint ?? null);

      // The cursor goes to the channel; SYNC_POINTER changes state only when
      // the hover or the snap changed (the reducer keeps the state otherwise).
      cursorChannel?.publish(screenPoint, worldPoint);
      dispatch(
        syncPointer({
          screenPoint,
          worldPoint,
          hoveredId: hoveredEntity?.id ?? null,
          snap: nextSnap,
        }),
      );

      return { worldPoint, hoveredEntity, snap: nextSnap };
    },
    [activeTool, editableEntities, readWorldPoint, resolveSnap, state.viewport, dispatch, cursorChannel],
  );

  const handleWheel = useCallback(
    (event) => {
      event.preventDefault();

      const screenPoint = readCanvasPoint(event);
      const nextViewport = zoomAtPoint(state.viewport, screenPoint, getNextZoom(state.viewport.zoom, event.deltaY));
      dispatch(setViewport(nextViewport));
      resolvePointerState(screenPoint, nextViewport);
    },
    [readCanvasPoint, resolvePointerState, state.viewport, dispatch],
  );

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
      invalidateCanvasRect();
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, dispatch, invalidateCanvasRect]);

  useEffect(() => {
    window.addEventListener('resize', invalidateCanvasRect);
    window.addEventListener('scroll', invalidateCanvasRect, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', invalidateCanvasRect);
      window.removeEventListener('scroll', invalidateCanvasRect, { capture: true });
    };
  }, [invalidateCanvasRect]);

  // Native wheel handler. It calls the latest handleWheel through a ref, so a
  // viewport change (every notch, every pan frame) no longer unbinds and binds
  // the listener. The listeners follow the canvas element itself: it mounts and
  // unmounts with the 2D / 3D workspace switch, so each commit checks it.
  const handleWheelRef = useRef(handleWheel);
  useEffect(() => {
    handleWheelRef.current = handleWheel;
  }, [handleWheel]);

  const canvasListenersRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvasListenersRef.current?.element === canvas) {
      return;
    }

    canvasListenersRef.current?.detach();
    canvasListenersRef.current = null;
    invalidateCanvasRect();

    if (!canvas) {
      return;
    }

    const nativeWheelHandler = (event) => {
      handleWheelRef.current(event);
    };

    canvas.addEventListener('wheel', nativeWheelHandler, { passive: false });
    canvas.addEventListener('pointerenter', invalidateCanvasRect);
    canvas.addEventListener('pointerdown', invalidateCanvasRect);
    canvasListenersRef.current = {
      element: canvas,
      detach: () => {
        canvas.removeEventListener('wheel', nativeWheelHandler);
        canvas.removeEventListener('pointerenter', invalidateCanvasRect);
        canvas.removeEventListener('pointerdown', invalidateCanvasRect);
      },
    };
  });

  useEffect(
    () => () => {
      canvasListenersRef.current?.detach();
      canvasListenersRef.current = null;
    },
    [],
  );

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
