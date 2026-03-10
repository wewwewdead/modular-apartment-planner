import { createContext, useContext, useReducer } from 'react';
import { createProject } from '@/domain/models';
import { createDuplicatedFloor, getDefaultFloorName, getFloorElevation, getFloorLevelIndex, shiftFloorAbsoluteElements, shiftFloorElevationData, sortFloors } from '@/domain/floorModels';
import { detachColumnAttachments, syncWallAttachmentPoints } from '@/geometry/wallColumnGeometry';
import { syncStairLandingAttachment } from '@/geometry/landingGeometry';
import { clampWallOpeningOffset, wallLength } from '@/geometry/wallGeometry';

const ProjectContext = createContext(null);
const HISTORY_LIMIT = 100;

function snapshotProject(project) {
  return JSON.stringify(project);
}

function applyProjectUpdate(state, nextProject, recordHistory = true) {
  const nextSnapshot = snapshotProject(nextProject);
  const history = recordHistory
    ? [...state.history, state.project].slice(-HISTORY_LIMIT)
    : state.history;

  return {
    ...state,
    history,
    future: recordHistory ? [] : state.future,
    project: nextProject,
    isDirty: nextSnapshot !== state.savedSnapshot,
  };
}

function updateFloor(state, floorId, updater, recordHistory = true, options = {}) {
  const nextFloors = state.project.floors.map((floor) => (
    floor.id === floorId ? updater(floor) : floor
  ));

  return applyProjectUpdate(state, {
    ...state.project,
    updatedAt: new Date().toISOString(),
    floors: options.sort ? sortFloors(nextFloors) : nextFloors,
  }, recordHistory);
}

function replaceFloors(state, floors, recordHistory = true) {
  return applyProjectUpdate(state, {
    ...state.project,
    updatedAt: new Date().toISOString(),
    floors: sortFloors(floors),
  }, recordHistory);
}

function replaceDeletedFloorReferences(project, deletedFloorId, fallbackFloorId) {
  return {
    ...project,
    floors: project.floors.map((floor) => ({
      ...floor,
      stairs: (floor.stairs || []).map((stair) => ({
        ...stair,
        floorRelation: {
          fromFloorId: stair.floorRelation?.fromFloorId === deletedFloorId
            ? fallbackFloorId
            : (stair.floorRelation?.fromFloorId ?? floor.id),
          toFloorId: stair.floorRelation?.toFloorId === deletedFloorId
            ? fallbackFloorId
            : (stair.floorRelation?.toFloorId ?? floor.id),
        },
      })),
    })),
    sheets: (project.sheets || []).map((sheet) => ({
      ...sheet,
      viewports: (sheet.viewports || []).map((viewport) => ({
        ...viewport,
        sourceFloorId: viewport.sourceFloorId === deletedFloorId
          ? fallbackFloorId
          : viewport.sourceFloorId,
        sourceRefId: viewport.sourceFloorId === deletedFloorId
          ? null
          : viewport.sourceRefId,
      })),
    })),
  };
}

function mergeWallUpdate(existingWall, wallUpdate, columns = []) {
  const nextWall = { ...existingWall, ...wallUpdate };

  if ('start' in wallUpdate && !('startAttachment' in wallUpdate)) {
    nextWall.startAttachment = null;
  }
  if ('end' in wallUpdate && !('endAttachment' in wallUpdate)) {
    nextWall.endAttachment = null;
  }

  return syncWallAttachmentPoints(nextWall, columns);
}

function clampWallMountedOpenings(openings, wallId, nextWallLength) {
  return openings.map((opening) => {
    if (opening.wallId !== wallId) return opening;

    const nextOffset = clampWallOpeningOffset(nextWallLength, opening.width, opening.offset);
    return nextOffset === opening.offset ? opening : { ...opening, offset: nextOffset };
  });
}

