import { useState, useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CadViewport from './CadViewport.jsx';
import ProfileEditor from './ProfileEditor.jsx';
import ConnectionEditor from './ConnectionEditor.jsx';
import DraftingImport from './DraftingImport.jsx';
import OperationPanel from './OperationPanel.jsx';
import SheetEditor from './SheetEditor.jsx';
import HardwarePanel from './HardwarePanel.jsx';
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
  rotateInstance,
  rotateInstanceAbout,
  translateInstance,
  turnInstance,
} from './movement.js';
import { placementKeyAction } from './rotateKeys.js';
import { createCutFeature, positionedCut, snapCutPoint } from './cutPlacement.js';
import { CUT_TOOLS, cutRowDirection, cutTemplate } from './placementCuts.js';
import { changeRowCount, rowCountLabel } from './placementRows.js';
import { chosenHoleRows, pickRowHoles, removeChosenHole } from './placementHardware.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import { clone, createPart, normalizeModel, numeric, removeInstance, removePart, uid } from './model.js';
import { furnitureExample, bracketExample } from './examples.js';
import { ConstraintEditor, FeatureForm, JsonEditor, SketchForm, ValueField, VectorFields } from './CadEditors.jsx';
import { buildCutList, cutListCsv } from './fabrication.js';
import CadSketcher from './CadSketcher.jsx';
import { ExtrudeSummary, SketchOperationPanel, SketchSummary } from './SketchPanels.jsx';
import { SKETCH_PLANES, planeFrame, sketchConsumer, sketchWorldFrame, toPlane } from './sketchPlane.js';
import { PLANE_NAMES } from './originPlanes.js';
import { anchorWorld, formatMm, markOffset, markValue, modelPoses } from './marks.js';
import { entityPolyline } from './sketchProfile.js';
import { mateInstance } from './mate.js';
import SheetPreview from './SheetPreview.jsx';
import { FieldContexts } from './liveField.js';
import { DesignParametersForm, ParametersPanel } from './ParametersPanel.jsx';
import { mergeParameters, resolveParameterRows } from './parameters.js';
import { buildStarterModel } from './starterModels.js';
import { presetById } from './parameterPresets.js';
import {
  defaultSketchSettings,
  editableEntities,
  mergeSegments,
  sketchEditProblem,
  sketchFromSession,
  sketchOperationDraft,
  sketchPlaneText,
  sketchView,
} from './sketchOperations.js';
import { sheetSvg } from './drawings.js';
import './cad.css';

