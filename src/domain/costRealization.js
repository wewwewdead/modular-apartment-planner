import { deriveFeasibilityComparison, deriveFeasibilityEconomics } from './feasibilityEconomics';
import { createQuantityProfile, deriveQuantityTakeoff } from './quantityTakeoff';
import { deriveServicesRealization } from './servicesRealization';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_COST_REALIZATION_PROFILE = Object.freeze({
  id: 'mu_ph_owner_feasibility_realization_v1',
  requiredCountryCode: 'PH',
  requireSourceDate: true,
  requireExplicitAssemblies: true,
  baselinePurpose: 'owner_apartment_feasibility_not_bid_or_appraisal',
  source: 'configured_owner_quantities_prices_assemblies_and_feasibility_assumptions',
});

export function createCostRealizationProfile(overrides = {}) {
  return {
    ...DEFAULT_COST_REALIZATION_PROFILE,
    ...overrides,
    requiredCountryCode: DEFAULT_COST_REALIZATION_PROFILE.requiredCountryCode,
    requireSourceDate: true,
    requireExplicitAssemblies: true,
    baselinePurpose: DEFAULT_COST_REALIZATION_PROFILE.baselinePurpose,
    source: DEFAULT_COST_REALIZATION_PROFILE.source,
  };
}

function cloneSnapshot(entry = {}) {
  return JSON.parse(JSON.stringify(entry));
}

export function createCostRealizationState(overrides = {}) {
  return {
    status: overrides.status || 'not_realized',
    sourceTestFitId: overrides.sourceTestFitId || null,
    sourceServicesRealizationSignature: overrides.sourceServicesRealizationSignature || '',
    inputSignature: overrides.inputSignature || '',
    baselineScenarioId: overrides.baselineScenarioId || null,
    baselinePriceProfileId: overrides.baselinePriceProfileId || null,
    currency: overrides.currency || 'PHP',
    pricingComplete: Boolean(overrides.pricingComplete),
    lineItemSnapshots: (overrides.lineItemSnapshots || []).map(cloneSnapshot),
    scenarioSnapshots: (overrides.scenarioSnapshots || []).map(cloneSnapshot),
    valueEngineeringOpportunities: (overrides.valueEngineeringOpportunities || []).map(cloneSnapshot),
    realizedMetrics: { ...(overrides.realizedMetrics || {}) },
    bidStatus: 'not_a_bid',
    appraisalStatus: 'not_an_appraisal',
    professionalCostCertificationStatus: 'not_performed',
    confidence: DESIGN_CONFIDENCE.CHECKED,
    professionalReviewRequired: true,
  };
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

function takeoffBasis(project) {
  const profile = createQuantityProfile(project?.building?.quantityProfile);
  return profile.scenarios.map((scenario) => {
    const takeoff = deriveQuantityTakeoff(project, { scenarioId: scenario.id });
    return {
      scenarioId: scenario.id,
      items: takeoff.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unit: item.unit,
        provenance: item.provenance,
        inputs: item.inputs,
        rateKey: item.rateKey,
        unitRate: item.unitRate,
        estimatedCost: item.estimatedCost,
        priceProfileId: item.priceProfileId,
        assemblyId: item.assemblyId,
      })),
    };
  });
}

export function costRealizationInputSignature(
  project,
  profile = createCostRealizationProfile(project?.building?.costRealizationProfile),
) {
  const building = project?.building || {};
  return hashValue({
    acceptedTestFitId: building.acceptedTestFitId || null,
    servicesRealizationSignature: building.systems?.realization?.inputSignature || '',
    brief: {
      targetBudget: building.brief?.targetBudget ?? null,
      targetRentalIncome: building.brief?.targetRentalIncome ?? null,
      currency: building.brief?.currency || 'PHP',
    },
    quantityProfile: createQuantityProfile(building.quantityProfile),
    takeoffBasis: takeoffBasis(project),
    profile,
  });
}

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'configured_estimate_check') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'feasibility_economics',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

