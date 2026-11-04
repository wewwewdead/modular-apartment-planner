import { projectElevationDepth, projectElevationEdge, projectElevationHorizontal } from '@/elevations/projection';
import { buildRoofEdgeKitLayout } from '@/roof/roofEdgeKit';
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
  return sorted.filter((value, index) => index === 0 || Math.abs(value - sorted[index - 1]) > 1e-4);
}

function interpolatePoint(start, end, t) {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
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
    const cross = dx1 * dz2 - dz1 * dx2;

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
    polygons.flatMap((polygon) => polygon.map((point) => projectHorizontal(view, point))),
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
    .filter((slice) => slice && slice.top - slice.bottom > EPSILON);

  if (slices.length < 2) return null;

  const upperProfile = simplifyProfile(slices.map((slice) => ({ x: slice.horizontal, z: slice.top })));
  const lowerProfile = simplifyProfile(slices.map((slice) => ({ x: slice.horizontal, z: slice.bottom })));
  const polygonPoints = [...upperProfile, ...[...lowerProfile].reverse()];

  if (polygonPoints.length < 3) return null;

  return {
    points: polygonPoints,
    depth: average(slices.map((slice) => slice.depth)),
    topProfile: upperProfile,
    bottomProfile: lowerProfile,
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

function createSceneLine(id, category, style, start, end, depth, sourceId) {
  if (!start || !end) return null;
  if (Math.hypot((end.x ?? 0) - (start.x ?? 0), (end.z ?? 0) - (start.z ?? 0)) <= EPSILON) {
    return null;
  }

  return {
    id,
    category,
    style,
    start,
    end,
    depth,
    sourceId,
  };
}

function createSceneLinesFromProfile(idPrefix, category, style, points = [], depth = 0, sourceId) {
  const lines = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const line = createSceneLine(`${idPrefix}-${index + 1}`, category, style, start, end, depth, sourceId);
    if (line) lines.push(line);
  }

  return lines;
}

function createProjectedRoofLine(id, style, pointA, pointB, view, roofGeometry, sourceId) {
  if (!pointA || !pointB) return null;

  return createSceneLine(
    id,
    'roofSystem',
    style,
    {
      x: projectHorizontal(view, pointA),
      z: roofGeometry.getSurfaceElevation(pointA, 'top'),
    },
    {
      x: projectHorizontal(view, pointB),
      z: roofGeometry.getSurfaceElevation(pointB, 'top'),
    },
    average([projectDepth(view, pointA), projectDepth(view, pointB)]),
    sourceId,
  );
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
    (point) => roofGeometry.getSurfaceElevation(point, 'top'),
  );

  return createScenePolygon(
    `roof-elevation-${roofSystem.id}-${view.key}`,
    'roofSystem',
    'roof',
    silhouette,
    roofSystem.id,
  );
}

function buildRoofSilhouetteLines(roofSystem, roofGeometry, view) {
  const polygons = (roofGeometry.planes || [])
    .map((plane) => plane.outline || [])
    .filter((outline) => outline.length >= 3);
  if (!polygons.length) return [];

  const silhouette = sampleProjectedEnvelope(
    polygons,
    view,
    (point) => roofGeometry.getSurfaceElevation(point, 'bottom'),
    (point) => roofGeometry.getSurfaceElevation(point, 'top'),
  );
  if (!silhouette) return [];

  return createSceneLinesFromProfile(
    `roof-elevation-line-${roofSystem.id}-${view.key}`,
    'roofSystem',
    'roofEdge',
    silhouette.topProfile || [],
    silhouette.depth,
    roofSystem.id,
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
    (point) => roofGeometry.getSurfaceElevation(point, 'top') + (parapet.height ?? 0),
  );

  return createScenePolygon(
    `roof-parapet-elevation-${parapet.id}-${view.key}`,
    'parapet',
    'wall',
    silhouette,
    parapet.id,
  );
}

