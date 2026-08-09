import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useProject } from '@/features/floorplan/context/FloorplanContext';
import {
  CEILING_ATTACHMENT_MODES,
  CEILING_FASTENER_LAYOUT_MODES,
  CEILING_FRAMING_LAYOUT_MODES,
  CEILING_OPENING_TYPES,
  CEILING_PANEL_LAYOUT_MODES,
  createCeilingDetailing,
  createCeilingOpening,
  createCustomCeilingFramingMember,
  createManualCeilingFastener,
  deriveCeilingDetail,
  getProjectCeiling,
} from '@/domain/ceilingModels';
import {
  CEILING_JURISDICTION_PROFILES,
  CEILING_PRODUCT_PROFILES,
  CEILING_PRODUCT_PROFILE_STATUS,
  getCeilingJurisdictionProfile,
  getCeilingProductProfile,
} from '@/domain/ceilingProductProfiles';
import {
  collectWallSnapCandidates,
  createDrawnPanel,
  createTracedPanel,
  moveMemberWithinBounds,
  movePanelWithinBounds,
  movePointWithinBounds,
  panWallViewport,
  screenPointToWallLocal,
  snapWallLocalPoint,
  zoomWallViewport,
} from '@/features/floorplan/components/wall-detail/wallDetailEditorGeometry';
import {
  CanvasReadoutChip,
  WallCanvasGrid,
  WallCanvasRulers,
  useWallCanvasMetrics,
} from '@/features/floorplan/components/wall-detail/WallCanvasChrome';
import { wallUnitsPerPixel } from '@/features/floorplan/components/wall-detail/wallDetailCanvasMath';
import {
  AdvancedGroup,
  CollapsibleSection,
  EmptyState,
  InfoHint,
  Metric,
  NumberField,
  SelectField,
  StepStrip,
  Toggle,
  ToolButton,
  ToolGlyph,
  ToolbarButton,
} from '@/features/floorplan/components/wall-detail/WallDetailUiKit';
import styles from '@/features/floorplan/components/wall-detail/WallDetailEditor.module.css';
import { createCeilingDetailPreviewProject } from './ceilingDetailPreviewProject';

const ThreePreviewPanel = lazy(() => import('@/features/floorplan/components/preview/ThreePreviewPanel'));

const CANVAS_TOOLS = Object.freeze({
  SELECT: 'select',
  PAN: 'pan',
  DRAW_PANEL: 'draw_panel',
  TRACE_PANEL: 'trace_panel',
  DRAW_FURRING: 'draw_furring',
  DRAW_CARRIER: 'draw_carrier',
  DRAW_OPENING: 'draw_opening',
  ADD_FASTENER: 'add_fastener',
});

const WORKSPACE_VIEWS = Object.freeze({
  RCP: 'rcp',
  SPLIT: 'split',
  THREE_D: '3d',
});

const MIN_DRAWN_SIZE = 10;

const TOOL_HINTS = Object.freeze({
  [CANVAS_TOOLS.SELECT]: 'Select and drag any board, framing member, screw, or opening',
  [CANVAS_TOOLS.PAN]: 'Drag anywhere to pan; use the mouse wheel to zoom',
  [CANVAS_TOOLS.DRAW_PANEL]: 'Drag a rectangle to draw a ceiling board',
  [CANVAS_TOOLS.TRACE_PANEL]: 'Click each cut corner; click the first point or double-click to finish',
  [CANVAS_TOOLS.DRAW_FURRING]: 'Click for a furring channel across the full width, or drag its span',
  [CANVAS_TOOLS.DRAW_CARRIER]: 'Click for a carrier across the full depth, or drag its span',
  [CANVAS_TOOLS.DRAW_OPENING]: 'Drag a rectangle to cut an opening in the ceiling',
  [CANVAS_TOOLS.ADD_FASTENER]: 'Click to place a screw',
});

/** Single source of truth for every canvas tool: icon, plain-language name, tooltip and shortcut. */
const TOOL_DEFINITIONS = Object.freeze([
  {
    tool: CANVAS_TOOLS.SELECT,
    icon: 'select',
    label: 'Select',
    shortcut: 'V',
    title: 'Select / move — click to pick anything, drag to move it (V)',
    group: 'navigate',
  },
  {
    tool: CANVAS_TOOLS.PAN,
    icon: 'pan',
    label: 'Pan',
    shortcut: 'H',
    title: 'Pan the drawing — drag to slide the view, scroll to zoom (H)',
    group: 'navigate',
  },
  {
    tool: CANVAS_TOOLS.DRAW_PANEL,
    icon: 'panel',
    label: 'Board',
    shortcut: 'P',
    title: 'Draw board (rectangle) — drag out a ceiling board (P)',
    group: 'board',
  },
  {
    tool: CANVAS_TOOLS.TRACE_PANEL,
    icon: 'trace',
    label: 'Trace cut',
    shortcut: 'T',
    title: 'Trace cut board — click each corner, then close the outline (T)',
    group: 'board',
  },
  {
    tool: CANVAS_TOOLS.DRAW_FURRING,
    icon: 'noggin',
    label: 'Furring',
    shortcut: 'S',
    title: 'Draw furring channel — click for the full width, or drag its span (S)',
    group: 'frame',
  },
  {
    tool: CANVAS_TOOLS.DRAW_CARRIER,
    icon: 'stud',
    label: 'Carrier',
    shortcut: 'C',
    title: 'Draw carrier — click for the full depth, or drag its span (C)',
    group: 'frame',
  },
  {
    tool: CANVAS_TOOLS.DRAW_OPENING,
    icon: 'measure',
    label: 'Opening',
    shortcut: 'O',
    title: 'Draw opening — drag out a hatch, downlight, or diffuser cut-out (O)',
    group: 'detail',
  },
  {
    tool: CANVAS_TOOLS.ADD_FASTENER,
    icon: 'screw',
    label: 'Screw',
    shortcut: 'F',
    title: 'Place screw — click to fix a board to the furring (F)',
    group: 'detail',
  },
]);

const TOOL_GROUP_LABELS = Object.freeze({
  navigate: 'Move around',
  board: 'Boards',
  frame: 'Structure',
  detail: 'Openings and screws',
});

const TOOL_BY_ID = Object.freeze(
  TOOL_DEFINITIONS.reduce((map, definition) => ({ ...map, [definition.tool]: definition }), {}),
);

const TOOL_SHORTCUTS = Object.freeze(
  TOOL_DEFINITIONS.reduce((map, definition) => ({ ...map, [definition.shortcut.toLowerCase()]: definition }), {}),
);

/** Left-panel workflow, in the order a real ceiling gets detailed. */
const WORKFLOW_STEPS = Object.freeze([
  { id: 'face', short: 'Boards', title: 'Face and boards', hint: 'Board product, size, and how the grid is laid out' },
  { id: 'structure', short: 'Structure', title: 'Structure', hint: 'Furring channels and carriers behind the boards' },
  { id: 'suspension', short: 'Drop', title: 'Suspension', hint: 'How far the ceiling hangs below its attachment' },
  { id: 'openings', short: 'Openings', title: 'Openings', hint: 'Access hatches, downlights, and diffusers' },
  { id: 'screws', short: 'Screws', title: 'Screws', hint: 'Fixing spacing and clearances' },
  { id: 'takeoff', short: 'Takeoff', title: 'Takeoff', hint: 'Board, framing, hanger, and screw quantities' },
]);

const LAYER_LABELS = Object.freeze({
  boundary: 'Outline',
  openings: 'Openings',
  boards: 'Boards',
  structure: 'Structure',
  hangers: 'Hangers',
  screws: 'Screws',
});

const SELECTION_LABELS = Object.freeze({
  panel: 'ceiling board',
  framing: 'framing member',
  fastener: 'screw',
  opening: 'ceiling opening',
});

const OPENING_TYPE_LABELS = Object.freeze({
  [CEILING_OPENING_TYPES.ACCESS_HATCH]: 'Access hatch',
  [CEILING_OPENING_TYPES.DOWNLIGHT]: 'Downlight',
  [CEILING_OPENING_TYPES.DIFFUSER]: 'Air diffuser',
  [CEILING_OPENING_TYPES.CUSTOM]: 'Custom cut-out',
});

const FRAMING_KIND_LABELS = Object.freeze({
  furring: 'Furring channel',
  carrier: 'Carrier',
  trimmer: 'Opening trimmer',
  wall_angle: 'Wall angle',
});

