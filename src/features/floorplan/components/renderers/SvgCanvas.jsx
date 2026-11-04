import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { enterAddCeiling } from '@/features/floorplan/utils/addCeilingEntry';
import { describeWallEditRejection } from '@/domain/modelGraph';
import { GRID_MAJOR, GRID_MINOR, MIN_ZOOM, MAX_ZOOM, ZOOM_FACTOR } from '@/domain/defaults';
import { formatSurveyorBearing, pointsToSurveyorBearing } from '@/geometry/bearing';
import { TOOLS } from '@/editor/tools';
import { isTypingTarget } from '@/utils/keyboard';
import CompassOverlay from '@/features/floorplan/components/CompassOverlay';
import { CanvasZoomProvider } from './CanvasZoomContext';
import { ZOOM_COMMIT_DELAY_MS, gestureTransform, panViewport, sameViewport, zoomViewportAbout } from './canvasGestures';
import { PLAN_STYLES, PlanStyleProvider, persistPlanStylePreference } from './PlanStyleContext';
import { savePlanImage } from '@/features/floorplan/utils/planImageExport';
import FloorScene from './FloorScene';
import GridRenderer from './GridRenderer';
import RoofScene from './RoofScene';
import TrussScene from './TrussScene';
import BeamLevelChip from './BeamLevelChip';
import ElectricalDeviceChip from './ElectricalDeviceChip';
import SectionViewControls from './SectionViewControls';
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
  /*
   * The status bar's coordinate readout, written into the DOM rather than held
   * in state. It changes on every hover frame, and putting it through React
   * re-rendered the entire canvas — every wall, room, dimension and overlay —
   * to move two numbers. `cursorPosRef` still carries the same value for the
   * paste handler, which reads it on a keystroke rather than a frame.
   */
  const cursorChannelRef = useRef(null);
  const svgRectRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  /*
   * Pan and wheel-zoom are drawn as a CSS transform on the <svg> for as long as
   * the gesture lasts and committed to the store once it settles (see
   * `canvasGestures.js`). `committedViewportRef` is the viewport the SVG is
   * laid out for; `pendingViewportRef` the one on screen, the single truth for
   * every gesture at once (a pan and the wheel notches folded into it);
   * `inFlightViewportRef` one dispatched but not yet rendered, kept so a
   * gesture that starts in that gap builds on it rather than on the stale
   * committed view. `panGestureRef` holds only the pointer id the pan
   * captured: the pan's position lives in the pending view, not in a delta.
   */
  const committedViewportRef = useRef(null);
  const pendingViewportRef = useRef(null);
  const inFlightViewportRef = useRef(null);
  const panGestureRef = useRef(null);
  const zoomCommitTimer = useRef(0);

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
    planStyle,
    dragGestureMutating,
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
  committedViewportRef.current = viewport;

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
  // Whose beams the ceiling pick is offering. Anchored on a plate, the frame
  // that carries it belongs to the storey BELOW the plan on screen — plan
  // coordinates are shared across the stack, so outlining another floor's beams
  // over this drawing puts them exactly where they will be clicked.
  const ceilingPickFloor = useMemo(
    () => (toolState.ceilingTargetFloorId ? getFloor(toolState.ceilingTargetFloorId) || floor : floor),
    [toolState.ceilingTargetFloorId, getFloor, floor],
  );
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
  // Memoized because these arrays are handler-memo, effect and prop dependencies
  // all the way down: a fresh one per render rebuilt every tool handler and
  // re-subscribed the window key listeners on every frame of a pan.
  const floorTrussSystems = useMemo(
    () => (filteredProject.trussSystems || []).filter((ts) => ts.floorId === activeFloorId),
    [filteredProject.trussSystems, activeFloorId],
  );
  const allFloorTrussSystems = useMemo(
    () => (project.trussSystems || []).filter((ts) => ts.floorId === activeFloorId),
    [project.trussSystems, activeFloorId],
  );
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

  /*
   * The canvas rect, cached.
   *
   * `getBoundingClientRect` forces the browser to flush layout, and it was read
   * on every processed pointer move — right after React had committed that
   * frame's changes, so the flush was never the free kind. The rect only moves
   * when the element does, which the resize observer below and the window's own
   * scroll and resize events cover; a pointer-down drops it too, so a layout
   * change nothing observed still cannot survive into a drag.
   */
  const readSvgRect = useCallback(() => {
    if (!svgRectRef.current) {
      // The container's box, not the <svg>'s: the two coincide, but the <svg>
      // carries a gesture transform while a pan or zoom is in progress and its
      // own rect would move with it.
      const svg = svgRef.current;
      svgRectRef.current = (svg?.parentElement || svg)?.getBoundingClientRect() || null;
    }
    return svgRectRef.current;
  }, []);

  // --- Pan / zoom gestures (compositor-side until they settle) ---

  const applyGestureTransform = useCallback((pending) => {
    const svg = svgRef.current;
    if (!svg) return;
    const transform = pending ? gestureTransform(committedViewportRef.current, pending) : '';
    svg.style.transform = transform;
    svg.style.willChange = transform ? 'transform' : '';
  }, []);

  /** The view every gesture step builds on: what is on screen right now. */
  const gestureBase = useCallback(
    () => pendingViewportRef.current || inFlightViewportRef.current || committedViewportRef.current,
    [],
  );

  /*
   * A wheel burst's commit. While a pan is in progress it does nothing: the
   * notches are already folded into the pan's pending view, and committing
   * that mid-gesture would move the layout under a pan that is still going —
   * the release commits the whole of it at once. The keydown flush hits this
   * path on every auto-repeat of a held Space, which is exactly a pan.
   */
  const flushPendingZoom = useCallback(() => {
    if (zoomCommitTimer.current) {
      clearTimeout(zoomCommitTimer.current);
      zoomCommitTimer.current = 0;
    }
    if (isPanning.current) return;
    const pending = pendingViewportRef.current;
    if (!pending) return;
    pendingViewportRef.current = null;
    inFlightViewportRef.current = pending;
    editorDispatch({ type: 'ZOOM', zoom: pending.zoom, panX: pending.panX, panY: pending.panY });
  }, [editorDispatch]);

  /** One pan step to the pointer at (`clientX`, `clientY`), applied to the view on screen. */
  const stepPan = useCallback(
    (clientX, clientY) => {
      const dx = clientX - lastPanPos.current.x;
      const dy = clientY - lastPanPos.current.y;
      lastPanPos.current = { x: clientX, y: clientY };
      const base = gestureBase();
      const next = panViewport(base, dx, dy);
      if (next === base) return;
      pendingViewportRef.current = next;
      applyGestureTransform(next);
    },
    [applyGestureTransform, gestureBase],
  );

  /*
   * The pan's commit: the absolute view on screen, not the distance dragged.
   * Whatever else moved the viewport while the button was down — a wheel
   * notch, a Reset centre point — is already in the pending view or was
   * overruled by it, so the store ends up holding exactly the picture the user
   * let go of. The release's own position is taken as a last step, because a
   * move still queued for the next frame is dropped at release.
   */
  const commitPan = useCallback(
    (e) => {
      if (!isPanning.current) return;
      if (moveFrame.current) {
        cancelAnimationFrame(moveFrame.current);
        moveFrame.current = 0;
      }
      pendingMoveEvent.current = null;
      if (Number.isFinite(e?.clientX) && Number.isFinite(e?.clientY)) stepPan(e.clientX, e.clientY);
      isPanning.current = false;
      const gesture = panGestureRef.current;
      panGestureRef.current = null;
      const svg = svgRef.current;
      if (gesture?.pointerId != null && svg?.hasPointerCapture?.(gesture.pointerId)) {
        try {
          svg.releasePointerCapture(gesture.pointerId);
        } catch {
          // Already released (the pointer went away with the window): nothing to undo.
        }
      }
      const pending = pendingViewportRef.current;
      pendingViewportRef.current = null;
      if (zoomCommitTimer.current) {
        clearTimeout(zoomCommitTimer.current);
        zoomCommitTimer.current = 0;
      }
      if (!pending || sameViewport(pending, inFlightViewportRef.current || committedViewportRef.current)) {
        // Nothing new to commit: show what is in flight, or nothing at all.
        applyGestureTransform(inFlightViewportRef.current);
        return;
      }
      inFlightViewportRef.current = pending;
      editorDispatch({
        type: 'SET_VIEWPORT',
        viewport: { zoom: pending.zoom, panX: pending.panX, panY: pending.panY },
      });
    },
    [applyGestureTransform, editorDispatch, stepPan],
  );

  /*
   * The store's viewport changed, from a gesture's commit or from anywhere
   * else. Either way the SVG is now laid out for it, so whatever was in flight
   * has landed or been overtaken, and the transform is recomputed from
   * scratch in this same paint (a layout effect runs before the browser paints
   * the commit): a gesture still pending is shown relative to the new layout —
   * its view is absolute, so the picture stays exactly where the user has it —
   * and otherwise the transform comes off. There is deliberately no equality
   * test here: a commit that lands as something other than what was predicted
   * must not leave a transform on the canvas, or every later gesture builds on
   * a view that is not the one on screen.
   */
  useLayoutEffect(() => {
    inFlightViewportRef.current = null;
    applyGestureTransform(pendingViewportRef.current);
  }, [viewport, applyGestureTransform]);

  // A release anywhere ends a pan; a press anywhere settles a pending zoom
  // before whatever the press starts reads the viewport.
  useEffect(() => {
    const endPan = (e) => commitPan(e);
    window.addEventListener('pointerup', endPan);
    window.addEventListener('pointercancel', endPan);
    window.addEventListener('blur', endPan);
    window.addEventListener('pointerdown', flushPendingZoom, true);
    return () => {
      window.removeEventListener('pointerup', endPan);
      window.removeEventListener('pointercancel', endPan);
      window.removeEventListener('blur', endPan);
      window.removeEventListener('pointerdown', flushPendingZoom, true);
    };
  }, [commitPan, flushPendingZoom]);

  useEffect(
    () => () => {
      if (zoomCommitTimer.current) clearTimeout(zoomCommitTimer.current);
    },
    [],
  );

  const getModelPos = useCallback(
    (e) => {
      const rect = readSvgRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToModel(e.clientX, e.clientY, viewport, rect);
    },
    [readSvgRect, viewport],
  );

  // --- Mouse/pointer handlers ---

  const handleMouseDown = useCallback(
    (e) => {
      // A second pointer pressed while a pan holds the canvas (a pen or a
      // finger beside the mouse) starts nothing: the pan owns the view.
      if (isPanning.current) {
        e.preventDefault();
        return;
      }
      // Opens a drag gesture for the store: everything this pointer-down goes on
      // to change collapses into one undo entry, and the whole-project
      // coordination pass waits for the release instead of running per frame.
      dispatch({ type: 'BEGIN_DRAG_GESTURE' });
      flushPendingZoom();
      svgRectRef.current = null;

      if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
        isPanning.current = true;
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        panGestureRef.current = { pointerId: null };
        // Captured, so the moves and the release keep coming to the canvas
        // when the pointer leaves it — over the 3D pane, a panel, or off the
        // window. The window listeners below stay as the fallback.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
          panGestureRef.current.pointerId = e.pointerId;
        } catch {
          // No capture for this pointer (it is already up): the window fallback ends the pan.
        }
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
    [dispatch, flushPendingZoom, getModelPos, modelTarget, pastePreview, placePaste, tool],
  );

  const processMouseMove = useCallback(
    (e) => {
      if (isPanning.current) {
        // This move's own step, onto the view on screen — never the total
        // since pointer-down onto the committed view, which double-counts
        // whatever the store committed in between.
        stepPan(e.clientX, e.clientY);
        return;
      }
      const modelPos = getModelPos(e);
      cursorPosRef.current = modelPos;
      cursorChannelRef.current?.(modelPos);
      if (modelTarget === 'floor' && pastePreview?.active) {
        updatePastePreview(modelPos);
        return;
      }
      tool.onMouseMove(modelPos, e);
    },
    [getModelPos, modelTarget, pastePreview, stepPan, tool, updatePastePreview],
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
        commitPan(e);
        return;
      }
      if (modelTarget === 'floor' && pastePreview?.active) return;
      const modelPos = getModelPos(e);
      tool.onMouseUp(modelPos, e);
    },
    [commitPan, getModelPos, modelTarget, pastePreview, tool],
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

  /*
   * A wheel notch zooms the picture on the compositor and (re)arms a short
   * timer; the store hears about the burst once, when the timer fires or a
   * press settles it. Until then strokes and text scale with the picture —
   * for the ninety milliseconds after the last notch — rather than every notch
   * re-laying-out and re-rasterising the whole plan. Each notch builds on the
   * view on screen: pending, else dispatched-but-unrendered, else committed —
   * the same base a pan step uses, so a notch clicked mid-pan zooms the
   * picture about the cursor and the pan carries on from there.
   */
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = readSvgRect();
      if (!rect) return;
      const base = gestureBase();
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const next = zoomViewportAbout(base, factor, e.clientX - rect.left, e.clientY - rect.top, {
        min: MIN_ZOOM,
        max: MAX_ZOOM,
      });
      if (next === base) return;
      pendingViewportRef.current = next;
      applyGestureTransform(next);
      if (zoomCommitTimer.current) clearTimeout(zoomCommitTimer.current);
      zoomCommitTimer.current = 0;
      // Mid-pan the notch simply joins the pan's pending view, and the pan's
      // release commits both; a timer here would commit under a moving pan.
      if (!isPanning.current) zoomCommitTimer.current = setTimeout(flushPendingZoom, ZOOM_COMMIT_DELAY_MS);
    },
    [applyGestureTransform, flushPendingZoom, gestureBase, readSvgRect],
  );

  const handleResetCenterPoint = useCallback(() => {
    const rect = readSvgRect();
    if (!rect) return;
    editorDispatch({
      type: 'SET_VIEWPORT',
      viewport: { ...viewport, panX: rect.width / 2, panY: rect.height / 2 },
    });
  }, [editorDispatch, readSvgRect, viewport]);

  const handleTogglePlanStyle = useCallback(() => {
    const next = planStyle === PLAN_STYLES.PRESENTATION ? PLAN_STYLES.DRAFTING : PLAN_STYLES.PRESENTATION;
    persistPlanStylePreference(next);
    editorDispatch({ type: 'SET_PLAN_STYLE', planStyle: next });
  }, [editorDispatch, planStyle]);

  const [savingPlanImage, setSavingPlanImage] = useState(false);
  const handleSavePlanImage = useCallback(async () => {
    if (!svgRef.current || savingPlanImage) return;
    setSavingPlanImage(true);
    try {
      const saved = await savePlanImage(svgRef.current, { zoom: viewport.zoom, projectName: project?.name });
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: saved ? 'Plan image saved.' : 'Nothing on the plan to save yet.',
      });
    } catch (error) {
      console.error('Failed to save the plan image:', error);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'The plan image could not be saved.' });
    } finally {
      setSavingPlanImage(false);
    }
  }, [editorDispatch, project?.name, savingPlanImage, viewport.zoom]);

  const handleToggleFocus = useCallback(() => {
    editorDispatch({ type: 'TOGGLE_FOCUS_PANEL', panel: 'canvas' });
  }, [editorDispatch]);

  // --- Effects ---

  /*
   * Everything that can move the canvas without the pointer knowing about it.
   *
   * The observer's own box is used for the measured size — the grid is painted
   * over exactly that — because it comes free with the callback. Scroll and
   * resize only drop the cached rect: they can move the canvas without resizing
   * it, and measuring on every scroll event would put back the forced layout
   * this is here to remove.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const invalidateRect = () => {
      svgRectRef.current = null;
    };

    const measure = (width, height) => {
      invalidateRect();
      setCanvasSize((size) => (size.width === width && size.height === height ? size : { width, height }));
    };

    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver((entries) => {
            const box = entries[entries.length - 1]?.contentRect;
            if (box) measure(box.width, box.height);
          })
        : null;

    if (observer) {
      observer.observe(svg);
    } else {
      const rect = svg.getBoundingClientRect();
      measure(rect.width, rect.height);
    }

    window.addEventListener('resize', invalidateRect);
    window.addEventListener('scroll', invalidateRect, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', invalidateRect);
      window.removeEventListener('scroll', invalidateRect, true);
    };
  }, []);

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
      flushPendingZoom();

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
              // Not a bare SET_TOOL: a selected plate says which deck the
              // ceiling goes under, and that deck's ceiling belongs to the
              // storey below it. Shared with the sidebar so the key and the
              // button are one flow.
              enterAddCeiling({ project, activeFloorId, selectedId, selectedType, editorDispatch });
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
    // Costs no extra re-subscription: `tool` already keys on the project and the
    // active floor, so this listener was rebuilt with them either way.
    project,
    activeFloorId,
    flushPendingZoom,
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

  /*
   * The grid is painted over what is on screen, not over a 200-metre square.
   *
   * Both patterns are `userSpaceOnUse`, so they are anchored to the model origin
   * and the tiling does not shift as the rect moves with the pan — but the
   * browser still re-tiles everything the rect covers on every frame it moves,
   * and at the default zoom a 200 m square is on the order of a million stroked
   * tiles. The margin is a whole viewport of slack on every side: a pan is
   * drawn on the compositor without re-laying-out the plan, so the grid has to
   * be there already for as far as one drag can travel. Only the tiles on
   * screen are ever rasterised, so the slack costs nothing until it shows.
   */
  const gridRect = useMemo(() => {
    const zoom = viewport.zoom || 1;
    const margin = Math.max(GRID_MAJOR * 2, Math.max(canvasSize.width, canvasSize.height) / zoom);
    return {
      x: -viewport.panX / zoom - margin,
      y: -viewport.panY / zoom - margin,
      width: canvasSize.width / zoom + margin * 2,
      height: canvasSize.height / zoom + margin * 2,
    };
  }, [canvasSize.height, canvasSize.width, viewport.panX, viewport.panY, viewport.zoom]);
  // Below a couple of screen pixels a 50 mm tile is not a grid, it is a wash of
  // colour — and it is twenty times as many tiles as the metre lines over it.
  const showMinorGrid = GRID_MINOR * viewport.zoom >= 2;

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
        <SectionViewControls
          project={project}
          scene={floorSectionScene || roofSectionScene || trussSectionScene}
          dispatch={dispatch}
        />
        <svg
          ref={svgRef}
          className={styles.svg}
          data-plan-style={planStyle}
          style={{ cursor }}
          onPointerDown={handleMouseDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <CanvasZoomProvider value={viewport.zoom}>
            {/* Geometry moving under the pointer — a drag that rewrites the
                project, or a wall drag's live preview — tells the presentation
                plan to skip its unions for the length of the gesture. */}
            <PlanStyleProvider value={planStyle} dragging={dragGestureMutating || Boolean(wallDragPreview)}>
              <g
                className={planStyle === PLAN_STYLES.PRESENTATION ? styles.styleFadeA : styles.styleFadeB}
                transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}
              >
                {viewMode === 'plan' && showGrid && (
                  <>
                    <GridRenderer />
                    {showMinorGrid && (
                      <rect
                        x={gridRect.x}
                        y={gridRect.y}
                        width={gridRect.width}
                        height={gridRect.height}
                        fill="url(#grid-minor)"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    <rect
                      x={gridRect.x}
                      y={gridRect.y}
                      width={gridRect.width}
                      height={gridRect.height}
                      fill="url(#grid-major)"
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
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
                    pickFloor={ceilingPickFloor}
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
            </PlanStyleProvider>
          </CanvasZoomProvider>
        </svg>
        <CanvasOverlayControls
          onResetCenter={handleResetCenterPoint}
          onToggleFocus={handleToggleFocus}
          isFocused={isCanvasFocused}
          presentation={planStyle === PLAN_STYLES.PRESENTATION}
          onSavePlanImage={viewMode === 'plan' && modelTarget === 'floor' ? handleSavePlanImage : null}
          savingPlanImage={savingPlanImage}
          onTogglePresentation={viewMode === 'plan' || viewMode.startsWith('elevation') ? handleTogglePlanStyle : null}
        />
        <CanvasStatusBar
          cursorChannelRef={cursorChannelRef}
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
