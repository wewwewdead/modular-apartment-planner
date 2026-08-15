import { ProjectValidationError } from './errors';
import { PHASE_ASSIGNABLE_KEYS } from '@/domain/phaseAssignments';
import { resolveCeilingElevations } from '@/domain/ceilingModels';
import { syncCanonicalBuilding } from '@/domain/buildingModels';
import { QUANTITY_RATE_KEYS } from '@/domain/quantityTakeoff';

export function validateProjectStructure(project) {
  const errors = [];

  if (!project || typeof project !== 'object') {
    errors.push({ path: '', message: 'Project must be a non-null object' });
    return errors;
  }
  if (typeof project.id !== 'string' || !project.id) {
    errors.push({ path: 'id', message: 'Project must have a non-empty string id' });
  }
  if (typeof project.name !== 'string' || !project.name) {
    errors.push({ path: 'name', message: 'Project must have a non-empty string name' });
  }
  if (!Array.isArray(project.floors) || project.floors.length === 0) {
    errors.push({ path: 'floors', message: 'Project must have a non-empty floors array' });
    return errors;
  }
  if (!project.building || typeof project.building !== 'object') {
    errors.push({ path: 'building', message: 'Project must have a canonical building model' });
  } else {
    if (!Array.isArray(project.building.unitTypes)) {
      errors.push({ path: 'building.unitTypes', message: 'Building must have a unitTypes array' });
    }
    if (!Array.isArray(project.building.unitInstances)) {
      errors.push({ path: 'building.unitInstances', message: 'Building must have a unitInstances array' });
    }
    for (const [typeIndex, unitType] of (project.building.unitTypes || []).entries()) {
      if (!unitType.id) {
        errors.push({ path: `building.unitTypes[${typeIndex}].id`, message: 'Unit type must have an id' });
      }
      if (unitType.geometryTemplate) {
        for (const collection of ['walls', 'doors', 'windows', 'rooms', 'fixtures']) {
          if (!Array.isArray(unitType.geometryTemplate[collection])) {
            errors.push({
              path: `building.unitTypes[${typeIndex}].geometryTemplate.${collection}`,
              message: `Unit geometry template must have a ${collection} array`,
            });
          }
        }
      }
    }
    for (const [instanceIndex, instance] of (project.building.unitInstances || []).entries()) {
      if (!instance.id || !instance.typeId || !instance.floorId) {
        errors.push({
          path: `building.unitInstances[${instanceIndex}]`,
          message: 'Unit instance must have id, typeId, and floorId references',
        });
      }
      if (
        instance.placement &&
        (!Number.isFinite(instance.placement.origin?.x) ||
          !Number.isFinite(instance.placement.origin?.y) ||
          !Number.isFinite(instance.placement.rotation))
      ) {
        errors.push({
          path: `building.unitInstances[${instanceIndex}].placement`,
          message: 'Unit placement must contain finite origin coordinates and rotation',
        });
      }
    }
    if (!Array.isArray(project.building.testFitOptions)) {
      errors.push({ path: 'building.testFitOptions', message: 'Building must have a testFitOptions array' });
    }
    for (const [optionIndex, option] of (Array.isArray(project.building.testFitOptions)
      ? project.building.testFitOptions
      : []
    ).entries()) {
      if (!option?.id || !Array.isArray(option.floorPlans)) {
        errors.push({
          path: `building.testFitOptions[${optionIndex}]`,
          message: 'Test-fit option must have an id and floorPlans array',
        });
        continue;
      }
      for (const [planIndex, plan] of option.floorPlans.entries()) {
        if (!Array.isArray(plan?.blocks)) {
          errors.push({
            path: `building.testFitOptions[${optionIndex}].floorPlans[${planIndex}].blocks`,
            message: 'Test-fit floor plan must have a blocks array',
          });
        }
      }
      if (!Array.isArray(option.proposedGrid?.xOffsets) || !Array.isArray(option.proposedGrid?.yOffsets)) {
        errors.push({
          path: `building.testFitOptions[${optionIndex}].proposedGrid`,
          message: 'Test-fit option must have proposed grid offset arrays',
        });
      }
    }
    if (
      !project.building.apartmentDesignProfile ||
      typeof project.building.apartmentDesignProfile !== 'object' ||
      Array.isArray(project.building.apartmentDesignProfile)
    ) {
      errors.push({
        path: 'building.apartmentDesignProfile',
        message: 'Building must have an apartmentDesignProfile object',
      });
    }
    if (
      !project.building.apartmentDesign ||
      typeof project.building.apartmentDesign !== 'object' ||
      Array.isArray(project.building.apartmentDesign)
    ) {
      errors.push({ path: 'building.apartmentDesign', message: 'Building must have an apartmentDesign state object' });
    } else {
      if (!Array.isArray(project.building.apartmentDesign.detailedUnitInstanceIds)) {
        errors.push({
          path: 'building.apartmentDesign.detailedUnitInstanceIds',
          message: 'Detailed unit references must be an array',
        });
      }
      for (const collection of [
        'rooms',
        'walls',
        'doors',
        'windows',
        'fixtures',
        'stairs',
        'slabOpenings',
        'egressExits',
        'egressRoutes',
      ]) {
        if (!Array.isArray(project.building.apartmentDesign.generatedEntityRefs?.[collection])) {
          errors.push({
            path: `building.apartmentDesign.generatedEntityRefs.${collection}`,
            message: `Apartment design ${collection} references must be an array`,
          });
        }
      }
    }
    const structural = project.building.systems?.structural;
    if (
      !structural?.realizationProfile ||
      typeof structural.realizationProfile !== 'object' ||
      Array.isArray(structural.realizationProfile)
    ) {
      errors.push({
        path: 'building.systems.structural.realizationProfile',
        message: 'Structural system must have a realizationProfile object',
      });
    }
    if (
      !structural?.realization ||
      typeof structural.realization !== 'object' ||
      Array.isArray(structural.realization)
    ) {
      errors.push({
        path: 'building.systems.structural.realization',
        message: 'Structural system must have a realization state object',
      });
    } else {
      for (const collection of ['columnStacks', 'columns', 'beams']) {
        if (!Array.isArray(structural.realization.generatedEntityRefs?.[collection])) {
          errors.push({
            path: `building.systems.structural.realization.generatedEntityRefs.${collection}`,
            message: `Structural realization ${collection} references must be an array`,
          });
        }
      }
      if (!Array.isArray(structural.realization.skippedBeamSegments)) {
        errors.push({
          path: 'building.systems.structural.realization.skippedBeamSegments',
          message: 'Structural realization skippedBeamSegments must be an array',
        });
      }
    }
    const servicesRealization = project.building.systems?.realization;
    if (
      !project.building.systems?.realizationProfile ||
      typeof project.building.systems.realizationProfile !== 'object' ||
      Array.isArray(project.building.systems.realizationProfile)
    ) {
      errors.push({
        path: 'building.systems.realizationProfile',
        message: 'Building systems must have a realizationProfile object',
      });
    }
    if (!servicesRealization || typeof servicesRealization !== 'object' || Array.isArray(servicesRealization)) {
      errors.push({
        path: 'building.systems.realization',
        message: 'Building systems must have a realization state object',
      });
    } else {
      for (const collection of [
        'drainageRoutes',
        'electricalRisers',
        'panelZones',
        'electricalPoints',
        'waterEquipmentZones',
        'outdoorUnitZones',
        'slabOpenings',
      ]) {
        if (!Array.isArray(servicesRealization.generatedEntityRefs?.[collection])) {
          errors.push({
            path: `building.systems.realization.generatedEntityRefs.${collection}`,
            message: `Services realization ${collection} references must be an array`,
          });
        }
      }
      if (!Array.isArray(servicesRealization.unresolvedItems)) {
        errors.push({
          path: 'building.systems.realization.unresolvedItems',
          message: 'Services realization unresolvedItems must be an array',
        });
      }
    }
    const plumbing = project.building.systems?.plumbing;
    const electrical = project.building.systems?.electrical;
    const water = project.building.systems?.water;
    const mechanical = project.building.systems?.mechanical;
    const egress = project.building.systems?.egress;
    const parkingPlan = project.building.site?.parkingPlan;
    if (parkingPlan?.bays && !Array.isArray(parkingPlan.bays)) {
      errors.push({ path: 'building.site.parkingPlan.bays', message: 'Parking bays must be an array' });
    }
    if (parkingPlan?.accessRoutes && !Array.isArray(parkingPlan.accessRoutes)) {
      errors.push({
        path: 'building.site.parkingPlan.accessRoutes',
        message: 'Parking access routes must be an array',
      });
    }
    if (plumbing?.drainageRoutes && !Array.isArray(plumbing.drainageRoutes)) {
      errors.push({ path: 'building.systems.plumbing.drainageRoutes', message: 'Drainage routes must be an array' });
    }
    if (electrical?.riserZones && !Array.isArray(electrical.riserZones)) {
      errors.push({
        path: 'building.systems.electrical.riserZones',
        message: 'Electrical riser zones must be an array',
      });
    }
    if (electrical?.panelZones && !Array.isArray(electrical.panelZones)) {
      errors.push({
        path: 'building.systems.electrical.panelZones',
        message: 'Electrical panel zones must be an array',
      });
    }
    if (electrical?.points && !Array.isArray(electrical.points)) {
      errors.push({ path: 'building.systems.electrical.points', message: 'Electrical points must be an array' });
    }
    if (water?.equipmentZones && !Array.isArray(water.equipmentZones)) {
      errors.push({ path: 'building.systems.water.equipmentZones', message: 'Water equipment zones must be an array' });
    }
    if (mechanical?.outdoorUnitZones && !Array.isArray(mechanical.outdoorUnitZones)) {
      errors.push({
        path: 'building.systems.mechanical.outdoorUnitZones',
        message: 'Mechanical outdoor-unit zones must be an array',
      });
    }
    if (egress?.exits && !Array.isArray(egress.exits)) {
      errors.push({ path: 'building.systems.egress.exits', message: 'Egress exits must be an array' });
    }
    if (egress?.routes && !Array.isArray(egress.routes)) {
      errors.push({ path: 'building.systems.egress.routes', message: 'Egress routes must be an array' });
    }
    const quantityProfile = project.building.quantityProfile;
    for (const collection of ['priceProfiles', 'assemblies', 'scenarios']) {
      if (quantityProfile?.[collection] != null && !Array.isArray(quantityProfile[collection])) {
        errors.push({
          path: `building.quantityProfile.${collection}`,
          message: `Quantity profile ${collection} must be an array`,
        });
      }
    }
    for (const [index, priceProfile] of (Array.isArray(quantityProfile?.priceProfiles)
      ? quantityProfile.priceProfiles
      : []
    ).entries()) {
      if (!priceProfile?.id) {
        errors.push({
          path: `building.quantityProfile.priceProfiles[${index}]`,
          message: 'Price profile must have an id',
        });
      }
    }
    for (const [index, assembly] of (Array.isArray(quantityProfile?.assemblies)
      ? quantityProfile.assemblies
      : []
    ).entries()) {
      if (!assembly?.id || !QUANTITY_RATE_KEYS.includes(assembly.rateKey)) {
        errors.push({
          path: `building.quantityProfile.assemblies[${index}]`,
          message: 'Assembly must have an id and supported rateKey',
        });
      }
    }
    for (const [index, scenario] of (Array.isArray(quantityProfile?.scenarios)
      ? quantityProfile.scenarios
      : []
    ).entries()) {
      if (!scenario?.id) {
        errors.push({
          path: `building.quantityProfile.scenarios[${index}]`,
          message: 'Feasibility scenario must have an id',
        });
      }
    }
    const costRealization = project.building.costRealization;
    if (
      !project.building.costRealizationProfile ||
      typeof project.building.costRealizationProfile !== 'object' ||
      Array.isArray(project.building.costRealizationProfile)
    ) {
      errors.push({
        path: 'building.costRealizationProfile',
        message: 'Building must have a costRealizationProfile object',
      });
    }
    if (!costRealization || typeof costRealization !== 'object' || Array.isArray(costRealization)) {
      errors.push({ path: 'building.costRealization', message: 'Building must have a costRealization state object' });
    } else {
      for (const collection of ['lineItemSnapshots', 'scenarioSnapshots', 'valueEngineeringOpportunities']) {
        if (!Array.isArray(costRealization[collection])) {
          errors.push({
            path: `building.costRealization.${collection}`,
            message: `Cost realization ${collection} must be an array`,
          });
        }
      }
      if (
        !costRealization.realizedMetrics ||
        typeof costRealization.realizedMetrics !== 'object' ||
        Array.isArray(costRealization.realizedMetrics)
      ) {
        errors.push({
          path: 'building.costRealization.realizedMetrics',
          message: 'Cost realization metrics must be an object',
        });
      }
    }
    const documentationRealization = project.building.documentationRealization;
    if (
      !project.building.documentationRealizationProfile ||
      typeof project.building.documentationRealizationProfile !== 'object' ||
      Array.isArray(project.building.documentationRealizationProfile)
    ) {
      errors.push({
        path: 'building.documentationRealizationProfile',
        message: 'Building must have a documentationRealizationProfile object',
      });
    }
    if (
      !documentationRealization ||
      typeof documentationRealization !== 'object' ||
      Array.isArray(documentationRealization)
    ) {
      errors.push({
        path: 'building.documentationRealization',
        message: 'Building must have a documentationRealization state object',
      });
    } else {
      for (const collection of [
        'sheetSnapshots',
        'deliverableSnapshots',
        'unresolvedFindingSnapshots',
        'annotationSnapshots',
      ]) {
        if (!Array.isArray(documentationRealization[collection])) {
          errors.push({
            path: `building.documentationRealization.${collection}`,
            message: `Documentation realization ${collection} must be an array`,
          });
        }
      }
    }
    const professionalExchange = project.building.professionalExchange;
    if (
      !project.building.professionalExchangeProfile ||
      typeof project.building.professionalExchangeProfile !== 'object' ||
      Array.isArray(project.building.professionalExchangeProfile)
    ) {
      errors.push({
        path: 'building.professionalExchangeProfile',
        message: 'Building must have a professionalExchangeProfile object',
      });
    }
    if (!professionalExchange || typeof professionalExchange !== 'object' || Array.isArray(professionalExchange)) {
      errors.push({
        path: 'building.professionalExchange',
        message: 'Building must have a professionalExchange state object',
      });
    } else {
      for (const collection of ['exchanges', 'reviewerMarkups', 'externalResponses']) {
        if (!Array.isArray(professionalExchange[collection])) {
          errors.push({
            path: `building.professionalExchange.${collection}`,
            message: `Professional exchange ${collection} must be an array`,
          });
        }
      }
    }
    if (project.building.assumptions != null && !Array.isArray(project.building.assumptions)) {
      errors.push({ path: 'building.assumptions', message: 'Building assumptions must be an array' });
    }
    const documentation = project.building.documentation;
    for (const collection of ['reviewItems', 'revisionSnapshots']) {
      if (documentation?.[collection] != null && !Array.isArray(documentation[collection])) {
        errors.push({
          path: `building.documentation.${collection}`,
          message: `Documentation ${collection} must be an array`,
        });
      }
    }
  }

  if (project.ceilings != null && !Array.isArray(project.ceilings)) {
    errors.push({ path: 'ceilings', message: 'Project ceilings must be an array' });
  }

  project.floors.forEach((floor, fi) => {
    if (!floor.id) {
      errors.push({ path: `floors[${fi}].id`, message: 'Floor must have an id' });
    }
    if (!Array.isArray(floor.walls)) {
      errors.push({ path: `floors[${fi}].walls`, message: 'Floor must have a walls array' });
    }

    for (const door of floor.doors || []) {
      if (!door.id) errors.push({ path: `floors[${fi}].doors`, message: 'Door missing id' });
      if (!door.wallId) errors.push({ path: `floors[${fi}].doors`, message: `Door ${door.id || '?'} missing wallId` });
    }

    for (const win of floor.windows || []) {
      if (!win.id) errors.push({ path: `floors[${fi}].windows`, message: 'Window missing id' });
      if (!win.wallId)
        errors.push({ path: `floors[${fi}].windows`, message: `Window ${win.id || '?'} missing wallId` });
    }

    for (const beam of floor.beams || []) {
      if (beam.coordination && !['typical', 'cantilever', 'transfer'].includes(beam.coordination.condition)) {
        errors.push({
          path: `floors[${fi}].beams`,
          message: `Beam ${beam.id || '?'} has an unsupported coordination condition`,
        });
      }
    }

    for (const slab of floor.slabs || []) {
      if (slab.supportRefs && !Array.isArray(slab.supportRefs)) {
        errors.push({ path: `floors[${fi}].slabs`, message: `Slab ${slab.id || '?'} supportRefs must be an array` });
      }
      if (slab.openings && !Array.isArray(slab.openings)) {
        errors.push({ path: `floors[${fi}].slabs`, message: `Slab ${slab.id || '?'} openings must be an array` });
      }
      for (const opening of slab.openings || []) {
        if (!opening.id || !Array.isArray(opening.boundaryPoints) || opening.boundaryPoints.length < 3) {
          errors.push({
            path: `floors[${fi}].slabs`,
            message: `Slab ${slab.id || '?'} has an invalid opening definition`,
          });
        }
      }
    }
  });

  return errors;
}

