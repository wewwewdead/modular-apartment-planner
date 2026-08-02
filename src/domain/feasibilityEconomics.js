import { deriveAreaLedger } from './siteModels';
import { createQuantityProfile, deriveQuantityTakeoff } from './quantityTakeoff';
import { DESIGN_CONFIDENCE } from './trustModels';

function percentAmount(base, percent) {
  return base * ((Number(percent) || 0) / 100);
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

export function deriveFeasibilityEconomics(project, scenarioId = null) {
  const profile = createQuantityProfile(project?.building?.quantityProfile);
  const resolvedScenarioId = scenarioId || profile.activeScenarioId || profile.scenarios[0]?.id || null;
  const scenario = profile.scenarios.find((entry) => entry.id === resolvedScenarioId) || null;
  const priceProfile = profile.priceProfiles.find((entry) => entry.id === scenario?.priceProfileId) || null;
  const takeoff = deriveQuantityTakeoff(project, { scenarioId: resolvedScenarioId });
  const directConstructionCost = takeoff.totalEstimatedCost;
  const requiredUnpricedItemCount = takeoff.items.filter(
    (entry) => entry.quantity > 0 && entry.estimatedCost == null,
  ).length;
  const pricingComplete = Boolean(
    scenario && priceProfile && takeoff.items.length > 0 && requiredUnpricedItemCount === 0,
  );
  const contingency = pricingComplete ? percentAmount(directConstructionCost, scenario.contingencyPercent) : null;
  const professionalFees = pricingComplete
    ? percentAmount(directConstructionCost, scenario.professionalFeesPercent)
    : null;
  const permitAllowance = scenario?.permitAllowance ?? 0;
  const otherAllowance = scenario?.otherAllowance ?? 0;
  const totalProjectCost = pricingComplete
    ? directConstructionCost + contingency + professionalFees + permitAllowance + otherAllowance
    : null;
  const ledger = deriveAreaLedger(project || {});
  const grossFloorAreaM2 = (ledger.grossFloorArea?.value || 0) / 1_000_000;
  const costPerGrossFloorAreaM2 =
    totalProjectCost != null && grossFloorAreaM2 > 0 ? totalProjectCost / grossFloorAreaM2 : null;
  const monthlyGrossRent = scenario?.monthlyGrossRent ?? project?.building?.brief?.targetRentalIncome ?? null;
  const annualGrossRent = monthlyGrossRent == null ? null : monthlyGrossRent * 12;
  const vacancyLoss = annualGrossRent == null ? null : percentAmount(annualGrossRent, scenario?.vacancyPercent || 0);
  const effectiveAnnualIncome = annualGrossRent == null ? null : annualGrossRent - vacancyLoss;
  const operatingExpenses =
    effectiveAnnualIncome == null ? null : percentAmount(effectiveAnnualIncome, scenario?.operatingExpensePercent || 0);
  const annualNetOperatingIncome = effectiveAnnualIncome == null ? null : effectiveAnnualIncome - operatingExpenses;
  const grossYieldPercent =
    totalProjectCost > 0 && annualGrossRent != null ? (annualGrossRent / totalProjectCost) * 100 : null;
  const netYieldPercent =
    totalProjectCost > 0 && annualNetOperatingIncome != null
      ? (annualNetOperatingIncome / totalProjectCost) * 100
      : null;
  const simplePaybackYears =
    totalProjectCost > 0 && annualNetOperatingIncome > 0 ? totalProjectCost / annualNetOperatingIncome : null;
  const targetBudget = project?.building?.brief?.targetBudget;
  const budgetVariance = totalProjectCost == null || targetBudget == null ? null : targetBudget - totalProjectCost;
  const costDrivers = takeoff.items
    .filter((entry) => entry.estimatedCost != null)
    .map((entry) => ({
      itemId: entry.id,
      label: entry.label,
      quantity: entry.quantity,
      unit: entry.unit,
      unitRate: entry.unitRate,
      estimatedCost: entry.estimatedCost,
      sharePercent: directConstructionCost > 0 ? (entry.estimatedCost / directConstructionCost) * 100 : 0,
      pricingBasis: entry.pricingBasis,
      priceProfileId: entry.priceProfileId,
      assemblyId: entry.assemblyId,
    }))
    .sort((a, b) => b.estimatedCost - a.estimatedCost);

  return {
    scenario,
    scenarioId: resolvedScenarioId,
    priceProfile,
    currency: priceProfile?.currency || takeoff.currency || 'PHP',
    takeoff,
    requiredUnpricedItemCount,
    pricingComplete,
    directConstructionCost,
    contingency,
    professionalFees,
    permitAllowance,
    otherAllowance,
    totalProjectCost,
    grossFloorAreaM2,
    costPerGrossFloorAreaM2,
    targetBudget: targetBudget ?? null,
    budgetVariance,
    monthlyGrossRent,
    annualGrossRent,
    vacancyLoss,
    effectiveAnnualIncome,
    operatingExpenses,
    annualNetOperatingIncome,
    grossYieldPercent,
    netYieldPercent,
    simplePaybackYears,
    costDrivers,
    evidence: {
      resultKind: 'estimate_from_configured_inputs',
      confidence: DESIGN_CONFIDENCE.CHECKED,
      scenarioId: resolvedScenarioId,
      priceProfileId: priceProfile?.id || null,
      priceSource: priceProfile
        ? {
            label: priceProfile.sourceLabel,
            date: priceProfile.sourceDate,
            region: priceProfile.region,
            locality: priceProfile.locality,
          }
        : null,
    },
    warnings: [
      ...(!scenario ? ['No feasibility scenario is configured.'] : []),
      ...(!priceProfile ? ['Scenario has no valid Philippine price profile.'] : []),
      ...(requiredUnpricedItemCount ? [`${requiredUnpricedItemCount} non-zero takeoff items remain unpriced.`] : []),
      ...(!pricingComplete
        ? ['Yield, payback, cost/m², and budget variance are withheld until pricing is complete.']
        : []),
      ...(monthlyGrossRent == null ? ['Monthly gross rent is not configured.'] : []),
    ],
    professionalReviewRequired: true,
  };
}

export function deriveFeasibilityComparison(project, scenarioIds = null) {
  const profile = createQuantityProfile(project?.building?.quantityProfile);
  const ids = scenarioIds?.length ? scenarioIds : profile.scenarios.map((scenario) => scenario.id);
  const scenarios = ids.map((id) => deriveFeasibilityEconomics(project, id));
  const baseline = scenarios.find((entry) => entry.scenarioId === profile.activeScenarioId) || scenarios[0] || null;
  const comparisons = scenarios.map((entry) => ({
    scenarioId: entry.scenarioId,
    name: entry.scenario?.name || entry.scenarioId,
    pricingComplete: entry.pricingComplete,
    totalProjectCost: entry.totalProjectCost,
    costPerGrossFloorAreaM2: entry.costPerGrossFloorAreaM2,
    budgetVariance: entry.budgetVariance,
    annualNetOperatingIncome: entry.annualNetOperatingIncome,
    netYieldPercent: entry.netYieldPercent,
    simplePaybackYears: entry.simplePaybackYears,
    deltaFromBaseline:
      baseline?.totalProjectCost != null && entry.totalProjectCost != null
        ? entry.totalProjectCost - baseline.totalProjectCost
        : null,
  }));
  const opportunities = [];
  if (baseline) {
    const baselineItems = new Map(baseline.takeoff.items.map((entry) => [entry.id, entry]));
    for (const alternative of scenarios.filter((entry) => entry.scenarioId !== baseline.scenarioId)) {
      for (const item of alternative.takeoff.items) {
        const baseItem = baselineItems.get(item.id);
        if (baseItem?.estimatedCost == null || item.estimatedCost == null) continue;
        const savings = baseItem.estimatedCost - item.estimatedCost;
        if (savings <= 0) continue;
        opportunities.push({
          baselineScenarioId: baseline.scenarioId,
          alternativeScenarioId: alternative.scenarioId,
          itemId: item.id,
          label: item.label,
          quantity: item.quantity,
          unit: item.unit,
          baselineUnitRate: baseItem.unitRate,
          alternativeUnitRate: item.unitRate,
          savings,
          basis: 'configured_price_and_assembly_comparison',
          requiresDesignReview: true,
        });
      }
    }
  }
  opportunities.sort((a, b) => b.savings - a.savings);
  return { baselineScenarioId: baseline?.scenarioId || null, scenarios: comparisons, opportunities };
}

export function validateFeasibilityEconomics(project) {
  const profile = createQuantityProfile(project?.building?.quantityProfile);
  if (!profile.priceProfiles.length && !profile.scenarios.length) return [];
  const issues = [];
  const priceProfileIds = new Set(profile.priceProfiles.map((entry) => entry.id));
  for (const scenario of profile.scenarios) {
    if (!scenario.priceProfileId || !priceProfileIds.has(scenario.priceProfileId)) {
      issues.push(
        issue(
          'FEAS.SCENARIO_PRICE_PROFILE_BROKEN',
          'error',
          `${scenario.name} must reference an existing price profile.`,
          [{ type: 'feasibilityScenario', id: scenario.id }],
          { priceProfileId: scenario.priceProfileId },
          'relationship_check',
        ),
      );
    }
  }
  for (const priceProfile of profile.priceProfiles) {
    if (priceProfile.region && priceProfile.sourceLabel && priceProfile.sourceDate) continue;
    issues.push(
      issue(
        'FEAS.PRICE_SOURCE_INCOMPLETE',
        'warning',
        `${priceProfile.name} needs region, source label, and source date for traceable pricing.`,
        [{ type: 'priceProfile', id: priceProfile.id }],
        { region: priceProfile.region, sourceLabel: priceProfile.sourceLabel, sourceDate: priceProfile.sourceDate },
        'assumption_traceability_check',
      ),
    );
  }
  const active = deriveFeasibilityEconomics(project);
  if (active.scenario) {
    if (!active.pricingComplete) {
      issues.push(
        issue(
          'FEAS.PRICING_INCOMPLETE',
          'warning',
          'Active feasibility scenario is only a partial estimate.',
          [{ type: 'feasibilityScenario', id: active.scenario.id }],
          {
            pricedItemCount: active.takeoff.pricedItemCount,
            unpricedItemCount: active.takeoff.unpricedItemCount,
            requiredUnpricedItemCount: active.requiredUnpricedItemCount,
          },
        ),
      );
    }
    if (active.budgetVariance != null && active.budgetVariance < 0) {
      issues.push(
        issue(
          'FEAS.BUDGET_EXCEEDED',
          'warning',
          'Active feasibility scenario exceeds the configured owner budget.',
          [{ type: 'feasibilityScenario', id: active.scenario.id }],
          {
            targetBudget: active.targetBudget,
            totalProjectCost: active.totalProjectCost,
            variance: active.budgetVariance,
          },
        ),
      );
    }
  }
  return issues;
}
