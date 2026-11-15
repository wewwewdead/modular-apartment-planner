// The print station's logic (docs/sketch-studio-fab-shop.md §9 SM-3, §8.6):
// the artwork frame in its part, the face under it from the kernel mesh, and
// the checks: off the face, near the edge, over a bend zone, small silk text,
// a curved face.
import { describe, expect, it } from 'vitest';
import { emptyModel, normalizeModel } from './model.js';
import { foldSheet, transformPoint } from './sheetMetal.js';
import {
  PRINT_DEFAULTS,
  artworkFit,
  bendZoneHits,
  createPrint,
  localMesh,
  methodOnFace,
  printAxes,
  printCorners,
  printFace,
  printMatrix,
  printWarnings,
  textPoints,
} from './printStation.js';

const close = (actual, expected, digits = 9) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits));
// A closed box as an indexed mesh (outward winding), the kernel's layout.
const boxMesh = ([x0, y0, z0], [x1, y1, z1]) => ({
  vertices: Float32Array.from(
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ].flat(),
  ),
  normals: null,
  triangles: Uint32Array.from([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7,
  ]),
});
const text = (extra = {}) =>
  createPrint({
    instanceId: 'plate',
    point: [75, 0, 1.5],
    normal: [0, 0, 1],
    x: [1, 0, 0],
    artwork: { ...PRINT_DEFAULTS, text: 'ACME', width: 30, height: 10, ...extra },
  });

