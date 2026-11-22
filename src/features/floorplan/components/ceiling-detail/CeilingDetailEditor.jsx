import {
  Fragment,
  lazy,
  memo,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from 'react';
import { useEditorState, useProject } from '@/features/floorplan/context/FloorplanContext';
import {
  CEILING_ATTACHMENT_MODES,
  CEILING_BOUNDARY_SOURCES,
  CEILING_FASTENER_LAYOUT_MODES,
  CEILING_FRAMING_LAYOUT_MODES,
  CEILING_OPENING_TYPES,
  CEILING_PANEL_LAYOUT_MODES,
  createCeilingDetailing,
  createCeilingDimension,
  createCeilingLightFixture,
  createCeilingOpening,
  createCustomCeilingFramingMember,
  createManualCeilingFastener,
  deriveCeilingDetail,
  getProjectCeiling,
  resolveCeilingBeamSupports,
  resolveCeilingLocalSpace,
} from '@/domain/ceilingModels';
import {
  WALL_DIMENSION_MODES,
  WALL_DIMENSION_PRECISIONS,
  formatWallDimensionValue,
  wallDimensionMeasurement,
} from '@/domain/wallDetailing';
import {
  BEAM_ANGLE_RANGE_DEG,
  COLOR_TEMPERATURES,
  DEFAULT_FIXTURE_TYPE_ID,
  FIXTURE_TYPES,
  getBulbType,
  getFixtureType,
  isPendantFixture,
  resolveFixturePhotometrics,
} from '@/domain/lightingCatalog';
import { CEILING_BEAM_ELEVATION_TOLERANCE, getCeilingSupportBeamLevels } from '@/domain/ceilingBeamAttachment';
import { getBeamDisplayLabel } from '@/domain/beamLabels';
import {
  CEILING_BOARD_MATERIALS,
  CEILING_JURISDICTION_PROFILES,
  CEILING_PRODUCT_PROFILES,
  CEILING_PRODUCT_PROFILE_STATUS,
  getCeilingJurisdictionProfile,
  getCeilingProductProfile,
} from '@/domain/ceilingProductProfiles';
import { boardMaterialLabel } from '@/features/floorplan/components/wall-detail/wallDetailSelectionReadout';
import {
  collectWallSnapCandidates,
  createDrawnPanel,
  createTracedPanel,
  moveMemberWithinBounds,
  movePanelWithinBounds,
  movePointWithinBounds,
  moveWallDimensionWithinBounds,
  panWallViewport,
  polygonSnapTargets,
  quantizeWallLocalPoint,
  rectSnapTargets,
  screenPointToWallLocal,
  snapWallDimensionEndpoint,
  snapWallLocalPoint,
  zoomWallViewport,
} from '@/features/floorplan/components/wall-detail/wallDetailEditorGeometry';
import {
  CanvasReadoutChip,
  WallCanvasRulers,
  useWallCanvasMetrics,
} from '@/features/floorplan/components/wall-detail/WallCanvasChrome';
import {
  friendlyAnchorPhrase,
  wallUnitsPerPixel,
} from '@/features/floorplan/components/wall-detail/wallDetailCanvasMath';
import {
  isMeasureClick,
  isSpaceKey,
  spaceArmsPanLatch,
  spaceKeyUpTaken,
  travelledPastClick,
} from '@/features/floorplan/components/wall-detail/detailCanvasRules';
import { isTypingTarget } from '@/utils/keyboard';
import {
  DimensionAcquisitionGraphic,
  DimensionGraphic,
} from '@/features/floorplan/components/wall-detail/WallDimensionGraphics';
import {
  AdvancedGroup,
  CollapsibleSection,
  EmptyState,
  IconButton,
  InfoHint,
  NumberField,
  Popover,
  ReadoutRow,
  SegmentedControl,
  SelectField,
  TextField,
  Toggle,
  ToolButton,
  ToolGlyph,
  ToolbarButton,
  isPopoverOpen,
} from '@/features/floorplan/components/wall-detail/WallDetailUiKit';
import styles from '@/features/floorplan/components/wall-detail/WallDetailEditor.module.css';
import { ceilingSilhouette } from '@/features/floorplan/components/preview/loadingSilhouettes';
import { useShellFirst } from '@/features/floorplan/components/wall-detail/useShellFirst';
import { LOADING_COPY, PanePlaceholder } from '@/ui/loading';
import { CeilingEditorOpeningShell, ceilingDisplayName, lastLayoutCounts } from './ceilingDetailEditorShell';
import { createCeilingDetailPreviewProject } from './ceilingDetailPreviewProject';
import { useDeferredCoordination } from './useDeferredCoordination';
import { CeilingPlanUnderlay, CeilingPlanUnderlayLabels } from './CeilingPlanUnderlay';
import {
  CeilingLightGhost,
  CeilingLightGuides,
  CeilingLightRunGhost,
  LIGHT_TOOL_HINT,
  LightToolOptions,
  PANE_SNAP_SCALE,
  lightPlacementReadout,
  lightRunReadout,
  paneLightPoint,
  resolveLightPlacement,
  useLightRunShiftRelease,
} from './CeilingLightPlacement';
import { collectLightSnapTargets } from './lightSnap';
import { adjustLightRun, isLightRunDrag, moveLightRun, resolveLightRunPoints, startLightRun } from './lightRun';
import {
  CeilingBoardLayer,
  CeilingBoundaryLayer,
  CeilingFixtureLayer,
  CeilingGridLayer,
  CeilingHangerLayer,
  CeilingOpeningProfileLayer,
  CeilingScrewLayer,
  CeilingStructureLayer,
  FRAMING_KIND_LABELS,
  OPENING_TYPE_LABELS,
  formatMm,
} from './CeilingPlanLayers';

const ThreePreviewPanel = lazy(() => import('@/features/floorplan/components/preview/ThreePreviewPanel'));

/**
 * The live 3D pane, held still while the plan is being panned. Panning re-renders
 * the editor on every pointer move, and the preview has no interest in where the
 * plan viewport sits — only in the project it is drawing.
 *
 * The selection crosses in both directions: what is picked on the plan lights up
 * orange here, and what is picked here comes back to the plan. Which is why the
 * selection arrives as two primitives rather than an object — a fresh object
 * every render would defeat the memo and put the whole preview back in the pan
 * path.
 */
const CeilingLivePreview = memo(function CeilingLivePreview({
  className,
  project,
  activeFloorId,
  selectionKind,
  selectionId,
  onPick,
  silhouette,
  loadingSince,
}) {
  return (
    <ThreePreviewPanel
      className={className}
      project={project}
      activeFloorId={activeFloorId}
      applyPhaseFilter={false}
      assemblySelection={selectionKind && selectionId ? { kind: selectionKind, id: selectionId } : null}
      selectionAccent="assembly"
      onAssemblyPick={onPick}
      paneKind="ceiling"
      placeholderTone="paper"
      loadingLabel={LOADING_COPY.livePreview}
      compilingLabel={LOADING_COPY.compilingCeiling}
      silhouette={silhouette}
      loadingSince={loadingSince}
    />
  );
});

// Stands in for a beam attachment the level list cannot show: beams that have
// gone, or that have been re-levelled out of eligibility. Selecting it is a
// no-op — it exists so the picker states what the ceiling is doing instead of
// showing an empty box.
const UNLISTED_SUPPORT_LEVEL = 'unlisted_support_level';

const CANVAS_TOOLS = Object.freeze({
  SELECT: 'select',
  PAN: 'pan',
  DRAW_PANEL: 'draw_panel',
  TRACE_PANEL: 'trace_panel',
  DRAW_FURRING: 'draw_furring',
  DRAW_CARRIER: 'draw_carrier',
  DRAW_OPENING: 'draw_opening',
  ADD_LIGHT: 'add_light',
  ADD_FASTENER: 'add_fastener',
  DRAW_DIMENSION: 'draw_dimension',
});

const DIMENSION_SNAP_RADIUS_PX = 22;
const DIMENSION_POINT_GRAVITY_PX = 14;

const WORKSPACE_VIEWS = Object.freeze({
  RCP: 'rcp',
  SPLIT: 'split',
  THREE_D: '3d',
});

const MIN_DRAWN_SIZE = 10;

/**
 * Parts of the 3D pane a click can turn into a selection on the plan. Hangers
 * are drawn there but the drawing has no handle for one, so clicking a hanger
 * leaves the selection where it was rather than clearing it.
 */
const PICKABLE_PREVIEW_PARTS = new Set(['panel', 'framing', 'fastener', 'opening', 'fixture']);

const TOOL_HINTS = Object.freeze({
  [CANVAS_TOOLS.SELECT]: 'Select and drag any board, framing member, screw, opening, or light',
  [CANVAS_TOOLS.PAN]: 'Drag anywhere to pan; use the mouse wheel to zoom',
  [CANVAS_TOOLS.DRAW_PANEL]: 'Drag a rectangle to draw a ceiling board',
  [CANVAS_TOOLS.TRACE_PANEL]: 'Click each cut corner; click the first point or double-click to finish',
  [CANVAS_TOOLS.DRAW_FURRING]: 'Click for a furring channel across the full width, or drag its span',
  [CANVAS_TOOLS.DRAW_CARRIER]: 'Click for a carrier across the full depth, or drag its span',
  [CANVAS_TOOLS.DRAW_OPENING]: 'Drag a rectangle to cut an opening in the ceiling',
  [CANVAS_TOOLS.ADD_LIGHT]: LIGHT_TOOL_HINT,
  [CANVAS_TOOLS.ADD_FASTENER]: 'Click to place a screw',
  [CANVAS_TOOLS.DRAW_DIMENSION]: 'Click two exact points (or drag); hold Shift to keep the run level or plumb',
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
    icon: 'opening',
    label: 'Opening',
    shortcut: 'O',
    title: 'Draw opening — drag out a hatch, downlight, or diffuser cut-out (O)',
    group: 'detail',
  },
  {
    tool: CANVAS_TOOLS.ADD_LIGHT,
    // Its own glyph, not the screw's: at laptop widths the toolbar drops the
    // names and the icons have to tell Light and Screw apart on their own.
    icon: 'light',
    label: 'Light',
    shortcut: 'L',
    title: 'Place light — click to set a downlight, pendant, or troffer (L)',
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
  {
    tool: CANVAS_TOOLS.DRAW_DIMENSION,
    icon: 'measure',
    label: 'Measure',
    shortcut: 'M',
    title: 'Draw measurement — click two exact points, or drag; Shift locks level/plumb (M)',
    group: 'measure',
  },
]);

const TOOL_GROUP_LABELS = Object.freeze({
  navigate: 'Move around',
  board: 'Boards',
  frame: 'Structure',
  detail: 'Openings, lights, and screws',
  measure: 'Measuring',
});

const TOOL_BY_ID = Object.freeze(
  TOOL_DEFINITIONS.reduce((map, definition) => ({ ...map, [definition.tool]: definition }), {}),
);

const TOOL_SHORTCUTS = Object.freeze(
  TOOL_DEFINITIONS.reduce((map, definition) => ({ ...map, [definition.shortcut.toLowerCase()]: definition }), {}),
);

/**
 * Left-panel workflow, in the order a real ceiling gets detailed. The collapsed
 * section headers are the map of the job (number, title, live summary); one
 * step is open at a time and each ends with "Next: …" (docs/assembly-editor-ui.md §2.3).
 */
const WORKFLOW_STEPS = Object.freeze([
  { id: 'face', title: 'Face and boards' },
  { id: 'structure', title: 'Structure' },
  { id: 'suspension', title: 'Suspension' },
  { id: 'openings', title: 'Openings' },
  { id: 'lighting', title: 'Lighting' },
  { id: 'screws', title: 'Screws' },
  { id: 'dimensions', title: 'Dimensions' },
  { id: 'takeoff', title: 'Takeoff' },
]);

/** The step "Next" leads to from `id`, or null after the last. */
function nextWorkflowStep(id) {
  const index = WORKFLOW_STEPS.findIndex((step) => step.id === id);
  return index >= 0 ? WORKFLOW_STEPS[index + 1] || null : null;
}

const WORKSPACE_VIEW_OPTIONS = Object.freeze([
  { value: WORKSPACE_VIEWS.RCP, label: 'Plan', title: 'Show the reflected ceiling plan only' },
  { value: WORKSPACE_VIEWS.SPLIT, label: 'Split', title: 'Show the reflected ceiling plan above the live 3D preview' },
  { value: WORKSPACE_VIEWS.THREE_D, label: '3D', title: 'Show the live 3D preview only' },
]);

const LAYER_LABELS = Object.freeze({
  plan: 'Plan',
  boundary: 'Outline',
  openings: 'Openings',
  boards: 'Boards',
  structure: 'Structure',
  hangers: 'Hangers',
  screws: 'Screws',
  fixtures: 'Lights',
  dimensions: 'Sizes',
});

const SELECTION_LABELS = Object.freeze({
  panel: 'ceiling board',
  framing: 'framing member',
  fastener: 'screw',
  opening: 'ceiling opening',
  fixture: 'light fixture',
  dimension: 'measurement',
});

/** Value the material picker uses for "whatever the profile says". */
const PROFILE_DEFAULT_MATERIAL = '';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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

/**
 * Everything on the reflected ceiling plan a measurement endpoint can lock onto:
 * the ceiling outline itself, every board corner and edge, the framing centres,
 * openings, and the marker points — screws, hangers and luminaires.
 *
 * The wall editor's collector cannot be reused as it stands. It keeps only the
 * near frame (`frameIndex === 0`), which no ceiling member carries, and it names
 * the whole-assembly rectangle 'wall'. Everything below it — the anchor grid on
 * a rectangle, the vertex/edge grid on a traced outline — is imported.
 */
function collectCeilingDimensionSnapTargets({
  ceilingId,
  panels = [],
  members = [],
  openings = [],
  fasteners = [],
  hangers = [],
  fixtures = [],
  length,
  depth,
}) {
  const markerTargets = (entries, entityType) =>
    entries.map((entry) => ({
      kind: 'point',
      u: entry.u,
      v: entry.v,
      reference: { entityType, entityId: entry.id, anchor: 'center' },
    }));
  return [
    ...rectSnapTargets('ceiling', ceilingId, { u0: 0, u1: length, v0: 0, v1: depth }),
    ...panels.flatMap((panel) =>
      panel.outlinePoints?.length
        ? polygonSnapTargets('panel', panel.localId || panel.id, panel.outlinePoints)
        : rectSnapTargets('panel', panel.localId || panel.id, panel),
    ),
    // Wall angles run as a line rather than a rectangle, so they carry no anchor
    // grid — the ceiling outline is what you measure to along that edge.
    ...members
      .filter((member) => member.kind !== 'wall_angle')
      .flatMap((member) => {
        const centerU = (member.u0 + member.u1) / 2;
        const centerV = (member.v0 + member.v1) / 2;
        return [
          ...rectSnapTargets('framing', member.id, member),
          {
            kind: 'segment',
            start: member.orientation === 'vertical' ? { u: centerU, v: member.v0 } : { u: member.u0, v: centerV },
            end: member.orientation === 'vertical' ? { u: centerU, v: member.v1 } : { u: member.u1, v: centerV },
            reference: { entityType: 'framing', entityId: member.id, anchor: 'axis_center' },
          },
        ];
      }),
    ...openings.flatMap((opening) => rectSnapTargets('opening', opening.id, opening)),
    ...markerTargets(fasteners, 'fastener'),
    ...markerTargets(hangers, 'hanger'),
    ...markerTargets(fixtures, 'fixture'),
  ];
}

/**
 * The committed measurements — derived chains and hand-drawn ones alike. They
 * live in their own memo rather than inside `CeilingPlanLayers` because they are
 * drawn in un-flipped SVG space: `DimensionGraphic` turns UV into drawing
 * coordinates itself, which is what keeps the text upright on a plan whose V
 * axis runs the other way.
 *
 * `hiddenId` is the measurement currently under a drag. That one is drawn live
 * outside the memo, so a drag never re-renders the rest of the sheet.
 */
const CeilingDimensionLayer = memo(function CeilingDimensionLayer({
  dimensions,
  view,
  unitPx,
  selectedId,
  hiddenId,
  selectTool,
  onDimensionPointerDown,
  onStartHandlePointerDown,
  onEndHandlePointerDown,
}) {
  const handleRadius = 4.5 * unitPx;
  const fontSize = 12.5 * unitPx;
  return (
    <>
      {dimensions
        .filter((dimension) => dimension.id !== hiddenId)
        .map((dimension) => {
          const selected = selectedId === dimension.id;
          return (
            <DimensionGraphic
              key={dimension.id}
              dimension={dimension}
              view={view}
              selected={selected}
              editable={selected && dimension.source === 'custom' && selectTool}
              unitPx={unitPx}
              handleRadius={handleRadius}
              fontSize={fontSize}
              title={`${dimension.name || 'Measurement'} · ${dimension.label}`}
              onPointerDown={(event) => onDimensionPointerDown(event, dimension)}
              onStartHandlePointerDown={(event) => onStartHandlePointerDown(event, dimension)}
              onEndHandlePointerDown={(event) => onEndHandlePointerDown(event, dimension)}
            />
          );
        })}
    </>
  );
});

/*
 * The contexts are read here and handed down, so the editor body is a memo of
 * what it actually draws from. The project context changes identity whenever
 * the coordination models do — the deferred settle after a run of placements
 * is exactly that, with the project itself untouched — and re-rendering the
 * whole RCP and its aside for it was most of the settle's cost.
 */
/*
 * `mountShellFirst` (the workspace sets it) paints the editor's frame first and
 * renders the body after that paint, as a transition (§6.1): the click that
 * opened the editor is answered by the next frame, and the derivation runs
 * behind a frame that already looks like the editor. Without it the body
 * renders in the same pass, which is what a test or any synchronous host wants.
 */
export default function CeilingDetailEditor({ mountShellFirst = false }) {
  const { project, dispatch, canUndo = false, canRedo = false } = useProject();
  const { ceilingDetailEditor, dispatch: editorDispatch } = useEditorState();
  const ceilingId = ceilingDetailEditor?.ceilingId ?? null;
  const { openedAt, ready } = useShellFirst(ceilingId, mountShellFirst);

  const storedCeiling = ready ? null : getProjectCeiling(project, ceilingId);
  if (ceilingDetailEditor && !ready && storedCeiling) {
    return (
      <CeilingEditorOpeningShell
        ceilingId={ceilingId}
        storedCeiling={storedCeiling}
        editorDispatch={editorDispatch}
        openedAt={openedAt}
      />
    );
  }

  return (
    <CeilingDetailEditorBody
      project={project}
      dispatch={dispatch}
      canUndo={canUndo}
      canRedo={canRedo}
      ceilingDetailEditor={ceilingDetailEditor}
      editorDispatch={editorDispatch}
      openedAt={openedAt}
    />
  );
}

// The editor proper; the workspace loads it on demand behind the shell
// (CeilingDetailEditorLazy).
export const CeilingDetailEditorBody = memo(function CeilingDetailEditorBody({
  project,
  dispatch,
  canUndo,
  canRedo,
  ceilingDetailEditor,
  editorDispatch,
  openedAt,
}) {
  const scheduleCoordinationSettle = useDeferredCoordination(dispatch, Boolean(ceilingDetailEditor));
  const svgRef = useRef(null);
  const canvasFrameRef = useRef(null);
  /*
    Pointer maths is pinned to the rect the gesture started on. Read live, the
    drawing could move out from under a pointer that had not moved: selecting a
    board grows the status bar by a line, which shortens the canvas frame, which
    re-fits the plan — between one pointerdown and its pointerup. The click then
    landed somewhere else in ceiling coordinates and committed a drag nobody
    made. Zoom is the one thing that legitimately changes the rect mid-gesture,
    so it clears this.
  */
  const gestureRectRef = useRef(null);
  const storedCeiling = getProjectCeiling(project, ceilingDetailEditor?.ceilingId);
  /*
    What this editor draws is the stored ceiling, or — between a commit and the
    store catching up — the detailing that commit sent. Commits are transitions
    (see `commitDetailing`), so the store's re-render of everything that reads
    the project runs in slices; this lets the RCP itself show the edit at once,
    urgently, without waiting for the floor plan under the overlay to finish.
    React drops the optimistic value the moment the transition lands, and the
    store then holds that very detailing object, so the two never disagree.
  */
  const [optimisticDetailing, showDetailing] = useOptimistic(storedCeiling?.detailing ?? null, (current, next) => next);
  const ceiling = useMemo(
    () =>
      storedCeiling && optimisticDetailing && optimisticDetailing !== storedCeiling.detailing
        ? { ...storedCeiling, detailing: optimisticDetailing }
        : storedCeiling,
    [storedCeiling, optimisticDetailing],
  );

  const [layerVisibility, setLayerVisibility] = useState({
    // The floor plan under the boards, so a light is placed in a room rather
    // than at a coordinate. First, because it is what the drawing is read against.
    plan: true,
    boundary: true,
    openings: true,
    boards: true,
    structure: true,
    hangers: true,
    screws: true,
    fixtures: true,
    dimensions: true,
  });
  const [selection, setSelection] = useState(null);
  const [canvasTool, setCanvasTool] = useState(CANVAS_TOOLS.SELECT);
  const [gesture, setGesture] = useState(null);
  const [dimensionAcquisition, setDimensionAcquisition] = useState(null);
  const [panelTrace, setPanelTrace] = useState(null);
  const [viewport, setViewport] = useState({ zoom: 1, panU: 0, panV: 0 });
  const [panGesture, setPanGesture] = useState(null);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(50);
  const [openingDraftType, setOpeningDraftType] = useState(CEILING_OPENING_TYPES.ACCESS_HATCH);
  const [lightDraftType, setLightDraftType] = useState(DEFAULT_FIXTURE_TYPE_ID);
  // Where the pointer is while the Light tool is armed: the raw ceiling point,
  // the screen scale it was read at, and Shift. Drawn as the ghost, never as a
  // layer, so a move re-renders the editor body and none of the plan.
  const [lightHover, setLightHover] = useState(null);
  const [workspaceView, setWorkspaceView] = useState(WORKSPACE_VIEWS.SPLIT);
  // The left panel is an exclusive accordion: one workflow step open at a time
  // (bodies stay mounted and `hidden`). The right panel's sections are
  // independent; Selection is always open and has no entry here.
  const [openStep, setOpenStep] = useState('face');
  const [openSections, setOpenSections] = useState({
    summary: true,
    elevations: true,
  });
  // Set by "Next": the step to bring into view once it has opened.
  const pendingStepScrollRef = useRef(null);
  const sectionNodes = useRef({});
  const sectionRefSetters = useRef({});
  const shortcutHandlerRef = useRef(null);
  /*
    The plan layers are memoised, so the callbacks they hold have to keep the
    same identity from render to render or the memo never holds. These forward to
    whatever this render's closures are, which is what the layers would have
    captured anyway.
  */
  const canvasHandlersRef = useRef({});
  const stableCanvasHandlers = useRef({
    onElementPointerDown: (...args) => canvasHandlersRef.current.beginElementMove?.(...args),
    isCustomMember: (id) => Boolean(canvasHandlersRef.current.isCustomMember?.(id)),
    isManualFastener: (id) => Boolean(canvasHandlersRef.current.isManualFastener?.(id)),
    onDimensionPointerDown: (...args) => canvasHandlersRef.current.pressDimension?.(...args),
    onStartHandlePointerDown: (event, dimension) =>
      canvasHandlersRef.current.beginDimensionEndpointMove?.(event, dimension, 'start'),
    onEndHandlePointerDown: (event, dimension) =>
      canvasHandlersRef.current.beginDimensionEndpointMove?.(event, dimension, 'end'),
  }).current;
  /*
    A pick in the 3D pane, translated back to a selection on the plan. Only the
    parts the plan can select are honoured: a hanger is drawn there but is not
    something the drawing lets you pick, so clicking one leaves the selection
    alone rather than clearing it. Empty space does clear it. With the Light
    tool armed, a click on one of this ceiling's boards places a light at the
    hit instead (read through the ref, so this keeps one identity).
  */
  const handlePreviewPick = useCallback((part, hit) => {
    if (canvasHandlersRef.current.placeLightFromPane?.(part, hit)) return;
    if (!part) {
      setSelection(null);
      return;
    }
    if (!PICKABLE_PREVIEW_PARTS.has(part.kind)) return;
    setSelection({ type: part.kind, id: part.id });
  }, []);
  const wheelHandlerRef = useRef(null);
  const wheelDetachRef = useRef(null);
  /*
    React registers `onWheel` passively, so a React handler cannot stop the page
    scrolling underneath a scroll-to-zoom. The frame takes its own non-passive
    listener instead; a callback ref keeps it attached across the pane remounting
    when the workspace view changes.
  */
  const attachCanvasFrame = useCallback((node) => {
    canvasFrameRef.current = node;
    wheelDetachRef.current?.();
    wheelDetachRef.current = null;
    if (!node) return;
    const onWheel = (event) => wheelHandlerRef.current?.(event);
    node.addEventListener('wheel', onWheel, { passive: false });
    wheelDetachRef.current = () => node.removeEventListener('wheel', onWheel);
  }, []);

  // Capture phase: this editor is modal, so the keys it claims must never reach the
  // floorplan canvas listening on the same window (its own Delete would remove rooms).
  // Only claimed keys stop propagating — Space-pan, Escape, and Ctrl shortcuts pass through.
  useEffect(() => {
    const onShortcutKeyDown = (event) => shortcutHandlerRef.current?.(event);
    window.addEventListener('keydown', onShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', onShortcutKeyDown, true);
  }, []);

  // "Next" opens the following step; once it has rendered open, scroll its
  // header to the top of the panel so the body is what the eye lands on.
  useEffect(() => {
    const id = pendingStepScrollRef.current;
    if (!id || id !== openStep) return;
    pendingStepScrollRef.current = null;
    sectionNodes.current[id]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [openStep]);

  useEffect(() => {
    if (!panelTrace) return undefined;
    const cancelTrace = (event) => {
      if (event.key !== 'Escape') return;
      // An open popover takes Escape for itself (WallDetailUiKit Popover).
      if (isPopoverOpen()) return;
      // Escape in a field throws away what was typed there, and nothing else.
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      gestureRectRef.current = null;
      setPanelTrace(null);
    };
    window.addEventListener('keydown', cancelTrace);
    return () => window.removeEventListener('keydown', cancelTrace);
  }, [panelTrace]);

  // Space held pans the drawing, anywhere but in a field (detailCanvasRules).
  useEffect(() => {
    const enableSpacePan = (event) => {
      if (!spaceArmsPanLatch(event)) return;
      event.preventDefault();
      setSpacePanActive(true);
    };
    const disableSpacePan = (event) => {
      if (!isSpaceKey(event)) return;
      if (spaceKeyUpTaken(event)) event.preventDefault();
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
  const lightFixtures = detail?.lightFixtures || [];
  const openings = detail?.openings || [];
  const dimensions = detail?.dimensions || [];
  const profile = face ? getCeilingProductProfile(face.productProfileId) : null;
  const jurisdiction = configuration ? getCeilingJurisdictionProfile(configuration.jurisdictionProfileId) : null;
  // Reflected ceiling plan: U runs east, V runs north, and nothing is mirrored —
  // the drawing keeps the same handedness as the floor plan underneath it.
  // Held by value, not by `detail`: a fresh object per commit made every layer
  // drawn against it let go on edits that moved nothing.
  const detailLength = detail?.length;
  const detailDepth = detail?.depth;
  const bounds = useMemo(
    () => (Number.isFinite(detailLength) ? { length: detailLength, height: detailDepth, mirrorU: false } : null),
    [detailLength, detailDepth],
  );
  const canvasMetrics = useWallCanvasMetrics(canvasFrameRef, bounds, workspaceView);
  const unitPx = wallUnitsPerPixel(canvasMetrics, viewport, bounds);
  const previewProject = useMemo(() => createCeilingDetailPreviewProject(project, ceiling?.id), [project, ceiling?.id]);
  const ceilingFloor = useMemo(
    () => (project?.floors || []).find((entry) => entry.id === ceiling?.floorId) || null,
    [project, ceiling?.floorId],
  );
  const supportLevels = useMemo(() => getCeilingSupportBeamLevels(ceilingFloor), [ceilingFloor]);
  const supportBeams = useMemo(() => resolveCeilingBeamSupports(project, ceiling), [project, ceiling]);
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
  /*
    A boarded ceiling carries several hundred screws, and every one of them is a
    snap target. They are only built while there is something to snap: the
    measuring tool is up, or a measurement is selected and its endpoint grips are
    on the drawing.
  */
  const dimensionSnapTargets = useMemo(
    () =>
      detail && (canvasTool === CANVAS_TOOLS.DRAW_DIMENSION || selection?.type === 'dimension')
        ? collectCeilingDimensionSnapTargets({
            ceilingId: detail.ceilingId,
            panels: detail.panels,
            members: detail.framing,
            openings: detail.openings,
            fasteners: detail.fasteners,
            hangers: detail.hangers,
            fixtures: detail.lightFixtures,
            length: detail.length,
            depth: detail.depth,
          })
        : [],
    [canvasTool, detail, selection?.type],
  );
  const movingFixtureId = gesture?.kind === 'move' && gesture.type === 'fixture' ? gesture.id : null;
  const placingLights = canvasTool === CANVAS_TOOLS.ADD_LIGHT || Boolean(movingFixtureId);
  // Only while a light is being placed or moved; the one moving is left out so
  // it cannot line up with itself.
  const lightSnapTargets = useMemo(
    () =>
      detail && placingLights
        ? collectLightSnapTargets({
            panels: detail.panels,
            regions: detail.regions,
            fixtures: detail.lightFixtures,
            length: detail.length,
            depth: detail.depth,
            excludeId: movingFixtureId,
          })
        : [],
    [detail, placingLights, movingFixtureId],
  );
  // A Light-tool press that has not yet travelled past a click (lightRun.js).
  const lightPressRef = useRef(null);
  const lightRunLive = gesture?.kind === 'draw' && gesture.tool === CANVAS_TOOLS.ADD_LIGHT;
  useLightRunShiftRelease(lightRunLive, setGesture);
  // Keyed on the outline alone, so the 3D pane's memo is not let go by edits.
  const ceilingBoundary = ceiling?.boundaryPolygon;
  const previewSilhouette = useMemo(() => ceilingSilhouette({ boundaryPolygon: ceilingBoundary }), [ceilingBoundary]);
  const boardCount = panels.length;
  const screwCount = fasteners.length;
  useEffect(() => {
    if (ceiling?.id) lastLayoutCounts.set(ceiling.id, { boards: boardCount, screws: screwCount });
  }, [ceiling?.id, boardCount, screwCount]);

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
  // Opening a step closes the one that was open; clicking the open step closes it.
  const toggleStep = (id) => setOpenStep((current) => (current === id ? null : id));
  const sectionRef = (id) => {
    if (!sectionRefSetters.current[id]) {
      sectionRefSetters.current[id] = (node) => {
        sectionNodes.current[id] = node;
      };
    }
    return sectionRefSetters.current[id];
  };
  const focusStep = (id) => {
    pendingStepScrollRef.current = id;
    setOpenStep(id);
  };
  /** The props that make a left-panel section one step of the exclusive accordion. */
  const stepProps = (id) => {
    const next = nextWorkflowStep(id);
    return {
      // The body ids (`wall-detail-ceiling-…`) are the ones the panel always had.
      id: `ceiling-${id}`,
      open: openStep === id,
      onToggle: () => toggleStep(id),
      innerRef: sectionRef(id),
      next: next ? { label: next.title, onClick: () => focusStep(next.id) } : null,
    };
  };

  // Deferred: no coordination model reads a ceiling's assembly, and the pass
  // was most of a click's cost. The hook settles it once the editor goes idle.
  //
  // And a transition: the commit re-renders everything that reads the project —
  // the floor plan, sidebar and panels under this overlay as well as the RCP —
  // and as one urgent render that was a single long task on every click. As a
  // transition React renders it in slices and keeps the page answering; the
  // pointer, the ghost and the field being typed into stay urgent.
  const commitDetailing = (next) => {
    const detailing = createCeilingDetailing(next);
    startTransition(() => {
      showDetailing(detailing);
      dispatch({ type: 'CEILING_UPDATE', ceiling: { id: ceiling.id, detailing }, coordination: 'defer' });
    });
    scheduleCoordinationSettle();
  };

  const updateDetailing = (patch) => commitDetailing({ ...configuration, ...patch });
  const updateFace = (patch) => updateDetailing({ face: { ...face, ...patch } });
  const updateLayout = (patch) => updateFace({ layout: { ...face.layout, ...patch } });
  const updateFastenerPattern = (patch) => updateFace({ fasteners: { ...face.fasteners, ...patch } });
  const updateFraming = (patch) => updateDetailing({ framing: { ...configuration.framing, ...patch } });
  const updateSuspension = (patch) => updateDetailing({ suspension: { ...configuration.suspension, ...patch } });
  const updateOpenings = (next) => updateDetailing({ openings: next });
  const updateLighting = (patch) => updateDetailing({ lighting: { ...configuration.lighting, ...patch } });
  const updateDimensionSettings = (patch) => updateDetailing({ dimensions: { ...configuration.dimensions, ...patch } });

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
    lightPressRef.current = null;
    setDimensionAcquisition(null);
    gestureRectRef.current = null;
    if (tool !== CANVAS_TOOLS.TRACE_PANEL) setPanelTrace(null);
    setLightHover(null);
  };

  // Drops the gesture in flight (a light press included), its pick-up marker
  // and its pinned rect; the tool stays armed.
  const dropCanvasGesture = () => {
    lightPressRef.current = null;
    setGesture(null);
    setDimensionAcquisition(null);
    releaseCanvasRect();
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

  const deleteSelectedFixture = () => {
    updateLighting({ fixtures: configuration.lighting.fixtures.filter((fixture) => fixture.id !== selection.id) });
    setSelection(null);
  };

  const deleteSelectedDimension = () => {
    updateDimensionSettings({
      manual: configuration.dimensions.manual.filter((dimension) => dimension.id !== selection.id),
    });
    setSelection(null);
  };

  const deleteSelection = () => {
    if (selection?.type === 'panel') deleteSelectedPanel();
    else if (selection?.type === 'framing') deleteSelectedMember();
    else if (selection?.type === 'fastener') deleteSelectedFastener();
    else if (selection?.type === 'opening') deleteSelectedOpening();
    else if (selection?.type === 'fixture') deleteSelectedFixture();
    else if (selection?.type === 'dimension') deleteSelectedDimension();
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

  const updateSelectedDimension = (patch) => {
    if (selection?.type !== 'dimension') return;
    updateDimensionSettings({
      manual: configuration.dimensions.manual.map((dimension) =>
        dimension.id === selection.id
          ? createCeilingDimension({ ...dimension, ...patch, id: dimension.id })
          : dimension,
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

  /**
   * Every fixture edit is the factory run again over the whole object, never a
   * field written in place: the catalog decides what can be built, so changing
   * the fixture type has to re-pick a lamp the new luminaire actually takes and
   * re-clamp an aim past the new stop. Patching `fixtureType` alone would leave
   * a wafer holding a BR30.
   */
  const updateFixture = (fixtureId, patch) =>
    updateLighting({
      fixtures: configuration.lighting.fixtures.map((fixture) =>
        fixture.id === fixtureId
          ? createCeilingLightFixture({ ...fixture, ...patch }, { ...fixture, ...patch })
          : fixture,
      ),
    });

  const removeFixture = (fixtureId) => {
    updateLighting({ fixtures: configuration.lighting.fixtures.filter((fixture) => fixture.id !== fixtureId) });
    if (selection?.type === 'fixture' && selection.id === fixtureId) setSelection(null);
  };

  /** Rect the current gesture is measured against, taken once when it starts. */
  const pinCanvasRect = () => {
    gestureRectRef.current = svgRef.current?.getBoundingClientRect() || null;
    return gestureRectRef.current;
  };
  const releaseCanvasRect = () => {
    gestureRectRef.current = null;
  };

  const eventToLocal = (event, withSnap = true) => {
    const rect = gestureRectRef.current || svgRef.current?.getBoundingClientRect();
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

  /**
   * The exact point a measuring click lands on. Unlike the drawing tools this
   * never rounds to the snap grid: it either locks onto real geometry — a board
   * corner, a channel centreline, an opening edge, a screw — or falls back to
   * the free point rounded to the measurement precision, which is far finer than
   * the grid.
   */
  const eventToDimensionEndpoint = (event) => {
    const rect = gestureRectRef.current || svgRef.current?.getBoundingClientRect();
    if (!rect) return { point: { u: 0, v: 0 }, reference: null, markerRadius: 10 };
    const raw = screenPointToWallLocal(event, rect, bounds);
    const markerRadius =
      Math.max(bounds.length / Math.max(1, rect.width), bounds.height / Math.max(1, rect.height)) * 9;
    if (snapEnabled) {
      const target = snapWallDimensionEndpoint(raw, dimensionSnapTargets, {
        thresholdPixels: DIMENSION_SNAP_RADIUS_PX,
        pointThresholdPixels: DIMENSION_POINT_GRAVITY_PX,
        pixelsPerU: rect.width / bounds.length,
        pixelsPerV: rect.height / bounds.height,
      });
      if (target) return { ...target, markerRadius };
    }
    return { point: quantizeWallLocalPoint(raw, configuration.dimensions.precision), reference: null, markerRadius };
  };

  /** Hold Shift to keep a measurement level or plumb relative to its anchor point. */
  const orthoDimensionEndpoint = (event, anchorPoint) => {
    const acquisition = eventToDimensionEndpoint(event);
    if (!event.shiftKey || !anchorPoint) return acquisition;
    const du = Math.abs(acquisition.point.u - anchorPoint.u);
    const dv = Math.abs(acquisition.point.v - anchorPoint.v);
    const point =
      du >= dv ? { u: acquisition.point.u, v: anchorPoint.v } : { u: anchorPoint.u, v: acquisition.point.v };
    const unchanged = Math.abs(point.u - acquisition.point.u) < 1e-9 && Math.abs(point.v - acquisition.point.v) < 1e-9;
    return { ...acquisition, point, reference: unchanged ? acquisition.reference : null };
  };

  const zoomViewportAt = (requestedZoom, clientX, clientY) => {
    // Zoom moves the drawing for real, so a gesture running through it has to
    // re-measure rather than keep working from where the canvas used to be.
    releaseCanvasRect();
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
  wheelHandlerRef.current = handleViewportWheel;

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

  const fitCeilingInViewport = () => {
    // Fit moves the drawing as zoom does, so a gesture running through it
    // re-measures too.
    releaseCanvasRect();
    setViewport({ zoom: 1, panU: 0, panV: 0 });
  };

  // The pointer as the Light tool reads it: raw ceiling point plus the screen
  // scale, so snapping reach is judged in pixels at any zoom.
  const lightHoverAt = (event, point = null) => {
    const rect = gestureRectRef.current || svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      point: point || screenPointToWallLocal(event, rect, bounds),
      shift: Boolean(event.shiftKey),
      pixelsPerU: Math.max(1, rect.width) / bounds.length,
      pixelsPerV: Math.max(1, rect.height) / bounds.height,
    };
  };
  const placeLight = (hover) =>
    resolveLightPlacement(hover, {
      targets: lightSnapTargets,
      fixtures: lightFixtures,
      selectedFixtureId: selectedIdOf('fixture'),
      snapEnabled,
      snapStep,
      bounds,
    });

  const movedGestureEntity = (value = gesture) => {
    if (!value || value.kind !== 'move') return null;
    const delta = { u: value.current.u - value.start.u, v: value.current.v - value.start.v };
    if (value.type === 'fixture') {
      // A light moves by the light's own rules — board and room centres, the
      // other lights' lines — not by the board edges the drawing tools use.
      const raw = movePointWithinBounds(value.entity, delta, bounds);
      const placement = placeLight({
        ...value.scale,
        point: raw,
        shift: value.shift,
        excludeId: value.id,
        origin: { u: value.entity.u, v: value.entity.v },
      });
      return { ...raw, u: placement.point.u, v: placement.point.v, placement };
    }
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
    if (value.tool === CANVAS_TOOLS.ADD_LIGHT) {
      // Only the ends snap; B as a plain point, since Shift here means grid.
      const end = value.hover ? placeLight({ ...value.hover, shift: false }) : null;
      const { grid, columns, rows, count } = value;
      const points = resolveLightRunPoints(value, end?.point || value.start);
      return { points, grid, columns, rows, count, end, isRun: isLightRunDrag(value) };
    }
    if (value.tool === CANVAS_TOOLS.DRAW_PANEL || value.tool === CANVAS_TOOLS.DRAW_OPENING) {
      return createDrawnPanel(value.start, value.current, bounds, MIN_DRAWN_SIZE * 2.5);
    }
    if (value.tool === CANVAS_TOOLS.DRAW_DIMENSION) {
      // A run within 34° of an axis is read as a set-out along that axis; only a
      // genuinely diagonal one is drawn as an aligned measurement.
      const deltaU = Math.abs(value.current.u - value.start.u);
      const deltaV = Math.abs(value.current.v - value.start.v);
      const mode =
        deltaU > deltaV * 1.5
          ? WALL_DIMENSION_MODES.HORIZONTAL
          : deltaV > deltaU * 1.5
            ? WALL_DIMENSION_MODES.VERTICAL
            : WALL_DIMENSION_MODES.ALIGNED;
      return createCeilingDimension({
        mode,
        start: value.start,
        end: value.current,
        startRef: value.startRef,
        endRef: value.endRef,
        offset: 60,
      });
    }
    return createDrawnCeilingMember(value.tool, value.start, value.current, configuration.framing, bounds);
  };

  const commitDrawnDimension = (finalGesture) => {
    const entity = drawnGestureEntity(finalGesture);
    if (!entity || wallDimensionMeasurement(entity) < 1) return;
    updateDimensionSettings({ manual: [...configuration.dimensions.manual, entity] });
    setSelection({ type: 'dimension', id: entity.id });
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
    releaseCanvasRect();
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

  // One commit and one undo step however many lights a gesture places; the
  // last one placed is selected.
  const addLightFixtures = (points) => {
    if (!points?.length) return;
    const added = points.map((point) => createCeilingLightFixture(point, { fixtureType: lightDraftType }));
    updateLighting({ fixtures: [...configuration.lighting.fixtures, ...added] });
    setSelection({ type: 'fixture', id: added.at(-1).id });
  };

  const beginCanvasGesture = (event) => {
    if (event.button !== 0) return;
    if (canvasTool === CANVAS_TOOLS.PAN || spacePanActive) return;
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL) {
      event.preventDefault();
      const rect = pinCanvasRect();
      const point = eventToLocal(event, true);
      // A trace is separate clicks, not a held drag, so the pin must not outlive
      // this one: panning between clicks moves the canvas, and a preview measured
      // against where the canvas used to be points anywhere but at the cursor.
      releaseCanvasRect();
      const points = panelTrace?.points || [];
      const closeDistance = Math.max(8, (detail.length / Math.max(1, rect?.width || 1)) * 12);
      if (points.length >= 3 && Math.hypot(point.u - points[0].u, point.v - points[0].v) <= closeDistance) {
        commitPanelTrace(points);
        return;
      }
      setPanelTrace({ points: [...points, point], previewPoint: point });
      return;
    }
    if (canvasTool === CANVAS_TOOLS.DRAW_DIMENSION && gesture?.awaitingSecondClick) {
      // Second click of a click-click measurement: commit between the two points.
      // Like a trace, the pointer was free between the clicks, so the rect is
      // taken fresh here and let go again straight away.
      event.preventDefault();
      pinCanvasRect();
      const acquisition = orthoDimensionEndpoint(event, gesture.start);
      releaseCanvasRect();
      setDimensionAcquisition(acquisition);
      setGesture(null);
      commitDrawnDimension({ ...gesture, current: acquisition.point, endRef: acquisition.reference });
      return;
    }
    pinCanvasRect();
    if (canvasTool === CANVAS_TOOLS.DRAW_DIMENSION) {
      event.preventDefault();
      const acquisition = eventToDimensionEndpoint(event);
      setDimensionAcquisition(acquisition);
      svgRef.current?.setPointerCapture?.(event.pointerId);
      setGesture({
        kind: 'draw',
        tool: canvasTool,
        start: acquisition.point,
        current: acquisition.point,
        startRef: acquisition.reference,
        endRef: acquisition.reference,
        pointerId: event.pointerId,
        screenX: event.clientX,
        screenY: event.clientY,
      });
      return;
    }
    const point = eventToLocal(event, true);
    if (canvasTool === CANVAS_TOOLS.ADD_FASTENER) {
      addFastener(point);
      releaseCanvasRect();
      return;
    }
    if (canvasTool === CANVAS_TOOLS.ADD_LIGHT) {
      // Placed on release, so a press can become a row or a grid (lightRun.js).
      // A starts exactly where the ghost was: the same snap, from the same pointer.
      event.preventDefault();
      // The arrow keys drive the run, and a focused field would swallow them.
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) document.activeElement.blur();
      const hover = lightHoverAt(event);
      if (!hover) return;
      svgRef.current?.setPointerCapture?.(event.pointerId);
      // Held in a ref until it travels: a plain click then renders once, on release.
      lightPressRef.current = startLightRun(placeLight(hover).point, hover, event);
      return;
    }
    if (canvasTool === CANVAS_TOOLS.SELECT) {
      setSelection(null);
      releaseCanvasRect();
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
    // Pinned before the selection is set: selecting is exactly what relayouts the
    // canvas, and this gesture has to keep measuring against the canvas the user
    // pressed on.
    pinCanvasRect();
    setSelection({ type, id });
    if (!movable) {
      releaseCanvasRect();
      return;
    }
    const point = eventToLocal(event, false);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    const scale = lightHoverAt(event, point);
    setGesture({
      kind: 'move',
      type,
      id,
      entity,
      start: point,
      current: point,
      pointerId: event.pointerId,
      scale: scale ? { pixelsPerU: scale.pixelsPerU, pixelsPerV: scale.pixelsPerV } : null,
    });
  };

  const updateCanvasGesture = (event) => {
    if (panGesture) return;
    if (canvasTool === CANVAS_TOOLS.ADD_LIGHT && !spacePanActive) {
      const hover = lightHoverAt(event);
      setLightHover(hover);
      const press = lightPressRef.current;
      if (hover && lightRunLive && gesture.pointerId === event.pointerId) {
        const { clientX, clientY, shiftKey } = event;
        setGesture((value) => (value ? moveLightRun(value, { clientX, clientY, shiftKey }, hover) : value));
      } else if (hover && press?.pointerId === event.pointerId) {
        // Past a click's travel the press becomes the live run the plan draws.
        const moved = moveLightRun(press, event, hover);
        if (isLightRunDrag(moved)) {
          lightPressRef.current = null;
          setGesture(moved);
        }
      }
      return;
    }
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL && panelTrace?.points.length) {
      setPanelTrace((value) => (value ? { ...value, previewPoint: eventToLocal(event, true) } : value));
      return;
    }
    const adjustingDimension = gesture?.kind === 'dimension_endpoint';
    if ((canvasTool === CANVAS_TOOLS.DRAW_DIMENSION || adjustingDimension) && !spacePanActive) {
      const orthoAnchor = adjustingDimension
        ? gesture.endpoint === 'start'
          ? gesture.dimension.end
          : gesture.dimension.start
        : gesture?.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION
          ? gesture.start
          : null;
      const acquisition = orthoDimensionEndpoint(event, orthoAnchor);
      setDimensionAcquisition(acquisition);
      if (adjustingDimension && gesture.pointerId === event.pointerId) {
        setGesture((value) =>
          value ? { ...value, current: acquisition.point, reference: acquisition.reference } : value,
        );
        return;
      }
      if (gesture?.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION) {
        setGesture((value) =>
          value ? { ...value, current: acquisition.point, endRef: acquisition.reference } : value,
        );
        return;
      }
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = eventToLocal(event, gesture.kind === 'draw');
    setGesture((value) => (value ? { ...value, current: point, shift: event.shiftKey } : value));
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
    // Judged in pixels, not millimetres (detailCanvasRules): on a generated
    // board grid a "drag" from a bare click froze the whole grid into custom
    // boards.
    if (!moved || !travelledPastClick(finalGesture.start, finalGesture.current, unitPx)) return;
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
    if (finalGesture.type === 'fixture') {
      updateFixture(finalGesture.id, { u: moved.u, v: moved.v });
      return;
    }
    updateFastenerPattern({
      manual: face.fasteners.manual.map((entry) =>
        entry.id === finalGesture.id ? createManualCeilingFastener(moved, { ...entry }) : entry,
      ),
    });
  };

  const commitDimensionEndpoint = (finalGesture, event) => {
    // A grip that was only clicked keeps its end exactly as stored: acquiring
    // it again would snap, round or level an end that was typed in.
    if (!travelledPastClick(finalGesture.pressPoint, eventToLocal(event, false), unitPx)) return;
    const acquisition = orthoDimensionEndpoint(
      event,
      finalGesture.endpoint === 'start' ? finalGesture.dimension.end : finalGesture.dimension.start,
    );
    const coordinateKey = finalGesture.endpoint === 'start' ? 'start' : 'end';
    const referenceKey = finalGesture.endpoint === 'start' ? 'startRef' : 'endRef';
    setDimensionAcquisition(acquisition);
    updateDimensionSettings({
      manual: configuration.dimensions.manual.map((dimension) =>
        dimension.id === finalGesture.dimensionId
          ? createCeilingDimension({
              ...dimension,
              [coordinateKey]: acquisition.point,
              [referenceKey]: acquisition.reference,
              id: dimension.id,
            })
          : dimension,
      ),
    });
  };

  const commitDimensionMove = (finalGesture, event) => {
    const current = eventToLocal(event, false);
    const delta = { u: current.u - finalGesture.start.u, v: current.v - finalGesture.start.v };
    if (!travelledPastClick(finalGesture.start, current, unitPx)) return;
    const moved = moveWallDimensionWithinBounds(
      finalGesture.dimension,
      delta,
      bounds,
      configuration.dimensions.precision,
    );
    updateDimensionSettings({
      manual: configuration.dimensions.manual.map((dimension) =>
        dimension.id === finalGesture.dimensionId ? createCeilingDimension({ ...moved, id: dimension.id }) : dimension,
      ),
    });
  };

  const finishCanvasGesture = (event) => {
    if (panGesture) return;
    const lightRun = lightRunLive ? gesture : lightPressRef.current;
    if (lightRun?.pointerId === event.pointerId) {
      // Within a click's travel: the one light at A. Otherwise the row or grid A → B.
      lightPressRef.current = null;
      const run = drawnGestureEntity(moveLightRun(lightRun, event, lightHoverAt(event) || lightRun.hover));
      svgRef.current?.releasePointerCapture?.(event.pointerId);
      releaseCanvasRect();
      setGesture(null);
      addLightFixtures(run.points);
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'dimension_endpoint' || gesture.kind === 'dimension_move') {
      const finalGesture = gesture;
      svgRef.current?.releasePointerCapture?.(event.pointerId);
      setGesture(null);
      if (finalGesture.kind === 'dimension_endpoint') commitDimensionEndpoint(finalGesture, event);
      else commitDimensionMove(finalGesture, event);
      releaseCanvasRect();
      return;
    }
    if (gesture.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION) {
      const acquisition = orthoDimensionEndpoint(event, gesture.start);
      // A press that never travelled is the FIRST click of a click-click
      // measurement: the gesture stays alive, waiting for the second point, and
      // the pinned rect is let go because the pointer is free again.
      const firstOfTwoClicks = isMeasureClick(gesture, event);
      svgRef.current?.releasePointerCapture?.(event.pointerId);
      releaseCanvasRect();
      setDimensionAcquisition(acquisition);
      if (firstOfTwoClicks) {
        setGesture((value) => (value ? { ...value, awaitingSecondClick: true } : value));
        return;
      }
      const finalGesture = { ...gesture, current: acquisition.point, endRef: acquisition.reference };
      setGesture(null);
      commitDrawnDimension(finalGesture);
      return;
    }
    const finalGesture = { ...gesture, current: eventToLocal(event, gesture.kind === 'draw'), shift: event.shiftKey };
    svgRef.current?.releasePointerCapture?.(event.pointerId);
    releaseCanvasRect();
    setGesture(null);
    if (finalGesture.kind === 'draw') commitDrawnEntity(finalGesture);
    else commitMovedEntity(finalGesture);
  };

  const pressDimension = (event, dimension) => {
    if (spacePanActive || canvasTool !== CANVAS_TOOLS.SELECT || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // Pinned before the selection is set, for the same reason every other press
    // on this canvas is: selecting is what relayouts the workspace.
    pinCanvasRect();
    setSelection({ type: 'dimension', id: dimension.id });
    if (dimension.source !== 'custom') {
      releaseCanvasRect();
      return;
    }
    const point = eventToLocal(event, false);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: 'dimension_move',
      dimensionId: dimension.id,
      dimension,
      start: point,
      current: point,
      pointerId: event.pointerId,
    });
  };

  const beginDimensionEndpointMove = (event, dimension, endpoint) => {
    if (spacePanActive || canvasTool !== CANVAS_TOOLS.SELECT || dimension.source !== 'custom' || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pinCanvasRect();
    const acquisition = eventToDimensionEndpoint(event);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setSelection({ type: 'dimension', id: dimension.id });
    setDimensionAcquisition(acquisition);
    setGesture({
      kind: 'dimension_endpoint',
      dimensionId: dimension.id,
      dimension,
      endpoint,
      current: acquisition.point,
      reference: acquisition.reference,
      // Where the pointer went down, unsnapped: the release is judged a click
      // or a drag against this, as a move is.
      pressPoint: eventToLocal(event, false),
      pointerId: event.pointerId,
    });
  };

  const finishPanelTrace = (event) => {
    if (canvasTool !== CANVAS_TOOLS.TRACE_PANEL || !panelTrace?.points.length) return;
    event.preventDefault();
    event.stopPropagation();
    commitPanelTrace(panelTrace.points);
  };

  const selectedPanel = selection?.type === 'panel' ? panels.find((panel) => panel.localId === selection.id) : null;
  /*
    What the selected board stores for itself, not what it ends up boarded in:
    the picker has to show "profile default" for a board that never overrode it,
    so that following the profile keeps following it. A generated grid stores
    nothing at all, so nothing on it can have an override yet.
  */
  const selectedPanelMaterial =
    (selectedPanel && face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM
      ? face.layout.customPanels.find((panel) => panel.id === selection.id)?.material
      : null) || PROFILE_DEFAULT_MATERIAL;
  const selectedMember =
    selection?.type === 'framing' ? frameMembers.find((member) => member.id === selection.id) : null;
  const selectedFastener = selection?.type === 'fastener' ? fasteners.find((entry) => entry.id === selection.id) : null;
  const selectedOpening = selection?.type === 'opening' ? openings.find((entry) => entry.id === selection.id) : null;
  /*
    The stored fixture, not the resolved one: the drawing clamps a fixture into
    a boundary that shrank under it, and editing anything else on it must not
    write that clamp back as the position someone chose.
  */
  const selectedFixture =
    selection?.type === 'fixture'
      ? configuration.lighting.fixtures.find((fixture) => fixture.id === selection.id)
      : null;
  const selectedDimension =
    selection?.type === 'dimension' ? dimensions.find((entry) => entry.id === selection.id) : null;
  const selectionIsDeletable = Boolean(
    selectedPanel ||
    selectedMember ||
    selectedFastener ||
    selectedOpening ||
    selectedFixture ||
    selectedDimension?.source === 'custom',
  );
  // A derived dimension can be picked and read but never deleted, so what the
  // aside has to show is not the same question as what Delete can remove.
  const selectionHasCard = Boolean(selectionIsDeletable || selectedDimension);
  // What the context bar and the Selection header say about the pick: its kind,
  // and its size where it has one, so the drawing can be read without the aside.
  const selectionSize = selectedPanel
    ? `${formatMm(selectedPanel.width)} × ${formatMm(selectedPanel.height)} mm`
    : selectedMember
      ? `${formatMm(selectedMember.u1 - selectedMember.u0)} × ${formatMm(selectedMember.v1 - selectedMember.v0)} mm`
      : selectedOpening
        ? `${formatMm(selectedOpening.width)} × ${formatMm(selectedOpening.height)} mm`
        : selectedFixture
          ? getFixtureType(selectedFixture.fixtureType).label
          : selectedDimension
            ? selectedDimension.label
            : null;
  const selectionSummary = selection
    ? `${SELECTION_LABELS[selection.type] || selection.type} selected${selectionSize ? ` · ${selectionSize}` : ''}`
    : 'Nothing selected';
  const takeoff = detail.takeoff;
  const elevations = detail.elevations;
  /*
    Lumens per square metre is the one number that says whether a room is lit or
    merely has lights in it, and the boarded area is the only area the takeoff
    already knows — it is the ceiling with its boundary and openings taken out,
    which is exactly the floor those lumens fall on. An unboarded ceiling has no
    area at all, so it gets the totals and no density rather than a division by
    nothing.
  */
  const lightingArea = takeoff.installedAreaMm2 / 1_000_000;
  const lightingDensity =
    lightingArea > 0 ? ` · ≈${Math.round(takeoff.lighting.totalLumens / lightingArea)} lm/m²` : '';
  const lightingSummary = `${takeoff.lighting.fixtureCount} fixture${
    takeoff.lighting.fixtureCount === 1 ? '' : 's'
  } · ${Math.round(takeoff.lighting.totalLumens)} lm total${lightingDensity}`;
  const activeToolDefinition = TOOL_BY_ID[canvasTool];
  const selectedIdOf = (type) => (selection?.type === type ? selection.id : null);
  const rawGesturePreview = gesture?.kind === 'draw' ? drawnGestureEntity() : movedGestureEntity();
  // A measurement is only a measurement once it says what it measures, so the
  // rubber band carries the live number the moment it has one.
  const labelledDimension = (dimension, id = dimension.id) => ({
    ...dimension,
    id,
    source: 'preview',
    label: formatWallDimensionValue(wallDimensionMeasurement(dimension), configuration.dimensions.precision),
  });
  const gesturePreview =
    gesture?.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION && rawGesturePreview
      ? labelledDimension(rawGesturePreview)
      : rawGesturePreview;
  const gesturePreviewType =
    gesture?.kind === 'draw'
      ? gesture.tool === CANVAS_TOOLS.DRAW_PANEL
        ? 'panel'
        : gesture.tool === CANVAS_TOOLS.DRAW_OPENING
          ? 'opening'
          : gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION
            ? 'dimension'
            : gesture.tool === CANVAS_TOOLS.ADD_LIGHT
              ? 'light_run'
              : 'framing'
      : gesture?.type;
  const dimensionGesturePreview =
    gesture?.kind === 'dimension_endpoint'
      ? labelledDimension(
          createCeilingDimension({
            ...gesture.dimension,
            [gesture.endpoint === 'start' ? 'start' : 'end']: gesture.current,
            [gesture.endpoint === 'start' ? 'startRef' : 'endRef']: gesture.reference,
            id: gesture.dimensionId,
          }),
          gesture.dimensionId,
        )
      : gesture?.kind === 'dimension_move'
        ? labelledDimension(
            createCeilingDimension({
              ...moveWallDimensionWithinBounds(
                gesture.dimension,
                { u: gesture.current.u - gesture.start.u, v: gesture.current.v - gesture.start.v },
                bounds,
                configuration.dimensions.precision,
              ),
              id: gesture.dimensionId,
            }),
            gesture.dimensionId,
          )
        : null;
  const panelTracePreview = panelTrace?.points?.length
    ? [...panelTrace.points, panelTrace.previewPoint || panelTrace.points[panelTrace.points.length - 1]]
    : [];
  // An unboarded ceiling greys out whatever is drawn on it; a boarded one leaves
  // every board to its own material.
  const disabledBoardFill = face.enabled ? null : '#c3c8cc';
  const beamMode = ceiling.attachment?.mode === CEILING_ATTACHMENT_MODES.BEAM;
  const attachmentLabel = beamMode ? 'Support beams' : 'Manual datum';
  // A traced outline is not derived from anything, so the beams say nothing
  // about where this ceiling stops — only about how high it hangs.
  const drawnBoundary = ceiling.boundarySource === CEILING_BOUNDARY_SOURCES.DRAWN;
  // Two beams are the fewest that can bound a ceiling, so anything less is a
  // ceiling drawing itself from the outline it last saved.
  const supportBeamsMissing = beamMode && supportBeams.length < 2;
  /*
    Hangers are derived from the plan alone, so a manual ceiling still counts a grid of them even though it
    hangs from nothing: its attachment plane is the board underside, which sits below the carrier the hangers
    would rise from, and the preview discards every one of them for having no length. Claiming a count here
    would advertise hardware the ceiling does not have, so the collapsed section reports the one number a
    manual ceiling owns outright — where its boards finish — and leaves the drop to the ceilings it moves.
  */
  const suspensionSummary = beamMode
    ? `${configuration.suspension.drop} mm drop · ${hangers.length} hanger${hangers.length === 1 ? '' : 's'}`
    : `${formatMm(elevations.boardUnderside)} mm underside`;
  const activeSupportLevel =
    beamMode && supportBeams.length
      ? supportLevels.find(
          (level) => Math.abs(level.elevation - elevations.attachment) <= CEILING_BEAM_ELEVATION_TOLERANCE,
        ) || null
      : null;
  const attachmentValue = beamMode ? activeSupportLevel?.id || UNLISTED_SUPPORT_LEVEL : 'manual';
  const chooseAttachment = (value) => {
    if (value === attachmentValue) return;
    if (value === UNLISTED_SUPPORT_LEVEL) return;
    if (value === 'manual') {
      dispatch({
        type: 'CEILING_UPDATE',
        ceiling: {
          id: ceiling.id,
          attachment: { mode: CEILING_ATTACHMENT_MODES.MANUAL, beamIds: [] },
          // Manual mode stores the boards themselves, so the ceiling stays
          // exactly where it is hanging instead of jumping up by its drop.
          baseElevation: elevations.boardUnderside,
        },
      });
      return;
    }
    const level = supportLevels.find((entry) => entry.id === value);
    if (!level) return;
    dispatch({
      type: 'CEILING_UPDATE',
      ceiling: {
        id: ceiling.id,
        attachment: { mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: level.beamIds },
        baseElevation: level.elevation,
      },
    });
  };
  const attachedBeamIds = beamMode ? ceiling.attachment?.beamIds || [] : [];
  /**
   * Add or drop one beam without disturbing the rest. The level picker above is
   * the coarse control — it seeds a whole level — and this is the fine one: a
   * ceiling that only runs under three of a level's four beams says so here.
   *
   * The stored elevation is rewritten from what is left, because the ceiling
   * cannot hang higher than the beam that stops first, and that beam changes
   * every time the set does. Dropping to one beam is allowed; the missing-support
   * warning already covers a ceiling that can no longer draw its own outline.
   */
  const toggleSupportBeam = (beamId) => {
    const nextBeamIds = attachedBeamIds.includes(beamId)
      ? attachedBeamIds.filter((id) => id !== beamId)
      : [...attachedBeamIds, beamId];
    const levels = nextBeamIds
      .map((id) => (ceilingFloor?.beams || []).find((beam) => beam.id === id)?.floorLevel)
      .filter((level) => Number.isFinite(level));
    dispatch({
      type: 'CEILING_UPDATE',
      ceiling: {
        id: ceiling.id,
        attachment: { mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: nextBeamIds },
        baseElevation: levels.length ? Math.min(...levels) : elevations.attachment,
      },
    });
  };
  const reviewCopy =
    profile.status === CEILING_PRODUCT_PROFILE_STATUS.REFERENCE_ONLY
      ? 'Reference only — the cited document verifies the board sizes and the ceiling application, not a complete fixing schedule. Furring, carrier, hanger, and screw values here are planning defaults. A qualified professional must confirm them against a current installation guide before construction.'
      : 'Custom assumption — every value on this ceiling is a planning default, not a manufacturer or code requirement. A qualified professional must review the whole assembly before construction.';

  const referenceEntityName = (reference) => {
    if (reference.entityType === 'ceiling') return 'Ceiling';
    if (reference.entityType === 'opening') return 'Opening';
    if (reference.entityType === 'fastener') return 'Screw';
    if (reference.entityType === 'hanger') return 'Hanger';
    if (reference.entityType === 'fixture') return 'Light';
    if (reference.entityType === 'panel') {
      const panel = panels.find((entry) => entry.localId === reference.entityId || entry.id === reference.entityId);
      return panel?.label || 'Board';
    }
    if (reference.entityType === 'framing') {
      const member = frameMembers.find((entry) => entry.id === reference.entityId);
      return member ? FRAMING_KIND_LABELS[member.kind] || member.kind : 'Framing';
    }
    return reference.entityType;
  };
  /** "P3 · top-left corner" instead of "panel vertex_2". */
  const describeReference = (reference) =>
    reference ? `${referenceEntityName(reference)} · ${friendlyAnchorPhrase(reference.anchor)}` : 'free point';
  const activeDimensionSnap =
    gesture?.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION
      ? gesture.endRef
      : gesture?.kind === 'dimension_endpoint'
        ? gesture.reference
        : canvasTool === CANVAS_TOOLS.DRAW_DIMENSION
          ? dimensionAcquisition?.reference
          : null;

  // The light about to be placed (Light tool) or being moved (Select tool),
  // with what the ghost, the guides and the chip need to say about it.
  const lightPlacement =
    canvasTool === CANVAS_TOOLS.ADD_LIGHT && lightHover && !gesture ? placeLight(lightHover) : null;
  const movingLight = movingFixtureId ? gesturePreview : null;
  const ghostPlacement = lightPlacement || movingLight?.placement || null;
  const ceilingSpace = resolveCeilingLocalSpace(ceiling, project);
  const lightReadoutContext = {
    rooms: ceilingFloor?.rooms || [],
    panels,
    toPlan: (point) => ceilingSpace.toPlan(point),
  };
  const planOrigin = ceilingSpace.toLocal({ x: 0, y: 0 });

  const gestureReadout = (() => {
    if (gesture?.kind === 'draw' && gesturePreview) {
      // The measuring tool draws its own live label above the line it is
      // stretching, so a chip at the cursor would state the number twice.
      if (gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION) return null;
      if (gesture.tool === CANVAS_TOOLS.ADD_LIGHT) return lightRunReadout(gesturePreview, lightReadoutContext);
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
    if (gesture?.kind === 'move' && gesture.type === 'fixture' && gesturePreview?.placement) {
      const { placement } = gesturePreview;
      return { point: placement.point, lines: lightPlacementReadout(placement, lightReadoutContext) };
    }
    if (gesture?.kind === 'move' && gesturePreview) {
      if (gesture.type === 'fastener' || gesture.type === 'fixture') {
        return { point: gesture.current, lines: [`U ${formatMm(gesturePreview.u)} · V ${formatMm(gesturePreview.v)}`] };
      }
      return { point: gesture.current, lines: [`U ${formatMm(gesturePreview.u0)} · V ${formatMm(gesturePreview.v0)}`] };
    }
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL && panelTrace?.points?.length && panelTrace.previewPoint) {
      const last = panelTrace.points[panelTrace.points.length - 1];
      const span = Math.hypot(panelTrace.previewPoint.u - last.u, panelTrace.previewPoint.v - last.v);
      return span >= 1 ? { point: panelTrace.previewPoint, lines: [`${formatMm(span)} mm`] } : null;
    }
    if (lightPlacement) {
      return { point: lightPlacement.point, lines: lightPlacementReadout(lightPlacement, lightReadoutContext) };
    }
    return null;
  })();

  const claimShortcut = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  shortcutHandlerRef.current = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (lightRunLive && adjustLightRun(gesture, event.key)) {
      // Mid-drag the arrows set how many lights the run places, and Shift makes it a grid.
      claimShortcut(event);
      const { key } = event;
      setGesture((value) =>
        value?.tool === CANVAS_TOOLS.ADD_LIGHT ? { ...value, ...adjustLightRun(value, key) } : value,
      );
      return;
    }
    if (event.key === 'Escape') {
      // An open popover owns Escape (it closes, and nothing else happens);
      // a closed one never sees it.
      if (isPopoverOpen()) return;
      // The panel-trace effect owns Escape while a trace is open; never swallow it here.
      if (panelTrace) return;
      if (gesture || lightPressRef.current) {
        // First Escape cancels the in-flight gesture but keeps the tool active.
        event.preventDefault();
        dropCanvasGesture();
        return;
      }
      if (canvasTool === CANVAS_TOOLS.SELECT) return;
      event.preventDefault();
      chooseCanvasTool(CANVAS_TOOLS.SELECT);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      claimShortcut(event);
      // A drag in flight is dropped first: its release would otherwise commit
      // a move of the piece it picked up at the press, which is no longer there.
      if (gesture || lightPressRef.current) dropCanvasGesture();
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

  canvasHandlersRef.current = {
    beginElementMove,
    isCustomMember,
    isManualFastener,
    pressDimension,
    beginDimensionEndpointMove,
    // A click on one of this ceiling's boards in the 3D pane, Light tool armed:
    // a light at the hit, snapped with a 150 mm reach. False lets the pick select.
    placeLightFromPane: (part, hit) => {
      const point =
        canvasTool === CANVAS_TOOLS.ADD_LIGHT
          ? paneLightPoint(part, hit, { ceilingId: ceiling.id, space: ceilingSpace })
          : null;
      if (!point) return false;
      const scale = { pixelsPerU: PANE_SNAP_SCALE, pixelsPerV: PANE_SNAP_SCALE };
      addLightFixtures([placeLight({ point, shift: false, ...scale }).point]);
      return true;
    },
  };

  /**
   * The boards split by what they are made of. A ceiling boarded in one material
   * has nothing to split, so it keeps the plain totals; two materials are two
   * separate orders, which is why the sheets are counted per material and can
   * add up to more than the ceiling's own sheet count.
   */
  const renderBoardMaterialBreakdown = () =>
    takeoff.materials.length > 1 ? (
      <div className={styles.readoutList}>
        {takeoff.materials.map((entry) => (
          <ReadoutRow
            key={entry.material}
            label={boardMaterialLabel(entry.material)}
            value={`${entry.panelCount} board${entry.panelCount === 1 ? '' : 's'}`}
            note={`${(entry.installedAreaMm2 / 1_000_000).toFixed(2)} m² · ${entry.stockSheetCount} sheet${
              entry.stockSheetCount === 1 ? '' : 's'
            }`}
          />
        ))}
      </div>
    ) : null;

  /**
   * One luminaire's numbers, shown identically wherever a fixture is being
   * edited — the Lighting list and the Selection aside are two ways into the
   * same object, and a field that only existed in one of them would be a setting
   * people could not find.
   *
   * Fields appear only where the catalog says they mean something: an omni lamp
   * has no beam to widen, a can has nothing to hang by, and a fixed downlight
   * has no gimbal to aim. Offering them anyway would be four controls that
   * silently change nothing.
   */
  const renderFixtureEditor = (fixture) => {
    const type = getFixtureType(fixture.fixtureType);
    const photometrics = resolveFixturePhotometrics(fixture);
    const bulb = getBulbType(fixture.bulbType);
    return (
      <>
        <SelectField
          label="Fixture type"
          value={fixture.fixtureType}
          onChange={(fixtureType) => updateFixture(fixture.id, { fixtureType })}
        >
          {FIXTURE_TYPES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Lamp"
          value={fixture.bulbType}
          onChange={(bulbType) => updateFixture(fixture.id, { bulbType })}
        >
          {type.allowedBulbs.map((bulbId) => (
            <option key={bulbId} value={bulbId}>
              {getBulbType(bulbId).label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Colour temperature"
          value={fixture.colorTempK}
          onChange={(kelvin) => updateFixture(fixture.id, { colorTempK: Number(kelvin) })}
        >
          {COLOR_TEMPERATURES.map((entry) => (
            <option key={entry.kelvin} value={entry.kelvin}>
              {`${entry.kelvin} K — ${entry.label}`}
            </option>
          ))}
        </SelectField>
        <NumberField label="From west edge (U)" value={fixture.u} onChange={(u) => updateFixture(fixture.id, { u })} />
        <NumberField label="From south edge (V)" value={fixture.v} onChange={(v) => updateFixture(fixture.id, { v })} />
        {/*
          The lamp's own rating until someone types a real one off a data sheet.
          Clearing the field is how it goes back: zero is not a luminaire that
          emits nothing, it is the absence of an override.
        */}
        <NumberField
          label="Output"
          value={photometrics.lumens}
          min={0}
          suffix="lm"
          onChange={(lumensOverride) => updateFixture(fixture.id, { lumensOverride })}
        />
        {bulb.beamAngleDeg === null ? null : (
          <NumberField
            label="Beam angle"
            value={photometrics.beamAngleDeg}
            min={BEAM_ANGLE_RANGE_DEG.min}
            suffix="°"
            onChange={(beamAngleDeg) => updateFixture(fixture.id, { beamAngleDeg })}
          />
        )}
        {isPendantFixture(fixture.fixtureType) ? (
          <NumberField
            label="Drop below ceiling"
            value={fixture.dropMm}
            min={1}
            onChange={(dropMm) => updateFixture(fixture.id, { dropMm })}
          />
        ) : null}
        {type.aimable ? (
          <>
            <NumberField
              label="Aim tilt"
              value={fixture.aim.tiltDeg}
              min={0}
              suffix="°"
              onChange={(tiltDeg) => updateFixture(fixture.id, { aim: { ...fixture.aim, tiltDeg } })}
            />
            <NumberField
              label="Aim direction"
              value={fixture.aim.azimuthDeg}
              suffix="°"
              onChange={(azimuthDeg) => updateFixture(fixture.id, { aim: { ...fixture.aim, azimuthDeg } })}
            />
          </>
        ) : null}
        <Toggle
          checked={fixture.castShadow}
          onChange={(castShadow) => updateFixture(fixture.id, { castShadow })}
          label="Cast shadows"
        />
        <div className={styles.buttonRow}>
          <ToolbarButton danger onClick={() => removeFixture(fixture.id)}>
            Delete light
          </ToolbarButton>
        </div>
      </>
    );
  };

  const closeEditor = () => editorDispatch({ type: 'CLOSE_CEILING_DETAIL_EDITOR' });
  const snappedLabel = activeDimensionSnap ? `Snapped to ${describeReference(activeDimensionSnap)}` : null;
  const hiddenLayerCount = Object.values(layerVisibility).filter((visible) => !visible).length;

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
        <div className={styles.headerLead}>
          <button
            type="button"
            className={styles.backButton}
            title="Close the ceiling detail editor and return to the floorplan"
            onClick={closeEditor}
          >
            <ToolGlyph name="back" />
            <span>Back to plan</span>
          </button>
          <span className={styles.headerDivider} aria-hidden="true" />
          <div className={styles.headerIdentity}>
            <h1>{ceilingDisplayName(ceiling)}</h1>
            <span className={styles.headerMeta} title={`${profile.manufacturer} ${profile.product}`}>
              {detail.length.toFixed(0)} × {detail.depth.toFixed(0)} mm · {boardMaterialLabel(profile.boardMaterial)} ·{' '}
              {formatMm(face.boardThickness)} mm
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <ToolbarButton title="Close the ceiling detail editor and return to the floorplan" onClick={closeEditor}>
            Close
            <ToolGlyph name="close" />
          </ToolbarButton>
        </div>
      </header>

      <div className={styles.body} data-focus="false">
        <aside id="ceiling-detail-left-panel" className={styles.leftPanel} aria-label="Ceiling detailing steps">
          <CollapsibleSection
            {...stepProps('face')}
            step={1}
            title="Face and boards"
            summary={
              face.enabled
                ? `${panels.length} board${panels.length === 1 ? '' : 's'} · ${
                    face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM ? 'custom' : 'generated grid'
                  }`
                : 'Not boarded'
            }
          >
            {/*
              The step that opens first, so it carries what a ceiling is boarded
              with and nothing more: the rarely touched settings (joint gaps, the
              grid origin, the code profile and its review note) fold behind
              Advanced, and the whole step fits the panel without scrolling.
            */}
            <div className={styles.toolRow} aria-label="Board drawing tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_PANEL)}
              {renderToolButton(CANVAS_TOOLS.TRACE_PANEL)}
            </div>
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
            <div className={styles.layoutRow}>
              <span>
                Layout{' '}
                <strong>
                  {face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM ? 'Custom boards' : 'Generated grid'}
                </strong>
              </span>
              <ToolbarButton
                title="Regenerate grid — discard custom boards and rebuild the generated grid"
                onClick={regeneratePanelGrid}
              >
                Regenerate
              </ToolbarButton>
            </div>
            <AdvancedGroup label="Gaps, grid origin, and code profile">
              <Toggle
                checked={face.enabled}
                onChange={(enabled) => updateFace({ enabled })}
                label="Board this ceiling"
              />
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
              <div className={styles.profileStatus} data-status={profile.status}>
                <strong>{profile.status.replaceAll('_', ' ')}</strong>
                <span>{profile.source.title}</span>
                <small>{jurisdiction.label}</small>
              </div>
              <p className={styles.inlineHelp}>{reviewCopy}</p>
            </AdvancedGroup>
          </CollapsibleSection>

          <CollapsibleSection
            {...stepProps('structure')}
            step={2}
            title="Structure"
            summary={`${frameMembers.length} member${frameMembers.length === 1 ? '' : 's'} · ${
              configuration.framing.mode === CEILING_FRAMING_LAYOUT_MODES.CUSTOM ? 'custom' : 'automatic'
            } · ${configuration.framing.material === 'timber' ? 'timber' : 'steel'}`}
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
            <SelectField
              label="Material"
              value={configuration.framing.material}
              onChange={(material) => updateFraming({ material })}
            >
              <option value="light_gauge_steel">Light-gauge steel</option>
              <option value="timber">Timber</option>
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
            <p className={styles.inlineHelp}>
              Product planning maximum furring spacing: {profile.planningDefaults.maximumFurringSpacingMm} mm
            </p>
          </CollapsibleSection>

          <CollapsibleSection {...stepProps('suspension')} step={3} title="Suspension" summary={suspensionSummary}>
            {beamMode || supportLevels.length ? (
              <SelectField label="Hangs from" value={attachmentValue} onChange={chooseAttachment}>
                {supportLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {`${formatMm(level.elevation)} mm — ${level.beams.length} beam${
                      level.beams.length === 1 ? '' : 's'
                    }`}
                  </option>
                ))}
                {beamMode && !activeSupportLevel ? (
                  <option value={UNLISTED_SUPPORT_LEVEL}>
                    {supportBeamsMissing
                      ? 'Support beams missing'
                      : `${formatMm(elevations.attachment)} mm — beams off this floor's levels`}
                  </option>
                ) : null}
                <option value="manual">Manual datum</option>
              </SelectField>
            ) : null}
            {beamMode && supportLevels.length ? (
              <>
                <p className={styles.inlineHelp}>Beams this ceiling hangs from</p>
                <div className={styles.dimensionToggles}>
                  {supportLevels.map((level) => (
                    <Fragment key={level.id}>
                      <span className={styles.presetLabel}>{`${formatMm(level.elevation)} mm`}</span>
                      {level.beams.map((beam) => (
                        <Toggle
                          key={beam.id}
                          checked={attachedBeamIds.includes(beam.id)}
                          onChange={() => toggleSupportBeam(beam.id)}
                          label={getBeamDisplayLabel(beam, ceilingFloor?.columns || [])}
                        />
                      ))}
                    </Fragment>
                  ))}
                </div>
              </>
            ) : null}
            {drawnBoundary ? (
              <p className={styles.inlineHelp}>Outline: as drawn. The beams set the height only.</p>
            ) : supportBeamsMissing ? (
              <p className={styles.inlineHelp}>Support beams missing — using saved outline.</p>
            ) : null}
            {/*
              A manual ceiling hangs from nothing, so its stored elevation is the board underside itself and the
              suspension drop is never applied to it. Offering the drop here would be a field that changes nothing,
              so the height it does own is what gets typed instead. The stored drop is left alone either way, so
              switching back to beams restores the hang the ceiling last had.
            */}
            {beamMode ? (
              <>
                {/*
                  With every support beam gone, the ceiling reads its attachment plane from the elevation it
                  last stored, and nothing else on this panel can type that number — so the stored plane
                  becomes a field exactly here and nowhere else. One surviving beam is enough to govern the
                  plane again, so a single support hides this rather than offering a height the next read
                  would overwrite; the missing-support warning above already speaks for that case. The drop
                  stays alongside it either way, because the boards still hang below whatever plane is typed.
                */}
                {supportBeams.length === 0 ? (
                  <NumberField
                    label="Attachment height"
                    value={ceiling.baseElevation}
                    onChange={(baseElevation) =>
                      dispatch({ type: 'CEILING_UPDATE', ceiling: { id: ceiling.id, baseElevation } })
                    }
                  />
                ) : null}
                <NumberField
                  label="Drop below attachment"
                  value={configuration.suspension.drop}
                  min={0}
                  onChange={(drop) => updateSuspension({ drop })}
                />
              </>
            ) : (
              <NumberField
                label="Board underside height"
                value={ceiling.baseElevation}
                onChange={(baseElevation) =>
                  dispatch({ type: 'CEILING_UPDATE', ceiling: { id: ceiling.id, baseElevation } })
                }
              />
            )}
            <NumberField
              label="Hanger spacing"
              value={configuration.suspension.hangerSpacing}
              min={50}
              onChange={(hangerSpacing) => updateSuspension({ hangerSpacing })}
            />
            <div className={styles.readoutList}>
              <ReadoutRow label="Attachment" value={`${formatMm(elevations.attachment)} mm`} note={attachmentLabel} />
              <ReadoutRow
                label="Board underside"
                value={`${formatMm(elevations.boardUnderside)} mm`}
                note="finished ceiling"
              />
              <ReadoutRow
                label="Furring"
                value={`${formatMm(elevations.furringBottom)} → ${formatMm(elevations.furringTop)} mm`}
              />
              <ReadoutRow
                label="Carrier"
                value={`${formatMm(elevations.carrierBottom)} → ${formatMm(elevations.carrierTop)} mm`}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            {...stepProps('openings')}
            step={4}
            title="Openings"
            summary={`${openings.length} opening${openings.length === 1 ? '' : 's'}`}
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
                <div
                  key={opening.id}
                  className={styles.listCard}
                  data-selected={selection?.type === 'opening' && selection.id === opening.id ? 'true' : undefined}
                >
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

          <CollapsibleSection {...stepProps('lighting')} step={5} title="Lighting" summary={lightingSummary}>
            <div className={styles.toolRow} aria-label="Lighting tools">
              {renderToolButton(CANVAS_TOOLS.ADD_LIGHT)}
            </div>
            <SelectField label="New light type" value={lightDraftType} onChange={setLightDraftType}>
              {FIXTURE_TYPES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </SelectField>
            <p className={styles.inlineHelp}>
              Pick a fixture, then press <kbd className={styles.kbd}>L</kbd> and click where it goes. Output is the
              lamp&apos;s own rating until you type one; clear the field to hand it back.
            </p>
            {configuration.lighting.fixtures.length ? (
              configuration.lighting.fixtures.map((fixture) => (
                <div
                  key={fixture.id}
                  className={styles.listCard}
                  data-selected={selection?.type === 'fixture' && selection.id === fixture.id ? 'true' : undefined}
                >
                  {renderFixtureEditor(fixture)}
                </div>
              ))
            ) : (
              <EmptyState title="No light fixtures yet">
                Downlights, pendants, and troffers light the room in the 3D preview and carry their own load and lumen
                figures into the takeoff.
              </EmptyState>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            {...stepProps('screws')}
            step={6}
            title="Screws"
            summary={`${fasteners.length} screw${fasteners.length === 1 ? '' : 's'} · ${
              face.fasteners.perimeterSpacing
            } mm perimeter`}
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
            {...stepProps('dimensions')}
            step={7}
            title="Dimensions"
            summary={`${dimensions.length} shown · ${
              dimensions.filter((dimension) => dimension.source === 'custom').length
            } yours`}
          >
            <div className={styles.toolRow} aria-label="Measuring tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_DIMENSION)}
            </div>
            <InfoHint label="How exact measuring works">
              <p className={styles.inlineHelp}>
                Click two exact points to measure, or drag; hold Shift to keep the run level or plumb. Endpoints lock
                onto ceiling edges, board corners and joints, furring and carrier centrelines, opening edges, screws,
                hangers and lights, and stay tied to them when the piece moves. A free endpoint uses the measurement
                precision, not the coarse drawing grid. With Select, drag the amber line to move a measurement, or drag
                either green endpoint to reshape it.
              </p>
            </InfoHint>
            <SelectField
              label="Precision"
              value={String(configuration.dimensions.precision)}
              onChange={(precision) => updateDimensionSettings({ precision: Number(precision) })}
            >
              {WALL_DIMENSION_PRECISIONS.map((precision) => (
                <option key={precision} value={precision}>
                  {precision.toFixed(precision === 1 ? 0 : precision === 0.1 ? 1 : 2)} mm
                </option>
              ))}
            </SelectField>
            <div className={styles.dimensionToggles}>
              <Toggle
                checked={configuration.dimensions.showOverall}
                onChange={(showOverall) => updateDimensionSettings({ showOverall })}
                label="Overall ceiling length and depth"
              />
              <Toggle
                checked={configuration.dimensions.showOpenings}
                onChange={(showOpenings) => updateDimensionSettings({ showOpenings })}
                label="Opening sizes and set-out"
              />
              <Toggle
                checked={configuration.dimensions.showBoards}
                onChange={(showBoards) => updateDimensionSettings({ showBoards })}
                label="Board joint chains"
              />
              <Toggle
                checked={configuration.dimensions.showFraming}
                onChange={(showFraming) => updateDimensionSettings({ showFraming })}
                label="Furring and carrier centre spacing"
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            {...stepProps('takeoff')}
            step={8}
            title="Takeoff"
            summary={`${takeoff.panelCount} boards · ${takeoff.fastenerCount} screws`}
          >
            <div className={styles.readoutList}>
              <ReadoutRow label="Boards" value={takeoff.panelCount} note="unoptimized board count" />
              <ReadoutRow label="Stock sheets" value={takeoff.stockSheetCount} note="full sheets before cutting" />
              <ReadoutRow label="Installed area" value={`${(takeoff.installedAreaMm2 / 1_000_000).toFixed(2)} m²`} />
              <ReadoutRow label="Screws" value={takeoff.fastenerCount} />
              <ReadoutRow label="Furring" value={`${(takeoff.furringLinearMm / 1000).toFixed(2)} m`} />
              <ReadoutRow label="Carrier" value={`${(takeoff.carrierLinearMm / 1000).toFixed(2)} m`} />
              <ReadoutRow label="Wall angle" value={`${(takeoff.wallAngleLinearMm / 1000).toFixed(2)} m`} />
              <ReadoutRow label="Trimmers" value={`${(takeoff.trimmerLinearMm / 1000).toFixed(2)} m`} />
              <ReadoutRow label="Hangers" value={takeoff.hangerCount} />
            </div>
            {/* An unlit ceiling has no lighting order, so it says nothing rather
                than three zeros. The split is by fixture and lamp together: the
                same can with a BR30 and with a PAR38 are two line items. */}
            {takeoff.lighting.fixtureCount ? (
              <>
                <div className={styles.readoutList}>
                  <ReadoutRow label="Light fixtures" value={takeoff.lighting.fixtureCount} />
                  <ReadoutRow label="Connected load" value={`${formatMm(takeoff.lighting.totalWatts)} W`} />
                  <ReadoutRow
                    label="Installed lumens"
                    value={`${Math.round(takeoff.lighting.totalLumens)} lm`}
                    note={lightingArea > 0 ? `≈${Math.round(takeoff.lighting.totalLumens / lightingArea)} lm/m²` : null}
                  />
                </div>
                {/* One order line per fixture and lamp: names too long to share a
                    line with their count, so each value sits under its label. */}
                <div className={`${styles.readoutList} ${styles.readoutListStacked}`}>
                  {takeoff.lighting.byType.map((entry) => (
                    <ReadoutRow
                      key={`${entry.fixtureType}:${entry.bulbType}`}
                      label={getFixtureType(entry.fixtureType).label}
                      value={`${entry.count} × ${getBulbType(entry.bulbType).label}`}
                      note={`${Math.round(entry.totalLumens)} lm · ${formatMm(entry.totalWatts)} W`}
                    />
                  ))}
                </div>
              </>
            ) : null}
            {takeoff.materials.length > 1 ? (
              <>
                <p className={styles.inlineHelp}>
                  This ceiling is boarded in more than one material. Sheets are counted per material, because each is
                  bought and cut on its own.
                </p>
                {renderBoardMaterialBreakdown()}
              </>
            ) : null}
            <p className={styles.inlineHelp}>{reviewCopy}</p>
          </CollapsibleSection>
        </aside>

        <main className={styles.workspace}>
          <div className={`${styles.toolbar} ${styles.toolbarCeiling}`}>
            <div className={styles.toolPalette} role="toolbar" aria-label="Drawing tools">
              {['navigate', 'board', 'frame', 'detail', 'measure'].map((group) => (
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
                  iconOnly
                  disabled={!canUndo}
                  onClick={() => dispatch({ type: 'UNDO' })}
                />
                <ToolButton
                  icon="redo"
                  label="Redo"
                  shortcut="Ctrl+Y"
                  title="Redo the undone change (Ctrl+Y)"
                  toggle={false}
                  iconOnly
                  disabled={!canRedo}
                  onClick={() => dispatch({ type: 'REDO' })}
                />
                <ToolButton
                  icon="trash"
                  label="Delete"
                  shortcut="Del"
                  title="Delete selected — remove the selected board, member, screw, opening, or light (Delete)"
                  danger
                  toggle={false}
                  iconOnly
                  disabled={!selectionIsDeletable}
                  onClick={deleteSelection}
                />
              </div>
            </div>
            <span className={styles.toolbarSpacer} />
            <SegmentedControl
              label="Workspace view"
              options={WORKSPACE_VIEW_OPTIONS}
              value={workspaceView}
              onChange={setWorkspaceView}
            />
          </div>
          <div
            className={styles.contextBar}
            data-snapped={snappedLabel ? 'true' : 'false'}
            data-tool-option={canvasTool === CANVAS_TOOLS.ADD_LIGHT ? 'true' : undefined}
          >
            <span className={styles.contextLive} role="status">
              <span className={styles.contextTool}>
                <ToolGlyph name={activeToolDefinition.icon} />
                <span>{activeToolDefinition.label}</span>
              </span>
              {canvasTool === CANVAS_TOOLS.ADD_LIGHT ? (
                <LightToolOptions value={lightDraftType} onChange={setLightDraftType} />
              ) : null}
              {snappedLabel ? (
                <span className={styles.contextSnap}>{snappedLabel}</span>
              ) : (
                <span className={styles.contextHint}>{TOOL_HINTS[canvasTool]}</span>
              )}
              <span className={styles.contextSelection}>{selectionSummary}</span>
            </span>
            <div className={styles.contextControls}>
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
              <Popover
                label="Layers"
                icon="layers"
                title={
                  hiddenLayerCount
                    ? `Show or hide drawing layers — ${hiddenLayerCount} hidden`
                    : 'Show or hide drawing layers'
                }
                panelLabel="Drawing layers"
                indicator={hiddenLayerCount > 0}
              >
                <p className={styles.popoverTitle}>Show on the plan</p>
                <div className={styles.layerList}>
                  {Object.keys(layerVisibility).map((key) => (
                    <Toggle
                      key={key}
                      checked={layerVisibility[key]}
                      onChange={(checked) => setLayerVisibility((value) => ({ ...value, [key]: checked }))}
                      label={LAYER_LABELS[key] || key}
                    />
                  ))}
                </div>
              </Popover>
              <span className={styles.contextDivider} aria-hidden="true" />
              <IconButton icon="minus" label="Zoom out" onClick={() => zoomViewportAt((zoom) => zoom / 1.2)} />
              <span className={styles.zoomReadout}>{Math.round(viewport.zoom * 100)}%</span>
              <IconButton icon="plus" label="Zoom in" onClick={() => zoomViewportAt((zoom) => zoom * 1.2)} />
              <ToolbarButton title="Fit the whole ceiling in view (0)" onClick={fitCeilingInViewport}>
                Fit
              </ToolbarButton>
              <span className={styles.contextDivider} aria-hidden="true" />
              <Popover
                icon="help"
                caret={false}
                title="Shortcuts and drawing notes"
                ariaLabel="Shortcuts and drawing notes"
                panelLabel="Shortcuts and drawing notes"
                panelClassName={styles.helpPanel}
              >
                <div className={styles.popoverSection}>
                  <p className={styles.popoverTitle}>Shortcuts</p>
                  <dl className={styles.helpList}>
                    <dt>Space + drag</dt>
                    <dd>Pans the plan; the wheel zooms</dd>
                    <dt>0</dt>
                    <dd>Fits the ceiling in view</dd>
                    <dt>Esc</dt>
                    <dd>Cancels, then returns to Select</dd>
                    <dt>Delete</dt>
                    <dd>Removes the selected piece</dd>
                    <dt>L, then drag</dt>
                    <dd>A row of lights; ↑ / ↓ sets how many</dd>
                    <dt>… with Shift</dt>
                    <dd>A grid of lights; ← / → adds columns</dd>
                  </dl>
                </div>
                <div className={styles.popoverSection}>
                  <p className={styles.popoverTitle}>This drawing</p>
                  <ul className={styles.helpNotes}>
                    <li>
                      {Math.abs(detail.rotation) > 1e-6
                        ? `Origin: south-west corner · aligned to ceiling edges · ${Math.abs(
                            (detail.rotation * 180) / Math.PI,
                          ).toFixed(1)}° off plan north`
                        : 'Origin: south-west corner · North up · matches floor plan'}
                    </li>
                    <li>
                      U 0 → {detail.length.toFixed(0)} mm · V 0 → {detail.depth.toFixed(0)} mm
                    </li>
                    <li>
                      {panels.length} boards · {frameMembers.length} members · {hangers.length} hangers ·{' '}
                      {fasteners.length} screws · {openings.length} openings · {lightFixtures.length} lights
                    </li>
                    <li>Measure precision: {configuration.dimensions.precision} mm</li>
                    <li>
                      3D pane: Updates after every committed board, member, screw, opening, or suspension edit. With the
                      Light tool armed, click a board there to place a light. Orbit: drag · pan: right drag · zoom:
                      wheel.
                    </li>
                  </ul>
                </div>
              </Popover>
            </div>
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
                  ref={attachCanvasFrame}
                  className={styles.canvasFrame}
                  data-panning={panGesture ? 'true' : 'false'}
                  data-space-pan={spacePanActive ? 'true' : 'false'}
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
                    onPointerLeave={() => {
                      setLightHover(null);
                      // The pick-up marker follows the pointer; it goes with it,
                      // unless a measurement is holding on to it.
                      if (!gesture) setDimensionAcquisition(null);
                    }}
                    onPointerCancel={() => {
                      lightPressRef.current = null;
                      setGesture(null);
                      setDimensionAcquisition(null);
                      releaseCanvasRect();
                    }}
                  >
                    <rect className={styles.canvasSheet} width={detail.length} height={detail.depth} />
                    <g data-mirrored="false" transform={`translate(0 ${detail.depth}) scale(1 -1)`}>
                      <CeilingGridLayer bounds={bounds} snapStep={snapStep} unitPx={unitPx} active={snapEnabled} />
                      <CeilingBoardLayer
                        panels={panels}
                        openings={openings}
                        showVoids={layerVisibility.openings}
                        showBoards={layerVisibility.boards}
                        disabledBoardFill={disabledBoardFill}
                        selectedId={selectedIdOf('panel')}
                        onElementPointerDown={stableCanvasHandlers.onElementPointerDown}
                      />
                      {layerVisibility.structure ? (
                        <CeilingStructureLayer
                          members={frameMembers}
                          unitPx={unitPx}
                          selectedId={selectedIdOf('framing')}
                          isCustomMember={stableCanvasHandlers.isCustomMember}
                          onElementPointerDown={stableCanvasHandlers.onElementPointerDown}
                        />
                      ) : null}
                      {layerVisibility.hangers ? <CeilingHangerLayer hangers={hangers} unitPx={unitPx} /> : null}
                      {layerVisibility.screws ? (
                        <CeilingScrewLayer
                          fasteners={fasteners}
                          unitPx={unitPx}
                          selectedId={selectedIdOf('fastener')}
                          isManualFastener={stableCanvasHandlers.isManualFastener}
                          onElementPointerDown={stableCanvasHandlers.onElementPointerDown}
                        />
                      ) : null}
                      {layerVisibility.plan ? (
                        <CeilingPlanUnderlay
                          floor={ceilingFloor}
                          axisUx={ceilingSpace.axisU.x}
                          axisUy={ceilingSpace.axisU.y}
                          originU={planOrigin.u}
                          originV={planOrigin.v}
                        />
                      ) : null}
                      {layerVisibility.fixtures ? (
                        <CeilingFixtureLayer
                          fixtures={lightFixtures}
                          unitPx={unitPx}
                          selectedId={selectedIdOf('fixture')}
                          hiddenId={gesture?.kind === 'move' && gesture.type === 'fixture' ? gesture.id : null}
                          onElementPointerDown={stableCanvasHandlers.onElementPointerDown}
                        />
                      ) : null}
                      {layerVisibility.openings ? (
                        <CeilingOpeningProfileLayer
                          openings={openings}
                          selectedId={selectedIdOf('opening')}
                          onElementPointerDown={stableCanvasHandlers.onElementPointerDown}
                        />
                      ) : null}
                      {layerVisibility.boundary ? <CeilingBoundaryLayer regions={detail.regions} /> : null}

                      {gesturePreview && (gesturePreviewType === 'panel' || gesturePreviewType === 'opening') ? (
                        <rect
                          className={`${styles.drawPreview} ${styles.previewShape}`}
                          data-preview={gesturePreviewType}
                          x={gesturePreview.u0}
                          y={gesturePreview.v0}
                          width={gesturePreview.u1 - gesturePreview.u0}
                          height={gesturePreview.v1 - gesturePreview.v0}
                          strokeWidth="1.25"
                          strokeDasharray="8 5"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {gesturePreview && gesturePreviewType === 'framing' ? (
                        <rect
                          className={`${styles.drawPreview} ${styles.previewFrame}`}
                          data-preview="framing"
                          x={gesturePreview.u0}
                          y={gesturePreview.v0}
                          width={gesturePreview.u1 - gesturePreview.u0}
                          height={gesturePreview.v1 - gesturePreview.v0}
                          strokeWidth="1.25"
                          strokeDasharray="8 5"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {ghostPlacement ? (
                        <>
                          <CeilingLightGuides
                            guides={ghostPlacement.guides}
                            length={detail.length}
                            depth={detail.depth}
                          />
                          <CeilingLightGhost
                            fixtureType={movingLight ? gesture.entity.fixtureType : lightDraftType}
                            aim={movingLight ? gesture.entity.aim : null}
                            point={ghostPlacement.point}
                            unitPx={unitPx}
                          />
                        </>
                      ) : null}

                      {gesturePreview && gesturePreviewType === 'light_run' ? (
                        <CeilingLightRunGhost
                          run={gesturePreview}
                          start={gesture.start}
                          fixtureType={lightDraftType}
                          unitPx={unitPx}
                          length={detail.length}
                          depth={detail.depth}
                        />
                      ) : null}

                      {gesturePreview && gesturePreviewType === 'fastener' ? (
                        <circle
                          className={`${styles.drawPreview} ${styles.previewPoint}`}
                          data-preview="fastener"
                          cx={gesturePreview.u}
                          cy={gesturePreview.v}
                          r={3 * unitPx}
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {panelTracePreview.length ? (
                        <g className={styles.drawPreview}>
                          <polyline
                            points={panelTracePreview.map((point) => `${point.u},${point.v}`).join(' ')}
                            className={styles.previewTrace}
                            data-preview="trace"
                            data-closed={panelTracePreview.length >= 3 ? 'true' : 'false'}
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
                              className={styles.previewPoint}
                              data-first={index === 0 ? 'true' : 'false'}
                              strokeWidth="1"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </g>
                      ) : null}
                    </g>

                    {layerVisibility.plan ? (
                      <CeilingPlanUnderlayLabels
                        floor={ceilingFloor}
                        axisUx={ceilingSpace.axisU.x}
                        axisUy={ceilingSpace.axisU.y}
                        originU={planOrigin.u}
                        originV={planOrigin.v}
                        depth={detail.depth}
                        unitPx={unitPx}
                      />
                    ) : null}

                    {/* Measurements are drawn outside the flipped group: the
                        graphic maps UV to drawing coordinates itself, which is
                        what keeps every label upright on the sheet. */}
                    {layerVisibility.dimensions ? (
                      <CeilingDimensionLayer
                        dimensions={dimensions}
                        view={bounds}
                        unitPx={unitPx}
                        selectedId={selection?.type === 'dimension' ? selection.id : null}
                        hiddenId={dimensionGesturePreview?.id || null}
                        selectTool={canvasTool === CANVAS_TOOLS.SELECT}
                        onDimensionPointerDown={stableCanvasHandlers.onDimensionPointerDown}
                        onStartHandlePointerDown={stableCanvasHandlers.onStartHandlePointerDown}
                        onEndHandlePointerDown={stableCanvasHandlers.onEndHandlePointerDown}
                      />
                    ) : null}

                    {gesturePreview && gesturePreviewType === 'dimension' ? (
                      <DimensionGraphic
                        dimension={gesturePreview}
                        view={bounds}
                        selected
                        unitPx={unitPx}
                        handleRadius={4.5 * unitPx}
                        fontSize={12.5 * unitPx}
                      />
                    ) : null}

                    {layerVisibility.dimensions && dimensionGesturePreview ? (
                      <DimensionGraphic
                        dimension={dimensionGesturePreview}
                        view={bounds}
                        selected
                        unitPx={unitPx}
                        handleRadius={4.5 * unitPx}
                        fontSize={12.5 * unitPx}
                      />
                    ) : null}

                    {(canvasTool === CANVAS_TOOLS.DRAW_DIMENSION || gesture?.kind === 'dimension_endpoint') &&
                    dimensionAcquisition ? (
                      <DimensionAcquisitionGraphic
                        acquisition={dimensionAcquisition}
                        view={bounds}
                        precision={configuration.dimensions.precision}
                        referenceLabel={describeReference(dimensionAcquisition.reference)}
                      />
                    ) : null}

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
              </div>
            ) : null}
            {workspaceView !== WORKSPACE_VIEWS.RCP && previewProject ? (
              <div
                className={styles.previewPane}
                aria-label="Live ceiling assembly 3D preview"
                data-light-armed={canvasTool === CANVAS_TOOLS.ADD_LIGHT ? 'true' : undefined}
              >
                {canvasTool === CANVAS_TOOLS.ADD_LIGHT ? (
                  <p className={styles.paneHint}>Light tool: click a board here to place a light</p>
                ) : null}
                <Suspense
                  fallback={
                    <PanePlaceholder
                      overlay
                      tone="paper"
                      label={LOADING_COPY.livePreview}
                      silhouette={previewSilhouette}
                      since={openedAt}
                      data-preview-pane="ceiling"
                    />
                  }
                >
                  <CeilingLivePreview
                    className={styles.wallPreviewPanel}
                    project={previewProject}
                    activeFloorId={ceiling.floorId}
                    selectionKind={selection?.type || null}
                    selectionId={selection?.id || null}
                    onPick={handlePreviewPick}
                    silhouette={previewSilhouette}
                    loadingSince={openedAt}
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
            collapsible={false}
            innerRef={sectionRef('selection')}
          >
            {selectionHasCard ? null : (
              <EmptyState icon="select" title="Nothing selected">
                Pick the Select tool, then click a board, furring channel, screw, opening, or measurement on the plan to
                edit its exact numbers here — a light fixture works the same way.
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
                {/*
                  Board this one piece in something else. The default option is
                  not a material but the absence of one: the board goes back to
                  following the ceiling's profile, and moves with it afterwards.
                */}
                <SelectField
                  label="Board material"
                  value={selectedPanelMaterial}
                  onChange={(material) =>
                    updateSelectedPanel({ material: material === PROFILE_DEFAULT_MATERIAL ? undefined : material })
                  }
                >
                  <option value={PROFILE_DEFAULT_MATERIAL}>
                    {`Profile default (${boardMaterialLabel(profile.boardMaterial)})`}
                  </option>
                  {Object.values(CEILING_BOARD_MATERIALS).map((material) => (
                    <option key={material} value={material}>
                      {boardMaterialLabel(material)}
                    </option>
                  ))}
                </SelectField>
                <div className={styles.readoutList}>
                  <ReadoutRow
                    label="Net area"
                    value={`${(selectedPanel.netArea / 1_000_000).toFixed(3)} m²`}
                    note="after boundary and opening cuts"
                  />
                </div>
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
                    <div className={styles.readoutList}>
                      <ReadoutRow
                        label="U span"
                        value={`${formatMm(selectedMember.u0)} → ${formatMm(selectedMember.u1)} mm`}
                      />
                      <ReadoutRow
                        label="V span"
                        value={`${formatMm(selectedMember.v0)} → ${formatMm(selectedMember.v1)} mm`}
                      />
                      <ReadoutRow label="Depth" value={`${formatMm(selectedMember.depth)} mm`} />
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

            {selectedFixture && (
              <div className={styles.selectionCard}>
                <h3>Selected light — {getFixtureType(selectedFixture.fixtureType).label}</h3>
                {renderFixtureEditor(selectedFixture)}
              </div>
            )}

            {selectedDimension && (
              <div className={styles.selectionCard}>
                <h3>{selectedDimension.source === 'custom' ? 'Selected measurement' : selectedDimension.name}</h3>
                <div className={styles.measurementReadout}>
                  <strong>{selectedDimension.label}</strong>
                  <span>
                    Exact modeled value:{' '}
                    {formatWallDimensionValue(selectedDimension.measurement, configuration.dimensions.precision)}
                  </span>
                  <span>From {describeReference(selectedDimension.startRef)}</span>
                  <span>To {describeReference(selectedDimension.endRef)}</span>
                </div>
                {selectedDimension.source === 'custom' ? (
                  <>
                    <SelectField
                      label="Direction"
                      value={selectedDimension.mode}
                      onChange={(mode) => updateSelectedDimension({ mode })}
                    >
                      <option value={WALL_DIMENSION_MODES.HORIZONTAL}>Along U (east/west)</option>
                      <option value={WALL_DIMENSION_MODES.VERTICAL}>Along V (north/south)</option>
                      <option value={WALL_DIMENSION_MODES.ALIGNED}>Aligned</option>
                    </SelectField>
                    <NumberField
                      label="Line offset"
                      value={selectedDimension.offset}
                      step={configuration.dimensions.precision}
                      onChange={(offset) => updateSelectedDimension({ offset })}
                    />
                    <NumberField
                      label="Tolerance ±"
                      value={selectedDimension.tolerance}
                      min={0}
                      step={configuration.dimensions.precision}
                      onChange={(tolerance) => updateSelectedDimension({ tolerance })}
                    />
                    <TextField
                      label="Label override"
                      value={selectedDimension.textOverride}
                      placeholder="Use measured value"
                      onChange={(textOverride) => updateSelectedDimension({ textOverride })}
                    />
                    <TextField
                      label="Site note"
                      value={selectedDimension.note}
                      onChange={(note) => updateSelectedDimension({ note })}
                    />
                    <AdvancedGroup label="Exact endpoint coordinates">
                      <p className={styles.inlineHelp}>
                        Usually you reshape by dragging the green endpoints on the drawing; typing here breaks the link
                        to the piece the endpoint was snapped to.
                      </p>
                      <NumberField
                        label="Start · from west edge (U)"
                        value={selectedDimension.start.u}
                        step={configuration.dimensions.precision}
                        onChange={(u) =>
                          updateSelectedDimension({ start: { ...selectedDimension.start, u }, startRef: null })
                        }
                      />
                      <NumberField
                        label="Start · from south edge (V)"
                        value={selectedDimension.start.v}
                        step={configuration.dimensions.precision}
                        onChange={(v) =>
                          updateSelectedDimension({ start: { ...selectedDimension.start, v }, startRef: null })
                        }
                      />
                      <NumberField
                        label="End · from west edge (U)"
                        value={selectedDimension.end.u}
                        step={configuration.dimensions.precision}
                        onChange={(u) =>
                          updateSelectedDimension({ end: { ...selectedDimension.end, u }, endRef: null })
                        }
                      />
                      <NumberField
                        label="End · from south edge (V)"
                        value={selectedDimension.end.v}
                        step={configuration.dimensions.precision}
                        onChange={(v) =>
                          updateSelectedDimension({ end: { ...selectedDimension.end, v }, endRef: null })
                        }
                      />
                    </AdvancedGroup>
                    <ToolbarButton danger onClick={deleteSelectedDimension}>
                      Delete measurement
                    </ToolbarButton>
                  </>
                ) : (
                  <p>
                    This dimension is worked out from the ceiling itself. Use the Dimensions section to turn its group
                    off.
                  </p>
                )}
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
            <div className={styles.readoutList}>
              <ReadoutRow label="Boards" value={takeoff.panelCount} />
              <ReadoutRow label="Stock sheets" value={takeoff.stockSheetCount} />
              <ReadoutRow label="Installed area" value={`${(takeoff.installedAreaMm2 / 1_000_000).toFixed(2)} m²`} />
              <ReadoutRow label="Screws" value={takeoff.fastenerCount} />
              <ReadoutRow label="Hangers" value={takeoff.hangerCount} />
            </div>
            {renderBoardMaterialBreakdown()}
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-elevations"
            title="Elevations"
            summary={`Board underside ${formatMm(elevations.boardUnderside)} mm`}
            open={openSections.elevations}
            onToggle={() => toggleSection('elevations')}
            innerRef={sectionRef('elevations')}
          >
            <div className={styles.readoutList}>
              <ReadoutRow label="Attachment" value={`${formatMm(elevations.attachment)} mm`} note={attachmentLabel} />
              <ReadoutRow label="Board underside" value={`${formatMm(elevations.boardUnderside)} mm`} />
              <ReadoutRow label="Board top" value={`${formatMm(elevations.boardTop)} mm`} />
              <ReadoutRow label="Furring top" value={`${formatMm(elevations.furringTop)} mm`} />
              <ReadoutRow label="Carrier top" value={`${formatMm(elevations.carrierTop)} mm`} />
            </div>
            <p className={styles.inlineHelp}>
              All elevations are measured from the project datum, the same one the floor elevations use.
            </p>
          </CollapsibleSection>
        </aside>
      </div>
    </div>
  );
});
