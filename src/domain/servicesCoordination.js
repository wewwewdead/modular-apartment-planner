import { segmentIntersection } from '@/geometry/line';
import { distance } from '@/geometry/point';
import { pointInPolygon, polygonCentroid } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { positionOnWall } from '@/geometry/wallGeometry';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_SERVICES_COORDINATION_PROFILE = Object.freeze({
  id: 'delta_small_apartment_services_assumptions_v1',
  minimumDrainSlopePercent: 1,
  maximumEgressTravelDistance: 30_000,
  routeEndpointTolerance: 150,
  doorPassageTolerance: 75,
  minimumVerticalOpeningOverlap: 10_000,
  source: 'configured_product_assumption_not_code_or_trade_design',
});

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function rectangleAround(origin, width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: origin.x - halfWidth, y: origin.y - halfDepth },
    { x: origin.x + halfWidth, y: origin.y - halfDepth },
    { x: origin.x + halfWidth, y: origin.y + halfDepth },
    { x: origin.x - halfWidth, y: origin.y + halfDepth },
  ];
}

export function createElectricalRiserZone(options) {
  return {
    id: options.id,
    name: options.name || 'Electrical riser',
    origin: clonePoint(options.origin),
    width: options.width,
    depth: options.depth,
    servedFloorIds: [...(options.servedFloorIds || [])],
    openingClearance: options.openingClearance ?? 100,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
    generatedByServicesRealizationId: options.generatedByServicesRealizationId || null,
    generatedByTestFitId: options.generatedByTestFitId || null,
  };
}

export function createDrainageRoute(options) {
  return {
    id: options.id,
    name: options.name || 'Drainage planning route',
    sourceShaftId: options.sourceShaftId,
    floorId: options.floorId,
    points: (options.points || []).map(clonePoint),
    startInvertElevation: options.startInvertElevation,
    endInvertElevation: options.endInvertElevation,
    minimumSlopePercent: options.minimumSlopePercent ?? DEFAULT_SERVICES_COORDINATION_PROFILE.minimumDrainSlopePercent,
    dischargeType: options.dischargeType || 'site_connection_for_professional_confirmation',
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
    targetFixtureId: options.targetFixtureId || null,
    routingMethod: options.routingMethod || null,
    generatedByServicesRealizationId: options.generatedByServicesRealizationId || null,
    generatedByTestFitId: options.generatedByTestFitId || null,
  };
}

