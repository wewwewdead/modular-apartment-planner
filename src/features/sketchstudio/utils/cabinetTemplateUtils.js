import { generateCabinetInternalsParts, normalizeCabinetInternalsParams } from './cabinetInternalsUtils';
import { createPanelPart, createShelfPart } from './partTemplateUtils';
import { normalizePartTransforms } from './partAssemblyUtils';

function buildGeneratedMetadata(origin, extents) {
  return {
    generated: true,
    origin,
    extents,
  };
}

export function getCabinetTemplateDefinition() {
  return {
    id: 'cabinetBox',
    label: 'Cabinet Box',
    group: 'generator',
    category: 'storage',
    objectType: 'assembly',
    defaultParams: {
      width: 1200,
      height: 900,
      depth: 450,
      thickness: 18,
      material: 'plywood',
      shelfCount: 2,
    },
    paramFields: [
      { key: 'width', label: 'Width', type: 'number', step: 10 },
      { key: 'depth', label: 'Depth', type: 'number', step: 10 },
      { key: 'height', label: 'Height', type: 'number', step: 10 },
      { key: 'thickness', label: 'Thickness', type: 'number', step: 1 },
      { key: 'shelfCount', label: 'Shelves', type: 'number', step: 1 },
    ],
    generateParts: generateCabinetBoxObjectParts,
  };
}

export function generateCabinetBoxObjectParts(params = {}) {
  const normalized = normalizeCabinetInternalsParams(params);

  if (normalized.shelfPositions || normalized.dividerCount > 0 || normalized.includeBackPanel === false) {
    return generateCabinetInternalsParts(normalized).map(normalizePartTransforms);
  }

  const innerWidth = Math.max(0, normalized.width - (normalized.thickness * 2));
  const innerHeight = Math.max(0, normalized.height - (normalized.thickness * 2));
  const parts = [
    createPanelPart({
      name: 'Left Side Panel',
      role: 'side',
      width: normalized.depth,
      height: normalized.height,
      thickness: normalized.thickness,
      material: normalized.material,
      layerId: normalized.layerId,
      origin: { x: 0, y: 0, z: 0 },
      extents: { width: normalized.thickness, depth: normalized.depth, height: normalized.height },
      metadata: buildGeneratedMetadata({ x: 0, y: 0, z: 0 }, { width: normalized.thickness, depth: normalized.depth, height: normalized.height }),
      generated: true,
    }),
    createPanelPart({
      name: 'Right Side Panel',
      role: 'side',
      width: normalized.depth,
      height: normalized.height,
      thickness: normalized.thickness,
      material: normalized.material,
      layerId: normalized.layerId,
      origin: { x: normalized.width - normalized.thickness, y: 0, z: 0 },
      extents: { width: normalized.thickness, depth: normalized.depth, height: normalized.height },
      metadata: buildGeneratedMetadata({ x: normalized.width - normalized.thickness, y: 0, z: 0 }, { width: normalized.thickness, depth: normalized.depth, height: normalized.height }),
      generated: true,
    }),
    createPanelPart({
      name: 'Top Panel',
      role: 'top',
      width: innerWidth,
      height: normalized.depth,
      thickness: normalized.thickness,
      material: normalized.material,
      layerId: normalized.layerId,
      origin: { x: normalized.thickness, y: 0, z: normalized.height - normalized.thickness },
      extents: { width: innerWidth, depth: normalized.depth, height: normalized.thickness },
      metadata: buildGeneratedMetadata({ x: normalized.thickness, y: 0, z: normalized.height - normalized.thickness }, { width: innerWidth, depth: normalized.depth, height: normalized.thickness }),
      generated: true,
    }),
    createPanelPart({
      name: 'Bottom Panel',
      role: 'bottom',
      width: innerWidth,
      height: normalized.depth,
      thickness: normalized.thickness,
      material: normalized.material,
      layerId: normalized.layerId,
      origin: { x: normalized.thickness, y: 0, z: 0 },
      extents: { width: innerWidth, depth: normalized.depth, height: normalized.thickness },
      metadata: buildGeneratedMetadata({ x: normalized.thickness, y: 0, z: 0 }, { width: innerWidth, depth: normalized.depth, height: normalized.thickness }),
      generated: true,
    }),
    createPanelPart({
      name: 'Back Panel',
      role: 'back',
      width: innerWidth,
      height: innerHeight,
      thickness: normalized.thickness,
      material: normalized.material,
      layerId: normalized.layerId,
      origin: { x: normalized.thickness, y: normalized.depth - normalized.thickness, z: normalized.thickness },
      extents: { width: innerWidth, depth: normalized.thickness, height: innerHeight },
      metadata: buildGeneratedMetadata({ x: normalized.thickness, y: normalized.depth - normalized.thickness, z: normalized.thickness }, { width: innerWidth, depth: normalized.thickness, height: innerHeight }),
      generated: true,
    }),
  ];

  if (normalized.shelfCount > 0) {
    const verticalGap = innerHeight / (normalized.shelfCount + 1);
    for (let index = 0; index < normalized.shelfCount; index += 1) {
      const z = normalized.thickness + (verticalGap * (index + 1)) - (normalized.thickness / 2);
      parts.push(createShelfPart({
        name: `Shelf ${index + 1}`,
        role: 'shelf',
        width: innerWidth,
        height: normalized.depth - normalized.thickness,
        thickness: normalized.thickness,
        material: normalized.material,
        layerId: normalized.layerId,
        origin: { x: normalized.thickness, y: 0, z },
        extents: { width: innerWidth, depth: normalized.depth - normalized.thickness, height: normalized.thickness },
        metadata: buildGeneratedMetadata({ x: normalized.thickness, y: 0, z }, { width: innerWidth, depth: normalized.depth - normalized.thickness, height: normalized.thickness }),
        generated: true,
      }));
    }
  }

  return parts.map(normalizePartTransforms);
}

