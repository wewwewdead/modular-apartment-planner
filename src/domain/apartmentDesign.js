import { fixtureOutline } from '@/geometry/fixtureGeometry';
import { distanceToSegment } from '@/geometry/line';
import { polygonArea, polygonCentroid } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { positionOnWall } from '@/geometry/wallGeometry';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_APARTMENT_DESIGN_PROFILE = Object.freeze({
  id: 'iota_small_tropical_apartment_design_v1',
  bathroomWidth: 1400,
  serviceBandDepth: 2000,
  entryDoorWidth: 900,
  internalDoorWidth: 800,
  exteriorWindowWidth: 1200,
  minimumSharedBoundary: 300,
  minimumDaylightGlazingRatio: 0.08,
  accessibleEntryDoorWidth: 900,
  accessibleCirculationWidth: 1200,
  solarExposureWatchOrientations: Object.freeze(['west']),
  fixtureClearances: Object.freeze({
    bed: 450,
    sofa: 450,
    table: 450,
    kitchenTop: 600,
    toilet: 250,
    lavatory: 250,
  }),
  stairWidth: 1000,
  targetRiserHeight: 175,
  treadDepth: 250,
  minimumHeadroom: 2000,
  maximumEgressTravelDistance: 30_000,
  source: 'configured_owner_planning_assumptions_not_code_or_professional_approval',
});

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const ORIENTATIONS = new Set(['north', 'east', 'south', 'west']);

export function createApartmentDesignProfile(overrides = {}) {
  return {
    ...DEFAULT_APARTMENT_DESIGN_PROFILE,
    ...overrides,
    bathroomWidth: finitePositive(overrides.bathroomWidth, DEFAULT_APARTMENT_DESIGN_PROFILE.bathroomWidth),
    serviceBandDepth: finitePositive(overrides.serviceBandDepth, DEFAULT_APARTMENT_DESIGN_PROFILE.serviceBandDepth),
    entryDoorWidth: finitePositive(overrides.entryDoorWidth, DEFAULT_APARTMENT_DESIGN_PROFILE.entryDoorWidth),
    internalDoorWidth: finitePositive(overrides.internalDoorWidth, DEFAULT_APARTMENT_DESIGN_PROFILE.internalDoorWidth),
    exteriorWindowWidth: finitePositive(
      overrides.exteriorWindowWidth,
      DEFAULT_APARTMENT_DESIGN_PROFILE.exteriorWindowWidth,
    ),
    minimumSharedBoundary: finitePositive(
      overrides.minimumSharedBoundary,
      DEFAULT_APARTMENT_DESIGN_PROFILE.minimumSharedBoundary,
    ),
    minimumDaylightGlazingRatio: finitePositive(
      overrides.minimumDaylightGlazingRatio,
      DEFAULT_APARTMENT_DESIGN_PROFILE.minimumDaylightGlazingRatio,
    ),
    accessibleEntryDoorWidth: finitePositive(
      overrides.accessibleEntryDoorWidth,
      DEFAULT_APARTMENT_DESIGN_PROFILE.accessibleEntryDoorWidth,
    ),
    accessibleCirculationWidth: finitePositive(
      overrides.accessibleCirculationWidth,
      DEFAULT_APARTMENT_DESIGN_PROFILE.accessibleCirculationWidth,
    ),
    solarExposureWatchOrientations: Array.isArray(overrides.solarExposureWatchOrientations)
      ? [...new Set(overrides.solarExposureWatchOrientations.filter((entry) => ORIENTATIONS.has(entry)))]
      : [...DEFAULT_APARTMENT_DESIGN_PROFILE.solarExposureWatchOrientations],
    fixtureClearances: Object.fromEntries(
      Object.entries({
        ...DEFAULT_APARTMENT_DESIGN_PROFILE.fixtureClearances,
        ...(overrides.fixtureClearances || {}),
      }).map(([fixtureType, clearance]) => [
        fixtureType,
        finiteNonNegative(clearance, DEFAULT_APARTMENT_DESIGN_PROFILE.fixtureClearances[fixtureType] ?? 300),
      ]),
    ),
    stairWidth: finitePositive(overrides.stairWidth, DEFAULT_APARTMENT_DESIGN_PROFILE.stairWidth),
    targetRiserHeight: finitePositive(overrides.targetRiserHeight, DEFAULT_APARTMENT_DESIGN_PROFILE.targetRiserHeight),
    treadDepth: finitePositive(overrides.treadDepth, DEFAULT_APARTMENT_DESIGN_PROFILE.treadDepth),
    minimumHeadroom: finitePositive(overrides.minimumHeadroom, DEFAULT_APARTMENT_DESIGN_PROFILE.minimumHeadroom),
    maximumEgressTravelDistance: finitePositive(
      overrides.maximumEgressTravelDistance,
      DEFAULT_APARTMENT_DESIGN_PROFILE.maximumEgressTravelDistance,
    ),
  };
}

