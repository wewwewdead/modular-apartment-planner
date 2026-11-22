import { describe, expect, it } from 'vitest';
import { resolveWalkFloorContext } from './resolveWalkFloorContext';

/**
 * Each roof is a `floors` entry of the preview scene, keyed by the roof id
 * (docs/multi-roof.md §5.5). A walk starts on a storey, never on a roof.
 */
const scene = {
  activeFloorId: 'floor_1',
  roofLayerIds: ['roof_1'],
  defaultTarget: { x: 0, z: 0 },
  groundLevel: 0,
  floors: [
    { floorId: 'roof_1', elevation: 9000, navigationTarget: { x: 50, z: 50 } },
    { floorId: 'floor_1', elevation: 0, navigationTarget: { x: 10, z: 20 } },
  ],
};

describe('resolveWalkFloorContext', () => {
  it('starts the walk on the active storey', () => {
    expect(resolveWalkFloorContext(scene, 'floor_1', 1600).spawn.position).toEqual({ x: 10, y: 1600, z: 20 });
  });

  it('never spawns on a roof layer, even when asked for its id', () => {
    const context = resolveWalkFloorContext(scene, 'roof_1', 1600);
    expect(context.floorId).toBe('floor_1');
    expect(context.spawn.elevation).toBe(0);
  });
});
