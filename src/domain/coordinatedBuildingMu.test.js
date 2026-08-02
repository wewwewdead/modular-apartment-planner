import { describe, expect, it } from 'vitest';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';
import { deriveCostRealization } from './costRealization';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { createProject } from './models';
import { deriveProfessionalHandoff, deriveRevisionEntityRecords } from './professionalHandoff';
import { QUANTITY_RATE_KEYS } from './quantityTakeoff';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

function buildLambdaBasis() {
  let project = createProject('Mu two-storey four-unit apartment');
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
    width: 16_000,
    depth: 24_000,
    northAngle: 0,
    frontEdgeIndex: 0,
    roadName: 'Municipal road',
    setbacks: { front: 1000, rear: 1000, left: 1000, right: 1000 },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
    updates: {
      targetStoreys: 2,
      targetUnitCount: 4,
      targetBudget: 10_000_000,
      targetRentalIncome: 80_000,
      currency: 'PHP',
      preferredStructuralSystem: 'reinforced_concrete_frame',
    },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
    unitType: {
      id: 'mu_studio',
      name: 'Typical Studio',
      category: 'studio',
      targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
      spaceRequirements: [],
    },
    targetCount: 4,
    parkingRequirement: 0,
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TEST_FIT_PROFILE,
    unitDepth: 5000,
    corridorWidth: 1500,
    stairWidth: 2400,
    stairDepth: 4500,
    wetCoreWidth: 1200,
    wetCoreDepth: 1800,
    structuralBayTarget: 5500,
    floorToFloorHeight: 3000,
    planningCostPerSquareMeter: 25_000,
    currency: 'PHP',
  });
  project = run(project, { type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS });
  const option = project.building.testFitOptions.find(
    (entry) => !entry.findings.some((finding) => finding.severity === 'error'),
  );
  project = run(project, { type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION, optionId: option.id });
  project = run(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });
  project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });
  project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS });
  return { project, option };
}

function rates(materialMultiplier = 1) {
  return Object.fromEntries(
    QUANTITY_RATE_KEYS.map((rateKey, index) => [
      rateKey,
      {
        material: Math.round((1200 + index * 110) * materialMultiplier),
        labor: 450 + index * 35,
        equipment: 100 + index * 10,
      },
    ]),
  );
}

function configureMuInputs(project) {
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
    currency: 'PHP',
    reinforcementAllowanceKgPerM3: 100,
    excavationDepth: 500,
    unitRates: {},
  });
  for (const profile of [
    { id: 'mu_owner_prices', name: 'Owner canvass', sourceLabel: 'Owner supplier canvass', rateBasis: rates(1) },
    {
      id: 'mu_ve_prices',
      name: 'Reviewed alternatives canvass',
      sourceLabel: 'Alternative supplier canvass',
      rateBasis: rates(0.9),
    },
  ]) {
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE,
      profileId: profile.id,
      name: profile.name,
      region: 'Region IV-A',
      locality: 'Owner project locality',
      sourceLabel: profile.sourceLabel,
      sourceDate: '2026-08-01',
      currency: 'PHP',
      rates: profile.rateBasis,
    });
  }
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_CATALOG,
    assemblies: QUANTITY_RATE_KEYS.map((rateKey) => ({
      id: `mu_assembly_${rateKey}`,
      name: `${rateKey} owner assembly`,
      rateKey,
      wastePercent: 5,
      materialFactor: 1,
      laborFactor: 1,
      equipmentFactor: 1,
      note: 'Owner feasibility assembly; professional specification required.',
    })),
  });
  const scenario = {
    contingencyPercent: 10,
    professionalFeesPercent: 7,
    permitAllowance: 100_000,
    otherAllowance: 50_000,
    monthlyGrossRent: 80_000,
    vacancyPercent: 8,
    operatingExpensePercent: 22,
  };
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
    scenarioId: 'mu_owner_baseline',
    name: 'Owner baseline',
    priceProfileId: 'mu_owner_prices',
    ...scenario,
    setActive: true,
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
    scenarioId: 'mu_ve_alternative',
    name: 'VE alternative',
    priceProfileId: 'mu_ve_prices',
    ...scenario,
    setActive: false,
  });
  return project;
}

