import { segmentIntersection } from './line';
import { midpoint } from './point';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';
import { pointInPolygon } from './polygon';
import { projectPointToSectionCut, sectionCutLength, sectionCutPointAtAlong } from './sectionCutGeometry';
import { getParapetRenderData } from './roofPlanGeometry';
import { SECTION_VISIBILITY_REASONS } from '@/sections/diagnostics';
import { buildRoofSectionSurfaces } from '@/sections/roofGeometry';

const EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function uniqueSortedValues(values = []) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => index === 0 || Math.abs(value - sorted[index - 1]) > 1e-4);
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

  // The cut endpoints are not at along 0 / length: the view axis is reversed relative to the
  // start -> end axis when direction is +1, so project them instead of assuming an order.
  if (pointInPolygon(sectionCut.startPoint, polygon)) {
    values.push(projectPointToSectionCut(sectionCut, sectionCut.startPoint).along);
  }
  if (pointInPolygon(sectionCut.endPoint, polygon)) {
    values.push(projectPointToSectionCut(sectionCut, sectionCut.endPoint).along);
  }

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

function createSceneRect(id, category, renderMode, interval, bottom, top, depth, sourceId) {
  if (!interval) return null;
  return {
    id,
    category,
    renderMode,
    left: interval.left,
    right: interval.right,
    bottom,
    top,
    depth,
    sourceId,
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

function localRoofTopElevation(roofSystem, roofGeometry, sectionCut, along, fallbackTopElevation) {
  if ((roofSystem.roofType || 'flat') === 'flat') return fallbackTopElevation;
  return roofGeometry.getSurfaceElevation(sectionCutPointAtAlong(sectionCut, along), 'top');
}

function buildOpeningCurbElements(openingEntries, roofSystem, roofGeometry, sectionCut, topElevation) {
  return openingEntries.flatMap((entry) => {
    const curbHeight = Math.max(0, Number(entry.opening?.curbHeight) || 0);
    if (!entry.interval || curbHeight <= EPSILON) return [];

    const curbWidth = Math.min(120, Math.max(40, (entry.interval.right - entry.interval.left) * 0.14));
    if (entry.interval.right - entry.interval.left <= curbWidth + EPSILON) return [];

    const leftBase = localRoofTopElevation(roofSystem, roofGeometry, sectionCut, entry.interval.left, topElevation);
    const rightBase = localRoofTopElevation(roofSystem, roofGeometry, sectionCut, entry.interval.right, topElevation);

    return [
      createSceneRect(
        `roof-opening-curb-left-${entry.opening.id}`,
        'wall',
        entry.renderMode,
        {
          left: entry.interval.left,
          right: entry.interval.left + curbWidth,
        },
        leftBase,
        leftBase + curbHeight,
        entry.depth,
        entry.opening.id,
      ),
      createSceneRect(
        `roof-opening-curb-right-${entry.opening.id}`,
        'wall',
        entry.renderMode,
        {
          left: entry.interval.right - curbWidth,
          right: entry.interval.right,
        },
        rightBase,
        rightBase + curbHeight,
        entry.depth,
        entry.opening.id,
      ),
    ].filter(Boolean);
  });
}

export function buildRoofSectionElements(roofSystem, sectionCut) {
  if (!roofSystem || !sectionCut || (roofSystem.boundaryPolygon || []).length < 3) {
    return {
      rectElements: [],
      polygonElements: [],
      stairElements: [],
      diagnostics: createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0),
    };
  }

  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const slabCutInterval = polygonCutInterval(sectionCut, roofSystem.boundaryPolygon || []);
  const slabMode = slabCutInterval ? 'cut' : 'projection';
  const openingEntries = (roofSystem.roofOpenings || [])
    .map((opening) => {
      const cutInterval = polygonCutInterval(sectionCut, opening.boundaryPoints || []);
      const projection = polygonProjectionInfo(sectionCut, opening.boundaryPoints || [], sectionCut.depth);
      const interval = slabMode === 'cut' ? cutInterval : projection?.interval || cutInterval;
      if (!interval) return null;

      return {
        opening,
        interval,
        renderMode: cutInterval ? 'cut' : 'projection',
        depth: cutInterval ? 0 : (projection?.depth ?? 0),
      };
    })
    .filter(Boolean);

  const baseElevation = roofSystem.baseElevation ?? 0;
  const topElevation = baseElevation + (roofSystem.slabThickness ?? 0);
  const { rectElements, polygonElements } = buildRoofSectionSurfaces(roofSystem, roofGeometry, sectionCut);

  for (const parapet of roofSystem.parapets || []) {
    const renderData = getParapetRenderData(parapet, roofSystem);
    if (!renderData?.outline?.length) continue;

    const cutInterval = polygonCutInterval(sectionCut, renderData.outline);
    const projection = polygonProjectionInfo(sectionCut, renderData.outline, sectionCut.depth);
    const interval = cutInterval || projection?.interval;
    if (!interval) continue;

    rectElements.push(
      createSceneRect(
        `roof-parapet-${parapet.id}`,
        'wall',
        cutInterval ? 'cut' : 'projection',
        interval,
        (roofSystem.roofType || 'flat') === 'flat'
          ? topElevation
          : roofGeometry.getSurfaceElevation(midpoint(renderData.startPoint, renderData.endPoint), 'top'),
        ((roofSystem.roofType || 'flat') === 'flat'
          ? topElevation
          : roofGeometry.getSurfaceElevation(midpoint(renderData.startPoint, renderData.endPoint), 'top')) +
          (parapet.height ?? 0),
        cutInterval ? 0 : (projection?.depth ?? 0),
        parapet.id,
      ),
    );
  }

  for (const drain of roofSystem.drains || []) {
    const projected = projectPointToSectionCut(sectionCut, drain.position);
    if (projected.offset < -EPSILON || projected.offset > sectionCut.depth + EPSILON) continue;

    const halfWidth = Math.max(40, (drain.diameter ?? 120) / 2);
    const drainBottom =
      (roofSystem.roofType || 'flat') === 'flat'
        ? baseElevation
        : roofGeometry.getSurfaceElevation(drain.position, 'bottom');
    const drainTop =
      (roofSystem.roofType || 'flat') === 'flat'
        ? topElevation
        : roofGeometry.getSurfaceElevation(drain.position, 'top');

    rectElements.push(
      createSceneRect(
        `roof-drain-${drain.id}`,
        'column',
        Math.abs(projected.offset) < EPSILON ? 'cut' : 'projection',
        {
          left: clamp(projected.along - halfWidth, 0, sectionCutLength(sectionCut)),
          right: clamp(projected.along + halfWidth, 0, sectionCutLength(sectionCut)),
        },
        drainBottom,
        drainTop,
        Math.max(0, projected.offset),
        drain.id,
      ),
    );
  }

  const builtRectElements = [
    ...rectElements,
    ...buildOpeningCurbElements(openingEntries, roofSystem, roofGeometry, sectionCut, topElevation),
  ].filter(Boolean);
  const builtPolygonElements = polygonElements.filter(Boolean);
  const elementCount = builtRectElements.length + builtPolygonElements.length;

  return {
    rectElements: builtRectElements,
    polygonElements: builtPolygonElements,
    stairElements: [],
    diagnostics:
      elementCount > 0
        ? createDiagnostics(true, SECTION_VISIBILITY_REASONS.OK, elementCount)
        : summarizePolygonSectionVisibility(sectionCut, roofSystem.boundaryPolygon || [], sectionCut.depth),
  };
}
