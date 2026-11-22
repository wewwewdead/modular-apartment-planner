import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useEditorState, useViewport } from '@/features/floorplan/context/FloorplanContext';
import { useProject } from '@/features/floorplan/context/FloorplanContext';
import { useDragGestureRelease } from '@/features/floorplan/hooks/useDragGestureRelease';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_FACTOR } from '@/domain/defaults';
import { fitViewportToSheet } from '@/sheets/layout';
import { SHEET_TOKENS } from '@/sheets/standards';
import { hitTestViewport, hitTestViewportHandle, hitTestViewportRotationHandle } from '@/sheets/hitTest';
import { buildSheetScene } from '@/sheets/layout';
import styles from './SvgCanvas.module.css';
import SheetRenderer from './SheetRenderer';

function screenToSheet(screenX, screenY, viewport, svgRect) {
  const x = (screenX - svgRect.left - viewport.panX) / viewport.zoom;
  const y = (screenY - svgRect.top - viewport.panY) / viewport.zoom;
  return { x, y };
}

export default function SheetCanvas() {
  const svgRef = useRef(null);
  const dragState = useRef(null);
  const activePointerId = useRef(null);
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  // The pan's pointer moves since the last frame, sent as one PAN per frame
  // rather than one per move. Every way a pan ends sends what is left first.
  const pendingPan = useRef(null);
  const panFrame = useRef(0);
  // The <svg>'s box, measured once and kept until something can have moved it:
  // a resize (observer), a window resize or scroll, or the next press.
  const svgRect = useRef(null);
  const viewportRef = useRef(null);

  const { project, dispatch } = useProject();
  const { activeSheetId, selectedId, selectedType, dispatch: editorDispatch } = useEditorState();
  const viewport = useViewport();

  useDragGestureRelease(dispatch);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const sheet = (project.sheets || []).find((entry) => entry.id === activeSheetId) || null;
  // The one build of the scene: the visible sheet and the hidden PDF root are
  // both drawn from it, and the hit tests below read it.
  const scene = useMemo(() => buildSheetScene(project, sheet), [project, sheet]);

  const readSvgRect = useCallback(() => {
    if (!svgRect.current) svgRect.current = svgRef.current.getBoundingClientRect();
    return svgRect.current;
  }, []);

  const getSheetPos = useCallback(
    (event) => screenToSheet(event.clientX, event.clientY, viewport, readSvgRect()),
    [readSvgRect, viewport],
  );

  const flushPan = useCallback(() => {
    if (panFrame.current) {
      cancelAnimationFrame(panFrame.current);
      panFrame.current = 0;
    }
    const pan = pendingPan.current;
    pendingPan.current = null;
    if (pan) editorDispatch({ type: 'PAN', dx: pan.dx, dy: pan.dy });
  }, [editorDispatch]);

  const updateViewport = useCallback(
    (viewportId, updates) => {
      if (!sheet) return;
      const current = (sheet.viewports || []).find((entry) => entry.id === viewportId);
      if (!current) return;
      const sceneViewport = scene?.viewports.find((entry) => entry.id === viewportId) || null;
      const isManualEdit = ['x', 'y', 'width', 'height', 'rotation'].some((key) => key in updates);
      const baseViewport = sceneViewport
        ? {
            ...current,
            x: sceneViewport.x,
            y: sceneViewport.y,
            width: sceneViewport.width,
            height: sceneViewport.height,
            rotation: sceneViewport.rotation,
          }
        : current;
      const nextViewport = fitViewportToSheet(
        {
          ...baseViewport,
          ...updates,
          lockAutoLayout:
            'lockAutoLayout' in updates ? updates.lockAutoLayout : isManualEdit ? true : baseViewport.lockAutoLayout,
        },
        sheet,
      );
      dispatch({ type: 'SHEET_VIEWPORT_UPDATE', sheetId: sheet.id, viewport: nextViewport });
    },
    [dispatch, scene?.viewports, sheet],
  );

  const capturePointer = useCallback((pointerId) => {
    if (!svgRef.current) return;
    activePointerId.current = pointerId;
    try {
      svgRef.current.setPointerCapture(pointerId);
    } catch {
      activePointerId.current = pointerId;
    }
  }, []);

  const releasePointer = useCallback((pointerId = activePointerId.current) => {
    if (!svgRef.current || pointerId == null) {
      activePointerId.current = null;
      return;
    }
    try {
      if (svgRef.current.hasPointerCapture?.(pointerId)) {
        svgRef.current.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore browsers that reject release calls after capture is already gone.
    }
    activePointerId.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      if (activePointerId.current !== null && activePointerId.current !== event.pointerId) return;

      // Dragging a viewport rewrites the project on every pointer move, same as
      // the plan canvas: bracket it so the drag is one undo entry and one
      // coordination pass rather than one of each per frame.
      dispatch({ type: 'BEGIN_DRAG_GESTURE' });
      svgRect.current = null;

      if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
        capturePointer(event.pointerId);
        isPanning.current = true;
        lastPanPos.current = { x: event.clientX, y: event.clientY };
        event.preventDefault();
        return;
      }

      if (event.button !== 0) return;

      if (!sheet || !scene) return;

      const point = getSheetPos(event);

      if (selectedType === 'sheetViewport' && selectedId) {
        const selectedVp = scene.viewports.find((entry) => entry.id === selectedId);
        if (
          selectedVp &&
          hitTestViewportRotationHandle(point, selectedVp, Math.max(SHEET_TOKENS.viewportHandleSize, 6 / viewport.zoom))
        ) {
          const cx = selectedVp.x + selectedVp.width / 2;
          const cy = selectedVp.y + selectedVp.height / 2;
          dragState.current = {
            mode: 'rotate',
            viewportId: selectedId,
            center: { x: cx, y: cy },
            initialRotation: selectedVp.rotation || 0,
            startAngle: Math.atan2(point.y - cy, point.x - cx) * (180 / Math.PI),
          };
          capturePointer(event.pointerId);
          event.preventDefault();
          return;
        }
      }

      const handleViewportCandidates =
        selectedType === 'sheetViewport' && selectedId
          ? [
              ...scene.viewports.filter((entry) => entry.id === selectedId),
              ...scene.viewports.filter((entry) => entry.id !== selectedId),
            ]
          : scene.viewports;

      const handleHit = hitTestViewportHandle(
        point,
        handleViewportCandidates,
        Math.max(SHEET_TOKENS.viewportHandleSize, 6 / viewport.zoom),
      );

      if (handleHit) {
        editorDispatch({ type: 'SELECT_OBJECT', id: handleHit.viewportId, objectType: 'sheetViewport' });
        const selectedViewport = scene.viewports.find((entry) => entry.id === handleHit.viewportId);
        dragState.current = {
          mode: 'resize',
          viewportId: handleHit.viewportId,
          handle: handleHit.handle,
          origin: point,
          initialViewport: selectedViewport || sheet.viewports.find((entry) => entry.id === handleHit.viewportId),
        };
        capturePointer(event.pointerId);
        event.preventDefault();
        return;
      }

      const viewportHit = hitTestViewport(point, scene.viewports);
      if (viewportHit) {
        editorDispatch({ type: 'SELECT_OBJECT', id: viewportHit.id, objectType: 'sheetViewport' });
        dragState.current = {
          mode: 'move',
          viewportId: viewportHit.id,
          origin: point,
          initialViewport: viewportHit,
        };
        capturePointer(event.pointerId);
        event.preventDefault();
        return;
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: sheet.id, objectType: 'sheet' });
      dragState.current = null;
    },
    [
      activePointerId,
      capturePointer,
      dispatch,
      editorDispatch,
      getSheetPos,
      scene,
      selectedId,
      selectedType,
      sheet,
      viewport.zoom,
    ],
  );

  /*
   * A drag or pan whose release will never arrive: the pointer lost its
   * capture, the window lost focus, or a move came with no button held. It ends
   * where it stands, as a release would — what it already wrote is kept, as one
   * undo step — and the store's gesture is closed here, because no window
   * release is coming to close it.
   */
  const abandonDrag = useCallback(() => {
    if (!dragState.current && !isPanning.current) return;
    flushPan();
    isPanning.current = false;
    dragState.current = null;
    releasePointer();
    dispatch({ type: 'END_DRAG_GESTURE' });
  }, [dispatch, flushPan, releasePointer]);

  const handlePointerMove = useCallback(
    (event) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;

      if ((isPanning.current || dragState.current) && event.buttons === 0) {
        abandonDrag();
        return;
      }

      if (isPanning.current) {
        const dx = event.clientX - lastPanPos.current.x;
        const dy = event.clientY - lastPanPos.current.y;
        const pending = pendingPan.current;
        pendingPan.current = pending ? { dx: pending.dx + dx, dy: pending.dy + dy } : { dx, dy };
        if (!panFrame.current) {
          panFrame.current = requestAnimationFrame(() => {
            panFrame.current = 0;
            flushPan();
          });
        }
        lastPanPos.current = { x: event.clientX, y: event.clientY };
        return;
      }

      if (!dragState.current || !sheet) return;

      const point = getSheetPos(event);
      const { mode } = dragState.current;

      if (mode === 'rotate') {
        const { center, initialRotation, startAngle, viewportId } = dragState.current;
        const currentAngle = Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI);
        let newRotation = initialRotation + (currentAngle - startAngle);
        if (event.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15;
        }
        newRotation = ((newRotation % 360) + 360) % 360;
        updateViewport(viewportId, { rotation: newRotation });
        return;
      }

      const { initialViewport, origin, handle, viewportId } = dragState.current;
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;

      if (mode === 'move') {
        updateViewport(viewportId, {
          x: initialViewport.x + dx,
          y: initialViewport.y + dy,
        });
        return;
      }

      const next = {
        x: initialViewport.x,
        y: initialViewport.y,
        width: initialViewport.width,
        height: initialViewport.height,
      };

      if (handle.includes('n')) {
        next.y = initialViewport.y + dy;
        next.height = initialViewport.height - dy;
      }
      if (handle.includes('s')) {
        next.height = initialViewport.height + dy;
      }
      if (handle.includes('w')) {
        next.x = initialViewport.x + dx;
        next.width = initialViewport.width - dx;
      }
      if (handle.includes('e')) {
        next.width = initialViewport.width + dx;
      }

      updateViewport(viewportId, next);
    },
    [abandonDrag, flushPan, getSheetPos, sheet, updateViewport],
  );

  const handlePointerUp = useCallback(
    (event) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
      flushPan();
      isPanning.current = false;
      dragState.current = null;
      releasePointer(event.pointerId);
    },
    [flushPan, releasePointer],
  );

  const handlePointerCancel = useCallback(
    (event) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
      flushPan();
      isPanning.current = false;
      dragState.current = null;
      releasePointer(event.pointerId);
    },
    [flushPan, releasePointer],
  );

  const handleLostPointerCapture = useCallback(
    (event) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
      abandonDrag();
    },
    [abandonDrag],
  );

  /*
   * Escape mid-drag puts the viewport back where the press found it. The drag
   * has rewritten the project every frame, and its first frame stored the
   * pre-drag project as the gesture's one history entry: CANCEL_DRAG_GESTURE
   * restores exactly that and takes the entry off again. Only while the drag's
   * own viewport is still selected — an undo mid-drag deselects, and has
   * already taken that entry, so cancelling would take the one before it. The
   * drag is dropped either way, so the moves and the release that follow do
   * nothing. A pan has nothing to put back and is left to its release.
   */
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const drag = dragState.current;
      if (!drag) return;
      event.preventDefault();
      if (selectedType === 'sheetViewport' && selectedId === drag.viewportId) {
        dispatch({ type: 'CANCEL_DRAG_GESTURE' });
      }
      dragState.current = null;
      releasePointer();
    };
    const handleBlur = () => abandonDrag();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
    };
  }, [abandonDrag, dispatch, releasePointer, selectedId, selectedType]);

  // Reads the view through a ref, so the listener below is bound once rather
  // than again on every pan and zoom. A pan still waiting for its frame is part
  // of the view being zoomed: it is folded into this zoom's absolute pan and
  // dropped, never sent after it.
  const handleWheel = useCallback(
    (event) => {
      event.preventDefault();
      const rect = readSvgRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const pending = pendingPan.current;
      if (panFrame.current) {
        cancelAnimationFrame(panFrame.current);
        panFrame.current = 0;
      }
      pendingPan.current = null;
      const current = viewportRef.current;
      const currentPanX = current.panX + (pending?.dx || 0);
      const currentPanY = current.panY + (pending?.dy || 0);
      const direction = event.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor));
      const panX = mouseX - (mouseX - currentPanX) * (newZoom / current.zoom);
      const panY = mouseY - (mouseY - currentPanY) * (newZoom / current.zoom);
      editorDispatch({ type: 'ZOOM', zoom: newZoom, panX, panY });
    },
    [editorDispatch, readSvgRect],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const prevent = (event) => event.preventDefault();
    svg.addEventListener('contextmenu', prevent);
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('contextmenu', prevent);
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // What can move the <svg> drops its cached box; the next read measures it.
  // A pan frame still waiting when the canvas goes is dropped with it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const invalidate = () => {
      svgRect.current = null;
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(invalidate) : null;
    observer?.observe(svg);
    window.addEventListener('resize', invalidate);
    window.addEventListener('scroll', invalidate, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate, true);
      if (panFrame.current) cancelAnimationFrame(panFrame.current);
      panFrame.current = 0;
      pendingPan.current = null;
    };
  }, []);

  return (
    <div className={styles.canvasContainer}>
      <svg
        ref={svgRef}
        className={styles.svg}
        style={{ cursor: dragState.current ? 'grabbing' : 'default', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          {sheet ? (
            <SheetRenderer
              project={project}
              sheet={sheet}
              scene={scene}
              selectedId={selectedId}
              selectedType={selectedType}
            />
          ) : (
            <g className="sheet-empty">
              <rect x={0} y={0} width={420} height={297} fill="#f6f7f9" stroke="#d0d6de" strokeDasharray="2 2" />
              <text x={210} y={148} textAnchor="middle" dominantBaseline="middle" fill="#66768a" fontSize={12}>
                Create a sheet from the sidebar or properties panel.
              </text>
            </g>
          )}
        </g>
      </svg>
      {sheet && scene && (
        <svg
          data-sheet-export-root="true"
          width={scene.paper.width}
          height={scene.paper.height}
          viewBox={`0 0 ${scene.paper.width} ${scene.paper.height}`}
          style={{
            position: 'absolute',
            width: 0,
            height: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            opacity: 0,
          }}
          aria-hidden="true"
        >
          <SheetRenderer project={project} sheet={sheet} scene={scene} selectedId={null} selectedType={null} />
        </svg>
      )}
      <div className={styles.statusBar}>
        <span>Workspace: sheet</span>
        <span>Sheet: {sheet?.title || 'None'}</span>
        <span>Zoom: {Math.round(viewport.zoom * 100)}%</span>
      </div>
    </div>
  );
}
