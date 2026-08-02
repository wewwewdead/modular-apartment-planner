import { DESIGN_CONFIDENCE } from './trustModels';
import { polygonArea } from '@/geometry/polygon';
import { templateEntityCounts, UNIT_GEOMETRY_COLLECTIONS } from './unitGeometry';

export const ROOM_USE_CATEGORIES = Object.freeze({
  RENTABLE: 'rentable',
  CIRCULATION: 'circulation',
  SERVICE: 'service',
  SHARED: 'shared',
  PARKING: 'parking',
});

export function createSpaceProgram(overrides = {}) {
  return {
    configured: overrides.configured ?? false,
    unitTargets: (overrides.unitTargets || []).map((target) => ({ ...target })),
    sharedSpaceTargets: (overrides.sharedSpaceTargets || []).map((target) => ({ ...target })),
    parkingRequirement: overrides.parkingRequirement ?? null,
  };
}

export function createUnitType(options) {
  return {
    id: options.id,
    name: options.name || 'Apartment Unit',
    category: options.category || 'custom',
    targetArea: options.targetArea ? { ...options.targetArea } : { min: null, preferred: null, max: null },
    spaceRequirements: (options.spaceRequirements || []).map((requirement) => ({
      id: requirement.id,
      spaceType: requirement.spaceType,
      name: requirement.name || requirement.spaceType,
      minCount: requirement.minCount ?? 1,
      maxCount: requirement.maxCount ?? null,
      targetArea: requirement.targetArea ? { ...requirement.targetArea } : null,
    })),
    revision: options.revision ?? 1,
    geometryTemplate: options.geometryTemplate
      ? {
          ...options.geometryTemplate,
          extents: options.geometryTemplate.extents ? { ...options.geometryTemplate.extents } : null,
          ...Object.fromEntries(
            UNIT_GEOMETRY_COLLECTIONS.map((collection) => [
              collection,
              (options.geometryTemplate[collection] || []).map((entity) => ({ ...entity })),
            ]),
          ),
        }
      : null,
    confidence: DESIGN_CONFIDENCE.MODELED,
  };
}

export function createUnitInstance(options) {
  return {
    id: options.id,
    name: options.name || '',
    typeId: options.typeId,
    floorId: options.floorId,
    roomIds: [...(options.roomIds || [])],
    detached: options.detached ?? false,
    sourceRevision: options.sourceRevision ?? 1,
    placement: options.placement
      ? {
          origin: { ...options.placement.origin },
          rotation: Number(options.placement.rotation || 0),
        }
      : null,
    generatedEntityRefs: Object.fromEntries(
      UNIT_GEOMETRY_COLLECTIONS.map((collection) => [
        collection,
        [...(options.generatedEntityRefs?.[collection] || [])],
      ]),
    ),
    confidence: DESIGN_CONFIDENCE.MODELED,
  };
}

function roomArea(room) {
  return room.area || polygonArea(room.points || []);
}

function programIssue(ruleId, severity, message, entityRefs, inputs, resultKind = 'configured_rule_check') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'apartment_program',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

function projectRoomIndex(project) {
  const rooms = new Map();
  for (const floor of project.floors || []) {
    for (const room of floor.rooms || []) rooms.set(room.id, { floorId: floor.id, room });
  }
  return rooms;
}

function instanceRooms(instance, rooms) {
  return (instance.roomIds || []).map((roomId) => rooms.get(roomId)).filter(Boolean);
}

function instanceSignature(instance, rooms) {
  return instanceRooms(instance, rooms)
    .map(({ room }) => ({ spaceType: room.spaceType || 'unclassified', area: Math.round(roomArea(room)) }))
    .sort((a, b) => a.spaceType.localeCompare(b.spaceType) || a.area - b.area);
}

function signaturesDiverge(reference, candidate) {
  if (reference.length !== candidate.length) return true;
  return reference.some((entry, index) => {
    const other = candidate[index];
    if (entry.spaceType !== other.spaceType) return true;
    const tolerance = Math.max(100000, entry.area * 0.02);
    return Math.abs(entry.area - other.area) > tolerance;
  });
}

export function deriveApartmentProgram(project) {
  const building = project?.building || {};
  const rooms = projectRoomIndex(project);
  const unitTypes = building.unitTypes || [];
  const instances = building.unitInstances || [];
  const typeSummaries = unitTypes.map((type) => {
    const linkedInstances = instances.filter((instance) => instance.typeId === type.id && !instance.detached);
    const instanceAreas = linkedInstances.map((instance) =>
      instanceRooms(instance, rooms).reduce((sum, entry) => sum + roomArea(entry.room), 0),
    );
    const target = building.spaceProgram?.unitTargets?.find((entry) => entry.unitTypeId === type.id);
    return {
      unitTypeId: type.id,
      targetCount: target?.count ?? null,
      linkedInstanceCount: linkedInstances.length,
      detachedInstanceCount: instances.filter((instance) => instance.typeId === type.id && instance.detached).length,
      geometryTemplateReady: Boolean(type.geometryTemplate?.rooms?.length),
      templateRevision: type.geometryTemplate?.revision ?? null,
      currentGeometryInstanceCount: linkedInstances.filter(
        (instance) => instance.placement && instance.sourceRevision === type.revision,
      ).length,
      totalArea: instanceAreas.reduce((sum, area) => sum + area, 0),
      averageArea: instanceAreas.length
        ? instanceAreas.reduce((sum, area) => sum + area, 0) / instanceAreas.length
        : null,
    };
  });

  const areaByUseCategory = {};
  for (const { room } of rooms.values()) {
    if (!room.useCategory) continue;
    areaByUseCategory[room.useCategory] = (areaByUseCategory[room.useCategory] || 0) + roomArea(room);
  }

  return {
    configured: Boolean(building.spaceProgram?.configured),
    unitTypeSummaries: typeSummaries,
    totalUnitInstances: instances.length,
    linkedUnitInstances: instances.filter((instance) => !instance.detached).length,
    areaByUseCategory,
  };
}

