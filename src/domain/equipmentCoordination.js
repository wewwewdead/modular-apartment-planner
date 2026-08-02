import { DESIGN_CONFIDENCE } from './trustModels';
import { rotate, distance } from '@/geometry/point';
import { polygonArea } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';

export const EQUIPMENT_KINDS = Object.freeze(['electrical_panel', 'water_tank', 'water_pump', 'ac_outdoor_zone']);

export const ELECTRICAL_POINT_KINDS = Object.freeze(['outlet', 'light', 'switch', 'dedicated_outlet']);

export const DEFAULT_EQUIPMENT_COORDINATION_PROFILE = Object.freeze({
  id: 'owner_equipment_coordination_v1',
  source: 'configured_early_planning_assumption_not_trade_design',
  maximumElectricalPointDistance: 20_000,
  minimumEquipmentClearance: 600,
});

function normalizedPoint(value = {}) {
  return { x: Number(value.x) || 0, y: Number(value.y) || 0 };
}

export function equipmentZonePolygon(zone) {
  const origin = normalizedPoint(zone.origin);
  const halfWidth = zone.width / 2;
  const halfDepth = zone.depth / 2;
  return [
    { x: origin.x - halfWidth, y: origin.y - halfDepth },
    { x: origin.x + halfWidth, y: origin.y - halfDepth },
    { x: origin.x + halfWidth, y: origin.y + halfDepth },
    { x: origin.x - halfWidth, y: origin.y + halfDepth },
  ].map((entry) => rotate(entry, origin, zone.rotation || 0));
}

export function createEquipmentZone(overrides = {}) {
  return {
    id: overrides.id,
    name: overrides.name || 'Equipment zone',
    kind: EQUIPMENT_KINDS.includes(overrides.kind) ? overrides.kind : 'electrical_panel',
    floorId: overrides.floorId || null,
    location: ['floor', 'ground', 'roof'].includes(overrides.location) ? overrides.location : 'floor',
    origin: normalizedPoint(overrides.origin),
    width: Number(overrides.width) || 600,
    depth: Number(overrides.depth) || 600,
    rotation: Number(overrides.rotation) || 0,
    clearance: Number(overrides.clearance) || 600,
    capacity: Number.isFinite(overrides.capacity) && overrides.capacity >= 0 ? overrides.capacity : null,
    unitCount: Number.isInteger(overrides.unitCount) && overrides.unitCount >= 0 ? overrides.unitCount : null,
    servedFloorIds: [...new Set(overrides.servedFloorIds || [])],
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
    generatedByServicesRealizationId: overrides.generatedByServicesRealizationId || null,
    generatedByTestFitId: overrides.generatedByTestFitId || null,
  };
}

export function createElectricalPoint(overrides = {}) {
  return {
    id: overrides.id,
    name: overrides.name || 'Electrical point',
    kind: ELECTRICAL_POINT_KINDS.includes(overrides.kind) ? overrides.kind : 'outlet',
    floorId: overrides.floorId || null,
    position: normalizedPoint(overrides.position),
    panelZoneId: overrides.panelZoneId || null,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
    roomId: overrides.roomId || null,
    unitInstanceId: overrides.unitInstanceId || null,
    generatedByServicesRealizationId: overrides.generatedByServicesRealizationId || null,
    generatedByTestFitId: overrides.generatedByTestFitId || null,
  };
}

