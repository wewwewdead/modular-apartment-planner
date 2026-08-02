import { columnOutline } from '@/geometry/columnGeometry';
import { distanceToSegment } from '@/geometry/line';
import { polygonCentroid } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { doorOutlineOnWall, positionOnWall, wallLength, windowOutlineOnWall } from '@/geometry/wallGeometry';
import { DESIGN_CONFIDENCE } from './trustModels';
import { ROOM_USE_CATEGORIES } from './apartmentProgram';

export const DEFAULT_SPATIAL_RULE_PROFILE = Object.freeze({
  id: 'alpha_tropical_apartment_coordination_v1',
  minCorridorWidth: 900,
  roomBoundaryTolerance: 35,
  crossVentilationBearingDifference: 60,
  ventilationSpaceTypes: ['bedroom', 'living', 'living_sleeping', 'kitchen', 'bathroom'],
  crossVentilationSpaceTypes: ['bedroom', 'living', 'living_sleeping'],
  source: 'configured_product_assumption_not_code_approval',
});

function issue(ruleId, category, severity, message, entityRefs, inputs, resultKind = 'verified_geometry') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category,
    severity,
    message,
    entityRefs,
    evidence: {
      resultKind,
      confidence: DESIGN_CONFIDENCE.CHECKED,
      inputs,
    },
    professionalReviewRequired: true,
  };
}

function openingPolygon(wall, opening, kind) {
  const outline = kind === 'door' ? doorOutlineOnWall(wall, opening) : windowOutlineOnWall(wall, opening);
  return [outline.p1, outline.p2, outline.p3, outline.p4];
}

function roomBoundaryDistance(room, point) {
  const points = room.points || [];
  if (points.length < 2) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, points[index], points[(index + 1) % points.length]));
  }
  return minimum;
}

function minProjectedWidth(points) {
  if (!points || points.length < 3) return null;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const normal = { x: -dy / length, y: dx / length };
    const projections = points.map((point) => point.x * normal.x + point.y * normal.y);
    minimum = Math.min(minimum, Math.max(...projections) - Math.min(...projections));
  }
  return Number.isFinite(minimum) ? minimum : null;
}

