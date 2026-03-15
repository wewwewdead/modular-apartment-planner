import { generateId } from '@/domain/ids';

function clonePoint(origin = {}) {
  return {
    x: Number(origin.x) || 0,
    y: Number(origin.y) || 0,
    z: Number(origin.z) || 0,
  };
}

function buildLegacyRootAssemblyNode(project, assembly) {
  const partNodes = (assembly.partIds || [])
    .map((partId) => project.parts.find((part) => part.id === partId))
    .filter(Boolean)
    .map((part) => ({
      kind: 'part',
      id: part.id,
      partId: part.id,
      role: part.role || part.generatedRole || part.type,
      name: part.name,
    }));

  return {
    kind: 'assembly',
    id: assembly.id,
    assemblyId: assembly.id,
    name: assembly.name,
    role: assembly.role || 'legacy_root',
    description: assembly.description || '',
    children: partNodes,
  };
}

export function createSketchObject(name = 'Untitled Object', overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id || generateId('obj'),
    name,
    description: overrides.description || '',
    summary: overrides.summary || '',
    category: overrides.category || 'general',
    templateType: overrides.templateType || null,
    templateParams: overrides.templateParams ? { ...overrides.templateParams } : null,
    dimensions: overrides.dimensions ? { ...overrides.dimensions } : {},
    origin: clonePoint(overrides.origin),
    source: overrides.source || 'custom',
    editingPolicy: overrides.editingPolicy || 'manual',
    assemblyIds: [...(overrides.assemblyIds || [])],
    partIds: [...(overrides.partIds || [])],
    defaultName: overrides.defaultName || name,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

export function buildObjectTree(project, object) {
  if (!object) return null;

  const assemblies = (project.assemblies || [])
    .filter((assembly) => assembly.objectId === object.id);
  const assemblyById = new Map(assemblies.map((assembly) => [assembly.id, assembly]));
  const partsByAssemblyId = new Map();

  for (const part of project.parts || []) {
    if (!part.assemblyId || part.objectId !== object.id) continue;
    const list = partsByAssemblyId.get(part.assemblyId) || [];
    list.push(part);
    partsByAssemblyId.set(part.assemblyId, list);
  }

  function buildAssemblyNode(assembly) {
    const childAssemblies = assemblies
      .filter((candidate) => candidate.parentAssemblyId === assembly.id)
      .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
    const partNodes = (partsByAssemblyId.get(assembly.id) || [])
      .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0))
      .map((part) => ({
        kind: 'part',
        id: part.id,
        partId: part.id,
        role: part.role || part.generatedRole || part.type,
        name: part.name,
      }));

    return {
      kind: 'assembly',
      id: assembly.id,
      assemblyId: assembly.id,
      name: assembly.name,
      role: assembly.role || 'assembly',
      description: assembly.description || '',
      children: [
        ...childAssemblies.map(buildAssemblyNode),
        ...partNodes,
      ],
    };
  }

  const rootAssemblies = assemblies
    .filter((assembly) => !assembly.parentAssemblyId || !assemblyById.has(assembly.parentAssemblyId))
    .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
  const rootPartNodes = (project.parts || [])
    .filter((part) => part.objectId === object.id && !part.assemblyId)
    .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0))
    .map((part) => ({
      kind: 'part',
      id: part.id,
      partId: part.id,
      role: part.role || part.generatedRole || part.type,
      name: part.name,
    }));

  return {
    kind: 'object',
    id: object.id,
    objectId: object.id,
    name: object.name,
    role: object.templateType || object.category || 'object',
    children: [
      ...rootAssemblies.map(buildAssemblyNode),
      ...rootPartNodes,
    ],
  };
}

export function normalizeSketchObject(object) {
  return createSketchObject(object.name || 'Untitled Object', {
    ...object,
    origin: object.origin,
    templateParams: object.templateParams,
    dimensions: object.dimensions,
    assemblyIds: object.assemblyIds,
    partIds: object.partIds,
  });
}

