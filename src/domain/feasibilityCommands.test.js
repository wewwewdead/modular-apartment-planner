import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createProject, createRoom, createSlab } from './models';
import { deriveFeasibilityEconomics } from './feasibilityEconomics';

function rectangle(width, depth) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function projectWithGeometry() {
  const project = createProject('Command economics');
  const floor = project.floors[0];
  floor.slabs = [createSlab(floor.id, rectangle(5000, 4000), 200, 0)];
  floor.rooms = [createRoom('Unit', rectangle(5000, 4000))];
  project.building.brief.targetBudget = 1_000_000;
  project.building.brief.targetRentalIncome = 20_000;
  return project;
}

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result;
}

describe('Epsilon feasibility commands', () => {
  it('persists source-dated Philippine pricing, assembly factors, and an active scenario', () => {
    let result = run(projectWithGeometry(), {
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      reinforcementAllowanceKgPerM3: 0,
      unitRates: {},
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE,
      profileId: 'profile_ncr',
      name: 'NCR owner canvass',
      region: 'NCR',
      locality: 'Quezon City',
      sourceLabel: 'Supplier quotations',
      sourceDate: '2026-08-01',
      currency: 'PHP',
      rates: {
        concrete: { material: 1000, labor: 500, equipment: 0 },
        formwork: { material: 500, labor: 500, equipment: 0 },
        floorFinish: { material: 600, labor: 400, equipment: 0 },
      },
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_DEFINITION,
      assemblyId: 'assembly_concrete',
      name: 'Cast-in-place concrete allowance',
      rateKey: 'concrete',
      quantityUnit: 'm³',
      wastePercent: 5,
      materialFactor: 1,
      laborFactor: 1,
      equipmentFactor: 1,
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
      scenarioId: 'scenario_base',
      name: 'Base feasibility',
      priceProfileId: 'profile_ncr',
      contingencyPercent: 10,
      professionalFeesPercent: 5,
      permitAllowance: 25_000,
      otherAllowance: 0,
      monthlyGrossRent: 20_000,
      vacancyPercent: 5,
      operatingExpensePercent: 20,
    });

    expect(result.project.building.quantityProfile).toMatchObject({
      activeScenarioId: 'scenario_base',
      priceProfiles: [
        expect.objectContaining({
          id: 'profile_ncr',
          countryCode: 'PH',
          region: 'NCR',
          sourceLabel: 'Supplier quotations',
          sourceDate: '2026-08-01',
        }),
      ],
      assemblies: [expect.objectContaining({ id: 'assembly_concrete', wastePercent: 5 })],
      scenarios: [expect.objectContaining({ id: 'scenario_base', priceProfileId: 'profile_ncr' })],
    });
    expect(result.undo).toMatchObject({ kind: 'project_snapshot' });
    expect(deriveFeasibilityEconomics(result.project)).toMatchObject({
      pricingComplete: true,
      scenarioId: 'scenario_base',
      currency: 'PHP',
    });
  });

  it('switches active scenarios without mutating modeled geometry', () => {
    const project = projectWithGeometry();
    project.building.quantityProfile.priceProfiles = [
      {
        id: 'profile_1',
        name: 'Profile',
        countryCode: 'PH',
        region: 'Region',
        sourceLabel: 'Source',
        sourceDate: '2026-08-01',
        rates: {},
      },
    ];
    project.building.quantityProfile.scenarios = [
      { id: 'scenario_1', name: 'One', priceProfileId: 'profile_1' },
      { id: 'scenario_2', name: 'Two', priceProfileId: 'profile_1' },
    ];
    project.building.quantityProfile.activeScenarioId = 'scenario_1';
    const floorBefore = project.floors[0];
    const result = run(project, {
      type: BUILDING_COMMANDS.SET_ACTIVE_FEASIBILITY_SCENARIO,
      scenarioId: 'scenario_2',
    });
    expect(result.project.building.quantityProfile.activeScenarioId).toBe('scenario_2');
    expect(result.project.floors[0]).toBe(floorBefore);
  });

  it('replaces an assembly catalog atomically and rejects duplicate rate keys', () => {
    const project = projectWithGeometry();
    const assemblies = [
      {
        id: 'assembly_concrete',
        name: 'Concrete',
        rateKey: 'concrete',
        wastePercent: 5,
        materialFactor: 1,
        laborFactor: 1,
        equipmentFactor: 1,
      },
      {
        id: 'assembly_formwork',
        name: 'Formwork',
        rateKey: 'formwork',
        wastePercent: 10,
        materialFactor: 1,
        laborFactor: 1.1,
        equipmentFactor: 1,
      },
    ];
    const result = run(project, { type: BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_CATALOG, assemblies });
    expect(result.project.building.quantityProfile.assemblies).toMatchObject(assemblies);
    expect(result.changes.domain).toContainEqual(
      expect.objectContaining({ operation: 'replace_catalog', entityType: 'assemblyDefinition' }),
    );

    const rejected = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_CATALOG,
      assemblies: [assemblies[0], { ...assemblies[1], rateKey: 'concrete' }],
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'invalid-assembly-catalog' } });
    expect(project.building.quantityProfile.assemblies).toEqual([]);
  });

  it('rejects untraceable price profiles and invalid scenario percentages', () => {
    const project = projectWithGeometry();
    expect(
      executeBuildingCommand(project, {
        type: BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE,
        profileId: 'bad',
        name: 'Bad',
        region: '',
        sourceLabel: '',
        sourceDate: '',
        rates: {},
      }),
    ).toMatchObject({ ok: false, error: { code: 'price-source-required' } });

    project.building.quantityProfile.priceProfiles = [
      { id: 'profile_1', name: 'Profile', region: 'NCR', sourceLabel: 'Source', sourceDate: '2026-08-01', rates: {} },
    ];
    expect(
      executeBuildingCommand(project, {
        type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
        scenarioId: 'bad_scenario',
        name: 'Bad',
        priceProfileId: 'profile_1',
        contingencyPercent: 101,
        professionalFeesPercent: 0,
        permitAllowance: 0,
        otherAllowance: 0,
        monthlyGrossRent: 0,
        vacancyPercent: 0,
        operatingExpensePercent: 0,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-scenario-percentage' } });
  });
});