function bearing(from, to) {
  const degrees = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

function bearingDifference(a, b) {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

function countDistinctVentilationDirections(bearings, minimumDifference) {
  if (!bearings.length) return 0;
  const groups = [];
  for (const candidate of bearings) {
    if (groups.every((existing) => bearingDifference(existing, candidate) >= minimumDifference)) {
      groups.push(candidate);
    }
  }
  return groups.length;
}

function analyzeFloorRooms(floor, profile) {
  const wallsById = new Map((floor.walls || []).map((wall) => [wall.id, wall]));
  const exteriorWindowsByRoom = new Map((floor.rooms || []).map((room) => [room.id, []]));

  for (const window of floor.windows || []) {
    const wall = wallsById.get(window.wallId);
    if (!wall) continue;
    const center = positionOnWall(wall, window.offset);
    const adjacentRooms = (floor.rooms || []).filter(
      (room) => roomBoundaryDistance(room, center) <= profile.roomBoundaryTolerance,
    );
    if (adjacentRooms.length !== 1) continue;
    exteriorWindowsByRoom.get(adjacentRooms[0].id)?.push({ window, center });
  }

  return (floor.rooms || []).map((room) => {
    const windows = exteriorWindowsByRoom.get(room.id) || [];
    const centroid = room.labelPosition || polygonCentroid(room.points || []);
    const bearings = windows.map((entry) => bearing(centroid, entry.center));
    const directionCount = countDistinctVentilationDirections(bearings, profile.crossVentilationBearingDifference);
    return {
      floorId: floor.id,
      roomId: room.id,
      name: room.name,
      spaceType: room.spaceType,
      useCategory: room.useCategory,
      minProjectedWidth: minProjectedWidth(room.points || []),
      exteriorWindowIds: windows.map((entry) => entry.window.id),
      exteriorWindowCount: windows.length,
      ventilationDirectionCount: directionCount,
      naturalVentilationPotential: windows.length > 0,
      crossVentilationPotential: directionCount >= 2,
    };
  });
}

export function deriveSpatialCoordination(project, profile = DEFAULT_SPATIAL_RULE_PROFILE) {
  const rooms = (project.floors || []).flatMap((floor) => analyzeFloorRooms(floor, profile));
  const relevant = rooms.filter((room) => profile.ventilationSpaceTypes.includes(room.spaceType));
  const crossRelevant = rooms.filter((room) => profile.crossVentilationSpaceTypes.includes(room.spaceType));
  return {
    profile,
    rooms,
    ventilationRequiredRoomCount: relevant.length,
    naturallyVentilatedRoomCount: relevant.filter((room) => room.naturalVentilationPotential).length,
    crossVentilationCandidateCount: crossRelevant.length,
    crossVentilatedRoomCount: crossRelevant.filter((room) => room.crossVentilationPotential).length,
    professionalReviewRequired: true,
  };
}

function validateOpeningsAndColumns(floor) {
  const issues = [];
  const wallsById = new Map((floor.walls || []).map((wall) => [wall.id, wall]));
  const openings = [
    ...(floor.doors || []).map((opening) => ({ ...opening, kind: 'door' })),
    ...(floor.windows || []).map((opening) => ({ ...opening, kind: 'window' })),
  ];

  for (const opening of openings) {
    const wall = wallsById.get(opening.wallId);
    if (!wall) continue;
    const length = wallLength(wall);
    const startOffset = opening.offset - opening.width / 2;
    const endOffset = opening.offset + opening.width / 2;
    if (startOffset < 0 || endOffset > length) {
      issues.push(
        issue(
          'SPATIAL.OPENING_OUTSIDE_HOST_WALL',
          'spatial_coordination',
          'error',
          `${opening.kind === 'door' ? 'Door' : 'Window'} extends beyond its host wall.`,
          [
            { type: opening.kind, id: opening.id },
            { type: 'wall', id: wall.id },
          ],
          { floorId: floor.id, wallLength: length, openingWidth: opening.width, openingOffset: opening.offset },
        ),
      );
    }

    const polygon = openingPolygon(wall, opening, opening.kind);
    for (const column of floor.columns || []) {
      const overlapArea = intersectionArea(polygon, columnOutline(column));
      if (overlapArea <= 1) continue;
      issues.push(
        issue(
          'SPATIAL.OPENING_COLUMN_COLLISION',
          'spatial_coordination',
          'error',
          `${opening.kind === 'door' ? 'Door' : 'Window'} intersects a column in plan.`,
          [
            { type: opening.kind, id: opening.id },
            { type: 'column', id: column.id },
          ],
          { floorId: floor.id, overlapArea, units: 'mm²' },
        ),
      );
    }
  }

  const byWall = new Map();
  for (const opening of openings) {
    const entries = byWall.get(opening.wallId) || [];
    entries.push(opening);
    byWall.set(opening.wallId, entries);
  }
  for (const [wallId, wallOpenings] of byWall) {
    for (let first = 0; first < wallOpenings.length; first += 1) {
      for (let second = first + 1; second < wallOpenings.length; second += 1) {
        const a = wallOpenings[first];
        const b = wallOpenings[second];
        const overlap =
          Math.min(a.offset + a.width / 2, b.offset + b.width / 2) -
          Math.max(a.offset - a.width / 2, b.offset - b.width / 2);
        if (overlap <= 0) continue;
        issues.push(
          issue(
            'SPATIAL.OPENINGS_OVERLAP',
            'spatial_coordination',
            'error',
            'Two openings overlap on the same wall.',
            [
              { type: a.kind, id: a.id },
              { type: b.kind, id: b.id },
              { type: 'wall', id: wallId },
            ],
            { floorId: floor.id, overlap, units: 'mm' },
          ),
        );
      }
    }
  }
  return issues;
}

export function validateSpatialCoordination(project, profile = DEFAULT_SPATIAL_RULE_PROFILE) {
  const issues = [];
  const analysis = deriveSpatialCoordination(project, profile);
  for (const floor of project.floors || []) issues.push(...validateOpeningsAndColumns(floor));

  for (const room of analysis.rooms) {
    const refs = [
      { type: 'floor', id: room.floorId },
      { type: 'room', id: room.roomId },
    ];
    const baseInputs = { profileId: profile.id, profileSource: profile.source };
    if (
      room.useCategory === ROOM_USE_CATEGORIES.CIRCULATION &&
      room.minProjectedWidth != null &&
      room.minProjectedWidth < profile.minCorridorWidth
    ) {
      issues.push(
        issue(
          'SPATIAL.CORRIDOR_WIDTH_BELOW_ASSUMPTION',
          'spatial_coordination',
          'warning',
          'Circulation room width is below the configured project assumption.',
          refs,
          {
            ...baseInputs,
            measuredWidth: room.minProjectedWidth,
            configuredMinimum: profile.minCorridorWidth,
            method: 'minimum_polygon_projection',
          },
          'configured_rule_check',
        ),
      );
    }
    if (profile.ventilationSpaceTypes.includes(room.spaceType) && !room.naturalVentilationPotential) {
      issues.push(
        issue(
          room.spaceType === 'bathroom'
            ? 'ENV.BATHROOM_VENTILATION_ROUTE_MISSING'
            : 'ENV.NATURAL_VENTILATION_ROUTE_MISSING',
          'environmental_coordination',
          'warning',
          room.spaceType === 'bathroom'
            ? 'Bathroom has no modeled exterior window or ventilation route.'
            : 'Room has no modeled exterior window for natural ventilation.',
          refs,
          { ...baseInputs, spaceType: room.spaceType, exteriorWindowCount: room.exteriorWindowCount },
          'configured_rule_check',
        ),
      );
    }
  }
  return issues;
}
