import { resolveGridIntersection } from './buildingModels';
import { DESIGN_CONFIDENCE } from './trustModels';
import { distance } from '@/geometry/point';
import { validateSiteCoordination } from './siteModels';
import { validateApartmentProgram } from './apartmentProgram';
import { validateStairCoordination } from './stairValidation';
import { validateWetCoreCoordination } from './wetCoreModels';
import { validateSpatialCoordination } from './spatialValidation';
import { validateDocumentCoordination } from './documentValidation';
import { validateBuildabilityCoordination } from './buildabilityValidation';
import { validateStructuralCoordination } from './structuralCoordination';
import { validateServicesCoordination } from './servicesCoordination';
import { validateFeasibilityEconomics } from './feasibilityEconomics';
import { validateProfessionalHandoff } from './professionalHandoff';
import { validateParkingCoordination } from './siteAccessModels';
import { validateEquipmentCoordination } from './equipmentCoordination';
import { validateRoofDrainageCoordination } from './roofDrainageCoordination';
import { validateTestFitCoordination } from './testFitModels';
import { validateApartmentDesignCoordination } from './apartmentDesign';
import { validateStructuralRealization } from './structuralRealization';
import { validateServicesRealization } from './servicesRealization';
import { validateCostRealization } from './costRealization';
import { validateDocumentationRealization } from './documentationRealization';
import { validateProfessionalExchange } from './professionalExchange';
import { validateProjectWallDetails } from './wallDetailing';

export const STRUCTURAL_ALIGNMENT_TOLERANCE = 25;

function issue(ruleId, severity, message, entityRefs, inputs) {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'structural_coordination',
    severity,
    message,
    entityRefs,
    evidence: {
      resultKind: 'verified_geometry',
      confidence: DESIGN_CONFIDENCE.CHECKED,
      inputs,
    },
    professionalReviewRequired: true,
  };
}

export function deriveBuildingGraph(project) {
  const floorsById = new Map((project.floors || []).map((floor) => [floor.id, floor]));
  const columnsById = new Map();
  const beamsById = new Map();
  const slabsById = new Map();
  const wallsById = new Map();

  for (const floor of project.floors || []) {
    for (const column of floor.columns || []) columnsById.set(column.id, { floorId: floor.id, entity: column });
    for (const beam of floor.beams || []) beamsById.set(beam.id, { floorId: floor.id, entity: beam });
    for (const slab of floor.slabs || []) slabsById.set(slab.id, { floorId: floor.id, entity: slab });
    for (const wall of floor.walls || []) wallsById.set(wall.id, { floorId: floor.id, entity: wall });
  }

  return { floorsById, columnsById, beamsById, slabsById, wallsById };
}

function validateColumnStacks(project, graph, tolerance) {
  const issues = [];
  const stacks = project.building?.systems?.structural?.columnStacks || [];
  const grids = project.building?.systems?.structural?.gridSystems || [];
  const orderedFloorIds = (project.floors || []).map((floor) => floor.id);

  for (const stack of stacks) {
    if (stack.gridIntersection) {
      const gridOrigin = resolveGridIntersection(grids, stack.gridIntersection);
      if (!gridOrigin) {
        issues.push(
          issue(
            'STRUCT.COLUMN_STACK_GRID_REFERENCE_BROKEN',
            'error',
            `Column stack ${stack.name || stack.id} references a missing grid intersection.`,
            [{ type: 'columnStack', id: stack.id }],
            { gridIntersection: stack.gridIntersection },
          ),
        );
      } else {
        const gridOffset = distance(gridOrigin, stack.origin);
        if (gridOffset > tolerance) {
          issues.push(
            issue(
              'STRUCT.COLUMN_STACK_OFF_GRID',
              'warning',
              `Column stack ${stack.name || stack.id} is ${Math.round(gridOffset)} mm from its grid intersection.`,
              [{ type: 'columnStack', id: stack.id }],
              { expected: gridOrigin, actual: stack.origin, offset: gridOffset, tolerance },
            ),
          );
        }
      }
    }

    const resolved = [];
    const seenFloors = new Set();
    for (const ref of stack.columnRefs || []) {
      const columnEntry = graph.columnsById.get(ref.columnId);
      if (!columnEntry || columnEntry.floorId !== ref.floorId) {
        issues.push(
          issue(
            'STRUCT.COLUMN_STACK_BROKEN_REFERENCE',
            'error',
            `Column stack ${stack.name || stack.id} contains a broken column reference.`,
            [
              { type: 'columnStack', id: stack.id },
              { type: 'column', id: ref.columnId },
            ],
            { floorId: ref.floorId, columnId: ref.columnId },
          ),
        );
        continue;
      }
      if (seenFloors.has(ref.floorId)) {
        issues.push(
          issue(
            'STRUCT.COLUMN_STACK_DUPLICATE_LEVEL',
            'error',
            `Column stack ${stack.name || stack.id} has more than one column on the same level.`,
            [
              { type: 'columnStack', id: stack.id },
              { type: 'floor', id: ref.floorId },
            ],
            { floorId: ref.floorId },
          ),
        );
      }
      seenFloors.add(ref.floorId);
      resolved.push({ ...columnEntry, columnId: ref.columnId });
    }

    for (const entry of resolved) {
      const offset = distance(stack.origin, entry.entity);
      if (offset > tolerance) {
        issues.push(
          issue(
            'STRUCT.COLUMN_STACK_MISALIGNED',
            'warning',
            `Column is ${Math.round(offset)} mm from the ${stack.name || 'column stack'} axis.`,
            [
              { type: 'columnStack', id: stack.id },
              { type: 'column', id: entry.columnId },
            ],
            { expected: stack.origin, actual: { x: entry.entity.x, y: entry.entity.y }, offset, tolerance },
          ),
        );
      }
    }

    if (resolved.length > 1) {
      const indices = resolved.map((entry) => orderedFloorIds.indexOf(entry.floorId)).filter((index) => index >= 0);
      const min = Math.min(...indices);
      const max = Math.max(...indices);
      for (let index = min; index <= max; index += 1) {
        if (!seenFloors.has(orderedFloorIds[index])) {
          issues.push(
            issue(
              'STRUCT.COLUMN_STACK_DISCONTINUITY',
              'warning',
              `Column stack ${stack.name || stack.id} skips an intermediate level.`,
              [
                { type: 'columnStack', id: stack.id },
                { type: 'floor', id: orderedFloorIds[index] },
              ],
              { missingFloorId: orderedFloorIds[index] },
            ),
          );
        }
      }
    }
  }
  return issues;
}

