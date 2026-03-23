import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import sketchStudioReducer from '../store/sketchStudioReducer';
import {
  cancelDraft,
  cancelAnchorDrag,
  cancelHandleDrag,
  cancelTransform,
  clearPointerDecorations,
  commitEntity,
  deleteSelected,
  endAnchorDrag,
  endHandleDrag,
  endPan,
  endSelectionBox,
  endTransform,
  patchTransform,
  patchDraft,
  loadWorkspaceSnapshot,
  setActiveLayer,
  setActiveTool,
  setCanvasSize,
  setDocument,
  setDocumentEntities,
  setPointerDown,
  setPrecisionInput,
  setSelection,
  setSuppressNextClick,
  setUiFlag,
  setViewport,
  startDraft,
  startHandleDrag,
  startPan,
  startSelectionBox,
  startTransform,
  syncPointer,
  undo,
  redo,
  updatePan,
  updateSelectionBox,
} from '../store/sketchStudioActions';
import {
  applyOrthoPoint,
  calculateDistance,
  getNextZoom,
  pixelsToWorldUnits,
  projectPointFromStart,
  roundWorldValue,
  screenToWorld,
  zoomAtPoint,
} from '../utils/canvasMath';
import {
  buildLineFromExactLength,
  buildSourceRefFromSnap,
  createArcEntity,
  createCircleEntity,
  createAngleDimensionEntity,
  createDimensionEntity,
  duplicateEntitiesByIds,
  createEllipseEntity,
  createFeatureEntity,
  createLineEntity,
  createPolylineEntity,
  createRectEntity,
  createTextEntity,
  getDimensionOffsetFromPlacement,
  getEntityMeasurementRows,
  resolveSourceReferenceFromEntities,
  toggleBrokenLineForEntities,
  updateEntityFromNumericField,
  updateEntityInList,
} from '../utils/entityUtils';
import { formatDimensionText, inferDimensionSubtype, measureDistance } from '../utils/dimensionUtils';
import { getPrecisionHudData } from '../utils/draftPrecisionUtils';
import { getEntityHandles, updateEntityFromHandle } from '../utils/handleUtils';
import { findTopmostEntityAtPoint } from '../utils/hitTest';
import {
  applyIsometricOrthoPoint,
  buildIsometricEllipse,
  buildIsometricPlaneRectangle,
  getIsometricPlaneAxes,
} from '../utils/isometricUtils';
import {
  createLayer,
  getEditableEntities,
  getNextActiveLayer,
  getVisibleEntities,
  moveEntitiesToLayer,
  renameLayer,
  toggleLayerLock,
  toggleLayerVisibility,
} from '../utils/layerUtils';
import {
  getSelectedProfileInfo,
} from '../utils/objectUtils';
import {
  measureOffsetDistance,
  offsetLineEntity,
  offsetPolylineEntity,
  offsetRectEntity,
} from '../utils/offsetUtils';
import { getAngleDimensionGeometry, formatAngleText, computeIsometricAngle } from '../utils/angleUtils';
import {
  findFilletableCorner,
  computeSketchFillet,
  applyFillet,
  DEFAULT_FILLET_RADIUS,
  MIN_FILLET_RADIUS,
  MAX_FILLET_RADIUS,
  FILLET_RADIUS_STEP,
} from '../utils/filletUtils';
import { closePolyline, isPolylineClosed } from '../utils/profileUtils';
import { appendPolylineVertex, removeLastPolylineVertex } from '../utils/polylineUtils';
import { getEntityIdsInSelectionBox, normalizeSelectionBox } from '../utils/selectionUtils';
import { snapWorldPoint } from '../utils/snapUtils';
import { createBlankSketchDocument, normalizeCommittedSketchName } from '../utils/sketchDocumentUtils';
import {
  buildSketchWorkspaceSnapshot,
  normalizeParsedSketchWorkspace,
  serializeComparableSketchWorkspace,
} from '../utils/workspaceSerializationUtils';
import {
  getSketchWorkspaceFileName,
  importSketchWorkspaceFile,
  isFilePickerAbortError,
  openSketchWorkspaceFile,
  saveSketchWorkspaceFile,
} from '../utils/sketchWorkspaceFileUtils';
import { computeSelectionBounds, mirrorEntities, rotateEntities, translateEntities } from '../utils/transformUtils';
import {
  loadSketchRecovery,
  saveSketchRecovery,
} from '../../../shared/sketchAssetStorage';

const HIT_TOLERANCE_PX = 10;
const SNAP_TOLERANCE_PX = 12;
const PROFILE_CLOSE_TOLERANCE_PX = 14;
const TRANSFORM_DRAG_THRESHOLD_PX = 3;

export const TOOL_DEFINITIONS = [
  { id: 'select', label: 'Select', shortLabel: 'SEL', shortcut: 'V', description: 'Pick, marquee, and transform entities' },
  { id: 'pan', label: 'Pan', shortLabel: 'PAN', shortcut: 'H', description: 'Move the viewport' },
  { id: 'line', label: 'Line', shortLabel: 'LIN', shortcut: 'L', description: 'Create line entities' },
  { id: 'rect', label: 'Rectangle', shortLabel: 'REC', shortcut: 'R', description: 'Create rectangle entities' },
  { id: 'circle', label: 'Circle', shortLabel: 'CIR', shortcut: 'C', description: 'Create circle entities' },
  { id: 'polyline', label: 'Polyline', shortLabel: 'PLY', shortcut: 'P', description: 'Create multi-segment paths' },
  { id: 'arc', label: 'Arc', shortLabel: 'ARC', shortcut: 'A', description: 'Create three-point arcs' },
  { id: 'text', label: 'Text', shortLabel: 'TXT', shortcut: 'T', description: 'Place text labels on the canvas' },
  { id: 'offset', label: 'Offset', shortLabel: 'OFF', shortcut: 'O', description: 'Create offset copies of supported profiles' },
  { id: 'holeCircle', label: 'Hole', shortLabel: 'HOL', shortcut: 'J', description: 'Create circular subtractive features' },
  { id: 'cutoutRect', label: 'Cutout', shortLabel: 'CUT', shortcut: 'U', description: 'Create rectangular subtractive features' },
  { id: 'dimension', label: 'Dimension', shortLabel: 'DIM', shortcut: 'D', description: 'Create linear dimension annotations' },
  { id: 'fillet', label: 'Fillet', shortLabel: 'FIL', shortcut: 'F', description: 'Round corners with an arc radius' },
  { id: 'angle', label: 'Angle', shortLabel: 'ANG', shortcut: 'Q', description: 'Measure angles between two rays' },
];

const TOOL_SHORTCUT_MAP = new Map(
  TOOL_DEFINITIONS.map((tool) => [tool.shortcut.toLowerCase(), tool.id]),
);