describe('the artwork frame (§4.2: part frame, origin = the centre)', () => {
  it('turns the width axis by `rotation` about the face normal', () => {
    const print = text({ rotation: 90 });
    const axes = printAxes(print);
    close(axes.x, [0, 1, 0]);
    close(axes.y, [-1, 0, 0]);
    close(printCorners(text())[0], [60, -5, 1.5]);
    close(printCorners(text())[2], [90, 5, 1.5]);
    close(printMatrix(text()).slice(12, 15), [75, 0, 1.5]);
  });
  it('keeps text and image fields apart, and validates in the model', () => {
    const t = text();
    expect(t).toMatchObject({ kind: 'text', text: 'ACME', font: 'sans-serif', method: 'silk', width: 30, height: 10 });
    expect(t).not.toHaveProperty('image');
    const image = createPrint({
      instanceId: 'plate',
      point: [0, 0, 1.5],
      normal: [0, 0, 1],
      x: [1, 0, 0],
      artwork: { ...PRINT_DEFAULTS, kind: 'image', image: 'data:image/png;base64,AAAA' },
    });
    expect(image).toMatchObject({ kind: 'image', image: 'data:image/png;base64,AAAA' });
    expect(image).not.toHaveProperty('text');
    // An image kind with no image yet places the text.
    expect(createPrint({ ...image, point: [0, 0, 0], artwork: { ...PRINT_DEFAULTS, kind: 'image' } }).kind).toBe(
      'text',
    );
    const model = {
      ...emptyModel(),
      parts: [{ id: 'p', name: 'Plate', features: [{ id: 'f', type: 'box', width: 1, depth: 1, height: 1 }] }],
      instances: [{ id: 'plate', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
      prints: [t, image],
    };
    expect(() => normalizeModel(model)).not.toThrow();
  });
  it('silk-screen and UV need a flat face; pad printing takes a curved one', () => {
    expect(methodOnFace('silk', true)).toBe('');
    expect(methodOnFace('pad', false)).toBe('');
    expect(methodOnFace('uv', false)).toBe(
      'UV flatbed needs a flat face: pick a flat face, or use pad printing for a curved one.',
    );
    expect(textPoints(25.4 / 72)).toBeCloseTo(1, 12);
  });
});

describe('the face under the artwork (from the kernel mesh)', () => {
  // The plate at its placement in the world (the kernel meshes in world coordinates).
  const item = { mesh: boxMesh([-90, -60, 0], [110, 60, 1.5]), placement: [{ translation: [10, 0, 0] }] };
  const mesh = localMesh(item);
  it('takes the world mesh back to the part frame', () => {
    close([...mesh.positions.slice(0, 3)], [-100, -60, 0], 6);
  });
  it('finds the top face, and how the artwork sits on it', () => {
    const face = printFace(mesh, text());
    expect(face.triangles).toHaveLength(2);
    expect(face.segments).toHaveLength(4);
    const fit = artworkFit(text(), mesh, face);
    expect(fit.covered).toBeCloseTo(1, 9);
    expect(fit.edge).toBeCloseTo(10, 6);
    expect(printWarnings({ print: text(), mesh }).warnings).toEqual([]);
  });
  it('warns when the artwork overhangs, or comes within 6.35 mm of the edge', () => {
    const over = { ...text(), origin: [100, 0, 1.5] };
    expect(artworkFit(over, mesh, printFace(mesh, over)).covered).toBeCloseTo(0.5, 6);
    expect(printWarnings({ print: over, mesh }).warnings.map((w) => w.message)).toEqual([
      'The artwork overhangs its face: 50% of it is off the part. Move it in or make it smaller.',
    ]);
    const near = { ...text(), origin: [80, 0, 1.5] };
    expect(printWarnings({ print: near, mesh }).warnings.map((w) => w.message)).toEqual([
      'The artwork is 5 mm from the face edge: keep at least 6.35 mm.',
    ]);
    // A plane no face lies in.
    expect(printWarnings({ print: { ...text(), origin: [0, 0, 7] }, mesh }).warnings[0].code).toBe('no-face');
  });
  it('warns on silk-screen text under 9 pt only', () => {
    const small = text({ height: 3 });
    expect(printWarnings({ print: small }).warnings.map((w) => w.message)).toEqual([
      'Silk-screen text 3 mm high is 8.5 pt: the screen holds 9 pt (3.17 mm) and up.',
    ]);
    expect(printWarnings({ print: { ...small, method: 'uv' } }).warnings).toEqual([]);
  });
});

describe('bend zones (a sheet-metal part, through the fold)', () => {
  // A 100 × 60 blank, one 90° up bend 20 mm in from the left: the flange rises at the left.
  const fold = foldSheet(
    {
      id: 'sm',
      type: 'sheetmetal',
      thickness: 1.5,
      stock: 'spcc',
      bends: [{ id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' }],
    },
    { type: 'rectangle', width: 100, height: 60, origin: [0, 0] },
  );
  const half = fold.bends[0].allowance / 2;
  const onBase = (x, width) =>
    createPrint({
      instanceId: 'l',
      point: [x, 30, 1.5],
      normal: [0, 0, 1],
      x: [1, 0, 0],
      artwork: { ...PRINT_DEFAULTS, width, height: 10 },
    });
  it('a print clear of the bend has none; one reaching over its strip names the bend', () => {
    expect(bendZoneHits(onBase(60, 20), fold)).toEqual([]);
    // Its left end 1 mm into the strip (the base face stops at 20 + BA/2).
    const hits = bendZoneHits(onBase(20 + half - 1 + 10, 20), fold);
    expect(hits.map((b) => b.id)).toEqual(['b1']);
    expect(printWarnings({ print: onBase(20 + half - 1 + 10, 20), fold }).warnings[0].message).toBe(
      'The artwork reaches over the zone of bend 1 (UP 90° R1.6): ink cracks on a bend. Keep it on the flat.',
    );
  });
  it('a print on the flange is taken back through the flange piece', () => {
    const flange = fold.pieces.find((p) => p.id !== fold.rootPiece);
    const m = flange.matrix;
    const normal = [m[8], m[9], m[10]];
    // On the flange's inner face (z = t in its flat frame), at flat x = 10, clear of the strip, then over it.
    const at = (x, width) =>
      createPrint({
        instanceId: 'l',
        point: transformPoint(m, [x, 30, 1.5]),
        normal,
        x: [m[0], m[1], m[2]],
        artwork: { ...PRINT_DEFAULTS, width, height: 10 },
      });
    expect(bendZoneHits(at(8, 10), fold)).toEqual([]);
    expect(bendZoneHits(at(16, 10), fold).map((b) => b.id)).toEqual(['b1']);
  });
});
