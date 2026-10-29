import { Matrix4, Quaternion } from 'three';
import { cleanRotation } from './movement.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import { vector } from './model.js';

// A sketch frame is an orthonormal plane basis in millimetres:
//   world = origin + u·x + v·y, with y = normal × x (the Replicad Plane rule),
// so a profile point [u, v] means the same thing to the kernel and to the
// viewport. Extrusion runs along +normal.

// Replicad's named planes (PLANES_CONFIG), so a stored `plane: 'XZ'` sketch
// is displayed exactly where the kernel builds it.
export const NAMED_PLANES = {
  XY: { x: [1, 0, 0], normal: [0, 0, 1] },
  YZ: { x: [0, 1, 0], normal: [1, 0, 0] },
  ZX: { x: [0, 0, 1], normal: [0, 1, 0] },
  XZ: { x: [1, 0, 0], normal: [0, -1, 0] },
  YX: { x: [0, 1, 0], normal: [0, 0, -1] },
  ZY: { x: [0, 0, 1], normal: [-1, 0, 0] },
  front: { x: [1, 0, 0], normal: [0, 0, 1] },
  back: { x: [-1, 0, 0], normal: [0, 0, -1] },
  left: { x: [0, 0, 1], normal: [-1, 0, 0] },
  right: { x: [0, 0, -1], normal: [1, 0, 0] },
  top: { x: [1, 0, 0], normal: [0, 1, 0] },
  bottom: { x: [1, 0, 0], normal: [0, -1, 0] },
};
// The three planes offered in the UI. Offset is measured along the world axis
// the plane is perpendicular to (XY → Z, XZ → Y, YZ → X), positive up that axis.
export const SKETCH_PLANES = ['XY', 'XZ', 'YZ'];
const OFFSET_AXIS = { XY: 2, XZ: 1, YZ: 0 };

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((value, i) => value - b[i]);
const scale = (a, s) => a.map((value) => value * s);
export function normalize(a) {
  const length = Math.hypot(...a);
  if (!(length > 1e-12)) throw new Error('Direction must be nonzero.');
  return a.map((value) => value / length);
}
// Strip float32 mesh noise: tiny components to 0, then round to 1e-9.
const tidyDirection = (a) =>
  normalize(a.map((value) => (Math.abs(value) < 1e-6 ? 0 : value))).map((value) => tidy(value));
const tidy = (value, step = 1e-9) => {
  const result = Math.round(value / step) * step;
  return Math.abs(result) < step ? 0 : Number(result.toFixed(9));
};
export const tidyPoint = (point, step = 1e-4) => point.map((value) => tidy(value, step));

export function makeFrame(origin, x, normal) {
  const n = normalize(normal);
  // Remove any component of x along the normal so the basis is orthonormal.
  const xs = normalize(sub(x, scale(n, dot(x, n))));
  return { origin: [...origin], x: xs, y: cross(n, xs), normal: n };
}

export function planeFrame(plane = 'XY', offset = 0) {
  const config = NAMED_PLANES[plane];
  if (!config || !(plane in OFFSET_AXIS)) throw new Error(`Choose a sketch plane: ${SKETCH_PLANES.join(', ')}.`);
  const amount = Number(offset) || 0;
  const origin = [0, 0, 0];
  origin[OFFSET_AXIS[plane]] = amount;
  return makeFrame(origin, config.x, config.normal);
}

// The screen-upright basis for a face: y follows world +Z projected into the
// plane (world +Y for horizontal faces), x = y × normal. This reproduces the
// named planes (XY, XZ, YZ all satisfy it) and the existing standard views,
// so a sketch on a face reads the same way as the part does in that view.
export function uprightAxes(normal) {
  const n = tidyDirection(normal);
  const up = Math.abs(n[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
  const y = normalize(sub(up, scale(n, dot(up, n))));
  return { x: tidyDirection(cross(y, n)), y: tidyDirection(y), normal: n };
}

// A face sketch's origin is the lower-left corner of the face as seen looking
// at it (minimum u and v of its outline), so typed coordinates are measured
// from the visible face edges: "(60, 60)" is 60 mm in from two edges.
export function faceFrame(normal, outline) {
  if (!outline?.length) throw new Error('The picked face has no outline.');
  const { x, y, normal: n } = uprightAxes(normal);
  const w = outline.reduce((sum, p) => sum + dot(p, n), 0) / outline.length;
  const u = Math.min(...outline.map((p) => dot(p, x)));
  const v = Math.min(...outline.map((p) => dot(p, y)));
  const origin = tidyPoint([0, 1, 2].map((i) => u * x[i] + v * y[i] + w * n[i]));
  return { origin, x, y, normal: n };
}

export const toWorld = (frame, [u, v], w = 0) =>
  [0, 1, 2].map((i) => frame.origin[i] + u * frame.x[i] + v * frame.y[i] + w * frame.normal[i]);
export function toPlane(frame, point) {
  const d = sub(point, frame.origin);
  return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.normal)];
}

// Kernel fields for a frame. Named planes stay named (flat-pack export and the
// profile editors key on `plane: 'XY'`); anything else is an explicit plane.
export function frameToSketchFields(frame) {
  const same = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 1e-9);
  const named = ['XY', 'XZ', 'YZ'].find(
    (name) => same(frame.x, NAMED_PLANES[name].x) && same(frame.normal, NAMED_PLANES[name].normal),
  );
  const origin = tidyPoint(frame.origin, 1e-6);
  if (named) return { plane: named, origin, normal: undefined, xDirection: undefined };
  return { plane: 'custom', origin, normal: frame.normal.map((v) => tidy(v)), xDirection: frame.x.map((v) => tidy(v)) };
}

