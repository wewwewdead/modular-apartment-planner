import { DESIGN_CONFIDENCE } from './trustModels';

export const REVIEW_DISCIPLINES = Object.freeze([
  'architectural',
  'structural',
  'plumbing',
  'electrical',
  'cost',
  'permit',
  'general',
]);

export const REVIEW_STATUSES = Object.freeze(['open', 'resolved', 'accepted_for_handoff']);

const FLOOR_COLLECTIONS = Object.freeze([
  'walls',
  'doors',
  'windows',
  'columns',
  'beams',
  'slabs',
  'stairs',
  'landings',
  'rooms',
  'fixtures',
  'railings',
  'sectionCuts',
]);

function cloneRefs(refs = []) {
  return refs.filter((entry) => entry?.type && entry?.id).map((entry) => ({ type: entry.type, id: entry.id }));
}

export function createDesignAssumption(overrides = {}) {
  return {
    id: overrides.id,
    title: overrides.title || '',
    category: overrides.category || 'general',
    statement: overrides.statement || '',
    sourceLabel: overrides.sourceLabel || '',
    sourceDate: overrides.sourceDate || '',
    status: overrides.status === 'superseded' ? 'superseded' : 'active',
    entityRefs: cloneRefs(overrides.entityRefs),
    confidence: DESIGN_CONFIDENCE.CHECKED,
    professionalReviewRequired: true,
  };
}

export function createProfessionalReviewItem(overrides = {}) {
  const confidence = Object.values(DESIGN_CONFIDENCE).includes(overrides.confidence)
    ? overrides.confidence
    : DESIGN_CONFIDENCE.MODELED;
  return {
    id: overrides.id,
    title: overrides.title || '',
    discipline: REVIEW_DISCIPLINES.includes(overrides.discipline) ? overrides.discipline : 'general',
    severity: ['information', 'warning', 'action'].includes(overrides.severity) ? overrides.severity : 'action',
    status: REVIEW_STATUSES.includes(overrides.status) ? overrides.status : 'open',
    comment: overrides.comment || '',
    resolution: overrides.resolution || '',
    entityRefs: cloneRefs(overrides.entityRefs),
    confidence,
    createdBy: overrides.createdBy || '',
    createdDate: overrides.createdDate || '',
    externalVerification:
      confidence === DESIGN_CONFIDENCE.ENGINEER_VERIFIED
        ? {
            professionalName: overrides.externalVerification?.professionalName || '',
            profession: overrides.externalVerification?.profession || '',
            licenseId: overrides.externalVerification?.licenseId || '',
            verificationDate: overrides.externalVerification?.verificationDate || '',
            scopeNote: overrides.externalVerification?.scopeNote || '',
          }
        : null,
    professionalReviewRequired: confidence !== DESIGN_CONFIDENCE.ENGINEER_VERIFIED,
  };
}

