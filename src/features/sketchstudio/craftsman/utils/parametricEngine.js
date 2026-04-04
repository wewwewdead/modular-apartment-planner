import { evaluateSketchExpression, findVariableReferencesInDocument } from '../../utils/sketchExpressionUtils';

export function createVariable(name, value, unit = 'mm') {
  return {
    id: `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(name).trim(),
    value: Number(value) || 0,
    unit,
  };
}

export function evaluateExpression(expr, variables) {
  if (typeof expr === 'number') {
    return expr;
  }

  if (typeof expr !== 'string') {
    return null;
  }

  const trimmed = expr.trim();

  if (!trimmed) {
    return 0;
  }

  const result = evaluateSketchExpression(trimmed, {
    variables,
    requireFormulaPrefix: !Number.isFinite(Number(trimmed)),
    emptyStringValue: 0,
  });

  return result.error ? null : result.value;
}

export function resolveEntityDimensions(entity, variables) {
  if (!entity.parametricExpressions || !variables?.length) {
    return entity;
  }

  const resolved = { ...entity };

  Object.entries(entity.parametricExpressions).forEach(([field, expression]) => {
    const value = evaluateExpression(expression, variables);

    if (value !== null) {
      resolved[field] = value;
    }
  });

  return resolved;
}

export function resolveAllEntities(entities, variables) {
  if (!variables?.length) {
    return entities;
  }

  return entities.map((entity) => resolveEntityDimensions(entity, variables));
}

export function findVariableReferences(entities, variableName, constraints = []) {
  return findVariableReferencesInDocument(
    {
      entities,
      constraints,
    },
    variableName,
  );
}
