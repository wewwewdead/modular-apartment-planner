import { Euler, Matrix4, Quaternion, Vector3, MathUtils } from 'three';
import { vector } from './model.js';

const UNIT = new Vector3(1, 1, 1);

// The kernel applies X, then Y, then Z rotations about world axes, then the
// translation — the same as a three.js 'ZYX' Euler.
export function instanceMatrix(instance, parameters = {}) {
  const rotation = vector(instance.rotation || [0, 0, 0], parameters).map(MathUtils.degToRad);
  const position = new Vector3(...vector(instance.position || [0, 0, 0], parameters));
  return new Matrix4().compose(position, new Quaternion().setFromEuler(new Euler(...rotation, 'ZYX')), UNIT);
}

// The instance's orientation: the rotation part of instanceMatrix.
export function instanceOrientation(instance, parameters = {}) {
  return new Quaternion().setFromRotationMatrix(instanceMatrix(instance, parameters));
}

// One of the instance's own axes ('X' | 'Y' | 'Z' or a vector) in world
// coordinates, so rotateInstance can turn a part about its local axis.
export function instanceAxis(instance, axis, parameters = {}) {
  const local = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[axis] || axis;
  return new Vector3(...local)
    .transformDirection(instanceMatrix(instance, parameters))
    .toArray()
    .map((v) => (Math.abs(v) < 1e-12 ? 0 : v));
}

// Compose the kernel's ordered placement operations (see placement.js).
export function placementMatrix(operations = []) {
  const result = new Matrix4();
  for (const op of operations) {
    if (op.translation) {
      result.premultiply(new Matrix4().makeTranslation(...op.translation));
      continue;
    }
    const origin = new Vector3(...(op.origin || [0, 0, 0]));
    const turn = new Matrix4().makeRotationAxis(new Vector3(...op.axis).normalize(), MathUtils.degToRad(op.angle));
    result
      .premultiply(new Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z))
      .premultiply(turn)
      .premultiply(new Matrix4().makeTranslation(origin.x, origin.y, origin.z));
  }
  return result;
}

// Keep 1e-6° precision, but snap the ~1e-6° noise that angle extraction
// produces near Y = ±90° onto the nearest 0.0001° (-89.999999 → -90).
const tidyAngle = (degrees) => {
  let value = (((degrees % 360) + 540) % 360) - 180;
  const coarse = Math.round(value * 1e4) / 1e4;
  value = Math.abs(value - coarse) < 2e-6 ? coarse : Math.round(value * 1e6) / 1e6;
  if (value === -180) return 180;
  return Math.abs(value) < 1e-6 ? 0 : value;
};

// Every orientation has two X-then-Y-then-Z angle sets. Show the simpler one
// (fewest turned axes, then smallest angles) and strip floating-point noise,
// so two flips read 0, 180, 0 rather than 180, -0.000…, 180.
export function cleanRotation(quaternion) {
  const euler = new Euler().setFromQuaternion(quaternion, 'ZYX');
  const base = [euler.x, euler.y, euler.z].map(MathUtils.radToDeg);
  const candidates = [base, [base[0] + 180, 180 - base[1], base[2] + 180]].map((angles) => angles.map(tidyAngle));
  const score = (angles) => angles.filter(Boolean).length * 1e4 + angles.reduce((sum, v) => sum + Math.abs(v), 0);
  return score(candidates[1]) < score(candidates[0]) ? candidates[1] : candidates[0];
}

// Turn an instance by a world-space rotation about a world point.
export function turnInstance(model, id, turn, center, parameters = {}) {
  const instance = model.instances.find((i) => i.id === id);
  if (!instance) throw new Error('The selected part no longer exists.');
  const quaternion = Array.isArray(turn) ? new Quaternion(...turn) : turn.clone();
  if (quaternion.lengthSq() < 1e-12) throw new Error('Rotation cannot be zero.');
  quaternion.normalize();
  const pivot = new Vector3(...vector(center, parameters));
  const rotation = vector(instance.rotation || [0, 0, 0], parameters).map(MathUtils.degToRad);
  const orientation = new Quaternion().setFromEuler(new Euler(...rotation, 'ZYX')).premultiply(quaternion);
  const position = new Vector3(...vector(instance.position || [0, 0, 0], parameters));
  const delta = position.clone().sub(pivot).applyQuaternion(quaternion).add(pivot).sub(position).toArray();
  const next = translateInstance(model, id, delta);
  return {
    ...next,
    instances: next.instances.map((i) => (i.id === id ? { ...i, rotation: cleanRotation(orientation) } : i)),
  };
}

const boundsCenter = (bounds) => {
  if (!bounds || bounds.length !== 2) throw new Error('Rebuild the selected part before turning it.');
  return new Vector3(...bounds[0])
    .add(new Vector3(...bounds[1]))
    .multiplyScalar(0.5)
    .toArray();
};

// Turn an instance about a world axis through a world point.
export function rotateInstanceAbout(model, id, axis, degrees, center, parameters = {}) {
  const direction = new Vector3(...vector(axis));
  if (direction.lengthSq() < 1e-12) throw new Error('Rotation axis cannot be zero.');
  const turn = new Quaternion().setFromAxisAngle(direction.normalize(), MathUtils.degToRad(degrees));
  return turnInstance(model, id, turn, center, parameters);
}

// Turn an instance about a world axis through its bounding-box center.
export function rotateInstance(model, id, axis, degrees, bounds, parameters = {}) {
  return rotateInstanceAbout(model, id, axis, degrees, boundsCenter(bounds), parameters);
}

// A half turn about a world axis that keeps the visible center in place.
export function flipInstance(model, id, axis, bounds, parameters = {}) {
  if (!model.instances.some((i) => i.id === id)) throw new Error('The selected part no longer exists.');
  if (!bounds || bounds.length !== 2) throw new Error('Rebuild the selected part before flipping.');
  return rotateInstance(model, id, axis, 180, bounds, parameters);
}

// Flips are defined against gravity, not the camera: in an isometric view no
// model axis is horizontal on screen, so camera-relative flips looked tilted.
// Horizontal turns the part around the vertical (Z) axis; vertical turns it
// upside down about its longer horizontal extent, so it stays in its footprint.
export function flipAxis(direction, bounds) {
  if (direction === 'horizontal') return [0, 0, 1];
  const [min, max] = bounds;
  return max[0] - min[0] >= max[1] - min[1] ? [1, 0, 0] : [0, 1, 0];
}

// A drag changes an instance placement, never the reusable part definition.
// Keep parameter expressions live by adding an explicit world-space offset.
export function translateInstance(model, id, delta) {
  if (!Array.isArray(delta) || delta.length !== 3 || !delta.every(Number.isFinite))
    throw new Error('Movement requires three finite distances.');
  if (model.connections.some((c) => c.from === id && c.type !== 'weld'))
    throw new Error('This part is attached. Edit its connection or move the parent part.');
  if (!model.instances.some((i) => i.id === id)) throw new Error('The selected part no longer exists.');
  return {
    ...model,
    instances: model.instances.map((instance) => {
      if (instance.id !== id) return instance;
      return {
        ...instance,
        position: (instance.position || [0, 0, 0]).map((value, axis) => {
          const distance = Math.round(delta[axis] * 1e6) / 1e6;
          if (!distance) return value;
          return typeof value === 'number'
            ? Math.round((value + distance) * 1e6) / 1e6
            : `=(${String(value).replace(/^=/, '')})+(${distance})`;
        }),
      };
    }),
  };
}
