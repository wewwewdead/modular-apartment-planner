import { polygonArea } from '@/geometry/polygon';
import { wallLength } from '@/geometry/wallGeometry';
import { WALL_BOARD_MATERIALS, deriveWallFramingLayout, resolveWallAssembly } from './wallAssemblies';
import { deriveWallDetailTakeoff, resolveWallDetailing } from './wallDetailing';

export const QUANTITY_PROVENANCE = Object.freeze({
  EXACT_GEOMETRY: 'exact_from_geometry',
  CONFIGURED_ASSEMBLY: 'derived_from_configured_assembly',
  ALLOWANCE: 'rule_of_thumb_allowance',
  MANUAL: 'manually_entered',
});

export const QUANTITY_RATE_KEYS = Object.freeze([
  'concrete',
  'reinforcement',
  'masonry',
  'fiberCementBoard',
  'plywoodBoard',
  'wallFraming',
  'wallFasteners',
  'wallJoints',
  'formwork',
  'floorFinish',
  'paint',
  'roofing',
  'door',
  'window',
  'plumbingFixture',
  'electricalPoint',
  'excavation',
]);

function nonNegativeOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function createPriceProfile(overrides = {}) {
  const rates = Object.fromEntries(
    QUANTITY_RATE_KEYS.map((rateKey) => {
      const source = overrides.rates?.[rateKey] || {};
      return [
        rateKey,
        {
          material: nonNegativeOrNull(source.material),
          labor: nonNegativeOrNull(source.labor),
          equipment: nonNegativeOrNull(source.equipment),
          note: source.note || '',
        },
      ];
    }),
  );
  return {
    id: overrides.id,
    name: overrides.name || 'Philippine price profile',
    countryCode: 'PH',
    region: overrides.region || '',
    locality: overrides.locality || '',
    currency: overrides.currency || 'PHP',
    sourceLabel: overrides.sourceLabel || '',
    sourceDate: overrides.sourceDate || '',
    rates,
    professionalReviewRequired: true,
  };
}

export function createAssemblyDefinition(overrides = {}) {
  return {
    id: overrides.id,
    name: overrides.name || overrides.rateKey || 'Assembly',
    rateKey: overrides.rateKey,
    quantityUnit: overrides.quantityUnit || '',
    wastePercent: nonNegativeOrNull(overrides.wastePercent) ?? 0,
    materialFactor: nonNegativeOrNull(overrides.materialFactor) ?? 1,
    laborFactor: nonNegativeOrNull(overrides.laborFactor) ?? 1,
    equipmentFactor: nonNegativeOrNull(overrides.equipmentFactor) ?? 1,
    note: overrides.note || '',
    professionalReviewRequired: true,
  };
}

function normalizeAssemblyOverride(override = {}) {
  return {
    wastePercent: nonNegativeOrNull(override.wastePercent),
    materialFactor: nonNegativeOrNull(override.materialFactor),
    laborFactor: nonNegativeOrNull(override.laborFactor),
    equipmentFactor: nonNegativeOrNull(override.equipmentFactor),
  };
}

export function createFeasibilityScenario(overrides = {}) {
  return {
    id: overrides.id,
    name: overrides.name || 'Feasibility scenario',
    priceProfileId: overrides.priceProfileId || null,
    contingencyPercent: nonNegativeOrNull(overrides.contingencyPercent) ?? 0,
    professionalFeesPercent: nonNegativeOrNull(overrides.professionalFeesPercent) ?? 0,
    permitAllowance: nonNegativeOrNull(overrides.permitAllowance) ?? 0,
    otherAllowance: nonNegativeOrNull(overrides.otherAllowance) ?? 0,
    monthlyGrossRent: nonNegativeOrNull(overrides.monthlyGrossRent),
    vacancyPercent: nonNegativeOrNull(overrides.vacancyPercent) ?? 0,
    operatingExpensePercent: nonNegativeOrNull(overrides.operatingExpensePercent) ?? 0,
    assemblyOverrides: Object.fromEntries(
      Object.entries(overrides.assemblyOverrides || {}).map(([rateKey, value]) => [
        rateKey,
        normalizeAssemblyOverride(value),
      ]),
    ),
    note: overrides.note || '',
    professionalReviewRequired: true,
  };
}

