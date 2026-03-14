import { PHASE_ASSIGNABLE_KEYS } from './phaseAssignments';

export const PHASE_VIEW = {
  ALL: 'all',
  SINGLE: 'single',
  CUMULATIVE: 'cumulative',
};

export function isObjectVisibleInPhase(obj, phases, activePhaseId, phaseViewMode) {
  if (obj.phaseId) {
    const objPhase = phases.find(p => p.id === obj.phaseId);
    if (objPhase && objPhase.visible === false) return false;
  }
  if (phaseViewMode === PHASE_VIEW.ALL) return true;
  if (!obj.phaseId) return true;
  if (!activePhaseId) return true;

  if (phaseViewMode === PHASE_VIEW.SINGLE) {
    return obj.phaseId === activePhaseId;
  }

  if (phaseViewMode === PHASE_VIEW.CUMULATIVE) {
    const activePhase = phases.find(p => p.id === activePhaseId);
    const objPhase = phases.find(p => p.id === obj.phaseId);
    if (!activePhase || !objPhase) return true;
    return objPhase.order <= activePhase.order;
  }

  return true;
}

export function filterFloorByPhase(floor, phases, activePhaseId, phaseViewMode) {
  if (!floor) return floor;
  const hasHiddenPhases = phases.some(p => p.visible === false);
  if (phaseViewMode === PHASE_VIEW.ALL && !hasHiddenPhases) return floor;
  if (!activePhaseId && !hasHiddenPhases) return floor;

  const isVisible = (obj) => isObjectVisibleInPhase(obj, phases, activePhaseId, phaseViewMode);

  const filtered = { ...floor };

  for (const key of PHASE_ASSIGNABLE_KEYS) {
    const arr = floor[key];
    if (!arr) continue;
    filtered[key] = arr.filter(isVisible);
  }

  // Also filter doors/windows whose parent wall was filtered out
  const visibleWallIds = new Set((filtered.walls || []).map((wall) => wall.id));
  filtered.doors = (filtered.doors || []).filter((door) => visibleWallIds.has(door.wallId));
  filtered.windows = (filtered.windows || []).filter((windowItem) => visibleWallIds.has(windowItem.wallId));

  return filtered;
}

export function filterProjectByPhase(project, activePhaseId, phaseViewMode) {
  if (!project) return project;
  const phases = project.phases || [];
  const hasHiddenPhases = phases.some(p => p.visible === false);
  if (phaseViewMode === PHASE_VIEW.ALL && !hasHiddenPhases) return project;
  if (!activePhaseId && !hasHiddenPhases) return project;

  const roofSystem = project.roofSystem && isObjectVisibleInPhase(
    project.roofSystem,
    phases,
    activePhaseId,
    phaseViewMode
  )
    ? project.roofSystem
    : null;
  const trussSystems = (project.trussSystems || []).filter((trussSystem) => (
    isObjectVisibleInPhase(trussSystem, phases, activePhaseId, phaseViewMode)
  ));

  return {
    ...project,
    floors: project.floors.map(floor => filterFloorByPhase(floor, phases, activePhaseId, phaseViewMode)),
    roofSystem,
    trussSystems,
  };
}
