import {
  getAllTemplates,
  getTemplate,
  getTemplateDefaultParams,
  getTemplateParamFields,
  registerTemplate,
  runTemplate,
} from './templateRegistry';

export function registerGenerator({ id, label, defaultParams, generateParts, paramFields }) {
  registerTemplate({
    id,
    label,
    group: 'generator',
    defaultParams,
    generateParts,
    paramFields,
  });
}

export function getGenerator(generatorId) {
  return getTemplate(generatorId);
}

export function getAllGenerators() {
  return getAllTemplates()
    .filter((template) => template.group === 'generator')
    .map(({ id, label }) => ({ id, label }));
}

export function getGeneratorParamFields(generatorId) {
  return getTemplateParamFields(generatorId);
}

export function getGeneratorDefaultParams(generatorId) {
  return getTemplateDefaultParams(generatorId);
}

export function runGenerator(generatorId, params) {
  return runTemplate(generatorId, params);
}
