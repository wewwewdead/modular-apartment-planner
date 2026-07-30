import { ENDPOINT_MERGE_TOLERANCE, MIN_WALL_LENGTH } from './defaults';
import { distance } from '@/geometry/point';

/**
 * modelGraph — solver-free wall topology + one-hop propagation kernel.
 *
 * Junction classification (derived on demand from geometry, never stored):
 *
 *        corner (2)            T (stem interior)          star (3+)
 *      N                             │S                      \ │
 *      │                             │                        \│
 *      └────── M           ━━━━━━━━━●━━━━━ M (crossbar)   ────●──── M
 *                                                             /
 *
 * Heal rules for an edit on wall M (trim/extend only — wallIds never change,
 * so hosted openings can never be orphaned by healing):
 *  - Body TRANSLATION: corner neighbors re-intersect their line with M's new
 *    line (both the neighbor's endpoint and M's own endpoint close on the new
 *    intersection). Near-parallel/collinear neighbors (< HEAL_ANGLE threshold)
 *    have no stable intersection — they rigid-follow the shared endpoint.
 *  - ENDPOINT edit (stretch/drag): the junction point IS what the user moved —
 *    all cluster members rigid-follow it.
 *  - Star (3+ coincident endpoints): all members rigid-follow as one point.
 *  - T junctions: the stem's endpoint re-intersects with the host's line; the
 *    junction must stay within the host span or the edit is rejected.
 *  - Arc walls (controlPoint) are excluded: they translate as rigid bodies and
 *    are never chased by healing.
 *  - Column-attached endpoints are PINNED: the column did not move, so the
 *    attachment anchors the endpoint and healing skips it entirely
 *    (syncWallAttachmentPoints makes the column win — see projectCommands).
 *
 * Everything here is pure and runs on plain floor data. validateWallEdit is the
 * single validator shared by dispatchers (pre-flight UX) and the reducer
 * (authoritative gate).
 */

export const HEAL_ANGLE_THRESHOLD_DEG = 5;
export const MAX_EXTENSION_FACTOR = 2;
export const MAX_EXTENSION_SLACK = 500; // mm — small absolute growth is always allowed

const EPS = 1e-6;
const NEAR_PARALLEL_SIN = Math.sin((HEAL_ANGLE_THRESHOLD_DEG * Math.PI) / 180);

function pointsClose(a, b, tolerance) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= tolerance * tolerance;
}

function segmentLength(a, b) {
  return distance(a, b);
}

