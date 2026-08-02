import { buildAnnotationScene } from '@/annotations/scene';
import { deriveCostRealization } from './costRealization';
import { deriveDocumentModelSignature } from './documentSignature';
import { derivePreliminaryPackage, PRELIMINARY_PACKAGE_KIND } from './documentPackage';
import { deriveProfessionalHandoff } from './professionalHandoff';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_DOCUMENTATION_REALIZATION_PROFILE = Object.freeze({
  id: 'nu_professional_review_documentation_v1',
  packageId: 'nu_review',
  paperSize: 'A3_LANDSCAPE',
  planScale: 100,
  requireSection: true,
  requireCurrentReviewRevision: true,
  requiredDeliverableIds: [
    'project_basis',
    'site_plan',
    'floor_plans',
    'elevations',
    'section',
    'structural_layout',
    'services_layout',
    'opening_schedule',
    'area_schedule',
    'quantity_summary',
    'feasibility_summary',
    'cost_realization_basis',
    'validation_report',
    'coordinated_3d',
    'professional_handoff',
  ],
  source: 'single_coordinated_model_and_active_review_revision',
  purpose: 'licensed_professional_review_only',
});

export function createDocumentationRealizationProfile(overrides = {}) {
  return {
    ...DEFAULT_DOCUMENTATION_REALIZATION_PROFILE,
    ...overrides,
    packageId: String(overrides.packageId || DEFAULT_DOCUMENTATION_REALIZATION_PROFILE.packageId),
    paperSize: DEFAULT_DOCUMENTATION_REALIZATION_PROFILE.paperSize,
    planScale: DEFAULT_DOCUMENTATION_REALIZATION_PROFILE.planScale,
    requireSection: true,
    requireCurrentReviewRevision: true,
    requiredDeliverableIds: [...DEFAULT_DOCUMENTATION_REALIZATION_PROFILE.requiredDeliverableIds],
    source: DEFAULT_DOCUMENTATION_REALIZATION_PROFILE.source,
    purpose: DEFAULT_DOCUMENTATION_REALIZATION_PROFILE.purpose,
  };
}

function clone(entry) {
  return JSON.parse(JSON.stringify(entry));
}

