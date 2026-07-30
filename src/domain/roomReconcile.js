import { ENDPOINT_MERGE_TOLERANCE } from './defaults';
import { createRoom } from './models';
import { detectRooms } from '@/geometry/roomDetection';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { pointInPolygon, polygonArea, polygonCentroid } from '@/geometry/polygon';
import { nearestPointOnSegment, segmentIntersection } from '@/geometry/line';

/**
 * roomReconcile — identity-preserving room recomputation.
 *
 * After a wall edit, re-detected polygons are matched back to existing rooms
 * (largest area overlap, labelPosition containment fallback) so names, colors,
 * and phases survive geometry changes. LOCALITY RULE: when `changedWalls` is
 * given, only rooms/polygons touching those segments participate — distant
 * rooms (including stale legacy rooms whose loops no longer close) are never
 * touched by an edit that didn't come near them, and per-commit work stays
 * bounded. Passing no changedWalls reconciles the full floor (the explicit
 * Toolbar "Detect Rooms" path).
 */

export const MATCH_OVERLAP_RATIO = 0.4;

function polygonTouchesSegment(points, segment, tolerance) {
  if (!points || points.length < 3 || !segment) return false;
  const { start, end } = segment;

  if (pointInPolygon(start, points) || pointInPolygon(end, points)) return true;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (segmentIntersection(start, end, a, b)) return true;
  }

  for (const vertex of points) {
    const { point } = nearestPointOnSegment(vertex, start, end);
    const dx = point.x - vertex.x;
    const dy = point.y - vertex.y;
    if (dx * dx + dy * dy <= tolerance * tolerance) return true;
  }

  return false;
}

function polygonInScope(points, changedWalls, tolerance) {
  if (!changedWalls) return true;
  return changedWalls.some((segment) => polygonTouchesSegment(points, segment, tolerance));
}

function preservedLabelPosition(room, newPoints) {
  if (room.labelPosition && pointInPolygon(room.labelPosition, newPoints)) {
    return { ...room.labelPosition };
  }
  return polygonCentroid(newPoints);
}

/**
 * Reconcile a floor's rooms against freshly detected wall-loop polygons.
 *
 * options.changedWalls — array of {start, end} segments (pass BOTH the old and
 *   new geometry of every changed wall) to scope the reconcile; omit/null for
 *   a full-floor reconcile.
 * options.phaseId — phase assigned to newly created rooms (dispatcher's
 *   activePhaseId; reducers receive it via the action payload).
 *
 * Pure: (floor, options) => nextFloor (returns the same floor object when
 * nothing changed).
 */
export function reconcileFloorRooms(floor, { changedWalls = null, phaseId = null } = {}) {
  const tolerance = ENDPOINT_MERGE_TOLERANCE;
  const previousRooms = floor.rooms || [];
  const detected = detectRooms(floor.walls || [], floor.columns || []);

  const scopedDetected = detected.filter((polygon) => polygonInScope(polygon.points, changedWalls, tolerance));
  const inScopeRooms = previousRooms.filter((room) => polygonInScope(room.points, changedWalls, tolerance));
  const outOfScopeRooms = previousRooms.filter((room) => !inScopeRooms.includes(room));

  // Score every (room, polygon) pair by overlap, then match greedily from the
  // best overlap down. A match must cover MATCH_OVERLAP_RATIO of the smaller
  // area — below that the polygon is a different space, not a reshape.
  const candidates = [];
  inScopeRooms.forEach((room, roomIndex) => {
    const roomArea = Math.abs(room.area || polygonArea(room.points));
    scopedDetected.forEach((polygon, polygonIndex) => {
      const overlap = intersectionArea(room.points, polygon.points);
      if (overlap <= 0) return;
      const polyArea = Math.abs(polygonArea(polygon.points));
      const smaller = Math.min(roomArea, polyArea) || 1;
      if (overlap / smaller >= MATCH_OVERLAP_RATIO) {
        candidates.push({ roomIndex, polygonIndex, overlap });
      }
    });
  });
  candidates.sort((a, b) => b.overlap - a.overlap);

  const roomForPolygon = new Map();
  const matchedRooms = new Set();
  for (const candidate of candidates) {
    if (roomForPolygon.has(candidate.polygonIndex) || matchedRooms.has(candidate.roomIndex)) continue;
    roomForPolygon.set(candidate.polygonIndex, candidate.roomIndex);
    matchedRooms.add(candidate.roomIndex);
  }

  // Fallback: an unmatched room whose label point sits inside an unmatched
  // polygon still claims it (covers thin/degenerate overlap cases).
  inScopeRooms.forEach((room, roomIndex) => {
    if (matchedRooms.has(roomIndex) || !room.labelPosition) return;
    scopedDetected.forEach((polygon, polygonIndex) => {
      if (roomForPolygon.has(polygonIndex) || matchedRooms.has(roomIndex)) return;
      if (pointInPolygon(room.labelPosition, polygon.points)) {
        roomForPolygon.set(polygonIndex, roomIndex);
        matchedRooms.add(roomIndex);
      }
    });
  });

  let newRoomCounter = previousRooms.length;
  const reconciled = scopedDetected.map((polygon, polygonIndex) => {
    const roomIndex = roomForPolygon.get(polygonIndex);
    if (roomIndex != null) {
      const room = inScopeRooms[roomIndex];
      return {
        ...room,
        points: polygon.points.map((point) => ({ x: point.x, y: point.y })),
        area: polygonArea(polygon.points),
        labelPosition: preservedLabelPosition(room, polygon.points),
      };
    }
    newRoomCounter += 1;
    const room = createRoom(`Room ${newRoomCounter}`, polygon.points);
    room.phaseId = phaseId;
    return room;
  });

  // Out-of-scope rooms are untouched by construction; in-scope rooms matched
  // by no polygon are removed as part of this same commit.
  const nextRooms = [...outOfScopeRooms, ...reconciled];

  const unchanged =
    nextRooms.length === previousRooms.length && nextRooms.every((room, index) => room === previousRooms[index]);
  if (unchanged) return floor;

  return { ...floor, rooms: nextRooms };
}