export function createApartmentDesignState(overrides = {}) {
  return {
    status: overrides.status || 'not_detailed',
    sourceTestFitId: overrides.sourceTestFitId || null,
    inputSignature: overrides.inputSignature || '',
    detailedUnitInstanceIds: [...(overrides.detailedUnitInstanceIds || [])],
    generatedEntityRefs: Object.fromEntries(
      ['rooms', 'walls', 'doors', 'windows', 'fixtures', 'stairs', 'slabOpenings', 'egressExits', 'egressRoutes'].map(
        (collection) => [collection, [...(overrides.generatedEntityRefs?.[collection] || [])]],
      ),
    ),
    confidence: DESIGN_CONFIDENCE.CHECKED,
    professionalReviewRequired: true,
  };
}

function hashValue(value) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function apartmentDesignInputSignature(
  project,
  profile = createApartmentDesignProfile(project?.building?.apartmentDesignProfile),
) {
  const option = (project?.building?.testFitOptions || []).find(
    (entry) => entry.id === project?.building?.acceptedTestFitId,
  );
  return hashValue({
    acceptedTestFitId: option?.id || null,
    testFitInputSignature: option?.inputSignature || null,
    unitTypes: (project?.building?.unitTypes || []).map((entry) => ({
      id: entry.id,
      category: entry.category,
      spaceRequirements: entry.spaceRequirements,
      revision: entry.revision,
    })),
    profile,
  });
}

function pointDistanceToRoom(room, point) {
  let minimum = Number.POSITIVE_INFINITY;
  const points = room.points || [];
  for (let index = 0; index < points.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, points[index], points[(index + 1) % points.length]));
  }
  return minimum;
}

function segmentSharedLength(firstStart, firstEnd, secondStart, secondEnd, tolerance = 1) {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDy = firstEnd.y - firstStart.y;
  const secondDx = secondEnd.x - secondStart.x;
  const secondDy = secondEnd.y - secondStart.y;
  const cross = firstDx * secondDy - firstDy * secondDx;
  const offsetCross = firstDx * (secondStart.y - firstStart.y) - firstDy * (secondStart.x - firstStart.x);
  const firstLength = Math.hypot(firstDx, firstDy);
  if (!firstLength || Math.abs(cross) > tolerance * firstLength || Math.abs(offsetCross) > tolerance * firstLength)
    return 0;
  const axis = Math.abs(firstDx) >= Math.abs(firstDy) ? 'x' : 'y';
  const firstRange = [firstStart[axis], firstEnd[axis]].sort((a, b) => a - b);
  const secondRange = [secondStart[axis], secondEnd[axis]].sort((a, b) => a - b);
  return Math.max(0, Math.min(firstRange[1], secondRange[1]) - Math.max(firstRange[0], secondRange[0]));
}

export function sharedRoomBoundaryLength(firstRoom, secondRoom) {
  let length = 0;
  const first = firstRoom?.points || [];
  const second = secondRoom?.points || [];
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      length += segmentSharedLength(
        first[firstIndex],
        first[(firstIndex + 1) % first.length],
        second[secondIndex],
        second[(secondIndex + 1) % second.length],
      );
    }
  }
  return length;
}

function requiredAdjacencies(category, unitRooms) {
  if (category === 'one_bedroom' || category === 'two_bedroom') {
    return [
      ...unitRooms
        .filter((room) => room.spaceType === 'bedroom')
        .map((room) => ({ firstType: 'living', secondType: 'bedroom', secondRoomId: room.id })),
      { firstType: 'living', secondType: 'kitchen' },
      { firstType: 'living', secondType: 'bathroom' },
    ];
  }
  return [
    { firstType: 'living_sleeping', secondType: 'kitchen' },
    { firstType: 'living_sleeping', secondType: 'bathroom' },
  ];
}