describe('Apartment Planner Mu acceptance', () => {
  it('accepts one traceable cost basis across the coordinated model, scenarios, handoff, reports, and persistence', () => {
    let { project, option } = buildLambdaBasis();
    project = configureMuInputs(project);
    project = run(project, { type: BUILDING_COMMANDS.REALIZE_QUANTITY_COST_BASELINE });

    const realization = deriveCostRealization(project);
    expect(realization).toMatchObject({
      state: expect.objectContaining({
        status: 'realized',
        sourceTestFitId: option.id,
        baselineScenarioId: 'mu_owner_baseline',
        baselinePriceProfileId: 'mu_owner_prices',
        pricingComplete: true,
        bidStatus: 'not_a_bid',
        appraisalStatus: 'not_an_appraisal',
        professionalCostCertificationStatus: 'not_performed',
      }),
      outOfDate: false,
      scenarioCount: 2,
      professionalReviewRequired: true,
    });
    expect(realization.lineItemCount).toBeGreaterThan(8);
    expect(realization.opportunityCount).toBeGreaterThan(0);
    expect(realization.assemblyCoverage.missingRateKeys).toEqual([]);
    expect(
      realization.state.lineItemSnapshots
        .filter((entry) => entry.quantity > 0)
        .every((entry) => entry.assemblyId?.startsWith('mu_assembly_')),
    ).toBe(true);
    expect(realization.state.realizedMetrics).toMatchObject({ pricingComplete: true, monthlyGrossRent: 80_000 });
    expect(realization.state.realizedMetrics.totalProjectCost).toBeGreaterThan(0);
    expect(realization.state.realizedMetrics.annualNetOperatingIncome).toBeGreaterThan(0);
    expect(realization.state.realizedMetrics.simplePaybackYears).toBeGreaterThan(0);
    expect(
      validateBuildingCoordination(project).filter(
        (entry) => entry.ruleId.startsWith('COST.') && entry.severity === 'error',
      ),
    ).toEqual([]);

    const opportunity = realization.state.valueEngineeringOpportunities[0];
    project = run(project, {
      type: BUILDING_COMMANDS.SET_VALUE_ENGINEERING_OPPORTUNITY_STATUS,
      opportunityId: opportunity.id,
      status: 'shortlisted_for_professional_review',
      note: 'Check supplier scope and design equivalence.',
    });
    expect(project.building.costRealization.valueEngineeringOpportunities[0]).toMatchObject({
      status: 'shortlisted_for_professional_review',
      acceptedSubstitution: false,
      professionalReviewRequired: true,
    });

    const manifest = derivePreliminaryPackage(project, 'mu');
    expect(manifest.hasCostRealization).toBe(true);
    expect(manifest.deliverables).toContainEqual(
      expect.objectContaining({ id: 'cost_realization_basis', ready: true }),
    );
    expect(manifest.sheets.find((entry) => entry.number === 'Q-001').viewports).toContainEqual(
      expect.objectContaining({ sourceRefId: 'cost_realization_basis' }),
    );
    const report = buildBuildingReport(project, 'cost_realization_basis');
    expect(report.title).toBe('Accepted Quantity and Cost Realization Basis');
    expect(report.rows.flat().join(' ')).toContain('mu_owner_baseline');
    expect(report.notes.join(' ')).toContain('not a bid, appraisal');

    const revisionKinds = deriveRevisionEntityRecords(project).map((entry) => entry.kind);
    expect(revisionKinds).toEqual(
      expect.arrayContaining(['costRealizationProfile', 'costRealizationState', 'valueEngineeringOpportunity']),
    );
    expect(deriveProfessionalHandoff(project)).toMatchObject({
      costRealizationState: expect.objectContaining({ status: 'realized' }),
    });

    const accepted = project.building.costRealization;
    project = run(project, { type: BUILDING_COMMANDS.REALIZE_QUANTITY_COST_BASELINE });
    expect(project.building.costRealization.lineItemSnapshots).toEqual(accepted.lineItemSnapshots);
    expect(project.building.costRealization.valueEngineeringOpportunities).toEqual(
      accepted.valueEngineeringOpportunities,
    );

    const restored = deserializeProject(serializeProject(project)).project;
    expect(restored.building.costRealization).toEqual(project.building.costRealization);
    expect(deriveCostRealization(restored).outOfDate).toBe(false);
  });

  it('guards incomplete inputs and makes an accepted basis stale when a source rate changes', () => {
    let { project } = buildLambdaBasis();
    expect(executeBuildingCommand(project, { type: BUILDING_COMMANDS.REALIZE_QUANTITY_COST_BASELINE })).toMatchObject({
      ok: false,
      error: { code: 'active-feasibility-scenario-required' },
    });
    project = configureMuInputs(project);
    project = run(project, { type: BUILDING_COMMANDS.REALIZE_QUANTITY_COST_BASELINE });
    const priorSignature = project.building.costRealization.inputSignature;
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE,
      profileId: 'mu_owner_prices',
      name: 'Owner canvass',
      region: 'Region IV-A',
      locality: 'Owner project locality',
      sourceLabel: 'Owner supplier canvass',
      sourceDate: '2026-08-01',
      currency: 'PHP',
      rates: rates(1.05),
    });
    const realization = deriveCostRealization(project);
    expect(realization.outOfDate).toBe(true);
    expect(realization.currentInputSignature).not.toBe(priorSignature);
    expect(validateBuildingCoordination(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'COST.REALIZATION_OUTDATED' }),
    );
    expect(derivePreliminaryPackage(project).deliverables).toContainEqual(
      expect.objectContaining({ id: 'cost_realization_basis', ready: false }),
    );
  });
});
