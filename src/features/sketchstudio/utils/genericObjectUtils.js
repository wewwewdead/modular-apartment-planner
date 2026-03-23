import { computeEntityBoundingBox, computeFootprintFromEntities } from './bboxUtils';
import { createDefaultAnchor, computeAnchorFromBounds, setPrimaryAnchor } from './anchorUtils';
import { filterNonIsometricEntities } from './isometricUtils';
import { extractClosedLoopsFromEntities, loopToFootprintPayload } from './profileUtils';
import { DEFAULT_CATEGORY, DEFAULT_OBJECT_TYPE } from './objectTypeConstants';

const DEFAULT_BOUNDS = { width: 600, depth: 400, height: 900 };
const DEFAULT_DEFAULTS = { thickness: 18, material: 'plywood' };

function createObjectId(existingObjects = []) {
  const highest = existingObjects.reduce((max, item) => {
    const suffix = Number(String(item?.id).split('-').at(-1));
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  return `object-${highest + 1}`;
}

function buildFootprintBounds(points) {
  if (!points?.length) {
    return null;
  }

  return points.reduce((accumulator, point) => ({
    minX: Math.min(accumulator.minX, point.x),
    minY: Math.min(accumulator.minY, point.y),
    maxX: Math.max(accumulator.maxX, point.x),
    maxY: Math.max(accumulator.maxY, point.y),
  }), {
    minX: points[0].x,
    minY: points[0].y,
    maxX: points[0].x,
    maxY: points[0].y,
  });
}

function buildBoundsFromFootprint(footprint, height = DEFAULT_BOUNDS.height) {
  const footprintBounds = buildFootprintBounds(footprint?.points);
  if (!footprintBounds) {
    return null;
  }

  return {
    width: footprintBounds.maxX - footprintBounds.minX,
    depth: footprintBounds.maxY - footprintBounds.minY,
    height,
  };
}

function createAnchorSet(bounds = DEFAULT_BOUNDS) {
  const footprintBounds = {
    minX: 0,
    minY: 0,
    maxX: Number(bounds.width) || DEFAULT_BOUNDS.width,
    maxY: Number(bounds.depth) || DEFAULT_BOUNDS.depth,
  };
  const originAnchor = createDefaultAnchor(footprintBounds);
  const centerAnchor = computeAnchorFromBounds(footprintBounds, 'center');
  const frontLeftAnchor = computeAnchorFromBounds(footprintBounds, 'front-left');
  const anchors = setPrimaryAnchor([originAnchor, centerAnchor, frontLeftAnchor], originAnchor.id);

  return {
    anchors,
    activeAnchorId: originAnchor.id,
    anchor: { x: originAnchor.x, y: originAnchor.y, name: 'origin', kind: 'primary' },
  };
}

export function normalizeTemplateMetadata(template, generator = null) {
  if (!template && !generator?.type) {
    return null;
  }

  if (template && typeof template === 'object') {
    return {
      id: template.id || generator?.type || null,
      source: template.source || (generator?.type ? 'generator' : 'template'),
      label: template.label || template.id || generator?.type || 'template',
      metadata: { ...(template.metadata || {}) },
    };
  }

  if (typeof template === 'string') {
    return {
      id: template,
      source: generator?.type === template ? 'generator' : 'template',
      label: template,
      metadata: {},
    };
  }

  return {
    id: generator?.type || null,
    source: generator?.type ? 'generator' : 'template',
    label: generator?.type || 'template',
    metadata: {},
  };
}

export function inferCreationMode(draft) {
  if (draft?.metadata?.creationMode) {
    return draft.metadata.creationMode;
  }

  if (draft?.generator?.type) {
    return 'generator';
  }

  if (draft?.sourceEntityIds?.length) {
    return 'selection';
  }

  if (draft?.parts?.length) {
    return 'parts';
  }

  return 'blank';
}

export function computeGenericPartPlanBounds(part, entities = []) {
  const parametric = part?.parametric;

  if (parametric?.origin && parametric?.extents) {
    return {
      minX: Number(parametric.origin.x) || 0,
      minY: Number(parametric.origin.y) || 0,
      maxX: (Number(parametric.origin.x) || 0) + (Number(parametric.extents.width) || 0),
      maxY: (Number(parametric.origin.y) || 0) + (Number(parametric.extents.depth) || 0),
      width: Number(parametric.extents.width) || 0,
      depth: Number(parametric.extents.depth) || 0,
    };
  }

  const profileEntityIds = Array.isArray(part?.profileEntityIds) ? part.profileEntityIds : [];
  const profileEntities = entities.filter((entity) => profileEntityIds.includes(entity.id));
  const boxes = profileEntities.map((entity) => computeEntityBoundingBox(entity, entities)).filter(Boolean);

  if (!boxes.length) {
    return null;
  }

  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    depth: maxY - minY,
  };
}

export function computeGenericObjectBounds(objectDraft, entities = []) {
  const normalizedEntities = filterNonIsometricEntities(entities).filter((entity) => entity.type !== 'text' && entity.type !== 'dimension');
  const partBounds = (objectDraft?.parts || [])
    .map((part) => computeGenericPartPlanBounds(part, entities))
    .filter(Boolean);

  if (partBounds.length) {
    const minX = Math.min(...partBounds.map((bound) => bound.minX));
    const minY = Math.min(...partBounds.map((bound) => bound.minY));
    const maxX = Math.max(...partBounds.map((bound) => bound.maxX));
    const maxY = Math.max(...partBounds.map((bound) => bound.maxY));
    const height = Math.max(
      Number(objectDraft?.bounds?.height) || 0,
      ...(objectDraft?.parts || []).map((part) => {
        const originZ = Number(part?.parametric?.origin?.z) || Number(part?.transform?.z) || 0;
        const extentHeight = Number(part?.parametric?.extents?.height) || Number(part?.height) || 0;
        return originZ + extentHeight;
      }),
    );

    return {
      width: maxX - minX,
      depth: maxY - minY,
      height: height || DEFAULT_BOUNDS.height,
    };
  }

  const loops = extractClosedLoopsFromEntities(normalizedEntities);
  if (loops.length) {
    const primaryLoop = [...loops].sort((left, right) => right.area - left.area)[0];
    return buildBoundsFromFootprint(loopToFootprintPayload(primaryLoop), Number(objectDraft?.bounds?.height) || DEFAULT_BOUNDS.height);
  }

  const fallback = computeFootprintFromEntities(normalizedEntities);
  return buildBoundsFromFootprint(
    fallback?.points?.length ? { type: 'profile', points: fallback.points } : null,
    Number(objectDraft?.bounds?.height) || DEFAULT_BOUNDS.height,
  ) || objectDraft?.bounds || null;
}

export function computeGenericObjectFootprint(objectDraft, entities = []) {
  const normalizedEntities = filterNonIsometricEntities(entities).filter((entity) => entity.type !== 'text' && entity.type !== 'dimension');
  const partBounds = (objectDraft?.parts || [])
    .map((part) => computeGenericPartPlanBounds(part, entities))
    .filter(Boolean);

  if (partBounds.length) {
    const minX = Math.min(...partBounds.map((bound) => bound.minX));
    const minY = Math.min(...partBounds.map((bound) => bound.minY));
    const maxX = Math.max(...partBounds.map((bound) => bound.maxX));
    const maxY = Math.max(...partBounds.map((bound) => bound.maxY));

    return {
      type: 'profile',
      points: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
    };
  }

  const loops = extractClosedLoopsFromEntities(normalizedEntities);
  if (loops.length) {
    const primaryLoop = [...loops].sort((left, right) => right.area - left.area)[0];
    return loopToFootprintPayload(primaryLoop);
  }

  const fallback = computeFootprintFromEntities(normalizedEntities);
  if (!fallback?.points?.length) {
    return objectDraft?.footprint || null;
  }

  return {
    type: 'profile',
    points: fallback.points,
  };
}

export function migrateLegacyObjectDraft(draft) {
  if (!draft) {
    return draft;
  }

  const generator = draft.generator
    ? {
        type: draft.generator.type || null,
        params: { ...(draft.generator.params || {}) },
      }
    : { type: null, params: {} };

  const category = draft.category || DEFAULT_CATEGORY;
  const objectType = draft.objectType || DEFAULT_OBJECT_TYPE;
  const defaults = {
    thickness: Math.max(0, Number(draft.defaults?.thickness) || DEFAULT_DEFAULTS.thickness),
    material: draft.defaults?.material || DEFAULT_DEFAULTS.material,
  };
  const bounds = {
    width: Math.max(0, Number(draft.bounds?.width) || 0),
    depth: Math.max(0, Number(draft.bounds?.depth) || 0),
    height: Math.max(0, Number(draft.bounds?.height) || DEFAULT_BOUNDS.height),
  };
  const template = normalizeTemplateMetadata(draft.template || draft.metadata?.template, generator);
  const metadata = {
    ...(draft.metadata || {}),
    creationMode: inferCreationMode(draft),
  };

  return {
    id: draft.id || null,
    name: draft.name || 'Custom Object',
    objectType,
    category,
    units: draft.units || 'mm',
    sourceDocumentId: draft.sourceDocumentId || null,
    sourceEntityIds: Array.isArray(draft.sourceEntityIds) ? [...draft.sourceEntityIds] : [],
    profileEntityIds: Array.isArray(draft.profileEntityIds) ? [...draft.profileEntityIds] : [],
    defaults,
    bounds,
    footprint: draft.footprint || null,
    parts: Array.isArray(draft.parts) ? [...draft.parts] : [],
    features: Array.isArray(draft.features) ? [...draft.features] : [],
    anchors: Array.isArray(draft.anchors) ? [...draft.anchors] : [],
    activeAnchorId: draft.activeAnchorId || null,
    anchor: draft.anchor || { x: 0, y: 0, name: 'origin', kind: 'primary' },
    template,
    generator,
    bom: draft.bom || { rows: [], groupedRows: [] },
    constraints: Array.isArray(draft.constraints) ? [...draft.constraints] : [],
    patterns: Array.isArray(draft.patterns) ? [...draft.patterns] : [],
    metadata,
    isDirty: draft.isDirty === true,
  };
}
