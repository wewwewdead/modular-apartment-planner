import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { previewPickHit } from './previewPick';

describe('previewPickHit', () => {
  const target = { kind: 'ceiling', sourceId: 'ceiling_1', floorId: 'floor_1', part: { kind: 'panel', id: 'P3' } };

  it('maps the world hit back to the plan: x is x, z is plan y, y is the elevation', () => {
    expect(previewPickHit(target, { point: new THREE.Vector3(1250, 2700, -3400) })).toEqual({
      plan: { x: 1250, y: -3400 },
      elevation: 2700,
      kind: 'ceiling',
      sourceId: 'ceiling_1',
    });
  });

  it('inverts the frame the descriptors are built in', () => {
    // planPointToWorld(point, elevation) = (point.x, elevation, point.y).
    const plan = { x: 4321.5, y: 987.25 };
    const world = new THREE.Vector3(plan.x, 3050, plan.y);
    const hit = previewPickHit(target, { point: world });
    expect(hit.plan).toEqual(plan);
    expect(hit.elevation).toBe(3050);
  });

  it('is null for a miss or a hit without a point', () => {
    expect(previewPickHit(null, null)).toBeNull();
    expect(previewPickHit(target, null)).toBeNull();
    expect(previewPickHit(target, {})).toBeNull();
    expect(previewPickHit(null, { point: new THREE.Vector3(1, 2, 3) })).toBeNull();
    expect(previewPickHit(target, { point: { x: Number.NaN, y: 0, z: 0 } })).toBeNull();
  });
});
