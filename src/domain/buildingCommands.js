import { BEAM_DEPTH, BEAM_WIDTH, SITE_EXPOSURE_CLASSES } from './defaults';
import { getFloorElevation, getFloorTopElevation } from './floorModels';
import {
  createColumnStack,
  createGridAxis,
  createStructuralGrid,
  normalizeSiteExposureClass,
  resolveGridIntersection,
  syncCanonicalBuilding,
} from './buildingModels';
import { validateBuildingCoordination } from './buildingGraph';
import { applyColumnUpdate } from './projectCommands';
import { deriveAreaLedger, isSimplePolygon } from './siteModels';
import { ROOM_USE_CATEGORIES, createSpaceProgram, createUnitInstance, createUnitType } from './apartmentProgram';
import { WET_FIXTURE_TYPES, createPlumbingShaft, fixtureDistanceToShaft } from './wetCoreModels';
import {
  QUANTITY_RATE_KEYS,
  createAssemblyDefinition,
  createFeasibilityScenario,
  createPriceProfile,
  createQuantityProfile,
  deriveQuantityTakeoff,
} from './quantityTakeoff';
import { deriveFeasibilityEconomics } from './feasibilityEconomics';
import {
  REVIEW_DISCIPLINES,
  REVIEW_STATUSES,
  createDesignAssumption,
  createDocumentationModel,
  createProfessionalReviewItem,
  createRevisionSnapshot,
} from './professionalHandoff';
import { DESIGN_CONFIDENCE } from './trustModels';
import { createParkingBay, createParkingPlan, createVehicleAccessRoute } from './siteAccessModels';
import {
  ELECTRICAL_POINT_KINDS,
  EQUIPMENT_KINDS,
  createElectricalPoint,
  createEquipmentCoordinationProfile,
  createEquipmentZone,
} from './equipmentCoordination';
import { createDrain } from './roofModels';
import { createFloor, createRoom, createSlab, createWall } from './models';
import {
  createTestFitProfile,
  generateTestFitOptions as deriveGeneratedTestFitOptions,
  testFitInputSignature,
} from './testFitModels';
import { createApartmentDesignProfile, deriveApartmentDesignCoordination } from './apartmentDesign';
import { materializeAcceptedApartmentDesign } from './apartmentDesignMaterializer';
import { createStructuralRealizationProfile, deriveStructuralRealization } from './structuralRealization';
import { materializeAcceptedStructuralRealization } from './structuralRealizationMaterializer';
import { createServicesRealizationProfile } from './servicesRealization';
import { materializeAcceptedServicesRealization } from './servicesRealizationMaterializer';
import { deriveCostRealization, realizeCostBaseline } from './costRealization';
import { issueDocumentationRealization } from './documentationRealization';
import {
  appendExternalProfessionalResponse,
  appendReviewerMarkup,
  importReviewerMarkupExchange,
  publishProfessionalExchange,
  selectProfessionalExchange,
} from './professionalExchange';
import { PRELIMINARY_PACKAGE_KIND, derivePreliminaryPackage } from './documentPackage';
import {
  captureUnitGeometry,
  materializeUnitGeometry,
  replaceGeneratedUnitEntities,
  UNIT_GEOMETRY_COLLECTIONS,
} from './unitGeometry';
import {
  DEFAULT_STRUCTURAL_COORDINATION_PROFILE,
  deriveConceptualLoadPath,
  inferSlabSupportRefs,
} from './structuralCoordination';
import { pointInPolygon } from '@/geometry/polygon';
import { isValidTimeZone } from '@/utils/timeZone';
import {
  DEFAULT_SERVICES_COORDINATION_PROFILE,
  createDrainageRoute,
  createEgressExit,
  createEgressRoute,
  createElectricalRiserZone,
  defaultEgressRoutePoints,
} from './servicesCoordination';

export const BUILDING_COMMANDS = Object.freeze({
  GENERATE_STRUCTURAL_GRID: 'GenerateStructuralGrid',
  CONFIGURE_REGULAR_STRUCTURAL_GRID: 'ConfigureRegularStructuralGrid',
  POPULATE_GRID_COLUMN_STACKS: 'PopulateGridColumnStacks',
  CREATE_COLUMN_STACK: 'CreateColumnStack',
  ASSIGN_COLUMN_TO_STACK: 'AssignColumnToStack',
  MOVE_COLUMN: 'MoveColumn',
  CREATE_BEAM_BETWEEN_SUPPORTS: 'CreateBeamBetweenSupports',
  CREATE_CANTILEVER_BEAM: 'CreateCantileverBeam',
  SET_BEAM_COORDINATION_INTENT: 'SetBeamCoordinationIntent',
  CONFIGURE_STRUCTURAL_COORDINATION: 'ConfigureStructuralCoordination',
  CONFIGURE_STRUCTURAL_REALIZATION_PROFILE: 'ConfigureStructuralRealizationProfile',
  REALIZE_ACCEPTED_STRUCTURAL_BASIS: 'RealizeAcceptedStructuralBasis',
  CONFIGURE_SERVICES_REALIZATION_PROFILE: 'ConfigureServicesRealizationProfile',
  REALIZE_ACCEPTED_BUILDING_SYSTEMS: 'RealizeAcceptedBuildingSystems',
  COORDINATE_SLAB_SUPPORTS: 'CoordinateSlabSupports',
  ADD_SLAB_OPENING: 'AddSlabOpening',
  DEFINE_PROPERTY_BOUNDARY: 'DefinePropertyBoundary',
  CONFIGURE_SITE_SETBACKS: 'ConfigureSiteSetbacks',
  CONFIGURE_SITE_LOCATION: 'ConfigureSiteLocation',
  CACHE_SITE_WIND_CLIMATE: 'CacheSiteWindClimate',
  UPSERT_SOLAR_STUDY_TARGET: 'UpsertSolarStudyTarget',
  REMOVE_SOLAR_STUDY_TARGET: 'RemoveSolarStudyTarget',
  CONFIGURE_RECTANGULAR_SITE: 'ConfigureRectangularSite',
  CONFIGURE_REGULAR_PARKING_PLAN: 'ConfigureRegularParkingPlan',
  CONFIGURE_TEST_FIT_PROFILE: 'ConfigureTestFitProfile',
  GENERATE_TEST_FIT_OPTIONS: 'GenerateTestFitOptions',
  SELECT_TEST_FIT_OPTION: 'SelectTestFitOption',
  ACCEPT_TEST_FIT_OPTION: 'AcceptTestFitOption',
  CONFIGURE_APARTMENT_DESIGN_PROFILE: 'ConfigureApartmentDesignProfile',
  DETAIL_ACCEPTED_TEST_FIT: 'DetailAcceptedTestFit',
  UPDATE_PROJECT_BRIEF: 'UpdateProjectBrief',
  DEFINE_SPACE_PROGRAM: 'DefineSpaceProgram',
  CREATE_UNIT_TYPE: 'CreateUnitType',
  UPDATE_UNIT_TYPE: 'UpdateUnitType',
  CREATE_UNIT_INSTANCE: 'CreateUnitInstance',
  ASSIGN_ROOM_TO_UNIT: 'AssignRoomToUnit',
  UNASSIGN_ROOM_FROM_UNIT: 'UnassignRoomFromUnit',
  DETACH_UNIT_INSTANCE: 'DetachUnitInstance',
  CLASSIFY_ROOM: 'ClassifyRoom',
  CONFIGURE_TYPICAL_UNIT_PROGRAM: 'ConfigureTypicalUnitProgram',
  GENERATE_UNIT_INSTANCES: 'GenerateUnitInstances',
  SET_UNIT_INSTANCE_PLACEMENT: 'SetUnitInstancePlacement',
  CAPTURE_UNIT_TYPE_GEOMETRY: 'CaptureUnitTypeGeometry',
  PROPAGATE_UNIT_TYPE_GEOMETRY: 'PropagateUnitTypeGeometry',
  CONFIGURE_PLUMBING_SHAFT: 'ConfigurePlumbingShaft',
  ASSIGN_NEARBY_WET_FIXTURES: 'AssignNearbyWetFixtures',
  CONFIGURE_SERVICES_COORDINATION: 'ConfigureServicesCoordination',
  CONFIGURE_ELECTRICAL_RISER: 'ConfigureElectricalRiser',
  CONFIGURE_EQUIPMENT_COORDINATION: 'ConfigureEquipmentCoordination',
  CONFIGURE_EQUIPMENT_ZONE: 'ConfigureEquipmentZone',
  CONFIGURE_ELECTRICAL_POINT: 'ConfigureElectricalPoint',
  CONFIGURE_DRAINAGE_ROUTE: 'ConfigureDrainageRoute',
  CONFIGURE_EGRESS_EXIT: 'ConfigureEgressExit',
  CONFIGURE_EGRESS_ROUTE: 'ConfigureEgressRoute',
  COORDINATE_VERTICAL_SERVICE_OPENINGS: 'CoordinateVerticalServiceOpenings',
  LINK_STAIR_CLEARANCE_OPENING: 'LinkStairClearanceOpening',
  CONFIGURE_ROOF_DRAINAGE_PATH: 'ConfigureRoofDrainagePath',
  CONFIGURE_QUANTITY_PROFILE: 'ConfigureQuantityProfile',
  CONFIGURE_PRICE_PROFILE: 'ConfigurePriceProfile',
  CONFIGURE_ASSEMBLY_DEFINITION: 'ConfigureAssemblyDefinition',
  CONFIGURE_ASSEMBLY_CATALOG: 'ConfigureAssemblyCatalog',
  CONFIGURE_FEASIBILITY_SCENARIO: 'ConfigureFeasibilityScenario',
  SET_ACTIVE_FEASIBILITY_SCENARIO: 'SetActiveFeasibilityScenario',
  REALIZE_QUANTITY_COST_BASELINE: 'RealizeQuantityCostBaseline',
  SET_VALUE_ENGINEERING_OPPORTUNITY_STATUS: 'SetValueEngineeringOpportunityStatus',
  CONFIGURE_DESIGN_ASSUMPTION: 'ConfigureDesignAssumption',
  CONFIGURE_REVIEW_ITEM: 'ConfigureReviewItem',
  SET_REVIEW_ITEM_STATUS: 'SetReviewItemStatus',
  RECORD_EXTERNAL_VERIFICATION: 'RecordExternalVerification',
  CAPTURE_REVIEW_REVISION: 'CaptureReviewRevision',
  SET_ACTIVE_REVIEW_REVISION: 'SetActiveReviewRevision',
  GENERATE_PRELIMINARY_DRAWING_PACKAGE: 'GeneratePreliminaryDrawingPackage',
  ISSUE_COORDINATED_REVIEW_PACKAGE: 'IssueCoordinatedReviewPackage',
  PUBLISH_PROFESSIONAL_EXCHANGE: 'PublishProfessionalExchange',
  IMPORT_REVIEWER_MARKUP: 'ImportReviewerMarkup',
  IMPORT_REVIEWER_MARKUP_EXCHANGE: 'ImportReviewerMarkupExchange',
  RECORD_EXTERNAL_PROFESSIONAL_RESPONSE: 'RecordExternalProfessionalResponse',
  SET_ACTIVE_PROFESSIONAL_EXCHANGE: 'SetActiveProfessionalExchange',
});

function commandError(project, command, code, message, details = {}) {
  return {
    ok: false,
    commandType: command?.type || null,
    project,
    error: { code, message, details },
    changes: { domain: [], derived: [] },
    validation: {
      issues: validateBuildingCoordination(project),
      introduced: [],
      resolved: [],
    },
    undo: null,
  };
}

function validationDelta(before, after) {
  const beforeIds = new Set(before.map((entry) => entry.id));
  const afterIds = new Set(after.map((entry) => entry.id));
  return {
    issues: after,
    introduced: after.filter((entry) => !beforeIds.has(entry.id)),
    resolved: before.filter((entry) => !afterIds.has(entry.id)),
  };
}

function commandSuccess(project, nextProject, command, domainChanges) {
  const syncedProject = syncCanonicalBuilding(nextProject);
  const beforeIssues = validateBuildingCoordination(project);
  const afterIssues = validateBuildingCoordination(syncedProject);
  const validation = validationDelta(beforeIssues, afterIssues);

  return {
    ok: true,
    commandType: command.type,
    project: syncedProject,
    changes: {
      domain: domainChanges,
      derived: [
        { kind: 'relationship_indexes_synchronized', buildingId: syncedProject.building.id },
        {
          kind: 'coordination_validation_recomputed',
          issueCount: afterIssues.length,
          introducedIssueIds: validation.introduced.map((entry) => entry.id),
          resolvedIssueIds: validation.resolved.map((entry) => entry.id),
        },
        { kind: 'area_ledger_recomputed', ledger: deriveAreaLedger(syncedProject) },
      ],
    },
    validation,
    undo: { kind: 'project_snapshot', project },
  };
}

function updateSite(project, updater) {
  return {
    ...project,
    building: {
      ...project.building,
      site: updater(project.building.site || {}),
    },
  };
}

function updateBuilding(project, updater) {
  return { ...project, building: updater(project.building) };
}

function configureQuantityProfile(project, command) {
  const allowance = command.reinforcementAllowanceKgPerM3;
  if (allowance != null && (!Number.isFinite(allowance) || allowance < 0)) {
    return commandError(
      project,
      command,
      'invalid-reinforcement-allowance',
      'Reinforcement allowance must be blank or a non-negative kg/m³ value.',
    );
  }
  const excavationDepth = command.excavationDepth;
  if (excavationDepth != null && (!Number.isFinite(excavationDepth) || excavationDepth < 0)) {
    return commandError(
      project,
      command,
      'invalid-excavation-depth',
      'Excavation depth must be blank or a non-negative millimetre value.',
    );
  }
  const invalidRate = QUANTITY_RATE_KEYS.find((key) => {
    const value = command.unitRates?.[key];
    return value != null && (!Number.isFinite(value) || value < 0);
  });
  if (invalidRate) {
    return commandError(
      project,
      command,
      'invalid-quantity-rate',
      `${invalidRate} rate must be blank or a non-negative amount.`,
      { rateKey: invalidRate },
    );
  }

  const quantityProfile = createQuantityProfile({
    ...project.building.quantityProfile,
    currency: command.currency || project.building.brief?.currency || 'PHP',
    reinforcementAllowanceKgPerM3: allowance,
    excavationDepth,
    unitRates: { ...project.building.quantityProfile?.unitRates, ...(command.unitRates || {}) },
  });
  const nextProject = updateBuilding(project, (building) => ({ ...building, quantityProfile }));
  const takeoff = deriveQuantityTakeoff(nextProject);
  return commandSuccess(project, nextProject, command, [
    { operation: 'replace', entityType: 'quantityProfile', id: project.building.id },
    {
      operation: 'derive',
      entityType: 'quantityTakeoff',
      id: project.building.id,
      itemCount: takeoff.items.length,
      pricedItemCount: takeoff.pricedItemCount,
    },
  ]);
}

function validOptionalNonNegative(value) {
  return value == null || (Number.isFinite(value) && value >= 0);
}

function configurePriceProfile(project, command) {
  if (!command.profileId || !String(command.name || '').trim()) {
    return commandError(
      project,
      command,
      'invalid-price-profile-identity',
      'Price profile requires a stable ID and name.',
    );
  }
  if (
    !String(command.region || '').trim() ||
    !String(command.sourceLabel || '').trim() ||
    !String(command.sourceDate || '').trim()
  ) {
    return commandError(
      project,
      command,
      'price-source-required',
      'Philippine price profile requires region, source label, and source date.',
    );
  }
  const invalidRate = QUANTITY_RATE_KEYS.find((rateKey) =>
    ['material', 'labor', 'equipment'].some(
      (component) => !validOptionalNonNegative(command.rates?.[rateKey]?.[component]),
    ),
  );
  if (invalidRate) {
    return commandError(
      project,
      command,
      'invalid-price-component',
      `${invalidRate} price components must be blank or non-negative.`,
      { rateKey: invalidRate },
    );
  }
  const quantityProfile = createQuantityProfile(project.building.quantityProfile);
  const existing = quantityProfile.priceProfiles.find((entry) => entry.id === command.profileId);
  const priceProfile = createPriceProfile({
    ...existing,
    id: command.profileId,
    name: command.name,
    region: command.region,
    locality: command.locality,
    currency: command.currency || 'PHP',
    sourceLabel: command.sourceLabel,
    sourceDate: command.sourceDate,
    rates: command.rates,
  });
  const nextProfile = createQuantityProfile({
    ...quantityProfile,
    currency: priceProfile.currency,
    priceProfiles: existing
      ? quantityProfile.priceProfiles.map((entry) => (entry.id === priceProfile.id ? priceProfile : entry))
      : [...quantityProfile.priceProfiles, priceProfile],
  });
  const nextProject = updateBuilding(project, (building) => ({ ...building, quantityProfile: nextProfile }));
  return commandSuccess(project, nextProject, command, [
    { operation: existing ? 'replace' : 'create', entityType: 'priceProfile', id: priceProfile.id, countryCode: 'PH' },
  ]);
}

function configureAssemblyDefinition(project, command) {
  if (!command.assemblyId || !QUANTITY_RATE_KEYS.includes(command.rateKey)) {
    return commandError(
      project,
      command,
      'invalid-assembly-identity',
      'Assembly requires stable ID and supported takeoff rate key.',
    );
  }
  const numericFields = ['wastePercent', 'materialFactor', 'laborFactor', 'equipmentFactor'];
  const invalidField = numericFields.find((field) => !Number.isFinite(command[field]) || command[field] < 0);
  if (invalidField) {
    return commandError(project, command, 'invalid-assembly-factor', `${invalidField} must be non-negative.`, {
      field: invalidField,
    });
  }
  const quantityProfile = createQuantityProfile(project.building.quantityProfile);
  const existing = quantityProfile.assemblies.find((entry) => entry.id === command.assemblyId);
  const rateKeyConflict = quantityProfile.assemblies.find(
    (entry) => entry.rateKey === command.rateKey && entry.id !== command.assemblyId,
  );
  if (rateKeyConflict) {
    return commandError(
      project,
      command,
      'assembly-rate-key-conflict',
      'Only one base assembly may control a takeoff rate key.',
      { existingAssemblyId: rateKeyConflict.id },
    );
  }
  const assembly = createAssemblyDefinition({ ...existing, ...command, id: command.assemblyId });
  const nextProfile = createQuantityProfile({
    ...quantityProfile,
    assemblies: existing
      ? quantityProfile.assemblies.map((entry) => (entry.id === assembly.id ? assembly : entry))
      : [...quantityProfile.assemblies, assembly],
  });
  const nextProject = updateBuilding(project, (building) => ({ ...building, quantityProfile: nextProfile }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: existing ? 'replace' : 'create',
      entityType: 'assemblyDefinition',
      id: assembly.id,
      rateKey: assembly.rateKey,
    },
  ]);
}

function configureAssemblyCatalog(project, command) {
  if (!Array.isArray(command.assemblies) || command.assemblies.length === 0) {
    return commandError(
      project,
      command,
      'assembly-catalog-required',
      'Assembly catalog requires one or more definitions.',
    );
  }
  const rateKeys = new Set();
  for (const candidate of command.assemblies) {
    if (!candidate.id || !QUANTITY_RATE_KEYS.includes(candidate.rateKey) || rateKeys.has(candidate.rateKey)) {
      return commandError(
        project,
        command,
        'invalid-assembly-catalog',
        'Assembly catalog IDs and takeoff rate keys must be valid and unique.',
      );
    }
    rateKeys.add(candidate.rateKey);
    for (const field of ['wastePercent', 'materialFactor', 'laborFactor', 'equipmentFactor']) {
      if (!Number.isFinite(candidate[field]) || candidate[field] < 0) {
        return commandError(
          project,
          command,
          'invalid-assembly-factor',
          `${candidate.rateKey} ${field} must be non-negative.`,
          { rateKey: candidate.rateKey, field },
        );
      }
    }
  }
  const assemblies = command.assemblies.map(createAssemblyDefinition);
  const quantityProfile = createQuantityProfile({
    ...project.building.quantityProfile,
    assemblies,
  });
  const nextProject = updateBuilding(project, (building) => ({ ...building, quantityProfile }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'replace_catalog', entityType: 'assemblyDefinition', ids: assemblies.map((entry) => entry.id) },
  ]);
}

