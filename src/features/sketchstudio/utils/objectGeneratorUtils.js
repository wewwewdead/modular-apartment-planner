import { createTemplatePart, getNumeric } from './partTemplateUtils';
import { runGenerator, getGenerator } from './generatorRegistry';
import { generateCabinetBoxObjectParts } from './cabinetTemplateUtils';
import { generateShelvingUnitObjectParts } from './shelvingTemplateUtils';

export { generateCabinetBoxObjectParts, generateShelvingUnitObjectParts };

export function applyGeneratedPartsToObjectDraft(objectDraft, generatorType, params = {}) {
  const normalized = {
    ...objectDraft?.bounds,
    ...objectDraft?.defaults,
    ...params,
    width: getNumeric(params.width ?? objectDraft?.bounds?.width, 1200),
    height: getNumeric(params.height ?? objectDraft?.bounds?.height, 900),
    depth: getNumeric(params.depth ?? objectDraft?.bounds?.depth, 450),
    thickness: getNumeric(params.thickness ?? objectDraft?.defaults?.thickness, 18),
    material: params.material || objectDraft?.defaults?.material || 'plywood',
    shelfCount: Math.max(0, Math.round(Number(params.shelfCount) || 0)),
    layerId: params.layerId || 'default',
    shelfPositions: Array.isArray(params.shelfPositions) ? params.shelfPositions : null,
    dividerCount: Math.max(0, Math.round(Number(params.dividerCount) || 0)),
    includeBackPanel: params.includeBackPanel !== false,
  };
  const generatedParts = runGenerator(generatorType, normalized)
    || generateCabinetBoxObjectParts(normalized);
  const manualParts = (objectDraft?.parts || []).filter((part) => part.metadata?.generated !== true);
  const generator = getGenerator(generatorType);

  return {
    ...objectDraft,
    defaults: {
      ...objectDraft?.defaults,
      thickness: normalized.thickness,
      material: normalized.material,
    },
    bounds: {
      ...objectDraft?.bounds,
      width: normalized.width,
      depth: normalized.depth,
      height: normalized.height,
    },
    generator: {
      type: generatorType,
      params: normalized,
    },
    template: generator
      ? {
          id: generator.id,
          label: generator.label,
          source: 'generator',
          metadata: {},
        }
      : objectDraft?.template || null,
    category: generator?.category || objectDraft?.category || 'custom',
    objectType: generator?.objectType || objectDraft?.objectType || 'assembly',
    metadata: {
      ...(objectDraft?.metadata || {}),
      creationMode: 'generator',
    },
    parts: [
      ...generatedParts.map((part, index) => ({
        ...part,
        id: `part-generated-${index + 1}`,
      })),
      ...manualParts,
    ],
  };
}

export function createPartFromTemplate(template, params = {}, objectDraft = null) {
  const defaults = {
    width: objectDraft?.bounds?.width || 600,
    height: objectDraft?.bounds?.height || 900,
    depth: objectDraft?.bounds?.depth || 450,
    thickness: objectDraft?.defaults?.thickness || 18,
    material: objectDraft?.defaults?.material || 'plywood',
    layerId: objectDraft?.parts?.[0]?.layerId || 'default',
  };

  return createTemplatePart(template, {
    ...defaults,
    ...params,
  });
}