export function validateProjectReferences(project) {
  const warnings = [];

  const floorIds = new Set(project.floors.map((f) => f.id));
  const phaseIds = new Set((project.phases || []).map((p) => p.id));
  const unitInstanceIds = new Set((project.building?.unitInstances || []).map((instance) => instance.id));
  const unitTypeIds = new Set((project.building?.unitTypes || []).map((unitType) => unitType.id));
  const testFitOptionIds = new Set((project.building?.testFitOptions || []).map((option) => option.id));
  const plumbingShaftIds = new Set((project.building?.systems?.plumbing?.shafts || []).map((shaft) => shaft.id));
  const electricalRiserIds = new Set(
    (project.building?.systems?.electrical?.riserZones || []).map((riser) => riser.id),
  );
  const parkingBayIds = new Set((project.building?.site?.parkingPlan?.bays || []).map((bay) => bay.id));
  const panelZoneIds = new Set((project.building?.systems?.electrical?.panelZones || []).map((zone) => zone.id));
  const egressExits = new Map((project.building?.systems?.egress?.exits || []).map((exit) => [exit.id, exit]));
  const quantityProfile = project.building?.quantityProfile || {};
  const priceProfileIds = new Set((quantityProfile.priceProfiles || []).map((entry) => entry.id));
  const scenarioIds = new Set((quantityProfile.scenarios || []).map((entry) => entry.id));
  const documentation = project.building?.documentation || {};
  const revisionIds = new Set((documentation.revisionSnapshots || []).map((entry) => entry.id));
  const openingReferenceKeys = new Set(
    project.floors.flatMap((floor) =>
      (floor.slabs || []).flatMap((slab) =>
        (slab.openings || []).map((opening) => `${floor.id}:${slab.id}:${opening.id}`),
      ),
    ),
  );
  const structural = project.building?.systems?.structural || {};
  const columnStackIds = new Set((structural.columnStacks || []).map((stack) => stack.id));
  const columnIds = new Set(project.floors.flatMap((floor) => (floor.columns || []).map((column) => column.id)));
  const beamIds = new Set(project.floors.flatMap((floor) => (floor.beams || []).map((beam) => beam.id)));

  for (const option of project.building?.testFitOptions || []) {
    const missingTypes = (option.floorPlans || [])
      .flatMap((plan) => plan.blocks || [])
      .filter((block) => block.kind === 'unit' && block.unitTypeId && !unitTypeIds.has(block.unitTypeId))
      .map((block) => block.unitTypeId);
    if (missingTypes.length) {
      warnings.push({
        path: `testFitOption ${option.id}`,
        message: `References non-existent unit types ${[...new Set(missingTypes)].join(', ')}`,
      });
    }
  }
  if (project.building?.selectedTestFitId && !testFitOptionIds.has(project.building.selectedTestFitId)) {
    warnings.push({ path: 'building.selectedTestFitId', message: 'References a non-existent test-fit option' });
  }
  if (project.building?.acceptedTestFitId && !testFitOptionIds.has(project.building.acceptedTestFitId)) {
    warnings.push({ path: 'building.acceptedTestFitId', message: 'References a non-existent test-fit option' });
  }
  const apartmentDesign = project.building?.apartmentDesign || {};
  if (apartmentDesign.sourceTestFitId && !testFitOptionIds.has(apartmentDesign.sourceTestFitId)) {
    warnings.push({
      path: 'building.apartmentDesign.sourceTestFitId',
      message: 'References a non-existent test-fit option',
    });
  }
  const missingDetailedUnits = (apartmentDesign.detailedUnitInstanceIds || []).filter((id) => !unitInstanceIds.has(id));
  if (missingDetailedUnits.length) {
    warnings.push({
      path: 'building.apartmentDesign.detailedUnitInstanceIds',
      message: `References non-existent unit instances ${missingDetailedUnits.join(', ')}`,
    });
  }
  const structuralRealization = structural.realization || {};
  if (structuralRealization.sourceTestFitId && !testFitOptionIds.has(structuralRealization.sourceTestFitId)) {
    warnings.push({
      path: 'building.systems.structural.realization.sourceTestFitId',
      message: 'References a non-existent test-fit option',
    });
  }
  for (const [collection, ids] of [
    ['columnStacks', columnStackIds],
    ['columns', columnIds],
    ['beams', beamIds],
  ]) {
    const missing = (structuralRealization.generatedEntityRefs?.[collection] || []).filter((id) => !ids.has(id));
    if (missing.length)
      warnings.push({
        path: `building.systems.structural.realization.generatedEntityRefs.${collection}`,
        message: `References non-existent generated entities ${missing.join(', ')}`,
      });
  }

  for (const floor of project.floors) {
    const wallIds = new Set((floor.walls || []).map((w) => w.id));
    const landingIds = new Set((floor.landings || []).map((l) => l.id));
    const columnIds = new Set((floor.columns || []).map((c) => c.id));
    const beamIds = new Set((floor.beams || []).map((beam) => beam.id));

    for (const door of floor.doors || []) {
      if (door.wallId && !wallIds.has(door.wallId)) {
        warnings.push({
          path: `floor ${floor.id} door ${door.id}`,
          message: `References non-existent wall ${door.wallId}`,
        });
      }
    }

    for (const win of floor.windows || []) {
      if (win.wallId && !wallIds.has(win.wallId)) {
        warnings.push({
          path: `floor ${floor.id} window ${win.id}`,
          message: `References non-existent wall ${win.wallId}`,
        });
      }
    }

    for (const room of floor.rooms || []) {
      if (room.unitInstanceId && !unitInstanceIds.has(room.unitInstanceId)) {
        warnings.push({
          path: `floor ${floor.id} room ${room.id}`,
          message: `References non-existent unit instance ${room.unitInstanceId}`,
        });
      }
    }
    for (const fixture of floor.fixtures || []) {
      if (fixture.plumbingShaftId && !plumbingShaftIds.has(fixture.plumbingShaftId)) {
        warnings.push({
          path: `floor ${floor.id} fixture ${fixture.id}`,
          message: `References non-existent plumbing shaft ${fixture.plumbingShaftId}`,
        });
      }
    }

    for (const beam of floor.beams || []) {
      if (beam.startRef?.kind === 'column' && beam.startRef.id && !columnIds.has(beam.startRef.id)) {
        warnings.push({
          path: `floor ${floor.id} beam ${beam.id}`,
          message: `startRef references non-existent column ${beam.startRef.id}`,
        });
      }
      if (beam.endRef?.kind === 'column' && beam.endRef.id && !columnIds.has(beam.endRef.id)) {
        warnings.push({
          path: `floor ${floor.id} beam ${beam.id}`,
          message: `endRef references non-existent column ${beam.endRef.id}`,
        });
      }
    }

    for (const stair of floor.stairs || []) {
      if (stair.floorRelation?.fromFloorId && !floorIds.has(stair.floorRelation.fromFloorId)) {
        warnings.push({
          path: `floor ${floor.id} stair ${stair.id}`,
          message: `fromFloorId references non-existent floor ${stair.floorRelation.fromFloorId}`,
        });
      }
      if (stair.floorRelation?.toFloorId && !floorIds.has(stair.floorRelation.toFloorId)) {
        warnings.push({
          path: `floor ${floor.id} stair ${stair.id}`,
          message: `toFloorId references non-existent floor ${stair.floorRelation.toFloorId}`,
        });
      }
      if (stair.startLandingAttachment?.landingId && !landingIds.has(stair.startLandingAttachment.landingId)) {
        warnings.push({
          path: `floor ${floor.id} stair ${stair.id}`,
          message: `startLandingAttachment references non-existent landing ${stair.startLandingAttachment.landingId}`,
        });
      }
      if (stair.endLandingAttachment?.landingId && !landingIds.has(stair.endLandingAttachment.landingId)) {
        warnings.push({
          path: `floor ${floor.id} stair ${stair.id}`,
          message: `endLandingAttachment references non-existent landing ${stair.endLandingAttachment.landingId}`,
        });
      }
      const clearanceRef = stair.coordination?.clearanceOpeningRef;
      if (
        clearanceRef &&
        !openingReferenceKeys.has(`${clearanceRef.floorId}:${clearanceRef.slabId}:${clearanceRef.openingId}`)
      ) {
        warnings.push({
          path: `floor ${floor.id} stair ${stair.id}`,
          message: `clearanceOpeningRef references a non-existent slab opening ${clearanceRef.openingId}`,
        });
      }
    }

    for (const slab of floor.slabs || []) {
      if (slab.floorId && !floorIds.has(slab.floorId)) {
        warnings.push({
          path: `floor ${floor.id} slab ${slab.id}`,
          message: `floorId references non-existent floor ${slab.floorId}`,
        });
      }
      for (const supportRef of slab.supportRefs || []) {
        const valid =
          (supportRef.kind === 'beam' && beamIds.has(supportRef.id)) ||
          (supportRef.kind === 'wall' && wallIds.has(supportRef.id)) ||
          (supportRef.kind === 'column' && columnIds.has(supportRef.id));
        if (!valid) {
          warnings.push({
            path: `floor ${floor.id} slab ${slab.id}`,
            message: `supportRef references non-existent ${supportRef.kind || 'support'} ${supportRef.id || '?'}`,
          });
        }
      }
      for (const opening of slab.openings || []) {
        const serviceRef = opening.serviceRef;
        const validService =
          !serviceRef ||
          (serviceRef.kind === 'plumbing' && plumbingShaftIds.has(serviceRef.id)) ||
          (serviceRef.kind === 'electrical' && electricalRiserIds.has(serviceRef.id));
        if (!validService) {
          warnings.push({
            path: `floor ${floor.id} slab ${slab.id} opening ${opening.id}`,
            message: `serviceRef references non-existent ${serviceRef.kind || 'service'} ${serviceRef.id || '?'}`,
          });
        }
      }
    }

    // Check phaseId references on all phase-assignable objects
    for (const key of PHASE_ASSIGNABLE_KEYS) {
      for (const obj of floor[key] || []) {
        if (obj.phaseId && !phaseIds.has(obj.phaseId)) {
          warnings.push({
            path: `floor ${floor.id} ${key} ${obj.id}`,
            message: `phaseId references non-existent phase ${obj.phaseId}`,
          });
        }
      }
    }
  }

  for (const route of project.building?.systems?.plumbing?.drainageRoutes || []) {
    if (!floorIds.has(route.floorId) || !plumbingShaftIds.has(route.sourceShaftId)) {
      warnings.push({
        path: `drainageRoute ${route.id}`,
        message: 'Drainage route references a non-existent floor or plumbing shaft',
      });
    }
  }
  for (const route of project.building?.site?.parkingPlan?.accessRoutes || []) {
    const missing = (route.servedBayIds || []).filter((id) => !parkingBayIds.has(id));
    if (missing.length) {
      warnings.push({
        path: `parkingAccessRoute ${route.id}`,
        message: `References non-existent parking bays ${missing.join(', ')}`,
      });
    }
  }
  const equipmentZones = [
    ...(project.building?.systems?.electrical?.panelZones || []),
    ...(project.building?.systems?.water?.equipmentZones || []),
    ...(project.building?.systems?.mechanical?.outdoorUnitZones || []),
  ];
  for (const zone of equipmentZones) {
    if (
      (zone.location === 'floor' && !floorIds.has(zone.floorId)) ||
      (zone.servedFloorIds || []).some((id) => !floorIds.has(id))
    ) {
      warnings.push({ path: `equipmentZone ${zone.id}`, message: 'References one or more non-existent floors' });
    }
  }
  for (const point of project.building?.systems?.electrical?.points || []) {
    if (!floorIds.has(point.floorId) || !panelZoneIds.has(point.panelZoneId)) {
      warnings.push({
        path: `electricalPoint ${point.id}`,
        message: 'References a non-existent floor or electrical panel zone',
      });
    }
  }
  const roofPlaneIds = new Set((project.roofSystem?.roofPlanes || []).map((plane) => plane.id));
  for (const drain of project.roofSystem?.drains || []) {
    const brokenCatchment = (drain.catchmentPlaneIds || []).some((id) => !roofPlaneIds.has(id));
    const brokenShaft = drain.outletRef?.kind === 'plumbing_shaft' && !plumbingShaftIds.has(drain.outletRef.id);
    if (brokenCatchment || brokenShaft) {
      warnings.push({
        path: `roofDrain ${drain.id}`,
        message: 'References a non-existent catchment plane or plumbing shaft',
      });
    }
  }
  for (const exit of egressExits.values()) {
    if (!floorIds.has(exit.floorId)) {
      warnings.push({
        path: `egressExit ${exit.id}`,
        message: `Egress exit references non-existent floor ${exit.floorId}`,
      });
    }
  }
  for (const route of project.building?.systems?.egress?.routes || []) {
    const floor = project.floors.find((entry) => entry.id === route.floorId);
    const roomExists = (floor?.rooms || []).some((room) => room.id === route.fromRoomId);
    const exit = egressExits.get(route.exitId);
    if (!floor || !roomExists || !exit || exit.floorId !== floor.id) {
      warnings.push({
        path: `egressRoute ${route.id}`,
        message: 'Egress route references a non-existent room, exit, or floor',
      });
    }
  }
  for (const scenario of quantityProfile.scenarios || []) {
    if (!scenario.priceProfileId || !priceProfileIds.has(scenario.priceProfileId)) {
      warnings.push({
        path: `feasibilityScenario ${scenario.id}`,
        message: `priceProfileId references non-existent price profile ${scenario.priceProfileId || '?'}`,
      });
    }
  }
  if (quantityProfile.activeScenarioId && !scenarioIds.has(quantityProfile.activeScenarioId)) {
    warnings.push({
      path: 'building.quantityProfile.activeScenarioId',
      message: `References non-existent feasibility scenario ${quantityProfile.activeScenarioId}`,
    });
  }
  const costRealization = project.building?.costRealization || {};
  if (costRealization.baselineScenarioId && !scenarioIds.has(costRealization.baselineScenarioId)) {
    warnings.push({
      path: 'building.costRealization.baselineScenarioId',
      message: `References non-existent feasibility scenario ${costRealization.baselineScenarioId}`,
    });
  }
  if (costRealization.baselinePriceProfileId && !priceProfileIds.has(costRealization.baselinePriceProfileId)) {
    warnings.push({
      path: 'building.costRealization.baselinePriceProfileId',
      message: `References non-existent price profile ${costRealization.baselinePriceProfileId}`,
    });
  }
  for (const opportunity of costRealization.valueEngineeringOpportunities || []) {
    if (!scenarioIds.has(opportunity.baselineScenarioId) || !scenarioIds.has(opportunity.alternativeScenarioId)) {
      warnings.push({
        path: `valueEngineeringOpportunity ${opportunity.id}`,
        message: 'References a non-existent baseline or alternative scenario',
      });
    }
  }
  if (documentation.activeRevisionId && !revisionIds.has(documentation.activeRevisionId)) {
    warnings.push({
      path: 'building.documentation.activeRevisionId',
      message: `References non-existent review revision ${documentation.activeRevisionId}`,
    });
  }
  const documentationRealization = project.building?.documentationRealization || {};
  const sheetIds = new Set((project.sheets || []).map((entry) => entry.id));
  if (documentationRealization.sourceRevisionId && !revisionIds.has(documentationRealization.sourceRevisionId)) {
    warnings.push({
      path: 'building.documentationRealization.sourceRevisionId',
      message: `References non-existent review revision ${documentationRealization.sourceRevisionId}`,
    });
  }
  const missingIssuedSheetIds = (documentationRealization.sheetSnapshots || [])
    .filter((entry) => !sheetIds.has(entry.id))
    .map((entry) => entry.id);
  if (missingIssuedSheetIds.length) {
    warnings.push({
      path: 'building.documentationRealization.sheetSnapshots',
      message: `References non-existent issued sheets ${missingIssuedSheetIds.join(', ')}`,
    });
  }
  const professionalExchange = project.building?.professionalExchange || {};
  const exchangeIds = new Set((professionalExchange.exchanges || []).map((entry) => entry.id));
  if (professionalExchange.activeExchangeId && !exchangeIds.has(professionalExchange.activeExchangeId)) {
    warnings.push({
      path: 'building.professionalExchange.activeExchangeId',
      message: `References non-existent professional exchange ${professionalExchange.activeExchangeId}`,
    });
  }
  const markupIds = new Set((professionalExchange.reviewerMarkups || []).map((entry) => entry.id));
  for (const markup of professionalExchange.reviewerMarkups || []) {
    if (!exchangeIds.has(markup.exchangeId))
      warnings.push({
        path: `reviewerMarkup ${markup.id}`,
        message: 'References a non-existent professional exchange',
      });
  }
  for (const response of professionalExchange.externalResponses || []) {
    if (!markupIds.has(response.markupId))
      warnings.push({
        path: `externalProfessionalResponse ${response.id}`,
        message: 'References a non-existent reviewer markup',
      });
  }

  // Check phaseId on roof system and truss systems
  if (project.roofSystem?.phaseId && !phaseIds.has(project.roofSystem.phaseId)) {
    warnings.push({
      path: 'roofSystem',
      message: `phaseId references non-existent phase ${project.roofSystem.phaseId}`,
    });
  }
  for (const ts of project.trussSystems || []) {
    if (ts.phaseId && !phaseIds.has(ts.phaseId)) {
      warnings.push({ path: `trussSystem ${ts.id}`, message: `phaseId references non-existent phase ${ts.phaseId}` });
    }
  }

  // A ceiling hangs from beams on its own floor, so that is the only place a
  // support beam id may resolve.
  const beamIdsByFloor = new Map(
    project.floors.map((floor) => [floor.id, new Set((floor.beams || []).map((beam) => beam.id))]),
  );
  for (const ceiling of project.ceilings || []) {
    if (ceiling.phaseId && !phaseIds.has(ceiling.phaseId)) {
      warnings.push({
        path: `ceiling ${ceiling.id}`,
        message: `phaseId references non-existent phase ${ceiling.phaseId}`,
      });
    }
    if (ceiling.floorId && !floorIds.has(ceiling.floorId)) {
      warnings.push({
        path: `ceiling ${ceiling.id}`,
        message: `References non-existent floor ${ceiling.floorId}`,
      });
    }
    const floorBeamIds = beamIdsByFloor.get(ceiling.floorId) || new Set();
    for (const beamId of ceiling.attachment?.beamIds || []) {
      if (floorBeamIds.has(beamId)) continue;
      warnings.push({
        path: `ceiling ${ceiling.id}`,
        message: `attachment references non-existent support beam ${beamId}`,
      });
    }
  }

  // Check viewport phaseId references
  for (const sheet of project.sheets || []) {
    for (const vp of sheet.viewports || []) {
      if (vp.phaseId && !phaseIds.has(vp.phaseId)) {
        warnings.push({
          path: `sheet ${sheet.id} viewport ${vp.id}`,
          message: `phaseId references non-existent phase ${vp.phaseId}`,
        });
      }
    }
  }

  return warnings;
}