function configureFeasibilityScenario(project, command) {
  const quantityProfile = createQuantityProfile(project.building.quantityProfile);
  if (!command.scenarioId || !String(command.name || '').trim()) {
    return commandError(
      project,
      command,
      'invalid-scenario-identity',
      'Feasibility scenario requires stable ID and name.',
    );
  }
  if (!quantityProfile.priceProfiles.some((entry) => entry.id === command.priceProfileId)) {
    return commandError(
      project,
      command,
      'scenario-price-profile-missing',
      'Scenario must reference an existing price profile.',
    );
  }
  const percentageFields = [
    'contingencyPercent',
    'professionalFeesPercent',
    'vacancyPercent',
    'operatingExpensePercent',
  ];
  const invalidPercentage = percentageFields.find(
    (field) => !Number.isFinite(command[field]) || command[field] < 0 || command[field] > 100,
  );
  if (invalidPercentage) {
    return commandError(
      project,
      command,
      'invalid-scenario-percentage',
      `${invalidPercentage} must be between 0 and 100.`,
      { field: invalidPercentage },
    );
  }
  const amountFields = ['permitAllowance', 'otherAllowance'];
  if (
    amountFields.some((field) => !Number.isFinite(command[field]) || command[field] < 0) ||
    !validOptionalNonNegative(command.monthlyGrossRent)
  ) {
    return commandError(
      project,
      command,
      'invalid-scenario-amount',
      'Scenario allowances and rent must be blank or non-negative.',
    );
  }
  const existing = quantityProfile.scenarios.find((entry) => entry.id === command.scenarioId);
  const scenario = createFeasibilityScenario({ ...existing, ...command, id: command.scenarioId });
  const scenarios = existing
    ? quantityProfile.scenarios.map((entry) => (entry.id === scenario.id ? scenario : entry))
    : [...quantityProfile.scenarios, scenario];
  const nextProfile = createQuantityProfile({
    ...quantityProfile,
    scenarios,
    activeScenarioId: command.setActive === false ? quantityProfile.activeScenarioId : scenario.id,
  });
  const nextProject = updateBuilding(project, (building) => ({ ...building, quantityProfile: nextProfile }));
  const economics = deriveFeasibilityEconomics(nextProject, scenario.id);
  return commandSuccess(project, nextProject, command, [
    {
      operation: existing ? 'replace' : 'create',
      entityType: 'feasibilityScenario',
      id: scenario.id,
      priceProfileId: scenario.priceProfileId,
    },
    {
      operation: 'derive',
      entityType: 'feasibilityEconomics',
      id: scenario.id,
      pricingComplete: economics.pricingComplete,
      totalProjectCost: economics.totalProjectCost,
    },
  ]);
}

function setActiveFeasibilityScenario(project, command) {
  const quantityProfile = createQuantityProfile(project.building.quantityProfile);
  if (!quantityProfile.scenarios.some((entry) => entry.id === command.scenarioId)) {
    return commandError(project, command, 'scenario-not-found', 'Active feasibility scenario was not found.');
  }
  const nextProfile = createQuantityProfile({ ...quantityProfile, activeScenarioId: command.scenarioId });
  const nextProject = updateBuilding(project, (building) => ({ ...building, quantityProfile: nextProfile }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'select', entityType: 'feasibilityScenario', id: command.scenarioId },
  ]);
}

function realizeQuantityCostBaseline(project, command) {
  const result = realizeCostBaseline(project, command.profile || {});
  if (!result.ok) return commandError(project, command, result.code, result.message, result.details || {});
  return commandSuccess(project, result.project, command, [
    {
      operation: 'realize',
      entityType: 'quantityCostBaseline',
      id: result.state.baselineScenarioId,
      sourceServicesRealizationSignature: result.state.sourceServicesRealizationSignature,
      lineItemCount: result.state.lineItemSnapshots.length,
      scenarioCount: result.state.scenarioSnapshots.length,
      opportunityCount: result.state.valueEngineeringOpportunities.length,
      pricingComplete: result.state.pricingComplete,
      bidCreated: false,
      appraisalCreated: false,
      professionalCostCertificationPerformed: false,
    },
  ]);
}

function setValueEngineeringOpportunityStatus(project, command) {
  const realization = deriveCostRealization(project);
  if (realization.state.status !== 'realized')
    return commandError(
      project,
      command,
      'cost-realization-required',
      'Accept a quantity-and-cost baseline before recording a value-engineering decision.',
    );
  if (realization.outOfDate)
    return commandError(
      project,
      command,
      'current-cost-realization-required',
      'Regenerate the outdated quantity-and-cost baseline before recording a value-engineering decision.',
    );
  const allowed = new Set([
    'candidate_requires_design_and_supplier_review',
    'shortlisted_for_professional_review',
    'rejected',
  ]);
  if (!allowed.has(command.status))
    return commandError(
      project,
      command,
      'invalid-value-engineering-status',
      'Value-engineering status must remain a candidate, be shortlisted for professional review, or be rejected.',
    );
  const existing = realization.state.valueEngineeringOpportunities.find((entry) => entry.id === command.opportunityId);
  if (!existing)
    return commandError(
      project,
      command,
      'value-engineering-opportunity-not-found',
      'Value-engineering opportunity was not found in the accepted baseline.',
    );
  const valueEngineeringOpportunities = realization.state.valueEngineeringOpportunities.map((entry) =>
    entry.id === existing.id
      ? {
          ...entry,
          status: command.status,
          decisionNote: String(command.note || ''),
          acceptedSubstitution: false,
          professionalReviewRequired: true,
        }
      : entry,
  );
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    costRealization: { ...building.costRealization, valueEngineeringOpportunities },
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'record_decision',
      entityType: 'valueEngineeringOpportunity',
      id: existing.id,
      status: command.status,
      acceptedSubstitution: false,
    },
  ]);
}

function configureDesignAssumption(project, command) {
  if (!command.assumptionId || !String(command.title || '').trim() || !String(command.statement || '').trim()) {
    return commandError(
      project,
      command,
      'invalid-assumption',
      'Design assumption requires a stable ID, title, and statement.',
    );
  }
  if (!String(command.sourceLabel || '').trim() || !String(command.sourceDate || '').trim()) {
    return commandError(
      project,
      command,
      'assumption-source-required',
      'Design assumption requires a named source and source date.',
    );
  }
  const assumptions = (project.building.assumptions || []).map(createDesignAssumption);
  const existing = assumptions.find((entry) => entry.id === command.assumptionId);
  const assumption = createDesignAssumption({
    ...existing,
    id: command.assumptionId,
    title: command.title,
    category: command.category,
    statement: command.statement,
    sourceLabel: command.sourceLabel,
    sourceDate: command.sourceDate,
    status: command.status,
    entityRefs: command.entityRefs,
  });
  const nextAssumptions = existing
    ? assumptions.map((entry) => (entry.id === assumption.id ? assumption : entry))
    : [...assumptions, assumption];
  const nextProject = updateBuilding(project, (building) => ({ ...building, assumptions: nextAssumptions }));
  return commandSuccess(project, nextProject, command, [
    { operation: existing ? 'replace' : 'create', entityType: 'designAssumption', id: assumption.id },
  ]);
}

function configureReviewItem(project, command) {
  if (!command.reviewItemId || !String(command.title || '').trim() || !String(command.comment || '').trim()) {
    return commandError(
      project,
      command,
      'invalid-review-item',
      'Review item requires a stable ID, title, and comment.',
    );
  }
  if (!REVIEW_DISCIPLINES.includes(command.discipline)) {
    return commandError(project, command, 'invalid-review-discipline', 'Review item discipline is not supported.');
  }
  if (command.status && !REVIEW_STATUSES.includes(command.status)) {
    return commandError(project, command, 'invalid-review-status', 'Review item status is not supported.');
  }
  const documentation = createDocumentationModel(project.building.documentation);
  const existing = documentation.reviewItems.find((entry) => entry.id === command.reviewItemId);
  const reviewItem = createProfessionalReviewItem({
    ...existing,
    id: command.reviewItemId,
    title: command.title,
    discipline: command.discipline,
    severity: command.severity,
    status: command.status || existing?.status || 'open',
    comment: command.comment,
    resolution: command.resolution ?? existing?.resolution,
    entityRefs: command.entityRefs ?? existing?.entityRefs,
    createdBy: command.createdBy ?? existing?.createdBy,
    createdDate: command.createdDate ?? existing?.createdDate,
  });
  if (reviewItem.status !== 'open' && !reviewItem.resolution.trim()) {
    return commandError(
      project,
      command,
      'review-resolution-required',
      'Closed review items require a recorded resolution.',
    );
  }
  const reviewItems = existing
    ? documentation.reviewItems.map((entry) => (entry.id === reviewItem.id ? reviewItem : entry))
    : [...documentation.reviewItems, reviewItem];
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    documentation: createDocumentationModel({ ...documentation, reviewItems }),
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: existing ? 'replace' : 'create', entityType: 'professionalReviewItem', id: reviewItem.id },
  ]);
}

function setReviewItemStatus(project, command) {
  const documentation = createDocumentationModel(project.building.documentation);
  const existing = documentation.reviewItems.find((entry) => entry.id === command.reviewItemId);
  if (!existing)
    return commandError(project, command, 'review-item-not-found', 'Professional review item was not found.');
  if (!REVIEW_STATUSES.includes(command.status)) {
    return commandError(project, command, 'invalid-review-status', 'Review item status is not supported.');
  }
  if (command.status !== 'open' && !String(command.resolution || '').trim()) {
    return commandError(
      project,
      command,
      'review-resolution-required',
      'Closed review items require a recorded resolution.',
    );
  }
  const updated = createProfessionalReviewItem({
    ...existing,
    status: command.status,
    resolution: command.status === 'open' ? command.resolution || '' : command.resolution,
  });
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    documentation: createDocumentationModel({
      ...documentation,
      reviewItems: documentation.reviewItems.map((entry) => (entry.id === updated.id ? updated : entry)),
    }),
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'set_status', entityType: 'professionalReviewItem', id: updated.id, status: updated.status },
  ]);
}

function recordExternalVerification(project, command) {
  const documentation = createDocumentationModel(project.building.documentation);
  const existing = documentation.reviewItems.find((entry) => entry.id === command.reviewItemId);
  if (!existing)
    return commandError(project, command, 'review-item-not-found', 'Professional review item was not found.');
  const verification = {
    professionalName: String(command.professionalName || '').trim(),
    profession: String(command.profession || '').trim(),
    licenseId: String(command.licenseId || '').trim(),
    verificationDate: String(command.verificationDate || '').trim(),
    scopeNote: String(command.scopeNote || '').trim(),
  };
  if (command.confirmedExternalReview !== true || Object.values(verification).some((value) => !value)) {
    return commandError(
      project,
      command,
      'external-verification-evidence-required',
      'Engineer-verified status requires explicit confirmation plus professional identity, profession, license, date, and reviewed scope.',
    );
  }
  const updated = createProfessionalReviewItem({
    ...existing,
    confidence: DESIGN_CONFIDENCE.ENGINEER_VERIFIED,
    externalVerification: verification,
  });
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    documentation: createDocumentationModel({
      ...documentation,
      reviewItems: documentation.reviewItems.map((entry) => (entry.id === updated.id ? updated : entry)),
    }),
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'record_external_verification',
      entityType: 'professionalReviewItem',
      id: updated.id,
      verificationDate: verification.verificationDate,
    },
  ]);
}

function captureReviewRevision(project, command) {
  if (!command.revisionId || !String(command.code || '').trim() || !String(command.label || '').trim()) {
    return commandError(
      project,
      command,
      'invalid-review-revision',
      'Review revision requires a stable ID, code, and label.',
    );
  }
  if (!String(command.date || '').trim() || !String(command.author || '').trim()) {
    return commandError(
      project,
      command,
      'review-revision-authorship-required',
      'Review revision requires an issue date and author.',
    );
  }
  const documentation = createDocumentationModel(project.building.documentation);
  if (documentation.revisionSnapshots.some((entry) => entry.id === command.revisionId)) {
    return commandError(
      project,
      command,
      'review-revision-id-conflict',
      'Review revision ID already exists and snapshots are immutable.',
    );
  }
  const revision = createRevisionSnapshot(
    project,
    {
      id: command.revisionId,
      code: command.code,
      label: command.label,
      date: command.date,
      author: command.author,
      purpose: command.purpose,
      note: command.note,
    },
    validateBuildingCoordination(project).length,
  );
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    documentation: createDocumentationModel({
      ...documentation,
      revisionSnapshots: [...documentation.revisionSnapshots, revision],
      activeRevisionId: revision.id,
    }),
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'capture', entityType: 'revisionSnapshot', id: revision.id, basisSignature: revision.basisSignature },
  ]);
}

function setActiveReviewRevision(project, command) {
  const documentation = createDocumentationModel(project.building.documentation);
  if (!documentation.revisionSnapshots.some((entry) => entry.id === command.revisionId)) {
    return commandError(project, command, 'review-revision-not-found', 'Review revision snapshot was not found.');
  }
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    documentation: createDocumentationModel({ ...documentation, activeRevisionId: command.revisionId }),
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'select', entityType: 'revisionSnapshot', id: command.revisionId },
  ]);
}

function generatePreliminaryDrawingPackage(project, command) {
  const packageId = command.packageId || 'alpha';
  const syncedBasis = syncCanonicalBuilding(project);
  const derivedPackage = derivePreliminaryPackage(syncedBasis, packageId);
  const retainedSheets = (syncedBasis.sheets || []).filter(
    (sheet) => !(sheet.packageKind === PRELIMINARY_PACKAGE_KIND && sheet.packageId === packageId),
  );
  const nextProject = { ...syncedBasis, sheets: [...retainedSheets, ...derivedPackage.sheets] };
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'replace_generated_set',
      entityType: 'sheet',
      id: packageId,
      sheetIds: derivedPackage.sheets.map((sheet) => sheet.id),
      preservedUserSheetCount: retainedSheets.length,
    },
  ]);
}

function issueCoordinatedReviewPackage(project, command) {
  const result = issueDocumentationRealization(project, validateBuildingCoordination(project), command.profile || {});
  if (!result.ok) return commandError(project, command, result.code, result.message, result.details || {});
  return commandSuccess(project, result.project, command, [
    {
      operation: 'issue',
      entityType: 'professionalReviewPackage',
      id: result.state.id,
      packageId: result.state.packageId,
      sourceRevisionId: result.state.sourceRevisionId,
      sheetIds: result.state.sheetSnapshots.map((entry) => entry.id),
      unresolvedFindingCount: result.state.unresolvedFindingSnapshots.length,
      permitSubmissionCreated: false,
      constructionAuthorizationCreated: false,
      professionalSealProvided: false,
    },
  ]);
}

function publishProfessionalReviewExchange(project, command) {
  const result = publishProfessionalExchange(project, command);
  if (!result.ok) return commandError(project, command, result.code, result.message);
  return commandSuccess(project, result.project, command, [
    {
      operation: 'publish',
      entityType: 'professionalExchange',
      id: result.exchange.id,
      sourceDocumentationRealizationId: result.exchange.sourceDocumentationRealizationId,
      pdfPageCount: result.exchange.manifest.files.multiSheetPdf.pageCount,
      dxfFileCount: result.exchange.manifest.files.dxf.length,
      ifcCertificationCreated: false,
      permitAcceptanceCreated: false,
      professionalApprovalCreated: false,
    },
  ]);
}

function importReviewerMarkup(project, command) {
  const result = appendReviewerMarkup(project, command.markup || command);
  if (!result.ok) return commandError(project, command, result.code, result.message);
  return commandSuccess(project, result.project, command, [
    {
      operation: 'import',
      entityType: 'reviewerMarkup',
      id: result.markup.id,
      exchangeId: result.markup.exchangeId,
    },
  ]);
}

function importReviewerMarkupExchangeCommand(project, command) {
  let result;
  try {
    result = importReviewerMarkupExchange(project, command.payload, command);
  } catch {
    return commandError(
      project,
      command,
      'markup-exchange-invalid-json',
      'Reviewer markup exchange is not valid JSON.',
    );
  }
  if (!result.ok) return commandError(project, command, result.code, result.message, result.details || {});
  return commandSuccess(project, result.project, command, [
    {
      operation: 'import_set',
      entityType: 'reviewerMarkup',
      id: command.exchangeId || 'markup_exchange',
      markupIds: result.imported.map((entry) => entry.id),
    },
  ]);
}

function recordExternalProfessionalResponse(project, command) {
  const result = appendExternalProfessionalResponse(project, command.responseRecord || command);
  if (!result.ok) return commandError(project, command, result.code, result.message);
  return commandSuccess(project, result.project, command, [
    {
      operation: 'record_external_response',
      entityType: 'externalProfessionalResponse',
      id: result.response.id,
      markupId: result.response.markupId,
      professionalApprovalCreated: false,
      permitAcceptanceCreated: false,
    },
  ]);
}

function setActiveProfessionalExchange(project, command) {
  const result = selectProfessionalExchange(project, command.exchangeId);
  if (!result.ok) return commandError(project, command, result.code, result.message);
  return commandSuccess(project, result.project, command, [
    {
      operation: 'select',
      entityType: 'professionalExchange',
      id: command.exchangeId,
    },
  ]);
}

function structuralSystem(project) {
  return project.building?.systems?.structural || null;
}

function updateStructuralSystem(project, updater) {
  return {
    ...project,
    building: {
      ...project.building,
      systems: {
        ...project.building.systems,
        structural: updater(structuralSystem(project)),
      },
    },
  };
}

function updatePlumbingSystem(project, updater) {
  return {
    ...project,
    building: {
      ...project.building,
      systems: {
        ...project.building.systems,
        plumbing: updater(project.building.systems?.plumbing),
      },
    },
  };
}

function updateElectricalSystem(project, updater) {
  return {
    ...project,
    building: {
      ...project.building,
      systems: {
        ...project.building.systems,
        electrical: updater(project.building.systems?.electrical),
      },
    },
  };
}

function updateEgressSystem(project, updater) {
  return {
    ...project,
    building: {
      ...project.building,
      systems: {
        ...project.building.systems,
        egress: updater(project.building.systems?.egress || { exits: [], routes: [] }),
      },
    },
  };
}

function configureEquipmentCoordination(project, command) {
  const values = {
    maximumElectricalPointDistance: command.maximumElectricalPointDistance,
    minimumEquipmentClearance: command.minimumEquipmentClearance,
  };
  if (Object.values(values).some((value) => !Number.isFinite(value) || value <= 0)) {
    return commandError(
      project,
      command,
      'invalid-equipment-coordination-profile',
      'Equipment distances and clearances must be positive finite millimetres.',
    );
  }
  const profile = createEquipmentCoordinationProfile({
    ...project.building.systems?.equipmentCoordinationProfile,
    ...values,
    id: command.profileId || project.building.systems?.equipmentCoordinationProfile?.id,
  });
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    systems: { ...building.systems, equipmentCoordinationProfile: profile },
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'configure', entityType: 'equipmentCoordinationProfile', id: profile.id },
  ]);
}

function configureEquipmentZone(project, command) {
  if (!command.zoneId || !EQUIPMENT_KINDS.includes(command.kind)) {
    return commandError(
      project,
      command,
      'invalid-equipment-zone-identity',
      'Equipment zone requires a stable ID and supported kind.',
    );
  }
  if (
    !validPoint(command.origin) ||
    !Number.isFinite(command.width) ||
    command.width <= 0 ||
    !Number.isFinite(command.depth) ||
    command.depth <= 0 ||
    !Number.isFinite(command.clearance) ||
    command.clearance < 0
  ) {
    return commandError(
      project,
      command,
      'invalid-equipment-zone-geometry',
      'Equipment origin, size, and clearance must be valid non-negative millimetres.',
    );
  }
  if (command.location === 'floor' && !(project.floors || []).some((entry) => entry.id === command.floorId)) {
    return commandError(
      project,
      command,
      'equipment-floor-missing',
      'Floor-hosted equipment must reference an existing floor.',
    );
  }
  if (command.location === 'roof' && !project.roofSystem) {
    return commandError(project, command, 'equipment-roof-missing', 'Roof-hosted equipment requires a modeled roof.');
  }
  const zone = createEquipmentZone({ ...command, id: command.zoneId });
  const systems = project.building.systems || {};
  const allZones = [
    ...(systems.electrical?.panelZones || []),
    ...(systems.water?.equipmentZones || []),
    ...(systems.mechanical?.outdoorUnitZones || []),
  ];
  if (allZones.some((entry) => entry.id === zone.id && entry.kind !== zone.kind)) {
    return commandError(
      project,
      command,
      'equipment-zone-id-conflict',
      'Equipment zone ID is already used by another equipment kind.',
    );
  }
  const replace = (entries) =>
    entries.some((entry) => entry.id === zone.id)
      ? entries.map((entry) => (entry.id === zone.id ? zone : entry))
      : [...entries, zone];
  const nextProject = updateBuilding(project, (building) => {
    const current = building.systems || {};
    if (zone.kind === 'electrical_panel')
      return {
        ...building,
        systems: {
          ...current,
          electrical: { ...current.electrical, panelZones: replace(current.electrical?.panelZones || []) },
        },
      };
    if (zone.kind === 'ac_outdoor_zone')
      return {
        ...building,
        systems: {
          ...current,
          mechanical: { ...current.mechanical, outdoorUnitZones: replace(current.mechanical?.outdoorUnitZones || []) },
        },
      };
    return {
      ...building,
      systems: {
        ...current,
        water: { ...current.water, equipmentZones: replace(current.water?.equipmentZones || []) },
      },
    };
  });
  return commandSuccess(project, nextProject, command, [
    {
      operation: allZones.some((entry) => entry.id === zone.id) ? 'replace' : 'create',
      entityType: 'equipmentZone',
      id: zone.id,
      kind: zone.kind,
    },
  ]);
}

