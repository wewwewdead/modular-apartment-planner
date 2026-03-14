import { formatMeasurement } from '@/annotations/format';
import { ANNOTATION_SEMANTIC_ROLES, ANNOTATION_TRUST_LEVELS, createMeasurementMetadata } from '@/annotations/policy';
import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { buildRoofSlopeArrows } from './roofDrainageGeometry';
import { buildRoofPlanGeometry } from './roofPlanGeometry';
import { add, distance, midpoint, normalize, perpendicular, rotate, scale, subtract } from './point';
import { signedPolygonArea } from './polygon';

const PERIMETER_TAG_OUTSET = 320;
const INTERNAL_TAG_OUTSET = 220;
const SLOPE_TAG_OFFSET = 160;
const TAG_LINE_HEIGHT = 150;
const MIN_SEGMENT_LENGTH = 320;

function createRoofPlanTag(id, textLines, position, options = {}) {
  const lines = (textLines || []).filter(Boolean);
  if (!lines.length) return null;

  return {
    id,
    type: 'tag',
    trustLevel: options.trustLevel ?? ANNOTATION_TRUST_LEVELS.INFORMATIONAL,
    semanticRole: options.semanticRole ?? ANNOTATION_SEMANTIC_ROLES.MEASUREMENT,
    sourceType: options.sourceType ?? 'roof_plan',
    sourceId: options.sourceId ?? null,
    position,
    angle: options.angle ?? 0,
    textLines: lines,
    textAnchor: options.textAnchor ?? 'middle',
    priority: options.priority ?? 0,
    measurementMeta: Number.isFinite(options.measurementValue)
      ? createMeasurementMetadata(options.measurementValue)
      : null,
    primaryVector: options.primaryVector ?? { x: 0, y: 0 },
    secondaryVector: options.secondaryVector ?? { x: 0, y: 0 },
  };
}

function normalizeTagAngle(angleDeg = 0) {
  let normalized = Number(angleDeg) || 0;
  while (normalized > 90) normalized -= 180;
  while (normalized < -90) normalized += 180;
  return normalized;
}

function segmentDirection(start, end) {
  return normalize(subtract(end, start));
}

function segmentAngle(direction) {
  return normalizeTagAngle((Math.atan2(direction.y, direction.x) * 180) / Math.PI);
}

function outwardBoundaryNormal(direction, orientation) {
  const leftNormal = normalize(perpendicular(direction));
  return orientation >= 0 ? scale(leftNormal, -1) : leftNormal;
}

function outwardInternalNormal(direction, midpointPoint, centroid) {
  const leftNormal = normalize(perpendicular(direction));
  return ((leftNormal.x * (midpointPoint.x - centroid.x)) + (leftNormal.y * (midpointPoint.y - centroid.y))) >= 0
    ? leftNormal
    : scale(leftNormal, -1);
}

function estimateTextWidth(text, fontSize) {
  return Math.max(fontSize * 1.2, String(text || '').length * fontSize * 0.58);
}

