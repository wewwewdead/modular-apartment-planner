import { expect, it } from 'vitest';
import {
  LABEL_CORNER,
  PICK_HINT,
  PLANE_NAMES,
  REST_HINT,
  faceHint,
  planeHint,
  planeLabel,
  planeTiles,
  tileSize,
} from './originPlanes.js';
import { NAMED_PLANES, planeFrame } from './sketchPlane.js';

const box = (size) => [
  [0, 0, 0],
  [size, size / 2, size / 4],
];

it('sizes the tiles: 400 mm empty, half the largest extent, clamped to 200 mm – 3 m', () => {
  expect(tileSize(null)).toBe(400);
  expect(planeTiles().size).toBe(400);
  // A 100 mm part: 50 mm → the 200 mm floor.
  expect(tileSize(box(100))).toBe(200);
  // A 10 m part: 5 m → the 3 m ceiling.
  expect(tileSize(box(10000))).toBe(3000);
  // In between: the Board / plate (600 × 400 × 18) gets 300 mm.
  expect(
    tileSize([
      [0, 0, 0],
      [600, 400, 18],
    ]),
  ).toBe(300);
  // The extent is measured from the box, not from the origin.
  expect(
    tileSize([
      [1000, 1000, 0],
      [2000, 1100, 50],
    ]),
  ).toBe(500);
});

it('centres each tile on its sketch frame origin, corners in (u, v) order (−,−), (+,−), (+,+), (−,+)', () => {
  const { tiles, size } = planeTiles();
  expect(tiles.XY).toEqual([
    [-200, -200, 0],
    [200, -200, 0],
    [200, 200, 0],
    [-200, 200, 0],
  ]);
  expect(tiles.XZ).toEqual([
    [-200, 0, -200],
    [200, 0, -200],
    [200, 0, 200],
    [-200, 0, 200],
  ]);
  expect(tiles.YZ).toEqual([
    [0, -200, -200],
    [0, 200, -200],
    [0, 200, 200],
    [0, -200, 200],
  ]);
  for (const plane of ['XY', 'XZ', 'YZ']) {
    const frame = planeFrame(plane, 0);
    const corner = ([u, v]) => frame.origin.map((o, i) => o + u * frame.x[i] + v * frame.y[i]);
    const h = size / 2;
    expect(tiles[plane]).toEqual(
      [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ].map(corner),
    );
    // The centre is the frame origin: sketch (0, 0).
    expect([0, 1, 2].map((i) => (tiles[plane][0][i] + tiles[plane][2][i]) / 2)).toEqual(frame.origin);
  }
  // The label anchor (+S/2, +S/2).
  expect(tiles.XY[LABEL_CORNER]).toEqual([200, 200, 0]);
});

it('moves every tile along its own axis by the offset (XY → Z, XZ → Y, YZ → X)', () => {
  const { tiles, offset } = planeTiles({ offset: '100' });
  expect(offset).toBe(100);
  expect(tiles.XZ.every((p) => p[1] === 100)).toBe(true);
  expect(tiles.XY.every((p) => p[2] === 100)).toBe(true);
  expect(tiles.YZ.every((p) => p[0] === 100)).toBe(true);
  // The YZ tile's (+S/2, +S/2) corner is (offset, S/2, S/2).
  expect(tiles.YZ[LABEL_CORNER]).toEqual([100, 200, 200]);
});

it('names the planes as the standard views see them', () => {
  expect(PLANE_NAMES).toEqual({ XY: 'Top', XZ: 'Front', YZ: 'Right' });
  // Front looks along +Y at the plane whose normal is -Y; Right along -X; Top down Z.
  expect(NAMED_PLANES.XZ.normal).toEqual([0, -1, 0]);
  expect(NAMED_PLANES.YZ.normal).toEqual([1, 0, 0]);
  expect(NAMED_PLANES.XY.normal).toEqual([0, 0, 1]);
  expect(planeLabel('XY')).toBe('Top · XY');
  expect(planeLabel('XZ')).toBe('Front · XZ');
  expect(planeLabel('YZ')).toBe('Right · YZ');
});

it('words the hints exactly', () => {
  expect(planeHint('XY')).toBe('Sketch on Top (XY) · click to start');
  expect(planeHint('XY', 100)).toBe('Sketch on Top (XY, +100 mm) · click to start');
  expect(planeHint('XZ', '50')).toBe('Sketch on Front (XZ, +50 mm) · click to start');
  expect(planeHint('YZ', -12.5)).toBe('Sketch on Right (YZ, -12.5 mm) · click to start');
  expect(faceHint('Board / plate')).toBe('Sketch on this face of Board / plate · click to start');
  expect(PICK_HINT).toBe('New sketch: click a flat face or an origin plane · Esc cancels');
  expect(REST_HINT).toBe(
    'Click an origin plane to start a sketch · S starts one anywhere · Solid tab adds a board or tube',
  );
});
