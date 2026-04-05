import {
  JOINERY_TOUCH_TOLERANCE,
  JOINT_PLACEMENT_MODES,
  roundJoineryValue,
  supportsAutoOverlapDepth,
  toNonNegativeNumber,
  toPositiveNumber,
} from './jointDefaults';
import { getRectCenter, getRectCorners } from '../utils/entityUtils';

const VECTOR_TOLERANCE = 1e-6;
const PARALLEL_TOLERANCE = 1e-4;
const OPPOSING_NORMAL_TOLERANCE = 1e-3;

export function buildJoineryEntityMap(entities = []) {
  return new Map((entities || []).map((entity) => [entity.id, entity]));
}

export function getJoineryPartThickness(entity) {
  const thickness = Number(entity?.thickness);
  return Number.isFinite(thickness) && thickness > 0 ? thickness : null;
}

export function isJoineryRectEntity(entity) {
  return entity?.type === 'rect';
}

export function isJoineryRectGenerationSupported(entity) {
  return isJoineryRectEntity(entity)
    && toPositiveNumber(entity.width)
    && toPositiveNumber(entity.height);
}

export function getRectPartBounds(entity) {
  const corners = Object.values(getRectCorners(entity));
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function subtractPoints(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function addPoints(left, right) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function scaleVector(vector, scalar) {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
  };
}

function dotVectors(left, right) {
  return (left.x * right.x) + (left.y * right.y);
}

function crossVectors(left, right) {
  return (left.x * right.y) - (left.y * right.x);
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}

function normalizeVector(vector) {
  const length = vectorLength(vector);
  if (length <= VECTOR_TOLERANCE) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function canonicalizeTangent(vector) {
  const normalized = normalizeVector(vector);
  if (!normalized) {
    return null;
  }

  if (
    normalized.x < -VECTOR_TOLERANCE
    || (Math.abs(normalized.x) <= VECTOR_TOLERANCE && normalized.y < 0)
  ) {
    return {
      x: -normalized.x,
      y: -normalized.y,
    };
  }

  return normalized;
}

function projectPointOntoTangent(point, tangent) {
  return (point.x * tangent.x) + (point.y * tangent.y);
}

function projectEdgeOntoTangent(edge, tangent) {
  const start = projectPointOntoTangent(edge.startPoint, tangent);
  const end = projectPointOntoTangent(edge.endPoint, tangent);

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function isParallelDirection(first, second) {
  return Math.abs(crossVectors(first, second)) <= PARALLEL_TOLERANCE;
}

function edgesFaceEachOther(firstEdge, secondEdge) {
  return isParallelDirection(firstEdge.tangent, secondEdge.tangent)
    && dotVectors(firstEdge.outwardNormal, secondEdge.outwardNormal) <= -(1 - OPPOSING_NORMAL_TOLERANCE);
}

function getEdgeLineSeparation(firstEdge, secondEdge) {
  return dotVectors(
    subtractPoints(secondEdge.startPoint, firstEdge.startPoint),
    firstEdge.outwardNormal,
  );
}

function getProjectedOverlap(firstEdge, secondEdge, tolerance = JOINERY_TOUCH_TOLERANCE) {
  if (!edgesFaceEachOther(firstEdge, secondEdge)) {
    return null;
  }

  const secondProjection = projectEdgeOntoTangent(secondEdge, firstEdge.tangent);
  const overlap = buildInterval(
    Math.max(firstEdge.start, secondProjection.start),
    Math.min(firstEdge.end, secondProjection.end),
    tolerance,
  );

  if (!overlap) {
    return null;
  }

  return {
    ...overlap,
    startPoint: getPointAlongEdge(firstEdge, overlap.start, 0),
    endPoint: getPointAlongEdge(firstEdge, overlap.end, 0),
  };
}

export function getRectEdgeData(entity, edgeKey) {
  if (!isJoineryRectGenerationSupported(entity)) {
    return null;
  }

  const center = getRectCenter(entity);
  const corners = getRectCorners(entity);
  const edgePoints = {
    top: [corners.topLeft, corners.topRight],
    right: [corners.topRight, corners.bottomRight],
    bottom: [corners.bottomLeft, corners.bottomRight],
    left: [corners.topLeft, corners.bottomLeft],
  }[edgeKey];

  if (!edgePoints) {
    return null;
  }

  let [startPoint, endPoint] = edgePoints;
  const rawVector = subtractPoints(endPoint, startPoint);
  const tangent = canonicalizeTangent(rawVector);
  if (!tangent) {
    return null;
  }

  if (dotVectors(normalizeVector(rawVector), tangent) < 0) {
    [startPoint, endPoint] = [endPoint, startPoint];
  }

  const midpoint = {
    x: (startPoint.x + endPoint.x) / 2,
    y: (startPoint.y + endPoint.y) / 2,
  };
  const inwardNormal = normalizeVector(subtractPoints(center, midpoint));
  if (!inwardNormal) {
    return null;
  }

  const start = roundJoineryValue(projectPointOntoTangent(startPoint, tangent));
  const end = roundJoineryValue(projectPointOntoTangent(endPoint, tangent));

  return {
    edgeKey,
    start,
    end,
    length: roundJoineryValue(vectorLength(subtractPoints(endPoint, startPoint))),
    tangent,
    inwardNormal,
    outwardNormal: {
      x: -inwardNormal.x,
      y: -inwardNormal.y,
    },
    startPoint,
    endPoint,
    midpoint,
  };
}

export function createResolvedEdgeReference(partId, edgeKey) {
  if (!partId || !edgeKey) {
    return null;
  }

  return {
    partId,
    entityId: partId,
    sourceType: 'segment',
    sourceKey: edgeKey,
  };
}

export function resolveJointEdgeReference(entity, reference) {
  if (!reference || reference.sourceType !== 'segment') {
    return null;
  }

  return getRectEdgeData(entity, reference.sourceKey);
}

function buildInterval(start, end, tolerance = JOINERY_TOUCH_TOLERANCE) {
  const intervalStart = Math.max(Number(start) || 0, Number.NEGATIVE_INFINITY);
  const intervalEnd = Math.min(Number(end) || 0, Number.POSITIVE_INFINITY);
  const length = intervalEnd - intervalStart;

  if (length <= tolerance) {
    return null;
  }

  return {
    start: roundJoineryValue(intervalStart),
    end: roundJoineryValue(intervalEnd),
    length: roundJoineryValue(length),
    center: roundJoineryValue((intervalStart + intervalEnd) / 2),
  };
}

function computeAxisOverlap(startA, endA, startB, endB, tolerance = JOINERY_TOUCH_TOLERANCE) {
  return buildInterval(Math.max(startA, startB), Math.min(endA, endB), tolerance);
}

export function computeEdgeOverlap(firstEdge, secondEdge, tolerance = JOINERY_TOUCH_TOLERANCE) {
  if (!firstEdge || !secondEdge) {
    return null;
  }

  if (Math.abs(getEdgeLineSeparation(firstEdge, secondEdge)) > tolerance) {
    return null;
  }

  return getProjectedOverlap(firstEdge, secondEdge, tolerance);
}

export function applyInsetToOverlap(overlap, inset = 0) {
  if (!overlap) {
    return null;
  }

  const safeInset = toNonNegativeNumber(inset, 0);
  const start = overlap.start + safeInset;
  const end = overlap.end - safeInset;
  const length = end - start;

  if (length <= JOINERY_TOUCH_TOLERANCE) {
    return null;
  }

  return {
    start: roundJoineryValue(start),
    end: roundJoineryValue(end),
    length: roundJoineryValue(length),
    center: roundJoineryValue((start + end) / 2),
  };
}

export function resolveIntervalWithinOverlap(overlap, width, offset = 0) {
  if (!overlap) {
    return null;
  }

  const requestedWidth = Math.max(Number(width) || 0, JOINERY_TOUCH_TOLERANCE);
  const safeWidth = Math.min(requestedWidth, overlap.length);
  if (!(safeWidth > JOINERY_TOUCH_TOLERANCE)) {
    return null;
  }

  const halfWidth = safeWidth / 2;
  const desiredCenter = overlap.center + (Number(offset) || 0);
  const minCenter = overlap.start + halfWidth;
  const maxCenter = overlap.end - halfWidth;
  const center = Math.min(Math.max(desiredCenter, minCenter), maxCenter);

  return {
    start: roundJoineryValue(center - halfWidth),
    end: roundJoineryValue(center + halfWidth),
    length: roundJoineryValue(safeWidth),
    center: roundJoineryValue(center),
  };
}

export function buildRepeatedEdgeIntervals(overlap, { count, width, spacing = 0, edgeOffset = 0 } = {}) {
  if (!overlap) {
    return { error: 'A valid overlap is required to place repeated joint features.' };
  }

  const safeCount = Number(count);
  const safeWidth = Number(width);
  const safeSpacing = Math.max(0, Number(spacing) || 0);
  const safeEdgeOffset = Math.max(0, Number(edgeOffset) || 0);

  if (!Number.isInteger(safeCount) || safeCount < 1) {
    return { error: 'A repeated joint requires a positive feature count.' };
  }

  if (!(safeWidth > 0)) {
    return { error: 'A repeated joint requires a positive feature width.' };
  }

  const usableLength = overlap.length - (safeEdgeOffset * 2);
  const requiredLength = (safeCount * safeWidth) + (Math.max(0, safeCount - 1) * safeSpacing);

  if (usableLength <= 0 || requiredLength > usableLength + JOINERY_TOUCH_TOLERANCE) {
    return { error: 'The requested repeated pattern does not fit inside the available overlap.' };
  }

  const intervals = [];
  let cursor = overlap.start + safeEdgeOffset;

  for (let index = 0; index < safeCount; index += 1) {
    const start = cursor;
    const end = cursor + safeWidth;
    intervals.push({
      start: roundJoineryValue(start),
      end: roundJoineryValue(end),
      length: roundJoineryValue(safeWidth),
      center: roundJoineryValue((start + end) / 2),
    });
    cursor = end + safeSpacing;
  }

  return { intervals };
}

export function getPointAlongEdge(edge, position, normalDistance = 0, normalKind = 'inward') {
  if (!edge) {
    return null;
  }

  const normal = normalKind === 'outward' ? edge.outwardNormal : edge.inwardNormal;
  const offset = Number(normalDistance) || 0;
  const alongDistance = (Number(position) || 0) - edge.start;
  const basePoint = addPoints(edge.startPoint, scaleVector(edge.tangent, alongDistance));

  return {
    x: roundJoineryValue(basePoint.x + (normal.x * offset)),
    y: roundJoineryValue(basePoint.y + (normal.y * offset)),
  };
}

function getAutoContactCandidates(contactKind, sourcePart, targetPart) {
  return contactKind === 'penetration'
    ? buildPenetrationContactCandidates(sourcePart, targetPart)
    : buildTouchContactCandidates(sourcePart, targetPart);
}

function evaluateAutoContactDirection(contactKind, sourcePart, targetPart) {
  const candidates = getAutoContactCandidates(contactKind, sourcePart, targetPart);

  if (!candidates.length) {
    return {
      status: 'missing',
      candidate: null,
    };
  }

  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      candidate: null,
    };
  }

  return {
    status: 'valid',
    candidate: candidates[0],
  };
}

function buildTouchContactCandidates(sourcePart, targetPart) {
  const sourceEdges = ['top', 'right', 'bottom', 'left']
    .map((edgeKey) => getRectEdgeData(sourcePart, edgeKey))
    .filter(Boolean);
  const targetEdges = ['top', 'right', 'bottom', 'left']
    .map((edgeKey) => getRectEdgeData(targetPart, edgeKey))
    .filter(Boolean);

  return sourceEdges.flatMap((sourceEdge) => targetEdges.flatMap((targetEdge) => {
    if (!edgesFaceEachOther(sourceEdge, targetEdge)) {
      return [];
    }

    const overlap = computeEdgeOverlap(sourceEdge, targetEdge);
    if (!overlap) {
      return [];
    }

    return [{
      kind: 'touch',
      overlap,
      penetrationDepth: null,
      sourceEdge,
      targetEdge,
    }];
  }));
}

function buildPenetrationContactCandidates(sourcePart, targetPart) {
  const sourceEdges = ['top', 'right', 'bottom', 'left']
    .map((edgeKey) => getRectEdgeData(sourcePart, edgeKey))
    .filter(Boolean);
  const sourceEdgesByKey = new Map(sourceEdges.map((edge) => [edge.edgeKey, edge]));
  const targetEdges = ['top', 'right', 'bottom', 'left']
    .map((edgeKey) => getRectEdgeData(targetPart, edgeKey))
    .filter(Boolean);
  const oppositeEdgeByKey = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  };

  return sourceEdges.flatMap((sourceEdge) => targetEdges.flatMap((targetEdge) => {
    const overlap = getProjectedOverlap(sourceEdge, targetEdge);
    if (!overlap) {
      return [];
    }

    const penetrationDepth = dotVectors(
      subtractPoints(sourceEdge.midpoint, targetEdge.midpoint),
      targetEdge.inwardNormal,
    );
    const oppositeSourceEdge = sourceEdgesByKey.get(oppositeEdgeByKey[sourceEdge.edgeKey]);
    const oppositeDepth = oppositeSourceEdge
      ? dotVectors(
          subtractPoints(oppositeSourceEdge.midpoint, targetEdge.midpoint),
          targetEdge.inwardNormal,
        )
      : null;

    if (
      penetrationDepth <= JOINERY_TOUCH_TOLERANCE
      || oppositeDepth == null
      || oppositeDepth >= -JOINERY_TOUCH_TOLERANCE
    ) {
      return [];
    }

    return [{
      kind: 'penetration',
      overlap,
      penetrationDepth: roundJoineryValue(penetrationDepth),
      sourceEdge,
      targetEdge,
    }];
  }));
}

