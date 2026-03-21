import { computeEntityBoundingBox, computeFootprintFromEntities } from './bboxUtils';
import { buildExportAnchorPayload, computeAnchorFromBounds, createDefaultAnchor, setPrimaryAnchor } from './anchorUtils';
import { filterNonIsometricEntities } from './isometricUtils';
import { extractClosedLoopsFromEntities, isPolylineClosed, loopToFootprintPayload } from './profileUtils';
import { DEFAULT_CATEGORY, DEFAULT_OBJECT_TYPE } from './objectTypeConstants';

export function createObjectId(existingObjects = []) {
  const highest = existingObjects.reduce((max, item) => {
    const suffix = Number(String(item.id).split('-').at(-1));
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  return `object-${highest + 1}`;
}

export function createPartId(parts = []) {
  const highest = parts.reduce((max, item) => {
    const suffix = Number(String(item.id).split('-').at(-1));
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  return `part-${highest + 1}`;
}

function isProfileEntity(entity) {
  return entity?.type === 'rect'
    || entity?.type === 'circle'
    || (entity?.type === 'polyline' && isPolylineClosed(entity));
}

export function applyObjectDefaultsToPart(objectDraft, part) {
  return {
    ...part,
    thickness: Number(part?.thickness) > 0
      ? Number(part.thickness)
      : Number(objectDraft?.defaults?.thickness) || 18,
    material: part?.material || objectDraft?.defaults?.material || 'plywood',
    role: part?.role || 'generic',
    width: Number(part?.width) > 0 ? Number(part.width) : Number(part?.parametric?.width) || 0,
    height: Number(part?.height) > 0 ? Number(part.height) : Number(part?.parametric?.height) || 0,
  };
}

export function computeObjectBounds(entities, height = 900) {
  const boxes = entities.map((entity) => computeEntityBoundingBox(entity, entities)).filter(Boolean);

  if (!boxes.length) {
    return null;
  }

  return {
    width: Math.max(...boxes.map((box) => box.maxX)) - Math.min(...boxes.map((box) => box.minX)),
    depth: Math.max(...boxes.map((box) => box.maxY)) - Math.min(...boxes.map((box) => box.minY)),
    height,
  };
}

export function computePartBounds(entities, profileEntityIds = []) {
  if (profileEntityIds?.parametricBounds) {
    return profileEntityIds.parametricBounds;
  }
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

export function computePartSummary(part, entities, objectDraft = null) {
  const parametricBounds = part?.parametric?.origin && part?.parametric?.extents
    ? {
        minX: part.parametric.origin.x,
        minY: part.parametric.origin.y,
        maxX: part.parametric.origin.x + (Number(part.parametric.extents.width) || 0),
        maxY: part.parametric.origin.y + (Number(part.parametric.extents.depth) || 0),
        width: Number(part.parametric.extents.width) || 0,
        depth: Number(part.parametric.extents.depth) || 0,
      }
    : null;
  const bounds = parametricBounds || computePartBounds(entities, part.profileEntityIds);
  const resolvedPart = objectDraft ? applyObjectDefaultsToPart(objectDraft, part) : part;

  return {
    ...resolvedPart,
    bounds,
    sizeLabel: bounds
      ? `${Math.round(bounds.width)} x ${Math.round(bounds.depth)} mm`
      : (resolvedPart.width && resolvedPart.height ? `${Math.round(resolvedPart.width)} x ${Math.round(resolvedPart.height)} mm` : 'Unresolved'),
  };
}

export function buildObjectFeatureList(entities) {
  return filterNonIsometricEntities(entities)
    .filter((entity) => entity.type === 'feature')
    .map((entity) => ({
      id: entity.id,
      type: entity.featureType,
      operation: entity.operation || 'subtract',
      targetPartId: entity.targetPartId ?? entity.meta?.targetPartId ?? null,
      sourceProfileId: entity.sourceProfileId ?? entity.meta?.profileEntityId ?? null,
      shape: entity.shape,
      depth: entity.depth ?? null,
      through: entity.through !== false,
      ...('cx' in entity ? { cx: entity.cx, cy: entity.cy, diameter: entity.diameter } : {}),
      ...('rx' in entity ? { cx: entity.cx, cy: entity.cy, rx: entity.rx, ry: entity.ry, rotation: entity.rotation ?? 0 } : {}),
      ...('x' in entity ? { x: entity.x, y: entity.y, width: entity.width, height: entity.height } : {}),
      ...(entity.points ? { points: entity.points.map((point) => ({ ...point })) } : {}),
      metadata: {
        ...entity.meta,
      },
    }));
}

function buildDefaultPartsFromEntities(geometryEntities, loops, objectDefaults) {
  const explicitProfileEntities = geometryEntities.filter(isProfileEntity);

  if (explicitProfileEntities.length) {
    return explicitProfileEntities.map((entity, index) => applyObjectDefaultsToPart({
      defaults: objectDefaults,
    }, {
      id: `part-${index + 1}`,
      name: index === 0 ? 'Main Part' : `Part ${index + 1}`,
      role: index === 0 ? 'panel' : 'generic',
      thickness: objectDefaults.thickness,
      material: objectDefaults.material,
      profileEntityIds: [entity.id],
      featureIds: [],
      layerId: entity.layerId || 'default',
      metadata: {},
    }));
  }

  return loops.map((loop, index) => applyObjectDefaultsToPart({
    defaults: objectDefaults,
  }, {
    id: `part-${index + 1}`,
    name: index === 0 ? 'Main Part' : `Loop Part ${index + 1}`,
    role: index === 0 ? 'panel' : 'generic',
    thickness: objectDefaults.thickness,
    material: objectDefaults.material,
    profileEntityIds: loop.sourceEntityIds || [],
    featureIds: [],
    layerId: geometryEntities.find((entity) => (loop.sourceEntityIds || []).includes(entity.id))?.layerId || 'default',
    metadata: {},
  }));
}

export function createPartFromSelection({
  objectDraft,
  entities,
  selectedIds,
  name,
  role = 'generic',
}) {
  const nextPart = {
    id: createPartId(objectDraft?.parts || []),
    name: name || `Part ${(objectDraft?.parts || []).length + 1}`,
    role,
    thickness: Number(objectDraft?.defaults?.thickness) || 18,
    material: objectDraft?.defaults?.material || 'plywood',
    profileEntityIds: selectedIds.filter((entityId) => entities.some((entity) => entity.id === entityId)),
    featureIds: [],
    layerId: entities.find((entity) => entity.id === selectedIds[0])?.layerId || 'default',
    metadata: {},
  };

  return applyObjectDefaultsToPart(objectDraft, nextPart);
}

export function assignEntitiesToPart(parts, partId, entityIds) {
  return parts.map((part) => (
    part.id === partId
      ? {
          ...part,
          profileEntityIds: Array.from(new Set(entityIds)),
        }
      : part
  ));
}

export function assignFeaturesToPart(parts, partId, featureIds) {
  return parts.map((part) => (
    part.id === partId
      ? {
          ...part,
          featureIds: Array.from(new Set(featureIds)),
        }
      : part
  ));
}

export function computeObjectFootprint(entities) {
  const geometryEntities = filterNonIsometricEntities(entities).filter((entity) => entity.type !== 'text');
  const loops = extractClosedLoopsFromEntities(geometryEntities);

  if (loops.length) {
    const primaryLoop = [...loops].sort((left, right) => right.area - left.area)[0];
    return loopToFootprintPayload(primaryLoop);
  }

  const fallback = computeFootprintFromEntities(geometryEntities);
  if (!fallback?.points?.length) {
    return null;
  }

  return {
    type: 'profile',
    points: fallback.points,
  };
}

export function createObjectDraftFromSelection({
  document,
  selectedEntities,
  existingObjects = [],
  nextName = 'Custom Object',
}) {
  const geometryEntities = filterNonIsometricEntities(selectedEntities).filter((entity) => entity.type !== 'dimension' && entity.type !== 'text');
  const features = buildObjectFeatureList(geometryEntities);
  const featureIds = features.map((feature) => feature.id);
  const objectDefaults = {
    thickness: 18,
    material: 'plywood',
  };
  const loops = extractClosedLoopsFromEntities(geometryEntities);
  const footprint = computeObjectFootprint(geometryEntities);
  const bounds = computeObjectBounds(geometryEntities) ?? { width: 0, depth: 0, height: 900 };
  const footprintBounds = footprint?.points?.length
    ? footprint.points.reduce((accumulator, point) => ({
        minX: Math.min(accumulator.minX, point.x),
        minY: Math.min(accumulator.minY, point.y),
        maxX: Math.max(accumulator.maxX, point.x),
        maxY: Math.max(accumulator.maxY, point.y),
      }), {
        minX: footprint.points[0].x,
        minY: footprint.points[0].y,
        maxX: footprint.points[0].x,
        maxY: footprint.points[0].y,
      })
    : null;
  const originAnchor = createDefaultAnchor(footprintBounds);
  const centerAnchor = computeAnchorFromBounds(footprintBounds, 'center');
  const frontLeftAnchor = computeAnchorFromBounds(footprintBounds, 'front-left');
  const parts = buildDefaultPartsFromEntities(geometryEntities, loops, objectDefaults).map((part, index) => ({
    ...part,
    featureIds: index === 0 ? featureIds : [],
  }));

  return {
    id: createObjectId(existingObjects),
    name: nextName,
    objectType: DEFAULT_OBJECT_TYPE,
    category: DEFAULT_CATEGORY,
    units: document.units,
    sourceDocumentId: document.id,
    sourceEntityIds: geometryEntities.map((entity) => entity.id),
    profileEntityIds: Array.from(new Set(parts.flatMap((part) => part.profileEntityIds))),
    defaults: objectDefaults,
    footprint,
    bounds,
    parts,
    features,
    anchors: setPrimaryAnchor([originAnchor, centerAnchor, frontLeftAnchor], originAnchor.id),
    anchor: buildExportAnchorPayload({ anchors: [originAnchor] }),
    template: null,
    generator: {
      type: null,
      params: {},
    },
    bom: {
      rows: [],
      groupedRows: [],
    },
    metadata: {
      creationMode: 'selection',
    },
  };
}

export function buildFloorPlannerAssetFromObject(object) {
  return {
    version: 1,
    id: `asset-${object.id}`,
    source: 'sketchstudio',
    objectId: object.id,
    name: object.name,
    category: object.category,
    footprint: object.footprint,
    bounds: object.bounds,
    anchor: buildExportAnchorPayload(object),
    anchors: object.anchors || [],
    parts: (object.parts || []).map((part) => ({
      ...applyObjectDefaultsToPart(object, part),
      parametric: part.parametric || null,
    })),
    features: object.features || [],
    thumbnail: null,
    metadata: {
      defaults: object.defaults || {},
      bom: object.bom || { rows: [], groupedRows: [] },
      generator: object.generator || { type: null, params: {} },
      template: object.template || null,
      creationMode: object.metadata?.creationMode || 'blank',
      ...object.metadata,
    },
  };
}

export function getSelectedProfileInfo(entities) {
  const loops = extractClosedLoopsFromEntities(filterNonIsometricEntities(entities));
  if (!loops.length) {
    return null;
  }

  const primaryLoop = [...loops].sort((left, right) => right.area - left.area)[0];
  return {
    count: loops.length,
    entityIds: Array.from(new Set(loops.flatMap((loop) => loop.sourceEntityIds || [loop.entityId]))),
    footprintPoints: primaryLoop.points,
    area: primaryLoop.area,
  };
}