function configureElectricalPoint(project, command) {
  if (!command.pointId || !ELECTRICAL_POINT_KINDS.includes(command.kind) || !validPoint(command.position)) {
    return commandError(
      project,
      command,
      'invalid-electrical-point',
      'Electrical point requires a stable ID, supported kind, and finite position.',
    );
  }
  if (!(project.floors || []).some((entry) => entry.id === command.floorId)) {
    return commandError(
      project,
      command,
      'electrical-point-floor-missing',
      'Electrical point must reference an existing floor.',
    );
  }
  const panels = project.building.systems?.electrical?.panelZones || [];
  if (!panels.some((entry) => entry.id === command.panelZoneId)) {
    return commandError(
      project,
      command,
      'electrical-point-panel-missing',
      'Electrical point must reference a modeled panel zone.',
    );
  }
  const electricalPoint = createElectricalPoint({ ...command, id: command.pointId });
  const existing = (project.building.systems?.electrical?.points || []).some(
    (entry) => entry.id === electricalPoint.id,
  );
  const nextProject = updateElectricalSystem(project, (electrical) => ({
    ...electrical,
    points: existing
      ? (electrical.points || []).map((entry) => (entry.id === electricalPoint.id ? electricalPoint : entry))
      : [...(electrical.points || []), electricalPoint],
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: existing ? 'replace' : 'create',
      entityType: 'electricalPoint',
      id: electricalPoint.id,
      panelZoneId: electricalPoint.panelZoneId,
    },
  ]);
}

function configureRoofDrainagePath(project, command) {
  if (!project.roofSystem) return commandError(project, command, 'roof-system-missing', 'A modeled roof is required.');
  if (
    !command.drainId ||
    !validPoint(command.position) ||
    !Number.isFinite(command.diameter) ||
    command.diameter <= 0
  ) {
    return commandError(
      project,
      command,
      'invalid-roof-drain',
      'Roof drain requires a stable ID, finite position, and positive diameter.',
    );
  }
  if (!['plumbing_shaft', 'site_discharge', 'downspout'].includes(command.outletRef?.kind)) {
    return commandError(
      project,
      command,
      'invalid-roof-drain-outlet',
      'Roof drain outlet must reference a plumbing shaft, site discharge, or downspout.',
    );
  }
  if (
    !Array.isArray(command.routePoints) ||
    command.routePoints.length < 2 ||
    command.routePoints.some((entry) => !validPoint(entry))
  ) {
    return commandError(
      project,
      command,
      'invalid-roof-drain-route',
      'Roof drain route requires at least two finite points.',
    );
  }
  if (
    command.outletRef.kind === 'plumbing_shaft' &&
    !(project.building.systems?.plumbing?.shafts || []).some((entry) => entry.id === command.outletRef.id)
  ) {
    return commandError(
      project,
      command,
      'roof-drain-shaft-missing',
      'Roof drain plumbing-shaft outlet was not found.',
    );
  }
  const existing = (project.roofSystem.drains || []).find((entry) => entry.id === command.drainId);
  const drain = createDrain(command.position, {
    ...existing,
    id: command.drainId,
    name: command.name,
    diameter: command.diameter,
    invertOffset: command.invertOffset,
    catchmentPlaneIds: command.catchmentPlaneIds,
    outletRef: command.outletRef,
    routePoints: command.routePoints,
  });
  const drainageProfile = {
    ...(project.roofSystem.drainageProfile || {}),
    ...(command.profile || {}),
  };
  const roofSystem = {
    ...project.roofSystem,
    drainageProfile,
    drains: existing
      ? project.roofSystem.drains.map((entry) => (entry.id === drain.id ? drain : entry))
      : [...(project.roofSystem.drains || []), drain],
  };
  return commandSuccess(project, { ...project, roofSystem }, command, [
    { operation: existing ? 'replace' : 'create', entityType: 'roofDrain', id: drain.id, outletRef: drain.outletRef },
  ]);
}

function configurePlumbingShaft(project, command) {
  const plumbing = project.building.systems?.plumbing;
  if (!plumbing) return commandError(project, command, 'plumbing-system-missing', 'Plumbing system is missing.');
  if (!command.shaftId) return commandError(project, command, 'shaft-id-required', 'A stable shaftId is required.');
  if (!validPoint(command.origin)) {
    return commandError(project, command, 'invalid-shaft-origin', 'Shaft origin must contain finite X and Y values.');
  }
  if (
    !Number.isFinite(command.width) ||
    command.width <= 0 ||
    !Number.isFinite(command.depth) ||
    command.depth <= 0 ||
    !Number.isFinite(command.maxFixtureDistance) ||
    command.maxFixtureDistance < 0
  ) {
    return commandError(
      project,
      command,
      'invalid-shaft-geometry',
      'Shaft dimensions must be positive and fixture distance must be non-negative millimetres.',
    );
  }
  const servedFloorIds = [...new Set(command.servedFloorIds || [])];
  const floorIndex = new Map(project.floors.map((floor, index) => [floor.id, index]));
  const indices = servedFloorIds.map((id) => floorIndex.get(id));
  const sorted = [...indices].sort((a, b) => a - b);
  if (
    !servedFloorIds.length ||
    indices.some((index) => index == null) ||
    sorted.some((index, position) => position > 0 && index !== sorted[position - 1] + 1)
  ) {
    return commandError(
      project,
      command,
      'invalid-shaft-levels',
      'A shaft must serve one or more contiguous existing levels.',
      { servedFloorIds },
    );
  }
  const existing = (plumbing.shafts || []).find((shaft) => shaft.id === command.shaftId);
  const shaft = createPlumbingShaft({
    ...existing,
    id: command.shaftId,
    name: command.name ?? existing?.name,
    origin: command.origin,
    width: command.width,
    depth: command.depth,
    servedFloorIds,
    maxFixtureDistance: command.maxFixtureDistance,
  });
  const nextProject = updatePlumbingSystem(project, (system) => ({
    ...system,
    shafts: existing
      ? system.shafts.map((entry) => (entry.id === shaft.id ? shaft : entry))
      : [...(system.shafts || []), shaft],
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: existing ? 'replace' : 'create', entityType: 'plumbingShaft', id: shaft.id },
  ]);
}

function assignNearbyWetFixtures(project, command) {
  const shaft = (project.building.systems?.plumbing?.shafts || []).find((entry) => entry.id === command.shaftId);
  if (!shaft)
    return commandError(project, command, 'shaft-not-found', `Plumbing shaft ${command.shaftId} was not found.`);
  const assignedFixtureIds = [];
  const floors = project.floors.map((floor) => {
    if (!(shaft.servedFloorIds || []).includes(floor.id)) return floor;
    const originalFixtures = floor.fixtures || [];
    const fixtures = originalFixtures.map((fixture) => {
      if (!WET_FIXTURE_TYPES.has(fixture.fixtureType)) return fixture;
      if (fixture.plumbingShaftId && fixture.plumbingShaftId !== shaft.id && !command.reassign) return fixture;
      if (fixtureDistanceToShaft(fixture, shaft) > shaft.maxFixtureDistance) return fixture;
      if (fixture.plumbingShaftId === shaft.id) return fixture;
      assignedFixtureIds.push(fixture.id);
      return { ...fixture, plumbingShaftId: shaft.id };
    });
    return fixtures.some((fixture, index) => fixture !== originalFixtures[index]) ? { ...floor, fixtures } : floor;
  });
  const nextProject = { ...project, floors };
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'relate',
      entityType: 'fixture',
      relation: 'plumbingShaft',
      targetId: shaft.id,
      fixtureIds: assignedFixtureIds,
      configuredMaximumDistance: shaft.maxFixtureDistance,
    },
  ]);
}

function contiguousServedFloorIds(project, servedFloorIds) {
  const unique = [...new Set(servedFloorIds || [])];
  const floorIndex = new Map((project.floors || []).map((floor, index) => [floor.id, index]));
  const indices = unique.map((floorId) => floorIndex.get(floorId));
  const sorted = [...indices].sort((a, b) => a - b);
  return unique.length > 0 &&
    indices.every((index) => index != null) &&
    sorted.every((index, position) => position === 0 || index === sorted[position - 1] + 1)
    ? unique.sort((a, b) => floorIndex.get(a) - floorIndex.get(b))
    : null;
}

function configureServicesCoordination(project, command) {
  const numericFields = [
    'minimumDrainSlopePercent',
    'maximumEgressTravelDistance',
    'routeEndpointTolerance',
    'doorPassageTolerance',
    'minimumVerticalOpeningOverlap',
  ];
  const invalidField = numericFields.find((field) => !Number.isFinite(command[field]) || command[field] < 0);
  if (invalidField) {
    return commandError(project, command, 'invalid-services-assumption', `${invalidField} must be non-negative.`, {
      field: invalidField,
    });
  }
  const coordinationProfile = {
    ...DEFAULT_SERVICES_COORDINATION_PROFILE,
    ...(project.building.systems?.coordinationProfile || {}),
    ...Object.fromEntries(numericFields.map((field) => [field, command[field]])),
  };
  const nextProject = {
    ...project,
    building: {
      ...project.building,
      systems: { ...project.building.systems, coordinationProfile },
    },
  };
  return commandSuccess(project, nextProject, command, [
    { operation: 'replace', entityType: 'servicesCoordinationProfile', id: coordinationProfile.id },
  ]);
}

function configureElectricalRiser(project, command) {
  if (!command.riserId) {
    return commandError(project, command, 'riser-id-required', 'A stable electrical riser ID is required.');
  }
  if (
    !validPoint(command.origin) ||
    !Number.isFinite(command.width) ||
    command.width <= 0 ||
    !Number.isFinite(command.depth) ||
    command.depth <= 0
  ) {
    return commandError(
      project,
      command,
      'invalid-electrical-riser-geometry',
      'Electrical riser origin and dimensions must be valid positive millimetres.',
    );
  }
  const servedFloorIds = contiguousServedFloorIds(project, command.servedFloorIds);
  if (!servedFloorIds) {
    return commandError(
      project,
      command,
      'invalid-electrical-riser-levels',
      'Electrical riser must serve contiguous existing levels.',
    );
  }
  const electrical = project.building.systems?.electrical;
  if (!electrical) return commandError(project, command, 'electrical-system-missing', 'Electrical system is missing.');
  const existing = (electrical.riserZones || []).find((entry) => entry.id === command.riserId);
  const riser = createElectricalRiserZone({
    ...existing,
    id: command.riserId,
    name: command.name ?? existing?.name,
    origin: command.origin,
    width: command.width,
    depth: command.depth,
    servedFloorIds,
    openingClearance: command.openingClearance ?? existing?.openingClearance ?? 100,
  });
  const nextProject = updateElectricalSystem(project, (system) => ({
    ...system,
    riserZones: existing
      ? system.riserZones.map((entry) => (entry.id === riser.id ? riser : entry))
      : [...(system.riserZones || []), riser],
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: existing ? 'replace' : 'create', entityType: 'electricalRiser', id: riser.id },
  ]);
}

function configureDrainageRoute(project, command) {
  const shaft = (project.building.systems?.plumbing?.shafts || []).find((entry) => entry.id === command.sourceShaftId);
  if (!shaft) {
    return commandError(project, command, 'shaft-not-found', 'Drainage route requires an existing plumbing shaft.');
  }
  if (!command.routeId || !findFloor(project, command.floorId)) {
    return commandError(
      project,
      command,
      'invalid-drainage-reference',
      'Drainage route requires stable ID and existing floor.',
    );
  }
  if (
    !Array.isArray(command.points) ||
    command.points.length < 2 ||
    command.points.some((point) => !validPoint(point))
  ) {
    return commandError(
      project,
      command,
      'invalid-drainage-path',
      'Drainage route requires at least two valid plan points.',
    );
  }
  if (
    !Number.isFinite(command.startInvertElevation) ||
    !Number.isFinite(command.endInvertElevation) ||
    !Number.isFinite(command.minimumSlopePercent) ||
    command.minimumSlopePercent < 0
  ) {
    return commandError(
      project,
      command,
      'invalid-drainage-elevations',
      'Drainage route requires finite invert elevations and a non-negative slope assumption.',
    );
  }
  const plumbing = project.building.systems.plumbing;
  const existing = (plumbing.drainageRoutes || []).find((entry) => entry.id === command.routeId);
  const route = createDrainageRoute({ ...existing, ...command, id: command.routeId });
  const nextProject = updatePlumbingSystem(project, (system) => ({
    ...system,
    drainageRoutes: existing
      ? system.drainageRoutes.map((entry) => (entry.id === route.id ? route : entry))
      : [...(system.drainageRoutes || []), route],
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: existing ? 'replace' : 'create',
      entityType: 'drainageRoute',
      id: route.id,
      sourceShaftId: shaft.id,
    },
  ]);
}

function configureEgressExit(project, command) {
  if (!command.exitId || !findFloor(project, command.floorId) || !validPoint(command.point)) {
    return commandError(
      project,
      command,
      'invalid-egress-exit',
      'Egress exit requires stable ID, existing floor, and valid point.',
    );
  }
  const system = project.building.systems?.egress || { exits: [], routes: [] };
  const existing = (system.exits || []).find((entry) => entry.id === command.exitId);
  const exit = createEgressExit({ ...existing, ...command, id: command.exitId });
  const nextProject = updateEgressSystem(project, (egress) => ({
    ...egress,
    exits: existing
      ? egress.exits.map((entry) => (entry.id === exit.id ? exit : entry))
      : [...(egress.exits || []), exit],
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: existing ? 'replace' : 'create', entityType: 'egressExit', id: exit.id, floorId: exit.floorId },
  ]);
}

function configureEgressRoute(project, command) {
  const floor = findFloor(project, command.floorId);
  const room = (floor?.rooms || []).find((entry) => entry.id === command.fromRoomId);
  const system = project.building.systems?.egress || { exits: [], routes: [] };
  const exit = (system.exits || []).find((entry) => entry.id === command.exitId);
  if (!command.routeId || !floor || !room || !exit || exit.floorId !== floor.id) {
    return commandError(
      project,
      command,
      'invalid-egress-route-reference',
      'Egress route must connect an existing room and exit on one level.',
    );
  }
  const points = command.points || defaultEgressRoutePoints(room, exit, command.waypoints || []);
  if (
    points.length < 2 ||
    points.some((point) => !validPoint(point)) ||
    !Number.isFinite(command.maximumTravelDistance) ||
    command.maximumTravelDistance <= 0
  ) {
    return commandError(
      project,
      command,
      'invalid-egress-route-geometry',
      'Egress route requires valid points and positive maximum travel distance.',
    );
  }
  const existing = (system.routes || []).find((entry) => entry.id === command.routeId);
  const route = createEgressRoute({ ...existing, ...command, id: command.routeId, points });
  const nextProject = updateEgressSystem(project, (egress) => ({
    ...egress,
    routes: existing
      ? egress.routes.map((entry) => (entry.id === route.id ? route : entry))
      : [...(egress.routes || []), route],
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: existing ? 'replace' : 'create',
      entityType: 'egressRoute',
      id: route.id,
      fromRoomId: room.id,
      exitId: exit.id,
    },
  ]);
}

function findFloor(project, floorId) {
  return (project.floors || []).find((floor) => floor.id === floorId) || null;
}

function findColumn(floor, columnId) {
  return (floor?.columns || []).find((column) => column.id === columnId) || null;
}

function validPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function validOffsets(offsets) {
  return Array.isArray(offsets) && offsets.length > 0 && offsets.every(Number.isFinite);
}

function axisLabel(index, labels, fallback) {
  return labels?.[index] || fallback(index);
}

function coordinateVerticalServiceOpenings(project, command) {
  const isPlumbing = command.serviceKind === 'plumbing';
  const entities = isPlumbing
    ? project.building.systems?.plumbing?.shafts || []
    : command.serviceKind === 'electrical'
      ? project.building.systems?.electrical?.riserZones || []
      : [];
  const service = entities.find((entry) => entry.id === command.serviceId);
  if (!service) {
    return commandError(project, command, 'vertical-service-not-found', 'Vertical service route was not found.');
  }
  const floorIndex = new Map(project.floors.map((floor, index) => [floor.id, index]));
  const served = [...(service.servedFloorIds || [])].sort((a, b) => floorIndex.get(a) - floorIndex.get(b));
  const targetFloorIds = served.slice(1);
  const hosts = targetFloorIds.map((floorId) => {
    const floor = findFloor(project, floorId);
    const slab = (floor?.slabs || []).find((entry) => pointInPolygon(service.origin, entry.boundaryPoints || []));
    return { floor, slab };
  });
  if (hosts.some(({ floor, slab }) => !floor || !slab)) {
    return commandError(
      project,
      command,
      'vertical-service-slab-missing',
      'Every upper served level needs a slab containing the service origin before openings can be coordinated.',
    );
  }
  const clearance = command.clearance ?? service.openingClearance ?? 100;
  if (!Number.isFinite(clearance) || clearance < 0) {
    return commandError(
      project,
      command,
      'invalid-service-opening-clearance',
      'Opening clearance must be non-negative.',
    );
  }
  const halfWidth = service.width / 2 + clearance;
  const halfDepth = service.depth / 2 + clearance;
  const openingChanges = [];
  const floors = project.floors.map((floor) => {
    const host = hosts.find((entry) => entry.floor.id === floor.id);
    if (!host) return floor;
    const openingId = `${service.id}_${floor.id}_opening`;
    const opening = {
      id: openingId,
      name: `${service.name} opening`,
      purpose: `${command.serviceKind}_riser`,
      serviceRef: { kind: command.serviceKind, id: service.id },
      boundaryPoints: [
        { x: service.origin.x - halfWidth, y: service.origin.y - halfDepth },
        { x: service.origin.x + halfWidth, y: service.origin.y - halfDepth },
        { x: service.origin.x + halfWidth, y: service.origin.y + halfDepth },
        { x: service.origin.x - halfWidth, y: service.origin.y + halfDepth },
      ],
      confidence: 'modeled',
    };
    openingChanges.push({ floorId: floor.id, slabId: host.slab.id, openingId });
    return {
      ...floor,
      slabs: floor.slabs.map((slab) =>
        slab.id !== host.slab.id
          ? slab
          : {
              ...slab,
              openings: (slab.openings || []).some((entry) => entry.id === openingId)
                ? slab.openings.map((entry) => (entry.id === openingId ? opening : entry))
                : [...(slab.openings || []), opening],
            },
      ),
    };
  });
  return commandSuccess(project, { ...project, floors }, command, [
    {
      operation: 'coordinate',
      entityType: 'verticalServiceOpening',
      id: service.id,
      serviceKind: command.serviceKind,
      openings: openingChanges,
    },
  ]);
}

