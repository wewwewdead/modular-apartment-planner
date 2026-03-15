import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEditor } from '@/app/EditorProvider';
import { useProject } from '@/app/ProjectProvider';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_FACTOR } from '@/domain/defaults';
import { fitViewportToSheet } from '@/sheets/layout';
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
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  const { project, dispatch } = useProject();
  const {
    activeSheetId,
    selectedId,
    selectedType,
    viewport,
    dispatch: editorDispatch,
  } = useEditor();

  const sheet = (project.sheets || []).find((entry) => entry.id === activeSheetId) || null;
  const scene = useMemo(() => buildSheetScene(project, sheet), [project, sheet]);

  const getSheetPos = useCallback((event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return screenToSheet(event.clientX, event.clientY, viewport, rect);
  }, [viewport]);

  const updateViewport = useCallback((viewportId, updates) => {
    if (!sheet) return;
    const current = (sheet.viewports || []).find((entry) => entry.id === viewportId);
    if (!current) return;
    const nextViewport = fitViewportToSheet({ ...current, ...updates }, sheet);
    dispatch({ type: 'SHEET_VIEWPORT_UPDATE', sheetId: sheet.id, viewport: nextViewport });
  }, [dispatch, sheet]);

  const handleMouseDown = useCallback((event) => {
    if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
      isPanning.current = true;
      lastPanPos.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      return;
    }

    if (!sheet || !scene) return;

    const point = getSheetPos(event);

    if (selectedType === 'sheetViewport' && selectedId) {
      const selectedVp = scene.viewports.find((entry) => entry.id === selectedId);
      if (selectedVp && hitTestViewportRotationHandle(point, selectedVp, 6 / viewport.zoom)) {
        const cx = selectedVp.x + selectedVp.width / 2;
        const cy = selectedVp.y + selectedVp.height / 2;
        dragState.current = {
          mode: 'rotate',
          viewportId: selectedId,
          center: { x: cx, y: cy },
          initialRotation: selectedVp.rotation || 0,
          startAngle: Math.atan2(point.y - cy, point.x - cx) * (180 / Math.PI),
        };
        return;
      }
    }

    const handleHit = selectedType === 'sheetViewport' && selectedId
      ? hitTestViewportHandle(point, scene.viewports.filter((entry) => entry.id === selectedId), 6 / viewport.zoom)
      : null;

    if (handleHit) {
      dragState.current = {
        mode: 'resize',
        viewportId: handleHit.viewportId,
        handle: handleHit.handle,
        origin: point,
        initialViewport: sheet.viewports.find((entry) => entry.id === handleHit.viewportId),
      };
      return;
    }

    const viewportHit = hitTestViewport(point, scene.viewports);
    if (viewportHit) {
      editorDispatch({ type: 'SELECT_OBJECT', id: viewportHit.id, objectType: 'sheetViewport' });
      dragState.current = {
        mode: 'move',
        viewportId: viewportHit.id,
        origin: point,
        initialViewport: sheet.viewports.find((entry) => entry.id === viewportHit.id),
      };
      return;
    }

    editorDispatch({ type: 'SELECT_OBJECT', id: sheet.id, objectType: 'sheet' });
    dragState.current = null;
  }, [editorDispatch, getSheetPos, scene, selectedId, selectedType, sheet, viewport.zoom]);

  const handleMouseMove = useCallback((event) => {
    if (isPanning.current) {
      const dx = event.clientX - lastPanPos.current.x;
      const dy = event.clientY - lastPanPos.current.y;
      editorDispatch({ type: 'PAN', dx, dy });
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
  }, [editorDispatch, getSheetPos, sheet, updateViewport]);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
    dragState.current = null;
  }, []);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const direction = event.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * factor));
    const panX = mouseX - (mouseX - viewport.panX) * (newZoom / viewport.zoom);
    const panY = mouseY - (mouseY - viewport.panY) * (newZoom / viewport.zoom);
    editorDispatch({ type: 'ZOOM', zoom: newZoom, panX, panY });
  }, [editorDispatch, viewport]);

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

  return (
    <div className={styles.canvasContainer}>
      <svg
        ref={svgRef}
        className={styles.svg}
        style={{ cursor: dragState.current ? 'grabbing' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          {sheet ? (
            <SheetRenderer
              project={project}
              sheet={sheet}
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
          <SheetRenderer
            project={project}
            sheet={sheet}
            selectedId={null}
            selectedType={null}
          />
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
