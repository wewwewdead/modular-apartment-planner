import { columnOutline } from '@/geometry/columnGeometry';
import { fixtureOutline } from '@/geometry/fixtureGeometry';
import { nearestPointOnSegment, segmentIntersection } from '@/geometry/line';
import { add, normalize, perpendicular, scale, subtract } from '@/geometry/point';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { stairDirectionVector, stairRun, stairTotalRise } from '@/geometry/stairGeometry';
import { doorOutlineOnWall, wallDirection, wallOutline } from '@/geometry/wallGeometry';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_BUILDABILITY_RULE_PROFILE = Object.freeze({
  id: 'beta_small_apartment_buildability_v1',
  minimumDoorWidth: 800,
  minimumHeadroom: 2000,
  roomMinimumWidths: Object.freeze({
    bathroom: 1200,
    bedroom: 2400,
    living: 2400,
    living_sleeping: 2400,
    kitchen: 1500,
  }),
  source: 'configured_product_assumption_not_code_approval',
});

function issue(ruleId, category, severity, message, entityRefs, inputs, resultKind = 'configured_rule_check') {
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

function minimumProjectedWidth(points) {
  if (!points || points.length < 3) return null;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const edge = subtract(points[(index + 1) % points.length], points[index]);
    const direction = normalize(edge);
    if (!direction.x && !direction.y) continue;
    const normal = perpendicular(direction);
    const projections = points.map((point) => point.x * normal.x + point.y * normal.y);
    minimum = Math.min(minimum, Math.max(...projections) - Math.min(...projections));
  }
  return Number.isFinite(minimum) ? minimum : null;
}

/** Conservative quarter-circle plan envelope for a single swing leaf. */
export function doorSwingEnvelope(wall, door, segments = 12) {
  if ((door.type || 'swing') !== 'swing') return [];
  const info = doorOutlineOnWall(wall, door);
  const direction = wallDirection(wall);
  const normal = perpendicular(direction);
  const side = door.openDirection === 'right' ? 1 : -1;
  const points = [info.start];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (Math.PI / 2) * (index / segments);
    points.push(
      add(
        info.start,
        add(scale(direction, door.width * Math.cos(angle)), scale(normal, side * door.width * Math.sin(angle))),
      ),
    );
  }
  return points;
}

function validateDoorClearances(floor, profile) {
  const issues = [];
  const wallsById = new Map((floor.walls || []).map((wall) => [wall.id, wall]));
  for (const door of floor.doors || []) {
    const host = wallsById.get(door.wallId);
    if (!host) continue;
    const refs = [{ type: 'door', id: door.id }];
    const baseInputs = { floorId: floor.id, profileId: profile.id, profileSource: profile.source };
    if ((door.width || 0) < profile.minimumDoorWidth) {
      issues.push(
        issue(
          'BUILD.DOOR_WIDTH_BELOW_ASSUMPTION',
          'spatial_coordination',
          'warning',
          'Door clear width is below the configured small-apartment assumption.',
          refs,
          { ...baseInputs, width: door.width, configuredMinimum: profile.minimumDoorWidth },
        ),
      );
    }
    const envelope = doorSwingEnvelope(host, door);
    if (envelope.length < 3) continue;
    const obstacles = [
      ...(floor.columns || []).map((entity) => ({ type: 'column', entity, polygon: columnOutline(entity) })),
      ...(floor.fixtures || []).map((entity) => ({ type: 'fixture', entity, polygon: fixtureOutline(entity) })),
      ...(floor.walls || [])
        .filter((wall) => wall.id !== host.id)
        .map((entity) => ({ type: 'wall', entity, polygon: wallOutline(entity) })),
    ];
    for (const obstacle of obstacles) {
      const overlapArea = intersectionArea(envelope, obstacle.polygon);
      if (overlapArea <= 100) continue;
      issues.push(
        issue(
          'BUILD.DOOR_SWING_OBSTRUCTED',
          'spatial_coordination',
          'error',
          `Door swing intersects a modeled ${obstacle.type}.`,
          [...refs, { type: obstacle.type, id: obstacle.entity.id }],
          { ...baseInputs, overlapArea, units: 'mm²', envelopeMethod: 'quarter_circle_plan_envelope' },
          'verified_geometry',
        ),
      );
    }
  }
  return issues;
}

