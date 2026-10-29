// Dial-style rotation for the rotate gizmo rings. TransformControls turns a
// ring by how far the pointer travels along the ring's tangent at the grab
// point, scaled by camera distance: the part does not follow the cursor
// around the ring and the speed changes with zoom. Here the angle is the one
// the cursor sweeps about the pivot, measured in the ring's own plane, so
// the grabbed point of the ring stays under the cursor. Plain numbers in and
// out, so it is testable without a renderer.
import { Quaternion, Vector3 } from 'three';

// |axis · eye| below this means the ring is seen nearly edge-on (a thin
// ellipse or a line); its screen angle is then too sensitive to use.
export const EDGE_ON = 0.15;
// A cursor this close (px) to the projected pivot has no usable angle.
export const DEADZONE_PX = 4;
// The rotate gizmo's on-screen size (TransformControls.setSize); the move
// gizmo keeps its own 0.85.
export const RING_SIZE = 1;

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;

// Into (-π, π]: the shortest way between two successive cursor angles.
export function wrapAngle(radians) {
  let a = radians % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

// Right-handed basis of the ring plane (u, v, axis). u = axis × eye is the
// ring's widest on-screen direction and the way the ring's front point (the
// one nearest the viewer) moves under a positive turn; v = axis × u points
// away from the viewer. When the ring faces the camera squarely any
// perpendicular u works.
export function ringBasis(axis, eye) {
  const a = new Vector3(...axis).normalize();
  const e = new Vector3(...eye).normalize();
  const u = a.clone().cross(e);
  if (u.lengthSq() < 1e-12) u.copy(a).cross(Math.abs(a.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0));
  u.normalize();
  const v = a.clone().cross(u);
  return { axis: a, u, v, facing: a.dot(e) };
}

// World radius of the TransformControls rotate rings at a point; mirrors the
// handle scale in TransformControlsGizmo.updateMatrixWorld (ring torus radius
// 0.5, scaled by factor · size / 4).
export function gizmoRingRadius(camera, point, size = RING_SIZE) {
  let factor;
  if (camera.isOrthographicCamera) factor = (camera.top - camera.bottom) / camera.zoom;
  else {
    const distance = new Vector3(...point).distanceTo(camera.position);
    factor = distance * Math.min((1.9 * Math.tan((Math.PI * camera.fov) / 360)) / camera.zoom, 7);
  }
  return (0.5 * factor * size) / 4;
}

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];

/**
 * Start a dial drag.
 * @param {object} options
 * @param {number[]} options.pivot   World pivot [x, y, z].
 * @param {number[]} options.pointer Grab point, screen px [x, y] (y down).
 * @param {number[]} options.axis    World ring axis.
 * @param {number[]} options.eye     Unit vector from the pivot toward the
 *   viewer (orthographic: the reversed view direction).
 * @param {number}   options.radius  Ring radius in world units.
 * @param {(p: number[]) => number[]} options.project World point → screen px.
 *
 * The ring plane is mapped to the screen by projecting the basis u, v one
 * ring radius out from the pivot: an affine map that is exact for an
 * orthographic camera and a secant fit to the ring for a perspective one.
 * Its inverse turns the cursor back into ring-plane coordinates, so an
 * oblique ring (an ellipse on screen) still tracks the cursor. The map's
 * orientation (the sign of its determinant, which is the sign of axis · eye)
 * is what makes a ring whose axis points away from the viewer turn the
 * other way for the same on-screen circling.
 */