function orientationLabel(angle) {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized >= 45 && normalized < 135) return 'north';
  if (normalized >= 135 && normalized < 225) return 'west';
  if (normalized >= 225 && normalized < 315) return 'south';
  return 'east';
}

function fixtureClearanceEnvelope(fixture, clearance) {
  const outline = fixtureOutline(fixture);
  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  return [
    { x: Math.min(...xs) - clearance, y: Math.min(...ys) - clearance },
    { x: Math.max(...xs) + clearance, y: Math.min(...ys) - clearance },
    { x: Math.max(...xs) + clearance, y: Math.max(...ys) + clearance },
    { x: Math.min(...xs) - clearance, y: Math.max(...ys) + clearance },
  ];
}

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'configured_rule_check') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'apartment_design_coordination',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

function analyzeWindows(project, roomIndex) {
  const result = new Map([...roomIndex.keys()].map((roomId) => [roomId, []]));
  const northAngle = project?.building?.site?.northAngle || 0;
  for (const floor of project?.floors || []) {
    const walls = new Map((floor.walls || []).map((wall) => [wall.id, wall]));
    for (const window of floor.windows || []) {
      const wall = walls.get(window.wallId);
      if (!wall) continue;
      const center = positionOnWall(wall, window.offset);
      const adjacentRooms = (floor.rooms || []).filter((room) => pointDistanceToRoom(room, center) <= 35);
      if (adjacentRooms.length !== 1) continue;
      const room = adjacentRooms[0];
      const centroid = room.labelPosition || polygonCentroid(room.points || []);
      const bearing = ((Math.atan2(center.y - centroid.y, center.x - centroid.x) * 180) / Math.PI + 360) % 360;
      result.get(room.id)?.push({
        id: window.id,
        glazingArea: (window.width || 0) * (window.height || 0),
        bearing,
        siteRelativeBearing: (bearing - northAngle + 360) % 360,
        orientation: orientationLabel(bearing - northAngle),
      });
    }
  }
  return result;
}

