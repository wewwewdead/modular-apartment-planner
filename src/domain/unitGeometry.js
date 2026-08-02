import { distanceToSegment } from '@/geometry/line';
import { pointInPolygon, polygonArea, polygonCentroid } from '@/geometry/polygon';

const OWNED_COLLECTIONS = Object.freeze(['walls', 'doors', 'windows', 'rooms', 'fixtures']);
const ENTITY_PREFIX = Object.freeze({ walls: 'wall', doors: 'door', windows: 'win', rooms: 'room', fixtures: 'fix' });

function worldToLocal(point, placement) {
  const angle = (-Number(placement?.rotation || 0) * Math.PI) / 180;
  const dx = point.x - placement.origin.x;
  const dy = point.y - placement.origin.y;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

export function unitLocalToWorld(point, placement) {
  const angle = (Number(placement?.rotation || 0) * Math.PI) / 180;
  return {
    x: placement.origin.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: placement.origin.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

function roomBoundaryDistance(room, point) {
  const points = room.points || [];
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, points[index], points[(index + 1) % points.length]));
  }
  return minimum;
}

function wallBelongsToRooms(wall, rooms, tolerance) {
  const midpoint = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  return rooms.some(
    (room) =>
      roomBoundaryDistance(room, wall.start) <= tolerance &&
      roomBoundaryDistance(room, wall.end) <= tolerance &&
      roomBoundaryDistance(room, midpoint) <= tolerance,
  );
}

function derivePlacement(rooms) {
  const points = rooms.flatMap((room) => room.points || []);
  if (!points.length) return null;
  return {
    origin: {
      x: Math.min(...points.map((point) => point.x)),
      y: Math.min(...points.map((point) => point.y)),
    },
    rotation: 0,
  };
}

function selectedByIds(collection, ids) {
  if (!ids) return null;
  const wanted = new Set(ids);
  return collection.filter((entry) => wanted.has(entry.id));
}

/**
 * Capture one mapped unit as local-coordinate, geometry-backed type content.
 * Spatial inference is limited to room boundary walls and fixtures contained by
 * the mapped rooms; callers may pass explicit entityIds when the intent differs.
 */
export function captureUnitGeometry(project, instance, options = {}) {
  const floor = (project.floors || []).find((entry) => entry.id === instance.floorId);
  if (!floor) return { ok: false, code: 'floor-not-found', message: 'The source unit floor was not found.' };
  const mappedRoomIds = new Set(instance.roomIds || []);
  const rooms =
    selectedByIds(floor.rooms || [], options.entityIds?.rooms) ||
    (floor.rooms || []).filter((room) => mappedRoomIds.has(room.id));
  if (!rooms.length) {
    return { ok: false, code: 'unit-rooms-required', message: 'Map at least one room to the source unit first.' };
  }
  const placement = options.placement || instance.placement || derivePlacement(rooms);
  if (!placement?.origin || !Number.isFinite(placement.origin.x) || !Number.isFinite(placement.origin.y)) {
    return {
      ok: false,
      code: 'unit-placement-invalid',
      message: 'The source unit requires a finite placement origin.',
    };
  }

  const tolerance = options.wallBoundaryTolerance ?? 50;
  const walls =
    selectedByIds(floor.walls || [], options.entityIds?.walls) ||
    (floor.walls || []).filter((wall) => !wall.controlPoint && wallBelongsToRooms(wall, rooms, tolerance));
  const wallKeyById = new Map(walls.map((wall, index) => [wall.id, `wall_${index + 1}`]));
  const doors =
    selectedByIds(floor.doors || [], options.entityIds?.doors) ||
    (floor.doors || []).filter((door) => wallKeyById.has(door.wallId));
  const windows =
    selectedByIds(floor.windows || [], options.entityIds?.windows) ||
    (floor.windows || []).filter((window) => wallKeyById.has(window.wallId));
  const fixtures =
    selectedByIds(floor.fixtures || [], options.entityIds?.fixtures) ||
    (floor.fixtures || []).filter((fixture) => rooms.some((room) => pointInPolygon(fixture, room.points || [])));

  const geometry = {
    coordinateSystem: 'unit_local_mm',
    capturedFromInstanceId: instance.id,
    capturedFromFloorId: floor.id,
    extents: null,
    walls: walls.map((wall, index) => ({
      ...wall,
      id: undefined,
      key: `wall_${index + 1}`,
      start: worldToLocal(wall.start, placement),
      end: worldToLocal(wall.end, placement),
      startAttachment: null,
      endAttachment: null,
      unitInstanceId: undefined,
      unitTemplateKey: undefined,
      unitTemplateGenerated: undefined,
    })),
    doors: doors.map((door, index) => ({
      ...door,
      id: undefined,
      key: `door_${index + 1}`,
      wallKey: wallKeyById.get(door.wallId),
      wallId: undefined,
      unitInstanceId: undefined,
      unitTemplateKey: undefined,
      unitTemplateGenerated: undefined,
    })),
    windows: windows.map((window, index) => ({
      ...window,
      id: undefined,
      key: `window_${index + 1}`,
      wallKey: wallKeyById.get(window.wallId),
      wallId: undefined,
      unitInstanceId: undefined,
      unitTemplateKey: undefined,
      unitTemplateGenerated: undefined,
    })),
    rooms: rooms.map((room, index) => ({
      ...room,
      id: undefined,
      key: `room_${index + 1}`,
      points: (room.points || []).map((point) => worldToLocal(point, placement)),
      labelPosition: worldToLocal(room.labelPosition || polygonCentroid(room.points || []), placement),
      area: room.area || polygonArea(room.points || []),
      unitInstanceId: undefined,
      unitTemplateKey: undefined,
      unitTemplateGenerated: undefined,
    })),
    fixtures: fixtures.map((fixture, index) => ({
      ...fixture,
      id: undefined,
      key: `fixture_${index + 1}`,
      ...worldToLocal(fixture, placement),
      plumbingShaftId: null,
      unitInstanceId: undefined,
      unitTemplateKey: undefined,
      unitTemplateGenerated: undefined,
    })),
  };
  const points = [
    ...geometry.rooms.flatMap((room) => room.points),
    ...geometry.walls.flatMap((wall) => [wall.start, wall.end]),
  ];
  geometry.extents = points.length
    ? {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
      }
    : null;
  return {
    ok: true,
    geometry,
    placement,
    entityIds: {
      walls: walls.map((e) => e.id),
      doors: doors.map((e) => e.id),
      windows: windows.map((e) => e.id),
      rooms: rooms.map((e) => e.id),
      fixtures: fixtures.map((e) => e.id),
    },
  };
}