function estimateTagBounds(tag) {
  if (!tag) return null;

  const fontSize = DRAWING_GRAPHICS.annotation.textSize;
  const maxLineLength = Math.max(...tag.textLines.map((line) => String(line || '').length), 1);
  const width = estimateTextWidth(maxLineLength ? 'X'.repeat(maxLineLength) : '', fontSize) + 60;
  const height = Math.max(TAG_LINE_HEIGHT, tag.textLines.length * TAG_LINE_HEIGHT);
  const minX = tag.textAnchor === 'start'
    ? tag.position.x
    : (tag.textAnchor === 'end' ? tag.position.x - width : tag.position.x - (width / 2));
  const maxX = tag.textAnchor === 'start'
    ? tag.position.x + width
    : (tag.textAnchor === 'end' ? tag.position.x : tag.position.x + (width / 2));
  const minY = tag.position.y - (height / 2);
  const maxY = tag.position.y + (height / 2);
  const angle = Number(tag.angle || 0);
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ].map((corner) => rotate(corner, tag.position, angle));

  return {
    minX: Math.min(...corners.map((point) => point.x)),
    maxX: Math.max(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function intersects(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function candidatePositionsForTag(tag) {
  const primary = tag.primaryVector || { x: 0, y: 0 };
  const secondary = tag.secondaryVector || { x: 0, y: 0 };

  return [
    tag.position,
    add(tag.position, scale(primary, 0.75)),
    add(tag.position, scale(primary, 1.5)),
    add(tag.position, secondary),
    add(tag.position, scale(secondary, -1)),
    add(add(tag.position, scale(primary, 0.9)), scale(secondary, 0.7)),
    add(add(tag.position, scale(primary, 0.9)), scale(secondary, -0.7)),
  ];
}

function placeRoofPlanTags(tags = []) {
  const placed = [];

  return [...tags]
    .sort((a, b) => b.priority - a.priority)
    .map((tag) => {
      for (const candidatePosition of candidatePositionsForTag(tag)) {
        const candidateTag = { ...tag, position: candidatePosition };
        const bounds = estimateTagBounds(candidateTag);
        if (!bounds || !placed.some((entry) => intersects(bounds, entry))) {
          placed.push(bounds);
          const { primaryVector, secondaryVector, ...publicTag } = candidateTag;
          return publicTag;
        }
      }

      const bounds = estimateTagBounds(tag);
      if (bounds) placed.push(bounds);
      const { primaryVector, secondaryVector, ...publicTag } = tag;
      return publicTag;
    });
}

function extendBoundsWithTags(bounds, tags = []) {
  const nextBounds = { ...bounds };

  for (const tag of tags) {
    const tagBounds = estimateTagBounds(tag);
    if (!tagBounds) continue;
    nextBounds.minX = Math.min(nextBounds.minX, tagBounds.minX);
    nextBounds.maxX = Math.max(nextBounds.maxX, tagBounds.maxX);
    nextBounds.minY = Math.min(nextBounds.minY, tagBounds.minY);
    nextBounds.maxY = Math.max(nextBounds.maxY, tagBounds.maxY);
  }

  return nextBounds;
}

function buildPerimeterTags(plan) {
  const outlinePoints = (plan.roofOutlinePoints || []).length >= 3
    ? plan.roofOutlinePoints
    : plan.boundaryPoints || [];
  if (outlinePoints.length < 2) return [];

  const orientation = signedPolygonArea(outlinePoints) >= 0 ? 1 : -1;

  return outlinePoints
    .map((start, index) => {
      const end = outlinePoints[(index + 1) % outlinePoints.length];
      const length = distance(start, end);
      if (length < MIN_SEGMENT_LENGTH) return null;

      const direction = segmentDirection(start, end);
      if (!direction.x && !direction.y) return null;

      const normal = outwardBoundaryNormal(direction, orientation);
      return createRoofPlanTag(
        `roof-plan-perimeter-${index}`,
        [formatMeasurement(length)],
        add(midpoint(start, end), scale(normal, PERIMETER_TAG_OUTSET)),
        {
          angle: segmentAngle(direction),
          sourceType: 'roof_perimeter',
          sourceId: `roof-plan-perimeter-${index}`,
          priority: 2,
          measurementValue: length,
          primaryVector: scale(normal, 200),
          secondaryVector: scale(direction, 180),
        }
      );
    })
    .filter(Boolean);
}

function buildInternalEdgeTags(segments = [], label, centroid) {
  return segments
    .map((segment, index) => {
      const start = segment.start || segment.startPoint;
      const end = segment.end || segment.endPoint;
      const length = start && end ? distance(start, end) : 0;
      if (!start || !end || length < MIN_SEGMENT_LENGTH) return null;

      const direction = segmentDirection(start, end);
      if (!direction.x && !direction.y) return null;

      const center = midpoint(start, end);
      const normal = outwardInternalNormal(direction, center, centroid);
      return createRoofPlanTag(
        segment.id || `roof-plan-${label.toLowerCase()}-${index}`,
        [`${label} ${formatMeasurement(length)}`],
        add(center, scale(normal, INTERNAL_TAG_OUTSET)),
        {
          angle: segmentAngle(direction),
          sourceType: 'roof_edge',
          sourceId: segment.id || null,
          priority: 3,
          measurementValue: length,
          primaryVector: scale(normal, 160),
          secondaryVector: scale(direction, 160),
        }
      );
    })
    .filter(Boolean);
}

function buildSlopeTags(arrows = []) {
  return arrows
    .map((arrow) => {
      if (!arrow?.label || !arrow?.labelPosition) return null;
      const direction = segmentDirection(arrow.shaftStart, arrow.shaftEnd);
      const normal = normalize(perpendicular(direction));

      return createRoofPlanTag(
        `${arrow.id}-label`,
        [arrow.label],
        arrow.labelPosition,
        {
          sourceType: 'roof_slope',
          sourceId: arrow.id,
          priority: 1,
          primaryVector: scale(normal, SLOPE_TAG_OFFSET),
          secondaryVector: scale(direction, SLOPE_TAG_OFFSET),
        }
      );
    })
    .filter(Boolean);
}

export function buildRoofPlanScene(roofSystem) {
  const plan = buildRoofPlanGeometry(roofSystem);
  const arrows = buildRoofSlopeArrows(roofSystem);

  if (!roofSystem) {
    return {
      plan,
      arrows,
      tags: [],
      bounds: plan.bounds,
    };
  }

  const tags = placeRoofPlanTags([
    ...buildPerimeterTags(plan),
    ...buildInternalEdgeTags(plan.ridgeSegments || [], 'Ridge', plan.centroid || { x: 0, y: 0 }),
    ...buildInternalEdgeTags(plan.valleySegments || [], 'Valley', plan.centroid || { x: 0, y: 0 }),
    ...buildInternalEdgeTags(plan.hipSegments || [], 'Hip', plan.centroid || { x: 0, y: 0 }),
    ...buildSlopeTags(arrows),
  ]);

  return {
    plan,
    arrows,
    tags,
    bounds: extendBoundsWithTags(plan.bounds, tags),
  };
}
