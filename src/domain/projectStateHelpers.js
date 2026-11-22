import { sortFloors } from '@/domain/floorModels';
import { getProjectRoofs } from '@/domain/projectRoofs';
import { syncProjectRoofSystems } from '@/domain/roofModels';
import { syncProjectTrussSystems } from '@/domain/trussModels';
import { syncCanonicalBuilding } from '@/domain/buildingModels';
import { syncProjectWallHeights } from '@/domain/wallFit';

export const HISTORY_LIMIT = 100;

// Wall heights are fitted first: the massing, roof and truss syncs downstream
// read wall tops, so they must see the height the wall actually ends up with.
export function syncProjectStructures(project) {
  return syncCanonicalBuilding(syncProjectRoofSystems(syncProjectTrussSystems(syncProjectWallHeights(project))));
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

/**
 * Replaces the project's roof list with what `updater` makes of it. An updater
 * that hands the list back untouched is no edit: the state is returned as it
 * was, with no history entry (a refused ROOF_CREATE, say).
 */
export function updateRoofSystems(state, updater, recordHistory = true) {
  const roofSystems = getProjectRoofs(state.project);
  const nextRoofSystems = updater(roofSystems);
  if (nextRoofSystems === roofSystems) return state;
  return applyProjectUpdate(
    state,
    {
      ...state.project,
      updatedAt: new Date().toISOString(),
      roofSystems: nextRoofSystems,
    },
    recordHistory,
  );
}

/**
 * Updates the one roof `roofId` names; the other roofs keep their identity.
 * No such roof, or an updater that returns the roof it was given, leaves the
 * state as it was.
 */
export function updateRoofSystem(state, roofId, updater, recordHistory = true) {
  return updateRoofSystems(
    state,
    (roofSystems) => {
      const index = roofSystems.findIndex((roofSystem) => roofSystem.id === roofId);
      if (index === -1) return roofSystems;
      const nextRoofSystem = updater(roofSystems[index]);
      if (nextRoofSystem === roofSystems[index]) return roofSystems;
      return roofSystems.map((roofSystem, roofIndex) => (roofIndex === index ? nextRoofSystem : roofSystem));
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
