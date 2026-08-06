import { describe, expect, it } from 'vitest';
import { buildMassingMesh } from './massingMesh';
import { buildBvh, bvhIntersectsRay } from './rayBvh';

function box({ x = 0, y = 0, size = 1000, base = 0, top = 3000 }) {
  const footprint = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
  return {
    id: `box:${x}:${y}:${base}`,
    footprint,
    holes: [],
    baseElevation: base,
    topElevations: footprint.map(() => top),
    sloped: false,
  };
}

describe('meshing a prism', () => {
  it('produces walls and both caps', () => {
    // Four side quads (8 triangles) plus a lid and a floor (2 each).
    const mesh = buildMassingMesh([box({})]);
    expect(mesh.triangleCount).toBe(12);
    expect(mesh.positions).toHaveLength(12 * 9);
  });

  it('keeps every vertex between the base and the top', () => {
    const mesh = buildMassingMesh([box({ base: 3000, top: 6000 })]);
    for (let index = 2; index < mesh.positions.length; index += 3) {
      expect(mesh.positions[index]).toBeGreaterThanOrEqual(3000);
      expect(mesh.positions[index]).toBeLessThanOrEqual(6000);
    }
  });

  it('skips a mass with no height', () => {
    expect(buildMassingMesh([box({ base: 3000, top: 3000 })]).triangleCount).toBe(0);
  });

  it('skips a degenerate footprint', () => {
    expect(
      buildMassingMesh([{ footprint: [{ x: 0, y: 0 }], baseElevation: 0, topElevations: [10] }]).triangleCount,
    ).toBe(0);
    expect(buildMassingMesh([]).triangleCount).toBe(0);
  });

  it('follows a sloped top per vertex', () => {
    // A gable plane's top elevation varies across the footprint; flattening it
    // to a box would put its shadow in the wrong place.
    const footprint = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    const mesh = buildMassingMesh([
      { id: 'roof', footprint, holes: [], baseElevation: 0, topElevations: [3000, 3000, 5000, 5000] },
    ]);

    let highest = 0;
    for (let index = 2; index < mesh.positions.length; index += 3) {
      highest = Math.max(highest, mesh.positions[index]);
    }
    expect(highest).toBe(5000);
  });
});

describe('why the caps have to be there', () => {
  it('blocks a steep ray passing through a thin slab overhead', () => {
    /*
     * The case that makes caps non-optional. A balcony or an eave is a thin
     * horizontal solid: a steep ray enters through its underside and leaves
     * through its top without ever meeting a side wall, so a mesh of walls
     * alone would let the commonest overhang in a building shade nothing.
     */
    const balcony = box({ x: -2000, y: -2000, size: 4000, base: 3000, top: 3200 });
    const bvh = buildBvh(...Object.values(buildMassingMesh([balcony])).slice(0, 2));

    // Straight up from underneath: must be blocked.
    expect(bvhIntersectsRay(bvh, 0, 0, 1500, 0, 0, 1)).toBe(true);
    // And from beside it, must not be.
    expect(bvhIntersectsRay(bvh, 5000, 0, 1500, 0, 0, 1)).toBe(false);
  });

  it('leaves a courtyard open to the sky', () => {
    // A merged floor plate is a ring. Capping the hole would roof the courtyard
    // and put every window facing it into permanent shade.
    const outer = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ];
    const hole = [
      { x: 3000, y: 3000 },
      { x: 7000, y: 3000 },
      { x: 7000, y: 7000 },
      { x: 3000, y: 7000 },
    ];
    const mesh = buildMassingMesh([
      { id: 'ring', footprint: outer, holes: [hole], baseElevation: 0, topElevations: outer.map(() => 9000) },
    ]);
    const bvh = buildBvh(mesh.positions, mesh.triangleCount);

    // Middle of the courtyard, looking straight up: open.
    expect(bvhIntersectsRay(bvh, 5000, 5000, 1500, 0, 0, 1)).toBe(false);
    // Inside the ring itself, looking up: blocked by the lid.
    expect(bvhIntersectsRay(bvh, 1500, 1500, 1500, 0, 0, 1)).toBe(true);
  });

  it('walls the courtyard so a sideways ray does not escape', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ];
    const hole = [
      { x: 3000, y: 3000 },
      { x: 7000, y: 3000 },
      { x: 7000, y: 7000 },
      { x: 3000, y: 7000 },
    ];
    const mesh = buildMassingMesh([
      { id: 'ring', footprint: outer, holes: [hole], baseElevation: 0, topElevations: outer.map(() => 9000) },
    ]);
    const bvh = buildBvh(mesh.positions, mesh.triangleCount);

    expect(bvhIntersectsRay(bvh, 5000, 5000, 1500, 1, 0, 0)).toBe(true);
  });
});

describe('several masses', () => {
  it('meshes them all into one soup', () => {
    const mesh = buildMassingMesh([box({}), box({ x: 5000 }), box({ y: 5000 })]);
    expect(mesh.triangleCount).toBe(36);
  });

  it('lets a taller neighbour shade a shorter one', () => {
    const mesh = buildMassingMesh([box({ size: 2000, top: 3000 }), box({ x: 3000, size: 4000, top: 30000 })]);
    const bvh = buildBvh(mesh.positions, mesh.triangleCount);

    // From the low roof, angled towards the tower: blocked.
    const norm = Math.hypot(1, 0, 1);
    expect(bvhIntersectsRay(bvh, 1000, 1000, 3100, 1 / norm, 0, 1 / norm)).toBe(true);
    // Away from it: clear.
    expect(bvhIntersectsRay(bvh, 1000, 1000, 3100, -1 / norm, 0, 1 / norm)).toBe(false);
  });
});
