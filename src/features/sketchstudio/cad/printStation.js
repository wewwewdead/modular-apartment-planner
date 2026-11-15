// The print station (docs/sketch-studio-fab-shop.md §9 SM-3, rules §8.6):
// artwork (text or an uploaded image) laid on a face of a part, stored in the
// part's own frame (§4.2: origin = the artwork centre, x along its width
// before `rotation`, normal out of the face), and the checks a print shop
// makes — artwork off the face, too near its edge, over a bend zone, silk-
// screen text below 9 pt, a curved face for UV flatbed or silk-screen.
// Plain arrays in and out; three.js matrix maths inside for the kernel mesh.
import { Matrix4, Vector3 } from 'three';
import { uid } from './model.js';
import { placementMatrix } from './movement.js';
import { faceOutline } from './sketchPlane.js';
import { pointInRing, transformPoint } from './sheetMetal.js';
import { polygonsOverlap } from './brakeCollisions.js';
import { POINT_MM, PRINT_METHOD_NAMES, PRINT_RULES } from './shopCatalog.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n > 1e-12 ? scale(a, 1 / n) : null;
};
const fmt = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');

export const PRINT_FONTS = Object.freeze([
  ['sans-serif', 'Sans'],
  ['serif', 'Serif'],
  ['monospace', 'Mono'],
]);
export const PRINT_DEFAULTS = Object.freeze({
  kind: 'text',
  text: 'SAMPLE',
  font: 'sans-serif',
  colour: '#111111',
  method: 'silk',
  width: 40,
  height: 10,
  rotation: 0,
});
// A face whose plane is within this (mm) of the artwork's carries it.
const ON_FACE = 0.05;

/** The height of a line of text in points (1 pt = 25.4 / 72 mm). */
export const textPoints = (height) => height / POINT_MM;

/** The artwork's frame in its part: { origin, x (width, rotated), y (height), normal }, unit axes. */
export function printAxes(print) {
  const n = unit(print.normal);
  const base = unit(sub(print.x, scale(n, dot(print.x, n))));
  const turn = ((Number(print.rotation) || 0) * Math.PI) / 180;
  const side = cross(n, base);
  const x = add(scale(base, Math.cos(turn)), scale(side, Math.sin(turn)));
  return { origin: [...print.origin], x, y: cross(n, x), normal: n };
}

/** The artwork's corners in its part frame, counter-clockwise from bottom left. */
export function printCorners(print) {
  const { origin, x, y } = printAxes(print);
  const w = print.width / 2,
    h = print.height / 2;
  return [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ].map(([u, v]) => add(origin, add(scale(x, u), scale(y, v))));
}

/** The artwork quad's placement in its part (column-major 16): quad x, y along the artwork, z out of the face. */
export function printMatrix(print) {
  const { origin, x, y, normal } = printAxes(print);
  return [...x, 0, ...y, 0, ...normal, 0, ...origin, 1];
}

/** A text or image print for the placed artwork (§4.2); text and image fields are kept apart. */
export function createPrint({ instanceId, point, normal, x, artwork }) {
  const kind = artwork.kind === 'image' && artwork.image ? 'image' : 'text';
  return {
    id: uid('print'),
    instanceId,
    origin: point.map(Number),
    x: x.map(Number),
    normal: normal.map(Number),
    width: Number(artwork.width),
    height: Number(artwork.height),
    rotation: Number(artwork.rotation) || 0,
    method: artwork.method,
    kind,
    ...(kind === 'text' ? { text: String(artwork.text ?? ''), font: artwork.font } : { image: artwork.image }),
    colour: artwork.colour,
  };
}

/** Silk-screen and UV flatbed need a flat face (§8.6); pad printing takes a curved one. '' when allowed. */
export function methodOnFace(method, planar) {
  if (planar || method === 'pad') return '';
  return `${PRINT_METHOD_NAMES[method] || method} needs a flat face: pick a flat face, or use pad printing for a curved one.`;
}

/**
 * A snapshot instance's mesh in its part's own frame (the kernel meshes in
 * world coordinates at the instance's placement): { positions, normals, index }.
 */
export function localMesh(item) {
  const inverse = placementMatrix(item.placement || []).invert();
  const turn = new Matrix4().extractRotation(inverse);
  const source = item.mesh.vertices,
    normals = item.mesh.normals;
  const positions = new Float64Array(source.length),
    turned = new Float64Array(source.length);
  const v = new Vector3();
  for (let i = 0; i < source.length; i += 3) {
    v.set(source[i], source[i + 1], source[i + 2]).applyMatrix4(inverse);
    positions[i] = v.x;
    positions[i + 1] = v.y;
    positions[i + 2] = v.z;
    if (normals) {
      v.set(normals[i], normals[i + 1], normals[i + 2]).applyMatrix4(turn);
      turned[i] = v.x;
      turned[i + 1] = v.y;
      turned[i + 2] = v.z;
    }
  }
  return { positions, normals: normals ? turned : null, index: item.mesh.triangles };
}