export function createDocumentationModel(overrides = {}) {
  return {
    reviewItems: (overrides.reviewItems || []).filter((entry) => entry?.id).map(createProfessionalReviewItem),
    revisionSnapshots: (overrides.revisionSnapshots || [])
      .filter((entry) => entry?.id)
      .map((entry) => ({
        ...entry,
        entityRecords: (entry.entityRecords || []).map((record) => ({ ...record })),
        summary: { ...(entry.summary || {}) },
        professionalReviewRequired: true,
      })),
    activeRevisionId: overrides.activeRevisionId || null,
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

function record(kind, id, value, floorId = null) {
  return { key: `${kind}:${id}`, kind, id, floorId, fingerprint: hashValue(value) };
}

export function deriveRevisionEntityRecords(project) {
  const building = project?.building || {};
  const { parkingPlan = {}, ...siteBasis } = building.site || {};
  const records = [
    record('projectBrief', building.id || project?.id || 'building', building.brief || {}),
    record('site', building.site?.boundaryId || 'site', siteBasis),
  ];
  for (const floor of project?.floors || []) {
    records.push(
      record(
        'level',
        floor.id,
        {
          name: floor.name,
          level: floor.level,
          elevation: floor.elevation,
          floorToFloorHeight: floor.floorToFloorHeight,
        },
        floor.id,
      ),
    );
    for (const collection of FLOOR_COLLECTIONS) {
      for (const entity of floor[collection] || []) {
        if (entity?.id) records.push(record(collection, entity.id, entity, floor.id));
      }
    }
  }
  for (const entity of building.unitTypes || []) records.push(record('unitType', entity.id, entity));
  for (const entity of building.unitInstances || [])
    records.push(record('unitInstance', entity.id, entity, entity.floorId));
  records.push(record('testFitProfile', building.id || project?.id || 'building', building.testFitProfile || {}));
  for (const entity of building.testFitOptions || []) records.push(record('testFitOption', entity.id, entity));
  records.push(
    record('testFitSelection', building.id || project?.id || 'building', {
      selectedTestFitId: building.selectedTestFitId || null,
      acceptedTestFitId: building.acceptedTestFitId || null,
    }),
  );
  records.push(
    record('apartmentDesignProfile', building.id || project?.id || 'building', building.apartmentDesignProfile || {}),
  );
  records.push(
    record('apartmentDesignState', building.id || project?.id || 'building', building.apartmentDesign || {}),
  );
  const structural = building.systems?.structural || {};
  records.push(
    record(
      'structuralRealizationProfile',
      structural.id || building.id || project?.id || 'building',
      structural.realizationProfile || {},
    ),
  );
  records.push(
    record(
      'structuralRealizationState',
      structural.id || building.id || project?.id || 'building',
      structural.realization || {},
    ),
  );
  records.push(
    record(
      'servicesRealizationProfile',
      building.id || project?.id || 'building',
      building.systems?.realizationProfile || {},
    ),
  );
  records.push(
    record('servicesRealizationState', building.id || project?.id || 'building', building.systems?.realization || {}),
  );
  records.push(
    record('costRealizationProfile', building.id || project?.id || 'building', building.costRealizationProfile || {}),
  );
  records.push(
    record('costRealizationState', building.id || project?.id || 'building', building.costRealization || {}),
  );
  for (const entity of building.costRealization?.valueEngineeringOpportunities || []) {
    if (entity?.id) records.push(record('valueEngineeringOpportunity', entity.id, entity));
  }
  for (const entity of structural.gridSystems || []) records.push(record('structuralGrid', entity.id, entity));
  for (const entity of structural.columnStacks || []) records.push(record('columnStack', entity.id, entity));
  for (const [kind, entities] of [
    ['parkingBay', parkingPlan.bays],
    ['vehicleAccessRoute', parkingPlan.accessRoutes],
    ['plumbingShaft', building.systems?.plumbing?.shafts],
    ['drainageRoute', building.systems?.plumbing?.drainageRoutes],
    ['electricalRiser', building.systems?.electrical?.riserZones],
    ['electricalPanelZone', building.systems?.electrical?.panelZones],
    ['electricalPoint', building.systems?.electrical?.points],
    ['waterEquipmentZone', building.systems?.water?.equipmentZones],
    ['mechanicalOutdoorUnitZone', building.systems?.mechanical?.outdoorUnitZones],
    ['egressExit', building.systems?.egress?.exits],
    ['egressRoute', building.systems?.egress?.routes],
    ['priceProfile', building.quantityProfile?.priceProfiles],
    ['assemblyDefinition', building.quantityProfile?.assemblies],
    ['feasibilityScenario', building.quantityProfile?.scenarios],
  ]) {
    for (const entity of entities || []) if (entity?.id) records.push(record(kind, entity.id, entity, entity.floorId));
  }
  if (project?.roofSystem?.id) records.push(record('roofSystem', project.roofSystem.id, project.roofSystem));
  for (const entity of project?.trussSystems || [])
    if (entity?.id) records.push(record('trussSystem', entity.id, entity));
  return records.sort((a, b) => a.key.localeCompare(b.key));
}

function summarize(records) {
  return records.reduce((summary, entry) => ({ ...summary, [entry.kind]: (summary[entry.kind] || 0) + 1 }), {});
}

export function deriveRevisionBasisSignature(project) {
  return hashValue(deriveRevisionEntityRecords(project));
}

export function createRevisionSnapshot(project, overrides = {}, validationIssueCount = 0) {
  const entityRecords = deriveRevisionEntityRecords(project);
  return {
    id: overrides.id,
    code: overrides.code || '',
    label: overrides.label || '',
    date: overrides.date || '',
    author: overrides.author || '',
    purpose: overrides.purpose || 'professional_review',
    note: overrides.note || '',
    projectVersion: project?.version ?? null,
    basisSignature: hashValue(entityRecords),
    entityRecords,
    summary: summarize(entityRecords),
    validationIssueCount,
    professionalReviewRequired: true,
  };
}

export function deriveRevisionComparison(project, revisionId = null) {
  const documentation = createDocumentationModel(project?.building?.documentation);
  const baseline =
    documentation.revisionSnapshots.find((entry) => entry.id === (revisionId || documentation.activeRevisionId)) ||
    documentation.revisionSnapshots.at(-1) ||
    null;
  const currentRecords = deriveRevisionEntityRecords(project);
  const currentByKey = new Map(currentRecords.map((entry) => [entry.key, entry]));
  const baselineByKey = new Map((baseline?.entityRecords || []).map((entry) => [entry.key, entry]));
  const added = currentRecords.filter((entry) => !baselineByKey.has(entry.key));
  const removed = (baseline?.entityRecords || []).filter((entry) => !currentByKey.has(entry.key));
  const changed = currentRecords.filter((entry) => {
    const prior = baselineByKey.get(entry.key);
    return prior && prior.fingerprint !== entry.fingerprint;
  });
  const currentSignature = hashValue(currentRecords);
  return {
    baseline,
    baselineRevisionId: baseline?.id || null,
    baselineSignature: baseline?.basisSignature || null,
    currentSignature,
    isCurrent: Boolean(baseline && baseline.basisSignature === currentSignature),
    added,
    removed,
    changed,
    changeCount: added.length + removed.length + changed.length,
    currentSummary: summarize(currentRecords),
    professionalReviewRequired: true,
  };
}

function issue(ruleId, severity, message, entityRefs, inputs) {
  return {
    id: `${ruleId}:${entityRefs.map((entry) => `${entry.type}:${entry.id}`).join('|')}`,
    ruleId,
    category: 'professional_handoff',
    severity,
    message,
    entityRefs,
    evidence: { resultKind: 'handoff_traceability_check', confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

export function deriveProfessionalHandoff(project) {
  const documentation = createDocumentationModel(project?.building?.documentation);
  const assumptions = (project?.building?.assumptions || []).map(createDesignAssumption);
  const openReviewItems = documentation.reviewItems.filter((entry) => entry.status === 'open');
  const engineerVerifiedItems = documentation.reviewItems.filter(
    (entry) => entry.confidence === DESIGN_CONFIDENCE.ENGINEER_VERIFIED,
  );
  return {
    assumptions,
    documentation,
    apartmentDesignProfile: project?.building?.apartmentDesignProfile || null,
    apartmentDesignState: project?.building?.apartmentDesign || null,
    structuralRealizationProfile: project?.building?.systems?.structural?.realizationProfile || null,
    structuralRealizationState: project?.building?.systems?.structural?.realization || null,
    servicesRealizationProfile: project?.building?.systems?.realizationProfile || null,
    servicesRealizationState: project?.building?.systems?.realization || null,
    costRealizationProfile: project?.building?.costRealizationProfile || null,
    costRealizationState: project?.building?.costRealization || null,
    documentationRealizationProfile: project?.building?.documentationRealizationProfile || null,
    documentationRealizationState: project?.building?.documentationRealization || null,
    professionalExchangeProfile: project?.building?.professionalExchangeProfile || null,
    professionalExchangeState: project?.building?.professionalExchange || null,
    openReviewItems,
    engineerVerifiedItems,
    revisionComparison: deriveRevisionComparison(project),
    professionalReviewRequired: true,
  };
}

export function validateProfessionalHandoff(project) {
  const handoff = deriveProfessionalHandoff(project);
  const issues = [];
  for (const assumption of handoff.assumptions.filter((entry) => entry.status === 'active')) {
    if (assumption.title && assumption.statement && assumption.sourceLabel && assumption.sourceDate) continue;
    issues.push(
      issue(
        'HANDOFF.ASSUMPTION_SOURCE_INCOMPLETE',
        'warning',
        `${assumption.title || assumption.id} needs a statement, source, and source date.`,
        [{ type: 'designAssumption', id: assumption.id }],
        {
          title: assumption.title,
          sourceLabel: assumption.sourceLabel,
          sourceDate: assumption.sourceDate,
        },
      ),
    );
  }
  for (const review of handoff.documentation.reviewItems) {
    if (review.status === 'open') {
      issues.push(
        issue(
          'HANDOFF.REVIEW_ITEM_OPEN',
          review.severity === 'action' ? 'warning' : 'info',
          `${review.title} remains open for ${review.discipline} review.`,
          [{ type: 'professionalReviewItem', id: review.id }],
          { status: review.status, discipline: review.discipline },
        ),
      );
    }
    if (review.status !== 'open' && !review.resolution.trim()) {
      issues.push(
        issue(
          'HANDOFF.RESOLUTION_MISSING',
          'warning',
          `${review.title} is closed without a recorded resolution.`,
          [{ type: 'professionalReviewItem', id: review.id }],
          { status: review.status },
        ),
      );
    }
    if (review.confidence === DESIGN_CONFIDENCE.ENGINEER_VERIFIED) {
      const verification = review.externalVerification || {};
      if (
        !verification.professionalName ||
        !verification.profession ||
        !verification.licenseId ||
        !verification.verificationDate ||
        !verification.scopeNote
      ) {
        issues.push(
          issue(
            'HANDOFF.EXTERNAL_VERIFICATION_INCOMPLETE',
            'error',
            `${review.title} cannot be represented as engineer-verified without complete external verifier identity, date, and scope.`,
            [{ type: 'professionalReviewItem', id: review.id }],
            verification,
          ),
        );
      }
    }
  }
  if (handoff.revisionComparison.baseline && !handoff.revisionComparison.isCurrent) {
    issues.push(
      issue(
        'HANDOFF.REVISION_BASIS_CHANGED',
        'warning',
        'The coordinated model has changed since the active review revision was captured.',
        [{ type: 'revisionSnapshot', id: handoff.revisionComparison.baseline.id }],
        {
          baselineSignature: handoff.revisionComparison.baselineSignature,
          currentSignature: handoff.revisionComparison.currentSignature,
          changeCount: handoff.revisionComparison.changeCount,
        },
      ),
    );
  }
  return issues;
}
