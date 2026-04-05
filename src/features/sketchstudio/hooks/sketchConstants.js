import { calculateDistance, projectPointFromStart } from '../utils/canvasMath';
import {
  buildLineFromExactLength,
  getDimensionOffsetFromPlacement,
  createFeatureEntity,
  DEFAULT_TEXT_LABEL,
  DEFAULT_TEXT_SIZE,
} from '../utils/entityUtils';
import { inferDimensionSubtype } from '../utils/dimensionUtils';
import { buildIsometricEllipse, buildIsometricPlaneRectangle, getIsometricPlaneAxes } from '../utils/isometricUtils';
import { measureOffsetDistance, offsetLineEntity, offsetPolylineEntity, offsetRectEntity } from '../utils/offsetUtils';
import { isPolylineClosed } from '../utils/profileUtils';
import { computeSketchFillet } from '../utils/filletUtils';

export const HIT_TOLERANCE_PX = 10;
export const SNAP_TOLERANCE_PX = 12;
export const PROFILE_CLOSE_TOLERANCE_PX = 14;
export const TRANSFORM_DRAG_THRESHOLD_PX = 3;

export const TOOL_DEFINITIONS = [
  { id: 'select', label: 'Select', shortLabel: 'SEL', shortcut: 'V', description: 'Pick, marquee, and transform entities' },
  { id: 'pan', label: 'Pan', shortLabel: 'PAN', shortcut: 'H', description: 'Move the viewport' },
  { id: 'line', label: 'Line', shortLabel: 'LIN', shortcut: 'L', description: 'Create line entities' },
  { id: 'rect', label: 'Rectangle', shortLabel: 'REC', shortcut: 'R', description: 'Create rectangle entities' },
  { id: 'circle', label: 'Circle', shortLabel: 'CIR', shortcut: 'C', description: 'Create circle entities' },
  { id: 'polyline', label: 'Polyline', shortLabel: 'PLY', shortcut: 'P', description: 'Create multi-segment paths' },
  { id: 'arc', label: 'Arc', shortLabel: 'ARC', shortcut: 'A', description: 'Create three-point arcs' },
  { id: 'text', label: 'Text', shortLabel: 'TXT', shortcut: 'T', description: 'Place leader labels with a target point and offset' },
  { id: 'offset', label: 'Offset', shortLabel: 'OFF', shortcut: 'O', description: 'Create offset copies of supported profiles' },
  { id: 'holeCircle', label: 'Hole', shortLabel: 'HOL', shortcut: 'J', description: 'Create circular subtractive features' },
  { id: 'cutoutRect', label: 'Cutout', shortLabel: 'CUT', shortcut: 'U', description: 'Create rectangular subtractive features' },
  { id: 'dimension', label: 'Dimension', shortLabel: 'DIM', shortcut: 'D', description: 'Create linear dimension annotations' },
  { id: 'fillet', label: 'Fillet', shortLabel: 'FIL', shortcut: 'F', description: 'Round corners with an arc radius' },
  { id: 'angle', label: 'Angle', shortLabel: 'ANG', shortcut: 'Q', description: 'Measure angles between two rays' },
];

export const TOOL_SHORTCUT_MAP = new Map(
  TOOL_DEFINITIONS.map((tool) => [tool.shortcut.toLowerCase(), tool.id]),
);

export function getEmptySnapState() {
  return {
    point: null,
    sourceEntityId: null,
    entityType: null,
    sourceType: null,
    sourceKey: null,
    snapType: null,
  };
}

export function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

export function mergeSelection(existingIds, nextIds, additive) {
  if (!additive) {
    return nextIds;
  }

  return Array.from(new Set([...existingIds, ...nextIds]));
}

export function constrainAnglePoint(vertex, p1, cursorPoint, angleDeg, isometricPlane) {
  const dist = calculateDistance(vertex, cursorPoint) || 50;

  if (isometricPlane) {
    const { axisA, axisB } = getIsometricPlaneAxes(isometricPlane);
    const det = (axisA.x * axisB.y) - (axisA.y * axisB.x);
    if (Math.abs(det) < 1e-6) return cursorPoint;

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

export function parsePositiveNumber(rawValue) {
  if (rawValue === '') {
    return null;
  }

  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

export function isOffsettableEntity(entity) {
  return entity?.type === 'line'
    || entity?.type === 'rect'
    || (entity?.type === 'polyline' && isPolylineClosed(entity));
}

export function getRectEndpointFromDraft(draft) {
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

export function getIsometricRectangleFromDraft(draft, plane = 'top') {
  if (!draft.startPoint || !draft.currentPoint) {
    return null;
  }

  return buildIsometricPlaneRectangle(draft.startPoint, draft.currentPoint, plane, {
    sizeA: parsePositiveNumber(draft.precisionInput.width),
    sizeB: parsePositiveNumber(draft.precisionInput.height),
  });
}

export function getLineEndpointFromDraft(draft) {
  if (!draft.startPoint || !draft.currentPoint) {
    return null;
  }

  const length = parsePositiveNumber(draft.precisionInput.length);
  return length ? buildLineFromExactLength(draft.startPoint, draft.currentPoint, length) : draft.currentPoint;
}

export function getCircleRadiusPointFromDraft(draft) {
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

export function buildOffsetEntityFromDraft(draft, document, targetLayerId) {
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

export function getDraftPreviewEntity(draft, document, targetLayerId, ui) {
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

  if (draft.type === 'text') {
    if (draft.points.length === 1 && draft.currentPoint) {
      return {
        type: 'text-leader',
        x: draft.currentPoint.x,
        y: draft.currentPoint.y,
        text: DEFAULT_TEXT_LABEL,
        fontSize: DEFAULT_TEXT_SIZE,
        rotation: 0,
        target: draft.points[0],
      };
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