function snapshotEconomics(economics) {
  return {
    scenarioId: economics.scenarioId,
    name: economics.scenario?.name || economics.scenarioId,
    priceProfileId: economics.priceProfile?.id || null,
    priceSource: economics.evidence.priceSource,
    pricingComplete: economics.pricingComplete,
    directConstructionCost: economics.directConstructionCost,
    contingency: economics.contingency,
    professionalFees: economics.professionalFees,
    permitAllowance: economics.permitAllowance,
    otherAllowance: economics.otherAllowance,
    totalProjectCost: economics.totalProjectCost,
    costPerGrossFloorAreaM2: economics.costPerGrossFloorAreaM2,
    targetBudget: economics.targetBudget,
    budgetVariance: economics.budgetVariance,
    monthlyGrossRent: economics.monthlyGrossRent,
    annualNetOperatingIncome: economics.annualNetOperatingIncome,
    netYieldPercent: economics.netYieldPercent,
    simplePaybackYears: economics.simplePaybackYears,
  };
}

function snapshotLineItem(item) {
  return {
    id: item.id,
    label: item.label,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    provenance: item.provenance,
    inputs: item.inputs,
    rateKey: item.rateKey,
    unitRate: item.unitRate,
    estimatedCost: item.estimatedCost,
    costBreakdown: item.costBreakdown,
    pricingBasis: item.pricingBasis,
    priceProfileId: item.priceProfileId,
    priceSource: item.priceSource,
    assemblyId: item.assemblyId,
  };
}

export function explicitAssemblyCoverage(project, takeoff = deriveQuantityTakeoff(project)) {
  const profile = createQuantityProfile(project?.building?.quantityProfile);
  const explicitRateKeys = new Set(profile.assemblies.map((assembly) => assembly.rateKey));
  const requiredRateKeys = [
    ...new Set(
      takeoff.items
        .filter((item) => item.quantity > 0)
        .map((item) => item.rateKey)
        .filter(Boolean),
    ),
  ];
  return {
    requiredRateKeys,
    explicitRateKeys: requiredRateKeys.filter((rateKey) => explicitRateKeys.has(rateKey)),
    missingRateKeys: requiredRateKeys.filter((rateKey) => !explicitRateKeys.has(rateKey)),
  };
}

