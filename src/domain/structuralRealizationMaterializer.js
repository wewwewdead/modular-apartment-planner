import { getBeamRenderData } from '@/geometry/beamGeometry';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { createBeam, createColumn } from './models';
import { resolveBeamBearingLevel } from './beamLevels';
import { createColumnStack, resolveGridIntersection } from './buildingModels';
import { inferSlabSupportRefs } from './structuralCoordination';
import {
  createStructuralRealizationProfile,
  createStructuralRealizationState,
  structuralRealizationInputSignature,
} from './structuralRealization';
import { DESIGN_CONFIDENCE } from './trustModels';

function generated(entity, realizationId, testFitId) {
  return {
    ...entity,
    generatedByStructuralRealizationId: realizationId,
    generatedByTestFitId: testFitId,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

function authoredStructureBlocksRealization(project) {
  const structural = project?.building?.systems?.structural || {};
  if (
    (project?.floors || []).some((floor) =>
      [...(floor.columns || []), ...(floor.beams || [])].some((entity) => !entity.generatedByStructuralRealizationId),
    )
  )
    return true;
  return (structural.columnStacks || []).some(
    (stack) =>
      !stack.generatedByStructuralRealizationId && ((stack.columnRefs || []).length > 0 || stack.intent === 'realized'),
  );
}

function orderedAxes(grid, orientation) {
  return (grid.axes || [])
    .filter((axis) => axis.orientation === orientation)
    .sort((first, second) => first.offset - second.offset || first.id.localeCompare(second.id));
}

function segmentKey(firstAxis, secondAxis, fixedAxis, orientation) {
  return `${orientation}_${fixedAxis.id}_${firstAxis.id}_${secondAxis.id}`;
}

function openingIntersections(beam, floor) {
  const data = getBeamRenderData(beam, floor.columns || []);
  if (!data) return [];
  return (floor.slabs || []).flatMap((slab) =>
    (slab.openings || [])
      .filter((opening) => intersectionArea(data.outline, opening.boundaryPoints || []) > 1)
      .map((opening) => opening.id),
  );
}

export function materializeAcceptedStructuralRealization(project, profileOverrides = {}) {
  const building = project?.building || {};
  const acceptedId = building.acceptedTestFitId;
  const option = (building.testFitOptions || []).find((entry) => entry.id === acceptedId);
  if (!option)
    return {
      ok: false,
      code: 'accepted-test-fit-required',
      message: 'Accept a current test fit before realizing structure.',
    };
  if (building.apartmentDesign?.status !== 'detailed' || building.apartmentDesign?.sourceTestFitId !== acceptedId) {
    return {
      ok: false,
      code: 'detailed-apartment-design-required',
      message: 'Detail the accepted apartment test fit before realizing its structural basis.',
    };
  }
  if (authoredStructureBlocksRealization(project)) {
    return {
      ok: false,
      code: 'authored-structural-geometry-protected',
      message:
        'Structural realization will not overwrite manually authored columns, beams, or populated column stacks.',
    };
  }
  const structural = building.systems?.structural || {};
  const grid = (structural.gridSystems || []).find((entry) => entry.id === option.proposedGrid?.id);
  if (!grid)
    return {
      ok: false,
      code: 'accepted-grid-missing',
      message: 'The accepted test fit has no matching canonical structural grid.',
    };
  const xAxes = orderedAxes(grid, 'vertical');
  const yAxes = orderedAxes(grid, 'horizontal');
  if (xAxes.length < 2 || yAxes.length < 2) {
    return {
      ok: false,
      code: 'accepted-grid-incomplete',
      message: 'Structural realization requires at least two grid axes in both directions.',
    };
  }
  const profile = createStructuralRealizationProfile({ ...structural.realizationProfile, ...profileOverrides });
  const realizationId = `${building.id}_structural_realization`;
  const cleanedFloors = (project.floors || []).map((floor) => {
    const removedBeamIds = new Set(
      (floor.beams || []).filter((beam) => beam.generatedByStructuralRealizationId).map((beam) => beam.id),
    );
    return {
      ...floor,
      columns: (floor.columns || []).filter((column) => !column.generatedByStructuralRealizationId),
      beams: (floor.beams || []).filter((beam) => !beam.generatedByStructuralRealizationId),
      slabs: (floor.slabs || []).map((slab) => ({
        ...slab,
        supportRefs: (slab.supportRefs || []).filter((ref) => ref.kind !== 'beam' || !removedBeamIds.has(ref.id)),
      })),
    };
  });
  const preservedStacks = (structural.columnStacks || []).filter((stack) => !stack.generatedByStructuralRealizationId);
  const stacks = [];
  const stackByIntersection = new Map();
  for (const xAxis of xAxes) {
    for (const yAxis of yAxes) {
      const intersection = { gridId: grid.id, xAxisId: xAxis.id, yAxisId: yAxis.id };
      const origin = resolveGridIntersection([grid], intersection);
      const stack = generated(
        createColumnStack(origin, {
          id: `${realizationId}_stack_${xAxis.id}_${yAxis.id}`,
          name: `${xAxis.label}${yAxis.label}`,
          gridIntersection: intersection,
        }),
        realizationId,
        acceptedId,
      );
      stack.intent = 'realized';
      stacks.push(stack);
      stackByIntersection.set(`${xAxis.id}:${yAxis.id}`, stack);
    }
  }

  const refs = { columnStacks: stacks.map((stack) => stack.id), columns: [], beams: [] };
  const skippedBeamSegments = [];
  const floors = cleanedFloors.map((floor) => {
    const columns = [...(floor.columns || [])];
    for (const stack of stacks) {
      const column = generated(
        createColumn(stack.origin.x, stack.origin.y, profile.columnWidth, profile.columnDepth, {
          height: floor.floorToFloorHeight ?? 3000,
          rotation: grid.rotation || 0,
          name: stack.name,
          showLabel: true,
          stackId: stack.id,
        }),
        realizationId,
        acceptedId,
      );
      column.id = `${stack.id}_${floor.id}_column`;
      columns.push(column);
      refs.columns.push(column.id);
    }
    const floorWithColumns = { ...floor, columns };
    const beams = [...(floor.beams || [])];
    const candidates = [];
    for (const yAxis of yAxes) {
      for (let index = 0; index < xAxes.length - 1; index += 1) {
        candidates.push({ orientation: 'x', fixedAxis: yAxis, firstAxis: xAxes[index], secondAxis: xAxes[index + 1] });
      }
    }
    for (const xAxis of xAxes) {
      for (let index = 0; index < yAxes.length - 1; index += 1) {
        candidates.push({ orientation: 'y', fixedAxis: xAxis, firstAxis: yAxes[index], secondAxis: yAxes[index + 1] });
      }
    }
    for (const candidate of candidates) {
      const startStack =
        candidate.orientation === 'x'
          ? stackByIntersection.get(`${candidate.firstAxis.id}:${candidate.fixedAxis.id}`)
          : stackByIntersection.get(`${candidate.fixedAxis.id}:${candidate.firstAxis.id}`);
      const endStack =
        candidate.orientation === 'x'
          ? stackByIntersection.get(`${candidate.secondAxis.id}:${candidate.fixedAxis.id}`)
          : stackByIntersection.get(`${candidate.fixedAxis.id}:${candidate.secondAxis.id}`);
      const startColumn = columns.find((column) => column.stackId === startStack.id);
      const endColumn = columns.find((column) => column.stackId === endStack.id);
      const key = segmentKey(candidate.firstAxis, candidate.secondAxis, candidate.fixedAxis, candidate.orientation);
      // Grid beams frame the top of the storey, sitting on the columns they
      // span — at the floor datum their soffit would fall below the slab and
      // they would cap no wall on this floor.
      const beam = generated(
        createBeam(
          { kind: 'column', id: startColumn.id },
          { kind: 'column', id: endColumn.id },
          profile.beamWidth,
          profile.beamDepth,
          resolveBeamBearingLevel(floorWithColumns, [startColumn.id, endColumn.id]),
          { placementRole: 'roof_ring', coordination: { condition: 'typical' } },
        ),
        realizationId,
        acceptedId,
      );
      beam.id = `${realizationId}_${floor.id}_beam_${key}`;
      beam.name = `${candidate.orientation.toUpperCase()} grid beam ${candidate.firstAxis.label}-${candidate.secondAxis.label}`;
      const openingIds = openingIntersections(beam, floorWithColumns);
      if (openingIds.length) {
        skippedBeamSegments.push({
          floorId: floor.id,
          gridId: grid.id,
          orientation: candidate.orientation,
          firstAxisId: candidate.firstAxis.id,
          secondAxisId: candidate.secondAxis.id,
          fixedAxisId: candidate.fixedAxis.id,
          openingIds,
          reason: 'modeled_slab_opening_intersection',
        });
        continue;
      }
      beams.push(beam);
      refs.beams.push(beam.id);
    }
    const floorWithFrame = { ...floorWithColumns, beams };
    return {
      ...floorWithFrame,
      slabs: (floorWithFrame.slabs || []).map((slab) => {
        const preserved = (slab.supportRefs || []).filter((ref) => ref.kind !== 'beam');
        const inferred = inferSlabSupportRefs(floorWithFrame, slab);
        const byKey = new Map([...preserved, ...inferred].map((ref) => [`${ref.kind}:${ref.id}`, ref]));
        return {
          ...slab,
          supportRefs: [...byKey.values()],
          coordination: {
            ...slab.coordination,
            supportAssignment: 'kappa_deterministic_grid_inference',
          },
        };
      }),
    };
  });

  const state = createStructuralRealizationState({
    status: 'realized',
    sourceTestFitId: acceptedId,
    sourceApartmentDesignSignature: building.apartmentDesign.inputSignature,
    inputSignature: structuralRealizationInputSignature(project, profile),
    generatedEntityRefs: refs,
    skippedBeamSegments,
    foundationStatus: 'not_modeled',
  });
  return {
    ok: true,
    profile,
    state,
    refs,
    project: {
      ...project,
      floors,
      building: {
        ...building,
        systems: {
          ...building.systems,
          structural: {
            ...structural,
            strategy: building.brief?.preferredStructuralSystem || structural.strategy || 'reinforced_concrete_frame',
            realizationProfile: profile,
            realization: state,
            columnStacks: [...preservedStacks, ...stacks],
          },
        },
      },
    },
  };
}