// The plane a stored sketch lies on, in the coordinates of whatever consumes it.
export function sketchLocalFrame(sketch, parameters = {}) {
  const origin = vector(sketch.origin || [0, 0, 0], parameters);
  if (sketch.normal) {
    const normal = vector(sketch.normal, parameters);
    return makeFrame(origin, vector(sketch.xDirection || [1, 0, 0], parameters), normal);
  }
  const config = NAMED_PLANES[sketch.plane || 'XY'];
  if (!config) throw new Error(`Unknown sketch plane: ${sketch.plane}`);
  return makeFrame(origin, config.x, config.normal);
}

export function mapFrame(frame, operations) {
  return makeFrame(
    mapPlacement(frame.origin, operations),
    mapPlacement(frame.x, operations, true),
    mapPlacement(frame.normal, operations, true),
  );
}
export function unmapFrame(frame, operations) {
  return makeFrame(
    unmapPlacement(frame.origin, operations),
    unmapPlacement(frame.x, operations, true),
    unmapPlacement(frame.normal, operations, true),
  );
}

// Which part consumes a sketch, and the instance that displays it.
export function sketchConsumer(model, sketchId) {
  for (const part of model.parts) {
    const feature = part.features.find(
      (f) => f.sketchId === sketchId || f.profileId === sketchId || f.sections?.includes(sketchId),
    );
    if (feature) {
      const instance = model.instances.find((i) => i.partId === part.id) || null;
      return { part, feature, instance };
    }
  }
  return null;
}

// A consumed sketch lives in its part's coordinates; show it on the first
// instance of that part (its kernel placement, so attachments are included).
// An unconsumed sketch lives in world coordinates.
export function sketchWorldFrame(model, snapshot, sketch) {
  const local = sketchLocalFrame(sketch, snapshot?.parameters || {});
  const consumer = sketchConsumer(model, sketch.id);
  if (!consumer?.instance) return { frame: local, consumer };
  const placement = snapshot?.instances.find((i) => i.id === consumer.instance.id)?.placement;
  if (!placement) throw new Error('Rebuild the model before editing this sketch.');
  return { frame: mapFrame(local, placement), consumer };
}

// Instance pose that puts a part-local XY sketch at the origin onto `frame`:
// rotation columns = (x, y, normal), translation = origin. Rotations use the
// kernel's X-then-Y-then-Z convention via movement.js.
export function frameToInstance(frame) {
  const basis = new Matrix4().makeBasis(
    { x: frame.x[0], y: frame.x[1], z: frame.x[2] },
    { x: frame.y[0], y: frame.y[1], z: frame.y[2] },
    { x: frame.normal[0], y: frame.normal[1], z: frame.normal[2] },
  );
  const quaternion = new Quaternion().setFromRotationMatrix(basis);
  return { position: tidyPoint(frame.origin, 1e-6), rotation: cleanRotation(quaternion) };
}

// Human-readable description for the Properties panel.
export function describeFrame(frame, support) {
  const fmt = (a) => a.map((value) => Number(value.toFixed(3))).join(', ');
  if (support?.type === 'plane')
    return `${support.plane} plane${support.offset ? ` at ${['X', 'Y', 'Z'][OFFSET_AXIS[support.plane]]} = ${support.offset} mm` : ''}`;
  return `Plane through (${fmt(frame.origin)}) · normal (${fmt(frame.normal)})`;
}

// Connected coplanar triangles around a hit triangle — one B-rep face, because
// the kernel meshes every face with its own vertices — and the outline
// segments (edges used by exactly one triangle), in world coordinates.
export function faceOutline(positions, index, triangle, normal, tolerance = 1e-4) {
  const count = index.length / 3;
  const point = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const n = normalize(normal);
  const corners = (t) => [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
  const offset = dot(point(corners(triangle)[0]), n);
  const span = Math.max(1, Math.abs(offset));
  const coplanar = (t) => {
    const [a, b, c] = corners(t).map(point);
    const tn = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(...tn);
    if (length < 1e-12) return true;
    return dot(tn, n) / length > 0.99999 && Math.abs(dot(a, n) - offset) < tolerance * span;
  };
  const byVertex = new Map();
  for (let t = 0; t < count; t++)
    for (const v of corners(t)) {
      if (!byVertex.has(v)) byVertex.set(v, []);
      byVertex.get(v).push(t);
    }
  const seen = new Set([triangle]);
  const queue = [triangle];
  while (queue.length) {
    const t = queue.pop();
    for (const v of corners(t))
      for (const next of byVertex.get(v))
        if (!seen.has(next) && coplanar(next)) {
          seen.add(next);
          queue.push(next);
        }
  }
  const edges = new Map();
  for (const t of seen) {
    const [a, b, c] = corners(t);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = p < q ? `${p}:${q}` : `${q}:${p}`;
      edges.set(key, edges.has(key) ? null : [p, q]);
    }
  }
  const segments = [...edges.values()].filter(Boolean).map(([p, q]) => [point(p), point(q)]);
  return { triangles: [...seen], segments, points: segments.flat() };
}

// World segments → sketch-plane segments for those lying in the plane.
export function segmentsInPlane(frame, segments, tolerance = 0.01) {
  const result = [];
  for (const [a, b] of segments) {
    const pa = toPlane(frame, a),
      pb = toPlane(frame, b);
    if (Math.abs(pa[2]) > tolerance || Math.abs(pb[2]) > tolerance) continue;
    const ua = tidyPoint(pa.slice(0, 2)),
      ub = tidyPoint(pb.slice(0, 2));
    if (Math.hypot(ua[0] - ub[0], ua[1] - ub[1]) > 1e-6) result.push([ua, ub]);
  }
  return result;
}
