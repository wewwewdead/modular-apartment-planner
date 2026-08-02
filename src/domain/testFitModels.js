import { DESIGN_CONFIDENCE } from './trustModels';
import { deriveBuildableEnvelope } from './siteModels';
import { polygonArea } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';

export const TEST_FIT_STRATEGIES = Object.freeze(['single_loaded', 'double_loaded']);

export const DEFAULT_TEST_FIT_PROFILE = Object.freeze({
  id: 'owner_apartment_test_fit_v1',
  source: 'configured_owner_test_fit_assumptions_not_architectural_or_engineering_approval',
  unitDepth: 5500,
  corridorWidth: 1500,
  stairWidth: 2400,
  stairDepth: 4500,
  wetCoreWidth: 1200,
  wetCoreDepth: 1800,
  structuralBayTarget: 4000,
  floorToFloorHeight: 3000,
  planningCostPerSquareMeter: null,
  currency: 'PHP',
});

function clonePoint(point = {}) {
  return { x: Number(point.x) || 0, y: Number(point.y) || 0 };
}

function clonePolygon(points = []) {
  return points.map(clonePoint);
}

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function polygonBounds(points = []) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
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

export function createTestFitProfile(overrides = {}) {
  return {
    ...DEFAULT_TEST_FIT_PROFILE,
    ...overrides,
    planningCostPerSquareMeter:
      Number.isFinite(overrides.planningCostPerSquareMeter) && overrides.planningCostPerSquareMeter >= 0
        ? overrides.planningCostPerSquareMeter
        : null,
  };
}

