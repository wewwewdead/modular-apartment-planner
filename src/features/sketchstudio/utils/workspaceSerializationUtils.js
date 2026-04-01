import { validateBasicDocumentShape } from './serializationUtils';

export const SKETCH_WORKSPACE_KIND = 'sketchstudio-workspace';
export const SKETCH_WORKSPACE_VERSION = 1;

export const DEFAULT_SKETCH_VIEWPORT = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const DEFAULT_SKETCH_UI = {
  activeLayerId: 'default',
  snapEnabled: true,
  orthoEnabled: false,
  viewMode: 'plan',
  isometricPlane: 'top',
  craftsmanMode: false,
};

function getFallbackLayerId(document) {
  return document?.layers?.[0]?.id || DEFAULT_SKETCH_UI.activeLayerId;
}

function isProbablyApartmentPlannerProject(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (
      Array.isArray(value.floors)
      || Array.isArray(value.sheets)
      || (value.project && typeof value.project === 'object')
    ),
  );
}

function normalizeViewport(viewport) {
  return {
    zoom: Number(viewport?.zoom) || DEFAULT_SKETCH_VIEWPORT.zoom,
    panX: Number(viewport?.panX) || DEFAULT_SKETCH_VIEWPORT.panX,
    panY: Number(viewport?.panY) || DEFAULT_SKETCH_VIEWPORT.panY,
  };
}

function normalizeUi(ui, document) {
  const requestedLayerId = typeof ui?.activeLayerId === 'string' && ui.activeLayerId
    ? ui.activeLayerId
    : getFallbackLayerId(document);
  const nextLayerId = document?.layers?.some((layer) => layer.id === requestedLayerId)
    ? requestedLayerId
    : getFallbackLayerId(document);

  return {
    activeLayerId: nextLayerId,
    snapEnabled: ui?.snapEnabled !== false,
    orthoEnabled: ui?.orthoEnabled === true,
    viewMode: ui?.viewMode === 'isometric' ? 'isometric' : DEFAULT_SKETCH_UI.viewMode,
    isometricPlane: ['top', 'left', 'right'].includes(ui?.isometricPlane) ? ui.isometricPlane : DEFAULT_SKETCH_UI.isometricPlane,
    craftsmanMode: ui?.craftsmanMode === true,
  };
}

export function buildSketchWorkspaceSnapshot({
  document,
  viewport,
  ui,
} = {}) {
  if (!validateBasicDocumentShape(document)) {
    throw new Error('Invalid SketchStudio document shape.');
  }

  return {
    kind: SKETCH_WORKSPACE_KIND,
    version: SKETCH_WORKSPACE_VERSION,
    document,
    objectDraft: null,
    viewport: normalizeViewport(viewport),
    ui: normalizeUi(ui, document),
  };
}

export function serializeComparableSketchWorkspace(workspace) {
  return JSON.stringify(buildSketchWorkspaceSnapshot(workspace));
}

export function serializeSketchWorkspace(workspace, options = {}) {
  const snapshot = buildSketchWorkspaceSnapshot(workspace);
  return JSON.stringify({
    ...snapshot,
    savedAt: options.savedAt || new Date().toISOString(),
  }, null, 2);
}

export function normalizeParsedSketchWorkspace(parsed) {
  if (validateBasicDocumentShape(parsed)) {
    return {
      kind: SKETCH_WORKSPACE_KIND,
      version: SKETCH_WORKSPACE_VERSION,
      savedAt: null,
      document: parsed,
      objectDraft: null,
      viewport: { ...DEFAULT_SKETCH_VIEWPORT },
      ui: normalizeUi(null, parsed),
    };
  }

  if (isProbablyApartmentPlannerProject(parsed)) {
    throw new Error('This file is an apartment planner project, not a SketchStudio sketch file.');
  }

  if (
    !parsed
    || typeof parsed !== 'object'
    || parsed.kind !== SKETCH_WORKSPACE_KIND
    || !validateBasicDocumentShape(parsed.document)
  ) {
    throw new Error('Invalid SketchStudio file.');
  }

  return {
    kind: SKETCH_WORKSPACE_KIND,
    version: Number(parsed.version) || SKETCH_WORKSPACE_VERSION,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
    document: parsed.document,
    objectDraft: null,
    viewport: normalizeViewport(parsed.viewport),
    ui: normalizeUi(parsed.ui, parsed.document),
  };
}

export function deserializeSketchWorkspace(serialized) {
  let parsed;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }

  return normalizeParsedSketchWorkspace(parsed);
}
