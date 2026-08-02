import { DESIGN_CONFIDENCE } from './trustModels';
import { distance, rotate } from '@/geometry/point';
import { pointInPolygon, polygonArea, polygonCentroid } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';

export const DEFAULT_PARKING_COORDINATION_PROFILE = Object.freeze({
  id: 'owner_parking_planning_v1',
  source: 'configured_early_planning_assumption_not_traffic_or_code_approval',
  minimumBayWidth: 2400,
  minimumBayLength: 4800,
  minimumAccessWidth: 3000,
  roadConnectionTolerance: 300,
  bayAccessTolerance: 500,
  minimumRouteSegmentLength: 1500,
});

function point(value = {}) {
  return { x: Number(value.x) || 0, y: Number(value.y) || 0 };
}

export function parkingBayPolygon(bay) {
  const center = point(bay.origin);
  const halfWidth = bay.width / 2;
  const halfLength = bay.length / 2;
  return [
    { x: center.x - halfWidth, y: center.y - halfLength },
    { x: center.x + halfWidth, y: center.y - halfLength },
    { x: center.x + halfWidth, y: center.y + halfLength },
    { x: center.x - halfWidth, y: center.y + halfLength },
  ].map((entry) => rotate(entry, center, bay.angle || 0));
}

export function createParkingBay(overrides = {}) {
  return {
    id: overrides.id,
    name: overrides.name || 'Parking bay',
    origin: point(overrides.origin),
    width: Number(overrides.width) || 2500,
    length: Number(overrides.length) || 5000,
    angle: Number(overrides.angle) || 0,
    accessible: Boolean(overrides.accessible),
    location: overrides.location === 'covered' ? 'covered' : 'open_site',
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

export function createVehicleAccessRoute(overrides = {}) {
  return {
    id: overrides.id,
    name: overrides.name || 'Vehicle access route',
    roadEdgeIndex: Number.isInteger(overrides.roadEdgeIndex) ? overrides.roadEdgeIndex : 0,
    points: (overrides.points || []).map(point),
    clearWidth: Number(overrides.clearWidth) || 3000,
    servedBayIds: [...new Set(overrides.servedBayIds || [])],
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

export function createParkingPlan(overrides = {}) {
  return {
    profile: { ...DEFAULT_PARKING_COORDINATION_PROFILE, ...(overrides.profile || {}) },
    bays: (overrides.bays || []).filter((entry) => entry?.id).map(createParkingBay),
    accessRoutes: (overrides.accessRoutes || []).filter((entry) => entry?.id).map(createVehicleAccessRoute),
  };
}

function pointToSegmentDistance(target, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(target, start);
  const ratio = Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared));
  return distance(target, { x: start.x + ratio * dx, y: start.y + ratio * dy });
}

function routeDistanceToPoint(route, target) {
  if ((route.points || []).length < 2) return Infinity;
  return Math.min(
    ...route.points.slice(1).map((end, index) => pointToSegmentDistance(target, route.points[index], end)),
  );
}

function parkingIssue(ruleId, severity, message, entityRefs, inputs, resultKind = 'verified_geometry') {
  return {
    id: `${ruleId}:${entityRefs.map((entry) => `${entry.type}:${entry.id}`).join('|')}`,
    ruleId,
    category: 'site_access_parking',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

export function deriveParkingCoordination(project) {
  const plan = createParkingPlan(project?.building?.site?.parkingPlan);
  const targetCount =
    project?.building?.spaceProgram?.parkingRequirement ?? project?.building?.brief?.parkingRequirement ?? 0;
  const servedBayIds = new Set(plan.accessRoutes.flatMap((entry) => entry.servedBayIds));
  return {
    plan,
    targetCount,
    modeledBayCount: plan.bays.length,
    accessibleBayCount: plan.bays.filter((entry) => entry.accessible).length,
    accessRouteCount: plan.accessRoutes.length,
    explicitlyServedBayCount: plan.bays.filter((entry) => servedBayIds.has(entry.id)).length,
    professionalReviewRequired: true,
  };
}

export function validateParkingCoordination(project) {
  const site = project?.building?.site || {};
  const coordination = deriveParkingCoordination(project);
  const { plan, targetCount } = coordination;
  if (!plan.bays.length && !plan.accessRoutes.length && !targetCount) return [];
  const issues = [];
  const profile = plan.profile;
  if (plan.bays.length < targetCount) {
    issues.push(
      parkingIssue(
        'PARKING.COUNT_BELOW_PROGRAM',
        'warning',
        'Modeled parking bays do not meet the configured apartment-program target.',
        [{ type: 'site', id: site.boundaryId || project.building.id }],
        { targetCount, modeledBayCount: plan.bays.length },
        'configured_rule_check',
      ),
    );
  }
  const groundSlabs = project?.floors?.[0]?.slabs || [];
  for (const bay of plan.bays) {
    const polygon = parkingBayPolygon(bay);
    const area = polygonArea(polygon);
    if (bay.width < profile.minimumBayWidth || bay.length < profile.minimumBayLength) {
      issues.push(
        parkingIssue(
          'PARKING.BAY_BELOW_ASSUMPTION',
          'warning',
          `${bay.name} is smaller than the configured owner planning dimensions.`,
          [{ type: 'parkingBay', id: bay.id }],
          {
            width: bay.width,
            length: bay.length,
            minimumBayWidth: profile.minimumBayWidth,
            minimumBayLength: profile.minimumBayLength,
            profileId: profile.id,
          },
          'configured_rule_check',
        ),
      );
    }
    if (site.boundary?.length >= 3 && intersectionArea(polygon, site.boundary) < area - 1) {
      issues.push(
        parkingIssue(
          'PARKING.BAY_OUTSIDE_PROPERTY',
          'error',
          `${bay.name} extends outside the property boundary.`,
          [{ type: 'parkingBay', id: bay.id }],
          { bayArea: area, insideArea: intersectionArea(polygon, site.boundary) },
        ),
      );
    }
    if (bay.location === 'open_site') {
      const collisionArea = groundSlabs.reduce(
        (total, slab) => total + intersectionArea(polygon, slab.boundaryPoints || []),
        0,
      );
      if (collisionArea > 1)
        issues.push(
          parkingIssue(
            'PARKING.BAY_BUILDING_COLLISION',
            'error',
            `${bay.name} overlaps the modeled ground-floor building footprint.`,
            [{ type: 'parkingBay', id: bay.id }],
            { collisionArea },
          ),
        );
    }
  }
  for (let first = 0; first < plan.bays.length; first += 1) {
    for (let second = first + 1; second < plan.bays.length; second += 1) {
      const overlapArea = intersectionArea(parkingBayPolygon(plan.bays[first]), parkingBayPolygon(plan.bays[second]));
      if (overlapArea > 1)
        issues.push(
          parkingIssue(
            'PARKING.BAYS_OVERLAP',
            'error',
            'Modeled parking bays overlap.',
            [
              { type: 'parkingBay', id: plan.bays[first].id },
              { type: 'parkingBay', id: plan.bays[second].id },
            ],
            { overlapArea },
          ),
        );
    }
  }
  for (const route of plan.accessRoutes) {
    if (route.clearWidth < profile.minimumAccessWidth)
      issues.push(
        parkingIssue(
          'PARKING.ACCESS_WIDTH_BELOW_ASSUMPTION',
          'warning',
          `${route.name} is narrower than the configured vehicle-access assumption.`,
          [{ type: 'vehicleAccessRoute', id: route.id }],
          { clearWidth: route.clearWidth, minimumAccessWidth: profile.minimumAccessWidth, profileId: profile.id },
          'configured_rule_check',
        ),
      );
    if (route.points.length < 2) {
      issues.push(
        parkingIssue(
          'PARKING.ACCESS_ROUTE_INCOMPLETE',
          'error',
          `${route.name} needs at least two centerline points.`,
          [{ type: 'vehicleAccessRoute', id: route.id }],
          { pointCount: route.points.length },
        ),
      );
      continue;
    }
    const roadStart = site.boundary?.[route.roadEdgeIndex];
    const roadEnd = site.boundary?.[(route.roadEdgeIndex + 1) % (site.boundary?.length || 1)];
    const roadEdge = (site.roadEdges || []).find((entry) => entry.edgeIndex === route.roadEdgeIndex);
    const connectionDistance =
      roadStart && roadEnd ? pointToSegmentDistance(route.points[0], roadStart, roadEnd) : Infinity;
    if (!roadEdge || connectionDistance > profile.roadConnectionTolerance)
      issues.push(
        parkingIssue(
          'PARKING.ACCESS_NOT_CONNECTED_TO_ROAD',
          'error',
          `${route.name} does not start at its referenced road frontage.`,
          [{ type: 'vehicleAccessRoute', id: route.id }],
          {
            roadEdgeIndex: route.roadEdgeIndex,
            roadEdgeExists: Boolean(roadEdge),
            connectionDistance,
            tolerance: profile.roadConnectionTolerance,
          },
        ),
      );
    route.points.slice(1).forEach((end, index) => {
      const segmentLength = distance(route.points[index], end);
      if (segmentLength < profile.minimumRouteSegmentLength)
        issues.push(
          parkingIssue(
            'PARKING.ACCESS_SEGMENT_TOO_SHORT',
            'warning',
            `${route.name} contains a segment shorter than the configured maneuvering assumption.`,
            [{ type: 'vehicleAccessRoute', id: route.id }],
            { segmentIndex: index, segmentLength, minimumRouteSegmentLength: profile.minimumRouteSegmentLength },
            'configured_rule_check',
          ),
        );
    });
    for (const pointEntry of route.points) {
      if (
        site.boundary?.length >= 3 &&
        !pointInPolygon(pointEntry, site.boundary) &&
        pointToSegmentDistance(pointEntry, roadStart, roadEnd) > 1
      ) {
        issues.push(
          parkingIssue(
            'PARKING.ACCESS_CENTERLINE_OUTSIDE_PROPERTY',
            'error',
            `${route.name} leaves the property boundary.`,
            [{ type: 'vehicleAccessRoute', id: route.id }],
            { point: pointEntry },
          ),
        );
        break;
      }
    }
    for (const bayId of route.servedBayIds) {
      const bay = plan.bays.find((entry) => entry.id === bayId);
      if (!bay) {
        issues.push(
          parkingIssue(
            'PARKING.ACCESS_BAY_REFERENCE_BROKEN',
            'error',
            `${route.name} references a missing parking bay.`,
            [
              { type: 'vehicleAccessRoute', id: route.id },
              { type: 'parkingBay', id: bayId },
            ],
            { bayId },
          ),
        );
        continue;
      }
      const accessDistance = routeDistanceToPoint(route, polygonCentroid(parkingBayPolygon(bay)));
      const allowedDistance = bay.length / 2 + route.clearWidth / 2 + profile.bayAccessTolerance;
      if (accessDistance > allowedDistance)
        issues.push(
          parkingIssue(
            'PARKING.BAY_NOT_REACHED',
            'error',
            `${bay.name} is not physically reached by its assigned access route.`,
            [
              { type: 'vehicleAccessRoute', id: route.id },
              { type: 'parkingBay', id: bay.id },
            ],
            { accessDistance, allowedDistance },
          ),
        );
    }
  }
  return issues;
}