function linkStairClearanceOpening(project, command) {
  const ownerFloor = findFloor(project, command.floorId);
  const stair = (ownerFloor?.stairs || []).find((entry) => entry.id === command.stairId);
  const targetFloor = findFloor(project, command.openingFloorId);
  const slab = (targetFloor?.slabs || []).find((entry) => entry.id === command.slabId);
  const opening = (slab?.openings || []).find((entry) => entry.id === command.openingId);
  if (!stair || !targetFloor || targetFloor.id !== stair.floorRelation?.toFloorId || !slab || !opening) {
    return commandError(
      project,
      command,
      'invalid-stair-clearance-opening',
      'Stair clearance must link to an opening in its destination-level slab.',
    );
  }
  if (!Number.isFinite(command.minimumHeadroom) || command.minimumHeadroom <= 0) {
    return commandError(project, command, 'invalid-headroom-assumption', 'Minimum headroom must be positive.');
  }
  const floors = project.floors.map((floor) =>
    floor.id !== ownerFloor.id
      ? floor
      : {
          ...floor,
          stairs: floor.stairs.map((entry) =>
            entry.id !== stair.id
              ? entry
              : {
                  ...entry,
                  coordination: {
                    ...entry.coordination,
                    minimumHeadroom: command.minimumHeadroom,
                    clearanceOpeningRef: { floorId: targetFloor.id, slabId: slab.id, openingId: opening.id },
                  },
                },
          ),
        },
  );
  return commandSuccess(project, { ...project, floors }, command, [
    {
      operation: 'relate',
      entityType: 'stair',
      id: stair.id,
      relation: 'clearanceOpening',
      targetId: opening.id,
    },
  ]);
}

function definePropertyBoundary(project, command) {
  const boundary = (command.boundary || []).map((point) => ({ x: point.x, y: point.y }));
  if (!isSimplePolygon(boundary)) {
    return commandError(
      project,
      command,
      'invalid-property-boundary',
      'Property boundary must be a simple non-zero-area polygon.',
    );
  }
  if (command.northAngle != null && !Number.isFinite(command.northAngle)) {
    return commandError(project, command, 'invalid-north-angle', 'North angle must be a finite number.');
  }

  const boundaryId = command.boundaryId || project.building.site?.boundaryId;
  if (!boundaryId) {
    return commandError(project, command, 'boundary-id-required', 'A stable boundaryId is required.');
  }
  const nextProject = updateSite(project, (site) => ({
    ...site,
    boundaryId,
    boundary,
    northAngle: command.northAngle ?? site.northAngle ?? 0,
    edgeSetbacks: [],
    roadEdges: [],
    parkingPlan: createParkingPlan(),
    lotSetup: null,
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'replace', entityType: 'propertyBoundary', id: boundaryId },
    { operation: 'clear', entityType: 'siteEdgeConstraints', reason: 'boundary_topology_changed' },
  ]);
}

/**
 * Set where on Earth the site is, which is what turns a floor plan into
 * something the sun can be aimed at.
 *
 * The north angle lives here too: coordinates place the site on the globe, but
 * only the north angle says which way the drawing is turned.
 *
 * The terrain exposure class rides along on the same command for the same
 * reason: it is a property of WHERE the site is, not of any one study, and the
 * wind runner reads it off the site rather than off its own settings. Omitting
 * it leaves whatever the site already carries, exactly as the north angle does.
 */
function configureSiteLocation(project, command) {
  const { latitude, longitude } = command;

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return commandError(project, command, 'invalid-latitude', 'Latitude must be between -90 and 90 degrees.', {
      latitude,
    });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return commandError(project, command, 'invalid-longitude', 'Longitude must be between -180 and 180 degrees.', {
      longitude,
    });
  }
  if (command.northAngle != null && !Number.isFinite(command.northAngle)) {
    return commandError(project, command, 'invalid-north-angle', 'North angle must be a finite number.');
  }
  if (!isValidTimeZone(command.timeZone)) {
    return commandError(
      project,
      command,
      'invalid-time-zone',
      'Choose a valid IANA civil timezone, such as Asia/Manila.',
      { timeZone: command.timeZone },
    );
  }
  if (command.exposureClass != null && !SITE_EXPOSURE_CLASSES.includes(command.exposureClass)) {
    return commandError(
      project,
      command,
      'invalid-exposure-class',
      `Site exposure must be one of: ${SITE_EXPOSURE_CLASSES.join(', ')}.`,
      { exposureClass: command.exposureClass },
    );
  }

  const nextProject = updateSite(project, (site) => {
    const coordinatesChanged = site.latitude !== latitude || site.longitude !== longitude;
    return {
      ...site,
      latitude,
      longitude,
      timeZone: command.timeZone.trim(),
      northAngle: command.northAngle ?? site.northAngle ?? 0,
      locationLabel: command.locationLabel ?? site.locationLabel ?? '',
      exposureClass: normalizeSiteExposureClass(command.exposureClass ?? site.exposureClass),
      // A rose fitted for the old coordinates must never silently survive a
      // location change. Keeping it for timezone/north edits is safe.
      windClimateCache: coordinatesChanged ? null : site.windClimateCache || null,
    };
  });

  return commandSuccess(project, nextProject, command, [
    { operation: 'replace', entityType: 'siteLocation', id: project.building.site?.boundaryId || 'site' },
  ]);
}

function cacheSiteWindClimate(project, command) {
  const site = project.building.site || {};
  const cache = command.cache;
  const expectedLocationKey =
    Number.isFinite(site.latitude) && Number.isFinite(site.longitude)
      ? `${site.latitude.toFixed(4)}|${site.longitude.toFixed(4)}`
      : null;
  if (!expectedLocationKey) {
    return commandError(
      project,
      command,
      'site-location-required',
      'Set a valid site location before caching wind data.',
    );
  }
  if (!cache || typeof cache !== 'object' || cache.locationKey !== expectedLocationKey) {
    return commandError(
      project,
      command,
      'wind-climate-location-mismatch',
      'Wind climate coordinates do not match the current site.',
    );
  }
  if (!Array.isArray(cache.windRose) || cache.windRose.length !== 16) {
    return commandError(
      project,
      command,
      'invalid-wind-climate-rose',
      'Wind climate must contain 16 direction sectors.',
    );
  }

  let frequencyTotal = 0;
  const windRose = [];
  const directions = new Set();
  for (const sector of cache.windRose) {
    const directionDeg = Number(sector?.directionDeg);
    const frequency = Number(sector?.frequency);
    const weibullK = Number(sector?.weibullK);
    const weibullC = Number(sector?.weibullC);
    if (
      !Number.isFinite(directionDeg) ||
      directionDeg < 0 ||
      directionDeg >= 360 ||
      !Number.isFinite(frequency) ||
      frequency < 0 ||
      !Number.isFinite(weibullK) ||
      weibullK <= 0 ||
      !Number.isFinite(weibullC) ||
      weibullC <= 0
    ) {
      return commandError(project, command, 'invalid-wind-climate-rose', 'Wind climate sectors are invalid.');
    }
    frequencyTotal += frequency;
    directions.add(directionDeg);
    windRose.push({ directionDeg, frequency, weibullK, weibullC });
  }
  if (!(frequencyTotal > 0) || directions.size !== 16) {
    return commandError(
      project,
      command,
      'invalid-wind-climate-rose',
      'Wind climate frequencies must total above zero.',
    );
  }

  const prevailingDirectionDeg = Number(cache.prevailingDirectionDeg);
  const prevailingMeanSpeed = Number(cache.prevailingMeanSpeed);
  if (!Number.isFinite(prevailingDirectionDeg) || !Number.isFinite(prevailingMeanSpeed) || prevailingMeanSpeed <= 0) {
    return commandError(
      project,
      command,
      'invalid-wind-climate-summary',
      'Wind climate prevailing conditions are invalid.',
    );
  }

  const finiteOr = (value, fallback) =>
    value == null || value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value);
  const stored = {
    schemaVersion: 1,
    locationKey: expectedLocationKey,
    source: String(cache.source || 'Historical wind climate'),
    sourceUrl: String(cache.sourceUrl || ''),
    period: String(cache.period || ''),
    startDate: String(cache.startDate || ''),
    endDate: String(cache.endDate || ''),
    cachedAt: String(cache.cachedAt || ''),
    sampleCount: finiteOr(cache.sampleCount, null),
    meanSpeed: finiteOr(cache.meanSpeed, null),
    heightM: finiteOr(cache.heightM, 10),
    requestedLatitude: finiteOr(cache.requestedLatitude, site.latitude),
    requestedLongitude: finiteOr(cache.requestedLongitude, site.longitude),
    gridLatitude: finiteOr(cache.gridLatitude, null),
    gridLongitude: finiteOr(cache.gridLongitude, null),
    elevationM: finiteOr(cache.elevationM, null),
    sectorCount: 16,
    windRose: windRose.map((sector) => ({ ...sector, frequency: sector.frequency / frequencyTotal })),
    prevailingDirectionDeg: ((prevailingDirectionDeg % 360) + 360) % 360,
    prevailingMeanSpeed,
  };
  const nextProject = updateSite(project, (currentSite) => ({ ...currentSite, windClimateCache: stored }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'replace', entityType: 'siteWindClimate', id: expectedLocationKey },
  ]);
}

function upsertSolarStudyTarget(project, command) {
  const id = String(command.id || '').trim();
  const name = String(command.name || '').trim();
  const kind = command.kind;
  const polygon = Array.isArray(command.polygon)
    ? command.polygon.map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
    : [];

  if (!id) return commandError(project, command, 'solar-target-id-required', 'A stable target id is required.');
  if (!name) return commandError(project, command, 'solar-target-name-required', 'Give the assessment target a name.');
  if (!['neighbor', 'amenity'].includes(kind)) {
    return commandError(project, command, 'invalid-solar-target-kind', 'Target kind must be neighbor or amenity.');
  }
  if (!isSimplePolygon(polygon)) {
    return commandError(
      project,
      command,
      'invalid-solar-target-polygon',
      'Assessment target must be a simple non-zero-area polygon.',
    );
  }

  const target = { id, name, kind, polygon };
  const nextProject = updateSite(project, (site) => {
    const targets = [...(site.solarStudyTargets || [])];
    const index = targets.findIndex((entry) => entry.id === id);
    if (index >= 0) targets[index] = target;
    else targets.push(target);
    return { ...site, solarStudyTargets: targets };
  });
  return commandSuccess(project, nextProject, command, [{ operation: 'replace', entityType: 'solarStudyTarget', id }]);
}

function removeSolarStudyTarget(project, command) {
  const id = String(command.id || '').trim();
  if (!id) return commandError(project, command, 'solar-target-id-required', 'A target id is required.');
  const targets = project.building.site?.solarStudyTargets || [];
  if (!targets.some((entry) => entry.id === id)) {
    return commandError(project, command, 'solar-target-not-found', 'Assessment target was not found.', { id });
  }
  const nextProject = updateSite(project, (site) => ({
    ...site,
    solarStudyTargets: (site.solarStudyTargets || []).filter((entry) => entry.id !== id),
  }));
  return commandSuccess(project, nextProject, command, [{ operation: 'remove', entityType: 'solarStudyTarget', id }]);
}

function configureSiteSetbacks(project, command) {
  const boundary = project.building.site?.boundary || [];
  if (!isSimplePolygon(boundary)) {
    return commandError(project, command, 'property-boundary-missing', 'Define a valid property boundary first.');
  }
  if (!Array.isArray(command.edgeSetbacks) || command.edgeSetbacks.length !== boundary.length) {
    return commandError(
      project,
      command,
      'incomplete-edge-setbacks',
      'Provide exactly one setback for every property-boundary edge.',
      { expectedCount: boundary.length, actualCount: command.edgeSetbacks?.length || 0 },
    );
  }

  const seen = new Set();
  const edgeSetbacks = [];
  for (const entry of command.edgeSetbacks) {
    if (
      !Number.isInteger(entry.edgeIndex) ||
      entry.edgeIndex < 0 ||
      entry.edgeIndex >= boundary.length ||
      seen.has(entry.edgeIndex) ||
      !Number.isFinite(entry.distance) ||
      entry.distance < 0
    ) {
      return commandError(
        project,
        command,
        'invalid-edge-setback',
        'Setback edge indexes must be unique and distances must be non-negative finite millimetres.',
        { entry },
      );
    }
    seen.add(entry.edgeIndex);
    edgeSetbacks.push({
      edgeIndex: entry.edgeIndex,
      distance: entry.distance,
      classification: entry.classification || 'side',
      source: entry.source || 'user_configured_assumption',
    });
  }
  edgeSetbacks.sort((a, b) => a.edgeIndex - b.edgeIndex);

  const roadEdges = (command.roadEdges || []).map((entry) => ({ ...entry }));
  if (
    roadEdges.some(
      (entry) => !Number.isInteger(entry.edgeIndex) || entry.edgeIndex < 0 || entry.edgeIndex >= boundary.length,
    )
  ) {
    return commandError(project, command, 'invalid-road-edge', 'Road edges must reference property-boundary edges.');
  }

  const nextProject = updateSite(project, (site) => ({ ...site, edgeSetbacks, roadEdges }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'replace', entityType: 'siteEdgeSetbacks', id: siteEntityId(project) },
    { operation: 'replace', entityType: 'roadFrontage', id: siteEntityId(project) },
  ]);
}

function configureRectangularSite(project, command) {
  const width = command.width;
  const depth = command.depth;
  const origin = command.origin || { x: 0, y: 0 };
  const northAngle = command.northAngle ?? 0;
  const frontEdgeIndex = command.frontEdgeIndex ?? 0;
  const setbacks = command.setbacks || {};

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
    return commandError(
      project,
      command,
      'invalid-lot-dimensions',
      'Rectangular lot width and depth must be positive finite millimetres.',
      { width, depth },
    );
  }
  if (!validPoint(origin) || !Number.isFinite(northAngle)) {
    return commandError(project, command, 'invalid-site-orientation', 'Site origin and north angle must be finite.', {
      origin,
      northAngle,
    });
  }
  if (!Number.isInteger(frontEdgeIndex) || frontEdgeIndex < 0 || frontEdgeIndex > 3) {
    return commandError(project, command, 'invalid-frontage-edge', 'Road frontage must reference one rectangle edge.', {
      frontEdgeIndex,
    });
  }
  const setbackRoles = ['front', 'left', 'rear', 'right'];
  if (setbackRoles.some((role) => !Number.isFinite(setbacks[role]) || setbacks[role] < 0)) {
    return commandError(
      project,
      command,
      'invalid-rectangular-setbacks',
      'Front, rear, left, and right setbacks must be non-negative finite millimetres.',
      { setbacks },
    );
  }

  const boundary = [
    { x: origin.x, y: origin.y },
    { x: origin.x + width, y: origin.y },
    { x: origin.x + width, y: origin.y + depth },
    { x: origin.x, y: origin.y + depth },
  ];
  const edgeSetbacks = setbackRoles
    .map((role, offset) => ({
      edgeIndex: (frontEdgeIndex + offset) % 4,
      distance: setbacks[role],
      classification: role,
      source: 'user_configured_assumption',
    }))
    .sort((a, b) => a.edgeIndex - b.edgeIndex);
  const boundaryId = command.boundaryId || project.building.site?.boundaryId;
  if (!boundaryId) {
    return commandError(project, command, 'boundary-id-required', 'A stable boundaryId is required.');
  }

  const nextProject = updateSite(project, (site) => ({
    ...site,
    boundaryId,
    boundary,
    northAngle,
    edgeSetbacks,
    roadEdges: [{ edgeIndex: frontEdgeIndex, roadName: command.roadName || 'Road' }],
    lotSetup: {
      kind: 'rectangle',
      width,
      depth,
      origin: { ...origin },
      frontEdgeIndex,
      roadName: command.roadName || 'Road',
    },
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'replace', entityType: 'rectangularSite', id: boundaryId },
    { operation: 'replace', entityType: 'siteEdgeSetbacks', id: boundaryId },
    { operation: 'replace', entityType: 'roadFrontage', id: boundaryId },
  ]);
}

function configureRegularParkingPlan(project, command) {
  const site = project.building.site || {};
  if (!isSimplePolygon(site.boundary || [])) {
    return commandError(
      project,
      command,
      'property-boundary-missing',
      'Configure a valid property boundary before parking.',
    );
  }
  const bayCount = command.bayCount;
  const values = {
    bayWidth: command.bayWidth,
    bayLength: command.bayLength,
    bayGap: command.bayGap ?? 0,
    accessWidth: command.accessWidth,
  };
  if (
    !Number.isInteger(bayCount) ||
    bayCount < 0 ||
    Object.values(values).some((value) => !Number.isFinite(value) || value < 0) ||
    values.bayWidth <= 0 ||
    values.bayLength <= 0 ||
    values.accessWidth <= 0
  ) {
    return commandError(
      project,
      command,
      'invalid-parking-layout',
      'Parking count must be a non-negative integer and dimensions must be positive finite millimetres.',
    );
  }
  if (
    !command.planId ||
    !validPoint(command.firstBayOrigin) ||
    !Array.isArray(command.routePoints) ||
    command.routePoints.length < 2 ||
    command.routePoints.some((entry) => !validPoint(entry))
  ) {
    return commandError(
      project,
      command,
      'invalid-parking-geometry',
      'Parking plan requires a stable ID, first bay origin, and an access route with at least two points.',
    );
  }
  const angle = Number(command.angle) || 0;
  const radians = (angle * Math.PI) / 180;
  const spacing = values.bayWidth + values.bayGap;
  const bays = Array.from({ length: bayCount }, (_, index) =>
    createParkingBay({
      id: `${command.planId}_bay_${index + 1}`,
      name: `Parking ${index + 1}`,
      origin: {
        x: command.firstBayOrigin.x + Math.cos(radians) * spacing * index,
        y: command.firstBayOrigin.y + Math.sin(radians) * spacing * index,
      },
      width: values.bayWidth,
      length: values.bayLength,
      angle,
      accessible: (command.accessibleBayIndexes || []).includes(index),
      location: command.location,
    }),
  );
  const route = createVehicleAccessRoute({
    id: `${command.planId}_access`,
    name: command.routeName || 'Primary vehicle access',
    roadEdgeIndex: command.roadEdgeIndex,
    points: command.routePoints,
    clearWidth: values.accessWidth,
    servedBayIds: bays.map((entry) => entry.id),
  });
  const profile = {
    ...(site.parkingPlan?.profile || {}),
    ...(command.profile || {}),
    id: command.profile?.id || site.parkingPlan?.profile?.id,
  };
  const parkingPlan = createParkingPlan({ profile, bays, accessRoutes: [route] });
  const nextProject = updateSite(project, (current) => ({ ...current, parkingPlan }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'replace',
      entityType: 'parkingPlan',
      id: command.planId,
      bayIds: bays.map((entry) => entry.id),
      accessRouteId: route.id,
    },
  ]);
}

function configureTestFitProfile(project, command) {
  const positiveFields = [
    'unitDepth',
    'corridorWidth',
    'stairWidth',
    'stairDepth',
    'wetCoreWidth',
    'wetCoreDepth',
    'structuralBayTarget',
    'floorToFloorHeight',
  ];
  const invalidField = positiveFields.find((field) => !Number.isFinite(command[field]) || command[field] <= 0);
  if (invalidField) {
    return commandError(
      project,
      command,
      'invalid-test-fit-profile',
      `${invalidField} must be a positive finite millimetre value.`,
      { field: invalidField, value: command[invalidField] },
    );
  }
  if (
    command.planningCostPerSquareMeter != null &&
    (!Number.isFinite(command.planningCostPerSquareMeter) || command.planningCostPerSquareMeter < 0)
  ) {
    return commandError(
      project,
      command,
      'invalid-test-fit-cost-rate',
      'Planning cost per square metre must be blank or a non-negative amount.',
    );
  }
  const profile = createTestFitProfile({
    ...project.building.testFitProfile,
    ...Object.fromEntries(positiveFields.map((field) => [field, command[field]])),
    planningCostPerSquareMeter: command.planningCostPerSquareMeter,
    currency: command.currency || project.building.brief?.currency || 'PHP',
  });
  const nextProject = updateBuilding(project, (building) => ({ ...building, testFitProfile: profile }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'configure', entityType: 'testFitProfile', id: profile.id },
  ]);
}

function generateTestFitOptions(project, command) {
  const options = deriveGeneratedTestFitOptions(project, command.profile || {});
  if (!options.length) {
    return commandError(
      project,
      command,
      'test-fit-inputs-incomplete',
      'A checked buildable envelope, target storeys, unit types, and configured unit targets are required before generating test fits.',
    );
  }
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    testFitOptions: options,
    selectedTestFitId: options[0].id,
    acceptedTestFitId: null,
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'generate',
      entityType: 'testFitOption',
      ids: options.map((entry) => entry.id),
      inputSignature: options[0].inputSignature,
    },
    { operation: 'select', entityType: 'testFitOption', id: options[0].id },
  ]);
}

function selectTestFitOption(project, command) {
  const option = (project.building.testFitOptions || []).find((entry) => entry.id === command.optionId);
  if (!option)
    return commandError(
      project,
      command,
      'test-fit-option-not-found',
      `Test-fit option ${command.optionId} was not found.`,
    );
  const nextProject = updateBuilding(project, (building) => ({ ...building, selectedTestFitId: option.id }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'select', entityType: 'testFitOption', id: option.id },
  ]);
}