export function realizeCostBaseline(project, profileOverrides = {}) {
  const building = project?.building || {};
  const services = deriveServicesRealization(project);
  if (services.state.status !== 'realized' || services.outOfDate)
    return {
      ok: false,
      code: 'current-services-realization-required',
      message: 'Create or regenerate the current Lambda building-systems realization before accepting a cost baseline.',
    };
  const profile = createCostRealizationProfile({ ...building.costRealizationProfile, ...profileOverrides });
  const economics = deriveFeasibilityEconomics(project);
  if (!economics.scenario)
    return {
      ok: false,
      code: 'active-feasibility-scenario-required',
      message: 'Configure and activate a feasibility scenario before accepting a cost baseline.',
    };
  if (
    !economics.priceProfile ||
    economics.priceProfile.countryCode !== profile.requiredCountryCode ||
    !economics.priceProfile.region ||
    !economics.priceProfile.sourceLabel ||
    !economics.priceProfile.sourceDate
  )
    return {
      ok: false,
      code: 'traceable-ph-price-profile-required',
      message: 'The active scenario requires a source-dated Philippine price profile with region and named source.',
    };
  if (!economics.pricingComplete)
    return {
      ok: false,
      code: 'complete-pricing-required',
      message: 'Every non-zero takeoff item must be priced before accepting a cost baseline.',
    };
  const coverage = explicitAssemblyCoverage(project, economics.takeoff);
  if (coverage.missingRateKeys.length)
    return {
      ok: false,
      code: 'explicit-assemblies-required',
      message: `Configure explicit assemblies for: ${coverage.missingRateKeys.join(', ')}.`,
      details: coverage,
    };

  const quantityProfile = createQuantityProfile(building.quantityProfile);
  const scenarioEconomics = quantityProfile.scenarios.map((scenario) =>
    deriveFeasibilityEconomics(project, scenario.id),
  );
  const untraceableScenario = scenarioEconomics.find(
    (entry) =>
      !entry.priceProfile ||
      entry.priceProfile.countryCode !== profile.requiredCountryCode ||
      !entry.priceProfile.region ||
      !entry.priceProfile.sourceLabel ||
      !entry.priceProfile.sourceDate,
  );
  if (untraceableScenario)
    return {
      ok: false,
      code: 'traceable-scenario-price-profile-required',
      message: `Scenario ${untraceableScenario.scenarioId} requires a source-dated Philippine price profile before it can be included in the accepted comparison.`,
    };
  const incompleteScenario = scenarioEconomics.find((entry) => !entry.pricingComplete);
  if (incompleteScenario)
    return {
      ok: false,
      code: 'complete-scenario-pricing-required',
      message: `Scenario ${incompleteScenario.scenarioId} has incomplete pricing and cannot be included in the accepted comparison.`,
    };
  const comparison = deriveFeasibilityComparison(project);
  const scenarioSnapshots = scenarioEconomics.map(snapshotEconomics);
  const priorOpportunities = new Map(
    (building.costRealization?.valueEngineeringOpportunities || []).map((entry) => [entry.id, entry]),
  );
  const opportunities = comparison.opportunities.map((entry) => ({
    id: `${economics.scenarioId}_${entry.alternativeScenarioId}_${entry.itemId}`,
    ...entry,
    status:
      priorOpportunities.get(`${economics.scenarioId}_${entry.alternativeScenarioId}_${entry.itemId}`)?.status ||
      'candidate_requires_design_and_supplier_review',
    decisionNote:
      priorOpportunities.get(`${economics.scenarioId}_${entry.alternativeScenarioId}_${entry.itemId}`)?.decisionNote ||
      '',
    geometryChanged: false,
    acceptedSubstitution: false,
    confidence: DESIGN_CONFIDENCE.CHECKED,
    professionalReviewRequired: true,
  }));
  const state = createCostRealizationState({
    status: 'realized',
    sourceTestFitId: building.acceptedTestFitId,
    sourceServicesRealizationSignature: services.state.inputSignature,
    inputSignature: costRealizationInputSignature(project, profile),
    baselineScenarioId: economics.scenarioId,
    baselinePriceProfileId: economics.priceProfile.id,
    currency: economics.currency,
    pricingComplete: true,
    lineItemSnapshots: economics.takeoff.items.map(snapshotLineItem),
    scenarioSnapshots,
    valueEngineeringOpportunities: opportunities,
    realizedMetrics: snapshotEconomics(economics),
  });
  return {
    ok: true,
    profile,
    state,
    coverage,
    project: { ...project, building: { ...building, costRealizationProfile: profile, costRealization: state } },
  };
}

export function deriveCostRealization(project) {
  const building = project?.building || {};
  const profile = createCostRealizationProfile(building.costRealizationProfile);
  const state = createCostRealizationState(building.costRealization);
  const currentEconomics = deriveFeasibilityEconomics(project, state.baselineScenarioId || null);
  const currentComparison = deriveFeasibilityComparison(project);
  const coverage = explicitAssemblyCoverage(project, currentEconomics.takeoff);
  const currentInputSignature = costRealizationInputSignature(project, profile);
  return {
    profile,
    state,
    currentInputSignature,
    outOfDate: state.status === 'realized' && state.inputSignature !== currentInputSignature,
    currentEconomics,
    currentComparison,
    assemblyCoverage: coverage,
    baselineCostDelta:
      state.status === 'realized' &&
      currentEconomics.totalProjectCost != null &&
      state.realizedMetrics.totalProjectCost != null
        ? currentEconomics.totalProjectCost - state.realizedMetrics.totalProjectCost
        : null,
    scenarioCount: state.scenarioSnapshots.length,
    lineItemCount: state.lineItemSnapshots.length,
    opportunityCount: state.valueEngineeringOpportunities.length,
    professionalReviewRequired: true,
  };
}