function validateRoomWidths(floor, profile) {
  const issues = [];
  for (const room of floor.rooms || []) {
    const configuredMinimum = profile.roomMinimumWidths[room.spaceType];
    if (configuredMinimum == null) continue;
    const measuredWidth = minimumProjectedWidth(room.points || []);
    if (measuredWidth == null || measuredWidth >= configuredMinimum) continue;
    issues.push(
      issue(
        'BUILD.ROOM_WIDTH_BELOW_ASSUMPTION',
        'spatial_coordination',
        'warning',
        `${room.name || room.spaceType || 'Room'} width is below the configured planning assumption.`,
        [
          { type: 'floor', id: floor.id },
          { type: 'room', id: room.id },
        ],
        {
          profileId: profile.id,
          profileSource: profile.source,
          spaceType: room.spaceType,
          measuredWidth,
          configuredMinimum,
          method: 'minimum_polygon_projection',
        },
      ),
    );
  }
  return issues;
}

function validateStairBeamHeadroom(project, profile) {
  const issues = [];
  const floors = new Map((project.floors || []).map((floor) => [floor.id, floor]));
  for (const ownerFloor of project.floors || []) {
    for (const stair of ownerFloor.stairs || []) {
      const fromFloor = floors.get(stair.floorRelation?.fromFloorId);
      const toFloor = floors.get(stair.floorRelation?.toFloorId);
      if (!fromFloor || !toFloor) continue;
      const direction = stairDirectionVector(stair);
      const run = stairRun(stair);
      if (run <= 0) continue;
      const centerlineEnd = add(stair.startPoint, scale(direction, run));
      const columns = new Map((toFloor.columns || []).map((column) => [column.id, column]));
      for (const beam of toFloor.beams || []) {
        const startColumn = beam.startRef?.kind === 'column' ? columns.get(beam.startRef.id) : null;
        const endColumn = beam.endRef?.kind === 'column' ? columns.get(beam.endRef.id) : null;
        if (!startColumn || !endColumn) continue;
        const hit = segmentIntersection(stair.startPoint, centerlineEnd, startColumn, endColumn);
        if (!hit) continue;
        const along = nearestPointOnSegment(hit, stair.startPoint, centerlineEnd).t;
        const walkingElevation = (fromFloor.elevation || 0) + stairTotalRise(stair) * along;
        const beamLevel = Number.isFinite(beam.floorLevel) ? beam.floorLevel : toFloor.elevation || 0;
        const undersideElevation = beamLevel - (beam.depth || 0);
        const clearance = undersideElevation - walkingElevation;
        if (clearance >= profile.minimumHeadroom) continue;
        issues.push(
          issue(
            'BUILD.STAIR_BEAM_HEADROOM_BELOW_ASSUMPTION',
            'vertical_coordination',
            'error',
            'A beam crosses the stair run below the configured headroom assumption.',
            [
              { type: 'stair', id: stair.id },
              { type: 'beam', id: beam.id },
            ],
            {
              profileId: profile.id,
              profileSource: profile.source,
              intersection: hit,
              distanceAlongRunRatio: along,
              walkingElevation,
              undersideElevation,
              clearance,
              configuredMinimum: profile.minimumHeadroom,
            },
            'verified_geometry',
          ),
        );
      }
    }
  }
  return issues;
}

export function validateBuildabilityCoordination(project, profile = DEFAULT_BUILDABILITY_RULE_PROFILE) {
  return [
    ...(project.floors || []).flatMap((floor) => [
      ...validateDoorClearances(floor, profile),
      ...validateRoomWidths(floor, profile),
    ]),
    ...validateStairBeamHeadroom(project, profile),
  ];
}