const TEST_FIT_GENERATED_COLLECTIONS = Object.freeze([
  'walls',
  'rooms',
  'slabs',
  'doors',
  'windows',
  'columns',
  'beams',
  'stairs',
  'landings',
  'fixtures',
]);

function hasAuthoredModelGeometry(project) {
  return (project.floors || []).some((floor) =>
    TEST_FIT_GENERATED_COLLECTIONS.some((collection) =>
      (floor[collection] || []).some((entry) => !entry.generatedByTestFitId),
    ),
  );
}

function edgeKey(start, end) {
  const first = `${Math.round(start.x)}:${Math.round(start.y)}`;
  const second = `${Math.round(end.x)}:${Math.round(end.y)}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function wallsForBlocks(option, plan) {
  const lineGroups = new Map();
  const fallbackEdges = new Map();
  for (const block of plan.blocks || []) {
    for (let index = 0; index < block.polygon.length; index += 1) {
      const start = block.polygon[index];
      const end = block.polygon[(index + 1) % block.polygon.length];
      const horizontal = Math.abs(start.y - end.y) <= 1;
      const vertical = Math.abs(start.x - end.x) <= 1;
      if (!horizontal && !vertical) {
        const key = edgeKey(start, end);
        if (!fallbackEdges.has(key)) fallbackEdges.set(key, { start, end });
        continue;
      }
      const orientation = horizontal ? 'horizontal' : 'vertical';
      const coordinate = Math.round(horizontal ? (start.y + end.y) / 2 : (start.x + end.x) / 2);
      const from = Math.min(horizontal ? start.x : start.y, horizontal ? end.x : end.y);
      const to = Math.max(horizontal ? start.x : start.y, horizontal ? end.x : end.y);
      const key = `${orientation}:${coordinate}`;
      const group = lineGroups.get(key) || { orientation, coordinate, intervals: [] };
      group.intervals.push({ from, to });
      lineGroups.set(key, group);
    }
  }
  const edges = [...fallbackEdges.values()];
  for (const group of [...lineGroups.values()].sort(
    (a, b) => a.orientation.localeCompare(b.orientation) || a.coordinate - b.coordinate,
  )) {
    const breakpoints = [...new Set(group.intervals.flatMap((entry) => [entry.from, entry.to]))].sort((a, b) => a - b);
    for (let index = 1; index < breakpoints.length; index += 1) {
      const from = breakpoints[index - 1];
      const to = breakpoints[index];
      const midpoint = (from + to) / 2;
      if (!group.intervals.some((entry) => midpoint >= entry.from - 1 && midpoint <= entry.to + 1)) continue;
      edges.push(
        group.orientation === 'horizontal'
          ? { start: { x: from, y: group.coordinate }, end: { x: to, y: group.coordinate } }
          : { start: { x: group.coordinate, y: from }, end: { x: group.coordinate, y: to } },
      );
    }
  }
  return edges.map(({ start, end }, index) => ({
    ...createWall(start, end),
    id: `${option.id}_level_${plan.levelIndex + 1}_wall_${index + 1}`,
    generatedByTestFitId: option.id,
    confidence: DESIGN_CONFIDENCE.MODELED,
  }));
}

function acceptTestFitOption(project, command) {
  const option = (project.building.testFitOptions || []).find((entry) => entry.id === command.optionId);
  if (!option)
    return commandError(
      project,
      command,
      'test-fit-option-not-found',
      `Test-fit option ${command.optionId} was not found.`,
    );
  const currentSignature = testFitInputSignature(project);
  if (option.inputSignature !== currentSignature) {
    return commandError(
      project,
      command,
      'test-fit-option-outdated',
      'Regenerate this test fit after changing the site, program, parking, budget, or test-fit assumptions.',
    );
  }
  if ((option.findings || []).some((entry) => entry.severity === 'error')) {
    return commandError(
      project,
      command,
      'test-fit-option-has-errors',
      'Resolve test-fit geometry errors before accepting this option.',
      { ruleIds: option.findings.filter((entry) => entry.severity === 'error').map((entry) => entry.ruleId) },
    );
  }
  if (hasAuthoredModelGeometry(project)) {
    return commandError(
      project,
      command,
      'authored-geometry-protected',
      'Test-fit acceptance will not overwrite manually authored building geometry. Start from empty levels or keep the scheme as a comparison only.',
    );
  }
  const storeys = option.metrics?.storeys || option.floorPlans.length;
  const floorToFloorHeight = project.building.testFitProfile?.floorToFloorHeight || 3000;
  const floors = Array.from({ length: storeys }, (_, levelIndex) => {
    const existing = project.floors?.[levelIndex];
    const floor = existing || {
      ...createFloor(levelIndex === 0 ? 'Ground Floor' : `Level ${levelIndex + 1}`, levelIndex, {
        elevation: levelIndex * floorToFloorHeight,
        floorToFloorHeight,
      }),
      id: `${project.building.id}_test_fit_level_${levelIndex + 1}`,
    };
    const cleaned = Object.fromEntries(
      TEST_FIT_GENERATED_COLLECTIONS.map((collection) => [
        collection,
        (floor[collection] || []).filter((entry) => !entry.generatedByTestFitId),
      ]),
    );
    const plan = option.floorPlans.find((entry) => entry.levelIndex === levelIndex);
    const rooms = (plan?.blocks || []).map((block) => ({
      ...createRoom(block.name, block.polygon),
      id: `${block.id}_room`,
      useCategory: block.useCategory,
      spaceType:
        block.kind === 'unit'
          ? 'unit_block'
          : block.kind === 'corridor'
            ? 'shared_corridor'
            : block.kind === 'stair_core'
              ? 'stair_core'
              : 'service_core',
      unitInstanceId: block.kind === 'unit' ? `${block.id}_instance` : null,
      generatedByTestFitId: option.id,
      confidence: DESIGN_CONFIDENCE.MODELED,
    }));
    const slab = {
      ...createSlab(floor.id, option.footprint, undefined, floor.elevation),
      id: `${option.id}_level_${levelIndex + 1}_slab`,
      name: `${floor.name} test-fit slab`,
      generatedByTestFitId: option.id,
      confidence: DESIGN_CONFIDENCE.MODELED,
    };
    return {
      ...floor,
      ...cleaned,
      levelIndex,
      elevation: levelIndex * floorToFloorHeight,
      floorToFloorHeight,
      rooms,
      walls: wallsForBlocks(option, plan),
      slabs: [slab],
    };
  });
  const unitTypeById = new Map((project.building.unitTypes || []).map((entry) => [entry.id, entry]));
  const unitInstances = option.floorPlans.flatMap((plan, levelIndex) => {
    const floor = floors[levelIndex];
    return plan.blocks
      .filter((entry) => entry.kind === 'unit')
      .map((block) => {
        const unitType = unitTypeById.get(block.unitTypeId);
        const origin = block.polygon.reduce(
          (result, point) => ({ x: Math.min(result.x, point.x), y: Math.min(result.y, point.y) }),
          { x: Infinity, y: Infinity },
        );
        return {
          ...createUnitInstance({
            id: `${block.id}_instance`,
            name: block.name,
            typeId: block.unitTypeId,
            floorId: floor.id,
            roomIds: [`${block.id}_room`],
            sourceRevision: unitType?.revision || 1,
            placement: { origin, rotation: 0 },
            generatedEntityRefs: { rooms: [`${block.id}_room`] },
          }),
          generatedByTestFitId: option.id,
        };
      });
  });
  const grid = createStructuralGrid(option.name, {
    id: option.proposedGrid.id,
    origin: option.proposedGrid.origin,
    axes: [
      ...option.proposedGrid.xOffsets.map((offset, index) =>
        createGridAxis(String(index + 1), 'vertical', offset, { id: `${option.proposedGrid.id}_x_${index + 1}` }),
      ),
      ...option.proposedGrid.yOffsets.map((offset, index) =>
        createGridAxis(String.fromCharCode(65 + index), 'horizontal', offset, {
          id: `${option.proposedGrid.id}_y_${index + 1}`,
        }),
      ),
    ],
  });
  grid.generatedByTestFitId = option.id;
  grid.setup = { kind: 'test_fit', strategy: option.strategy };
  const wetBlock = option.floorPlans[0]?.blocks.find((entry) => entry.kind === 'wet_core');
  const wetBounds = wetBlock
    ? wetBlock.polygon.reduce(
        (bounds, point) => ({
          minX: Math.min(bounds.minX, point.x),
          minY: Math.min(bounds.minY, point.y),
          maxX: Math.max(bounds.maxX, point.x),
          maxY: Math.max(bounds.maxY, point.y),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      )
    : null;
  const shaftId = `${option.id}_wet_shaft`;
  const shaft = wetBounds
    ? {
        ...createPlumbingShaft({
          id: shaftId,
          name: 'Test-fit wet-service shaft',
          origin: { x: (wetBounds.minX + wetBounds.maxX) / 2, y: (wetBounds.minY + wetBounds.maxY) / 2 },
          width: wetBounds.maxX - wetBounds.minX,
          depth: wetBounds.maxY - wetBounds.minY,
          servedFloorIds: floors.map((entry) => entry.id),
          maxFixtureDistance: 3000,
        }),
        generatedByTestFitId: option.id,
      }
    : null;
  const nextProject = {
    ...project,
    floors,
    building: {
      ...project.building,
      levelIds: floors.map((entry) => entry.id),
      selectedTestFitId: option.id,
      acceptedTestFitId: option.id,
      unitInstances: [
        ...(project.building.unitInstances || []).filter((entry) => !entry.generatedByTestFitId),
        ...unitInstances,
      ],
      systems: {
        ...project.building.systems,
        plumbing: {
          ...project.building.systems.plumbing,
          shafts: [
            ...(project.building.systems.plumbing?.shafts || []).filter((entry) => !entry.generatedByTestFitId),
            ...(shaft ? [shaft] : []),
          ],
        },
        structural: {
          ...project.building.systems.structural,
          gridSystems: [
            ...(project.building.systems.structural?.gridSystems || []).filter((entry) => !entry.generatedByTestFitId),
            grid,
          ],
        },
      },
    },
  };
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'accept',
      entityType: 'testFitOption',
      id: option.id,
      warningRuleIds: option.findings.filter((entry) => entry.severity === 'warning').map((entry) => entry.ruleId),
    },
    {
      operation: 'materialize',
      entityType: 'testFitBuildingBasis',
      id: option.id,
      floorIds: floors.map((entry) => entry.id),
      unitInstanceIds: unitInstances.map((entry) => entry.id),
      gridId: grid.id,
      shaftId: shaft?.id || null,
    },
  ]);
}

function configureApartmentDesignProfile(project, command) {
  const currentProfile = createApartmentDesignProfile(project.building.apartmentDesignProfile);
  const positiveFields = [
    'bathroomWidth',
    'serviceBandDepth',
    'entryDoorWidth',
    'internalDoorWidth',
    'exteriorWindowWidth',
    'minimumSharedBoundary',
    'accessibleEntryDoorWidth',
    'accessibleCirculationWidth',
    'stairWidth',
    'targetRiserHeight',
    'treadDepth',
    'minimumHeadroom',
    'maximumEgressTravelDistance',
  ];
  const values = {
    ...command,
    accessibleEntryDoorWidth: command.accessibleEntryDoorWidth ?? currentProfile.accessibleEntryDoorWidth,
    accessibleCirculationWidth: command.accessibleCirculationWidth ?? currentProfile.accessibleCirculationWidth,
  };
  const invalid = positiveFields.find((field) => !Number.isFinite(values[field]) || values[field] <= 0);
  if (invalid) {
    return commandError(
      project,
      command,
      'invalid-apartment-design-profile',
      `${invalid} must be a positive finite planning value.`,
      { field: invalid, value: values[invalid] },
    );
  }
  if (
    !Number.isFinite(command.minimumDaylightGlazingRatio) ||
    command.minimumDaylightGlazingRatio <= 0 ||
    command.minimumDaylightGlazingRatio > 1
  ) {
    return commandError(
      project,
      command,
      'invalid-daylight-glazing-ratio',
      'Minimum daylight glazing ratio must be greater than zero and no more than one.',
    );
  }
  const fixtureClearances = command.fixtureClearances || {};
  if (Object.values(fixtureClearances).some((value) => !Number.isFinite(value) || value < 0)) {
    return commandError(
      project,
      command,
      'invalid-fixture-clearance',
      'Furniture and fixture clearances must be finite non-negative millimetre values.',
    );
  }
  const orientations = command.solarExposureWatchOrientations ?? currentProfile.solarExposureWatchOrientations;
  if (
    !Array.isArray(orientations) ||
    orientations.some((entry) => !['north', 'east', 'south', 'west'].includes(entry))
  ) {
    return commandError(
      project,
      command,
      'invalid-solar-review-orientations',
      'Solar review orientations must be an array containing only north, east, south, or west.',
    );
  }
  const profile = createApartmentDesignProfile({
    ...project.building.apartmentDesignProfile,
    ...Object.fromEntries(positiveFields.map((field) => [field, values[field]])),
    minimumDaylightGlazingRatio: command.minimumDaylightGlazingRatio,
    fixtureClearances: { ...project.building.apartmentDesignProfile?.fixtureClearances, ...fixtureClearances },
    solarExposureWatchOrientations: orientations,
  });
  return commandSuccess(
    project,
    updateBuilding(project, (building) => ({ ...building, apartmentDesignProfile: profile })),
    command,
    [{ operation: 'configure', entityType: 'apartmentDesignProfile', id: profile.id }],
  );
}

function detailAcceptedTestFit(project, command) {
  const accepted = (project.building.testFitOptions || []).find(
    (entry) => entry.id === project.building.acceptedTestFitId,
  );
  if (!accepted) {
    return commandError(
      project,
      command,
      'accepted-test-fit-required',
      'Accept a current feasible test fit before detailing apartments.',
    );
  }
  if (accepted.inputSignature !== testFitInputSignature(project)) {
    return commandError(
      project,
      command,
      'accepted-test-fit-outdated',
      'Regenerate and accept the test fit after changing its site, program, parking, budget, or profile inputs.',
    );
  }
  const result = materializeAcceptedApartmentDesign(project, command.profile || {});
  if (!result.ok) return commandError(project, command, result.code, result.message);
  return commandSuccess(project, result.project, command, [
    {
      operation: 'materialize',
      entityType: 'apartmentDesignBasis',
      id: result.state.sourceTestFitId,
      unitInstanceIds: result.state.detailedUnitInstanceIds,
      generatedEntityRefs: result.refs,
      professionalReviewRequired: true,
    },
  ]);
}

function siteEntityId(project) {
  return project.building.site?.boundaryId || `${project.building.id}_site`;
}

const BRIEF_FIELDS = new Set([
  'projectType',
  'targetStoreys',
  'targetUnitCount',
  'targetBudget',
  'currency',
  'parkingRequirement',
  'preferredStructuralSystem',
  'targetRentalIncome',
  'accessibilityRequirements',
  'roofType',
]);

function updateProjectBrief(project, command) {
  if (!command.updates || typeof command.updates !== 'object') {
    return commandError(project, command, 'brief-updates-required', 'Project brief updates are required.');
  }
  const invalidFields = Object.keys(command.updates).filter((field) => !BRIEF_FIELDS.has(field));
  if (invalidFields.length) {
    return commandError(project, command, 'unsupported-brief-field', 'Project brief contains unsupported fields.', {
      invalidFields,
    });
  }
  for (const field of ['targetStoreys', 'targetUnitCount', 'parkingRequirement']) {
    const value = command.updates[field];
    if (value != null && (!Number.isInteger(value) || value < 0)) {
      return commandError(project, command, 'invalid-brief-count', `${field} must be a non-negative integer.`, {
        field,
        value,
      });
    }
  }
  for (const field of ['targetBudget', 'targetRentalIncome']) {
    const value = command.updates[field];
    if (value != null && !Number.isFinite(value)) {
      return commandError(project, command, 'invalid-brief-amount', `${field} must be a finite number.`, {
        field,
        value,
      });
    }
  }

  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    brief: { ...building.brief, ...command.updates },
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'update', entityType: 'projectBrief', id: project.building.id, fields: Object.keys(command.updates) },
  ]);
}

function validTargetArea(targetArea) {
  if (!targetArea) return true;
  const values = [targetArea.min, targetArea.preferred, targetArea.max].filter((value) => value != null);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return false;
  if (targetArea.min != null && targetArea.max != null && targetArea.min > targetArea.max) return false;
  if (targetArea.preferred != null && targetArea.min != null && targetArea.preferred < targetArea.min) return false;
  if (targetArea.preferred != null && targetArea.max != null && targetArea.preferred > targetArea.max) return false;
  return true;
}

function validSpaceRequirements(requirements) {
  if (!Array.isArray(requirements)) return false;
  const ids = new Set();
  return requirements.every((requirement) => {
    if (!requirement.id || ids.has(requirement.id) || !requirement.spaceType) return false;
    ids.add(requirement.id);
    if (!Number.isInteger(requirement.minCount ?? 1) || (requirement.minCount ?? 1) < 0) return false;
    if (requirement.maxCount != null && (!Number.isInteger(requirement.maxCount) || requirement.maxCount < 0))
      return false;
    if (requirement.maxCount != null && requirement.maxCount < (requirement.minCount ?? 1)) return false;
    return validTargetArea(requirement.targetArea);
  });
}

function createApartmentUnitType(project, command) {
  const input = command.unitType;
  if (!input?.id) return commandError(project, command, 'unit-type-id-required', 'A stable unit type ID is required.');
  if ((project.building.unitTypes || []).some((type) => type.id === input.id)) {
    return commandError(project, command, 'unit-type-id-conflict', `Unit type ${input.id} already exists.`);
  }
  if (!validTargetArea(input.targetArea) || !validSpaceRequirements(input.spaceRequirements || [])) {
    return commandError(
      project,
      command,
      'invalid-unit-type-program',
      'Unit target areas and space requirements must be internally consistent.',
    );
  }
  const unitType = createUnitType(input);
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    unitTypes: [...(building.unitTypes || []), unitType],
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'create', entityType: 'unitType', id: unitType.id },
  ]);
}

function updateApartmentUnitType(project, command) {
  const existing = (project.building.unitTypes || []).find((type) => type.id === command.unitTypeId);
  if (!existing) {
    return commandError(project, command, 'unit-type-not-found', `Unit type ${command.unitTypeId} was not found.`);
  }
  const allowed = new Set(['name', 'category', 'targetArea', 'spaceRequirements']);
  const invalidFields = Object.keys(command.updates || {}).filter((field) => !allowed.has(field));
  if (invalidFields.length) {
    return commandError(
      project,
      command,
      'unsupported-unit-type-field',
      'Unit type update contains unsupported fields.',
      {
        invalidFields,
      },
    );
  }
  const targetArea = command.updates?.targetArea ?? existing.targetArea;
  const requirements = command.updates?.spaceRequirements ?? existing.spaceRequirements;
  if (!validTargetArea(targetArea) || !validSpaceRequirements(requirements)) {
    return commandError(
      project,
      command,
      'invalid-unit-type-program',
      'Updated unit program is internally inconsistent.',
    );
  }
  const updated = createUnitType({ ...existing, ...command.updates, revision: existing.revision + 1 });
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    unitTypes: building.unitTypes.map((type) => (type.id === existing.id ? updated : type)),
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'update', entityType: 'unitType', id: existing.id, revision: updated.revision },
  ]);
}

function defineSpaceProgram(project, command) {
  const unitTargets = command.unitTargets || [];
  const seen = new Set();
  for (const target of unitTargets) {
    if (
      !target.unitTypeId ||
      seen.has(target.unitTypeId) ||
      !Number.isInteger(target.count) ||
      target.count < 0 ||
      !(project.building.unitTypes || []).some((type) => type.id === target.unitTypeId)
    ) {
      return commandError(
        project,
        command,
        'invalid-unit-target',
        'Unit targets require unique existing unit types and non-negative integer counts.',
        { target },
      );
    }
    seen.add(target.unitTypeId);
  }
  if (
    command.parkingRequirement != null &&
    (!Number.isInteger(command.parkingRequirement) || command.parkingRequirement < 0)
  ) {
    return commandError(
      project,
      command,
      'invalid-parking-target',
      'Parking requirement must be a non-negative integer.',
    );
  }
  const spaceProgram = createSpaceProgram({
    configured: true,
    unitTargets,
    sharedSpaceTargets: command.sharedSpaceTargets || [],
    parkingRequirement: command.parkingRequirement,
  });
  const nextProject = updateBuilding(project, (building) => ({ ...building, spaceProgram }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'replace', entityType: 'spaceProgram', id: project.building.id },
  ]);
}

function configureTypicalUnitProgram(project, command) {
  const input = command.unitType;
  if (!input?.id) return commandError(project, command, 'unit-type-id-required', 'A stable unit type ID is required.');
  if (!validTargetArea(input.targetArea) || !validSpaceRequirements(input.spaceRequirements || [])) {
    return commandError(
      project,
      command,
      'invalid-unit-type-program',
      'Unit target areas and space requirements must be internally consistent.',
    );
  }
  if (!Number.isInteger(command.targetCount) || command.targetCount < 1) {
    return commandError(
      project,
      command,
      'invalid-unit-target',
      'Typical unit target count must be a positive integer.',
    );
  }
  if (
    command.parkingRequirement != null &&
    (!Number.isInteger(command.parkingRequirement) || command.parkingRequirement < 0)
  ) {
    return commandError(
      project,
      command,
      'invalid-parking-target',
      'Parking requirement must be a non-negative integer.',
    );
  }
  const existing = (project.building.unitTypes || []).find((type) => type.id === input.id);
  const proposed = {
    ...existing,
    ...input,
    revision: existing?.revision ?? 1,
  };
  const definitionChanged =
    existing &&
    JSON.stringify({
      name: existing.name,
      category: existing.category,
      targetArea: existing.targetArea,
      spaceRequirements: existing.spaceRequirements,
    }) !==
      JSON.stringify({
        name: proposed.name,
        category: proposed.category,
        targetArea: proposed.targetArea,
        spaceRequirements: proposed.spaceRequirements,
      });
  const unitType = createUnitType({
    ...proposed,
    revision: existing ? existing.revision + (definitionChanged ? 1 : 0) : 1,
  });
  const spaceProgram = createSpaceProgram({
    ...project.building.spaceProgram,
    configured: true,
    unitTargets: [{ unitTypeId: unitType.id, count: command.targetCount }],
    parkingRequirement: command.parkingRequirement ?? project.building.spaceProgram?.parkingRequirement,
  });
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    brief: { ...building.brief, targetUnitCount: command.targetCount },
    unitTypes: existing
      ? building.unitTypes.map((type) => (type.id === unitType.id ? unitType : type))
      : [...(building.unitTypes || []), unitType],
    spaceProgram,
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: existing ? 'update' : 'create',
      entityType: 'unitType',
      id: unitType.id,
      revision: unitType.revision,
      definitionChanged: Boolean(definitionChanged),
    },
    { operation: 'replace', entityType: 'spaceProgram', id: project.building.id },
  ]);
}

function generateUnitInstances(project, command) {
  const type = (project.building.unitTypes || []).find((entry) => entry.id === command.typeId);
  if (!type) return commandError(project, command, 'unit-type-not-found', `Unit type ${command.typeId} was not found.`);
  if (!Number.isInteger(command.count) || command.count < 1) {
    return commandError(project, command, 'invalid-unit-instance-count', 'Instance count must be a positive integer.');
  }
  const floorIds = [...new Set(command.floorIds || [])];
  if (!floorIds.length || floorIds.some((floorId) => !findFloor(project, floorId))) {
    return commandError(
      project,
      command,
      'invalid-unit-instance-floors',
      'Instance generation requires one or more existing floor IDs.',
      { floorIds },
    );
  }
  const allExisting = (project.building.unitInstances || []).filter((instance) => instance.typeId === type.id);
  const existing = allExisting.filter((instance) => !instance.detached);
  const created = [];
  const countByFloor = new Map();
  for (const instance of allExisting) {
    countByFloor.set(instance.floorId, (countByFloor.get(instance.floorId) || 0) + 1);
  }
  for (let index = existing.length; index < command.count; index += 1) {
    const floorId = floorIds[index % floorIds.length];
    const ordinal = (countByFloor.get(floorId) || 0) + 1;
    countByFloor.set(floorId, ordinal);
    const instance = createUnitInstance({
      id: `${type.id}_${floorId}_unit_${ordinal}`,
      name: `${type.name} ${index + 1}`,
      typeId: type.id,
      floorId,
      sourceRevision: type.revision,
    });
    if ((project.building.unitInstances || []).some((entry) => entry.id === instance.id)) {
      return commandError(
        project,
        command,
        'unit-instance-id-conflict',
        `Generated unit instance ID ${instance.id} already exists.`,
      );
    }
    created.push(instance);
  }
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    unitInstances: [...(building.unitInstances || []), ...created],
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'generate',
      entityType: 'unitInstance',
      typeId: type.id,
      requestedCount: command.count,
      createdInstanceIds: created.map((instance) => instance.id),
      floorIds,
    },
  ]);
}

function createApartmentUnitInstance(project, command) {
  if (!command.instanceId) {
    return commandError(project, command, 'unit-instance-id-required', 'A stable unit instance ID is required.');
  }
  if ((project.building.unitInstances || []).some((instance) => instance.id === command.instanceId)) {
    return commandError(
      project,
      command,
      'unit-instance-id-conflict',
      `Unit instance ${command.instanceId} already exists.`,
    );
  }
  const type = (project.building.unitTypes || []).find((entry) => entry.id === command.typeId);
  if (!type) return commandError(project, command, 'unit-type-not-found', `Unit type ${command.typeId} was not found.`);
  if (!findFloor(project, command.floorId)) {
    return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  }
  if (command.placement && !validUnitPlacement(command.placement)) {
    return commandError(
      project,
      command,
      'unit-placement-invalid',
      'Unit placement requires finite X, Y, and rotation values.',
    );
  }
  const instance = createUnitInstance({
    id: command.instanceId,
    name: command.name,
    typeId: type.id,
    floorId: command.floorId,
    sourceRevision: type.revision,
    placement: command.placement,
  });
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    unitInstances: [...(building.unitInstances || []), instance],
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'create', entityType: 'unitInstance', id: instance.id, floorId: instance.floorId },
    { operation: 'relate', entityType: 'unitInstance', id: instance.id, relation: 'unitType', targetId: type.id },
  ]);
}

function validUnitPlacement(placement) {
  return Boolean(
    placement?.origin &&
    Number.isFinite(placement.origin.x) &&
    Number.isFinite(placement.origin.y) &&
    Number.isFinite(Number(placement.rotation || 0)),
  );
}

function setUnitInstancePlacement(project, command) {
  const instance = (project.building.unitInstances || []).find((entry) => entry.id === command.instanceId);
  if (!instance) {
    return commandError(
      project,
      command,
      'unit-instance-not-found',
      `Unit instance ${command.instanceId} was not found.`,
    );
  }
  if (!validUnitPlacement(command.placement)) {
    return commandError(
      project,
      command,
      'unit-placement-invalid',
      'Unit placement requires finite X, Y, and rotation values.',
    );
  }
  const placement = {
    origin: { x: command.placement.origin.x, y: command.placement.origin.y },
    rotation: Number(command.placement.rotation || 0),
  };
  const type = (project.building.unitTypes || []).find((entry) => entry.id === instance.typeId);
  const placementChanged =
    instance.placement?.origin?.x !== placement.origin.x ||
    instance.placement?.origin?.y !== placement.origin.y ||
    Number(instance.placement?.rotation || 0) !== placement.rotation;
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    unitInstances: building.unitInstances.map((entry) =>
      entry.id === instance.id
        ? {
            ...entry,
            placement,
            sourceRevision:
              placementChanged && type?.geometryTemplate ? Math.max(0, type.revision - 1) : entry.sourceRevision,
          }
        : entry,
    ),
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'place', entityType: 'unitInstance', id: instance.id, floorId: instance.floorId, placement },
  ]);
}

function captureApartmentUnitTypeGeometry(project, command) {
  const source = (project.building.unitInstances || []).find((entry) => entry.id === command.sourceInstanceId);
  if (!source) {
    return commandError(
      project,
      command,
      'unit-instance-not-found',
      `Unit instance ${command.sourceInstanceId} was not found.`,
    );
  }
  if (source.detached) {
    return commandError(
      project,
      command,
      'unit-instance-detached',
      'A detached instance cannot define linked type geometry.',
    );
  }
  const type = (project.building.unitTypes || []).find((entry) => entry.id === source.typeId);
  if (!type) return commandError(project, command, 'unit-type-not-found', `Unit type ${source.typeId} was not found.`);
  const captured = captureUnitGeometry(project, source, {
    entityIds: command.entityIds,
    placement: command.placement,
    wallBoundaryTolerance: command.wallBoundaryTolerance,
  });
  if (!captured.ok) return commandError(project, command, captured.code, captured.message);

  const revision = type.revision + 1;
  const geometryTemplate = { ...captured.geometry, revision };
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    unitTypes: building.unitTypes.map((entry) =>
      entry.id === type.id ? createUnitType({ ...entry, revision, geometryTemplate }) : entry,
    ),
    unitInstances: building.unitInstances.map((entry) =>
      entry.id === source.id
        ? {
            ...entry,
            placement: captured.placement,
            sourceRevision: revision,
            generatedEntityRefs: captured.entityIds,
          }
        : entry,
    ),
  }));
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'capture_geometry',
      entityType: 'unitType',
      id: type.id,
      sourceInstanceId: source.id,
      revision,
      entityCounts: Object.fromEntries(
        UNIT_GEOMETRY_COLLECTIONS.map((collection) => [collection, geometryTemplate[collection]?.length || 0]),
      ),
    },
  ]);
}

function propagateApartmentUnitTypeGeometry(project, command) {
  const type = (project.building.unitTypes || []).find((entry) => entry.id === command.unitTypeId);
  if (!type)
    return commandError(project, command, 'unit-type-not-found', `Unit type ${command.unitTypeId} was not found.`);
  if (!type.geometryTemplate?.rooms?.length) {
    return commandError(
      project,
      command,
      'unit-geometry-template-missing',
      'Capture a mapped source unit before propagating its geometry.',
    );
  }
  const requestedIds = command.targetInstanceIds ? new Set(command.targetInstanceIds) : null;
  const targets = (project.building.unitInstances || []).filter(
    (instance) =>
      instance.typeId === type.id &&
      !instance.detached &&
      instance.id !== type.geometryTemplate.capturedFromInstanceId &&
      (!requestedIds || requestedIds.has(instance.id)),
  );
  if (requestedIds && targets.length !== requestedIds.size) {
    return commandError(
      project,
      command,
      'unit-propagation-target-invalid',
      'Every propagation target must be an attached instance of the selected unit type.',
      { requestedTargetIds: [...requestedIds], resolvedTargetIds: targets.map((entry) => entry.id) },
    );
  }
  if (!targets.length) {
    return commandError(
      project,
      command,
      'unit-propagation-target-missing',
      'No linked target instances are available.',
    );
  }
  const invalidPlacement = targets.find((instance) => !validUnitPlacement(instance.placement));
  if (invalidPlacement) {
    return commandError(
      project,
      command,
      'unit-placement-missing',
      `Set the placement for ${invalidPlacement.name || invalidPlacement.id} before propagation.`,
      { instanceId: invalidPlacement.id },
    );
  }
  const unsafeMapped = targets.find(
    (instance) =>
      (instance.roomIds || []).length > 0 &&
      !(project.floors || [])
        .find((floor) => floor.id === instance.floorId)
        ?.rooms?.filter((room) => instance.roomIds.includes(room.id))
        .every((room) => room.unitTemplateGenerated),
  );
  if (unsafeMapped) {
    return commandError(
      project,
      command,
      'unit-manual-geometry-replacement-required',
      'Propagation will not overwrite manually mapped target rooms. Detach the special unit or clear its mapping first.',
      { instanceId: unsafeMapped.id },
    );
  }

  const targetByFloor = new Map();
  for (const instance of targets) {
    const entries = targetByFloor.get(instance.floorId) || [];
    entries.push(instance);
    targetByFloor.set(instance.floorId, entries);
  }
  const refsByInstance = new Map();
  const floors = project.floors.map((floor) => {
    let nextFloor = floor;
    for (const instance of targetByFloor.get(floor.id) || []) {
      const materialized = materializeUnitGeometry(type.geometryTemplate, instance);
      nextFloor = replaceGeneratedUnitEntities(nextFloor, instance, materialized);
      refsByInstance.set(
        instance.id,
        Object.fromEntries(
          UNIT_GEOMETRY_COLLECTIONS.map((collection) => [
            collection,
            materialized[collection].map((entity) => entity.id),
          ]),
        ),
      );
    }
    return nextFloor;
  });
  const nextProject = {
    ...project,
    floors,
    building: {
      ...project.building,
      unitInstances: project.building.unitInstances.map((instance) =>
        refsByInstance.has(instance.id)
          ? { ...instance, sourceRevision: type.revision, generatedEntityRefs: refsByInstance.get(instance.id) }
          : instance,
      ),
    },
  };
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'propagate_geometry',
      entityType: 'unitType',
      id: type.id,
      revision: type.revision,
      targetInstanceIds: targets.map((instance) => instance.id),
      generatedEntityCounts: Object.fromEntries(
        UNIT_GEOMETRY_COLLECTIONS.map((collection) => [
          collection,
          (type.geometryTemplate[collection]?.length || 0) * targets.length,
        ]),
      ),
    },
  ]);
}

function assignRoomToUnit(project, command) {
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const room = (floor.rooms || []).find((entry) => entry.id === command.roomId);
  if (!room) return commandError(project, command, 'room-not-found', `Room ${command.roomId} was not found.`);
  const instance = (project.building.unitInstances || []).find((entry) => entry.id === command.instanceId);
  if (!instance) {
    return commandError(
      project,
      command,
      'unit-instance-not-found',
      `Unit instance ${command.instanceId} was not found.`,
    );
  }
  if (instance.floorId !== floor.id) {
    return commandError(
      project,
      command,
      'unit-room-level-mismatch',
      'Room and unit instance must be on the same floor.',
    );
  }
  if (room.unitInstanceId && room.unitInstanceId !== instance.id && !command.reassign) {
    return commandError(
      project,
      command,
      'room-already-assigned',
      'Room already belongs to another unit; explicit reassign permission is required.',
      { existingUnitInstanceId: room.unitInstanceId },
    );
  }
  if (!command.spaceType) {
    return commandError(project, command, 'space-type-required', 'Assigned unit rooms require a spaceType.');
  }
  const type = (project.building.unitTypes || []).find((entry) => entry.id === instance.typeId);
  const requirement = command.spaceRequirementId
    ? type?.spaceRequirements?.find((entry) => entry.id === command.spaceRequirementId)
    : type?.spaceRequirements?.find((entry) => entry.spaceType === command.spaceType);
  if (command.spaceRequirementId && !requirement) {
    return commandError(
      project,
      command,
      'space-requirement-not-found',
      `Space requirement ${command.spaceRequirementId} was not found on the unit type.`,
    );
  }
  const nextProject = {
    ...project,
    floors: project.floors.map((entry) =>
      entry.id === floor.id
        ? {
            ...entry,
            rooms: entry.rooms.map((candidate) =>
              candidate.id === room.id
                ? {
                    ...candidate,
                    unitInstanceId: instance.id,
                    spaceType: command.spaceType,
                    spaceRequirementId: requirement?.id || null,
                    useCategory: command.useCategory || 'rentable',
                  }
                : candidate,
            ),
          }
        : entry,
    ),
  };
  return commandSuccess(project, nextProject, command, [
    { operation: 'relate', entityType: 'room', id: room.id, relation: 'unitInstance', targetId: instance.id },
  ]);
}

function unassignRoomFromUnit(project, command) {
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const room = (floor.rooms || []).find((entry) => entry.id === command.roomId);
  if (!room) return commandError(project, command, 'room-not-found', `Room ${command.roomId} was not found.`);
  const nextProject = {
    ...project,
    floors: project.floors.map((entry) =>
      entry.id === floor.id
        ? {
            ...entry,
            rooms: entry.rooms.map((candidate) =>
              candidate.id === room.id
                ? {
                    ...candidate,
                    unitInstanceId: null,
                    spaceRequirementId: null,
                    useCategory: command.keepClassification ? candidate.useCategory : null,
                  }
                : candidate,
            ),
          }
        : entry,
    ),
  };
  return commandSuccess(project, nextProject, command, [
    { operation: 'unrelate', entityType: 'room', id: room.id, relation: 'unitInstance' },
  ]);
}

function detachUnitInstance(project, command) {
  const instance = (project.building.unitInstances || []).find((entry) => entry.id === command.instanceId);
  if (!instance) {
    return commandError(
      project,
      command,
      'unit-instance-not-found',
      `Unit instance ${command.instanceId} was not found.`,
    );
  }
  const nextProject = updateBuilding(project, (building) => ({
    ...building,
    unitInstances: building.unitInstances.map((entry) =>
      entry.id === instance.id ? { ...entry, detached: true } : entry,
    ),
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'detach', entityType: 'unitInstance', id: instance.id, relation: 'unitTypePropagation' },
  ]);
}

function classifyRoom(project, command) {
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const room = (floor.rooms || []).find((entry) => entry.id === command.roomId);
  if (!room) return commandError(project, command, 'room-not-found', `Room ${command.roomId} was not found.`);
  const allowedCategories = new Set(Object.values(ROOM_USE_CATEGORIES));
  if (!allowedCategories.has(command.useCategory)) {
    return commandError(project, command, 'invalid-room-use-category', 'Room use category is not supported.', {
      useCategory: command.useCategory,
    });
  }
  if (room.unitInstanceId && command.useCategory !== ROOM_USE_CATEGORIES.RENTABLE && !command.detachFromUnit) {
    return commandError(
      project,
      command,
      'unit-room-detach-required',
      'A room must be explicitly detached from its unit before being classified as non-rentable.',
      { unitInstanceId: room.unitInstanceId },
    );
  }

  const detach = Boolean(command.detachFromUnit && command.useCategory !== ROOM_USE_CATEGORIES.RENTABLE);
  const nextProject = {
    ...project,
    floors: project.floors.map((entry) =>
      entry.id === floor.id
        ? {
            ...entry,
            rooms: entry.rooms.map((candidate) =>
              candidate.id === room.id
                ? {
                    ...candidate,
                    useCategory: command.useCategory,
                    spaceType: command.spaceType ?? candidate.spaceType,
                    unitInstanceId: detach ? null : candidate.unitInstanceId,
                    spaceRequirementId: detach ? null : candidate.spaceRequirementId,
                  }
                : candidate,
            ),
          }
        : entry,
    ),
  };
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'classify',
      entityType: 'room',
      id: room.id,
      useCategory: command.useCategory,
      detachedFromUnit: detach,
    },
  ]);
}

function generateStructuralGrid(project, command) {
  if (!command.gridId) {
    return commandError(project, command, 'grid-id-required', 'A stable gridId is required.');
  }
  if (!validOffsets(command.xOffsets) || !validOffsets(command.yOffsets)) {
    return commandError(
      project,
      command,
      'invalid-grid-offsets',
      'Structural grids require at least one finite X and Y offset.',
    );
  }
  if (command.origin && !validPoint(command.origin)) {
    return commandError(
      project,
      command,
      'invalid-grid-origin',
      'Structural grid origin must contain finite X and Y values.',
    );
  }
  if (command.rotation != null && !Number.isFinite(command.rotation)) {
    return commandError(project, command, 'invalid-grid-rotation', 'Structural grid rotation must be a finite number.');
  }
  const system = structuralSystem(project);
  if (!system) return commandError(project, command, 'structural-system-missing', 'Structural system is missing.');
  if ((system.gridSystems || []).some((grid) => grid.id === command.gridId)) {
    return commandError(project, command, 'grid-id-conflict', `Structural grid ${command.gridId} already exists.`);
  }

  const xOffsets = [...new Set(command.xOffsets)].sort((a, b) => a - b);
  const yOffsets = [...new Set(command.yOffsets)].sort((a, b) => a - b);
  const axes = [
    ...xOffsets.map((offset, index) =>
      createGridAxis(
        axisLabel(index, command.xLabels, (value) => String(value + 1)),
        'vertical',
        offset,
        {
          id: `${command.gridId}_x_${index + 1}`,
        },
      ),
    ),
    ...yOffsets.map((offset, index) =>
      createGridAxis(
        axisLabel(index, command.yLabels, (value) => String.fromCharCode(65 + value)),
        'horizontal',
        offset,
        {
          id: `${command.gridId}_y_${index + 1}`,
        },
      ),
    ),
  ];
  const grid = createStructuralGrid(command.name || 'Primary Grid', {
    id: command.gridId,
    origin: command.origin || { x: 0, y: 0 },
    rotation: command.rotation || 0,
    axes,
  });
  const nextProject = updateStructuralSystem(project, (current) => ({
    ...current,
    gridSystems: [...(current.gridSystems || []), grid],
  }));

  return commandSuccess(project, nextProject, command, [
    { operation: 'create', entityType: 'structuralGrid', id: grid.id },
  ]);
}

function configureRegularStructuralGrid(project, command) {
  const system = structuralSystem(project);
  if (!system) return commandError(project, command, 'structural-system-missing', 'Structural system is missing.');
  if (!command.gridId) {
    return commandError(project, command, 'grid-id-required', 'A stable gridId is required.');
  }
  const xAxisCount = command.xAxisCount;
  const yAxisCount = command.yAxisCount;
  const xSpacing = command.xSpacing;
  const ySpacing = command.ySpacing;
  const origin = command.origin || { x: 0, y: 0 };
  const rotation = command.rotation ?? 0;
  if (!Number.isInteger(xAxisCount) || xAxisCount < 2 || !Number.isInteger(yAxisCount) || yAxisCount < 2) {
    return commandError(
      project,
      command,
      'invalid-grid-axis-count',
      'A regular structural grid requires at least two axes in each direction.',
      { xAxisCount, yAxisCount },
    );
  }
  if (!Number.isFinite(xSpacing) || xSpacing <= 0 || !Number.isFinite(ySpacing) || ySpacing <= 0) {
    return commandError(
      project,
      command,
      'invalid-grid-spacing',
      'Regular structural grid spacing must be positive finite millimetres.',
      { xSpacing, ySpacing },
    );
  }
  if (!validPoint(origin) || !Number.isFinite(rotation)) {
    return commandError(project, command, 'invalid-grid-transform', 'Grid origin and rotation must be finite.', {
      origin,
      rotation,
    });
  }

  const axes = [
    ...Array.from({ length: xAxisCount }, (_, index) =>
      createGridAxis(String(index + 1), 'vertical', index * xSpacing, {
        id: `${command.gridId}_x_${index + 1}`,
      }),
    ),
    ...Array.from({ length: yAxisCount }, (_, index) =>
      createGridAxis(String.fromCharCode(65 + index), 'horizontal', index * ySpacing, {
        id: `${command.gridId}_y_${index + 1}`,
      }),
    ),
  ];
  const grid = {
    ...createStructuralGrid(command.name || 'Primary Grid', {
      id: command.gridId,
      origin,
      rotation,
      axes,
    }),
    setup: { kind: 'regular', xAxisCount, yAxisCount, xSpacing, ySpacing },
  };
  const existing = (system.gridSystems || []).some((entry) => entry.id === grid.id);
  const gridSystems = existing
    ? system.gridSystems.map((entry) => (entry.id === grid.id ? grid : entry))
    : [...(system.gridSystems || []), grid];
  const columnStacks = (system.columnStacks || []).map((stack) => {
    if (stack.gridIntersection?.gridId !== grid.id) return stack;
    const nextOrigin = resolveGridIntersection(gridSystems, stack.gridIntersection);
    return nextOrigin ? { ...stack, origin: nextOrigin } : stack;
  });
  const nextProject = updateStructuralSystem(project, (current) => ({
    ...current,
    gridSystems,
    columnStacks,
  }));
  return commandSuccess(project, nextProject, command, [
    { operation: existing ? 'replace' : 'create', entityType: 'structuralGrid', id: grid.id },
    {
      operation: 'recompute',
      entityType: 'columnStackOrigins',
      gridId: grid.id,
      movedColumnGeometry: false,
    },
  ]);
}

function populateGridColumnStacks(project, command) {
  const system = structuralSystem(project);
  const grid = (system?.gridSystems || []).find((entry) => entry.id === command.gridId);
  if (!grid)
    return commandError(project, command, 'grid-not-found', `Structural grid ${command.gridId} was not found.`);
  const targetFloorIds = [...new Set(command.floorIds || [])];
  const targetFloors = targetFloorIds.map((floorId) => findFloor(project, floorId));
  if (!targetFloorIds.length || targetFloors.some((floor) => !floor)) {
    return commandError(
      project,
      command,
      'invalid-column-stack-floors',
      'Column-stack population requires one or more existing floor IDs.',
      { floorIds: targetFloorIds },
    );
  }
  const width = command.columnWidth;
  const depth = command.columnDepth;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
    return commandError(
      project,
      command,
      'invalid-column-section',
      'Modeled column width and depth must be positive finite millimetres.',
      { width, depth },
    );
  }
  const xAxes = (grid.axes || []).filter((axis) => axis.orientation === 'vertical');
  const yAxes = (grid.axes || []).filter((axis) => axis.orientation === 'horizontal');
  if (!xAxes.length || !yAxes.length) {
    return commandError(project, command, 'grid-axes-missing', 'Grid requires axes in both directions.');
  }

  const existingStacks = system.columnStacks || [];
  const stackByIntersection = new Map(
    existingStacks
      .filter((stack) => stack.gridIntersection?.gridId === grid.id)
      .map((stack) => [`${stack.gridIntersection.xAxisId}:${stack.gridIntersection.yAxisId}`, stack]),
  );
  const createdStacks = [];
  for (const xAxis of xAxes) {
    for (const yAxis of yAxes) {
      const key = `${xAxis.id}:${yAxis.id}`;
      if (stackByIntersection.has(key)) continue;
      const gridIntersection = { gridId: grid.id, xAxisId: xAxis.id, yAxisId: yAxis.id };
      const origin = resolveGridIntersection(system.gridSystems || [], gridIntersection);
      const stack = {
        ...createColumnStack(origin, {
          id: `${grid.id}_stack_${xAxis.id}_${yAxis.id}`,
          name: `${xAxis.label}${yAxis.label}`,
          gridIntersection,
        }),
        intent: 'planned',
      };
      stackByIntersection.set(key, stack);
      createdStacks.push(stack);
    }
  }
  const columnStacks = [...existingStacks, ...createdStacks];
  const activeGridStacks = [];
  for (const xAxis of xAxes) {
    for (const yAxis of yAxes) {
      activeGridStacks.push(stackByIntersection.get(`${xAxis.id}:${yAxis.id}`));
    }
  }
  const stackIds = new Set(activeGridStacks.map((stack) => stack.id));
  let createdColumnCount = 0;
  const floors = project.floors.map((floor) => {
    if (!targetFloorIds.includes(floor.id)) return floor;
    const columns = [...(floor.columns || [])];
    const occupiedStackIds = new Set(
      columns.map((column) => column.stackId).filter((stackId) => stackIds.has(stackId)),
    );
    for (const stack of activeGridStacks) {
      if (occupiedStackIds.has(stack.id)) continue;
      columns.push({
        id: `${stack.id}_${floor.id}_column`,
        x: stack.origin.x,
        y: stack.origin.y,
        width,
        depth,
        height: floor.floorToFloorHeight ?? 3000,
        rotation: grid.rotation || 0,
        type: 'rectangular',
        name: stack.name,
        showLabel: true,
        stackId: stack.id,
      });
      occupiedStackIds.add(stack.id);
      createdColumnCount += 1;
    }
    return { ...floor, columns };
  });
  const nextProject = {
    ...project,
    floors,
    building: {
      ...project.building,
      systems: {
        ...project.building.systems,
        structural: { ...system, columnStacks },
      },
    },
  };
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'populate',
      entityType: 'columnStack',
      gridId: grid.id,
      createdStackCount: createdStacks.length,
      createdColumnCount,
      floorIds: targetFloorIds,
      modeledSection: { width, depth },
      engineeringCapacityVerified: false,
    },
  ]);
}

function createPlannedColumnStack(project, command) {
  if (!command.stackId) {
    return commandError(project, command, 'stack-id-required', 'A stable stackId is required.');
  }
  const system = structuralSystem(project);
  if (!system) return commandError(project, command, 'structural-system-missing', 'Structural system is missing.');
  if ((system.columnStacks || []).some((stack) => stack.id === command.stackId)) {
    return commandError(project, command, 'stack-id-conflict', `Column stack ${command.stackId} already exists.`);
  }

  const gridOrigin = command.gridIntersection
    ? resolveGridIntersection(system.gridSystems || [], command.gridIntersection)
    : null;
  if (command.gridIntersection && !gridOrigin) {
    return commandError(
      project,
      command,
      'grid-intersection-not-found',
      'Column stack gridIntersection must reference one vertical and one horizontal axis on the same grid.',
      { gridIntersection: command.gridIntersection },
    );
  }
  const origin = gridOrigin || command.origin;
  if (!validPoint(origin)) {
    return commandError(
      project,
      command,
      'invalid-stack-origin',
      'Column stack origin must be provided directly or derived from a valid grid intersection.',
    );
  }

  const stack = {
    ...createColumnStack(origin, {
      id: command.stackId,
      name: command.name,
      familyId: command.familyId,
      gridIntersection: command.gridIntersection,
    }),
    intent: 'planned',
  };
  const nextProject = updateStructuralSystem(project, (current) => ({
    ...current,
    columnStacks: [...(current.columnStacks || []), stack],
  }));

  return commandSuccess(project, nextProject, command, [
    { operation: 'create', entityType: 'columnStack', id: stack.id },
  ]);
}

function assignColumnToStack(project, command) {
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const column = findColumn(floor, command.columnId);
  if (!column) return commandError(project, command, 'column-not-found', `Column ${command.columnId} was not found.`);
  const stack = (structuralSystem(project)?.columnStacks || []).find((entry) => entry.id === command.stackId);
  if (!stack)
    return commandError(project, command, 'stack-not-found', `Column stack ${command.stackId} was not found.`);
  const occupied = (floor.columns || []).find((entry) => entry.id !== column.id && entry.stackId === stack.id);
  if (occupied) {
    return commandError(
      project,
      command,
      'stack-level-occupied',
      'The column stack already contains a column on this level.',
      { existingColumnId: occupied.id },
    );
  }

  const nextProject = {
    ...project,
    floors: project.floors.map((entry) =>
      entry.id === floor.id
        ? {
            ...entry,
            columns: entry.columns.map((item) => (item.id === column.id ? { ...item, stackId: stack.id } : item)),
          }
        : entry,
    ),
  };
  return commandSuccess(project, nextProject, command, [
    { operation: 'relate', entityType: 'column', id: column.id, relation: 'columnStack', targetId: stack.id },
  ]);
}

function moveColumn(project, command) {
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const column = findColumn(floor, command.columnId);
  if (!column) return commandError(project, command, 'column-not-found', `Column ${command.columnId} was not found.`);
  if (!validPoint(command.to)) {
    return commandError(
      project,
      command,
      'invalid-column-position',
      'Column position must contain finite X and Y values.',
    );
  }

  const scope = command.scope || 'instance';
  if (scope !== 'instance' && scope !== 'stack') {
    return commandError(project, command, 'invalid-move-scope', 'MoveColumn scope must be instance or stack.');
  }

  const delta = { x: command.to.x - column.x, y: command.to.y - column.y };
  let nextFloors;
  let nextProject;
  const changes = [];

  if (scope === 'stack') {
    if (!column.stackId) {
      return commandError(project, command, 'column-stack-missing', 'The selected column does not belong to a stack.');
    }
    const stack = (structuralSystem(project)?.columnStacks || []).find((entry) => entry.id === column.stackId);
    if (!stack) {
      return commandError(project, command, 'stack-not-found', `Column stack ${column.stackId} was not found.`);
    }
    if (stack.gridIntersection && !command.detachFromGrid && (delta.x !== 0 || delta.y !== 0)) {
      return commandError(
        project,
        command,
        'grid-linked-stack-move',
        'A grid-linked column stack must be detached explicitly before moving away from its grid intersection.',
        { stackId: stack.id, gridIntersection: stack.gridIntersection },
      );
    }
    nextFloors = project.floors.map((entry) => {
      let nextFloor = entry;
      for (const stackColumn of entry.columns || []) {
        if (stackColumn.stackId !== stack.id) continue;
        nextFloor = applyColumnUpdate(nextFloor, {
          id: stackColumn.id,
          x: stackColumn.x + delta.x,
          y: stackColumn.y + delta.y,
        });
        changes.push({ operation: 'move', entityType: 'column', id: stackColumn.id, floorId: entry.id });
      }
      return nextFloor;
    });
    nextProject = updateStructuralSystem({ ...project, floors: nextFloors }, (current) => ({
      ...current,
      columnStacks: current.columnStacks.map((entry) =>
        entry.id === stack.id
          ? {
              ...entry,
              origin: { x: entry.origin.x + delta.x, y: entry.origin.y + delta.y },
              gridIntersection: command.detachFromGrid ? null : entry.gridIntersection,
            }
          : entry,
      ),
    }));
    changes.push({ operation: 'move', entityType: 'columnStack', id: stack.id });
    if (command.detachFromGrid && stack.gridIntersection) {
      changes.push({ operation: 'detach', entityType: 'columnStack', id: stack.id, relation: 'gridIntersection' });
    }
  } else {
    nextFloors = project.floors.map((entry) =>
      entry.id === floor.id ? applyColumnUpdate(entry, { id: column.id, x: command.to.x, y: command.to.y }) : entry,
    );
    nextProject = { ...project, floors: nextFloors };
    changes.push({ operation: 'move', entityType: 'column', id: column.id, floorId: floor.id });
  }

  return commandSuccess(project, nextProject, command, changes);
}

function createBeamBetweenSupports(project, command) {
  if (!command.beamId) {
    return commandError(project, command, 'beam-id-required', 'A stable beamId is required.');
  }
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const startColumn = findColumn(floor, command.startColumnId);
  const endColumn = findColumn(floor, command.endColumnId);
  if (!startColumn || !endColumn) {
    return commandError(
      project,
      command,
      'beam-support-not-found',
      'Both beam supports must reference columns on the selected level.',
      { startColumnId: command.startColumnId, endColumnId: command.endColumnId },
    );
  }
  if (startColumn.id === endColumn.id) {
    return commandError(project, command, 'beam-zero-span', 'Beam supports must be different columns.');
  }
  if ((floor.beams || []).some((beam) => beam.id === command.beamId)) {
    return commandError(project, command, 'beam-id-conflict', `Beam ${command.beamId} already exists.`);
  }
  const width = command.width ?? BEAM_WIDTH;
  const depth = command.depth ?? BEAM_DEPTH;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
    return commandError(project, command, 'invalid-beam-dimensions', 'Beam width and depth must be positive numbers.');
  }

  const floorElevation = getFloorElevation(floor);
  const floorTopElevation = getFloorTopElevation(floor);
  const floorLevel = command.floorLevel ?? floorElevation;
  if (!Number.isFinite(floorLevel) || floorLevel < floorElevation || floorLevel > floorTopElevation) {
    return commandError(
      project,
      command,
      'invalid-beam-floor-level',
      `Beam elevation must be between ${floorElevation} mm and ${floorTopElevation} mm for this floor.`,
      { floorLevel, floorElevation, floorTopElevation },
    );
  }
  const placementRole = Math.abs(floorLevel - floorTopElevation) < 1 ? 'roof_ring' : 'floor';

  const beam = {
    id: command.beamId,
    startRef: { kind: 'column', id: startColumn.id },
    endRef: { kind: 'column', id: endColumn.id },
    width,
    depth,
    floorLevel,
    placementRole,
    phaseId: command.phaseId ?? null,
    coordination: {
      condition: 'typical',
      maxPlanningSpan: command.maxPlanningSpan ?? null,
      transferReason: '',
      supportedElementRefs: [],
    },
  };
  const nextProject = {
    ...project,
    floors: project.floors.map((entry) =>
      entry.id === floor.id ? { ...entry, beams: [...(entry.beams || []), beam] } : entry,
    ),
  };
  return commandSuccess(project, nextProject, command, [
    { operation: 'create', entityType: 'beam', id: beam.id, floorId: floor.id },
    { operation: 'relate', entityType: 'beam', id: beam.id, relation: 'startSupport', targetId: startColumn.id },
    { operation: 'relate', entityType: 'beam', id: beam.id, relation: 'endSupport', targetId: endColumn.id },
  ]);
}

function configureStructuralCoordination(project, command) {
  const values = {
    maxBeamPlanningSpan: command.maxBeamPlanningSpan,
    maxSlabPlanningSpan: command.maxSlabPlanningSpan,
    maxCantileverPlanningLength: command.maxCantileverPlanningLength,
    minOpeningClearanceFromColumn: command.minOpeningClearanceFromColumn,
  };
  const invalid = Object.entries(values).find(([, value]) => !Number.isFinite(value) || value <= 0);
  if (invalid) {
    return commandError(
      project,
      command,
      'invalid-structural-coordination-profile',
      `${invalid[0]} must be a positive millimetre value.`,
      { field: invalid[0], value: invalid[1] },
    );
  }
  const coordinationProfile = {
    id: command.profileId || DEFAULT_STRUCTURAL_COORDINATION_PROFILE.id,
    source: 'user_configured_early_planning_assumption_not_structural_design',
    ...values,
  };
  const nextProject = updateStructuralSystem(project, (structural) => ({ ...structural, coordinationProfile }));
  return commandSuccess(project, nextProject, command, [
    { operation: 'configure', entityType: 'structuralCoordinationProfile', id: coordinationProfile.id, values },
  ]);
}

function configureStructuralRealizationProfile(project, command) {
  const values = {
    columnWidth: command.columnWidth,
    columnDepth: command.columnDepth,
    beamWidth: command.beamWidth,
    beamDepth: command.beamDepth,
  };
  const invalid = Object.entries(values).find(([, value]) => !Number.isFinite(value) || value <= 0);
  if (invalid) {
    return commandError(
      project,
      command,
      'invalid-structural-realization-profile',
      `${invalid[0]} must be a positive finite modeled dimension.`,
      { field: invalid[0], value: invalid[1] },
    );
  }
  const profile = createStructuralRealizationProfile({
    ...structuralSystem(project)?.realizationProfile,
    ...values,
  });
  return commandSuccess(
    project,
    updateStructuralSystem(project, (structural) => ({
      ...structural,
      realizationProfile: profile,
    })),
    command,
    [
      {
        operation: 'configure',
        entityType: 'structuralRealizationProfile',
        id: profile.id,
        engineeringCapacityVerified: false,
      },
    ],
  );
}

function realizeAcceptedStructuralBasis(project, command) {
  const accepted = (project.building.testFitOptions || []).find(
    (entry) => entry.id === project.building.acceptedTestFitId,
  );
  if (!accepted)
    return commandError(
      project,
      command,
      'accepted-test-fit-required',
      'Accept a current test fit before realizing structure.',
    );
  if (accepted.inputSignature !== testFitInputSignature(project)) {
    return commandError(
      project,
      command,
      'accepted-test-fit-outdated',
      'Regenerate and accept the test fit after changing its site, program, parking, budget, or profile inputs.',
    );
  }
  const apartment = deriveApartmentDesignCoordination(project);
  if (apartment.state.status !== 'detailed' || apartment.outOfDate) {
    return commandError(
      project,
      command,
      'current-apartment-design-required',
      'Create or regenerate current apartment details before realizing structure.',
    );
  }
  const result = materializeAcceptedStructuralRealization(project, command.profile || {});
  if (!result.ok) return commandError(project, command, result.code, result.message);
  return commandSuccess(project, result.project, command, [
    {
      operation: 'materialize',
      entityType: 'structuralRealizationBasis',
      id: result.state.sourceTestFitId,
      generatedEntityRefs: result.refs,
      skippedBeamSegments: result.state.skippedBeamSegments,
      foundationStatus: result.state.foundationStatus,
      analysisPerformed: false,
      engineeringCapacityVerified: false,
    },
  ]);
}

function configureServicesRealizationProfile(project, command) {
  const fields = [
    'electricalRiserWidth',
    'electricalRiserDepth',
    'electricalOpeningClearance',
    'panelWidth',
    'panelDepth',
    'panelClearance',
    'waterPumpWidth',
    'waterPumpDepth',
    'waterTankWidth',
    'waterTankDepth',
    'outdoorUnitWidthPerUnit',
    'outdoorUnitDepth',
    'equipmentClearance',
    'minimumDrainSlopePercent',
    'electricalPointsPerUnit',
  ];
  const invalid = fields.find(
    (field) => command[field] != null && (!Number.isFinite(command[field]) || command[field] <= 0),
  );
  if (invalid)
    return commandError(
      project,
      command,
      'invalid-services-realization-profile',
      `${invalid} must be a positive finite planning assumption.`,
      { field: invalid, value: command[invalid] },
    );
  const profile = createServicesRealizationProfile({
    ...project.building.systems?.realizationProfile,
    ...Object.fromEntries(fields.filter((field) => command[field] != null).map((field) => [field, command[field]])),
  });
  const nextProject = {
    ...project,
    building: { ...project.building, systems: { ...project.building.systems, realizationProfile: profile } },
  };
  return commandSuccess(project, nextProject, command, [
    {
      operation: 'configure',
      entityType: 'servicesRealizationProfile',
      id: profile.id,
      hydraulicDesignPerformed: false,
      electricalLoadDesignPerformed: false,
      equipmentSizingPerformed: false,
    },
  ]);
}

function realizeAcceptedBuildingSystems(project, command) {
  const accepted = (project.building.testFitOptions || []).find(
    (entry) => entry.id === project.building.acceptedTestFitId,
  );
  if (!accepted)
    return commandError(
      project,
      command,
      'accepted-test-fit-required',
      'Accept a current test fit before realizing building systems.',
    );
  if (accepted.inputSignature !== testFitInputSignature(project))
    return commandError(
      project,
      command,
      'accepted-test-fit-outdated',
      'Regenerate and accept the test fit after changing its site, program, parking, budget, or profile inputs.',
    );
  const apartment = deriveApartmentDesignCoordination(project);
  if (apartment.state.status !== 'detailed' || apartment.outOfDate)
    return commandError(
      project,
      command,
      'current-apartment-design-required',
      'Create or regenerate current apartment details before realizing building systems.',
    );
  const structural = deriveStructuralRealization(project);
  if (structural.state.status !== 'realized' || structural.outOfDate)
    return commandError(
      project,
      command,
      'current-structural-realization-required',
      'Create or regenerate the current coordinated structural basis before realizing service penetrations.',
    );
  const result = materializeAcceptedServicesRealization(project, command.profile || {});
  if (!result.ok) return commandError(project, command, result.code, result.message);
  return commandSuccess(project, result.project, command, [
    {
      operation: 'materialize',
      entityType: 'servicesRealizationBasis',
      id: result.state.sourceTestFitId,
      generatedEntityRefs: result.refs,
      hydraulicDesignPerformed: false,
      electricalLoadDesignPerformed: false,
      equipmentSizingPerformed: false,
    },
  ]);
}

function setBeamCoordinationIntent(project, command) {
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const beam = (floor.beams || []).find((entry) => entry.id === command.beamId);
  if (!beam) return commandError(project, command, 'beam-not-found', `Beam ${command.beamId} was not found.`);
  const allowed = new Set(['typical', 'cantilever', 'transfer']);
  if (!allowed.has(command.condition)) {
    return commandError(
      project,
      command,
      'invalid-beam-condition',
      'Beam condition must be typical, cantilever, or transfer.',
    );
  }
  if (command.maxPlanningSpan != null && (!Number.isFinite(command.maxPlanningSpan) || command.maxPlanningSpan <= 0)) {
    return commandError(project, command, 'invalid-beam-planning-span', 'Beam planning span must be positive.');
  }
  const coordination = {
    ...beam.coordination,
    condition: command.condition,
    maxPlanningSpan: command.maxPlanningSpan ?? beam.coordination?.maxPlanningSpan ?? null,
    transferReason: command.transferReason ?? beam.coordination?.transferReason ?? '',
    supportedElementRefs: (command.supportedElementRefs || beam.coordination?.supportedElementRefs || []).map(
      (ref) => ({ ...ref }),
    ),
  };
  const nextProject = {
    ...project,
    floors: project.floors.map((entry) =>
      entry.id === floor.id
        ? {
            ...entry,
            beams: entry.beams.map((candidate) =>
              candidate.id === beam.id ? { ...candidate, coordination } : candidate,
            ),
          }
        : entry,
    ),
  };
  return commandSuccess(project, nextProject, command, [
    { operation: 'set_intent', entityType: 'beam', id: beam.id, floorId: floor.id, condition: coordination.condition },
  ]);
}

function createCantileverBeam(project, command) {
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const support = findColumn(floor, command.supportColumnId);
  if (!support)
    return commandError(
      project,
      command,
      'beam-support-not-found',
      'Cantilever support must be a column on the selected level.',
    );
  if (!command.beamId || (floor.beams || []).some((beam) => beam.id === command.beamId)) {
    return commandError(project, command, 'beam-id-conflict', 'Cantilever beam requires a unique stable beam ID.');
  }
  if (!validPoint(command.freeEnd) || distanceBetween(support, command.freeEnd) <= 0) {
    return commandError(
      project,
      command,
      'invalid-cantilever-end',
      'Cantilever free end must be a finite point away from its support.',
    );
  }
  const width = command.width ?? BEAM_WIDTH;
  const depth = command.depth ?? BEAM_DEPTH;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
    return commandError(project, command, 'invalid-beam-dimensions', 'Beam width and depth must be positive numbers.');
  }
  const beam = {
    id: command.beamId,
    startRef: { kind: 'column', id: support.id },
    endRef: { kind: 'point', x: command.freeEnd.x, y: command.freeEnd.y },
    width,
    depth,
    floorLevel: getFloorElevation(floor),
    phaseId: command.phaseId ?? null,
    coordination: {
      condition: 'cantilever',
      maxPlanningSpan: command.maxPlanningSpan ?? null,
      transferReason: '',
      supportedElementRefs: [],
    },
  };
  const nextProject = {
    ...project,
    floors: project.floors.map((entry) =>
      entry.id === floor.id ? { ...entry, beams: [...(entry.beams || []), beam] } : entry,
    ),
  };
  return commandSuccess(project, nextProject, command, [
    { operation: 'create', entityType: 'beam', id: beam.id, floorId: floor.id, condition: 'cantilever' },
    { operation: 'relate', entityType: 'beam', id: beam.id, relation: 'fixedSupport', targetId: support.id },
  ]);
}

function distanceBetween(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function validSlabSupportRef(floor, ref) {
  if (!ref?.id) return false;
  if (ref.kind === 'beam') return (floor.beams || []).some((entry) => entry.id === ref.id);
  if (ref.kind === 'wall') return (floor.walls || []).some((entry) => entry.id === ref.id);
  if (ref.kind === 'column') return (floor.columns || []).some((entry) => entry.id === ref.id);
  return false;
}

function coordinateSlabSupports(project, command) {
  const floorIds = command.floorId ? [command.floorId] : (project.floors || []).map((floor) => floor.id);
  if (floorIds.some((floorId) => !findFloor(project, floorId))) {
    return commandError(
      project,
      command,
      'floor-not-found',
      'One or more structural-coordination floors were not found.',
    );
  }
  if (command.maxPlanningSpan != null && (!Number.isFinite(command.maxPlanningSpan) || command.maxPlanningSpan <= 0)) {
    return commandError(project, command, 'invalid-slab-planning-span', 'Slab planning span must be positive.');
  }
  if (command.spanDirection != null && !Number.isFinite(command.spanDirection)) {
    return commandError(project, command, 'invalid-slab-span-direction', 'Slab span direction must be a finite angle.');
  }
  const coordinated = [];
  let commandFailure = null;
  const floors = project.floors.map((floor) => {
    if (!floorIds.includes(floor.id)) return floor;
    const slabs = (floor.slabs || []).map((slab) => {
      if (command.slabId && slab.id !== command.slabId) return slab;
      const supportRefs = command.supportRefs
        ? command.supportRefs.map((ref) => ({ ...ref, inference: ref.inference || 'user_selected' }))
        : inferSlabSupportRefs(floor, slab);
      const invalidRef = supportRefs.find((ref) => !validSlabSupportRef(floor, ref));
      if (invalidRef) {
        commandFailure = invalidRef;
        return slab;
      }
      coordinated.push({ floorId: floor.id, slabId: slab.id, supportCount: supportRefs.length });
      return {
        ...slab,
        supportRefs,
        coordination: {
          ...slab.coordination,
          spanDirection: command.spanDirection ?? slab.coordination?.spanDirection ?? null,
          maxPlanningSpan: command.maxPlanningSpan ?? slab.coordination?.maxPlanningSpan ?? null,
          supportAssignment: command.supportRefs ? 'user_selected' : 'geometry_inferred_and_persisted',
        },
      };
    });
    return { ...floor, slabs };
  });
  if (commandFailure) {
    return commandError(
      project,
      command,
      'slab-support-reference-invalid',
      'A selected slab support does not exist on its level.',
      { supportRef: commandFailure },
    );
  }
  if (!coordinated.length)
    return commandError(project, command, 'slab-not-found', 'No matching slab zones were found.');
  const nextProject = { ...project, floors };
  const loadPath = deriveConceptualLoadPath(nextProject);
  return commandSuccess(project, nextProject, command, [
    { operation: 'relate', entityType: 'slab', coordinated },
    { operation: 'derive', entityType: 'conceptualLoadPath', id: project.building.id, summary: loadPath.summary },
  ]);
}

function addSlabOpening(project, command) {
  const floor = findFloor(project, command.floorId);
  if (!floor) return commandError(project, command, 'floor-not-found', `Floor ${command.floorId} was not found.`);
  const slab = (floor.slabs || []).find((entry) => entry.id === command.slabId);
  if (!slab) return commandError(project, command, 'slab-not-found', `Slab ${command.slabId} was not found.`);
  if (!command.openingId || (slab.openings || []).some((entry) => entry.id === command.openingId)) {
    return commandError(project, command, 'slab-opening-id-conflict', 'Slab opening requires a unique stable ID.');
  }
  let boundaryPoints = command.boundaryPoints;
  if (
    !boundaryPoints &&
    validPoint(command.origin) &&
    Number.isFinite(command.width) &&
    Number.isFinite(command.depth)
  ) {
    boundaryPoints = [
      { x: command.origin.x, y: command.origin.y },
      { x: command.origin.x + command.width, y: command.origin.y },
      { x: command.origin.x + command.width, y: command.origin.y + command.depth },
      { x: command.origin.x, y: command.origin.y + command.depth },
    ];
  }
  if (
    !Array.isArray(boundaryPoints) ||
    boundaryPoints.length < 3 ||
    boundaryPoints.some((point) => !validPoint(point))
  ) {
    return commandError(
      project,
      command,
      'invalid-slab-opening-boundary',
      'Slab opening requires a valid polygon or positive rectangular dimensions.',
    );
  }
  const opening = {
    id: command.openingId,
    name: command.name || 'Slab opening',
    purpose: command.purpose || 'services',
    boundaryPoints: boundaryPoints.map((point) => ({ x: point.x, y: point.y })),
    confidence: 'modeled',
    serviceRef: command.serviceRef ? { ...command.serviceRef } : undefined,
  };
  const nextProject = {
    ...project,
    floors: project.floors.map((entry) =>
      entry.id === floor.id
        ? {
            ...entry,
            slabs: entry.slabs.map((candidate) =>
              candidate.id === slab.id
                ? { ...candidate, openings: [...(candidate.openings || []), opening] }
                : candidate,
            ),
          }
        : entry,
    ),
  };
  return commandSuccess(project, nextProject, command, [
    { operation: 'create', entityType: 'slabOpening', id: opening.id, floorId: floor.id, hostSlabId: slab.id },
    { operation: 'relate', entityType: 'slabOpening', id: opening.id, relation: 'hostSlab', targetId: slab.id },
  ]);
}

/** Execute a pure, traceable mutation against the canonical project model. */
export function executeBuildingCommand(project, command) {
  if (!project?.building) {
    return commandError(project, command, 'building-model-missing', 'Canonical building model is missing.');
  }
  switch (command?.type) {
    case BUILDING_COMMANDS.GENERATE_STRUCTURAL_GRID:
      return generateStructuralGrid(project, command);
    case BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID:
      return configureRegularStructuralGrid(project, command);
    case BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS:
      return populateGridColumnStacks(project, command);
    case BUILDING_COMMANDS.CREATE_COLUMN_STACK:
      return createPlannedColumnStack(project, command);
    case BUILDING_COMMANDS.ASSIGN_COLUMN_TO_STACK:
      return assignColumnToStack(project, command);
    case BUILDING_COMMANDS.MOVE_COLUMN:
      return moveColumn(project, command);
    case BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS:
      return createBeamBetweenSupports(project, command);
    case BUILDING_COMMANDS.CREATE_CANTILEVER_BEAM:
      return createCantileverBeam(project, command);
    case BUILDING_COMMANDS.SET_BEAM_COORDINATION_INTENT:
      return setBeamCoordinationIntent(project, command);
    case BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_COORDINATION:
      return configureStructuralCoordination(project, command);
    case BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_REALIZATION_PROFILE:
      return configureStructuralRealizationProfile(project, command);
    case BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS:
      return realizeAcceptedStructuralBasis(project, command);
    case BUILDING_COMMANDS.CONFIGURE_SERVICES_REALIZATION_PROFILE:
      return configureServicesRealizationProfile(project, command);
    case BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS:
      return realizeAcceptedBuildingSystems(project, command);
    case BUILDING_COMMANDS.COORDINATE_SLAB_SUPPORTS:
      return coordinateSlabSupports(project, command);
    case BUILDING_COMMANDS.ADD_SLAB_OPENING:
      return addSlabOpening(project, command);
    case BUILDING_COMMANDS.DEFINE_PROPERTY_BOUNDARY:
      return definePropertyBoundary(project, command);
    case BUILDING_COMMANDS.CONFIGURE_SITE_SETBACKS:
      return configureSiteSetbacks(project, command);
    case BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION:
      return configureSiteLocation(project, command);
    case BUILDING_COMMANDS.CACHE_SITE_WIND_CLIMATE:
      return cacheSiteWindClimate(project, command);
    case BUILDING_COMMANDS.UPSERT_SOLAR_STUDY_TARGET:
      return upsertSolarStudyTarget(project, command);
    case BUILDING_COMMANDS.REMOVE_SOLAR_STUDY_TARGET:
      return removeSolarStudyTarget(project, command);
    case BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE:
      return configureRectangularSite(project, command);
    case BUILDING_COMMANDS.CONFIGURE_REGULAR_PARKING_PLAN:
      return configureRegularParkingPlan(project, command);
    case BUILDING_COMMANDS.CONFIGURE_TEST_FIT_PROFILE:
      return configureTestFitProfile(project, command);
    case BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS:
      return generateTestFitOptions(project, command);
    case BUILDING_COMMANDS.SELECT_TEST_FIT_OPTION:
      return selectTestFitOption(project, command);
    case BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION:
      return acceptTestFitOption(project, command);
    case BUILDING_COMMANDS.CONFIGURE_APARTMENT_DESIGN_PROFILE:
      return configureApartmentDesignProfile(project, command);
    case BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT:
      return detailAcceptedTestFit(project, command);
    case BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF:
      return updateProjectBrief(project, command);
    case BUILDING_COMMANDS.DEFINE_SPACE_PROGRAM:
      return defineSpaceProgram(project, command);
    case BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM:
      return configureTypicalUnitProgram(project, command);
    case BUILDING_COMMANDS.GENERATE_UNIT_INSTANCES:
      return generateUnitInstances(project, command);
    case BUILDING_COMMANDS.SET_UNIT_INSTANCE_PLACEMENT:
      return setUnitInstancePlacement(project, command);
    case BUILDING_COMMANDS.CAPTURE_UNIT_TYPE_GEOMETRY:
      return captureApartmentUnitTypeGeometry(project, command);
    case BUILDING_COMMANDS.PROPAGATE_UNIT_TYPE_GEOMETRY:
      return propagateApartmentUnitTypeGeometry(project, command);
    case BUILDING_COMMANDS.CREATE_UNIT_TYPE:
      return createApartmentUnitType(project, command);
    case BUILDING_COMMANDS.UPDATE_UNIT_TYPE:
      return updateApartmentUnitType(project, command);
    case BUILDING_COMMANDS.CREATE_UNIT_INSTANCE:
      return createApartmentUnitInstance(project, command);
    case BUILDING_COMMANDS.ASSIGN_ROOM_TO_UNIT:
      return assignRoomToUnit(project, command);
    case BUILDING_COMMANDS.UNASSIGN_ROOM_FROM_UNIT:
      return unassignRoomFromUnit(project, command);
    case BUILDING_COMMANDS.DETACH_UNIT_INSTANCE:
      return detachUnitInstance(project, command);
    case BUILDING_COMMANDS.CLASSIFY_ROOM:
      return classifyRoom(project, command);
    case BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT:
      return configurePlumbingShaft(project, command);
    case BUILDING_COMMANDS.ASSIGN_NEARBY_WET_FIXTURES:
      return assignNearbyWetFixtures(project, command);
    case BUILDING_COMMANDS.CONFIGURE_SERVICES_COORDINATION:
      return configureServicesCoordination(project, command);
    case BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_RISER:
      return configureElectricalRiser(project, command);
    case BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_COORDINATION:
      return configureEquipmentCoordination(project, command);
    case BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE:
      return configureEquipmentZone(project, command);
    case BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_POINT:
      return configureElectricalPoint(project, command);
    case BUILDING_COMMANDS.CONFIGURE_DRAINAGE_ROUTE:
      return configureDrainageRoute(project, command);
    case BUILDING_COMMANDS.CONFIGURE_EGRESS_EXIT:
      return configureEgressExit(project, command);
    case BUILDING_COMMANDS.CONFIGURE_EGRESS_ROUTE:
      return configureEgressRoute(project, command);
    case BUILDING_COMMANDS.COORDINATE_VERTICAL_SERVICE_OPENINGS:
      return coordinateVerticalServiceOpenings(project, command);
    case BUILDING_COMMANDS.LINK_STAIR_CLEARANCE_OPENING:
      return linkStairClearanceOpening(project, command);
    case BUILDING_COMMANDS.CONFIGURE_ROOF_DRAINAGE_PATH:
      return configureRoofDrainagePath(project, command);
    case BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE:
      return configureQuantityProfile(project, command);
    case BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE:
      return configurePriceProfile(project, command);
    case BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_DEFINITION:
      return configureAssemblyDefinition(project, command);
    case BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_CATALOG:
      return configureAssemblyCatalog(project, command);
    case BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO:
      return configureFeasibilityScenario(project, command);
    case BUILDING_COMMANDS.SET_ACTIVE_FEASIBILITY_SCENARIO:
      return setActiveFeasibilityScenario(project, command);
    case BUILDING_COMMANDS.REALIZE_QUANTITY_COST_BASELINE:
      return realizeQuantityCostBaseline(project, command);
    case BUILDING_COMMANDS.SET_VALUE_ENGINEERING_OPPORTUNITY_STATUS:
      return setValueEngineeringOpportunityStatus(project, command);
    case BUILDING_COMMANDS.CONFIGURE_DESIGN_ASSUMPTION:
      return configureDesignAssumption(project, command);
    case BUILDING_COMMANDS.CONFIGURE_REVIEW_ITEM:
      return configureReviewItem(project, command);
    case BUILDING_COMMANDS.SET_REVIEW_ITEM_STATUS:
      return setReviewItemStatus(project, command);
    case BUILDING_COMMANDS.RECORD_EXTERNAL_VERIFICATION:
      return recordExternalVerification(project, command);
    case BUILDING_COMMANDS.CAPTURE_REVIEW_REVISION:
      return captureReviewRevision(project, command);
    case BUILDING_COMMANDS.SET_ACTIVE_REVIEW_REVISION:
      return setActiveReviewRevision(project, command);
    case BUILDING_COMMANDS.GENERATE_PRELIMINARY_DRAWING_PACKAGE:
      return generatePreliminaryDrawingPackage(project, command);
    case BUILDING_COMMANDS.ISSUE_COORDINATED_REVIEW_PACKAGE:
      return issueCoordinatedReviewPackage(project, command);
    case BUILDING_COMMANDS.PUBLISH_PROFESSIONAL_EXCHANGE:
      return publishProfessionalReviewExchange(project, command);
    case BUILDING_COMMANDS.IMPORT_REVIEWER_MARKUP:
      return importReviewerMarkup(project, command);
    case BUILDING_COMMANDS.IMPORT_REVIEWER_MARKUP_EXCHANGE:
      return importReviewerMarkupExchangeCommand(project, command);
    case BUILDING_COMMANDS.RECORD_EXTERNAL_PROFESSIONAL_RESPONSE:
      return recordExternalProfessionalResponse(project, command);
    case BUILDING_COMMANDS.SET_ACTIVE_PROFESSIONAL_EXCHANGE:
      return setActiveProfessionalExchange(project, command);
    default:
      return commandError(project, command, 'unknown-command', `Unknown building command: ${command?.type || 'none'}.`);
  }
}