export function createQuantityProfile(overrides = {}) {
  const unitRates = Object.fromEntries(
    QUANTITY_RATE_KEYS.map((key) => {
      const value = overrides.unitRates?.[key];
      return [key, Number.isFinite(value) && value >= 0 ? value : null];
    }),
  );
  return {
    currency: overrides.currency || 'PHP',
    reinforcementAllowanceKgPerM3:
      Number.isFinite(overrides.reinforcementAllowanceKgPerM3) && overrides.reinforcementAllowanceKgPerM3 >= 0
        ? overrides.reinforcementAllowanceKgPerM3
        : null,
    excavationDepth:
      Number.isFinite(overrides.excavationDepth) && overrides.excavationDepth >= 0 ? overrides.excavationDepth : null,
    unitRates,
    priceProfiles: (overrides.priceProfiles || []).filter((entry) => entry?.id).map(createPriceProfile),
    assemblies: (overrides.assemblies || [])
      .filter((entry) => entry?.id && QUANTITY_RATE_KEYS.includes(entry.rateKey))
      .map(createAssemblyDefinition),
    scenarios: (overrides.scenarios || []).filter((entry) => entry?.id).map(createFeasibilityScenario),
    activeScenarioId: overrides.activeScenarioId || null,
    manualItems: (overrides.manualItems || [])
      .filter((item) => item?.id && Number.isFinite(item.quantity) && item.quantity >= 0)
      .map((item) => ({ ...item, provenance: QUANTITY_PROVENANCE.MANUAL })),
  };
}

function mergeAssembly(profile, scenario, rateKey) {
  const base =
    profile.assemblies.find((entry) => entry.rateKey === rateKey) ||
    createAssemblyDefinition({ id: `default_${rateKey}`, rateKey });
  const override = scenario?.assemblyOverrides?.[rateKey] || {};
  return createAssemblyDefinition({
    ...base,
    wastePercent: override.wastePercent ?? base.wastePercent,
    materialFactor: override.materialFactor ?? base.materialFactor,
    laborFactor: override.laborFactor ?? base.laborFactor,
    equipmentFactor: override.equipmentFactor ?? base.equipmentFactor,
  });
}

function resolvePricing(profile, rateKey, scenarioId = null) {
  const resolvedScenarioId = scenarioId || profile.activeScenarioId;
  const scenario = (profile.scenarios || []).find((entry) => entry.id === resolvedScenarioId) || null;
  const priceProfile = (profile.priceProfiles || []).find((entry) => entry.id === scenario?.priceProfileId) || null;
  if (!scenario || !priceProfile) {
    const legacyRate = profile.unitRates?.[rateKey];
    return {
      unitRate: Number.isFinite(legacyRate) ? legacyRate : null,
      breakdown: null,
      basis: Number.isFinite(legacyRate) ? 'legacy_user_entered_total_rate' : 'unpriced',
      scenario,
      priceProfile,
      assembly: null,
    };
  }

  const rate = priceProfile.rates?.[rateKey] || {};
  const assembly = mergeAssembly(profile, scenario, rateKey);
  const componentsAvailable = ['material', 'labor', 'equipment'].every(
    (component) => rate[component] == null || Number.isFinite(rate[component]),
  );
  const hasAnyComponent = ['material', 'labor', 'equipment'].some((component) => Number.isFinite(rate[component]));
  if (!componentsAvailable || !hasAnyComponent) {
    return { unitRate: null, breakdown: null, basis: 'unpriced', scenario, priceProfile, assembly };
  }
  const material = (rate.material || 0) * assembly.materialFactor * (1 + assembly.wastePercent / 100);
  const labor = (rate.labor || 0) * assembly.laborFactor;
  const equipment = (rate.equipment || 0) * assembly.equipmentFactor;
  return {
    unitRate: material + labor + equipment,
    breakdown: { material, labor, equipment },
    basis: 'price_profile_and_configured_assembly',
    scenario,
    priceProfile,
    assembly,
  };
}

function cubicMeters(value) {
  return value / 1_000_000_000;
}

function squareMeters(value) {
  return value / 1_000_000;
}

