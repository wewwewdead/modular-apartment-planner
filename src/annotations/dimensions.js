import { detectRoomFaces } from '@/geometry/roomDetection';
import { distanceToSegment } from '@/geometry/line';
import { add, distance, midpoint, normalize, perpendicular, scale, subtract } from '@/geometry/point';
import { pointInPolygon } from '@/geometry/polygon';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { formatMeasurement } from './format';
import { ANNOTATION_SEMANTIC_ROLES, ANNOTATION_TRUST_LEVELS, createMeasurementMetadata } from './policy';

const EPSILON = 1e-6;
const WALL_DIMENSION_GAP = 300;
const ROOM_DIMENSION_INSET = 180;
const OVERALL_CHAIN_GAP = 500;
const OVERALL_TOTAL_GAP = 900;
const ARROW_SIZE = 80;
const VALUE_MERGE_TOLERANCE = 1;
const MIN_DIMENSION_LENGTH = 100;

function normalizeTextAngle(angleDeg) {
  return angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;
}

function createArrowHead(tip, direction, size = ARROW_SIZE) {
  const dir = normalize(direction);
  const normal = perpendicular(dir);
  const back = scale(dir, -size);
  const side = scale(normal, size * 0.45);
  return {
    tip,
    left: add(add(tip, back), side),
    right: add(add(tip, back), scale(side, -1)),
  };
}

function buildAlignedFigure(startPoint, endPoint, offset) {
  const direction = normalize(subtract(endPoint, startPoint));
  if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) return null;

  const normal = perpendicular(direction);
  const offsetVector = scale(normal, offset);
  const lineStart = add(startPoint, offsetVector);
  const lineEnd = add(endPoint, offsetVector);
  const angle = normalizeTextAngle(Math.atan2(direction.y, direction.x) * (180 / Math.PI));

  return {
    lineStart,
    lineEnd,
    extensionLines: [
      { start: startPoint, end: lineStart },
      { start: endPoint, end: lineEnd },
    ],
    textPosition: midpoint(lineStart, lineEnd),
    textAngle: angle,
    measurement: distance(startPoint, endPoint),
    direction,
  };
}

function buildHorizontalFigure(startPoint, endPoint, offset) {
  const left = startPoint.x <= endPoint.x ? startPoint : endPoint;
  const right = left === startPoint ? endPoint : startPoint;
  const y = (startPoint.y + endPoint.y) / 2 + offset;
  const lineStart = { x: left.x, y };
  const lineEnd = { x: right.x, y };

  return {
    lineStart,
    lineEnd,
    extensionLines: [
      { start: left, end: lineStart },
      { start: right, end: lineEnd },
    ],
    textPosition: midpoint(lineStart, lineEnd),
    textAngle: 0,
    measurement: Math.abs(endPoint.x - startPoint.x),
    direction: { x: 1, y: 0 },
  };
}

function buildVerticalFigure(startPoint, endPoint, offset) {
  const top = startPoint.y <= endPoint.y ? startPoint : endPoint;
  const bottom = top === startPoint ? endPoint : startPoint;
  const x = (startPoint.x + endPoint.x) / 2 + offset;
  const lineStart = { x, y: top.y };
  const lineEnd = { x, y: bottom.y };

  return {
    lineStart,
    lineEnd,
    extensionLines: [
      { start: top, end: lineStart },
      { start: bottom, end: lineEnd },
    ],
    textPosition: midpoint(lineStart, lineEnd),
    textAngle: 90,
    measurement: Math.abs(endPoint.y - startPoint.y),
    direction: { x: 0, y: 1 },
  };
}

export function createDimensionFigure({
  id,
  startPoint,
  endPoint,
  mode = 'aligned',
  offset = 0,
  label,
  source = 'manual',
  sourceType = null,
  sourceId = null,
}) {
  let core = null;

  if (mode === 'horizontal') core = buildHorizontalFigure(startPoint, endPoint, offset);
  else if (mode === 'vertical') core = buildVerticalFigure(startPoint, endPoint, offset);
  else core = buildAlignedFigure(startPoint, endPoint, offset);

  if (!core || core.measurement < MIN_DIMENSION_LENGTH) return null;

  const lineDirection = normalize(subtract(core.lineEnd, core.lineStart));
  const startArrow = createArrowHead(core.lineStart, lineDirection);
  const endArrow = createArrowHead(core.lineEnd, scale(lineDirection, -1));
  const measurementMeta = createMeasurementMetadata(core.measurement);

  return {
    id,
    type: 'dimension',
    trustLevel: ANNOTATION_TRUST_LEVELS.AUTHORITATIVE,
    semanticRole: ANNOTATION_SEMANTIC_ROLES.MEASUREMENT,
    source,
    sourceType,
    sourceId,
    mode,
    measurement: core.measurement,
    measurementMeta,
    label: label || measurementMeta.displayValue,
    lineStart: core.lineStart,
    lineEnd: core.lineEnd,
    extensionLines: core.extensionLines,
    arrowheads: [startArrow, endArrow],
    text: {
      position: core.textPosition,
      angle: core.textAngle,
      value: label || measurementMeta.displayValue,
    },
    segments: [
      { start: core.lineStart, end: core.lineEnd },
      ...core.extensionLines,
      { start: startArrow.tip, end: startArrow.left },
      { start: startArrow.tip, end: startArrow.right },
      { start: endArrow.tip, end: endArrow.left },
      { start: endArrow.tip, end: endArrow.right },
    ],
  };
}

