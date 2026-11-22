/**
 * Where a project's roofs live (docs/multi-roof.md §3.1).
 *
 * A project holds a list of roofs, one per truss system at most, in
 * `project.roofSystems`. This module is the only place that knows that: every
 * reader asks it, so the storage can move again without a sweep through the
 * app. It imports nothing from the roof or truss modules on purpose — both of
 * them import it, and `roofModels` → `truss/roofAttachment` → `trussModels`
 * already forms a chain a back-edge would turn into a cycle.
 *
 * Functions elsewhere that take ONE roof keep their `roofSystem` parameter; only
 * the project-level lookup lives here.
 */

const NO_ROOFS = Object.freeze([]);

// The stored collection each roof sub-object type lives in. A derived roof edge
// that was never stored is in none of them and has no owner; callers that act
// on one pass the roof id instead.
const ROOF_COLLECTION_BY_TYPE = Object.freeze({
  parapet: 'parapets',
  drain: 'drains',
  roofOpening: 'roofOpenings',
  roofPlane: 'roofPlanes',
  roofEdge: 'roofEdges',
});

/**
 * Every roof in the project, in stored order. The stored array itself (so the
 * syncs can reuse it by identity), or one shared frozen empty list when the
 * project has none stored.
 */
export function getProjectRoofs(project) {
  const roofs = project?.roofSystems;
  return Array.isArray(roofs) ? roofs : NO_ROOFS;
}

export function getProjectRoof(project, roofId) {
  if (!roofId) return null;
  return getProjectRoofs(project).find((roofSystem) => roofSystem?.id === roofId) || null;
}

/** The roof attached to that truss system, or null. At most one roof claims a system (§3.2). */
export function getRoofForTrussSystem(project, trussSystemId) {
  if (!trussSystemId) return null;
  return getProjectRoofs(project).find((roofSystem) => roofSystem?.trussAttachmentId === trussSystemId) || null;
}

/**
 * The roof that is, or stores, that object. `objectType` is one of
 * `roofSystem | parapet | drain | roofOpening | roofPlane | roofEdge`.
 */
export function findRoofOwner(project, objectType, objectId) {
  if (!objectId) return null;
  if (objectType === 'roofSystem') return getProjectRoof(project, objectId);
  const collection = ROOF_COLLECTION_BY_TYPE[objectType];
  if (!collection) return null;
  return (
    getProjectRoofs(project).find((roofSystem) =>
      (roofSystem?.[collection] || []).some((entry) => entry?.id === objectId),
    ) || null
  );
}

/**
 * The storey a roof belongs to (docs/multi-roof.md §5.5): the floor its truss
 * system stands on, or `fallbackFloorId` — the caller's top floor — for a
 * detached roof, or one whose system or floor is not in this project (a phase
 * view can filter the system out). The 3D preview shows the roof with that
 * floor, and the inspector reports it there, so the two must ask this one rule.
 */
export function getRoofFloorId(project, roofSystem, fallbackFloorId = null) {
  const trussAttachmentId = roofSystem?.trussAttachmentId;
  const floorId = trussAttachmentId
    ? (project?.trussSystems || []).find((trussSystem) => trussSystem?.id === trussAttachmentId)?.floorId
    : null;
  if (floorId && (project?.floors || []).some((floor) => floor?.id === floorId)) return floorId;
  return fallbackFloorId;
}

/**
 * The roof the roof workspace edits: the active one, else the first, else null.
 * A stale id (the roof was deleted, undone away, or belongs to another project)
 * falls through to the first roof, so nothing has to clean it up.
 */
export function resolveActiveRoof(project, activeRoofId) {
  return getProjectRoof(project, activeRoofId) || getProjectRoofs(project)[0] || null;
}