function validateBeams(project, graph) {
  const issues = [];
  for (const floor of project.floors || []) {
    for (const beam of floor.beams || []) {
      for (const [end, ref] of [
        ['start', beam.startRef],
        ['end', beam.endRef],
      ]) {
        const validColumn = ref?.kind === 'column' && graph.columnsById.get(ref.id)?.floorId === floor.id;
        const validCantileverPoint =
          beam.coordination?.condition === 'cantilever' &&
          ref?.kind === 'point' &&
          Number.isFinite(ref.x) &&
          Number.isFinite(ref.y);
        if (!validColumn && !validCantileverPoint) {
          issues.push(
            issue(
              'STRUCT.BEAM_UNSUPPORTED_END',
              'error',
              `Beam ${end} does not reference a valid support or declared cantilever point.`,
              [{ type: 'beam', id: beam.id }],
              { floorId: floor.id, end, supportRef: ref || null },
            ),
          );
        }
      }
      if (beam.startRef?.kind === 'column' && beam.startRef.id === beam.endRef?.id) {
        issues.push(
          issue(
            'STRUCT.BEAM_ZERO_SPAN',
            'error',
            'Beam start and end reference the same column.',
            [{ type: 'beam', id: beam.id }],
            { columnId: beam.startRef.id },
          ),
        );
      }
    }
  }
  return issues;
}

/**
 * Deterministic coordination checks only. These results never imply structural
 * capacity or safety and always retain the professional-review requirement.
 */
export function validateBuildingCoordination(project, options = {}) {
  if (!project?.building) return [];
  const graph = deriveBuildingGraph(project);
  const tolerance = options.columnAlignmentTolerance ?? STRUCTURAL_ALIGNMENT_TOLERANCE;
  return [
    ...validateSiteCoordination(project),
    ...validateParkingCoordination(project),
    ...validateApartmentProgram(project),
    ...validateTestFitCoordination(project),
    ...validateApartmentDesignCoordination(project),
    ...validateStructuralRealization(project),
    ...validateServicesRealization(project),
    ...validateCostRealization(project),
    ...validateDocumentationRealization(project),
    ...validateProfessionalExchange(project),
    ...validateStairCoordination(project, options.stairRuleProfile),
    ...validateWetCoreCoordination(project),
    ...validateServicesCoordination(project, options.servicesRuleProfile),
    ...validateFeasibilityEconomics(project),
    ...validateProfessionalHandoff(project),
    ...validateEquipmentCoordination(project),
    ...validateRoofDrainageCoordination(project),
    ...validateSpatialCoordination(project, options.spatialRuleProfile),
    ...validateBuildabilityCoordination(project, options.buildabilityRuleProfile),
    ...validateStructuralCoordination(project, options.structuralRuleProfile),
    ...validateDocumentCoordination(project),
    ...validateProjectWallDetails(project),
    ...validateColumnStacks(project, graph, tolerance),
    ...validateBeams(project, graph),
  ];
}
