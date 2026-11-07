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