const tabs = ['Sketch', 'Solid', 'Assemble', 'Drawings', 'Manufacture'];
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
};
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
    [selectedId, setSelectedId] = useState(null),
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
    [exploded, setExploded] = useState(false),
    [isolated, setIsolated] = useState(false),
    [section, setSection] = useState(false),
    [sectionDepth, setSectionDepth] = useState(400),
    [fitKey, setFitKey] = useState(0);
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
    [drawings, setDrawings] = useState(null),
    [split, setSplit] = useState(false),
    [drawingZoom, setDrawingZoom] = useState(1),
    [sheetId, setSheetId] = useState(model.sheets[0]?.id),
    [inspection, setInspection] = useState(null);
  const [treeOpen, setTreeOpen] = useState(true),
    [propertiesOpen, setPropertiesOpen] = useState(true);
  useLayoutEffect(() => {
    if (propertiesPanel.current) propertiesPanel.current.scrollTop = 0;
  }, [selectedId, panel]);
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
  const attached = model.connections.some((c) => c.from === selectedId && c.type !== 'weld');
  const moveHint = attached
    ? 'This part is attached. Edit Connections / welds or move its parent part.'
    : exploded
      ? 'Turn off Exploded view to move parts.'
      : '';
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
      setCadModel(normalized, { skipHistory: true, revertSession: true });
      setError('');
      return;
    }
    fieldSession.current = session;
    fieldModel.current = session ? normalized : null;
    setCadModel(normalized, { skipHistory: coalesce });
    setError('');
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
  const measureBlocked = Boolean(exploded || operationDraft || sketchSession || mateSession || holeMode || busy);
  const measuring = Boolean(measureSession) && !measureBlocked;
  // Placement edits only need the displayed mesh, so they chain while the
  // kernel is still rebuilding the previous placement.
  const placeable = Boolean(
    part &&
    runtime.snapshot?.instances.some((i) => i.id === selectedId) &&
    !['error', 'cancelled'].includes(runtime.status) &&
    !attached &&
    !exploded &&
    !busy &&
    !operationDraft &&
    !holeMode &&
    !sketchSession &&
    !mateSession &&
    !measureSession,
  );
  // Turn by a fixed angle about X, Y or Z: the world axis, or in Local space
  // the part's own axis; through the picked pivot when turning about one.
  const turnSelected = (axisName, degrees) =>
    perform(() => {
      if (latestModel.current !== model) throw new Error('The model changed. Try again.');
      const parameters = runtime.snapshot.parameters;
      const axis = rotateSpace === 'local' ? instanceAxis(instance, axisName, parameters) : WORLD_AXES[axisName];
      const pivot = rotateAbout === 'picked' && moveMode && gizmo === 'rotate' ? viewport.current.getPivot() : null;
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
      const action = placementKeyAction(event, {
        selected: Boolean(part),
        busy: Boolean(sketchSession || holeMode || mateSession || operationDraft || measureSession),
        measuring: Boolean(measureSession),
        placeable,
        dragging: Boolean(viewport.current?.isDragging?.()),
        snap: rotateSnap,
        toolGizmo: Boolean(placementShown?.toolGizmo),
      });
      if (!action) return;
      event.preventDefault();
      // R / M while a boolean tool gizmo is shown: switch its mode.
      if (action.toolGizmo) setGizmo(action.mode);
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
  const select = (id) => {
    setHoleMode(null);
    setOperationDraft(null);
    setSelectedMarkId(null);
    setSelectedId(id);
    setSketchId(null);
    setFeatureId(null);
    setPanel(null);
  };
  // A new Board or Tube lands on the ground at the centre of the current view
  // (the viewport's drop point, snapped to the Move grid; the origin when the
  // viewport cannot say) and the camera stays where it is: a board's footprint
  // is centred on the point (a box is built from its corner), a tube's axis
  // runs up through it.
  const addPart = (kind) => {
    const created = createPart(kind);
    const [x, y] = viewport.current?.viewDropPoint?.() ?? [0, 0, 0];
    const body = created.part.features[0];
    const position = body.type === 'box' ? [x - body.width / 2, y - body.depth / 2, 0] : [x, y, 0];
    const instance = { ...created.instance, position };
    commit({ ...model, parts: [...model.parts, created.part], instances: [...model.instances, instance] });
    select(instance.id);
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
  const cancelSketch = () => {
    exitSketch();
    setPanel(null);
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
  const beginSketch = ({ frame, support, boundary = [], sketch = null, entities = [] }) => {
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
    });
    setFocusTarget(view.focus);
    setPanel('sketching');
  };
  // Look at: square to the plane, framing the face outline and the sketch.
  const lookAtSketch = (entities = []) => {
    if (!sketchSession?.frame) return;
    const drawn = entities.flatMap((entity) => {
      const points = entityPolyline(entity, 16);
      return points.slice(1).map((p, i) => [points[i], p]);
    });
    const view = sketchView(sketchSession.frame, [...sketchSession.outline, ...drawn], runtime.snapshot);
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
  const pickSketchPlane = (plane, offset = 0) => {
    const amount = Number(offset) || 0;
    beginSketch({
      frame: planeFrame(plane, amount),
      support: { type: 'plane', plane, offset: amount },
    });
  };
  const editSketch = (id) => {
    const target = model.sketches.find((s) => s.id === id);
    if (!target) throw new Error('The sketch no longer exists.');
    const problem = sketchEditProblem(target);
    if (problem) throw new Error(problem);
    if (sketchConsumer(model, id)?.instance && !runtime.ready)
      throw new Error('Wait for the model to rebuild before editing this sketch.');
    const { frame } = sketchWorldFrame(model, runtime.snapshot, target);
    beginSketch({ frame, support: target.support, sketch: target, entities: editableEntities(target) });
  };
  const finishSketch = (entities) =>
    perform(() => {
      const session = sketchSession;
      if (!entities.length) {
        cancelSketch();
        return;
      }
      const existing = session.sketchId ? model.sketches.find((s) => s.id === session.sketchId) : null;
      if (session.sketchId && !existing) throw new Error('This sketch was removed. Cancel the sketch.');
      const created = sketchFromSession({ session, entities, existing, name: session.name });
      commit({
        ...model,
        sketches: existing
          ? model.sketches.map((s) => (s.id === created.sketch.id ? created.sketch : s))
          : [...model.sketches, created.sketch],
      });
      exitSketch();
      setSketchId(created.sketch.id);
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
    setMateSession({ stage: 'moving' });
    setPanel('mate');
  };
  const pickMateFace = (info) => {
    if (!info.planar) throw new Error('Pick a flat face. Curved faces cannot be mated yet.');
    if (!runtime.ready) throw new Error('Wait for the model to rebuild first.');
    if (mateSession.stage === 'moving') {
      if (model.connections.some((c) => c.from === info.instanceId && c.type !== 'weld'))
        throw new Error('This part is attached to another one. Edit Connections / welds to move it.');
      const moving = model.instances.find((i) => i.id === info.instanceId);
      const bounds = viewport.current.getInstanceBounds(info.instanceId);
      if (!moving || !bounds) throw new Error('Pick a face of a visible part.');
      setSelectedId(moving.id);
      setMateSession({
        stage: 'target',
        instanceId: moving.id,
        moving: { point: info.point, normal: info.normal },
        base: { position: [...(moving.position || [0, 0, 0])], rotation: [...(moving.rotation || [0, 0, 0])] },
        center: bounds[0].map((v, i) => (v + bounds[1][i]) / 2),
        offset: 0,
      });
      return;
    }
    if (info.instanceId === mateSession.instanceId) throw new Error('Pick a face on a different part.');
    const next = { ...mateSession, stage: 'placed', target: { point: info.point, normal: info.normal } };
    commit(mateInstance(model, next, runtime.snapshot.parameters));
    setMateSession(next);
  };
  const changeMateOffset = (offset) =>
    performField(() => {
      const value = numeric(offset, runtime.snapshot?.parameters || {}, 'Offset');
      const next = { ...mateSession, offset: value };
      commit(mateInstance(model, next, runtime.snapshot?.parameters || {}));
      setMateSession(next);
    });
  const finishMate = () => {
    const id = mateSession?.instanceId;
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
        instances: model.instances.map((i) => (i.id === mateSession.instanceId ? { ...i, ...mateSession.base } : i)),
      });
    setMateSession(null);
    setPanel(null);
  };
  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.value.trim();
    const target = model.instances.find((i) => i.id === renaming.id);
    setRenaming(null);
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
    });
    setSheetId(added.sheets[0]?.id);
    select(added.instances[0]?.id);
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
  const requestDrawings = async () => {
    setBusy(true);
    try {
      const result = await runtime.request('drawings');
      setDrawings({ source: model, sheets: result });
      setSplit(true);
    } finally {
      setBusy(false);
    }
  };
  const exportFile = async (type) => {
    if (operationDraft) throw new Error('Apply or cancel the operation before exporting.');
    const generation = ++exportGeneration.current;
    const assertCurrent = () => {
      if (generation !== exportGeneration.current || latestModel.current !== model)
        throw new Error('Export cancelled or the model changed. Export the current design again.');
    };
    setBusy(true);
    try {
      const { download, workshopZip, vectorPdf } = await import('./exports.js');
      assertCurrent();
      if (type === 'csv') {
        download(
          new Blob([cutListCsv(buildCutList(model, runtime.snapshot))], { type: 'text/csv' }),
          'parts-and-cut-list.csv',
        );
        return;
      }
      if (type === 'svg' || type === 'dxf') {
        const views = await runtime.request('drawings');
        const selected = views.find((s) => s.id === sheet.id);
        if (!selected) throw new Error('Add geometry to this sheet before exporting.');
        const svg = sheetSvg(selected, model, runtime.snapshot, views.indexOf(selected) + 1, views.length);
        const content = type === 'svg' ? svg : (await import('./sheetDxf.js')).sheetDxf(svg);
        assertCurrent();
        download(
          new Blob([content], { type: type === 'svg' ? 'image/svg+xml' : 'application/dxf' }),
          'drawing.' + type,
        );
        return;
      }
      const data = await runtime.request(type === 'step' || type === 'stl' ? 'solids' : 'export');
      assertCurrent();
      if (type === 'zip' || type === 'pdf') {
        const blob =
          type === 'zip'
            ? await workshopZip(model, runtime.snapshot, data, document.name)
            : await vectorPdf(data.drawings, model, runtime.snapshot);
        assertCurrent();
        download(
          blob,
          type === 'zip' ? `${document.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-workshop.zip` : 'workshop.pdf',
        );
      } else if (type === 'step') {
        if (!data.assembly) throw new Error('Add an assembly instance first.');
        download(data.assembly, 'assembly.step');
      } else if (type === 'stl') {
        const file = data.files.find((f) => f.id === part?.id);
        if (!file) throw new Error('Select a part first.');
        download(file.stl, `${part.id}.stl`);
      }
    } finally {
      if (generation === exportGeneration.current) setBusy(false);
    }
  };
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
    { tab: 'Drawings', label: 'Generate views', current: true, run: requestDrawings },
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
      run: () => {
        const bounds = runtime.snapshot?.parts.find((p) => p.id === part?.id)?.bounds;
        const span = bounds ? Math.max(...bounds[1].map((v, i) => v - bounds[0][i])) : 1000;
        const next = {
          id: uid('sheet'),
          title: part?.name || 'Engineering drawing',
          partId: part?.id,
          layout: 'engineering',
          size: 'A3',
          units: 'mm',
          scale: [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005].find((s) => span * s < 60) || 0.001,
          revision: 'A',
          tolerance: 'Not specified',
          material: part?.material || '',
          views: ['top', 'isometric', 'front', 'right'],
          annotations: [],
          notes: '',
        };
        commit({ ...model, sheets: [...model.sheets, next] });
        setSheetId(next.id);
        setPanel('sheet');
        setSplit(true);
      },
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
      label: 'Add part sheets',
      run: () => {
        const added = model.parts.map((p) => ({
          ...clone(model.sheets[0]),
          id: uid('sheet'),
          partId: p.id,
          title: p.name,
          views: ['front', 'top', 'right', 'isometric'],
          annotations: [{ id: uid('annotation'), type: 'part-number', partId: p.id }],
        }));
        commit({ ...model, sheets: [...model.sheets, ...added] });
      },
    },
    { tab: 'Drawings', label: 'Vector PDF', current: true, run: () => exportFile('pdf') },
    { tab: 'Manufacture', label: 'Cutting list', current: true, run: () => setPanel('cuts') },
    { tab: 'Manufacture', label: 'Fabrication settings', run: () => setPanel('fabrication') },
    { tab: 'Manufacture', label: 'Export CSV', current: true, run: () => exportFile('csv') },
    { tab: 'Manufacture', label: 'STEP assembly', current: true, run: () => exportFile('step') },
    { tab: 'Manufacture', label: 'STL part', current: true, run: () => exportFile('stl') },
    { tab: 'Manufacture', label: 'Workshop ZIP', current: true, run: () => exportFile('zip') },
  ];
  const pickingFace = sketchSession?.stage === 'pick' || (mateSession && mateSession.stage !== 'placed');
  // Origin plane tiles: on an empty model at rest, and while picking where a new sketch goes.
  const planesShown =
    (model.parts.length === 0 && !sketchSession && !operationDraft && !measureSession && !mateSession && !holeMode) ||
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
      if (event.key === 'Escape') {
        event.preventDefault();
        const back = draftStale ? null : stepBack(operationDraft, placementContext());
        if (back) setOperationDraft(back);
        else cancelOperation();
      } else if (event.key === 'Enter') {
        // A focused, enabled control activates itself on Enter.
        const control = event.target instanceof HTMLElement ? event.target.closest('button, a, summary') : null;
        if (control && !control.disabled) return;
        const p = operationDraft.placement;
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
  // Mark coordinates and values for the Marks panel, as the model is shown.
  const markPoses = useMemo(() => modelPoses(model, runtime.snapshot), [model, runtime.snapshot]);
  const rows = useMemo(() => {
    try {
      return runtime.ready ? buildCutList(model, runtime.snapshot) : [];
    } catch {
      return [];
    }
  }, [model, runtime.ready, runtime.snapshot]);
  // Projected views stay valid while only a sheet's annotations, title block
  // or parts-list setting change; anything that changes geometry or which
  // views are projected needs Generate views again.
  const generated =
    drawings &&
    ['parameters', 'sketches', 'parts', 'instances', 'connections'].every((k) => drawings.source[k] === model[k])
      ? drawings.sheets.find((s) => s.id === sheet?.id)
      : null;
  const drawnSheet = generated && drawings.source.sheets.find((s) => s.id === sheet.id);
  const activeDrawing =
    generated &&
    ['views', 'section', 'partId', 'instanceIds', 'explodeDistance'].every(
      (k) => JSON.stringify(drawnSheet?.[k]) === JSON.stringify(sheet[k]),
    )
      ? { ...sheet, bounds: generated.bounds, views: generated.views }
      : null;
  let svg = '',
    drawingError = '';
  if (activeDrawing) {
    try {
      svg = sheetSvg(
        activeDrawing,
        model,
        runtime.snapshot,
        drawings.sheets.indexOf(generated) + 1,
        drawings.sheets.length,
      );
    } catch (e) {
      drawingError = e.message;
    }
  }
  return (
    <FieldContexts parameters={parameterContext} channel={fieldMeta}>
      <section className="cad-workspace" aria-label="Sketch Studio solid modeling">
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
            <button onClick={newSketch}>New</button>
            <button onClick={openSketch}>Open</button>
            <button onClick={saveSketch}>Save</button>
            <button onClick={saveSketchAs}>Save as</button>
            <button disabled={!canUndo} onClick={undo}>
              Undo
            </button>
            <button disabled={!canRedo} onClick={redo}>
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
        <div className="cad-ribbon">
          {commands
            .filter((c) => (search ? c.label.toLowerCase().includes(search.toLowerCase()) : c.tab === tab))
            .map((c) => (
              <button
                key={c.label}
                disabled={
                  busy ||
                  Boolean(operationDraft) ||
                  Boolean(sketchSession) ||
                  Boolean(mateSession) ||
                  (c.current && !runtime.ready)
                }
                onClick={() => perform(c.run)}
              >
                <Icon name={c.tab} />
                {c.label}
              </button>
            ))}
        </div>
        <div className="cad-main">
          {treeOpen && (
            <aside className="cad-tree">
              <div className="cad-panel-heading">
                PARTS & FEATURES
                <button aria-label="Collapse parts panel" onClick={() => setTreeOpen(false)}>
                  ‹
                </button>
              </div>
              <fieldset className="cad-tree-body" disabled={Boolean(sketchSession || mateSession)}>
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
                  {model.instances.map((i) => {
                    const p = model.parts.find((p) => p.id === i.partId);
                    return (
                      <div key={i.id}>
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
                        ) : (
                          <button
                            className={`cad-tree-item ${selectedId === i.id ? 'is-selected' : ''}`}
                            title="Double-click or F2 to rename"
                            onClick={() => select(i.id)}
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
                                  {f.operation === 'cut' ? ' (cut)' : ''}
                                  {f.suppressed ? ' (suppressed)' : ''}
                                  {runtime.error?.featureId === f.id ? ' ⚠' : ''}
                                </button>
                                {f.sketchId && model.sketches.some((s) => s.id === f.sketchId) && (
                                  <button
                                    className="cad-feature-sketch"
                                    aria-label={`Edit sketch of feature ${index + 1}`}
                                    title={model.sketches.find((s) => s.id === f.sketchId)?.name}
                                    onClick={() => perform(() => editSketch(f.sketchId))}
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
            </aside>
          )}
          <div className="cad-center">
            <div className="cad-view-toolbar">
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
                disabled={!part || !runtime.ready || Boolean(operationDraft) || Boolean(sketchSession)}
                aria-pressed={holeMode === 'place'}
                onClick={() => perform(() => startHoleTool('place'))}
              >
                Place holes
              </button>
              <button
                disabled={!part || !runtime.ready || Boolean(operationDraft) || Boolean(sketchSession)}
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
              {marks.length > 0 && (
                <button
                  aria-pressed={!hideMarks}
                  title="Show or hide the dimension marks"
                  onClick={() => setHideMarks(!hideMarks)}
                >
                  Show marks
                </button>
              )}
              {holeMode && (
                <>
                  <label>
                    Hole snap (mm){' '}
                    <input
                      aria-label="Hole snap (mm)"
                      type="number"
                      min="0"
                      step="0.1"
                      value={holeSnap}
                      onChange={(e) => setHoleSnap(Math.max(0, Number(e.target.value) || 0))}
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
              {moveMode && gizmo === 'rotate' && (
                <>
                  <span className="cad-segmented" role="group" aria-label="Rotation space">
                    {[
                      ['world', 'World', 'Rings and 90° turns use the world X, Y and Z axes'],
                      ['local', 'Local', "Rings and 90° turns use the selected part's own X, Y and Z axes"],
                    ].map(([space, label, title]) => (
                      <button
                        key={space}
                        type="button"
                        aria-pressed={rotateSpace === space}
                        title={title}
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
                        `Turn 90° about the ${rotateSpace === 'local' ? "part's own " : ''}${name} axis · Shift+click turns the other way` +
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
                    <input
                      aria-label="Rotate snap (degrees)"
                      type="number"
                      min="0"
                      step="1"
                      value={rotateSnap}
                      onChange={(e) => setRotateSnap(Math.max(0, Number(e.target.value) || 0))}
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
              {moveMode && gizmo === 'translate' && (
                <label>
                  Snap (mm){' '}
                  <input
                    aria-label="Move snap (mm)"
                    type="number"
                    min="0"
                    step="1"
                    value={moveSnap}
                    onChange={(e) => setMoveSnap(Math.max(0, Number(e.target.value) || 0))}
                    title="0 for free movement"
                  />
                </label>
              )}
              <button aria-pressed={split} onClick={() => setSplit(!split)}>
                Split drawing
              </button>
              {section && (
                <label>
                  Section Z{' '}
                  <input
                    aria-label="Section depth"
                    type="number"
                    value={sectionDepth}
                    onChange={(e) => setSectionDepth(Number(e.target.value))}
                  />
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
                  model={displayPreview ? draftModel : model}
                  selectedId={selectedId}
                  onSelect={select}
                  isolated={isolated}
                  view={view}
                  perspective={perspective}
                  exploded={exploded}
                  section={section ? sectionDepth : null}
                  fitKey={fitKey}
                  previewShown={displayPreview}
                  moveEnabled={moveMode && placeable}
                  transformMode={gizmo}
                  rotateSnap={rotateSnap}
                  rotateSpace={rotateSpace}
                  pivotPick={rotateAbout === 'picked'}
                  holeMode={!operationDraft && !exploded && !section && !busy ? holeMode : null}
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
                      commit(translateInstance(model, id, delta));
                    })
                  }
                  onRotate={(id, turn, center) =>
                    perform(() => {
                      if (latestModel.current !== model) throw new Error('The model changed. Try the turn again.');
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
                  hideMarks={hideMarks}
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
                />
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
                <div className="cad-view-cube" aria-label="View cube">
                  {['top', 'front', 'right', 'isometric'].map((v) => (
                    <button key={v} onClick={() => setView(v)}>
                      {v === 'isometric' ? 'ISO' : v}
                    </button>
                  ))}
                </div>
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
                  <select
                    aria-label="Drawing sheet"
                    value={sheet?.id || ''}
                    onChange={(e) => setSheetId(e.target.value)}
                  >
                    {model.sheets.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <label className="cad-field">
                    Drawing zoom
                    <input
                      type="range"
                      aria-label="Drawing zoom"
                      min="0.5"
                      max="4"
                      step="0.25"
                      value={drawingZoom}
                      onChange={(e) => setDrawingZoom(Number(e.target.value))}
                    />
                  </label>
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
              {panel === 'hardware' ? (
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
                  onChangeAxis={() => setOperationDraft(startAxisPick(operationDraft))}
                  onSweepOptions={(patch) =>
                    performField(() => setOperationDraft(changeSweepOptions(operationDraft, patch, placementContext())))
                  }
                  onError={setError}
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
                  {Object.entries(model.fabrication).map(([key, value]) => (
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
                          <span>CL {r.member.centerline.toFixed(2)} mm</span>
                          <span>
                            Long {r.member.longPoint.toFixed(2)} / short {r.member.shortPoint.toFixed(2)} mm
                          </span>
                          <span>
                            Ends {r.member.angleStart}° / {r.member.angleEnd}° · gaps {r.member.gapStart} /{' '}
                            {r.member.gapEnd} mm
                          </span>
                        </>
                      ) : (
                        <span>{r.dimensions.map((n) => n.toFixed(2)).join(' × ')} mm</span>
                      )}
                      {r.note && <p>{r.note}</p>}
                    </article>
                  ))}
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
                            onChange={(f) =>
                              changePart({
                                ...part,
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
            {mateSession && mateSession.stage !== 'placed'
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
          <span>
            {model.parts.length} definitions · {model.instances.length} instances
          </span>
          <span>mm · XYZ rotation in degrees</span>
          <span className="cad-status-spacer" />
          {(!runtime.ready || busy) && (
            <>
              <button
                onClick={() => {
                  exportGeneration.current++;
                  runtime.cancel();
                  setBusy(false);
                }}
              >
                Cancel
              </button>
              <button onClick={runtime.retry}>Retry worker</button>
            </>
          )}
          <span>{documentPersistence.isDirty ? 'Unsaved changes' : 'Saved'}</span>
        </footer>
      </section>
    </FieldContexts>
  );
}
