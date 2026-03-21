import { describe, it, expect } from 'vitest';
import {
  createConstraint,
  evaluateExpression,
  applyConstraints,
  validateConstraint,
} from './constraintUtils';

describe('evaluateExpression', () => {
  it('evaluates simple arithmetic', () => {
    expect(evaluateExpression('2 + 3').value).toBe(5);
    expect(evaluateExpression('10 - 4').value).toBe(6);
    expect(evaluateExpression('3 * 4').value).toBe(12);
    expect(evaluateExpression('10 / 2').value).toBe(5);
  });

  it('respects operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4').value).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4').value).toBe(20);
  });

  it('resolves dot-path lookups', () => {
    const ctx = { object: { width: 1200, thickness: 18 } };
    expect(evaluateExpression('object.width', ctx).value).toBe(1200);
    expect(evaluateExpression('object.width - 2 * object.thickness', ctx).value).toBe(1164);
  });

  it('handles unary minus', () => {
    expect(evaluateExpression('-5 + 10').value).toBe(5);
  });

  it('returns error for division by zero', () => {
    const result = evaluateExpression('10 / 0');
    expect(result.error).toContain('Division by zero');
    expect(result.value).toBeNull();
  });

  it('returns error for empty expression', () => {
    expect(evaluateExpression('').error).toBeTruthy();
    expect(evaluateExpression(null).error).toBeTruthy();
  });

  it('rejects script injection attempts', () => {
    expect(evaluateExpression('eval("alert(1)")').error).toBeTruthy();
    expect(evaluateExpression('Function("return 1")()').error).toBeTruthy();
    expect(evaluateExpression('window.location').error).toBeTruthy();
    expect(evaluateExpression('__proto__').error).toBeTruthy();
  });

  it('returns error for unknown references', () => {
    const result = evaluateExpression('foo.bar', {});
    expect(result.error).toContain('Unknown reference');
  });

  it('handles nested parentheses', () => {
    expect(evaluateExpression('((2 + 3) * (4 - 1))').value).toBe(15);
  });
});

describe('createConstraint', () => {
  it('creates constraint with defaults', () => {
    const c = createConstraint({ expression: '100' });
    expect(c.id).toBeTruthy();
    expect(c.targetField).toBe('width');
    expect(c.expression).toBe('100');
  });
});

describe('applyConstraints', () => {
  it('modifies target part field', () => {
    const draft = {
      bounds: { width: 600, depth: 400, height: 800 },
      defaults: { thickness: 18 },
      parts: [{ id: 'part-1', width: 500, height: 300, parametric: { width: 500, height: 300 } }],
    };
    const constraints = [
      createConstraint({ targetPartId: 'part-1', targetField: 'width', expression: 'object.width - 2 * object.thickness' }),
    ];

    const { draft: result, errors } = applyConstraints(draft, constraints);
    expect(errors).toHaveLength(0);
    expect(result.parts[0].width).toBe(564);
    expect(result.parts[0].parametric.width).toBe(564);
  });

  it('reports errors for bad expressions', () => {
    const draft = {
      bounds: { width: 600 },
      defaults: {},
      parts: [],
    };
    const constraints = [
      createConstraint({ expression: 'nonexistent.field' }),
    ];
    const { errors } = applyConstraints(draft, constraints);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns unchanged draft with no constraints', () => {
    const draft = { parts: [{ id: 'p1' }], bounds: {} };
    const { draft: result } = applyConstraints(draft, []);
    expect(result).toBe(draft);
  });
});

describe('validateConstraint', () => {
  it('valid constraint passes', () => {
    const draft = {
      bounds: { width: 600, depth: 400, height: 800 },
      defaults: { thickness: 18 },
      parts: [{ id: 'part-1' }],
    };
    const constraint = createConstraint({
      targetPartId: 'part-1',
      expression: 'object.width',
    });
    const result = validateConstraint(constraint, draft);
    expect(result.valid).toBe(true);
  });

  it('detects missing part', () => {
    const draft = { parts: [], bounds: { width: 100 }, defaults: { thickness: 18 } };
    const constraint = createConstraint({ targetPartId: 'missing', expression: '100' });
    const result = validateConstraint(constraint, draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
  });
});