export function validateApartmentProgram(project) {
  const building = project?.building;
  if (!building) return [];
  const issues = [];
  const floors = new Map((project.floors || []).map((floor) => [floor.id, floor]));
  const rooms = projectRoomIndex(project);
  const types = new Map((building.unitTypes || []).map((type) => [type.id, type]));
  const instances = building.unitInstances || [];
  const instancesById = new Map(instances.map((instance) => [instance.id, instance]));

  if (building.brief?.targetStoreys != null && (building.brief.targetStoreys < 2 || building.brief.targetStoreys > 4)) {
    issues.push(
      programIssue(
        'PROGRAM.TARGET_STOREYS_OUTSIDE_ALPHA_SCOPE',
        'warning',
        'The configured storey target is outside the current 2–4 storey product scope.',
        [{ type: 'building', id: building.id }],
        { targetStoreys: building.brief.targetStoreys, supportedRange: [2, 4] },
      ),
    );
  }
  if (building.brief?.targetBudget != null && building.brief.targetBudget <= 0) {
    issues.push(
      programIssue(
        'PROGRAM.BUDGET_INVALID',
        'error',
        'Target construction budget must be greater than zero.',
        [{ type: 'building', id: building.id }],
        { targetBudget: building.brief.targetBudget, currency: building.brief.currency || 'PHP' },
      ),
    );
  }

  for (const floor of project.floors || []) {
    for (const room of floor.rooms || []) {
      if (room.unitInstanceId && !instancesById.has(room.unitInstanceId)) {
        issues.push(
          programIssue(
            'PROGRAM.ROOM_UNIT_REFERENCE_BROKEN',
            'error',
            'Room references a unit instance that does not exist.',
            [{ type: 'room', id: room.id }],
            { floorId: floor.id, unitInstanceId: room.unitInstanceId },
          ),
        );
      }
    }
  }

  for (const instance of instances) {
    const refs = [{ type: 'unitInstance', id: instance.id }];
    const type = types.get(instance.typeId);
    if (!type) {
      issues.push(
        programIssue(
          'PROGRAM.UNIT_TYPE_REFERENCE_BROKEN',
          'error',
          'Unit instance references a missing unit type.',
          refs,
          {
            typeId: instance.typeId,
          },
        ),
      );
      continue;
    }
    if (!floors.has(instance.floorId)) {
      issues.push(
        programIssue(
          'PROGRAM.UNIT_FLOOR_REFERENCE_BROKEN',
          'error',
          'Unit instance references a missing floor.',
          refs,
          {
            floorId: instance.floorId,
          },
        ),
      );
    }
    const assignedRooms = instanceRooms(instance, rooms);
    for (const entry of assignedRooms) {
      if (entry.floorId !== instance.floorId) {
        issues.push(
          programIssue(
            'PROGRAM.UNIT_ROOM_LEVEL_MISMATCH',
            'error',
            'A unit instance contains a room from a different floor.',
            [...refs, { type: 'room', id: entry.room.id }],
            { instanceFloorId: instance.floorId, roomFloorId: entry.floorId },
          ),
        );
      }
    }

    if (!instance.detached && instance.sourceRevision !== type.revision) {
      issues.push(
        programIssue(
          'PROGRAM.UNIT_INSTANCE_OUTDATED',
          'warning',
          'Linked unit instance has not incorporated the current unit-type revision.',
          refs,
          { sourceRevision: instance.sourceRevision, currentRevision: type.revision },
        ),
      );
    }

    if (!instance.detached && type.geometryTemplate && !instance.placement) {
      issues.push(
        programIssue(
          'PROGRAM.UNIT_INSTANCE_PLACEMENT_MISSING',
          'warning',
          'Linked unit geometry cannot be propagated until the instance has a placement origin.',
          refs,
          { typeId: type.id, templateRevision: type.geometryTemplate.revision },
        ),
      );
    }

    if (
      !instance.detached &&
      type.geometryTemplate &&
      instance.id !== type.geometryTemplate.capturedFromInstanceId &&
      instance.sourceRevision === type.revision
    ) {
      const expected = templateEntityCounts(type.geometryTemplate);
      const actual = Object.fromEntries(
        UNIT_GEOMETRY_COLLECTIONS.map((collection) => [
          collection,
          (floors.get(instance.floorId)?.[collection] || []).filter(
            (entity) => entity.unitTemplateGenerated && entity.unitInstanceId === instance.id,
          ).length,
        ]),
      );
      if (UNIT_GEOMETRY_COLLECTIONS.some((collection) => actual[collection] !== expected[collection])) {
        issues.push(
          programIssue(
            'PROGRAM.UNIT_GEOMETRY_INCOMPLETE',
            'error',
            'Linked unit geometry is incomplete for the current type revision.',
            refs,
            { typeId: type.id, expected, actual, templateRevision: type.geometryTemplate.revision },
            'verified_geometry',
          ),
        );
      }
    }

    const counts = new Map();
    for (const entry of assignedRooms) {
      const spaceType = entry.room.spaceType || 'unclassified';
      counts.set(spaceType, (counts.get(spaceType) || 0) + 1);
    }
    for (const requirement of type.spaceRequirements || []) {
      const actual = counts.get(requirement.spaceType) || 0;
      if (actual < requirement.minCount) {
        issues.push(
          programIssue(
            'PROGRAM.REQUIRED_SPACE_MISSING',
            'warning',
            `Unit is missing required ${requirement.name || requirement.spaceType} space.`,
            [...refs, { type: 'spaceRequirement', id: requirement.id }],
            { requirementId: requirement.id, spaceType: requirement.spaceType, minimum: requirement.minCount, actual },
          ),
        );
      }
      if (requirement.maxCount != null && actual > requirement.maxCount) {
        issues.push(
          programIssue(
            'PROGRAM.SPACE_COUNT_EXCEEDED',
            'warning',
            `Unit exceeds the configured ${requirement.name || requirement.spaceType} count.`,
            [...refs, { type: 'spaceRequirement', id: requirement.id }],
            { requirementId: requirement.id, maximum: requirement.maxCount, actual },
          ),
        );
      }
    }

    const area = assignedRooms.reduce((sum, entry) => sum + roomArea(entry.room), 0);
    if (type.targetArea?.min != null && area < type.targetArea.min) {
      issues.push(
        programIssue(
          'PROGRAM.UNIT_AREA_BELOW_TARGET',
          'warning',
          'Unit area is below its configured minimum.',
          refs,
          {
            area,
            minimum: type.targetArea.min,
          },
          'verified_geometry',
        ),
      );
    }
    if (type.targetArea?.max != null && area > type.targetArea.max) {
      issues.push(
        programIssue(
          'PROGRAM.UNIT_AREA_ABOVE_TARGET',
          'warning',
          'Unit area exceeds its configured maximum.',
          refs,
          {
            area,
            maximum: type.targetArea.max,
          },
          'verified_geometry',
        ),
      );
    }
  }

  for (const type of building.unitTypes || []) {
    const linked = instances.filter((instance) => instance.typeId === type.id && !instance.detached);
    if (linked.length < 2) continue;
    const reference = linked[0];
    const referenceSignature = instanceSignature(reference, rooms);
    for (const candidate of linked.slice(1)) {
      const candidateSignature = instanceSignature(candidate, rooms);
      if (signaturesDiverge(referenceSignature, candidateSignature)) {
        issues.push(
          programIssue(
            'PROGRAM.LINKED_UNIT_DIVERGED',
            'warning',
            'Linked unit instances have materially different space/area signatures.',
            [
              { type: 'unitInstance', id: reference.id },
              { type: 'unitInstance', id: candidate.id },
            ],
            { typeId: type.id, referenceSignature, candidateSignature },
            'verified_geometry',
          ),
        );
      }
    }
  }

  if (building.spaceProgram?.configured) {
    const programmedUnitCount = (building.spaceProgram.unitTargets || []).reduce(
      (sum, target) => sum + target.count,
      0,
    );
    if (building.brief?.targetUnitCount != null && programmedUnitCount !== building.brief.targetUnitCount) {
      issues.push(
        programIssue(
          'PROGRAM.BRIEF_UNIT_COUNT_MISMATCH',
          'warning',
          'Space-program unit targets do not match the project brief.',
          [{ type: 'building', id: building.id }],
          { briefTarget: building.brief.targetUnitCount, programmedUnitCount },
        ),
      );
    }
    for (const target of building.spaceProgram.unitTargets || []) {
      const actual = instances.filter((instance) => instance.typeId === target.unitTypeId).length;
      if (!types.has(target.unitTypeId)) {
        issues.push(
          programIssue(
            'PROGRAM.TARGET_UNIT_TYPE_MISSING',
            'error',
            'Space program targets a unit type that does not exist.',
            [{ type: 'spaceProgramTarget', id: target.unitTypeId }],
            { unitTypeId: target.unitTypeId, targetCount: target.count },
          ),
        );
      } else if (actual !== target.count) {
        issues.push(
          programIssue(
            'PROGRAM.UNIT_COUNT_MISMATCH',
            'warning',
            'Modeled unit count does not match the configured program target.',
            [{ type: 'unitType', id: target.unitTypeId }],
            { targetCount: target.count, actualCount: actual },
          ),
        );
      }
    }
  }

  return issues;
}
