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

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function prepareDrawables(scene) {
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
  return { drawables, opaque };
}

// What one drawable looks like once everything nearer has been cut out of it:
// an array of zero or one entries, so the results concatenate in input order.
// Each drawable depends only on the prepared inputs, never on another
// drawable's result, which is what lets the job below stop between any two.
function resolveDrawable(element, opaque) {
  const cuts = opaque
    .filter((other) => other !== element && overlaps(element.bounds, other.bounds))
    .map((other) => nearerPart(element, other))
    // Clipping an occluder to its nearer part often moves it clear of the
    // element altogether; a cut that cannot touch the element only makes the
    // polygon sweep longer.
    .filter((cut) => cut.length >= 3 && overlaps(element.bounds, bounds(cut)));
  if (element.shape === 'line') {
    const segments = visibleLineSegments(element, cuts);
    return segments.length ? [{ ...element, segments }] : [];
  }
  const visibleRegions = subtractPolygons(element.outline, cuts);
  return visibleRegions.length ? [{ ...element, visibleRegions }] : [];
}

function sortDrawables(resolved) {
  return resolved.sort((a, b) => b.depth - a.depth || a.order - b.order);
}

/**
 * The visibility pass as a job that can stop and resume between drawables.
 *
 * `step(budgetMs)` resolves drawables until the budget is spent — always at
 * least one, so every step makes progress — and returns `{ done, resolved,
 * total }`. Once done, `result` holds the drawables and they are cached on the
 * scene, exactly as the synchronous pass caches them. Run to completion it is
 * the synchronous pass: same inputs, same order, same output.
 *
 * `cache: false` is for a caller that keys its own cache on another object
 * (the section adapter caches on the section scene, not on its adapted copy).
 */
export function createElevationVisibilityJob(scene, { cache = true } = {}) {
  const cached = scene && cache ? sceneCache.get(scene) : undefined;
  let result = !scene ? [] : cached;
  let prepared = null;
  let index = 0;
  const pieces = [];

  return {
    get result() {
      return result;
    },
    step(budgetMs = Infinity) {
      if (result) return { done: true, resolved: pieces.length, total: pieces.length };
      const deadline = now() + budgetMs;
      if (!prepared) prepared = prepareDrawables(scene);
      const { drawables, opaque } = prepared;
      while (index < drawables.length) {
        pieces.push(...resolveDrawable(drawables[index], opaque));
        index += 1;
        if (now() >= deadline) break;
      }
      if (index < drawables.length) return { done: false, resolved: index, total: drawables.length };
      result = sortDrawables(pieces);
      if (cache) sceneCache.set(scene, result);
      return { done: true, resolved: index, total: drawables.length };
    },
  };
}

/** The cached visible drawables of a scene, or undefined if the pass has not run. */
export function peekVisibleElevationDrawables(scene) {
  return scene ? sceneCache.get(scene) : [];
}

export function getVisibleElevationDrawables(scene) {
  if (!scene) return [];
  if (sceneCache.has(scene)) return sceneCache.get(scene);
  const job = createElevationVisibilityJob(scene);
  job.step(Infinity);
  return job.result;
}

export function elevationRegionContainsPoint(element, point) {
  return (element.visibleRegions || []).some(
    ({ outline, holes }) => pointInPolygon(point, outline) && !holes.some((hole) => pointInPolygon(point, hole)),
  );
}