function getAutoContactKindForJointType(type) {
  return supportsAutoOverlapDepth(type) ? 'penetration' : 'touch';
}

function resolveAutoContactCandidate(joint, sourcePart, targetPart) {
  const requiredContactKind = getAutoContactKindForJointType(joint.type);
  if (requiredContactKind !== 'penetration') {
    const touchEvaluation = evaluateAutoContactDirection(requiredContactKind, sourcePart, targetPart);

    if (touchEvaluation.status === 'missing') {
      return {
        error: `Automatic ${joint.type} placement requires exactly one touching edge contact between the selected parts.`,
        code: 'missing_contact',
      };
    }

    if (touchEvaluation.status === 'ambiguous') {
      return {
        error: 'Multiple valid contact regions were detected between the selected parts. Adjust the geometry so only one contact remains.',
        code: 'ambiguous_contact',
      };
    }

    return {
      ...touchEvaluation.candidate,
      sourcePart,
      targetPart,
      autoFlipped: false,
    };
  }

  const forwardEvaluation = evaluateAutoContactDirection(requiredContactKind, sourcePart, targetPart);
  const reverseEvaluation = evaluateAutoContactDirection(requiredContactKind, targetPart, sourcePart);
  const validDirections = [];

  if (forwardEvaluation.status === 'valid') {
    validDirections.push({
      ...forwardEvaluation.candidate,
      sourcePart,
      targetPart,
      autoFlipped: false,
    });
  }

  if (reverseEvaluation.status === 'valid') {
    validDirections.push({
      ...reverseEvaluation.candidate,
      sourcePart: targetPart,
      targetPart: sourcePart,
      autoFlipped: true,
    });
  }

  if (validDirections.length === 1) {
    return validDirections[0];
  }

  if (validDirections.length > 1) {
    return {
      error: 'Both source/target directions are valid. Automatic placement cannot decide which part should drive the joint.',
      code: 'ambiguous_direction',
    };
  }

  if (forwardEvaluation.status === 'ambiguous' && reverseEvaluation.status === 'ambiguous') {
    return {
      error: 'Both directions remain ambiguous; automatic placement cannot choose a single overlap region.',
      code: 'ambiguous_contact',
    };
  }

  return {
    error: 'No valid overlap direction was found between the selected parts.',
    code: 'missing_contact',
  };
}

