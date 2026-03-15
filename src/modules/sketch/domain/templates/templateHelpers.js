import {
  createCutout,
  createFrame,
  createHole,
  createLeg,
  createPanel,
  createSolid,
} from '../partModels';

const PART_FACTORIES = {
  panel: createPanel,
  leg: createLeg,
  frame: createFrame,
  solid: createSolid,
  cutout: createCutout,
  hole: createHole,
};

export function materializePartDefinition(partDefinition, overrides = {}) {
  const factory = PART_FACTORIES[partDefinition.type];
  if (!factory) {
    throw new Error(`Unsupported part type: ${partDefinition.type}`);
  }

  return factory({
    name: partDefinition.name,
    role: partDefinition.role,
    ...partDefinition.props,
    ...overrides,
  });
}

export function materializeTemplateDefinition(definition, overrides = {}) {
  const parts = [];

  for (const assembly of definition.assemblies || []) {
    for (const partDefinition of assembly.parts || []) {
      parts.push(materializePartDefinition(partDefinition, overrides));
    }
  }

  return {
    name: definition.name,
    parts,
  };
}
