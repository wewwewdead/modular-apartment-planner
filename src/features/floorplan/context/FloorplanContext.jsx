import { createContext, useContext, useMemo } from 'react';
import { createDuplicatedFloor } from '@/domain/floorModels';
import useFloorplan from '../hooks/useFloorplan';

const FloorplanContext = createContext(null);

export function FloorplanProvider({ children, initialProject, isPlayground = false }) {
  const floorplan = useFloorplan({ initialProject, isPlayground });
  return <FloorplanContext.Provider value={floorplan}>{children}</FloorplanContext.Provider>;
}

export function useFloorplanContext() {
  const context = useContext(FloorplanContext);
  if (!context) {
    throw new Error('useFloorplanContext must be used within FloorplanProvider');
  }
  return context;
}

export function useProject() {
  const floorplan = useFloorplanContext();
  const { state, dispatch, selectors } = floorplan;

  return useMemo(
    () => ({
      project: state.project,
      floors: state.floors,
      rooms: state.rooms,
      walls: state.walls,
      phases: state.phases,
      entities: state.entities,
      isDirty: state.isDirty,
      lastSavedAt: state.lastSavedAt,
      canUndo: state.history.length > 0,
      canRedo: state.future.length > 0,
      dispatch,
      duplicateFloor: (floorId) => {
        const floor = state.project.floors.find((entry) => entry.id === floorId) || null;
        return floor ? createDuplicatedFloor(floor) : null;
      },
      getFloor: selectors.getFloor,
    }),
    [
      dispatch,
      selectors.getFloor,
      state.entities,
      state.floors,
      state.future.length,
      state.history.length,
      state.isDirty,
      state.lastSavedAt,
      state.phases,
      state.project,
      state.rooms,
      state.walls,
    ],
  );
}

export function useEditor() {
  const floorplan = useFloorplanContext();
  const { state, dispatch } = floorplan;

  return useMemo(
    () => ({
      ...state.editor,
      dispatch,
    }),
    [dispatch, state.editor],
  );
}
