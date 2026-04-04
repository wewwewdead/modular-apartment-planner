const TOKEN_RE = /(\d+(?:\.\d+)?)|([a-zA-Z_][\w.]*)|([+\-*/()])/g;

function tokenize(expression) {
  const tokens = [];
  let match;
  let lastIndex = 0;

  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(expression)) !== null) {
    const gap = expression.slice(lastIndex, match.index).trim();

    if (gap.length > 0) {
      return { tokens: null, error: `Unexpected characters: "${gap}"` };
    }

    if (match[1] !== undefined) {
      tokens.push({ type: 'number', value: Number(match[1]) });
    } else if (match[2] !== undefined) {
      tokens.push({ type: 'identifier', value: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'op', value: match[3] });
    }

    lastIndex = TOKEN_RE.lastIndex;
  }

  const trailing = expression.slice(lastIndex).trim();

  if (trailing.length > 0) {
    return { tokens: null, error: `Unexpected characters: "${trailing}"` };
  }

  return { tokens, error: null };
}

function resolvePath(path, context) {
  const parts = String(path || '').split('.');
  let current = context;

  for (const part of parts) {
    if (current == null || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function parseExpression(tokens, position, resolver) {
  return parseAddSubtract(tokens, position, resolver);
}

function parseAddSubtract(tokens, position, resolver) {
  let result = parseMultiplyDivide(tokens, position, resolver);

  if (result.error) {
    return result;
  }

  while (
    result.position < tokens.length &&
    tokens[result.position].type === 'op' &&
    ['+', '-'].includes(tokens[result.position].value)
  ) {
    const operator = tokens[result.position].value;
    const right = parseMultiplyDivide(tokens, result.position + 1, resolver);

    if (right.error) {
      return right;
    }

    result = {
      value: operator === '+' ? result.value + right.value : result.value - right.value,
      position: right.position,
      error: null,
    };
  }

  return result;
}

function parseMultiplyDivide(tokens, position, resolver) {
  let result = parsePrimary(tokens, position, resolver);

  if (result.error) {
    return result;
  }

  while (
    result.position < tokens.length &&
    tokens[result.position].type === 'op' &&
    ['*', '/'].includes(tokens[result.position].value)
  ) {
    const operator = tokens[result.position].value;
    const right = parsePrimary(tokens, result.position + 1, resolver);

    if (right.error) {
      return right;
    }

    if (operator === '/' && right.value === 0) {
      return { value: null, position: right.position, error: 'Division by zero' };
    }

    result = {
      value: operator === '*' ? result.value * right.value : result.value / right.value,
      position: right.position,
      error: null,
    };
  }

  return result;
}

function parsePrimary(tokens, position, resolver) {
  if (position >= tokens.length) {
    return { value: null, position, error: 'Unexpected end of expression' };
  }

  const token = tokens[position];

  if (token.type === 'op' && token.value === '-') {
    const inner = parsePrimary(tokens, position + 1, resolver);

    if (inner.error) {
      return inner;
    }

    return {
      value: -inner.value,
      position: inner.position,
      error: null,
    };
  }

  if (token.type === 'number') {
    return {
      value: token.value,
      position: position + 1,
      error: null,
    };
  }

  if (token.type === 'identifier') {
    const resolved = resolver(token.value);

    if (resolved === undefined) {
      return {
        value: null,
        position: position + 1,
        error: `Unknown reference: "${token.value}"`,
      };
    }

    const numericValue = Number(resolved);

    if (!Number.isFinite(numericValue)) {
      return {
        value: null,
        position: position + 1,
        error: `Non-numeric reference: "${token.value}"`,
      };
    }

    return {
      value: numericValue,
      position: position + 1,
      error: null,
    };
  }

  if (token.type === 'op' && token.value === '(') {
    const inner = parseExpression(tokens, position + 1, resolver);

    if (inner.error) {
      return inner;
    }

    if (inner.position >= tokens.length || tokens[inner.position].value !== ')') {
      return { value: null, position: inner.position, error: 'Missing closing parenthesis' };
    }

    return {
      value: inner.value,
      position: inner.position + 1,
      error: null,
    };
  }

  return {
    value: null,
    position,
    error: `Unexpected token: "${token.value}"`,
  };
}

function buildVariableLookup(variables = []) {
  return variables.reduce((lookup, variable) => {
    if (!variable?.name) {
      return lookup;
    }

    lookup[variable.name] = variable.value;
    return lookup;
  }, {});
}

export function evaluateSketchExpression(expression, options = {}) {
  const { variables = [], context = {}, requireFormulaPrefix = false, emptyStringValue = null } = options;

  if (typeof expression === 'number') {
    return Number.isFinite(expression)
      ? { value: expression, error: null }
      : { value: null, error: 'Expression must resolve to a finite number' };
  }

  if (typeof expression !== 'string') {
    return { value: null, error: 'Expression must be a string or number' };
  }

  const trimmed = expression.trim();

  if (!trimmed) {
    return emptyStringValue !== null
      ? { value: emptyStringValue, error: null }
      : { value: null, error: 'Empty expression' };
  }

  const numericValue = Number(trimmed);

  if (Number.isFinite(numericValue)) {
    return {
      value: numericValue,
      error: null,
    };
  }

  if (requireFormulaPrefix && !trimmed.startsWith('=')) {
    return {
      value: null,
      error: 'Expression must start with "="',
    };
  }

  const formula = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;

  if (!formula) {
    return { value: null, error: 'Empty expression' };
  }

  const { tokens, error: tokenError } = tokenize(formula);

  if (tokenError) {
    return { value: null, error: tokenError };
  }

  const variableLookup = buildVariableLookup(variables);
  const resolver = (identifier) => {
    if (Object.hasOwn(variableLookup, identifier)) {
      return variableLookup[identifier];
    }

    return resolvePath(identifier, context);
  };

  const result = parseExpression(tokens, 0, resolver);

  if (result.error) {
    return { value: null, error: result.error };
  }

  if (result.position < tokens.length) {
    return { value: null, error: `Unexpected token at position ${result.position}` };
  }

  return {
    value: result.value,
    error: null,
  };
}

export function findVariableReferencesInDocument({ entities = [], constraints = [] } = {}, variableName) {
  if (!variableName) {
    return [];
  }

  const matches = [];

  entities.forEach((entity) => {
    if (!entity?.parametricExpressions || typeof entity.parametricExpressions !== 'object') {
      return;
    }

    Object.entries(entity.parametricExpressions).forEach(([field, expression]) => {
      if (typeof expression === 'string' && expression.includes(variableName)) {
        matches.push({
          kind: 'entity',
          entityId: entity.id,
          field,
          expression,
        });
      }
    });
  });

  constraints.forEach((constraint) => {
    if (typeof constraint?.distanceExpression === 'string' && constraint.distanceExpression.includes(variableName)) {
      matches.push({
        kind: 'constraint',
        constraintId: constraint.id,
        field: 'distanceExpression',
        expression: constraint.distanceExpression,
      });
    }
  });

  return matches;
}