function projectReducer(state, action) {
  switch (action.type) {
    case 'PROJECT_NEW': {
      const newProject = {
        ...action.project,
        floors: sortFloors(action.project.floors || []),
      };
      return {
        project: newProject,
        isDirty: false,
        lastSavedAt: null,
        savedSnapshot: snapshotProject(newProject),
        history: [],
        future: [],
      };
    }

    case 'PROJECT_LOAD': {
      const loadedProject = {
        ...action.project,
        floors: sortFloors(action.project.floors || []),
      };
      return {
        project: loadedProject,
        isDirty: false,
        lastSavedAt: action.savedAt || null,
        savedSnapshot: snapshotProject(loadedProject),
        history: [],
        future: [],
      };
    }

    case 'PROJECT_SET_NAME':
      return applyProjectUpdate(state, {
        ...state.project,
        name: action.name,
        updatedAt: new Date().toISOString(),
      });

    case 'PROJECT_UPDATE':
      return applyProjectUpdate(state, {
        ...state.project,
        ...action.updates,
        updatedAt: new Date().toISOString(),
      });

    case 'FLOOR_ADD':
      return replaceFloors(state, [...state.project.floors, action.floor]);

    case 'FLOOR_UPDATE':
      return updateFloor(state, action.floor.id, (floor) => {
        const mergedFloor = {
          ...floor,
          ...action.floor,
        };
        const nextElevation = getFloorElevation(mergedFloor);
        const deltaElevation = nextElevation - getFloorElevation(floor);
        return {
          ...shiftFloorAbsoluteElements({
            ...mergedFloor,
            elevation: getFloorElevation(floor),
          }, deltaElevation),
          elevation: nextElevation,
        };
      }, true, { sort: true });

    case 'FLOOR_DUPLICATE': {
      const duplicatedFloor = action.floor;
      const elevationShift = duplicatedFloor.floorToFloorHeight ?? 0;
      const insertionLevelIndex = getFloorLevelIndex(duplicatedFloor);

      const shiftedFloors = state.project.floors.map((floor) => {
        if (getFloorLevelIndex(floor) < insertionLevelIndex) return floor;

        const previousLevelIndex = getFloorLevelIndex(floor);
        return shiftFloorElevationData({
          ...floor,
          name: floor.name === getDefaultFloorName(previousLevelIndex)
            ? getDefaultFloorName(previousLevelIndex + 1)
            : floor.name,
          levelIndex: previousLevelIndex + 1,
        }, elevationShift);
      });

      return replaceFloors(state, [...shiftedFloors, duplicatedFloor]);
    }

    case 'FLOOR_DELETE': {
      if (state.project.floors.length <= 1) return state;

      const nextProject = replaceDeletedFloorReferences(
        {
          ...state.project,
          floors: state.project.floors.filter((floor) => floor.id !== action.floorId),
        },
        action.floorId,
        action.fallbackFloorId
      );

      return applyProjectUpdate(state, {
        ...nextProject,
        updatedAt: new Date().toISOString(),
        floors: sortFloors(nextProject.floors),
      });
    }

    case 'SHEET_ADD':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: [...(state.project.sheets || []), action.sheet],
      });

    case 'SHEET_UPDATE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) => (
          sheet.id === action.sheet.id ? { ...sheet, ...action.sheet } : sheet
        )),
      });

    case 'SHEET_DELETE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).filter((sheet) => sheet.id !== action.sheetId),
      });

    case 'SHEET_VIEWPORT_ADD':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) => (
          sheet.id === action.sheetId
            ? { ...sheet, viewports: [...(sheet.viewports || []), action.viewport] }
            : sheet
        )),
      });

    case 'SHEET_VIEWPORT_UPDATE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) => (
          sheet.id === action.sheetId
            ? {
                ...sheet,
                viewports: (sheet.viewports || []).map((viewport) => (
                  viewport.id === action.viewport.id ? { ...viewport, ...action.viewport } : viewport
                )),
              }
            : sheet
        )),
      });

    case 'SHEET_VIEWPORT_DELETE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) => (
          sheet.id === action.sheetId
            ? {
                ...sheet,
                viewports: (sheet.viewports || []).filter((viewport) => viewport.id !== action.viewportId),
              }
            : sheet
        )),
      });

    case 'WALL_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        walls: [...f.walls, syncWallAttachmentPoints(action.wall, f.columns || [])],
      }));

    case 'WALL_UPDATE':
      return updateFloor(state, action.floorId, f => {
        let updatedWall = null;
        const walls = f.walls.map((wall) => {
          if (wall.id !== action.wall.id) return wall;

          updatedWall = mergeWallUpdate(wall, action.wall, f.columns || []);
          return updatedWall;
        });

        if (!updatedWall) {
          return f;
        }

        const nextWallLength = wallLength(updatedWall);

        return {
          ...f,
          walls,
          doors: clampWallMountedOpenings(f.doors, updatedWall.id, nextWallLength),
          windows: clampWallMountedOpenings(f.windows, updatedWall.id, nextWallLength),
        };
      });

    case 'WALL_DELETE': {
      const wallId = action.wallId;
      return updateFloor(state, action.floorId, f => ({
        ...f,
        walls: f.walls.filter(w => w.id !== wallId),
        doors: f.doors.filter(d => d.wallId !== wallId),
        windows: f.windows.filter(w => w.wallId !== wallId),
      }));
    }

    case 'DOOR_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        doors: [...f.doors, action.door],
      }));

    case 'DOOR_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        doors: f.doors.map(d => d.id === action.door.id ? { ...d, ...action.door } : d),
      }));

    case 'DOOR_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        doors: f.doors.filter(d => d.id !== action.doorId),
      }));

    case 'WINDOW_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        windows: [...f.windows, action.window],
      }));

    case 'WINDOW_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        windows: f.windows.map(w => w.id === action.window.id ? { ...w, ...action.window } : w),
      }));

    case 'WINDOW_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        windows: f.windows.filter(w => w.id !== action.windowId),
      }));

    case 'BEAM_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        beams: [...(f.beams || []), action.beam],
      }));

    case 'BEAM_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        beams: (f.beams || []).map(beam => (
          beam.id === action.beam.id ? { ...beam, ...action.beam } : beam
        )),
      }));

    case 'BEAM_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        beams: (f.beams || []).filter(beam => beam.id !== action.beamId),
      }));

    case 'STAIR_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        stairs: [...(f.stairs || []), action.stair],
      }));

    case 'STAIR_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        stairs: (f.stairs || []).map(stair => (
          stair.id === action.stair.id ? { ...stair, ...action.stair } : stair
        )),
      }));

    case 'STAIR_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        stairs: (f.stairs || []).filter(stair => stair.id !== action.stairId),
      }));

    case 'LANDING_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        landings: [...(f.landings || []), action.landing],
      }));

    case 'LANDING_UPDATE': {
      return updateFloor(state, action.floorId, f => {
        const nextLandings = (f.landings || []).map(l =>
          l.id === action.landing.id ? { ...l, ...action.landing } : l
        );
        // Cascade: sync all stairs attached to this landing
        const nextStairs = (f.stairs || []).map(stair => {
          const attachedToStart = stair.startLandingAttachment?.landingId === action.landing.id;
          const attachedToEnd = stair.endLandingAttachment?.landingId === action.landing.id;
          if (!attachedToStart && !attachedToEnd) return stair;
          return syncStairLandingAttachment(stair, nextLandings);
        });
        return { ...f, landings: nextLandings, stairs: nextStairs };
      });
    }

    case 'LANDING_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        landings: (f.landings || []).filter(l => l.id !== action.landingId),
        stairs: (f.stairs || []).map(stair => {
          let next = stair;
          if (stair.startLandingAttachment?.landingId === action.landingId) {
            next = { ...next, startLandingAttachment: null };
          }
          if (stair.endLandingAttachment?.landingId === action.landingId) {
            next = { ...next, endLandingAttachment: null };
          }
          return next;
        }),
      }));

    case 'ANNOTATION_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        annotations: [...(f.annotations || []), action.annotation],
      }));

    case 'ANNOTATION_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        annotations: (f.annotations || []).map((annotation) => (
          annotation.id === action.annotation.id ? { ...annotation, ...action.annotation } : annotation
        )),
      }));

    case 'ANNOTATION_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        annotations: (f.annotations || []).filter((annotation) => annotation.id !== action.annotationId),
      }));

    case 'ANNOTATION_SETTINGS_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        annotationSettings: {
          ...(f.annotationSettings || {}),
          ...action.settings,
        },
      }));

    case 'SLAB_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        slabs: [...(f.slabs || []), action.slab],
      }));

    case 'SLAB_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        slabs: (f.slabs || []).map(s =>
          s.id === action.slab.id ? { ...s, ...action.slab } : s
        ),
      }));

    case 'SLAB_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        slabs: (f.slabs || []).filter(s => s.id !== action.slabId),
      }));

    case 'RAILING_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        railings: [...(f.railings || []), action.railing],
      }));

    case 'RAILING_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        railings: (f.railings || []).map(r =>
          r.id === action.railing.id ? { ...r, ...action.railing } : r
        ),
      }));

    case 'RAILING_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        railings: (f.railings || []).filter(r => r.id !== action.railingId),
      }));

    case 'SECTION_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        sectionCuts: [...(f.sectionCuts || []), action.sectionCut],
      }));

    case 'SECTION_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        sectionCuts: (f.sectionCuts || []).map(s =>
          s.id === action.sectionCut.id ? { ...s, ...action.sectionCut } : s
        ),
      }));

    case 'SECTION_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        sectionCuts: (f.sectionCuts || []).filter(s => s.id !== action.sectionId),
      }));

    case 'ROOM_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        rooms: [...f.rooms, action.room],
      }));

    case 'ROOM_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        rooms: f.rooms.map(r => r.id === action.room.id ? { ...r, ...action.room } : r),
      }));

    case 'ROOM_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        rooms: f.rooms.filter(r => r.id !== action.roomId),
      }));

    case 'ROOMS_SET':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        rooms: action.rooms,
      }));

    case 'FLOOR_REPLACE':
      return updateFloor(state, action.floorId, () => ({
        ...action.floor,
      }), true, { sort: true });

    case 'FIXTURE_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f, fixtures: [...(f.fixtures || []), action.fixture],
      }));
    case 'FIXTURE_UPDATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        fixtures: (f.fixtures || []).map(fix =>
          fix.id === action.fixture.id ? { ...fix, ...action.fixture } : fix
        ),
      }));
    case 'FIXTURE_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        fixtures: (f.fixtures || []).filter(fix => fix.id !== action.fixtureId),
      }));

    case 'COLUMN_ADD':
      return updateFloor(state, action.floorId, f => ({
        ...f, columns: [...(f.columns || []), action.column],
      }));
    case 'COLUMN_DUPLICATE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        columns: [...(f.columns || []), action.column],
      }));
    case 'COLUMN_UPDATE':
      return updateFloor(state, action.floorId, f => {
        const nextColumns = (f.columns || []).map(c => (
          c.id === action.column.id ? { ...c, ...action.column } : c
        ));
        return {
          ...f,
          columns: nextColumns,
          walls: f.walls.map(w => syncWallAttachmentPoints(w, nextColumns)),
        };
      });
    case 'COLUMN_DELETE':
      return updateFloor(state, action.floorId, f => ({
        ...f,
        columns: (f.columns || []).filter(c => c.id !== action.columnId),
        walls: f.walls.map(w => detachColumnAttachments(w, f.columns || [], action.columnId)),
        beams: (f.beams || []).filter(beam => (
          beam.startRef?.id !== action.columnId && beam.endRef?.id !== action.columnId
        )),
      }));

    case 'MARK_SAVED':
      return {
        ...state,
        isDirty: false,
        lastSavedAt: new Date().toISOString(),
        savedSnapshot: snapshotProject(state.project),
      };

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const previousProject = state.history[state.history.length - 1];
      return {
        ...state,
        project: previousProject,
        history: state.history.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
        isDirty: snapshotProject(previousProject) !== state.savedSnapshot,
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const nextProject = state.future[0];
      return {
        ...state,
        project: nextProject,
        history: [...state.history, state.project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        isDirty: snapshotProject(nextProject) !== state.savedSnapshot,
      };
    }

    default:
      return state;
  }
}

const initialProject = createProject();

const initialState = {
  project: initialProject,
  isDirty: false,
  lastSavedAt: null,
  savedSnapshot: snapshotProject(initialProject),
  history: [],
  future: [],
};

export function ProjectProvider({ children }) {
  const [state, dispatch] = useReducer(projectReducer, initialState);
  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  const { state, dispatch } = ctx;

  const duplicateFloor = (floorId) => {
    const floor = state.project.floors.find((entry) => entry.id === floorId) || null;
    return floor ? createDuplicatedFloor(floor) : null;
  };

  return {
    project: state.project,
    isDirty: state.isDirty,
    lastSavedAt: state.lastSavedAt,
    canUndo: state.history.length > 0,
    canRedo: state.future.length > 0,
    dispatch,
    duplicateFloor,
    getFloor: (floorId) => state.project.floors.find(f => f.id === floorId),
  };
}
