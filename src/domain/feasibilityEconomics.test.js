import { describe, expect, it } from 'vitest';
import { createProject, createRoom, createSlab } from './models';
import {
  createAssemblyDefinition,
  createFeasibilityScenario,
  createPriceProfile,
  createQuantityProfile,
} from './quantityTakeoff';
import {
  deriveFeasibilityComparison,
  deriveFeasibilityEconomics,
  validateFeasibilityEconomics,
} from './feasibilityEconomics';

function rectangle(width, depth) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function pricedProject() {
  const project = createProject('Economics');
  const floor = project.floors[0];
  floor.slabs = [createSlab(floor.id, rectangle(10_000, 10_000), 200, 0)];
  floor.rooms = [{ ...createRoom('Rentable', rectangle(10_000, 10_000)), useCategory: 'rentable' }];
  project.building.brief.targetBudget = 2_500_000;
  project.building.brief.targetRentalIncome = 40_000;
  const rateKeys = ['concrete', 'formwork', 'floorFinish'];
  const rates = Object.fromEntries(rateKeys.map((key) => [key, { material: 1000, labor: 500, equipment: 0 }]));
  const base = createPriceProfile({
    id: 'prices_base',
    name: 'NCR supplier and labor basis',
    region: 'NCR',
    locality: 'Quezon City',
    sourceLabel: 'Owner supplier canvass',
    sourceDate: '2026-08-01',
    rates,
  });
  const value = createPriceProfile({
    id: 'prices_value',
    name: 'Alternative supplier basis',
    region: 'NCR',
    locality: 'Quezon City',
    sourceLabel: 'Alternative supplier canvass',
    sourceDate: '2026-08-01',
    rates: Object.fromEntries(rateKeys.map((key) => [key, { material: 800, labor: 500, equipment: 0 }])),
  });
  const assemblies = rateKeys.map((rateKey) =>
    createAssemblyDefinition({ id: `assembly_${rateKey}`, rateKey, wastePercent: rateKey === 'concrete' ? 5 : 0 }),
  );
  const common = {
    contingencyPercent: 10,
    professionalFeesPercent: 5,
    permitAllowance: 50_000,
    monthlyGrossRent: 40_000,
    vacancyPercent: 5,
    operatingExpensePercent: 20,
  };
  project.building.quantityProfile = createQuantityProfile({
    reinforcementAllowanceKgPerM3: 0,
    priceProfiles: [base, value],
    assemblies,
    scenarios: [
      createFeasibilityScenario({ id: 'scenario_base', name: 'Base', priceProfileId: base.id, ...common }),
      createFeasibilityScenario({ id: 'scenario_value', name: 'Value', priceProfileId: value.id, ...common }),
    ],
    activeScenarioId: 'scenario_base',
  });
  return project;
}

describe('feasibility economics', () => {
  it('derives complete project cost, cost/m², income, yield, and payback from configured inputs', () => {
    const result = deriveFeasibilityEconomics(pricedProject());
    expect(result.pricingComplete).toBe(true);
    expect(result.directConstructionCost).toBeCloseTo(331_000);
    expect(result.totalProjectCost).toBeCloseTo(430_650);
    expect(result.grossFloorAreaM2).toBeCloseTo(100);
    expect(result.costPerGrossFloorAreaM2).toBeCloseTo(4306.5);
    expect(result.annualGrossRent).toBe(480_000);
    expect(result.vacancyLoss).toBe(24_000);
    expect(result.annualNetOperatingIncome).toBe(364_800);
    expect(result.netYieldPercent).toBeCloseTo(84.709, 2);
    expect(result.simplePaybackYears).toBeCloseTo(1.181, 2);
    expect(result.evidence).toMatchObject({
      resultKind: 'estimate_from_configured_inputs',
      confidence: 'checked',
      priceSource: { label: 'Owner supplier canvass', date: '2026-08-01', region: 'NCR' },
    });
  });

  it('withholds investment metrics when any modeled takeoff item remains unpriced', () => {
    const project = pricedProject();
    project.building.quantityProfile.priceProfiles[0].rates.floorFinish = {
      material: null,
      labor: null,
      equipment: null,
      note: '',
    };
    const result = deriveFeasibilityEconomics(project);
    expect(result.pricingComplete).toBe(false);
    expect(result.totalProjectCost).toBeNull();
    expect(result.costPerGrossFloorAreaM2).toBeNull();
    expect(result.netYieldPercent).toBeNull();
    expect(result.simplePaybackYears).toBeNull();
    expect(result.warnings.join(' ')).toContain('withheld until pricing is complete');
  });

  it('compares configured scenarios and exposes item-level savings without changing design geometry', () => {
    const comparison = deriveFeasibilityComparison(pricedProject());
    expect(comparison.scenarios).toHaveLength(2);
    expect(comparison.opportunities.length).toBeGreaterThan(0);
    expect(comparison.opportunities[0]).toMatchObject({
      baselineScenarioId: 'scenario_base',
      alternativeScenarioId: 'scenario_value',
      requiresDesignReview: true,
      basis: 'configured_price_and_assembly_comparison',
    });
    expect(comparison.opportunities.reduce((total, entry) => total + entry.savings, 0)).toBeGreaterThan(0);
  });

  it('reports broken scenario pricing references and incomplete source provenance', () => {
    const project = pricedProject();
    project.building.quantityProfile.scenarios[0].priceProfileId = 'missing';
    project.building.quantityProfile.priceProfiles[0].sourceDate = '';
    expect(validateFeasibilityEconomics(project)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'FEAS.SCENARIO_PRICE_PROFILE_BROKEN', severity: 'error' }),
        expect.objectContaining({ ruleId: 'FEAS.PRICE_SOURCE_INCOMPLETE', severity: 'warning' }),
      ]),
    );
  });
});