function buildRoofOpeningSilhouette(opening, roofGeometry, view) {
  const outline = opening?.boundaryPoints || [];
  if (outline.length < 3) return null;

  const curbHeight = Math.max(0, Number(opening?.curbHeight) || 0);
  const displayHeight =
    curbHeight > EPSILON
      ? curbHeight
      : isRoofAccessOpening(opening?.type) || isSkylightRoofOpening(opening?.type)
        ? 120
        : 0;
  if (displayHeight <= EPSILON) return null;

  const silhouette = sampleProjectedEnvelope(
    [outline],
    view,
    (point) => roofGeometry.getSurfaceElevation(point, 'top'),
    (point) => roofGeometry.getSurfaceElevation(point, 'top') + displayHeight,
  );

  return createScenePolygon(
    `roof-opening-elevation-${opening.id}-${view.key}`,
    'roofOpening',
    'roofOpening',
    silhouette,
    opening.id,
  );
}

function planOf(worldPoint) {
  return { x: worldPoint.x, y: worldPoint.z };
}

/**
 * Fascia and barge boards as thin filled shapes under the roof silhouette: a
 * rectangle on an eave seen face-on, a parallelogram on a rake. A board seen
 * end-on has no width to draw and is left to the silhouette.
 */
function buildTrimBoardPolygons(boards, view, roofSystem) {
  return boards
    .map((board) => {
      const along = {
        x: board.topEnd.x - board.topStart.x,
        y: board.topEnd.y - board.topStart.y,
        z: board.topEnd.z - board.topStart.z,
      };
      const length = Math.hypot(along.x, along.y, along.z) || 1;
      // The board's depth is measured square to its length within its plumb
      // plane (world up with its along-the-board part removed), the way the
      // 3D builder hangs it.
      const a = { x: along.x / length, y: along.y / length, z: along.z / length };
      const up = { x: -a.y * a.x, y: 1 - a.y * a.y, z: -a.y * a.z };
      const upLength = Math.hypot(up.x, up.y, up.z) || 1;
      const drop = (point) => ({
        x: point.x - (up.x / upLength) * board.depth,
        y: point.y - (up.y / upLength) * board.depth,
        z: point.z - (up.z / upLength) * board.depth,
      });
      const edge = projectElevationEdge(view, planOf(board.topStart), planOf(board.topEnd));
      if (!edge || edge.right - edge.left < 1) return null;
      const corners = [board.topStart, board.topEnd, drop(board.topEnd), drop(board.topStart)];
      return {
        id: `roof-trim-elevation-${board.id}-${view.key}`,
        category: 'roofSystem',
        style: 'roofFascia',
        points: corners.map((point) => ({ x: projectHorizontal(view, planOf(point)), z: point.y })),
        depth: edge.depth,
        depthSlope: edge.depthSlope,
        depthIntercept: edge.depthIntercept,
        sourceId: roofSystem.id,
      };
    })
    .filter(Boolean);
}

/** Gutters as a line pair (top and sole); seen end-on, the gutter's own profile box. */
function buildGutterElements(gutters, view, roofSystem) {
  const lines = [];
  const polygons = [];
  for (const gutter of gutters) {
    const startPlan = planOf(gutter.start);
    const endPlan = planOf(gutter.end);
    const x1 = projectHorizontal(view, startPlan);
    const x2 = projectHorizontal(view, endPlan);
    const depth = average([projectDepth(view, startPlan), projectDepth(view, endPlan)]);
    if (Math.abs(x2 - x1) >= 1) {
      for (const [key, z] of [
        ['top', gutter.top],
        ['sole', gutter.bottom],
      ]) {
        const line = createSceneLine(
          `roof-gutter-elevation-${gutter.id}-${key}-${view.key}`,
          'roofSystem',
          'roofGutter',
          { x: x1, z },
          { x: x2, z },
          depth,
          roofSystem.id,
        );
        if (line) lines.push(line);
      }
      continue;
    }
    const half = gutter.width / 2;
    polygons.push({
      id: `roof-gutter-elevation-${gutter.id}-end-${view.key}`,
      category: 'roofSystem',
      style: 'roofGutter',
      points: [
        { x: x1 - half, z: gutter.top },
        { x: x1 + half, z: gutter.top },
        { x: x1 + half, z: gutter.bottom },
        { x: x1 - half, z: gutter.bottom },
      ],
      depth: Math.min(projectDepth(view, startPlan), projectDepth(view, endPlan)),
      sourceId: roofSystem.id,
    });
  }
  return { lines, polygons };
}

