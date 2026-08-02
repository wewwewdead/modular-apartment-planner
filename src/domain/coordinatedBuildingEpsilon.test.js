import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { deriveFeasibilityComparison, deriveFeasibilityEconomics } from './feasibilityEconomics';
import { createFloor, createProject, createRoom, createSlab } from './models';
import { deriveQuantityTakeoff } from './quantityTakeoff';
import { validateBuildingCoordination } from './buildingGraph';
import { resolveSheetViewportSource } from '@/sheets/sources';

function rectangle(width, depth) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function rectangleAt(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function execute(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

function priceRates(materialAdjustment = 0) {
  return {
    concrete: { material: 5_000 + materialAdjustment, labor: 1_500, equipment: 500 },
    formwork: { material: 650 + materialAdjustment / 10, labor: 450, equipment: 100 },
    floorFinish: { material: 700 + materialAdjustment / 10, labor: 350, equipment: 0 },
  };
}

describe('Apartment Planner Epsilon acceptance', () => {
  it('keeps source-dated quantities, project cost, apartment income, scenarios, validation, and handoff reports coordinated', () => {
    let project = createProject('Two-storey four-unit Epsilon basis');
    const upper = createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 });
    project.floors.push(upper);
    project.building.levelIds.push(upper.id);
    for (const floor of project.floors) {
      floor.slabs = [
        { ...createSlab(floor.id, rectangle(10_000, 8_000), 150, floor.elevation), id: `${floor.id}_slab` },
      ];
      floor.rooms = [
        { ...createRoom('Unit A', rectangle(5_000, 8_000)), id: `${floor.id}_unit_a`, useCategory: 'rentable' },
        {
          ...createRoom('Unit B', rectangleAt(5000, 0, 5000, 8000)),
          id: `${floor.id}_unit_b`,
          useCategory: 'rentable',
        },
      ];
    }
    project.building.brief.targetBudget = 4_500_000;
    project.building.brief.targetRentalIncome = 48_000;

    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      currency: 'PHP',
      reinforcementAllowanceKgPerM3: 0,
      unitRates: {},
    });
    for (const profile of [
      {
        id: 'prices_owner',
        name: 'Owner supplier canvass',
        sourceLabel: 'Owner supplier canvass',
        rates: priceRates(0),
      },
      {
        id: 'prices_alternative',
        name: 'Alternative supplier canvass',
        sourceLabel: 'Alternative supplier canvass',
        rates: priceRates(-500),
      },
    ]) {
      project = execute(project, {
        type: BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE,
        profileId: profile.id,
        name: profile.name,
        region: 'Region IV-A',
        locality: 'Owner project locality',
        sourceLabel: profile.sourceLabel,
        sourceDate: '2026-08-01',
        currency: 'PHP',
        rates: profile.rates,
      });
    }
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_CATALOG,
      assemblies: [
        {
          id: 'assembly_concrete',
          name: 'Concrete allowance',
          rateKey: 'concrete',
          wastePercent: 5,
          materialFactor: 1,
          laborFactor: 1,
          equipmentFactor: 1,
        },
        {
          id: 'assembly_formwork',
          name: 'Formwork allowance',
          rateKey: 'formwork',
          wastePercent: 10,
          materialFactor: 1,
          laborFactor: 1,
          equipmentFactor: 1,
        },
        {
          id: 'assembly_floor_finish',
          name: 'Floor finish allowance',
          rateKey: 'floorFinish',
          wastePercent: 8,
          materialFactor: 1,
          laborFactor: 1,
          equipmentFactor: 1,
        },
      ],
    });
    const scenarioBasis = {
      contingencyPercent: 10,
      professionalFeesPercent: 7,
      permitAllowance: 100_000,
      otherAllowance: 50_000,
      monthlyGrossRent: 48_000,
      vacancyPercent: 8,
      operatingExpensePercent: 22,
    };
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
      scenarioId: 'scenario_owner',
      name: 'Owner basis',
      priceProfileId: 'prices_owner',
      ...scenarioBasis,
      setActive: true,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
      scenarioId: 'scenario_alternative',
      name: 'Alternative supplier',
      priceProfileId: 'prices_alternative',
      ...scenarioBasis,
      setActive: false,
    });

    const takeoff = deriveQuantityTakeoff(project);
    expect(takeoff.items.filter((entry) => entry.quantity > 0).every((entry) => entry.estimatedCost != null)).toBe(
      true,
    );
    expect(takeoff.items.find((entry) => entry.id === 'concrete')).toMatchObject({
      pricingBasis: 'price_profile_and_configured_assembly',
      priceProfileId: 'prices_owner',
      assemblyId: 'assembly_concrete',
      priceSource: { label: 'Owner supplier canvass', date: '2026-08-01', region: 'Region IV-A' },
      professionalReviewRequired: true,
    });
    expect(takeoff.items.find((entry) => entry.id === 'concrete').costBreakdown).toMatchObject({
      material: { unitRate: 5250 },
      labor: { unitRate: 1500 },
      equipment: { unitRate: 500 },
    });

    const economics = deriveFeasibilityEconomics(project);
    expect(economics).toMatchObject({
      scenarioId: 'scenario_owner',
      pricingComplete: true,
      grossFloorAreaM2: 160,
      monthlyGrossRent: 48_000,
      professionalReviewRequired: true,
      evidence: {
        resultKind: 'estimate_from_configured_inputs',
        confidence: 'checked',
        priceProfileId: 'prices_owner',
      },
    });
    expect(economics.totalProjectCost).toBeGreaterThan(economics.directConstructionCost);
    expect(economics.costPerGrossFloorAreaM2).toBeGreaterThan(0);
    expect(economics.annualNetOperatingIncome).toBeGreaterThan(0);
    expect(economics.netYieldPercent).toBeGreaterThan(0);
    expect(economics.simplePaybackYears).toBeGreaterThan(0);

    const comparison = deriveFeasibilityComparison(project);
    expect(comparison).toMatchObject({ baselineScenarioId: 'scenario_owner' });
    expect(comparison.scenarios).toHaveLength(2);
    expect(comparison.opportunities.some((entry) => entry.alternativeScenarioId === 'scenario_alternative')).toBe(true);
    expect(project.building.quantityProfile.activeScenarioId).toBe('scenario_owner');

    const feasibilityIssues = validateBuildingCoordination(project).filter(
      (entry) => entry.category === 'feasibility_economics',
    );
    expect(feasibilityIssues).toEqual([]);

    const manifest = derivePreliminaryPackage(project, 'epsilon');
    expect(manifest.deliverables).toContainEqual(expect.objectContaining({ id: 'feasibility_summary', ready: true }));
    const quantitySheet = manifest.sheets.find((sheet) => sheet.number === 'Q-001');
    const feasibilityViewport = quantitySheet.viewports.find((entry) => entry.sourceRefId === 'feasibility_summary');
    expect(resolveSheetViewportSource(project, feasibilityViewport)).toMatchObject({
      kind: 'building_report',
      report: { title: 'Owner Feasibility Scenario Summary' },
    });
    const report = buildBuildingReport(project, 'feasibility_summary');
    expect(report.rows).toHaveLength(2);
    expect(report.rows.every((row) => row[1] === 'Complete configured pricing')).toBe(true);
    expect(report.notes.join(' ')).toContain('not a bid, appraisal, lending recommendation, investment advice');
  });
});
