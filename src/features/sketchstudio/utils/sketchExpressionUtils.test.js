import { describe, expect, it } from 'vitest';
import { evaluateSketchExpression, findVariableReferencesInDocument } from './sketchExpressionUtils';

describe('evaluateSketchExpression', () => {
  it('evaluates a plain number', () => {
    expect(evaluateSketchExpression('42')).toEqual({ value: 42, error: null });
  });

  it('evaluates a negative number', () => {
    expect(evaluateSketchExpression('-7.5')).toEqual({ value: -7.5, error: null });
  });

  it('passes through a numeric input', () => {
    expect(evaluateSketchExpression(100)).toEqual({ value: 100, error: null });
  });

  it('rejects NaN numeric input', () => {
    const result = evaluateSketchExpression(NaN);
    expect(result.value).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('rejects Infinity numeric input', () => {
    const result = evaluateSketchExpression(Infinity);
    expect(result.value).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('evaluates basic arithmetic', () => {
    expect(evaluateSketchExpression('2 + 3')).toEqual({ value: 5, error: null });
    expect(evaluateSketchExpression('10 - 4')).toEqual({ value: 6, error: null });
    expect(evaluateSketchExpression('3 * 7')).toEqual({ value: 21, error: null });
    expect(evaluateSketchExpression('20 / 4')).toEqual({ value: 5, error: null });
  });

  it('respects operator precedence', () => {
    expect(evaluateSketchExpression('2 + 3 * 4')).toEqual({ value: 14, error: null });
    expect(evaluateSketchExpression('10 - 2 * 3')).toEqual({ value: 4, error: null });
  });

  it('evaluates parenthesized expressions', () => {
    expect(evaluateSketchExpression('(2 + 3) * 4')).toEqual({ value: 20, error: null });
    expect(evaluateSketchExpression('((1 + 2) * (3 + 4))')).toEqual({ value: 21, error: null });
  });

  it('substitutes variables', () => {
    const options = { variables: [{ name: 'W', value: 1200 }, { name: 'H', value: 800 }] };
    expect(evaluateSketchExpression('W + 100', options)).toEqual({ value: 1300, error: null });
    expect(evaluateSketchExpression('W * 2 + H', options)).toEqual({ value: 3200, error: null });
  });

  it('reports error for undefined variables', () => {
    const result = evaluateSketchExpression('X + 1');
    expect(result.value).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('handles empty string with default', () => {
    const result = evaluateSketchExpression('');
    expect(result.value).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('handles empty string with emptyStringValue option', () => {
    const result = evaluateSketchExpression('', { emptyStringValue: 0 });
    expect(result).toEqual({ value: 0, error: null });
  });

  it('handles formula prefix mode', () => {
    const opts = { requireFormulaPrefix: true };
    const plain = evaluateSketchExpression('2 + 3', opts);
    expect(plain.value).toBeNull();

    const prefixed = evaluateSketchExpression('=2 + 3', opts);
    expect(prefixed).toEqual({ value: 5, error: null });
  });

  it('rejects non-string non-number input', () => {
    const result = evaluateSketchExpression(null);
    expect(result.value).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('handles division by zero', () => {
    const result = evaluateSketchExpression('1 / 0');
    // Should either return Infinity (rejected as non-finite) or an error
    expect(result.value === null || !Number.isFinite(result.value)).toBe(true);
  });
});

describe('findVariableReferencesInDocument', () => {
  it('finds entity parametric expression references', () => {
    const doc = {
      entities: [
        { id: 'e1', parametricExpressions: { width: 'W * 2', height: '800' } },
        { id: 'e2', parametricExpressions: { width: 'W + 100' } },
      ],
      constraints: [],
    };
    const matches = findVariableReferencesInDocument(doc, 'W');
    expect(matches.length).toBe(2);
    expect(matches[0]).toMatchObject({ kind: 'entity', entityId: 'e1', field: 'width' });
    expect(matches[1]).toMatchObject({ kind: 'entity', entityId: 'e2', field: 'width' });
  });

  it('finds constraint distance expression references', () => {
    const doc = {
      entities: [],
      constraints: [{ id: 'c1', distanceExpression: 'GAP + 10' }],
    };
    const matches = findVariableReferencesInDocument(doc, 'GAP');
    expect(matches.length).toBe(1);
    expect(matches[0]).toMatchObject({ kind: 'constraint', constraintId: 'c1' });
  });

  it('returns empty array when no matches', () => {
    const doc = {
      entities: [{ id: 'e1', parametricExpressions: { width: '100' } }],
      constraints: [],
    };
    expect(findVariableReferencesInDocument(doc, 'NOPE')).toEqual([]);
  });

  it('returns empty array for empty variable name', () => {
    expect(findVariableReferencesInDocument({}, '')).toEqual([]);
  });

  it('handles missing entities and constraints gracefully', () => {
    expect(findVariableReferencesInDocument(undefined, 'W')).toEqual([]);
    expect(findVariableReferencesInDocument({}, 'W')).toEqual([]);
  });
});
