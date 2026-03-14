import { getFloorElevation } from '@/domain/floorModels';
import { SECTION_VISIBILITY_REASONS } from '@/sections/diagnostics';
import { segmentIntersection } from './line';
import { pointInPolygon } from './polygon';
import { getRailingRenderData } from './railingGeometry';
import { projectPointToSectionCut, sectionCutLength } from './sectionCutGeometry';

const EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function uniqueSortedValues(values = []) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => (
    index === 0 || Math.abs(value - sorted[index - 1]) > 1e-4
  ));
}

function intervalFromValues(values, maxLength) {
  if (!values.length) return null;
  const clamped = values
    .map((value) => clamp(value, 0, maxLength))
    .filter((value) => value >= -EPSILON && value <= maxLength + EPSILON);
  if (!clamped.length) return null;

  const left = Math.min(...clamped);
  const right = Math.max(...clamped);
  if (right - left < EPSILON) return null;
  return { left, right };
}

function projectPolygon(sectionCut, polygon = []) {
  return polygon.map((point) => projectPointToSectionCut(sectionCut, point));
}

function polygonCutInterval(sectionCut, polygon = []) {
  if (polygon.length < 3) return null;

  const values = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const hit = segmentIntersection(sectionCut.startPoint, sectionCut.endPoint, start, end);
    if (hit) {
      values.push(projectPointToSectionCut(sectionCut, hit).along);
    }
  }

  if (pointInPolygon(sectionCut.startPoint, polygon)) values.push(0);
  if (pointInPolygon(sectionCut.endPoint, polygon)) values.push(sectionCutLength(sectionCut));

  return intervalFromValues(uniqueSortedValues(values), sectionCutLength(sectionCut));
}

function polygonProjectionInfo(sectionCut, polygon = [], depthLimit = 0) {
  if (polygon.length < 3) return null;
  const projected = projectPolygon(sectionCut, polygon);
  const alongs = projected.map((entry) => entry.along);
  const offsets = projected.map((entry) => entry.offset);
  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);

  if (maxOffset < -EPSILON || minOffset > depthLimit + EPSILON) return null;

  return {
    interval: intervalFromValues(alongs, sectionCutLength(sectionCut)),
    depth: offsets.reduce((sum, value) => sum + Math.max(0, value), 0) / Math.max(1, offsets.length),
  };
}

function createDiagnostics(visible, reason, elementCount = 0) {
  return {
    visible,
    reason,
    elementCount,
  };
}

function summarizePolygonSectionVisibility(sectionCut, polygon = [], depthLimit = 0) {
  if (!sectionCut || polygon.length < 3) {
    return createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0);
  }

  const projected = projectPolygon(sectionCut, polygon);
  if (!projected.length) {
    return createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0);
  }

  const alongs = projected.map((entry) => entry.along);
  const offsets = projected.map((entry) => entry.offset);
  const maxLength = sectionCutLength(sectionCut);
  const minAlong = Math.min(...alongs);
  const maxAlong = Math.max(...alongs);
  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);

  if (maxAlong < -EPSILON || minAlong > maxLength + EPSILON) {
    return createDiagnostics(false, SECTION_VISIBILITY_REASONS.MISSES_CUT, 0);
  }

  if (maxOffset < -EPSILON || minOffset > depthLimit + EPSILON) {
    return createDiagnostics(false, SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION, 0);
  }

  return createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0);
}

function createSceneRect(id, interval, bottom, top, renderMode, depth, sourceId) {
  if (!interval || interval.right - interval.left < EPSILON || Math.abs(top - bottom) < EPSILON) {
    return null;
  }

  return {
    id,
    category: 'railing',
    renderMode,
    left: interval.left,
    right: interval.right,
    bottom,
    top,
    depth,
    sourceId,
  };
}

function createSceneLine(id, interval, elevation, renderMode, depth, sourceId) {
  if (!interval || interval.right - interval.left < EPSILON) return null;

  return {
    id,
    category: 'railing',
    renderMode,
    points: [
      { x: interval.left, z: elevation },
      { x: interval.right, z: elevation },
    ],
    depth,
    sourceId,
  };
}

function aggregateDiagnostics(reasons = []) {
  if (reasons.includes(SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION)) {
    return SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION;
  }
  if (reasons.includes(SECTION_VISIBILITY_REASONS.MISSES_CUT)) {
    return SECTION_VISIBILITY_REASONS.MISSES_CUT;
  }
  return SECTION_VISIBILITY_REASONS.NO_GEOMETRY;
}

export function buildRailingSectionElements(floor, sectionCut) {
  if (!floor || !sectionCut || !(floor.railings || []).length) {
    return {
      rectElements: [],
      lineElements: [],
      diagnostics: createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0),
    };
  }

  const floorElevation = getFloorElevation(floor);
  const rectElements = [];
  const lineElements = [];
  const hiddenReasons = [];

  for (const railing of floor.railings || []) {
    const renderData = getRailingRenderData(railing);
    if (!renderData?.outline?.length) {
      hiddenReasons.push(SECTION_VISIBILITY_REASONS.NO_GEOMETRY);
      continue;
    }

    const cutInterval = polygonCutInterval(sectionCut, renderData.outline);
    const projection = polygonProjectionInfo(sectionCut, renderData.outline, sectionCut.depth);
    const interval = cutInterval || projection?.interval;

    if (!interval) {
      hiddenReasons.push(
        summarizePolygonSectionVisibility(sectionCut, renderData.outline, sectionCut.depth).reason
      );
      continue;
    }

    const renderMode = cutInterval ? 'cut' : 'projection';
    const depth = cutInterval ? 0 : (projection?.depth ?? 0);
    const topElevation = floorElevation + Math.max(0, railing.height ?? 0);

    if (railing.type === 'handrail') {
      const line = createSceneLine(
        `section-railing-${railing.id}`,
        interval,
        topElevation,
        renderMode,
        depth,
        railing.id
      );
      if (line) lineElements.push(line);
      continue;
    }

    const element = createSceneRect(
      `section-railing-${railing.id}`,
      interval,
      floorElevation,
      topElevation,
      renderMode,
      depth,
      railing.id
    );
    if (element) rectElements.push(element);
  }

  const elementCount = rectElements.length + lineElements.length;

  return {
    rectElements,
    lineElements,
    diagnostics: elementCount > 0
      ? createDiagnostics(true, SECTION_VISIBILITY_REASONS.OK, elementCount)
      : createDiagnostics(false, aggregateDiagnostics(hiddenReasons), 0),
  };
}
