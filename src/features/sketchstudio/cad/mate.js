import { Quaternion, Vector3 } from 'three';
import { translateInstance, translateInstances, turnInstance, turnInstances } from './movement.js';

const unit = (v) => new Vector3(...v).normalize();

// Face-to-face mate: the smallest turn that makes the moving face's normal
// oppose the target face's normal (no spin about the normal), about `center`,
// then the shortest move along the target normal that makes the two face
// planes coincide, `offset` mm apart (positive = gap).
export function mateTransform({ movingPoint, movingNormal, targetPoint, targetNormal, center, offset = 0 }) {
  const nA = unit(movingNormal),
    nB = unit(targetNormal);
  if (!(nA.lengthSq() > 0.5) || !(nB.lengthSq() > 0.5)) throw new Error('Mate faces need valid normals.');
  const quaternion = new Quaternion().setFromUnitVectors(nA, nB.clone().negate());
  const pivot = new Vector3(...center);
  const turned = new Vector3(...movingPoint).sub(pivot).applyQuaternion(quaternion).add(pivot);
  const distance = new Vector3(...targetPoint).dot(nB) + Number(offset || 0) - turned.dot(nB);
  return {
    quaternion: quaternion.toArray(),
    angle: (2 * Math.acos(Math.min(1, Math.abs(quaternion.w))) * 180) / Math.PI,
    translation: nB
      .clone()
      .multiplyScalar(distance)
      .toArray()
      .map((v) => (Math.abs(v) < 1e-12 ? 0 : v)),
  };
}

// Apply a mate to an instance, always starting from its pose before the mate
// (`base`), so changing the offset re-applies instead of accumulating.
export function mateInstance(model, { instanceId, base, moving, target, center, offset = 0 }, parameters = {}) {
  if (!model.instances.some((i) => i.id === instanceId)) throw new Error('The moving part no longer exists.');
  const reset = {
    ...model,
    instances: model.instances.map((i) =>
      i.id === instanceId ? { ...i, position: [...base.position], rotation: [...base.rotation] } : i,
    ),
  };
  const result = mateTransform({
    movingPoint: moving.point,
    movingNormal: moving.normal,
    targetPoint: target.point,
    targetNormal: target.normal,
    center,
    offset,
  });
  const turned = result.angle > 1e-9 ? turnInstance(reset, instanceId, result.quaternion, center, parameters) : reset;
  return translateInstance(turned, instanceId, result.translation);
}

// A group mated as one body (docs/sketch-studio-part-groups.md §3.6): every
// rigid mover reset to its pose before the mate (`bases`, id → { position,
// rotation }), then the same turn about `center` and translation, so the
// members keep their relative poses. mateTransform is unchanged.
export function mateNodes(model, { movers, bases, moving, target, center, offset = 0 }, parameters = {}) {
  if (!movers?.length || movers.some((id) => !model.instances.some((i) => i.id === id)))
    throw new Error('The moving group no longer exists.');
  const reset = {
    ...model,
    instances: model.instances.map((i) =>
      bases[i.id] ? { ...i, position: [...bases[i.id].position], rotation: [...bases[i.id].rotation] } : i,
    ),
  };
  const result = mateTransform({
    movingPoint: moving.point,
    movingNormal: moving.normal,
    targetPoint: target.point,
    targetNormal: target.normal,
    center,
    offset,
  });
  const turned = result.angle > 1e-9 ? turnInstances(reset, movers, result.quaternion, center, parameters) : reset;
  return translateInstances(turned, movers, result.translation);
}

// Line up holes (docs/sketch-studio-shop-floor.md §5.5): `pairs` of a hole
// on the moving part and the hole it lines up with, each hole its opening
// { point, normal } in world mm (normal = out of the face the opening is
// on). The first pair makes the two axes one and brings the two faces
// together: the smallest turn that sets the moving face against the target
// face, then the move that puts the openings on each other. A second pair
// takes out the spin about that axis: the turn about it that brings the
// second moving hole onto the line from the first target hole to the second
// one. The rigid motion is x → R·(x − centre) + centre + translation, with
// centre the first moving opening. `residual` (mm): how far the second
// moving hole still lies from its target (the two hole spacings differ by
// that much); `spin` the turn the second pair added (degrees).
export function lineUpHoles(pairs) {
  const [first, second] = pairs || [];
  if (!first?.moving || !first?.target) throw new Error('Pick a hole on the part, then the hole it lines up with.');
  const nA = unit(first.moving.normal),
    nB = unit(first.target.normal);
  if (!(nA.lengthSq() > 0.5) || !(nB.lengthSq() > 0.5)) throw new Error('Holes need valid face normals.');
  let quaternion = new Quaternion().setFromUnitVectors(nA, nB.clone().negate());
  const centre = new Vector3(...first.moving.point);
  const target = new Vector3(...first.target.point);
  let spin = 0,
    residual = null;
  if (second?.moving && second?.target) {
    // Relative to the first target opening, after the first pair's turn.
    const moved = new Vector3(...second.moving.point).sub(centre).applyQuaternion(quaternion);
    const wanted = new Vector3(...second.target.point).sub(target);
    const flat = (v) => v.clone().sub(nB.clone().multiplyScalar(v.dot(nB)));
    const a = flat(moved),
      b = flat(wanted);
    if (a.length() > 1e-6 && b.length() > 1e-6) {
      const angle = Math.atan2(nB.dot(a.clone().cross(b)), a.dot(b));
      quaternion = new Quaternion().setFromAxisAngle(nB, angle).multiply(quaternion);
      spin = (angle * 180) / Math.PI;
    }
    residual = new Vector3(...second.moving.point).sub(centre).applyQuaternion(quaternion).distanceTo(wanted);
  }
  const tidy = (values) => values.map((v) => (Math.abs(v) < 1e-12 ? 0 : v));
  return {
    quaternion: quaternion.toArray(),
    angle: (2 * Math.acos(Math.min(1, Math.abs(quaternion.w))) * 180) / Math.PI,
    centre: centre.toArray(),
    translation: tidy(target.clone().sub(centre).toArray()),
    spin,
    residual,
  };
}

// Apply lineUpHoles to the step's rigid movers (one body), as one move.
export function lineUpNodes(model, { movers, pairs }, parameters = {}) {
  if (!movers?.length || movers.some((id) => !model.instances.some((i) => i.id === id)))
    throw new Error('The parts to move no longer exist.');
  const result = lineUpHoles(pairs);
  const turned =
    result.angle > 1e-9 ? turnInstances(model, movers, result.quaternion, result.centre, parameters) : model;
  return {
    model: result.translation.some((v) => Math.abs(v) > 1e-9)
      ? translateInstances(turned, movers, result.translation)
      : turned,
    result,
  };
}
