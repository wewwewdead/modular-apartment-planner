// Fixtures for the flange gaps (docs/sketch-studio-corner-gaps.md §3.4).
import { bendNumbers } from './sheetMetal.js';

// The user's tray (2026-11-18, sample_bending.json in their Documents folder,
// copied, never written): t 1.2 SPCC, a wall and a returned lip on all four
// sides, eight 90° up bends (A 102 punch, V8 88° die), lips mitred 45°, a 2 × 2
// relief notch at each corner. The sheet-metal feature and its sketch profile
// as saved.
export const USER_TRAY_FEATURE = {
  id: 'feature-47d860f8-dd97-473d-b25c-4c5f715fe4b3',
  type: 'sheetmetal',
  sketchId: 'sketch-7959098c-776c-4a82-b60b-885d2969da72',
  thickness: 1.2,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends: [
    {
      id: 'bend-750e32e9-6566-4cb0-bf3f-ef4b1efffc5b',
      a: [322.834742, 102.878679],
      b: [-130.56055299999997, 102.878679],
      angle: 90,
      direction: 'up',
      radius: null,
      punch: 'a102',
      die: 'v8-88',
    },
    {
      id: 'bend-85a12125-b061-4bd4-88eb-7bfa95b6bf97',
      a: [-130.560553, -468.518402],
      b: [322.834742, -468.518402],
      angle: 90,
      direction: 'up',
      radius: null,
      punch: 'a102',
      die: 'v8-88',
    },
    {
      id: 'bend-5f85a1c6-dee2-4334-a579-9a469406f3d7',
      a: [306.834742, -484.518402],
      b: [306.834742, 118.87867899999998],
      angle: 90,
      direction: 'up',
      radius: null,
      punch: 'a102',
      die: 'v8-88',
    },
    {
      id: 'bend-1b5db645-bf40-4893-b5f5-a42f4796d200',
      a: [-114.560553, 118.878679],
      b: [-114.560553, -484.51840200000004],
      angle: 90,
      direction: 'up',
      radius: null,
      punch: 'a102',
      die: 'v8-88',
    },
    {
      id: 'bend-a3f1c53e-69cb-41c5-8e84-1b65bb2e5970',
      a: [286.834742, -484.518402],
      b: [286.834742, 118.87867899999998],
      angle: 90,
      direction: 'up',
      radius: null,
      punch: 'a102',
      die: 'v8-88',
    },
    {
      id: 'bend-e8b3db5a-0413-49dd-9fec-c6f90da6f6a8',
      a: [-94.560553, 118.878679],
      b: [-94.560553, -484.51840200000004],
      angle: 90,
      direction: 'up',
      radius: null,
      punch: 'a102',
      die: 'v8-88',
    },
    {
      id: 'bend-545330d3-77eb-4541-a8fd-819a9efca613',
      a: [-130.560553, -449.018402],
      b: [322.834742, -449.018402],
      angle: 90,
      direction: 'up',
      radius: null,
      punch: 'a102',
      punchTrim: 5.999242,
      horns: 30,
      die: 'v8-88',
    },
    {
      id: 'bend-78f3d754-1ca2-45e7-9716-7505fe6bbd05',
      a: [322.834742, 83.378679],
      b: [-130.56055299999997, 83.378679],
      angle: 90,
      direction: 'up',
      radius: null,
      punch: 'a102',
      punchTrim: 5.990937,
      horns: 30,
      die: 'v8-88',
    },
  ],
};
export const USER_TRAY_PROFILE = {
  type: 'path',
  start: [-78.878679, 117.878679],
  segments: [
    { type: 'line', end: [271.121321, 117.878679] },
    { type: 'line', end: [285.970563, 103.029437] },
    { type: 'line', end: [285.970563, 83.029437] },
    { type: 'line', end: [284.970563, 83.029437] },
    { type: 'line', end: [284.970563, 81.029437] },
    { type: 'line', end: [286.970563, 81.029437] },
    { type: 'line', end: [286.9855, 82.029325] },
    { type: 'line', end: [306.9855, 82.029325] },
    { type: 'line', end: [321.834742, 67.180083] },
    { type: 'line', end: [321.834742, -432.819917] },
    { type: 'line', end: [306.9855, -447.669159] },
    { type: 'line', end: [286.9855, -447.669159] },
    { type: 'line', end: [286.987173, -446.66916] },
    { type: 'line', end: [284.987173, -446.66916] },
    { type: 'line', end: [284.987173, -448.66916] },
    { type: 'line', end: [285.987173, -448.66916] },
    { type: 'line', end: [285.987173, -468.66916] },
    { type: 'line', end: [271.137931, -483.518402] },
    { type: 'line', end: [-78.862069, -483.518402] },
    { type: 'line', end: [-93.711311, -468.66916] },
    { type: 'line', end: [-93.711311, -448.66916] },
    { type: 'line', end: [-92.711311, -448.66916] },
    { type: 'line', end: [-92.711311, -446.66916] },
    { type: 'line', end: [-94.711311, -446.66916] },
    { type: 'line', end: [-94.711311, -447.66916] },
    { type: 'line', end: [-114.711311, -447.66916] },
    { type: 'line', end: [-129.560553, -432.819918] },
    { type: 'line', end: [-129.560553, 67.180082] },
    { type: 'line', end: [-114.711311, 82.029324] },
    { type: 'line', end: [-94.711311, 82.029324] },
    { type: 'line', end: [-94.711311, 81.029324] },
    { type: 'line', end: [-92.711311, 81.029324] },
    { type: 'line', end: [-92.711311, 83.029324] },
    { type: 'line', end: [-93.711311, 83.029324] },
    { type: 'line', end: [-93.711311, 103.029324] },
    { type: 'line', end: [-78.878679, 117.878679] },
  ],
  closed: true,
};

