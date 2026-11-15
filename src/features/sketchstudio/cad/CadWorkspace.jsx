import { useState, useMemo, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import CadViewport from './CadViewport.jsx';
import ProfileEditor from './ProfileEditor.jsx';
import ConnectionEditor from './ConnectionEditor.jsx';
import DraftingImport from './DraftingImport.jsx';
import OperationPanel from './OperationPanel.jsx';
import SheetEditor from './SheetEditor.jsx';
import SheetScaleControl from './SheetScaleControl.jsx';
import SheetsPanel, { PdfExportStatus } from './SheetsPanel.jsx';
import HardwarePanel from './HardwarePanel.jsx';
import { BoughtInPanel, CutFromSheetPanel, sheetMetalPart } from './ShopPanels.jsx';
import {
  PanelEndings,
  PanelMakerForm,
  PanelPreview,
  defaultPanelDraft,
  draftFace,
  panelInput,
} from './PanelMakerForm.jsx';
import { flangedPanel } from './panelMaker.js';
import { PressBrakeBlocked, PressBrakeFinished, PressBrakePanel } from './PressBrakePanel.jsx';
import { PaintPanel, PrintPanel } from './ShopStationPanels.jsx';
import { LaserBed, LaserError, LaserPanel, NONE_ON_SHEET } from './LaserStation.jsx';
import { boughtInItem, copyPositions, landingPositions } from './shopParts.js';
import JobSheetPanel from './JobSheetPanel.jsx';
import { etchBendMarks, laserStation, MAX_LASER_QUANTITY, sheetHolding } from './laserStation.js';
import { jobProducts, jobSheet, jobSheetCsv } from './jobSheet.js';
import {
  BendQueue,
  DrawPanel,
  JobBoard,
  PrimaryButton,
  ProblemCard,
  ShopRoute,
  StationGate,
  StationShell,
} from './ShopFloor.jsx';
import {
  bendQueue,
  foldOf,
  outlineEditRefusal,
  partProgress,
  readyOutlines,
  routeNeighbour,
  routeProgress,
  sheetPartOf,
  shopOutlines,
  shopOutlineView,
  stationEntry,
} from './shopRoute.js';
import {
  FINISH_DEFAULTS,
  applyFinish,
  fillingHoles,
  meshArea,
  paintNumbers,
  paintPick,
  printsOn,
  stripFinish,
} from './paintStation.js';
import { PRINT_DEFAULTS, createPrint, localMesh, methodOnFace, printWarnings } from './printStation.js';
import { printImage } from './printImage.js';
import { shopRecordRows } from './shopRecords.js';
import FlatPatternMap from './FlatPatternMap.jsx';
import {
  bendOnPatch,
  bladeOptions,
  brakePatch,
  brakeCarry,
  brakeSessionDefaults,
  brakeStation,
  failingSteps,
  finishedHere,
  needsAdvice,
  sequenceTries,
  rerunStroke,
  sequenceChecks,
  shopOrderBlock,
  startStroke,
} from './brakeStation.js';
import {
  GRIP_KEYS,
  HANDS_BUDGET_MS,
  actLined,
  brakeActPatch,
  brakeHandOutcomes,
  brakeKeyAct,
  fingerOffer,
  fingerRestore,
} from './brakeHands.js';
import {
  foldProblem,
  foldSheet,
  hitSequence,
  isBendOn,
  madeBends,
  polygonBounds,
  profilePolygon,
  sheetMetalFeature,
  stepOf,
} from './sheetMetal.js';
import {
  DEFAULT_LASER_SHEET,
  DEFAULT_MACHINE,
  MACHINES,
  PRINT_METHOD_NAMES,
  SHEET_STOCK,
  machineOf,
} from './shopCatalog.js';
import { sheetMetalControlBox, sheetMetalKiosk, sheetMetalPumpBracket } from './shopExamples.js';
import MaterialSelect from './MaterialSelect.jsx';
import { createHardware, holePreset, METRIC_THREADS } from './hardware.js';
import { pumpBracketExample } from './pumpBracket.js';
import { rearCoverExample } from './rearCover.js';
import {
  GUIDED_OPERATIONS,
  createOperationDraft,
  isClosedProfile,
  operationModel,
  operationProblem,
} from './operations.js';
import {
  applyPlacementDrag,
  changeSweepOptions,
  finishPlacement,
  pickOf,
  placeClick,
  placementSummary,
  placementView,
  replacePlacement,
  sketchFlowDistance,
  sketchFlowPlacement,
  startAxisPick,
  startPlacement,
  stepBack,
} from './placementTool.js';
import useCadModel from './useCadModel.js';
import {
  flipAxis,
  flipInstance,
  instanceAxis,
  matrixPose,
  rotateInstance,
  rotateInstanceAbout,
  rotateInstancesAbout,
  translateInstance,
  translateInstances,
  turnInstance,
  turnInstances,
} from './movement.js';
import {
  GROUP_COPY,
  anchoredMessage,
  anchoring,
  childNodes,
  contains,
  duplicateNodes,
  groupKeyAction,
  groupNodes,
  isGroupId,
  isNode,
  memberIds,
  nodeName,
  nodeParent,
  rigidMovers,
  sheetSubject,
  topNode,
  treeRows,
  ungroupNodes,
} from './groups.js';
import { placementKeyAction } from './rotateKeys.js';
import { DEFAULT_VIEW_MODE, VIEW_MODES, VIEW_MODE_COPY, nextViewMode } from './viewMode.js';
import { createCutFeature, positionedCut, snapCutPoint } from './cutPlacement.js';
import { CUT_TOOLS, cutRowDirection, cutTemplate } from './placementCuts.js';
import { changeRowCount, rowCountLabel } from './placementRows.js';
import { canFlipSide, chosenHoleRows, flipHardwareSide, pickRowHoles, removeChosenHole } from './placementHardware.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import {
  clone,
  createPart,
  duplicateSheet,
  findSheetFor,
  isFlatSheet,
  normalizeModel,
  numeric,
  removeInstance,
  removePart,
  removeSheets,
  resolveParameters,
  uid,
} from './model.js';
import { furnitureExample, bracketExample } from './examples.js';
import { ConstraintEditor, FeatureForm, JsonEditor, SketchForm, ValueField, VectorFields } from './CadEditors.jsx';
import { buildCutList, cutListCsv } from './fabrication.js';
import { sectionLabel } from './stockSections.js';
import CadSketcher from './CadSketcher.jsx';
import { ExtrudeSummary, SketchOperationPanel, SketchSummary } from './SketchPanels.jsx';
import { SKETCH_PLANES, planeFrame, sketchConsumer, sketchWorldFrame, toPlane } from './sketchPlane.js';
import { PLANE_NAMES } from './originPlanes.js';
import { anchorWorld, formatMm, markOffset, markValue, modelPoses } from './marks.js';
import { entityPolyline } from './sketchProfile.js';
import { mateInstance, mateNodes } from './mate.js';
import { BRAKE, FILM, LASER, MATE, PAINT, PDF_RUN, PRINT, activeTool } from './toolSession.js';
import {
  createFilmClock,
  filmBeats,
  filmHold,
  filmLength,
  filmModel,
  filmReady,
  filmScenes,
  filmStart,
  filmState,
} from './shopFilm.js';
import { FilmCaption, FilmPanel } from './ShopFilm.jsx';
import SheetPreview from './SheetPreview.jsx';
import { FieldContexts, LIVE_DEBOUNCE_MS } from './liveField.js';
import { DesignParametersForm, ParametersPanel } from './ParametersPanel.jsx';
import { mergeParameters, resolveParameterRows } from './parameters.js';
import { buildStarterModel } from './starterModels.js';
import { presetById } from './parameterPresets.js';
import {
  defaultSketchSettings,
  editableEntities,
  mergeSegments,
  outlineSketches,
  sketchEditProblem,
  sketchFromSession,
  sketchOperationDraft,
  sketchPlaneText,
  sketchView,
} from './sketchOperations.js';
import { sheetSvg } from './drawings.js';
import { layoutParts, resolveSheetScale, scaleLabel, sheetFit } from './sheetLayout.js';
import { pdfTextIssueMessage, pdfTextIssues } from './pdfText.js';
import { download } from './download.js';
import NumericInput from '../components/NumericInput.jsx';
import { isFilePickerAbortError } from '../utils/sketchWorkspaceFileUtils';
import { sanitizeFileNamePart } from '@/persistence/fileNames';
import { BusyButton, LOADING_COPY, LoadingBar, PanePlaceholder, kernelBuilding } from '@/ui/loading';
import './cad.css';

// Shop (docs/sketch-studio-fab-shop.md §9): between Assemble and Drawings, its commands in process order.
const tabs = ['Sketch', 'Solid', 'Assemble', 'Shop', 'Drawings', 'Manufacture'];
const WORLD_AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
// What a mark reads (Marks panel).
const MARK_READINGS = [
  ['aligned', 'Aligned'],
  ['X', 'X'],
  ['Y', 'Y'],
  ['Z', 'Z'],
];
const editableTarget = (target) =>
  target instanceof HTMLElement &&
  Boolean(target.closest('input, select, textarea, [contenteditable=""], [contenteditable="true"]'));
// Angle snap presets beside the custom value (0 = free).
const ROTATE_SNAPS = [
  [0, 'Free'],
  [1, '1°'],
  [5, '5°'],
  [15, '15°'],
  [45, '45°'],
  [90, '90°'],
];
const icons = {
  Sketch: 'M4 19L18 5l2 2L6 21H3v-3M14 5l4 4',
  Solid: 'M3 7l9-5 9 5v10l-9 5-9-5V7m0 0l9 5 9-5m-9 5v10',
  Assemble: 'M3 3h7v7H3zM14 14h7v7h-7zM7 14v4h3m4-11h4v3',
  Drawings: 'M5 2h11l4 4v16H5zM8 9h9M8 13h9M8 17h5',
  Manufacture: 'M3 21V10l6 3V7l6 3V3h6v18H3m3-4h2m4 0h2m4 0h1',
  // A press brake: the ram coming down on a bent sheet over the die.
  Shop: 'M7 3h10v5l-5 4-5-4zM3 15l9 3 9-3M5 21h14l-2-4H7z',
  // The Shop commands, one each: a blank with its cut path; the press brake
  // (the tab's machine); a bend by numbers (an L with its angle); unfold (a
  // fold opening flat); the example channel.
  ShopCut: 'M4 5h16v14H4zM9 5l3 7-3 7',
  ShopBrake: 'M7 3h10v5l-5 4-5-4zM3 15l9 3 9-3M5 21h14l-2-4H7z',
  ShopBend: 'M5 4v15h15M5 12a7 7 0 0 1 7 7',
  ShopUnfold: 'M3 16h18M8 11l-4 5 4 5M16 11l4 5-4 5M12 4v8',
  ShopExample: 'M4 7v11h16V7M4 7h3M20 7h-3M9 12.5h1M14 12.5h1',
  // The finishing stations (SM-3): a spray gun and its fan; a screen frame
  // with a squeegee over a letter.
  ShopPaint: 'M3 6h9v5H3zM12 8h3M6 11v8h3v-8M17 5l3-2M17 8h4M17 11l3 2',
  ShopPrint: 'M3 4h18v11H3zM6 18h12M12 15v3M8 7h4M10 7v6M14 7h3v3h-3v3',
  // SM-4: the laser head over a sheet with its beam and kerf; the job sheet
  // (a clipboard with ticks); the control box (a closed box); a flat pattern
  // sheet (a blank with two dash-dot bend lines).
  ShopLaser: 'M9 3h6v5l-3 3-3-3zM12 11v6M3 20h18M5 17h5M14 17h5',
  ShopJob: 'M8 3h8v3H8zM6 4.5H5V21h14V4.5h-1M8 11l1.5 1.5L12 10M8 16l1.5 1.5L12 15M14 11.5h3M14 16.5h3',
  ShopBox: 'M3 8l9-4 9 4v9l-9 4-9-4zM3 8l9 4 9-4M12 12v9',
  ShopFlat: 'M3 5h18v14H3zM9 5v2m0 2v2m0 2v2m0 2v2M15 5v2m0 2v2m0 2v2m0 2v2',
  // Two overlapping squares: a group of parts.
  Group: 'M3 9h12v12H3zM9 9V3h12v12h-6',
  // SF-4: the kiosk (a screen frame on an A-frame base).
  ShopKiosk: 'M8 3h8v10H8zM10 5h4v5h-4zM8 13l-3 8M16 13l3 8M4 21h16',
};
// Centre of a world box [min, max].
const boxCentre = ([min, max]) => min.map((v, i) => (v + max[i]) / 2);
// Projected views stay valid while only a sheet's annotations, title block
// or parts-list setting change; the model geometry and these sheet keys
// decide which views are projected.
const DRAWING_SOURCE_KEYS = ['parameters', 'sketches', 'parts', 'instances', 'connections'];
const DRAWN_SHEET_KEYS = ['views', 'section', 'partId', 'instanceIds', 'explodeDistance'];
const sameDrawingSource = (a, b) => Boolean(a && b) && DRAWING_SOURCE_KEYS.every((k) => a[k] === b[k]);
const sameDrawnSheet = (a, b) => DRAWN_SHEET_KEYS.every((k) => JSON.stringify(a?.[k]) === JSON.stringify(b?.[k]));
// The stale reasons the open sheet generates by itself for (Phase S §7);
// a model change waits for Update drawing preview, as before.
const AUTO_DRAWING_REASONS = ['This sheet has no views yet', 'The view list changed', 'The drawing subject changed'];
// The sheet PDF's Save dialog file type (Phase T).
const PDF_FILE_TYPES = [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }];
const pdfAbortError = () => new DOMException('PDF export cancelled.', 'AbortError');
// A face mate moves one part, or a group's rigid movers (§3.6).
const mateMove = (model, session, parameters) =>
  session.movers ? mateNodes(model, session, parameters) : mateInstance(model, session, parameters);
// The paint and print stations' status line, by station and stage.
const SHOP_STATUS = Object.freeze({
  paint: {
    pick: 'Paint booth — pick a part',
    colour: 'Paint booth — choose the powder, then paint',
    confirm: 'Paint booth — confirm removing the prints',
  },
  print: {
    face: 'Print station — click a flat face to place the artwork',
    artwork: 'Print station — drag the artwork on its face',
  },
  // The laser's line adds the sheet and whether the solid is current (laserStatus).
  laser: {
    sheet: 'Laser — set the sheet and the quantity, then Cut',
    cutting: 'Laser — cutting…',
  },
  // SF-5 (§8): the replay changes nothing in the model, so the solid stays current.
  film: {
    playing: 'Replay — playing · nothing in the model changes',
    paused: 'Replay — paused · nothing in the model changes',
    ended: 'Replay — finished · Esc or End replay returns to where you were',
  },
});
// No selection: what the viewport is handed while the replay plays (one array, so nothing re-renders for it).
const NO_IDS = Object.freeze([]);
const SHOP_HINTS = Object.freeze({
  paint: {
    pick: 'Paint: click the part to paint · Esc leaves',
    colour: 'Paint: click another part to paint it instead · Esc goes back',
    confirm: 'Paint: confirm in Properties · Esc goes back',
  },
  print: {
    face: 'Print: click a flat face to place the artwork · Esc leaves',
    artwork: 'Print: drag the artwork on its face, or click another face to move it there · Esc deselects',
  },
});
// A finish draft from a finish row (or the booth's default powder).
const finishDraft = (finish) =>
  finish
    ? {
        kind: finish.kind,
        name: finish.name || '',
        colour: finish.colour,
        gloss: finish.gloss || 'satin',
        thickness: finish.thickness ?? FINISH_DEFAULTS.thickness,
      }
    : { ...FINISH_DEFAULTS };
// A station session whose picks name parts or prints that are gone (an Undo,
// a removal) steps back to what still stands; the same object otherwise.
function liveShopSession(model, session) {
  if (!session) return session;
  // The replay (§8) shows the model it started on; nothing commits while it
  // plays, and should anything change the model under it, it ends rather
  // than show a film of a model that is no longer there.
  if (session.station === 'film') return session.source === model ? session : null;
  const has = (id) => model.instances.some((i) => i.id === id);
  // The laser's part gone (an Undo, a removal) or no longer sheet metal: it
  // ends. Its job keeps the instances still there (SN-1 §4.2); Quantity's new
  // copies (`fresh`) join it with their commit, so each is only "gone" once it
  // has been seen in the model.
  if (session.station === 'laser') {
    const placed = model.instances.find((i) => i.id === session.instanceId);
    if (!sheetMetalFeature(model.parts.find((p) => p.id === placed?.partId))) return null;
    if (!Array.isArray(session.instanceIds)) return session;
    const fresh = session.fresh || [];
    const instanceIds = session.instanceIds.filter((id) => has(id) || fresh.includes(id));
    const unseen = fresh.filter((id) => !has(id));
    return instanceIds.length === session.instanceIds.length && unseen.length === fresh.length
      ? session
      : { ...session, instanceIds, fresh: unseen };
  }
  if (session.station === 'paint') {
    const targets = session.targets.filter(has);
    if (targets.length === session.targets.length) return session;
    const stage = targets.length ? session.stage : PAINT.next(PAINT.next(session.stage, 'BACK'), 'BACK');
    return { ...session, targets, stage, pending: null };
  }
  // A print placed by this session reaches the model with (or after) the
  // session's own update: it is only "gone" once it has been seen there.
  if (!session.printId) return session;
  const present = (model.prints || []).some((p) => p.id === session.printId);
  if (present) return session.printSeen === session.printId ? session : { ...session, printSeen: session.printId };
  if (session.printSeen !== session.printId) return session;
  return { ...session, stage: PRINT.next(session.stage, 'NEW'), printId: null };
}
const fmtMm = (value) => Number(value.toFixed(2)).toString();
const printLabel = (print) =>
  `${print.kind === 'text' ? `“${print.text}”` : 'Image'} · ${PRINT_METHOD_NAMES[print.method] || print.method}`;
function Icon({ name }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name] || icons.Solid} />
    </svg>
  );
}

