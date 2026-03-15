import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useEditor } from '@/app/EditorProvider';
import { useProject } from '@/app/ProjectProvider';
import { usePlanClipboardController } from '@/clipboard/usePlanClipboardController';
import { normalizeRectBounds } from '@/clipboard/planClipboard';
import { getFloorElevation } from '@/domain/floorModels';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import { usePhaseFilteredFloor } from '@/hooks/usePhaseFilteredFloor';
import { useEditorTool } from '@/editor/useEditorTool';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_FACTOR } from '@/domain/defaults';
import { formatSurveyorBearing, pointsToSurveyorBearing } from '@/geometry/bearing';
import { TOOLS } from '@/editor/tools';
import ClipboardPreviewLayer from './ClipboardPreviewLayer';
import CompassOverlay from '@/ui/CompassOverlay';
import GridRenderer from './GridRenderer';
import SlabRenderer from './SlabRenderer';
import WallRenderer from './WallRenderer';
import BeamRenderer from './BeamRenderer';
import StairRenderer from './StairRenderer';
import DoorRenderer from './DoorRenderer';
import WindowRenderer from './WindowRenderer';
import RoomRenderer from './RoomRenderer';
import AnnotationRenderer from './AnnotationRenderer';
import ElevationRenderer from './ElevationRenderer';
import SectionRenderer from './SectionRenderer';
import SelectionOverlay from './SelectionOverlay';
import DimensionPreview from './DimensionPreview';
import WallPreview from './WallPreview';
import LandingRenderer from './LandingRenderer';
import LandingPreview from './LandingPreview';
import ColumnRenderer from './ColumnRenderer';
import ColumnPreview from './ColumnPreview';
import FixtureDefs from './FixtureDefs';
import FixtureRenderer from './FixtureRenderer';
import FixturePreview from './FixturePreview';
import BeamPreview from './BeamPreview';
import StairPreview from './StairPreview';
import SlabPreview from './SlabPreview';
import DoorWindowPreview from './DoorWindowPreview';
import RoomPreview from './RoomPreview';
import SectionCutRenderer from './SectionCutRenderer';
import SectionCutPreview from './SectionCutPreview';
import RailingRenderer from './RailingRenderer';
import RailingPreview from './RailingPreview';
import RegionSelectionOverlay from './RegionSelectionOverlay';
import { CenterViewIcon, ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import { isTypingTarget } from '@/utils/keyboard';
import styles from './SvgCanvas.module.css';

function screenToModel(screenX, screenY, viewport, svgRect) {
  const x = (screenX - svgRect.left - viewport.panX) / viewport.zoom;
  const y = (screenY - svgRect.top - viewport.panY) / viewport.zoom;
  return { x, y };
}

export default function SvgCanvas() {
  const svgRef = useRef(null);
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const spaceHeld = useRef(false);
  const cursorPosRef = useRef({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  const { project, dispatch, getFloor } = useProject();
  const editor = useEditor();
  const {
    activeTool, selectedId, selectedType, toolState,
    viewport, showGrid, snapEnabled, activeFloorId, statusMessage, viewMode, activeSectionCutId,
    regionSelection, pastePreview, maximizedPanel,
    activePhaseId, phaseViewMode,
    dispatch: editorDispatch,
  } = editor;

  const floor = getFloor(activeFloorId);
  const filteredFloor = usePhaseFilteredFloor(floor, project, activePhaseId, phaseViewMode);
  const filteredProject = useMemo(
    () => filterProjectByPhase(project, activePhaseId, phaseViewMode),
    [project, activePhaseId, phaseViewMode]
  );
  const {
    copySelection,
    cutSelection,
    beginPaste,
    updatePastePreview,
    cancelPaste,
    placePaste,
    previewContent,
  } = usePlanClipboardController();

  const tool = useEditorTool({
    activeTool,
    dispatch,
    editorDispatch,
    project,
    getFloor,
    activeFloorId,
    viewport,
    snapEnabled,
    selectedId,
    selectedType,
    toolState,
    viewMode,
    activePhaseId,
  });

  const getModelPos = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return screenToModel(e.clientX, e.clientY, viewport, rect);
  }, [viewport]);

  const handleMouseDown = useCallback((e) => {
    // Middle mouse or space+left for pan
    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      isPanning.current = true;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    const modelPos = getModelPos(e);
    if (pastePreview?.active && e.button === 0) {
      placePaste(modelPos);
      return;
    }
    tool.onMouseDown(modelPos, e);
  }, [getModelPos, pastePreview, placePaste, tool]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning.current) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      editorDispatch({ type: 'PAN', dx, dy });
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const modelPos = getModelPos(e);
    cursorPosRef.current = modelPos;
    setCursorPos(modelPos);
    if (pastePreview?.active) {
      updatePastePreview(modelPos);
      return;
    }
    tool.onMouseMove(modelPos, e);
  }, [getModelPos, pastePreview, tool, updatePastePreview, editorDispatch]);

  const handleMouseUp = useCallback((e) => {
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }
    if (pastePreview?.active) return;
    const modelPos = getModelPos(e);
    tool.onMouseUp(modelPos, e);
  }, [getModelPos, pastePreview, tool]);

  const handleDoubleClick = useCallback((e) => {
    if (pastePreview?.active) return;
    const modelPos = getModelPos(e);
    tool.onDoubleClick(modelPos, e);
  }, [getModelPos, pastePreview, tool]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * factor));

    // Zoom centered on cursor
    const newPanX = mouseX - (mouseX - viewport.panX) * (newZoom / viewport.zoom);
    const newPanY = mouseY - (mouseY - viewport.panY) * (newZoom / viewport.zoom);

    editorDispatch({ type: 'ZOOM', zoom: newZoom, panX: newPanX, panY: newPanY });
  }, [viewport, editorDispatch]);

  const handleResetCenterPoint = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    editorDispatch({
      type: 'SET_VIEWPORT',
      viewport: {
        ...viewport,
        panX: rect.width / 2,
        panY: rect.height / 2,
      },
    });
  }, [editorDispatch, viewport]);

  useEffect(() => {
    if (!statusMessage) return undefined;

    const timer = window.setTimeout(() => {
      editorDispatch({ type: 'CLEAR_STATUS_MESSAGE' });
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [statusMessage, editorDispatch]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === ' ') {
        spaceHeld.current = true;
        e.preventDefault();
      }

      if ((e.ctrlKey || e.metaKey) && viewMode === 'plan') {
        const key = e.key.toLowerCase();
        if (key === 'c') {
          e.preventDefault();
          copySelection();
          return;
        }
        if (key === 'x') {
          e.preventDefault();
          cutSelection();
          return;
        }
        if (key === 'v') {
          e.preventDefault();
          beginPaste(cursorPosRef.current);
          return;
        }
      }

      if (e.key === 'Escape' && pastePreview?.active) {
        e.preventDefault();
        cancelPaste();
        return;
      }

      // Tool shortcuts
      if (viewMode === 'plan' && !e.ctrlKey && !e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
            return;
          case 'm':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.DIMENSION });
            return;
          case 'w':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.WALL });
            return;
          case 'b':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.BEAM });
            return;
          case 't':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.STAIR });
            return;
          case 'q':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SECTION });
            return;
          case 's':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SLAB });
            return;
          case 'r':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.ROOM });
            return;
          case 'd':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.DOOR });
            return;
          case 'n':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.WINDOW });
            return;
          case 'c':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.COLUMN });
            return;
          case 'l':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.LANDING });
            return;
          case 'h':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.RAILING });
            return;
          case 'f':
            editorDispatch({ type: 'SET_TOOL', tool: TOOLS.FIXTURE });
            editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { fixtureType: 'kitchenTop', previewRotation: 0 } });
            return;
        }
      }

      tool.onKeyDown(e);
    };

    const handleKeyUp = (e) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === ' ') {
        spaceHeld.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [beginPaste, cancelPaste, copySelection, cutSelection, pastePreview?.active, tool, editorDispatch, viewMode]);

  // Prevent default context menu on SVG
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const prevent = (e) => e.preventDefault();
    svg.addEventListener('contextmenu', prevent);
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('contextmenu', prevent);
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const cursor = spaceHeld.current ? 'grab' : pastePreview?.active ? 'copy' : tool.getCursor();
  const zoomPercent = Math.round(viewport.zoom * 1000);
  const displayedTool = viewMode.startsWith('elevation_') ? 'select' : activeTool;
  const isCanvasMaximized = maximizedPanel === 'canvas';
  const marqueeBounds = toolState.dragType === 'marquee' && toolState.startPos && toolState.currentPos
    ? normalizeRectBounds(toolState.startPos, toolState.currentPos)
    : null;
  const selectionCount = regionSelection?.objectCount || 0;
  const liveWallBearing = activeTool === TOOLS.WALL && toolState.start && toolState.preview
    ? formatSurveyorBearing(pointsToSurveyorBearing(toolState.start, toolState.preview))
    : null;

  return (
    <div className={styles.canvasContainer}>
      <CompassOverlay className={styles.compassDock} />
      <svg
        ref={svgRef}
        className={styles.svg}
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          {viewMode === 'plan' && showGrid && <GridRenderer />}
          {viewMode === 'plan' && showGrid && (
            <rect
              x={-100000} y={-100000}
              width={200000} height={200000}
              fill="url(#grid-major)"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {floor && (
            viewMode === 'plan' ? (
              <>
                <FixtureDefs />
                {(filteredFloor.slabs || []).map(slab => (
                  <SlabRenderer key={slab.id} slab={slab} selectedId={selectedId} />
                ))}
                <RoomRenderer rooms={filteredFloor.rooms} selectedId={selectedId} />
                <RoomPreview toolState={toolState} activeTool={activeTool} />
                <WallRenderer walls={filteredFloor.walls} columns={filteredFloor.columns || []} />
                <BeamRenderer beams={filteredFloor.beams || []} columns={filteredFloor.columns || []} />
                <StairRenderer stairs={filteredFloor.stairs || []} />
                <LandingRenderer landings={filteredFloor.landings || []} />
                <RailingRenderer railings={filteredFloor.railings || []} />
                <ColumnRenderer columns={filteredFloor.columns || []} />
                <FixtureRenderer fixtures={filteredFloor.fixtures || []} />
                <DoorRenderer doors={filteredFloor.doors} walls={filteredFloor.walls} />
                <WindowRenderer windows={filteredFloor.windows} walls={filteredFloor.walls} />
                {(floor.sectionCuts || []).map(sc => (
                  <SectionCutRenderer key={sc.id} sectionCut={sc} selectedId={selectedId} />
                ))}
                <AnnotationRenderer floor={floor} />
                <ClipboardPreviewLayer content={previewContent} />
                <RegionSelectionOverlay
                  marqueeBounds={marqueeBounds}
                  selectionBounds={regionSelection?.bounds || null}
                />
                <SelectionOverlay
                  selectedId={selectedId}
                  selectedType={selectedType}
                  floor={floor}
                  zoom={viewport.zoom}
                />
                <DimensionPreview toolState={toolState} activeTool={activeTool} />
                <WallPreview toolState={toolState} activeTool={activeTool} />
                <SlabPreview toolState={toolState} activeTool={activeTool} />
                <BeamPreview
                  toolState={toolState}
                  activeTool={activeTool}
                  columns={floor.columns || []}
                  floorLevel={getFloorElevation(floor)}
                />
                <StairPreview
                  toolState={toolState}
                  activeTool={activeTool}
                  floorId={floor.id}
                />
                <DoorWindowPreview
                  toolState={toolState}
                  activeTool={activeTool}
                  walls={floor.walls}
                />
                <SectionCutPreview toolState={toolState} activeTool={activeTool} />
                <RailingPreview toolState={toolState} activeTool={activeTool} />
                <ColumnPreview toolState={toolState} activeTool={activeTool} />
                <LandingPreview toolState={toolState} activeTool={activeTool} />
                <FixturePreview toolState={toolState} activeTool={activeTool} />
              </>
            ) : viewMode === 'section_view' ? (
              <SectionRenderer
                project={filteredProject}
                floor={filteredFloor}
                activeSectionCutId={activeSectionCutId}
              />
            ) : (
              <ElevationRenderer
                project={filteredProject}
                floor={filteredFloor}
                viewMode={viewMode}
                selectedId={selectedId}
                selectedType={selectedType}
              />
            )
          )}
        </g>
      </svg>
      <div className={styles.overlayControls}>
        <button
          type="button"
          className={styles.overlayBtn}
          onClick={handleResetCenterPoint}
          title="Reset center point"
          aria-label="Reset center point"
        >
          <CenterViewIcon />
        </button>
        <button
          type="button"
          className={styles.overlayBtn}
          onClick={() => editorDispatch({ type: 'TOGGLE_MAXIMIZE_PANEL', panel: 'canvas' })}
          title={isCanvasMaximized ? 'Restore split view' : 'Maximize canvas'}
          aria-label={isCanvasMaximized ? 'Restore split view' : 'Maximize canvas'}
        >
          {isCanvasMaximized ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      </div>
      <div className={styles.statusBar}>
        <span>X: {Math.round(cursorPos.x)} mm</span>
        <span>Y: {Math.round(cursorPos.y)} mm</span>
        <span>Zoom: {zoomPercent}%</span>
        <span>View: {viewMode}</span>
        <span>Tool: {displayedTool}</span>
        {activePhaseId && (
          <span>Phase: {(project.phases || []).find(p => p.id === activePhaseId)?.name || 'Unknown'} ({phaseViewMode})</span>
        )}
        {liveWallBearing && <span>Bearing: {liveWallBearing}</span>}
        {selectionCount > 0 && <span>Selection: {selectionCount} objects</span>}
        {pastePreview?.active && <span>Paste: click to place</span>}
        {statusMessage && <span className={styles.statusMessage}>{statusMessage}</span>}
      </div>
    </div>
  );
}
