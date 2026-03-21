export function getNumeric(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function normalizeTemplateInput(input = {}) {
  return {
    width: getNumeric(input.width, 600),
    height: getNumeric(input.height, 900),
    depth: getNumeric(input.depth, 450),
    thickness: getNumeric(input.thickness, 18),
    material: input.material || 'plywood',
    layerId: input.layerId || 'default',
    origin: {
      x: Number(input.origin?.x) || 0,
      y: Number(input.origin?.y) || 0,
      z: Number(input.origin?.z) || 0,
    },
    inset: {
      x: Number(input.inset?.x) || 0,
      y: Number(input.inset?.y) || 0,
      z: Number(input.inset?.z) || 0,
    },
  };
}

function buildParametricPart(role, template, name, input = {}) {
  const normalized = normalizeTemplateInput(input);
  const extents = input.extents || {
    width: normalized.width,
    depth: normalized.depth,
    height: normalized.height,
  };

  return {
    id: input.id || null,
    name,
    role,
    width: normalized.width,
    height: normalized.height,
    thickness: normalized.thickness,
    material: normalized.material,
    profileEntityIds: Array.isArray(input.profileEntityIds) ? [...input.profileEntityIds] : [],
    featureIds: Array.isArray(input.featureIds) ? [...input.featureIds] : [],
    layerId: normalized.layerId,
    parametric: {
      template,
      width: normalized.width,
      height: normalized.height,
      depth: normalized.depth,
      thickness: normalized.thickness,
      anchor: {
        x: Number(input.anchor?.x) || normalized.origin.x,
        y: Number(input.anchor?.y) || normalized.origin.y,
      },
      origin: normalized.origin,
      inset: normalized.inset,
      extents,
      metadata: {
        ...(input.parametric?.metadata || {}),
      },
    },
    metadata: {
      generated: input.generated === true,
      ...input.metadata,
    },
  };
}

export function createPanelPart(input = {}) {
  return buildParametricPart('panel', 'panel', input.name || 'Panel', input);
}

export function createShelfPart(input = {}) {
  return buildParametricPart('shelf', 'shelf', input.name || 'Shelf', input);
}

export function createSupportPart(input = {}) {
  return buildParametricPart('support', 'support', input.name || 'Support', input);
}

export function createLegPart(input = {}) {
  return buildParametricPart('leg', 'leg', input.name || 'Leg', input);
}

export function createDoorPart(input = {}) {
  return buildParametricPart('door', 'door', input.name || 'Door', input);
}

export function createDrawerFrontPart(input = {}) {
  return buildParametricPart('drawer-front', 'drawer-front', input.name || 'Drawer Front', input);
}

export function createRailPart(input = {}) {
  return buildParametricPart('rail', 'rail', input.name || 'Rail', input);
}

export function createBracePart(input = {}) {
  return buildParametricPart('brace', 'brace', input.name || 'Brace', input);
}

export function createDividerPart(input = {}) {
  return buildParametricPart('divider', 'divider', input.name || 'Divider', input);
}

export function createCustomProfilePart(input = {}) {
  return buildParametricPart('custom-profile', 'custom-profile', input.name || 'Custom Profile', input);
}

export function createTemplatePart(template, input = {}) {
  switch (template) {
    case 'panel':
      return createPanelPart(input);
    case 'shelf':
      return createShelfPart(input);
    case 'support':
      return createSupportPart(input);
    case 'leg':
      return createLegPart(input);
    case 'door':
      return createDoorPart(input);
    case 'drawer-front':
      return createDrawerFrontPart(input);
    case 'rail':
      return createRailPart(input);
    case 'brace':
      return createBracePart(input);
    case 'divider':
      return createDividerPart(input);
    case 'custom-profile':
      return createCustomProfilePart(input);
    default:
      return buildParametricPart(input.role || 'generic', template || 'generic', input.name || 'Part', input);
  }
}
