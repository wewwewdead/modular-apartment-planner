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

/**
 * Safe recursive-descent math parser.
 * Grammar: expr = term (('+' | '-') term)*
 *          term = factor (('*' | '/') factor)*
 *          factor = NUMBER | VARIABLE | '(' expr ')' | '-' factor
 * No eval/Function — only arithmetic on numbers and resolved variable values.
 */
function safeParse(formula, varMap) {
  let pos = 0;
  const src = formula.replace(/\s+/g, '');

  function peek() { return src[pos] ?? ''; }
  function advance() { return src[pos++]; }

  function parseNumber() {
    let start = pos;
    if (peek() === '-') pos++; // allow negative in this context only after ( or start
    while (/[0-9]/.test(peek())) pos++;
    if (peek() === '.') { pos++; while (/[0-9]/.test(peek())) pos++; }
    const val = Number(src.slice(start, pos));
    return Number.isFinite(val) ? val : null;
  }

  function parseIdentifier() {
    let start = pos;
    while (/[a-zA-Z0-9_]/.test(peek())) pos++;
    const name = src.slice(start, pos);
    return name in varMap ? varMap[name] : null;
  }

  function parseFactor() {
    if (peek() === '(') {
      advance(); // skip (
      const val = parseExpr();
      if (peek() !== ')') return null;
      advance(); // skip )
      return val;
    }
    if (peek() === '-') {
      advance();
      const val = parseFactor();
      return val !== null ? -val : null;
    }
    if (/[0-9.]/.test(peek())) return parseNumber();
    if (/[a-zA-Z_]/.test(peek())) return parseIdentifier();
    return null;
  }

  function parseTerm() {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = advance();
      const right = parseFactor();
      if (right === null) return null;
      left = op === '*' ? left * right : (right !== 0 ? left / right : null);
      if (left === null) return null;
    }
    return left;
  }

  function parseExpr() {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = advance();
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  const result = parseExpr();
  if (pos !== src.length) return null; // trailing characters = invalid
  return Number.isFinite(result) ? result : null;
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

  return safeParse(formula, varMap);
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