function isInsideAnyFace(point, faces) {
  return faces.some((face) => pointInPolygon(point, face.points));
}

function pickWallDimensionFigure(renderWall, faces, wallId) {
  const offset = renderWall.thickness / 2 + WALL_DIMENSION_GAP;
  const negative = createDimensionFigure({
    id: `wall-dim-${wallId}-neg`,
    startPoint: renderWall.start,
    endPoint: renderWall.end,
    mode: 'aligned',
    offset: -offset,
    source: 'derived',
    sourceType: 'wall',
    sourceId: wallId,
  });
  if (!negative) return null;
  if (!faces.length) return negative;

  const positive = createDimensionFigure({
    id: `wall-dim-${wallId}-pos`,
    startPoint: renderWall.start,
    endPoint: renderWall.end,
    mode: 'aligned',
    offset,
    source: 'derived',
    sourceType: 'wall',
    sourceId: wallId,
  });
  if (!positive) return negative;

  const negativeInside = isInsideAnyFace(negative.text.position, faces);
  const positiveInside = isInsideAnyFace(positive.text.position, faces);

  if (negativeInside && !positiveInside) return positive;
  if (positiveInside && !negativeInside) return negative;
  return negative;
}

export function buildWallDimensionFigures(walls = [], columns = []) {
  const faces = detectRoomFaces(walls, columns || []);

  return walls
    .map((wall) => {
      const renderWall = getWallRenderData(wall, columns || []).renderWall;
      return pickWallDimensionFigure(renderWall, faces, wall.id);
    })
    .filter(Boolean);
}

export function buildRoomDimensionFigures(rooms = []) {
  const figures = [];

  for (const room of rooms) {
    if (!room.points?.length) continue;

    const xs = room.points.map((point) => point.x);
    const ys = room.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const horizontal = createDimensionFigure({
      id: `room-dim-h-${room.id}`,
      startPoint: { x: minX, y: minY },
      endPoint: { x: maxX, y: minY },
      mode: 'horizontal',
      offset: ROOM_DIMENSION_INSET,
      source: 'derived',
      sourceType: 'room',
      sourceId: room.id,
    });

    const vertical = createDimensionFigure({
      id: `room-dim-v-${room.id}`,
      startPoint: { x: maxX, y: minY },
      endPoint: { x: maxX, y: maxY },
      mode: 'vertical',
      offset: -ROOM_DIMENSION_INSET,
      source: 'derived',
      sourceType: 'room',
      sourceId: room.id,
    });

    if (horizontal) figures.push(horizontal);
    if (vertical) figures.push(vertical);
  }

  return figures;
}

function uniqueSortedValues(values = []) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => (
    index === 0 || Math.abs(value - sorted[index - 1]) > VALUE_MERGE_TOLERANCE
  ));
}

export function buildOverallDimensionFigures(walls = [], columns = []) {
  const renderWalls = walls
    .map((wall) => getWallRenderData(wall, columns || []).renderWall)
    .filter(Boolean);

  const points = renderWalls.flatMap((wall) => [wall.start, wall.end]);
  if (points.length < 2) return [];

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const chainX = uniqueSortedValues(xs);
  const chainY = uniqueSortedValues(ys);
  const figures = [];

  for (let index = 0; index < chainX.length - 1; index += 1) {
    const figure = createDimensionFigure({
      id: `overall-chain-x-${index}`,
      startPoint: { x: chainX[index], y: minY },
      endPoint: { x: chainX[index + 1], y: minY },
      mode: 'horizontal',
      offset: -OVERALL_CHAIN_GAP,
      source: 'derived',
      sourceType: 'overall-chain',
    });
    if (figure) figures.push(figure);
  }

  for (let index = 0; index < chainY.length - 1; index += 1) {
    const figure = createDimensionFigure({
      id: `overall-chain-y-${index}`,
      startPoint: { x: minX, y: chainY[index] },
      endPoint: { x: minX, y: chainY[index + 1] },
      mode: 'vertical',
      offset: -OVERALL_CHAIN_GAP,
      source: 'derived',
      sourceType: 'overall-chain',
    });
    if (figure) figures.push(figure);
  }

  const overallWidth = createDimensionFigure({
    id: 'overall-width',
    startPoint: { x: minX, y: minY },
    endPoint: { x: maxX, y: minY },
    mode: 'horizontal',
    offset: -OVERALL_TOTAL_GAP,
    source: 'derived',
    sourceType: 'overall',
  });

  const overallHeight = createDimensionFigure({
    id: 'overall-height',
    startPoint: { x: minX, y: minY },
    endPoint: { x: minX, y: maxY },
    mode: 'vertical',
    offset: -OVERALL_TOTAL_GAP,
    source: 'derived',
    sourceType: 'overall',
  });

  if (overallWidth) figures.push(overallWidth);
  if (overallHeight) figures.push(overallHeight);

  return figures;
}

export function buildManualDimensionFigures(annotations = []) {
  return annotations
    .filter((annotation) => annotation.type === 'dimension')
    .map((annotation) => createDimensionFigure({
      id: annotation.id,
      startPoint: annotation.startPoint,
      endPoint: annotation.endPoint,
      mode: annotation.mode,
      offset: annotation.offset,
      label: annotation.textOverride?.trim() || undefined,
      source: 'manual',
      sourceType: 'annotation',
      sourceId: annotation.id,
    }))
    .filter(Boolean);
}

export function hitTestDimensionFigure(point, figure, tolerance) {
  return figure.segments.some((segment) => distanceToSegment(point, segment.start, segment.end) <= tolerance);
}
