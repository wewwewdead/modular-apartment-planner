import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useEditor } from '@/features/floorplan/context/FloorplanContext';
import { useProject } from '@/features/floorplan/context/FloorplanContext';
import { usePlanClipboardController } from '@/features/floorplan/hooks/usePlanClipboardController';
import { useDragGestureRelease } from '@/features/floorplan/hooks/useDragGestureRelease';
import { useFloorOverhangs } from '@/features/floorplan/hooks/useFloorOverhangs';
import { getOrderedFloors } from '@/domain/floorModels';
import { resolveRoofSectionCut } from '@/domain/roofModels';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import { buildProjectSectionScene } from '@/sections/scene';
import { getSectionVisibilityMessage, SECTION_VISIBILITY_REASONS } from '@/sections/diagnostics';
import { usePhaseFilteredFloor } from '@/hooks/usePhaseFilteredFloor';
import { useEditorTool } from '@/editor/useEditorTool';
import { applyWallDragPreview } from '@/features/floorplan/utils/wallDragPreview';
import { describeWallEditRejection } from '@/domain/modelGraph';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_FACTOR } from '@/domain/defaults';
import { formatSurveyorBearing, pointsToSurveyorBearing } from '@/geometry/bearing';
import { TOOLS } from '@/editor/tools';
import { isTypingTarget } from '@/utils/keyboard';
import CompassOverlay from '@/features/floorplan/components/CompassOverlay';
import { CanvasZoomProvider } from './CanvasZoomContext';
import FloorScene from './FloorScene';
import GridRenderer from './GridRenderer';
import RoofScene from './RoofScene';
import TrussScene from './TrussScene';
import BeamLevelChip from './BeamLevelChip';
import ElectricalDeviceChip from './ElectricalDeviceChip';
import CanvasOverlayControls from './CanvasOverlayControls';
import CanvasStatusBar from './CanvasStatusBar';
import { RenderProfilerScope, useRenderProfile } from './renderProfiling';
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
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const cursorPosRef = useRef({ x: 0, y: 0 });
  const pendingMoveEvent = useRef(null);
  const moveFrame = useRef(0);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  const { project, derived, dispatch, getFloor } = useProject();
  const editor = useEditor();
  const {
    activeTool,
    selectedId,
    selectedType,
    selectedOverhangEdge,
    toolState,
    viewport,
    showGrid,
    snapEnabled,
    showFloorBelowUnderlay,
    activeFloorId,
    statusMessage,
    viewMode,
    activeSectionCutId,
    regionSelection,
    pastePreview,
    focusedPanel,
    modelTarget,
    activePhaseId,
    phaseViewMode,
    lastRejection,
    sunStudy,
    dispatch: editorDispatch,
  } = editor;

  // During a wall drag the committed floor never changes; overlay the live
  // preview geometry (dragged wall + healed neighbors) for everything below.
  const committedFloor = getFloor(activeFloorId);
  const wallDragPreview = toolState.wallDragPreview || null;
  const floor = useMemo(() => applyWallDragPreview(committedFloor, wallDragPreview), [committedFloor, wallDragPreview]);
  const filteredFloor = usePhaseFilteredFloor(floor, project, activePhaseId, phaseViewMode);
  // The floor immediately below the active one in stack order, for the ghost
  // underlay. Deliberately the UNFILTERED floor: the underlay answers "what am I
  // standing on", which does not change because a phase is being reviewed. The
  // memo keys on the floors array, so the object identity handed to the
  // memoized underlay only changes when that floor is actually edited.
  const floorBelow = useMemo(() => {
    if (!activeFloorId) return null;
    const ordered = getOrderedFloors(project.floors || []);
    const index = ordered.findIndex((entry) => entry.id === activeFloorId);
    return index > 0 ? ordered[index - 1] : null;
  }, [activeFloorId, project.floors]);
  // Only the active floor's cantilevers are drawn — the indicator annotates the
  // plan on screen, not the whole stack. Null rather than an empty array so the
  // memoized scene is not re-rendered by a fresh [] on every floor switch.
  const overhangs = useFloorOverhangs(project.floors);
  const floorOverhangs = useMemo(() => {
    const forFloor = overhangs.filter((entry) => entry.floorId === activeFloorId);
    return forFloor.length ? forFloor : null;
  }, [overhangs, activeFloorId]);
  const filteredProject = useMemo(
    () => filterProjectByPhase(project, activePhaseId, phaseViewMode),
    [project, activePhaseId, phaseViewMode],
  );
  const roofSystem = filteredProject.roofSystem || null;
  const roofHiddenByPhase = Boolean(project.roofSystem && !roofSystem);
  const hasProjectRoof = Boolean(project.roofSystem);
  const hasProjectRailings = Boolean((project.floors || []).some((entry) => (entry.railings || []).length));
  const visibleProjectRailings = Boolean((filteredProject.floors || []).some((entry) => (entry.railings || []).length));
  const railingsHiddenByPhase = Boolean(hasProjectRailings && !visibleProjectRailings);
  const hasProjectTrusses = Boolean((filteredProject.trussSystems || []).length);
  const floorTrussSystems = (filteredProject.trussSystems || []).filter((ts) => ts.floorId === activeFloorId);
  const allFloorTrussSystems = (project.trussSystems || []).filter((ts) => ts.floorId === activeFloorId);
  const trussesHiddenByPhase = Boolean(allFloorTrussSystems.length && !floorTrussSystems.length);
  const activeTrussContext = useMemo(() => {
    if (selectedType === 'trussSystem') {
      const trussSystem = (filteredProject.trussSystems || []).find((entry) => entry.id === selectedId) || null;
      return { trussSystem, trussInstanceId: null };
    }
    if (selectedType === 'trussInstance') {
      const trussSystem =
        (filteredProject.trussSystems || []).find((entry) =>
          (entry.trussInstances || []).some((ti) => ti.id === selectedId),
        ) || null;
      return { trussSystem, trussInstanceId: selectedId };
    }
    return {
      trussSystem: floorTrussSystems[0] || null,
      trussInstanceId: floorTrussSystems[0]?.trussInstances?.[0]?.id || null,
    };
  }, [filteredProject.trussSystems, floorTrussSystems, selectedId, selectedType]);

  const { copySelection, cutSelection, beginPaste, updatePastePreview, cancelPaste, placePaste, previewContent } =
    usePlanClipboardController();

  const tool = useEditorTool({
    activeTool,
    dispatch,
    editorDispatch,
    project,
    getFloor,
    activeFloorId,
    floorBelow,
    showFloorBelowUnderlay,
    roofSystem,
    trussSystems: floorTrussSystems,
    modelTarget,
    viewport,
    snapEnabled,
    selectedId,
    selectedType,
    toolState,
    viewMode,
    activePhaseId,
  });

  const getModelPos = useCallback(
    (e) => {
      const rect = svgRef.current.getBoundingClientRect();
      return screenToModel(e.clientX, e.clientY, viewport, rect);
    },
    [viewport],
  );

  // --- Mouse/pointer handlers ---

  const handleMouseDown = useCallback(
    (e) => {
      // Opens a drag gesture for the store: everything this pointer-down goes on
      // to change collapses into one undo entry, and the whole-project
      // coordination pass waits for the release instead of running per frame.
      dispatch({ type: 'BEGIN_DRAG_GESTURE' });

      if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
        isPanning.current = true;
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }
      const modelPos = getModelPos(e);
      if (modelTarget === 'floor' && pastePreview?.active && e.button === 0) {
        placePaste(modelPos);
        return;
      }
      tool.onMouseDown(modelPos, e);
    },
    [dispatch, getModelPos, modelTarget, pastePreview, placePaste, tool],
  );

  const processMouseMove = useCallback(
    (e) => {
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
      if (modelTarget === 'floor' && pastePreview?.active) {
        updatePastePreview(modelPos);
        return;
      }
      tool.onMouseMove(modelPos, e);
    },
    [getModelPos, modelTarget, pastePreview, tool, updatePastePreview, editorDispatch],
  );

  /*
   * Pointer moves are coalesced to one per animation frame. A mouse reports
   * moves far faster than the screen refreshes (a 1000 Hz mouse fires ~16 times
   * per frame), and every drag move runs a model edit and a re-render whose
   * result is never painted — the extra work only steals from the frame that
   * does get painted. Only the newest position matters, so intermediate events
   * are dropped rather than queued: handlers read an absolute cursor position,
   * so a skipped sample changes nothing about where the object lands.
   */
  const handleMouseMove = useCallback(
    (e) => {
      pendingMoveEvent.current = e;
      if (moveFrame.current) return;

      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = 0;
        const pending = pendingMoveEvent.current;
        pendingMoveEvent.current = null;
        if (pending) processMouseMove(pending);
      });
    },
    [processMouseMove],
  );

  const handleMouseUp = useCallback(
    (e) => {
      /*
       * A move still queued at release is dropped, not flushed. Handlers that
       * commit on mouse-up read the tool state the last processed frame wrote —
       * the wall drag commits the preview geometry it drew — and running one
       * more move here would update that state after the closure this handler
       * already holds, committing a position that was never drawn. Dropping it
       * costs at most one frame of pointer travel and keeps what lands on the
       * plan identical to what was last on screen.
       */
      if (moveFrame.current) {
        cancelAnimationFrame(moveFrame.current);
        moveFrame.current = 0;
      }
      pendingMoveEvent.current = null;

      if (isPanning.current) {
        isPanning.current = false;
        return;
      }
      if (modelTarget === 'floor' && pastePreview?.active) return;
      const modelPos = getModelPos(e);
      tool.onMouseUp(modelPos, e);
    },
    [getModelPos, modelTarget, pastePreview, tool],
  );

  useDragGestureRelease(dispatch);

  useEffect(
    () => () => {
      if (moveFrame.current) cancelAnimationFrame(moveFrame.current);
    },
    [],
  );

  const handleDoubleClick = useCallback(
    (e) => {
      if (modelTarget === 'floor' && pastePreview?.active) return;
      const modelPos = getModelPos(e);
      tool.onDoubleClick(modelPos, e);
    },
    [getModelPos, modelTarget, pastePreview, tool],
  );

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const direction = e.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * factor));
      const newPanX = mouseX - (mouseX - viewport.panX) * (newZoom / viewport.zoom);
      const newPanY = mouseY - (mouseY - viewport.panY) * (newZoom / viewport.zoom);
      editorDispatch({ type: 'ZOOM', zoom: newZoom, panX: newPanX, panY: newPanY });
    },
    [viewport, editorDispatch],
  );

  const handleResetCenterPoint = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    editorDispatch({
      type: 'SET_VIEWPORT',
      viewport: { ...viewport, panX: rect.width / 2, panY: rect.height / 2 },
    });
  }, [editorDispatch, viewport]);

  const handleToggleFocus = useCallback(() => {
    editorDispatch({ type: 'TOGGLE_FOCUS_PANEL', panel: 'canvas' });
  }, [editorDispatch]);

  // --- Effects ---

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timer = window.setTimeout(() => editorDispatch({ type: 'CLEAR_STATUS_MESSAGE' }), 2500);
    return () => window.clearTimeout(timer);
  }, [statusMessage, editorDispatch]);

  // Authoritative reducer rejections (a dispatcher forgot to pre-validate, or
  // raced a state change) surface through the same status-message toast.
  useEffect(() => {
    if (!lastRejection) return;
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: describeWallEditRejection(lastRejection.reason) });
  }, [lastRejection, editorDispatch]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === ' ') {
        spaceHeld.current = true;
        setIsSpaceHeld(true);
        e.preventDefault();
      }

      if ((e.ctrlKey || e.metaKey) && viewMode === 'plan' && modelTarget === 'floor') {
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

      if (e.key === 'Escape' && modelTarget === 'floor' && pastePreview?.active) {
        e.preventDefault();
        cancelPaste();
        return;
      }

      if (viewMode === 'plan' && !e.ctrlKey && !e.metaKey) {
        if (modelTarget === 'roof') {
          switch (e.key.toLowerCase()) {
            case 'v':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
              return;
            case 'p':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.ROOF_PARAPET });
              return;
            case 'g':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.ROOF_DRAIN });
              return;
            case 'o':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.ROOF_OPENING });
              return;
          }
        } else if (modelTarget === 'truss') {
          switch (e.key.toLowerCase()) {
            case 'v':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
              return;
            case 't': {
              const targetTrussSystem =
                selectedType === 'trussSystem'
                  ? floorTrussSystems.find((entry) => entry.id === selectedId) || null
                  : selectedType === 'trussInstance'
                    ? floorTrussSystems.find((entry) =>
                        (entry.trussInstances || []).some((ti) => ti.id === selectedId),
                      ) || null
                    : null;
              const selectedTrussInstance =
                selectedType === 'trussInstance' && targetTrussSystem
                  ? (targetTrussSystem.trussInstances || []).find((entry) => entry.id === selectedId) || null
                  : null;
              const lastSystemInstance =
                targetTrussSystem && (targetTrussSystem.trussInstances || []).length
                  ? targetTrussSystem.trussInstances[targetTrussSystem.trussInstances.length - 1]
                  : null;
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.TRUSS_DRAW });
              editorDispatch({
                type: 'UPDATE_TOOL_STATE',
                payload: {
                  targetTrussSystemId: targetTrussSystem?.id || null,
                  trussTypeId: selectedTrussInstance?.trussTypeId || lastSystemInstance?.trussTypeId || null,
                  trussMaterial: selectedTrussInstance?.material || lastSystemInstance?.material || null,
                },
              });
              return;
            }
          }
        } else {
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
            case 'p':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.CEILING });
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
            case 'e':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.ELECTRICAL });
              return;
            case 'f':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.FIXTURE });
              editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { fixtureType: 'kitchenTop', previewRotation: 0 } });
              return;
            case 'g':
              editorDispatch({ type: 'SET_TOOL', tool: TOOLS.FILLET });
              return;
          }
        }
      }

      tool.onKeyDown(e);
    };

    const handleKeyUp = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === ' ') {
        spaceHeld.current = false;
        setIsSpaceHeld(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    beginPaste,
    cancelPaste,
    copySelection,
    cutSelection,
    modelTarget,
    pastePreview?.active,
    tool,
    editorDispatch,
    viewMode,
    selectedId,
    selectedType,
    floorTrussSystems,
  ]);

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

  // --- Derived values ---

  const cursor = isSpaceHeld ? 'grab' : modelTarget === 'floor' && pastePreview?.active ? 'copy' : tool.getCursor();
  const zoomPercent = Math.round(viewport.zoom * 1000);
  const displayedTool = viewMode.startsWith('elevation_') ? 'select' : activeTool;
  const isCanvasFocused = focusedPanel === 'canvas';
  const selectionCount = regionSelection?.objectCount || 0;
  const liveWallBearing =
    modelTarget === 'floor' && activeTool === TOOLS.WALL && toolState.start && toolState.preview
      ? formatSurveyorBearing(pointsToSurveyorBearing(toolState.start, toolState.preview))
      : null;
  const hasRoofSectionCut = Boolean(resolveRoofSectionCut(project, activeFloorId, activeSectionCutId).sectionCut);
  const hasTrussSectionCut = Boolean((floor?.sectionCuts || []).length);
  const floorSectionCutCount = (filteredFloor?.sectionCuts || []).length;

  // Section scene memos
  const roofSectionScene = useMemo(() => {
    if (modelTarget !== 'roof' || viewMode !== 'section_view') return null;
    const { floor: roofFloor, sectionCut } = resolveRoofSectionCut(project, activeFloorId, activeSectionCutId);
    if (!roofFloor || !sectionCut) return null;
    return buildProjectSectionScene(filteredProject, roofFloor.id, sectionCut.id);
  }, [activeFloorId, activeSectionCutId, filteredProject, modelTarget, project, viewMode]);

  const roofSectionReason = roofHiddenByPhase
    ? SECTION_VISIBILITY_REASONS.HIDDEN_BY_PHASE
    : roofSectionScene?.diagnostics?.roof?.reason || null;
  const roofSectionMessage = getSectionVisibilityMessage('roof', roofSectionReason);

  const trussSectionScene = useMemo(() => {
    if (modelTarget !== 'truss' || viewMode !== 'section_view' || !filteredFloor) return null;
    const cuts = filteredFloor.sectionCuts || [];
    const sectionCut = (activeSectionCutId && cuts.find((entry) => entry.id === activeSectionCutId)) || cuts[0] || null;
    if (!sectionCut) return null;
    return buildProjectSectionScene(filteredProject, filteredFloor.id, sectionCut.id);
  }, [activeSectionCutId, filteredFloor, filteredProject, modelTarget, viewMode]);

  const trussSectionMessage = getSectionVisibilityMessage(
    'truss',
    trussSectionScene?.diagnostics?.truss?.reason || null,
  );

  const floorSectionScene = useMemo(() => {
    if (modelTarget !== 'floor' || viewMode !== 'section_view' || !filteredFloor) return null;
    const cuts = filteredFloor.sectionCuts || [];
    const sectionCut = (activeSectionCutId && cuts.find((entry) => entry.id === activeSectionCutId)) || cuts[0] || null;
    if (!sectionCut) return null;
    return buildProjectSectionScene(filteredProject, filteredFloor.id, sectionCut.id);
  }, [activeSectionCutId, filteredFloor, filteredProject, modelTarget, viewMode]);

  const floorRoofSectionReason = roofHiddenByPhase
    ? SECTION_VISIBILITY_REASONS.HIDDEN_BY_PHASE
    : floorSectionScene?.diagnostics?.roof?.reason || null;
  const floorRoofSectionMessage =
    hasProjectRoof || roofHiddenByPhase ? getSectionVisibilityMessage('roof', floorRoofSectionReason) : null;
  const floorRailingSectionReason = railingsHiddenByPhase
    ? SECTION_VISIBILITY_REASONS.HIDDEN_BY_PHASE
    : floorSectionScene?.diagnostics?.railing?.reason || null;
  const floorRailingSectionMessage =
    hasProjectRailings || railingsHiddenByPhase
      ? getSectionVisibilityMessage('railing', floorRailingSectionReason)
      : null;

  useRenderProfile('SvgCanvas', {
    cursorX: Math.round(cursorPos.x),
    cursorY: Math.round(cursorPos.y),
    viewMode,
    modelTarget,
    activeTool,
    dragType: toolState.dragType || null,
    pastePreviewActive: Boolean(pastePreview?.active),
    zoom: viewport.zoom,
    panX: viewport.panX,
    panY: viewport.panY,
    statusMessage,
  });

  // --- Render ---

  return (
    <RenderProfilerScope name="SvgCanvas">
      <div className={styles.canvasContainer}>
        <CompassOverlay className={styles.compassDock} />
        <BeamLevelChip
          activeTool={activeTool}
          viewMode={viewMode}
          modelTarget={modelTarget}
          floor={floor}
          beamPlacementMode={toolState.beamPlacementMode}
          editorDispatch={editorDispatch}
        />
        <ElectricalDeviceChip
          activeTool={activeTool}
          viewMode={viewMode}
          modelTarget={modelTarget}
          floor={floor}
          deviceType={toolState.deviceType}
          editorDispatch={editorDispatch}
        />
        <svg
          ref={svgRef}
          className={styles.svg}
          style={{ cursor }}
          onPointerDown={handleMouseDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <CanvasZoomProvider value={viewport.zoom}>
            <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
              {viewMode === 'plan' && showGrid && <GridRenderer />}
              {viewMode === 'plan' && showGrid && (
                <rect
                  x={-100000}
                  y={-100000}
                  width={200000}
                  height={200000}
                  fill="url(#grid-major)"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {modelTarget === 'roof' ? (
                <RoofScene
                  roofSystem={roofSystem}
                  roofHiddenByPhase={roofHiddenByPhase}
                  viewMode={viewMode}
                  selectedId={selectedId}
                  selectedType={selectedType}
                  activeTool={activeTool}
                  toolState={toolState}
                  viewport={viewport}
                  filteredProject={filteredProject}
                  activeFloorId={activeFloorId}
                  activeSectionCutId={activeSectionCutId}
                />
              ) : modelTarget === 'truss' ? (
                <TrussScene
                  filteredFloor={filteredFloor}
                  floorTrussSystems={floorTrussSystems}
                  hasProjectTrusses={hasProjectTrusses}
                  trussesHiddenByPhase={trussesHiddenByPhase}
                  viewMode={viewMode}
                  selectedId={selectedId}
                  selectedType={selectedType}
                  activeTool={activeTool}
                  toolState={toolState}
                  viewport={viewport}
                  activeTrussContext={activeTrussContext}
                  filteredProject={filteredProject}
                  activeSectionCutId={activeSectionCutId}
                />
              ) : (
                <FloorScene
                  floor={floor}
                  filteredFloor={filteredFloor}
                  filteredProject={filteredProject}
                  floorBelow={floorBelow}
                  showFloorBelowUnderlay={showFloorBelowUnderlay}
                  floorOverhangs={floorOverhangs}
                  selectedOverhangEdge={selectedOverhangEdge}
                  sunStudy={sunStudy}
                  structuralLoadPath={derived?.structuralLoadPath}
                  viewMode={viewMode}
                  selectedId={selectedId}
                  selectedType={selectedType}
                  activeTool={activeTool}
                  toolState={toolState}
                  zoom={viewport.zoom}
                  previewContent={previewContent}
                  regionSelection={regionSelection}
                  activeSectionCutId={activeSectionCutId}
                  roofHiddenByPhase={roofHiddenByPhase}
                  hasProjectRoof={hasProjectRoof}
                  railingsHiddenByPhase={railingsHiddenByPhase}
                  hasProjectRailings={hasProjectRailings}
                />
              )}
            </g>
          </CanvasZoomProvider>
        </svg>
        <CanvasOverlayControls
          onResetCenter={handleResetCenterPoint}
          onToggleFocus={handleToggleFocus}
          isFocused={isCanvasFocused}
        />
        <CanvasStatusBar
          cursorPos={cursorPos}
          zoomPercent={zoomPercent}
          viewMode={viewMode}
          modelTarget={modelTarget}
          displayedTool={displayedTool}
          activePhaseId={activePhaseId}
          phaseViewMode={phaseViewMode}
          phases={project.phases}
          roofHiddenByPhase={roofHiddenByPhase}
          floorTrussSystems={floorTrussSystems}
          trussesHiddenByPhase={trussesHiddenByPhase}
          activeTool={activeTool}
          TOOLS={TOOLS}
          liveWallBearing={liveWallBearing}
          selectionCount={selectionCount}
          hasRoofSectionCut={hasRoofSectionCut}
          hasTrussSectionCut={hasTrussSectionCut}
          floorSectionCutCount={floorSectionCutCount}
          roofSectionMessage={roofSectionMessage}
          trussSectionMessage={trussSectionMessage}
          floorRoofSectionMessage={floorRoofSectionMessage}
          floorRailingSectionMessage={floorRailingSectionMessage}
          pastePreview={pastePreview}
          coordinationIssues={derived?.validationIssues || []}
        />
        {statusMessage && (
          <div className={styles.toast}>
            {statusMessage}
            <div className={styles.toastProgress} />
          </div>
        )}
      </div>
    </RenderProfilerScope>
  );
}