function resolveManualJoineryContext(joint, sourcePart, targetPart) {
  const sourceEdge = resolveJointEdgeReference(sourcePart, joint.sourceEdgeRef);
  const targetEdge = resolveJointEdgeReference(targetPart, joint.targetEdgeRef);

  if (!sourceEdge || !targetEdge) {
    return { error: 'The stored edge references could not be resolved.', code: 'invalid_reference' };
  }

  const overlap = computeEdgeOverlap(sourceEdge, targetEdge);
  if (!overlap) {
    return { error: 'Selected edges must touch and share a usable overlap.', code: 'no_overlap' };
  }

  return {
    placementMode: JOINT_PLACEMENT_MODES.MANUAL_REFS,
    contactKind: 'touch',
    sourceEdge,
    targetEdge,
    overlap,
    penetrationDepth: null,
  };
}

export function resolveJoineryContext(joint, entitiesOrMap) {
  const entitiesById = entitiesOrMap instanceof Map ? entitiesOrMap : buildJoineryEntityMap(entitiesOrMap);
  const initialSourcePart = entitiesById.get(joint.sourcePartId);
  const initialTargetPart = entitiesById.get(joint.targetPartId);

  if (!initialSourcePart || !initialTargetPart) {
    return { error: 'One or more connected parts are missing.', code: 'missing_part' };
  }

  if (initialSourcePart.id === initialTargetPart.id) {
    return { error: 'A joint must connect two different parts.', code: 'same_part' };
  }

  if (!isJoineryRectGenerationSupported(initialSourcePart) || !isJoineryRectGenerationSupported(initialTargetPart)) {
    return {
      error: 'Joinery generation currently supports rectangular panel entities only.',
      code: 'unsupported_geometry',
    };
  }

  const contactContext = joint.placementMode === JOINT_PLACEMENT_MODES.AUTO_CONTACT
    ? resolveAutoContactCandidate(joint, initialSourcePart, initialTargetPart)
    : resolveManualJoineryContext(joint, initialSourcePart, initialTargetPart);

  if (contactContext?.error) {
    return contactContext;
  }

  const sourcePart = contactContext.sourcePart || initialSourcePart;
  const targetPart = contactContext.targetPart || initialTargetPart;
  const sourceThickness = getJoineryPartThickness(sourcePart);
  const targetThickness = getJoineryPartThickness(targetPart);
  const missingThicknessPartIds = [
    ...(!sourceThickness ? [sourcePart.id] : []),
    ...(!targetThickness ? [targetPart.id] : []),
  ];

  return {
    sourcePart,
    targetPart,
    sourceEdge: contactContext.sourceEdge,
    targetEdge: contactContext.targetEdge,
    overlap: contactContext.overlap,
    sourceThickness,
    targetThickness,
    minThickness:
      sourceThickness != null && targetThickness != null
        ? Math.min(sourceThickness, targetThickness)
        : null,
    contactKind: contactContext.contactKind || contactContext.kind,
    penetrationDepth: contactContext.penetrationDepth,
    autoFlipped: Boolean(contactContext.autoFlipped),
    placementMode: joint.placementMode,
    fabricationReady: !missingThicknessPartIds.length,
    missingThicknessPartIds,
    resolvedSourceEdgeRef: createResolvedEdgeReference(sourcePart.id, contactContext.sourceEdge?.edgeKey),
    resolvedTargetEdgeRef: createResolvedEdgeReference(targetPart.id, contactContext.targetEdge?.edgeKey),
  };
}