export function createEquipmentCoordinationProfile(overrides = {}) {
  return { ...DEFAULT_EQUIPMENT_COORDINATION_PROFILE, ...overrides };
}

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'verified_geometry') {
  return {
    id: `${ruleId}:${entityRefs.map((entry) => `${entry.type}:${entry.id}`).join('|')}`,
    ruleId,
    category: 'equipment_coordination',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

function hostedArea(project, zone) {
  if (zone.location === 'roof') return project.roofSystem?.boundaryPolygon || [];
  if (zone.location === 'ground') return project.building?.site?.boundary || [];
  const floor = (project.floors || []).find((entry) => entry.id === zone.floorId);
  return (
    (floor?.slabs || []).sort((a, b) => polygonArea(b.boundaryPoints || []) - polygonArea(a.boundaryPoints || []))[0]
      ?.boundaryPoints || []
  );
}

export function deriveEquipmentCoordination(project) {
  const electrical = project?.building?.systems?.electrical || {};
  const water = project?.building?.systems?.water || {};
  const mechanical = project?.building?.systems?.mechanical || {};
  const zones = [
    ...(electrical.panelZones || []),
    ...(water.equipmentZones || []),
    ...(mechanical.outdoorUnitZones || []),
  ].map(createEquipmentZone);
  const electricalPoints = (electrical.points || []).map(createElectricalPoint);
  return {
    profile: createEquipmentCoordinationProfile(project?.building?.systems?.equipmentCoordinationProfile),
    zones,
    electricalPoints,
    panelCount: zones.filter((entry) => entry.kind === 'electrical_panel').length,
    waterTankCount: zones.filter((entry) => entry.kind === 'water_tank').length,
    waterPumpCount: zones.filter((entry) => entry.kind === 'water_pump').length,
    acOutdoorZoneCount: zones.filter((entry) => entry.kind === 'ac_outdoor_zone').length,
    electricalPointCount: electricalPoints.length,
    professionalReviewRequired: true,
  };
}

export function validateEquipmentCoordination(project) {
  const derived = deriveEquipmentCoordination(project);
  if (!derived.zones.length && !derived.electricalPoints.length) return [];
  const issues = [];
  const floorIds = new Set((project.floors || []).map((entry) => entry.id));
  for (const zone of derived.zones) {
    const polygon = equipmentZonePolygon(zone);
    const area = polygonArea(polygon);
    const host = hostedArea(project, zone);
    if (zone.location === 'floor' && !floorIds.has(zone.floorId)) {
      issues.push(
        issue(
          'EQUIPMENT.FLOOR_REFERENCE_BROKEN',
          'error',
          `${zone.name} references a missing floor.`,
          [{ type: 'equipmentZone', id: zone.id }],
          { floorId: zone.floorId },
        ),
      );
      continue;
    }
    if (host.length < 3 || intersectionArea(polygon, host) < area - 1) {
      issues.push(
        issue(
          'EQUIPMENT.ZONE_OUTSIDE_HOST',
          'error',
          `${zone.name} does not fit inside its modeled ${zone.location} host.`,
          [{ type: 'equipmentZone', id: zone.id }],
          {
            location: zone.location,
            zoneArea: area,
            hostedArea: host.length >= 3 ? intersectionArea(polygon, host) : 0,
          },
        ),
      );
    }
    if (zone.clearance < derived.profile.minimumEquipmentClearance) {
      issues.push(
        issue(
          'EQUIPMENT.CLEARANCE_BELOW_ASSUMPTION',
          'warning',
          `${zone.name} has less than the configured planning clearance.`,
          [{ type: 'equipmentZone', id: zone.id }],
          {
            clearance: zone.clearance,
            minimumEquipmentClearance: derived.profile.minimumEquipmentClearance,
            profileId: derived.profile.id,
          },
          'configured_rule_check',
        ),
      );
    }
    for (const servedFloorId of zone.servedFloorIds) {
      if (!floorIds.has(servedFloorId))
        issues.push(
          issue(
            'EQUIPMENT.SERVED_FLOOR_REFERENCE_BROKEN',
            'error',
            `${zone.name} references a missing served floor.`,
            [{ type: 'equipmentZone', id: zone.id }],
            { servedFloorId },
          ),
        );
    }
    if (zone.location === 'floor') {
      const floor = (project.floors || []).find((entry) => entry.id === zone.floorId);
      for (const column of floor?.columns || []) {
        const columnPolygon = equipmentZonePolygon({
          origin: column,
          width: column.width,
          depth: column.depth,
          rotation: column.rotation || 0,
        });
        const overlapArea = intersectionArea(polygon, columnPolygon);
        if (overlapArea > 1)
          issues.push(
            issue(
              'EQUIPMENT.ZONE_COLUMN_CONFLICT',
              'error',
              `${zone.name} intersects a modeled column.`,
              [
                { type: 'equipmentZone', id: zone.id },
                { type: 'column', id: column.id },
              ],
              { floorId: floor.id, overlapArea, units: 'mm²' },
            ),
          );
      }
      for (const slab of floor?.slabs || []) {
        for (const opening of slab.openings || []) {
          const overlapArea = intersectionArea(polygon, opening.boundaryPoints || []);
          if (overlapArea > 1)
            issues.push(
              issue(
                'EQUIPMENT.ZONE_SLAB_OPENING_CONFLICT',
                'error',
                `${zone.name} intersects a modeled slab opening.`,
                [
                  { type: 'equipmentZone', id: zone.id },
                  { type: 'slabOpening', id: opening.id },
                ],
                { floorId: floor.id, slabId: slab.id, overlapArea, units: 'mm²' },
              ),
            );
        }
      }
    }
  }
  const panels = new Map(
    derived.zones.filter((entry) => entry.kind === 'electrical_panel').map((entry) => [entry.id, entry]),
  );
  for (const electricalPoint of derived.electricalPoints) {
    const floor = (project.floors || []).find((entry) => entry.id === electricalPoint.floorId);
    const panel = panels.get(electricalPoint.panelZoneId);
    if (!floor) {
      issues.push(
        issue(
          'EQUIPMENT.ELECTRICAL_POINT_FLOOR_BROKEN',
          'error',
          `${electricalPoint.name} references a missing floor.`,
          [{ type: 'electricalPoint', id: electricalPoint.id }],
          { floorId: electricalPoint.floorId },
        ),
      );
      continue;
    }
    if (!panel) {
      issues.push(
        issue(
          'EQUIPMENT.ELECTRICAL_POINT_PANEL_BROKEN',
          'error',
          `${electricalPoint.name} is not related to a modeled electrical panel zone.`,
          [{ type: 'electricalPoint', id: electricalPoint.id }],
          { panelZoneId: electricalPoint.panelZoneId },
        ),
      );
      continue;
    }
    const planningDistance = distance(electricalPoint.position, panel.origin);
    if (planningDistance > derived.profile.maximumElectricalPointDistance) {
      issues.push(
        issue(
          'EQUIPMENT.ELECTRICAL_POINT_DISTANCE_EXCEEDED',
          'warning',
          `${electricalPoint.name} exceeds the configured straight-line panel-distance assumption.`,
          [
            { type: 'electricalPoint', id: electricalPoint.id },
            { type: 'equipmentZone', id: panel.id },
          ],
          {
            planningDistance,
            maximumElectricalPointDistance: derived.profile.maximumElectricalPointDistance,
            method: 'straight_line_not_circuit_route',
          },
          'configured_rule_check',
        ),
      );
    }
  }
  return issues;
}