export default function CadWorkspace({
  document,
  setCadModel,
  undo,
  redo,
  canUndo,
  canRedo,
  saveSketch,
  saveSketchAs,
  openSketch,
  newSketch,
  onDrafting,
  selectedEntities = [],
  importProfileIds = null,
  onImportComplete,
  commitDocumentName,
  documentPersistence,
}) {
  const model = document.model;
  const latestModel = useRef(model);
  const propertiesPanel = useRef(null);
  const viewport = useRef(null);
  const featureHeading = useRef(null);
  // The finished sketch's Extrude button, and the finish it was last focused for.
  const extrudeButton = useRef(null);
  const focusedFinish = useRef(null);
  const exportGeneration = useRef(0);
  // Phase L (docs/sketch-studio-live-fields.md §5, option 2): the field
  // channel a ValueField fills around its onChange ({ live, session, revert }),
  // and the session of the last commit, so one typing session is one undo step.
  const fieldMeta = useRef(null);
  const fieldSession = useRef(null);
  // The model that session's last commit produced: coalescing also needs the
  // model to still be it (an Undo, or any change from elsewhere, breaks it).
  const fieldModel = useRef(null);
  useLayoutEffect(() => {
    latestModel.current = model;
  }, [model]);
  const runtime = useCadModel(model);
  // Browser checks (the replay, shop floor §8): how many commits this
  // workspace made and how many kernel builds it started, so a script can
  // show the film made none.
  const commitCount = useRef(0),
    buildCount = useRef(0);
  useEffect(() => {
    if (runtime.status === 'building') buildCount.current += 1;
  }, [runtime.status]);
  const [operationDraft, setOperationDraft] = useState(null);
  const [showOperationPreview, setShowOperationPreview] = useState(true);
  const draftModel = useMemo(() => (operationDraft ? operationModel(operationDraft) : model), [operationDraft, model]);
  // Direct placement (placementTool.js): a draft still being placed has no
  // feature (or keeps its previous one while re-placing).
  const placement = operationDraft?.placement || null;
  const draftProblem = operationDraft
    ? placement?.problem ||
      (operationDraft.feature
        ? operationProblem(operationDraft.feature, draftModel, operationDraft.partId)
        : 'Click in the viewport to place the operation.')
    : '';
  const draftStale = Boolean(operationDraft && operationDraft.baseModel !== model);
  const operationPreview = useCadModel(draftModel, Boolean(operationDraft && !draftStale && !draftProblem));
  // While placing, the saved model is shown so clicks land on its faces.
  const displayPreview = Boolean(
    operationDraft && !draftStale && showOperationPreview && operationPreview.ready && placement?.stage !== 'place',
  );
  const placementContext = () => ({
    model: operationDraft.baseModel,
    snapshot: runtime.snapshot,
    parameters: runtime.snapshot?.parameters || {},
  });
  // What the viewport draws; hidden when the saved model changed under the draft.
  const placementShown = useMemo(() => {
    if (!operationDraft?.placement || draftStale) return null;
    try {
      const shown = placementView(operationDraft, {
        model: operationDraft.baseModel,
        snapshot: runtime.snapshot,
        parameters: runtime.snapshot?.parameters || {},
      });
      // Transform's ghost: the shown preview already carries the draft pose.
      const tool = shown?.toolGizmo;
      if (tool?.self && displayPreview)
        shown.toolGizmo = { ...tool, basePose: { position: tool.position, rotation: tool.rotation } };
      return shown;
    } catch {
      return null;
    }
  }, [operationDraft, draftStale, runtime.snapshot, displayPreview]);
  const [tab, setTab] = useState('Solid'),
    [search, setSearch] = useState(''),
    // Selection (docs/sketch-studio-part-groups.md §3.2): node ids (instances
    // and / or groups) in click order, and the group being edited inside
    // (pane state, never saved).
    [selection, setSelection] = useState([]),
    [openGroupId, setOpenGroupId] = useState(null),
    [featureId, setFeatureId] = useState(null),
    [sketchId, setSketchId] = useState(null);
  const [view, setView] = useState('isometric'),
    [moveMode, setMoveMode] = useState(true),
    [moveSnap, setMoveSnap] = useState(1),
    [gizmo, setGizmo] = useState('translate'),
    [rotateSnap, setRotateSnap] = useState(15),
    // Rotate rings and the 90° buttons: world axes or the part's own axes.
    [rotateSpace, setRotateSpace] = useState('world'),
    // Rotate about the bounding-box centre or a point picked on the part.
    [rotateAbout, setRotateAbout] = useState('centre'),
    [perspective, setPerspective] = useState(false),
    // Solid / X-ray / Wireframe (viewMode.js): this pane only, never saved.
    [viewMode, setViewMode] = useState(DEFAULT_VIEW_MODE),
    [exploded, setExploded] = useState(false),
    [isolated, setIsolated] = useState(false),
    [section, setSection] = useState(false),
    [sectionDepth, setSectionDepth] = useState(400),
    [fitKey, setFitKey] = useState(0);
  // Ids an Undo, a remove or a load took away drop out of a multi-selection;
  // an operation's new instance lives in the draft model only. A single id is
  // kept as before (a part just added is selected in the same commit that
  // adds it; a stale one matches nothing). An open group that is gone closes.
  const liveSelection = useMemo(
    () => (selection.length === 1 ? selection : selection.filter((id) => isNode(draftModel, id))),
    [selection, draftModel],
  );
  const openGroup = isGroupId(model, openGroupId) ? openGroupId : null;
  // The single selected part: every single-part tool keys on it, as before;
  // a group or a multi-selection has no part, like no selection.
  const selectedId = liveSelection.length === 1 && !isGroupId(draftModel, liveSelection[0]) ? liveSelection[0] : null;
  const selectedGroup =
    liveSelection.length === 1 ? model.groups?.find((g) => g.id === liveSelection[0]) || null : null;
  // Every part the selection holds (groups expanded), in model order.
  const selectionMembers = useMemo(() => memberIds(draftModel, liveSelection), [draftModel, liveSelection]);
  // A group or several parts: moved, turned, hidden and copied as one body (§3.5).
  const isBody = !selectedId && selectionMembers.length > 0;
  // What the viewport gizmo moves: the part, the group, or the multi-selection.
  const movingKey = selectedId || selectedGroup?.id || (isBody ? 'selection' : null);
  // Programmatic selection of exactly one node (a tool, an added part, a
  // finished operation): inside its parent group, so a part in a group opens
  // that group instead of selecting the outer one.
  const setSelectedId = (id) => {
    setSelection(id ? [id] : []);
    if (id) setOpenGroupId(nodeParent(draftModel, id));
  };
  // Tree group rows the user collapsed (a group holding the selection opens).
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  // The group panel's Move by (mm): a ref too, so Enter in a box applies the
  // value that box just committed.
  const [moveBy, setMoveBy] = useState([0, 0, 0]);
  const moveByRef = useRef([0, 0, 0]);
  // Another document opened while this workspace stays mounted (Open, Import,
  // New, a template): frame it once, as a model opened with parts is framed
  // on mount. Parts added in the session never refit (see addPart).
  const [shownDocumentId, setShownDocumentId] = useState(document.id);
  if (shownDocumentId !== document.id) {
    setShownDocumentId(document.id);
    setFitKey((v) => v + 1);
  }
  const [focusTarget, setFocusTarget] = useState(null);
  // In-viewport sketching: { stage: 'pick' } while choosing a face or an
  // origin plane, then { stage: 'draw', frame, support, boundary, ... } while drawing.
  const [sketchSession, setSketchSession] = useState(null);
  // The pick stage's exact-plane fields; the offset also moves the origin
  // plane tiles in the view (docs/sketch-studio-start-sketch.md §4.2).
  const [planeDraft, setPlaneDraft] = useState({ plane: 'XY', offset: 0 });
  const [sketchSnap, setSketchSnap] = useState(1);
  const [finishedSketch, setFinishedSketch] = useState(null);
  // Face-to-face mate: { stage: 'moving' | 'target' | 'placed', ... }.
  const [mateSession, setMateSession] = useState(null);
  // The press brake station (docs/sketch-studio-fab-shop.md §9 SM-2): { stage
  // ('setup' | 'stroke', BRAKE), key, instanceId, ...the operator's picks
  // (brakeStation.js brakeSessionDefaults) }; null when closed. Never saved.
  const [brakeSession, setBrakeSession] = useState(null);
  // Press brake refused by the shop order ({ partId }), and the last refused pedal or sequence edit.
  const [brakeBlocked, setBrakeBlocked] = useState(null);
  const [brakeProblem, setBrakeProblem] = useState('');
  // The paint and print stations (§9 SM-3), the laser and the replay: {
  // station ('paint' | 'print' | 'laser' | 'film'), stage (PAINT / PRINT /
  // LASER / FILM), key, ...the picks and settings }; null when closed. Never
  // saved. The station's last refusal and its result line.
  const [shopSession, setShopSession] = useState(null);
  const [shopProblem, setShopProblem] = useState('');
  const [shopNotice, setShopNotice] = useState('');
  // Quantity's card (SN-1 §4.3) when fewer copies could go than asked: { text, model }, shown while the model is the one it describes.
  const [copiesNote, setCopiesNote] = useState(null);
  // What to do with a bought-in item just added ({ text, selectionKey }): the
  // status line says it while the item is still the selection, then never again.
  const [placedNote, setPlacedNote] = useState(null);
  // Shop → Job sheet (§9 SM-4): the product shown (a top-level node id, null
  // for every product) and the batch; panel state only, never saved.
  const [jobProduct, setJobProduct] = useState(null);
  const [jobBatch, setJobBatch] = useState(1);
  // The shop floor (docs/sketch-studio-shop-floor.md §4, SF-1), pane state,
  // never saved: the current product / part ({ productId, instanceId,
  // selectionKey: the selection it last followed }); the Shop tab's left pane
  // ('job' | 'tree'); a station that could not open by itself ({ station,
  // kind: 'pick' | 'blocked' | 'waiting', … }, panel 'shop-gate'); one waiting
  // for its commit or the kernel ({ station, instanceId, autoCut, before });
  // the outline Draw hands to Cut, and a sketch just drawn from Draw.
  const [shopSubject, setShopSubject] = useState(null);
  const [leftPane, setLeftPane] = useState('job');
  const [shopGate, setShopGate] = useState(null);
  const [pendingStation, setPendingStation] = useState(null);
  const [cutOutline, setCutOutline] = useState(null);
  // Draw → Flanged panel (shop floor §6.3): the form's draft (kept while Draw
  // is used) and whether its tile is open (its preview covers the view meanwhile).
  const [panelDraft, setPanelDraft] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawnSketch, setDrawnSketch] = useState(null);
  // What a shop sketch's finish did (docs/sketch-studio-outline-edit-sheet-nest.md
  // §3.4: several outlines split into blanks): { text, model }, shown by the
  // panel it went back to while the model is the one it describes.
  const [outlineNotice, setOutlineNotice] = useState(null);
  // Sheet metal (docs/sketch-studio-fab-shop.md §9 SM-1 item 6): the selected
  // part shown unfolded ({ instanceId, flat }); view state only, never saved.
  const [sheetFlat, setSheetFlat] = useState(null);
  // Shop → Add bend: bumped so the sheet-metal form shows its Add bend section.
  const [addBendFocus, setAddBendFocus] = useState(0);
  // Measure tool: {} while picking points (the marks themselves are model.marks);
  // the selected mark, Show marks (not saved) and a mark being saved as a parameter.
  const [measureSession, setMeasureSession] = useState(null),
    [selectedMarkId, setSelectedMarkId] = useState(null),
    [hideMarks, setHideMarks] = useState(false),
    [markParameter, setMarkParameter] = useState(null);
  const [dimensionTool, setDimensionTool] = useState(null);
  const [renaming, setRenaming] = useState(null);
  // The parameter last changed in the table, highlighted if the model then fails to rebuild.
  const [lastParameterEdit, setLastParameterEdit] = useState(null);
  const [parameterNotice, setParameterNotice] = useState('');
  const parameterRows = useMemo(() => resolveParameterRows(model.parameters), [model.parameters]);
  const parameterContext = useMemo(
    () => ({
      names: model.parameters.map((p) => p.name),
      values: Object.fromEntries(
        model.parameters
          .filter((p) => parameterRows[p.id]?.value != null)
          .map((p) => [p.name, parameterRows[p.id].value]),
      ),
    }),
    [model.parameters, parameterRows],
  );
  const [holeMode, setHoleMode] = useState(null);
  const [holeSnap, setHoleSnap] = useState(1);
  const [holeTemplate, setHoleTemplate] = useState({ type: 'hole', diameter: 6.6, depth: 5, throughAll: true });
  const [panel, setPanel] = useState(importProfileIds ? 'import-drafting' : null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    // The export a ribbon button started, so that button alone shows the busy face.
    [exportingType, setExportingType] = useState(null),
    // Generated views (Phase S §7): { source: the model the geometry came
    // from, sheets: Map sheet id → { sheet: the definition projected,
    // result } or { sheet, error } }, filled one sheet at a time.
    [drawings, setDrawings] = useState(null),
    [split, setSplit] = useState(false),
    [drawingZoom, setDrawingZoom] = useState(1),
    // A scale slider mid-drag (SheetScaleControl): { sheetId, scale }, drawn
    // live and committed once when the gesture ends.
    [scaleDraft, setScaleDraft] = useState(null),
    // A new sheet whose views are generated once its model has rebuilt.
    [pendingDrawings, setPendingDrawings] = useState(null),
    [sheetId, setSheetId] = useState(model.sheets[0]?.id),
    // The Sheets panel's result line ({ text, undo, model }): shown while the
    // model is the one it describes, so the next commit (or the Undo) clears it.
    [sheetNotice, setSheetNotice] = useState(null),
    // A sheet PDF under way (Phase T, docs/sketch-studio-sheet-pdf.md §5):
    // { stage: 'working' | 'report' | 'refit', ids, includeParts, name,
    // title, handle (the Save dialog's file, held until written), controller,
    // progress, … the report's failures and warnings }; null when idle.
    [pdfRun, setPdfRun] = useState(null),
    // Its result line ({ text, warnings, model }), cleared by the next commit.
    [pdfNotice, setPdfNotice] = useState(null),
    // Bumped by Export PDF… so the Sheets panel focuses its export section.
    [pdfFocus, setPdfFocus] = useState(0),
    [inspection, setInspection] = useState(null);
  // The sheet and model each auto-generation last tried (sheet id → model),
  // so a sheet that fails or projects nothing is not requested again and again.
  const autoDrawn = useRef(new Map());
  const [treeOpen, setTreeOpen] = useState(true),
    [propertiesOpen, setPropertiesOpen] = useState(true);
  useLayoutEffect(() => {
    if (propertiesPanel.current) propertiesPanel.current.scrollTop = 0;
  }, [movingKey, panel]);
  useLayoutEffect(() => {
    if (featureId && featureHeading.current && propertiesPanel.current) {
      const editor = propertiesPanel.current;
      editor.scrollTop += featureHeading.current.getBoundingClientRect().top - editor.getBoundingClientRect().top - 12;
    }
  }, [featureId]);
  // After a sketch finishes, Extrude takes the focus so Enter extrudes. A new
  // sketch rebuilds the model, so the button may mount disabled (autoFocus
  // then does nothing); focus it once it is enabled, unless something else
  // was focused meanwhile.
  useEffect(() => {
    const button = extrudeButton.current;
    if (panel !== 'sketch-finished' || !finishedSketch || !button || button.disabled) return;
    if (focusedFinish.current === finishedSketch) return;
    focusedFinish.current = finishedSketch;
    const active = button.ownerDocument.activeElement;
    if (!active || active === button.ownerDocument.body) button.focus();
  });
  const instance = model.instances.find((i) => i.id === selectedId),
    part = model.parts.find((p) => p.id === instance?.partId);
  const feature = part?.features.find((f) => f.id === featureId) || part?.features.at(-1);
  // The selected part's sheet-metal blank, folded on the main thread for the
  // Unfold view (the kernel folds the same numbers for the solid).
  const sheetFeature = sheetMetalFeature(part);
  const sheetParameters = useMemo(() => {
    try {
      return resolveParameters(model.parameters);
    } catch {
      return null;
    }
  }, [model.parameters]);
  const sheetFold = useMemo(() => {
    if (!sheetFeature || !sheetParameters) return null;
    try {
      return foldSheet(
        sheetFeature,
        model.sketches.find((s) => s.id === sheetFeature.sketchId)?.profile,
        sheetParameters,
      );
    } catch {
      return null;
    }
  }, [sheetFeature, model.sketches, sheetParameters]);
  // The press brake station, derived from the model and the operator's picks
  // (brakeStation.js); its part going away (an Undo) ends the session. Its
  // facts on every pick (`advise: false`: the lines, the checks, the collision
  // and its fact); its searched advice (the remedies tried, an offset's
  // smallest step, the die, the shorter side) once the picks have been still
  // for LIVE_DEBOUNCE_MS (docs/sketch-studio-brake-flip-tooling.md §11, the
  // BT-2 follow-up), so dragging the punch line stays smooth. An advice is
  // shown only for the very session, model and parameters it was worked out
  // on; where it cannot differ from the facts (no collision, no refused
  // offset) the facts are the station.
  // What the facts cost is kept (hands on the sheet §5.4: each of the grip's
  // two outcomes is one more station like it).
  const brakeFactsRun = useMemo(() => {
    if (!brakeSession || !sheetParameters) return null;
    const start = performance.now();
    const station = brakeStation({ model, session: brakeSession, params: sheetParameters, advise: false });
    return { station, ms: performance.now() - start };
  }, [brakeSession, model, sheetParameters]);
  const brakeFacts = brakeFactsRun?.station ?? null;
  const [brakeAdvice, setBrakeAdvice] = useState(null);
  const brakeAdviceWanted = brakeSession?.stage === 'setup' && needsAdvice(brakeFacts);
  useEffect(() => {
    if (!brakeAdviceWanted) return undefined;
    const timer = setTimeout(
      () =>
        setBrakeAdvice({
          session: brakeSession,
          model,
          params: sheetParameters,
          station: brakeStation({ model, session: brakeSession, params: sheetParameters }),
        }),
      LIVE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [brakeAdviceWanted, brakeSession, model, sheetParameters]);
  const brake =
    brakeAdviceWanted &&
    brakeAdvice?.session === brakeSession &&
    brakeAdvice.model === model &&
    brakeAdvice.params === sheetParameters
      ? brakeAdvice.station
      : brakeFacts;
  if (brakeSession && brakeFacts?.closed) setBrakeSession(null);
  // The blade picker's cards (docs/sketch-studio-brake-flip-tooling.md §4.1):
  // the pending hit tried with every punch or die, only while the picker is open.
  const brakeBladeOptions = useCallback(
    (kind) =>
      brakeSession && sheetParameters && brake?.pending && !brake.pending.error
        ? bladeOptions({ model, session: brakeSession, params: sheetParameters, kind })
        : null,
    [brakeSession, model, sheetParameters, brake],
  );
  // Every hit already made, checked as the machine would make it (§9 SM-2
  // item 8): only when the bends, the blank or the machine change.
  const brakeFeature = brake?.feature,
    brakeProfile = brake?.profile,
    brakeMachine = brake?.machine;
  const brakeChecks = useMemo(() => {
    if (!brakeFeature || !brakeMachine || !sheetParameters) return [];
    try {
      return sequenceChecks({ fold: foldSheet(brakeFeature, brakeProfile, sheetParameters), machine: brakeMachine });
    } catch {
      return [];
    }
  }, [brakeFeature, brakeProfile, brakeMachine, sheetParameters]);
  // The stored sequence's remedies (docs/sketch-studio-tight-bends.md §5.2):
  // a step that collides is tried moved earlier, or with an earlier step made
  // part-way, as moves of the made steps. Worked out as the advice is, once
  // the station has been still for LIVE_DEBOUNCE_MS, and used only for the
  // very checks they were made for (never per frame, never in a stroke).
  const [brakeRowTries, setBrakeRowTries] = useState(null);
  const brakeRowsCollide = brakeSession?.stage === 'setup' && brakeChecks.some((c) => c.collision);
  useEffect(() => {
    if (!brakeRowsCollide || !brakeFeature) return undefined;
    const timer = setTimeout(() => {
      let tries = {};
      try {
        tries = sequenceTries({
          feature: brakeFeature,
          profile: brakeProfile,
          params: sheetParameters,
          machine: brakeMachine,
          checks: brakeChecks,
          newId: () => uid('bend'),
        });
      } catch {
        tries = {};
      }
      setBrakeRowTries({ checks: brakeChecks, tries });
    }, LIVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [brakeRowsCollide, brakeChecks, brakeFeature, brakeProfile, brakeMachine, sheetParameters]);
  const rowTries = brakeRowsCollide && brakeRowTries?.checks === brakeChecks ? brakeRowTries.tries : null;
  // The viewport poses from the facts: the advice arriving changes no pose.
  const brakeView = brakeFacts && !brakeFacts.closed && !brakeFacts.error ? brakeFacts.view : null;
  // Hands on the sheet (docs/sketch-studio-brake-hands-on.md §5.4): what
  // Flip sheet and Turn sheet around would leave, worked out as the advice is
  // (once the session has been still for LIVE_DEBOUNCE_MS, in setup with no
  // scrub, the facts only) and used only for the very session, model and
  // parameters they were made for. They reach the viewport's grip by their
  // own prop, never inside brakeView (a new view re-poses the station). Each
  // is one more station like the facts: where the pair would pass
  // HANDS_BUDGET_MS (the kiosk face frame), each waits instead for the first
  // approach of its handle (a hover, its toolbar button, a press).
  const brakeSettled = Boolean(brakeView) && brakeSession?.stage === 'setup' && !brakeSession.scrub;
  const handsLazy = 2 * (brakeFactsRun?.ms ?? 0) > HANDS_BUDGET_MS;
  const [brakeHands, setBrakeHands] = useState(null);
  const handsFor = (held) =>
    brakeSettled && held?.session === brakeSession && held.model === model && held.params === sheetParameters
      ? held
      : null;
  const handsNow = handsFor(brakeHands);
  // Work out the outcomes of `kinds` not yet known for this very session (an outcome of null: no such act).
  const workOutHands = (kinds) => {
    const missing = kinds.filter((kind) => handsNow?.[kind] === undefined);
    if (!brakeSettled || !missing.length) return;
    const start = performance.now();
    const outcomes = brakeHandOutcomes({
      model,
      session: brakeSession,
      params: sheetParameters,
      station: brakeFacts,
      kinds: missing,
    });
    const ms = performance.now() - start;
    setBrakeHands((held) => {
      const same = handsFor(held);
      return {
        ...(same || { session: brakeSession, model, params: sheetParameters, ms: 0 }),
        ...outcomes,
        ms: Number(((same?.ms || 0) + ms).toFixed(1)),
      };
    });
  };
  useEffect(() => {
    if (!brakeSettled || handsLazy) return undefined;
    const timer = setTimeout(() => workOutHands(['flip', 'turn']), LIVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // workOutHands reads this render's session, model and parameters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brakeSettled, handsLazy, brakeSession, model, sheetParameters]);
  const wantBrakeHand = (kind) => {
    if (handsLazy) workOutHands([kind]);
  };
  const brakeLined = Boolean(brakeView) && actLined(brakeFacts, brakeSession);
  // HO-2 (§6): what else is offered on the sheet while it is being set up:
  // in gauge mode every edge the flat-blank card offers, the edge at the
  // backgauge, and the fingers (a handle only where a millimetre of drag is a
  // millimetre of L, brakeHands.js fingerOffer). Nothing in a scrub, a stroke
  // or the replay (`shown` false, or no grip at all).
  const brakeMode = brakeSession?.mode || 'gauge';
  const brakeGrip = useMemo(
    () =>
      brakeView
        ? {
            shown: brakeSettled,
            lined: brakeLined,
            flip: handsNow?.flip || null,
            turn: handsNow?.turn || null,
            ms: handsNow?.ms ?? null,
            lazy: handsLazy,
            mode: brakeMode,
            edges: brakeSettled && brakeMode === 'gauge' ? brakeFacts.edges : null,
            edge: brakeFacts.edge?.index ?? null,
            fingers: brakeSettled ? fingerOffer(brakeFacts, brakeSession) : null,
          }
        : null,
    [brakeView, brakeSettled, brakeLined, handsNow, handsLazy, brakeMode, brakeFacts, brakeSession],
  );
  // The shown feature is the part's only enabled one: removing or suppressing
  // it would leave a part with no solid (kernel "no active solid features"),
  // so the panel offers Remove part instead (docs/sketch-studio-remove-part.md §3.2).
  const soleFeature = Boolean(
    feature && !feature.suppressed && part.features.filter((f) => !f.suppressed).length === 1,
  );
  const partInstanceCount = part ? model.instances.filter((i) => i.partId === part.id).length : 0;
  const partInstanceLabel = `${partInstanceCount} instance${partInstanceCount === 1 ? '' : 's'}`;
  const sketch = model.sketches.find((s) => s.id === sketchId);
  const sheet = model.sheets.find((s) => s.id === sheetId) || model.sheets[0];
  const attached = Boolean(selectedId) && model.connections.some((c) => c.from === selectedId && c.type !== 'weld');
  // A group is anchored when a member is attached to a part outside it (§3.5).
  const bodyAnchor = isBody ? anchoring(model, selectionMembers) : null;
  const moveHint = attached
    ? 'This part is attached. Edit Connections / welds or move its parent part.'
    : bodyAnchor
      ? anchoredMessage(model, bodyAnchor)
      : exploded
        ? 'Turn off Exploded view to move parts.'
        : '';
  // The rigid movers of the selected body, refusing an anchored one.
  const bodyMovers = () => {
    if (!isBody) throw new Error('Select a group or several parts first.');
    const anchor = anchoring(model, selectionMembers);
    if (anchor) throw new Error(anchoredMessage(model, anchor));
    return rigidMovers(model, selectionMembers);
  };
  // The union of the members' displayed world boxes (what the user sees).
  const bodyBounds = () => {
    const bounds = viewport.current?.getBounds?.(selectionMembers);
    if (!bounds) throw new Error('Rebuild the selected parts before turning them.');
    return bounds;
  };
  const bodyVisible =
    isBody && selectionMembers.some((id) => model.instances.find((i) => i.id === id)?.visible !== false);
  // A commit from a field's typing session (read off the field channel): the
  // first one pushes history (the pre-typing snapshot); later live commits and
  // the final Enter / blur of the same session replace the model without a new
  // entry; Esc after live edits reverts and drops the session's entry. Any
  // commit without a session (a drag, a button, a select) ends the coalescing.
  const commit = (next) => {
    const meta = fieldMeta.current;
    const session = meta?.session ?? null;
    const coalesce = Boolean(session) && session === fieldSession.current && fieldModel.current === model;
    const normalized = normalizeModel(next);
    if (meta?.revert) {
      // Nothing of this session is (still) in the model: nothing to revert.
      if (!coalesce) return;
      fieldSession.current = fieldModel.current = null;
      commitCount.current += 1;
      setCadModel(normalized, { skipHistory: true, revertSession: true });
      setError('');
      return;
    }
    fieldSession.current = session;
    fieldModel.current = session ? normalized : null;
    commitCount.current += 1;
    setCadModel(normalized, { skipHistory: coalesce });
    setError('');
    // The model as committed (the Sheets panel's notice keys on it).
    return normalized;
  };
  // A field's live value through perform: a failure stays silent until the
  // commit on Enter / blur reports it (spec §4).
  const performField = (action) => {
    if (!fieldMeta.current?.live) return perform(action);
    try {
      action();
    } catch {
      // Reported on Enter / blur.
    }
  };
  const marks = model.marks || [];
  const selectedMark = marks.find((m) => m.id === selectedMarkId);
  // Measure needs the assembled, unexploded model and no other tool.
  const measureBlocked = Boolean(
    exploded || operationDraft || sketchSession || mateSession || holeMode || brakeSession || shopSession || busy,
  );
  const measuring = Boolean(measureSession) && !measureBlocked;
  // Placement edits only need the displayed mesh, so they chain while the
  // kernel is still rebuilding the previous placement.
  const placeable = Boolean(
    ((part && runtime.snapshot?.instances.some((i) => i.id === selectedId) && !attached) ||
      (isBody && !bodyAnchor && runtime.snapshot?.instances.some((i) => selectionMembers.includes(i.id)))) &&
    !['error', 'cancelled'].includes(runtime.status) &&
    !exploded &&
    !busy &&
    !operationDraft &&
    !holeMode &&
    !sketchSession &&
    !mateSession &&
    !brakeSession &&
    !shopSession &&
    !measureSession,
  );
  // The Unfold view belongs to the selected sheet-metal part while no tool
  // runs: another selection or any tool folds it back at once (state-machines.md).
  const runningTool = activeTool({
    operationDraft,
    sketchSession,
    mateSession,
    measureSession,
    holeMode,
    brakeSession,
    shopSession,
  });
  if (sheetFlat && (sheetFlat.instanceId !== selectedId || runningTool)) setSheetFlat(null);
  // A station whose picks name parts that are gone (an Undo, a removal) keeps what still stands.
  const liveShop = liveShopSession(model, shopSession);
  if (liveShop !== shopSession) setShopSession(liveShop);
  // The laser station (laserStation.js), derived from the model, its lead
  // part, the job and the sheet shown (SN-1 §4.2; the quantity is the model's).
  const laserSession = shopSession?.station === 'laser' ? shopSession : null;
  const laserInstanceId = laserSession?.instanceId || null,
    laserJob = laserSession?.instanceIds || null,
    laserSheetIndex = laserSession?.sheetIndex ?? null;
  const laserState = useMemo(() => {
    if (!laserInstanceId) return null;
    // Unreadable parameters: the blank cannot be read (the station says so, with Leave).
    if (!sheetParameters) return { error: 'Fix the named parameters first: the blank cannot be read.' };
    return laserStation({
      model,
      session: { instanceId: laserInstanceId, instanceIds: laserJob, sheetIndex: laserSheetIndex },
      params: sheetParameters,
    });
  }, [laserInstanceId, laserJob, laserSheetIndex, model, sheetParameters]);
  const laserView = laserState && !laserState.closed && !laserState.error ? laserState : null;
  const sheetView = useMemo(
    () =>
      sheetFold?.bends.length && sheetFlat && sheetFlat.instanceId === selectedId && !runningTool
        ? { instanceId: selectedId, fold: sheetFold, flat: sheetFlat.flat }
        : null,
    [sheetFold, sheetFlat, selectedId, runningTool],
  );
  const unfolded = Boolean(sheetView?.flat);
  const toggleUnfold = () => {
    if (!sheetFeature) throw new Error('Select a sheet-metal part first (Shop → Cut from sheet makes one).');
    if (!sheetFold?.bends.length) throw new Error('Add a bend first: a part with no bends is already flat.');
    if (runningTool) throw new Error('Finish the open tool before unfolding.');
    setSheetFlat({ instanceId: selectedId, flat: !unfolded });
  };
  // Turn by a fixed angle about X, Y or Z: the world axis, or in Local space
  // the part's own axis; through the picked pivot when turning about one.
  const turnSelected = (axisName, degrees) =>
    perform(() => {
      if (latestModel.current !== model) throw new Error('The model changed. Try again.');
      const parameters = runtime.snapshot.parameters;
      const pivot = rotateAbout === 'picked' && moveMode && gizmo === 'rotate' ? viewport.current.getPivot() : null;
      // A group: World axes (it has none of its own), through the union centre.
      if (isBody) {
        const centre = pivot || boxCentre(bodyBounds());
        return commit(rotateInstancesAbout(model, bodyMovers(), WORLD_AXES[axisName], degrees, centre, parameters));
      }
      const axis = rotateSpace === 'local' ? instanceAxis(instance, axisName, parameters) : WORLD_AXES[axisName];
      if (pivot) return commit(rotateInstanceAbout(model, selectedId, axis, degrees, pivot, parameters));
      const bounds = viewport.current.getInstanceBounds(selectedId);
      commit(rotateInstance(model, selectedId, axis, degrees, bounds, parameters));
    });
  // The Move part / Rotate part buttons and the M / R keys: pick a gizmo, or
  // turn it off when it is already the active one.
  const chooseGizmo = (mode) => {
    setHoleMode(null);
    setMeasureSession(null);
    setMoveMode(!(moveMode && gizmo === mode));
    setGizmo(mode);
  };
  // R / M, ] / [ (see rotateKeys.js). Re-subscribed each render so the
  // handler sees the current selection and settings.
  useEffect(() => {
    const keyDown = (event) => {
      // Delete / Backspace removes the selected mark (parts have no Delete key).
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedMark &&
        !sketchSession &&
        !editableTarget(event.target) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.defaultPrevented
      ) {
        event.preventDefault();
        deleteMark(selectedMark.id);
        return;
      }
      // Ctrl+G / Ctrl+Shift+G / Ctrl+A / Esc (groups.js): before the
      // placement keys, which ignore every Ctrl chord.
      const groupAction = groupKeyAction(event, {
        nodes: liveSelection.length,
        hasGroup: liveSelection.some((id) => isGroupId(model, id)),
        openGroupId: openGroup,
        busy: Boolean(
          sketchSession ||
          holeMode ||
          mateSession ||
          operationDraft ||
          measureSession ||
          brakeSession ||
          shopSession ||
          busy,
        ),
        dragging: Boolean(viewport.current?.isDragging?.()),
      });
      if (groupAction) {
        event.preventDefault();
        if (groupAction.type === 'group') perform(groupSelection);
        else if (groupAction.type === 'ungroup') perform(ungroupSelection);
        else if (groupAction.type === 'selectAll') selectAllNodes();
        else closeGroup();
        return;
      }
      const action = placementKeyAction(event, {
        selected: Boolean(part) || isBody,
        busy: Boolean(
          sketchSession || holeMode || mateSession || operationDraft || measureSession || brakeSession || shopSession,
        ),
        measuring: Boolean(measureSession),
        placeable,
        dragging: Boolean(viewport.current?.isDragging?.()),
        snap: rotateSnap,
        toolGizmo: Boolean(placementShown?.toolGizmo),
      });
      if (!action) return;
      event.preventDefault();
      // X / Shift+X: Solid ↔ X-ray, Wireframe ↔ Solid (any tool may be running).
      if (action.type === 'view') setViewMode(nextViewMode(viewMode, action));
      // R / M while a boolean tool gizmo is shown: switch its mode.
      else if (action.toolGizmo) setGizmo(action.mode);
      else if (action.type === 'tool' && action.tool === 'sketch') {
        if (!busy) perform(startSketchPick);
      } else if (action.type === 'tool') {
        if (measureSession) endMeasure();
        else if (!measureBlocked) perform(startMeasure);
      } else if (action.type === 'gizmo') chooseGizmo(action.mode);
      else turnSelected(action.axis, action.degrees);
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });
  const changePart = (next) => commit({ ...model, parts: model.parts.map((p) => (p.id === next.id ? next : p)) });
  const changeInstance = (next) =>
    commit({ ...model, instances: model.instances.map((i) => (i.id === next.id ? next : i)) });
  // A new selection closes the tool panels. An open operation is dropped the
  // way Cancel drops it (its placement may have isolated a part), and a mate
  // ends: a placed one keeps its committed move, as Done does, and a pick in
  // progress has committed nothing. The mate's own picks select directly
  // (setSelectedId / setSelection), so they never end their own session.
  const resetSelectionTools = () => {
    setHoleMode(null);
    if (operationDraft) setIsolated(operationDraft.previousIsolation);
    setOperationDraft(null);
    setMateSession(null);
    setBrakeSession(null);
    setBrakeBlocked(null);
    setShopSession(null);
    setShopGate(null);
    setPendingStation(null);
    setSelectedMarkId(null);
    setSketchId(null);
    setFeatureId(null);
    setPanel(null);
  };
  const select = (id) => {
    resetSelectionTools();
    setSelectedId(id);
  };
  // A selection of sibling nodes inside `open` (the group edited in, or null).
  const selectNodes = (ids, open) => {
    resetSelectionTools();
    setSelection(ids);
    setOpenGroupId(open);
  };
  // Shift / Ctrl+click: add or remove a node. A selection holds siblings
  // only, so a node at another level replaces it (§3.3).
  const toggleNode = (node) => {
    const parent = nodeParent(draftModel, node);
    const siblings = liveSelection.every((id) => nodeParent(draftModel, id) === parent);
    const next = !siblings
      ? [node]
      : liveSelection.includes(node)
        ? liveSelection.filter((id) => id !== node)
        : [...liveSelection, node];
    selectNodes(next, parent);
  };
  // A click in the viewport reports the raw instance id: select its top node
  // below the open group (a click outside the open group closes it first);
  // a double-click opens the group under the cursor one level (§3.3).
  const pickInstance = (instanceId, { toggle = false, open = false } = {}) => {
    if (!instanceId || !isNode(draftModel, instanceId)) {
      if (!toggle) select(null);
      return;
    }
    const context = openGroup && contains(draftModel, openGroup, instanceId) ? openGroup : null;
    const top = topNode(draftModel, instanceId, context);
    if (open && isGroupId(draftModel, top)) return selectNodes([topNode(draftModel, instanceId, top)], top);
    if (toggle) return toggleNode(top);
    selectNodes([top], context);
  };
  const treeClick = (id, event) => (event.shiftKey || event.ctrlKey || event.metaKey ? toggleNode(id) : select(id));
  // Esc or the banner: close one level and select the group just closed.
  const closeGroup = () => {
    if (openGroup) selectNodes([openGroup], nodeParent(model, openGroup));
  };
  const groupSelection = () => {
    if (liveSelection.length < 2) throw new Error(GROUP_COPY.tooFew);
    const { model: next, groupId } = groupNodes(model, liveSelection);
    commit(next);
    selectNodes([groupId], nodeParent(next, groupId));
  };
  const ungroupSelection = () => {
    const groupIds = liveSelection.filter((id) => isGroupId(model, id));
    if (!groupIds.length) throw new Error('Select a group to ungroup.');
    const parent = nodeParent(model, groupIds[0]);
    const { model: next, childIds } = ungroupNodes(model, groupIds);
    commit(next);
    selectNodes(childIds, parent);
  };
  // Ctrl+A: every node of the current context (the open group, or the top level).
  const selectAllNodes = () => {
    const { groups, instances } = childNodes(model, openGroup);
    selectNodes([...groups, ...instances], openGroup);
  };
  const toggleBodyVisibility = () => {
    const members = new Set(selectionMembers);
    commit({
      ...model,
      instances: model.instances.map((i) => (members.has(i.id) ? { ...i, visible: !bodyVisible } : i)),
    });
  };
  const duplicateBody = () => {
    const { model: next, nodeIds } = duplicateNodes(model, liveSelection);
    commit(next);
    selectNodes(nodeIds, nodeParent(next, nodeIds[0]));
  };
  const removeBody = () => {
    commit(selectionMembers.reduce((next, id) => removeInstance(next, id), model));
    select(null);
  };
  const renameGroup = (id, name) => {
    const trimmed = String(name).trim();
    if (!trimmed) throw new Error('A group needs a name.');
    commit({ ...model, groups: model.groups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)) });
  };
  const setMoveByAxis = (axis, value) => {
    const next = moveByRef.current.map((v, i) => (i === axis ? value : v));
    moveByRef.current = next;
    setMoveBy(next);
  };
  // Move by: a delta and a button, never a live absolute field (§3.5).
  const moveBodyBy = () =>
    perform(() => {
      const delta = moveByRef.current;
      if (!delta.some((v) => Math.abs(v) > 1e-9)) return;
      if (!placeable) throw new Error(moveHint || 'The selection cannot be moved now.');
      commit(translateInstances(model, bodyMovers(), delta));
      moveByRef.current = [0, 0, 0];
      setMoveBy([0, 0, 0]);
    });
  // A new Board, Tube or Angle bar lands on the ground at the centre of the
  // current view (the viewport's drop point, snapped to the Move grid; the
  // origin when the viewport cannot say) and the camera stays where it is: a
  // board's footprint is centred on the point (a box is built from its
  // corner), a member's axis (an angle's bounding-box centre) runs up through it.
  const addPart = (kind) => {
    const created = createPart(kind);
    const [x, y] = viewport.current?.viewDropPoint?.() ?? [0, 0, 0];
    const body = created.part.features[0];
    const position = body.type === 'box' ? [x - body.width / 2, y - body.depth / 2, 0] : [x, y, 0];
    const instance = { ...created.instance, position };
    commit({ ...model, parts: [...model.parts, created.part], instances: [...model.instances, instance] });
    select(instance.id);
  };
  // Shop → Cut from sheet: the blank's bounding-box centre lands on the ground
  // under the view centre (like a new Board); its feature opens for bending.
  // `sheet` (SF-3): the stock sheet to cut it from, when the model's does not hold the blank.
  // `companions` (round-bend spec §13.3): parts made with it, [{ sketch, part,
  // poses }], one instance per pose (a 4 × 4 in the new part's frame): a flanged
  // panel's corner pieces, set in their corners and grouped with the panel
  // (named after it) so they move as one.
  // SN-1 (docs/sketch-studio-outline-edit-sheet-nest.md §4.3, §4.8): `quantity`
  // instances of the part (each copy a blank on the shared sheet), or `items`
  // — a batch, one record { sketch, part, centre, bounds, quantity } per
  // outline — made in ONE commit (one Undo takes it all back). The new
  // instances are laid out in rows round the view's drop point
  // (shopParts.js landingPositions: one blank lands exactly as before); the
  // laser then opens on the first, cutting every new one (a batch names them
  // as the job, `instanceIds`).
  // What stands in the view, as XY boxes (BQ-1 §7.7: a new cut never lands on
  // a part): each instance's built box from the snapshot, else — not built
  // yet — its sheet-metal blank's at its position; anything else unbuilt has
  // no box yet.
  const standingBoxes = () =>
    model.instances.flatMap((i) => {
      const b = runtime.snapshot?.instances.find((s) => s.id === i.id)?.bounds;
      if (b)
        return [
          [
            [b[0][0], b[0][1]],
            [b[1][0], b[1][1]],
          ],
        ];
      const fold = foldOf(model, i.id, sheetParameters || {});
      if (!fold) return [];
      const [[x0, y0], [x1, y1]] = fold.flat.bounds;
      const [px, py] = [0, 1].map((k) => Number(i.position?.[k]) || 0);
      return [
        [
          [px + x0, py + y0],
          [px + x1, py + y1],
        ],
      ];
    });
  const cutFromSheet = ({
    items = null,
    sketch,
    part: created,
    centre,
    bounds = null,
    quantity = 1,
    sheet = null,
    companions = [],
  }) => {
    const lots = items || [{ sketch, part: created, centre, bounds, quantity }];
    const [x, y] = viewport.current?.viewDropPoint?.() ?? [0, 0, 0];
    const made = lots.flatMap((lot) =>
      Array.from({ length: Math.max(1, Math.round(Number(lot.quantity) || 1)) }, () => ({
        part: lot.part,
        // A record without bounds (an older caller) is a point at its centre.
        box: lot.bounds || [lot.centre, lot.centre],
      })),
    );
    const positions = landingPositions(
      made.map((m) => m.box),
      [x, y],
      { taken: standingBoxes() },
    );
    const placedAll = made.map((m, i) => ({
      id: uid('instance'),
      partId: m.part.id,
      name: '',
      position: positions[i],
      rotation: [0, 0, 0],
      visible: true,
    }));
    const placed = placedAll[0];
    const first = lots[0].part;
    // The new part is not turned: a pose moves by its position only (the panel maker's corner pieces).
    const beside = companions.flatMap(({ part, poses }) =>
      poses.map((pose) => ({
        id: uid('instance'),
        partId: part.id,
        name: '',
        ...matrixPose(pose.map((v, k) => (k >= 12 && k < 15 ? v + placed.position[k - 12] : v))),
        visible: true,
      })),
    );
    const next = {
      ...model,
      sketches: [
        ...model.sketches,
        ...lots.flatMap((lot) => (lot.sketch ? [lot.sketch] : [])),
        ...companions.map((c) => c.sketch),
      ],
      parts: [...model.parts, ...lots.map((lot) => lot.part), ...companions.map((c) => c.part)],
      instances: [...model.instances, ...placedAll, ...beside],
      ...(sheet ? { fabrication: { ...model.fabrication, shop: { ...model.fabrication?.shop, sheet } } } : {}),
    };
    const grouped = beside.length ? groupNodes(next, [placed.id, ...beside.map((i) => i.id)]) : null;
    commit(
      grouped
        ? {
            ...grouped.model,
            groups: grouped.model.groups.map((g) => (g.id === grouped.groupId ? { ...g, name: first.name } : g)),
          }
        : next,
    );
    // Selected inside its new group (select() reads the model before this commit).
    resetSelectionTools();
    setSelection([placed.id]);
    setOpenGroupId(grouped?.groupId ?? null);
    setFeatureId(first.features[0].id);
    // Cut on the laser (docs/sketch-studio-shop-floor.md §4.5): the laser opens
    // on the new part, cutting, once the commit is the model on show.
    setPendingStation({
      station: 'cut',
      instanceId: placed.id,
      instanceIds: items ? placedAll.map((i) => i.id) : null,
      autoCut: true,
      before: model,
    });
  };
  // options (Phase J): { hardware } the library's hardware feature, { template }
  // the sizes "Apply and place another" carries to the next cut; (Phase K)
  // { row } opens the Hole tool as a hole row; (Phase M) { preselect:
  // { instanceId, featureId } } opens Hardware with every hole of that row chosen.
  const beginOperation = async (type, existingFeature = null, options = {}) => {
    setHoleMode(null);
    if (!existingFeature && !runtime.ready)
      throw new Error('Wait for the current model to rebuild before adding an operation.');
    let references = [];
    if (['fillet', 'chamfer', 'shell'].includes(type) && part && runtime.ready) {
      setBusy(true);
      try {
        references = await runtime.request('references', { partId: part.id, beforeFeatureId: existingFeature?.id });
      } finally {
        setBusy(false);
      }
    }
    if (latestModel.current !== model) throw new Error('The model changed. Open the operation again.');
    const chosenSketch = model.sketches.find((s) => s.id === sketchId && isClosedProfile(s)) || null;
    let draft = createOperationDraft({
      type,
      model,
      partId: part?.id,
      selectedSketchId: sketchId,
      bounds: runtime.snapshot?.parts.find((p) => p.id === part?.id)?.bounds,
      references,
      existingFeature,
      placement: startPlacement({
        type,
        existingFeature,
        chosenSketch,
        hostInstanceId: part ? selectedId : null,
        hardware: options.hardware || null,
        template: options.template || null,
        row: Boolean(options.row),
      }),
    });
    if (options.preselect)
      draft = pickRowHoles(draft, options.preselect, {
        model,
        snapshot: runtime.snapshot,
        parameters: runtime.snapshot?.parameters || {},
      });
    setOperationDraft({ ...draft, previousSelection: selectedId, previousIsolation: isolated });
    setShowOperationPreview(true);
    setMeasureSession(null);
    if (draft.newInstance) setSelectedId(draft.newInstance.id);
    setMoveMode(false);
    setExploded(false);
    setSection(false);
    // Isolate once the target is known; while placing, every part is clickable.
    setIsolated(!(draft.placement?.stage === 'place' && ['face', 'path', 'section'].includes(pickOf(draft.placement))));
    setPropertiesOpen(true);
    setPanel('operation');
  };
  // A placement step that leaves the Place stage selects and isolates the
  // part being shaped (never hiding the clicked part).
  const changePlacement = (next) => {
    if (operationDraft.placement?.stage === 'place' && next.placement?.stage !== 'place') {
      setSelectedId(next.newInstance?.id || next.placement.hostInstanceId || selectedId);
      // Hardware stays in context: the part it sits on remains visible.
      setIsolated(next.placement.tool !== 'hardware');
    }
    if (operationDraft.placement?.stage !== 'place' && next.placement?.stage === 'place') {
      if (['face', 'path', 'section'].includes(pickOf(next.placement))) setIsolated(false);
    }
    setOperationDraft(next);
  };
  const assertDraftCurrent = () => {
    if (!operationDraft) throw new Error('No operation is open.');
    if (draftStale) throw new Error('The saved model changed. Cancel and reopen this operation.');
  };
  const placeOperation = (info) =>
    perform(() => {
      assertDraftCurrent();
      changePlacement(placeClick(operationDraft, info, placementContext()));
    });
  const dragOperation = (change) =>
    perform(() => {
      assertDraftCurrent();
      if (operationDraft.sketchFlow)
        return changeSketchOperation(sketchFlowDistance(operationDraft, change.value, placementContext()));
      setOperationDraft(applyPlacementDrag(operationDraft, change, placementContext()));
    });
  // `pick`: a double-clicked hole centre (Hardware, Phase M); a button's
  // click event is not one.
  const finishOperationPlacement = (pick) =>
    perform(() => {
      assertDraftCurrent();
      const hole = pick?.snapKind === 'hole centre' ? pick : null;
      changePlacement(finishPlacement(operationDraft, placementContext(), hole));
    });
  // Flip side (Phase Q): every chosen hole to its other opening, in Place or
  // seated in Shape.
  const flipOperationSide = () =>
    perform(() => {
      assertDraftCurrent();
      changePlacement(flipHardwareSide(operationDraft, placementContext()));
    });
  const [reopen, setReopen] = useState(null);
  // `again` (Hole / Pocket): reopen the tool in Place with the same sizes
  // once the committed model has rebuilt (beginOperation waits for it).
  const applyOperation = (again = false) =>
    perform(() => {
      if (draftStale || !operationPreview.ready || draftProblem || latestModel.current !== operationDraft.baseModel)
        throw new Error('Wait for a valid current preview before applying.');
      commit(draftModel);
      const id = operationDraft.newInstance?.id || selectedId;
      const featureId = operationDraft.feature.id;
      setIsolated(operationDraft.previousIsolation);
      setOperationDraft(null);
      select(id);
      setFeatureId(featureId);
      if (again === true)
        setReopen({
          type: operationDraft.feature.type,
          template: cutTemplate(operationDraft.feature),
          // A hole row reopens as a row, with the same count and spacing.
          row: Boolean(operationDraft.feature.row),
          before: operationDraft.baseModel,
        });
    });
  useEffect(() => {
    // After the commit reaches this component and the model has rebuilt.
    if (!reopen || model === reopen.before || !runtime.ready || operationDraft) return;
    setReopen(null);
    // A tool started meanwhile (S works during the rebuild) keeps the view.
    if (activeTool({ operationDraft, sketchSession, mateSession, measureSession, holeMode, brakeSession, shopSession }))
      return;
    perform(() => beginOperation(reopen.type, null, { template: reopen.template, row: reopen.row }));
    // Runs once the committed model has rebuilt; beginOperation reads that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopen, model, runtime.ready, operationDraft]);
  const cancelOperation = () => {
    setSelectedId(operationDraft.previousSelection);
    setIsolated(operationDraft.previousIsolation);
    setOperationDraft(null);
    setPanel(null);
  };
  const addFeature = (type) => {
    setHoleMode(null);
    if (GUIDED_OPERATIONS.includes(type)) return beginOperation(type);
    if (!part) throw new Error('Select a part in the tree or viewport first.');
    if (!runtime.ready)
      throw new Error('Wait for the model to rebuild, or fix the failing feature before adding another.');
    if (['extrude', 'revolve', 'sweep', 'loft'].includes(type) && !model.sketches.length)
      throw new Error('Create a profile in the Sketch tab first, then select this part and add the operation.');
    if (['union', 'subtract', 'intersect'].includes(type) && model.parts.length < 2)
      throw new Error('Add a second part to use as the Boolean tool first.');
    const next = createCutFeature(type, part, runtime.snapshot.parameters);
    if (['hole', 'pocket'].includes(type)) {
      setMoveMode(false);
      setExploded(false);
      setSection(false);
    }
    if ('toolPartId' in next) next.toolPartId = model.parts.find((p) => p.id !== part.id)?.id || '';
    changePart({ ...part, features: [...part.features, next] });
    setFeatureId(next.id);
    setPanel(null);
  };
  const startHoleTool = (mode) => {
    if (!part) throw new Error('Select the part that should receive the holes first.');
    if (!runtime.ready) throw new Error('Wait for the current model to rebuild first.');
    setHoleMode(mode);
    setMeasureSession(null);
    setMoveMode(false);
    setExploded(false);
    setSection(false);
    setSplit(false);
    setPropertiesOpen(true);
    if (mode === 'place') setPanel('hole-tool');
  };
  // `exact`: the point came from a mark, so it is used as is (no hole snap).
  const placeHole = (point, normal, planar, { exact = false } = {}) => {
    if (!planar)
      throw new Error('Pick a flat face. For a round tube, use Hole → On tube / member for an exact radial cut.');
    if (!runtime.ready || latestModel.current !== model) throw new Error('Wait for the current model to rebuild.');
    const pose = runtime.snapshot.instances.find((i) => i.id === selectedId)?.placement;
    if (!part || !pose) throw new Error('Select a current part first.');
    const direction = unmapPlacement(
      normal.map((n) => -n),
      pose,
      true,
    );
    const local = unmapPlacement(point, pose);
    const position = exact ? local : snapCutPoint(local, direction, holeSnap);
    const next = positionedCut({ ...holeTemplate, id: uid('feature') }, position, direction);
    changePart({ ...part, features: [...part.features, next] });
    setFeatureId(next.id);
  };
  // `index`: which hole of a hole row was dragged (Phase K); the whole row
  // moves with it, so the first hole moves by the same amount.
  const moveHole = (id, point, index = 0) => {
    if (!runtime.ready || latestModel.current !== model) throw new Error('Wait for the current model to rebuild.');
    const old = part.features.find((f) => f.id === id);
    const metrics = runtime.snapshot.parts.find((p) => p.id === part.id)?.features[id];
    const cut = metrics?.cut;
    const pose = runtime.snapshot.instances.find((i) => i.id === selectedId)?.placement;
    if (!cut || !pose) throw new Error('This hole needs current geometry before moving.');
    const snapped = snapCutPoint(unmapPlacement(point, pose), cut.direction, holeSnap);
    const centre = metrics.row?.centres?.[index];
    const position = index > 0 && centre ? cut.position.map((x, i) => x + snapped[i] - centre[i]) : snapped;
    const next = positionedCut(old, position, cut.direction);
    changePart({ ...part, features: part.features.map((f) => (f.id === id ? next : f)) });
    setFeatureId(id);
    setPanel(null);
  };
  const exitSketch = () => {
    setSketchSession(null);
    // Return to the standard view used before the sketch.
    setFitKey((v) => v + 1);
  };
  // Where a sketch goes back to (docs/sketch-studio-outline-edit-sheet-nest.md
  // §3.3): its session's `returnTo` — { panel: 'shop-draw' }, { panel:
  // 'shop-cut', outline }, { panel: 'shop-laser', instanceId } or { panel:
  // 'part', instanceId, featureId } — or null, the Sketch tab's own flow (no
  // panel). `sketchId`: the sketch finished (Draw chooses its row); `ready`:
  // it is still an outline ready to cut (Cut from sheet needs one, else Draw
  // shows it under "Not ready to cut"); `notice`: what the finish did.
  const returnFromSketch = (back, { sketchId = null, ready = true, notice = '' } = {}) => {
    const to = back?.panel || null;
    if (to === 'shop-draw' || (to === 'shop-cut' && !ready)) {
      if (sketchId) setDrawnSketch(sketchId);
      return setPanel('shop-draw');
    }
    if (to === 'shop-cut') {
      setCutOutline(back.outline);
      return setPanel('shop-cut');
    }
    if (to === 'shop-laser') {
      // Ready, not cutting; a blank the laser cannot take opens its gate
      // instead. A batch's job comes back with it (SN-1 §4.2).
      openStationOn('cut', back.instanceId, currentSubject, { instanceIds: back.instanceIds || null });
      if (notice) setShopNotice(notice);
      return;
    }
    if (to === 'part' && model.instances.some((i) => i.id === back.instanceId)) {
      select(back.instanceId);
      setFeatureId(back.featureId);
      setPropertiesOpen(true);
      return;
    }
    setPanel(null);
  };
  // Cancel: back where the sketch was started, nothing committed (a refused finish's line goes with it).
  const cancelSketch = () => {
    const back = sketchSession?.returnTo || null;
    exitSketch();
    if (sketchSession?.refusal) setError('');
    returnFromSketch(back);
  };
  const resetModesForSketch = () => {
    setHoleMode(null);
    setMeasureSession(null);
    setMoveMode(false);
    setExploded(false);
    setSection(false);
    setIsolated(false);
    setOperationDraft(null);
    setPropertiesOpen(true);
  };
  const beginSketch = ({
    frame,
    support,
    boundary = [],
    sketch = null,
    entities = [],
    dimensions = [],
    returnTo = null,
  }) => {
    const edges = mergeSegments([...boundary, ...(viewport.current?.planeEdges(frame) || [])]);
    const view = sketchView(frame, boundary.length ? boundary : [], runtime.snapshot);
    resetModesForSketch();
    setSketchSession({
      stage: 'draw',
      key: uid('session'),
      frame,
      support,
      boundary: edges,
      sketchId: sketch?.id || null,
      entities,
      // Its reference dimensions (docs/sketch-studio-sketch-dimensions.md), kept beside the entities.
      dimensions,
      parameters: parameterContext.values,
      name: sketch?.name || `Sketch ${model.sketches.length + 1}`,
      span: view.span,
      gridBounds: view.gridBounds,
      visible: view.visible,
      focus: view.focus,
      outline: boundary,
      // Every drawn mark point, dropped square onto the plane (a width
      // measured on a front edge marks a top-face sketch too).
      markPoints: (viewport.current?.getMarkPoints?.() || []).map((p) => toPlane(frame, p).slice(0, 2)),
      // Where the finished (or cancelled) sketch goes back to (returnFromSketch);
      // null for the Sketch tab's own flow.
      returnTo,
    });
    setFocusTarget(view.focus);
    setPanel('sketching');
  };
  // Look at: square to the plane, framing the face outline and the sketch
  // (`points`: its dimensions' line ends and label points).
  const lookAtSketch = (entities = [], points = []) => {
    if (!sketchSession?.frame) return;
    const drawn = entities.flatMap((entity) => {
      const points = entityPolyline(entity, 16);
      return points.slice(1).map((p, i) => [points[i], p]);
    });
    const marked = points.map((p) => [p, p]);
    const view = sketchView(sketchSession.frame, [...sketchSession.outline, ...drawn, ...marked], runtime.snapshot);
    setSketchSession({
      ...sketchSession,
      span: view.span,
      gridBounds: view.gridBounds,
      visible: view.visible,
      focus: view.focus,
    });
    setFocusTarget(view.focus);
  };
  // New sketch (ribbon, Start list, S): pick a flat face or an origin plane
  // in the view, or type an exact plane in the panel.
  const startSketchPick = () => {
    resetModesForSketch();
    setSketchSession({ stage: 'pick' });
    setPlaneDraft((draft) => ({ ...draft, offset: 0 }));
    setPanel('sketch-pick');
  };
  const pickSketchFace = (info) => {
    if (!info.planar)
      throw new Error('Pick a flat face. Curved faces cannot hold a sketch; pick an origin plane instead.');
    if (!runtime.ready) throw new Error('Wait for the model to rebuild first.');
    beginSketch({
      frame: info.frame,
      support: { type: 'face', instanceId: info.instanceId, partId: info.partId },
      boundary: info.outline,
    });
  };
  // An origin plane tile, its label, or the panel's Start sketch.
  const pickSketchPlane = (plane, offset = 0, { returnTo = null } = {}) => {
    const amount = Number(offset) || 0;
    beginSketch({
      frame: planeFrame(plane, amount),
      support: { type: 'plane', plane, offset: amount },
      returnTo,
    });
  };
  // `returnTo` (docs/sketch-studio-outline-edit-sheet-nest.md §3.3): where the
  // finish goes back to (returnFromSketch); a shop station is left first. With
  // none given, the outline of a sheet-metal part goes back to that part with
  // its feature open (the Tree's ↳ Edit sketch, the sketch's own panel), and
  // any other sketch to the Sketch tab's "… updated" panel.
  const editSketch = (id, { returnTo } = {}) => {
    const target = model.sketches.find((s) => s.id === id);
    if (!target) throw new Error('The sketch no longer exists.');
    const problem = sketchEditProblem(target);
    if (problem) throw new Error(problem);
    const consumer = sketchConsumer(model, id);
    if (consumer?.instance && !runtime.ready)
      throw new Error('Wait for the model to rebuild before editing this sketch.');
    const { frame } = sketchWorldFrame(model, runtime.snapshot, target);
    const back =
      returnTo !== undefined
        ? returnTo
        : consumer?.instance && consumer.feature.type === 'sheetmetal'
          ? { panel: 'part', instanceId: consumer.instance.id, featureId: consumer.feature.id }
          : null;
    if (back) leaveStations();
    beginSketch({
      frame,
      support: target.support,
      sketch: target,
      entities: editableEntities(target),
      // Kept as stored, even when the entities are rebuilt from an edited profile.
      dimensions: target.dimensions || [],
      returnTo: back,
    });
  };
  // Edit outline from a shop station or the sheet-metal form (§3.6): the blank's sketch, back there on finishing.
  const editOutline = (sketchId, returnTo) => {
    setOutlineNotice(null);
    editSketch(sketchId, { returnTo });
  };
  // Why a cut part's outline cannot be reopened now ('' when it can): the
  // sketcher draws it where the part stands, so the kernel must be current.
  const outlineEditProblem = (instanceId) => {
    const blank = sheetPartOf(model, instanceId)?.sketch;
    if (!blank) return 'The blank sketch is gone.';
    return (
      sketchEditProblem(blank) || (runtime.ready ? '' : 'Wait for the model to rebuild before editing the outline.')
    );
  };
  const editLaserOutline = (instanceId) => {
    const blank = sheetPartOf(model, instanceId)?.sketch;
    if (!blank) throw new Error('The blank sketch is gone.');
    const job = shopSession?.station === 'laser' ? shopSession.instanceIds || null : null;
    editOutline(blank.id, { panel: 'shop-laser', instanceId, ...(job ? { instanceIds: job } : {}) });
  };
  // Draw → Delete: the outline goes in one commit (Undo brings it back).
  const deleteOutline = (sketchId) => {
    if (sketchConsumer(model, sketchId)) throw new Error('A part is cut from this outline: delete the part first.');
    commit({ ...model, sketches: model.sketches.filter((s) => s.id !== sketchId) });
    if (drawnSketch === sketchId) setDrawnSketch(null);
  };
  const finishSketch = (entities, dimensions = []) =>
    perform(() => {
      const session = sketchSession;
      if (!entities.length) {
        cancelSketch();
        return;
      }
      const existing = session.sketchId ? model.sketches.find((s) => s.id === session.sketchId) : null;
      if (session.sketchId && !existing) throw new Error('This sketch was removed. Cancel the sketch.');
      const back = session.returnTo || null;
      // Finished for the shop, every separate outline is its own blank (§3.4);
      // the Sketch tab keeps one outline per sketch and says so.
      const created = back
        ? outlineSketches({
            session,
            entities,
            existing,
            name: session.name,
            taken: model.sketches.map((s) => s.name),
            dimensions,
          })
        : { ...sketchFromSession({ session, entities, existing, name: session.name, dimensions }), extras: [] };
      const params = sheetParameters || {};
      // The guard (§3.6): an outline sheet-metal parts are cut from must still
      // fold for each of them, or nothing is committed and the sketcher stays.
      const refusal = existing ? outlineEditRefusal(model, existing.id, created.sketch.profile, params) : '';
      if (refusal) {
        setSketchSession((s) => (s?.key === session.key ? { ...s, refusal: { message: refusal, entities } } : s));
        throw new Error(refusal);
      }
      const next = commit({
        ...model,
        sketches: [
          ...(existing
            ? model.sketches.map((s) => (s.id === created.sketch.id ? created.sketch : s))
            : [...model.sketches, created.sketch]),
          ...created.extras,
        ],
      });
      exitSketch();
      setSketchId(created.sketch.id);
      // Back where it was started: Draw with this outline chosen, Cut from
      // sheet, the laser or the part (§3.3) — never the "Make it solid" panel.
      if (back) {
        const split = created.extras.length
          ? `${created.sketch.name} held ${created.extras.length + 1} separate outlines: each is its own blank.`
          : '';
        setOutlineNotice(split ? { text: split, model: next } : null);
        const ready = readyOutlines(next, params).some((o) => o.id === created.sketch.id);
        let notice = '';
        if (back.panel === 'shop-laser') {
          const flat = foldOf(next, back.instanceId, params)?.flat;
          notice = [flat ? `Outline updated: blank ${fmtMm(flat.width)} × ${fmtMm(flat.height)} mm.` : '', split]
            .filter(Boolean)
            .join(' ');
        }
        returnFromSketch(back, { sketchId: created.sketch.id, ready, notice });
        return;
      }
      setFinishedSketch({
        sketchId: created.sketch.id,
        problems: created.problems,
        closed: created.closed,
        edited: Boolean(existing),
      });
      setPanel('sketch-finished');
    });
  const openSketchDraft = (sketchId, settings, ids, base, previous) => {
    const draft = sketchOperationDraft({ model: base, snapshot: runtime.snapshot, sketchId, settings, ids });
    setOperationDraft({ ...draft, ...previous, placement: sketchFlowPlacement(draft) });
    setMeasureSession(null);
    setShowOperationPreview(true);
    setSelectedId(draft.newInstance?.id || settings.target);
    setMoveMode(false);
    setExploded(false);
    setSection(false);
    setPropertiesOpen(true);
    setPanel('operation');
  };
  const startSketchOperation = (sketchId, mode) => {
    if (!runtime.ready) throw new Error('Wait for the model to rebuild first.');
    const target = model.sketches.find((s) => s.id === sketchId);
    const settings = defaultSketchSettings({ model, snapshot: runtime.snapshot, sketch: target, mode, selectedId });
    if (settings.target === 'new' && mode === 'cut') throw new Error('Add a part to cut first.');
    openSketchDraft(sketchId, settings, {}, model, { previousSelection: selectedId, previousIsolation: isolated });
  };
  const changeSketchOperation = (settings) =>
    performField(() =>
      openSketchDraft(
        operationDraft.sketchFlow.sketchId,
        settings,
        operationDraft.sketchFlow.ids,
        operationDraft.baseModel,
        {
          previousSelection: operationDraft.previousSelection,
          previousIsolation: operationDraft.previousIsolation,
        },
      ),
    );
  const startMate = () => {
    if (model.instances.length < 2) throw new Error('Add at least two parts to mate.');
    if (!runtime.ready) throw new Error('Wait for the model to rebuild first.');
    resetModesForSketch();
    setSketchSession(null);
    // Always a fresh session (the ribbon is off while one runs).
    setMateSession({ stage: MATE.next(MATE.initial, 'START') });
    setPanel('mate');
  };
  const pickMateFace = (info) => {
    if (!info.planar) throw new Error('Pick a flat face. Curved faces cannot be mated yet.');
    if (!runtime.ready) throw new Error('Wait for the model to rebuild first.');
    if (mateSession.stage === 'moving') {
      // The first pick takes its top node (§3.3, §3.6): a group mates as one
      // body, its rigid movers from their poses before the mate.
      const context = openGroup && contains(model, openGroup, info.instanceId) ? openGroup : null;
      const node = topNode(model, info.instanceId, context);
      if (isGroupId(model, node)) {
        const members = memberIds(model, [node]);
        const anchor = anchoring(model, members);
        if (anchor) throw new Error(anchoredMessage(model, anchor));
        const movers = rigidMovers(model, members);
        const bounds = viewport.current.getBounds(members);
        if (!bounds) throw new Error('Pick a face of a visible part.');
        setSelection([node]);
        setOpenGroupId(context);
        setMateSession({
          stage: MATE.next(mateSession.stage, 'PICK'),
          instanceId: info.instanceId,
          nodeId: node,
          members,
          movers,
          moving: { point: info.point, normal: info.normal },
          bases: Object.fromEntries(
            movers.map((id) => {
              const mover = model.instances.find((i) => i.id === id);
              return [
                id,
                { position: [...(mover.position || [0, 0, 0])], rotation: [...(mover.rotation || [0, 0, 0])] },
              ];
            }),
          ),
          center: boxCentre(bounds),
          offset: 0,
        });
        return;
      }
      if (model.connections.some((c) => c.from === info.instanceId && c.type !== 'weld'))
        throw new Error('This part is attached to another one. Edit Connections / welds to move it.');
      const moving = model.instances.find((i) => i.id === info.instanceId);
      const bounds = viewport.current.getInstanceBounds(info.instanceId);
      if (!moving || !bounds) throw new Error('Pick a face of a visible part.');
      setSelectedId(moving.id);
      setMateSession({
        stage: MATE.next(mateSession.stage, 'PICK'),
        instanceId: moving.id,
        moving: { point: info.point, normal: info.normal },
        base: { position: [...(moving.position || [0, 0, 0])], rotation: [...(moving.rotation || [0, 0, 0])] },
        center: bounds[0].map((v, i) => (v + bounds[1][i]) / 2),
        offset: 0,
      });
      return;
    }
    if (mateSession.members?.includes(info.instanceId)) throw new Error(GROUP_COPY.outside);
    if (info.instanceId === mateSession.instanceId) throw new Error('Pick a face on a different part.');
    const next = {
      ...mateSession,
      stage: MATE.next(mateSession.stage, 'PICK'),
      target: { point: info.point, normal: info.normal },
    };
    commit(mateMove(model, next, runtime.snapshot.parameters));
    setMateSession(next);
  };
  const changeMateOffset = (offset) =>
    performField(() => {
      const value = numeric(offset, runtime.snapshot?.parameters || {}, 'Offset');
      const next = { ...mateSession, offset: value };
      commit(mateMove(model, next, runtime.snapshot?.parameters || {}));
      setMateSession(next);
    });
  const finishMate = () => {
    const id = mateSession?.nodeId || mateSession?.instanceId;
    setMateSession(null);
    select(id || null);
    setGizmo('translate');
    setMoveMode(true);
  };
  // Measure: two clicks on the model leave a dimension mark (model.marks).
  const startMeasure = () => {
    if (!model.instances.length) throw new Error('Add a part first.');
    if (!runtime.ready) throw new Error('Wait for the model to rebuild first.');
    resetModesForSketch();
    setSketchSession(null);
    setMateSession(null);
    setMeasureSession({});
    setPanel('marks');
  };
  const endMeasure = () => setMeasureSession(null);
  const addMark = ({ from, to, fromWorld, toWorld }) =>
    perform(() => {
      const id = uid('mark');
      const offset = markOffset({
        from,
        to,
        A: fromWorld,
        B: toWorld,
        along: 'aligned',
        poses: viewport.current.getGroupPoses(),
        span: viewport.current.getSceneSpan(),
      });
      commit({ ...model, marks: [...marks, { id, from, to, along: 'aligned', offset }] });
      setSelectedMarkId(id);
    });
  // A new reading stands the dimension line off square to its new direction.
  const changeMarkAlong = (mark, along) =>
    perform(() => {
      const poses = viewport.current.getGroupPoses();
      const A = anchorWorld(mark.from, poses),
        B = anchorWorld(mark.to, poses);
      const offset =
        A && B
          ? markOffset({ from: mark.from, to: mark.to, A, B, along, poses, span: viewport.current.getSceneSpan() })
          : mark.offset;
      commit({ ...model, marks: marks.map((m) => (m.id === mark.id ? { ...m, along, offset } : m)) });
      setSelectedMarkId(mark.id);
    });
  const deleteMark = (id) => {
    commit({ ...model, marks: marks.filter((m) => m.id !== id) });
    if (selectedMarkId === id) setSelectedMarkId(null);
    if (markParameter?.id === id) setMarkParameter(null);
  };
  // mark1, mark2, … : the first name no parameter uses yet.
  const freeMarkName = () => {
    let n = 1;
    while (model.parameters.some((p) => p.name === `mark${n}`)) n++;
    return `mark${n}`;
  };
  const saveMarkParameter = (value) =>
    perform(() => {
      const name = markParameter.name.trim();
      const merged = mergeParameters(model.parameters, [{ name, value: Math.round(value * 1000) / 1000 }], () =>
        uid('parameter'),
      );
      commit({ ...model, parameters: merged.parameters });
      setMarkParameter(null);
    });
  const cancelMate = () => {
    if (mateSession?.stage === 'placed')
      commit({
        ...model,
        instances: model.instances.map((i) =>
          mateSession.bases
            ? mateSession.bases[i.id]
              ? { ...i, ...mateSession.bases[i.id] }
              : i
            : i.id === mateSession.instanceId
              ? { ...i, ...mateSession.base }
              : i,
        ),
      });
    setMateSession(null);
    setPanel(null);
  };
  // A station's part, named explicitly (docs/sketch-studio-shop-floor.md §4.3:
  // the route opens a station on a part that is not the render's selection,
  // and select() would close every station): the instance's sheet-metal
  // feature and its blank, or a refusal for the openers to throw.
  const sheetBlankProblem = (instanceId) => {
    const sheet = sheetPartOf(model, instanceId);
    if (!sheet) return 'Select a sheet-metal part first (Shop → Cut from sheet makes one).';
    if (!sheetParameters) return 'Fix the named parameters first: the blank cannot be read.';
    const problem = foldProblem(sheet.feature, sheet.sketch?.profile, sheetParameters);
    return problem ? `Fix the sheet-metal part first: ${problem}` : '';
  };
  // Shop → Press brake (docs/sketch-studio-fab-shop.md §9 SM-2) on the selected
  // sheet-metal part, or the route's (`instanceId`). A painted or printed part
  // is refused (the shop order: cut → bend → paint → print) with a one-click
  // remedy.
  // `carry` (docs/sketch-studio-outline-edit-sheet-nest.md §7.3): the tooling
  // still in the machine when the brake moves to another part without being
  // left (brakeStation.js brakeCarry). A part the shop order keeps off the
  // brake holds it on its card (`brakeBlocked.carry`), so the next part still
  // gets it; every way out of the station drops it with that card.
  const openPressBrake = (instanceId = selectedId, { carry = null } = {}) => {
    const refusal = sheetBlankProblem(instanceId);
    if (refusal) throw new Error(refusal);
    const partId = sheetPartOf(model, instanceId).part.id;
    setPanel('press-brake');
    setPropertiesOpen(true);
    setBrakeProblem('');
    if (shopOrderBlock(model, partId)) {
      setBrakeBlocked({ partId, instanceId, carry });
      return;
    }
    startPressBrake(instanceId, carry);
  };
  const startPressBrake = (
    instanceId = brakeBlocked?.instanceId || selectedId,
    carry = brakeBlocked?.carry || null,
  ) => {
    setBrakeBlocked(null);
    setBrakePicker(null);
    setHoleMode(null);
    setMeasureSession(null);
    setMoveMode(false);
    setExploded(false);
    setSection(false);
    setSheetFlat(null);
    setBrakeSession({
      ...brakeSessionDefaults(),
      ...(carry || {}),
      stage: BRAKE.next(BRAKE.initial, 'START'),
      key: uid('brake'),
      instanceId,
    });
  };
  // The refusal's remedy: the finish and prints go (one commit), then the station opens.
  const clearShopOrder = () => {
    const block = brakeBlocked && shopOrderBlock(model, brakeBlocked.partId);
    if (block) commit(block.model);
    startPressBrake(brakeBlocked?.instanceId || selectedId, brakeBlocked?.carry || null);
  };
  const leavePressBrake = () => {
    setBrakeSession(null);
    setBrakePicker(null);
    setBrakeFocus(null);
    setBrakeBlocked(null);
    setBrakeProblem('');
    setPanel(null);
  };
  // The operator's picks: session state only (a new pick drops a scrub and the last refusal).
  // A new line (edge, distance, points, mode) puts every segment back in the hit (§6.2) and
  // starts the right way round (Turn sheet around, docs/sketch-studio-brake-flip-tooling.md §5.2)
  // with the punch and die fitted to it (docs/sketch-studio-brake-tool-length.md §3.1).
  const changeBrake = (patch) => {
    setBrakeProblem('');
    // The one rule (brakeStation.js brakePatch): the collision card's trial and the grip's outcomes apply it too.
    // The station lets a line arriving on a made bend's line set the angle on (tight bends §4.4).
    const station = brake && !brake.error && !brake.closed ? brake : null;
    setBrakeSession((s) => (s && s.stage === 'setup' ? brakePatch(s, patch, station) : s));
  };
  // Hands on the sheet (docs/sketch-studio-brake-hands-on.md §5.1, §5.2):
  // Flip over / Turn around in the view toolbar, the grip's handles and F / T
  // make exactly the panel's patches (brakeHands.js brakeActPatch).
  const brakeAct = (kind) => {
    if (brakeSession?.stage !== 'setup' || !brake || brake.error) return;
    const patch = brakeActPatch(kind, brake, brakeSession);
    if (patch) changeBrake(patch);
  };
  // Hands on the sheet HO-2 (§6.1, §6.2): an edge clicked on the sheet and
  // the backgauge fingers dragged go through the flat-blank card's own paths
  // (these two are its onPickEdge and onDistance). A finger drag keeps the
  // line as it was when it started, for Esc (brakeHands.js fingerRestore).
  const pickBrakeEdge = (edge) => changeBrake({ mode: 'gauge', edge, scrub: null });
  const brakeDistance = (distance) => changeBrake({ distance, scrub: null });
  const fingersFrom = useRef(null);
  const brakeFingers = ({ start = false, distance = null, cancel = false, end = false }) => {
    if (start) fingersFrom.current = brakeSession ? fingerRestore(brakeSession) : null;
    else if (distance != null) brakeDistance(distance);
    else if (cancel && fingersFrom.current) changeBrake(fingersFrom.current);
    if (cancel || end) fingersFrom.current = null;
  };
  // The fingers or a blade clicked on the sheet (§6.2, §6.3): the panel opens
  // if closed and its L field, or that blade's picker (open), takes focus.
  const [brakePicker, setBrakePicker] = useState(null);
  const [brakeFocus, setBrakeFocus] = useState(null);
  const focusBrake = (target) => {
    // Only what the sheet offers: while it is being set up (no stroke, no scrub).
    if (!brakeSettled) return;
    setPanel('press-brake');
    setPropertiesOpen(true);
    if (target === 'punch' || target === 'die') setBrakePicker(target);
    setBrakeFocus({ target, token: uid('focus') });
  };
  const changeBrakeMachine = (key) =>
    commit({ ...model, fabrication: { ...model.fabrication, shop: { ...model.fabrication.shop, machine: key } } });
  // The pedal: refused (and said why) unless the hit passes every check.
  const pressPedal = () => {
    if (!brakeSession || brakeSession.stage !== 'setup' || !brake || brake.error) return;
    // A refusal is said with its advice, worked out now if it has not settled yet.
    let station = brake;
    if (station === brakeFacts && needsAdvice(brakeFacts)) {
      station = brakeStation({ model, session: brakeSession, params: sheetParameters });
      setBrakeAdvice({ session: brakeSession, model, params: sheetParameters, station });
    }
    const { pending } = station;
    const refusal = !pending
      ? 'Pick the gauge edge on the sheet or on the flat blank first, or two points for the punch line.'
      : pending.error || pending.refusals[0]?.message || pending.collision?.hit?.message || '';
    if (refusal) {
      setBrakeProblem(refusal);
      return;
    }
    const stroke = startStroke({
      station,
      token: uid('stroke'),
      newId: () => uid('bend'),
      strokeId: uid('stroke'),
      params: sheetParameters,
    });
    setBrakeProblem('');
    setBrakeSession({
      ...brakeSession,
      stage: BRAKE.next(brakeSession.stage, 'STROKE'),
      scrub: null,
      stroke: { ...stroke, model },
    });
  };
  // A stroke has run (the viewport reports its token): commit the bend as one
  // ordinary model commit, unless the model moved under the stroke; a re-run
  // only showed it. Back to setup for the next hit either way.
  const brakeStrokeEnd = (token) => {
    const session = brakeSession;
    if (!session?.stroke || session.stroke.run.token !== token) return;
    const { stroke } = session;
    const next = { ...session, stage: BRAKE.next(session.stage, 'DONE'), stroke: null };
    if (stroke.run.commit) {
      if (latestModel.current !== stroke.model || !brake?.feature) {
        setBrakeProblem('The model changed during the stroke: this hit was not saved.');
        setBrakeSession(next);
        return;
      }
      // An armed try (docs/sketch-studio-tight-bends.md §5.2) commits its records at their
      // place, or with a step opened part-way and its bend-on entry: still one commit, one Undo.
      const feature = {
        ...brake.feature,
        bends: stroke.placed || [...(brake.feature.bends || []), ...stroke.bends],
      };
      commit({
        ...model,
        parts: model.parts.map((p) =>
          p.id === brake.part.id ? { ...p, features: p.features.map((f) => (f.id === feature.id ? feature : f)) } : p,
        ),
      });
      Object.assign(next, {
        lastHit: { bendId: stroke.bend.id, gaugePoint: stroke.gaugePoint, punch: stroke.bend.punch },
        edge: null,
        points: [],
        // The angle the hit was made at is the operator's now (tight bends §4.4: brakePatch `arrived`).
        ...(next.arrived ? { arrived: null } : {}),
        // The try is spent (§5.2); a step opened part-way says where it is finished.
        armed: null,
        notice: stroke.notice || null,
      });
    }
    setBrakeSession(next);
  };
  // The sequence (§9 SM-2 item 8): a new order is re-checked step by step and
  // refused if it makes more steps fail than the order it replaces.
  const changeBrakeBends = (bends, verb) => {
    const feature = { ...brake.feature, bends };
    const problem = foldProblem(feature, brake.profile, sheetParameters);
    if (problem) throw new Error(problem);
    const checks = sequenceChecks({ fold: foldSheet(feature, brake.profile, sheetParameters), machine: brake.machine });
    if (failingSteps(checks) > failingSteps(brakeChecks)) {
      const step = checks.find((c) => c.refusals.length || c.collision);
      throw new Error(
        `${verb} refused: step ${step.index + 1} could not be made then. ${step.collision?.message || step.refusals[0].message}`,
      );
    }
    commit({
      ...model,
      parts: model.parts.map((p) =>
        p.id === brake.part.id ? { ...p, features: p.features.map((f) => (f.id === feature.id ? feature : f)) } : p,
      ),
    });
    setBrakeSession((s) => ({
      ...s,
      scrub: null,
      lastHit: s.lastHit && bends.some((b) => b.id === s.lastHit.bendId) ? s.lastHit : null,
      // A new order is another part to find the way on (tight bends §5.2).
      armed: null,
      notice: null,
    }));
  };
  // Earlier / Later / Remove move a whole step (shop floor §6.1): a stroke, or a
  // bend-on hit (docs/sketch-studio-tight-bends.md §4.4), keyed by its first record.
  const moveBrakeStep = (key, step) => {
    const bends = brake.feature.bends;
    const steps = hitSequence(brake.fold);
    const at = steps.findIndex((s) => s.recordIds.includes(key));
    const other = steps[at + step];
    if (at < 0 || !other) return;
    const order = steps.map((s) => s.recordIds);
    [order[at], order[at + step]] = [order[at + step], order[at]];
    changeBrakeBends(
      order.flat().map((id) => bends.find((b) => b.id === id)),
      'That order is',
    );
  };
  // Removing a bend's first step takes its bend-on hits with it; a bend-on step goes alone (§4.4).
  const removeBrakeStep = (key) => {
    const stroke = stepOf(brake.fold, key);
    const gone = new Set(stroke?.recordIds || [key]);
    const made = stroke && !stroke.again ? new Set(stroke.bendIds) : new Set();
    changeBrakeBends(
      brake.feature.bends.filter((b) => !gone.has(b.id) && !(isBendOn(b) && made.has(b.again))),
      'Removing it is',
    );
  };
  // Bend on (§4.4): the punch line set on that step's bends, as a pick.
  const bendOnBrakeStep = (key) => {
    if (brakeSession?.stage !== 'setup' || !brake || brake.error) return;
    const patch = bendOnPatch(brake, key);
    if (patch) changeBrake(patch);
    else setBrakeProblem('No straight line finds that bend on the flat blank: set the punch line with two points.');
  };
  const scrubBrakeStep = (bendId, after) =>
    changeBrake({
      scrub: brakeSession.scrub?.bendId === bendId && brakeSession.scrub.after === after ? null : { bendId, after },
    });
  const rerunBrakeStep = (bendId) => {
    if (brakeSession?.stage !== 'setup') return;
    setBrakeProblem('');
    setBrakeSession({
      ...brakeSession,
      stage: BRAKE.next(brakeSession.stage, 'STROKE'),
      scrub: null,
      stroke: rerunStroke({ station: brake, token: uid('stroke'), bendId }),
    });
  };
  // ---------------------------------------------------------------- paint, print (SM-3)
  // The stations share `shopSession` (PAINT and PRINT in toolSession.js).
  // Their picks are session state; Paint, Strip paint, a placed print and its
  // fields are ordinary model commits, every one kernel-inert (model.js
  // sameKernelInput): none of them rebuilds a solid. `needsKernel`: paint and
  // print pick on the kernel's meshes; the laser works from the blank alone,
  // so it opens while the solid rebuilds.
  const openShopStation = (station, fields, { keepSelection = false, needsKernel = true } = {}) => {
    if (!model.instances.length) throw new Error('Add a part first (Shop → Cut from sheet makes one).');
    if (needsKernel && !runtime.ready) throw new Error('Wait for the model to rebuild first.');
    setHoleMode(null);
    setMeasureSession(null);
    setMoveMode(false);
    setExploded(false);
    setSheetFlat(null);
    setShopProblem('');
    setShopNotice('');
    // The parts keep their own colours while a station is open (the selection
    // blue would hide the paint); the selection's own setters, so nothing else
    // resets. The laser's bed covers the view, so it keeps its part selected.
    if (!keepSelection) {
      setSelection([]);
      setOpenGroupId(null);
    }
    setPanel(`shop-${station}`);
    setPropertiesOpen(true);
    setShopSession({ station, key: uid('shop'), ...fields });
  };
  // A selected part or group is what the booth paints (or the route's
  // `targets`); else the first click picks it.
  const startPaint = (chosen = selectionMembers) => {
    const targets = (Array.isArray(chosen) ? chosen : selectionMembers).filter((id) =>
      model.instances.some((i) => i.id === id),
    );
    openShopStation('paint', {
      stage: PAINT.next(PAINT.initial, targets.length ? 'TARGET' : 'START'),
      targets,
      finish: finishDraft((model.finishes || []).find((f) => targets.includes(f.instanceId))),
      pending: null,
    });
  };
  const startPrint = () =>
    openShopStation('print', {
      stage: PRINT.next(PRINT.initial, 'START'),
      printId: null,
      draft: { ...PRINT_DEFAULTS },
      imageInfo: null,
    });
  // Shop → Laser (§9 SM-4) on the selected sheet-metal part: its blank on
  // the stock sheet. The sheet choice and the etched marks are model commits;
  // the quantity, the bed's view and a cut in progress are the session's.
  // `instanceId`: the route's part; `autoCut` (Cut on the laser, §4.5): the
  // cut starts at once unless the blank has a refusal (then the station says why).
  // SN-1 (docs/sketch-studio-outline-edit-sheet-nest.md §4.2): the session's
  // `instanceIds` is the job when it names one (a batch; null: every instance
  // of the part), `sheetIndex` the sheet shown (null: the one holding the
  // part), `view` null until the user chooses (LaserStation.jsx laserAutoView).
  const openLaser = (instanceId = selectedId, { autoCut = false, instanceIds = null } = {}) => {
    const refusal = sheetBlankProblem(instanceId);
    if (refusal) throw new Error(refusal);
    const ready = LASER.next(LASER.initial, 'START');
    let cutting = false;
    if (autoCut) {
      const station = laserStation({ model, session: { instanceId, instanceIds }, params: sheetParameters });
      cutting = !station.error && !station.closed && !station.refusals.length && station.blanks.length > 0;
    }
    setCopiesNote(null);
    openShopStation(
      'laser',
      {
        stage: cutting ? LASER.next(ready, 'CUT') : ready,
        instanceId,
        instanceIds,
        sheetIndex: null,
        view: null,
        run: cutting ? { token: uid('cut') } : null,
        cut: false,
        runKey: cutting ? 1 : 0,
      },
      { keepSelection: true, needsKernel: false },
    );
  };
  // Cut: refused (and said why) while a blank of the job has a refusal, or the
  // sheet shown holds none of it; else the bed animates the job's blanks there.
  const laserCut = () => {
    const s = shopSession;
    if (s?.station !== 'laser' || s.stage !== 'sheet' || !laserView) return;
    const refusal = laserView.refusals[0]?.message || (laserView.blanks.length ? '' : NONE_ON_SHEET);
    if (refusal) return setShopProblem(refusal);
    setShopProblem('');
    setShopNotice('');
    setShopSession({
      ...s,
      stage: LASER.next(s.stage, 'CUT'),
      run: { token: uid('cut') },
      cut: false,
      runKey: (s.runKey || 0) + 1,
    });
  };
  // The bed reports the cut's token at its end; a stale token (a stop, a new cut) is ignored.
  const laserCutEnd = (token) => {
    setShopSession((s) =>
      s?.station === 'laser' && s.run?.token === token
        ? { ...s, stage: LASER.next(s.stage, 'DONE'), run: null, cut: true }
        : s,
    );
    const view = laserView;
    if (!view) return;
    const blanks = view.blanks.length;
    // The job's blanks on other sheets (§4.3): one cut is one sheet.
    const more = view.elsewhere.reduce((sum, s) => sum + s.count, 0);
    const where = view.elsewhere.map((s) => s.index + 1);
    setShopNotice(
      `Cut ${blanks} blank${blanks === 1 ? '' : 's'} on the ${view.sheet.name} sheet: ${fmtMm(view.timeline.total)} s of machine time.${
        more
          ? ` ${more} more on sheet${where.length > 1 ? 's' : ''} ${where.length > 1 ? `${where.slice(0, -1).join(', ')} and ${where.at(-1)}` : where[0]}: switch the sheet and cut again.`
          : ''
      }`,
    );
  };
  // Quantity (SN-1 §4.3): the lead part's instances in the model, one commit.
  // More: new copies of the part in rows beside the station's instance, clear
  // of everything standing (shopParts.js copyPositions; its built bounds from
  // the snapshot, else its blank's), joining a named job. Fewer: the newest
  // copies go (removeInstance), never the station's own instance nor a copy
  // that is painted, printed or grouped — those that cannot go are said so.
  // The kernel builds the part once whatever the copies (kernel.js `build`
  // is per part; each instance is placed and meshed).
  const changeLaserQuantity = (wanted) => {
    const s = shopSession;
    const view = laserView;
    if (s?.station !== 'laser' || s.stage === 'cutting' || !view) return;
    const n = Math.max(1, Math.min(MAX_LASER_QUANTITY, Math.round(Number(wanted)) || 1));
    const lead = view.instance;
    const mine = model.instances.filter((i) => i.partId === lead.partId);
    setCopiesNote(null);
    if (n === mine.length) return;
    if (n > mine.length) {
      const boxOf = (id) => runtime.snapshot?.instances.find((i) => i.id === id)?.bounds || null;
      const built = boxOf(lead.id);
      const position = lead.position || [0, 0, 0];
      const [[bx0, by0], [bx1, by1]] = view.flat.bounds;
      const box = built
        ? [
            [built[0][0], built[0][1]],
            [built[1][0], built[1][1]],
          ]
        : [
            [position[0] + bx0, position[1] + by0],
            [position[0] + bx1, position[1] + by1],
          ];
      // What already stands: built boxes, else (a copy not built yet) the lead's box where that copy is.
      const taken = model.instances.flatMap((i) => {
        const b = boxOf(i.id);
        if (b)
          return [
            [
              [b[0][0], b[0][1]],
              [b[1][0], b[1][1]],
            ],
          ];
        if (i.partId !== lead.partId) return [];
        const [dx, dy] = [0, 1].map((k) => (i.position?.[k] || 0) - position[k]);
        return [
          [
            [box[0][0] + dx, box[0][1] + dy],
            [box[1][0] + dx, box[1][1] + dy],
          ],
        ];
      });
      const copies = copyPositions({ position, box, count: n - mine.length, taken }).map((at) => ({
        id: uid('instance'),
        partId: lead.partId,
        name: '',
        position: at,
        rotation: [...(lead.rotation || [0, 0, 0])],
        visible: true,
      }));
      const next = commit({ ...model, instances: [...model.instances, ...copies] });
      setShopSession((cur) =>
        cur?.station === 'laser' && cur.key === s.key
          ? {
              ...cur,
              cut: false,
              ...(Array.isArray(cur.instanceIds)
                ? {
                    instanceIds: [...cur.instanceIds, ...copies.map((c) => c.id)],
                    fresh: [...(cur.fresh || []), ...copies.map((c) => c.id)],
                  }
                : {}),
            }
          : cur,
      );
      return next;
    }
    // Fewer: the newest first; the station's own instance and a copy with something of its own stay.
    const owned = (id) =>
      (model.finishes || []).some((f) => f.instanceId === id) ||
      (model.prints || []).some((p) => p.instanceId === id) ||
      Boolean(model.instances.find((i) => i.id === id)?.groupId);
    const asked = mine.length - n;
    const going = [...mine]
      .reverse()
      .filter((i) => i.id !== lead.id && !owned(i.id))
      .slice(0, asked);
    let next = model;
    for (const i of going) next = removeInstance(next, i.id);
    if (going.length) next = commit(next);
    setShopSession((cur) => (cur?.station === 'laser' && cur.key === s.key ? { ...cur, cut: false } : cur));
    const kept = asked - going.length;
    if (kept)
      setCopiesNote({
        text:
          kept === 1
            ? '1 copy is painted, printed or grouped: delete it in the view if you mean to.'
            : `${kept} copies are painted, printed or grouped: delete them in the view if you mean to.`,
        model: next,
      });
    return next;
  };
  // This cut (§4.4): a row makes that part the lead; the job, the sheet shown and a finished cut stay.
  const leadLaser = (instanceId) =>
    setShopSession((s) =>
      s?.station === 'laser' && s.stage !== 'cutting'
        ? { ...s, instanceId, sheetIndex: laserView?.sheetIndex ?? s.sheetIndex }
        : s,
    );
  const laserStop = () =>
    setShopSession((s) =>
      s?.station === 'laser' && s.stage === 'cutting'
        ? { ...s, stage: LASER.next(s.stage, 'STOP'), run: null, cut: false, runKey: (s.runKey || 0) + 1 }
        : s,
    );
  const changeLaserSheet = (key) =>
    commit({ ...model, fabrication: { ...model.fabrication, shop: { ...model.fabrication.shop, sheet: key } } });
  // Etch bend lines: the bends' punch lines become the blank's marks (one
  // commit; the solid is rebuilt once, unchanged: the kernel ignores marks).
  const changeLaserMarks = (marks) => {
    const view = laserView;
    if (!view || shopSession?.stage === 'cutting') return;
    commit({
      ...model,
      parts: model.parts.map((p) =>
        p.id === view.part.id
          ? { ...p, features: p.features.map((f) => (f.id === view.feature.id ? { ...f, marks } : f)) }
          : p,
      ),
    });
    setShopNotice(
      marks.length ? `Etched ${marks.length} bend line${marks.length === 1 ? '' : 's'}.` : 'Marks cleared.',
    );
  };
  const leaveShopStation = () => {
    setShopSession(null);
    setShopProblem('');
    setShopNotice('');
    setPanel(null);
  };
  const changeShop = (patch) => {
    setShopProblem('');
    setShopSession((s) => (s ? { ...s, ...patch } : s));
  };
  // Esc: one step back, then out.
  const stepBackShop = () => {
    const s = shopSession;
    if (!s) return;
    // The replay (§8): Esc ends it, back to what was on show.
    if (s.station === 'film') return endFilm();
    setShopProblem('');
    if (s.station === 'paint') {
      if (s.stage === 'pick') return leaveShopStation();
      const stage = PAINT.next(s.stage, 'BACK');
      return setShopSession({ ...s, stage, pending: null, targets: stage === 'pick' ? [] : s.targets });
    }
    // The laser: Esc stops a cut, then leaves.
    if (s.station === 'laser') return s.stage === 'cutting' ? laserStop() : leaveShopStation();
    if (s.stage === 'face') return leaveShopStation();
    setShopSession({ ...s, stage: PRINT.next(s.stage, 'NEW'), printId: null });
  };
  // A viewport pick for the open station (CadViewport onShopPick).
  const pickShop = (info) => {
    const s = shopSession;
    if (!s) return;
    setShopNotice('');
    if (s.station === 'paint') {
      if (info.kind !== 'part' || s.stage === 'confirm') return;
      const existing = (model.finishes || []).find((f) => f.instanceId === info.instanceId);
      return changeShop({
        stage: PAINT.next(s.stage, 'PICK'),
        targets: [info.instanceId],
        finish: existing ? finishDraft(existing) : s.finish,
        pending: null,
      });
    }
    if (info.kind === 'print') return changeShop({ stage: PRINT.next(s.stage, 'SELECT'), printId: info.printId });
    if (info.kind !== 'face') return;
    const selected = s.stage === 'artwork' ? (model.prints || []).find((p) => p.id === s.printId) : null;
    const refusal = methodOnFace(selected ? selected.method : s.draft.method, info.planar);
    if (refusal) return setShopProblem(refusal);
    if (selected) {
      commit({
        ...model,
        prints: model.prints.map((p) =>
          p.id === selected.id
            ? {
                ...p,
                instanceId: info.instanceId,
                origin: info.local.point,
                normal: info.local.normal,
                x: info.local.x,
              }
            : p,
        ),
      });
      return changeShop({ stage: PRINT.next(s.stage, 'PICK') });
    }
    if (s.draft.kind === 'image' && !s.draft.image)
      return setShopProblem('Upload the image first, then click the face.');
    if (s.draft.kind === 'text' && !String(s.draft.text ?? '').trim())
      return setShopProblem('Type the text first, then click the face.');
    const print = createPrint({
      instanceId: info.instanceId,
      point: info.local.point,
      normal: info.local.normal,
      x: info.local.x,
      artwork: s.draft,
    });
    commit({ ...model, prints: [...(model.prints || []), print] });
    changeShop({ stage: PRINT.next(s.stage, 'PICK'), printId: print.id });
  };
  // Paint or strip; a target with prints asks first (they go on after paint).
  const runPaint = (action, confirmed = false) => {
    const s = shopSession;
    const targets = paintView?.targetIds || [];
    if (!targets.length) return;
    if (action === 'paint' && !(Number(s.finish.thickness) > 0))
      return setShopProblem('The film thickness must be greater than zero.');
    if (printsOn(model, targets).length && !confirmed)
      return changeShop({ stage: PAINT.next(s.stage, 'CONFIRM'), pending: action });
    commit(action === 'strip' ? stripFinish(model, targets) : applyFinish(model, targets, s.finish));
    const names = paintView.targets.map((t) => t.name).join(', ');
    setShopNotice(
      action === 'strip'
        ? `Stripped the paint from ${names}.`
        : `Painted ${names}: ${s.finish.name || s.finish.colour}.`,
    );
    setShopSession((cur) => ({ ...cur, stage: PAINT.next(cur.stage, 'APPLY'), pending: null }));
  };
  const selectedPrint = () =>
    shopSession?.station === 'print' && shopSession.stage === 'artwork'
      ? (model.prints || []).find((p) => p.id === shopSession.printId) || null
      : null;
  // A placed print's fields: one commit per change (a typing session is one undo step).
  const changePrint = (patch) =>
    performField(() => {
      const print = selectedPrint();
      if (!print) return;
      let next = { ...print, ...patch };
      if (patch.kind === 'image' && print.kind !== 'image') {
        if (!print.image) return setShopProblem('Upload an image for this print: it stays text until then.');
      }
      if (next.kind === 'image') {
        delete next.text;
        delete next.font;
      } else if (patch.kind === 'text' && print.kind !== 'text') {
        const { image: _image, ...rest } = next;
        next = {
          ...rest,
          text: PRINT_DEFAULTS.text,
          font: PRINT_DEFAULTS.font,
          colour: next.colour || PRINT_DEFAULTS.colour,
        };
      }
      commit({ ...model, prints: model.prints.map((p) => (p.id === print.id ? next : p)) });
    });
  const movePrint = (id, origin) => {
    commit({ ...model, prints: (model.prints || []).map((p) => (p.id === id ? { ...p, origin } : p)) });
    changeShop({ stage: PRINT.next(shopSession.stage, 'SELECT'), printId: id });
  };
  const removePrint = (id) => commit({ ...model, prints: (model.prints || []).filter((p) => p.id !== id) });
  // An uploaded image, fitted (≤ 1024 px, ≤ 512 KB): the draft's, or the selected print's.
  const uploadPrintImage = async (file) => {
    const fitted = await printImage(file);
    const aspect = fitted.height / fitted.width;
    const current = latestModel.current;
    const s = shopSession;
    const print = s?.stage === 'artwork' ? (current.prints || []).find((p) => p.id === s.printId) : null;
    if (print) {
      const { text: _text, font: _font, ...rest } = print;
      commit({
        ...current,
        prints: current.prints.map((p) =>
          p.id === print.id
            ? { ...rest, kind: 'image', image: fitted.dataUrl, height: Number((print.width * aspect).toFixed(2)) }
            : p,
        ),
      });
    }
    setShopSession((cur) =>
      cur?.station === 'print'
        ? {
            ...cur,
            imageInfo: { width: fitted.width, height: fitted.height },
            draft: print
              ? cur.draft
              : {
                  ...cur.draft,
                  kind: 'image',
                  image: fitted.dataUrl,
                  height: Number((cur.draft.width * aspect).toFixed(2)),
                },
          }
        : cur,
    );
  };
  // ---------------------------------------------------------------- putting parts together
  // Shop → More (docs/sketch-studio-shop-trim.md §4.3): Move part, Rotate
  // part, Mate faces and Group / Ungroup put the parts together (the Assemble
  // tab's own commands); a bought-in item lands where a new part lands (on
  // the ground under the view centre, the camera stays) and is selected.
  const addBoughtIn = (item) => {
    const at = viewport.current?.viewDropPoint?.() ?? [0, 0, 0];
    const { part: created, instance: placed } = boughtInItem(item, at);
    commit({ ...model, parts: [...model.parts, created], instances: [...model.instances, placed] });
    select(placed.id);
    setPlacedNote({
      text: `${created.name} is in the view. Move it into place, then group it with its product (More → Group).`,
      selectionKey: placed.id,
    });
  };
  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.value.trim();
    const target = model.instances.find((i) => i.id === renaming.id);
    const group = model.groups?.find((g) => g.id === renaming.id);
    setRenaming(null);
    if (name && group && group.name !== name) return perform(() => renameGroup(group.id, name));
    if (!name || !target) return;
    // Rename what the tree shows: the instance's own name, else its part.
    if (target.name) changeInstance({ ...target, name });
    else {
      const definition = model.parts.find((p) => p.id === target.partId);
      if (definition && definition.name !== name) changePart({ ...definition, name });
    }
  };
  // Parameters (and, for a preset with a starter model, its parts) in one
  // commit, then a result line in the parameters panel.
  const applyDesignParameters = (entries, snap, buildPreset = null) => {
    try {
      const merged = mergeParameters(model.parameters, entries, () => uid('parameter'));
      const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
      const counts =
        [merged.added && `${plural(merged.added, 'parameter')} added`, merged.updated && `${merged.updated} updated`]
          .filter(Boolean)
          .join(', ') || 'Parameters unchanged';
      if (buildPreset) {
        const next = buildStarterModel(model, buildPreset, merged.parameters);
        commit(next);
        setSelectedId(next.instances[0]?.id || null);
        setFeatureId(null);
        setFitKey((v) => v + 1);
        setParameterNotice(
          `${counts} · ${presetById(buildPreset).label.toLowerCase()} built with ${plural(next.parts.length, 'part')} (${plural(next.instances.length, 'instance')})`,
        );
      } else {
        commit({ ...model, parameters: merged.parameters });
        setParameterNotice(`${counts} — next: New sketch or Design parameters → Build`);
      }
      setMoveSnap(snap);
      setPanel('parameters');
      return '';
    } catch (e) {
      return e.message;
    }
  };
  const openDesignParameters = () => {
    setParameterNotice('');
    setPanel('design-parameters');
    setPropertiesOpen(true);
  };
  const addSheetAnnotation = (annotation) =>
    commit({
      ...model,
      sheets: model.sheets.map((s) =>
        s.id === sheet.id ? { ...s, annotations: [...(s.annotations || []), annotation] } : s,
      ),
    });
  const loadExample = (name) => {
    const example =
      name === 'cover'
        ? rearCoverExample()
        : name === 'pump'
          ? pumpBracketExample()
          : name === 'sheet-pump'
            ? sheetMetalPumpBracket()
            : name === 'sheet-box'
              ? sheetMetalControlBox()
              : name === 'sheet-kiosk'
                ? sheetMetalKiosk()
                : name === 'bracket'
                  ? bracketExample()
                  : furnitureExample(name);
    // Examples are appended with fresh IDs, preserving all existing design work.
    const ids = new Map();
    const collect = (value) => {
      if (!value || typeof value !== 'object') return;
      if (value.id) ids.set(value.id, uid('example'));
      Object.values(value).forEach((v) => {
        if (typeof v === 'object') collect(v);
      });
    };
    collect(example);
    const suffix = model.parts.length ? `_${model.parts.length}` : '';
    const names = new Map(example.parameters.map((p) => [p.name, p.name + suffix]));
    const rewrite = (value, field = '') => {
      if (typeof value === 'string') {
        if (
          [
            'id',
            'partId',
            'sketchId',
            'profileId',
            'featureId',
            'featureIds',
            'instanceId',
            'instanceIds',
            'toolPartId',
            'from',
            'to',
            'connectionId',
            'sections',
            'pointIds',
            'circleId',
            // The shop's records and groups (SM-4's control box carries them).
            'groupId',
            'parentId',
            // A fastener's connection names its hardware feature and the hole's
            // feature (SF-4's kiosk is the first example with fasteners).
            'fromFeatureId',
            'toFeatureId',
          ].includes(field) &&
          ids.has(value)
        )
          return ids.get(value);
        if (value.startsWith('=')) return value.replace(/[A-Za-z_][A-Za-z_0-9]*/g, (name) => names.get(name) || name);
        return value;
      }
      if (Array.isArray(value)) return value.map((v) => rewrite(v, field));
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, rewrite(v, key)]));
      return value;
    };
    const added = rewrite(example);
    added.parameters.forEach((p, i) => {
      p.name = names.get(example.parameters[i].name);
    });
    commit({
      ...model,
      parameters: [...model.parameters, ...added.parameters],
      sketches: [...model.sketches, ...added.sketches],
      parts: [...model.parts, ...added.parts],
      instances: [...model.instances, ...added.instances],
      connections: [...model.connections, ...added.connections],
      sheets: model.parts.length ? [...model.sheets, ...added.sheets] : added.sheets,
      // Finishes, prints and groups, when the example has them (the others
      // leave these lists as they were).
      ...Object.fromEntries(
        ['groups', 'finishes', 'prints']
          .filter((key) => added[key]?.length)
          .map((key) => [key, [...(model[key] || []), ...added[key]]]),
      ),
    });
    setSheetId(added.sheets[0]?.id);
    // A part in a group selects its product (the top group: the kiosk's frame
    // is a group inside it), as a click in the view would.
    let top = added.instances[0]?.groupId || null;
    for (let up = top; up; up = added.groups?.find((g) => g.id === up)?.parentId || null) top = up;
    select(top || added.instances[0]?.id);
    setPanel(null);
    setFitKey((v) => v + 1);
    if (name === 'pump') {
      setTab('Drawings');
      setSplit(true);
      setPanel('sheet');
    }
  };
  const perform = async (action) => {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e.message || String(e));
    }
  };
  // Generate views (Phase S §7): only the sheets asked for, the open one by
  // default. Results merge into the cache while the geometry is the one it
  // was built from (else they replace it); each entry keeps the definition
  // it was projected from. A sheet the kernel refuses keeps that error as its
  // own, so one broken sheet leaves the other sheets' previews alone.
  const requestDrawings = async (ids = [sheet.id]) => {
    setBusy(true);
    try {
      const definition = (id) => model.sheets.find((s) => s.id === id);
      let entries;
      try {
        const result = await runtime.request('drawings', { sheetIds: ids });
        entries = result.filter((r) => definition(r.id)).map((r) => [r.id, { sheet: definition(r.id), result: r }]);
      } catch (e) {
        // Not ready, or the model moved on mid-request: nothing to say about these sheets.
        if (!runtime.ready || latestModel.current !== model) throw e;
        entries = ids.filter(definition).map((id) => [id, { sheet: definition(id), error: e.message || String(e) }]);
      }
      setDrawings((old) => ({
        source: model,
        sheets: new Map([...(sameDrawingSource(old?.source, model) ? old.sheets : []), ...entries]),
      }));
      setSplit(true);
    } finally {
      setBusy(false);
    }
  };
  // The 3D selection as a drawing subject (Phase R §7): one part, a group's
  // or several parts' instances, or nothing (the whole assembly).
  const selectionSubject = part
    ? { partId: part.id }
    : selectionMembers.length
      ? { instanceIds: selectionMembers, ...(selectedGroup ? { title: selectedGroup.name } : {}) }
      : {};
  // One "new sheet" path (Phase S §4): a subject that already has a plain
  // sheet opens it (no commit) unless forceNew; otherwise a Phase R sheet is
  // added — titled after its subject, fitted to the page, its views generated
  // once its model has rebuilt. Either way it shows on the Drawings tab, split.
  const openOrCreateSheet = (subject = {}, { forceNew = false, panel: shownPanel = 'sheet' } = {}) => {
    const found = forceNew ? null : findSheetFor(model, subject);
    if (found) setSheetId(found.id);
    else {
      const subjectPart = subject.partId ? model.parts.find((p) => p.id === subject.partId) : null;
      if (subject.partId && !subjectPart) throw new Error(`Unknown part: ${subject.partId}`);
      const members = subjectPart ? [] : subject.instanceIds || [];
      const title = subjectPart
        ? subjectPart.name
        : subject.title ||
          (members.length ? `${members.length} part${members.length === 1 ? '' : 's'}` : document.name || 'Assembly');
      const next = {
        id: uid('sheet'),
        title: title.slice(0, 65),
        ...(subjectPart ? { partId: subjectPart.id } : members.length ? { instanceIds: members } : {}),
        layout: 'engineering',
        size: 'A3',
        units: 'mm',
        scaleMode: 'fit',
        scale: 1,
        revision: 'A',
        tolerance: 'Not specified',
        material: subjectPart?.material || '',
        views: ['top', 'isometric', 'front', 'right'],
        annotations: [],
        notes: '',
      };
      commit({ ...model, sheets: [...model.sheets, next] });
      setSheetId(next.id);
      setPendingDrawings(next.id);
    }
    setPanel(shownPanel);
    setSplit(true);
    setTab('Drawings');
    setSearch('');
  };
  // Drawings → Flat pattern sheet (§9 SM-4): the selected sheet-metal part's
  // flat-view sheet, opened if it has one, else added (fitted to the page,
  // generated once its model has rebuilt), like a new engineering sheet.
  const openFlatSheet = () => {
    if (!sheetFeature) throw new Error('Select a sheet-metal part first: the flat pattern is a sheet-metal blank.');
    const found = model.sheets.find((s) => s.partId === part.id && isFlatSheet(s));
    if (found) setSheetId(found.id);
    else {
      const next = {
        id: uid('sheet'),
        title: `${part.name} — flat pattern`.slice(0, 65),
        partId: part.id,
        layout: 'engineering',
        size: 'A3',
        units: 'mm',
        scaleMode: 'fit',
        scale: 1,
        revision: 'A',
        tolerance: 'Not specified',
        material: part.material || '',
        views: ['flat'],
        annotations: [],
        notes: '',
      };
      commit({ ...model, sheets: [...model.sheets, next] });
      setSheetId(next.id);
      setPendingDrawings(next.id);
    }
    setPanel('sheet');
    setSplit(true);
    setTab('Drawings');
    setSearch('');
  };
  // The selection's "Drawing sheet" button: the same sheet, shown on the Drawings tab.
  const drawSelection = () => perform(() => openOrCreateSheet(selectionSubject));
  // A tree row's draw icon: the Sheets panel stays open if it is.
  const drawNode = (subject) =>
    perform(() => openOrCreateSheet(subject, { panel: panel === 'sheets' ? 'sheets' : 'sheet' }));
  // Sheets panel (Phase S §5): each change is one commit, so Undo restores it.
  const openSheet = (id) => {
    setSheetId(id);
    setSplit(true);
  };
  const renameSheet = (id, title) => {
    const name = title.trim().slice(0, 65);
    if (!name || model.sheets.find((s) => s.id === id)?.title === name) return;
    commit({ ...model, sheets: model.sheets.map((s) => (s.id === id ? { ...s, title: name } : s)) });
  };
  const copySheet = (id) => {
    const next = commit(duplicateSheet(model, id));
    setSheetId(next.sheets[model.sheets.findIndex((s) => s.id === id) + 1].id);
    setSplit(true);
  };
  // The open sheet, when deleted, hands over to the next row, else the
  // previous one; its slider draft and dimension tool go with it.
  const deleteSheets = (ids) => {
    const gone = new Set(ids);
    const count = model.sheets.filter((s) => gone.has(s.id)).length;
    const next = commit(removeSheets(model, ids));
    if (gone.has(sheet.id)) {
      const index = model.sheets.indexOf(sheet);
      const neighbour =
        model.sheets.slice(index + 1).find((s) => !gone.has(s.id)) ||
        model.sheets.slice(0, index).findLast((s) => !gone.has(s.id));
      setSheetId(neighbour.id);
      setDimensionTool(null);
    }
    if (scaleDraft && gone.has(scaleDraft.sheetId)) setScaleDraft(null);
    setSheetNotice({ text: `Deleted ${count} sheet${count === 1 ? '' : 's'}`, undo: true, model: next });
  };
  const changeSheet = (patch) =>
    commit({ ...model, sheets: model.sheets.map((s) => (s.id === sheet.id ? { ...s, ...patch } : s)) });
  const exportFile = async (type) => {
    if (operationDraft) throw new Error('Apply or cancel the operation before exporting.');
    const generation = ++exportGeneration.current;
    const assertCurrent = () => {
      if (generation !== exportGeneration.current || latestModel.current !== model)
        throw new Error('Export cancelled or the model changed. Export the current design again.');
    };
    setBusy(true);
    setExportingType(type);
    try {
      const { workshopZip } = await import('./exports.js');
      assertCurrent();
      if (type === 'csv') {
        download(
          new Blob([cutListCsv(buildCutList(model, runtime.snapshot), shopRecordRows(model, runtime.snapshot))], {
            type: 'text/csv',
          }),
          'parts-and-cut-list.csv',
        );
        return;
      }
      if (type === 'svg' || type === 'dxf') {
        // The open sheet only (Phase S §7); its page number is its place in the model.
        const views = await runtime.request('drawings', { sheetIds: [sheet.id] });
        const selected = views.find((s) => s.id === sheet.id);
        if (!selected) throw new Error('Add geometry to this sheet before exporting.');
        const svg = sheetSvg(selected, model, runtime.snapshot, model.sheets.indexOf(sheet) + 1, model.sheets.length);
        const content = type === 'svg' ? svg : (await import('./sheetDxf.js')).sheetDxf(svg);
        assertCurrent();
        download(
          new Blob([content], { type: type === 'svg' ? 'image/svg+xml' : 'application/dxf' }),
          'drawing.' + type,
        );
        return;
      }
      // The sheet PDF has its own path (exportSheetsPdf): only its sheets' views, never STEP/STL.
      const data = await runtime.request(type === 'step' || type === 'stl' ? 'solids' : 'export');
      assertCurrent();
      if (type === 'zip') {
        const blob = await workshopZip(model, runtime.snapshot, data, document.name);
        assertCurrent();
        download(blob, `${document.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-workshop.zip`);
      } else if (type === 'step') {
        if (!data.assembly) throw new Error('Add an assembly instance first.');
        download(data.assembly, 'assembly.step');
      } else if (type === 'stl') {
        const file = data.files.find((f) => f.id === part?.id);
        if (!file) throw new Error('Select a part first.');
        download(file.stl, `${part.id}.stl`);
      }
    } finally {
      if (generation === exportGeneration.current) {
        setBusy(false);
        setExportingType(null);
      }
    }
  };
  // Sheet PDF (Phase T, docs/sketch-studio-sheet-pdf.md §5). The Save dialog
  // opens first, synchronously in the click (user activation expires during a
  // long render and a late picker throws SecurityError); then only the
  // chosen sheets' views are fetched (current cache entries reused, the rest
  // merged into the cache), every sheet is rendered once as the PDF will
  // print it, and a sheet that cannot be exported stops the run with a
  // report while the dialog's file is held, unwritten, until the user fixes
  // it, exports the other sheets or cancels.
  const exportSheetsPdf = (ids, { includeParts = false } = {}) => {
    if (operationDraft) throw new Error('Apply or cancel the operation before exporting.');
    if (!ids.length) throw new Error('Choose the sheets to export.');
    const one = ids.length === 1 && !includeParts ? model.sheets.find((s) => s.id === ids[0]) : null;
    const name = `${sanitizeFileNamePart(document.name, 'Sketch-Studio')} - ${one ? sanitizeFileNamePart(one.title, 'sheet') : 'drawings'}.pdf`;
    const title = `${document.name || 'Sketch Studio'} - ${one ? one.title : 'drawings'}`;
    const picking =
      typeof window.showSaveFilePicker === 'function'
        ? window.showSaveFilePicker({ suggestedName: name, types: PDF_FILE_TYPES })
        : null;
    return runSheetsPdf({ ids, includeParts, name, title, picking });
  };
  // The chosen sheets in model order (then the automatic part sheets), each
  // with its generated views or the kernel's refusal.
  const pdfSheets = async (ids, includeParts, assertCurrent) => {
    const live = drawings && sameDrawingSource(drawings.source, model) ? drawings.sheets : null;
    const chosen = model.sheets.filter((s) => ids.includes(s.id));
    const missing = chosen
      .filter((s) => {
        const entry = live?.get(s.id);
        return !(entry && sameDrawnSheet(entry.sheet, s));
      })
      .map((s) => s.id);
    let fetched = [];
    if (missing.length || includeParts) {
      fetched = await runtime.request('drawings', {
        sheetIds: missing,
        collectErrors: true,
        ...(includeParts ? { includeParts: true } : {}),
      });
      assertCurrent();
      const entries = fetched
        .filter((r) => missing.includes(r.id))
        .map((r) => {
          const sheet = chosen.find((s) => s.id === r.id);
          return [r.id, r.error ? { sheet, error: r.error } : { sheet, result: r }];
        });
      // The previews benefit: these sheets need no Generate views now.
      if (entries.length)
        setDrawings((old) => ({
          source: model,
          sheets: new Map([...(sameDrawingSource(old?.source, model) ? old.sheets : []), ...entries]),
        }));
    }
    const items = chosen.map((sheet) => {
      const got = fetched.find((r) => r.id === sheet.id);
      const entry = got ? (got.error ? { error: got.error } : { result: got }) : live?.get(sheet.id) || {};
      return { id: sheet.id, title: sheet.title, sheet, error: entry.error, result: entry.result };
    });
    if (includeParts)
      for (const r of fetched)
        if (!model.sheets.some((s) => s.id === r.id))
          items.push({ id: r.id, title: r.title, auto: true, sheet: r, error: r.error, result: r.error ? null : r });
    return items;
  };
  // Fit to page in the report fixes an overflow only when every view that
  // does not fit takes the sheet scale (a view's own scale is always fixed).
  const pdfFitFix = (item, drawn) => {
    if (item.auto || item.sheet.scaleMode === 'fit') return false;
    try {
      const fit = sheetFit(drawn, drawn.views, { parts: layoutParts(drawn, model, runtime.snapshot) });
      const bad = fit.views.filter((v) => !v.fits);
      return bad.length > 0 && bad.every((v) => !v.ownScale);
    } catch {
      return false;
    }
  };
  const runSheetsPdf = async ({ ids, includeParts, name, title, picking = null, handle = null, skip = null }) => {
    const generation = ++exportGeneration.current;
    const assertCurrent = () => {
      if (generation !== exportGeneration.current || latestModel.current !== model)
        throw new Error('Export cancelled or the model changed. Export the current design again.');
    };
    const controller = new AbortController();
    const run = { ids, includeParts, name, title, handle, controller };
    let report = null;
    setBusy(true);
    setExportingType('pdf');
    setPdfNotice(null);
    setPdfRun({ ...run, stage: 'working', progress: null });
    try {
      if (picking) {
        try {
          run.handle = await picking;
        } catch (e) {
          // The Save dialog was closed: nothing requested, nothing to say.
          if (isFilePickerAbortError(e)) return;
          throw e;
        }
      }
      // The PDF chunk loads while the views are fetched.
      const library = import('./sheetPdf.js');
      library.catch(() => {});
      const items = await pdfSheets(ids, includeParts, assertCurrent);
      if (!items.length) throw new Error('Those sheets no longer exist.');
      if (controller.signal.aborted) throw pdfAbortError();
      // Preflight: each sheet rendered as it will print (an export never
      // overflows); these strings are the pages unless a skip renumbers them.
      const total = items.length;
      const checked = items.map((item, index) => {
        if (item.error) return { ...item, failure: item.error };
        if (!item.result) return { ...item, failure: 'Add geometry to this sheet before exporting.' };
        const drawn = item.auto ? item.result : { ...item.sheet, bounds: item.result.bounds, views: item.result.views };
        try {
          const svg = sheetSvg(drawn, model, runtime.snapshot, index + 1, total, { allowOverflow: false });
          return { ...item, drawn, svg, issue: pdfTextIssues(svg, item.title) };
        } catch (e) {
          return { ...item, drawn, failure: e.message || String(e), fit: pdfFitFix(item, drawn) };
        }
      });
      const good = checked.filter((c) => !c.failure);
      const warnings = good.filter((c) => c.issue).map((c) => pdfTextIssueMessage(c.issue));
      if (checked.some((c) => c.failure && !skip?.has(c.id))) {
        report = {
          ...run,
          stage: PDF_RUN.next('working', 'REPORT'),
          total,
          passing: good.length,
          warnings,
          failures: checked
            .filter((c) => c.failure)
            .map((c) => ({
              id: c.id,
              title: c.title,
              auto: Boolean(c.auto),
              fit: Boolean(c.fit),
              // "Frame: front does not fit…" reads "Frame — front does not fit…".
              error: c.failure.startsWith(`${c.title}: `) ? c.failure.slice(c.title.length + 2) : c.failure,
            })),
        };
        setPanel('sheets');
        setPropertiesOpen(true);
        return;
      }
      if (!good.length) throw new Error('None of these sheets can be exported.');
      // Skipped sheets renumber the rest: page n of the pages written.
      const pages = good.map((c, index) => ({
        svg:
          good.length === total
            ? c.svg
            : sheetSvg(c.drawn, model, runtime.snapshot, index + 1, good.length, { allowOverflow: false }),
        size: c.drawn.size,
        title: c.title,
      }));
      const { sheetsPdf } = await library;
      assertCurrent();
      const blob = await sheetsPdf(null, model, runtime.snapshot, {
        title,
        pages,
        signal: controller.signal,
        onProgress: (progress) => setPdfRun((r) => (r?.controller === controller ? { ...r, progress } : r)),
      });
      assertCurrent();
      if (controller.signal.aborted) throw pdfAbortError();
      let saved = name;
      if (run.handle) {
        // The writable is created only now: a run that stops earlier leaves the picked file as the dialog left it.
        const writable = await run.handle.createWritable();
        try {
          if (controller.signal.aborted) throw pdfAbortError();
          await writable.write(blob);
          await writable.close();
        } catch (e) {
          // Discards the swap file: the picked file keeps what it had.
          try {
            await writable.abort?.();
          } catch {
            // Already closed or errored: nothing more to discard.
          }
          throw e;
        }
        saved = run.handle.name || name;
      } else download(blob, name);
      const count = `${pages.length} page${pages.length === 1 ? '' : 's'}`;
      setPdfNotice({ text: `${run.handle ? 'Saved' : 'Downloaded'} ${saved} (${count})`, warnings, model });
    } catch (e) {
      if (e?.name !== 'AbortError') throw e;
      setPdfNotice({ text: 'PDF export cancelled — nothing was written.', warnings: [], model });
    } finally {
      if (generation === exportGeneration.current) {
        setBusy(false);
        setExportingType(null);
        setPdfRun(report);
      }
    }
  };
  // The report's Fit to page: one commit, then the same sheets and file again.
  const fitPdfSheet = (id) => {
    commit({ ...model, sheets: model.sheets.map((s) => (s.id === id ? { ...s, scaleMode: 'fit' } : s)) });
    setPdfRun((r) => r && { ...r, stage: PDF_RUN.next(r.stage, 'FIT'), before: model });
  };
  const pdfActions = {
    cancel: () => (pdfRun?.stage === 'working' ? pdfRun.controller.abort() : setPdfRun(null)),
    fit: (id) => perform(() => fitPdfSheet(id)),
    open: (id) => openSheet(id),
    skip: () => {
      const { ids, includeParts, name, title, handle, failures } = pdfRun;
      perform(() => runSheetsPdf({ ids, includeParts, name, title, handle, skip: new Set(failures.map((f) => f.id)) }));
    },
    dismiss: () => setPdfRun(null),
  };
  // The status bar's Cancel: stops the rebuild and whatever is busy. An export
  // skips its own reset once the generation has moved on, so its state ends
  // here: a working PDF run is aborted (nothing is written) and one waiting to
  // refit is dropped; a report on screen is not an export under way and stays.
  const cancelWork = () => {
    exportGeneration.current++;
    if (pdfRun?.stage === 'working') pdfRun.controller.abort();
    runtime.cancel();
    setBusy(false);
    setExportingType(null);
    setPdfRun((r) => (r && PDF_RUN.next(r.stage, 'CANCEL') === 'idle' ? null : r));
  };
  // After a fix, once its commit is the model on show and rebuilt.
  useEffect(() => {
    if (pdfRun?.stage !== 'refit' || model === pdfRun.before || !runtime.ready || busy) return;
    const { ids, includeParts, name, title, handle } = pdfRun;
    perform(() => runSheetsPdf({ ids, includeParts, name, title, handle }));
    // runSheetsPdf reads this render's model and views.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfRun, model, runtime.ready, busy]);
  // ---------------------------------------------------------------- the shop floor (SF-1)
  // docs/sketch-studio-shop-floor.md §4: the Shop tab's ribbon is the route
  // (Draw · Cut · Bend · Paint · Print + More), the left pane a job
  // board, and goStation the one way into a station — route buttons, the job
  // board, Back / Next and a gate's buttons all come through it.
  const products = useMemo(() => jobProducts(model), [model]);
  // The current product / part follows the selection whenever the selection
  // changes to something; a station clearing the selection (paint, print)
  // keeps it. Its nodes going away drop it; with none and one product,
  // that product is it.
  const selectionKey = liveSelection.join('|');
  if (
    placedNote &&
    placedNote.selectionKey !== selectionKey &&
    model.instances.some((i) => i.id === placedNote.selectionKey)
  )
    setPlacedNote(null);
  if (selectionKey && shopSubject?.selectionKey !== selectionKey) {
    const first = selectionMembers.find((id) => model.instances.some((i) => i.id === id));
    setShopSubject({
      productId: first ? topNode(model, first) : null,
      instanceId:
        selectedId && first === selectedId ? selectedId : selectionMembers.length === 1 ? first || null : null,
      selectionKey,
    });
  }
  // A part in no product (a loose fastener or bought-in item) is no subject.
  const currentSubject = (() => {
    const instanceId =
      shopSubject?.instanceId && model.instances.some((i) => i.id === shopSubject.instanceId)
        ? shopSubject.instanceId
        : null;
    const productId = instanceId ? topNode(model, instanceId) : shopSubject?.productId;
    if (products.some((p) => p.id === productId)) return { productId, instanceId };
    return products.length === 1 ? { productId: products[0].id, instanceId: null } : null;
  })();
  // The station on show: a session, a station panel or a gate.
  const openStation =
    panel === 'shop-draw'
      ? 'draw'
      : panel === 'shop-cut' || shopSession?.station === 'laser'
        ? 'cut'
        : brakeSession || panel === 'press-brake'
          ? 'bend'
          : shopSession
            ? shopSession.station
            : panel === 'shop-gate' && shopGate
              ? shopGate.station
              : null;
  // Stations wait only for a tool outside the shop, a busy export, a stroke or
  // a cut (§4.1), and while the replay plays (§8: the route is read-only).
  const film = shopSession?.station === 'film' ? shopSession : null;
  const filmOn = Boolean(film);
  const routeBusy =
    busy ||
    ['operation', 'sketch', 'mate'].includes(runningTool) ||
    brakeSession?.stage === 'stroke' ||
    shopSession?.stage === 'cutting' ||
    Boolean(film);
  const shopParams = sheetParameters || {};
  const panelShown = panel === 'shop-draw' && panelOpen && Boolean(panelDraft);
  const panelFace = useMemo(
    () => (panelShown ? draftFace(panelDraft, model, sheetParameters || {}) : null),
    [panelShown, panelDraft, model, sheetParameters],
  );
  const panelResult = useMemo(() => {
    if (!panelShown) return null;
    const input = panelInput(panelDraft, model, sheetParameters || {});
    if (input.error) return input;
    try {
      return flangedPanel(input, { machine: model.fabrication?.shop?.machine, idPrefix: 'draft' });
    } catch (e) {
      return { error: e.message || String(e) };
    }
  }, [panelShown, panelDraft, model, sheetParameters]);
  const changePanelDraft = (update) =>
    setPanelDraft((d) => (typeof update === 'function' ? update(d) : { ...d, ...update }));
  // The preview: an edge click puts a flange on (or takes it off); a face click a crease at that height.
  const panelEdge = (edge) =>
    changePanelDraft((d) => {
      const flanges = { ...d.flanges };
      if (flanges[edge]) delete flanges[edge];
      else flanges[edge] = { depth: d.depth, direction: d.direction, angle: 90 };
      return { ...d, flanges, edge };
    });
  const panelCrease = ([, y]) => {
    if (!panelFace) return;
    const [[, y0], [, y1]] = polygonBounds(panelFace);
    if (!(y > y0 + 1 && y < y1 - 1)) return;
    changePanelDraft((d) => ({
      ...d,
      creases: [...d.creases, { id: uid('crease'), mode: 'height', y: Math.round(y), angle: 12, direction: 'down' }],
    }));
  };
  // Create (§6.3): the part from the maker's blank, with its etched lines; "Cut
  // and bend it for me" adds the bends. Either way it goes on the laser, cutting.
  const createPanel = (ending) => {
    const result = panelResult;
    if (!result || result.error) throw new Error(result?.error || 'Describe the panel first.');
    const name = String(panelDraft.name || '').trim() || 'Flanged panel';
    const strokeIds = new Map();
    const bends =
      ending === 'bend'
        ? result.bends.map((b) => {
            if (b.stroke && !strokeIds.has(b.stroke)) strokeIds.set(b.stroke, uid('stroke'));
            return { ...b, id: uid('bend'), ...(b.stroke ? { stroke: strokeIds.get(b.stroke) } : {}) };
          })
        : [];
    const sketch = {
      id: uid('sketch'),
      name: `${name} blank`,
      plane: 'XY',
      profile: JSON.parse(JSON.stringify(result.profile)),
      primitives: [],
      constrained: false,
    };
    const part = sheetMetalPart({
      sketchId: sketch.id,
      stock: panelDraft.stock,
      thickness: panelDraft.thickness,
      name,
    });
    part.features = [{ ...part.features[0], marks: result.marks.map((m) => ({ ...m, id: uid('mark') })), bends }];
    // Round corners (round-bend spec §13.3): one part per corner piece size,
    // an instance standing in each of its corners; bent too with "Cut and bend it for me".
    const sizes = [...new Set((result.cornerPieces || []).map((c) => c.piece))];
    const companions = sizes.map((piece, i) => {
      const pieceName = `${name} corner piece${sizes.length > 1 ? ` ${i + 1}` : ''}`;
      const blank = {
        id: uid('sketch'),
        name: `${pieceName} blank`,
        plane: 'XY',
        profile: JSON.parse(JSON.stringify(piece.profile)),
        primitives: [],
        constrained: false,
      };
      const made = sheetMetalPart({
        sketchId: blank.id,
        stock: panelDraft.stock,
        thickness: panelDraft.thickness,
        name: pieceName,
      });
      made.features = [
        {
          ...made.features[0],
          base: piece.feature.base,
          marks: piece.marks.map((m) => ({ ...m, id: uid('mark') })),
          bends: ending === 'bend' ? piece.bends.map((b) => ({ ...b, id: uid('bend') })) : [],
        },
      ];
      const poses = result.cornerPieces.filter((c) => c.piece === piece).map((c) => c.pose);
      return { sketch: blank, part: made, poses };
    });
    const [[x0, y0], [x1, y1]] = polygonBounds(profilePolygon(result.profile).outer);
    // A kiosk-tall blank needs a larger stock sheet than the default: the smallest that holds it.
    const current = model.fabrication?.shop?.sheet || DEFAULT_LASER_SHEET;
    const holding = sheetHolding(x1 - x0, y1 - y0, current);
    const sheet = holding && holding !== current ? holding : null;
    setPanelOpen(false);
    cutFromSheet({ sketch, part, centre: [(x0 + x1) / 2, (y0 + y1) / 2], sheet, companions });
  };
  const shopProgress = useMemo(
    () => (tab === 'Shop' ? routeProgress(model, currentSubject?.productId || null, { params: shopParams }) : null),
    // shopParams is sheetParameters (or a fresh {} when they cannot be read).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, model, currentSubject?.productId, sheetParameters],
  );
  // Leave whatever station is open (its own Leave, without touching the subject).
  const leaveStations = () => {
    setBrakeSession(null);
    setBrakeBlocked(null);
    setBrakeProblem('');
    setShopSession(null);
    setShopProblem('');
    setShopNotice('');
    setShopGate(null);
    setPendingStation(null);
    setHoleMode(null);
    setMeasureSession(null);
  };
  // ------------------------------------------------ Replay the build (§8, SF-5)
  // The film is the shop session's `station: 'film'` (toolSession.js FILM),
  // so every rule that keeps another tool out while a station is open keeps
  // it out too, and a new selection (resetSelectionTools) ends it. { stage,
  // key, productId, instanceId (Watch the bends: one part's hits only),
  // scenes (shopFilm.js filmScenes, fixed at the start), index, progress (the
  // beats of the scene reached: its records appear), take (bumped at every
  // scene entry: the stations' run tokens), speed, view (the laser bed's),
  // source (the model it plays: anything else ends it), before (what was on
  // show — the open station's session, the panel, the unfold view — put back
  // as it was when it ends) }. It never commits: the viewport is handed the
  // model with only the records that exist so far (kernel-inert keys), the
  // press brake's view-only re-run, the laser bed's cut and the mask of the
  // parts not made yet. The clock lives in a ref and the stations' own frame
  // loops read it: no React render per frame, one per scene (and per colour,
  // print).
  const filmClock = useRef(null);
  const filmFolds = useRef(new Map());
  const filmBars = useRef(new Map());
  const filmBar = (kind) => (node) => {
    if (node) filmBars.current.set(kind, node);
    else filmBars.current.delete(kind);
  };
  const replayProduct = currentSubject?.productId || null;
  // Why Replay is off ('' when it is on); asked only on the Shop tab, where its button is.
  const replayReason = useMemo(
    () =>
      tab !== 'Shop'
        ? ''
        : !model.instances.length
          ? 'Nothing to replay yet: draw and cut a part first.'
          : !replayProduct
            ? 'Choose a product first: click one of its parts, then Replay.'
            : filmReady(model, replayProduct),
    [tab, model, replayProduct],
  );
  const startFilm = (instanceId = null) => {
    if (film || pendingStation || (routeBusy && !instanceId)) return;
    const productId = instanceId ? topNode(model, instanceId) : replayProduct;
    const scenes = filmScenes(model, productId, { params: shopParams, instanceId });
    if (!scenes.length)
      throw new Error(instanceId ? 'This part has no hits to watch.' : 'Nothing to replay yet: cut a blank first.');
    filmClock.current = createFilmClock();
    filmFolds.current = new Map();
    const before = {
      shopSession,
      brakeSession,
      brakeBlocked,
      brakeProblem,
      shopProblem,
      shopNotice,
      shopGate,
      panel,
      sheetFlat,
      propertiesOpen,
    };
    setBrakeSession(null);
    setBrakeBlocked(null);
    setBrakeProblem('');
    setShopProblem('');
    setShopNotice('');
    setShopGate(null);
    setSheetFlat(null);
    setShopSession({
      station: 'film',
      stage: FILM.next(FILM.initial, 'START'),
      key: uid('film'),
      productId,
      instanceId,
      scenes,
      index: 0,
      progress: 0,
      take: 1,
      speed: 1,
      // The bed's own choice until the user picks one (LaserStation.jsx laserAutoView).
      view: null,
      source: model,
      before,
    });
    setPanel('shop-film');
    setPropertiesOpen(true);
    setError('');
  };
  // Esc, End replay, the route's End replay: everything back as it was.
  const endFilm = () => {
    const s = shopSession;
    if (s?.station !== 'film') return;
    const b = s.before;
    filmClock.current = null;
    setShopSession(b.shopSession);
    setBrakeSession(b.brakeSession);
    setBrakeBlocked(b.brakeBlocked);
    setBrakeProblem(b.brakeProblem);
    setShopProblem(b.shopProblem);
    setShopNotice(b.shopNotice);
    setShopGate(b.shopGate);
    setPanel(b.panel);
    setSheetFlat(b.sheetFlat);
    setPropertiesOpen(b.propertiesOpen);
  };
  // One take of the film: the update for the session it is still on.
  const filmUpdate = (take, update) =>
    setShopSession((cur) =>
      cur?.station === 'film' && (take == null || cur.take === take) ? { ...cur, ...update(cur) } : cur,
    );
  const playFilm = () => {
    const clock = filmClock.current;
    if (!film || !clock) return;
    if (film.stage === 'ended') {
      clock.play();
      return filmUpdate(null, (cur) => ({
        stage: FILM.next(cur.stage, 'PLAY'),
        index: 0,
        progress: 0,
        take: cur.take + 1,
      }));
    }
    clock.play();
    filmUpdate(null, (cur) => ({ stage: FILM.next(cur.stage, 'PLAY') }));
  };
  const pauseFilm = () => {
    filmClock.current?.pause();
    filmUpdate(null, (cur) => ({ stage: FILM.next(cur.stage, 'PAUSE') }));
  };
  // Previous, next, a row of the step list: that scene from its start, playing on if it was.
  const stepFilm = (index) => {
    if (!film) return;
    const to = Math.max(0, Math.min(film.scenes.length - 1, index));
    if (film.stage === 'ended') filmClock.current?.pause();
    filmUpdate(null, (cur) => ({ stage: FILM.next(cur.stage, 'STEP'), index: to, progress: 0, take: cur.take + 1 }));
  };
  const speedFilm = (speed) => {
    filmClock.current?.setRate(speed);
    filmUpdate(null, () => ({ speed }));
  };
  // A new take starts its scene at 0 before any station's frame loop reads the clock.
  useLayoutEffect(() => {
    filmClock.current?.reset(0);
  }, [film?.key, film?.take]);
  // The film's frame loop: the progress bars, the scene's beats (the colour,
  // a print appears: one render each) and its end (the next scene, or
  // the finished product, where the film waits).
  useEffect(() => {
    const clock = filmClock.current;
    const scene = film?.scenes[film.index];
    if (!film || !clock || !scene) return undefined;
    const ms = scene.seconds * 1000;
    const startMs = filmStart(film.scenes, film.index) * 1000;
    const totalMs = filmLength(film.scenes) * 1000;
    const beats = filmBeats(scene);
    const { take, progress, stage } = film;
    const last = film.index === film.scenes.length - 1;
    let frame = 0,
      drawn = -1;
    const tick = () => {
      frame = 0;
      const at = Math.min(ms, clock.elapsed());
      if (at !== drawn) {
        drawn = at;
        const p = ms ? at / ms : 1;
        const sceneBar = filmBars.current.get('scene'),
          totalBar = filmBars.current.get('total');
        if (sceneBar) sceneBar.style.transform = `scaleX(${p.toFixed(4)})`;
        if (totalBar) totalBar.style.transform = `scaleX(${totalMs ? ((startMs + at) / totalMs).toFixed(4) : 1})`;
        if (stage === 'playing') {
          if (at >= ms) {
            if (last) {
              clock.pause();
              return filmUpdate(take, (cur) => ({ stage: FILM.next(cur.stage, 'DONE'), progress: 1 }));
            }
            return filmUpdate(take, (cur) => ({ index: cur.index + 1, progress: 0, take: cur.take + 1 }));
          }
          const reached = beats.filter((b) => b <= p && b > progress);
          if (reached.length) return filmUpdate(take, () => ({ progress: Math.max(...reached) }));
        }
      }
      // Paused or finished: the bars are drawn once, nothing else moves.
      if (stage === 'playing') frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // One loop per take, stage and beat; it reads the session it started on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film?.key, film?.take, film?.stage, film?.progress]);
  // What the scene plays on the stations' own display code: the press brake's
  // view-only re-run of the hit (its stroke on the film's clock) and the laser
  // bed's cut of the blank (every copy nested; the sheet that holds it). Built
  // once per take.
  const filmSceneView = useMemo(() => {
    const clock = filmClock.current;
    const scene = film?.scenes[film.index];
    if (!film || !clock || !scene) return null;
    const token = `${film.key}:${film.take}`;
    const animMs = Math.max(300, (scene.seconds - filmHold(scene.seconds)) * 1000);
    const out = { token, brake: null, laser: null };
    const shopKey = model.fabrication?.shop?.machine;
    if (scene.station === 'bend') {
      if (!filmFolds.current.has(scene.instanceId))
        filmFolds.current.set(scene.instanceId, foldOf(model, scene.instanceId, shopParams));
      const fold = filmFolds.current.get(scene.instanceId);
      if (fold) {
        const machine = machineOf(MACHINES[shopKey] ? shopKey : DEFAULT_MACHINE);
        // A bend-on scene names its own step (tight bends §4.3).
        const { view, run } = rerunStroke({
          station: { fold, machine },
          token,
          bendId: scene.stepKey || scene.bendIds[0],
        });
        // The hit at the machine's own speed when the scene has room for it, else quicker.
        const rate = Math.max(1, run.timeline.total / animMs);
        out.brake = {
          key: `${film.key}:bend:${scene.instanceId}`,
          instanceId: scene.instanceId,
          machine: machine.key,
          ...view,
          stroke: { ...run, clock: () => clock.elapsed() * rate },
        };
      }
    }
    if (scene.station === 'cut') {
      // SN-1 §4.5: the scene's copies are the job, on the shared sheet; the
      // blanks of the cut scenes already played lie there cut, the rest as
      // their programmed path. The sheet shown holds the scene's first copy.
      const cutIds = film.scenes
        .slice(0, film.index)
        .filter((s) => s.station === 'cut')
        .flatMap((s) => s.instanceIds);
      const session = { instanceId: scene.instanceId, instanceIds: scene.instanceIds, cutIds };
      let station = laserStation({ model, session, params: shopParams });
      if (!station.closed && !station.error && station.checks.refusals.some((r) => r.code === 'sheet')) {
        const sheet = sheetHolding(station.flat.width, station.flat.height, station.sheetKey);
        if (sheet && sheet !== station.sheetKey)
          station = laserStation({
            model: { ...model, fabrication: { ...model.fabrication, shop: { ...model.fabrication?.shop, sheet } } },
            session,
            params: shopParams,
          });
      }
      if (!station.closed && !station.error)
        out.laser = { station, watch: animMs / 1000, clock: () => clock.elapsed() };
    }
    return out;
    // One per take: the model cannot change while the film plays (it would end it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film?.key, film?.take]);
  // What exists at this point of the film (shopFilm.js filmState), and the
  // model as the view shows it: only the records made so far.
  const filmScenesList = film?.scenes || null,
    filmIndex = film?.index ?? 0,
    filmProgress = film?.progress ?? 0;
  const filmView = useMemo(() => {
    if (!filmScenesList) return null;
    const state = filmState(filmScenesList, filmIndex, filmProgress);
    return { state, model: filmModel(model, state) };
  }, [filmScenesList, filmIndex, filmProgress, model]);
  const filmStage = film?.stage || null;
  const filmPick = useMemo(
    () =>
      filmView
        ? { station: 'film', stage: filmStage, pick: null, hint: '', lines: [], targets: filmView.state.targets }
        : null,
    [filmView, filmStage],
  );
  // The parts not made yet at this point of the film, hidden in the view.
  const filmHidden = filmView?.state.hidden || null;
  // Browser checks: the film as it plays, and the commits and kernel builds
  // this workspace has made (the replay makes neither).
  const workspaceElement = useRef(null);
  const filmProbe = useRef(null);
  useLayoutEffect(() => {
    filmProbe.current = { film, view: filmView, status: runtime.status };
  });
  useEffect(() => {
    const element = workspaceElement.current;
    if (!element) return undefined;
    element.cadFilm = () => {
      const { film: f, view, status } = filmProbe.current || {};
      const scene = f?.scenes[f.index];
      return {
        open: Boolean(f),
        stage: f?.stage || null,
        index: f?.index ?? null,
        count: f?.scenes.length ?? 0,
        take: f?.take ?? null,
        speed: f?.speed ?? null,
        progress: f?.progress ?? null,
        // Milliseconds into the scene on the film's clock.
        elapsed: f && filmClock.current ? filmClock.current.elapsed() : null,
        seconds: f ? filmLength(f.scenes) : null,
        scenes: f ? f.scenes.map((s) => ({ key: s.key, station: s.station, title: s.title, seconds: s.seconds })) : [],
        scene: scene ? { key: scene.key, station: scene.station, title: scene.title, seconds: scene.seconds } : null,
        hidden: view?.state.hidden || [],
        finishes: view?.state.finishes.length ?? null,
        prints: view?.state.prints.length ?? null,
        commits: commitCount.current,
        builds: buildCount.current,
        status,
      };
    };
    return () => {
      delete element.cadFilm;
    };
  }, []);
  // The viewport frames the product as the film starts and puts its camera back at the end.
  const productIdsOf = (productId) => (productId && isNode(model, productId) ? memberIds(model, [productId]) : []);
  const filmKey = film?.key || null,
    filmProductId = film?.productId || null;
  const filmCamera = useMemo(
    () =>
      filmKey
        ? {
            key: filmKey,
            ids: productIdsOf(filmProductId),
            brake: Boolean(filmScenesList?.some((s) => s.station === 'bend')),
          }
        : null,
    // productIdsOf reads this render's model: the film's members.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filmKey, filmProductId],
  );
  const productMembers = (subject) => products.find((p) => p.id === subject?.productId)?.instanceIds || [];
  // Open `key` on `instanceId` (null: the product, or nothing chosen). Paint
  // and print pick on the kernel's meshes: while it rebuilds they wait and
  // open once it is current, with no error line. A blank the fold refuses is
  // a gate with the part form as its button.
  const openStationOn = (
    key,
    instanceId = null,
    subject = currentSubject,
    { autoCut = false, instanceIds = null, carry = null } = {},
  ) => {
    if (['paint', 'print'].includes(key) && !runtime.ready) {
      setPendingStation({ station: key, instanceId, before: model });
      setShopGate({ station: key, kind: 'waiting' });
      setPanel('shop-gate');
      return;
    }
    try {
      if (key === 'cut') openLaser(instanceId, { autoCut, instanceIds });
      else if (key === 'bend') openPressBrake(instanceId, { carry });
      else if (key === 'paint') startPaint(instanceId ? [instanceId] : productMembers(subject));
      else if (key === 'print') startPrint();
    } catch (e) {
      setShopGate({
        station: key,
        kind: 'blocked',
        message: e.message || String(e),
        go: instanceId ? 'part' : null,
        goLabel: 'Open the part',
        instanceId,
        // Bend's gate on a part keeps the tooling for the next part (§7.3).
        ...(key === 'bend' && carry ? { carry } : {}),
      });
      setPanel('shop-gate');
    }
  };
  // The one way into a station (§4.3): refused while a stroke or a cut runs;
  // the open station is left (the subject kept); then the station opens on
  // the subject, asks which part, or says what is missing and offers the
  // button that makes it. `instanceId` chooses the part; `outline` (from
  // Draw) goes to Cut with no part yet.
  const goStation = (key, { instanceId = null, outline = null } = {}) => {
    if (routeBusy) return;
    if (key === openStation && !instanceId && !outline) return;
    // Bend to another part without leaving the press brake (the bend queue, a
    // job board row: docs/sketch-studio-outline-edit-sheet-nest.md §7.3): the
    // punch and die stay in the machine — from the open session, or held by
    // the card or gate the brake shows meanwhile. Anything else starts fresh.
    const carry =
      key === 'bend' && openStation === 'bend' && instanceId
        ? brakeSession
          ? brakeCarry(brakeSession)
          : brakeBlocked?.carry || (shopGate?.station === 'bend' ? shopGate.carry : null) || null
        : null;
    leaveStations();
    setPropertiesOpen(true);
    const subject = instanceId ? { productId: topNode(model, instanceId), instanceId } : currentSubject;
    if (instanceId) setShopSubject({ ...subject, selectionKey });
    if (key === 'draw') return setPanel('shop-draw');
    if (outline) {
      setCutOutline(outline);
      return setPanel('shop-cut');
    }
    const entry = stationEntry(model, { station: key, subject, params: shopParams });
    if (entry.blocked || entry.pick) {
      setShopGate(
        entry.pick
          ? { station: key, kind: 'pick', ids: entry.pick }
          : { station: key, kind: 'blocked', ...entry.blocked },
      );
      return setPanel('shop-gate');
    }
    if (entry.open.outline) {
      setCutOutline(entry.open.outline);
      return setPanel('shop-cut');
    }
    openStationOn(key, entry.open.instanceId, subject, { carry });
  };
  // A part Cut on the laser just made, or a station waiting for the kernel:
  // opened once the commit is the model on show (and, for the kernel's
  // stations, the model is current). A commit that never arrives drops it.
  useEffect(() => {
    if (!pendingStation) return;
    const { station, instanceId, instanceIds = null, autoCut, before } = pendingStation;
    if (instanceId && !model.instances.some((i) => i.id === instanceId)) {
      if (model !== before) setPendingStation(null);
      return;
    }
    if (['paint', 'print'].includes(station) && !runtime.ready) return;
    setPendingStation(null);
    setError('');
    openStationOn(station, instanceId, currentSubject, { autoCut, instanceIds });
    // Runs once its commit or the rebuild reaches this render; the openers read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStation, model, runtime.ready]);
  // The station shell's subject and Back / Next (the same part, §4.6).
  const shellFor = (key, subject = '', instanceId = currentSubject?.instanceId || null) => {
    const back = routeNeighbour(key, -1),
      next = routeNeighbour(key, 1);
    return {
      subject,
      disabled: routeBusy,
      nextReady: shopProgress?.[key]?.status === 'done',
      onBack: back ? () => perform(() => goStation(back.key, { instanceId })) : null,
      onNext: next ? () => perform(() => goStation(next.key, { instanceId })) : null,
    };
  };
  // The bend queue (docs/sketch-studio-outline-edit-sheet-nest.md §7.1, §7.2):
  // the part on the brake — its session's, its card's, or Bend's gate on a
  // part (a blank that does not fold: the queue must still move on from
  // there) — and every sheet-metal part, worked out only while Bend shows one.
  const brakeOn =
    panel === 'press-brake'
      ? brakeSession?.instanceId || brakeBlocked?.instanceId || null
      : panel === 'shop-gate' && shopGate?.station === 'bend' && shopGate.kind === 'blocked'
        ? shopGate.instanceId || null
        : null;
  const queueShown = Boolean(brakeOn);
  const brakeQueue = useMemo(
    () => (queueShown ? bendQueue(model, { params: sheetParameters || {} }) : null),
    [queueShown, model, sheetParameters],
  );
  // Bend's shell on the part on the brake, with the queue under its head (from two parts).
  const bendShell = (instanceId) => ({
    ...shellFor('bend', nodeName(model, instanceId), instanceId),
    strip:
      brakeQueue && brakeQueue.length > 1 ? (
        <BendQueue
          rows={brakeQueue}
          current={sheetPartOf(model, instanceId)?.part.id || null}
          params={shopParams}
          disabled={routeBusy}
          onRow={(id) => perform(() => goStation('bend', { instanceId: id }))}
        />
      ) : null,
  });
  const productName = currentSubject ? nodeName(model, currentSubject.productId) : '';
  const shopSubjectName =
    currentSubject?.instanceId && currentSubject.instanceId !== currentSubject.productId
      ? `${productName} · ${nodeName(model, currentSubject.instanceId)}`
      : productName;
  // The job board: every product, its sheet-metal parts with where each stands.
  const jobShown = tab === 'Shop' && leftPane === 'job';
  const jobBoard = useMemo(() => {
    if (!jobShown) return null;
    const params = sheetParameters || {};
    return products.map((product) => {
      const sheets = product.instanceIds.filter((id) => sheetPartOf(model, id));
      return {
        id: product.id,
        name: product.name,
        progress: routeProgress(model, product.id, { params }),
        parts: sheets.map((id) => ({
          instanceId: id,
          name: nodeName(model, id),
          profile: sheetPartOf(model, id).sketch?.profile || null,
          progress: partProgress(model, id, { params }),
        })),
        others: product.instanceIds.length - sheets.length,
      };
    });
  }, [jobShown, products, model, sheetParameters]);
  // Print picks in the viewport: there the rows only show.
  const jobInert = openStation === 'print' ? 'The print station picks a face in the view: click it there.' : '';
  // A job board row (§4.2): Cut or Bend move to that part, Paint takes it as
  // its target, no station selects it.
  const jobRowClick = (instanceId) => {
    // The laser open on a job (SN-1 §4.4, BQ-1 §7.7): a row of that job makes
    // its part the lead, the job kept, as a This cut row does; a row outside
    // it reopens the laser on that part.
    if (shopSession?.station === 'laser' && shopSession.stage !== 'cutting' && laserView?.job?.includes(instanceId)) {
      setShopSubject({ productId: topNode(model, instanceId), instanceId, selectionKey });
      return leadLaser(instanceId);
    }
    if (openStation === 'cut' || openStation === 'bend') return perform(() => goStation(openStation, { instanceId }));
    if (shopSession?.station === 'paint') {
      setShopSubject({ productId: topNode(model, instanceId), instanceId, selectionKey });
      return perform(() => pickShop({ kind: 'part', instanceId }));
    }
    // The row's part is the route's subject even when it is already the
    // selection (BQ-1: the bend queue moves the subject without selecting, so
    // a click on the selected part's row must still bring the route back to it).
    setShopSubject({ productId: topNode(model, instanceId), instanceId, selectionKey });
    select(instanceId);
  };
  // A gate's pick rows, and its button. Bend's are per part (§7.4: a bend
  // belongs to the part, its copies fold with it): the first copy of each in
  // the gate's own order, "× copies" and the bend queue's text.
  const gatePerPart = (ids) => {
    const queue = new Map(bendQueue(model, { params: shopParams }).map((row) => [row.partId, row]));
    const seen = new Set();
    return ids.flatMap((id) => {
      const sheet = sheetPartOf(model, id);
      const key = sheet?.part.id || id;
      if (seen.has(key)) return [];
      seen.add(key);
      const row = queue.get(key);
      return [
        {
          instanceId: id,
          name: nodeName(model, id),
          state: row ? row.text : partProgress(model, id, { params: shopParams }).state,
          profile: sheet?.sketch?.profile || null,
          copies: row?.copies || 1,
        },
      ];
    });
  };
  const gateView =
    panel === 'shop-gate' && shopGate
      ? {
          ...shopGate,
          rows:
            shopGate.kind !== 'pick'
              ? []
              : shopGate.station === 'bend'
                ? gatePerPart(shopGate.ids.filter((id) => model.instances.some((i) => i.id === id)))
                : shopGate.ids
                    .filter((id) => model.instances.some((i) => i.id === id))
                    .map((id) => ({
                      instanceId: id,
                      name: nodeName(model, id),
                      state: partProgress(model, id, { params: shopParams }).state,
                      profile: sheetPartOf(model, id)?.sketch?.profile || null,
                    })),
        }
      : null;
  const gateGo = () => {
    if (shopGate?.go === 'part') {
      const sheet = sheetPartOf(model, shopGate.instanceId);
      select(shopGate.instanceId);
      if (sheet) setFeatureId(sheet.feature.id);
      return;
    }
    if (shopGate?.go) perform(() => goStation(shopGate.go));
  };
  // Add bend by numbers (More, and the search command): on the selected
  // sheet-metal part, else the shop subject's (SF-1 audit: never an error
  // line); several candidates go through Bend's own part gate, which then
  // opens the part's Add bend form; none says what makes one.
  const addBendOn = (instanceId) => {
    const sheet = sheetPartOf(model, instanceId);
    if (!sheet) return;
    select(instanceId);
    setFeatureId(sheet.feature.id);
    setPropertiesOpen(true);
    setAddBendFocus((n) => n + 1);
  };
  const addBendByNumbers = () => {
    if (sheetFeature) {
      setFeatureId(sheetFeature.id);
      setPanel(null);
      setPropertiesOpen(true);
      setAddBendFocus((n) => n + 1);
      return;
    }
    const entry = stationEntry(model, { station: 'bend', subject: currentSubject, params: shopParams });
    if (entry.open?.instanceId) return addBendOn(entry.open.instanceId);
    leaveStations();
    setPropertiesOpen(true);
    setShopGate(
      entry.pick
        ? { station: 'bend', kind: 'pick', ids: entry.pick, then: 'add-bend', lead: 'Which part gets the bend?' }
        : { station: 'bend', kind: 'blocked', ...entry.blocked },
    );
    setPanel('shop-gate');
  };
  // Draw → "Draw the outline": the sketcher on XY at the origin, back to Draw when saved.
  const drawOutline = () => {
    leaveStations();
    setOutlineNotice(null);
    pickSketchPlane('XY', 0, { returnTo: { panel: 'shop-draw' } });
  };
  // While Draw is open, the 3D view shows every outline on the XY plane
  // (docs/sketch-studio-outline-edit-sheet-nest.md §3.5): built only then,
  // once per outline set and chosen row; null on every other panel, so
  // nothing is drawn or computed there.
  const outlinesShown = panel === 'shop-draw' && !sketchSession && !film && shopSession?.station !== 'laser';
  const outlineView = useMemo(
    () => (outlinesShown ? shopOutlineView(model, sheetParameters || {}, drawnSketch) : null),
    // The outlines read the sketches, and the parts only to leave out the cut ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outlinesShown, model.sketches, model.parts, sheetParameters, drawnSketch],
  );
  const commands = [
    { tab: 'Sketch', label: 'New sketch', run: startSketchPick },
    {
      tab: 'Sketch',
      label: 'Import 2D profiles',
      run: () => setPanel('import-drafting'),
    },
    { tab: 'Sketch', label: 'Freehand drafting', run: onDrafting },
    {
      tab: 'Sketch',
      label: 'Sketch from fields',
      run: () => {
        setPanel('sketch');
        setSketchId(null);
      },
    },
    {
      tab: 'Sketch',
      label: 'Precision path',
      run: () => {
        const sketch = {
          id: uid('sketch'),
          name: 'Precision path',
          plane: 'XY',
          profile: { type: 'path', start: [0, 0], segments: [], closed: false },
          primitives: [],
          constrained: false,
        };
        commit({ ...model, sketches: [...model.sketches, sketch] });
        setSketchId(sketch.id);
        setSelectedId(null);
        setPanel('edit-sketch');
      },
    },
    { tab: 'Solid', label: 'Board / plate', run: () => addPart('board') },
    { tab: 'Solid', label: 'Tube / member', run: () => addPart('member') },
    { tab: 'Solid', label: 'Angle bar', run: () => addPart('angle') },
    { tab: 'Solid', label: 'Rear cover example', run: () => loadExample('cover') },
    { tab: 'Solid', label: 'Place holes', run: () => startHoleTool('place') },
    { tab: 'Solid', label: 'Move holes', run: () => startHoleTool('move') },
    ...['Solid', 'Assemble'].map((tab) => ({
      tab,
      label: 'Hardware library',
      run: () => {
        setHoleMode(null);
        setPanel('hardware');
        setPropertiesOpen(true);
      },
    })),
    ...[
      'extrude',
      'revolve',
      'sweep',
      'loft',
      'hole',
      'pocket',
      'union',
      'subtract',
      'intersect',
      'fillet',
      'chamfer',
      'shell',
      'mirror',
      'pattern',
      'trim',
      'transform',
    ].flatMap((type) => [
      { tab: 'Solid', label: type[0].toUpperCase() + type.slice(1), run: () => addFeature(type) },
      // Phase K: a straight row of equally spaced holes, right after Hole.
      ...(type === 'hole'
        ? [{ tab: 'Solid', label: 'Hole row', run: () => beginOperation('hole', null, { row: true }) }]
        : []),
    ]),
    {
      tab: 'Assemble',
      label: 'Duplicate instance',
      run: () => {
        // A group or several parts: copied with their groups and internal connections (§3.6).
        if (isBody) return duplicateBody();
        if (!instance) throw new Error('Select a part instance.');
        const copy = {
          ...clone(instance),
          id: uid('instance'),
          position: instance.position.map((v, i) => (i !== 0 ? v : typeof v === 'number' ? v + 100 : `(${v})+100`)),
        };
        commit({ ...model, instances: [...model.instances, copy] });
        select(copy.id);
      },
    },
    {
      tab: 'Assemble',
      label: 'Group',
      title: 'Group the selected parts so they move together (Ctrl+G)',
      run: groupSelection,
    },
    {
      tab: 'Assemble',
      label: 'Ungroup',
      title: 'Split the selected group one level (Ctrl+Shift+G)',
      run: ungroupSelection,
    },
    { tab: 'Assemble', label: 'Mate faces', current: true, run: startMate },
    { tab: 'Assemble', label: 'Measure', run: startMeasure },
    { tab: 'Assemble', label: 'Connections / welds', run: () => setPanel('connections') },
    {
      tab: 'Assemble',
      label: 'Move part',
      run: () => {
        setHoleMode(null);
        setMoveMode(true);
        setPanel(null);
      },
    },
    {
      tab: 'Assemble',
      label: 'Hide / show',
      run: () => {
        // A group: hide every member while any is visible, else show them all.
        if (isBody) return toggleBodyVisibility();
        if (instance) changeInstance({ ...instance, visible: instance.visible === false });
      },
    },
    { tab: 'Assemble', label: 'Isolate', run: () => setIsolated(!isolated) },
    {
      tab: 'Assemble',
      label: 'Exploded view',
      run: () => {
        if (!exploded) setMeasureSession(null);
        setExploded(!exploded);
      },
    },
    { tab: 'Assemble', label: 'Section', run: () => setSection(!section) },
    {
      tab: 'Assemble',
      label: 'Interference',
      current: true,
      run: async () => {
        setInspection({ source: model, items: await runtime.request('inspect') });
        setPanel('inspection');
      },
    },
    // Shop (docs/sketch-studio-fab-shop.md §9 SM-4 item 6): process order —
    // cut, the laser, bend (by numbers or on the brake), unfold, paint, print,
    // a bought-in item, the job sheet — then the examples.
    {
      tab: 'Shop',
      label: 'Cut from sheet',
      icon: 'ShopCut',
      title: 'Cut a flat blank from sheet stock: a rectangle, a sketch or the 2D drawing',
      // The outline is chosen in Draw now (docs/sketch-studio-shop-floor.md §4.5).
      run: () => goStation('draw'),
    },
    {
      tab: 'Shop',
      label: 'Laser',
      icon: 'ShopLaser',
      title: 'Put the selected sheet-metal blank on the laser: nest it on a stock sheet, check it and watch it cut',
      run: openLaser,
    },
    {
      tab: 'Shop',
      label: 'Add bend',
      icon: 'ShopBend',
      title: 'Add a bend to the selected sheet-metal part by its numbers',
      run: addBendByNumbers,
    },
    {
      tab: 'Shop',
      label: 'Press brake',
      icon: 'ShopBrake',
      title: 'Bend the selected sheet-metal part on a press brake: gauge it, set the angle, press the pedal',
      run: openPressBrake,
    },
    {
      tab: 'Shop',
      label: unfolded ? 'Fold' : 'Unfold',
      icon: 'ShopUnfold',
      title: 'Unfold the selected sheet-metal part to its flat blank, or fold it back',
      run: toggleUnfold,
    },
    {
      tab: 'Shop',
      label: 'Paint',
      icon: 'ShopPaint',
      title: 'Powder-coat or paint a part, or the whole group it is in, in a RAL or custom colour',
      run: startPaint,
    },
    {
      tab: 'Shop',
      label: 'Print',
      icon: 'ShopPrint',
      title: 'Print text or an image on a flat face: silk-screen, UV flatbed or pad print',
      run: startPrint,
    },
    {
      tab: 'Shop',
      label: 'Add bought-in item…',
      icon: 'ShopBox',
      title: 'A part the shop buys (a display, a lock, a fan): its size and colour, dropped in the view',
      run: () => {
        setPanel('bought-in');
        setPropertiesOpen(true);
      },
    },
    {
      tab: 'Shop',
      label: 'Job sheet',
      icon: 'ShopJob',
      title: 'The route of each product: cut, bend, paint, print, what was done and the estimated times',
      run: () => {
        setHoleMode(null);
        // The selected part's or group's product, else every product.
        setJobProduct(selectionMembers[0] ? topNode(model, selectionMembers[0]) : null);
        setPanel('job-sheet');
        setPropertiesOpen(true);
      },
    },
    {
      tab: 'Shop',
      label: 'Example: pump bracket',
      icon: 'ShopExample',
      title: 'The pump bracket channel cut from a flat A5052 blank and folded by two bends',
      run: () => loadExample('sheet-pump'),
    },
    {
      tab: 'Shop',
      label: 'Example: control box',
      icon: 'ShopBox',
      title: 'A powder-coated control box made the shop’s way: cut, bent, painted and printed, its lid on its body',
      run: () => loadExample('sheet-box'),
    },
    {
      tab: 'Shop',
      label: 'Example: kiosk',
      icon: 'ShopKiosk',
      title:
        'A double-sided screen kiosk like the shop’s photo, sized by eye: face frames, shelf and base as one frame, painted, printed and put together with its displays, covers and fasteners',
      run: () => loadExample('sheet-kiosk'),
    },
    {
      tab: 'Drawings',
      label: 'Sheets',
      title: 'Manage drawing sheets: draw a part, open, rename, duplicate or delete sheets',
      run: () => {
        setPanel('sheets');
        setPropertiesOpen(true);
      },
    },
    // The open sheet only (Phase S §7).
    { tab: 'Drawings', label: 'Generate views', current: true, run: () => requestDrawings() },
    {
      tab: 'Drawings',
      label: 'Dimension',
      run: () => {
        setDimensionTool(dimensionTool === 'linear' ? null : 'linear');
        setSplit(true);
        setPanel('sheet');
        setPropertiesOpen(true);
      },
    },
    { tab: 'Drawings', label: 'Sheet properties', run: () => setPanel('sheet') },
    {
      tab: 'Drawings',
      label: 'New engineering sheet',
      title:
        'A sheet of the 3D selection (part, group or parts) or the whole assembly, fitted to the page; opens its sheet if it has one',
      run: () => openOrCreateSheet(selectionSubject),
    },
    {
      tab: 'Drawings',
      label: 'Flat pattern sheet',
      icon: 'ShopFlat',
      title: 'A drawing of the selected sheet-metal part’s flat blank: bend lines, their labels and the bend table',
      run: openFlatSheet,
    },
    { tab: 'Drawings', label: 'Pump bracket example', run: () => loadExample('pump') },
    { tab: 'Drawings', label: 'SVG sheet', current: true, run: () => exportFile('svg') },
    { tab: 'Drawings', label: 'DXF sheet', current: true, run: () => exportFile('dxf') },
    {
      tab: 'Drawings',
      label: 'Section sheet',
      run: () => {
        const bounds = runtime.snapshot?.parts.find((p) => p.id === (sheet.partId || part?.id))?.bounds;
        const offset = bounds ? (bounds[0][0] + bounds[1][0]) / 2 : 1;
        const next = {
          ...clone(sheet),
          id: uid('sheet'),
          title: 'Section details',
          views: [{ name: 'Section A-A', view: 'right' }],
          annotations: [],
          section: { origin: [offset, 0, 0], normal: [1, 0, 0], side: 'negative' },
        };
        commit({ ...model, sheets: [...model.sheets, next] });
        setSheetId(next.id);
        setPanel('sheet');
        setSplit(true);
      },
    },
    {
      tab: 'Drawings',
      label: 'Exploded sheet',
      run: () => {
        const next = {
          ...clone(sheet),
          id: uid('sheet'),
          title: 'Exploded assembly',
          partId: undefined,
          section: undefined,
          annotations: [],
          views: ['exploded'],
          explodeDistance: 85,
        };
        commit({ ...model, sheets: [...model.sheets, next] });
        setSheetId(next.id);
        setPanel('sheet');
      },
    },
    {
      tab: 'Drawings',
      label: 'Add missing part sheets',
      title: 'A sheet for every part that has no plain sheet yet',
      run: () => {
        // Only parts with no plain sheet (Phase S §4), so a second click adds nothing.
        const added = model.parts
          .filter((p) => !findSheetFor(model, { partId: p.id }))
          .map((p) => {
            const base = clone(model.sheets[0]);
            // A plain part sheet whatever sheet 1 is.
            delete base.section;
            delete base.instanceIds;
            delete base.explodeDistance;
            return {
              ...base,
              id: uid('sheet'),
              partId: p.id,
              title: p.name,
              scaleMode: 'fit',
              views: ['front', 'top', 'right', 'isometric'],
              annotations: [{ id: uid('annotation'), type: 'part-number', partId: p.id }],
            };
          });
        const next = added.length ? commit({ ...model, sheets: [...model.sheets, ...added] }) : model;
        setSheetNotice({
          text: added.length
            ? `Added ${added.length} sheet${added.length === 1 ? '' : 's'}`
            : 'Every part already has a sheet',
          model: next,
        });
        setPanel('sheets');
        setPropertiesOpen(true);
      },
    },
    // Phase T: the choice of sheets is in the Sheets panel's Export PDF section.
    {
      tab: 'Drawings',
      label: 'Export PDF…',
      title: 'Save this sheet, chosen sheets or every sheet as one true-size PDF',
      current: true,
      exportType: 'pdf',
      busyLabel: LOADING_COPY.sheetPdfWorkshop,
      run: () => {
        setPanel('sheets');
        setPropertiesOpen(true);
        setPdfFocus((n) => n + 1);
      },
    },
    { tab: 'Manufacture', label: 'Cutting list', current: true, run: () => setPanel('cuts') },
    { tab: 'Manufacture', label: 'Fabrication settings', run: () => setPanel('fabrication') },
    { tab: 'Manufacture', label: 'Export CSV', current: true, run: () => exportFile('csv') },
    { tab: 'Manufacture', label: 'STEP assembly', current: true, run: () => exportFile('step') },
    { tab: 'Manufacture', label: 'STL part', current: true, run: () => exportFile('stl') },
    {
      tab: 'Manufacture',
      label: 'Workshop ZIP',
      current: true,
      exportType: 'zip',
      busyLabel: LOADING_COPY.workshopZip,
      run: () => exportFile('zip'),
    },
  ];
  // The ribbon's commands wait for any session (the route's stations have their own rule, routeBusy).
  const commandsOff =
    busy ||
    Boolean(operationDraft) ||
    Boolean(sketchSession) ||
    Boolean(mateSession) ||
    Boolean(brakeSession) ||
    Boolean(shopSession);
  // The route's More menu (§4.1): the Shop commands that are not stations,
  // run as they always were, and the Assemble tab's commands that put parts
  // together (docs/sketch-studio-shop-trim.md §4.3). A shop station open is
  // left first (they are panels, not tools); they wait like the stations do,
  // and Unfold — a view of the selected part — while any tool runs.
  const shopMore = [
    ['Add bend', 'Add bend by numbers'],
    [unfolded ? 'Fold' : 'Unfold'],
    // The Assemble tab's commands have no ribbon icon: the menu gives them one.
    ['Group', 'Group', 'Group'],
    ['Ungroup', 'Ungroup', 'Group'],
    ['Mate faces', 'Mate faces', 'Assemble'],
    ['Add bought-in item…'],
    ['Job sheet'],
    ['Flat pattern sheet'],
    ['Example: pump bracket'],
    ['Example: control box'],
    ['Example: kiosk'],
  ].map(([label, shown = label, icon = null]) => {
    const command = commands.find((c) => c.label === label);
    return {
      label: shown,
      title: command.title,
      icon: command.icon || icon,
      disabled:
        routeBusy || (command.current && !runtime.ready) || (command.icon === 'ShopUnfold' && Boolean(runningTool)),
      run: () => {
        if (openStation) leaveStations();
        perform(command.run);
      },
    };
  });
  const pickingFace = sketchSession?.stage === 'pick' || (mateSession && mateSession.stage !== 'placed');
  // Origin plane tiles: on an empty model at rest, and while picking where a new sketch goes.
  const planesShown =
    (model.parts.length === 0 &&
      !sketchSession &&
      !operationDraft &&
      !measureSession &&
      !mateSession &&
      !holeMode &&
      !brakeSession &&
      !shopSession) ||
    sketchSession?.stage === 'pick';
  useEffect(() => {
    if (!pickingFace) return;
    const keyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSketchSession(null);
      setMateSession(null);
      setPanel(null);
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [pickingFace]);
  // An open operation: Esc walks back one step (a sweep point, a loft
  // section, the axis pick) or cancels; Enter finishes a path / the sections,
  // else applies. A handle drag in the viewport handles its own keys first.
  const canApply = Boolean(operationDraft && !draftStale && !draftProblem && operationPreview.ready);
  useEffect(() => {
    if (!operationDraft) return;
    const keyDown = (event) => {
      if (event.defaultPrevented || editableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (viewport.current?.isDragging?.()) return;
      // A hole row (Phase K): ↑ / ↓ change the count in the direction stage
      // and in Shape (2 … 100; Shape keeps the spacing).
      const row = operationDraft.placement?.row;
      if (
        (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
        !draftStale &&
        ((row?.seed && operationDraft.placement.stage === 'place') ||
          (operationDraft.placement?.stage === 'shape' && operationDraft.feature?.row))
      ) {
        event.preventDefault();
        const next = changeRowCount(operationDraft, event.key === 'ArrowUp' ? 1 : -1, placementContext());
        if (next !== operationDraft) setOperationDraft(next);
        return;
      }
      // F: Flip side (Phase Q) while Hardware has chosen holes, choosing or seated.
      const p = operationDraft.placement;
      if (
        (event.code === 'KeyF' || event.key === 'f' || event.key === 'F') &&
        !event.repeat &&
        !event.shiftKey &&
        p?.tool === 'hardware' &&
        p.holes?.length &&
        (p.stage === 'place' || operationDraft.connections?.length)
      ) {
        event.preventDefault();
        flipOperationSide();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        const back = draftStale ? null : stepBack(operationDraft, placementContext());
        if (back) setOperationDraft(back);
        else cancelOperation();
      } else if (event.key === 'Enter') {
        // A focused, enabled control activates itself on Enter.
        const control = event.target instanceof HTMLElement ? event.target.closest('button, a, summary') : null;
        if (control && !control.disabled) return;
        // Enter in a hole row's direction stage takes the default row;
        // Hardware with chosen holes (Phase M) seats it in them.
        if (
          p?.stage === 'place' &&
          (['sweep', 'loft'].includes(p.tool) || p.row?.seed || (p.tool === 'hardware' && p.holes?.length))
        ) {
          event.preventDefault();
          finishOperationPlacement();
        } else if (canApply) {
          event.preventDefault();
          applyOperation();
        }
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });
  // Esc while measuring: drop the first point, else end the tool.
  useEffect(() => {
    if (!measureSession) return;
    const keyDown = (event) => {
      if (event.key !== 'Escape' || editableTarget(event.target)) return;
      event.preventDefault();
      if (viewport.current?.measureState?.().first) viewport.current.cancelMeasure();
      else {
        setMeasureSession(null);
        setPanel(null);
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [measureSession]);
  // The press brake: Enter or Space is the pedal (a focused control keeps its
  // own keys); Esc clears the pick (or a scrub), then leaves; F flips the
  // sheet and T turns it around (hands on the sheet §5.5). Keys never cut a
  // stroke short, and wait while a handle on the sheet is in the hand (its
  // Esc puts the sheet back and leaves the line picked).
  useEffect(() => {
    if (!brakeSession) return;
    const keyDown = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || editableTarget(event.target))
        return;
      if (viewport.current?.isDragging?.()) return;
      const control =
        event.target instanceof HTMLElement
          ? event.target.closest('button, a, summary, select, [role="button"]')
          : null;
      const act = brakeKeyAct(event, {
        setup: brakeSession.stage === 'setup' && Boolean(brake) && !brake.error,
        lined: actLined(brake, brakeSession),
        editable: editableTarget(event.target),
      });
      if (act) {
        event.preventDefault();
        brakeAct(act);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (brakeSession.stage !== 'setup') return;
        // An armed try (docs/sketch-studio-tight-bends.md §5.2) is put down first, the line kept.
        if (brakeSession.armed) changeBrake({ armed: null });
        else if (brakeSession.edge != null || brakeSession.points.length || brakeSession.scrub)
          changeBrake({ edge: null, points: [], scrub: null });
        else leavePressBrake();
      } else if ((event.key === 'Enter' || event.key === ' ') && !control && !event.repeat) {
        event.preventDefault();
        pressPedal();
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });
  // Mark coordinates and values for the Marks panel, as the model is shown.
  const markPoses = useMemo(() => modelPoses(model, runtime.snapshot), [model, runtime.snapshot]);
  // The open station, derived from the model, the kernel mesh and the picks
  // (§9 SM-3): the paint's targets and readouts, the print's checks.
  const paintView = (() => {
    if (shopSession?.station !== 'paint') return null;
    const s = shopSession;
    const finishes = new Map((model.finishes || []).map((f) => [f.instanceId, f]));
    const area = s.targets.reduce(
      (sum, id) => sum + meshArea(runtime.snapshot?.instances.find((i) => i.id === id)?.mesh),
      0,
    );
    const prints = printsOn(model, s.targets);
    const parts = [...new Set(s.targets.map((id) => model.instances.find((i) => i.id === id)?.partId))]
      .map((id) => model.parts.find((p) => p.id === id))
      .filter(Boolean);
    return {
      stage: s.stage,
      pending: s.pending,
      targetIds: s.targets,
      targets: s.targets.map((id) => ({ id, name: nodeName(model, id), finish: finishes.get(id) || null })),
      group: s.targets.length === 1 ? paintPick(model, s.targets[0]).group : null,
      finish: s.finish,
      numbers: paintNumbers({ area, kind: s.finish.kind, thickness: s.finish.thickness }),
      holes: parts.flatMap((p) => fillingHoles(p, model, sheetParameters || {})),
      prints,
      printParts: [...new Set(prints.map((p) => nodeName(model, p.instanceId)))].join(', '),
    };
  })();
  const printSelected =
    shopSession?.station === 'print' ? (model.prints || []).find((p) => p.id === shopSession.printId) : null;
  const printItem = printSelected ? runtime.snapshot?.instances.find((i) => i.id === printSelected.instanceId) : null;
  // The selected print's part mesh in its own frame, once per rebuild.
  const printMesh = useMemo(() => (printItem?.mesh ? localMesh(printItem) : null), [printItem]);
  const printView = (() => {
    if (shopSession?.station !== 'print') return null;
    const s = shopSession;
    const selected = s.stage === 'artwork' ? printSelected : null;
    let warnings = [];
    const notes = [];
    if (selected) {
      const placed = model.instances.find((i) => i.id === selected.instanceId);
      const definition = model.parts.find((p) => p.id === placed?.partId);
      const sheet = sheetMetalFeature(definition);
      let fold = null;
      try {
        fold =
          sheet && sheetParameters
            ? foldSheet(sheet, model.sketches.find((k) => k.id === sheet.sketchId)?.profile, sheetParameters)
            : null;
      } catch {
        fold = null;
      }
      warnings = printWarnings({ print: selected, mesh: printMesh, fold }).warnings;
      if (!(model.finishes || []).some((f) => f.instanceId === selected.instanceId))
        notes.push({
          code: 'bare',
          message: 'This part has no paint: the print is a bare-metal marking (in shop order it goes on after paint).',
        });
    }
    return {
      stage: s.stage,
      draft: s.draft,
      imageInfo: s.imageInfo,
      selected: selected ? { ...selected, label: printLabel(selected) } : null,
      selectedPart: selected ? nodeName(model, selected.instanceId) : '',
      warnings,
      notes,
      prints: (model.prints || []).map((p) => ({
        id: p.id,
        label: printLabel(p),
        parts: nodeName(model, p.instanceId),
      })),
    };
  })();
  // What the viewport picks for the open station, and draws: the parts the booth paints.
  const paintTargetKey = shopSession?.station === 'paint' ? shopSession.targets.join('|') : '';
  const shopPick = useMemo(() => {
    const s = shopSession;
    if (!s) return null;
    const hint = SHOP_HINTS[s.station]?.[s.stage] || '';
    if (s.station === 'paint')
      return {
        station: 'paint',
        stage: s.stage,
        pick: s.stage === 'confirm' ? null : 'part',
        hint,
        targets: paintTargetKey ? paintTargetKey.split('|') : [],
      };
    // The laser's bed covers the view: no viewport picks. The replay hands the view its own (filmPick).
    if (s.station === 'laser' || s.station === 'film') return null;
    return { station: 'print', stage: s.stage, pick: 'face', hint, printId: s.printId };
    // The fields of the session that change what the viewport picks or draws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSession?.station, shopSession?.stage, shopSession?.printId, paintTargetKey]);
  // While the replay plays nothing may change the model (§8): the undo and
  // redo chords and Delete are held back before any other handler sees them.
  useEffect(() => {
    if (!filmOn) return undefined;
    const hold = (event) => {
      if (editableTarget(event.target)) return;
      const key = String(event.key).toLowerCase();
      const chord = (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(key);
      if (!chord && key !== 'delete' && key !== 'backspace') return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', hold, true);
    return () => window.removeEventListener('keydown', hold, true);
  }, [filmOn]);
  // Esc at a station: one step back, then out (a print drag in the viewport takes it first).
  useEffect(() => {
    if (!shopSession) return;
    const keyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || editableTarget(event.target)) return;
      event.preventDefault();
      stepBackShop();
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });
  // The job sheet (jobSheet.js) while its panel is open: the route of every product.
  const jobView = useMemo(
    () =>
      panel === 'job-sheet'
        ? jobSheet(model, runtime.snapshot, { params: sheetParameters || {}, batch: jobBatch })
        : null,
    [panel, model, runtime.snapshot, sheetParameters, jobBatch],
  );
  const downloadJobSheet = () => download(new Blob([jobSheetCsv(jobView)], { type: 'text/csv' }), 'job-sheet.csv');
  // The cutting list's shop records (finishes, prints), when the model has any.
  const shopRows = useMemo(() => {
    try {
      return runtime.ready ? shopRecordRows(model, runtime.snapshot) : null;
    } catch {
      return null;
    }
  }, [model, runtime.ready, runtime.snapshot]);
  const rows = useMemo(() => {
    try {
      return runtime.ready ? buildCutList(model, runtime.snapshot) : [];
    } catch {
      return [];
    }
  }, [model, runtime.ready, runtime.snapshot]);
  // Projected views stay valid while only a sheet's annotations, title block
  // or parts-list setting change; anything that changes geometry or which
  // views are projected needs Generate views again. The cache holds each
  // sheet's own result (or error) with the definition it was projected from.
  const drawnEntry =
    drawings && sheet && sameDrawingSource(drawings.source, model) ? drawings.sheets.get(sheet.id) : null;
  const generated = drawnEntry?.result || null;
  const drawnSheet = drawnEntry?.sheet;
  const drawnCurrent = Boolean(drawnEntry) && sameDrawnSheet(drawnSheet, sheet);
  const activeDrawing =
    generated && drawnCurrent ? { ...sheet, bounds: generated.bounds, views: generated.views } : null;
  // The kernel refused this sheet as it is now: its own error, in place of its preview.
  const sheetError = drawnCurrent && drawnEntry.error ? drawnEntry.error : '';
  // Why the views on show are not this sheet's (a clear call to action).
  const drawingStale =
    !activeDrawing && !sheetError && drawings && sheet
      ? !drawnEntry
        ? drawings.sheets.has(sheet.id)
          ? 'The model changed'
          : 'This sheet has no views yet'
        : JSON.stringify(drawnSheet?.views) !== JSON.stringify(sheet.views)
          ? 'The view list changed'
          : ['partId', 'instanceIds'].some((k) => JSON.stringify(drawnSheet?.[k]) !== JSON.stringify(sheet[k]))
            ? 'The drawing subject changed'
            : 'The section or explode settings changed'
      : '';
  // Auto-generate on view (Phase S §7): a new sheet (pendingDrawings, as in
  // Phase R) once its model has rebuilt, and the open sheet whenever it has
  // no views yet (never generated) or its subject or view list changed, with
  // the split pane on and no operation open. Each sheet is tried once per
  // model, so an error or an empty projection never loops; Update drawing
  // preview and Refresh drawings still retry by hand.
  const autoDrawing =
    Boolean(sheet) && !activeDrawing && !sheetError && (!drawings || AUTO_DRAWING_REASONS.includes(drawingStale));
  useEffect(() => {
    if (!runtime.ready || busy) return;
    const tried = (id) => {
      const source = autoDrawn.current.get(id);
      return (
        sameDrawingSource(source, model) &&
        sameDrawnSheet(
          source.sheets.find((s) => s.id === id),
          model.sheets.find((s) => s.id === id),
        )
      );
    };
    // After the new sheet's commit reaches this component.
    if (pendingDrawings && model.sheets.some((s) => s.id === pendingDrawings)) {
      const id = pendingDrawings;
      setPendingDrawings(null);
      autoDrawn.current.set(id, model);
      perform(() => requestDrawings([id]));
      return;
    }
    // A new sheet still on its way: not the sheet shown meanwhile.
    if (pendingDrawings && pendingDrawings === sheetId) return;
    if (!autoDrawing || !split || operationDraft || tried(sheet.id)) return;
    autoDrawn.current.set(sheet.id, model);
    perform(() => requestDrawings([sheet.id]));
    // requestDrawings reads this render's model and sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDrawings, runtime.ready, busy, model, sheetId, sheet, autoDrawing, split, operationDraft]);
  // The preview draws a slider's draft scale, and an overflowing fixed scale
  // with the view flagged (exports still refuse it).
  const draftScale = scaleDraft && scaleDraft.sheetId === sheet?.id ? scaleDraft.scale : null;
  const previewSheet =
    activeDrawing && draftScale != null ? { ...activeDrawing, scaleMode: 'fixed', scale: draftScale } : activeDrawing;
  let svg = '',
    drawingError = sheetError,
    drawingFit = null,
    drawingParts = [];
  if (previewSheet) {
    try {
      drawingParts = layoutParts(previewSheet, model, runtime.snapshot);
      // Its page number is its place in the model (only this sheet is generated).
      svg = sheetSvg(previewSheet, model, runtime.snapshot, model.sheets.indexOf(sheet) + 1, model.sheets.length, {
        allowOverflow: true,
      });
      drawingFit = sheetFit(previewSheet, previewSheet.views, { parts: drawingParts });
    } catch (e) {
      svg = '';
      drawingError = e.message;
    }
  }
  const overflowing = drawingFit && !drawingFit.fits ? drawingFit.views.find((v) => !v.fits) : null;
  const onScaleDraft = (scale) => setScaleDraft(scale == null ? null : { sheetId: sheet.id, scale });
  // The last PDF's result line, while the model is the one it was made from.
  const pdfNoticeShown = pdfNotice?.model === model ? pdfNotice : null;
  // The Sheets panel's page and scale per sheet: the resolved scale once its
  // views are current, else Fit or the fixed ratio.
  const sheetScales = () =>
    new Map(
      model.sheets.map((s) => {
        const entry = drawings && sameDrawingSource(drawings.source, model) ? drawings.sheets.get(s.id) : null;
        const views = entry?.result && sameDrawnSheet(entry.sheet, s) ? entry.result.views : null;
        let scale = '—';
        try {
          scale = views
            ? scaleLabel(resolveSheetScale(s, views, layoutParts(s, model, runtime.snapshot)))
            : s.scaleMode === 'fit'
              ? 'Fit'
              : scaleLabel(numeric(s.scale));
        } catch {
          // An unreadable scale reads "—".
        }
        return [s.id, `${s.size || 'A3'} · ${scale}`];
      }),
    );
  // A tree row's "Draw <name>" icon (Drawings tab only, Phase S §6): opens
  // or creates that subject's sheet without touching the 3D selection.
  const drawButton = (name, subject) => (
    <button
      type="button"
      className="cad-tree-draw"
      aria-label={`Draw ${name}`}
      title="Open or create a drawing sheet of this part"
      disabled={busy || Boolean(operationDraft)}
      onClick={(e) => {
        e.stopPropagation();
        drawNode(subject);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Icon name="Drawings" />
    </button>
  );
  return (
    <FieldContexts parameters={parameterContext} channel={fieldMeta}>
      <section ref={workspaceElement} className="cad-workspace" aria-label="Sketch Studio solid modeling">
        <header className="cad-header">
          <Link to="/" className="cad-brand" aria-label="Back to home" title="Back to home">
            <Icon name="Solid" />
            <span>
              SKETCH STUDIO<small>Model & workshop</small>
            </span>
          </Link>
          <input
            className="cad-document-name"
            aria-label="Model document name"
            key={document.id + document.name}
            defaultValue={document.name}
            onBlur={(e) => commitDocumentName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <div className="cad-file-actions" role="group" aria-label="Model file operations">
            {/* The replay (§8) changes nothing: what would replace or change the model waits for it. */}
            <button disabled={Boolean(film)} onClick={newSketch}>
              New
            </button>
            <button disabled={Boolean(film)} onClick={openSketch}>
              Open
            </button>
            <button onClick={saveSketch}>Save</button>
            <button onClick={saveSketchAs}>Save as</button>
            <button disabled={!canUndo || Boolean(film)} onClick={undo}>
              Undo
            </button>
            <button disabled={!canRedo || Boolean(film)} onClick={redo}>
              Redo
            </button>
            <button onClick={onDrafting}>2D drafting</button>
          </div>
        </header>
        <nav className="cad-tabs" aria-label="Modeling ribbon">
          <div className="cad-tab-buttons">
            {tabs.map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => {
                  setTab(t);
                  setSearch('');
                  // The Drawings tab opens on its sheets when Properties shows nothing else;
                  // the Shop tab on an empty model opens Draw (shop floor §4.4).
                  if (t === 'Drawings' && tab !== t && !panel && !part && !isBody && model.parts.length)
                    setPanel('sheets');
                  if (t === 'Shop' && tab !== t && !panel && !model.parts.length && !runningTool) goStation('draw');
                }}
              >
                <Icon name={t} />
                {t}
              </button>
            ))}
          </div>
          <input
            aria-label="Search commands"
            placeholder="Search commands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </nav>
        <div className={`cad-ribbon${tab === 'Shop' && !search ? ' is-route' : ''}`}>
          {tab === 'Shop' && !search ? (
            // The Shop tab's ribbon is its route (docs/sketch-studio-shop-floor.md §4.1); search still finds the commands.
            <ShopRoute
              progress={shopProgress}
              open={openStation}
              disabled={routeBusy}
              subject={shopSubjectName}
              more={shopMore}
              replay={{
                playing: Boolean(film),
                disabled: film ? false : Boolean(replayReason) || routeBusy || Boolean(pendingStation),
                title: film
                  ? 'End the replay: back to where you were (Esc)'
                  : replayReason ||
                    `Watch ${productName || 'the product'} being made, from flat sheet to the finished product, in the shop's order. Nothing in the model changes.`,
                run: () => perform(() => (film ? endFilm() : startFilm())),
              }}
              onStation={(key) => perform(() => goStation(key))}
              Icon={Icon}
            />
          ) : (
            commands
              .filter((c) => (search ? c.label.toLowerCase().includes(search.toLowerCase()) : c.tab === tab))
              .map((c) => (
                <BusyButton
                  key={c.label}
                  busy={Boolean(c.exportType) && exportingType === c.exportType}
                  busyLabel={c.busyLabel}
                  title={c.title}
                  disabled={commandsOff || (c.current && !runtime.ready)}
                  onClick={() => perform(c.run)}
                >
                  <Icon name={c.icon || c.tab} />
                  {c.label}
                </BusyButton>
              ))
          )}
        </div>
        <div className="cad-main">
          {treeOpen && (
            <aside className="cad-tree">
              <div className="cad-panel-heading">
                {tab === 'Shop' ? (
                  // The Shop tab's left pane: the job board or the tree (§4.2).
                  <span className="cad-segmented cad-pane-switch" role="group" aria-label="Left pane">
                    {[
                      ['job', 'Job'],
                      ['tree', 'Tree'],
                    ].map(([key, label]) => (
                      <button key={key} type="button" aria-pressed={leftPane === key} onClick={() => setLeftPane(key)}>
                        {label}
                      </button>
                    ))}
                  </span>
                ) : (
                  'PARTS & FEATURES'
                )}
                <button aria-label="Collapse parts panel" onClick={() => setTreeOpen(false)}>
                  ‹
                </button>
              </div>
              {jobShown ? (
                <JobBoard
                  board={jobBoard}
                  params={shopParams}
                  selected={currentSubject?.instanceId || null}
                  inert={jobInert}
                  disabled={routeBusy}
                  onRow={jobRowClick}
                  onTree={() => setLeftPane('tree')}
                  onDraw={() => perform(() => goStation('draw'))}
                />
              ) : (
                <fieldset
                  className="cad-tree-body"
                  disabled={Boolean(sketchSession || mateSession || brakeSession || shopSession)}
                >
                  <button
                    className="cad-wide"
                    onClick={() => {
                      setParameterNotice('');
                      setPanel('parameters');
                    }}
                  >
                    Named parameters <span>{model.parameters.length}</span>
                  </button>
                  <details open>
                    <summary>Assembly · {model.instances.length} instances</summary>
                    {treeRows(model).map(function treeRow(row) {
                      if (row.kind === 'group') {
                        const { group } = row;
                        // Collapsed by hand, unless it holds the selection.
                        const expanded =
                          !collapsedGroups.has(row.id) || liveSelection.some((id) => contains(model, row.id, id));
                        return (
                          <div key={row.id} className="cad-tree-node" style={{ '--cad-tree-depth': row.depth }}>
                            {renaming?.id === row.id ? (
                              <input
                                className="cad-tree-rename"
                                aria-label="Rename group"
                                autoFocus
                                value={renaming.value}
                                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename();
                                  if (e.key === 'Escape') setRenaming(null);
                                }}
                              />
                            ) : (
                              <div className="cad-tree-group-row">
                                <button
                                  type="button"
                                  className="cad-tree-caret"
                                  aria-expanded={expanded}
                                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.name}`}
                                  onClick={() =>
                                    setCollapsedGroups((collapsed) => {
                                      const next = new Set(collapsed);
                                      if (expanded) next.add(row.id);
                                      else next.delete(row.id);
                                      return next;
                                    })
                                  }
                                >
                                  {expanded ? '▾' : '▸'}
                                </button>
                                <button
                                  className={`cad-tree-item cad-tree-group ${liveSelection.includes(row.id) ? 'is-selected' : ''} ${openGroup === row.id ? 'is-open' : ''}`}
                                  title="Click to select the group · double-click or F2 to rename · Shift+click to add to the selection"
                                  onClick={(e) => treeClick(row.id, e)}
                                  onDoubleClick={() => setRenaming({ id: row.id, value: group.name })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'F2') {
                                      e.preventDefault();
                                      setRenaming({ id: row.id, value: group.name });
                                    }
                                  }}
                                >
                                  <Icon name="Group" />
                                  <span>
                                    {group.name}
                                    <small>
                                      {row.count} parts{row.hidden ? ' · hidden' : ''}
                                    </small>
                                  </span>
                                </button>
                                {tab === 'Drawings' &&
                                  drawButton(group.name, {
                                    instanceIds: memberIds(model, [group.id]),
                                    title: group.name,
                                  })}
                              </div>
                            )}
                            {expanded && (
                              <div className="cad-tree-children" role="group" aria-label={`${group.name} members`}>
                                {row.children.map(treeRow)}
                              </div>
                            )}
                          </div>
                        );
                      }
                      const i = row.instance;
                      const p = model.parts.find((p) => p.id === i.partId);
                      const item = (
                        <button
                          className={`cad-tree-item ${liveSelection.includes(i.id) ? 'is-selected' : ''}`}
                          title="Double-click or F2 to rename"
                          onClick={(e) => treeClick(i.id, e)}
                          onDoubleClick={() => setRenaming({ id: i.id, value: i.name || p?.name || '' })}
                          onKeyDown={(e) => {
                            if (e.key === 'F2') {
                              e.preventDefault();
                              setRenaming({ id: i.id, value: i.name || p?.name || '' });
                            }
                          }}
                        >
                          <Icon name="Solid" />
                          <span>
                            {i.name || p?.name || 'Broken part'}
                            <small>
                              {i.partId}
                              {i.visible === false ? ' · hidden' : ''}
                            </small>
                          </span>
                        </button>
                      );
                      return (
                        <div key={i.id} className="cad-tree-node" style={{ '--cad-tree-depth': row.depth }}>
                          {renaming?.id === i.id ? (
                            <input
                              className="cad-tree-rename"
                              aria-label="Rename part"
                              autoFocus
                              value={renaming.value}
                              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') setRenaming(null);
                              }}
                            />
                          ) : tab === 'Drawings' ? (
                            <div className="cad-tree-group-row">
                              {item}
                              {drawButton(i.name || p?.name || 'part', { partId: i.partId })}
                            </div>
                          ) : (
                            item
                          )}
                          {selectedId === i.id && (
                            <div className="cad-feature-list">
                              {p?.features.map((f, index) => (
                                <div key={f.id} className="cad-feature-row">
                                  <button
                                    className={feature?.id === f.id ? 'is-selected' : ''}
                                    onClick={() => {
                                      setFeatureId(f.id);
                                      setPanel(null);
                                    }}
                                  >
                                    {index + 1}. {f.type}
                                    {f.type === 'sheetmetal'
                                      ? ` · ${madeBends(f.bends || []).length} bend${madeBends(f.bends || []).length === 1 ? '' : 's'}`
                                      : ''}
                                    {f.operation === 'cut' ? ' (cut)' : ''}
                                    {f.suppressed ? ' (suppressed)' : ''}
                                    {runtime.error?.featureId === f.id ? ' ⚠' : ''}
                                  </button>
                                  {f.sketchId && model.sketches.some((s) => s.id === f.sketchId) && (
                                    <button
                                      className="cad-feature-sketch"
                                      aria-label={`Edit sketch of feature ${index + 1}`}
                                      title={model.sketches.find((s) => s.id === f.sketchId)?.name}
                                      onClick={() =>
                                        perform(() =>
                                          editSketch(
                                            f.sketchId,
                                            // A sheet-metal blank comes back to this part with its feature open (§3.3).
                                            f.type === 'sheetmetal'
                                              ? { returnTo: { panel: 'part', instanceId: i.id, featureId: f.id } }
                                              : {},
                                          ),
                                        )
                                      }
                                    >
                                      ↳ Edit sketch
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </details>
                  <details open>
                    <summary>Part sketches · {model.sketches.length}</summary>
                    {model.sketches.map((s) => (
                      <button
                        className="cad-wide"
                        key={s.id}
                        onClick={() => {
                          setSketchId(s.id);
                          setSelectedId(null);
                          setPanel('edit-sketch');
                        }}
                      >
                        {s.name}
                        {s.constrained ? ' · constrained' : ''}
                      </button>
                    ))}
                  </details>
                  <details>
                    <summary>Reusable definitions · {model.parts.length}</summary>
                    {model.parts.map((p) => (
                      <button
                        className="cad-wide"
                        key={p.id}
                        title="Place an instance of this definition"
                        onClick={() => {
                          const i = {
                            id: uid('instance'),
                            partId: p.id,
                            name: p.name,
                            position: [0, 0, 0],
                            rotation: [0, 0, 0],
                            visible: true,
                          };
                          commit({ ...model, instances: [...model.instances, i] });
                          select(i.id);
                        }}
                      >
                        + {p.name}
                      </button>
                    ))}
                  </details>
                  <details>
                    <summary>Example designs</summary>
                    {[
                      ['table', 'Welded tube table'],
                      ['pipe', 'Round tube table'],
                      ['desk', 'Wooden desk'],
                      ['bookshelf', 'Bookshelf'],
                      ['bracket', 'Mechanical bracket'],
                      ['pump', 'Pump bracket drawing study'],
                    ].map(([id, name]) => (
                      <button className="cad-wide" key={id} onClick={() => perform(() => loadExample(id))}>
                        {name}
                      </button>
                    ))}
                  </details>
                  <button className="cad-wide" onClick={() => setPanel('advanced')}>
                    Model data & references
                  </button>
                </fieldset>
              )}
            </aside>
          )}
          <div className="cad-center">
            {/* While the replay plays the view settings stand as they were (it puts them back exactly): orbit, pan and zoom still work. */}
            <div className="cad-view-toolbar" inert={film ? true : undefined} data-film={film ? '' : undefined}>
              {!treeOpen && <button onClick={() => setTreeOpen(true)}>Parts ›</button>}
              <select aria-label="Standard view" value={view} onChange={(e) => setView(e.target.value)}>
                {['isometric', 'front', 'rear', 'top', 'bottom', 'left', 'right'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <button aria-pressed={perspective} onClick={() => setPerspective(!perspective)}>
                {perspective ? 'Perspective' : 'Orthographic'}
              </button>
              <button onClick={() => setFitKey(fitKey + 1)}>Fit</button>
              <span className="cad-segmented" role="group" aria-label="See-through mode">
                {[VIEW_MODES.SOLID, VIEW_MODES.XRAY, VIEW_MODES.WIREFRAME].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={viewMode === mode}
                    aria-label={VIEW_MODE_COPY[mode].ariaLabel}
                    title={VIEW_MODE_COPY[mode].title}
                    onClick={() => setViewMode(mode)}
                  >
                    {VIEW_MODE_COPY[mode].label}
                  </button>
                ))}
              </span>
              {/*
                At the press brake (hands on the sheet §5.1) the toolbar speaks sheet: the model's
                part commands (Unfold, Move / Rotate part, Flip Horizontal / Vertical, the hole tools,
                Measure and their option rows) give way to Flip over and Turn around, where Flip
                Horizontal / Vertical stood. Hovering or focusing one lights its handle on the sheet.
              */}
              {brakeSession ? (
                <span className="cad-segmented cad-sheet-acts" role="group" aria-label="Sheet">
                  {[
                    [
                      'flip',
                      'Flip over',
                      'Flip the sheet over: the machine always bends up, so a bend down is made with the sheet turned over (F)',
                      false,
                    ],
                    [
                      'turn',
                      'Turn around',
                      brakeLined
                        ? 'Turn the sheet around: the other side of the punch line goes to the backgauge (T)'
                        : 'Pick the punch line first',
                      !brakeLined,
                    ],
                  ].map(([kind, label, title, needsLine]) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={kind === 'flip' ? Boolean(brakeSession.flip) : undefined}
                      aria-keyshortcuts={GRIP_KEYS[kind]}
                      disabled={needsLine || brakeSession.stage !== 'setup' || !brakeView}
                      title={
                        brakeSession.stage === 'stroke'
                          ? 'Wait for the stroke to finish'
                          : !brakeView
                            ? 'This blank cannot go on the press brake: the panel says why'
                            : title
                      }
                      onClick={() => brakeAct(kind)}
                      onPointerEnter={() => viewport.current?.lightBrakeHand?.(kind)}
                      onPointerLeave={() => viewport.current?.lightBrakeHand?.(null)}
                      onFocus={() => viewport.current?.lightBrakeHand?.(kind)}
                      onBlur={() => viewport.current?.lightBrakeHand?.(null)}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              ) : (
                <>
                  {sheetFeature && (
                    <button
                      type="button"
                      aria-pressed={unfolded}
                      disabled={!sheetFold?.bends.length || Boolean(runningTool)}
                      title={
                        sheetFold?.bends.length
                          ? 'Unfold the sheet-metal part to its flat blank with its bend lines, or fold it back (view only)'
                          : 'Add a bend first: this part is the flat blank'
                      }
                      onClick={() => perform(toggleUnfold)}
                    >
                      {unfolded ? 'Fold' : 'Unfold'}
                    </button>
                  )}
                  {[
                    [
                      'translate',
                      'Move part',
                      'Drag the center handle freely in the screen plane, a plane square, or an axis arrow (M)',
                    ],
                    [
                      'rotate',
                      'Rotate part',
                      'Drag the red, green or blue ring around the centre to turn the part about X, Y or Z; Alt turns freely (R)',
                    ],
                  ].map(([mode, label, title]) => (
                    <button
                      key={mode}
                      aria-pressed={moveMode && gizmo === mode}
                      onClick={() => chooseGizmo(mode)}
                      title={title}
                    >
                      {label}
                    </button>
                  ))}
                  {['horizontal', 'vertical'].map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      disabled={!placeable}
                      title={
                        moveHint ||
                        (direction === 'horizontal'
                          ? 'Turn the selected part 180° around the vertical (Z) axis, in place'
                          : 'Turn the selected part upside down about its longer horizontal side, in place')
                      }
                      onClick={() =>
                        perform(() => {
                          if (latestModel.current !== model) throw new Error('The model changed. Try again.');
                          // A group flips about the union of its members' boxes, around its centre.
                          if (isBody) {
                            const bounds = bodyBounds();
                            return commit(
                              rotateInstancesAbout(
                                model,
                                bodyMovers(),
                                flipAxis(direction, bounds),
                                180,
                                boxCentre(bounds),
                                runtime.snapshot.parameters,
                              ),
                            );
                          }
                          const bounds = viewport.current.getInstanceBounds(selectedId);
                          commit(
                            flipInstance(
                              model,
                              selectedId,
                              flipAxis(direction, bounds),
                              bounds,
                              runtime.snapshot.parameters,
                            ),
                          );
                        })
                      }
                    >
                      Flip {direction === 'horizontal' ? 'Horizontal' : 'Vertical'}
                    </button>
                  ))}
                  <button
                    disabled={
                      !part ||
                      !runtime.ready ||
                      Boolean(operationDraft) ||
                      Boolean(sketchSession) ||
                      Boolean(mateSession) ||
                      Boolean(brakeSession) ||
                      Boolean(shopSession) ||
                      busy
                    }
                    aria-pressed={holeMode === 'place'}
                    onClick={() => perform(() => startHoleTool('place'))}
                  >
                    Place holes
                  </button>
                  <button
                    disabled={
                      !part ||
                      !runtime.ready ||
                      Boolean(operationDraft) ||
                      Boolean(sketchSession) ||
                      Boolean(mateSession) ||
                      Boolean(brakeSession) ||
                      Boolean(shopSession) ||
                      busy
                    }
                    aria-pressed={holeMode === 'move'}
                    onClick={() => perform(() => startHoleTool('move'))}
                  >
                    Move holes
                  </button>
                  <button
                    className="cad-measure-button"
                    aria-pressed={measuring}
                    disabled={!measuring && measureBlocked}
                    title="Click two points to measure and leave a dimension mark (D)"
                    onClick={() => (measuring ? endMeasure() : perform(startMeasure))}
                  >
                    Measure
                  </button>
                  {measuring && <button onClick={endMeasure}>Done measuring</button>}
                </>
              )}
              {marks.length > 0 && (
                <button
                  aria-pressed={!hideMarks}
                  title="Show or hide the dimension marks"
                  onClick={() => setHideMarks(!hideMarks)}
                >
                  Show marks
                </button>
              )}
              {holeMode && !brakeSession && (
                <>
                  <label>
                    Hole snap (mm){' '}
                    <NumericInput
                      aria-label="Hole snap (mm)"
                      min="0"
                      step="0.1"
                      value={holeSnap}
                      onCommit={(v) => setHoleSnap(Math.max(0, v))}
                      title="0 for free placement"
                    />
                  </label>
                  <button
                    onClick={() => {
                      setHoleMode(null);
                      setPanel(null);
                    }}
                  >
                    Done placing holes
                  </button>
                </>
              )}
              {moveMode && gizmo === 'rotate' && !brakeSession && (
                <>
                  <span className="cad-segmented" role="group" aria-label="Rotation space">
                    {[
                      ['world', 'World', 'Rings and 90° turns use the world X, Y and Z axes'],
                      ['local', 'Local', "Rings and 90° turns use the selected part's own X, Y and Z axes"],
                    ].map(([space, label, title]) => (
                      <button
                        key={space}
                        type="button"
                        aria-pressed={(isBody ? 'world' : rotateSpace) === space}
                        // A group has no axes of its own (§3.5).
                        disabled={isBody && space === 'local'}
                        title={isBody && space === 'local' ? GROUP_COPY.localDisabled : title}
                        onClick={() => setRotateSpace(space)}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                  {['X', 'Y', 'Z'].map((name) => (
                    <button
                      key={name}
                      className={`cad-axis-${name.toLowerCase()}`}
                      disabled={!placeable}
                      title={
                        moveHint ||
                        `Turn 90° about the ${rotateSpace === 'local' && !isBody ? "part's own " : ''}${name} axis · Shift+click turns the other way` +
                          (name === 'Z'
                            ? ' · ] and [ turn by the angle snap'
                            : name === 'X'
                              ? ' · Shift+] and Shift+[ turn by the angle snap'
                              : '')
                      }
                      onClick={(event) => turnSelected(name, event.shiftKey ? -90 : 90)}
                    >
                      {name} 90°
                    </button>
                  ))}
                  <span className="cad-segmented" role="group" aria-label="Angle snap">
                    {ROTATE_SNAPS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={rotateSnap === value}
                        title={value ? `Snap ring turns to ${value}° steps · hold Alt to turn freely` : 'Turn freely'}
                        onClick={() => setRotateSnap(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                  <label>
                    Angle snap (°){' '}
                    <NumericInput
                      aria-label="Rotate snap (degrees)"
                      min="0"
                      step="1"
                      value={rotateSnap}
                      onCommit={(v) => setRotateSnap(Math.max(0, v))}
                      title="A custom step; 0 for free rotation"
                    />
                  </label>
                  <span className="cad-segmented" role="group" aria-label="Rotate about">
                    {[
                      ['centre', 'Centre', "Turn about the part's bounding-box centre"],
                      ['picked', 'Picked point', 'Click a point on the selected part to turn about it; corners snap'],
                    ].map(([about, label, title]) => (
                      <button
                        key={about}
                        type="button"
                        aria-pressed={rotateAbout === about}
                        title={title}
                        onClick={() => setRotateAbout(about)}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                </>
              )}
              {moveMode && gizmo === 'translate' && !brakeSession && (
                <label>
                  Snap (mm){' '}
                  <NumericInput
                    aria-label="Move snap (mm)"
                    min="0"
                    step="1"
                    value={moveSnap}
                    onCommit={(v) => setMoveSnap(Math.max(0, v))}
                    title="0 for free movement"
                  />
                </label>
              )}
              <button aria-pressed={split} onClick={() => setSplit(!split)}>
                Split drawing
              </button>
              {section && (
                <label>
                  Section Z <NumericInput aria-label="Section depth" value={sectionDepth} onCommit={setSectionDepth} />
                </label>
              )}
              {!propertiesOpen && <button onClick={() => setPropertiesOpen(true)}>‹ Properties</button>}
            </div>
            <div
              className={`cad-views ${split ? 'is-split' : ''} ${split && tab === 'Drawings' ? 'is-drawing-focus' : ''}`}
            >
              <div className="cad-model-view">
                <CadViewport
                  ref={viewport}
                  snapshot={displayPreview ? operationPreview.snapshot : runtime.snapshot}
                  ready={displayPreview ? operationPreview.ready : runtime.ready}
                  focusTarget={focusTarget}
                  // The replay (§8) shows the model with only the records made so far, the
                  // product whole and plain (no selection look, isolation, explode or section);
                  // the workspace's own settings stand untouched and return when it ends.
                  model={film ? filmView.model : displayPreview ? draftModel : model}
                  selectedId={film ? null : selectedId}
                  selectedIds={film ? NO_IDS : selectionMembers}
                  movingKey={film ? null : movingKey}
                  onSelect={pickInstance}
                  isolated={film ? false : isolated}
                  view={view}
                  perspective={perspective}
                  viewMode={viewMode}
                  exploded={film ? false : exploded}
                  section={film ? null : section ? sectionDepth : null}
                  film={filmCamera}
                  fitKey={fitKey}
                  previewShown={displayPreview}
                  moveEnabled={moveMode && placeable && !unfolded}
                  transformMode={gizmo}
                  rotateSnap={rotateSnap}
                  rotateSpace={isBody ? 'world' : rotateSpace}
                  pivotPick={rotateAbout === 'picked'}
                  holeMode={
                    !operationDraft && !brakeSession && !shopSession && !exploded && !section && !busy ? holeMode : null
                  }
                  onPlaceHole={(point, normal, planar, options) =>
                    perform(() => placeHole(point, normal, planar, options))
                  }
                  onMoveHole={(id, point, index) => perform(() => moveHole(id, point, index))}
                  onCancelHole={() => {
                    setHoleMode(null);
                    setPanel(null);
                  }}
                  moveSnap={moveSnap}
                  moveHint={moveHint}
                  onMove={(id, delta) =>
                    perform(() => {
                      if (latestModel.current !== model) throw new Error('The model changed. Try the move again.');
                      // The group or multi-selection key: its rigid movers, as one body.
                      if (isBody && id === movingKey) return commit(translateInstances(model, bodyMovers(), delta));
                      commit(translateInstance(model, id, delta));
                    })
                  }
                  onRotate={(id, turn, center) =>
                    perform(() => {
                      if (latestModel.current !== model) throw new Error('The model changed. Try the turn again.');
                      if (isBody && id === movingKey)
                        return commit(turnInstances(model, bodyMovers(), turn, center, runtime.snapshot.parameters));
                      commit(turnInstance(model, id, turn, center, runtime.snapshot.parameters));
                    })
                  }
                  sketchMode={sketchSession?.stage || (mateSession && mateSession.stage !== 'placed' ? 'pick' : null)}
                  planes={{ visible: planesShown, offset: sketchSession?.stage === 'pick' ? planeDraft.offset : 0 }}
                  onPickSketchPlane={(plane, offset) => perform(() => pickSketchPlane(plane, offset))}
                  sketchSupportId={sketchSession?.support?.instanceId || null}
                  pickHint={
                    mateSession?.stage === 'moving'
                      ? 'Mate: click a flat face on the part to move · Esc cancels'
                      : mateSession?.stage === 'target'
                        ? 'Mate: click the face it should sit against, on another part · Esc cancels'
                        : undefined
                  }
                  onPickSketchFace={(info) => perform(() => (mateSession ? pickMateFace(info) : pickSketchFace(info)))}
                  marks={marks}
                  measureMode={measuring}
                  selectedMarkId={selectedMarkId}
                  hideMarks={hideMarks || Boolean(film)}
                  onMeasure={addMark}
                  onSelectMark={(id) => {
                    setSelectedMarkId(id);
                    setPanel('marks');
                    setPropertiesOpen(true);
                  }}
                  placement={placementShown}
                  onPlace={placeOperation}
                  onPlacementDrag={dragOperation}
                  onPlacementFinish={finishOperationPlacement}
                  sheetView={displayPreview ? null : sheetView}
                  brakeView={film ? filmSceneView?.brake || null : brakeView}
                  onBrakeStrokeEnd={brakeStrokeEnd}
                  brakeGrip={film ? null : brakeGrip}
                  onBrakeGrip={brakeAct}
                  onBrakeGripWant={wantBrakeHand}
                  onBrakeEdge={pickBrakeEdge}
                  onBrakeFingers={brakeFingers}
                  onBrakeFocus={focusBrake}
                  shopPick={film ? filmPick : shopPick}
                  onShopPick={(info) => perform(() => pickShop(info))}
                  onShopPrintMove={(id, origin) => perform(() => movePrint(id, origin))}
                  filmHidden={filmHidden}
                  shopOutlines={outlineView}
                />
                {film && filmSceneView?.laser && (
                  <LaserBed
                    key={filmSceneView.token}
                    station={filmSceneView.laser.station}
                    session={{ stage: 'cutting', run: { token: filmSceneView.token }, cut: false, view: film.view }}
                    watch={filmSceneView.laser.watch}
                    clock={filmSceneView.laser.clock}
                    onDone={() => {}}
                    onView={(view) => filmUpdate(null, () => ({ view }))}
                  />
                )}
                {film && <FilmCaption film={film} bar={filmBar} />}
                {panelShown && (
                  <PanelPreview
                    draft={panelDraft}
                    face={panelFace}
                    result={panelResult}
                    onEdge={panelEdge}
                    onFace={panelCrease}
                  />
                )}
                {brakeView && (
                  <FlatPatternMap
                    station={brake}
                    session={brakeSession}
                    disabled={brakeSession.stage !== 'setup'}
                    onPickEdge={pickBrakeEdge}
                    onDistance={brakeDistance}
                    onPoints={(points) => changeBrake({ points, scrub: null })}
                    onMark={(mark) =>
                      changeBrake({
                        mode: 'points',
                        points: [mark.a.map(Number), mark.b.map(Number)],
                        scrub: null,
                        ...(mark.bend ? { angle: Number(mark.bend.angle), flip: mark.bend.direction === 'down' } : {}),
                        // A round bend's line (a corner piece's, round-bend spec §13.3) sets it up as one.
                        ...(mark.bend?.steps
                          ? { shape: 'round', radius: Number(mark.bend.radius), steps: Number(mark.bend.steps) }
                          : {}),
                      })
                    }
                    onSkip={(index) =>
                      changeBrake({
                        skip: (brakeSession.skip || []).includes(index)
                          ? brakeSession.skip.filter((i) => i !== index)
                          : [...(brakeSession.skip || []), index],
                        scrub: null,
                      })
                    }
                  />
                )}
                {laserView && shopSession?.station === 'laser' && (
                  <LaserBed
                    station={laserView}
                    session={shopSession}
                    onDone={laserCutEnd}
                    onView={(view) => changeShop({ view })}
                    onSheet={(sheetIndex) => changeShop({ sheetIndex })}
                  />
                )}
                {sketchSession?.stage === 'draw' && (
                  <CadSketcher
                    key={sketchSession.key}
                    viewport={viewport}
                    session={sketchSession}
                    snap={sketchSnap}
                    onSnapChange={setSketchSnap}
                    onFinish={finishSketch}
                    onCancel={cancelSketch}
                    onLookAt={lookAtSketch}
                  />
                )}
                {/*
                  The open-group banner (§3.3) sits over the view, top centre:
                  in the view toolbar it wrapped the toolbar onto a second row
                  at 1600 px (docs/sketch-studio-part-groups.md §10).
                */}
                {openGroup && (
                  <button
                    type="button"
                    className="cad-group-chip"
                    aria-label={`Inside ${nodeName(model, openGroup)} · Close (Esc)`}
                    title="Close this group and select it (Esc)"
                    onClick={closeGroup}
                  >
                    Inside <strong>{nodeName(model, openGroup)}</strong> · Close (Esc)
                  </button>
                )}
                <div
                  className="cad-view-cube"
                  aria-label="View cube"
                  inert={film ? true : undefined}
                  data-film={film ? '' : undefined}
                >
                  {['top', 'front', 'right', 'isometric'].map((v) => (
                    <button key={v} onClick={() => setView(v)}>
                      {v === 'isometric' ? 'ISO' : v}
                    </button>
                  ))}
                </div>
                {/*
                  Until the first snapshot there is no model to keep on screen, so
                  the viewport says what it is waiting on: the WASM kernel, then
                  the parts. After that a rebuild never covers the model — the
                  bar above it and the status line are the whole signal.
                */}
                {!runtime.snapshot ? (
                  <PanePlaceholder
                    overlay
                    tone="paper"
                    data-kernel-boot=""
                    state={
                      ['error', 'cancelled'].includes(runtime.status)
                        ? 'error'
                        : runtime.kernelAwake
                          ? 'building'
                          : 'booting'
                    }
                    label={
                      runtime.kernelAwake && model.parts.length
                        ? kernelBuilding(model.parts.length)
                        : LOADING_COPY.kernelBoot
                    }
                    error={{
                      message: runtime.error?.message || LOADING_COPY.kernelFailed,
                      onRetry: runtime.retry,
                    }}
                  />
                ) : (
                  <LoadingBar active={runtime.status === 'building'} placement="region" delayMs={150} />
                )}
                {operationDraft && (
                  <div className="cad-preview-badge">
                    {displayPreview
                      ? placementShown?.cut
                        ? 'Cut preview — Apply to save'
                        : 'Operation preview — Apply to save'
                      : 'Saved model — operation not applied'}
                  </div>
                )}
              </div>
              {split && (
                <div className="cad-drawing">
                  <div className="cad-inline cad-sheet-switch">
                    {/* Title and subject, so sheets with one title can be told apart. */}
                    <select
                      aria-label="Drawing sheet"
                      value={sheet?.id || ''}
                      onChange={(e) => setSheetId(e.target.value)}
                    >
                      {model.sheets.map((s) => (
                        <option value={s.id} key={s.id}>
                          {`${s.title} — ${sheetSubject(s, model).label}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title="Draw a part, open, rename, duplicate or delete sheets"
                      onClick={() => {
                        setPanel('sheets');
                        setPropertiesOpen(true);
                      }}
                    >
                      Manage sheets
                    </button>
                    <button
                      type="button"
                      title="Save this sheet as a PDF"
                      disabled={!sheet || !runtime.ready || busy || Boolean(operationDraft)}
                      onClick={() => perform(() => exportSheetsPdf([sheet.id]))}
                    >
                      PDF
                    </button>
                  </div>
                  {/* The PDF's progress and result here unless the Sheets panel shows them. */}
                  {!(propertiesOpen && panel === 'sheets') && (
                    <PdfExportStatus run={pdfRun} notice={pdfNoticeShown} actions={pdfActions} />
                  )}
                  {sheet && (
                    <SheetScaleControl
                      key={sheet.id}
                      sheet={sheet}
                      views={activeDrawing?.views || null}
                      parts={drawingParts}
                      onChange={(patch) => perform(() => changeSheet(patch))}
                      onDraft={onScaleDraft}
                    />
                  )}
                  <label className="cad-field" title="Zoom the preview only — does not change the printed scale">
                    Screen zoom
                    <input
                      type="range"
                      aria-label="Screen zoom"
                      title="Zoom the preview only — does not change the printed scale"
                      min="0.5"
                      max="4"
                      step="0.25"
                      value={drawingZoom}
                      onChange={(e) => setDrawingZoom(Number(e.target.value))}
                    />
                  </label>
                  {overflowing && (
                    <div className="cad-sheet-overflow" role="status">
                      <span>
                        {overflowing.name.charAt(0).toUpperCase() + overflowing.name.slice(1)} doesn’t fit on{' '}
                        {sheet.size || 'A3'} at {scaleLabel(overflowing.scale)}.
                      </span>
                      {drawingFit.views.some((v) => !v.fits && !v.ownScale) && (
                        <>
                          <button onClick={() => perform(() => changeSheet({ scaleMode: 'fit' }))}>
                            Fit to page ({scaleLabel(drawingFit.largestFittingScale)})
                          </button>
                          <button
                            onClick={() =>
                              perform(() => changeSheet({ scaleMode: 'fixed', scale: drawingFit.largestFittingScale }))
                            }
                          >
                            Use {scaleLabel(drawingFit.largestFittingScale)}
                          </button>
                        </>
                      )}
                      {drawingFit.smallestFittingPage && drawingFit.smallestFittingPage !== sheet.size && (
                        <button onClick={() => perform(() => changeSheet({ size: drawingFit.smallestFittingPage }))}>
                          Use {drawingFit.smallestFittingPage} at {scaleLabel(drawingFit.scale)}
                        </button>
                      )}
                    </div>
                  )}
                  {svg ? (
                    <SheetPreview
                      key={dimensionTool || 'view'}
                      svg={svg}
                      zoom={drawingZoom}
                      views={activeDrawing.views}
                      tool={dimensionTool}
                      onAdd={(annotation) => perform(() => addSheetAnnotation(annotation))}
                      onCancel={() => setDimensionTool(null)}
                    />
                  ) : sheetError ? (
                    // The kernel refused this sheet only (Phase S §7); other sheets keep their views.
                    <p className="cad-sheet-error">
                      {sheetError} —{' '}
                      <button disabled={!runtime.ready || busy} onClick={() => perform(requestDrawings)}>
                        Update drawing preview
                      </button>
                    </p>
                  ) : drawingStale && !drawingError ? (
                    <p className="cad-sheet-stale">
                      {drawingStale} —{' '}
                      <button disabled={!runtime.ready || busy} onClick={() => perform(requestDrawings)}>
                        Update drawing preview
                      </button>
                    </p>
                  ) : (
                    <p>{drawingError || 'Generate drawing views from the current model.'}</p>
                  )}
                  <button disabled={!runtime.ready || busy} onClick={() => perform(requestDrawings)}>
                    Refresh drawings
                  </button>
                </div>
              )}
            </div>
            {(error || runtime.error || documentPersistence.error) && (
              <div className="cad-error" role="alert">
                {error || runtime.error?.message || documentPersistence.error}
                {runtime.snapshot && !runtime.ready
                  ? ' Last valid geometry is shown; current-design exports are disabled.'
                  : ''}
              </div>
            )}
          </div>
          {propertiesOpen && (
            <aside className="cad-properties" ref={propertiesPanel}>
              <div className="cad-panel-heading">
                PROPERTIES
                <button aria-label="Collapse properties panel" onClick={() => setPropertiesOpen(false)}>
                  ›
                </button>
              </div>
              {panel === 'shop-film' && film ? (
                <FilmPanel
                  film={film}
                  product={nodeName(model, film.productId)}
                  watching={film.instanceId ? nodeName(model, film.instanceId) : ''}
                  start={filmStart(film.scenes, film.index)}
                  total={filmLength(film.scenes)}
                  bar={filmBar}
                  onPlay={playFilm}
                  onPause={pauseFilm}
                  onStep={stepFilm}
                  onSpeed={speedFilm}
                  onEnd={endFilm}
                />
              ) : panel === 'hardware' ? (
                <HardwarePanel
                  projectMaterials={model.parts.map((p) => p.material)}
                  ready={runtime.ready}
                  canAttach={
                    feature?.type === 'hole' &&
                    !feature.suppressed &&
                    !part.features
                      .slice(part.features.indexOf(feature) + 1)
                      .some((f) => !f.suppressed && ['transform', 'mirror', 'pattern'].includes(f.type))
                  }
                  attachRow={feature?.type === 'hole' && Boolean(feature.row)}
                  onAdd={(hardware, attach) =>
                    perform(() => {
                      // Not attached to a selected hole: place it with the mouse (Phase J).
                      if (!attach) return beginOperation('hardware', null, { hardware });
                      // A selected hole row (Phase M): Place with every hole of it chosen.
                      if (feature.row)
                        return beginOperation('hardware', null, {
                          hardware,
                          preselect: { instanceId: selectedId, featureId: feature.id },
                        });
                      const created = createHardware(hardware);
                      const connection = attach
                        ? {
                            id: uid('connection'),
                            type: 'concentric',
                            from: created.instance.id,
                            to: selectedId,
                            fromFeatureId: hardware.id,
                            toFeatureId: feature.id,
                            offset: 0,
                          }
                        : null;
                      commit({
                        ...model,
                        parts: [...model.parts, created.part],
                        instances: [...model.instances, created.instance],
                        connections: connection ? [...model.connections, connection] : model.connections,
                      });
                      select(created.instance.id);
                      setMoveMode(!attach);
                    })
                  }
                />
              ) : panel === 'hole-tool' ? (
                <>
                  <h3>Place holes on the part</h3>
                  <p className="cad-help">
                    Click a surface to drill at that point. Orbit to reach another face. Set snap to 0 for free
                    placement. Each click is one undoable hole.
                  </p>
                  <label className="cad-field">
                    Hole purpose
                    <select
                      value={holeTemplate.holeSpec?.mode || 'plain'}
                      onChange={(e) =>
                        setHoleTemplate(holePreset(holeTemplate, e.target.value, holeTemplate.holeSpec?.size || 'M3'))
                      }
                    >
                      <option value="plain">Plain diameter</option>
                      <option value="tap">Tapped hole — cutting-tap drill</option>
                      <option value="clearance">Screw clearance — editable allowance</option>
                    </select>
                  </label>
                  {holeTemplate.holeSpec && (
                    <label className="cad-field">
                      Thread size
                      <select
                        value={holeTemplate.holeSpec.size}
                        onChange={(e) =>
                          setHoleTemplate(holePreset(holeTemplate, holeTemplate.holeSpec.mode, e.target.value))
                        }
                      >
                        {Object.keys(METRIC_THREADS).map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <ValueField
                    key="diameter"
                    label="Hole diameter (mm)"
                    value={holeTemplate.diameter}
                    onChange={(diameter) => setHoleTemplate({ ...holeTemplate, diameter })}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={holeTemplate.throughAll}
                      onChange={(e) => setHoleTemplate({ ...holeTemplate, throughAll: e.target.checked })}
                    />{' '}
                    Through all
                  </label>
                  {!holeTemplate.throughAll && (
                    <ValueField
                      key="depth"
                      label="Hole depth (mm)"
                      value={holeTemplate.depth}
                      onChange={(depth) => setHoleTemplate({ ...holeTemplate, depth })}
                    />
                  )}
                  <p className="cad-help">
                    Placed centers use fixed part coordinates. Select a hole to enter exact coordinates, use fixed edge
                    distances, or lock its position. Move holes shows draggable centers.
                  </p>
                  <button
                    onClick={() => {
                      setHoleMode(null);
                      setPanel(null);
                    }}
                  >
                    Finish holes
                  </button>
                </>
              ) : panel === 'marks' ? (
                <>
                  <h3>Measure</h3>
                  <p className="cad-help">
                    Click two points on the model: corners, edge midpoints, edges and faces snap. Each pair leaves a
                    dimension mark that moves with its parts. Mark points snap the move gizmo, sketches and hole
                    placement; save a mark as a parameter to type =name in a size or position. D starts or stops
                    measuring · Delete removes the selected mark.
                  </p>
                  {measuring ? (
                    <button onClick={endMeasure}>Done measuring</button>
                  ) : (
                    <button className="cad-primary" disabled={measureBlocked} onClick={() => perform(startMeasure)}>
                      Measure
                    </button>
                  )}
                  {marks.length ? (
                    <div className="cad-mark-list" role="list" aria-label="Marks">
                      {marks.map((mark) => {
                        const A = anchorWorld(mark.from, markPoses),
                          B = anchorWorld(mark.to, markPoses);
                        const value = A && B ? markValue(mark, A, B) : null;
                        const where = (anchor, point) => {
                          const target = model.instances.find((i) => i.id === anchor.instanceId);
                          const name = anchor.instanceId
                            ? target?.name || model.parts.find((p) => p.id === target?.partId)?.name || 'Part'
                            : 'World';
                          return `${name} (${point.map((v) => v.toFixed(2)).join(', ')})`;
                        };
                        return (
                          <div
                            key={mark.id}
                            role="listitem"
                            className={`cad-mark-row ${mark.id === selectedMarkId ? 'is-selected' : ''}`}
                            onClick={() => setSelectedMarkId(mark.id)}
                          >
                            <div className="cad-mark-head">
                              <strong>{value == null ? '—' : `${formatMm(value)} mm`}</strong>
                              <select
                                aria-label="Measure along"
                                value={mark.along}
                                onChange={(e) => changeMarkAlong(mark, e.target.value)}
                              >
                                {MARK_READINGS.map(([along, label]) => (
                                  <option key={along} value={along}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {value == null ? (
                              <small>part hidden or missing</small>
                            ) : (
                              <small>
                                From {where(mark.from, A)}
                                <br />
                                To {where(mark.to, B)}
                              </small>
                            )}
                            <div className="cad-inline">
                              <button
                                disabled={value == null}
                                onClick={() => setMarkParameter({ id: mark.id, name: freeMarkName() })}
                              >
                                Save as parameter
                              </button>
                              <button
                                disabled={value == null}
                                onClick={() =>
                                  navigator.clipboard
                                    ?.writeText(formatMm(value))
                                    .catch(() => setError('Copying to the clipboard is not allowed here.'))
                                }
                              >
                                Copy
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMark(mark.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                            {markParameter?.id === mark.id && value != null && (
                              <label className="cad-field">
                                Parameter name (Enter saves)
                                <input
                                  aria-label="Parameter name"
                                  autoFocus
                                  value={markParameter.name}
                                  onChange={(e) => setMarkParameter({ ...markParameter, name: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveMarkParameter(value);
                                    if (e.key === 'Escape') setMarkParameter(null);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p>No marks yet. Click Measure, then two points on the model.</p>
                  )}
                </>
              ) : panel === 'mate' && mateSession ? (
                <>
                  <h3>Mate faces</h3>
                  <ol className="cad-mate-steps">
                    <li className={mateSession.stage === 'moving' ? 'is-current' : ''}>
                      Click a flat face on the part to move.
                    </li>
                    <li className={mateSession.stage === 'target' ? 'is-current' : ''}>
                      Click the face it should sit against, on another part. Change the view between clicks if needed.
                    </li>
                    <li className={mateSession.stage === 'placed' ? 'is-current' : ''}>Set an offset, then Done.</li>
                  </ol>
                  {mateSession.stage === 'placed' && (
                    <ValueField
                      key="mate-offset"
                      label="Offset (mm)"
                      value={mateSession.offset}
                      onChange={changeMateOffset}
                    />
                  )}
                  <p className="cad-help">
                    The part turns the least amount needed for the faces to face each other, then moves along the target
                    face normal until they touch. It stays free to move afterwards; the mate is not stored as a
                    constraint.
                  </p>
                  <div className="cad-inline">
                    <button className="cad-primary" disabled={mateSession.stage !== 'placed'} onClick={finishMate}>
                      Done
                    </button>
                    <button onClick={cancelMate}>Cancel mate</button>
                  </div>
                </>
              ) : panel === 'sketch-pick' && sketchSession?.stage === 'pick' ? (
                <>
                  <h3>New sketch</h3>
                  <p className="cad-help">
                    Click a flat face of a part, or one of the three origin planes in the view. The camera squares to it
                    and the sketch bar opens.
                  </p>
                  <h4>Exact plane</h4>
                  <label className="cad-field">
                    Plane
                    <select
                      aria-label="Sketch plane"
                      value={planeDraft.plane}
                      onChange={(e) => setPlaneDraft({ ...planeDraft, plane: e.target.value })}
                    >
                      {SKETCH_PLANES.map((plane) => (
                        <option key={plane} value={plane}>
                          {plane} · {PLANE_NAMES[plane]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cad-field">
                    Offset (mm)
                    <input
                      aria-label="Plane offset (mm)"
                      type="number"
                      value={planeDraft.offset}
                      onChange={(e) => setPlaneDraft({ ...planeDraft, offset: e.target.value })}
                    />
                    <small>moves each origin plane along its own axis (XY → Z, XZ → Y, YZ → X)</small>
                  </label>
                  <div className="cad-inline">
                    <button
                      className="cad-primary"
                      onClick={() => perform(() => pickSketchPlane(planeDraft.plane, planeDraft.offset))}
                    >
                      Start sketch
                    </button>
                    <button
                      onClick={() => {
                        setSketchSession(null);
                        setPanel(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : panel === 'sketching' && sketchSession?.stage === 'draw' ? (
                <>
                  <h3>Sketching · {sketchSession.name}</h3>
                  <p className="cad-help">
                    Pick a tool in the sketch bar. After the first click, type values in the box by the cursor: Tab
                    switches field, Enter applies. Points snap to the grid, to sketch ends, midpoints and centres, and
                    to the model edges in this plane (orange). Hold Shift to lock horizontal or vertical.
                  </p>
                  <p className="cad-help">
                    Esc ends the current tool; Esc again finishes the sketch. Lines and arcs must join end to end to
                    make a closed profile; closed shapes inside the outline become holes.
                  </p>
                  <p className="cad-help">
                    Dimension (D): click two points, or a line, circle or arc, then click where the dimension goes. Esc
                    before the last click only measures. Dimensions are kept with the sketch and never change the part.
                  </p>
                </>
              ) : panel === 'sketch-finished' && model.sketches.some((s) => s.id === finishedSketch?.sketchId) ? (
                (() => {
                  const done = model.sketches.find((s) => s.id === finishedSketch.sketchId);
                  const consumed = Boolean(sketchConsumer(model, done.id));
                  return (
                    <>
                      <h3>
                        {done.name} {finishedSketch.edited ? 'updated' : 'finished'}
                      </h3>
                      <SketchSummary
                        sketch={done}
                        planeText={sketchPlaneText(model, done)}
                        onEdit={() => perform(() => editSketch(done.id))}
                        editProblem={sketchEditProblem(done)}
                      />
                      {finishedSketch.problems.map((problem) => (
                        <p key={problem} className="cad-sketch-warning">
                          {problem}
                        </p>
                      ))}
                      {!consumed && (
                        <>
                          <h4>Make it solid</h4>
                          <div className="cad-inline">
                            <button
                              className="cad-primary"
                              // Enter extrudes a closed profile straight away.
                              ref={extrudeButton}
                              autoFocus
                              disabled={!finishedSketch.closed || !runtime.ready}
                              onClick={() => perform(() => startSketchOperation(done.id, 'extrude'))}
                            >
                              Extrude
                            </button>
                            <button
                              disabled={!finishedSketch.closed || !runtime.ready || !model.instances.length}
                              onClick={() => perform(() => startSketchOperation(done.id, 'cut'))}
                            >
                              Cut
                            </button>
                          </div>
                          {/* A closed outline on XY can be the flat blank of a sheet-metal part (shop floor §4.4). */}
                          {finishedSketch.closed && (done.plane || 'XY') === 'XY' && !done.normal && (
                            <button
                              type="button"
                              title="Take this outline to the shop: the flat blank of a sheet-metal part"
                              onClick={() => {
                                setTab('Shop');
                                setSearch('');
                                perform(() => goStation('cut', { outline: { kind: 'sketch', sketchId: done.id } }));
                              }}
                            >
                              Cut from sheet <span aria-hidden="true">→</span>
                            </button>
                          )}
                        </>
                      )}
                      <button onClick={() => setPanel(null)}>Done</button>
                    </>
                  );
                })()
              ) : panel === 'operation' && operationDraft?.sketchFlow ? (
                <SketchOperationPanel
                  draft={operationDraft}
                  model={draftModel}
                  preview={{
                    ...operationPreview,
                    error: operationPreview.errorSource === draftModel ? operationPreview.error : null,
                  }}
                  problem={draftProblem}
                  stale={draftStale}
                  showPreview={showOperationPreview}
                  onShowPreview={setShowOperationPreview}
                  onSettings={changeSketchOperation}
                  onMode={(mode) =>
                    changeSketchOperation({
                      ...defaultSketchSettings({
                        model: operationDraft.baseModel,
                        snapshot: runtime.snapshot,
                        sketch: operationDraft.baseModel.sketches.find(
                          (s) => s.id === operationDraft.sketchFlow.sketchId,
                        ),
                        mode,
                        selectedId: operationDraft.previousSelection,
                      }),
                      // Chosen by hand: drags no longer switch Extrude / Cut.
                      inferOperation: false,
                    })
                  }
                  placementText={placementSummary(operationDraft, placementContext())}
                  inferring={Boolean(placementShown?.inference?.active)}
                  onFit={() => setFitKey((v) => v + 1)}
                  onCancel={cancelOperation}
                  onApply={applyOperation}
                />
              ) : panel === 'operation' && operationDraft ? (
                <OperationPanel
                  draft={operationDraft}
                  model={draftModel}
                  preview={{
                    ...operationPreview,
                    error: operationPreview.errorSource === draftModel ? operationPreview.error : null,
                  }}
                  problem={draftProblem}
                  stale={draftStale}
                  showPreview={showOperationPreview}
                  onShowPreview={setShowOperationPreview}
                  onChange={setOperationDraft}
                  onFit={() => setFitKey((v) => v + 1)}
                  onCancel={cancelOperation}
                  onApply={applyOperation}
                  onApplyAgain={() => applyOperation(true)}
                  placementText={placementSummary(operationDraft, placementContext())}
                  rowDirection={cutRowDirection(operationDraft, placementContext())}
                  onReplace={() => perform(() => changePlacement(replacePlacement(operationDraft)))}
                  onFinishPlacement={finishOperationPlacement}
                  chosenHoles={
                    operationDraft.placement?.tool === 'hardware'
                      ? chosenHoleRows(operationDraft, placementContext())
                      : []
                  }
                  onRemoveHole={(key) =>
                    perform(() => {
                      assertDraftCurrent();
                      changePlacement(removeChosenHole(operationDraft, key, placementContext()));
                    })
                  }
                  canFlipSide={
                    operationDraft.placement?.tool === 'hardware' &&
                    !draftStale &&
                    canFlipSide(operationDraft, placementContext(), placementShown?.holeCentres || null)
                  }
                  onFlipSide={flipOperationSide}
                  onChangeAxis={() => setOperationDraft(startAxisPick(operationDraft))}
                  onSweepOptions={(patch) =>
                    performField(() => setOperationDraft(changeSweepOptions(operationDraft, patch, placementContext())))
                  }
                  onError={setError}
                />
              ) : panel === 'press-brake' && brakeBlocked && !brakeSession ? (
                // A part whose hits are made and that has gone on down the route is
                // finished here, not refused (shop floor §8.1): Watch the bends replays them.
                shopOrderBlock(model, brakeBlocked.partId) &&
                foldOf(model, brakeBlocked.instanceId, shopParams)?.bends.length ? (
                  <PressBrakeFinished
                    blocked={shopOrderBlock(model, brakeBlocked.partId)}
                    here={finishedHere(model, brakeBlocked.instanceId)}
                    fold={foldOf(model, brakeBlocked.instanceId, shopParams)}
                    shell={bendShell(brakeBlocked.instanceId)}
                    onWatch={() => perform(() => startFilm(brakeBlocked.instanceId))}
                    onRemove={() => perform(clearShopOrder)}
                    onCancel={leavePressBrake}
                  />
                ) : shopOrderBlock(model, brakeBlocked.partId) ? (
                  <PressBrakeBlocked
                    blocked={shopOrderBlock(model, brakeBlocked.partId)}
                    fold={foldOf(model, brakeBlocked.instanceId, shopParams)}
                    shell={bendShell(brakeBlocked.instanceId)}
                    onRemove={() => perform(clearShopOrder)}
                    onCancel={leavePressBrake}
                  />
                ) : (
                  <StationShell
                    station="bend"
                    region="Press brake"
                    shell={bendShell(brakeBlocked.instanceId)}
                    primary={
                      <PrimaryButton onClick={() => perform(() => startPressBrake(brakeBlocked.instanceId))}>
                        Open the press brake
                      </PrimaryButton>
                    }
                  >
                    <p className="cad-shop-lead">Nothing keeps this part off the brake now.</p>
                  </StationShell>
                )
              ) : panel === 'press-brake' && brakeSession && brake?.error ? (
                <StationShell
                  station="bend"
                  region="Press brake"
                  shell={bendShell(brakeSession.instanceId)}
                  leave={
                    <button type="button" className="cad-shell-leave" onClick={leavePressBrake}>
                      Leave press brake
                    </button>
                  }
                >
                  <ProblemCard message={brake.error} />
                </StationShell>
              ) : panel === 'press-brake' && brakeView ? (
                <PressBrakePanel
                  station={brake}
                  session={brakeSession}
                  checks={brakeChecks}
                  problem={brakeProblem}
                  shell={bendShell(brakeSession.instanceId)}
                  bladeOptions={brakeBladeOptions}
                  picker={brakePicker}
                  onPicker={setBrakePicker}
                  focus={brakeFocus}
                  onFocused={() => setBrakeFocus(null)}
                  onSession={changeBrake}
                  onMachine={(key) => perform(() => changeBrakeMachine(key))}
                  onBend={pressPedal}
                  onLeave={leavePressBrake}
                  onScrub={scrubBrakeStep}
                  onRerun={rerunBrakeStep}
                  onMove={(bendId, step) => perform(() => moveBrakeStep(bendId, step))}
                  onRemove={(bendId) => perform(() => removeBrakeStep(bendId))}
                  onBendOn={bendOnBrakeStep}
                  rowTries={rowTries}
                  onReorder={(bends) => perform(() => changeBrakeBends(bends, 'That order is'))}
                />
              ) : panel === 'shop-paint' && paintView ? (
                <PaintPanel
                  view={paintView}
                  problem={shopProblem}
                  notice={shopNotice}
                  shell={shellFor(
                    'paint',
                    paintView.targets.length ? paintView.targets.map((t) => t.name).join(', ') : shopSubjectName,
                    paintView.targetIds.length === 1 ? paintView.targetIds[0] : currentSubject?.instanceId || null,
                  )}
                  onFinish={(patch) => changeShop({ finish: { ...shopSession.finish, ...patch } })}
                  onWhole={() => changeShop({ targets: paintView.group.instanceIds })}
                  onPaint={() => perform(() => runPaint('paint'))}
                  onStrip={() => perform(() => runPaint('strip'))}
                  onConfirm={() => perform(() => runPaint(shopSession.pending, true))}
                  onBack={() => changeShop({ stage: PAINT.next(shopSession.stage, 'BACK'), pending: null })}
                  onLeave={leaveShopStation}
                />
              ) : panel === 'shop-print' && printView ? (
                <PrintPanel
                  view={printView}
                  problem={shopProblem}
                  notice={shopNotice}
                  shell={shellFor('print', printView.selectedPart || shopSubjectName)}
                  onDraft={(patch) => changeShop({ draft: { ...shopSession.draft, ...patch } })}
                  onChange={changePrint}
                  onImage={(file) => perform(() => uploadPrintImage(file))}
                  onNew={() => changeShop({ stage: PRINT.next(shopSession.stage, 'NEW'), printId: null })}
                  onSelect={(id) => changeShop({ stage: PRINT.next(shopSession.stage, 'SELECT'), printId: id })}
                  onRemove={(id) => perform(() => removePrint(id))}
                  onLeave={leaveShopStation}
                />
              ) : panel === 'shop-laser' && laserView && shopSession?.station === 'laser' ? (
                <LaserPanel
                  station={laserView}
                  session={shopSession}
                  problem={shopProblem}
                  notice={shopNotice}
                  warning={copiesNote?.model === model ? copiesNote.text : ''}
                  params={shopParams}
                  shell={shellFor(
                    'cut',
                    // The lead's name, and how many other parts this cut holds (SN-1 §4.4).
                    `${nodeName(model, shopSession.instanceId)}${laserView.parts.length > 1 ? ` + ${laserView.parts.length - 1} more` : ''}`,
                    shopSession.instanceId,
                  )}
                  onSheet={(key) => perform(() => changeLaserSheet(key))}
                  onQuantity={(quantity) => perform(() => changeLaserQuantity(quantity))}
                  onLead={leadLaser}
                  onDraw={() => perform(() => goStation('draw'))}
                  onCut={laserCut}
                  onStop={laserStop}
                  onEtch={() => perform(() => changeLaserMarks(etchBendMarks(laserView.fold)))}
                  onClearMarks={() => perform(() => changeLaserMarks([]))}
                  onLeave={leaveShopStation}
                  onEditOutline={() => perform(() => editLaserOutline(shopSession.instanceId))}
                  editProblem={outlineEditProblem(shopSession.instanceId)}
                />
              ) : panel === 'shop-laser' && shopSession?.station === 'laser' && laserState?.error ? (
                // The laser could not read its blank: the reason, Edit outline and Leave, never a dead end (shop floor §4.3).
                <LaserError
                  message={laserState.error}
                  shell={shellFor('cut', nodeName(model, shopSession.instanceId), shopSession.instanceId)}
                  onLeave={leaveShopStation}
                  onEditOutline={() => perform(() => editLaserOutline(shopSession.instanceId))}
                  editProblem={outlineEditProblem(shopSession.instanceId)}
                />
              ) : panel === 'shop-draw' ? (
                <DrawPanel
                  model={model}
                  params={shopParams}
                  outlines={shopOutlines(model, shopParams)}
                  chosen={drawnSketch}
                  notice={outlineNotice?.model === model ? outlineNotice.text : ''}
                  onEdit={(id) => perform(() => editOutline(id, { panel: 'shop-draw' }))}
                  onDelete={(id) => perform(() => deleteOutline(id))}
                  entities={document.entities || []}
                  layers={document.layers}
                  selectedEntityIds={selectedEntities.map((e) => e.id)}
                  shell={shellFor('draw')}
                  onOutline={(outline) => perform(() => goStation('cut', { outline }))}
                  onSketch={() => perform(drawOutline)}
                  panelOpen={panelOpen}
                  onPanelTile={(open) => {
                    setPanelOpen(open);
                    if (open && !panelDraft) setPanelDraft(defaultPanelDraft());
                  }}
                  panelForm={
                    panelDraft && (
                      <PanelMakerForm
                        draft={panelDraft}
                        onDraft={changePanelDraft}
                        face={panelFace}
                        result={panelResult}
                        model={model}
                        params={shopParams}
                      />
                    )
                  }
                  panelPrimary={
                    <PanelEndings
                      ready={Boolean(panelResult?.report)}
                      onCreate={(ending) => perform(() => createPanel(ending))}
                    />
                  }
                />
              ) : panel === 'bought-in' ? (
                <BoughtInPanel onAdd={(item) => perform(() => addBoughtIn(item))} onCancel={() => setPanel(null)} />
              ) : panel === 'shop-gate' && gateView ? (
                <StationGate
                  gate={gateView}
                  params={shopParams}
                  shell={
                    gateView.station === 'bend' && brakeOn
                      ? { ...shellFor('bend', shopSubjectName), strip: bendShell(brakeOn).strip }
                      : shellFor(gateView.station, shopSubjectName)
                  }
                  onPick={(instanceId) =>
                    gateView.then === 'add-bend'
                      ? perform(() => addBendOn(instanceId))
                      : perform(() => goStation(gateView.station, { instanceId }))
                  }
                  onGo={gateGo}
                />
              ) : panel === 'job-sheet' && jobView ? (
                <JobSheetPanel
                  sheet={jobView}
                  productId={jobView.products.some((p) => p.id === jobProduct) ? jobProduct : null}
                  onProduct={setJobProduct}
                  onBatch={setJobBatch}
                  onCsv={() => perform(downloadJobSheet)}
                  stale={!runtime.ready}
                />
              ) : panel === 'shop-cut' && cutOutline ? (
                <CutFromSheetPanel
                  key={JSON.stringify(
                    cutOutline.kind === 'drawing'
                      ? cutOutline.blank.id
                      : cutOutline.kind === 'batch'
                        ? cutOutline.items.map((item) => item.sketchId || item.blank?.id)
                        : cutOutline,
                  )}
                  model={model}
                  outline={cutOutline}
                  shell={shellFor('cut')}
                  onCreate={(created) => perform(() => cutFromSheet(created))}
                  editNotice={outlineNotice?.model === model ? outlineNotice.text : ''}
                  onEditOutline={
                    cutOutline.kind === 'sketch'
                      ? (stock) =>
                          perform(() =>
                            editOutline(cutOutline.sketchId, {
                              panel: 'shop-cut',
                              outline: { ...cutOutline, ...stock },
                            }),
                          )
                      : null
                  }
                />
              ) : panel === 'import-drafting' ? (
                <DraftingImport
                  entities={document.entities}
                  layers={document.layers}
                  selectedIds={importProfileIds || selectedEntities.map((e) => e.id)}
                  onDrafting={onDrafting}
                  onImport={(created) => {
                    commit({
                      ...model,
                      parts: [...model.parts, ...created.map((c) => c.part)],
                      instances: [...model.instances, ...created.map((c) => c.instance)],
                      sketches: [...model.sketches, ...created.map((c) => c.sketch)],
                    });
                    select(created[0]?.instance.id);
                    setFitKey((v) => v + 1);
                    onImportComplete?.();
                  }}
                />
              ) : panel === 'sketch' ? (
                <SketchForm
                  onCreate={(s) => {
                    commit({ ...model, sketches: [...model.sketches, s] });
                    setSketchId(s.id);
                    setPanel('edit-sketch');
                  }}
                />
              ) : panel === 'edit-sketch' && sketch ? (
                <>
                  <h3>{sketch.name}</h3>
                  <SketchSummary
                    sketch={sketch}
                    planeText={sketchPlaneText(model, sketch)}
                    onEdit={() => perform(() => editSketch(sketch.id))}
                    editProblem={sketchEditProblem(sketch)}
                  >
                    {!sketchConsumer(model, sketch.id) && (
                      <div className="cad-inline">
                        <button
                          disabled={!runtime.ready || sketch.profile.closed === false}
                          onClick={() => perform(() => startSketchOperation(sketch.id, 'extrude'))}
                        >
                          Extrude with preview
                        </button>
                        <button
                          disabled={!runtime.ready || sketch.profile.closed === false || !model.instances.length}
                          onClick={() => perform(() => startSketchOperation(sketch.id, 'cut'))}
                        >
                          Cut with preview
                        </button>
                      </div>
                    )}
                  </SketchSummary>
                  <h4>Profile fields</h4>
                  <ProfileEditor
                    key={sketch.id}
                    sketch={sketch}
                    parameters={model.parameters}
                    solvedProfile={runtime.reports?.find((r) => r.sketchId === sketch.id)?.profile}
                    onChange={(next) =>
                      commit({ ...model, sketches: model.sketches.map((s) => (s.id === sketch.id ? next : s)) })
                    }
                  />
                  <ConstraintEditor
                    key={sketch.id}
                    sketch={sketch}
                    parameters={model.parameters}
                    onChange={(next) => {
                      const solved = runtime.reports?.find((r) => r.sketchId === sketch.id);
                      const frozen =
                        sketch.constrained && !next.constrained && solved
                          ? { ...next, profile: solved.profile, primitives: solved.primitives }
                          : next;
                      commit({ ...model, sketches: model.sketches.map((s) => (s.id === sketch.id ? frozen : s)) });
                    }}
                  />
                  <p className="cad-help">
                    Profiles support rectangle, circle, polygon and path segments (line, arc, spline), holes and
                    offsets. Optional PlaneGCS primitives bind polygon pointIds or circleId.
                  </p>
                  <JsonEditor
                    key={JSON.stringify(sketch)}
                    value={sketch}
                    label="Part sketch"
                    onApply={(s) =>
                      commit({
                        ...model,
                        sketches: model.sketches.map((old) => (old.id === sketch.id ? { ...s, id: sketch.id } : old)),
                      })
                    }
                  />
                  <button
                    onClick={() => {
                      const created = createPart();
                      created.part.features = [
                        { id: uid('feature'), type: 'extrude', sketchId: sketch.id, length: 18 },
                      ];
                      created.part.name = sketch.name;
                      commit({
                        ...model,
                        parts: [...model.parts, created.part],
                        instances: [...model.instances, created.instance],
                      });
                      select(created.instance.id);
                    }}
                  >
                    Extrude as new part
                  </button>
                </>
              ) : panel === 'parameters' ? (
                <ParametersPanel
                  model={model}
                  onCommit={commit}
                  onDesign={openDesignParameters}
                  onEdited={setLastParameterEdit}
                  notice={parameterNotice}
                  failingId={
                    runtime.status === 'error' && runtime.errorSource === model && !error ? lastParameterEdit : null
                  }
                />
              ) : panel === 'design-parameters' ? (
                <DesignParametersForm
                  model={model}
                  snap={moveSnap}
                  onApply={applyDesignParameters}
                  onCancel={() => setPanel('parameters')}
                />
              ) : panel === 'connections' ? (
                <>
                  <h3>Assembly connections</h3>
                  <ConnectionEditor
                    model={model}
                    selectedId={selectedId}
                    onChange={(connections) => commit({ ...model, connections })}
                  />
                  <p className="cad-help">
                    Use instance IDs from the tree. Align and face-offset use world bounds; fixed connections use a
                    target’s local frame. Weld locations and notes are explicit shop instructions.
                  </p>
                  <JsonEditor
                    key={JSON.stringify(model.connections)}
                    label="Connections and welds"
                    value={model.connections}
                    onApply={(connections) => commit({ ...model, connections })}
                  />
                  <button
                    disabled={model.instances.length < 2}
                    onClick={() =>
                      commit({
                        ...model,
                        connections: [
                          ...model.connections,
                          {
                            id: uid('connection'),
                            type: 'weld',
                            from: selectedId || model.instances[0].id,
                            to: model.instances.find((i) => i.id !== (selectedId || model.instances[0].id)).id,
                            location: [0, 0, 0],
                            note: 'Enter weld location, size and process.',
                          },
                        ],
                      })
                    }
                  >
                    Add weld note
                  </button>
                </>
              ) : panel === 'sheets' ? (
                <SheetsPanel
                  model={model}
                  currentId={sheet?.id}
                  selection={
                    selectionMembers.length ? { subject: selectionSubject, count: selectionMembers.length } : null
                  }
                  scales={sheetScales()}
                  notice={sheetNotice?.model === model ? sheetNotice : null}
                  disabled={busy || Boolean(operationDraft)}
                  onOpen={openSheet}
                  onCreate={(subject, forceNew) =>
                    perform(() => openOrCreateSheet(subject, { forceNew, panel: 'sheets' }))
                  }
                  onRename={(id, title) => perform(() => renameSheet(id, title))}
                  onDuplicate={(id) => perform(() => copySheet(id))}
                  onDelete={(ids) => perform(() => deleteSheets(ids))}
                  onUndo={undo}
                  pdf={{ run: pdfRun, notice: pdfNoticeShown, actions: pdfActions, focus: pdfFocus }}
                  exportDisabled={!runtime.ready || busy || Boolean(operationDraft)}
                  onExportPdf={(ids, options) => perform(() => exportSheetsPdf(ids, options))}
                />
              ) : panel === 'sheet' && sheet ? (
                <SheetEditor
                  key={sheet.id}
                  sheet={sheet}
                  model={model}
                  ready={runtime.ready && !busy}
                  onGenerate={() => perform(requestDrawings)}
                  dimensionTool={dimensionTool}
                  onDimensionTool={(mode) => {
                    setDimensionTool(mode);
                    setSplit(true);
                  }}
                  previewReady={Boolean(svg)}
                  drawingViews={activeDrawing?.views || null}
                  drawingParts={drawingParts}
                  onScaleDraft={onScaleDraft}
                  viewportSelection={{ ids: selectionMembers, name: selectedGroup?.name || '' }}
                  onChange={(next) =>
                    commit({
                      ...model,
                      sheets: model.sheets.map((s) => (s.id === sheet.id ? { ...next, id: sheet.id } : s)),
                    })
                  }
                />
              ) : panel === 'fabrication' ? (
                <>
                  <h3>Fabrication settings</h3>
                  <p className="cad-help">
                    Allowances affect stock reservations only. The solid model and drawing dimensions stay nominal.
                  </p>
                  {Object.entries(model.fabrication)
                    .filter(([, value]) => typeof value !== 'object')
                    .map(([key, value]) => (
                      <ValueField
                        key={key}
                        label={`${key} (mm)`}
                        value={value}
                        onChange={(v) => commit({ ...model, fabrication: { ...model.fabrication, [key]: v } })}
                      />
                    ))}
                </>
              ) : panel === 'cuts' ? (
                <>
                  <h3>Assembly cutting list</h3>
                  {rows.map((r) => (
                    <article className="cad-cut-row" key={r.partId}>
                      <strong>
                        {r.quantity} × {r.name}
                      </strong>
                      <small>
                        {r.partId} · {r.material}
                      </small>
                      {r.member ? (
                        <>
                          <span>{sectionLabel(r.member.section)}</span>
                          <span>CL {r.member.centerline.toFixed(2)} mm</span>
                          <span>
                            Long {r.member.longPoint.toFixed(2)} / short {r.member.shortPoint.toFixed(2)} mm
                          </span>
                          <span>
                            Ends {r.member.angleStart}° / {r.member.angleEnd}° · gaps {r.member.gapStart} /{' '}
                            {r.member.gapEnd} mm
                          </span>
                        </>
                      ) : r.sheet ? (
                        <>
                          <span>
                            Blank {r.sheet.width.toFixed(2)} × {r.sheet.height.toFixed(2)} mm · t {r.sheet.thickness} mm{' '}
                            {r.sheet.stockName}
                          </span>
                          <span>
                            {r.sheet.bends} bend{r.sheet.bends === 1 ? '' : 's'} · cut length{' '}
                            {r.sheet.cutLength.toFixed(2)} mm · {r.sheet.pierces} pierce
                            {r.sheet.pierces === 1 ? '' : 's'}
                          </span>
                          <span>Folded {r.dimensions.map((n) => n.toFixed(2)).join(' × ')} mm</span>
                        </>
                      ) : (
                        <span>{r.dimensions.map((n) => n.toFixed(2)).join(' × ')} mm</span>
                      )}
                      {r.note && <p>{r.note}</p>}
                    </article>
                  ))}
                  {shopRows && (
                    <>
                      <h4>Shop records</h4>
                      {shopRows.finishes.map((f) => (
                        <article className="cad-cut-row" key={f.id}>
                          <strong>
                            Finish · {f.name} · {f.gloss} {f.kind}
                          </strong>
                          <small>
                            {f.parts} · {f.colour} · {f.thickness} µm
                          </small>
                          <span>
                            {f.area ?? '—'} m²
                            {f.mass != null ? ` · ${Number((f.mass * 1000).toFixed(1))} g powder` : ''}
                          </span>
                        </article>
                      ))}
                      {shopRows.prints.map((p) => (
                        <article className="cad-cut-row" key={p.id}>
                          <strong>
                            Print · {p.method} · {p.kind === 'text' ? `“${p.artwork}”` : 'image'}
                          </strong>
                          <small>{p.parts}</small>
                          <span>
                            {p.width} × {p.height} mm{p.colour ? ` · ${p.colour}` : ''}
                          </span>
                        </article>
                      ))}
                    </>
                  )}
                </>
              ) : panel === 'inspection' ? (
                <>
                  <h3>Solid interference</h3>
                  {inspection?.source !== model ? (
                    <p>Model changed. Run interference inspection again.</p>
                  ) : inspection?.items.length ? (
                    inspection.items.map((c) => (
                      <p key={c.first + c.second}>
                        {c.first} / {c.second}: {c.volume.toFixed(2)} mm³ overlap
                      </p>
                    ))
                  ) : (
                    <p>No solid intersections detected.</p>
                  )}
                </>
              ) : panel === 'advanced' ? (
                <>
                  <h3>Model definition</h3>
                  <p className="cad-help">
                    Stable IDs link parts, features, instances and annotations. Invalid references stop rebuilding and
                    exporting.
                  </p>
                  <JsonEditor key={JSON.stringify(model)} label="Model JSON" value={model} onApply={commit} />
                </>
              ) : isBody ? (
                // A group or several parts (§4.6): no single part, so the
                // single-part tools stay off; this panel acts on the body.
                <section className="cad-group-panel" aria-label="Selection">
                  {selectedGroup ? (
                    <>
                      <h3>Group</h3>
                      <ValueField
                        key={`${selectedGroup.id}-name`}
                        label="Group name"
                        asText
                        value={selectedGroup.name}
                        onChange={(name) => renameGroup(selectedGroup.id, name)}
                      />
                    </>
                  ) : (
                    <h3>
                      {liveSelection.length}{' '}
                      {liveSelection.some((id) => isGroupId(model, id)) ? 'items selected' : 'parts selected'}
                    </h3>
                  )}
                  {(() => {
                    const boxes = selectionMembers
                      .map((id) => runtime.snapshot?.instances.find((i) => i.id === id)?.bounds)
                      .filter(Boolean);
                    if (!boxes.length) return null;
                    const min = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[0][k])));
                    const max = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[1][k])));
                    const span = (k) => `${['X', 'Y', 'Z'][k]} ${+min[k].toFixed(3)}–${+max[k].toFixed(3)}`;
                    return (
                      <p className="cad-part-size" aria-label="Selection extent">
                        Spans {[0, 1, 2].map(span).join(' · ')} mm{runtime.ready ? '' : ' · rebuilding'}
                      </p>
                    );
                  })()}
                  {moveHint && <p className="cad-help">{moveHint}</p>}
                  {rigidMovers(model, selectionMembers).some((id) =>
                    model.connections.some(
                      (c) =>
                        c.from === id &&
                        (c.type === 'align' || (c.type === 'face-offset' && !(c.fromReference && c.toReference))),
                    ),
                  ) && (
                    <p className="cad-help">
                      Aligned parts re-align along their connection&apos;s world axis after turning.
                    </p>
                  )}
                  <h4>Parts</h4>
                  <ul className="cad-group-members" aria-label="Selected parts">
                    {selectionMembers.map((id) => (
                      <li key={id}>
                        <button type="button" title="Open its group and select this part" onClick={() => select(id)}>
                          {nodeName(draftModel, id)}
                          {draftModel.instances.find((i) => i.id === id)?.visible === false ? ' · hidden' : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <h4>Move by (mm)</h4>
                  <div
                    className="cad-move-by"
                    role="group"
                    aria-label="Move by (mm)"
                    onKeyDown={(e) => {
                      // Enter in a box commits that box (NumericInput), then moves.
                      if (e.key === 'Enter' && e.target instanceof HTMLInputElement) moveBodyBy();
                    }}
                  >
                    {['X', 'Y', 'Z'].map((axis, k) => (
                      <label key={axis} className={`cad-axis-${axis.toLowerCase()}`}>
                        {axis}
                        <NumericInput
                          aria-label={`Move by ${axis} (mm)`}
                          step="1"
                          value={moveBy[k]}
                          onCommit={(v) => setMoveByAxis(k, v)}
                        />
                      </label>
                    ))}
                    <button type="button" disabled={!placeable} title={moveHint || undefined} onClick={moveBodyBy}>
                      Move
                    </button>
                  </div>
                  <div className="cad-inline cad-group-actions">
                    {liveSelection.length >= 2 && (
                      <button
                        type="button"
                        title="Group the selected parts so they move together (Ctrl+G)"
                        onClick={() => perform(groupSelection)}
                      >
                        Group
                      </button>
                    )}
                    {liveSelection.some((id) => isGroupId(model, id)) && (
                      <button
                        type="button"
                        title="Split the selected group one level (Ctrl+Shift+G)"
                        onClick={() => perform(ungroupSelection)}
                      >
                        Ungroup
                      </button>
                    )}
                    <button type="button" onClick={() => perform(toggleBodyVisibility)}>
                      {bodyVisible ? 'Hide' : 'Show'}
                    </button>
                    <button type="button" aria-pressed={isolated} onClick={() => setIsolated(!isolated)}>
                      Isolate
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(bodyAnchor)}
                      title={bodyAnchor ? moveHint : 'Copy the parts, their groups and connections, 100 mm along X'}
                      onClick={() => perform(duplicateBody)}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busy || Boolean(operationDraft)}
                      title="A drawing sheet of these parts, fitted to the page"
                      onClick={drawSelection}
                    >
                      Drawing sheet
                    </button>
                    <button type="button" className="cad-danger" onClick={() => perform(removeBody)}>
                      {selectedGroup
                        ? `Remove group · ${selectionMembers.length} parts`
                        : `Remove ${selectionMembers.length} parts`}
                    </button>
                  </div>
                </section>
              ) : part ? (
                <>
                  <h3>{part.name}</h3>
                  <ValueField
                    key={`${part.id}-name`}
                    label="Part name"
                    value={part.name}
                    onChange={(name) => changePart({ ...part, name: String(name) })}
                  />
                  <MaterialSelect
                    key={part.id}
                    label="Material"
                    value={part.material}
                    projectMaterials={model.parts.map((p) => p.material)}
                    onChange={(material) => changePart({ ...part, material: String(material) })}
                  />
                  <p className="cad-help">
                    Definition {part.id} · {model.instances.filter((i) => i.partId === part.id).length} instances
                  </p>
                  {(() => {
                    const bounds = runtime.snapshot?.parts.find((p) => p.id === part.id)?.bounds;
                    if (!bounds) return null;
                    const size = bounds[1].map((v, i) => +(v - bounds[0][i]).toFixed(3));
                    const placed = runtime.snapshot.instances.find((i) => i.id === instance.id)?.bounds;
                    const span = (axis) =>
                      `${['X', 'Y', 'Z'][axis]} ${+placed[0][axis].toFixed(3)}–${+placed[1][axis].toFixed(3)}`;
                    return (
                      <>
                        <p className="cad-part-size" aria-label="Part size">
                          Size {size.join(' × ')} mm (X × Y × Z, part coordinates)
                          {runtime.ready ? '' : ' · rebuilding'}
                        </p>
                        {placed && (
                          <p className="cad-part-size" aria-label="Placed extent">
                            This instance spans {[0, 1, 2].map(span).join(' · ')} mm
                          </p>
                        )}
                      </>
                    );
                  })()}
                  <div className="cad-inline">
                    <button
                      type="button"
                      disabled={busy || Boolean(operationDraft)}
                      title="A drawing sheet of this part, fitted to the page"
                      onClick={drawSelection}
                    >
                      Drawing sheet
                    </button>
                  </div>
                  <details open>
                    <summary>Placement & rotation</summary>
                    {moveHint && <p className="cad-help">{moveHint}</p>}
                    <VectorFields
                      label="Position (mm)"
                      value={instance.position || [0, 0, 0]}
                      onChange={(position) => changeInstance({ ...instance, position })}
                    />
                    <VectorFields
                      label="Rotation (degrees)"
                      value={instance.rotation || [0, 0, 0]}
                      onChange={(rotation) => changeInstance({ ...instance, rotation })}
                    />
                    <details>
                      <summary>Advanced instance data</summary>
                      <JsonEditor
                        key={JSON.stringify(instance)}
                        label="Instance placement (mm / degrees)"
                        value={instance}
                        onApply={(i) => changeInstance({ ...i, id: instance.id, partId: instance.partId })}
                      />
                    </details>
                  </details>
                  {feature && (
                    <>
                      <h4 ref={featureHeading}>
                        {feature.type}
                        {feature.type === 'hole' && feature.row
                          ? ` ×${rowCountLabel(feature.row, runtime.snapshot?.parameters)}`
                          : ''}{' '}
                        · feature {part.features.indexOf(feature) + 1}
                      </h4>
                      {GUIDED_OPERATIONS.includes(feature.type) &&
                      !['hardware', ...CUT_TOOLS].includes(feature.type) ? (
                        <>
                          {feature.type === 'extrude' && (
                            <ExtrudeSummary
                              feature={feature}
                              sketch={model.sketches.find((s) => s.id === feature.sketchId)}
                              onEditSketch={() => perform(() => editSketch(feature.sketchId))}
                            />
                          )}
                          <p className="cad-help">
                            Configure this operation in a separate preview before applying changes.
                          </p>
                          <button
                            className="cad-primary cad-wide"
                            onClick={() => perform(() => beginOperation(feature.type, feature))}
                          >
                            Edit {feature.type} with preview
                          </button>
                        </>
                      ) : (
                        <>
                          {CUT_TOOLS.includes(feature.type) && (
                            <button
                              className="cad-primary cad-wide"
                              disabled={!runtime.ready}
                              onClick={() => perform(() => beginOperation(feature.type, feature))}
                            >
                              Edit {feature.type} with preview
                            </button>
                          )}
                          <FeatureForm
                            key={feature.id}
                            feature={feature}
                            model={model}
                            onEditOutline={
                              feature.type === 'sheetmetal'
                                ? () =>
                                    perform(() =>
                                      editOutline(feature.sketchId, {
                                        panel: 'part',
                                        instanceId: selectedId,
                                        featureId: feature.id,
                                      }),
                                    )
                                : null
                            }
                            editNotice={outlineNotice?.model === model ? outlineNotice.text : ''}
                            cutBounds={(() => {
                              const previous = part.features
                                .slice(0, part.features.indexOf(feature))
                                .filter((f) => !f.suppressed)
                                .at(-1);
                              return runtime.snapshot?.parts.find((p) => p.id === part.id)?.features[previous?.id]
                                ?.bounds;
                            })()}
                            onMoveCut={() => perform(() => startHoleTool('move'))}
                            cutMetrics={
                              runtime.ready
                                ? runtime.snapshot?.parts.find((p) => p.id === part.id)?.features[feature.id]
                                : null
                            }
                            onFocusCut={() =>
                              perform(() => {
                                const cut = runtime.snapshot.parts.find((p) => p.id === part.id)?.features[feature.id]
                                  ?.cut;
                                const placement = runtime.snapshot.instances.find(
                                  (i) => i.id === selectedId,
                                )?.placement;
                                if (!cut || !placement) throw new Error('Rebuild this cut before focusing it.');
                                setFocusTarget({
                                  position: mapPlacement(cut.position, placement),
                                  normal: mapPlacement(
                                    cut.direction.map((n) => -n),
                                    placement,
                                    true,
                                  ),
                                  span:
                                    Math.max(
                                      20,
                                      ...['diameter', 'width', 'height'].map((key) =>
                                        numeric(feature[key] || 0, runtime.snapshot.parameters),
                                      ),
                                    ) * 4,
                                });
                              })
                            }
                            addBendFocus={addBendFocus}
                            onChange={(f) =>
                              changePart({
                                ...part,
                                // A sheet-metal part's material is its stock's name (cut list, drawings).
                                ...(f.type === 'sheetmetal' && f.stock !== feature.stock && SHEET_STOCK[f.stock]
                                  ? { material: SHEET_STOCK[f.stock].name }
                                  : {}),
                                features: part.features.map((old) => (old.id === feature.id ? f : old)),
                              })
                            }
                          />
                        </>
                      )}
                      {soleFeature && (
                        <p className="cad-help">
                          {`This is the only active feature of ${part.name}: removing it removes the part and its ${partInstanceLabel}. To remove just this one, use Remove instance below.`}
                        </p>
                      )}
                      <div className="cad-inline">
                        <button
                          disabled={soleFeature}
                          title={
                            soleFeature
                              ? 'The only active feature of a part cannot be suppressed; remove the part instead.'
                              : undefined
                          }
                          onClick={() =>
                            changePart({
                              ...part,
                              features: part.features.map((f) =>
                                f.id === feature.id ? { ...f, suppressed: !f.suppressed } : f,
                              ),
                            })
                          }
                        >
                          {feature.suppressed ? 'Enable' : 'Suppress'}
                        </button>
                        {soleFeature ? (
                          <button
                            className="cad-danger"
                            onClick={() =>
                              perform(() => {
                                commit(removePart(model, part.id));
                                select(null);
                                setFeatureId(null);
                              })
                            }
                          >
                            {`Remove part · ${partInstanceLabel}`}
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              changePart({ ...part, features: part.features.filter((f) => f.id !== feature.id) });
                              setFeatureId(null);
                            }}
                          >
                            Remove feature
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  <button
                    className="cad-danger"
                    onClick={() =>
                      perform(() => {
                        // The last instance of an Add-hardware part takes its
                        // definition with it, unless another part uses it as a
                        // Boolean tool (docs/sketch-studio-remove-part.md §3.3).
                        const lastHardware =
                          part &&
                          part.features.length === 1 &&
                          part.features[0].type === 'hardware' &&
                          partInstanceCount === 1 &&
                          !model.parts.some(
                            (p) => p.id !== part.id && p.features.some((f) => f.toolPartId === part.id),
                          );
                        commit(lastHardware ? removePart(model, part.id) : removeInstance(model, instance.id));
                        select(null);
                      })
                    }
                  >
                    Remove instance
                  </button>
                </>
              ) : !model.parts.length && !sketchSession && !operationDraft && !mateSession && !measureSession ? (
                // Empty model: the ways in (docs/sketch-studio-start-sketch.md §4.4).
                <section className="cad-start" aria-label="Start">
                  <h3>Start</h3>
                  {model.parameters.length > 0 && (
                    <p>
                      {model.parameters.length} parameter{model.parameters.length === 1 ? '' : 's'} ready · start a
                      sketch to use them
                    </p>
                  )}
                  <button className="cad-primary" onClick={() => perform(startSketchPick)}>
                    New sketch
                  </button>
                  <small>or click an origin plane in the view · S</small>
                  <div className="cad-inline">
                    <button onClick={() => perform(() => addPart('board'))}>Board / plate</button>
                    <button onClick={() => perform(() => addPart('member'))}>Tube / member</button>
                    <button onClick={() => perform(() => addPart('angle'))}>Angle bar</button>
                  </div>
                  <button onClick={openDesignParameters}>Design parameters</button>
                  <h4>Examples</h4>
                  <div className="cad-inline">
                    <button onClick={() => perform(() => loadExample('table'))}>Welded table example</button>
                    <button onClick={() => perform(() => loadExample('pump'))}>Pump bracket drawing study</button>
                    <button onClick={() => perform(() => loadExample('cover'))}>Rear cover example</button>
                  </div>
                  <button onClick={() => setPanel('import-drafting')}>Import 2D profiles</button>
                  <p className="cad-help">Your 2D drawings stay in 2D drafting (top right).</p>
                </section>
              ) : (
                <>
                  <h3>Build accurately.</h3>
                  <p>Select a part to edit its features, stock dimensions and placement.</p>
                  <p className="cad-help">
                    Start from the Solid tab or choose an example in the parts tree. Use named parameters to link
                    dimensions explicitly.
                  </p>
                </>
              )}
            </aside>
          )}
        </div>
        <footer className="cad-status">
          <span className={`cad-status-dot ${runtime.ready ? 'is-ready' : ''}`} />
          <span>
            {shopSession?.station === 'laser' && shopSession.stage === 'sheet'
              ? `Laser — ${laserView?.sheet.name || 'setting up'} sheet · ${
                  runtime.ready
                    ? 'Model current'
                    : runtime.status === 'error'
                      ? 'Rebuild failed'
                      : runtime.status === 'cancelled'
                        ? 'Cancelled'
                        : 'Rebuilding solids…'
                }`
              : shopSession
                ? SHOP_STATUS[shopSession.station]?.[shopSession.stage] || ''
                : brakeSession
                  ? brakeSession.stage === 'stroke'
                    ? 'Press brake — bending…'
                    : // After a hit the exact solid rebuilds behind the station: say when it is current.
                      `Press brake — ${brake?.machine?.name || 'setting up'} · ${
                        runtime.ready
                          ? 'Model current'
                          : runtime.status === 'error'
                            ? 'Rebuild failed'
                            : runtime.status === 'cancelled'
                              ? 'Cancelled'
                              : 'Rebuilding solids…'
                      }`
                  : mateSession && mateSession.stage !== 'placed'
                    ? 'Pick faces to mate'
                    : sketchSession?.stage === 'pick'
                      ? 'Pick a face or plane to sketch on'
                      : sketchSession
                        ? 'Sketching — saved when you finish the sketch'
                        : operationDraft
                          ? 'Operation preview — not saved'
                          : busy
                            ? 'Preparing workshop output…'
                            : runtime.ready
                              ? 'Model current'
                              : runtime.status === 'error'
                                ? 'Rebuild failed'
                                : runtime.status === 'cancelled'
                                  ? 'Cancelled'
                                  : 'Rebuilding solids…'}
          </span>
          {placedNote?.selectionKey === selectionKey && <span role="status">{placedNote.text}</span>}
          <span>
            {model.parts.length} definitions · {model.instances.length} instances
          </span>
          <span>mm · XYZ rotation in degrees</span>
          <span className="cad-status-spacer" />
          {(!runtime.ready || busy) && (
            <>
              <button onClick={cancelWork}>Cancel</button>
              <button onClick={runtime.retry}>Retry worker</button>
            </>
          )}
          <span>{documentPersistence.isDirty ? 'Unsaved changes' : 'Saved'}</span>
        </footer>
      </section>
    </FieldContexts>
  );
}