export function deriveApartmentDesignCoordination(project) {
  const building = project?.building || {};
  const profile = createApartmentDesignProfile(building.apartmentDesignProfile);
  const state = createApartmentDesignState(building.apartmentDesign);
  const rooms = new Map();
  for (const floor of project?.floors || []) {
    for (const room of floor.rooms || []) rooms.set(room.id, { room, floorId: floor.id });
  }
  const windowsByRoom = analyzeWindows(project, rooms);
  const types = new Map((building.unitTypes || []).map((entry) => [entry.id, entry]));
  const egressRoomIds = new Set((building.systems?.egress?.routes || []).map((entry) => entry.fromRoomId));
  const units = (building.unitInstances || []).map((instance) => {
    const unitType = types.get(instance.typeId);
    const unitRooms = (instance.roomIds || []).map((id) => rooms.get(id)?.room).filter(Boolean);
    const adjacencyPairs = [];
    for (let first = 0; first < unitRooms.length; first += 1) {
      for (let second = first + 1; second < unitRooms.length; second += 1) {
        const sharedLength = sharedRoomBoundaryLength(unitRooms[first], unitRooms[second]);
        if (sharedLength > 0)
          adjacencyPairs.push({
            firstRoomId: unitRooms[first].id,
            secondRoomId: unitRooms[second].id,
            firstSpaceType: unitRooms[first].spaceType,
            secondSpaceType: unitRooms[second].spaceType,
            sharedLength,
          });
      }
    }
    const requirements = requiredAdjacencies(unitType?.category, unitRooms).map((requirement) => ({
      ...requirement,
      satisfied: adjacencyPairs.some((pair) => {
        const typeMatch =
          (pair.firstSpaceType === requirement.firstType && pair.secondSpaceType === requirement.secondType) ||
          (pair.firstSpaceType === requirement.secondType && pair.secondSpaceType === requirement.firstType);
        const roomMatch =
          !requirement.secondRoomId ||
          pair.firstRoomId === requirement.secondRoomId ||
          pair.secondRoomId === requirement.secondRoomId;
        return pair.sharedLength >= profile.minimumSharedBoundary && typeMatch && roomMatch;
      }),
    }));
    const primaryRoom = unitRooms.find((room) => ['living', 'living_sleeping'].includes(room.spaceType));
    return {
      instanceId: instance.id,
      floorId: instance.floorId,
      unitTypeId: instance.typeId,
      category: unitType?.category || 'custom',
      roomCount: unitRooms.length,
      adjacencyPairs,
      adjacencyRequirements: requirements,
      adjacencyComplete: requirements.every((entry) => entry.satisfied),
      hasModeledEgress: primaryRoom ? egressRoomIds.has(primaryRoom.id) : false,
      primaryRoomId: primaryRoom?.id || null,
    };
  });
  const roomEnvironmental = [...rooms.values()].map(({ room, floorId }) => {
    const windows = windowsByRoom.get(room.id) || [];
    const area = room.area || polygonArea(room.points || []);
    const glazingArea = windows.reduce((total, entry) => total + entry.glazingArea, 0);
    return {
      roomId: room.id,
      floorId,
      spaceType: room.spaceType,
      area,
      glazingArea,
      glazingRatio: glazingArea / Math.max(1, area),
      windowIds: windows.map((entry) => entry.id),
      orientations: [...new Set(windows.map((entry) => entry.orientation))],
    };
  });
  const fixtures = (project?.floors || []).flatMap((floor) =>
    (floor.fixtures || [])
      .filter((fixture) => fixture.roomId)
      .map((fixture) => {
        const room = rooms.get(fixture.roomId)?.room;
        const clearance = profile.fixtureClearances[fixture.fixtureType] ?? 300;
        const envelope = fixtureClearanceEnvelope(fixture, clearance);
        const envelopeArea = polygonArea(envelope);
        const coveredArea = room ? intersectionArea(envelope, room.points || []) : 0;
        return {
          floorId: floor.id,
          fixtureId: fixture.id,
          fixtureType: fixture.fixtureType,
          roomId: fixture.roomId,
          clearance,
          outline: fixtureOutline(fixture),
          envelope,
          clearanceCoveredArea: coveredArea,
          clearanceRequiredArea: envelopeArea,
          clearanceInsideRoom: Boolean(room) && envelopeArea - coveredArea <= 100,
        };
      }),
  );
  const fixtureClearanceConflicts = [];
  for (let first = 0; first < fixtures.length; first += 1) {
    for (let second = first + 1; second < fixtures.length; second += 1) {
      const a = fixtures[first];
      const b = fixtures[second];
      if (a.floorId !== b.floorId || a.roomId !== b.roomId) continue;
      const overlapA = intersectionArea(a.envelope, b.outline);
      const overlapB = intersectionArea(b.envelope, a.outline);
      if (overlapA <= 100 && overlapB <= 100) continue;
      fixtureClearanceConflicts.push({
        floorId: a.floorId,
        roomId: a.roomId,
        firstFixtureId: a.fixtureId,
        secondFixtureId: b.fixtureId,
        firstClearanceOverlap: overlapA,
        secondClearanceOverlap: overlapB,
      });
    }
  }
  const corridorWidths = (project?.floors || []).flatMap((floor) =>
    (floor.rooms || [])
      .filter((room) => room.spaceType === 'shared_corridor')
      .map((room) => {
        const roomBounds = (room.points || []).reduce(
          (result, point) => ({
            minX: Math.min(result.minX, point.x),
            minY: Math.min(result.minY, point.y),
            maxX: Math.max(result.maxX, point.x),
            maxY: Math.max(result.maxY, point.y),
          }),
          { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
        );
        return {
          floorId: floor.id,
          roomId: room.id,
          width: Math.min(roomBounds.maxX - roomBounds.minX, roomBounds.maxY - roomBounds.minY),
        };
      }),
  );
  const entryDoors = (project?.floors || []).flatMap((floor) =>
    (floor.doors || [])
      .filter((door) => door.role === 'unit_entry')
      .map((door) => ({ floorId: floor.id, doorId: door.id, width: door.width })),
  );
  const accessibilityRequested = Boolean(String(building.brief?.accessibilityRequirements || '').trim());
  return {
    profile,
    state,
    currentInputSignature: apartmentDesignInputSignature(project, profile),
    outOfDate: state.status === 'detailed' && state.inputSignature !== apartmentDesignInputSignature(project, profile),
    units,
    detailedUnitCount: units.filter((entry) => entry.roomCount > 1).length,
    adjacencyCompleteUnitCount: units.filter((entry) => entry.adjacencyComplete).length,
    egressCompleteUnitCount: units.filter((entry) => entry.hasModeledEgress).length,
    roomEnvironmental,
    daylightReadyRoomCount: roomEnvironmental.filter(
      (entry) => entry.glazingRatio >= profile.minimumDaylightGlazingRatio,
    ).length,
    fixtures,
    fixtureClearanceConflicts,
    fixtureClearancePassCount: fixtures.filter((entry) => entry.clearanceInsideRoom).length,
    accessibility: {
      requested: accessibilityRequested,
      corridorWidths,
      entryDoors,
      corridorPassCount: corridorWidths.filter((entry) => entry.width >= profile.accessibleCirculationWidth).length,
      entryDoorPassCount: entryDoors.filter((entry) => entry.width >= profile.accessibleEntryDoorWidth).length,
    },
    actualStairCount: (project?.floors || []).reduce((total, floor) => total + (floor.stairs || []).length, 0),
    professionalReviewRequired: true,
  };
}

export function validateApartmentDesignCoordination(project) {
  const building = project?.building || {};
  const acceptedId = building.acceptedTestFitId;
  const derived = deriveApartmentDesignCoordination(project);
  const issues = [];
  if (acceptedId && derived.state.status !== 'detailed') {
    issues.push(
      issue(
        'APARTMENT.DESIGN_NOT_DETAILED',
        'warning',
        'The accepted test fit remains a block layout and has not been converted into detailed apartment rooms and circulation.',
        [{ type: 'testFitOption', id: acceptedId }],
        { acceptedTestFitId: acceptedId, apartmentDesignStatus: derived.state.status },
        'missing_coordination_geometry',
      ),
    );
    return issues;
  }
  if (derived.state.status !== 'detailed') return issues;
  if (derived.state.sourceTestFitId !== acceptedId) {
    issues.push(
      issue(
        'APARTMENT.SOURCE_TEST_FIT_MISMATCH',
        'error',
        'Detailed apartment geometry references a different accepted test fit.',
        [{ type: 'building', id: building.id }],
        { sourceTestFitId: derived.state.sourceTestFitId, acceptedTestFitId: acceptedId },
        'relationship_check',
      ),
    );
  }
  if (derived.outOfDate) {
    issues.push(
      issue(
        'APARTMENT.DESIGN_OUTDATED',
        'warning',
        'Apartment detailing is out of date with the accepted test fit, unit program, or design assumptions.',
        [{ type: 'building', id: building.id }],
        { storedInputSignature: derived.state.inputSignature, currentInputSignature: derived.currentInputSignature },
      ),
    );
  }
  for (const unit of derived.units) {
    for (const requirement of unit.adjacencyRequirements.filter((entry) => !entry.satisfied)) {
      issues.push(
        issue(
          'APARTMENT.REQUIRED_ADJACENCY_MISSING',
          'warning',
          `Unit lacks the configured ${requirement.firstType}–${requirement.secondType} adjacency.`,
          [{ type: 'unitInstance', id: unit.instanceId }],
          {
            floorId: unit.floorId,
            unitTypeId: unit.unitTypeId,
            ...requirement,
            configuredMinimumSharedBoundary: derived.profile.minimumSharedBoundary,
          },
          'verified_geometry',
        ),
      );
    }
    if (!unit.hasModeledEgress) {
      issues.push(
        issue(
          'APARTMENT.EGRESS_ROUTE_MISSING',
          'warning',
          'Unit has no modeled primary-room-to-stair/exit circulation path.',
          [{ type: 'unitInstance', id: unit.instanceId }],
          { floorId: unit.floorId, primaryRoomId: unit.primaryRoomId },
          'relationship_check',
        ),
      );
    }
  }
  for (const fixture of derived.fixtures.filter((entry) => !entry.clearanceInsideRoom)) {
    issues.push(
      issue(
        'APARTMENT.FIXTURE_CLEARANCE_OUTSIDE_ROOM',
        'warning',
        'Configured furniture or fixture clearance extends outside its assigned room.',
        [
          { type: 'fixture', id: fixture.fixtureId },
          { type: 'room', id: fixture.roomId },
        ],
        {
          floorId: fixture.floorId,
          fixtureType: fixture.fixtureType,
          clearance: fixture.clearance,
          requiredArea: fixture.clearanceRequiredArea,
          coveredArea: fixture.clearanceCoveredArea,
        },
        'verified_geometry',
      ),
    );
  }
  for (const conflict of derived.fixtureClearanceConflicts) {
    issues.push(
      issue(
        'APARTMENT.FIXTURE_CLEARANCE_CONFLICT',
        'warning',
        'A furniture or fixture intrudes into another configured clearance envelope.',
        [
          { type: 'fixture', id: conflict.firstFixtureId },
          { type: 'fixture', id: conflict.secondFixtureId },
        ],
        conflict,
        'verified_geometry',
      ),
    );
  }
  for (const room of derived.roomEnvironmental.filter(
    (entry) =>
      ['living', 'living_sleeping', 'bedroom'].includes(entry.spaceType) &&
      entry.glazingRatio < derived.profile.minimumDaylightGlazingRatio,
  )) {
    issues.push(
      issue(
        'ENV.DAYLIGHT_GLAZING_BELOW_ASSUMPTION',
        'warning',
        'Room glazing area is below the configured daylight-potential ratio.',
        [{ type: 'room', id: room.roomId }],
        {
          floorId: room.floorId,
          glazingArea: room.glazingArea,
          roomArea: room.area,
          glazingRatio: room.glazingRatio,
          configuredMinimum: derived.profile.minimumDaylightGlazingRatio,
          orientations: room.orientations,
        },
        'verified_geometry',
      ),
    );
  }
  for (const room of derived.roomEnvironmental.filter(
    (entry) =>
      ['living', 'living_sleeping', 'bedroom'].includes(entry.spaceType) &&
      entry.orientations.some((orientation) => derived.profile.solarExposureWatchOrientations.includes(orientation)),
  )) {
    issues.push(
      issue(
        'ENV.SOLAR_EXPOSURE_REVIEW',
        'warning',
        'Habitable-room glazing faces a configured solar-exposure review orientation.',
        [{ type: 'room', id: room.roomId }],
        {
          floorId: room.floorId,
          orientations: room.orientations,
          reviewOrientations: derived.profile.solarExposureWatchOrientations,
          method: 'site_north_relative_window_bearing',
        },
        'verified_geometry',
      ),
    );
  }
  if (derived.accessibility.requested) {
    for (const corridor of derived.accessibility.corridorWidths.filter(
      (entry) => entry.width < derived.profile.accessibleCirculationWidth,
    )) {
      issues.push(
        issue(
          'ACCESS.CORRIDOR_WIDTH_BELOW_INTENT',
          'warning',
          'Shared corridor width is below the configured accessibility-intent assumption.',
          [{ type: 'room', id: corridor.roomId }],
          {
            floorId: corridor.floorId,
            measuredWidth: corridor.width,
            configuredMinimum: derived.profile.accessibleCirculationWidth,
            accessibilityRequirements: building.brief.accessibilityRequirements,
          },
          'verified_geometry',
        ),
      );
    }
    for (const door of derived.accessibility.entryDoors.filter(
      (entry) => entry.width < derived.profile.accessibleEntryDoorWidth,
    )) {
      issues.push(
        issue(
          'ACCESS.ENTRY_DOOR_WIDTH_BELOW_INTENT',
          'warning',
          'Unit entry width is below the configured accessibility-intent assumption.',
          [{ type: 'door', id: door.doorId }],
          {
            floorId: door.floorId,
            measuredWidth: door.width,
            configuredMinimum: derived.profile.accessibleEntryDoorWidth,
            accessibilityRequirements: building.brief.accessibilityRequirements,
          },
          'verified_geometry',
        ),
      );
    }
  }
  const requiredStairs = Math.max(0, (project?.floors || []).length - 1);
  if (derived.actualStairCount < requiredStairs) {
    issues.push(
      issue(
        'APARTMENT.STAIR_CORE_NOT_CONVERTED',
        'warning',
        'Not every level transition has actual modeled stair geometry.',
        [{ type: 'building', id: building.id }],
        { requiredStairs, actualStairs: derived.actualStairCount },
        'relationship_check',
      ),
    );
  }
  return issues;
}
