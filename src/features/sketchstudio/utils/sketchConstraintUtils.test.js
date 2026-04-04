import { describe, expect, it } from 'vitest';
import { createSketchConstraint, resolveSketchConstraints } from './sketchConstraintUtils';

function createLine(id, x1, y1, x2, y2) {
  return {
    id,
    type: 'line',
    x1,
    y1,
    x2,
    y2,
    layerId: 'default',
    meta: {},
  };
}

describe('sketchConstraintUtils', () => {
  it('applies constraints in a deterministic per-entity order', () => {
    const driver = createLine('line-1', 0, 0, 80, 60);
    const driven = createLine('line-2', 10, 10, 40, 50);
    const { entities, diagnostics } = resolveSketchConstraints(
      [driver, driven],
      [
        createSketchConstraint({ type: 'equal_length', driverEntityId: 'line-1', drivenEntityId: 'line-2' }),
        createSketchConstraint({ type: 'horizontal', entityId: 'line-2' }),
      ],
      [],
    );
    const nextDriven = entities.find((entity) => entity.id === 'line-2');

    expect(nextDriven.y2).toBe(nextDriven.y1);
    expect(Math.round(Math.hypot(nextDriven.x2 - nextDriven.x1, nextDriven.y2 - nextDriven.y1))).toBe(100);
    expect(diagnostics.map((diagnostic) => diagnostic.status)).toEqual(['applied', 'applied']);
  });

  it('reports invalid references without mutating unrelated geometry', () => {
    const source = createLine('line-1', 0, 0, 100, 0);
    const { entities, diagnostics } = resolveSketchConstraints(
      [source],
      [
        createSketchConstraint({
          type: 'coincident_point',
          driverRef: { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'start' },
          drivenRef: { entityId: 'missing-line', sourceType: 'endpoint', sourceKey: 'end' },
        }),
      ],
      [],
    );

    expect(entities).toEqual([source]);
    expect(diagnostics[0]).toMatchObject({
      status: 'invalid_ref',
    });
  });

  it('blocks dependency cycles instead of oscillating', () => {
    const { diagnostics } = resolveSketchConstraints(
      [createLine('line-1', 0, 0, 100, 0), createLine('line-2', 10, 10, 10, 80)],
      [
        createSketchConstraint({ type: 'equal_length', driverEntityId: 'line-1', drivenEntityId: 'line-2' }),
        createSketchConstraint({ type: 'equal_length', driverEntityId: 'line-2', drivenEntityId: 'line-1' }),
      ],
      [],
    );

    expect(diagnostics.map((diagnostic) => diagnostic.status)).toEqual(['cycle_blocked', 'cycle_blocked']);
  });

  it('resolves thickness offsets from document variables', () => {
    const { entities, diagnostics } = resolveSketchConstraints(
      [createLine('line-1', 0, 0, 100, 0), createLine('line-2', 0, 20, 100, 20)],
      [
        createSketchConstraint({
          type: 'thickness_offset',
          sourceSegmentRef: { entityId: 'line-1', sourceType: 'segment', sourceKey: 'segment' },
          targetSegmentRef: { entityId: 'line-2', sourceType: 'segment', sourceKey: 'segment' },
          distanceExpression: '',
        }),
      ],
      [{ id: 'var-thickness', name: 'thickness', value: 18, unit: 'mm' }],
    );
    const driven = entities.find((entity) => entity.id === 'line-2');

    expect(driven.y1).toBe(18);
    expect(driven.y2).toBe(18);
    expect(diagnostics[0].status).toBe('applied');
  });
});
