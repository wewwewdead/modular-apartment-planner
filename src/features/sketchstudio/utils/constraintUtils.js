let nextConstraintCounter = 1;

export function createConstraint({ id, targetPartId, targetField, expression, name } = {}) {
  return {
    id: id || `constraint-${nextConstraintCounter++}`,
    targetPartId: targetPartId || null,
    targetField: targetField || 'width',
    expression: expression || '',
    name: name || '',
  };
}

const TOKEN_RE = /(\d+(?:\.\d+)?)|([a-zA-Z_][\w.]*)|([+\-*/()])/g;

function tokenize(expression) {
  const tokens = [];
  let match;
  TOKEN_RE.lastIndex = 0;
  let lastIndex = 0;

  while ((match = TOKEN_RE.exec(expression)) !== null) {
    const gap = expression.slice(lastIndex, match.index).trim();
    if (gap.length > 0) {
      return { tokens: null, error: `Unexpected characters: "${gap}"` };
    }
    if (match[1] !== undefined) {
      tokens.push({ type: 'number', value: Number(match[1]) });
    } else if (match[2] !== undefined) {
      tokens.push({ type: 'path', value: match[2] });
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
  const parts = path.split('.');
  let current = context;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function parseExpression(tokens, pos, context) {
  return parseAddSub(tokens, pos, context);
}

function parseAddSub(tokens, pos, context) {
  let { value, pos: nextPos, error } = parseMulDiv(tokens, pos, context);
  if (error) return { value: null, pos: nextPos, error };

  while (nextPos < tokens.length && tokens[nextPos].type === 'op' && (tokens[nextPos].value === '+' || tokens[nextPos].value === '-')) {
    const op = tokens[nextPos].value;
    const right = parseMulDiv(tokens, nextPos + 1, context);
    if (right.error) return right;
    value = op === '+' ? value + right.value : value - right.value;
    nextPos = right.pos;
  }

  return { value, pos: nextPos, error: null };
}

function parseMulDiv(tokens, pos, context) {
  let { value, pos: nextPos, error } = parsePrimary(tokens, pos, context);
  if (error) return { value: null, pos: nextPos, error };

  while (nextPos < tokens.length && tokens[nextPos].type === 'op' && (tokens[nextPos].value === '*' || tokens[nextPos].value === '/')) {
    const op = tokens[nextPos].value;
    const right = parsePrimary(tokens, nextPos + 1, context);
    if (right.error) return right;
    if (op === '/' && right.value === 0) {
      return { value: null, pos: right.pos, error: 'Division by zero' };
    }
    value = op === '*' ? value * right.value : value / right.value;
    nextPos = right.pos;
  }

  return { value, pos: nextPos, error: null };
}

function parsePrimary(tokens, pos, context) {
  if (pos >= tokens.length) {
    return { value: null, pos, error: 'Unexpected end of expression' };
  }

  const token = tokens[pos];

  // Unary minus
  if (token.type === 'op' && token.value === '-') {
    const inner = parsePrimary(tokens, pos + 1, context);
    if (inner.error) return inner;
    return { value: -inner.value, pos: inner.pos, error: null };
  }

  if (token.type === 'number') {
    return { value: token.value, pos: pos + 1, error: null };
  }

  if (token.type === 'path') {
    const resolved = resolvePath(token.value, context);
    if (resolved === undefined) {
      return { value: null, pos: pos + 1, error: `Unknown reference: "${token.value}"` };
    }
    const num = Number(resolved);
    if (!Number.isFinite(num)) {
      return { value: null, pos: pos + 1, error: `Non-numeric reference: "${token.value}"` };
    }
    return { value: num, pos: pos + 1, error: null };
  }

  if (token.type === 'op' && token.value === '(') {
    const inner = parseExpression(tokens, pos + 1, context);
    if (inner.error) return inner;
    if (inner.pos >= tokens.length || tokens[inner.pos].value !== ')') {
      return { value: null, pos: inner.pos, error: 'Missing closing parenthesis' };
    }
    return { value: inner.value, pos: inner.pos + 1, error: null };
  }

  return { value: null, pos, error: `Unexpected token: "${token.value}"` };
}

export function evaluateExpression(expression, context = {}) {
  if (!expression || typeof expression !== 'string') {
    return { value: null, error: 'Empty expression' };
  }

  const trimmed = expression.trim();
  if (!trimmed) {
    return { value: null, error: 'Empty expression' };
  }

  const { tokens, error: tokenError } = tokenize(trimmed);
  if (tokenError) {
    return { value: null, error: tokenError };
  }

  if (!tokens.length) {
    return { value: null, error: 'Empty expression' };
  }

  const result = parseExpression(tokens, 0, context);
  if (result.error) {
    return { value: null, error: result.error };
  }

  if (result.pos < tokens.length) {
    return { value: null, error: `Unexpected token at position ${result.pos}` };
  }

  return { value: result.value, error: null };
}

export function applyConstraints(objectDraft, constraints = []) {
  if (!constraints.length) {
    return { draft: objectDraft, errors: [] };
  }

  const errors = [];
  let nextParts = [...(objectDraft.parts || [])];
  const context = {
    object: {
      width: objectDraft.bounds?.width || 0,
      depth: objectDraft.bounds?.depth || 0,
      height: objectDraft.bounds?.height || 0,
      thickness: objectDraft.defaults?.thickness || 18,
    },
  };

  constraints.forEach((constraint) => {
    const { value, error } = evaluateExpression(constraint.expression, context);
    if (error) {
      errors.push({ constraintId: constraint.id, error });
      return;
    }

    if (constraint.targetPartId) {
      nextParts = nextParts.map((part) => {
        if (part.id !== constraint.targetPartId) return part;
        const field = constraint.targetField;
        return {
          ...part,
          [field]: value,
          parametric: part.parametric ? { ...part.parametric, [field]: value } : part.parametric,
        };
      });
    }
  });

  return { draft: { ...objectDraft, parts: nextParts }, errors };
}

export function validateConstraint(constraint, objectDraft) {
  const errors = [];

  if (!constraint.expression) {
    errors.push('Expression is empty');
  }

  if (constraint.targetPartId) {
    const part = (objectDraft.parts || []).find((p) => p.id === constraint.targetPartId);
    if (!part) {
      errors.push(`Target part "${constraint.targetPartId}" not found`);
    }
  }

  if (constraint.expression) {
    const context = {
      object: {
        width: objectDraft.bounds?.width || 0,
        depth: objectDraft.bounds?.depth || 0,
        height: objectDraft.bounds?.height || 0,
        thickness: objectDraft.defaults?.thickness || 18,
      },
    };
    const { error } = evaluateExpression(constraint.expression, context);
    if (error) {
      errors.push(error);
    }
  }

  return { valid: errors.length === 0, errors };
}