export function createEgressExit(options) {
  return {
    id: options.id,
    name: options.name || 'Modeled exit',
    floorId: options.floorId,
    point: clonePoint(options.point),
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

export function createEgressRoute(options) {
  return {
    id: options.id,
    name: options.name || 'Room-to-exit route',
    floorId: options.floorId,
    fromRoomId: options.fromRoomId,
    exitId: options.exitId,
    points: (options.points || []).map(clonePoint),
    maximumTravelDistance:
      options.maximumTravelDistance ?? DEFAULT_SERVICES_COORDINATION_PROFILE.maximumEgressTravelDistance,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

export function routeLength(points = []) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return total;
}

export function drainageRouteMetrics(route) {
  const planLength = routeLength(route.points);
  const fall = (route.startInvertElevation ?? 0) - (route.endInvertElevation ?? 0);
  return {
    planLength,
    fall,
    slopePercent: planLength > 0 ? (fall / planLength) * 100 : null,
  };
}

function issue(ruleId, category, severity, message, entityRefs, inputs, resultKind = 'configured_rule_check') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category,
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

function validateServedLevels(entity, type, floors, profile, issues) {
  const floorIndex = new Map(floors.map((floor, index) => [floor.id, index]));
  const indices = [...new Set(entity.servedFloorIds || [])].map((floorId) => floorIndex.get(floorId));
  if (!indices.length || indices.some((index) => index == null)) {
    issues.push(
      issue(
        'SERVICE.VERTICAL_LEVEL_REFERENCE_INVALID',
        'building_systems',
        'error',
        `${entity.name} must reference existing served levels.`,
        [{ type, id: entity.id }],
        { profileId: profile.id, profileSource: profile.source, servedFloorIds: entity.servedFloorIds || [] },
        'relationship_check',
      ),
    );
    return [];
  }
  const sorted = [...indices].sort((a, b) => a - b);
  if (!sorted.every((index, position) => position === 0 || index === sorted[position - 1] + 1)) {
    issues.push(
      issue(
        'SERVICE.VERTICAL_ROUTE_DISCONTINUOUS',
        'building_systems',
        'error',
        `${entity.name} skips an intermediate level.`,
        [{ type, id: entity.id }],
        { profileId: profile.id, profileSource: profile.source, servedFloorIds: entity.servedFloorIds || [] },
        'relationship_check',
      ),
    );
  }
  return sorted;
}

function verticalServiceOpeningMatches(floor, footprint, serviceKind, serviceId, minimumOverlap) {
  for (const slab of floor.slabs || []) {
    for (const opening of slab.openings || []) {
      const explicitlyLinked = opening.serviceRef?.kind === serviceKind && opening.serviceRef?.id === serviceId;
      const geometricallyOverlapping = intersectionArea(footprint, opening.boundaryPoints || []) >= minimumOverlap;
      if (explicitlyLinked && geometricallyOverlapping) return { slab, opening };
    }
  }
  return null;
}

function validateVerticalServiceOpenings(project, profile, issues) {
  const floors = project.floors || [];
  const serviceGroups = [
    ['plumbingShaft', 'plumbing', project.building?.systems?.plumbing?.shafts || []],
    ['electricalRiser', 'electrical', project.building?.systems?.electrical?.riserZones || []],
  ];
  for (const [type, kind, entities] of serviceGroups) {
    for (const entity of entities) {
      const indices = validateServedLevels(entity, type, floors, profile, issues);
      const footprint = rectangleAround(entity.origin, entity.width, entity.depth);
      for (const index of indices.slice(1)) {
        const floor = floors[index];
        const match = verticalServiceOpeningMatches(
          floor,
          footprint,
          kind,
          entity.id,
          profile.minimumVerticalOpeningOverlap,
        );
        if (match) continue;
        issues.push(
          issue(
            'SERVICE.VERTICAL_OPENING_MISSING',
            'vertical_coordination',
            'error',
            `${entity.name} has no linked slab opening on ${floor.name}.`,
            [
              { type, id: entity.id },
              { type: 'floor', id: floor.id },
            ],
            {
              profileId: profile.id,
              profileSource: profile.source,
              floorId: floor.id,
              footprint,
              requiredServiceRef: { kind, id: entity.id },
            },
            'relationship_check',
          ),
        );
      }

      if (kind === 'electrical') {
        for (const floorId of entity.servedFloorIds || []) {
          const floor = floors.find((entry) => entry.id === floorId);
          if (!floor) continue;
          for (const column of floor.columns || []) {
            const columnFootprint = rectangleAround(column, column.width, column.depth);
            const overlapArea = intersectionArea(footprint, columnFootprint);
            if (overlapArea <= 0) continue;
            issues.push(
              issue(
                'SERVICE.ELECTRICAL_RISER_COLUMN_CONFLICT',
                'building_systems',
                'error',
                'Electrical riser zone intersects a modeled column.',
                [
                  { type: 'electricalRiser', id: entity.id },
                  { type: 'column', id: column.id },
                ],
                { profileId: profile.id, profileSource: profile.source, floorId, overlapArea, units: 'mm²' },
                'verified_geometry',
              ),
            );
          }
        }
      }
    }
  }
}

function validateDrainage(project, profile, issues) {
  const shaftById = new Map((project.building?.systems?.plumbing?.shafts || []).map((shaft) => [shaft.id, shaft]));
  const floorIds = new Set((project.floors || []).map((floor) => floor.id));
  for (const route of project.building?.systems?.plumbing?.drainageRoutes || []) {
    const refs = [{ type: 'drainageRoute', id: route.id }];
    const shaft = shaftById.get(route.sourceShaftId);
    const baseInputs = { profileId: profile.id, profileSource: profile.source, floorId: route.floorId };
    if (!shaft || !floorIds.has(route.floorId)) {
      issues.push(
        issue(
          'SERVICE.DRAINAGE_REFERENCE_BROKEN',
          'building_systems',
          'error',
          'Drainage route must reference an existing shaft and level.',
          refs,
          { ...baseInputs, sourceShaftId: route.sourceShaftId },
          'relationship_check',
        ),
      );
      continue;
    }
    if ((route.points || []).length < 2) {
      issues.push(
        issue(
          'SERVICE.DRAINAGE_PATH_INCOMPLETE',
          'building_systems',
          'error',
          'Drainage route needs at least two plan points.',
          refs,
          baseInputs,
          'relationship_check',
        ),
      );
      continue;
    }
    const shaftFootprint = rectangleAround(shaft.origin, shaft.width, shaft.depth);
    if (!pointInPolygon(route.points[0], shaftFootprint)) {
      issues.push(
        issue(
          'SERVICE.DRAINAGE_SOURCE_OUTSIDE_SHAFT',
          'building_systems',
          'error',
          'Drainage route does not begin inside its referenced shaft.',
          refs,
          { ...baseInputs, sourcePoint: route.points[0], shaftFootprint },
          'verified_geometry',
        ),
      );
    }
    const metrics = drainageRouteMetrics(route);
    if (metrics.fall <= 0 || metrics.slopePercent < route.minimumSlopePercent) {
      issues.push(
        issue(
          'SERVICE.DRAINAGE_SLOPE_BELOW_ASSUMPTION',
          'building_systems',
          'warning',
          'Drainage route fall is below the configured planning assumption.',
          refs,
          {
            ...baseInputs,
            ...metrics,
            configuredMinimum: route.minimumSlopePercent,
            invertElevations: [route.startInvertElevation, route.endInvertElevation],
          },
          'verified_geometry',
        ),
      );
    }
    if (route.targetFixtureId) {
      const floor = (project.floors || []).find((entry) => entry.id === route.floorId);
      const fixture = (floor?.fixtures || []).find((entry) => entry.id === route.targetFixtureId);
      if (!fixture) {
        issues.push(
          issue(
            'SERVICE.DRAINAGE_FIXTURE_REFERENCE_BROKEN',
            'building_systems',
            'error',
            'Drainage route references a missing target fixture.',
            refs,
            { ...baseInputs, targetFixtureId: route.targetFixtureId },
            'relationship_check',
          ),
        );
      } else {
        const endpointOffset = distance(route.points.at(-1), fixture);
        if (endpointOffset > profile.routeEndpointTolerance)
          issues.push(
            issue(
              'SERVICE.DRAINAGE_FIXTURE_ENDPOINT_MISMATCH',
              'building_systems',
              'error',
              'Drainage route does not terminate at its referenced fixture.',
              refs,
              { ...baseInputs, targetFixtureId: fixture.id, endpointOffset, tolerance: profile.routeEndpointTolerance },
              'verified_geometry',
            ),
          );
      }
    }
  }
}

function routeCrossesWallOutsideDoor(segmentStart, segmentEnd, wall, doors, tolerance) {
  const hit = segmentIntersection(segmentStart, segmentEnd, wall.start, wall.end);
  if (!hit) return null;
  const hostedDoors = doors.filter((door) => door.wallId === wall.id);
  const passesDoor = hostedDoors.some((door) => {
    const center = positionOnWall(wall, door.offset);
    return distance(center, hit) <= (door.width || 0) / 2 + tolerance;
  });
  return passesDoor ? null : hit;
}

function validateEgress(project, profile, issues) {
  const exits = project.building?.systems?.egress?.exits || [];
  const routes = project.building?.systems?.egress?.routes || [];
  const exitById = new Map(exits.map((exit) => [exit.id, exit]));
  const floors = new Map((project.floors || []).map((floor) => [floor.id, floor]));

  for (const exit of exits) {
    if (floors.has(exit.floorId)) continue;
    issues.push(
      issue(
        'EGRESS.EXIT_LEVEL_REFERENCE_BROKEN',
        'egress_coordination',
        'error',
        `${exit.name} references a missing level.`,
        [{ type: 'egressExit', id: exit.id }],
        { profileId: profile.id, profileSource: profile.source, floorId: exit.floorId },
        'relationship_check',
      ),
    );
  }

  for (const route of routes) {
    const refs = [{ type: 'egressRoute', id: route.id }];
    const floor = floors.get(route.floorId);
    const room = (floor?.rooms || []).find((entry) => entry.id === route.fromRoomId);
    const exit = exitById.get(route.exitId);
    const baseInputs = { profileId: profile.id, profileSource: profile.source, floorId: route.floorId };
    if (!floor || !room || !exit || exit.floorId !== route.floorId) {
      issues.push(
        issue(
          'EGRESS.ROUTE_REFERENCE_BROKEN',
          'egress_coordination',
          'error',
          'Egress route must connect a room to an exit on the same level.',
          refs,
          { ...baseInputs, fromRoomId: route.fromRoomId, exitId: route.exitId },
          'relationship_check',
        ),
      );
      continue;
    }
    if ((route.points || []).length < 2) {
      issues.push(
        issue(
          'EGRESS.ROUTE_GEOMETRY_INCOMPLETE',
          'egress_coordination',
          'error',
          'Egress route needs at least two plan points.',
          refs,
          baseInputs,
          'relationship_check',
        ),
      );
      continue;
    }
    const firstPoint = route.points[0];
    const lastPoint = route.points[route.points.length - 1];
    if (!pointInPolygon(firstPoint, room.points || [])) {
      issues.push(
        issue(
          'EGRESS.ROUTE_START_OUTSIDE_ROOM',
          'egress_coordination',
          'error',
          'Egress route does not begin inside its referenced room.',
          refs,
          { ...baseInputs, startPoint: firstPoint, roomId: room.id },
          'verified_geometry',
        ),
      );
    }
    const exitOffset = distance(lastPoint, exit.point);
    if (exitOffset > profile.routeEndpointTolerance) {
      issues.push(
        issue(
          'EGRESS.ROUTE_END_MISSES_EXIT',
          'egress_coordination',
          'error',
          'Egress route does not terminate at its referenced exit.',
          refs,
          { ...baseInputs, exitOffset, tolerance: profile.routeEndpointTolerance },
          'verified_geometry',
        ),
      );
    }
    const measuredLength = routeLength(route.points);
    if (measuredLength > route.maximumTravelDistance) {
      issues.push(
        issue(
          'EGRESS.TRAVEL_DISTANCE_EXCEEDS_ASSUMPTION',
          'egress_coordination',
          'warning',
          'Modeled room-to-exit route exceeds the configured planning distance.',
          refs,
          { ...baseInputs, measuredLength, configuredMaximum: route.maximumTravelDistance },
          'verified_geometry',
        ),
      );
    }
    for (let index = 1; index < route.points.length; index += 1) {
      for (const wall of floor.walls || []) {
        const hit = routeCrossesWallOutsideDoor(
          route.points[index - 1],
          route.points[index],
          wall,
          floor.doors || [],
          profile.doorPassageTolerance,
        );
        if (!hit) continue;
        issues.push(
          issue(
            'EGRESS.ROUTE_CROSSES_WALL_WITHOUT_DOOR',
            'egress_coordination',
            'error',
            'Egress route crosses a modeled wall outside a door opening.',
            [...refs, { type: 'wall', id: wall.id }],
            {
              ...baseInputs,
              segmentIndex: index - 1,
              intersection: hit,
              doorPassageTolerance: profile.doorPassageTolerance,
            },
            'verified_geometry',
          ),
        );
      }
    }
  }
}

export function validateServicesCoordination(project, profileOverride = null) {
  const configured = project.building?.systems?.coordinationProfile || {};
  const profile = { ...DEFAULT_SERVICES_COORDINATION_PROFILE, ...configured, ...(profileOverride || {}) };
  const issues = [];
  validateVerticalServiceOpenings(project, profile, issues);
  validateDrainage(project, profile, issues);
  validateEgress(project, profile, issues);
  return issues;
}

export function deriveServicesCoordination(project) {
  const plumbing = project.building?.systems?.plumbing || {};
  const electrical = project.building?.systems?.electrical || {};
  const egress = project.building?.systems?.egress || {};
  const routes = egress.routes || [];
  return {
    plumbingShaftCount: (plumbing.shafts || []).length,
    electricalRiserCount: (electrical.riserZones || []).length,
    drainageRouteCount: (plumbing.drainageRoutes || []).length,
    egressExitCount: (egress.exits || []).length,
    egressRouteCount: routes.length,
    routedRoomCount: new Set(routes.map((route) => route.fromRoomId)).size,
    totalEgressTravelDistance: routes.reduce((total, route) => total + routeLength(route.points), 0),
    profile: { ...DEFAULT_SERVICES_COORDINATION_PROFILE, ...(project.building?.systems?.coordinationProfile || {}) },
  };
}

export function defaultEgressRoutePoints(room, exit, waypoints = []) {
  return [polygonCentroid(room.points || []), ...waypoints.map(clonePoint), clonePoint(exit.point)];
}

export function serviceFootprint(entity) {
  return rectangleAround(entity.origin, entity.width, entity.depth);
}