function resolveBeamLength(beam, columnsById) {
  const start = beam.startRef?.kind === 'column' ? columnsById.get(beam.startRef.id) : null;
  const end = beam.endRef?.kind === 'column' ? columnsById.get(beam.endRef.id) : null;
  if (!start || !end) return 0;
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function item({ id, category, label, quantity, unit, provenance, rateKey, inputs }, profile, scenarioId = null) {
  const pricing = resolvePricing(profile, rateKey, scenarioId);
  return {
    id,
    category,
    label,
    quantity,
    unit,
    provenance,
    inputs,
    rateKey,
    unitRate: pricing.unitRate,
    estimatedCost: pricing.unitRate == null ? null : quantity * pricing.unitRate,
    costBreakdown:
      pricing.breakdown == null
        ? null
        : Object.fromEntries(
            Object.entries(pricing.breakdown).map(([component, unitRate]) => [
              component,
              { unitRate, cost: quantity * unitRate },
            ]),
          ),
    pricingBasis: pricing.basis,
    priceProfileId: pricing.priceProfile?.id || null,
    priceSource: pricing.priceProfile
      ? {
          label: pricing.priceProfile.sourceLabel,
          date: pricing.priceProfile.sourceDate,
          region: pricing.priceProfile.region,
          locality: pricing.priceProfile.locality,
        }
      : null,
    assemblyId: pricing.assembly?.id || null,
    scenarioId: pricing.scenario?.id || null,
    professionalReviewRequired: true,
  };
}

function openingArea(opening) {
  return Math.max(0, Number(opening.width) || 0) * Math.max(0, Number(opening.height) || 0);
}

function deriveGeometry(project) {
  let columnVolumeMm3 = 0;
  let columnFormworkMm2 = 0;
  let beamVolumeMm3 = 0;
  let beamFormworkMm2 = 0;
  let slabVolumeMm3 = 0;
  let slabAreaMm2 = 0;
  let slabOpeningAreaMm2 = 0;
  let wallNetAreaMm2 = 0;
  let fiberCementBoardAreaMm2 = 0;
  let plywoodBoardAreaMm2 = 0;
  let wallFramingLinearMm = 0;
  let wallPanelCount = 0;
  let wallFastenerCount = 0;
  let wallJointLinearMm = 0;
  let detailedWallCount = 0;
  let framedWallCount = 0;
  let wallPaintAreaMm2 = 0;
  let floorFinishAreaMm2 = 0;
  let floorFinishUsedSlabFallback = false;
  let doorCount = 0;
  let windowCount = 0;
  let plumbingFixtureCount = 0;
  let groundSlabAreaMm2 = 0;
  let unresolvedBeamCount = 0;

  for (const floor of project.floors || []) {
    const columnsById = new Map((floor.columns || []).map((column) => [column.id, column]));
    const openingsByWall = new Map();
    for (const opening of [...(floor.doors || []), ...(floor.windows || [])]) {
      const openings = openingsByWall.get(opening.wallId) || [];
      openings.push(opening);
      openingsByWall.set(opening.wallId, openings);
    }

    for (const column of floor.columns || []) {
      const width = Math.max(0, Number(column.width) || 0);
      const depth = Math.max(0, Number(column.depth) || 0);
      const height = Math.max(0, Number(column.height) || Number(floor.floorToFloorHeight) || 0);
      columnVolumeMm3 += width * depth * height;
      columnFormworkMm2 += 2 * (width + depth) * height;
    }
    for (const beam of floor.beams || []) {
      const length = resolveBeamLength(beam, columnsById);
      if (!length) unresolvedBeamCount += 1;
      const width = Math.max(0, Number(beam.width) || 0);
      const depth = Math.max(0, Number(beam.depth) || 0);
      beamVolumeMm3 += length * width * depth;
      beamFormworkMm2 += length * (width + 2 * depth);
    }
    for (const slab of floor.slabs || []) {
      const grossArea = polygonArea(slab.boundaryPoints || []);
      const openingArea = Math.min(
        grossArea,
        (slab.openings || []).reduce((total, opening) => total + polygonArea(opening.boundaryPoints || []), 0),
      );
      const netArea = Math.max(0, grossArea - openingArea);
      slabAreaMm2 += netArea;
      slabOpeningAreaMm2 += openingArea;
      slabVolumeMm3 += netArea * Math.max(0, Number(slab.thickness) || 0);
      if (floor === project.floors?.[0]) groundSlabAreaMm2 += grossArea;
    }
    for (const wall of floor.walls || []) {
      const grossFaceArea = wallLength(wall) * Math.max(0, Number(wall.height) || 0);
      const openings = openingsByWall.get(wall.id) || [];
      const openingsArea = openings.reduce((total, opening) => total + openingArea(opening), 0);
      const netFaceArea = Math.max(0, grossFaceArea - openingsArea);
      const assembly = resolveWallAssembly(wall);
      if (assembly.system === 'masonry') {
        wallNetAreaMm2 += netFaceArea;
        wallPaintAreaMm2 += netFaceArea * 2;
      } else {
        framedWallCount += 1;
        const detailing = resolveWallDetailing(wall);
        const detailTakeoff = detailing.enabled ? deriveWallDetailTakeoff(wall, floor) : null;
        if (detailTakeoff?.enabled) {
          detailedWallCount += 1;
          wallPanelCount += detailTakeoff.panelCount;
          wallFastenerCount += detailTakeoff.fastenerCount;
          wallJointLinearMm += detailTakeoff.jointLengthMm;
        }
        for (const side of ['interior', 'exterior']) {
          const layer = assembly[side];
          const detailSide = detailTakeoff?.sides?.[side];
          const faceArea = detailSide?.enabled ? detailSide.installedAreaMm2 : netFaceArea;
          const layeredArea = faceArea * (layer?.layerCount || 0);
          if (layer?.material === WALL_BOARD_MATERIALS.FIBER_CEMENT) fiberCementBoardAreaMm2 += layeredArea;
          if (layer?.material === WALL_BOARD_MATERIALS.PLYWOOD) plywoodBoardAreaMm2 += layeredArea;
        }
        wallPaintAreaMm2 +=
          netFaceArea *
          [assembly.interior, assembly.exterior].filter(
            (layer) => layer.material !== WALL_BOARD_MATERIALS.NONE && layer.layerCount > 0,
          ).length;
        wallFramingLinearMm += detailTakeoff?.framingMemberCount
          ? detailTakeoff.framingLinearLengthMm
          : deriveWallFramingLayout(
              wall,
              openings.map((opening) => ({
                ...opening,
                openingKind: (floor.windows || []).some((windowItem) => windowItem.id === opening.id)
                  ? 'window'
                  : 'door',
              })),
            ).totalLinearLengthMm;
      }
    }
    const roomArea = (floor.rooms || []).reduce(
      (total, room) => total + Math.max(0, Number(room.area) || polygonArea(room.points || [])),
      0,
    );
    if (roomArea > 0) {
      floorFinishAreaMm2 += roomArea;
    } else {
      const slabFallbackArea = (floor.slabs || []).reduce(
        (total, slab) =>
          total +
          Math.max(
            0,
            polygonArea(slab.boundaryPoints || []) -
              (slab.openings || []).reduce(
                (openingTotal, opening) => openingTotal + polygonArea(opening.boundaryPoints || []),
                0,
              ),
          ),
        0,
      );
      floorFinishAreaMm2 += slabFallbackArea;
      floorFinishUsedSlabFallback ||= slabFallbackArea > 0;
    }
    doorCount += (floor.doors || []).length;
    windowCount += (floor.windows || []).length;
    plumbingFixtureCount += (floor.fixtures || []).filter((fixture) =>
      ['toilet', 'lavatory', 'kitchenTop', 'kitchen_top', 'sink', 'shower', 'bathtub'].includes(fixture.fixtureType),
    ).length;
  }

  let roofingAreaMm2 = 0;
  for (const plane of project.roofSystem?.roofPlanes || []) {
    const projectedArea = polygonArea(plane.boundaryPoints || []);
    const slopeRatio = Math.max(0, Number(plane.slope) || 0) / 100;
    roofingAreaMm2 += projectedArea * Math.sqrt(1 + slopeRatio * slopeRatio);
  }

  return {
    columnVolumeM3: cubicMeters(columnVolumeMm3),
    beamVolumeM3: cubicMeters(beamVolumeMm3),
    slabVolumeM3: cubicMeters(slabVolumeMm3),
    columnFormworkM2: squareMeters(columnFormworkMm2),
    beamFormworkM2: squareMeters(beamFormworkMm2),
    slabFormworkM2: squareMeters(slabAreaMm2),
    slabOpeningAreaM2: squareMeters(slabOpeningAreaMm2),
    masonryWallAreaM2: squareMeters(wallNetAreaMm2),
    fiberCementBoardAreaM2: squareMeters(fiberCementBoardAreaMm2),
    plywoodBoardAreaM2: squareMeters(plywoodBoardAreaMm2),
    wallFramingLinearM: wallFramingLinearMm / 1000,
    wallPanelCount,
    wallFastenerCount,
    wallJointLinearM: wallJointLinearMm / 1000,
    detailedWallCount,
    framedWallCount,
    paintAreaM2: squareMeters(wallPaintAreaMm2),
    floorFinishAreaM2: squareMeters(floorFinishAreaMm2),
    floorFinishUsedSlabFallback,
    roofingAreaM2: squareMeters(roofingAreaMm2),
    doorCount,
    windowCount,
    plumbingFixtureCount,
    electricalPointCount: project.building?.systems?.electrical?.points?.length || 0,
    groundSlabAreaM2: squareMeters(groundSlabAreaMm2),
    unresolvedBeamCount,
  };
}

export function deriveQuantityTakeoff(project, options = {}) {
  const profile = createQuantityProfile(project?.building?.quantityProfile);
  const scenarioId = options.scenarioId || profile.activeScenarioId || null;
  const geometry = deriveGeometry(project || {});
  const concreteVolume = geometry.columnVolumeM3 + geometry.beamVolumeM3 + geometry.slabVolumeM3;
  const formworkArea = geometry.columnFormworkM2 + geometry.beamFormworkM2 + geometry.slabFormworkM2;
  const items = [
    item(
      {
        id: 'concrete',
        category: 'structure',
        label: 'Structural concrete',
        quantity: concreteVolume,
        unit: 'm³',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'concrete',
        inputs: {
          columnsM3: geometry.columnVolumeM3,
          beamsM3: geometry.beamVolumeM3,
          slabsM3: geometry.slabVolumeM3,
          slabOpeningsDeductedM2: geometry.slabOpeningAreaM2,
          unresolvedBeamCount: geometry.unresolvedBeamCount,
        },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'reinforcement',
        category: 'structure',
        label: 'Reinforcement allowance',
        quantity:
          profile.reinforcementAllowanceKgPerM3 == null ? 0 : concreteVolume * profile.reinforcementAllowanceKgPerM3,
        unit: 'kg',
        provenance: QUANTITY_PROVENANCE.ALLOWANCE,
        rateKey: 'reinforcement',
        inputs: { concreteVolumeM3: concreteVolume, allowanceKgPerM3: profile.reinforcementAllowanceKgPerM3 },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'masonry',
        category: 'envelope',
        label: 'Net masonry wall area',
        quantity: geometry.masonryWallAreaM2,
        unit: 'm²',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'masonry',
        inputs: { openingsDeducted: true },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'fiber_cement_board',
        category: 'envelope',
        label: 'HardieFlex / fiber-cement board',
        quantity: geometry.fiberCementBoardAreaM2,
        unit: 'm²',
        provenance: QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY,
        rateKey: 'fiberCementBoard',
        inputs: { openingsDeducted: true, boardLayersIncluded: true, framedWallCount: geometry.framedWallCount },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'plywood_board',
        category: 'envelope',
        label: 'Plywood wall board',
        quantity: geometry.plywoodBoardAreaM2,
        unit: 'm²',
        provenance: QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY,
        rateKey: 'plywoodBoard',
        inputs: { openingsDeducted: true, boardLayersIncluded: true, framedWallCount: geometry.framedWallCount },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'wall_framing',
        category: 'envelope',
        label: 'Wall studs, plates, noggins, and opening framing',
        quantity: geometry.wallFramingLinearM,
        unit: 'm',
        provenance: QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY,
        rateKey: 'wallFraming',
        inputs: { openingFramingIncluded: true, framedWallCount: geometry.framedWallCount },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'wall_panels',
        category: 'envelope',
        label: 'Explicit wall panels / stock sheets',
        quantity: geometry.wallPanelCount,
        unit: 'ea',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: null,
        inputs: { detailedWallCount: geometry.detailedWallCount, unoptimizedStockCount: true },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'wall_fasteners',
        category: 'envelope',
        label: 'Wall-board fasteners',
        quantity: geometry.wallFastenerCount,
        unit: 'ea',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'wallFasteners',
        inputs: { detailedWallCount: geometry.detailedWallCount, generatedAndManual: true },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'wall_joints',
        category: 'envelope',
        label: 'Panel joints / shadow lines',
        quantity: geometry.wallJointLinearM,
        unit: 'm',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'wallJoints',
        inputs: { detailedWallCount: geometry.detailedWallCount },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'formwork',
        category: 'structure',
        label: 'Formwork contact area',
        quantity: formworkArea,
        unit: 'm²',
        provenance: QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY,
        rateKey: 'formwork',
        inputs: {
          columnsM2: geometry.columnFormworkM2,
          beamsM2: geometry.beamFormworkM2,
          slabSoffitsM2: geometry.slabFormworkM2,
        },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'floor_finish',
        category: 'finishes',
        label: 'Floor finishes',
        quantity: geometry.floorFinishAreaM2,
        unit: 'm²',
        provenance: geometry.floorFinishUsedSlabFallback
          ? QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY
          : QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'floorFinish',
        inputs: { source: geometry.floorFinishUsedSlabFallback ? 'slab_area_fallback' : 'room_areas' },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'paint',
        category: 'finishes',
        label: 'Wall paint area',
        quantity: geometry.paintAreaM2,
        unit: 'm²',
        provenance: QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY,
        rateKey: 'paint',
        inputs: { wallFaces: 2, openingsDeducted: true },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'roofing',
        category: 'roof',
        label: 'Roofing area',
        quantity: geometry.roofingAreaM2,
        unit: 'm²',
        provenance: QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY,
        rateKey: 'roofing',
        inputs: { source: 'roof_planes_and_configured_slopes' },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'doors',
        category: 'openings',
        label: 'Doors',
        quantity: geometry.doorCount,
        unit: 'ea',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'door',
        inputs: {},
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'windows',
        category: 'openings',
        label: 'Windows',
        quantity: geometry.windowCount,
        unit: 'ea',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'window',
        inputs: {},
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'plumbing_fixtures',
        category: 'services',
        label: 'Plumbing fixtures',
        quantity: geometry.plumbingFixtureCount,
        unit: 'ea',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'plumbingFixture',
        inputs: { fixtureTypes: ['toilet', 'lavatory', 'kitchenTop', 'kitchen_top', 'sink', 'shower', 'bathtub'] },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'electrical_points',
        category: 'services',
        label: 'Electrical points',
        quantity: geometry.electricalPointCount,
        unit: 'ea',
        provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
        rateKey: 'electricalPoint',
        inputs: { source: 'modeled_electrical_points' },
      },
      profile,
      scenarioId,
    ),
    item(
      {
        id: 'excavation',
        category: 'sitework',
        label: 'Excavation allowance',
        quantity: profile.excavationDepth == null ? 0 : geometry.groundSlabAreaM2 * (profile.excavationDepth / 1000),
        unit: 'm³',
        provenance: QUANTITY_PROVENANCE.ALLOWANCE,
        rateKey: 'excavation',
        inputs: {
          groundSlabAreaM2: geometry.groundSlabAreaM2,
          excavationDepthMm: profile.excavationDepth,
          source: 'ground_slab_area_times_configured_depth',
        },
      },
      profile,
      scenarioId,
    ),
    ...profile.manualItems.map((manual) =>
      item(
        {
          ...manual,
          category: manual.category || 'manual',
          label: manual.label || manual.id,
          provenance: QUANTITY_PROVENANCE.MANUAL,
          rateKey: manual.rateKey || manual.id,
          inputs: { source: 'manual_entry', ...(manual.inputs || {}) },
        },
        { ...profile, unitRates: { ...profile.unitRates, [manual.rateKey || manual.id]: manual.unitRate ?? null } },
      ),
    ),
  ];
  const visibleItems = items.filter(
    (entry) => entry.quantity > 0 || ['reinforcement', 'excavation'].includes(entry.id),
  );
  const pricedItems = visibleItems.filter((entry) => entry.estimatedCost != null);
  return {
    currency: profile.currency,
    scenarioId,
    profile,
    items: visibleItems,
    totalEstimatedCost: pricedItems.reduce((total, entry) => total + entry.estimatedCost, 0),
    pricedItemCount: pricedItems.length,
    unpricedItemCount: visibleItems.length - pricedItems.length,
    warnings: [
      ...(geometry.unresolvedBeamCount
        ? [
            `${geometry.unresolvedBeamCount} beam${geometry.unresolvedBeamCount === 1 ? '' : 's'} lack resolved supports and contribute zero length.`,
          ]
        : []),
      ...(profile.reinforcementAllowanceKgPerM3 == null
        ? ['Reinforcement is unquantified until an explicit kg/m³ allowance is configured.']
        : []),
      ...(profile.excavationDepth == null
        ? ['Excavation is unquantified until an explicit planning depth is configured.']
        : []),
    ],
    professionalReviewRequired: true,
  };
}
