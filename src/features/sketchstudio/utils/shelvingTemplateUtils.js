import { getCabinetTemplateDefinition, generateCabinetBoxObjectParts } from './cabinetTemplateUtils';
import { normalizePartTransforms } from './partAssemblyUtils';

export function getShelvingTemplateDefinition() {
  const cabinet = getCabinetTemplateDefinition();

  return {
    ...cabinet,
    id: 'shelvingUnit',
    label: 'Shelving Unit',
    category: 'storage',
    defaultParams: {
      ...cabinet.defaultParams,
      shelfCount: 3,
    },
    generateParts: generateShelvingUnitObjectParts,
  };
}

export function generateShelvingUnitObjectParts(params = {}) {
  const parts = generateCabinetBoxObjectParts({
    ...params,
    shelfCount: Math.max(1, Math.round(Number(params.shelfCount) || 3)),
  }).filter((part) => part.name !== 'Back Panel');

  return parts.map((part) => normalizePartTransforms(
    part.name === 'Top Panel'
      ? {
          ...part,
          name: 'Top Shelf',
          role: 'shelf',
          parametric: { ...part.parametric, template: 'shelf' },
        }
      : part,
  ));
}

