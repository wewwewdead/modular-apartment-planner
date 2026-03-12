import { projectElevationDepth, projectElevationHorizontal } from '@/elevations/projection';
import { isRoofAccessOpening, isSkylightRoofOpening } from '@/roof/openings';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';
import { getParapetRenderData } from './roofPlanGeometry';

const EPSILON = 1e-6;

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueSortedValues(values = []) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => (
    index === 0 || Math.abs(value - sorted[index - 1]) > 1e-4
  ));
}

function interpolatePoint(start, end, t) {
  return {
    x: start.x + ((end.x - start.x) * t),
    y: start.y + ((end.y - start.y) * t),
  };
}

function dedupePoints(points = []) {
  const unique = [];

  for (const point of points) {
    if (!unique.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) <= 1e-4)) {
      unique.push(point);
    }
  }

  return unique;
}

function simplifyProfile(points = []) {
  const deduped = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.z - point.z) > 1e-4) {
      deduped.push(point);
    }
  }

  if (deduped.length <= 2) return deduped;

  const simplified = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const dx1 = current.x - previous.x;
    const dz1 = current.z - previous.z;
    const dx2 = next.x - current.x;
    const dz2 = next.z - current.z;
    const cross = (dx1 * dz2) - (dz1 * dx2);

    if (Math.abs(cross) > 1e-4) {
      simplified.push(current);
    }
  }
  simplified.push(deduped[deduped.length - 1]);

  return simplified;
}

function projectHorizontal(view, point) {
  return projectElevationHorizontal(view, point);
}

function projectDepth(view, point) {
  return projectElevationDepth(view, point);
}

function collectSlicePoints(polygon = [], view, horizontal) {
  if (!polygon.length) return [];

  const hits = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const startHorizontal = projectHorizontal(view, start);
    const endHorizontal = projectHorizontal(view, end);
    const startOffset = startHorizontal - horizontal;
    const endOffset = endHorizontal - horizontal;

    if (Math.abs(startOffset) < EPSILON) {
      hits.push({ x: start.x, y: start.y });
    }

    if ((startOffset < -EPSILON && endOffset > EPSILON) || (startOffset > EPSILON && endOffset < -EPSILON)) {
      const denominator = endHorizontal - startHorizontal;
      if (Math.abs(denominator) < EPSILON) continue;
      const t = (horizontal - startHorizontal) / denominator;
      hits.push(interpolatePoint(start, end, t));
    }
  }

  return dedupePoints(hits);
}

function buildSampleHorizontals(points = []) {
  const critical = uniqueSortedValues(points);
  if (!critical.length) return [];

  const samples = [];
  for (let index = 0; index < critical.length; index += 1) {
    const current = critical[index];
    samples.push(current);

    const next = critical[index + 1];
    if (next != null && next - current > 1e-4) {
      samples.push((current + next) / 2);
    }
  }

  return uniqueSortedValues(samples);
}

function sampleProjectedEnvelope(polygons = [], view, getBottomAtPoint, getTopAtPoint) {
  const horizontals = buildSampleHorizontals(
    polygons.flatMap((polygon) => polygon.map((point) => projectHorizontal(view, point)))
  );

  const slices = horizontals
    .map((horizontal) => {
      const slicePoints = polygons.flatMap((polygon) => collectSlicePoints(polygon, view, horizontal));
      if (!slicePoints.length) return null;

      return {
        horizontal,
        bottom: Math.min(...slicePoints.map((point) => getBottomAtPoint(point))),
        top: Math.max(...slicePoints.map((point) => getTopAtPoint(point))),
        depth: average(slicePoints.map((point) => projectDepth(view, point))),
      };
    })
    .filter((slice) => slice && (slice.top - slice.bottom) > EPSILON);

  if (slices.length < 2) return null;

  const upperProfile = simplifyProfile(slices.map((slice) => ({ x: slice.horizontal, z: slice.top })));
  const lowerProfile = simplifyProfile(slices.map((slice) => ({ x: slice.horizontal, z: slice.bottom })));
  const polygonPoints = [
    ...upperProfile,
    ...[...lowerProfile].reverse(),
  ];

  if (polygonPoints.length < 3) return null;

  return {
    points: polygonPoints,
    depth: average(slices.map((slice) => slice.depth)),
  };
}

function createScenePolygon(id, category, style, polygon, sourceId) {
  if (!polygon?.points?.length || polygon.points.length < 3) return null;
  return {
    id,
    category,
    style,
    points: polygon.points,
    depth: polygon.depth,
    sourceId,
  };
}

function buildRoofSilhouettePolygon(roofSystem, roofGeometry, view) {
  const polygons = (roofGeometry.planes || [])
    .map((plane) => plane.outline || [])
    .filter((outline) => outline.length >= 3);
  if (!polygons.length) return null;

  const silhouette = sampleProjectedEnvelope(
    polygons,
    view,
    (point) => roofGeometry.getSurfaceElevation(point, 'bottom'),
    (point) => roofGeometry.getSurfaceElevation(point, 'top')
  );

  return createScenePolygon(
    `roof-elevation-${roofSystem.id}-${view.key}`,
    'roofSystem',
    'slab',
    silhouette,
    roofSystem.id
  );
}

function buildParapetSilhouette(parapet, roofGeometry, roofSystem, view) {
  const renderData = getParapetRenderData(parapet, roofSystem);
  const outline = renderData?.outline || [];
  if (outline.length < 3) return null;

  const silhouette = sampleProjectedEnvelope(
    [outline],
    view,
    (point) => roofGeometry.getSurfaceElevation(point, 'top'),
    (point) => roofGeometry.getSurfaceElevation(point, 'top') + (parapet.height ?? 0)
  );

  return createScenePolygon(
    `roof-parapet-elevation-${parapet.id}-${view.key}`,
    'parapet',
    'wall',
    silhouette,
    parapet.id
  );
}

function buildRoofOpeningSilhouette(opening, roofGeometry, view) {
  const outline = opening?.boundaryPoints || [];
  if (outline.length < 3) return null;

  const curbHeight = Math.max(0, Number(opening?.curbHeight) || 0);
  const displayHeight = curbHeight > EPSILON
    ? curbHeight
    : ((isRoofAccessOpening(opening?.type) || isSkylightRoofOpening(opening?.type)) ? 120 : 0);
  if (displayHeight <= EPSILON) return null;

  const silhouette = sampleProjectedEnvelope(
    [outline],
    view,
    (point) => roofGeometry.getSurfaceElevation(point, 'top'),
    (point) => roofGeometry.getSurfaceElevation(point, 'top') + displayHeight
  );

  return createScenePolygon(
    `roof-opening-elevation-${opening.id}-${view.key}`,
    'roofOpening',
    'roofOpening',
    silhouette,
    opening.id
  );
}

export function buildRoofElevationElements(roofSystem, view) {
  if (!roofSystem || (roofSystem.boundaryPolygon || []).length < 3 || !view) {
    return {
      elements: [],
      polygonElements: [],
    };
  }

  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const roofPolygon = buildRoofSilhouettePolygon(roofSystem, roofGeometry, view);
  const parapetPolygons = (roofSystem.parapets || [])
    .map((parapet) => buildParapetSilhouette(parapet, roofGeometry, roofSystem, view))
    .filter(Boolean);
  const roofOpeningPolygons = (roofSystem.roofOpenings || [])
    .map((opening) => buildRoofOpeningSilhouette(opening, roofGeometry, view))
    .filter(Boolean);

  return {
    elements: [],
    polygonElements: [roofPolygon, ...parapetPolygons, ...roofOpeningPolygons].filter(Boolean),
  };
}
