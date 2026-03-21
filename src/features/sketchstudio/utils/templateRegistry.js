import { getCabinetTemplateDefinition } from './cabinetTemplateUtils';
import { getShelvingTemplateDefinition } from './shelvingTemplateUtils';

const registry = new Map();

export function registerTemplate(definition) {
  if (!definition?.id) {
    return;
  }

  registry.set(definition.id, {
    group: 'generator',
    category: 'custom',
    objectType: 'assembly',
    defaultParams: {},
    paramFields: [],
    ...definition,
  });
}

export function getTemplate(templateId) {
  return registry.get(templateId) || null;
}

export function getAllTemplates() {
  return Array.from(registry.values());
}

export function getTemplatesByGroup(group) {
  return getAllTemplates().filter((template) => template.group === group);
}

export function getTemplateParamFields(templateId) {
  return getTemplate(templateId)?.paramFields || [];
}

export function getTemplateDefaultParams(templateId) {
  return { ...(getTemplate(templateId)?.defaultParams || {}) };
}

export function runTemplate(templateId, params = {}) {
  return getTemplate(templateId)?.generateParts?.(params) || null;
}

registerTemplate(getCabinetTemplateDefinition());
registerTemplate(getShelvingTemplateDefinition());