export function migrateLegacyTemplateAssemblies(project) {
  const objects = [...(project.objects || [])];
  const assemblies = [...(project.assemblies || [])];
  const parts = [...(project.parts || [])];
  const existingObjectIds = new Set(objects.map((object) => object.id));

  for (let index = 0; index < assemblies.length; index += 1) {
    const assembly = assemblies[index];
    if (!assembly.templateType || !assembly.templateParams || assembly.objectId) continue;

    const object = createSketchObject(assembly.name || 'Generated Object', {
      category: assembly.category || assembly.templateType,
      templateType: assembly.templateType,
      templateParams: { ...assembly.templateParams },
      dimensions: {
        width: assembly.templateParams.width,
        depth: assembly.templateParams.depth,
        height: assembly.templateParams.height,
      },
      source: 'generated',
      editingPolicy: 'parametric',
      assemblyIds: [assembly.id],
      partIds: [...(assembly.partIds || [])],
      summary: `Migrated ${assembly.templateType} object`,
      defaultName: assembly.name || 'Generated Object',
    });

    if (existingObjectIds.has(object.id)) continue;

    objects.push(object);
    existingObjectIds.add(object.id);
    assemblies[index] = {
      ...assembly,
      objectId: object.id,
      source: 'generated',
      role: assembly.role || 'legacy_root',
    };

    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part = parts[partIndex];
      if (part.assemblyId !== assembly.id) continue;
      parts[partIndex] = {
        ...part,
        objectId: object.id,
        source: part.source || 'generated',
        locked: part.locked ?? true,
      };
    }
  }

  return { ...project, objects, assemblies, parts };
}

export function normalizeSketchObjects(project) {
  const migrated = migrateLegacyTemplateAssemblies(project);
  const objects = (migrated.objects || []).map(normalizeSketchObject);
  const assemblyObjectMap = new Map();

  for (const object of objects) {
    for (const assemblyId of object.assemblyIds || []) {
      assemblyObjectMap.set(assemblyId, object.id);
    }
  }

  const assemblies = (migrated.assemblies || []).map((assembly) => ({
    ...assembly,
    objectId: assembly.objectId || assemblyObjectMap.get(assembly.id) || null,
    source: assembly.source || ((assembly.objectId || assemblyObjectMap.get(assembly.id)) ? 'generated' : 'manual'),
    childAssemblyIds: [...(assembly.childAssemblyIds || [])],
    parentAssemblyId: assembly.parentAssemblyId || null,
  }));

  const assemblyById = new Map(assemblies.map((assembly) => [assembly.id, assembly]));
  const parts = (migrated.parts || []).map((part) => {
    const assembly = part.assemblyId ? assemblyById.get(part.assemblyId) : null;
    const objectId = part.objectId || assembly?.objectId || null;
    return {
      ...part,
      objectId,
      source: part.source || (objectId ? 'generated' : 'manual'),
      locked: part.locked ?? !!objectId,
      role: part.role || part.generatedRole || null,
    };
  });

  const normalizedObjects = objects.map((object) => {
    const assemblyIds = assemblies
      .filter((assembly) => assembly.objectId === object.id)
      .map((assembly) => assembly.id);
    const partIds = parts
      .filter((part) => part.objectId === object.id)
      .map((part) => part.id);

    return normalizeSketchObject({
      ...object,
      assemblyIds,
      partIds,
    });
  });

  return {
    ...migrated,
    objects: normalizedObjects,
    assemblies,
    parts,
  };
}

export function getObjectForEntity(project, entity) {
  if (!entity) return null;
  if (entity.objectId) {
    return (project.objects || []).find((object) => object.id === entity.objectId) || null;
  }
  return null;
}

export function buildLegacyObjectTreeFromAssembly(project, assembly) {
  return {
    kind: 'object',
    id: assembly.objectId,
    objectId: assembly.objectId,
    name: assembly.name,
    role: assembly.templateType || assembly.category || 'object',
    children: [buildLegacyRootAssemblyNode(project, assembly)],
  };
}
