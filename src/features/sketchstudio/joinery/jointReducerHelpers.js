import { listJointEntityIds, normalizeJoint, patchJoint } from './jointSerializationUtils';

export function addJointToDocument(document, joint) {
  return {
    ...document,
    joints: [...(document.joints || []), normalizeJoint(joint)],
  };
}

export function updateJointInDocument(document, jointId, patch) {
  return {
    ...document,
    joints: (document.joints || []).map((joint) => (
      joint.id === jointId ? patchJoint(joint, patch) : joint
    )),
  };
}

export function removeJointFromDocument(document, jointId) {
  return {
    ...document,
    joints: (document.joints || []).filter((joint) => joint.id !== jointId),
  };
}

export function pruneDocumentJointsByEntityIds(document, removedEntityIds = []) {
  const removedIdSet = new Set(removedEntityIds);

  return {
    ...document,
    joints: (document.joints || []).filter((joint) => (
      !listJointEntityIds(joint).some((entityId) => removedIdSet.has(entityId))
    )),
  };
}