// Closest point of triangle (a, b, c) to p: the distance only.
function triangleDistance(p, a, b, c) {
  const n = unit(cross(sub(b, a), sub(c, a)));
  if (!n) return Infinity;
  const q = sub(p, scale(n, dot(sub(p, a), n)));
  const inside = [
    [a, b],
    [b, c],
    [c, a],
  ].every(([u, w]) => dot(cross(sub(w, u), sub(q, u)), n) >= -1e-9);
  const off = Math.abs(dot(sub(p, a), n));
  if (inside) return off;
  const edge = (u, w) => {
    const e = sub(w, u);
    const t = Math.max(0, Math.min(1, dot(sub(q, u), e) / dot(e, e)));
    return Math.hypot(...sub(q, add(u, scale(e, t))));
  };
  return Math.hypot(off, Math.min(edge(a, b), edge(b, c), edge(c, a)));
}

/**
 * The face of `mesh` (localMesh) the print lies on: the triangle in the
 * print's plane under (or nearest to) its centre and its coplanar neighbours
 * (sketchPlane.js faceOutline). Returns { triangles, segments } (part frame)
 * or null when no face of the part lies in the artwork's plane.
 */
export function printFace(mesh, print) {
  const n = unit(print.normal);
  const { positions, index } = mesh;
  const point = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  let best = -1,
    bestDistance = Infinity;
  for (let t = 0; t < index.length / 3; t++) {
    const [a, b, c] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]].map(point);
    const tn = unit(cross(sub(b, a), sub(c, a)));
    if (!tn || dot(tn, n) < 0.9999 || Math.abs(dot(sub(print.origin, a), n)) > ON_FACE) continue;
    const distance = triangleDistance(print.origin, a, b, c);
    if (distance < bestDistance) {
      best = t;
      bestDistance = distance;
    }
  }
  if (best < 0) return null;
  const outline = faceOutline(positions, index, best, n, 1e-4);
  return { triangles: outline.triangles, segments: outline.segments };
}

// The artwork's frame in 2D: u along its width, v along its height, about its centre.
const toArtwork = (axes, p) => {
  const d = sub(p, axes.origin);
  return [dot(d, axes.x), dot(d, axes.y)];
};
// Sutherland–Hodgman: a polygon clipped to the axis-aligned box |u| ≤ w, |v| ≤ h.
function clipToBox(polygon, w, h) {
  const planes = [
    [(p) => p[0] + w, 0, -w],
    [(p) => w - p[0], 0, w],
    [(p) => p[1] + h, 1, -h],
    [(p) => h - p[1], 1, h],
  ];
  let out = polygon;
  for (const [inside, axis, edge] of planes) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i],
        q = input[(i + 1) % input.length];
      const ip = inside(p) >= 0,
        iq = inside(q) >= 0;
      if (ip) out.push(p);
      if (ip !== iq) {
        const t = (edge - p[axis]) / (q[axis] - p[axis]);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    if (!out.length) break;
  }
  return out;
}
const area2 = (ring) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(sum) / 2;
};
// Distance from a 2D point to a 2D segment.
const segmentDistance = (p, a, b) => {
  const e = [b[0] - a[0], b[1] - a[1]];
  const l2 = e[0] * e[0] + e[1] * e[1];
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - e[0] * t, p[1] - a[1] - e[1] * t);
};

/**
 * How the artwork sits on its face: { covered (the share of the artwork on
 * the face, 0…1), edge (the smallest distance from the artwork to the face's
 * edge when it is all on the face, else 0) }.
 */
export function artworkFit(print, mesh, face) {
  const axes = printAxes(print);
  const w = print.width / 2,
    h = print.height / 2;
  const { positions, index } = mesh;
  const point = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  let covered = 0;
  for (const t of face.triangles) {
    const ring = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]].map((i) => toArtwork(axes, point(i)));
    const clipped = clipToBox(ring, w, h);
    if (clipped.length >= 3) covered += area2(clipped);
  }
  const share = Math.min(1, covered / (4 * w * h));
  if (share < 0.999) return { covered: share, edge: 0 };
  const corners = [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ];
  let edge = Infinity;
  for (const [p, q] of face.segments) {
    const a = toArtwork(axes, p),
      b = toArtwork(axes, q);
    for (const c of corners) edge = Math.min(edge, segmentDistance(c, a, b));
    for (const e of [a, b]) {
      const du = Math.max(0, Math.abs(e[0]) - w),
        dv = Math.max(0, Math.abs(e[1]) - h);
      edge = Math.min(edge, Math.hypot(du, dv));
    }
  }
  return { covered: share, edge };
}

