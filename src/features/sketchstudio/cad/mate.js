import { Quaternion, Vector3 } from 'three';
import { translateInstance, turnInstance } from './movement.js';

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
