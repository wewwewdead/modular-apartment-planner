import { segmentIntersection } from './line';
import { midpoint } from './point';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';
import { pointInPolygon } from './polygon';
import { projectPointToSectionCut, sectionCutLength } from './sectionCutGeometry';
import { getParapetRenderData } from './roofPlanGeometry';

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

function subtractIntervals(baseInterval, openingIntervals = []) {
  if (!baseInterval) return [];
  const cuts = openingIntervals
    .filter(Boolean)
    .sort((a, b) => a.left - b.left);

  const segments = [];
  let currentLeft = baseInterval.left;

  for (const interval of cuts) {
    if (interval.right <= currentLeft + EPSILON) continue;
    if (interval.left > baseInterval.right - EPSILON) break;

    const cutLeft = clamp(interval.left, baseInterval.left, baseInterval.right);
    const cutRight = clamp(interval.right, baseInterval.left, baseInterval.right);
    if (cutLeft - currentLeft > EPSILON) {
      segments.push({ left: currentLeft, right: cutLeft });
    }
    currentLeft = Math.max(currentLeft, cutRight);
  }

  if (baseInterval.right - currentLeft > EPSILON) {
    segments.push({ left: currentLeft, right: baseInterval.right });
  }

  return segments.filter((segment) => segment.right - segment.left > EPSILON);
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

function createScenePolygon(id, category, renderMode, points, depth, sourceId) {
  if (!points || points.length < 3) return null;
  return {
    id,
    category,
    renderMode,
    points,
    depth,
    sourceId,
  };
}

function pointAtAlong(sectionCut, along) {
  const length = sectionCutLength(sectionCut) || 1;
  const t = clamp(along / length, 0, 1);
  return {
    x: sectionCut.startPoint.x + ((sectionCut.endPoint.x - sectionCut.startPoint.x) * t),
    y: sectionCut.startPoint.y + ((sectionCut.endPoint.y - sectionCut.startPoint.y) * t),
  };
}

function createSlopedSectionPolygon(id, roofGeometry, sectionCut, plane, interval, renderMode, depth, sourceId) {
  if (!interval) return null;

  const leftPoint = pointAtAlong(sectionCut, interval.left);
  const rightPoint = pointAtAlong(sectionCut, interval.right);
  const getPlaneElevation = plane?.getSurfaceElevation || roofGeometry.getSurfaceElevation;
  const leftTop = getPlaneElevation(leftPoint, 'top');
  const rightTop = getPlaneElevation(rightPoint, 'top');
  const leftBottom = getPlaneElevation(leftPoint, 'bottom');
  const rightBottom = getPlaneElevation(rightPoint, 'bottom');

  return createScenePolygon(
    id,
    'slab',
    renderMode,
    [
      { x: interval.left, z: leftTop },
      { x: interval.right, z: rightTop },
      { x: interval.right, z: rightBottom },
      { x: interval.left, z: leftBottom },
    ],
    depth,
    sourceId || plane.id
  );
}

function localRoofTopElevation(roofSystem, roofGeometry, sectionCut, along, fallbackTopElevation) {
  if ((roofSystem.roofType || 'flat') === 'flat') return fallbackTopElevation;
  return roofGeometry.getSurfaceElevation(pointAtAlong(sectionCut, along), 'top');
}

function buildOpeningCurbElements(openingEntries, roofSystem, roofGeometry, sectionCut, topElevation) {
  return openingEntries.flatMap((entry) => {
    const curbHeight = Math.max(0, Number(entry.opening?.curbHeight) || 0);
    if (!entry.interval || curbHeight <= EPSILON) return [];

    const curbWidth = Math.min(120, Math.max(40, (entry.interval.right - entry.interval.left) * 0.14));
    if ((entry.interval.right - entry.interval.left) <= curbWidth + EPSILON) return [];

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
        entry.opening.id
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
        entry.opening.id
      ),
    ].filter(Boolean);
  });
}

