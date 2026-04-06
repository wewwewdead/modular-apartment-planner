import { describe, expect, it } from 'vitest';
import { evaluateExpression, createVariable, findVariableReferences } from './parametricEngine';

const vars = [
  createVariable('width', 1200),
  createVariable('height', 800),
  createVariable('shelfCount', 4),
];
// Override IDs for stable tests
vars[0].id = 'v1'; vars[1].id = 'v2'; vars[2].id = 'v3';

describe('parametricEngine', () => {
  describe('evaluateExpression', () => {
    it('returns plain numbers unchanged', () => {
      expect(evaluateExpression(42, vars)).toBe(42);
      expect(evaluateExpression('100', vars)).toBe(100);
      expect(evaluateExpression('3.14', vars)).toBe(3.14);
    });

    it('resolves single variable', () => {
      expect(evaluateExpression('=width', vars)).toBe(1200);
      expect(evaluateExpression('=shelfCount', vars)).toBe(4);
    });

    it('evaluates arithmetic expressions', () => {
      expect(evaluateExpression('=width/2', vars)).toBe(600);
      expect(evaluateExpression('=width+height', vars)).toBe(2000);
      expect(evaluateExpression('=width*2+100', vars)).toBe(2500);
      expect(evaluateExpression('=width-height', vars)).toBe(400);
    });

    it('handles parentheses', () => {
      expect(evaluateExpression('=(width+height)/2', vars)).toBe(1000);
      expect(evaluateExpression('=(shelfCount+1)*100', vars)).toBe(500);
    });

    it('handles negative values', () => {
      expect(evaluateExpression('=-width', vars)).toBe(-1200);
      expect(evaluateExpression('=width+(-100)', vars)).toBe(1100);
    });

    it('returns null for undefined variables', () => {
      expect(evaluateExpression('=unknownVar', vars)).toBeNull();
      expect(evaluateExpression('=width+missing', vars)).toBeNull();
    });

    it('returns null for invalid expressions', () => {
      expect(evaluateExpression('=', vars)).toBeNull();
      expect(evaluateExpression('=width@2', vars)).toBeNull();
      expect(evaluateExpression(null, vars)).toBeNull();
      expect(evaluateExpression(undefined, vars)).toBeNull();
      expect(evaluateExpression('', vars)).toBe(0); // Number('') === 0 in JS
      expect(evaluateExpression('=)', vars)).toBeNull();
    });

    it('returns null for division by zero', () => {
      const zeroVar = [createVariable('zero', 0)];
      zeroVar[0].id = 'z1';
      expect(evaluateExpression('=100/zero', zeroVar)).toBeNull();
    });

    it('ignores whitespace', () => {
      expect(evaluateExpression('= width / 2 ', vars)).toBe(600);
    });

    it('rejects expressions without = prefix', () => {
      expect(evaluateExpression('width', vars)).toBeNull();
      expect(evaluateExpression('hello', vars)).toBeNull();
    });
  });

  describe('findVariableReferences', () => {
    it('finds entities referencing a variable', () => {
      const entities = [
        { id: 'e1', parametricExpressions: { width: '=width', height: '=height' } },
        { id: 'e2', parametricExpressions: { width: '=width/2' } },
        { id: 'e3' }, // no expressions
      ];

      const refs = findVariableReferences(entities, 'width');
      expect(refs).toHaveLength(2);
      expect(refs[0]).toMatchObject({ entityId: 'e1', field: 'width' });
    });

    it('returns empty for unreferenced variable', () => {
      const entities = [{ id: 'e1', parametricExpressions: { width: '=height' } }];
      expect(findVariableReferences(entities, 'width')).toHaveLength(0);
    });
  });
});
