import { distance } from '@/geometry/point';
import { columnCenter } from '@/geometry/columnGeometry';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { resolveWallEndpoints } from '@/geometry/wallColumnGeometry';

/**
 * Snapping to the floor BELOW — a reference-only channel.
 *
 * Tracing an upper floor over the ghost underlay, or pushing a plate edge out to
 * a set distance past the wall line beneath it, needs the structure below to be
 * catchable. It cannot go through `snapWallEndpoint`, though: that returns an
 * `attachment` carrying a `columnId`, and a wall on THIS floor bound to a column
 * that only exists on the floor below resolves to nothing —
 * `resolveWallEndpoints` would silently drop the endpoint. So the floor below is
 * never fed to the object snapper. It gets this separate channel instead, which
 * yields bare `{ x, y }` coordinates and NOTHING else. There is no path from a
 * reference hit to an attachment field.
 *
 * The rule for when it runs lives in `resolveReferenceSnapGeometry`: only while
 * the ghost is actually on screen. A layer you cannot see must never tug your
 * cursor.
 */

const EPSILON = 1e-6;

// Two lines within 3 degrees of each other are the same line as far as a drag is
// concerned: nobody pushes a plate edge out to land parallel-ish with the wall
// below. Wider than this and a wall running diagonally across the plan starts
// capturing edges it has nothing to do with.
const PARALLEL_TOLERANCE_DEGREES = 3;
const PARALLEL_COS_MINIMUM = Math.cos((PARALLEL_TOLERANCE_DEGREES * Math.PI) / 180);

// How far below a plate edge a support line may sit and still be the thing the
// cantilever is measured from. Beyond about three metres the line is not what
// anyone means by "the beam under this edge" — it is a different bay.
const SUPPORT_LINE_MAX_DISTANCE_MM = 3000;

const EMPTY_GEOMETRY = Object.freeze({ points: Object.freeze([]), segments: Object.freeze([]) });

// Keyed on the floor object itself: the below-floor memo in SvgCanvas only mints
// a new object when that floor is actually edited, so this rebuilds once per
// edit rather than once per pointer event.
const geometryCache = new WeakMap();

function isFinitePoint(point) {
  return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function buildGeometry(floor) {
  const columns = floor.columns || [];
  const points = [];
  const segments = [];

  for (const wall of floor.walls || []) {
    // Resolved rather than raw so the reference lines sit where the ghost is
    // DRAWN: an attached endpoint follows its column, and the underlay renders
    // the same resolved geometry.
    const { start, end } = resolveWallEndpoints(wall, columns);
    if (!isFinitePoint(start) || !isFinitePoint(end)) continue;

    points.push({ x: start.x, y: start.y });
    points.push({ x: end.x, y: end.y });

    // A zero-length wall is two coincident points and no line to project onto.
    if (distance(start, end) > EPSILON) {
      segments.push({ start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } });
    }
  }

  for (const column of columns) {
    const center = columnCenter(column);
    if (!isFinitePoint(center)) continue;
    points.push({ x: center.x, y: center.y });
  }

  return { points, segments };
}

/**
 * The snappable skeleton of the floor below: wall endpoints and column centres
 * as points, wall centrelines as segments.
 *
 * Centrelines, not wall faces — a centreline is what the plan is dimensioned to
 * and what an upper wall would sit on. Faces can follow if v1 proves it needs
 * them.
 */
export function buildReferenceSnapGeometry(floorBelow) {
  if (!floorBelow) return EMPTY_GEOMETRY;

  const cached = geometryCache.get(floorBelow);
  if (cached) return cached;

  const built = buildGeometry(floorBelow);
  geometryCache.set(floorBelow, built);
  return built;
}

/**
 * The one place that decides whether reference snapping runs at all.
 *
 * Snapping off, ghost hidden, or no floor below means no channel — returning
 * null rather than empty geometry so callers can skip the work entirely.
 */
export function resolveReferenceSnapGeometry({ floorBelow, showFloorBelowUnderlay, snapEnabled } = {}) {
  if (!snapEnabled || !showFloorBelowUnderlay || !floorBelow) return null;

  const geometry = buildReferenceSnapGeometry(floorBelow);
  if (!geometry.points.length && !geometry.segments.length) return null;
  return geometry;
}

/**
 * Perpendicular projection of `point` onto the segment, or null when the foot of
 * the perpendicular falls off either end. Unclamped on purpose: a cursor past
 * the end of a wall below is not near that wall, and clamping would quietly turn
 * every segment into an extra endpoint magnet.
 */
function projectOntoSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return null;

  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  if (t < 0 || t > 1) return null;

  return { x: start.x + dx * t, y: start.y + dy * t };
}

/**
 * Nearest reference hit to the cursor, or null.
 *
 * Points beat segments outright, not by distance: a wall endpoint below is a
 * specific place a user aims at, while its centreline is a whole line of
 * near-equivalent ones. Losing the corner to the line running through it is the
 * classic CAD annoyance.
 *
 * The result is `{ x, y, kind }` and never carries an id — see the module note.
 */
export function snapPointToReference(modelPos, refGeometry, toleranceModel) {
  if (!isFinitePoint(modelPos) || !refGeometry || !(toleranceModel > 0)) return null;

  let bestPoint = null;
  let bestPointDistance = Infinity;
  for (const point of refGeometry.points || []) {
    const candidate = distance(modelPos, point);
    if (candidate > toleranceModel || candidate >= bestPointDistance) continue;
    bestPoint = point;
    bestPointDistance = candidate;
  }
  if (bestPoint) return { x: bestPoint.x, y: bestPoint.y, kind: 'reference-point' };

  let bestProjection = null;
  let bestProjectionDistance = Infinity;
  for (const segment of refGeometry.segments || []) {
    const projection = projectOntoSegment(modelPos, segment.start, segment.end);
    if (!projection) continue;
    const candidate = distance(modelPos, projection);
    if (candidate > toleranceModel || candidate >= bestProjectionDistance) continue;
    bestProjection = projection;
    bestProjectionDistance = candidate;
  }
  if (bestProjection) return { x: bestProjection.x, y: bestProjection.y, kind: 'reference-line' };

  return null;
}

/**
 * The scalar offset that would land a dragged plate edge collinear with a wall
 * line below, or null when no such line is near.
 *
 * This is what makes "push the edge out until it clicks onto the wall beneath"
 * work. Only lines roughly PARALLEL to the edge qualify (within
 * PARALLEL_TOLERANCE_DEGREES): a perpendicular wall crosses the edge's travel at
 * one point and says nothing about where the edge should stop, so snapping to it
 * would be arbitrary.
 *
 * `originEdge` is the edge as it stood at mousedown — the same snapshot the drag
 * measures its cumulative offset from — and `normal` its outward unit normal.
 * Returns a NUMBER (which may legitimately be 0) or null, so callers must test
 * `!== null` rather than truthiness.
 */
export function snapOffsetToReference(originEdge, normal, rawOffset, refGeometry, toleranceModel) {
  if (!originEdge || !isFinitePoint(originEdge.start) || !isFinitePoint(originEdge.end)) return null;
  if (!isFinitePoint(normal) || !Number.isFinite(rawOffset)) return null;
  if (!refGeometry || !(toleranceModel > 0)) return null;

  const edgeDx = originEdge.end.x - originEdge.start.x;
  const edgeDy = originEdge.end.y - originEdge.start.y;
  const edgeLength = Math.hypot(edgeDx, edgeDy);
  if (edgeLength < EPSILON) return null;

  const edgeDirX = edgeDx / edgeLength;
  const edgeDirY = edgeDy / edgeLength;

  let bestOffset = null;
  let bestError = Infinity;

  for (const segment of refGeometry.segments || []) {
    const refDx = segment.end.x - segment.start.x;
    const refDy = segment.end.y - segment.start.y;
    const refLength = Math.hypot(refDx, refDy);
    if (refLength < EPSILON) continue;

    // Absolute value: a wall drawn right-to-left is the same line.
    const alignment = Math.abs((refDx / refLength) * edgeDirX + (refDy / refLength) * edgeDirY);
    if (alignment < PARALLEL_COS_MINIMUM) continue;

    // The normal is perpendicular to the edge, so this measures the gap between
    // the two parallel lines — any point on the reference line gives the same
    // answer, and its midpoint is the stable one to take.
    const midX = (segment.start.x + segment.end.x) / 2;
    const midY = (segment.start.y + segment.end.y) / 2;
    const offset = (midX - originEdge.start.x) * normal.x + (midY - originEdge.start.y) * normal.y;

    const error = Math.abs(offset - rawOffset);
    if (error > toleranceModel || error >= bestError) continue;
    bestOffset = offset;
    bestError = error;
  }

  return bestOffset;
}

