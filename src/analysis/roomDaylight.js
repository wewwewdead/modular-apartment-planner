/**
 * Reduces a floor to the rooms and glazed apertures a daylight study needs.
 *
 * Deliberately the same shape of module as `buildingMassing.js`: analysis takes
 * a plain geometric view of the model and never touches renderer concerns, so a
 * change to how a window *looks* cannot quietly change what a daylight study
 * *computes*.
 *
 * The one genuinely hard question here is **which room a window lights**. The
 * model does not record it: a window belongs to a wall, and a wall does not
 * know which rooms it bounds. So it is derived — probe just inside each face of
 * the wall and see which room polygon the probe lands in. A window with a room
 * on one side and open air on the other is an external window for that room; a
 * window with rooms on both sides is internal glazing and lights nothing from
 * the sky; a window with rooms on neither side belongs to no detected room and
 * is skipped.
 *
 * All values are millimetres. Elevations are absolute (from project datum), so
 * they line up with `buildingMassing`.
 */

import { add, normalize, perpendicular, scale, subtract } from '@/geometry/point';
import { pointInPolygon, polygonArea, polygonCentroid } from '@/geometry/polygon';
import { positionOnWall, wallLength } from '@/geometry/wallGeometry';
import { WALL_HEIGHT } from '@/domain/defaults';

/** How far past a wall face to place the probe that identifies the room. */
const ROOM_PROBE_MM = 50;

/** Points sampled along a wall when deciding which rooms it bounds. */
const WALL_BOUND_SAMPLES = 5;

/** Openings narrower or shorter than this are not daylight sources. */
const MIN_APERTURE_MM = 50;

/** Window types that admit daylight. Every type in the model currently does. */
const GLAZED_WINDOW_TYPES = new Set(['standard', 'casement', 'awning', 'fixed']);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function polygonPerimeter(points = []) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    const dx = next.x - points[index].x;
    const dy = next.y - points[index].y;
    total += Math.hypot(dx, dy);
  }
  return total;
}

/**
 * Unit normal of a wall in plan. Which side this points to is arbitrary — every
 * caller resolves the sides by probing, never by assuming a winding.
 */
function wallNormal(wall) {
  return perpendicular(normalize(subtract(wall.end, wall.start)));
}

/**
 * A wall bounds a room when a probe just inside one of its faces lands in the
 * room polygon. Sampled at several points along the wall, because a long wall
 * may bound a room over only part of its length and its midpoint alone would
 * miss that.
 */
function wallBoundsRoom(wall, roomPolygon) {
  const normal = wallNormal(wall);
  const reach = wall.thickness / 2 + ROOM_PROBE_MM;
  const length = wallLength(wall);
  if (!(length > 0)) return false;

  for (let index = 0; index < WALL_BOUND_SAMPLES; index += 1) {
    const t = (index + 0.5) / WALL_BOUND_SAMPLES;
    const point = positionOnWall(wall, t * length);
    if (pointInPolygon(add(point, scale(normal, reach)), roomPolygon)) return true;
    if (pointInPolygon(subtract(point, scale(normal, reach)), roomPolygon)) return true;
  }
  return false;
}

/**
 * Ceiling height for a room: the tallest wall that bounds it, because a room
 * enclosed by walls of differing heights is lit to the highest of them.
 */
function roomHeight(roomPolygon, walls, floor) {
  let tallest = 0;
  for (const wall of walls) {
    const height = isFiniteNumber(wall.height) ? wall.height : 0;
    if (height <= tallest) continue;
    if (wallBoundsRoom(wall, roomPolygon)) tallest = height;
  }
  if (tallest > 0) return tallest;
  if (isFiniteNumber(floor?.floorToFloorHeight) && floor.floorToFloorHeight > 0) return floor.floorToFloorHeight;
  return WALL_HEIGHT;
}

/**
 * Build one aperture record from an opening on a wall, resolving which side is
 * the room and which is outside.
 *
 * @returns {object|null} Null when the opening lights no detected room, or has
 *   a room on both sides (internal glazing, which admits no sky).
 */
function buildAperture({ opening, wall, rooms, floorElevation, presetKey }) {
  const width = isFiniteNumber(opening.width) ? opening.width : 0;
  const height = isFiniteNumber(opening.height) ? opening.height : 0;
  if (width < MIN_APERTURE_MM || height < MIN_APERTURE_MM) return null;

  const length = wallLength(wall);
  if (!(length > 0)) return null;

  const centre = positionOnWall(wall, Math.min(length, Math.max(0, opening.offset || 0)));
  const tangent = normalize(subtract(wall.end, wall.start));
  const normal = perpendicular(tangent);
  const halfThickness = Math.max(1, (wall.thickness || 0) / 2);
  const reach = halfThickness + ROOM_PROBE_MM;

  const positiveProbe = add(centre, scale(normal, reach));
  const negativeProbe = subtract(centre, scale(normal, reach));

  const positiveRoom = rooms.find((room) => pointInPolygon(positiveProbe, room.polygon)) || null;
  const negativeRoom = rooms.find((room) => pointInPolygon(negativeProbe, room.polygon)) || null;

  // Rooms on both sides: internal glazing. It moves light between rooms, which
  // split-flux cannot represent and which this study does not claim to.
  if (positiveRoom && negativeRoom) return null;
  const room = positiveRoom || negativeRoom;
  if (!room) return null;

  // The outward normal points away from the room it serves.
  const inwardNormal = positiveRoom ? normal : scale(normal, -1);
  const outwardNormal = scale(inwardNormal, -1);

  const sill = floorElevation + (isFiniteNumber(opening.sillHeight) ? opening.sillHeight : 0);

  return {
    id: `aperture:${opening.id}`,
    openingId: opening.id,
    roomId: room.id,
    wallId: wall.id,
    presetKey,
    glazing: opening.glazing || null,
    centre: { x: centre.x, y: centre.y },
    tangent,
    inwardNormal,
    outwardNormal,
    halfThickness,
    width,
    height,
    sillElevation: sill,
    headElevation: sill + height,
    centreElevation: sill + height / 2,
    // Relative to the room floor, which is what the BRE formulas want.
    sillHeight: isFiniteNumber(opening.sillHeight) ? opening.sillHeight : 0,
    headHeight: (isFiniteNumber(opening.sillHeight) ? opening.sillHeight : 0) + height,
    openingAreaMm2: width * height,
  };
}

