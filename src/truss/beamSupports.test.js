import { describe, expect, it } from 'vitest';
import { createBeam } from '@/domain/models';
import { findBeamSupportAtPoint, getFloorBeamSupportData } from './beamSupports';

function makeFloorWithOverlappingBeams() {
  const columns = [
    { id: 'column_a', x: 0, y: 0, width: 300, depth: 300, rotation: 0 },
    { id: 'column_b', x: 4000, y: 0, width: 300, depth: 300, rotation: 0 },
  ];
  const floorBeam = {
    ...createBeam({ kind: 'column', id: 'column_a' }, { kind: 'column', id: 'column_b' }, 250, 450, 3000),
    id: 'beam_floor',
  };
  const roofBeam = {
    ...createBeam({ kind: 'column', id: 'column_a' }, { kind: 'column', id: 'column_b' }, 250, 450, 6000, {
      placementRole: 'roof_ring',
    }),
    id: 'beam_roof',
  };

  return { id: 'floor_1', columns, beams: [floorBeam, roofBeam] };
}

describe('truss beam support priority', () => {
  it('orders overlapping supports from highest to lowest elevation', () => {
    const supports = getFloorBeamSupportData(makeFloorWithOverlappingBeams());
    expect(supports.map((entry) => entry.beam.id)).toEqual(['beam_roof', 'beam_floor']);
  });

  it('selects the top roof beam when upper and lower beams overlap in plan', () => {
    const support = findBeamSupportAtPoint(makeFloorWithOverlappingBeams(), { x: 2000, y: 0 });
    expect(support?.beam.id).toBe('beam_roof');
    expect(support?.topElevation).toBe(6000);
  });
});