// A rigid column-major matrix's inverse.
function rigidInverse(m) {
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  const t = transformPoint(r, [m[12], m[13], m[14]]);
  r[12] = -t[0];
  r[13] = -t[1];
  r[14] = -t[2];
  return r;
}

/**
 * The bends whose zone the artwork reaches (§8.6: never over a bend zone), for
 * a print on a sheet-metal part: the artwork is taken back to the flat blank
 * through the piece whose face carries it, and checked against each bend's
 * strip (the flat width that becomes the arc). `fold`: sheetMetal.js
 * foldSheet. Returns [bend], or [] (also when no piece carries it).
 */
export function bendZoneHits(print, fold) {
  const n = unit(print.normal);
  let carrier = null;
  for (const piece of fold.pieces) {
    const m = piece.matrix;
    const normal = [m[8], m[9], m[10]];
    if (Math.abs(dot(normal, n)) < 0.999) continue;
    const inverse = rigidInverse(m);
    const flat = transformPoint(inverse, print.origin);
    const onFace = Math.abs(flat[2]) < ON_FACE || Math.abs(flat[2] - fold.thickness) < ON_FACE;
    if (!onFace) continue;
    const inside = pointInRing(flat, piece.outer);
    if (!carrier || (inside && !carrier.inside)) carrier = { piece, inverse, inside };
  }
  if (!carrier) return [];
  const ring = printCorners(print).map((p) => transformPoint(carrier.inverse, p).slice(0, 2));
  const along = (a, u, s, nn, v) => [a[0] + u[0] * s + nn[0] * v, a[1] + u[1] * s + nn[1] * v];
  return fold.bends.filter((bend) => {
    const half = bend.allowance / 2;
    return bend.intervals.some(([s0, s1]) =>
      polygonsOverlap(ring, [
        along(bend.a, bend.u, s0, bend.n, -half),
        along(bend.a, bend.u, s1, bend.n, -half),
        along(bend.a, bend.u, s1, bend.n, half),
        along(bend.a, bend.u, s0, bend.n, half),
      ]),
    );
  });
}

/**
 * The print shop's checks for one print (§8.6): { warnings: [{ code, message }],
 * fit } — the artwork off its face (or no face under it), within 6.35 mm of
 * the face edge, over a bend zone (sheet metal: `fold`), silk-screen text
 * below 9 pt. mesh: localMesh of its instance (null when not meshed yet).
 */
export function printWarnings({ print, mesh = null, fold = null }) {
  const warnings = [];
  let fit = null;
  if (mesh) {
    const face = printFace(mesh, print);
    if (!face)
      warnings.push({
        code: 'no-face',
        message: 'No face of the part lies under the artwork: place it on a face again.',
      });
    else {
      fit = artworkFit(print, mesh, face);
      if (fit.covered < 0.999)
        warnings.push({
          code: 'overhang',
          message: `The artwork overhangs its face: ${fmt((1 - fit.covered) * 100, 0)}% of it is off the part. Move it in or make it smaller.`,
        });
      else if (fit.edge < PRINT_RULES.edgeDistance - 1e-6)
        warnings.push({
          code: 'edge',
          message: `The artwork is ${fmt(fit.edge)} mm from the face edge: keep at least ${PRINT_RULES.edgeDistance} mm.`,
        });
    }
  }
  if (fold)
    for (const bend of bendZoneHits(print, fold))
      warnings.push({
        code: 'bend-zone',
        message: `The artwork reaches over the zone of bend ${bend.index + 1} (${bend.label}): ink cracks on a bend. Keep it on the flat.`,
      });
  if (print.kind === 'text' && print.method === 'silk' && textPoints(print.height) < PRINT_RULES.minPoint - 1e-9)
    warnings.push({
      code: 'small-text',
      message: `Silk-screen text ${fmt(print.height)} mm high is ${fmt(textPoints(print.height), 1)} pt: the screen holds ${PRINT_RULES.minPoint} pt (${fmt(PRINT_RULES.minPoint * POINT_MM)} mm) and up.`,
    });
  return { warnings, fit };
}
