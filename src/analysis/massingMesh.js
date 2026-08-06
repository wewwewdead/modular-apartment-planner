/**
 * Turns the analysis massing into a triangle soup a ray can be fired at.
 *
 * `buildAnalysisMassing` gives prisms: a plan outline, a base elevation and a
 * top elevation per vertex. That is everything the 2D shadow projection needs,
 * but a solar study asks about points on facades and roofs, and those questions
 * are genuinely three-dimensional — so the prisms get walls, a lid and a floor.
 *
 * **Why the caps are not optional.** Sun rays travel upward, so it is tempting
 * to skip them: a ray entering a prism through a side wall has already been
 * blocked. The case that breaks is a thin horizontal slab — a balcony, an eave,
 * a roof plane — sitting above a sensor. A steep ray enters through its
 * underside and leaves through its top without ever touching a side wall, so
 * without caps the commonest overhang in a building shades nothing at all.
 *
 * Caps carry the holes through, because a merged floor plate is a ring: capping
 * the courtyard would roof it over and put every window facing it in permanent
 * shade.
 */

import { triangulate } from '@/geometry/triangulate';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Two triangles spanning one footprint edge from base to top. */
function pushSideQuad(out, ax, ay, bx, by, base, topA, topB) {
  out.push(ax, ay, base, bx, by, base, bx, by, topB);
  out.push(ax, ay, base, bx, by, topB, ax, ay, topA);
}

function pushCap(out, outline, holes) {
  const { vertices, indices } = triangulate(outline, holes);
  for (let index = 0; index < indices.length; index += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = vertices[indices[index + corner]];
      out.push(vertex.x, vertex.y, vertex.z);
    }
  }
}

/**
 * Build the occlusion mesh for a set of masses.
 *
 * @param {Array} masses  From `buildAnalysisMassing`.
 * @returns {{positions: Float32Array, triangleCount: number}}
 */
export function buildMassingMesh(masses = []) {
  const out = [];

  for (const mass of masses) {
    const footprint = mass.footprint || [];
    if (footprint.length < 3) continue;

    const base = isFiniteNumber(mass.baseElevation) ? mass.baseElevation : 0;
    const tops = mass.topElevations || [];
    const fallbackTop = tops.length ? Math.max(...tops.filter(isFiniteNumber)) : base;
    const topAt = (index) => (isFiniteNumber(tops[index]) ? tops[index] : fallbackTop);

    if (!(fallbackTop > base)) continue;

    for (let index = 0; index < footprint.length; index += 1) {
      const next = (index + 1) % footprint.length;
      pushSideQuad(
        out,
        footprint[index].x,
        footprint[index].y,
        footprint[next].x,
        footprint[next].y,
        base,
        topAt(index),
        topAt(next),
      );
    }

    // Hole walls face inward, but a shadow ray is tested double-sided, so the
    // winding never has to be reasoned about.
    const holes = (mass.holes || []).filter((hole) => (hole || []).length >= 3);
    for (const hole of holes) {
      for (let index = 0; index < hole.length; index += 1) {
        const next = (index + 1) % hole.length;
        pushSideQuad(out, hole[index].x, hole[index].y, hole[next].x, hole[next].y, base, fallbackTop, fallbackTop);
      }
    }

    const topOutline = footprint.map((point, index) => ({ x: point.x, y: point.y, z: topAt(index) }));
    const topHoles = holes.map((hole) => hole.map((point) => ({ x: point.x, y: point.y, z: fallbackTop })));
    pushCap(out, topOutline, topHoles);

    const baseOutline = footprint.map((point) => ({ x: point.x, y: point.y, z: base }));
    const baseHoles = holes.map((hole) => hole.map((point) => ({ x: point.x, y: point.y, z: base })));
    pushCap(out, baseOutline, baseHoles);
  }

  return { positions: Float32Array.from(out), triangleCount: out.length / 9 };
}

/*
 * No ground plane is meshed, deliberately.
 *
 * The obvious worry is that a sensor would count the earth beneath it as open
 * sky and report twice the diffuse it receives. It cannot: the sky view test
 * discards every direction below the horizontal before it casts a ray, and the
 * sun is never sampled below the horizon. Adding a giant ground quad would
 * change no result and would put a triangle spanning the whole site into every
 * BVH node it touches.
 */