/** Downpipes as vertical double lines, gutter sole to just above the ground floor. */
function buildDownpipeLines(downpipes, view, roofSystem) {
  return downpipes.flatMap((pipe) => {
    const x = projectHorizontal(view, pipe.position);
    const depth = projectDepth(view, pipe.position);
    return [-1, 1]
      .map((side) =>
        createSceneLine(
          `roof-downpipe-elevation-${pipe.id}-${side < 0 ? 'a' : 'b'}-${view.key}`,
          'roofSystem',
          'roofGutter',
          { x: x + (side * pipe.diameter) / 2, z: pipe.top },
          { x: x + (side * pipe.diameter) / 2, z: pipe.bottom },
          depth,
          roofSystem.id,
        ),
      )
      .filter(Boolean);
  });
}

/**
 * `context` is the edge kit's view of the world outside the roof
 * (`resolveRoofEdgeKitContext`); without it the downpipes, which need to know
 * where the ground floor is, are left out.
 */
export function buildRoofElevationElements(roofSystem, view, context = null) {
  if (!roofSystem || (roofSystem.boundaryPolygon || []).length < 3 || !view) {
    return {
      elements: [],
      polygonElements: [],
      lineElements: [],
    };
  }

  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const roofPolygon = buildRoofSilhouettePolygon(roofSystem, roofGeometry, view);
  const roofSilhouetteLines = buildRoofSilhouetteLines(roofSystem, roofGeometry, view);
  const parapetPolygons = (roofSystem.parapets || [])
    .map((parapet) => buildParapetSilhouette(parapet, roofGeometry, roofSystem, view))
    .filter(Boolean);
  const roofOpeningPolygons = (roofSystem.roofOpenings || [])
    .map((opening) => buildRoofOpeningSilhouette(opening, roofGeometry, view))
    .filter(Boolean);
  const roofRelationshipLines = [
    ...(roofGeometry.ridges || []).map((ridge) =>
      createProjectedRoofLine(
        `roof-ridge-elevation-${ridge.id}-${view.key}`,
        'roofRidge',
        ridge.startPoint,
        ridge.endPoint,
        view,
        roofGeometry,
        roofSystem.id,
      ),
    ),
    ...(roofGeometry.hips || []).map((hip) =>
      createProjectedRoofLine(
        `roof-hip-elevation-${hip.id}-${view.key}`,
        'roofHip',
        hip.startPoint,
        hip.endPoint,
        view,
        roofGeometry,
        roofSystem.id,
      ),
    ),
    ...(roofGeometry.valleys || []).map((valley) =>
      createProjectedRoofLine(
        `roof-valley-elevation-${valley.id}-${view.key}`,
        'roofValley',
        valley.startPoint,
        valley.endPoint,
        view,
        roofGeometry,
        roofSystem.id,
      ),
    ),
  ].filter(Boolean);

  const kit = buildRoofEdgeKitLayout(roofSystem, roofGeometry, context || {});
  const trimPolygons = buildTrimBoardPolygons([...kit.fascias, ...kit.barges], view, roofSystem);
  const gutterElements = buildGutterElements(kit.gutters, view, roofSystem);
  const downpipeLines = buildDownpipeLines(kit.downpipes, view, roofSystem);

  return {
    elements: [],
    polygonElements: [
      roofPolygon,
      ...parapetPolygons,
      ...roofOpeningPolygons,
      ...trimPolygons,
      ...gutterElements.polygons,
    ].filter(Boolean),
    lineElements: [...roofSilhouetteLines, ...roofRelationshipLines, ...gutterElements.lines, ...downpipeLines],
  };
}
