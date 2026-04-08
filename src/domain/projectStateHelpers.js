import { sortFloors } from '@/domain/floorModels';
import { syncProjectRoofSystem } from '@/domain/roofModels';
import { syncProjectTrussSystems } from '@/domain/trussModels';

export const HISTORY_LIMIT = 100;

export function snapshotProject(project) {
  return JSON.stringify(project);
}

export function syncProjectStructures(project) {
  return syncProjectRoofSystem(syncProjectTrussSystems(project));
}

export function applyProjectUpdate(state, nextProject, recordHistory = true) {
  const syncedProject = syncProjectStructures(nextProject);
  const nextSnapshot = snapshotProject(syncedProject);
  const history = recordHistory ? [...state.history, state.project].slice(-HISTORY_LIMIT) : state.history;

  return {
    ...state,
    history,
    future: recordHistory ? [] : state.future,
    project: syncedProject,
    isDirty: nextSnapshot !== state.savedSnapshot,
  };
}

export function updateFloor(state, floorId, updater, recordHistory = true, options = {}) {
  const nextFloors = state.project.floors.map((floor) => (floor.id === floorId ? updater(floor) : floor));

  return applyProjectUpdate(
    state,
    {
      ...state.project,
      updatedAt: new Date().toISOString(),
      floors: options.sort ? sortFloors(nextFloors) : nextFloors,
    },
    recordHistory,
  );
}

export function replaceFloors(state, floors, recordHistory = true) {
  return applyProjectUpdate(
    state,
    {
      ...state.project,
      updatedAt: new Date().toISOString(),
      floors: sortFloors(floors),
    },
    recordHistory,
  );
}

export function updateRoofSystem(state, updater, recordHistory = true) {
  const nextRoofSystem = updater(state.project.roofSystem);
  return applyProjectUpdate(
    state,
    {
      ...state.project,
      updatedAt: new Date().toISOString(),
      roofSystem: nextRoofSystem,
    },
    recordHistory,
  );
}

export function updateTrussSystems(state, updater, recordHistory = true) {
  const nextTrussSystems = updater(state.project.trussSystems || []);
  return applyProjectUpdate(
    state,
    {
      ...state.project,
      updatedAt: new Date().toISOString(),
      trussSystems: nextTrussSystems,
    },
    recordHistory,
  );
}