function getEmptySnapState() {
  return {
    point: null,
    sourceEntityId: null,
    entityType: null,
    sourceType: null,
    sourceKey: null,
    snapType: null,
  };
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function mergeSelection(existingIds, nextIds, additive) {
  if (!additive) {
    return nextIds;
  }

  return Array.from(new Set([...existingIds, ...nextIds]));
}

function constrainAnglePoint(vertex, p1, cursorPoint, angleDeg, isometricPlane) {
  const dist = calculateDistance(vertex, cursorPoint) || 50;

  if (isometricPlane) {
    // Work in isometric plane space
    const { axisA, axisB } = getIsometricPlaneAxes(isometricPlane);
    const det = (axisA.x * axisB.y) - (axisA.y * axisB.x);
    if (Math.abs(det) < 1e-6) return cursorPoint;

    // Unproject dir1 and cursor direction to plane space
    const d1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
    const proj1a = ((d1.x * axisB.y) - (d1.y * axisB.x)) / det;
    const proj1b = ((axisA.x * d1.y) - (axisA.y * d1.x)) / det;
    const baseAngle = Math.atan2(proj1b, proj1a);

    const dc = { x: cursorPoint.x - vertex.x, y: cursorPoint.y - vertex.y };
    const projCa = ((dc.x * axisB.y) - (dc.y * axisB.x)) / det;
    const projCb = ((axisA.x * dc.y) - (axisA.y * dc.x)) / det;
    const cursorPlaneAngle = Math.atan2(projCb, projCa);

    let delta = cursorPlaneAngle - baseAngle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    const sign = delta >= 0 ? 1 : -1;
    const targetPlaneAngle = baseAngle + sign * (angleDeg * Math.PI / 180);

    // Project back to screen space
    const pa = Math.cos(targetPlaneAngle);
    const pb = Math.sin(targetPlaneAngle);
    const screenDir = {
      x: pa * axisA.x + pb * axisB.x,
      y: pa * axisA.y + pb * axisB.y,
    };
    const screenLen = Math.hypot(screenDir.x, screenDir.y) || 1;
    return {
      x: vertex.x + (screenDir.x / screenLen) * dist,
      y: vertex.y + (screenDir.y / screenLen) * dist,
    };
  }

  // Standard screen-space constraint
  const dir1x = p1.x - vertex.x;
  const dir1y = p1.y - vertex.y;
  const baseAngle = Math.atan2(dir1y, dir1x);

  const cursorAngle = Math.atan2(cursorPoint.y - vertex.y, cursorPoint.x - vertex.x);
  let delta = cursorAngle - baseAngle;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;

  const sign = delta >= 0 ? 1 : -1;
  const targetAngle = baseAngle + sign * (angleDeg * Math.PI / 180);

  return {
    x: vertex.x + Math.cos(targetAngle) * dist,
    y: vertex.y + Math.sin(targetAngle) * dist,
  };
}

function parsePositiveNumber(rawValue) {
  if (rawValue === '') {
    return null;
  }

  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function isOffsettableEntity(entity) {
  return entity?.type === 'line'
    || entity?.type === 'rect'
    || (entity?.type === 'polyline' && isPolylineClosed(entity));
}

function getRectEndpointFromDraft(draft) {
  if (!draft.startPoint || !draft.currentPoint) {
    return null;
  }

  const width = parsePositiveNumber(draft.precisionInput.width) ?? Math.abs(draft.currentPoint.x - draft.startPoint.x);
  const height = parsePositiveNumber(draft.precisionInput.height) ?? Math.abs(draft.currentPoint.y - draft.startPoint.y);
  const signX = draft.currentPoint.x >= draft.startPoint.x ? 1 : -1;
  const signY = draft.currentPoint.y >= draft.startPoint.y ? 1 : -1;

  return {
    x: draft.startPoint.x + signX * width,
    y: draft.startPoint.y + signY * height,
  };
}

function getIsometricRectangleFromDraft(draft, plane = 'top') {
  if (!draft.startPoint || !draft.currentPoint) {
    return null;
  }

  return buildIsometricPlaneRectangle(draft.startPoint, draft.currentPoint, plane, {
    sizeA: parsePositiveNumber(draft.precisionInput.width),
    sizeB: parsePositiveNumber(draft.precisionInput.height),
  });
}

function getLineEndpointFromDraft(draft) {
  if (!draft.startPoint || !draft.currentPoint) {
    return null;
  }

  const length = parsePositiveNumber(draft.precisionInput.length);
  return length ? buildLineFromExactLength(draft.startPoint, draft.currentPoint, length) : draft.currentPoint;
}

function getCircleRadiusPointFromDraft(draft) {
  if (!draft.startPoint || !draft.currentPoint) {
    return null;
  }

  const radius = parsePositiveNumber(draft.precisionInput.radius) ?? calculateDistance(draft.startPoint, draft.currentPoint);
  return projectPointFromStart(draft.startPoint, draft.currentPoint, radius);
}

function getHolePreviewFromDraft(draft) {
  if (!draft.startPoint || !draft.currentPoint) {
    return null;
  }

  const diameter = parsePositiveNumber(draft.precisionInput.diameter)
    ?? calculateDistance(draft.startPoint, draft.currentPoint) * 2;

  return {
    type: 'feature',
    featureType: 'hole',
    shape: 'circle',
    cx: draft.startPoint.x,
    cy: draft.startPoint.y,
    diameter,
    radius: diameter / 2,
  };
}

function getHolePreviewFromDraftWithMode(draft, viewMode = 'plan', isometricPlane = 'top') {
  if (viewMode === 'isometric') {
    const diameter = parsePositiveNumber(draft.precisionInput.diameter)
      ?? calculateDistance(draft.startPoint, draft.currentPoint) * 2;
    const ellipse = buildIsometricEllipse(draft.startPoint, draft.currentPoint, isometricPlane, {
      radius: diameter / 2,
    });

    if (!ellipse) {
      return null;
    }

    return {
      type: 'feature',
      featureType: 'hole',
      shape: 'ellipse',
      diameter,
      ...ellipse,
    };
  }

  return getHolePreviewFromDraft(draft);
}

function getCutoutPreviewFromDraft(draft, viewMode = 'plan', isometricPlane = 'top') {
  const endPoint = viewMode === 'isometric'
    ? null
    : getRectEndpointFromDraft(draft);

  if (viewMode === 'isometric') {
    const shape = getIsometricRectangleFromDraft(draft, isometricPlane);

    if (!shape) {
      return null;
    }

    return {
      type: 'feature',
      featureType: 'cutout',
      shape: 'polygon',
      points: shape.points,
      startPoint: draft.startPoint,
      endPoint: draft.currentPoint,
      width: shape.width,
      height: shape.height,
    };
  }

  if (!draft.startPoint || !endPoint) {
    return null;
  }

  return {
    type: 'feature',
    featureType: 'cutout',
    shape: 'rect',
    startPoint: draft.startPoint,
    endPoint,
  };
}

function buildOffsetEntityFromDraft(draft, document, targetLayerId) {
  const sourceEntity = document.entities.find((entity) => entity.id === draft.sourceEntityId);

  if (!sourceEntity || !draft.currentPoint) {
    return null;
  }

  const distance = parsePositiveNumber(draft.precisionInput.offset) ?? measureOffsetDistance(sourceEntity, draft.currentPoint);

  if (!distance) {
    return null;
  }

  if (sourceEntity.type === 'line') {
    return offsetLineEntity(sourceEntity, draft.currentPoint, distance, document.entities, targetLayerId);
  }

  if (sourceEntity.type === 'rect') {
    return offsetRectEntity(sourceEntity, draft.currentPoint, distance, document.entities, targetLayerId);
  }

  if (sourceEntity.type === 'polyline') {
    return offsetPolylineEntity(sourceEntity, draft.currentPoint, distance, document.entities, targetLayerId);
  }

  return null;
}

function getDraftPreviewEntity(draft, document, targetLayerId, ui) {
  if (!draft.type) {
    return null;
  }

  if (draft.type === 'line' && draft.startPoint && draft.currentPoint) {
    const endPoint = getLineEndpointFromDraft(draft);
    return { type: 'line', x1: draft.startPoint.x, y1: draft.startPoint.y, x2: endPoint.x, y2: endPoint.y };
  }

  if (draft.type === 'rect' && draft.startPoint && draft.currentPoint) {
    if (ui?.viewMode === 'isometric') {
      const shape = getIsometricRectangleFromDraft(draft, ui.isometricPlane);

      return shape
        ? {
            type: 'polyline',
            points: shape.points,
            closed: true,
            startPoint: draft.startPoint,
            endPoint: draft.currentPoint,
            width: shape.width,
            height: shape.height,
          }
        : null;
    }

    return { type: 'rect', startPoint: draft.startPoint, endPoint: getRectEndpointFromDraft(draft) };
  }

  if (draft.type === 'circle' && draft.startPoint && draft.currentPoint) {
    if (ui?.viewMode === 'isometric') {
      const radius = parsePositiveNumber(draft.precisionInput.radius) ?? calculateDistance(draft.startPoint, draft.currentPoint);
      const ellipse = buildIsometricEllipse(draft.startPoint, getCircleRadiusPointFromDraft(draft), ui.isometricPlane, {
        radius,
      });

      return ellipse ? { type: 'ellipse', radius, ...ellipse } : null;
    }

    const radiusPoint = getCircleRadiusPointFromDraft(draft);
    return {
      type: 'circle',
      center: draft.startPoint,
      radiusPoint,
      radius: calculateDistance(draft.startPoint, radiusPoint),
    };
  }

  if (draft.type === 'holeCircle') {
    return getHolePreviewFromDraftWithMode(draft, ui?.viewMode, ui?.isometricPlane);
  }

  if (draft.type === 'cutoutRect') {
    return getCutoutPreviewFromDraft(draft, ui?.viewMode, ui?.isometricPlane);
  }

  if (draft.type === 'offset') {
    return buildOffsetEntityFromDraft(draft, document, targetLayerId);
  }

  if (draft.type === 'fillet' && draft.hoveredCorner) {
    if (draft.previewGeometry) {
      const { tangentPoint1, tangentPoint2, controlPoint } = draft.previewGeometry;
      return {
        type: 'fillet-preview',
        tangentPoint1,
        tangentPoint2,
        controlPoint,
        cornerPoint: draft.hoveredCorner.cornerPoint,
        radius: draft.previewGeometry.radius,
      };
    }
    // Corner found but geometry failed — show just the corner highlight
    return { type: 'fillet-preview', cornerPoint: draft.hoveredCorner.cornerPoint };
  }

  if (draft.type === 'polyline' && draft.points.length) {
    return {
      type: 'polyline',
      points: draft.currentPoint ? [...draft.points, draft.currentPoint] : draft.points,
      closed: draft.closedPreview ?? false,
    };
  }

  if (draft.type === 'arc') {
    if (draft.points.length === 1 && draft.currentPoint) {
      return { type: 'line', x1: draft.points[0].x, y1: draft.points[0].y, x2: draft.currentPoint.x, y2: draft.currentPoint.y };
    }

    if (draft.points.length === 2 && draft.currentPoint) {
      return { type: 'arc', start: draft.points[0], end: draft.points[1], control: draft.currentPoint };
    }
  }

  if (draft.type === 'dimension') {
    if (draft.points.length === 1 && draft.currentPoint) {
      return { type: 'dimension-guide', p1: draft.points[0], p2: draft.currentPoint };
    }

    if (draft.points.length === 2 && draft.currentPoint) {
      const subtype = draft.subtype ?? inferDimensionSubtype(draft.points[0], draft.points[1]);
      return {
        type: 'dimension',
        p1: draft.points[0],
        p2: draft.points[1],
        subtype,
        offset: getDimensionOffsetFromPlacement(subtype, draft.points[0], draft.points[1], draft.currentPoint),
        units: document.units,
      };
    }
  }

  if (draft.type === 'angle') {
    if (draft.points.length === 1 && draft.currentPoint) {
      return { type: 'angle-guide', p1: draft.points[0], p2: draft.currentPoint };
    }

    if (draft.points.length === 2 && draft.currentPoint) {
      const vertex = draft.points[1];
      const arcRadius = calculateDistance(vertex, draft.currentPoint);
      const inputAngle = parsePositiveNumber(draft.precisionInput?.angle);
      const isoPlane = ui?.viewMode === 'isometric' ? ui.isometricPlane : null;
      const p2 = inputAngle != null
        ? constrainAnglePoint(vertex, draft.points[0], draft.currentPoint, inputAngle, isoPlane)
        : draft.currentPoint;
      return {
        type: 'angle-dimension',
        vertex,
        p1: draft.points[0],
        p2,
        arcRadius: Math.max(arcRadius, 20),
        isometricPlane: ui?.viewMode === 'isometric' ? ui.isometricPlane : null,
      };
    }
  }

  return null;
}

export default function useSketchStudio() {
  const [state, dispatch] = useReducer(sketchStudioReducer, sketchStudioInitialState);
  const [documentFileHandle, setDocumentFileHandle] = useState(null);
  const [documentPersistenceMeta, setDocumentPersistenceMeta] = useState({
    savedAt: null,
    fileName: null,
    status: 'idle',
    error: null,
  });
  const canvasRef = useRef(null);
  const previousToolBeforeSpaceRef = useRef(null);
  const isSpacePanActiveRef = useRef(false);
  const persistedWorkspaceSnapshotRef = useRef(null);

  const activeTool = state.ui.activeTool;
  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;
  const activeLayer = useMemo(() => state.document.layers.find((layer) => layer.id === state.ui.activeLayerId) ?? null, [state.document.layers, state.ui.activeLayerId]);
  const visibleEntities = useMemo(() => getVisibleEntities(state.document), [state.document]);
  const editableEntities = useMemo(() => getEditableEntities(state.document), [state.document]);
  const selectedIds = state.selection.selectedIds;
  const selectedEntities = useMemo(() => state.document.entities.filter((entity) => selectedIds.includes(entity.id)), [state.document.entities, selectedIds]);
  const selectedEntity = useMemo(() => (selectedIds.length === 1 ? state.document.entities.find((entity) => entity.id === selectedIds[0]) ?? null : null), [state.document.entities, selectedIds]);
  const selectedHandles = useMemo(() => (selectedIds.length === 1 ? getEntityHandles(selectedEntity) : []), [selectedEntity, selectedIds.length]);
  const selectionBounds = useMemo(() => computeSelectionBounds(selectedEntities, state.document.entities), [selectedEntities, state.document.entities]);
  const selectedProfileInfo = useMemo(() => getSelectedProfileInfo(selectedEntities), [selectedEntities]);

  const selectedMeasurements = useMemo(() => {
    if (selectedEntity?.type !== 'dimension') {
      return getEntityMeasurementRows(selectedEntity);
    }

    const sourceRefs = selectedEntity.meta?.sourceRefs ?? [];
    const p1 = resolveSourceReferenceFromEntities(state.document.entities, sourceRefs[0], selectedEntity.p1);
    const p2 = resolveSourceReferenceFromEntities(state.document.entities, sourceRefs[1], selectedEntity.p2);
    return [
      ['Subtype', selectedEntity.subtype],
      ['Offset', selectedEntity.offset],
      ['Value', formatDimensionText(measureDistance(p1, p2, selectedEntity.subtype), selectedEntity.units)],
    ];
  }, [selectedEntity, state.document.entities]);

  const draftPreview = useMemo(
    () => getDraftPreviewEntity(state.draft, state.document, getNextActiveLayer(state.document, state.ui.activeLayerId), state.ui),
    [state.document, state.draft, state.ui],
  );
  const precisionHud = useMemo(() => getPrecisionHudData(state.draft, draftPreview), [state.draft, draftPreview]);
  const currentWorkspaceSnapshot = useMemo(() => buildSketchWorkspaceSnapshot({
    document: state.document,
    viewport: state.viewport,
    ui: {
      activeLayerId: state.ui.activeLayerId,
      snapEnabled: state.ui.snapEnabled,
      orthoEnabled: state.ui.orthoEnabled,
      viewMode: state.ui.viewMode,
      isometricPlane: state.ui.isometricPlane,
    },
  }), [
    state.document,
    state.ui.activeLayerId,
    state.ui.isometricPlane,
    state.ui.orthoEnabled,
    state.ui.snapEnabled,
    state.ui.viewMode,
    state.viewport,
  ]);
  const comparableWorkspaceSnapshot = useMemo(
    () => serializeComparableSketchWorkspace(currentWorkspaceSnapshot),
    [currentWorkspaceSnapshot],
  );
  const desiredSketchFileName = useMemo(
    () => getSketchWorkspaceFileName(state.document.name),
    [state.document.name],
  );
  const documentIsDirty = persistedWorkspaceSnapshotRef.current != null
    ? comparableWorkspaceSnapshot !== persistedWorkspaceSnapshotRef.current
    : false;

  const readCanvasPoint = useCallback((event) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const readWorldPoint = useCallback((screenPoint, nextViewport = state.viewport) => screenToWorld(screenPoint, nextViewport), [state.viewport]);

  const getOrthoReferencePoint = useCallback((toolId, draft) => {
    if (toolId === 'line' || toolId === 'rect' || toolId === 'circle' || toolId === 'holeCircle' || toolId === 'cutoutRect') {
      return draft.startPoint;
    }

    if (toolId === 'polyline') {
      return draft.points.at(-1) ?? null;
    }

    return null;
  }, []);

  const getConstrainedDraftPoint = useCallback((toolId, draft, point) => {
    if (!state.ui.orthoEnabled) {
      return point;
    }

    const referencePoint = getOrthoReferencePoint(toolId, draft);
    if (!(toolId === 'line' || toolId === 'polyline') || !referencePoint) {
      return point;
    }

    return state.ui.viewMode === 'isometric'
      ? applyIsometricOrthoPoint(referencePoint, point)
      : applyOrthoPoint(referencePoint, point);
  }, [getOrthoReferencePoint, state.ui.orthoEnabled, state.ui.viewMode]);

  const resolveSnap = useCallback((worldPoint, anchorPoint = null) => snapWorldPoint({
    worldPoint,
    entities: visibleEntities,
    toleranceWorld: pixelsToWorldUnits(SNAP_TOLERANCE_PX, state.viewport.zoom),
    enabled: state.ui.snapEnabled,
    anchorPoint,
    enableIsometricGrid: state.ui.viewMode === 'isometric',
    viewportZoom: state.viewport.zoom,
  }), [state.ui.snapEnabled, state.ui.viewMode, state.viewport.zoom, visibleEntities]);

  const resolvePointerState = useCallback((screenPoint, nextViewport = state.viewport, options = {}) => {
    const worldPoint = readWorldPoint(screenPoint, nextViewport);
    const shouldHoverEntities = activeTool === 'select' || activeTool === 'offset' || activeTool === 'fillet';
    const hoveredEntity = shouldHoverEntities
      ? findTopmostEntityAtPoint(editableEntities, worldPoint, pixelsToWorldUnits(HIT_TOLERANCE_PX, nextViewport.zoom))
      : null;
    const nextSnap = activeTool === 'select' || activeTool === 'pan' || activeTool === 'offset' || activeTool === 'fillet'
      ? getEmptySnapState()
      : resolveSnap(worldPoint, options.anchorPoint ?? null);

    dispatch(syncPointer({
      screenPoint,
      worldPoint,
      hoveredId: hoveredEntity?.id ?? null,
      snap: nextSnap,
    }));

    return { worldPoint, hoveredEntity, snap: nextSnap };
  }, [activeTool, editableEntities, readWorldPoint, resolveSnap, state.viewport]);

  useEffect(() => {
    const recoverySnapshot = loadSketchRecovery();
    if (!recoverySnapshot) {
      if (persistedWorkspaceSnapshotRef.current == null) {
        persistedWorkspaceSnapshotRef.current = comparableWorkspaceSnapshot;
      }
      return;
    }

    try {
      const workspace = normalizeParsedSketchWorkspace(recoverySnapshot);
      dispatch(loadWorkspaceSnapshot(workspace));
      persistedWorkspaceSnapshotRef.current = serializeComparableSketchWorkspace(workspace);
      setDocumentPersistenceMeta({
        savedAt: workspace.savedAt ?? null,
        fileName: null,
        status: 'recovered',
        error: null,
      });
    } catch {
      persistedWorkspaceSnapshotRef.current = comparableWorkspaceSnapshot;
    }
  }, []);

  useEffect(() => {
    if (persistedWorkspaceSnapshotRef.current == null) {
      persistedWorkspaceSnapshotRef.current = comparableWorkspaceSnapshot;
    }
  }, [comparableWorkspaceSnapshot]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        saveSketchRecovery(currentWorkspaceSnapshot);
      } catch {
        // Recovery storage is best-effort only.
      }
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentWorkspaceSnapshot]);

  useEffect(() => {
    setDocumentPersistenceMeta((current) => {
      const nextStatus = documentIsDirty ? 'dirty' : (current.status === 'dirty' ? 'idle' : current.status);

      if (nextStatus === current.status) {
        return current;
      }

      return {
        ...current,
        status: nextStatus,
      };
    });
  }, [documentIsDirty]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || typeof ResizeObserver !== 'function') {
      return undefined;
    }

    const updateSize = (width, height) => dispatch(setCanvasSize({ width, height }));
    const initialRect = canvas.getBoundingClientRect();
    updateSize(initialRect.width, initialRect.height);

    const observer = new ResizeObserver(([entry]) => {
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const commitPrecisionDraft = useCallback(() => {
    if (!state.draft.type || !draftPreview) {
      return;
    }

    const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);

    if (state.draft.type === 'line') {
      const nextEntity = createLineEntity(state.draft.startPoint, { x: draftPreview.x2, y: draftPreview.y2 }, state.document.entities, targetLayerId);
      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      }
      return;
    }

    if (state.draft.type === 'rect') {
      const nextEntity = state.ui.viewMode === 'isometric'
        ? (() => {
            const baseEntity = createPolylineEntity(draftPreview.points, state.document.entities, targetLayerId, true);
            return baseEntity
              ? {
                  ...baseEntity,
                  meta: {
                    ...(baseEntity.meta || {}),
                    projectionMode: 'isometric',
                    isometricPlane: state.ui.isometricPlane,
                  },
                }
              : null;
          })()
        : createRectEntity(draftPreview.startPoint, draftPreview.endPoint, state.document.entities, targetLayerId);
      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      }
      return;
    }

    if (state.draft.type === 'circle') {
      const nextEntity = state.ui.viewMode === 'isometric'
        ? createEllipseEntity({ x: draftPreview.cx, y: draftPreview.cy }, { x: draftPreview.cx + draftPreview.rx, y: draftPreview.cy }, state.document.entities, targetLayerId, {
            plane: state.ui.isometricPlane,
            radius: draftPreview.radius,
            meta: {
              projectionMode: 'isometric',
              isometricPlane: state.ui.isometricPlane,
            },
          })
        : createCircleEntity(draftPreview.center, draftPreview.radiusPoint, state.document.entities, targetLayerId);
      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      }
      return;
    }

    if (state.draft.type === 'holeCircle') {
      const nextEntity = createFeatureEntity({
        featureType: 'hole',
        shape: state.ui.viewMode === 'isometric' ? 'ellipse' : 'circle',
        cx: draftPreview.cx,
        cy: draftPreview.cy,
        diameter: draftPreview.diameter,
        rx: draftPreview.rx,
        ry: draftPreview.ry,
        rotation: draftPreview.rotation,
        meta: {
          ...(state.ui.viewMode === 'isometric'
            ? {
                projectionMode: 'isometric',
                isometricPlane: state.ui.isometricPlane,
              }
            : {}),
        },
      }, state.document.entities, targetLayerId);

      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      }
      return;
    }

    if (state.draft.type === 'cutoutRect') {
      const nextEntity = createFeatureEntity({
        featureType: 'cutout',
        shape: state.ui.viewMode === 'isometric' ? 'polygon' : 'rect',
        x: draftPreview.startPoint ? Math.min(draftPreview.startPoint.x, draftPreview.endPoint.x) : undefined,
        y: draftPreview.startPoint ? Math.min(draftPreview.startPoint.y, draftPreview.endPoint.y) : undefined,
        width: draftPreview.width ?? (draftPreview.startPoint ? Math.abs(draftPreview.endPoint.x - draftPreview.startPoint.x) : undefined),
        height: draftPreview.height ?? (draftPreview.startPoint ? Math.abs(draftPreview.endPoint.y - draftPreview.startPoint.y) : undefined),
        points: draftPreview.points,
        meta: {
          ...(state.ui.viewMode === 'isometric'
            ? {
                projectionMode: 'isometric',
                isometricPlane: state.ui.isometricPlane,
              }
            : {}),
        },
      }, state.document.entities, targetLayerId);

      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      }
      return;
    }

    if (state.draft.type === 'offset') {
      const nextEntity = buildOffsetEntityFromDraft(state.draft, state.document, targetLayerId);

      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      } else {
        dispatch(cancelDraft());
      }
    }
  }, [draftPreview, state.document, state.draft, state.ui.activeLayerId, state.ui.isometricPlane, state.ui.viewMode]);

  const cancelTransientInteraction = useCallback(() => {
    if (state.interaction.mode === 'transform') {
      dispatch(cancelTransform());
      return true;
    }

    if (state.interaction.mode === 'handle-drag') {
      dispatch(cancelHandleDrag());
      return true;
    }

    if (state.interaction.mode === 'anchor-drag') {
      dispatch(cancelAnchorDrag());
      return true;
    }

    if (state.interaction.mode === 'selection-box') {
      dispatch(endSelectionBox());
      return true;
    }

    if (state.interaction.mode === 'panning') {
      dispatch(endPan());
      return true;
    }

    if (state.draft.type && state.draft.type !== 'fillet') {
      dispatch(cancelDraft());
      return true;
    }

    return false;
  }, [state.draft.type, state.interaction.mode]);

  const handleUndo = useCallback(() => {
    if (cancelTransientInteraction() || !canUndo) {
      return;
    }

    dispatch(undo());
  }, [canUndo, cancelTransientInteraction]);

  const handleRedo = useCallback(() => {
    if (!canRedo) {
      return;
    }

    dispatch(redo());
  }, [canRedo]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = String(event.key).toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;

      // Undo/redo should always work, even when an input is focused
      if (hasPrimaryModifier && !event.altKey && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (event.ctrlKey && !event.metaKey && !event.altKey && key === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }

      // Block remaining shortcuts when an input is focused
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();

        if (!isSpacePanActiveRef.current && state.ui.activeTool !== 'pan') {
          previousToolBeforeSpaceRef.current = state.ui.activeTool;
          isSpacePanActiveRef.current = true;
          dispatch(setActiveTool('pan'));
        }

        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const shortcutToolId = TOOL_SHORTCUT_MAP.get(key);
        if (shortcutToolId) {
          event.preventDefault();
          dispatch(setActiveTool(shortcutToolId));
          return;
        }
      }

      if (event.key === ']' && state.draft.type === 'fillet') {
        event.preventDefault();
        const currentRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
        const nextRadius = Math.min(MAX_FILLET_RADIUS, currentRadius + FILLET_RADIUS_STEP);
        dispatch(setPrecisionInput({ radius: String(nextRadius) }));
        return;
      }

      if (event.key === '[' && state.draft.type === 'fillet') {
        event.preventDefault();
        const currentRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
        const nextRadius = Math.max(MIN_FILLET_RADIUS, currentRadius - FILLET_RADIUS_STEP);
        dispatch(setPrecisionInput({ radius: String(nextRadius) }));
        return;
      }

      if (event.key === 'Escape') {
        if (state.interaction.mode === 'transform') {
          dispatch(endTransform());
          return;
        }

        if (state.draft.type === 'fillet') {
          dispatch(cancelDraft());
          dispatch(setActiveTool('select'));
          return;
        }

        if (state.draft.type) {
          dispatch(cancelDraft());
        }

        return;
      }

      if (event.key === 'Backspace' && state.draft.type === 'polyline') {
        event.preventDefault();

        if (state.draft.points.length <= 1) {
          dispatch(cancelDraft());
          return;
        }

        const nextPoints = removeLastPolylineVertex(state.draft.points);
        dispatch(patchDraft({
          points: nextPoints,
          currentPoint: nextPoints.at(-1) ?? null,
          sourceRefs: state.draft.sourceRefs.slice(0, -1),
          closedPreview: false,
        }));
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection.selectedIds.length) {
        event.preventDefault();
        dispatch(deleteSelected());
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && state.selection.selectedIds.length) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const delta = {
          ArrowUp: { x: 0, y: -step },
          ArrowDown: { x: 0, y: step },
          ArrowLeft: { x: -step, y: 0 },
          ArrowRight: { x: step, y: 0 },
        }[event.key];
        dispatch(setDocumentEntities(translateEntities(state.document.entities, state.selection.selectedIds, delta)));
        return;
      }

      if (event.key === 'Enter') {
        if (state.draft.type === 'fillet' && state.draft.hoveredCorner && state.draft.previewGeometry) {
          event.preventDefault();
          const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);
          const newEntities = applyFillet(state.document.entities, state.draft.hoveredCorner, state.draft.previewGeometry, targetLayerId);
          dispatch(setDocumentEntities(newEntities));
          dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null }));
          return;
        }

        if (state.draft.type === 'angle' && state.draft.step === 'pickSecond' && state.draft.points.length === 2 && state.draft.currentPoint) {
          event.preventDefault();
          const vertex = state.draft.points[1];
          const inputAngle = parsePositiveNumber(state.draft.precisionInput?.angle);
          const rawPoint = state.draft.currentPoint;
          const isoPlane = state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null;
          const p2 = inputAngle != null
            ? constrainAnglePoint(vertex, state.draft.points[0], rawPoint, inputAngle, isoPlane)
            : rawPoint;
          const arcRadius = Math.max(calculateDistance(vertex, p2), 20);
          const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);
          dispatch(commitEntity(createAngleDimensionEntity({
            vertex,
            p1: state.draft.points[0],
            p2,
            arcRadius,
            entities: state.document.entities,
            sourceRefs: state.draft.sourceRefs?.filter(Boolean) ?? [],
            layerId: state.document.layers.some((layer) => layer.id === 'dimensions') ? 'dimensions' : targetLayerId,
            isometricPlane: state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null,
          })));
          return;
        }

        if (state.draft.type === 'polyline' && state.draft.points.length >= 2) {
          event.preventDefault();
          const nextEntity = createPolylineEntity(state.draft.points, state.document.entities, getNextActiveLayer(state.document, state.ui.activeLayerId), state.draft.closedPreview);
          if (nextEntity) {
            dispatch(commitEntity(nextEntity));
          }
          return;
        }

        if (['line', 'rect', 'circle', 'holeCircle', 'cutoutRect', 'offset'].includes(state.draft.type)) {
          event.preventDefault();
          commitPrecisionDraft();
        }
      }
    };

    const handleKeyUp = (event) => {
      if (event.code !== 'Space') {
        return;
      }

      event.preventDefault();

      if (isSpacePanActiveRef.current) {
        const previousTool = previousToolBeforeSpaceRef.current;
        previousToolBeforeSpaceRef.current = null;
        isSpacePanActiveRef.current = false;

        if (previousTool && previousTool !== 'pan') {
          dispatch(setActiveTool(previousTool));
        }
      }
    };

    const handleWindowBlur = () => {
      if (isSpacePanActiveRef.current) {
        const previousTool = previousToolBeforeSpaceRef.current;
        previousToolBeforeSpaceRef.current = null;
        isSpacePanActiveRef.current = false;

        if (previousTool && previousTool !== 'pan') {
          dispatch(setActiveTool(previousTool));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [commitPrecisionDraft, handleRedo, handleUndo, state.document, state.draft, state.interaction.mode, state.selection.selectedIds.length, state.ui.activeLayerId, state.ui.activeTool]);

  const updateDocumentState = useCallback((updater) => {
    dispatch(setDocument(updater(state.document)));
  }, [state.document]);

  const handleToolChange = useCallback((toolId) => dispatch(setActiveTool(toolId)), []);
  const handleActiveLayerChange = useCallback((layerId) => dispatch(setActiveLayer(layerId)), []);
  const toggleOrtho = useCallback(() => dispatch(setUiFlag('orthoEnabled', !state.ui.orthoEnabled)), [state.ui.orthoEnabled]);
  const toggleSnap = useCallback(() => dispatch(setUiFlag('snapEnabled', !state.ui.snapEnabled)), [state.ui.snapEnabled]);
  const setViewMode = useCallback((viewMode) => dispatch(setUiFlag('viewMode', viewMode === 'isometric' ? 'isometric' : 'plan')), []);
  const setIsometricPlane = useCallback((plane) => {
    if (!['top', 'left', 'right'].includes(plane)) {
      return;
    }

    dispatch(setUiFlag('isometricPlane', plane));
  }, []);

  const updateSelectedEntityField = useCallback((field, rawValue) => {
    if (!selectedEntity) {
      return;
    }

    dispatch(setDocumentEntities(updateEntityInList(state.document.entities, selectedEntity.id, (entity) => updateEntityFromNumericField(entity, field, rawValue))));
  }, [selectedEntity, state.document.entities]);

  const isBrokenLineSelection = useMemo(
    () => selectedEntities.length > 0 && selectedEntities.every((entity) => entity.meta?.lineStyle === 'broken'),
    [selectedEntities],
  );

  const handleLayerCreate = useCallback((name) => {
    updateDocumentState((document) => ({
      ...document,
      layers: [...document.layers, createLayer(document.layers, name)],
    }));
  }, [updateDocumentState]);

  const handleLayerRename = useCallback((layerId, name) => {
    updateDocumentState((document) => ({
      ...document,
      layers: renameLayer(document.layers, layerId, name),
    }));
  }, [updateDocumentState]);

  const handleDocumentNameCommit = useCallback((name) => {
    updateDocumentState((document) => ({
      ...document,
      name: normalizeCommittedSketchName(name),
    }));
  }, [updateDocumentState]);

  const handleLayerVisibilityToggle = useCallback((layerId) => {
    updateDocumentState((document) => ({
      ...document,
      layers: toggleLayerVisibility(document.layers, layerId),
    }));
  }, [updateDocumentState]);

  const handleLayerLockToggle = useCallback((layerId) => {
    updateDocumentState((document) => ({
      ...document,
      layers: toggleLayerLock(document.layers, layerId),
    }));
  }, [updateDocumentState]);

  const handleMoveSelectionToLayer = useCallback((layerId) => {
    if (!state.selection.selectedIds.length) {
      return;
    }

    updateDocumentState((document) => ({
      ...document,
      entities: moveEntitiesToLayer(document.entities, state.selection.selectedIds, layerId),
    }));
  }, [state.selection.selectedIds, updateDocumentState]);

  const handleTransformPointerDown = useCallback((transformType, event, options = {}) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const worldPoint = readWorldPoint(readCanvasPoint(event));
    const entityIds = options.entityIds ?? state.selection.selectedIds;
    const copyMode = transformType === 'move' && event.ctrlKey ? 'pending' : 'off';

    if (!entityIds.length) {
      return;
    }

    dispatch(startTransform({
      type: transformType,
      pointerId: event.pointerId,
      startWorld: worldPoint,
      startAngle: options.pivot ? Math.atan2(worldPoint.y - options.pivot.y, worldPoint.x - options.pivot.x) : 0,
      pivot: options.pivot ?? null,
      entityIds,
      startEntities: state.document.entities,
      copyMode,
      copiedEntityIds: [],
    }));
  }, [readCanvasPoint, readWorldPoint, state.document.entities, state.selection.selectedIds]);

  const handleRotateSelection = useCallback((degrees) => {
    if (!selectedIds.length || !selectionBounds) {
      return;
    }

    const pivot = {
      x: (selectionBounds.minX + selectionBounds.maxX) / 2,
      y: (selectionBounds.minY + selectionBounds.maxY) / 2,
    };

    dispatch(setDocumentEntities(
      rotateEntities(state.document.entities, selectedIds, pivot, (degrees * Math.PI) / 180),
    ));
  }, [selectedIds, selectionBounds, state.document.entities]);

  const handleFlipSelection = useCallback((direction) => {
    if (!selectedIds.length || !selectionBounds) {
      return;
    }

    const pivot = {
      x: (selectionBounds.minX + selectionBounds.maxX) / 2,
      y: (selectionBounds.minY + selectionBounds.maxY) / 2,
    };

    dispatch(setDocumentEntities(
      mirrorEntities(state.document.entities, selectedIds, pivot, direction),
    ));
  }, [selectedIds, selectionBounds, state.document.entities]);

  const handleToggleBrokenLines = useCallback(() => {
    if (!selectedIds.length) {
      return;
    }

    dispatch(setDocumentEntities(
      toggleBrokenLineForEntities(state.document.entities, selectedIds),
    ));
  }, [selectedIds, state.document.entities]);

  const handleHandlePointerDown = useCallback((handle, event) => {
    if (!selectedEntity) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch(startHandleDrag({
      entityId: selectedEntity.id,
      handleId: handle.id,
      pointerId: event.pointerId,
    }));
  }, [selectedEntity]);

  const applyWorkspace = useCallback((workspace, options = {}) => {
    dispatch(loadWorkspaceSnapshot({
      document: workspace.document,
      viewport: workspace.viewport,
      ui: workspace.ui,
    }));
    persistedWorkspaceSnapshotRef.current = serializeComparableSketchWorkspace(workspace);
    setDocumentFileHandle(options.fileHandle ?? null);
    setDocumentPersistenceMeta({
      savedAt: workspace.savedAt ?? options.savedAt ?? null,
      fileName: options.fileName ?? options.fileHandle?.name ?? null,
      status: options.status ?? 'idle',
      error: null,
    });
  }, []);

  const shouldConfirmWorkspaceReplacement = useCallback(() => {
    if (!documentIsDirty) {
      return true;
    }

    return window.confirm('Unsaved sketch changes will be lost. Continue?');
  }, [documentIsDirty]);

  const handleNewSketch = useCallback(() => {
    if (!shouldConfirmWorkspaceReplacement()) {
      return;
    }

    const nextDocument = createBlankSketchDocument({
      units: state.document.units,
    });
    const workspace = buildSketchWorkspaceSnapshot({
      document: nextDocument,
      viewport: sketchStudioInitialState.viewport,
      ui: {
        activeLayerId: nextDocument.layers[0]?.id || 'default',
        snapEnabled: state.ui.snapEnabled,
        orthoEnabled: state.ui.orthoEnabled,
      },
    });
    applyWorkspace(workspace, {
      fileHandle: null,
      fileName: null,
      savedAt: null,
      status: 'idle',
    });
  }, [applyWorkspace, shouldConfirmWorkspaceReplacement, state.document.units, state.ui.orthoEnabled, state.ui.snapEnabled]);

  const handleImportSketchFile = useCallback(async (file) => {
    if (!file) {
      return;
    }

    if (!shouldConfirmWorkspaceReplacement()) {
      return;
    }

    try {
      const { workspace, fileName } = await importSketchWorkspaceFile(file);
      applyWorkspace(workspace, {
        fileHandle: null,
        fileName,
        status: 'opened',
      });
    } catch (err) {
      alert(err.message || 'Failed to open sketch.');
    }
  }, [applyWorkspace, shouldConfirmWorkspaceReplacement]);

  const handleOpenSketch = useCallback(async () => {
    if (!shouldConfirmWorkspaceReplacement()) {
      return;
    }

    try {
      const { workspace, fileHandle, fileName } = await openSketchWorkspaceFile();
      applyWorkspace(workspace, {
        fileHandle,
        fileName,
        status: 'opened',
      });
    } catch (err) {
      if (isFilePickerAbortError(err)) {
        return;
      }

      alert(err.message || 'Failed to open sketch.');
    }
  }, [applyWorkspace, shouldConfirmWorkspaceReplacement]);

  const handleSaveSketch = useCallback(async (options = {}) => {
    const saveAs = options.saveAs === true;
    const renamePending = Boolean(
      documentFileHandle
      && documentPersistenceMeta.fileName
      && documentPersistenceMeta.fileName !== desiredSketchFileName,
    );
    setDocumentPersistenceMeta((current) => ({
      ...current,
      status: 'saving',
      error: null,
    }));

    try {
      const { savedAt, fileHandle, fileName } = await saveSketchWorkspaceFile(currentWorkspaceSnapshot, {
        fileHandle: saveAs || renamePending ? null : documentFileHandle,
      });
      persistedWorkspaceSnapshotRef.current = comparableWorkspaceSnapshot;
      setDocumentFileHandle(fileHandle);
      setDocumentPersistenceMeta({
        savedAt,
        fileName,
        status: 'saved',
        error: null,
      });
    } catch (err) {
      if (isFilePickerAbortError(err)) {
        setDocumentPersistenceMeta((current) => ({
          ...current,
          status: documentIsDirty ? 'dirty' : 'idle',
          error: null,
        }));
        return;
      }

      setDocumentPersistenceMeta((current) => ({
        ...current,
        status: 'error',
        error: err.message || 'Failed to save sketch.',
      }));
      alert(err.message || 'Failed to save sketch.');
    }
  }, [
    comparableWorkspaceSnapshot,
    currentWorkspaceSnapshot,
    desiredSketchFileName,
    documentFileHandle,
    documentIsDirty,
    documentPersistenceMeta.fileName,
  ]);

  useEffect(() => {
    const handleSaveShortcut = (event) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && String(event.key).toLowerCase() === 's') {
        event.preventDefault();
        handleSaveSketch();
      }
    };

    window.addEventListener('keydown', handleSaveShortcut);
    return () => {
      window.removeEventListener('keydown', handleSaveShortcut);
    };
  }, [handleSaveSketch]);

  const handlePointerDown = useCallback((event) => {
    const shouldPan = event.button === 1 || (event.button === 0 && activeTool === 'pan');

    if (shouldPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch(startPan({
        pointerId: event.pointerId,
        screenPoint: readCanvasPoint(event),
        startViewport: state.viewport,
      }));
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const worldPoint = readWorldPoint(readCanvasPoint(event));

    if (activeTool === 'select') {
      const hoveredEntity = findTopmostEntityAtPoint(editableEntities, worldPoint, pixelsToWorldUnits(HIT_TOLERANCE_PX, state.viewport.zoom));

      if (hoveredEntity && state.selection.selectedIds.includes(hoveredEntity.id)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dispatch(startTransform({
          type: 'move',
          copyMode: event.ctrlKey ? 'pending' : 'off',
          copiedEntityIds: [],
          pointerId: event.pointerId,
          startWorld: worldPoint,
          startAngle: 0,
          pivot: selectionBounds ? { x: (selectionBounds.minX + selectionBounds.maxX) / 2, y: (selectionBounds.minY + selectionBounds.maxY) / 2 } : null,
          entityIds: state.selection.selectedIds,
          startEntities: state.document.entities,
        }));
        return;
      }

      if (!hoveredEntity) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dispatch(startSelectionBox(worldPoint));
        return;
      }
    }

    dispatch(setPointerDown(true));
  }, [activeTool, editableEntities, readCanvasPoint, readWorldPoint, selectionBounds, state.document.entities, state.selection.selectedIds, state.viewport]);

  const handlePointerMove = useCallback((event) => {
    const screenPoint = readCanvasPoint(event);

    if (state.interaction.mode === 'panning') {
      const nextViewport = {
        ...state.interaction.panStartViewport,
        panX: state.interaction.panStartViewport.panX + (screenPoint.x - state.interaction.panStartScreen.x),
        panY: state.interaction.panStartViewport.panY + (screenPoint.y - state.interaction.panStartScreen.y),
      };

      dispatch(updatePan({
        pointerId: event.pointerId,
        viewport: nextViewport,
        screenPoint,
        worldPoint: readWorldPoint(screenPoint, nextViewport),
      }));
      return;
    }

    if (state.interaction.mode === 'selection-box' && state.selection.selectionBox.isActive) {
      const currentPoint = readWorldPoint(screenPoint);
      const threshold = pixelsToWorldUnits(4, state.viewport.zoom);
      dispatch(updateSelectionBox({
        currentPoint,
        hasMoved: Math.abs(currentPoint.x - state.selection.selectionBox.start.x) > threshold
          || Math.abs(currentPoint.y - state.selection.selectionBox.start.y) > threshold,
      }));
      resolvePointerState(screenPoint);
      return;
    }

    if (state.interaction.mode === 'handle-drag' && state.interaction.handleDrag) {
      const rawWorldPoint = readWorldPoint(screenPoint);
      const draggedEntity = state.document.entities.find((entity) => entity.id === state.interaction.handleDrag.entityId);

      if (!draggedEntity) {
        return;
      }

      const anchorPoint = draggedEntity.type === 'line'
        ? state.interaction.handleDrag.handleId === 'start'
          ? { x: draggedEntity.x2, y: draggedEntity.y2 }
          : { x: draggedEntity.x1, y: draggedEntity.y1 }
        : null;
      const nextSnap = resolveSnap(rawWorldPoint, anchorPoint);
      const basePoint = nextSnap.point ?? rawWorldPoint;
      const nextPoint = draggedEntity.type === 'line' && state.ui.orthoEnabled && anchorPoint
        ? (state.ui.viewMode === 'isometric' ? applyIsometricOrthoPoint(anchorPoint, basePoint) : applyOrthoPoint(anchorPoint, basePoint))
        : basePoint;

      dispatch(setDocumentEntities(updateEntityInList(state.document.entities, draggedEntity.id, (entity) => updateEntityFromHandle(entity, state.interaction.handleDrag.handleId, nextPoint))));
      dispatch(syncPointer({ screenPoint, worldPoint: nextPoint, hoveredId: draggedEntity.id, snap: nextSnap }));
      return;
    }

    if (state.interaction.mode === 'transform' && state.interaction.transform) {
      const rawWorldPoint = readWorldPoint(screenPoint);
      const transformState = state.interaction.transform;
      const dragDistance = calculateDistance(transformState.startWorld, rawWorldPoint);
      const dragThreshold = pixelsToWorldUnits(TRANSFORM_DRAG_THRESHOLD_PX, state.viewport.zoom);

      if (transformState.type === 'move') {
        let moveEntityIds = transformState.entityIds;
        let moveStartEntities = transformState.startEntities;

        if (transformState.copyMode === 'pending') {
          if (dragDistance <= dragThreshold) {
            dispatch(syncPointer({ screenPoint, worldPoint: rawWorldPoint, hoveredId: state.hover.hoveredId, snap: getEmptySnapState() }));
            return;
          }

          const duplicated = duplicateEntitiesByIds(transformState.startEntities, transformState.entityIds);

          if (duplicated.duplicatedIds.length) {
            moveEntityIds = duplicated.duplicatedIds;
            moveStartEntities = duplicated.entities;
            dispatch(setSelection(moveEntityIds));
            dispatch(patchTransform({
              copyMode: 'active',
              entityIds: moveEntityIds,
              copiedEntityIds: moveEntityIds,
              startEntities: moveStartEntities,
            }));
          } else {
            dispatch(patchTransform({
              copyMode: 'off',
            }));
          }
        }

        dispatch(setDocumentEntities(translateEntities(moveStartEntities, moveEntityIds, {
          x: rawWorldPoint.x - transformState.startWorld.x,
          y: rawWorldPoint.y - transformState.startWorld.y,
        })));
      }

      if (transformState.type === 'rotate' && transformState.pivot) {
        const currentAngle = Math.atan2(rawWorldPoint.y - transformState.pivot.y, rawWorldPoint.x - transformState.pivot.x);
        dispatch(setDocumentEntities(rotateEntities(transformState.startEntities, transformState.entityIds, transformState.pivot, currentAngle - transformState.startAngle)));
      }

      dispatch(syncPointer({ screenPoint, worldPoint: rawWorldPoint, hoveredId: state.hover.hoveredId, snap: getEmptySnapState() }));
      return;
    }

    const draftAnchor = getOrthoReferencePoint(state.draft.type, state.draft);
    const { worldPoint, snap } = resolvePointerState(screenPoint, state.viewport, { anchorPoint: draftAnchor });

    if (activeTool === 'fillet') {
      if (!state.draft.type) {
        dispatch(startDraft({ type: 'fillet' }));
      }

      const filletTolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX * 2, state.viewport.zoom);
      const filletRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
      const corner = findFilletableCorner(state.document.entities, worldPoint, filletTolerance);

      if (corner) {
        const geometry = computeSketchFillet(corner, filletRadius);
        dispatch(patchDraft({ hoveredCorner: corner, previewGeometry: geometry, currentPoint: worldPoint }));
      } else {
        dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null, currentPoint: worldPoint }));
      }
      return;
    }

    if (!state.draft.type) {
      return;
    }

    if (state.draft.type === 'offset') {
      dispatch(patchDraft({
        currentPoint: worldPoint,
      }));
      return;
    }

    if (state.draft.type === 'dimension') {
      dispatch(patchDraft({
        currentPoint: state.draft.step === 'pickSecond' ? (snap.point ?? worldPoint) : worldPoint,
        subtype: state.draft.step === 'pickSecond' ? inferDimensionSubtype(state.draft.points[0], snap.point ?? worldPoint) : state.draft.subtype,
      }));
      return;
    }

    if (state.draft.type === 'angle') {
      dispatch(patchDraft({
        currentPoint: snap.point ?? worldPoint,
      }));
      return;
    }

    if (state.draft.type === 'polyline' && state.draft.points.length >= 2) {
      const nextPoint = getConstrainedDraftPoint('polyline', state.draft, snap.point ?? worldPoint);
      const startPoint = state.draft.points[0];
      const closeTolerance = pixelsToWorldUnits(PROFILE_CLOSE_TOLERANCE_PX, state.viewport.zoom);
      const closedPreview = calculateDistance(startPoint, nextPoint) <= closeTolerance;
      dispatch(patchDraft({
        currentPoint: closedPreview ? startPoint : nextPoint,
        closedPreview,
      }));
      return;
    }

    dispatch(patchDraft({
      currentPoint: getConstrainedDraftPoint(state.draft.type, state.draft, snap.point ?? worldPoint),
    }));
  }, [getConstrainedDraftPoint, getOrthoReferencePoint, readCanvasPoint, readWorldPoint, resolvePointerState, resolveSnap, state.document.entities, state.draft, state.hover.hoveredId, state.interaction, state.selection.selectionBox, state.ui.orthoEnabled, state.viewport]);

  const handlePointerUp = useCallback((event) => {
    if (state.interaction.mode === 'panning' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dispatch(endPan());
      return;
    }

    if (state.interaction.mode === 'selection-box') {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const { selectionBox } = state.selection;

      if (selectionBox.isActive && selectionBox.hasMoved) {
        const nextIds = getEntityIdsInSelectionBox(editableEntities, normalizeSelectionBox(selectionBox.start, selectionBox.current));
        dispatch(setSelection(mergeSelection(state.selection.selectedIds, nextIds, event.shiftKey)));
        dispatch(setSuppressNextClick(true));
      }

      dispatch(endSelectionBox());
      return;
    }

    if (state.interaction.mode === 'handle-drag') {
      dispatch(endHandleDrag());
      return;
    }

    if (state.interaction.mode === 'anchor-drag') {
      dispatch(endAnchorDrag());
      return;
    }

    if (state.interaction.mode === 'transform') {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (calculateDistance(state.interaction.transform.startWorld, readWorldPoint(readCanvasPoint(event))) > pixelsToWorldUnits(TRANSFORM_DRAG_THRESHOLD_PX, state.viewport.zoom)) {
        dispatch(setSuppressNextClick(true));
      }

      dispatch(endTransform());
      return;
    }

    dispatch(setPointerDown(false));
  }, [editableEntities, readCanvasPoint, readWorldPoint, state.interaction, state.selection, state.viewport.zoom]);

  const handlePointerCancel = useCallback(() => {
    if (state.interaction.mode === 'panning') {
      dispatch(endPan());
      return;
    }

    if (state.interaction.mode === 'selection-box') {
      dispatch(endSelectionBox());
      return;
    }

    if (state.interaction.mode === 'handle-drag') {
      dispatch(endHandleDrag());
      return;
    }

    if (state.interaction.mode === 'anchor-drag') {
      dispatch(endAnchorDrag());
      return;
    }

    if (state.interaction.mode === 'transform') {
      dispatch(endTransform());
      return;
    }

    dispatch(setPointerDown(false));
  }, [state.interaction.mode]);

  const handlePointerLeave = useCallback(() => {
    if (state.interaction.mode === 'idle') {
      dispatch(clearPointerDecorations());
    }
  }, [state.interaction.mode]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();

    const screenPoint = readCanvasPoint(event);
    const nextViewport = zoomAtPoint(state.viewport, screenPoint, getNextZoom(state.viewport.zoom, event.deltaY));
    dispatch(setViewport(nextViewport));
    resolvePointerState(screenPoint, nextViewport);
  }, [readCanvasPoint, resolvePointerState, state.viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const nativeWheelHandler = (event) => {
      handleWheel(event);
    };

    canvas.addEventListener('wheel', nativeWheelHandler, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', nativeWheelHandler);
    };
  }, [handleWheel]);

  const handleCanvasClick = useCallback((event) => {
    if (state.interaction.suppressNextClick) {
      dispatch(setSuppressNextClick(false));
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const screenPoint = readCanvasPoint(event);
    const draftAnchor = getOrthoReferencePoint(state.draft.type, state.draft);
    const { worldPoint, snap, hoveredEntity } = resolvePointerState(screenPoint, state.viewport, { anchorPoint: draftAnchor });
    const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);

    if (activeTool === 'select') {
      dispatch(setSelection(mergeSelection(state.selection.selectedIds, hoveredEntity ? [hoveredEntity.id] : [], event.shiftKey)));
      return;
    }

    if (activeTool === 'fillet') {
      // Recompute corner fresh at click time to avoid stale draft state
      const filletTolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX * 2, state.viewport.zoom);
      const filletRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
      const corner = findFilletableCorner(state.document.entities, worldPoint, filletTolerance);

      if (corner) {
        const geometry = computeSketchFillet(corner, filletRadius);
        if (geometry) {
          const newEntities = applyFillet(state.document.entities, corner, geometry, targetLayerId);
          dispatch(setDocumentEntities(newEntities));
          dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null }));
        }
      }
      return;
    }

    if (activeTool === 'offset') {
      if (!state.draft.type) {
        if (!isOffsettableEntity(hoveredEntity)) {
          return;
        }

        dispatch(startDraft({
          type: 'offset',
          step: 'pickDistance',
          currentPoint: worldPoint,
          sourceEntityId: hoveredEntity.id,
          sourceEntityType: hoveredEntity.type,
          points: [worldPoint],
        }));
        return;
      }

      const nextEntity = buildOffsetEntityFromDraft(state.draft, state.document, targetLayerId);

      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      } else {
        dispatch(cancelDraft());
      }
      return;
    }

    if (activeTool === 'text') {
      const nextEntity = createTextEntity(snap.point ?? worldPoint, state.document.entities, targetLayerId);

      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
        dispatch(setSelection([nextEntity.id]));
        dispatch(setActiveTool('select'));
      }
      return;
    }

    if (['line', 'rect', 'circle', 'holeCircle', 'cutoutRect'].includes(activeTool)) {
      const draftPoint = state.draft.startPoint
        ? getConstrainedDraftPoint(activeTool, state.draft, snap.point ?? worldPoint)
        : (snap.point ?? worldPoint);

      if (!state.draft.type) {
        dispatch(startDraft({
          type: activeTool,
          step: 'pickEnd',
          startPoint: draftPoint,
          currentPoint: draftPoint,
          points: [draftPoint],
          sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
        }));
        return;
      }

      if (activeTool === 'holeCircle') {
        const nextEntity = createFeatureEntity({
          featureType: 'hole',
          shape: state.ui.viewMode === 'isometric' ? 'ellipse' : 'circle',
          cx: draftPreview?.cx ?? state.draft.startPoint.x,
          cy: draftPreview?.cy ?? state.draft.startPoint.y,
          diameter: draftPreview?.diameter,
          rx: draftPreview?.rx,
          ry: draftPreview?.ry,
          rotation: draftPreview?.rotation,
          meta: {
            ...(state.ui.viewMode === 'isometric'
              ? {
                  projectionMode: 'isometric',
                  isometricPlane: state.ui.isometricPlane,
                }
              : {}),
          },
        }, state.document.entities, targetLayerId);

        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
        } else {
          dispatch(cancelDraft());
        }
        return;
      }

      if (activeTool === 'cutoutRect') {
        const nextEntity = createFeatureEntity({
          featureType: 'cutout',
          shape: state.ui.viewMode === 'isometric' ? 'polygon' : 'rect',
          x: draftPreview?.startPoint ? Math.min(draftPreview.startPoint.x, draftPreview.endPoint.x) : undefined,
          y: draftPreview?.startPoint ? Math.min(draftPreview.startPoint.y, draftPreview.endPoint.y) : undefined,
          width: draftPreview?.width ?? (draftPreview?.startPoint ? Math.abs(draftPreview.endPoint.x - draftPreview.startPoint.x) : undefined),
          height: draftPreview?.height ?? (draftPreview?.startPoint ? Math.abs(draftPreview.endPoint.y - draftPreview.startPoint.y) : undefined),
          points: draftPreview?.points,
          meta: {
            ...(state.ui.viewMode === 'isometric'
              ? {
                  projectionMode: 'isometric',
                  isometricPlane: state.ui.isometricPlane,
                }
              : {}),
          },
        }, state.document.entities, targetLayerId);

        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
        } else {
          dispatch(cancelDraft());
        }
        return;
      }

      const nextEntity = activeTool === 'line'
        ? createLineEntity(state.draft.startPoint, getLineEndpointFromDraft({ ...state.draft, currentPoint: draftPoint }), state.document.entities, targetLayerId)
        : activeTool === 'rect'
          ? (state.ui.viewMode === 'isometric'
            ? (() => {
                const shape = getIsometricRectangleFromDraft({ ...state.draft, currentPoint: draftPoint }, state.ui.isometricPlane);
                const baseEntity = shape ? createPolylineEntity(shape.points, state.document.entities, targetLayerId, true) : null;
                return baseEntity
                  ? {
                      ...baseEntity,
                      meta: {
                        ...(baseEntity.meta || {}),
                        projectionMode: 'isometric',
                        isometricPlane: state.ui.isometricPlane,
                      },
                    }
                  : null;
              })()
            : createRectEntity(state.draft.startPoint, getRectEndpointFromDraft({ ...state.draft, currentPoint: draftPoint }), state.document.entities, targetLayerId))
          : (state.ui.viewMode === 'isometric'
            ? createEllipseEntity(state.draft.startPoint, draftPoint, state.document.entities, targetLayerId, {
                plane: state.ui.isometricPlane,
                radius: parsePositiveNumber(state.draft.precisionInput.radius) ?? calculateDistance(state.draft.startPoint, draftPoint),
                meta: {
                  projectionMode: 'isometric',
                  isometricPlane: state.ui.isometricPlane,
                },
              })
            : createCircleEntity(state.draft.startPoint, getCircleRadiusPointFromDraft({ ...state.draft, currentPoint: draftPoint }), state.document.entities, targetLayerId));

      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      } else {
        dispatch(cancelDraft());
      }
      return;
    }

    if (activeTool === 'polyline') {
      const nextPoint = state.draft.points.length
        ? getConstrainedDraftPoint('polyline', state.draft, snap.point ?? worldPoint)
        : (snap.point ?? worldPoint);

      if (!state.draft.type) {
        dispatch(startDraft({
          type: 'polyline',
          step: 'append',
          startPoint: nextPoint,
          currentPoint: nextPoint,
          points: [nextPoint],
          sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
          closedPreview: false,
        }));
        return;
      }

      const lastPoint = state.draft.points.at(-1);

      if (lastPoint && lastPoint.x === nextPoint.x && lastPoint.y === nextPoint.y) {
        return;
      }

      if (state.draft.points.length >= 3 && calculateDistance(state.draft.points[0], nextPoint) <= pixelsToWorldUnits(PROFILE_CLOSE_TOLERANCE_PX, state.viewport.zoom)) {
        const nextEntity = closePolyline(createPolylineEntity(state.draft.points, state.document.entities, targetLayerId, true));

        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
        }
        return;
      }

      dispatch(patchDraft({
        points: appendPolylineVertex(state.draft.points, nextPoint),
        currentPoint: nextPoint,
        sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
        closedPreview: false,
      }));
      return;
    }

    if (activeTool === 'arc') {
      const point = snap.point ?? worldPoint;

      if (!state.draft.type) {
        dispatch(startDraft({
          type: 'arc',
          step: 'pickEnd',
          currentPoint: point,
          points: [point],
          sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
        }));
        return;
      }

      if (state.draft.step === 'pickEnd') {
        dispatch(patchDraft({
          step: 'pickControl',
          points: [state.draft.points[0], point],
          currentPoint: point,
          sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
        }));
        return;
      }

      const nextEntity = createArcEntity(state.draft.points[0], state.draft.points[1], point, state.document.entities, targetLayerId);
      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      }
      return;
    }

    if (activeTool === 'dimension') {
      const point = snap.point ?? worldPoint;

      if (!state.draft.type) {
        dispatch(startDraft({
          type: 'dimension',
          step: 'pickSecond',
          currentPoint: point,
          points: [point],
          subtype: null,
          sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
        }));
        return;
      }

      if (state.draft.step === 'pickSecond') {
        dispatch(patchDraft({
          step: 'place',
          points: [state.draft.points[0], point],
          subtype: inferDimensionSubtype(state.draft.points[0], point),
          currentPoint: worldPoint,
          sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
        }));
        return;
      }

      dispatch(commitEntity(createDimensionEntity({
        p1: state.draft.points[0],
        p2: state.draft.points[1],
        placementPoint: worldPoint,
        units: state.document.units,
        entities: state.document.entities,
        sourceRefs: state.draft.sourceRefs.filter(Boolean),
        layerId: state.document.layers.some((layer) => layer.id === 'dimensions') ? 'dimensions' : targetLayerId,
        subtype: state.draft.subtype,
      })));
    }

    if (activeTool === 'angle') {
      const point = snap.point ?? worldPoint;

      if (!state.draft.type) {
        dispatch(startDraft({
          type: 'angle',
          step: 'pickVertex',
          currentPoint: point,
          points: [point],
          sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
        }));
        return;
      }

      if (state.draft.step === 'pickVertex') {
        dispatch(patchDraft({
          step: 'pickSecond',
          points: [state.draft.points[0], point],
          currentPoint: worldPoint,
          sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
        }));
        return;
      }

      if (state.draft.step === 'pickSecond') {
        const vertex = state.draft.points[1];
        const inputAngle = parsePositiveNumber(state.draft.precisionInput?.angle);
        const isoPlane = state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null;
        const p2 = inputAngle != null
          ? constrainAnglePoint(vertex, state.draft.points[0], point, inputAngle, isoPlane)
          : point;
        const arcRadius = Math.max(calculateDistance(vertex, p2), 20);
        // Don't store sourceRef for p2 when precision input constrained it — the stored p2 is authoritative
        const p2SourceRef = inputAngle != null ? null : buildSourceRefFromSnap(snap);
        dispatch(commitEntity(createAngleDimensionEntity({
          vertex,
          p1: state.draft.points[0],
          p2,
          arcRadius,
          entities: state.document.entities,
          sourceRefs: [...state.draft.sourceRefs, p2SourceRef].filter(Boolean),
          layerId: state.document.layers.some((layer) => layer.id === 'dimensions') ? 'dimensions' : targetLayerId,
          isometricPlane: state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null,
        })));
      }
    }
  }, [activeTool, commitPrecisionDraft, draftPreview, getConstrainedDraftPoint, getOrthoReferencePoint, readCanvasPoint, resolvePointerState, state.document, state.draft, state.interaction.suppressNextClick, state.selection.selectedIds, state.ui.activeLayerId, state.ui.isometricPlane, state.ui.viewMode, state.viewport]);

  const documentPersistence = useMemo(() => ({
    ...documentPersistenceMeta,
    isDirty: documentIsDirty,
    hasFileHandle: Boolean(documentFileHandle),
    desiredFileName: desiredSketchFileName,
    renamePending: Boolean(
      documentPersistenceMeta.fileName
      && documentPersistenceMeta.fileName !== desiredSketchFileName,
    ),
  }), [desiredSketchFileName, documentFileHandle, documentIsDirty, documentPersistenceMeta]);

  const groupSelectionSummary = useMemo(() => {
    if (!selectedEntities.length) {
      return null;
    }

    const typeCounts = selectedEntities.reduce((accumulator, entity) => {
      accumulator[entity.type] = (accumulator[entity.type] ?? 0) + 1;
      return accumulator;
    }, {});

    return {
      count: selectedEntities.length,
      types: Object.entries(typeCounts).map(([type, count]) => `${type} x${count}`).join(', '),
    };
  }, [selectedEntities]);

  return {
    document: state.document,
    viewport: state.viewport,
    ui: state.ui,
    interaction: state.interaction,
    selection: state.selection,
    hover: state.hover,
    draft: state.draft,
    draftPreview,
    precisionHud,
    snap: state.snap,
    canUndo,
    canRedo,
    activeTool,
    activeLayer,
    tools: TOOL_DEFINITIONS,
    visibleEntities,
    selectedEntity,
    selectedMeasurements,
    selectedHandles,
    selectionBounds,
    groupSelectionSummary,
    selectedProfileInfo,
    isBrokenLineSelection,
    setActiveTool: handleToolChange,
    toggleOrtho,
    toggleSnap,
    setViewMode,
    setIsometricPlane,
    updateSelectedEntityField,
    rotateSelectionLeft: () => handleRotateSelection(-90),
    rotateSelectionRight: () => handleRotateSelection(90),
    flipSelectionHorizontal: () => handleFlipSelection('horizontal'),
    flipSelectionVertical: () => handleFlipSelection('vertical'),
    toggleBrokenLines: handleToggleBrokenLines,
    newSketch: handleNewSketch,
    openSketch: handleOpenSketch,
    importSketchFile: handleImportSketchFile,
    saveSketch: handleSaveSketch,
    saveSketchAs: () => handleSaveSketch({ saveAs: true }),
    undo: handleUndo,
    redo: handleRedo,
    commitDocumentName: handleDocumentNameCommit,
    precisionBindings: {
      onInputChange: (field, value) => dispatch(setPrecisionInput({ [field]: value, activeField: field })),
      onSubmit: () => commitPrecisionDraft(),
    },
    handleBindings: {
      onHandlePointerDown: handleHandlePointerDown,
      onTransformPointerDown: handleTransformPointerDown,
    },
    canvasBindings: {
      ref: canvasRef,
      onClick: handleCanvasClick,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onPointerLeave: handlePointerLeave,
    },
    status: {
      cursorWorld: {
        x: roundWorldValue(state.interaction.cursorWorld.x),
        y: roundWorldValue(state.interaction.cursorWorld.y),
      },
      snapPoint: state.snap.point ? { x: roundWorldValue(state.snap.point.x), y: roundWorldValue(state.snap.point.y) } : null,
      selectedProfileCount: selectedProfileInfo?.count ?? 0,
      documentStatus: documentPersistence.isDirty ? 'dirty' : documentPersistence.status,
      viewMode: state.ui.viewMode,
      isometricPlane: state.ui.isometricPlane,
    },
    documentPersistence,
  };
}
