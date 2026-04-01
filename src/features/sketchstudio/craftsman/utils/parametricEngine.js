/**
 * Parametric variables engine.
 *
 * Variables are named values (e.g., width=1200, shelfCount=4).
 * Entity dimensions can reference variables via expressions like "=width" or "=width/2".
 * When a variable changes, all referencing entities update.
 */

export function createVariable(name, value, unit = 'mm') {
  return {
    id: `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(name).trim(),
    value: Number(value) || 0,
    unit,
  };
}

export function evaluateExpression(expr, variables) {
  if (typeof expr === 'number') return expr;
  if (typeof expr !== 'string') return null;

  const trimmed = expr.trim();

  // Plain number
  const num = Number(trimmed);
  if (Number.isFinite(num)) return num;

  // Expression starting with =
  if (!trimmed.startsWith('=')) return null;

  const formula = trimmed.slice(1).trim();
  if (!formula) return null;

  // Build variable lookup
  const varMap = {};
  for (const v of variables) {
    varMap[v.name] = v.value;
  }

  // Safe expression evaluation — only allows: numbers, variable names, +, -, *, /, (, ), spaces
  const safePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const tokens = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[0-9]+\.?[0-9]*|[+\-*/().\s]/g);
  if (!tokens) return null;

  let jsExpr = '';
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;

    if (safePattern.test(t)) {
      if (!(t in varMap)) return null; // undefined variable
      jsExpr += varMap[t];
    } else if (/^[0-9]+\.?[0-9]*$/.test(t)) {
      jsExpr += t;
    } else if (/^[+\-*/().]$/.test(t)) {
      jsExpr += t;
    } else {
      return null; // invalid token
    }
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${jsExpr})`)();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function resolveEntityDimensions(entity, variables) {
  if (!entity.parametricExpressions || !variables?.length) return entity;

  const resolved = { ...entity };
  const exprs = entity.parametricExpressions;

  for (const [field, expr] of Object.entries(exprs)) {
    const value = evaluateExpression(expr, variables);
    if (value !== null) {
      resolved[field] = value;
    }
  }

  return resolved;
}

export function resolveAllEntities(entities, variables) {
  if (!variables?.length) return entities;

  return entities.map((entity) => resolveEntityDimensions(entity, variables));
}

export function findVariableReferences(entities, variableName) {
  const refs = [];
  for (const entity of entities) {
    if (!entity.parametricExpressions) continue;
    for (const [field, expr] of Object.entries(entity.parametricExpressions)) {
      if (typeof expr === 'string' && expr.includes(variableName)) {
        refs.push({ entityId: entity.id, field, expression: expr });
      }
    }
  }
  return refs;
}