export function createDocumentationRealizationState(overrides = {}) {
  return {
    status: overrides.status || 'not_issued',
    id: overrides.id || null,
    packageId: overrides.packageId || null,
    sourceTestFitId: overrides.sourceTestFitId || null,
    sourceCostRealizationSignature: overrides.sourceCostRealizationSignature || '',
    sourceRevisionId: overrides.sourceRevisionId || null,
    sourceRevisionSignature: overrides.sourceRevisionSignature || '',
    sourceModelSignature: overrides.sourceModelSignature || '',
    inputSignature: overrides.inputSignature || '',
    issueCode: overrides.issueCode || '',
    issueLabel: overrides.issueLabel || '',
    issueDate: overrides.issueDate || '',
    preparedBy: overrides.preparedBy || '',
    sheetSnapshots: (overrides.sheetSnapshots || []).map(clone),
    deliverableSnapshots: (overrides.deliverableSnapshots || []).map(clone),
    unresolvedFindingSnapshots: (overrides.unresolvedFindingSnapshots || []).map(clone),
    annotationSnapshots: (overrides.annotationSnapshots || []).map(clone),
    packageKind: PRELIMINARY_PACKAGE_KIND,
    exportStatus: 'ready_for_user_export_not_exported',
    supportedExportFormats: ['pdf', 'png'],
    permitStatus: 'not_a_permit_submission',
    constructionStatus: 'not_for_construction',
    professionalSealStatus: 'not_provided',
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

function activeRevision(project) {
  const documentation = project?.building?.documentation || {};
  return (documentation.revisionSnapshots || []).find((entry) => entry.id === documentation.activeRevisionId) || null;
}

function requiredDeliverableIds(project, profile) {
  const required = [...profile.requiredDeliverableIds];
  if (project.roofSystem || project.building?.brief?.roofType) required.push('roof_plan');
  if ((project.building?.brief?.parkingRequirement || 0) > 0) required.push('site_access');
  return [...new Set(required)];
}

function expectedReportIds(project) {
  const ids = [
    'test_fit_comparison',
    'apartment_design_quality',
    'structural_realization_basis',
    'services_realization_basis',
    'cost_realization_basis',
    'area_schedule',
    'opening_schedule',
    'structural_schedule',
    'services_schedule',
    'quantity_summary',
    'feasibility_summary',
  ];
  if (project.building?.documentationRealization?.status === 'issued') ids.push('documentation_realization_basis');
  return ids;
}

function deriveAnnotationSnapshots(project) {
  return (project.floors || []).map((floor) => {
    const scene = buildAnnotationScene(floor);
    return {
      floorId: floor.id,
      floorName: floor.name,
      dimensionCount: scene.dimensions.length,
      manualDimensionCount: scene.manualDimensions.length,
      tagCount: scene.tags.length,
      annotationPolicy: 'canonical_derived_dimensions_and_object_tags',
    };
  });
}

function sheetFaults(project, sheets) {
  const faults = [];
  const numbers = new Set();
  const floorIds = new Set((project.floors || []).map((floor) => floor.id));
  for (const sheet of sheets) {
    if (!sheet.number || !sheet.title || !sheet.drawingName)
      faults.push({ code: 'sheet_metadata_incomplete', sheetId: sheet.id });
    if (numbers.has(sheet.number))
      faults.push({ code: 'duplicate_sheet_number', sheetId: sheet.id, sheetNumber: sheet.number });
    numbers.add(sheet.number);
    if (!sheet.issueDate || !sheet.titleBlock?.drawnBy)
      faults.push({ code: 'sheet_issue_metadata_incomplete', sheetId: sheet.id });
    if (!(sheet.viewports || []).length) faults.push({ code: 'empty_sheet', sheetId: sheet.id });
    for (const viewport of sheet.viewports || []) {
      if (!(viewport.width > 0) || !(viewport.height > 0) || !(viewport.scale > 0))
        faults.push({ code: 'invalid_viewport_geometry', sheetId: sheet.id, viewportId: viewport.id });
      if (viewport.sourceFloorId && !floorIds.has(viewport.sourceFloorId))
        faults.push({ code: 'missing_viewport_floor', sheetId: sheet.id, viewportId: viewport.id });
    }
  }
  const byNumber = new Map(sheets.map((sheet) => [sheet.number, sheet]));
  for (const requiredNumber of ['G-001', 'G-002', 'G-003', 'A-001', 'A-301', 'A-401', 'A-501', 'Q-001']) {
    if (!byNumber.has(requiredNumber)) faults.push({ code: 'required_sheet_missing', sheetNumber: requiredNumber });
  }
  for (let index = 0; index < (project.floors || []).length; index += 1) {
    for (const prefix of ['A', 'S', 'M']) {
      const number = `${prefix}-${String(101 + index).padStart(3, '0')}`;
      if (!byNumber.has(number)) faults.push({ code: 'level_sheet_missing', sheetNumber: number });
    }
  }
  const reportRefs = new Set((byNumber.get('Q-001')?.viewports || []).map((entry) => entry.sourceRefId));
  for (const reportId of expectedReportIds(project)) {
    if (!reportRefs.has(reportId)) faults.push({ code: 'required_schedule_missing', reportId });
  }
  return faults;
}

export function documentationRealizationInputSignature(
  project,
  profile = createDocumentationRealizationProfile(project?.building?.documentationRealizationProfile),
) {
  const revision = activeRevision(project);
  const cost = deriveCostRealization(project);
  return hashValue({
    modelSignature: deriveDocumentModelSignature(project),
    acceptedTestFitId: project?.building?.acceptedTestFitId || null,
    costRealizationSignature: cost.state.inputSignature,
    revisionId: revision?.id || null,
    revisionSignature: revision?.basisSignature || '',
    profile,
  });
}

export function deriveDocumentationCompleteness(project, profileOverrides = {}) {
  const profile = createDocumentationRealizationProfile({
    ...project?.building?.documentationRealizationProfile,
    ...profileOverrides,
  });
  const manifest = derivePreliminaryPackage(project, profile.packageId, { skipValidation: true });
  const byId = new Map(manifest.deliverables.map((entry) => [entry.id, entry]));
  const requiredIds = requiredDeliverableIds(project, profile);
  const missingDeliverables = requiredIds
    .filter((id) => !byId.get(id)?.ready)
    .map((id) => byId.get(id) || { id, label: id, ready: false });
  const annotationSnapshots = deriveAnnotationSnapshots(project);
  const annotationFaults = annotationSnapshots.flatMap((entry) => {
    const floor = (project.floors || []).find((candidate) => candidate.id === entry.floorId);
    if (!(floor?.walls || []).length) return [];
    const faults = [];
    if (!entry.dimensionCount) faults.push({ code: 'plan_dimensions_missing', floorId: entry.floorId });
    if (!entry.tagCount) faults.push({ code: 'plan_tags_missing', floorId: entry.floorId });
    return faults;
  });
  const faults = sheetFaults(project, manifest.sheets);
  return {
    profile,
    manifest,
    requiredDeliverableIds: requiredIds,
    missingDeliverables,
    sheetFaults: faults,
    annotationSnapshots,
    annotationFaults,
    complete: missingDeliverables.length === 0 && faults.length === 0 && annotationFaults.length === 0,
  };
}

function snapshotFinding(entry) {
  return {
    id: entry.id,
    ruleId: entry.ruleId,
    category: entry.category,
    severity: entry.severity,
    message: entry.message,
    entityRefs: clone(entry.entityRefs || []),
    professionalReviewRequired: true,
  };
}

function snapshotSheet(sheet) {
  return {
    id: sheet.id,
    number: sheet.number,
    title: sheet.title,
    paperSize: sheet.paperSize,
    issueDate: sheet.issueDate,
    drawnBy: sheet.titleBlock?.drawnBy || '',
    revisionCodes: (sheet.revisions || []).map((entry) => entry.code),
    viewportSnapshots: (sheet.viewports || []).map((entry) => ({
      id: entry.id,
      sourceView: entry.sourceView,
      sourceFloorId: entry.sourceFloorId,
      sourceRefId: entry.sourceRefId,
      scale: entry.scale,
      role: entry.role,
    })),
    generatedFromModelSignature: sheet.generatedFromModelSignature,
  };
}

export function issueDocumentationRealization(project, validationIssues = [], profileOverrides = {}) {
  const cost = deriveCostRealization(project);
  if (cost.state.status !== 'realized' || cost.outOfDate)
    return {
      ok: false,
      code: 'current-cost-realization-required',
      message:
        'Create or regenerate the current Mu quantity-and-cost realization before issuing professional-review documents.',
    };
  const handoff = deriveProfessionalHandoff(project);
  const revision = handoff.revisionComparison.baseline;
  if (!revision || !handoff.revisionComparison.isCurrent)
    return {
      ok: false,
      code: 'current-review-revision-required',
      message:
        'Capture a current immutable review revision with issue date and preparer before issuing professional-review documents.',
    };
  const completeness = deriveDocumentationCompleteness(project, profileOverrides);
  if (!completeness.complete)
    return {
      ok: false,
      code: 'documentation-package-incomplete',
      message: 'Required sheets, viewports, schedules, dimensions, tags, or deliverables are incomplete.',
      details: {
        missingDeliverableIds: completeness.missingDeliverables.map((entry) => entry.id),
        sheetFaults: completeness.sheetFaults,
        annotationFaults: completeness.annotationFaults,
      },
    };
  const profile = completeness.profile;
  const sourceModelSignature = deriveDocumentModelSignature(project);
  const unresolvedFindingSnapshots = validationIssues
    .filter((entry) => entry.ruleId !== 'DOC.REALIZATION_REQUIRED')
    .map(snapshotFinding);
  let state = createDocumentationRealizationState({
    status: 'issued',
    id: `${profile.packageId}:${revision.id}`,
    packageId: profile.packageId,
    sourceTestFitId: project.building.acceptedTestFitId,
    sourceCostRealizationSignature: cost.state.inputSignature,
    sourceRevisionId: revision.id,
    sourceRevisionSignature: revision.basisSignature,
    sourceModelSignature,
    inputSignature: documentationRealizationInputSignature(project, profile),
    issueCode: revision.code,
    issueLabel: revision.label,
    issueDate: revision.date,
    preparedBy: revision.author,
    unresolvedFindingSnapshots,
    annotationSnapshots: completeness.annotationSnapshots,
  });
  const projectWithState = {
    ...project,
    building: {
      ...project.building,
      documentationRealizationProfile: profile,
      documentationRealization: state,
    },
  };
  const manifest = derivePreliminaryPackage(projectWithState, profile.packageId, {
    validationIssues: unresolvedFindingSnapshots,
  });
  state = createDocumentationRealizationState({
    ...state,
    sheetSnapshots: manifest.sheets.map(snapshotSheet),
    deliverableSnapshots: manifest.deliverables.map(clone),
  });
  const retainedSheets = (project.sheets || []).filter(
    (sheet) => !(sheet.packageKind === PRELIMINARY_PACKAGE_KIND && sheet.packageId === profile.packageId),
  );
  return {
    ok: true,
    profile,
    state,
    manifest,
    project: {
      ...projectWithState,
      building: { ...projectWithState.building, documentationRealization: state },
      sheets: [...retainedSheets, ...manifest.sheets],
    },
  };
}

export function deriveDocumentationRealization(project) {
  const profile = createDocumentationRealizationProfile(project?.building?.documentationRealizationProfile);
  const state = createDocumentationRealizationState(project?.building?.documentationRealization);
  const completeness = deriveDocumentationCompleteness(project, profile);
  const currentInputSignature = documentationRealizationInputSignature(project, profile);
  const persistedSheets = new Map((project?.sheets || []).map((entry) => [entry.id, entry]));
  const outputMismatches = state.sheetSnapshots
    .filter((snapshot) => {
      const sheet = persistedSheets.get(snapshot.id);
      return !sheet || JSON.stringify(snapshotSheet(sheet)) !== JSON.stringify(snapshot);
    })
    .map((entry) => entry.id);
  const inputOutOfDate = state.status === 'issued' && state.inputSignature !== currentInputSignature;
  return {
    profile,
    state,
    currentInputSignature,
    inputOutOfDate,
    outputMismatches,
    outputAltered: state.status === 'issued' && outputMismatches.length > 0,
    outOfDate: inputOutOfDate || (state.status === 'issued' && outputMismatches.length > 0),
    completeness,
    issuedSheetCount: state.sheetSnapshots.length,
    issuedDeliverableCount: state.deliverableSnapshots.length,
    unresolvedFindingCount: state.unresolvedFindingSnapshots.length,
    annotationCount: state.annotationSnapshots.reduce(
      (total, entry) => total + entry.dimensionCount + entry.tagCount,
      0,
    ),
    professionalReviewRequired: true,
  };
}

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'documentation_issue_check') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'documentation_coordination',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

export function validateDocumentationRealization(project) {
  const cost = deriveCostRealization(project);
  const derived = deriveDocumentationRealization(project);
  const buildingId = project?.building?.id || project?.id;
  if (cost.state.status !== 'realized') return [];
  if (derived.state.status !== 'issued')
    return [
      issue(
        'DOC.REALIZATION_REQUIRED',
        'warning',
        'The current Mu basis has no issued professional-review documentation package.',
        [{ type: 'building', id: buildingId }],
        { costRealizationStatus: cost.state.status },
        'missing_documentation_issue',
      ),
    ];
  const issues = [];
  if (derived.outOfDate)
    issues.push(
      issue(
        'DOC.REALIZATION_OUTDATED',
        'warning',
        'The issued professional-review package is out of date with the coordinated model, Mu baseline, or active revision.',
        [{ type: 'documentationRealization', id: derived.state.id }],
        { storedInputSignature: derived.state.inputSignature, currentInputSignature: derived.currentInputSignature },
      ),
    );
  if (
    !derived.state.sheetSnapshots.length ||
    !derived.state.deliverableSnapshots.length ||
    !derived.state.annotationSnapshots.length
  )
    issues.push(
      issue(
        'DOC.REALIZATION_SNAPSHOT_INCOMPLETE',
        'error',
        'Issued documentation must retain sheet, deliverable, and annotation snapshots.',
        [{ type: 'documentationRealization', id: derived.state.id }],
        {
          sheetCount: derived.state.sheetSnapshots.length,
          deliverableCount: derived.state.deliverableSnapshots.length,
          annotationFloorCount: derived.state.annotationSnapshots.length,
        },
        'issue_record_integrity_check',
      ),
    );
  if (derived.outputAltered)
    issues.push(
      issue(
        'DOC.REALIZATION_OUTPUT_ALTERED',
        'error',
        'One or more persisted issued sheets differ from the frozen Nu issue record.',
        [{ type: 'documentationRealization', id: derived.state.id }],
        { sheetIds: derived.outputMismatches },
        'issue_record_integrity_check',
      ),
    );
  if (derived.state.sourceTestFitId !== project.building.acceptedTestFitId)
    issues.push(
      issue(
        'DOC.REALIZATION_TEST_FIT_MISMATCH',
        'error',
        'Issued documentation references a different accepted test fit.',
        [{ type: 'documentationRealization', id: derived.state.id }],
        { sourceTestFitId: derived.state.sourceTestFitId, acceptedTestFitId: project.building.acceptedTestFitId },
        'relationship_check',
      ),
    );
  if (derived.state.sourceCostRealizationSignature !== cost.state.inputSignature)
    issues.push(
      issue(
        'DOC.REALIZATION_COST_BASIS_MISMATCH',
        'error',
        'Issued documentation references a different Mu cost baseline.',
        [{ type: 'documentationRealization', id: derived.state.id }],
        {
          sourceCostRealizationSignature: derived.state.sourceCostRealizationSignature,
          currentCostRealizationSignature: cost.state.inputSignature,
        },
        'relationship_check',
      ),
    );
  const revision = activeRevision(project);
  if (
    !revision ||
    derived.state.sourceRevisionId !== revision.id ||
    derived.state.sourceRevisionSignature !== revision.basisSignature
  )
    issues.push(
      issue(
        'DOC.REALIZATION_REVISION_MISMATCH',
        'error',
        'Issued documentation does not match the active immutable review revision.',
        [{ type: 'documentationRealization', id: derived.state.id }],
        { sourceRevisionId: derived.state.sourceRevisionId, activeRevisionId: revision?.id || null },
        'relationship_check',
      ),
    );
  if (
    derived.completeness.missingDeliverables.length ||
    derived.completeness.sheetFaults.length ||
    derived.completeness.annotationFaults.length
  )
    issues.push(
      issue(
        'DOC.REALIZATION_COMPLETENESS_FAILED',
        'error',
        'The current professional-review package no longer satisfies Nu sheet, schedule, dimension, tag, or deliverable completeness.',
        [{ type: 'documentationRealization', id: derived.state.id }],
        {
          missingDeliverableIds: derived.completeness.missingDeliverables.map((entry) => entry.id),
          sheetFaults: derived.completeness.sheetFaults,
          annotationFaults: derived.completeness.annotationFaults,
        },
        'output_completeness_check',
      ),
    );
  const sheetIds = new Set((project.sheets || []).map((entry) => entry.id));
  const missingSheetIds = derived.state.sheetSnapshots
    .filter((entry) => !sheetIds.has(entry.id))
    .map((entry) => entry.id);
  if (missingSheetIds.length)
    issues.push(
      issue(
        'DOC.REALIZATION_SHEET_REFERENCE_BROKEN',
        'error',
        'One or more issued sheet snapshots no longer reference a persisted sheet.',
        [{ type: 'documentationRealization', id: derived.state.id }],
        { missingSheetIds },
        'relationship_check',
      ),
    );
  return issues;
}