const FRAMING_COLORS = Object.freeze({
  furring: 'rgba(49, 129, 168, 0.35)',
  carrier: 'rgba(120, 96, 190, 0.42)',
  trimmer: 'rgba(214, 158, 74, 0.4)',
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatMm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}

function regionPath(region) {
  return [region.outline, ...(region.holes || [])]
    .filter((ring) => ring?.length)
    .map((ring) => `${ring.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.u} ${point.v}`).join(' ')} Z`)
    .join(' ');
}

/**
 * Ceiling equivalent of the wall editor's drawn-member helper: a click gives a
 * member spanning the whole ceiling, a drag gives the span that was dragged.
 * Furring runs along U (plan east/west); carriers run along V (plan north/south).
 */
function createDrawnCeilingMember(tool, start, end, framing, bounds) {
  if (tool === CANVAS_TOOLS.DRAW_CARRIER) {
    const width = Math.max(MIN_DRAWN_SIZE, Number(framing?.carrierWidth) || 0);
    const center = clamp(start.u, 0, bounds.length);
    const hasSpan = Math.abs(end.v - start.v) >= MIN_DRAWN_SIZE;
    return createCustomCeilingFramingMember({
      kind: 'carrier',
      orientation: 'vertical',
      u0: clamp(center - width / 2, 0, bounds.length),
      u1: clamp(center + width / 2, 0, bounds.length),
      v0: hasSpan ? Math.min(start.v, end.v) : 0,
      v1: hasSpan ? Math.max(start.v, end.v) : bounds.height,
      depth: framing?.carrierDepth,
      material: framing?.material || null,
    });
  }
  const width = Math.max(MIN_DRAWN_SIZE, Number(framing?.furringWidth) || 0);
  const center = clamp(start.v, 0, bounds.height);
  const hasSpan = Math.abs(end.u - start.u) >= MIN_DRAWN_SIZE;
  return createCustomCeilingFramingMember({
    kind: 'furring',
    orientation: 'horizontal',
    u0: hasSpan ? Math.min(start.u, end.u) : 0,
    u1: hasSpan ? Math.max(start.u, end.u) : bounds.length,
    v0: clamp(center - width / 2, 0, bounds.height),
    v1: clamp(center + width / 2, 0, bounds.height),
    depth: framing?.furringDepth,
    material: framing?.material || null,
  });
}

export default function CeilingDetailEditor() {
  const { project, dispatch, canUndo = false, canRedo = false } = useProject();
  const { ceilingDetailEditor, dispatch: editorDispatch } = useEditor();
  const svgRef = useRef(null);
  const canvasFrameRef = useRef(null);
  const ceiling = getProjectCeiling(project, ceilingDetailEditor?.ceilingId);

  const [layerVisibility, setLayerVisibility] = useState({
    boundary: true,
    openings: true,
    boards: true,
    structure: true,
    hangers: true,
    screws: true,
  });
  const [selection, setSelection] = useState(null);
  const [canvasTool, setCanvasTool] = useState(CANVAS_TOOLS.SELECT);
  const [gesture, setGesture] = useState(null);
  const [panelTrace, setPanelTrace] = useState(null);
  const [viewport, setViewport] = useState({ zoom: 1, panU: 0, panV: 0 });
  const [panGesture, setPanGesture] = useState(null);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(50);
  const [openingDraftType, setOpeningDraftType] = useState(CEILING_OPENING_TYPES.ACCESS_HATCH);
  const [workspaceView, setWorkspaceView] = useState(WORKSPACE_VIEWS.SPLIT);
  const [openSections, setOpenSections] = useState({
    face: true,
    structure: false,
    suspension: false,
    openings: false,
    screws: false,
    takeoff: true,
    selection: true,
    summary: true,
    elevations: true,
  });
  const sectionNodes = useRef({});
  const sectionRefSetters = useRef({});
  const shortcutHandlerRef = useRef(null);

  // Capture phase: this editor is modal, so the keys it claims must never reach the
  // floorplan canvas listening on the same window (its own Delete would remove rooms).
  // Only claimed keys stop propagating — Space-pan, Escape, and Ctrl shortcuts pass through.
  useEffect(() => {
    const onShortcutKeyDown = (event) => shortcutHandlerRef.current?.(event);
    window.addEventListener('keydown', onShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', onShortcutKeyDown, true);
  }, []);

  useEffect(() => {
    if (!panelTrace) return undefined;
    const cancelTrace = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setPanelTrace(null);
    };
    window.addEventListener('keydown', cancelTrace);
    return () => window.removeEventListener('keydown', cancelTrace);
  }, [panelTrace]);

  useEffect(() => {
    const isEditableTarget = (target) =>
      target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName);
    const enableSpacePan = (event) => {
      if (event.code !== 'Space' || isEditableTarget(event.target)) return;
      event.preventDefault();
      setSpacePanActive(true);
    };
    const disableSpacePan = (event) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      setSpacePanActive(false);
    };
    const cancelSpacePan = () => setSpacePanActive(false);
    window.addEventListener('keydown', enableSpacePan);
    window.addEventListener('keyup', disableSpacePan);
    window.addEventListener('blur', cancelSpacePan);
    return () => {
      window.removeEventListener('keydown', enableSpacePan);
      window.removeEventListener('keyup', disableSpacePan);
      window.removeEventListener('blur', cancelSpacePan);
    };
  }, []);

  const detail = useMemo(() => (ceiling && project ? deriveCeilingDetail(ceiling, project) : null), [ceiling, project]);
  const configuration = detail?.configuration || null;
  const face = configuration?.face || null;
  const panels = detail?.panels || [];
  const frameMembers = detail?.framing || [];
  const hangers = detail?.hangers || [];
  const fasteners = detail?.fasteners || [];
  const openings = detail?.openings || [];
  const profile = face ? getCeilingProductProfile(face.productProfileId) : null;
  const jurisdiction = configuration ? getCeilingJurisdictionProfile(configuration.jurisdictionProfileId) : null;
  // Reflected ceiling plan: U runs east, V runs north, and nothing is mirrored —
  // the drawing keeps the same handedness as the floor plan underneath it.
  const bounds = detail ? { length: detail.length, height: detail.depth, mirrorU: false } : null;
  const canvasMetrics = useWallCanvasMetrics(canvasFrameRef, bounds, workspaceView);
  const previewProject = useMemo(() => createCeilingDetailPreviewProject(project, ceiling?.id), [project, ceiling?.id]);
  const snapCandidates = useMemo(
    () =>
      detail
        ? collectWallSnapCandidates({
            panels: detail.panels,
            // Wall-angle members carry start/end instead of a rectangle, so they
            // would poison the numeric candidate lists with NaN.
            members: detail.framing.filter((member) => member.kind !== 'wall_angle'),
            openings: detail.openings,
            length: detail.length,
            height: detail.depth,
          })
        : { u: [], v: [] },
    [detail],
  );

  if (!ceilingDetailEditor) {
    shortcutHandlerRef.current = null;
    return null;
  }
  if (!project || !ceiling || !detail || !configuration || !face) {
    shortcutHandlerRef.current = null;
    return (
      <div className={styles.overlay}>
        <div className={styles.missing}>
          <h2>Ceiling detail is unavailable</h2>
          <p>The ceiling or owning floor no longer exists.</p>
          <ToolbarButton onClick={() => editorDispatch({ type: 'CLOSE_CEILING_DETAIL_EDITOR' })}>Close</ToolbarButton>
        </div>
      </div>
    );
  }

  const toggleSection = (id) => setOpenSections((value) => ({ ...value, [id]: !value[id] }));
  const sectionRef = (id) => {
    if (!sectionRefSetters.current[id]) {
      sectionRefSetters.current[id] = (node) => {
        sectionNodes.current[id] = node;
      };
    }
    return sectionRefSetters.current[id];
  };
  const focusStep = (id) => {
    setOpenSections((value) => ({ ...value, [id]: true }));
    sectionNodes.current[id]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const commitDetailing = (next) => {
    dispatch({
      type: 'CEILING_UPDATE',
      ceiling: { id: ceiling.id, detailing: createCeilingDetailing(next) },
    });
  };

  const updateDetailing = (patch) => commitDetailing({ ...configuration, ...patch });
  const updateFace = (patch) => updateDetailing({ face: { ...face, ...patch } });
  const updateLayout = (patch) => updateFace({ layout: { ...face.layout, ...patch } });
  const updateFastenerPattern = (patch) => updateFace({ fasteners: { ...face.fasteners, ...patch } });
  const updateFraming = (patch) => updateDetailing({ framing: { ...configuration.framing, ...patch } });
  const updateSuspension = (patch) => updateDetailing({ suspension: { ...configuration.suspension, ...patch } });
  const updateOpenings = (next) => updateDetailing({ openings: next });

  /**
   * Switching a generated grid to custom must not wipe the grid: the boards on
   * screen are seeded as explicit panels first, using their pre-clip rectangles
   * so a board trimmed by the boundary keeps its full stock size. Once the face
   * is already custom, the stored panels are the source of truth.
   */
  const seededCustomPanels = () =>
    face.layout.mode === CEILING_PANEL_LAYOUT_MODES.GRID
      ? panels.map((panel) => ({
          id: panel.localId,
          u: panel.u0,
          v: panel.v0,
          width: panel.width,
          height: panel.height,
          label: panel.label,
        }))
      : face.layout.customPanels;

  const writeCustomPanels = (next) => updateLayout({ mode: CEILING_PANEL_LAYOUT_MODES.CUSTOM, customPanels: next });

  const regeneratePanelGrid = () => {
    updateLayout({ mode: CEILING_PANEL_LAYOUT_MODES.GRID, customPanels: [] });
    setSelection(null);
  };

  const chooseCanvasTool = (tool) => {
    setCanvasTool(tool);
    setGesture(null);
    if (tool !== CANVAS_TOOLS.TRACE_PANEL) setPanelTrace(null);
  };

  const isCustomMember = (id) => configuration.framing.members.some((member) => member.id === id);
  const isManualFastener = (id) => face.fasteners.manual.some((fastener) => fastener.id === id);

  const deleteSelectedPanel = () => {
    writeCustomPanels(seededCustomPanels().filter((panel) => panel.id !== selection.id));
    setSelection(null);
  };

  const deleteSelectedMember = () => {
    if (isCustomMember(selection.id)) {
      updateFraming({ members: configuration.framing.members.filter((member) => member.id !== selection.id) });
    } else {
      updateFraming({
        removedGeneratedIds: [...new Set([...configuration.framing.removedGeneratedIds, selection.id])],
      });
    }
    setSelection(null);
  };

  const deleteSelectedFastener = () => {
    if (isManualFastener(selection.id)) {
      updateFastenerPattern({ manual: face.fasteners.manual.filter((entry) => entry.id !== selection.id) });
    } else {
      updateFastenerPattern({
        removedGeneratedIds: [...new Set([...face.fasteners.removedGeneratedIds, selection.id])],
      });
    }
    setSelection(null);
  };

  const deleteSelectedOpening = () => {
    updateOpenings(configuration.openings.filter((opening) => opening.id !== selection.id));
    setSelection(null);
  };

  const deleteSelection = () => {
    if (selection?.type === 'panel') deleteSelectedPanel();
    else if (selection?.type === 'framing') deleteSelectedMember();
    else if (selection?.type === 'fastener') deleteSelectedFastener();
    else if (selection?.type === 'opening') deleteSelectedOpening();
  };

  const updateSelectedPanel = (patch) => {
    if (selection?.type !== 'panel') return;
    writeCustomPanels(
      seededCustomPanels().map((panel) => (panel.id === selection.id ? { ...panel, ...patch } : panel)),
    );
  };

  const updateSelectedMember = (patch) => {
    if (selection?.type !== 'framing' || !isCustomMember(selection.id)) return;
    updateFraming({
      members: configuration.framing.members.map((member) =>
        member.id === selection.id ? createCustomCeilingFramingMember({ ...member, ...patch, id: member.id }) : member,
      ),
    });
  };

  const updateSelectedFastener = (patch) => {
    if (selection?.type !== 'fastener' || !isManualFastener(selection.id)) return;
    updateFastenerPattern({
      manual: face.fasteners.manual.map((entry) =>
        entry.id === selection.id ? createManualCeilingFastener({ ...entry, ...patch }, { ...entry }) : entry,
      ),
    });
  };

  const updateOpening = (openingId, patch) =>
    updateOpenings(
      configuration.openings.map((opening) =>
        opening.id === openingId ? createCeilingOpening({ ...opening, ...patch }, { ...opening, ...patch }) : opening,
      ),
    );

  const removeOpening = (openingId) => {
    updateOpenings(configuration.openings.filter((opening) => opening.id !== openingId));
    if (selection?.type === 'opening' && selection.id === openingId) setSelection(null);
  };

  const eventToLocal = (event, withSnap = true) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { u: 0, v: 0 };
    const point = screenPointToWallLocal(event, rect, bounds);
    return withSnap
      ? snapWallLocalPoint(point, snapCandidates, {
          enabled: snapEnabled,
          step: snapStep,
          threshold: Math.max(8, (detail.length / Math.max(1, rect.width)) * 10),
        })
      : point;
  };

  const zoomViewportAt = (requestedZoom, clientX, clientY) => {
    setViewport((current) => {
      const rawZoom = typeof requestedZoom === 'function' ? requestedZoom(current.zoom) : requestedZoom;
      const zoom = Math.max(0.35, Math.min(5, rawZoom));
      if (zoom === current.zoom) return current;
      const rect = canvasFrameRef.current?.getBoundingClientRect();
      const focalU = rect && Number.isFinite(clientX) ? clientX - (rect.left + rect.width / 2) : 0;
      const focalV = rect && Number.isFinite(clientY) ? clientY - (rect.top + rect.height / 2) : 0;
      return zoomWallViewport(current, zoom, { u: focalU, v: focalV });
    });
  };

  const handleViewportWheel = (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomViewportAt((zoom) => zoom * factor, event.clientX, event.clientY);
  };

  const beginViewportPan = (event) => {
    const panButton = event.button === 1 || (event.button === 0 && (canvasTool === CANVAS_TOOLS.PAN || spacePanActive));
    if (!panButton) return;
    event.preventDefault();
    canvasFrameRef.current?.setPointerCapture?.(event.pointerId);
    setPanGesture({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panU: viewport.panU,
      panV: viewport.panV,
    });
  };

  const updateViewportPan = (event) => {
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    setViewport((current) =>
      panWallViewport(
        { ...current, panU: panGesture.panU, panV: panGesture.panV },
        { u: event.clientX - panGesture.clientX, v: event.clientY - panGesture.clientY },
      ),
    );
  };

  const finishViewportPan = (event) => {
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    canvasFrameRef.current?.releasePointerCapture?.(event.pointerId);
    setPanGesture(null);
  };

  const fitCeilingInViewport = () => setViewport({ zoom: 1, panU: 0, panV: 0 });

  const movedGestureEntity = (value = gesture) => {
    if (!value || value.kind !== 'move') return null;
    const delta = { u: value.current.u - value.start.u, v: value.current.v - value.start.v };
    let moved;
    let anchor;
    if (value.type === 'panel') {
      moved = movePanelWithinBounds(value.entity, delta, bounds);
      anchor = { u: moved.u0, v: moved.v0 };
    } else if (value.type === 'framing' || value.type === 'opening') {
      moved = moveMemberWithinBounds(value.entity, delta, bounds);
      anchor = { u: moved.u0, v: moved.v0 };
    } else {
      moved = movePointWithinBounds(value.entity, delta, bounds);
      anchor = { u: moved.u, v: moved.v };
    }
    if (!snapEnabled) return moved;
    const snapped = snapWallLocalPoint(anchor, snapCandidates, {
      step: snapStep,
      threshold: Math.max(8, snapStep * 0.24),
    });
    const snapDelta = { u: snapped.u - anchor.u, v: snapped.v - anchor.v };
    if (value.type === 'panel') return movePanelWithinBounds(moved, snapDelta, bounds);
    if (value.type === 'framing' || value.type === 'opening') return moveMemberWithinBounds(moved, snapDelta, bounds);
    return movePointWithinBounds(moved, snapDelta, bounds);
  };

  const drawnGestureEntity = (value = gesture) => {
    if (!value || value.kind !== 'draw') return null;
    if (value.tool === CANVAS_TOOLS.DRAW_PANEL || value.tool === CANVAS_TOOLS.DRAW_OPENING) {
      return createDrawnPanel(value.start, value.current, bounds, MIN_DRAWN_SIZE * 2.5);
    }
    return createDrawnCeilingMember(value.tool, value.start, value.current, configuration.framing, bounds);
  };

  const commitPanelTrace = (points = panelTrace?.points || []) => {
    const traced = createTracedPanel(points, bounds);
    if (!traced) return false;
    const panel = {
      id: `traced-${Date.now().toString(36)}-${seededCustomPanels().length + 1}`,
      u: traced.u0,
      v: traced.v0,
      width: traced.width,
      height: traced.height,
      outlinePoints: traced.outlinePoints,
    };
    writeCustomPanels([...seededCustomPanels(), panel]);
    setPanelTrace(null);
    setSelection({ type: 'panel', id: panel.id });
    return true;
  };

  const addFastener = (point) => {
    const fastener = createManualCeilingFastener(point, {
      type: face.fasteners.type || profile.planningDefaults.fastenerType,
    });
    updateFastenerPattern({ manual: [...face.fasteners.manual, fastener] });
    setSelection({ type: 'fastener', id: fastener.id });
  };

  const beginCanvasGesture = (event) => {
    if (event.button !== 0) return;
    if (canvasTool === CANVAS_TOOLS.PAN || spacePanActive) return;
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL) {
      event.preventDefault();
      const point = eventToLocal(event, true);
      const points = panelTrace?.points || [];
      const rect = svgRef.current?.getBoundingClientRect();
      const closeDistance = Math.max(8, (detail.length / Math.max(1, rect?.width || 1)) * 12);
      if (points.length >= 3 && Math.hypot(point.u - points[0].u, point.v - points[0].v) <= closeDistance) {
        commitPanelTrace(points);
        return;
      }
      setPanelTrace({ points: [...points, point], previewPoint: point });
      return;
    }
    const point = eventToLocal(event, true);
    if (canvasTool === CANVAS_TOOLS.ADD_FASTENER) {
      addFastener(point);
      return;
    }
    if (canvasTool === CANVAS_TOOLS.SELECT) {
      setSelection(null);
      return;
    }
    event.preventDefault();
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: 'draw',
      tool: canvasTool,
      start: point,
      current: point,
      pointerId: event.pointerId,
    });
  };

  const beginElementMove = (event, type, id, entity, movable = true) => {
    if (spacePanActive || canvasTool !== CANVAS_TOOLS.SELECT || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelection({ type, id });
    if (!movable) return;
    const point = eventToLocal(event, false);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({ kind: 'move', type, id, entity, start: point, current: point, pointerId: event.pointerId });
  };

  const updateCanvasGesture = (event) => {
    if (panGesture) return;
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL && panelTrace?.points.length) {
      setPanelTrace((value) => (value ? { ...value, previewPoint: eventToLocal(event, true) } : value));
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = eventToLocal(event, gesture.kind === 'draw');
    setGesture((value) => (value ? { ...value, current: point } : value));
  };

  const commitDrawnEntity = (finalGesture) => {
    const entity = drawnGestureEntity(finalGesture);
    if (!entity) return;
    if (finalGesture.tool === CANVAS_TOOLS.DRAW_PANEL) {
      const panel = {
        id: `panel-${Date.now().toString(36)}-${seededCustomPanels().length + 1}`,
        u: entity.u0,
        v: entity.v0,
        width: entity.width,
        height: entity.height,
      };
      // Seed before appending, so drawing one board over a generated grid keeps
      // every board that was already on screen.
      writeCustomPanels([...seededCustomPanels(), panel]);
      setSelection({ type: 'panel', id: panel.id });
      return;
    }
    if (finalGesture.tool === CANVAS_TOOLS.DRAW_OPENING) {
      const opening = createCeilingOpening(
        { u: entity.u0, v: entity.v0, width: entity.width, height: entity.height },
        { type: openingDraftType },
      );
      updateOpenings([...configuration.openings, opening]);
      setSelection({ type: 'opening', id: opening.id });
      return;
    }
    updateFraming({ members: [...configuration.framing.members, entity] });
    setSelection({ type: 'framing', id: entity.id });
  };

  const commitMovedEntity = (finalGesture) => {
    const moved = movedGestureEntity(finalGesture);
    const movedDistance = Math.hypot(
      finalGesture.current.u - finalGesture.start.u,
      finalGesture.current.v - finalGesture.start.v,
    );
    if (!moved || movedDistance < 1) return;
    if (finalGesture.type === 'panel') {
      writeCustomPanels(
        seededCustomPanels().map((panel) =>
          panel.id === finalGesture.id
            ? {
                ...panel,
                u: moved.u0,
                v: moved.v0,
                width: moved.width,
                height: moved.height,
                ...(moved.outlinePoints?.length ? { outlinePoints: moved.outlinePoints } : {}),
              }
            : panel,
        ),
      );
      return;
    }
    if (finalGesture.type === 'framing') {
      updateFraming({
        members: configuration.framing.members.map((member) =>
          member.id === finalGesture.id
            ? createCustomCeilingFramingMember({
                ...member,
                u0: moved.u0,
                u1: moved.u1,
                v0: moved.v0,
                v1: moved.v1,
                id: member.id,
              })
            : member,
        ),
      });
      return;
    }
    if (finalGesture.type === 'opening') {
      updateOpening(finalGesture.id, { u: moved.u0, v: moved.v0 });
      return;
    }
    updateFastenerPattern({
      manual: face.fasteners.manual.map((entry) =>
        entry.id === finalGesture.id ? createManualCeilingFastener(moved, { ...entry }) : entry,
      ),
    });
  };

  const finishCanvasGesture = (event) => {
    if (panGesture) return;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const finalGesture = { ...gesture, current: eventToLocal(event, gesture.kind === 'draw') };
    svgRef.current?.releasePointerCapture?.(event.pointerId);
    setGesture(null);
    if (finalGesture.kind === 'draw') commitDrawnEntity(finalGesture);
    else commitMovedEntity(finalGesture);
  };

  const finishPanelTrace = (event) => {
    if (canvasTool !== CANVAS_TOOLS.TRACE_PANEL || !panelTrace?.points.length) return;
    event.preventDefault();
    event.stopPropagation();
    commitPanelTrace(panelTrace.points);
  };

  const selectedPanel = selection?.type === 'panel' ? panels.find((panel) => panel.localId === selection.id) : null;
  const selectedMember =
    selection?.type === 'framing' ? frameMembers.find((member) => member.id === selection.id) : null;
  const selectedFastener = selection?.type === 'fastener' ? fasteners.find((entry) => entry.id === selection.id) : null;
  const selectedOpening = selection?.type === 'opening' ? openings.find((entry) => entry.id === selection.id) : null;
  const selectionIsDeletable = Boolean(selectedPanel || selectedMember || selectedFastener || selectedOpening);
  const selectionSummary = selection
    ? `${SELECTION_LABELS[selection.type] || selection.type} selected`
    : 'Nothing selected';
  const takeoff = detail.takeoff;
  const elevations = detail.elevations;
  const unitPx = wallUnitsPerPixel(canvasMetrics, viewport, bounds);
  const activeToolDefinition = TOOL_BY_ID[canvasTool];
  const gesturePreview = gesture?.kind === 'draw' ? drawnGestureEntity() : movedGestureEntity();
  const gesturePreviewType =
    gesture?.kind === 'draw'
      ? gesture.tool === CANVAS_TOOLS.DRAW_PANEL
        ? 'panel'
        : gesture.tool === CANVAS_TOOLS.DRAW_OPENING
          ? 'opening'
          : 'framing'
      : gesture?.type;
  const panelTracePreview = panelTrace?.points?.length
    ? [...panelTrace.points, panelTrace.previewPoint || panelTrace.points[panelTrace.points.length - 1]]
    : [];
  const boardFill = face.enabled ? '#dedbd1' : '#c3c8cc';
  const attachmentLabel =
    ceiling.attachment?.mode === CEILING_ATTACHMENT_MODES.TRUSS ? 'Truss bottom chord' : 'Manual datum';
  const reviewCopy =
    profile.status === CEILING_PRODUCT_PROFILE_STATUS.REFERENCE_ONLY
      ? 'Reference only — the cited document verifies the board sizes and the ceiling application, not a complete fixing schedule. Furring, carrier, hanger, and screw values here are planning defaults. A qualified professional must confirm them against a current installation guide before construction.'
      : 'Custom assumption — every value on this ceiling is a planning default, not a manufacturer or code requirement. A qualified professional must review the whole assembly before construction.';

  const gestureReadout = (() => {
    if (gesture?.kind === 'draw' && gesturePreview) {
      if (gesture.tool === CANVAS_TOOLS.DRAW_PANEL || gesture.tool === CANVAS_TOOLS.DRAW_OPENING) {
        return {
          point: gesture.current,
          lines: [`${formatMm(gesturePreview.width)} × ${formatMm(gesturePreview.height)} mm`],
        };
      }
      const vertical = gesture.tool === CANVAS_TOOLS.DRAW_CARRIER;
      const span = vertical ? gesturePreview.v1 - gesturePreview.v0 : gesturePreview.u1 - gesturePreview.u0;
      return {
        point: gesture.current,
        lines: [`${vertical ? 'carrier' : 'furring'} · ${formatMm(span)} mm`],
      };
    }
    if (gesture?.kind === 'move' && gesturePreview) {
      if (gesture.type === 'fastener') {
        return { point: gesture.current, lines: [`U ${formatMm(gesturePreview.u)} · V ${formatMm(gesturePreview.v)}`] };
      }
      return { point: gesture.current, lines: [`U ${formatMm(gesturePreview.u0)} · V ${formatMm(gesturePreview.v0)}`] };
    }
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL && panelTrace?.points?.length && panelTrace.previewPoint) {
      const last = panelTrace.points[panelTrace.points.length - 1];
      const span = Math.hypot(panelTrace.previewPoint.u - last.u, panelTrace.previewPoint.v - last.v);
      return span >= 1 ? { point: panelTrace.previewPoint, lines: [`${formatMm(span)} mm`] } : null;
    }
    return null;
  })();

  const claimShortcut = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  shortcutHandlerRef.current = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName)) return;
    if (event.key === 'Escape') {
      // The panel-trace effect owns Escape while a trace is open; never swallow it here.
      if (panelTrace) return;
      if (gesture) {
        // First Escape cancels the in-flight gesture but keeps the tool active.
        event.preventDefault();
        setGesture(null);
        return;
      }
      if (canvasTool === CANVAS_TOOLS.SELECT) return;
      event.preventDefault();
      chooseCanvasTool(CANVAS_TOOLS.SELECT);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      claimShortcut(event);
      if (selectionIsDeletable) deleteSelection();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      claimShortcut(event);
      zoomViewportAt((zoom) => zoom * 1.2);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      claimShortcut(event);
      zoomViewportAt((zoom) => zoom / 1.2);
      return;
    }
    if (event.key === '0') {
      claimShortcut(event);
      fitCeilingInViewport();
      return;
    }
    const definition = TOOL_SHORTCUTS[event.key.toLowerCase()];
    if (!definition) return;
    claimShortcut(event);
    chooseCanvasTool(definition.tool);
  };

  const renderToolButton = (toolId, overrides = {}) => {
    const definition = TOOL_BY_ID[toolId];
    return (
      <ToolButton
        icon={definition.icon}
        label={definition.label}
        shortcut={definition.shortcut}
        title={definition.title}
        active={canvasTool === definition.tool}
        onClick={() => chooseCanvasTool(definition.tool)}
        {...overrides}
      />
    );
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Ceiling assembly detail editor">
      <header className={styles.header}>
        <div className={styles.headerIdentity}>
          <span className={styles.eyebrow}>Reflected ceiling plan workspace</span>
          <h1>Ceiling assembly editor — reflected ceiling plan</h1>
          <p>
            {ceiling.name || 'Ceiling'} · {detail.length.toFixed(0)} × {detail.depth.toFixed(0)} mm ·{' '}
            {profile.manufacturer} {profile.product}
          </p>
        </div>
        <div className={styles.headerActions}>
          <ToolbarButton
            title="Close the ceiling detail editor and return to the floorplan"
            onClick={() => editorDispatch({ type: 'CLOSE_CEILING_DETAIL_EDITOR' })}
          >
            Close
          </ToolbarButton>
        </div>
      </header>

      <div className={styles.body} data-focus="false">
        <aside id="ceiling-detail-left-panel" className={styles.leftPanel} aria-label="Ceiling detailing steps">
          <StepStrip steps={WORKFLOW_STEPS} isOpen={(id) => Boolean(openSections[id])} onSelect={focusStep} />

          <CollapsibleSection
            id="ceiling-face"
            step={1}
            title="Face and boards"
            summary={`${panels.length} board${panels.length === 1 ? '' : 's'} · ${
              face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM ? 'custom' : 'generated grid'
            }`}
            open={openSections.face}
            onToggle={() => toggleSection('face')}
            innerRef={sectionRef('face')}
          >
            <div className={styles.toolRow} aria-label="Board drawing tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_PANEL)}
              {renderToolButton(CANVAS_TOOLS.TRACE_PANEL)}
            </div>
            <Toggle checked={face.enabled} onChange={(enabled) => updateFace({ enabled })} label="Board this ceiling" />
            <InfoHint label="How the board layout works">
              <p className={styles.inlineHelp}>
                A generated grid tiles the whole ceiling from the origin. The moment you draw or trace a board, the grid
                is written out as explicit boards first, so nothing already on the drawing is lost. Regenerate grid puts
                it back.
              </p>
            </InfoHint>
            <SelectField
              label="Product profile"
              value={face.productProfileId}
              onChange={(productProfileId) => updateFace({ productProfileId })}
            >
              {CEILING_PRODUCT_PROFILES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.manufacturer} — {entry.product} ({entry.region})
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Jurisdiction"
              value={configuration.jurisdictionProfileId}
              onChange={(jurisdictionProfileId) => updateDetailing({ jurisdictionProfileId })}
            >
              {CEILING_JURISDICTION_PROFILES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </SelectField>
            <NumberField
              label="Board width"
              value={face.layout.boardWidth}
              min={1}
              onChange={(boardWidth) => updateLayout({ boardWidth })}
            />
            <NumberField
              label="Board height"
              value={face.layout.boardHeight}
              min={1}
              onChange={(boardHeight) => updateLayout({ boardHeight })}
            />
            <NumberField
              label="Board thickness"
              value={face.boardThickness}
              min={1}
              onChange={(boardThickness) => updateFace({ boardThickness })}
            />
            <SelectField
              label="Orientation"
              value={face.layout.orientation}
              onChange={(orientation) => updateLayout({ orientation })}
            >
              <option value="vertical">Long side along V (north/south)</option>
              <option value="horizontal">Long side along U (east/west)</option>
            </SelectField>
            <NumberField
              label="Gap along U"
              value={face.layout.horizontalGap}
              min={0}
              onChange={(horizontalGap) => updateLayout({ horizontalGap })}
            />
            <NumberField
              label="Gap along V"
              value={face.layout.verticalGap}
              min={0}
              onChange={(verticalGap) => updateLayout({ verticalGap })}
            />
            <AdvancedGroup label="Grid origin">
              <NumberField
                label="Origin U"
                value={face.layout.originU}
                onChange={(originU) => updateLayout({ originU })}
              />
              <NumberField
                label="Origin V"
                value={face.layout.originV}
                onChange={(originV) => updateLayout({ originV })}
              />
            </AdvancedGroup>
            <div className={styles.assemblySummary}>
              Layout mode{' '}
              <strong>
                {face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM ? 'Custom boards' : 'Generated grid'}
              </strong>
            </div>
            <div className={styles.buttonRow}>
              <ToolbarButton title="Discard custom boards and rebuild the generated grid" onClick={regeneratePanelGrid}>
                Regenerate grid
              </ToolbarButton>
            </div>
            <div className={styles.profileStatus} data-status={profile.status}>
              <strong>{profile.status.replaceAll('_', ' ')}</strong>
              <span>{profile.source.title}</span>
              <small>{jurisdiction.label}</small>
            </div>
            <p className={styles.inlineHelp}>{reviewCopy}</p>
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-structure"
            step={2}
            title="Structure"
            summary={`${frameMembers.length} member${frameMembers.length === 1 ? '' : 's'} · ${
              configuration.framing.mode === CEILING_FRAMING_LAYOUT_MODES.CUSTOM ? 'custom' : 'automatic'
            }`}
            open={openSections.structure}
            onToggle={() => toggleSection('structure')}
            innerRef={sectionRef('structure')}
          >
            <div className={styles.toolRow} aria-label="Structure drawing tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_FURRING)}
              {renderToolButton(CANVAS_TOOLS.DRAW_CARRIER)}
            </div>
            <InfoHint label="Furring, carriers, and wall angle">
              <p className={styles.inlineHelp}>
                Boards screw to the furring channels; the furring hangs off the carriers; the carriers hang off the
                hangers. Wall angle is derived from the ceiling outline and is not edited here.
              </p>
            </InfoHint>
            <SelectField label="Mode" value={configuration.framing.mode} onChange={(mode) => updateFraming({ mode })}>
              <option value={CEILING_FRAMING_LAYOUT_MODES.AUTOMATIC}>Automatic + custom</option>
              <option value={CEILING_FRAMING_LAYOUT_MODES.CUSTOM}>Explicit custom members</option>
            </SelectField>
            <NumberField
              label="Furring spacing"
              value={configuration.framing.furringSpacing}
              min={50}
              onChange={(furringSpacing) => updateFraming({ furringSpacing })}
            />
            <NumberField
              label="Carrier spacing"
              value={configuration.framing.carrierSpacing}
              min={50}
              onChange={(carrierSpacing) => updateFraming({ carrierSpacing })}
            />
            <NumberField
              label="Furring width"
              value={configuration.framing.furringWidth}
              min={5}
              onChange={(furringWidth) => updateFraming({ furringWidth })}
            />
            <NumberField
              label="Furring depth"
              value={configuration.framing.furringDepth}
              min={5}
              onChange={(furringDepth) => updateFraming({ furringDepth })}
            />
            <NumberField
              label="Carrier width"
              value={configuration.framing.carrierWidth}
              min={5}
              onChange={(carrierWidth) => updateFraming({ carrierWidth })}
            />
            <NumberField
              label="Carrier depth"
              value={configuration.framing.carrierDepth}
              min={5}
              onChange={(carrierDepth) => updateFraming({ carrierDepth })}
            />
            <SelectField
              label="Material"
              value={configuration.framing.material}
              onChange={(material) => updateFraming({ material })}
            >
              <option value="light_gauge_steel">Light-gauge steel</option>
              <option value="timber">Timber</option>
            </SelectField>
            <p className={styles.inlineHelp}>
              Product planning maximum furring spacing: {profile.planningDefaults.maximumFurringSpacingMm} mm
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-suspension"
            step={3}
            title="Suspension"
            summary={`${configuration.suspension.drop} mm drop · ${hangers.length} hanger${
              hangers.length === 1 ? '' : 's'
            }`}
            open={openSections.suspension}
            onToggle={() => toggleSection('suspension')}
            innerRef={sectionRef('suspension')}
          >
            <NumberField
              label="Drop below attachment"
              value={configuration.suspension.drop}
              min={0}
              onChange={(drop) => updateSuspension({ drop })}
            />
            <NumberField
              label="Hanger spacing"
              value={configuration.suspension.hangerSpacing}
              min={50}
              onChange={(hangerSpacing) => updateSuspension({ hangerSpacing })}
            />
            <div className={styles.metrics}>
              <Metric label="Attachment" value={`${formatMm(elevations.attachment)} mm`} note={attachmentLabel} />
              <Metric
                label="Board underside"
                value={`${formatMm(elevations.boardUnderside)} mm`}
                note="finished ceiling"
              />
              <Metric
                label="Furring"
                value={`${formatMm(elevations.furringBottom)} → ${formatMm(elevations.furringTop)} mm`}
              />
              <Metric
                label="Carrier"
                value={`${formatMm(elevations.carrierBottom)} → ${formatMm(elevations.carrierTop)} mm`}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-openings"
            step={4}
            title="Openings"
            summary={`${openings.length} opening${openings.length === 1 ? '' : 's'}`}
            open={openSections.openings}
            onToggle={() => toggleSection('openings')}
            innerRef={sectionRef('openings')}
          >
            <div className={styles.toolRow} aria-label="Opening tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_OPENING)}
            </div>
            <SelectField label="New opening type" value={openingDraftType} onChange={setOpeningDraftType}>
              {Object.values(CEILING_OPENING_TYPES).map((type) => (
                <option key={type} value={type}>
                  {OPENING_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectField>
            <p className={styles.inlineHelp}>
              Pick a type, then press <kbd className={styles.kbd}>O</kbd> and drag the cut-out on the plan.
            </p>
            {configuration.openings.length ? (
              configuration.openings.map((opening) => (
                <div key={opening.id} className={styles.selectionCard}>
                  <SelectField
                    label="Type"
                    value={opening.type}
                    onChange={(type) => updateOpening(opening.id, { type })}
                  >
                    {Object.values(CEILING_OPENING_TYPES).map((type) => (
                      <option key={type} value={type}>
                        {OPENING_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </SelectField>
                  <NumberField label="U" value={opening.u} onChange={(u) => updateOpening(opening.id, { u })} />
                  <NumberField label="V" value={opening.v} onChange={(v) => updateOpening(opening.id, { v })} />
                  <NumberField
                    label="Width"
                    value={opening.width}
                    min={1}
                    onChange={(width) => updateOpening(opening.id, { width })}
                  />
                  <NumberField
                    label="Height"
                    value={opening.height}
                    min={1}
                    onChange={(height) => updateOpening(opening.id, { height })}
                  />
                  <ToolbarButton danger onClick={() => removeOpening(opening.id)}>
                    Delete opening
                  </ToolbarButton>
                </div>
              ))
            ) : (
              <EmptyState title="No ceiling openings yet">
                Access hatches, downlights, and diffusers cut the boards and pull trimmers around themselves.
              </EmptyState>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-screws"
            step={5}
            title="Screws"
            summary={`${fasteners.length} screw${fasteners.length === 1 ? '' : 's'} · ${
              face.fasteners.perimeterSpacing
            } mm perimeter`}
            open={openSections.screws}
            onToggle={() => toggleSection('screws')}
            innerRef={sectionRef('screws')}
          >
            <div className={styles.toolRow} aria-label="Fastener tools">
              {renderToolButton(CANVAS_TOOLS.ADD_FASTENER)}
            </div>
            <SelectField label="Mode" value={face.fasteners.mode} onChange={(mode) => updateFastenerPattern({ mode })}>
              <option value={CEILING_FASTENER_LAYOUT_MODES.GENERATED}>Generated + overrides</option>
              <option value={CEILING_FASTENER_LAYOUT_MODES.CUSTOM}>Explicit custom screws</option>
            </SelectField>
            <NumberField
              label="Edge clearance"
              value={face.fasteners.edgeClearance}
              min={1}
              onChange={(edgeClearance) => updateFastenerPattern({ edgeClearance })}
            />
            <NumberField
              label="Corner clearance"
              value={face.fasteners.cornerClearance}
              min={1}
              onChange={(cornerClearance) => updateFastenerPattern({ cornerClearance })}
            />
            <NumberField
              label="Perimeter spacing"
              value={face.fasteners.perimeterSpacing}
              min={1}
              onChange={(perimeterSpacing) => updateFastenerPattern({ perimeterSpacing })}
            />
            <NumberField
              label="Field spacing"
              value={face.fasteners.fieldSpacing}
              min={1}
              onChange={(fieldSpacing) => updateFastenerPattern({ fieldSpacing })}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-takeoff"
            step={6}
            title="Takeoff"
            summary={`${takeoff.panelCount} boards · ${takeoff.fastenerCount} screws`}
            open={openSections.takeoff}
            onToggle={() => toggleSection('takeoff')}
            innerRef={sectionRef('takeoff')}
          >
            <div className={styles.metrics}>
              <Metric label="Boards" value={takeoff.panelCount} note="unoptimized board count" />
              <Metric label="Stock sheets" value={takeoff.stockSheetCount} note="full sheets before cutting" />
              <Metric label="Installed area" value={`${(takeoff.installedAreaMm2 / 1_000_000).toFixed(2)} m²`} />
              <Metric label="Screws" value={takeoff.fastenerCount} />
              <Metric label="Furring" value={`${(takeoff.furringLinearMm / 1000).toFixed(2)} m`} />
              <Metric label="Carrier" value={`${(takeoff.carrierLinearMm / 1000).toFixed(2)} m`} />
              <Metric label="Wall angle" value={`${(takeoff.wallAngleLinearMm / 1000).toFixed(2)} m`} />
              <Metric label="Trimmers" value={`${(takeoff.trimmerLinearMm / 1000).toFixed(2)} m`} />
              <Metric label="Hangers" value={takeoff.hangerCount} />
            </div>
            <p className={styles.inlineHelp}>{reviewCopy}</p>
          </CollapsibleSection>
        </aside>

        <main className={styles.workspace}>
          <div className={styles.canvasToolbar}>
            <div className={styles.toolPalette} role="toolbar" aria-label="Drawing tools">
              {['navigate', 'board', 'frame', 'detail'].map((group) => (
                <div key={group} className={styles.toolCluster} title={TOOL_GROUP_LABELS[group]}>
                  {TOOL_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => (
                    <span key={definition.tool} className={styles.toolSlot}>
                      {renderToolButton(definition.tool)}
                    </span>
                  ))}
                </div>
              ))}
              <div className={styles.toolCluster}>
                <ToolButton
                  icon="undo"
                  label="Undo"
                  shortcut="Ctrl+Z"
                  title="Undo the last change (Ctrl+Z)"
                  toggle={false}
                  disabled={!canUndo}
                  onClick={() => dispatch({ type: 'UNDO' })}
                />
                <ToolButton
                  icon="redo"
                  label="Redo"
                  shortcut="Ctrl+Y"
                  title="Redo the undone change (Ctrl+Y)"
                  toggle={false}
                  disabled={!canRedo}
                  onClick={() => dispatch({ type: 'REDO' })}
                />
              </div>
              <div className={styles.toolCluster}>
                <ToolButton
                  icon="trash"
                  label="Delete"
                  shortcut="Del"
                  title="Delete selected — remove the selected board, member, screw, or opening (Delete)"
                  danger
                  toggle={false}
                  disabled={!selectionIsDeletable}
                  onClick={deleteSelection}
                />
              </div>
            </div>
            <div className={styles.toolGroup}>
              <span>View</span>
              <ToolbarButton
                active={workspaceView === WORKSPACE_VIEWS.RCP}
                title="Show the reflected ceiling plan only"
                onClick={() => setWorkspaceView(WORKSPACE_VIEWS.RCP)}
              >
                RCP
              </ToolbarButton>
              <ToolbarButton
                active={workspaceView === WORKSPACE_VIEWS.SPLIT}
                title="Show the reflected ceiling plan above the live 3D preview"
                onClick={() => setWorkspaceView(WORKSPACE_VIEWS.SPLIT)}
              >
                Split
              </ToolbarButton>
              <ToolbarButton
                active={workspaceView === WORKSPACE_VIEWS.THREE_D}
                title="Show the live 3D preview only"
                onClick={() => setWorkspaceView(WORKSPACE_VIEWS.THREE_D)}
              >
                Live 3D
              </ToolbarButton>
              <ToolbarButton
                title="Zoom out"
                aria-label="Zoom out"
                onClick={() => zoomViewportAt((zoom) => zoom / 1.2)}
              >
                −
              </ToolbarButton>
              <span className={styles.zoomReadout}>{Math.round(viewport.zoom * 100)}%</span>
              <ToolbarButton title="Zoom in" aria-label="Zoom in" onClick={() => zoomViewportAt((zoom) => zoom * 1.2)}>
                +
              </ToolbarButton>
              <ToolbarButton title="Fit the whole ceiling in view (0)" onClick={fitCeilingInViewport}>
                Fit ceiling
              </ToolbarButton>
            </div>
            <div className={styles.toolGroup}>
              <span>Snap</span>
              <Toggle checked={snapEnabled} onChange={setSnapEnabled} label="Snap" />
              <label className={styles.snapControl}>
                <span>Grid</span>
                <select
                  value={snapStep}
                  title="Drawing grid step used while snapping"
                  onChange={(event) => setSnapStep(Number(event.target.value))}
                >
                  <option value={25}>25 mm</option>
                  <option value={50}>50 mm</option>
                  <option value={100}>100 mm</option>
                </select>
              </label>
            </div>
            <div className={styles.toolGroup}>
              <span>Layers</span>
              {Object.keys(layerVisibility).map((key) => (
                <Toggle
                  key={key}
                  checked={layerVisibility[key]}
                  onChange={(checked) => setLayerVisibility((value) => ({ ...value, [key]: checked }))}
                  label={LAYER_LABELS[key] || key}
                />
              ))}
            </div>
          </div>
          <div className={styles.statusBar} data-snapped="false">
            <span className={styles.statusLive} role="status">
              <span className={styles.statusTool}>
                <ToolGlyph name={activeToolDefinition.icon} />
                <strong>{activeToolDefinition.label}</strong>
                <kbd className={styles.kbd}>{activeToolDefinition.shortcut}</kbd>
              </span>
              <span className={styles.statusHint}>{TOOL_HINTS[canvasTool]}</span>
              <span className={styles.statusSelection}>{selectionSummary}</span>
            </span>
            <span className={styles.statusShortcut}>
              Hold Space + drag to pan · scroll to zoom · 0 fits the ceiling · Esc cancels, then returns to Select
            </span>
          </div>
          <div
            className={styles.workspaceViews}
            /* The shared stylesheet keys its single-pane grid on 'elevation'. */
            data-view={workspaceView === WORKSPACE_VIEWS.RCP ? 'elevation' : workspaceView}
            data-workspace-view={workspaceView}
          >
            {workspaceView !== WORKSPACE_VIEWS.THREE_D ? (
              <div className={styles.elevationPane}>
                <div
                  ref={canvasFrameRef}
                  className={styles.canvasFrame}
                  data-panning={panGesture ? 'true' : 'false'}
                  data-space-pan={spacePanActive ? 'true' : 'false'}
                  onWheel={handleViewportWheel}
                  onPointerDown={beginViewportPan}
                  onPointerMove={updateViewportPan}
                  onPointerUp={finishViewportPan}
                  onPointerCancel={finishViewportPan}
                >
                  <svg
                    ref={svgRef}
                    className={styles.canvas}
                    viewBox={`0 0 ${detail.length} ${detail.depth}`}
                    data-tool={canvasTool}
                    style={{
                      ...(canvasMetrics.ready
                        ? { width: canvasMetrics.fitWidth, height: canvasMetrics.fitHeight }
                        : {}),
                      transform: `translate(${viewport.panU}px, ${viewport.panV}px) scale(${viewport.zoom})`,
                    }}
                    onPointerDown={beginCanvasGesture}
                    onPointerMove={updateCanvasGesture}
                    onPointerUp={finishCanvasGesture}
                    onDoubleClick={finishPanelTrace}
                    onPointerCancel={() => setGesture(null)}
                  >
                    <rect width={detail.length} height={detail.depth} fill="#202830" />
                    <g data-mirrored="false" transform={`translate(0 ${detail.depth}) scale(1 -1)`}>
                      <WallCanvasGrid bounds={bounds} snapStep={snapStep} unitPx={unitPx} active={snapEnabled} />

                      {layerVisibility.openings &&
                        openings.map((opening) => (
                          <rect
                            key={`${opening.id}:void`}
                            className={styles.openingVoid}
                            x={opening.u0}
                            y={opening.v0}
                            width={opening.u1 - opening.u0}
                            height={opening.v1 - opening.v0}
                          />
                        ))}

                      {layerVisibility.boards &&
                        panels.flatMap((panel) =>
                          panel.regions.map((region, index) => (
                            <path
                              key={`${panel.id}:region:${index}`}
                              className={styles.panelShape}
                              data-selected={
                                selection?.type === 'panel' && selection.id === panel.localId ? 'true' : 'false'
                              }
                              d={regionPath(region)}
                              fill={boardFill}
                              fillRule="evenodd"
                              vectorEffect="non-scaling-stroke"
                              onPointerDown={(event) => beginElementMove(event, 'panel', panel.localId, panel)}
                            >
                              <title>{`${panel.label} · ${formatMm(panel.width)} × ${formatMm(panel.height)} mm`}</title>
                            </path>
                          )),
                        )}

                      {layerVisibility.structure &&
                        frameMembers.map((member) =>
                          member.kind === 'wall_angle' ? (
                            <line
                              key={member.id}
                              className={styles.openingProfile}
                              x1={member.start.u}
                              y1={member.start.v}
                              x2={member.end.u}
                              y2={member.end.v}
                              vectorEffect="non-scaling-stroke"
                            >
                              <title>{FRAMING_KIND_LABELS.wall_angle}</title>
                            </line>
                          ) : (
                            <rect
                              key={member.id}
                              className={styles.frameShape}
                              data-selected={
                                selection?.type === 'framing' && selection.id === member.id ? 'true' : 'false'
                              }
                              x={member.u0}
                              y={member.v0}
                              width={member.u1 - member.u0}
                              height={member.v1 - member.v0}
                              fill={FRAMING_COLORS[member.kind]}
                              vectorEffect="non-scaling-stroke"
                              onPointerDown={(event) =>
                                beginElementMove(event, 'framing', member.id, member, isCustomMember(member.id))
                              }
                            >
                              <title>
                                {`${FRAMING_KIND_LABELS[member.kind] || member.kind} · U ${formatMm(
                                  member.u0,
                                )} → ${formatMm(member.u1)} · V ${formatMm(member.v0)} → ${formatMm(member.v1)}`}
                              </title>
                            </rect>
                          ),
                        )}

                      {layerVisibility.hangers &&
                        hangers.map((hanger) => (
                          <circle
                            key={hanger.id}
                            cx={hanger.u}
                            cy={hanger.v}
                            r={4 * unitPx}
                            fill="none"
                            stroke="#8fd0f0"
                            strokeWidth="1.25"
                            vectorEffect="non-scaling-stroke"
                          >
                            <title>{`Hanger · U ${formatMm(hanger.u)} · V ${formatMm(hanger.v)}`}</title>
                          </circle>
                        ))}

                      {layerVisibility.screws &&
                        fasteners.map((fastener) => (
                          <circle
                            key={fastener.id}
                            className={styles.fastenerGraphic}
                            data-selected={
                              selection?.type === 'fastener' && selection.id === fastener.id ? 'true' : 'false'
                            }
                            cx={fastener.u}
                            cy={fastener.v}
                            r={3 * unitPx}
                            fill={
                              selection?.type === 'fastener' && selection.id === fastener.id ? '#ffd166' : '#8a9298'
                            }
                            stroke="#2b3238"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                            onPointerDown={(event) =>
                              beginElementMove(event, 'fastener', fastener.id, fastener, isManualFastener(fastener.id))
                            }
                          >
                            <title>{`Screw · U ${formatMm(fastener.u)} · V ${formatMm(fastener.v)}`}</title>
                          </circle>
                        ))}

                      {layerVisibility.openings &&
                        openings.map((opening) => (
                          <rect
                            key={`${opening.id}:profile`}
                            className={styles.openingProfile}
                            data-selected={
                              selection?.type === 'opening' && selection.id === opening.id ? 'true' : 'false'
                            }
                            x={opening.u0}
                            y={opening.v0}
                            width={opening.u1 - opening.u0}
                            height={opening.v1 - opening.v0}
                            vectorEffect="non-scaling-stroke"
                            onPointerDown={(event) => beginElementMove(event, 'opening', opening.id, opening)}
                          >
                            <title>
                              {`${OPENING_TYPE_LABELS[opening.type] || opening.type} · U ${formatMm(
                                opening.u0,
                              )} → ${formatMm(opening.u1)} · V ${formatMm(opening.v0)} → ${formatMm(opening.v1)}`}
                            </title>
                          </rect>
                        ))}

                      {/* One ring per edge of the ceiling area: the perimeter,
                          plus every wall, beam and column it has been traced
                          around. */}
                      {layerVisibility.boundary
                        ? detail.regions.flatMap((region, regionIndex) =>
                            [region.outline, ...region.holes]
                              .filter((ring) => ring.length >= 3)
                              .map((ring, ringIndex) => (
                                <polyline
                                  key={`ceiling-edge-${regionIndex}-${ringIndex}`}
                                  className={styles.openingProfile}
                                  style={{ pointerEvents: 'none' }}
                                  points={[...ring, ring[0]].map((point) => `${point.u},${point.v}`).join(' ')}
                                  fill="none"
                                  vectorEffect="non-scaling-stroke"
                                />
                              )),
                          )
                        : null}

                      {gesturePreview && (gesturePreviewType === 'panel' || gesturePreviewType === 'opening') ? (
                        <rect
                          className={styles.drawPreview}
                          x={gesturePreview.u0}
                          y={gesturePreview.v0}
                          width={gesturePreview.u1 - gesturePreview.u0}
                          height={gesturePreview.v1 - gesturePreview.v0}
                          fill="rgba(255, 184, 92, .28)"
                          stroke="#ffb85c"
                          strokeWidth="1.25"
                          strokeDasharray="8 5"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {gesturePreview && gesturePreviewType === 'framing' ? (
                        <rect
                          className={styles.drawPreview}
                          x={gesturePreview.u0}
                          y={gesturePreview.v0}
                          width={gesturePreview.u1 - gesturePreview.u0}
                          height={gesturePreview.v1 - gesturePreview.v0}
                          fill="rgba(82, 183, 232, .46)"
                          stroke="#72d0f5"
                          strokeWidth="1.25"
                          strokeDasharray="8 5"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {gesturePreview && gesturePreviewType === 'fastener' ? (
                        <circle
                          className={styles.drawPreview}
                          cx={gesturePreview.u}
                          cy={gesturePreview.v}
                          r={3 * unitPx}
                          fill="#ffd166"
                          stroke="#fff"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {panelTracePreview.length ? (
                        <g className={styles.drawPreview}>
                          <polyline
                            points={panelTracePreview.map((point) => `${point.u},${point.v}`).join(' ')}
                            fill={panelTracePreview.length >= 3 ? 'rgba(255, 184, 92, .2)' : 'none'}
                            stroke="#ffb85c"
                            strokeWidth="1.25"
                            strokeDasharray="8 5"
                            vectorEffect="non-scaling-stroke"
                          />
                          {panelTrace.points.map((point, index) => (
                            <circle
                              key={`${point.u}:${point.v}:${index}`}
                              cx={point.u}
                              cy={point.v}
                              r={3.5 * unitPx}
                              fill={index === 0 ? '#67c5a6' : '#ffb85c'}
                              stroke="#fff"
                              strokeWidth="1"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </g>
                      ) : null}
                    </g>
                    {gestureReadout ? (
                      <CanvasReadoutChip
                        point={gestureReadout.point}
                        lines={gestureReadout.lines}
                        unitPx={unitPx}
                        view={bounds}
                      />
                    ) : null}
                  </svg>
                  <WallCanvasRulers metrics={canvasMetrics} viewport={viewport} bounds={bounds} />
                  {panels.length === 0 ? (
                    <div className={styles.canvasEmptyHint}>
                      <strong>No boards on this ceiling yet</strong>
                      <span>
                        Press <kbd className={styles.kbd}>P</kbd> and drag out a rectangle, or open step 1 and
                        regenerate the grid.
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className={styles.dimensionBar}>
                  <span>U 0 → {detail.length.toFixed(0)} mm</span>
                  <span>V 0 → {detail.depth.toFixed(0)} mm</span>
                  <span>Origin: south-west corner · North up · matches floor plan</span>
                  <span>
                    {panels.length} boards · {frameMembers.length} members · {hangers.length} hangers ·{' '}
                    {fasteners.length} screws · {openings.length} openings
                  </span>
                </div>
              </div>
            ) : null}
            {workspaceView !== WORKSPACE_VIEWS.RCP && previewProject ? (
              <div className={styles.previewPane} aria-label="Live ceiling assembly 3D preview">
                <div className={styles.liveBadge}>
                  <span>Live ceiling preview</span>
                  <small>Updates after every committed board, member, screw, opening, or suspension edit</small>
                </div>
                <Suspense fallback={<div className={styles.previewLoading}>Loading live ceiling preview…</div>}>
                  <ThreePreviewPanel
                    className={styles.wallPreviewPanel}
                    project={previewProject}
                    activeFloorId={ceiling.floorId}
                    applyPhaseFilter={false}
                  />
                </Suspense>
              </div>
            ) : null}
          </div>
        </main>

        <aside id="ceiling-detail-right-panel" className={styles.rightPanel} aria-label="Selection and numbers">
          <CollapsibleSection
            id="ceiling-selection"
            title="Selection"
            summary={selectionSummary}
            open={openSections.selection}
            onToggle={() => toggleSection('selection')}
            innerRef={sectionRef('selection')}
          >
            {selectionIsDeletable ? null : (
              <EmptyState icon="select" title="Nothing selected">
                Pick the Select tool, then click a board, furring channel, screw, or opening on the plan to edit its
                exact numbers here.
              </EmptyState>
            )}

            {selectedPanel && (
              <div className={styles.selectionCard}>
                <h3>Selected board — {selectedPanel.label}</h3>
                <p>Drag on the plan or enter exact ceiling-local dimensions.</p>
                <NumberField
                  label="From west edge (U)"
                  value={selectedPanel.u0}
                  onChange={(u) => updateSelectedPanel({ u })}
                />
                <NumberField
                  label="From south edge (V)"
                  value={selectedPanel.v0}
                  onChange={(v) => updateSelectedPanel({ v })}
                />
                <NumberField
                  label="Width"
                  value={selectedPanel.width}
                  min={1}
                  onChange={(width) => updateSelectedPanel({ width })}
                />
                <NumberField
                  label="Height"
                  value={selectedPanel.height}
                  min={1}
                  onChange={(height) => updateSelectedPanel({ height })}
                />
                <Metric
                  label="Net area"
                  value={`${(selectedPanel.netArea / 1_000_000).toFixed(3)} m²`}
                  note="after boundary and opening cuts"
                />
                <ToolbarButton danger onClick={deleteSelectedPanel}>
                  Delete board
                </ToolbarButton>
              </div>
            )}

            {selectedMember && (
              <div className={styles.selectionCard}>
                <h3>Selected framing — {FRAMING_KIND_LABELS[selectedMember.kind] || selectedMember.kind}</h3>
                {isCustomMember(selectedMember.id) ? (
                  <>
                    <p>Drag on the plan or enter exact member extents.</p>
                    <NumberField
                      label="U start"
                      value={selectedMember.u0}
                      onChange={(u0) => updateSelectedMember({ u0 })}
                    />
                    <NumberField
                      label="U end"
                      value={selectedMember.u1}
                      onChange={(u1) => updateSelectedMember({ u1 })}
                    />
                    <NumberField
                      label="V start"
                      value={selectedMember.v0}
                      onChange={(v0) => updateSelectedMember({ v0 })}
                    />
                    <NumberField
                      label="V end"
                      value={selectedMember.v1}
                      onChange={(v1) => updateSelectedMember({ v1 })}
                    />
                    <NumberField
                      label="Depth"
                      value={selectedMember.depth}
                      min={1}
                      onChange={(depth) => updateSelectedMember({ depth })}
                    />
                  </>
                ) : (
                  <>
                    <p>This member is generated from the current spacing. Delete it to leave a gap in the layout.</p>
                    <div className={styles.metrics}>
                      <Metric
                        label="U span"
                        value={`${formatMm(selectedMember.u0)} → ${formatMm(selectedMember.u1)} mm`}
                      />
                      <Metric
                        label="V span"
                        value={`${formatMm(selectedMember.v0)} → ${formatMm(selectedMember.v1)} mm`}
                      />
                      <Metric label="Depth" value={`${formatMm(selectedMember.depth)} mm`} />
                    </div>
                  </>
                )}
                <ToolbarButton danger onClick={deleteSelectedMember}>
                  Delete member
                </ToolbarButton>
              </div>
            )}

            {selectedFastener && (
              <div className={styles.selectionCard}>
                <h3>Selected screw</h3>
                <NumberField
                  label="From west edge (U)"
                  value={selectedFastener.u}
                  disabled={!isManualFastener(selectedFastener.id)}
                  onChange={(u) => updateSelectedFastener({ u })}
                />
                <NumberField
                  label="From south edge (V)"
                  value={selectedFastener.v}
                  disabled={!isManualFastener(selectedFastener.id)}
                  onChange={(v) => updateSelectedFastener({ v })}
                />
                {isManualFastener(selectedFastener.id) ? null : (
                  <p className={styles.inlineHelp}>
                    Generated from the fixing pattern. Delete it to drop it from the schedule.
                  </p>
                )}
                <ToolbarButton danger onClick={deleteSelectedFastener}>
                  Delete screw
                </ToolbarButton>
              </div>
            )}

            {selectedOpening && (
              <div className={styles.selectionCard}>
                <h3>Selected opening — {OPENING_TYPE_LABELS[selectedOpening.type] || selectedOpening.type}</h3>
                <SelectField
                  label="Type"
                  value={selectedOpening.type}
                  onChange={(type) => updateOpening(selectedOpening.id, { type })}
                >
                  {Object.values(CEILING_OPENING_TYPES).map((type) => (
                    <option key={type} value={type}>
                      {OPENING_TYPE_LABELS[type]}
                    </option>
                  ))}
                </SelectField>
                <NumberField
                  label="U"
                  value={selectedOpening.u}
                  onChange={(u) => updateOpening(selectedOpening.id, { u })}
                />
                <NumberField
                  label="V"
                  value={selectedOpening.v}
                  onChange={(v) => updateOpening(selectedOpening.id, { v })}
                />
                <NumberField
                  label="Width"
                  value={selectedOpening.width}
                  min={1}
                  onChange={(width) => updateOpening(selectedOpening.id, { width })}
                />
                <NumberField
                  label="Height"
                  value={selectedOpening.height}
                  min={1}
                  onChange={(height) => updateOpening(selectedOpening.id, { height })}
                />
                <ToolbarButton danger onClick={deleteSelectedOpening}>
                  Delete opening
                </ToolbarButton>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-summary"
            title="Takeoff summary"
            summary={`${takeoff.panelCount} boards · ${takeoff.hangerCount} hangers`}
            open={openSections.summary}
            onToggle={() => toggleSection('summary')}
            innerRef={sectionRef('summary')}
          >
            <div className={styles.metrics}>
              <Metric label="Boards" value={takeoff.panelCount} />
              <Metric label="Stock sheets" value={takeoff.stockSheetCount} />
              <Metric label="Installed area" value={`${(takeoff.installedAreaMm2 / 1_000_000).toFixed(2)} m²`} />
              <Metric label="Screws" value={takeoff.fastenerCount} />
              <Metric label="Hangers" value={takeoff.hangerCount} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-elevations"
            title="Elevations"
            summary={`Board underside ${formatMm(elevations.boardUnderside)} mm`}
            open={openSections.elevations}
            onToggle={() => toggleSection('elevations')}
            innerRef={sectionRef('elevations')}
          >
            <div className={styles.metrics}>
              <Metric label="Attachment" value={`${formatMm(elevations.attachment)} mm`} note={attachmentLabel} />
              <Metric label="Board underside" value={`${formatMm(elevations.boardUnderside)} mm`} />
              <Metric label="Board top" value={`${formatMm(elevations.boardTop)} mm`} />
              <Metric label="Furring top" value={`${formatMm(elevations.furringTop)} mm`} />
              <Metric label="Carrier top" value={`${formatMm(elevations.carrierTop)} mm`} />
            </div>
            <p className={styles.inlineHelp}>
              All elevations are measured from the project datum, the same one the floor elevations use.
            </p>
          </CollapsibleSection>
        </aside>
      </div>
    </div>
  );
}