export function validateCostRealization(project) {
  const building = project?.building || {};
  const services = deriveServicesRealization(project);
  const derived = deriveCostRealization(project);
  const issues = [];
  if (services.state.status === 'realized' && derived.state.status !== 'realized') {
    issues.push(
      issue(
        'COST.REALIZATION_REQUIRED',
        'warning',
        'The coordinated Lambda model has no accepted quantity-and-cost baseline.',
        [{ type: 'building', id: building.id }],
        { servicesRealizationStatus: services.state.status },
        'missing_feasibility_baseline',
      ),
    );
    return issues;
  }
  if (derived.state.status !== 'realized') return issues;
  if (derived.state.sourceTestFitId !== building.acceptedTestFitId)
    issues.push(
      issue(
        'COST.REALIZATION_TEST_FIT_MISMATCH',
        'error',
        'Cost realization references a different accepted test fit.',
        [{ type: 'building', id: building.id }],
        { sourceTestFitId: derived.state.sourceTestFitId, acceptedTestFitId: building.acceptedTestFitId },
        'verified_relationship',
      ),
    );
  if (derived.state.sourceServicesRealizationSignature !== services.state.inputSignature)
    issues.push(
      issue(
        'COST.REALIZATION_SERVICES_BASIS_MISMATCH',
        'error',
        'Cost realization references a different Lambda systems basis.',
        [{ type: 'building', id: building.id }],
        {
          sourceServicesRealizationSignature: derived.state.sourceServicesRealizationSignature,
          currentServicesRealizationSignature: services.state.inputSignature,
        },
        'verified_relationship',
      ),
    );
  if (derived.outOfDate)
    issues.push(
      issue(
        'COST.REALIZATION_OUTDATED',
        'warning',
        'The accepted cost baseline is out of date with model quantities, assemblies, prices, budget, rent, or scenarios.',
        [{ type: 'costRealization', id: building.id }],
        { storedInputSignature: derived.state.inputSignature, currentInputSignature: derived.currentInputSignature },
      ),
    );
  if (!derived.state.pricingComplete || derived.state.realizedMetrics.totalProjectCost == null)
    issues.push(
      issue(
        'COST.REALIZATION_INCOMPLETE',
        'error',
        'Accepted cost realization must retain complete pricing and a total project cost.',
        [{ type: 'costRealization', id: building.id }],
        {
          pricingComplete: derived.state.pricingComplete,
          totalProjectCost: derived.state.realizedMetrics.totalProjectCost,
        },
        'estimate_integrity_check',
      ),
    );
  if (derived.assemblyCoverage.missingRateKeys.length)
    issues.push(
      issue(
        'COST.EXPLICIT_ASSEMBLY_MISSING',
        'error',
        'One or more non-zero takeoff categories lack an explicit assembly.',
        [{ type: 'costRealization', id: building.id }],
        derived.assemblyCoverage,
        'relationship_check',
      ),
    );
  const quantityProfile = createQuantityProfile(building.quantityProfile);
  if (!quantityProfile.scenarios.some((scenario) => scenario.id === derived.state.baselineScenarioId))
    issues.push(
      issue(
        'COST.BASELINE_SCENARIO_REFERENCE_BROKEN',
        'error',
        'Cost realization references a missing baseline scenario.',
        [{ type: 'costRealization', id: building.id }],
        { baselineScenarioId: derived.state.baselineScenarioId },
        'relationship_check',
      ),
    );
  if (!quantityProfile.priceProfiles.some((price) => price.id === derived.state.baselinePriceProfileId))
    issues.push(
      issue(
        'COST.BASELINE_PRICE_REFERENCE_BROKEN',
        'error',
        'Cost realization references a missing price profile.',
        [{ type: 'costRealization', id: building.id }],
        { baselinePriceProfileId: derived.state.baselinePriceProfileId },
        'relationship_check',
      ),
    );
  for (const opportunity of derived.state.valueEngineeringOpportunities) {
    if (opportunity.savings > 0 && opportunity.professionalReviewRequired && !opportunity.acceptedSubstitution)
      continue;
    issues.push(
      issue(
        'COST.VALUE_ENGINEERING_TRACEABILITY_INVALID',
        'error',
        'A value-engineering candidate lost its positive saving or professional-review boundary.',
        [{ type: 'valueEngineeringOpportunity', id: opportunity.id }],
        opportunity,
        'estimate_integrity_check',
      ),
    );
  }
  return issues;
}