function ownedId(instanceId, collection, index) {
  return `${instanceId}__${ENTITY_PREFIX[collection]}_${index + 1}`;
}

function ownership(instance, templateEntity, collection) {
  return {
    unitInstanceId: instance.id,
    unitTemplateKey: templateEntity.key,
    unitTemplateCollection: collection,
    unitTemplateGenerated: true,
  };
}

export function materializeUnitGeometry(geometry, instance) {
  const placement = instance.placement;
  const wallIdByKey = new Map();
  const walls = (geometry.walls || []).map((wall, index) => {
    const id = ownedId(instance.id, 'walls', index);
    wallIdByKey.set(wall.key, id);
    return {
      ...wall,
      id,
      key: undefined,
      start: unitLocalToWorld(wall.start, placement),
      end: unitLocalToWorld(wall.end, placement),
      ...ownership(instance, wall, 'walls'),
    };
  });
  const doors = (geometry.doors || []).map((door, index) => ({
    ...door,
    id: ownedId(instance.id, 'doors', index),
    key: undefined,
    wallKey: undefined,
    wallId: wallIdByKey.get(door.wallKey),
    ...ownership(instance, door, 'doors'),
  }));
  const windows = (geometry.windows || []).map((window, index) => ({
    ...window,
    id: ownedId(instance.id, 'windows', index),
    key: undefined,
    wallKey: undefined,
    wallId: wallIdByKey.get(window.wallKey),
    ...ownership(instance, window, 'windows'),
  }));
  const rooms = (geometry.rooms || []).map((room, index) => {
    const points = (room.points || []).map((point) => unitLocalToWorld(point, placement));
    return {
      ...room,
      id: ownedId(instance.id, 'rooms', index),
      key: undefined,
      points,
      labelPosition: unitLocalToWorld(room.labelPosition || polygonCentroid(room.points || []), placement),
      area: polygonArea(points),
      unitInstanceId: instance.id,
      ...ownership(instance, room, 'rooms'),
    };
  });
  const fixtures = (geometry.fixtures || []).map((fixture, index) => ({
    ...fixture,
    id: ownedId(instance.id, 'fixtures', index),
    key: undefined,
    ...unitLocalToWorld(fixture, placement),
    rotation: Number(fixture.rotation || 0) + Number(placement.rotation || 0),
    plumbingShaftId: null,
    ...ownership(instance, fixture, 'fixtures'),
  }));
  return { walls, doors, windows, rooms, fixtures };
}

export function replaceGeneratedUnitEntities(floor, instance, materialized) {
  const next = { ...floor };
  for (const collection of OWNED_COLLECTIONS) {
    next[collection] = [
      ...(floor[collection] || []).filter(
        (entity) => !(entity.unitTemplateGenerated && entity.unitInstanceId === instance.id),
      ),
      ...(materialized[collection] || []),
    ];
  }
  return next;
}

export function templateEntityCounts(geometry) {
  return Object.fromEntries(OWNED_COLLECTIONS.map((collection) => [collection, geometry?.[collection]?.length || 0]));
}

export const UNIT_GEOMETRY_COLLECTIONS = OWNED_COLLECTIONS;
