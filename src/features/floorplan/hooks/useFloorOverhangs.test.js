/**
 * The overhang measurement is kept across floor stacks that differ only in what
 * it never reads (perf pass 3, D2.2): a fixture dragged across a storey hands
 * back new floors every frame and must not re-walk every slab boundary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSlab } from '@/domain/models';
import * as floorOverhang from '@/geometry/floorOverhang';
import { measureFloorOverhangs } from './useFloorOverhangs';

vi.mock('@/geometry/floorOverhang', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, computeFloorOverhangs: vi.fn(actual.computeFloorOverhangs) };
});

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function slabOf(id, boundaryPoints) {
  return { ...createSlab('floor', boundaryPoints, 200, 0), id };
}

function floorOf(id, levelIndex, elevation, slabs, extra = {}) {
  return { id, name: id, levelIndex, elevation, floorToFloorHeight: 3000, slabs, fixtures: [], walls: [], ...extra };
}

function stack() {
  return [
    floorOf('ground', 0, 0, [slabOf('s0', rectangle(0, 0, 5000, 5000))]),
    floorOf('first', 1, 3000, [slabOf('s1', rectangle(0, 0, 5000, 5600))]),
    floorOf('second', 2, 6000, [slabOf('s2', rectangle(-800, 0, 5800, 5600))]),
  ];
}

const computed = () => floorOverhang.computeFloorOverhangs.mock.calls.length;
const fresh = (floors) => floorOverhang.computeFloorOverhangs.getMockImplementation()({ floors });

describe('measureFloorOverhangs', () => {
  beforeEach(() => floorOverhang.computeFloorOverhangs.mockClear());

  it('measures what computeFloorOverhangs measures', () => {
    const floors = stack();
    const overhangs = measureFloorOverhangs(floors);
    expect(overhangs.length).toBeGreaterThan(0);
    expect(overhangs).toEqual(fresh(floors));
  });

  it('keeps the measurement through an edit that leaves every slab alone', () => {
    const floors = stack();
    const before = measureFloorOverhangs(floors);
    floorOverhang.computeFloorOverhangs.mockClear();
    // A fixture moved on the first floor: a new floor object and a new array.
    const dragged = floors.map((floor) =>
      floor.id === 'first' ? { ...floor, fixtures: [{ id: 'f', x: 1, y: 2 }] } : floor,
    );
    expect(measureFloorOverhangs(dragged)).toBe(before);
    expect(computed()).toBe(0);
  });

  it('measures again when a slab, the stack order or a storey height changes', () => {
    const floors = stack();
    measureFloorOverhangs(floors);
    const edits = [
      (list) =>
        list.map((floor) =>
          floor.id === 'second' ? { ...floor, slabs: [slabOf('s2', rectangle(-1200, 0, 6200, 5600))] } : floor,
        ),
      (list) => list.map((floor) => (floor.id === 'first' ? { ...floor, elevation: 9000, levelIndex: 3 } : floor)),
      (list) => list.map((floor) => (floor.id === 'ground' ? { ...floor, floorToFloorHeight: 2800 } : floor)),
      (list) => list.map((floor) => (floor.id === 'second' ? { ...floor, name: 'A roof' } : floor)),
      (list) => list.filter((floor) => floor.id !== 'first'),
      (list) => [...list].reverse(),
    ];
    let current = floors;
    for (const edit of edits) {
      current = edit(current);
      floorOverhang.computeFloorOverhangs.mockClear();
      const measured = measureFloorOverhangs(current);
      expect(computed()).toBe(1);
      expect(measured).toEqual(fresh(current));
    }
  });

  it('hands back the shared empty array for a single storey or no overhang', () => {
    expect(measureFloorOverhangs([stack()[0]])).toBe(measureFloorOverhangs(null));
    const flat = [
      floorOf('ground', 0, 0, [slabOf('a', rectangle(0, 0, 5000, 5000))]),
      floorOf('first', 1, 3000, [slabOf('b', rectangle(0, 0, 5000, 5000))]),
    ];
    expect(measureFloorOverhangs(flat)).toBe(measureFloorOverhangs(null));
  });
});
