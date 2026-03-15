import { createAssembly } from './assemblyModels';
import { createSketchObject } from './objectModels';
import { getTemplate } from './templates/templateRegistry';
import { materializePartDefinition } from './templates/templateHelpers';

function applyOrigin(position = {}, origin = {}) {
  return {
    x: (Number(position.x) || 0) + (Number(origin.x) || 0),
    y: (Number(position.y) || 0) + (Number(origin.y) || 0),
    z: (Number(position.z) || 0) + (Number(origin.z) || 0),
  };
}

export function generateObjectFromTemplate(templateType, params, options = {}) {
  const template = getTemplate(templateType);
  if (!template?.buildDefinition) {
    throw new Error(`Template "${templateType}" does not define buildDefinition`);
  }

  const definition = template.buildDefinition(params);
  const origin = options.origin || { x: 0, y: 0, z: 0 };
  const object = createSketchObject(options.name || definition.name, {
    id: options.objectId,
    description: definition.description || '',
    summary: definition.summary || '',
    category: templateType,
    templateType,
    templateParams: { ...params },
    dimensions: { ...definition.dimensions },
    origin,
    source: 'generated',
    editingPolicy: 'parametric',
    defaultName: definition.name,
  });

  const assemblies = [];
  const parts = [];

  function buildAssembly(definitionAssembly, parentAssemblyId = null, depth = 0) {
    const assembly = createAssembly(definitionAssembly.name, {
      objectId: object.id,
      parentAssemblyId,
      source: 'generated',
      role: definitionAssembly.key,
      category: templateType,
      description: definitionAssembly.description || '',
      sortIndex: definitionAssembly.sortIndex ?? depth,
      partIds: [],
      childAssemblyIds: [],
    });

    assemblies.push(assembly);
    object.assemblyIds.push(assembly.id);

    for (const child of definitionAssembly.children || []) {
      const childAssembly = buildAssembly(child, assembly.id, depth + 1);
      assembly.childAssemblyIds.push(childAssembly.id);
    }

    let partIndex = 0;
    for (const partDefinition of definitionAssembly.parts || []) {
      const part = materializePartDefinition(partDefinition, {
        objectId: object.id,
        assemblyId: assembly.id,
        source: 'generated',
        locked: true,
        generatedRole: partDefinition.role,
        role: partDefinition.role,
        sortIndex: partIndex,
        position: applyOrigin(partDefinition.props?.position, origin),
      });
      assembly.partIds.push(part.id);
      object.partIds.push(part.id);
      parts.push(part);
      partIndex += 1;
    }

    return assembly;
  }

  for (const assemblyDefinition of definition.assemblies || []) {
    buildAssembly(assemblyDefinition);
  }

  return {
    object,
    assemblies,
    parts,
    definition,
  };
}
