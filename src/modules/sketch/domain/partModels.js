import { generateId } from '@/domain/ids';
import { clonePlaneDefinition, normalizeSolidProfile } from './solidGeometry';

function createPartBase(type, overrides = {}) {
  return {
    id: generateId('part'),
    type,
    name: overrides.name || type,
    assemblyId: overrides.assemblyId || null,
    objectId: overrides.objectId || null,
    parentId: overrides.parentId || null,
    role: overrides.role || null,
    generatedRole: overrides.generatedRole || null,
    source: overrides.source || 'manual',
    locked: overrides.locked ?? false,
    sortIndex: overrides.sortIndex ?? 0,
    position: { x: 0, y: 0, z: 0, ...overrides.position },
    rotation: { x: 0, y: 0, z: 0, ...overrides.rotation },
    flip: { x: false, y: false, z: false, ...overrides.flip },
    fill: overrides.fill ?? 'rgba(184, 134, 11, 0.06)',
    stroke: overrides.stroke ?? '#1E2433',
    strokeWidth: overrides.strokeWidth ?? 2,
    ...overrides,
  };
}

export function createPanel(overrides = {}) {
  return createPartBase('panel', {
    name: 'Panel',
    width: 600,
    depth: 400,
    thickness: 18,
    material: 'plywood',
    ...overrides,
  });
}

export function createLeg(overrides = {}) {
  return createPartBase('leg', {
    name: 'Leg',
    width: 40,
    depth: 40,
    height: 720,
    profile: 'square',
    material: 'hardwood',
    ...overrides,
  });
}

export function createFrame(overrides = {}) {
  return createPartBase('frame', {
    name: 'Frame',
    width: 40,
    height: 60,
    length: 500,
    axis: 'x',
    material: 'hardwood',
    ...overrides,
  });
}

export function createSolid(overrides = {}) {
  return createPartBase('solid', {
    name: 'Solid',
    material: 'custom',
    extrusionDepth: 120,
    plane: clonePlaneDefinition(overrides.plane),
    profilePoints: normalizeSolidProfile(overrides.profilePoints),
    ...overrides,
  });
}

export function createCutout(overrides = {}) {
  if (!overrides.parentId) throw new Error('Cutout requires a parentId');
  return createPartBase('cutout', {
    name: 'Cutout',
    width: 100,
    height: 50,
    depth: 18,
    offsetX: 0,
    offsetY: 0,
    ...overrides,
  });
}

export function createHole(overrides = {}) {
  if (!overrides.parentId) throw new Error('Hole requires a parentId');
  return createPartBase('hole', {
    name: 'Hole',
    diameter: 35,
    depth: 18,
    offsetX: 0,
    offsetY: 0,
    ...overrides,
  });
}

export function createMesh3d(overrides = {}) {
  return createPartBase('mesh3d', {
    name: 'Mesh',
    material: 'custom',
    vertices3d: overrides.vertices3d || [],
    thickness: overrides.thickness ?? 18,
    ...overrides,
  });
}

export function createDimension(overrides = {}) {
  return createPartBase('dimension', {
    name: 'Dimension',
    startPoint: { x: 0, y: 0, z: 0, ...overrides.startPoint },
    endPoint: { x: 0, y: 0, z: 0, ...overrides.endPoint },
    offset: 200,
    textOverride: null,
    boundPartId: null,
    boundProperty: null,
    boundAxis: null,
    fill: 'none',
    stroke: '#1E2433',
    ...overrides,
  });
}