/**
 * The support line a cantilever should be measured from: the wall centreline or
 * beam axis on the floor below that runs parallel to a plate edge.
 *
 * "600 past the beam" is how a cantilever is actually specified — the number is
 * a reach beyond the last thing holding the slab up, not a distance the edge
 * happens to travel. So the tool has to find that line before it can honour the
 * number, and this is where it looks.
 *
 * BEAMS as well as walls, which is what separates this from
 * `buildReferenceSnapGeometry`: that geometry exists to catch a cursor, and a
 * beam axis is a poor cursor target sitting under the plan. A beam is, however,
 * the most common thing a cantilever projects past, so it belongs here.
 *
 * Only lines roughly PARALLEL to the edge qualify, for the reason spelled out
 * on `snapOffsetToReference`: a crossing line says nothing about where the edge
 * should end up. Among those, the NEAREST wins — measured perpendicular to the
 * edge, which is the direction the plate will move.
 *
 * Returns `{ kind, offsetMm }` where `offsetMm` is SIGNED along the outward
 * normal: negative for a line inside the plate (the usual case — the beam is
 * under the floor), positive for one already out past the edge. Adding the
 * wanted reach to it therefore lands the edge that far outside the support line
 * either way. No entity id ever comes back; see the module note.
 */
export function findParallelSupportLine(originEdge, outwardNormal, floorBelow, options = {}) {
  if (!floorBelow) return null;
  if (!originEdge || !isFinitePoint(originEdge.start) || !isFinitePoint(originEdge.end)) return null;
  if (!isFinitePoint(outwardNormal)) return null;

  const maxDistanceMm = options.maxDistanceMm ?? SUPPORT_LINE_MAX_DISTANCE_MM;
  const maxSkewDegrees = options.maxSkewDegrees ?? PARALLEL_TOLERANCE_DEGREES;
  const cosMinimum = Math.cos((maxSkewDegrees * Math.PI) / 180);

  const edgeDx = originEdge.end.x - originEdge.start.x;
  const edgeDy = originEdge.end.y - originEdge.start.y;
  const edgeLength = Math.hypot(edgeDx, edgeDy);
  if (edgeLength < EPSILON) return null;

  const edgeDirX = edgeDx / edgeLength;
  const edgeDirY = edgeDy / edgeLength;

  let best = null;

  for (const line of collectSupportLines(floorBelow)) {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const length = Math.hypot(dx, dy);
    if (length < EPSILON) continue;

    // Absolute value: a wall drawn right-to-left is the same line.
    const alignment = Math.abs((dx / length) * edgeDirX + (dy / length) * edgeDirY);
    if (alignment < cosMinimum) continue;

    // Perpendicular gap between two parallel lines — any point on the reference
    // gives the same answer, and its midpoint is the stable one to take.
    const midX = (line.start.x + line.end.x) / 2;
    const midY = (line.start.y + line.end.y) / 2;
    const offsetMm = (midX - originEdge.start.x) * outwardNormal.x + (midY - originEdge.start.y) * outwardNormal.y;
    if (Math.abs(offsetMm) > maxDistanceMm) continue;
    if (best && Math.abs(offsetMm) >= Math.abs(best.offsetMm)) continue;

    best = { kind: line.kind, offsetMm };
  }

  return best;
}

/**
 * Every line on the floor below a cantilever could be measured from: wall
 * centrelines and beam axes, as bare coordinates.
 *
 * Beam axes come off `getBeamRenderData` so a beam anchored on columns is read
 * where it is DRAWN. A beam whose refs no longer resolve — a deleted column, a
 * pair of refs collapsed onto one point — has no axis to offer and is skipped
 * rather than guessed at.
 */
function collectSupportLines(floorBelow) {
  const columns = floorBelow.columns || [];
  const lines = [];

  for (const wall of floorBelow.walls || []) {
    const { start, end } = resolveWallEndpoints(wall, columns);
    if (!isFinitePoint(start) || !isFinitePoint(end)) continue;
    if (distance(start, end) <= EPSILON) continue;
    lines.push({ kind: 'wall', start, end });
  }

  for (const beam of floorBelow.beams || []) {
    const render = getBeamRenderData(beam, columns);
    if (!render) continue;
    if (!isFinitePoint(render.start) || !isFinitePoint(render.end)) continue;
    if (distance(render.start, render.end) <= EPSILON) continue;
    lines.push({ kind: 'beam', start: render.start, end: render.end });
  }

  return lines;
}
