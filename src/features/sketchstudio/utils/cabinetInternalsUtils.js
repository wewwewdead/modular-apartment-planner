import {
  createPanelPart,
  createShelfPart,
  createSupportPart,
  getNumeric,
} from './partTemplateUtils';

export function evenShelfPositions(innerHeight, shelfCount, thickness) {
  if (shelfCount <= 0 || innerHeight <= 0) {
    return [];
  }

  const gap = innerHeight / (shelfCount + 1);
  const positions = [];
  for (let i = 1; i <= shelfCount; i += 1) {
    positions.push(gap * i - thickness / 2);
  }
  return positions;
}

export function validateShelfPositions(positions, innerHeight, thickness) {
  const errors = [];

  if (!Array.isArray(positions)) {
    return { valid: false, errors: ['shelfPositions must be an array'] };
  }

  positions.forEach((pos, i) => {
    if (!Number.isFinite(pos) || pos < 0) {
      errors.push(`Shelf ${i + 1}: position must be a non-negative number`);
    } else if (pos + thickness > innerHeight) {
      errors.push(`Shelf ${i + 1}: exceeds inner height (${pos + thickness} > ${innerHeight})`);
    }
  });

  const sorted = [...positions].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] < thickness) {
      errors.push(`Shelves at ${sorted[i - 1].toFixed(1)} and ${sorted[i].toFixed(1)} overlap (gap < ${thickness})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeCabinetInternalsParams(params = {}) {
  return {
    width: getNumeric(params.width, 1200),
    height: getNumeric(params.height, 900),
    depth: getNumeric(params.depth, 450),
    thickness: getNumeric(params.thickness, 18),
    material: params.material || 'plywood',
    layerId: params.layerId || 'default',
    shelfCount: Math.max(0, Math.round(Number(params.shelfCount) || 0)),
    shelfPositions: Array.isArray(params.shelfPositions) ? params.shelfPositions : null,
    dividerCount: Math.max(0, Math.round(Number(params.dividerCount) || 0)),
    includeBackPanel: params.includeBackPanel !== false,
  };
}

function buildGeneratedMeta(origin, extents) {
  return { generated: true, origin, extents };
}

export function generateCabinetInternalsParts(params = {}) {
  const p = normalizeCabinetInternalsParams(params);
  const innerWidth = Math.max(0, p.width - p.thickness * 2);
  const innerHeight = Math.max(0, p.height - p.thickness * 2);
  const parts = [];

  // Side panels
  parts.push(createPanelPart({
    name: 'Left Side Panel',
    width: p.depth, height: p.height, thickness: p.thickness, material: p.material, layerId: p.layerId,
    origin: { x: 0, y: 0, z: 0 },
    extents: { width: p.thickness, depth: p.depth, height: p.height },
    metadata: buildGeneratedMeta({ x: 0, y: 0, z: 0 }, { width: p.thickness, depth: p.depth, height: p.height }),
    generated: true,
  }));
  parts.push(createPanelPart({
    name: 'Right Side Panel',
    width: p.depth, height: p.height, thickness: p.thickness, material: p.material, layerId: p.layerId,
    origin: { x: p.width - p.thickness, y: 0, z: 0 },
    extents: { width: p.thickness, depth: p.depth, height: p.height },
    metadata: buildGeneratedMeta({ x: p.width - p.thickness, y: 0, z: 0 }, { width: p.thickness, depth: p.depth, height: p.height }),
    generated: true,
  }));

  // Top and bottom panels
  parts.push(createPanelPart({
    name: 'Top Panel',
    width: innerWidth, height: p.depth, thickness: p.thickness, material: p.material, layerId: p.layerId,
    origin: { x: p.thickness, y: 0, z: p.height - p.thickness },
    extents: { width: innerWidth, depth: p.depth, height: p.thickness },
    metadata: buildGeneratedMeta({ x: p.thickness, y: 0, z: p.height - p.thickness }, { width: innerWidth, depth: p.depth, height: p.thickness }),
    generated: true,
  }));
  parts.push(createPanelPart({
    name: 'Bottom Panel',
    width: innerWidth, height: p.depth, thickness: p.thickness, material: p.material, layerId: p.layerId,
    origin: { x: p.thickness, y: 0, z: 0 },
    extents: { width: innerWidth, depth: p.depth, height: p.thickness },
    metadata: buildGeneratedMeta({ x: p.thickness, y: 0, z: 0 }, { width: innerWidth, depth: p.depth, height: p.thickness }),
    generated: true,
  }));

  // Back panel (optional)
  if (p.includeBackPanel) {
    parts.push(createPanelPart({
      name: 'Back Panel',
      width: innerWidth, height: innerHeight, thickness: p.thickness, material: p.material, layerId: p.layerId,
      origin: { x: p.thickness, y: p.depth - p.thickness, z: p.thickness },
      extents: { width: innerWidth, depth: p.thickness, height: innerHeight },
      metadata: buildGeneratedMeta({ x: p.thickness, y: p.depth - p.thickness, z: p.thickness }, { width: innerWidth, depth: p.thickness, height: innerHeight }),
      generated: true,
    }));
  }

  // Shelves
  const shelfDepth = p.includeBackPanel ? p.depth - p.thickness : p.depth;
  const positions = p.shelfPositions
    ? p.shelfPositions
    : evenShelfPositions(innerHeight, p.shelfCount, p.thickness);

  positions.forEach((zOffset, i) => {
    const z = p.thickness + zOffset;
    parts.push(createShelfPart({
      name: `Shelf ${i + 1}`,
      width: innerWidth, height: shelfDepth, thickness: p.thickness, material: p.material, layerId: p.layerId,
      origin: { x: p.thickness, y: 0, z },
      extents: { width: innerWidth, depth: shelfDepth, height: p.thickness },
      metadata: buildGeneratedMeta({ x: p.thickness, y: 0, z }, { width: innerWidth, depth: shelfDepth, height: p.thickness }),
      generated: true,
    }));
  });

  // Dividers
  if (p.dividerCount > 0 && innerWidth > 0) {
    const dividerGap = innerWidth / (p.dividerCount + 1);
    for (let i = 0; i < p.dividerCount; i += 1) {
      const x = p.thickness + dividerGap * (i + 1) - p.thickness / 2;
      parts.push(createSupportPart({
        name: `Divider ${i + 1}`,
        width: shelfDepth, height: innerHeight, thickness: p.thickness, material: p.material, layerId: p.layerId,
        origin: { x, y: 0, z: p.thickness },
        extents: { width: p.thickness, depth: shelfDepth, height: innerHeight },
        metadata: buildGeneratedMeta({ x, y: 0, z: p.thickness }, { width: p.thickness, depth: shelfDepth, height: innerHeight }),
        generated: true,
      }));
    }
  }

  return parts;
}