export function startDial({ pivot, pointer, axis, eye, radius, project }) {
  const { axis: a, u, v, facing } = ringBasis(axis, eye);
  const center = new Vector3(...pivot);
  const P = project(center.toArray());
  const image = (direction) => {
    const q = project(center.clone().addScaledVector(direction, radius).toArray());
    return [(q[0] - P[0]) / radius, (q[1] - P[1]) / radius]; // px per world unit
  };
  const Mu = image(u),
    Mv = image(v);
  const det = Mu[0] * Mv[1] - Mu[1] * Mv[0];
  const uPx = Math.hypot(...Mu);
  const usable = Number.isFinite(det) && radius > 0 && uPx > 1e-9;
  const mode = !usable ? 'none' : Math.abs(facing) < EDGE_ON || Math.abs(det) < 1e-12 ? 'edge' : 'dial';
  // Ring-plane angle of a screen point (from u toward v is positive).
  const planeAngle = (screen) => {
    const [dx, dy] = sub(screen, P);
    return Math.atan2((-Mu[1] * dx + Mu[0] * dy) / det, (Mv[1] * dx - Mv[0] * dy) / det);
  };
  const outside = (screen) => Math.hypot(...sub(screen, P)) >= DEADZONE_PX;
  let startAngle = null,
    last = null,
    accumulated = 0,
    lastPointer = pointer;
  if (mode === 'dial' && outside(pointer)) startAngle = last = planeAngle(pointer);
  if (mode === 'edge') {
    // Assume the front half of the ring was grabbed (the gizmo picks the
    // nearest hit): how far along the projected line, then the near side.
    const along = Math.max(-1, Math.min(1, dot(sub(pointer, P), Mu) / (uPx * uPx * radius)));
    startAngle = Math.atan2(-Math.sqrt(1 - along * along), along);
  }
  const direction = (angle) => u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));

  function evaluate({ snap = 0, free = false } = {}) {
    const degrees = accumulated * DEG;
    const step = !free && snap > 0 ? snap : 0;
    const snapped = (step ? Math.round(degrees / step) * step : degrees) || 0; // no -0
    const from = startAngle == null ? null : direction(startAngle);
    return {
      mode,
      degrees,
      snapped,
      free: !step,
      // The turn by the applied angle (any multiple of 360° is the same turn;
      // the HUD reads it back near `snapped`, see rotationReadout).
      quaternion: new Quaternion().setFromAxisAngle(a, snapped / DEG).toArray(),
      // Unit ring-plane directions (world) of the grab and of the grab turned
      // by the applied angle, for drawing the swept sector.
      start: from?.toArray() || null,
      current: from ? from.applyAxisAngle(a, snapped / DEG).toArray() : null,
    };
  }

  return {
    mode,
    facing,
    axis: a.toArray(),
    basis: { u: u.toArray(), v: v.toArray() },
    /** Feed the cursor (screen px). Returns the turn so far. */
    update(screen, options) {
      lastPointer = screen;
      if (mode === 'edge') {
        // Arc length: pointer travel along the projected line over the
        // ring's on-screen radius. Zoom-independent, and equal to the dial
        // at the ring's front point to first order.
        accumulated = dot(sub(screen, pointer), Mu) / (uPx * uPx * radius);
      } else if (mode === 'dial' && outside(screen)) {
        const angle = planeAngle(screen);
        if (last == null) startAngle = last = angle;
        // Unwrapped: keep counting past ±180° instead of flipping sign.
        accumulated += wrapAngle(angle - last);
        last = angle;
      }
      return evaluate(options);
    },
    /** Re-evaluate at the last cursor, e.g. when Alt is pressed or released. */
    refresh(options) {
      return this.update(lastPointer, options);
    },
  };
}

// Leave the rotate gizmo with its three axis rings only: drop the screen
// ring ('E') and the free trackball ('XYZE'), whose turns are not about a
// model axis. Hover picks from picker.rotate regardless of visibility, so
// the handles are removed rather than hidden. Returns the names removed;
// tolerates a stand-in gizmo without those groups (tests).
export function ringHandlesOnly(transform) {
  const gizmo = transform?._gizmo || transform?.getHelper?.().children?.find((c) => c.isTransformControlsGizmo);
  const removed = [];
  for (const group of [gizmo?.gizmo?.rotate, gizmo?.picker?.rotate, gizmo?.helper?.rotate]) {
    for (const handle of [...(group?.children || [])]) {
      if (handle.name !== 'E' && handle.name !== 'XYZE') continue;
      group.remove(handle);
      // Geometry is per handle; materials are shared with other handles.
      handle.geometry?.dispose();
      removed.push(handle.name);
    }
  }
  return removed;
}

// The world turn a drag applied: the pivot started at `attach` (identity in
// World space, the part's orientation in Local space) and is now `pivot`, so
// turn = pivot · attach⁻¹. Quaternions are [x, y, z, w] arrays.
export function worldTurn(pivot, attach) {
  return new Quaternion(...pivot).multiply(new Quaternion(...attach).invert()).toArray();
}

// A turn given about the part's own axes (e.g. a typed angle about local X)
// as the world turn turnInstance expects: attach · local · attach⁻¹.
export function localToWorldTurn(local, attach) {
  const q = new Quaternion(...attach);
  return q
    .clone()
    .multiply(new Quaternion(...local))
    .multiply(q.invert())
    .toArray();
}

// The reverse: a world turn expressed in the part's own axes, for the readout.
export function worldToLocalTurn(turn, attach) {
  const q = new Quaternion(...attach);
  return q
    .clone()
    .invert()
    .multiply(new Quaternion(...turn))
    .multiply(q)
    .toArray();
}