/**
 * Extent of a room measured along a direction and its perpendicular — the
 * "depth back from the window" and "width across the window" the BRE limiting
 * depth rule is written in terms of.
 */
export function roomExtentsAlong(polygon, direction) {
  const perpendicularDirection = perpendicular(direction);
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  let minAcross = Infinity;
  let maxAcross = -Infinity;

  for (const point of polygon) {
    const along = point.x * direction.x + point.y * direction.y;
    const across = point.x * perpendicularDirection.x + point.y * perpendicularDirection.y;
    if (along < minAlong) minAlong = along;
    if (along > maxAlong) maxAlong = along;
    if (across < minAcross) minAcross = across;
    if (across > maxAcross) maxAcross = across;
  }

  return Number.isFinite(minAlong)
    ? { depth: maxAlong - minAlong, width: maxAcross - minAcross }
    : { depth: 0, width: 0 };
}

/**
 * Extract the daylight model for one floor.
 *
 * @param {object} project
 * @param {object} [options]
 * @param {string} [options.floorId]  Defaults to the first floor.
 * @param {boolean} [options.includeGlazedDoors]  Count sliding doors as
 *   glazing. On by default: a balcony slider is usually the largest daylight
 *   source in an apartment, and ignoring it would understate every living room.
 * @returns {{rooms: Array, floorElevation: number, skippedInternal: number}}
 */
export function buildDaylightRooms(project, options = {}) {
  const { floorId = null, includeGlazedDoors = true } = options;

  const floors = project?.floors || [];
  const floor = (floorId ? floors.find((entry) => entry.id === floorId) : floors[0]) || null;
  if (!floor) return { rooms: [], floorElevation: 0, skippedInternal: 0 };

  const floorElevation = isFiniteNumber(floor.elevation) ? floor.elevation : 0;
  const walls = floor.walls || [];
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));

  const rooms = (floor.rooms || [])
    .filter((room) => (room.points || []).length >= 3)
    .map((room) => {
      const polygon = room.points.map((point) => ({ x: point.x, y: point.y }));
      return {
        id: room.id,
        name: room.name || 'Room',
        spaceType: room.spaceType || null,
        useCategory: room.useCategory || null,
        polygon,
        centroid: polygonCentroid(polygon),
        areaMm2: isFiniteNumber(room.area) && room.area > 0 ? room.area : polygonArea(polygon),
        perimeterMm: polygonPerimeter(polygon),
        floorElevation,
        heightMm: 0,
        apertures: [],
      };
    });

  if (!rooms.length) return { rooms: [], floorElevation, skippedInternal: 0 };

  for (const room of rooms) room.heightMm = roomHeight(room.polygon, walls, floor);

  const openings = [
    ...(floor.windows || []).map((entry) => ({
      opening: entry,
      presetKey: entry.type && GLAZED_WINDOW_TYPES.has(entry.type) ? entry.type : 'standard',
    })),
    ...(includeGlazedDoors
      ? (floor.doors || [])
          .filter((door) => door.type === 'sliding')
          .map((entry) => ({ opening: entry, presetKey: 'slidingDoor' }))
      : []),
  ];

  let skippedInternal = 0;
  const roomsById = new Map(rooms.map((room) => [room.id, room]));

  for (const { opening, presetKey } of openings) {
    const wall = wallsById.get(opening.wallId);
    if (!wall) continue;

    const aperture = buildAperture({ opening, wall, rooms, floorElevation, presetKey });
    if (!aperture) {
      skippedInternal += 1;
      continue;
    }
    roomsById.get(aperture.roomId)?.apertures.push(aperture);
  }

  // Once the apertures are known, each room gains the geometry the limiting
  // depth rule needs, measured from its largest window wall.
  for (const room of rooms) {
    const primary = room.apertures.reduce(
      (largest, aperture) => (!largest || aperture.openingAreaMm2 > largest.openingAreaMm2 ? aperture : largest),
      null,
    );
    room.primaryApertureId = primary?.id || null;
    room.extents = primary ? roomExtentsAlong(room.polygon, primary.inwardNormal) : { depth: 0, width: 0 };
  }

  return { rooms, floorElevation, skippedInternal };
}

export const DAYLIGHT_ROOM_CONSTANTS = { ROOM_PROBE_MM, MIN_APERTURE_MM, WALL_BOUND_SAMPLES };