function direction(a, b) {
  const len = segmentLength(a, b);
  if (len < EPS) return null;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function nearParallel(dirA, dirB) {
  if (!dirA || !dirB) return true;
  return Math.abs(cross(dirA, dirB)) < NEAR_PARALLEL_SIN;
}

/** Intersection of two infinite lines (p1→p2) and (p3→p4); null if parallel. */
function lineIntersection(p1, p2, p3, p4) {
  const d1 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const d2 = { x: p4.x - p3.x, y: p4.y - p3.y };
  const denom = cross(d1, d2);
  if (Math.abs(denom) < EPS) return null;
  const t = cross({ x: p3.x - p1.x, y: p3.y - p1.y }, d2) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

/** Parameter of `point` projected onto segment a→b (0 at a, 1 at b). */
function segmentParameter(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS) return 0;
  return ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
}

function pointOnSegmentInterior(point, a, b, tolerance) {
  const t = segmentParameter(point, a, b);
  if (t < -EPS || t > 1 + EPS) return null;
  const projected = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  if (!pointsClose(point, projected, tolerance)) return null;
  return t;
}

function endpointPinned(wall, endpointKey) {
  return Boolean(wall[`${endpointKey}Attachment`]?.columnId);
}

function normalizeEdit(wall, wallUpdate) {
  return {
    start: wallUpdate.start ? { x: wallUpdate.start.x, y: wallUpdate.start.y } : { ...wall.start },
    end: wallUpdate.end ? { x: wallUpdate.end.x, y: wallUpdate.end.y } : { ...wall.end },
  };
}

function findOpeningNoFit(floor, wallId, newLength) {
  const hosted = [...(floor.doors || []), ...(floor.windows || [])].filter((opening) => opening.wallId === wallId);
  return hosted.find((opening) => (opening.width || 0) > newLength) || null;
}

/**
 * Derive the one-hop neighborhood of a wall from geometry.
 * Returns, per endpoint of M: cluster members (shared-endpoint joins) and the
 * T-host (M's endpoint on another wall's interior), plus inbound stems (other
 * walls whose endpoint sits on M's interior). Arc walls and column-pinned
 * endpoints are excluded from all sets.
 */
export function deriveWallNeighborhood(walls, wallId, tolerance = ENDPOINT_MERGE_TOLERANCE) {
  const wall = walls.find((w) => w.id === wallId);
  if (!wall) return null;

  const neighborhood = {
    start: { cluster: [], host: null },
    end: { cluster: [], host: null },
    stems: [],
  };

  for (const other of walls) {
    if (other.id === wallId || other.controlPoint) continue;

    for (const endpointKey of ['start', 'end']) {
      if (endpointPinned(other, endpointKey)) continue;
      const point = other[endpointKey];

      for (const myKey of ['start', 'end']) {
        if (pointsClose(point, wall[myKey], tolerance)) {
          neighborhood[myKey].cluster.push({ wall: other, endpointKey });
        }
      }

      // Inbound stem: other's endpoint on M's interior (not at M's endpoints).
      if (
        !wall.controlPoint &&
        !pointsClose(point, wall.start, tolerance) &&
        !pointsClose(point, wall.end, tolerance) &&
        pointOnSegmentInterior(point, wall.start, wall.end, tolerance) != null
      ) {
        neighborhood.stems.push({ wall: other, endpointKey });
      }
    }
  }

  // M's own T-attachment: a free endpoint of M resting on another wall's interior.
  for (const myKey of ['start', 'end']) {
    if (neighborhood[myKey].cluster.length > 0 || endpointPinned(wall, myKey)) continue;
    for (const other of walls) {
      if (other.id === wallId || other.controlPoint) continue;
      const point = wall[myKey];
      if (pointsClose(point, other.start, tolerance) || pointsClose(point, other.end, tolerance)) continue;
      if (pointOnSegmentInterior(point, other.start, other.end, tolerance) != null) {
        neighborhood[myKey].host = other;
        break;
      }
    }
  }

  return neighborhood;
}

function addEndpointEdit(editMap, wallId, endpointKey, point) {
  const existing = editMap.get(wallId) || {};
  editMap.set(wallId, { ...existing, [endpointKey]: { x: point.x, y: point.y } });
}

/**
 * Propagate a geometry edit on one wall through its one-hop neighborhood.
 *
 * Returns:
 *   { ok: true, primary, secondary, changedWallIds } — primary is the (possibly
 *     corner-adjusted) update for the edited wall; secondary are neighbor
 *     endpoint edits whose attachments must be preserved on apply.
 *   { ok: false, reason, wallId? } — the edit must be rejected. Reasons:
 *     'wall-too-short' | 'over-extension' | 'opening-no-fit' | 't-out-of-span'
 *     | 'degenerate-t'
 */
export function propagateWallEdit(floor, wallUpdate, tolerance = ENDPOINT_MERGE_TOLERANCE) {
  const walls = floor.walls || [];
  const wall = walls.find((w) => w.id === wallUpdate.id);
  if (!wall) return { ok: false, reason: 'wall-not-found' };

  const next = normalizeEdit(wall, wallUpdate);

  // Arc walls translate as rigid bodies — no healing in either direction.
  if (wall.controlPoint) {
    const noFit = findOpeningNoFit(floor, wall.id, segmentLength(next.start, next.end));
    if (noFit) return { ok: false, reason: 'opening-no-fit', wallId: wall.id };
    return { ok: true, primary: { ...wallUpdate }, secondary: [], changedWallIds: [wall.id] };
  }

  const deltaStart = { x: next.start.x - wall.start.x, y: next.start.y - wall.start.y };
  const deltaEnd = { x: next.end.x - wall.end.x, y: next.end.y - wall.end.y };
  const startMoved = Math.abs(deltaStart.x) > EPS || Math.abs(deltaStart.y) > EPS;
  const endMoved = Math.abs(deltaEnd.x) > EPS || Math.abs(deltaEnd.y) > EPS;
  if (!startMoved && !endMoved) {
    return { ok: true, primary: { ...wallUpdate }, secondary: [], changedWallIds: [wall.id] };
  }
  const isTranslation =
    startMoved && endMoved && Math.abs(deltaStart.x - deltaEnd.x) < EPS && Math.abs(deltaStart.y - deltaEnd.y) < EPS;

  const neighborhood = deriveWallNeighborhood(walls, wall.id, tolerance);
  const newDir = direction(next.start, next.end);
  const secondaryEdits = new Map();
  const primaryPoints = { start: next.start, end: next.end };

  for (const myKey of ['start', 'end']) {
    const moved = myKey === 'start' ? startMoved : endMoved;
    if (!moved) continue;

    const { cluster, host } = neighborhood[myKey];
    const target = next[myKey];

    if (cluster.length >= 2) {
      // Star: every coincident endpoint follows the moved endpoint as one point.
      for (const member of cluster) {
        addEndpointEdit(secondaryEdits, member.wall.id, member.endpointKey, target);
      }
    } else if (cluster.length === 1) {
      const { wall: neighbor, endpointKey } = cluster[0];
      const otherKey = endpointKey === 'start' ? 'end' : 'start';
      const neighborDir = direction(neighbor[otherKey], neighbor[endpointKey]);

      if (!isTranslation || nearParallel(newDir, neighborDir)) {
        // Endpoint drags move the junction itself; near-parallel corners have
        // no stable line intersection. Both cases: rigid-follow.
        addEndpointEdit(secondaryEdits, neighbor.id, endpointKey, target);
      } else {
        const intersection = lineIntersection(neighbor[otherKey], neighbor[endpointKey], next.start, next.end);
        if (!intersection) {
          addEndpointEdit(secondaryEdits, neighbor.id, endpointKey, target);
        } else {
          addEndpointEdit(secondaryEdits, neighbor.id, endpointKey, intersection);
          primaryPoints[myKey] = intersection;
        }
      }
    } else if (host) {
      // M is a stem: its endpoint must stay on the host wall's line and span.
      const hostDir = direction(host.start, host.end);
      if (nearParallel(newDir, hostDir)) return { ok: false, reason: 'degenerate-t', wallId: wall.id };
      const intersection = lineIntersection(next.start, next.end, host.start, host.end);
      if (!intersection) return { ok: false, reason: 'degenerate-t', wallId: wall.id };
      const u = segmentParameter(intersection, host.start, host.end);
      if (u < -EPS || u > 1 + EPS) return { ok: false, reason: 't-out-of-span', wallId: wall.id };
      primaryPoints[myKey] = intersection;
    }
  }

  // Inbound stems: their endpoints must stay on M's (possibly rotated) new span.
  for (const stem of neighborhood.stems) {
    const oldPoint = stem.wall[stem.endpointKey];
    const stemOtherKey = stem.endpointKey === 'start' ? 'end' : 'start';
    const stemDir = direction(stem.wall[stemOtherKey], oldPoint);
    let newPoint;

    if (nearParallel(newDir, stemDir)) {
      // No stable intersection — keep the stem at the same parameter along M.
      const t = segmentParameter(oldPoint, wall.start, wall.end);
      newPoint = {
        x: primaryPoints.start.x + (primaryPoints.end.x - primaryPoints.start.x) * t,
        y: primaryPoints.start.y + (primaryPoints.end.y - primaryPoints.start.y) * t,
      };
    } else {
      newPoint = lineIntersection(stem.wall[stemOtherKey], oldPoint, primaryPoints.start, primaryPoints.end);
      if (!newPoint) return { ok: false, reason: 'degenerate-t', wallId: stem.wall.id };
      const t = segmentParameter(newPoint, primaryPoints.start, primaryPoints.end);
      if (t < -EPS || t > 1 + EPS) return { ok: false, reason: 't-out-of-span', wallId: stem.wall.id };
    }
    addEndpointEdit(secondaryEdits, stem.wall.id, stem.endpointKey, newPoint);
  }

  // ---- Validation over every modified wall ----
  const primary = { ...wallUpdate, start: { ...primaryPoints.start }, end: { ...primaryPoints.end } };
  const primaryLength = segmentLength(primaryPoints.start, primaryPoints.end);
  if (primaryLength < MIN_WALL_LENGTH) return { ok: false, reason: 'wall-too-short', wallId: wall.id };
  if (findOpeningNoFit(floor, wall.id, primaryLength)) {
    return { ok: false, reason: 'opening-no-fit', wallId: wall.id };
  }

  const secondary = [];
  for (const [id, edit] of secondaryEdits) {
    const neighbor = walls.find((w) => w.id === id);
    const nextStart = edit.start || neighbor.start;
    const nextEnd = edit.end || neighbor.end;
    const oldLength = segmentLength(neighbor.start, neighbor.end);
    const newLength = segmentLength(nextStart, nextEnd);

    if (newLength < MIN_WALL_LENGTH) return { ok: false, reason: 'wall-too-short', wallId: id };
    if (newLength > oldLength * MAX_EXTENSION_FACTOR && newLength - oldLength > MAX_EXTENSION_SLACK) {
      return { ok: false, reason: 'over-extension', wallId: id };
    }
    if (findOpeningNoFit(floor, id, newLength)) return { ok: false, reason: 'opening-no-fit', wallId: id };

    secondary.push({ id, ...edit });
  }

  return {
    ok: true,
    primary,
    secondary,
    changedWallIds: [wall.id, ...secondary.map((edit) => edit.id)],
  };
}

/**
 * The single validator for wall geometry edits. Dispatchers call it before
 * dispatching (pre-flight UX); the WALL_UPDATE reducer case calls propagate
 * itself, which applies the identical checks authoritatively.
 */
export function validateWallEdit(floor, wallUpdate, tolerance = ENDPOINT_MERGE_TOLERANCE) {
  const result = propagateWallEdit(floor, wallUpdate, tolerance);
  if (result.ok) return { valid: true };
  return { valid: false, reason: result.reason, wallId: result.wallId };
}

/** Human-readable rejection messages for toasts. */
export function describeWallEditRejection(reason) {
  switch (reason) {
    case 'wall-too-short':
      return 'Edit blocked: a wall would become shorter than the minimum length.';
    case 'over-extension':
      return 'Edit blocked: a joined wall would be stretched too far.';
    case 'opening-no-fit':
      return 'Edit blocked: a door or window would no longer fit on its wall.';
    case 't-out-of-span':
      return 'Edit blocked: a T-junction would slide off the end of its wall.';
    case 'degenerate-t':
      return 'Edit blocked: a T-junction would lose its crossing angle.';
    default:
      return 'Edit blocked: it would break the wall model.';
  }
}