export function buildRoofSectionElements(roofSystem, sectionCut) {
  if (!roofSystem || !sectionCut || (roofSystem.boundaryPolygon || []).length < 3) {
    return { rectElements: [], polygonElements: [], stairElements: [] };
  }

  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const slabCutInterval = polygonCutInterval(sectionCut, roofSystem.boundaryPolygon || []);
  const slabProjection = polygonProjectionInfo(sectionCut, roofSystem.boundaryPolygon || [], sectionCut.depth);
  const slabInterval = slabCutInterval || slabProjection?.interval;
  const slabMode = slabCutInterval ? 'cut' : 'projection';
  const openingEntries = (roofSystem.roofOpenings || [])
    .map((opening) => {
      const cutInterval = polygonCutInterval(sectionCut, opening.boundaryPoints || []);
      const projection = polygonProjectionInfo(sectionCut, opening.boundaryPoints || [], sectionCut.depth);
      const interval = slabMode === 'cut'
        ? cutInterval
        : (projection?.interval || cutInterval);
      if (!interval) return null;

      return {
        opening,
        interval,
        renderMode: cutInterval ? 'cut' : 'projection',
        depth: cutInterval ? 0 : (projection?.depth ?? 0),
      };
    })
    .filter(Boolean);

  const slabSegments = subtractIntervals(slabInterval, openingEntries.map((entry) => entry.interval));
  const slabDepth = slabMode === 'cut' ? 0 : (slabProjection?.depth ?? 0);
  const baseElevation = roofSystem.baseElevation ?? 0;
  const topElevation = baseElevation + (roofSystem.slabThickness ?? 0);

  const rectElements = [];
  const polygonElements = [];

  if ((roofSystem.roofType || 'flat') === 'flat') {
    rectElements.push(...slabSegments.map((segment, index) => createSceneRect(
      `roof-slab-${roofSystem.id}-${index}`,
      'slab',
      slabMode,
      segment,
      baseElevation,
      topElevation,
      slabDepth,
      roofSystem.id
    )));
  } else {
    for (const plane of roofGeometry.planes || []) {
      const cutInterval = polygonCutInterval(sectionCut, plane.outline || []);
      const projection = polygonProjectionInfo(sectionCut, plane.outline || [], sectionCut.depth);
      const interval = cutInterval || projection?.interval;
      if (!interval) continue;

      polygonElements.push(createSlopedSectionPolygon(
        `roof-plane-${plane.id}`,
        roofGeometry,
        sectionCut,
        plane,
        interval,
        cutInterval ? 'cut' : 'projection',
        cutInterval ? 0 : (projection?.depth ?? 0),
        roofSystem.id
      ));
    }
  }

  for (const parapet of roofSystem.parapets || []) {
    const renderData = getParapetRenderData(parapet, roofSystem);
    if (!renderData?.outline?.length) continue;

    const cutInterval = polygonCutInterval(sectionCut, renderData.outline);
    const projection = polygonProjectionInfo(sectionCut, renderData.outline, sectionCut.depth);
    const interval = cutInterval || projection?.interval;
    if (!interval) continue;

    rectElements.push(createSceneRect(
      `roof-parapet-${parapet.id}`,
      'wall',
      cutInterval ? 'cut' : 'projection',
      interval,
      (roofSystem.roofType || 'flat') === 'flat'
        ? topElevation
        : roofGeometry.getSurfaceElevation(midpoint(renderData.startPoint, renderData.endPoint), 'top'),
      ((roofSystem.roofType || 'flat') === 'flat'
        ? topElevation
        : roofGeometry.getSurfaceElevation(midpoint(renderData.startPoint, renderData.endPoint), 'top')) + (parapet.height ?? 0),
      cutInterval ? 0 : (projection?.depth ?? 0),
      parapet.id
    ));
  }

  for (const drain of roofSystem.drains || []) {
    const projected = projectPointToSectionCut(sectionCut, drain.position);
    if (projected.offset < -EPSILON || projected.offset > sectionCut.depth + EPSILON) continue;

    const halfWidth = Math.max(40, (drain.diameter ?? 120) / 2);
    const drainBottom = (roofSystem.roofType || 'flat') === 'flat'
      ? baseElevation
      : roofGeometry.getSurfaceElevation(drain.position, 'bottom');
    const drainTop = (roofSystem.roofType || 'flat') === 'flat'
      ? topElevation
      : roofGeometry.getSurfaceElevation(drain.position, 'top');

    rectElements.push(createSceneRect(
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
      drain.id
    ));
  }

  return {
    rectElements: [
      ...rectElements,
      ...buildOpeningCurbElements(openingEntries, roofSystem, roofGeometry, sectionCut, topElevation),
    ].filter(Boolean),
    polygonElements: polygonElements.filter(Boolean),
    stairElements: [],
  };
}
