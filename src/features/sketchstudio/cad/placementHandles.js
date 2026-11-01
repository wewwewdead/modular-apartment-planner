// Direct-placement handle maths (Phase H): pure functions on plain arrays, so
// the same numbers drive the viewport's live ghost and the workspace's draft.
// A ray is { origin: [x, y, z], direction: [x, y, z] } in world millimetres.

// Screen tolerances (px): a handle is grabbed within HANDLE_PICK_PX of its
// drawn spot; the arrow head, slide square and grips are drawn this size.
export const HANDLE_PICK_PX = 12;
export const ARROW_HEAD_PX = 18;
export const ARROW_RADIUS_PX = 6;
export const SQUARE_PX = 7;
export const GRIP_PX = 5;
// Below this sine of the angle between the view ray and an arrow, the arrow
// points (nearly) at the viewer and is dragged by screen travel instead.
export const PARALLEL_SINE = 0.03;

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a) => Math.hypot(...a);

// Signed distance t along `dir` (unit) from `origin` of the point on that
// line nearest the ray: what an arrow handle reads under the pointer. null
// when the ray runs (nearly) along the line, where the nearest point is
// meaningless (see screenAxisValue).
export function axisDragValue(ray, origin, dir) {
  const u = dir,
    v = ray.direction;
  const w0 = sub(origin, ray.origin);
  const a = dot(u, u),
    b = dot(u, v),
    c = dot(v, v),
    d = dot(u, w0),
    e = dot(v, w0);
  const denom = a * c - b * b;
  // sin² of the angle between the two directions = denom / (a c).
  if (!(a > 0 && c > 0) || denom / (a * c) < PARALLEL_SINE * PARALLEL_SINE) return null;
  return (b * e - c * d) / denom;
}

// The fallback for an arrow seen end-on: pointer travel up the screen
// (negative dy) grows the value toward the viewer, at mmPerPixel.
// `towardViewer` is dot(dir, unit vector toward the camera).
export function screenAxisValue(start, dy, mmPerPixel, towardViewer = 1) {
  return start - dy * mmPerPixel * (towardViewer >= 0 ? 1 : -1);
}

// Where the ray meets the plane through `point` with `normal`, or null.
export function planeDragPoint(ray, point, normal) {
  const denom = dot(ray.direction, normal);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot(sub(point, ray.origin), normal) / denom;
  if (t < 0) return null;
  return add(ray.origin, scale(ray.direction, t));
}

// Round to the step (0 or `free` = as is), with -0 cleaned.
export function snapValue(value, step = 0, free = false) {
  const result = step > 0 && !free ? Math.round(value / step) * step : value;
  const tidy = Math.round(result * 1e6) / 1e6;
  return Object.is(tidy, -0) ? 0 : tidy;
}

// An extrude length keeps its sign but never reaches zero (the kernel rejects
// a zero-length extrusion): |value| ≥ min.
export function clampMagnitude(value, min = 0.1) {
  if (Math.abs(value) >= min) return value;
  return value < 0 ? -min : min;
}

// 2D distance from p to the segment ab (screen px).
export function segmentDistance2(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Arrow handle geometry on screen: the shaft from its origin to the tip
// (origin + value · dir) and the head beyond the tip. Lengths in mm.
export function arrowPoints(handle, headMm) {
  const sign = handle.value < 0 ? -1 : 1;
  const tip = add(handle.origin, scale(handle.direction, handle.value));
  const head = add(tip, scale(handle.direction, sign * headMm));
  return { tip, head, sign };
}

// The handle under the pointer: grips first, then arrow heads, then slide
// squares, then arrow shafts (away from the square at the profile centre);
// an arrow seen end-on comes last.
// handles: [{ id, kind: 'arrow' | 'square' | 'grip', origin?, direction?,
// value?, at? }]; project(point) → [x, y] canvas px; headMm(point) → the arrow
// head length in mm at that point. Returns the handle or null.
export function pickHandle(handles, pointer, project, headMm = () => 0, pickPx = HANDLE_PICK_PX) {
  const ranked = [];
  for (const handle of handles || []) {
    if (handle.kind === 'grip' || handle.kind === 'square') {
      const [x, y] = project(handle.at);
      const d = Math.hypot(x - pointer[0], y - pointer[1]);
      if (d <= pickPx) ranked.push({ handle, rank: handle.kind === 'grip' ? 0 : 2, d });
    } else if (handle.kind === 'arrow') {
      const { tip, head } = arrowPoints(handle, headMm(handle.origin));
      const st = project(tip),
        sh = project(head),
        so = project(handle.origin);
      const dHead = segmentDistance2(pointer, st, sh);
      // An arrow seen end-on (pointing at the viewer) sits on the square:
      // the square wins there; the arrow is still dragged by screen travel.
      const endOn = Math.hypot(sh[0] - so[0], sh[1] - so[1]) < pickPx;
      if (dHead <= pickPx) {
        ranked.push({ handle, rank: endOn ? 4 : 1, d: dHead });
        continue;
      }
      // The shaft, but not within a square's reach of its origin.
      const dShaft = segmentDistance2(pointer, so, st);
      const fromOrigin = Math.hypot(pointer[0] - so[0], pointer[1] - so[1]);
      if (dShaft <= pickPx / 2 && fromOrigin > pickPx) ranked.push({ handle, rank: 3, d: dShaft });
    }
  }
  ranked.sort((p, q) => p.rank - q.rank || p.d - q.d);
  return ranked[0]?.handle || null;
}

// The world segment nearest the pointer within snapPx on screen (Revolve's
// axis pick). segments: [[a, b], …] world; returns { a, b, distance } | null.
export function nearestSegment(segments, pointer, project, snapPx = 8) {
  let best = null;
  for (const [a, b] of segments) {
    const d = segmentDistance2(pointer, project(a), project(b));
    if (d <= snapPx && (!best || d < best.distance)) best = { a, b, distance: d };
  }
  return best;
}

// Round a world point to the grid of a plane frame ({ origin, x, y, normal }):
// its (u, v) rounded to `step`, kept on the plane.
export function gridPoint(point, frame, step) {
  if (!(step > 0)) return [...point];
  const d = sub(point, frame.origin);
  const u = Math.round(dot(d, frame.x) / step) * step,
    v = Math.round(dot(d, frame.y) / step) * step;
  return [0, 1, 2].map((i) => frame.origin[i] + u * frame.x[i] + v * frame.y[i]);
}

// A world point dropped square onto a plane.
export function projectToPlane(point, origin, normal) {
  return sub(point, scale(normal, dot(sub(point, origin), normal)));
}

export const distance3 = (a, b) => length(sub(a, b));
