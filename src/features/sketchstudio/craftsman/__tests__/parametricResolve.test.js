import { describe, expect, it } from 'vitest';
import {
  createVariable,
  resolveEntityDimensions,
  resolveAllEntities,
} from '../utils/parametricEngine';

const vars = [
  { ...createVariable('W', 1200), id: 'v1' },
  { ...createVariable('H', 800), id: 'v2' },
  { ...createVariable('shelfCount', 4), id: 'v3' },
];

describe('resolveEntityDimensions', () => {
  it('resolves parametric expressions on an entity', () => {
    const entity = {
      id: 'e1',
      type: 'rect',
      width: 100,
      height: 50,
      parametricExpressions: { width: '=W', height: '=H/2' },
    };
    const resolved = resolveEntityDimensions(entity, vars);
    expect(resolved.width).toBe(1200);
    expect(resolved.height).toBe(400);
  });

  it('resolves multiple fields independently', () => {
    const entity = {
      id: 'e2',
      type: 'rect',
      width: 0,
      height: 0,
      parametricExpressions: { width: '=W/shelfCount', height: '=H' },
    };
    const resolved = resolveEntityDimensions(entity, vars);
    expect(resolved.width).toBe(300);
    expect(resolved.height).toBe(800);
  });

  it('passes through entity without expressions unchanged', () => {
    const entity = { id: 'e3', type: 'rect', width: 500, height: 300 };
    const resolved = resolveEntityDimensions(entity, vars);
    expect(resolved).toEqual(entity);
  });

  it('keeps original value when expression is invalid', () => {
    const entity = {
      id: 'e4',
      type: 'rect',
      width: 999,
      parametricExpressions: { width: '=unknownVar' },
    };
    const resolved = resolveEntityDimensions(entity, vars);
    expect(resolved.width).toBe(999);
  });

  it('passes through when variables array is empty', () => {
    const entity = {
      id: 'e5',
      type: 'rect',
      width: 100,
      parametricExpressions: { width: '=W' },
    };
    const resolved = resolveEntityDimensions(entity, []);
    expect(resolved).toEqual(entity);
  });
});

describe('resolveAllEntities', () => {
  it('applies resolution to all entities in array', () => {
    const entities = [
      { id: 'e1', type: 'rect', width: 0, parametricExpressions: { width: '=W' } },
      { id: 'e2', type: 'rect', width: 0, parametricExpressions: { width: '=W/2' } },
      { id: 'e3', type: 'rect', width: 500 },
    ];
    const resolved = resolveAllEntities(entities, vars);
    expect(resolved[0].width).toBe(1200);
    expect(resolved[1].width).toBe(600);
    expect(resolved[2].width).toBe(500);
  });

  it('returns original array when no variables', () => {
    const entities = [{ id: 'e1', type: 'rect', width: 100 }];
    expect(resolveAllEntities(entities, [])).toBe(entities);
    expect(resolveAllEntities(entities, null)).toBe(entities);
  });
});
