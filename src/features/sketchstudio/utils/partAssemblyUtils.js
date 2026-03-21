import { createTemplatePart } from './partTemplateUtils';
import { createPartId } from './objectUtils';

function createDefaultTransform(part = {}) {
  return {
    x: Number(part?.transform?.x) || Number(part?.parametric?.origin?.x) || 0,
    y: Number(part?.transform?.y) || Number(part?.parametric?.origin?.y) || 0,
    z: Number(part?.transform?.z) || Number(part?.parametric?.origin?.z) || 0,
    rotation: Number(part?.transform?.rotation) || 0,
    mirrorX: part?.transform?.mirrorX === true,
    mirrorY: part?.transform?.mirrorY === true,
  };
}

function clonePart(part) {
  return JSON.parse(JSON.stringify(part));
}

function syncTransformIntoParametric(part) {
  if (!part?.parametric) {
    return part;
  }

  return {
    ...part,
    parametric: {
      ...part.parametric,
      origin: {
        x: Number(part.transform?.x) || 0,
        y: Number(part.transform?.y) || 0,
        z: Number(part.transform?.z) || 0,
      },
    },
  };
}

export function normalizePartTransforms(part) {
  if (!part) {
    return part;
  }

  return syncTransformIntoParametric({
    ...part,
    transform: createDefaultTransform(part),
  });
}

export function createManualPart({
  objectDraft,
  name,
  role = 'generic',
  kind = null,
  width,
  height,
  depth,
  thickness,
  material,
} = {}) {
  const partId = createPartId(objectDraft?.parts || []);
  const defaults = objectDraft?.defaults || {};
  const nextPart = createTemplatePart(role, {
    id: partId,
    name: name || `Part ${(objectDraft?.parts || []).length + 1}`,
    role,
    width: width || objectDraft?.bounds?.width || 600,
    height: height || objectDraft?.bounds?.height || 900,
    depth: depth || objectDraft?.bounds?.depth || 400,
    thickness: thickness || defaults.thickness || 18,
    material: material || defaults.material || 'plywood',
    layerId: objectDraft?.parts?.[0]?.layerId || 'default',
    origin: { x: 0, y: 0, z: 0 },
  });

  return normalizePartTransforms({
    ...nextPart,
    ...(kind ? { kind } : {}),
    metadata: {
      ...nextPart.metadata,
      manual: true,
    },
  });
}

export function assignSelectionToPart(parts, partId, selectedIds = []) {
  const entityIds = Array.from(new Set(selectedIds));
  return (parts || []).map((part) => (
    part.id === partId
      ? normalizePartTransforms({
          ...part,
          profileEntityIds: entityIds,
        })
      : part
  ));
}

export function updatePartTransform(parts, partId, updates = {}) {
  return (parts || []).map((part) => {
    if (part.id !== partId) {
      return part;
    }

    return normalizePartTransforms({
      ...part,
      transform: {
        ...createDefaultTransform(part),
        ...updates,
      },
    });
  });
}

export function removePart(parts, partId) {
  return (parts || []).filter((part) => part.id !== partId);
}

export function duplicatePart(partsOrDraft, sourcePartId, offset = { x: 50, y: 0, z: 0 }) {
  return duplicatePartWithOffset(partsOrDraft, sourcePartId, offset);
}

export function duplicatePartWithOffset(partsOrDraft, sourcePartId, offset = { x: 50, y: 0, z: 0 }) {
  const parts = Array.isArray(partsOrDraft) ? partsOrDraft : (partsOrDraft?.parts || []);
  const source = parts.find((part) => part.id === sourcePartId);
  if (!source) {
    return parts;
  }

  const cloned = clonePart(source);
  cloned.id = createPartId(parts);
  cloned.name = `${source.name} (copy)`;
  cloned.transform = {
    ...createDefaultTransform(source),
    x: (Number(source.transform?.x) || Number(source.parametric?.origin?.x) || 0) + (offset.x || 0),
    y: (Number(source.transform?.y) || Number(source.parametric?.origin?.y) || 0) + (offset.y || 0),
    z: (Number(source.transform?.z) || Number(source.parametric?.origin?.z) || 0) + (offset.z || 0),
  };
  cloned.profileEntityIds = [];
  cloned.featureIds = [];
  cloned.metadata = {
    ...(source.metadata || {}),
    duplicatedFrom: source.id,
  };

  return [...parts, normalizePartTransforms(cloned)];
}

export function mirrorPartAcrossAxis(partsOrDraft, sourcePartId, axis = 'x', objectBounds = null) {
  const parts = Array.isArray(partsOrDraft) ? partsOrDraft : (partsOrDraft?.parts || []);
  const bounds = objectBounds || partsOrDraft?.bounds || { width: 0, depth: 0, height: 0 };
  const source = parts.find((part) => part.id === sourcePartId);
  if (!source) {
    return parts;
  }

  const cloned = clonePart(source);
  const transform = createDefaultTransform(source);
  const width = Number(source?.parametric?.extents?.width) || 0;
  const depth = Number(source?.parametric?.extents?.depth) || 0;

  cloned.id = createPartId(parts);
  cloned.name = `${source.name} (mirror)`;
  cloned.transform = {
    ...transform,
    x: axis === 'x' ? (Number(bounds.width) || 0) - transform.x - width : transform.x,
    y: axis === 'y' ? (Number(bounds.depth) || 0) - transform.y - depth : transform.y,
    mirrorX: axis === 'x' ? !transform.mirrorX : transform.mirrorX,
    mirrorY: axis === 'y' ? !transform.mirrorY : transform.mirrorY,
  };
  cloned.profileEntityIds = [];
  cloned.featureIds = [];
  cloned.metadata = {
    ...(source.metadata || {}),
    mirroredFrom: source.id,
  };

  return [...parts, normalizePartTransforms(cloned)];
}

export function clonePartArray(partsOrDraft, sourcePartId, {
  axis = 'x',
  count = 2,
  spacing = 100,
} = {}) {
  const parts = Array.isArray(partsOrDraft) ? partsOrDraft : (partsOrDraft?.parts || []);
  const source = parts.find((part) => part.id === sourcePartId);
  if (!source) {
    return parts;
  }

  const safeCount = Math.max(1, Math.round(Number(count) || 1));
  const safeSpacing = Number(spacing) || 0;
  const nextParts = [...parts];

  for (let index = 1; index < safeCount; index += 1) {
    const offset = axis === 'y'
      ? { x: 0, y: safeSpacing * index, z: 0 }
      : { x: safeSpacing * index, y: 0, z: 0 };
    const cloned = duplicatePartWithOffset(nextParts, sourcePartId, offset);
    nextParts.splice(0, nextParts.length, ...cloned);
  }

  return nextParts;
}
