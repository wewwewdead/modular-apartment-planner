import { deriveDocumentationRealization } from './documentationRealization';
import { DESIGN_CONFIDENCE } from './trustModels';

export const PROFESSIONAL_EXCHANGE_FORMAT = 'apartment-design-engineer/professional-review-exchange';
export const PROFESSIONAL_EXCHANGE_FORMAT_VERSION = 1;

export const DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE = Object.freeze({
  id: 'xi_professional_interoperability_exchange_v1',
  pdfMode: 'single_multi_sheet_vector_pdf',
  dxfMode: 'one_metric_r12_dxf_per_sheet',
  manifestFormat: PROFESSIONAL_EXCHANGE_FORMAT,
  manifestFormatVersion: PROFESSIONAL_EXCHANGE_FORMAT_VERSION,
  markupFormat: 'apartment-design-engineer/reviewer-markups-v1',
  purpose: 'external_professional_review_exchange',
  ifcCertificationStatus: 'not_ifc_certified',
  permitAcceptanceStatus: 'not_accepted_or_submitted',
  professionalApprovalStatus: 'not_claimed',
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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

function safeFilePart(value, fallback = 'issue') {
  return (
    String(value || fallback)
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

export function createProfessionalExchangeProfile(overrides = {}) {
  return {
    ...DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE,
    ...overrides,
    pdfMode: DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE.pdfMode,
    dxfMode: DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE.dxfMode,
    manifestFormat: PROFESSIONAL_EXCHANGE_FORMAT,
    manifestFormatVersion: PROFESSIONAL_EXCHANGE_FORMAT_VERSION,
    markupFormat: DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE.markupFormat,
    purpose: DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE.purpose,
    ifcCertificationStatus: DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE.ifcCertificationStatus,
    permitAcceptanceStatus: DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE.permitAcceptanceStatus,
    professionalApprovalStatus: DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE.professionalApprovalStatus,
  };
}

export function createReviewerMarkup(overrides = {}) {
  return {
    id: overrides.id,
    exchangeId: overrides.exchangeId || null,
    sheetId: overrides.sheetId || null,
    sheetNumber: overrides.sheetNumber || '',
    viewportId: overrides.viewportId || null,
    position:
      Number.isFinite(overrides.position?.x) && Number.isFinite(overrides.position?.y)
        ? { x: overrides.position.x, y: overrides.position.y, units: overrides.position.units || 'sheet_mm' }
        : null,
    title: overrides.title || '',
    comment: overrides.comment || '',
    discipline: overrides.discipline || 'general',
    priority: ['information', 'warning', 'action'].includes(overrides.priority) ? overrides.priority : 'action',
    author: overrides.author || '',
    organization: overrides.organization || '',
    createdDate: overrides.createdDate || '',
    sourceDocumentId: overrides.sourceDocumentId || '',
    sourceFileName: overrides.sourceFileName || '',
    status: ['open', 'responded', 'closed'].includes(overrides.status) ? overrides.status : 'open',
    sourceKind: 'external_reviewer_markup',
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

export function createExternalProfessionalResponse(overrides = {}) {
  return {
    id: overrides.id,
    markupId: overrides.markupId,
    exchangeId: overrides.exchangeId || null,
    responderName: overrides.responderName || '',
    profession: overrides.profession || '',
    organization: overrides.organization || '',
    licenseId: overrides.licenseId || '',
    responseDate: overrides.responseDate || '',
    response: overrides.response || '',
    disposition: ['noted', 'revise', 'accepted_for_design_basis', 'rejected'].includes(overrides.disposition)
      ? overrides.disposition
      : 'noted',
    sourceDocumentId: overrides.sourceDocumentId || '',
    sourceFileName: overrides.sourceFileName || '',
    preservedAsExternalRecord: true,
    professionalApprovalStatus: 'not_claimed',
    permitAcceptanceStatus: 'not_claimed',
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

export function createProfessionalExchangeState(overrides = {}) {
  const exchanges = (overrides.exchanges || []).filter((entry) => entry?.id).map(clone);
  return {
    status: exchanges.length ? 'published' : 'not_published',
    activeExchangeId: exchanges.some((entry) => entry.id === overrides.activeExchangeId)
      ? overrides.activeExchangeId
      : exchanges.at(-1)?.id || null,
    exchanges,
    reviewerMarkups: (overrides.reviewerMarkups || []).filter((entry) => entry?.id).map(createReviewerMarkup),
    externalResponses: (overrides.externalResponses || [])
      .filter((entry) => entry?.id)
      .map(createExternalProfessionalResponse),
    ifcCertificationStatus: 'not_ifc_certified',
    permitAcceptanceStatus: 'not_accepted_or_submitted',
    professionalApprovalStatus: 'not_claimed',
    professionalReviewRequired: true,
  };
}

function sheetRecord(snapshot, basePath) {
  const fileStem = `${safeFilePart(snapshot.number, snapshot.id)}_${safeFilePart(snapshot.title, 'sheet')}`;
  const fingerprint = hashValue(snapshot);
  return {
    id: snapshot.id,
    number: snapshot.number,
    title: snapshot.title,
    paperSize: snapshot.paperSize,
    issueDate: snapshot.issueDate,
    revisionCodes: [...(snapshot.revisionCodes || [])],
    viewportCount: snapshot.viewportSnapshots?.length || 0,
    viewportSnapshots: clone(snapshot.viewportSnapshots || []),
    modelSignature: snapshot.generatedFromModelSignature || '',
    fingerprint,
    dxfPath: `${basePath}/dxf/${fileStem}.dxf`,
    pdfPageLabel: snapshot.number || snapshot.id,
  };
}

export function buildProfessionalExchangeManifest(project, exchangeId, profileOverrides = {}) {
  const profile = createProfessionalExchangeProfile({
    ...project?.building?.professionalExchangeProfile,
    ...profileOverrides,
  });
  const documentation = deriveDocumentationRealization(project);
  const issue = documentation.state;
  if (issue.status !== 'issued' || documentation.outOfDate) return null;
  const issueCode = safeFilePart(issue.issueCode, 'issue');
  const exchangeCode = safeFilePart(exchangeId, `${issueCode}-xi`);
  const basePath = `${safeFilePart(project?.name, 'project')}_${exchangeCode}`;
  const sheets = issue.sheetSnapshots.map((entry) => sheetRecord(entry, basePath));
  const manifest = {
    format: PROFESSIONAL_EXCHANGE_FORMAT,
    formatVersion: PROFESSIONAL_EXCHANGE_FORMAT_VERSION,
    exchangeId,
    project: {
      id: project?.id || null,
      name: project?.name || '',
      address: project?.address || '',
      jurisdiction: clone(project?.building?.jurisdiction || {}),
      unitSystem: project?.building?.jurisdiction?.unitSystem || 'metric',
    },
    issue: {
      documentationRealizationId: issue.id,
      packageId: issue.packageId,
      code: issue.issueCode,
      label: issue.issueLabel,
      date: issue.issueDate,
      preparedBy: issue.preparedBy,
      sourceRevisionId: issue.sourceRevisionId,
      sourceRevisionSignature: issue.sourceRevisionSignature,
      sourceModelSignature: issue.sourceModelSignature,
      sourceCostRealizationSignature: issue.sourceCostRealizationSignature,
      inputSignature: issue.inputSignature,
    },
    files: {
      multiSheetPdf: {
        path: `${basePath}/${safeFilePart(project?.name, 'project')}_${issueCode}.pdf`,
        mediaType: 'application/pdf',
        pageCount: sheets.length,
        mode: profile.pdfMode,
      },
      dxf: sheets.map((entry) => ({
        sheetId: entry.id,
        sheetNumber: entry.number,
        path: entry.dxfPath,
        mediaType: 'application/dxf',
        version: 'AC1009',
        insertionUnits: 'millimetres',
      })),
      manifest: { path: `${basePath}/handoff-manifest.json`, mediaType: 'application/json' },
      markups: { path: `${basePath}/review/reviewer-markups.json`, mediaType: 'application/json' },
      responses: { path: `${basePath}/review/external-responses.json`, mediaType: 'application/json' },
      revisionComparison: { path: `${basePath}/review/revision-comparison.json`, mediaType: 'application/json' },
    },
    sheets,
    deliverables: clone(issue.deliverableSnapshots || []),
    disclosedFindings: clone(issue.unresolvedFindingSnapshots || []),
    annotationBasis: clone(issue.annotationSnapshots || []),
    boundaries: {
      purpose: profile.purpose,
      ifcCertificationStatus: profile.ifcCertificationStatus,
      permitAcceptanceStatus: profile.permitAcceptanceStatus,
      professionalApprovalStatus: profile.professionalApprovalStatus,
      constructionStatus: 'not_for_construction',
      statement:
        'Portable preliminary review exchange only. External review records are preserved as evidence and do not grant approval.',
    },
  };
  manifest.fingerprint = hashValue(manifest);
  return manifest;
}

export function publishProfessionalExchange(project, overrides = {}) {
  const state = createProfessionalExchangeState(project?.building?.professionalExchange);
  const documentation = deriveDocumentationRealization(project);
  if (documentation.state.status !== 'issued' || documentation.outOfDate) {
    return {
      ok: false,
      code: 'current-documentation-issue-required',
      message: 'Issue or reissue a current Nu professional-review package before publishing an Xi exchange.',
    };
  }
  const exchangeId = overrides.exchangeId || `${documentation.state.id}:xi:${state.exchanges.length + 1}`;
  if (state.exchanges.some((entry) => entry.id === exchangeId)) {
    return { ok: false, code: 'exchange-id-exists', message: 'Professional exchange ID already exists.' };
  }
  const manifest = buildProfessionalExchangeManifest(project, exchangeId, overrides.profile);
  const exchange = {
    id: exchangeId,
    label: overrides.label || `${documentation.state.issueCode} professional review exchange`,
    publishedDate: overrides.publishedDate || documentation.state.issueDate,
    publishedBy: overrides.publishedBy || documentation.state.preparedBy,
    sourceDocumentationRealizationId: documentation.state.id,
    sourceDocumentationInputSignature: documentation.state.inputSignature,
    sourceModelSignature: documentation.state.sourceModelSignature,
    sourceRevisionId: documentation.state.sourceRevisionId,
    sourceRevisionSignature: documentation.state.sourceRevisionSignature,
    manifest,
    manifestFingerprint: manifest.fingerprint,
    artifactStatus: 'ready_for_user_download',
    professionalReviewRequired: true,
  };
  const nextState = createProfessionalExchangeState({
    ...state,
    activeExchangeId: exchangeId,
    exchanges: [...state.exchanges, exchange],
  });
  return {
    ok: true,
    exchange,
    state: nextState,
    project: {
      ...project,
      building: {
        ...project.building,
        professionalExchangeProfile: createProfessionalExchangeProfile({
          ...project.building.professionalExchangeProfile,
          ...overrides.profile,
        }),
        professionalExchange: nextState,
      },
    },
  };
}

export function appendReviewerMarkup(project, overrides = {}) {
  const state = createProfessionalExchangeState(project?.building?.professionalExchange);
  const exchange = state.exchanges.find((entry) => entry.id === (overrides.exchangeId || state.activeExchangeId));
  if (!exchange)
    return { ok: false, code: 'exchange-not-found', message: 'Select a published Xi exchange for this markup.' };
  if (!overrides.id || !String(overrides.comment || '').trim())
    return { ok: false, code: 'markup-fields-required', message: 'Markup ID and comment are required.' };
  if (state.reviewerMarkups.some((entry) => entry.id === overrides.id))
    return { ok: false, code: 'markup-id-exists', message: 'Reviewer markup ID already exists.' };
  const sheet = exchange.manifest.sheets.find(
    (entry) => entry.id === overrides.sheetId || entry.number === overrides.sheetNumber,
  );
  if ((overrides.sheetId || overrides.sheetNumber) && !sheet)
    return {
      ok: false,
      code: 'markup-sheet-not-found',
      message: 'Markup sheet does not exist in the selected issued exchange.',
    };
  const markup = createReviewerMarkup({
    ...overrides,
    exchangeId: exchange.id,
    sheetId: sheet?.id || null,
    sheetNumber: sheet?.number || '',
  });
  const nextState = createProfessionalExchangeState({ ...state, reviewerMarkups: [...state.reviewerMarkups, markup] });
  return {
    ok: true,
    markup,
    state: nextState,
    project: { ...project, building: { ...project.building, professionalExchange: nextState } },
  };
}

export function importReviewerMarkupExchange(project, payload, options = {}) {
  const source = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const entries = Array.isArray(source) ? source : source?.markups;
  if (!Array.isArray(entries))
    return { ok: false, code: 'markup-exchange-invalid', message: 'Markup exchange must contain a markups array.' };
  if (source?.format && source.format !== DEFAULT_PROFESSIONAL_EXCHANGE_PROFILE.markupFormat)
    return {
      ok: false,
      code: 'markup-exchange-format-unsupported',
      message: 'Markup exchange format is not supported.',
    };
  let nextProject = project;
  const imported = [];
  for (const entry of entries) {
    const result = appendReviewerMarkup(nextProject, {
      ...entry,
      exchangeId: options.exchangeId || entry.exchangeId || source.exchangeId,
      sourceDocumentId: entry.sourceDocumentId || options.sourceDocumentId || '',
      sourceFileName: entry.sourceFileName || options.sourceFileName || '',
    });
    if (!result.ok)
      return {
        ...result,
        details: { markupId: entry?.id || null, importedBeforeFailure: imported.map((item) => item.id) },
      };
    nextProject = result.project;
    imported.push(result.markup);
  }
  return {
    ok: true,
    imported,
    project: nextProject,
    state: createProfessionalExchangeState(nextProject.building.professionalExchange),
  };
}

export function appendExternalProfessionalResponse(project, overrides = {}) {
  const state = createProfessionalExchangeState(project?.building?.professionalExchange);
  const markup = state.reviewerMarkups.find((entry) => entry.id === overrides.markupId);
  if (!markup) return { ok: false, code: 'markup-not-found', message: 'Reviewer markup was not found.' };
  if (!overrides.id || !String(overrides.response || '').trim() || !overrides.responderName || !overrides.responseDate)
    return {
      ok: false,
      code: 'response-fields-required',
      message: 'Response ID, responder, date, and response are required.',
    };
  if (state.externalResponses.some((entry) => entry.id === overrides.id))
    return { ok: false, code: 'response-id-exists', message: 'External response ID already exists.' };
  const response = createExternalProfessionalResponse({ ...overrides, exchangeId: markup.exchangeId });
  const reviewerMarkups = state.reviewerMarkups.map((entry) =>
    entry.id === markup.id ? { ...entry, status: 'responded' } : entry,
  );
  const nextState = createProfessionalExchangeState({
    ...state,
    reviewerMarkups,
    externalResponses: [...state.externalResponses, response],
  });
  return {
    ok: true,
    response,
    state: nextState,
    project: { ...project, building: { ...project.building, professionalExchange: nextState } },
  };
}

export function selectProfessionalExchange(project, exchangeId) {
  const state = createProfessionalExchangeState(project?.building?.professionalExchange);
  if (!state.exchanges.some((entry) => entry.id === exchangeId))
    return { ok: false, code: 'exchange-not-found', message: 'Professional exchange was not found.' };
  const nextState = createProfessionalExchangeState({ ...state, activeExchangeId: exchangeId });
  return {
    ok: true,
    state: nextState,
    project: { ...project, building: { ...project.building, professionalExchange: nextState } },
  };
}

function mapBy(items, key) {
  return new Map((items || []).map((entry) => [entry[key], entry]));
}

export function compareProfessionalExchanges(project, baselineExchangeId, currentExchangeId = null) {
  const state = createProfessionalExchangeState(project?.building?.professionalExchange);
  const current = state.exchanges.find((entry) => entry.id === (currentExchangeId || state.activeExchangeId)) || null;
  const baseline = state.exchanges.find((entry) => entry.id === baselineExchangeId) || null;
  if (!baseline || !current)
    return {
      baseline,
      current,
      addedSheets: [],
      removedSheets: [],
      changedSheets: [],
      addedFindings: [],
      resolvedFindings: [],
      changedFindings: [],
      changeCount: 0,
      professionalReviewRequired: true,
    };
  const baselineSheets = mapBy(baseline.manifest.sheets, 'id');
  const currentSheets = mapBy(current.manifest.sheets, 'id');
  const addedSheets = current.manifest.sheets.filter((entry) => !baselineSheets.has(entry.id));
  const removedSheets = baseline.manifest.sheets.filter((entry) => !currentSheets.has(entry.id));
  const changedSheets = current.manifest.sheets.filter(
    (entry) => baselineSheets.has(entry.id) && baselineSheets.get(entry.id).fingerprint !== entry.fingerprint,
  );
  const baselineFindings = mapBy(baseline.manifest.disclosedFindings, 'id');
  const currentFindings = mapBy(current.manifest.disclosedFindings, 'id');
  const addedFindings = current.manifest.disclosedFindings.filter((entry) => !baselineFindings.has(entry.id));
  const resolvedFindings = baseline.manifest.disclosedFindings.filter((entry) => !currentFindings.has(entry.id));
  const changedFindings = current.manifest.disclosedFindings.filter(
    (entry) => baselineFindings.has(entry.id) && hashValue(entry) !== hashValue(baselineFindings.get(entry.id)),
  );
  return {
    baseline,
    current,
    modelChanged: baseline.sourceModelSignature !== current.sourceModelSignature,
    revisionChanged: baseline.sourceRevisionSignature !== current.sourceRevisionSignature,
    addedSheets,
    removedSheets,
    changedSheets,
    addedFindings,
    resolvedFindings,
    changedFindings,
    changeCount:
      addedSheets.length +
      removedSheets.length +
      changedSheets.length +
      addedFindings.length +
      resolvedFindings.length +
      changedFindings.length,
    professionalReviewRequired: true,
  };
}

export function deriveProfessionalExchange(project) {
  const profile = createProfessionalExchangeProfile(project?.building?.professionalExchangeProfile);
  const state = createProfessionalExchangeState(project?.building?.professionalExchange);
  const documentation = deriveDocumentationRealization(project);
  const activeExchange = state.exchanges.find((entry) => entry.id === state.activeExchangeId) || null;
  const outOfDate = Boolean(
    activeExchange &&
    (documentation.outOfDate ||
      documentation.state.id !== activeExchange.sourceDocumentationRealizationId ||
      documentation.state.inputSignature !== activeExchange.sourceDocumentationInputSignature),
  );
  return {
    profile,
    state,
    activeExchange,
    outOfDate,
    exchangeCount: state.exchanges.length,
    markupCount: state.reviewerMarkups.length,
    openMarkupCount: state.reviewerMarkups.filter((entry) => entry.status === 'open').length,
    externalResponseCount: state.externalResponses.length,
    comparison:
      state.exchanges.length > 1
        ? compareProfessionalExchanges(project, state.exchanges.at(-2).id, state.activeExchangeId)
        : null,
    professionalReviewRequired: true,
  };
}

function issue(ruleId, severity, message, entityRefs, inputs) {
  return {
    id: `${ruleId}:${entityRefs.map((entry) => `${entry.type}:${entry.id}`).join('|')}`,
    ruleId,
    category: 'professional_interoperability',
    severity,
    message,
    entityRefs,
    evidence: { resultKind: 'exchange_traceability_check', confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

export function validateProfessionalExchange(project) {
  const storedState = createProfessionalExchangeState(project?.building?.professionalExchange);
  if (!storedState.exchanges.length) {
    return project?.building?.documentationRealization?.status === 'issued'
      ? [
          issue(
            'EXCHANGE.PUBLICATION_REQUIRED',
            'warning',
            'The current Nu issue has no portable Xi professional-review exchange.',
            [{ type: 'building', id: project.building.id }],
            { documentationStatus: 'issued' },
          ),
        ]
      : [];
  }
  const derived = deriveProfessionalExchange(project);
  const issues = [];
  if (derived.outOfDate) {
    issues.push(
      issue(
        'EXCHANGE.OUTDATED',
        'warning',
        'The active Xi exchange is not current with the issued Nu package.',
        [{ type: 'professionalExchange', id: derived.activeExchange.id }],
        { sourceDocumentationRealizationId: derived.activeExchange.sourceDocumentationRealizationId },
      ),
    );
  }
  const exchangeIds = new Set(derived.state.exchanges.map((entry) => entry.id));
  const sheetIdsByExchange = new Map(
    derived.state.exchanges.map((entry) => [entry.id, new Set(entry.manifest?.sheets?.map((sheet) => sheet.id) || [])]),
  );
  for (const markup of derived.state.reviewerMarkups) {
    if (
      !exchangeIds.has(markup.exchangeId) ||
      (markup.sheetId && !sheetIdsByExchange.get(markup.exchangeId)?.has(markup.sheetId))
    ) {
      issues.push(
        issue(
          'EXCHANGE.MARKUP_REFERENCE_BROKEN',
          'error',
          'A reviewer markup references a missing exchange or issued sheet.',
          [{ type: 'reviewerMarkup', id: markup.id }],
          { exchangeId: markup.exchangeId, sheetId: markup.sheetId },
        ),
      );
    }
  }
  const markupIds = new Set(derived.state.reviewerMarkups.map((entry) => entry.id));
  for (const response of derived.state.externalResponses) {
    if (!markupIds.has(response.markupId))
      issues.push(
        issue(
          'EXCHANGE.RESPONSE_REFERENCE_BROKEN',
          'error',
          'An external response references a missing reviewer markup.',
          [{ type: 'externalProfessionalResponse', id: response.id }],
          { markupId: response.markupId },
        ),
      );
  }
  return issues;
}