// An L corner built for the tests (§3.4 item 3): a 120 × 100 blank, t 1.2
// SPCC, the A 102 punch in the V8 88° die. Bend 1 raises the rear wall (line
// y = 80, flange +Y), bend 2 the right wall (line x = 100, flange +X), both 90°
// up, a 6 × 6 relief at the corner. The rear wall carries an ear past the
// relief whose end (x = E) faces the right wall: `gap` is how far that end
// stands from the right wall's inside face (negative: past it). The right wall
// carries an ear too, up to the top, so the rear end meets its face; with
// `cover` it stops at the relief instead and the rear end runs past its end,
// `flush` mm short of the plane of its outside face.
// `arc`: the rear end is an arc, hollow toward the right wall (its chords are
// no faces).
export const L_CORNER = Object.freeze({ X5: 100, Y8: 80, depth: 20, relief: 3, thickness: 1.2 });
export function lCorner({ gap = 0.2, cover = false, flush = 0, arc = false, tooth = null } = {}) {
  const { X5, Y8, depth, relief: e, thickness } = L_CORNER;
  // The right wall's inside face stands h − r short of its bend line, its outside face r + t − h past it.
  const { allowance, radius } = bendNumbers({ thickness, stock: 'spcc', angle: 90, punch: 'a102', die: 'v8-88' });
  const inside = allowance / 2 - radius,
    outside = radius + thickness - allowance / 2;
  // With `cover` the end stands `flush` mm short of the right wall's outside face (0: in its plane).
  const E = cover ? X5 + outside - flush : X5 - inside - gap;
  const Xr = X5 + depth,
    Yt = Y8 + depth;
  const corner = cover
    ? [
        [Xr, 0],
        [Xr, Y8 - e],
      ]
    : [
        [Xr, 0],
        [Xr, Yt],
        [X5 + e, Yt],
        [X5 + e, Y8 - e],
      ];
  const points = [...corner, [X5 - e, Y8 - e], [X5 - e, Y8 + e], [E, Y8 + e]];
  const line = (end) => ({ type: 'line', end });
  // `tooth` { length, out }: a tooth `out` mm proud of the rear end, `length` mm long, at y = 90.
  if (tooth) points.push([E, 90], [E + tooth.out, 90], [E + tooth.out, 90 + tooth.length], [E, 90 + tooth.length]);
  const segments = [
    ...points.map(line),
    arc ? { type: 'arc', mid: [E - 0.6, (Y8 + e + Yt) / 2], end: [E, Yt] } : line([E, Yt]),
    line([0, Yt]),
    line([0, 0]),
  ];
  const bend = (id, a, b) => ({ id, a, b, angle: 90, direction: 'up', radius: null, punch: 'a102', die: 'v8-88' });
  return {
    profile: { type: 'path', start: [0, 0], segments },
    feature: {
      id: 'feature-l',
      type: 'sheetmetal',
      sketchId: 'sketch-l',
      thickness,
      stock: 'spcc',
      kFactor: null,
      base: null,
      marks: [],
      bends: [bend('bend-rear', [-1, Y8], [X5 - e - 1, Y8]), bend('bend-right', [X5, -1], [X5, Y8 - e - 1])],
    },
  };
}
