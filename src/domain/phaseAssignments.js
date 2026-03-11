export const PHASE_ASSIGNABLE_KEYS = [
  'walls', 'doors', 'windows', 'columns', 'beams', 'slabs',
  'stairs', 'landings', 'fixtures', 'rooms', 'railings',
];

export function mapPhaseAssignableFloorObjects(floor, mapper) {
  const nextFloor = { ...floor };

  for (const key of PHASE_ASSIGNABLE_KEYS) {
    const objects = floor[key];
    if (!Array.isArray(objects)) continue;
    nextFloor[key] = objects.map((obj) => mapper(obj, { key, floor }));
  }

  return nextFloor;
}

export function countObjectsInProjectPhase(project, phaseId) {
  let count = 0;

  for (const floor of project.floors || []) {
    for (const key of PHASE_ASSIGNABLE_KEYS) {
      for (const obj of floor[key] || []) {
        if (obj.phaseId === phaseId) count++;
      }
    }
  }

  return count;
}

export function clearProjectPhaseReferences(project, phaseId) {
  return {
    ...project,
    floors: (project.floors || []).map((floor) => (
      mapPhaseAssignableFloorObjects(floor, (obj) => (
        obj.phaseId === phaseId ? { ...obj, phaseId: null } : obj
      ))
    )),
    sheets: (project.sheets || []).map((sheet) => ({
      ...sheet,
      viewports: (sheet.viewports || []).map((viewport) => (
        viewport.phaseId === phaseId
          ? { ...viewport, phaseId: null, phaseViewMode: 'all' }
          : viewport
      )),
    })),
  };
}

export function sanitizeProjectPhaseReferences(project, validPhaseIds) {
  return {
    ...project,
    floors: (project.floors || []).map((floor) => (
      mapPhaseAssignableFloorObjects(floor, (obj) => (
        obj.phaseId == null || validPhaseIds.has(obj.phaseId)
          ? obj
          : { ...obj, phaseId: null }
      ))
    )),
    sheets: (project.sheets || []).map((sheet) => ({
      ...sheet,
      viewports: (sheet.viewports || []).map((viewport) => (
        viewport.phaseId == null || validPhaseIds.has(viewport.phaseId)
          ? viewport
          : { ...viewport, phaseId: null, phaseViewMode: 'all' }
      )),
    })),
  };
}
