import { pointInPolygon } from '@/geometry/polygon';
import { subtractPolygons } from '@/geometry/polygonBoolean';

const EPSILON = 1e-6;
const sceneCache = new WeakMap();

export function elevationElementOutline(element) {
  if (element.points) return element.points.map(({ x, z }) => ({ x, y: -z }));
  return [
    { x: element.left, y: -element.top },
    { x: element.right, y: -element.top },
    { x: element.right, y: -element.bottom },
    { x: element.left, y: -element.bottom },
  ];
}

function depthAt(element, point) {
  return (
    (element.depthSlope || 0) * point.x -
    (element.depthSlopeZ || 0) * point.y +
    (element.depthIntercept ?? element.depth ?? 0)
  );
}

function bounds(points) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

function overlaps(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function surfacePriority(element) {
  const cutPriority = element.renderMode === 'cut' ? 10 : 0;
  if (element.shape === 'line') return cutPriority + 2;
  if (element.category === 'window' || element.category === 'door') return cutPriority + 1;
  return cutPriority;
}

// Clip an occluder to the half-plane where it is actually nearer. Sorting by
// an object's average depth alone cannot resolve intersecting projections.
function nearerPart(subject, occluder) {
  const points = occluder.outline;
  const distances = points.map((p) => depthAt(subject, p) - depthAt(occluder, p));
  if (distances.every((d) => Math.abs(d) <= EPSILON)) {
    const priority = surfacePriority(occluder) - surfacePriority(subject);
    if (priority !== 0) return priority > 0 ? points : [];
    return occluder.order > subject.order ? points : [];
  }
  const result = [];
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    const a = points[i];
    const b = points[j];
    const da = distances[i];
    const db = distances[j];
    if (da >= 0) result.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return result;
}

function visibleLineSegments(element, cuts) {
  const a = { x: element.start.x, y: -element.start.z };
  const b = { x: element.end.x, y: -element.end.z };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const parameters = [0, 1];
  for (const cut of cuts) {
    for (let i = 0; i < cut.length; i += 1) {
      const c = cut[i];
      const d = cut[(i + 1) % cut.length];
      const ex = d.x - c.x;
      const ey = d.y - c.y;
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < EPSILON) continue;
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / det;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / det;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) parameters.push(t);
    }
  }
  parameters.sort((x, y) => x - y);
  const segments = [];
  for (let i = 1; i < parameters.length; i += 1) {
    const from = parameters[i - 1];
    const to = parameters[i];
    if (to - from < EPSILON) continue;
    const mid = (from + to) / 2;
    if (cuts.some((cut) => pointInPolygon({ x: a.x + dx * mid, y: a.y + dy * mid }, cut))) continue;
    segments.push([
      { x: a.x + dx * from, y: a.y + dy * from },
      { x: a.x + dx * to, y: a.y + dy * to },
    ]);
  }
  return segments;
}

export function getVisibleElevationDrawables(scene) {
  if (!scene) return [];
  if (sceneCache.has(scene)) return sceneCache.get(scene);
  const drawables = [
    ...(scene.elements || []).map((element) => ({ ...element, shape: 'rect' })),
    ...(scene.polygonElements || []).map((element) => ({ ...element, shape: 'polygon' })),
    ...(scene.lineElements || []).map((element) => ({ ...element, shape: 'line' })),
  ].map((element, order) => {
    const outline =
      element.shape === 'line'
        ? [
            { x: element.start.x, y: -element.start.z },
            { x: element.end.x, y: -element.end.z },
          ]
        : elevationElementOutline(element);
    return { ...element, order, outline, bounds: bounds(outline) };
  });
  const opaque = drawables.filter(
    (element) => element.shape !== 'line' && !['railingGlass', 'railingHandrailBand'].includes(element.style),
  );
  const result = drawables
    .flatMap((element) => {
      const cuts = opaque
        .filter((other) => other !== element && overlaps(element.bounds, other.bounds))
        .map((other) => nearerPart(element, other))
        .filter((cut) => cut.length >= 3);
      if (element.shape === 'line') {
        const segments = visibleLineSegments(element, cuts);
        return segments.length ? [{ ...element, segments }] : [];
      }
      const visibleRegions = subtractPolygons(element.outline, cuts);
      return visibleRegions.length ? [{ ...element, visibleRegions }] : [];
    })
    .sort((a, b) => b.depth - a.depth || a.order - b.order);
  sceneCache.set(scene, result);
  return result;
}

export function elevationRegionContainsPoint(element, point) {
  return (element.visibleRegions || []).some(
    ({ outline, holes }) => pointInPolygon(point, outline) && !holes.some((hole) => pointInPolygon(point, hole)),
  );
}
