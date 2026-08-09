import { sortFloors } from '@/domain/floorModels';
import { syncProjectRoofSystem } from '@/domain/roofModels';
import { syncProjectTrussSystems } from '@/domain/trussModels';
import { syncCanonicalBuilding } from '@/domain/buildingModels';
import { syncProjectWallHeights } from '@/domain/wallFit';

export const HISTORY_LIMIT = 100;

// Wall heights are fitted first: the massing, roof and truss syncs downstream
// read wall tops, so they must see the height the wall actually ends up with.
export function syncProjectStructures(project) {
  return syncCanonicalBuilding(syncProjectRoofSystem(syncProjectTrussSystems(syncProjectWallHeights(project))));
}

export function applyProjectUpdate(state, nextProject, recordHistory = true) {
  const syncedProject = syncProjectStructures(nextProject);
  // A pointer drag emits one update per frame, but it is one edit: only the
  // first mutation of a gesture records history, so undo steps back to the
  // pre-drag project instead of unwinding the drag one frame at a time.
  const gesture = state.gesture;
  const shouldRecordHistory = recordHistory && !(gesture?.active && gesture.historyRecorded);
  // History stores the PREVIOUS project by reference, not a clone. Every reducer
  // path builds `nextProject` immutably (object spread) and `syncProjectStructures`
  // returns a fresh object, so entries that share unchanged floors/roof/truss
  // sub-trees share the exact same objects — structural sharing keeps each history
  // entry cheap. Never mutate a project (or its floors/entities) in place, or
  // history entries would alias live state and undo would restore corrupted data.
  // slice(-HISTORY_LIMIT) evicts the oldest snapshot once the cap is exceeded.
  const history = shouldRecordHistory ? [...state.history, state.project].slice(-HISTORY_LIMIT) : state.history;

  return {
    ...state,
    history,
    future: recordHistory ? [] : state.future,
    gesture: shouldRecordHistory && gesture?.active ? { ...gesture, historyRecorded: true } : gesture,
    project: syncedProject,
    changeVersion: state.changeVersion + 1,
    isDirty: state.changeVersion + 1 !== state.savedVersion,
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

export function updateCeilings(state, updater, recordHistory = true) {
  const nextCeilings = updater(state.project.ceilings || []);
  return applyProjectUpdate(
    state,
    {
      ...state.project,
      updatedAt: new Date().toISOString(),
      ceilings: nextCeilings,
    },
    recordHistory,
  );
}
