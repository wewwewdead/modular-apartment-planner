import { describe, expect, it } from 'vitest';
import {
  getRoofFloorId,
  findRoofOwner,
  getProjectRoof,
  getProjectRoofs,
  getRoofForTrussSystem,
  resolveActiveRoof,
} from './projectRoofs';

const roofA = {
  id: 'roof_a',
  trussAttachmentId: 'ts_a',
  parapets: [{ id: 'parapet_a' }],
  drains: [{ id: 'drain_a' }],
  roofOpenings: [{ id: 'opening_a' }],
  roofPlanes: [{ id: 'plane_a' }],
  roofEdges: [{ id: 'edge_a' }],
};
const roofB = { id: 'roof_b', trussAttachmentId: null, drains: [{ id: 'drain_b' }] };
const project = { roofSystems: [roofA, roofB] };

describe('projectRoofs', () => {
  it('lists the stored roofs, or one shared frozen empty list', () => {
    expect(getProjectRoofs(project)).toBe(project.roofSystems);
    expect(getProjectRoofs({})).toEqual([]);
    expect(getProjectRoofs(null)).toBe(getProjectRoofs({}));
    expect(Object.isFrozen(getProjectRoofs(undefined))).toBe(true);
  });

  it('finds a roof by id and by the truss system it sits on', () => {
    expect(getProjectRoof(project, 'roof_b')).toBe(roofB);
    expect(getProjectRoof(project, 'roof_missing')).toBeNull();
    expect(getProjectRoof(project, null)).toBeNull();
    expect(getRoofForTrussSystem(project, 'ts_a')).toBe(roofA);
    expect(getRoofForTrussSystem(project, 'ts_missing')).toBeNull();
    // A detached roof claims no system, so a null id never matches it.
    expect(getRoofForTrussSystem(project, null)).toBeNull();
  });

  it('finds the roof that stores a sub-object, by type', () => {
    expect(findRoofOwner(project, 'roofSystem', 'roof_a')).toBe(roofA);
    expect(findRoofOwner(project, 'parapet', 'parapet_a')).toBe(roofA);
    expect(findRoofOwner(project, 'drain', 'drain_b')).toBe(roofB);
    expect(findRoofOwner(project, 'roofOpening', 'opening_a')).toBe(roofA);
    expect(findRoofOwner(project, 'roofPlane', 'plane_a')).toBe(roofA);
    expect(findRoofOwner(project, 'roofEdge', 'edge_a')).toBe(roofA);
    // The type matters: a drain id is no parapet.
    expect(findRoofOwner(project, 'parapet', 'drain_a')).toBeNull();
    expect(findRoofOwner(project, 'wall', 'drain_a')).toBeNull();
  });

  it('resolves the active roof, falling back to the first when the id is stale', () => {
    expect(resolveActiveRoof(project, 'roof_b')).toBe(roofB);
    expect(resolveActiveRoof(project, 'roof_deleted')).toBe(roofA);
    expect(resolveActiveRoof(project, null)).toBe(roofA);
    expect(resolveActiveRoof({ roofSystems: [] }, 'roof_b')).toBeNull();
  });
});

describe('getRoofFloorId', () => {
  const project = {
    floors: [{ id: 'ground' }, { id: 'upper' }],
    trussSystems: [
      { id: 'ts_ground', floorId: 'ground' },
      { id: 'ts_gone_floor', floorId: 'floor_deleted' },
    ],
  };

  it("is the floor the roof's truss system stands on", () => {
    expect(getRoofFloorId(project, { id: 'r', trussAttachmentId: 'ts_ground' }, 'upper')).toBe('ground');
  });

  it('falls back for a detached roof, a missing system, or a system on a missing floor', () => {
    expect(getRoofFloorId(project, { id: 'r', trussAttachmentId: null }, 'upper')).toBe('upper');
    expect(getRoofFloorId(project, { id: 'r', trussAttachmentId: 'ts_none' }, 'upper')).toBe('upper');
    expect(getRoofFloorId(project, { id: 'r', trussAttachmentId: 'ts_gone_floor' }, 'upper')).toBe('upper');
    expect(getRoofFloorId(project, null)).toBeNull();
  });
});