function createBlock(overrides = {}) {
  const polygon = clonePolygon(overrides.polygon);
  return {
    id: overrides.id,
    kind: overrides.kind,
    name: overrides.name || '',
    levelIndex: overrides.levelIndex,
    polygon,
    area: polygonArea(polygon),
    unitTypeId: overrides.unitTypeId || null,
    sequence: overrides.sequence ?? null,
    useCategory: overrides.useCategory || null,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

export function createTestFitOption(overrides = {}) {
  return {
    id: overrides.id,
    name: overrides.name || 'Test fit',
    strategy: TEST_FIT_STRATEGIES.includes(overrides.strategy) ? overrides.strategy : 'single_loaded',
    inputSignature: overrides.inputSignature || '',
    profileId: overrides.profileId || null,
    footprint: clonePolygon(overrides.footprint),
    floorPlans: (overrides.floorPlans || []).map((plan) => ({
      levelIndex: plan.levelIndex,
      blocks: (plan.blocks || []).map(createBlock),
    })),
    proposedGrid: overrides.proposedGrid
      ? {
          ...overrides.proposedGrid,
          origin: clonePoint(overrides.proposedGrid.origin),
          xOffsets: [...(overrides.proposedGrid.xOffsets || [])],
          yOffsets: [...(overrides.proposedGrid.yOffsets || [])],
        }
      : null,
    metrics: { ...(overrides.metrics || {}) },
    findings: (overrides.findings || []).map((entry) => ({ ...entry })),
    score: Number(overrides.score) || 0,
    confidence: DESIGN_CONFIDENCE.CHECKED,
    professionalReviewRequired: true,
  };
}

export function testFitInputSignature(project, profile = createTestFitProfile(project?.building?.testFitProfile)) {
  return hashValue({
    boundary: project?.building?.site?.boundary || [],
    edgeSetbacks: project?.building?.site?.edgeSetbacks || [],
    brief: {
      targetStoreys: project?.building?.brief?.targetStoreys,
      targetUnitCount: project?.building?.brief?.targetUnitCount,
      targetBudget: project?.building?.brief?.targetBudget,
      currency: project?.building?.brief?.currency,
    },
    spaceProgram: project?.building?.spaceProgram || {},
    unitTypes: (project?.building?.unitTypes || []).map((entry) => ({
      id: entry.id,
      targetArea: entry.targetArea,
      category: entry.category,
    })),
    parkingRequirement: project?.building?.spaceProgram?.parkingRequirement,
    modeledParkingCount: project?.building?.site?.parkingPlan?.bays?.length || 0,
    profile,
  });
}

function fitFinding(optionId, ruleId, severity, message, inputs) {
  return {
    id: `${ruleId}:testFitOption:${optionId}`,
    ruleId,
    category: 'test_fit_coordination',
    severity,
    message,
    entityRefs: [{ type: 'testFitOption', id: optionId }],
    evidence: {
      resultKind: ruleId.includes('OUTSIDE') ? 'verified_geometry' : 'configured_rule_check',
      confidence: DESIGN_CONFIDENCE.CHECKED,
      inputs,
    },
    professionalReviewRequired: true,
  };
}

function programUnits(project) {
  const types = new Map((project?.building?.unitTypes || []).map((entry) => [entry.id, entry]));
  const units = [];
  for (const target of project?.building?.spaceProgram?.unitTargets || []) {
    const unitType = types.get(target.unitTypeId);
    if (!unitType) continue;
    for (let index = 0; index < target.count; index += 1) units.push(unitType);
  }
  return units;
}

function distributeUnits(units, storeys) {
  const floors = Array.from({ length: storeys }, () => []);
  units.forEach((unit, index) => floors[index % storeys].push(unit));
  return floors;
}

function preferredArea(unitType) {
  return unitType?.targetArea?.preferred || unitType?.targetArea?.min || 25_000_000;
}

function axisOffsets(count, spacing, finalOffset) {
  const values = Array.from({ length: count + 1 }, (_, index) => Math.min(index * spacing, finalOffset));
  values.push(finalOffset);
  return [...new Set(values.map((value) => Math.round(value)))].sort((a, b) => a - b);
}

function buildOption(project, profile, envelope, strategy, unitsByFloor, inputSignature) {
  const optionId = `${project.building.id}_test_fit_${strategy}_${inputSignature}`;
  const storeys = unitsByFloor.length;
  const maxUnitsOnFloor = Math.max(0, ...unitsByFloor.map((entries) => entries.length));
  const rows = strategy === 'double_loaded' ? 2 : 1;
  const maxUnitsPerRow = Math.max(1, Math.ceil(maxUnitsOnFloor / rows));
  const averagePreferredArea =
    unitsByFloor.flat().reduce((total, entry) => total + preferredArea(entry), 0) /
    Math.max(1, unitsByFloor.flat().length);
  const unitWidth = Math.max(2400, averagePreferredArea / profile.unitDepth);
  const rentableWidth = maxUnitsPerRow * unitWidth;
  const serviceStripWidth = profile.stairWidth + profile.wetCoreWidth;
  const footprintWidth = rentableWidth + serviceStripWidth;
  const footprintDepth = profile.unitDepth * rows + profile.corridorWidth;
  const bounds = polygonBounds(envelope);
  const availableWidth = bounds.maxX - bounds.minX;
  const availableDepth = bounds.maxY - bounds.minY;
  const origin = {
    x: bounds.minX + (availableWidth - footprintWidth) / 2,
    y: bounds.minY + (availableDepth - footprintDepth) / 2,
  };
  const footprint = rectangle(origin.x, origin.y, footprintWidth, footprintDepth);
  let sequence = 0;
  const floorPlans = unitsByFloor.map((floorUnits, levelIndex) => {
    const lowerCount = strategy === 'double_loaded' ? Math.ceil(floorUnits.length / 2) : floorUnits.length;
    const blocks = floorUnits.map((unitType, floorUnitIndex) => {
      const upperRow = strategy === 'double_loaded' && floorUnitIndex >= lowerCount;
      const rowIndex = upperRow ? floorUnitIndex - lowerCount : floorUnitIndex;
      sequence += 1;
      const y = upperRow ? origin.y + profile.unitDepth + profile.corridorWidth : origin.y;
      return createBlock({
        id: `${optionId}_unit_${sequence}`,
        kind: 'unit',
        name: `${unitType.name || 'Apartment'} ${sequence}`,
        levelIndex,
        polygon: rectangle(origin.x + rowIndex * unitWidth, y, unitWidth, profile.unitDepth),
        unitTypeId: unitType.id,
        sequence,
        useCategory: 'rentable',
      });
    });
    const corridorY = origin.y + profile.unitDepth;
    blocks.push(
      createBlock({
        id: `${optionId}_corridor_${levelIndex + 1}`,
        kind: 'corridor',
        name: 'Shared corridor',
        levelIndex,
        polygon: rectangle(origin.x, corridorY, rentableWidth, profile.corridorWidth),
        useCategory: 'circulation',
      }),
    );
    blocks.push(
      createBlock({
        id: `${optionId}_stair_${levelIndex + 1}`,
        kind: 'stair_core',
        name: 'Stair core reservation',
        levelIndex,
        polygon: rectangle(
          origin.x + rentableWidth,
          origin.y +
            Math.max(0, profile.unitDepth + profile.corridorWidth - Math.min(profile.stairDepth, footprintDepth)),
          profile.stairWidth,
          Math.min(profile.stairDepth, footprintDepth),
        ),
        useCategory: 'circulation',
      }),
    );
    blocks.push(
      createBlock({
        id: `${optionId}_wet_core_${levelIndex + 1}`,
        kind: 'wet_core',
        name: 'Wet-service core reservation',
        levelIndex,
        polygon: rectangle(
          origin.x + rentableWidth + profile.stairWidth,
          origin.y,
          profile.wetCoreWidth,
          profile.wetCoreDepth,
        ),
        useCategory: 'service',
      }),
    );
    return { levelIndex, blocks };
  });

  const xOffsets = axisOffsets(maxUnitsPerRow, unitWidth, footprintWidth);
  const yOffsets =
    strategy === 'double_loaded'
      ? [0, profile.unitDepth, profile.unitDepth + profile.corridorWidth, footprintDepth]
      : [0, profile.unitDepth, footprintDepth];
  const netRentableArea = floorPlans
    .flatMap((entry) => entry.blocks)
    .filter((entry) => entry.kind === 'unit')
    .reduce((total, entry) => total + entry.area, 0);
  const grossFloorArea = polygonArea(footprint) * storeys;
  const circulationArea = floorPlans
    .flatMap((entry) => entry.blocks)
    .filter((entry) => ['corridor', 'stair_core'].includes(entry.kind))
    .reduce((total, entry) => total + entry.area, 0);
  const serviceArea = floorPlans
    .flatMap((entry) => entry.blocks)
    .filter((entry) => entry.kind === 'wet_core')
    .reduce((total, entry) => total + entry.area, 0);
  const costRate = profile.planningCostPerSquareMeter;
  const estimatedCost = costRate == null ? null : (grossFloorArea / 1_000_000) * costRate;
  const budget = project.building.brief?.targetBudget;
  const findings = [];
  const footprintArea = polygonArea(footprint);
  const insideArea = intersectionArea(footprint, envelope);
  if (insideArea < footprintArea - 1) {
    findings.push(
      fitFinding(
        optionId,
        'TEST_FIT.OUTSIDE_BUILDABLE_ENVELOPE',
        'error',
        'The proposed test-fit footprint extends outside the checked buildable envelope.',
        { footprintArea, insideArea, availableWidth, availableDepth, footprintWidth, footprintDepth },
      ),
    );
  }
  const belowTarget = floorPlans
    .flatMap((entry) => entry.blocks)
    .filter((block) => {
      if (block.kind !== 'unit') return false;
      const unitType = (project.building.unitTypes || []).find((entry) => entry.id === block.unitTypeId);
      return unitType?.targetArea?.min != null && block.area < unitType.targetArea.min;
    });
  if (belowTarget.length)
    findings.push(
      fitFinding(
        optionId,
        'TEST_FIT.UNIT_AREA_BELOW_TARGET',
        'warning',
        'One or more unit blocks are below their configured minimum target area.',
        { blockIds: belowTarget.map((entry) => entry.id) },
      ),
    );
  const gridSpans = [
    ...xOffsets.slice(1).map((value, index) => value - xOffsets[index]),
    ...yOffsets.slice(1).map((value, index) => value - yOffsets[index]),
  ];
  const maximumGridSpan = Math.max(0, ...gridSpans);
  if (maximumGridSpan > profile.structuralBayTarget)
    findings.push(
      fitFinding(
        optionId,
        'TEST_FIT.STRUCTURAL_BAY_ABOVE_ASSUMPTION',
        'warning',
        'The proposed grid contains a bay above the configured test-fit target.',
        { maximumGridSpan, structuralBayTarget: profile.structuralBayTarget },
      ),
    );
  const parkingTarget =
    project.building.spaceProgram?.parkingRequirement ?? project.building.brief?.parkingRequirement ?? 0;
  const parkingCount = project.building.site?.parkingPlan?.bays?.length || 0;
  if (parkingCount < parkingTarget)
    findings.push(
      fitFinding(
        optionId,
        'TEST_FIT.PARKING_TARGET_UNMET',
        'warning',
        'The current site plan has fewer modeled parking bays than the apartment program.',
        { parkingCount, parkingTarget },
      ),
    );
  if (estimatedCost != null && Number.isFinite(budget) && estimatedCost > budget)
    findings.push(
      fitFinding(
        optionId,
        'TEST_FIT.BUDGET_EXCEEDED',
        'warning',
        'The test-fit planning allowance exceeds the configured project budget.',
        { estimatedCost, budget, planningCostPerSquareMeter: costRate },
      ),
    );
  const score = Math.max(
    0,
    Math.round(
      100 -
        findings.reduce((total, entry) => total + (entry.severity === 'error' ? 35 : 10), 0) -
        Math.max(0, 0.75 - netRentableArea / Math.max(1, grossFloorArea)) * 40,
    ),
  );
  return createTestFitOption({
    id: optionId,
    name: strategy === 'double_loaded' ? 'Double-loaded compact scheme' : 'Single-loaded tropical scheme',
    strategy,
    inputSignature,
    profileId: profile.id,
    footprint,
    floorPlans,
    proposedGrid: { id: `${optionId}_grid`, origin, xOffsets, yOffsets },
    metrics: {
      storeys,
      unitCount: unitsByFloor.flat().length,
      footprintArea,
      grossFloorArea,
      netRentableArea,
      circulationArea,
      serviceArea,
      efficiencyRatio: netRentableArea / Math.max(1, grossFloorArea),
      maximumGridSpan,
      estimatedCost,
      budgetVariance: estimatedCost == null || !Number.isFinite(budget) ? null : budget - estimatedCost,
      planningCostPerSquareMeter: costRate,
      costProvenance: costRate == null ? 'unavailable' : 'rule_of_thumb_allowance',
    },
    findings,
    score,
  });
}

export function generateTestFitOptions(project, overrides = {}) {
  const profile = createTestFitProfile({ ...project?.building?.testFitProfile, ...overrides });
  const envelope = deriveBuildableEnvelope(project?.building?.site || {}).points;
  const units = programUnits(project);
  const targetStoreys = project?.building?.brief?.targetStoreys;
  if (envelope.length < 3 || !units.length || !Number.isInteger(targetStoreys) || targetStoreys < 1) return [];
  const storeys = Math.min(4, Math.max(1, targetStoreys));
  const unitsByFloor = distributeUnits(units, storeys);
  const inputSignature = testFitInputSignature(project, profile);
  return TEST_FIT_STRATEGIES.map((strategy) =>
    buildOption(project, profile, envelope, strategy, unitsByFloor, inputSignature),
  ).sort((first, second) => second.score - first.score || first.id.localeCompare(second.id));
}

export function deriveTestFitCoordination(project) {
  const building = project?.building || {};
  const profile = createTestFitProfile(building.testFitProfile);
  const options = (building.testFitOptions || []).map(createTestFitOption);
  const selectedOption = options.find((entry) => entry.id === building.selectedTestFitId) || null;
  const acceptedOption = options.find((entry) => entry.id === building.acceptedTestFitId) || null;
  const currentInputSignature = testFitInputSignature(project, profile);
  return {
    profile,
    options,
    selectedOption,
    acceptedOption,
    currentInputSignature,
    outOfDateOptionCount: options.filter((entry) => entry.inputSignature !== currentInputSignature).length,
    readyOptionCount: options.filter((entry) => !entry.findings.some((finding) => finding.severity === 'error')).length,
    professionalReviewRequired: true,
  };
}

export function validateTestFitCoordination(project) {
  const coordination = deriveTestFitCoordination(project);
  const issues = [];
  const building = project?.building || {};
  if (building.selectedTestFitId && !coordination.selectedOption) {
    issues.push(
      fitFinding(
        building.selectedTestFitId,
        'TEST_FIT.SELECTED_REFERENCE_BROKEN',
        'error',
        'Selected test-fit option does not exist.',
        { selectedTestFitId: building.selectedTestFitId },
      ),
    );
  }
  if (building.acceptedTestFitId && !coordination.acceptedOption) {
    issues.push(
      fitFinding(
        building.acceptedTestFitId,
        'TEST_FIT.ACCEPTED_REFERENCE_BROKEN',
        'error',
        'Accepted test-fit option does not exist.',
        { acceptedTestFitId: building.acceptedTestFitId },
      ),
    );
  }
  if (
    coordination.selectedOption &&
    coordination.selectedOption.inputSignature !== coordination.currentInputSignature
  ) {
    issues.push(
      fitFinding(
        coordination.selectedOption.id,
        'TEST_FIT.OPTION_OUTDATED',
        'warning',
        'The selected test fit was generated from older site, program, parking, budget, or profile inputs.',
        {
          optionInputSignature: coordination.selectedOption.inputSignature,
          currentInputSignature: coordination.currentInputSignature,
        },
      ),
    );
  }
  if (coordination.selectedOption) issues.push(...coordination.selectedOption.findings);
  return issues;
}
