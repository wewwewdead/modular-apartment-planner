// faceOutline with a kept vertex adjacency and vertices asked for one by one
// (docs/perf-pass-3.md §5 B1.5) gives exactly what it gives building the map
// over the whole mesh from a full position array.
import { describe, expect, it } from 'vitest';
import { faceOutline, meshAdjacency } from './sketchPlane.js';

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A height field over a grid: flat patches (coplanar runs), slopes, shared
// vertices everywhere, a degenerate triangle now and then.
function mesh(seed) {
  const rnd = random(seed);
  const n = 3 + Math.floor(rnd() * 8);
  const levels = [0, 0, 0, 5, 12];
  const positions = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) positions.push(i * 10, j * 10, levels[Math.floor(rnd() * levels.length)]);
  const index = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      index.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
      if (rnd() < 0.05) index.push(a, a, a + 1);
    }
  return { positions: Float32Array.from(positions), index: Uint32Array.from(index), count: (n + 1) ** 2 };
}

describe('meshAdjacency', () => {
  it('lists every triangle at each vertex, in triangle order', () => {
    const { index, count } = mesh(7);
    const { offsets, triangles } = meshAdjacency(index, count);
    for (let v = 0; v < count; v++) {
      const expected = [];
      for (let t = 0; t < index.length / 3; t++)
        for (let k = 0; k < 3; k++) if (index[t * 3 + k] === v) expected.push(t);
      expect([...triangles.slice(offsets[v], offsets[v + 1])]).toEqual(expected);
    }
  });
});

describe('faceOutline with options', () => {
  it('matches the whole-mesh outline over 400 random meshes and seed triangles', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { positions, index, count } = mesh(seed);
      const adjacency = meshAdjacency(index, count);
      const triangle = seed % (index.length / 3);
      const point = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
      const normal = seed % 3 ? [0, 0, 1] : [0, 0, -1];
      const expected = faceOutline(positions, index, triangle, normal);
      // An empty array: every vertex must come through `point`.
      const actual = faceOutline(new Float32Array(), index, triangle, normal, undefined, { adjacency, point });
      expect(actual, `seed ${seed}`).toEqual(expected);
      expect(faceOutline(positions, index, triangle, normal, undefined, { adjacency }), `seed ${seed}`).toEqual(
        expected,
      );
    }
  });
});