export function repairBrokenReferences(project) {
  const floorIds = new Set(project.floors.map((f) => f.id));
  const phaseIds = new Set((project.phases || []).map((p) => p.id));
  const unitInstanceIds = new Set((project.building?.unitInstances || []).map((instance) => instance.id));
  const unitTypeIds = new Set((project.building?.unitTypes || []).map((unitType) => unitType.id));
  const plumbingShaftIds = new Set((project.building?.systems?.plumbing?.shafts || []).map((shaft) => shaft.id));
  const electricalRiserIds = new Set(
    (project.building?.systems?.electrical?.riserZones || []).map((riser) => riser.id),
  );
  const parkingBayIds = new Set((project.building?.site?.parkingPlan?.bays || []).map((bay) => bay.id));
  const openingReferenceKeys = new Set(
    project.floors.flatMap((floor) =>
      (floor.slabs || []).flatMap((slab) =>
        (slab.openings || []).map((opening) => `${floor.id}:${slab.id}:${opening.id}`),
      ),
    ),
  );

  const repairedFloors = project.floors.map((floor) => {
    const wallIds = new Set((floor.walls || []).map((w) => w.id));
    const landingIds = new Set((floor.landings || []).map((l) => l.id));
    const columnIds = new Set((floor.columns || []).map((column) => column.id));
    const beamIds = new Set((floor.beams || []).map((beam) => beam.id));

    // Remove doors/windows/devices pointing to non-existent walls
    const doors = (floor.doors || []).filter((d) => !d.wallId || wallIds.has(d.wallId));
    const windows = (floor.windows || []).filter((w) => !w.wallId || wallIds.has(w.wallId));
    const electricalDevices = (floor.electricalDevices || []).filter(
      (device) => !device.wallId || wallIds.has(device.wallId),
    );

    // Nullify invalid stair landing attachments
    const stairs = (floor.stairs || []).map((stair) => {
      let changed = false;
      let startLandingAttachment = stair.startLandingAttachment;
      let endLandingAttachment = stair.endLandingAttachment;

      if (startLandingAttachment?.landingId && !landingIds.has(startLandingAttachment.landingId)) {
        startLandingAttachment = null;
        changed = true;
      }
      if (endLandingAttachment?.landingId && !landingIds.has(endLandingAttachment.landingId)) {
        endLandingAttachment = null;
        changed = true;
      }
      let coordination = stair.coordination;
      const clearanceRef = coordination?.clearanceOpeningRef;
      if (
        clearanceRef &&
        !openingReferenceKeys.has(`${clearanceRef.floorId}:${clearanceRef.slabId}:${clearanceRef.openingId}`)
      ) {
        coordination = { ...coordination, clearanceOpeningRef: null };
        changed = true;
      }
      return changed ? { ...stair, startLandingAttachment, endLandingAttachment, coordination } : stair;
    });

    // Strip vestigial placedSketchAssets from floors (legacy field, no longer used)
    const { placedSketchAssets: _placedSketchAssets, ...floorWithoutSketchAssets } = floor;

    // Nullify invalid phaseId references on floor objects
    const rooms = (floorWithoutSketchAssets.rooms || []).map((room) =>
      room.unitInstanceId && !unitInstanceIds.has(room.unitInstanceId)
        ? { ...room, unitInstanceId: null, spaceRequirementId: null }
        : room,
    );
    const fixtures = (floorWithoutSketchAssets.fixtures || []).map((fixture) =>
      fixture.plumbingShaftId && !plumbingShaftIds.has(fixture.plumbingShaftId)
        ? { ...fixture, plumbingShaftId: null }
        : fixture,
    );
    const slabs = (floorWithoutSketchAssets.slabs || []).map((slab) => ({
      ...slab,
      supportRefs: (slab.supportRefs || []).filter(
        (ref) =>
          (ref.kind === 'beam' && beamIds.has(ref.id)) ||
          (ref.kind === 'wall' && wallIds.has(ref.id)) ||
          (ref.kind === 'column' && columnIds.has(ref.id)),
      ),
      openings: (slab.openings || []).map((opening) => {
        const ref = opening.serviceRef;
        const valid =
          !ref ||
          (ref.kind === 'plumbing' && plumbingShaftIds.has(ref.id)) ||
          (ref.kind === 'electrical' && electricalRiserIds.has(ref.id));
        return valid ? opening : { ...opening, serviceRef: null };
      }),
    }));
    const repairedFloor = {
      ...floorWithoutSketchAssets,
      doors,
      windows,
      electricalDevices,
      stairs,
      rooms,
      fixtures,
      slabs,
    };
    for (const key of PHASE_ASSIGNABLE_KEYS) {
      const arr = repairedFloor[key];
      if (!Array.isArray(arr)) continue;
      repairedFloor[key] = arr.map((obj) =>
        obj.phaseId && !phaseIds.has(obj.phaseId) ? { ...obj, phaseId: null } : obj,
      );
    }

    return repairedFloor;
  });

  // Nullify invalid phaseId on roof system
  let roofSystem = project.roofSystem;
  if (roofSystem?.phaseId && !phaseIds.has(roofSystem.phaseId)) {
    roofSystem = { ...roofSystem, phaseId: null };
  }
  if (roofSystem) {
    const roofPlaneIds = new Set((roofSystem.roofPlanes || []).map((plane) => plane.id));
    roofSystem = {
      ...roofSystem,
      drains: (roofSystem.drains || []).map((drain) => ({
        ...drain,
        catchmentPlaneIds: (drain.catchmentPlaneIds || []).filter((id) => roofPlaneIds.has(id)),
        outletRef:
          drain.outletRef?.kind === 'plumbing_shaft' && !plumbingShaftIds.has(drain.outletRef.id)
            ? null
            : drain.outletRef,
      })),
    };
  }

  // Nullify invalid phaseId on truss systems
  const trussSystems = (project.trussSystems || []).map((ts) =>
    ts.phaseId && !phaseIds.has(ts.phaseId) ? { ...ts, phaseId: null } : ts,
  );

  // Nullify invalid phaseId on ceilings, and drop support beams that are gone.
  // A ceiling left with fewer than two of them has nothing to take a boundary
  // from, so it stands on its own datum instead — at the height it is hanging at
  // now, because manual mode stores the boards and beam mode stored the plane
  // above them.
  const ceilingBeamIdsByFloor = new Map(
    repairedFloors.map((floor) => [floor.id, new Set((floor.beams || []).map((beam) => beam.id))]),
  );
  const ceilings = (project.ceilings || []).map((ceiling) => {
    let repaired = ceiling;
    if (ceiling.phaseId && !phaseIds.has(ceiling.phaseId)) {
      repaired = { ...repaired, phaseId: null };
    }

    const storedBeamIds = ceiling.attachment?.beamIds || [];
    const floorBeamIds = ceilingBeamIdsByFloor.get(ceiling.floorId) || new Set();
    const resolvedBeamIds = storedBeamIds.filter((beamId) => floorBeamIds.has(beamId));
    if (resolvedBeamIds.length !== storedBeamIds.length) {
      const stranded = ceiling.attachment?.mode === 'beam' && resolvedBeamIds.length < 2;
      repaired = {
        ...repaired,
        attachment: stranded ? { mode: 'manual', beamIds: [] } : { ...ceiling.attachment, beamIds: resolvedBeamIds },
        ...(stranded ? { baseElevation: resolveCeilingElevations(project, ceiling).boardUnderside } : {}),
      };
    }
    return repaired;
  });

  // Nullify invalid viewport phaseId references
  const sheets = (project.sheets || []).map((sheet) => ({
    ...sheet,
    viewports: (sheet.viewports || []).map((vp) =>
      vp.phaseId && !phaseIds.has(vp.phaseId) ? { ...vp, phaseId: null, phaseViewMode: 'all' } : vp,
    ),
  }));

  const roomIdsByFloor = new Map(
    repairedFloors.map((floor) => [floor.id, new Set((floor.rooms || []).map((room) => room.id))]),
  );
  const plumbing = project.building?.systems?.plumbing || {};
  const electrical = project.building?.systems?.electrical || {};
  const repairEquipmentZone = (zone) => ({
    ...zone,
    servedFloorIds: (zone.servedFloorIds || []).filter((id) => floorIds.has(id)),
  });
  const panelZones = (electrical.panelZones || [])
    .filter((zone) => zone.location !== 'floor' || floorIds.has(zone.floorId))
    .map(repairEquipmentZone);
  const repairedPanelIds = new Set(panelZones.map((zone) => zone.id));
  const repairedElectrical = {
    ...electrical,
    panelZones,
    points: (electrical.points || []).filter(
      (point) => floorIds.has(point.floorId) && repairedPanelIds.has(point.panelZoneId),
    ),
  };
  const water = project.building?.systems?.water || {};
  const mechanical = project.building?.systems?.mechanical || {};
  const exits = (project.building?.systems?.egress?.exits || []).filter((exit) => floorIds.has(exit.floorId));
  const exitById = new Map(exits.map((exit) => [exit.id, exit]));
  const egress = {
    ...(project.building?.systems?.egress || {}),
    exits,
    routes: (project.building?.systems?.egress?.routes || []).filter((route) => {
      const exit = exitById.get(route.exitId);
      return (
        floorIds.has(route.floorId) &&
        roomIdsByFloor.get(route.floorId)?.has(route.fromRoomId) &&
        exit?.floorId === route.floorId
      );
    }),
  };
  const quantityProfile = project.building?.quantityProfile || {};
  const priceProfileIds = new Set((quantityProfile.priceProfiles || []).map((entry) => entry.id));
  const scenarios = (quantityProfile.scenarios || []).filter(
    (scenario) => scenario.priceProfileId && priceProfileIds.has(scenario.priceProfileId),
  );
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const repairedQuantityProfile = {
    ...quantityProfile,
    scenarios,
    activeScenarioId: scenarioIds.has(quantityProfile.activeScenarioId)
      ? quantityProfile.activeScenarioId
      : scenarios[0]?.id || null,
  };
  const costRealization = project.building?.costRealization || {};
  const costRealizationRefsValid =
    scenarioIds.has(costRealization.baselineScenarioId) &&
    priceProfileIds.has(costRealization.baselinePriceProfileId) &&
    (costRealization.valueEngineeringOpportunities || []).every(
      (opportunity) =>
        scenarioIds.has(opportunity.baselineScenarioId) && scenarioIds.has(opportunity.alternativeScenarioId),
    );
  const repairedCostRealization =
    costRealization.status !== 'realized' || costRealizationRefsValid
      ? costRealization
      : {
          ...costRealization,
          status: 'not_realized',
          sourceTestFitId: null,
          sourceServicesRealizationSignature: '',
          inputSignature: '',
          baselineScenarioId: null,
          baselinePriceProfileId: null,
          pricingComplete: false,
          lineItemSnapshots: [],
          scenarioSnapshots: [],
          valueEngineeringOpportunities: [],
          realizedMetrics: {},
        };
  const documentation = project.building?.documentation || {};
  const revisionIds = new Set((documentation.revisionSnapshots || []).map((entry) => entry.id));
  const repairedDocumentation = {
    ...documentation,
    activeRevisionId: revisionIds.has(documentation.activeRevisionId)
      ? documentation.activeRevisionId
      : (documentation.revisionSnapshots || []).at(-1)?.id || null,
  };
  const sheetIds = new Set((project.sheets || []).map((entry) => entry.id));
  const documentationRealization = project.building?.documentationRealization || {};
  const documentationRealizationRefsValid =
    revisionIds.has(documentationRealization.sourceRevisionId) &&
    (documentationRealization.sheetSnapshots || []).every((entry) => sheetIds.has(entry.id));
  const repairedDocumentationRealization =
    documentationRealization.status !== 'issued' || documentationRealizationRefsValid
      ? documentationRealization
      : {
          ...documentationRealization,
          status: 'not_issued',
          id: null,
          packageId: null,
          sourceTestFitId: null,
          sourceCostRealizationSignature: '',
          sourceRevisionId: null,
          sourceRevisionSignature: '',
          sourceModelSignature: '',
          inputSignature: '',
          issueCode: '',
          issueLabel: '',
          issueDate: '',
          preparedBy: '',
          sheetSnapshots: [],
          deliverableSnapshots: [],
          unresolvedFindingSnapshots: [],
          annotationSnapshots: [],
        };
  const professionalExchange = project.building?.professionalExchange || {};
  const validExchangeIds = new Set((professionalExchange.exchanges || []).map((entry) => entry.id));
  const repairedMarkups = (professionalExchange.reviewerMarkups || []).filter((entry) =>
    validExchangeIds.has(entry.exchangeId),
  );
  const validMarkupIds = new Set(repairedMarkups.map((entry) => entry.id));
  const repairedProfessionalExchange = {
    ...professionalExchange,
    activeExchangeId: validExchangeIds.has(professionalExchange.activeExchangeId)
      ? professionalExchange.activeExchangeId
      : (professionalExchange.exchanges || []).at(-1)?.id || null,
    reviewerMarkups: repairedMarkups,
    externalResponses: (professionalExchange.externalResponses || []).filter((entry) =>
      validMarkupIds.has(entry.markupId),
    ),
  };
  const testFitOptions = (project.building?.testFitOptions || []).filter((option) =>
    (option.floorPlans || []).every((plan) =>
      (plan.blocks || []).every(
        (block) => block.kind !== 'unit' || !block.unitTypeId || unitTypeIds.has(block.unitTypeId),
      ),
    ),
  );
  const testFitOptionIds = new Set(testFitOptions.map((option) => option.id));
  const apartmentDesign = project.building?.apartmentDesign || {};
  const repairedApartmentDesign = {
    ...apartmentDesign,
    status:
      apartmentDesign.sourceTestFitId && testFitOptionIds.has(apartmentDesign.sourceTestFitId)
        ? apartmentDesign.status
        : 'not_detailed',
    sourceTestFitId: testFitOptionIds.has(apartmentDesign.sourceTestFitId) ? apartmentDesign.sourceTestFitId : null,
    inputSignature: testFitOptionIds.has(apartmentDesign.sourceTestFitId) ? apartmentDesign.inputSignature : '',
    detailedUnitInstanceIds: (apartmentDesign.detailedUnitInstanceIds || []).filter((id) => unitInstanceIds.has(id)),
  };
  const structural = project.building?.systems?.structural || {};
  const validStackIds = new Set((structural.columnStacks || []).map((stack) => stack.id));
  const validColumnIds = new Set(repairedFloors.flatMap((floor) => (floor.columns || []).map((column) => column.id)));
  const validBeamIds = new Set(repairedFloors.flatMap((floor) => (floor.beams || []).map((beam) => beam.id)));
  const realization = structural.realization || {};
  const realizationRefsValid = [
    ['columnStacks', validStackIds],
    ['columns', validColumnIds],
    ['beams', validBeamIds],
  ].every(([collection, validIds]) =>
    (realization.generatedEntityRefs?.[collection] || []).every((id) => validIds.has(id)),
  );
  const realizationSourceValid = testFitOptionIds.has(realization.sourceTestFitId);
  const repairedRealization =
    realizationSourceValid && realizationRefsValid
      ? realization
      : {
          ...realization,
          status: 'not_realized',
          sourceTestFitId: null,
          sourceApartmentDesignSignature: '',
          inputSignature: '',
          generatedEntityRefs: { columnStacks: [], columns: [], beams: [] },
          skippedBeamSegments: [],
        };
  const building = {
    ...project.building,
    testFitOptions,
    selectedTestFitId: testFitOptionIds.has(project.building.selectedTestFitId)
      ? project.building.selectedTestFitId
      : null,
    acceptedTestFitId: testFitOptionIds.has(project.building.acceptedTestFitId)
      ? project.building.acceptedTestFitId
      : null,
    apartmentDesign: repairedApartmentDesign,
    site: {
      ...project.building.site,
      parkingPlan: {
        ...project.building.site?.parkingPlan,
        bays: project.building.site?.parkingPlan?.bays || [],
        accessRoutes: (project.building.site?.parkingPlan?.accessRoutes || []).map((route) => ({
          ...route,
          servedBayIds: (route.servedBayIds || []).filter((id) => parkingBayIds.has(id)),
        })),
      },
    },
    quantityProfile: repairedQuantityProfile,
    costRealization: repairedCostRealization,
    documentation: repairedDocumentation,
    documentationRealization: repairedDocumentationRealization,
    professionalExchange: repairedProfessionalExchange,
    systems: {
      ...project.building.systems,
      structural: { ...structural, realization: repairedRealization },
      plumbing: {
        ...plumbing,
        drainageRoutes: (plumbing.drainageRoutes || []).filter(
          (route) => floorIds.has(route.floorId) && plumbingShaftIds.has(route.sourceShaftId),
        ),
      },
      electrical: repairedElectrical,
      water: {
        ...water,
        equipmentZones: (water.equipmentZones || [])
          .filter((zone) => zone.location !== 'floor' || floorIds.has(zone.floorId))
          .map(repairEquipmentZone),
      },
      mechanical: {
        ...mechanical,
        outdoorUnitZones: (mechanical.outdoorUnitZones || [])
          .filter((zone) => zone.location !== 'floor' || floorIds.has(zone.floorId))
          .map(repairEquipmentZone),
      },
      egress,
    },
  };

  return { ...project, building, floors: repairedFloors, roofSystem, trussSystems, ceilings, sheets };
}

export function validateAndRepair(project) {
  const structuralErrors = validateProjectStructure(project);
  if (structuralErrors.length > 0) {
    throw new ProjectValidationError(
      `Project failed structural validation: ${structuralErrors.map((e) => e.message).join('; ')}`,
      structuralErrors,
    );
  }

  const warnings = validateProjectReferences(project);
  if (warnings.length > 0) {
    console.warn('[persistence] Referential integrity warnings:', warnings);
    return syncCanonicalBuilding(repairBrokenReferences(project));
  }

  return syncCanonicalBuilding(project);
}
