import {
  getDefaultActiveFloorId,
  getDefaultFloorName,
  getFloorElevation,
  getFloorLevelIndex,
  shiftFloorAbsoluteElements,
  shiftFloorElevationData,
  sortFloors,
} from '@/domain/floorModels';
import { clearProjectPhaseReferences } from '@/domain/phaseAssignments';
import { sortPhases } from '@/domain/phaseModels';
import { getRoofAttachmentElevation } from '@/domain/roofModels';
import { DEFAULT_ZOOM } from '@/domain/defaults';
import { syncWallAttachmentPoints } from '@/geometry/wallColumnGeometry';
import {
  HISTORY_LIMIT,
  applyProjectUpdate,
  replaceFloors,
  syncProjectStructures,
  updateFloor,
  updateRoofSystem,
  updateTrussSystems,
} from '@/domain/projectStateHelpers';
import {
  applyColumnDelete,
  applyColumnUpdate,
  applyLandingDelete,
  applyLandingUpdate,
  applyWallUpdate,
  clearStairRoofAccessReferences,
  replaceDeletedFloorReferences,
} from '@/domain/projectCommands';

function normalizeViewMode(viewMode) {
  if (viewMode === 'elevation_side') return 'elevation_left';
  return viewMode;
}

function getInitialModelViewport() {
  return { panX: 400, panY: 300, zoom: DEFAULT_ZOOM };
}

function getInitialSheetViewport() {
  return { panX: 120, panY: 80, zoom: 2 };
}

function clearSelectionState(editorState) {
  return {
    ...editorState,
    selectedId: null,
    selectedType: null,
    regionSelection: null,
    pastePreview: { active: false, point: null },
  };
}

function mergeIfChanged(target, patch) {
  const nextState = { ...target };
  let hasChange = false;

  for (const [key, value] of Object.entries(patch)) {
    if (nextState[key] !== value) {
      nextState[key] = value;
      hasChange = true;
    }
  }

  return hasChange ? nextState : target;
}

function createInitialEditorState(activeFloorId = null) {
  const modelViewport = getInitialModelViewport();
  const sheetViewport = getInitialSheetViewport();

  return {
    activeTool: 'select',
    modelTarget: 'floor',
    selectedId: null,
    selectedType: null,
    toolState: {},
    workspaceMode: 'model',
    viewport: { ...modelViewport },
    modelViewport,
    sheetViewport,
    showGrid: true,
    snapEnabled: true,
    viewMode: 'plan',
    activeFloorId,
    activeSheetId: null,
    activeSectionCutId: null,
    statusMessage: null,
    regionSelection: null,
    pastePreview: { active: false, point: null },
    maximizedPanel: null,
    activePhaseId: null,
    phaseViewMode: 'all',
  };
}

function buildEntityCollections(project, activeFloorId) {
  const floors = project?.floors || [];
  const activeFloor = floors.find((floor) => floor.id === activeFloorId) || null;

  return {
    floor: activeFloor,
    floors,
    rooms: activeFloor?.rooms || [],
    walls: activeFloor?.walls || [],
    doors: activeFloor?.doors || [],
    windows: activeFloor?.windows || [],
    columns: activeFloor?.columns || [],
    beams: activeFloor?.beams || [],
    stairs: activeFloor?.stairs || [],
    landings: activeFloor?.landings || [],
    fixtures: activeFloor?.fixtures || [],
    annotations: activeFloor?.annotations || [],
    slabs: activeFloor?.slabs || [],
    sectionCuts: activeFloor?.sectionCuts || [],
    railings: activeFloor?.railings || [],
    roofSystem: project?.roofSystem || null,
    roofPlanes: project?.roofSystem?.roofPlanes || [],
    roofEdges: project?.roofSystem?.roofEdges || [],
    parapets: project?.roofSystem?.parapets || [],
    drains: project?.roofSystem?.drains || [],
    roofOpenings: project?.roofSystem?.roofOpenings || [],
    sheets: project?.sheets || [],
    phases: project?.phases || [],
    trussSystems: (project?.trussSystems || []).filter((trussSystem) => trussSystem.floorId === activeFloorId),
  };
}

function syncFloorplanState(state) {
  const floors = state.project?.floors || [];
  const phases = state.project?.phases || [];
  const entities = buildEntityCollections(state.project, state.editor?.activeFloorId || null);

  return {
    ...state,
    floors,
    rooms: entities.rooms,
    walls: entities.walls,
    phases,
    entities,
    viewport: state.editor.viewport,
    selection: {
      selectedId: state.editor.selectedId,
      selectedType: state.editor.selectedType,
      regionSelection: state.editor.regionSelection,
      pastePreview: state.editor.pastePreview,
    },
  };
}

export function initializeFloorplanState(initialProject) {
  const syncedProject = syncProjectStructures({
    ...initialProject,
    floors: sortFloors(initialProject?.floors || []),
  });

  return syncFloorplanState({
    project: syncedProject,
    editor: createInitialEditorState(getDefaultActiveFloorId(syncedProject)),
    isDirty: false,
    lastSavedAt: null,
    changeVersion: 0,
    savedVersion: 0,
    history: [],
    future: [],
  });
}

function reduceProjectState(state, action) {
  switch (action.type) {
    case 'PROJECT_NEW': {
      const newProject = syncProjectStructures({
        ...action.project,
        floors: sortFloors(action.project.floors || []),
      });

      return {
        ...state,
        project: newProject,
        isDirty: false,
        lastSavedAt: null,
        changeVersion: 0,
        savedVersion: 0,
        history: [],
        future: [],
      };
    }

    case 'PROJECT_LOAD': {
      const loadedProject = syncProjectStructures({
        ...action.project,
        floors: sortFloors(action.project.floors || []),
      });

      return {
        ...state,
        project: loadedProject,
        isDirty: false,
        lastSavedAt: action.savedAt || null,
        changeVersion: 0,
        savedVersion: 0,
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

    case 'ROOF_CREATE':
      return updateRoofSystem(state, () => action.roofSystem);

    case 'ROOF_UPDATE':
      return updateRoofSystem(state, (roofSystem) => {
        if (!roofSystem || roofSystem.id !== action.roofSystem.id) return roofSystem;

        const mergedRoofSystem = { ...roofSystem, ...action.roofSystem };
        const trussAttachmentChanged =
          Object.prototype.hasOwnProperty.call(action.roofSystem, 'trussAttachmentId') &&
          (action.roofSystem.trussAttachmentId || null) !== (roofSystem.trussAttachmentId || null);

        if (trussAttachmentChanged && !Object.prototype.hasOwnProperty.call(action.roofSystem, 'baseElevation')) {
          const attachmentBaseElevation = getRoofAttachmentElevation(state.project, mergedRoofSystem);
          mergedRoofSystem.attachmentOffset = mergedRoofSystem.trussAttachmentId
            ? 0
            : (roofSystem.baseElevation ?? attachmentBaseElevation) - attachmentBaseElevation;
          if (!Object.prototype.hasOwnProperty.call(action.roofSystem, 'pitchSource')) {
            mergedRoofSystem.pitchSource = mergedRoofSystem.trussAttachmentId ? 'truss' : 'manual';
          }
        }

        if ('baseElevation' in action.roofSystem) {
          const attachmentBaseElevation = getRoofAttachmentElevation(state.project, mergedRoofSystem);
          mergedRoofSystem.attachmentOffset =
            (action.roofSystem.baseElevation ?? roofSystem.baseElevation) - attachmentBaseElevation;
        }

        if (
          Object.prototype.hasOwnProperty.call(action.roofSystem, 'pitch') &&
          mergedRoofSystem.trussAttachmentId &&
          !Object.prototype.hasOwnProperty.call(action.roofSystem, 'pitchSource') &&
          Number(action.roofSystem.pitch?.slope ?? roofSystem.pitch?.slope) !== Number(roofSystem.pitch?.slope)
        ) {
          mergedRoofSystem.pitchSource = 'manual';
        }

        return mergedRoofSystem;
      });

    case 'ROOF_DELETE':
      return applyProjectUpdate(state, {
        ...clearStairRoofAccessReferences(state.project),
        updatedAt: new Date().toISOString(),
        roofSystem: null,
      });

    case 'TRUSS_SYSTEM_ADD':
      return updateTrussSystems(state, (trussSystems) => [...trussSystems, action.trussSystem]);

    case 'TRUSS_SYSTEM_UPDATE':
      return updateTrussSystems(state, (trussSystems) =>
        trussSystems.map((trussSystem) => {
          if (trussSystem.id !== action.trussSystem.id) return trussSystem;

          const nextFloorId = action.trussSystem.floorId ?? trussSystem.floorId;
          return {
            ...trussSystem,
            ...action.trussSystem,
            trussInstances: (action.trussSystem.trussInstances || trussSystem.trussInstances || []).map(
              (trussInstance) => ({ ...trussInstance, floorId: nextFloorId }),
            ),
          };
        }),
      );

    case 'TRUSS_SYSTEM_DELETE':
      return updateTrussSystems(state, (trussSystems) =>
        trussSystems.filter((trussSystem) => trussSystem.id !== action.trussSystemId),
      );

    case 'TRUSS_INSTANCE_ADD':
      return updateTrussSystems(state, (trussSystems) =>
        trussSystems.map((trussSystem) =>
          trussSystem.id === action.trussSystemId
            ? { ...trussSystem, trussInstances: [...(trussSystem.trussInstances || []), action.trussInstance] }
            : trussSystem,
        ),
      );

    case 'TRUSS_INSTANCE_UPDATE':
      return updateTrussSystems(state, (trussSystems) =>
        trussSystems.map((trussSystem) =>
          trussSystem.id === action.trussSystemId
            ? {
                ...trussSystem,
                trussInstances: (trussSystem.trussInstances || []).map((trussInstance) =>
                  trussInstance.id === action.trussInstance.id
                    ? { ...trussInstance, ...action.trussInstance, floorId: trussSystem.floorId }
                    : trussInstance,
                ),
              }
            : trussSystem,
        ),
      );

    case 'TRUSS_INSTANCE_DELETE':
      return updateTrussSystems(state, (trussSystems) =>
        trussSystems.map((trussSystem) =>
          trussSystem.id === action.trussSystemId
            ? {
                ...trussSystem,
                trussInstances: (trussSystem.trussInstances || []).filter(
                  (trussInstance) => trussInstance.id !== action.trussInstanceId,
                ),
              }
            : trussSystem,
        ),
      );

    case 'PARAPET_ADD':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem ? { ...roofSystem, parapets: [...(roofSystem.parapets || []), action.parapet] } : roofSystem,
      );

    case 'PARAPET_UPDATE':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? {
              ...roofSystem,
              parapets: (roofSystem.parapets || []).map((parapet) =>
                parapet.id === action.parapet.id ? { ...parapet, ...action.parapet } : parapet,
              ),
            }
          : roofSystem,
      );

    case 'PARAPET_DELETE':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? {
              ...roofSystem,
              parapets: (roofSystem.parapets || []).filter((parapet) => parapet.id !== action.parapetId),
            }
          : roofSystem,
      );

    case 'DRAIN_ADD':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem ? { ...roofSystem, drains: [...(roofSystem.drains || []), action.drain] } : roofSystem,
      );

    case 'DRAIN_UPDATE':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? {
              ...roofSystem,
              drains: (roofSystem.drains || []).map((drain) =>
                drain.id === action.drain.id ? { ...drain, ...action.drain } : drain,
              ),
            }
          : roofSystem,
      );

    case 'DRAIN_DELETE':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? { ...roofSystem, drains: (roofSystem.drains || []).filter((drain) => drain.id !== action.drainId) }
          : roofSystem,
      );

    case 'ROOF_OPENING_ADD':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? { ...roofSystem, roofOpenings: [...(roofSystem.roofOpenings || []), action.roofOpening] }
          : roofSystem,
      );

    case 'ROOF_OPENING_UPDATE':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? {
              ...roofSystem,
              roofOpenings: (roofSystem.roofOpenings || []).map((roofOpening) =>
                roofOpening.id === action.roofOpening.id ? { ...roofOpening, ...action.roofOpening } : roofOpening,
              ),
            }
          : roofSystem,
      );

    case 'ROOF_OPENING_DELETE':
      return applyProjectUpdate(
        state,
        clearStairRoofAccessReferences(
          {
            ...state.project,
            updatedAt: new Date().toISOString(),
            roofSystem: state.project.roofSystem
              ? {
                  ...state.project.roofSystem,
                  roofOpenings: (state.project.roofSystem.roofOpenings || []).filter(
                    (roofOpening) => roofOpening.id !== action.roofOpeningId,
                  ),
                }
              : null,
          },
          action.roofOpeningId,
        ),
      );

    case 'ROOF_PLANE_ADD':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem ? { ...roofSystem, roofPlanes: [...(roofSystem.roofPlanes || []), action.roofPlane] } : roofSystem,
      );

    case 'ROOF_PLANE_UPDATE':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? {
              ...roofSystem,
              roofPlanes: (roofSystem.roofPlanes || []).map((roofPlane) =>
                roofPlane.id === action.roofPlane.id ? { ...roofPlane, ...action.roofPlane } : roofPlane,
              ),
            }
          : roofSystem,
      );

    case 'ROOF_PLANE_DELETE':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? {
              ...roofSystem,
              roofPlanes: (roofSystem.roofPlanes || []).filter((roofPlane) => roofPlane.id !== action.roofPlaneId),
              roofEdges: (roofSystem.roofEdges || []).filter(
                (roofEdge) => !(roofEdge.planeIds || []).includes(action.roofPlaneId),
              ),
            }
          : roofSystem,
      );

    case 'ROOF_EDGE_UPDATE':
      return updateRoofSystem(state, (roofSystem) => {
        if (!roofSystem) return roofSystem;

        const existingEdges = roofSystem.roofEdges || [];
        const existingIndex = existingEdges.findIndex(
          (roofEdge) =>
            roofEdge.id === action.roofEdge.id ||
            (action.roofEdge.geometryKey && roofEdge.geometryKey === action.roofEdge.geometryKey),
        );

        if (existingIndex === -1) {
          return { ...roofSystem, roofEdges: [...existingEdges, action.roofEdge] };
        }

        return {
          ...roofSystem,
          roofEdges: existingEdges.map((roofEdge, index) =>
            index === existingIndex ? { ...roofEdge, ...action.roofEdge } : roofEdge,
          ),
        };
      });

    case 'ROOF_EDGE_DELETE':
      return updateRoofSystem(state, (roofSystem) =>
        roofSystem
          ? {
              ...roofSystem,
              roofEdges: (roofSystem.roofEdges || []).filter(
                (roofEdge) =>
                  roofEdge.id !== action.roofEdgeId &&
                  (action.geometryKey ? roofEdge.geometryKey !== action.geometryKey : true),
              ),
            }
          : roofSystem,
      );

    case 'FLOOR_ADD':
      return replaceFloors(state, [...state.project.floors, action.floor]);

    case 'FLOOR_UPDATE':
      return applyProjectUpdate(
        state,
        (() => {
          let elevationDelta = 0;
          const nextFloors = state.project.floors.map((floor) => {
            if (floor.id !== action.floor.id) return floor;

            const mergedFloor = { ...floor, ...action.floor };
            const nextElevation = getFloorElevation(mergedFloor);
            elevationDelta = nextElevation - getFloorElevation(floor);
            return {
              ...shiftFloorAbsoluteElements({ ...mergedFloor, elevation: getFloorElevation(floor) }, elevationDelta),
              elevation: nextElevation,
            };
          });

          const nextTrussSystems = (state.project.trussSystems || []).map((trussSystem) =>
            trussSystem.floorId === action.floor.id
              ? { ...trussSystem, baseElevation: (trussSystem.baseElevation ?? 0) + elevationDelta }
              : trussSystem,
          );

          return {
            ...state.project,
            updatedAt: new Date().toISOString(),
            floors: sortFloors(nextFloors),
            trussSystems: nextTrussSystems,
          };
        })(),
      );

    case 'FLOOR_DUPLICATE': {
      const duplicatedFloor = action.floor;
      const elevationShift = duplicatedFloor.floorToFloorHeight ?? 0;
      const insertionLevelIndex = getFloorLevelIndex(duplicatedFloor);

      const shiftedFloors = state.project.floors.map((floor) => {
        if (getFloorLevelIndex(floor) < insertionLevelIndex) return floor;

        const previousLevelIndex = getFloorLevelIndex(floor);
        return shiftFloorElevationData(
          {
            ...floor,
            name:
              floor.name === getDefaultFloorName(previousLevelIndex)
                ? getDefaultFloorName(previousLevelIndex + 1)
                : floor.name,
            levelIndex: previousLevelIndex + 1,
          },
          elevationShift,
        );
      });

      return replaceFloors(state, [...shiftedFloors, duplicatedFloor]);
    }

    case 'FLOOR_DELETE': {
      if (state.project.floors.length <= 1) return state;

      const nextProject = replaceDeletedFloorReferences(
        {
          ...state.project,
          floors: state.project.floors.filter((floor) => floor.id !== action.floorId),
          trussSystems: (state.project.trussSystems || []).filter(
            (trussSystem) => trussSystem.floorId !== action.floorId,
          ),
        },
        action.floorId,
        action.fallbackFloorId,
      );

      return applyProjectUpdate(state, {
        ...nextProject,
        updatedAt: new Date().toISOString(),
        floors: sortFloors(nextProject.floors),
      });
    }

    case 'FLOOR_REPLACE':
      return updateFloor(state, action.floorId, () => ({ ...action.floor }), true, { sort: true });

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
        sheets: (state.project.sheets || []).map((sheet) =>
          sheet.id === action.sheet.id ? { ...sheet, ...action.sheet } : sheet,
        ),
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
        sheets: (state.project.sheets || []).map((sheet) =>
          sheet.id === action.sheetId ? { ...sheet, viewports: [...(sheet.viewports || []), action.viewport] } : sheet,
        ),
      });

    case 'SHEET_VIEWPORT_UPDATE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) =>
          sheet.id === action.sheetId
            ? {
                ...sheet,
                viewports: (sheet.viewports || []).map((viewport) =>
                  viewport.id === action.viewport.id ? { ...viewport, ...action.viewport } : viewport,
                ),
              }
            : sheet,
        ),
      });

    case 'SHEET_VIEWPORT_DELETE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) =>
          sheet.id === action.sheetId
            ? {
                ...sheet,
                viewports: (sheet.viewports || []).filter((viewport) => viewport.id !== action.viewportId),
              }
            : sheet,
        ),
      });

    case 'WALL_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        walls: [...floor.walls, syncWallAttachmentPoints(action.wall, floor.columns || [])],
      }));

    case 'WALL_UPDATE':
      return updateFloor(state, action.floorId, (floor) => applyWallUpdate(floor, action.wall, floor.columns || []));

    case 'WALL_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        walls: floor.walls.filter((wall) => wall.id !== action.wallId),
        doors: floor.doors.filter((door) => door.wallId !== action.wallId),
        windows: floor.windows.filter((windowItem) => windowItem.wallId !== action.wallId),
      }));

    case 'FILLET_APPLY':
      return updateFloor(state, action.floorId, (floor) => {
        const walls = floor.walls.map((wall) => {
          if (wall.id === action.wall1Id) return { ...wall, [action.wall1Endpoint]: { ...action.tangentPoint1 } };
          if (wall.id === action.wall2Id) return { ...wall, [action.wall2Endpoint]: { ...action.tangentPoint2 } };
          return wall;
        });

        return { ...floor, walls: [...walls, action.arcWall] };
      });

    case 'FILLET_REMOVE':
      return updateFloor(state, action.floorId, (floor) => {
        const arcWall = floor.walls.find((wall) => wall.id === action.arcWallId);
        if (!arcWall || !arcWall.controlPoint) return floor;

        const originalCorner = arcWall.controlPoint;
        const walls = floor.walls
          .filter((wall) => wall.id !== action.arcWallId)
          .map((wall) => {
            if (wall.id === action.wall1Id) return { ...wall, [action.wall1Endpoint]: { ...originalCorner } };
            if (wall.id === action.wall2Id) return { ...wall, [action.wall2Endpoint]: { ...originalCorner } };
            return wall;
          });

        return { ...floor, walls };
      });

    case 'DOOR_ADD':
      return updateFloor(state, action.floorId, (floor) => ({ ...floor, doors: [...floor.doors, action.door] }));

    case 'DOOR_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        doors: floor.doors.map((door) => (door.id === action.door.id ? { ...door, ...action.door } : door)),
      }));

    case 'DOOR_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        doors: floor.doors.filter((door) => door.id !== action.doorId),
      }));

    case 'WINDOW_ADD':
      return updateFloor(state, action.floorId, (floor) => ({ ...floor, windows: [...floor.windows, action.window] }));

    case 'WINDOW_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        windows: floor.windows.map((windowItem) =>
          windowItem.id === action.window.id ? { ...windowItem, ...action.window } : windowItem,
        ),
      }));

    case 'WINDOW_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        windows: floor.windows.filter((windowItem) => windowItem.id !== action.windowId),
      }));

    case 'BEAM_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        beams: [...(floor.beams || []), action.beam],
      }));

    case 'BEAM_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        beams: (floor.beams || []).map((beam) => (beam.id === action.beam.id ? { ...beam, ...action.beam } : beam)),
      }));

    case 'BEAM_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        beams: (floor.beams || []).filter((beam) => beam.id !== action.beamId),
      }));

    case 'STAIR_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        stairs: [...(floor.stairs || []), action.stair],
      }));

    case 'STAIR_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        stairs: (floor.stairs || []).map((stair) =>
          stair.id === action.stair.id ? { ...stair, ...action.stair } : stair,
        ),
      }));

    case 'STAIR_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        stairs: (floor.stairs || []).filter((stair) => stair.id !== action.stairId),
      }));

    case 'LANDING_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        landings: [...(floor.landings || []), action.landing],
      }));

    case 'LANDING_UPDATE':
      return updateFloor(state, action.floorId, (floor) => applyLandingUpdate(floor, action.landing));

    case 'LANDING_DELETE':
      return updateFloor(state, action.floorId, (floor) => applyLandingDelete(floor, action.landingId));

    case 'COLUMN_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        columns: [...(floor.columns || []), action.column],
      }));

    case 'COLUMN_DUPLICATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        columns: [...(floor.columns || []), action.column],
      }));

    case 'COLUMN_UPDATE':
      return updateFloor(state, action.floorId, (floor) => applyColumnUpdate(floor, action.column));

    case 'COLUMN_DELETE':
      return updateFloor(state, action.floorId, (floor) => applyColumnDelete(floor, action.columnId));

    case 'ANNOTATION_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        annotations: [...(floor.annotations || []), action.annotation],
      }));

    case 'ANNOTATION_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        annotations: (floor.annotations || []).map((annotation) =>
          annotation.id === action.annotation.id ? { ...annotation, ...action.annotation } : annotation,
        ),
      }));

    case 'ANNOTATION_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        annotations: (floor.annotations || []).filter((annotation) => annotation.id !== action.annotationId),
      }));

    case 'ANNOTATION_SETTINGS_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        annotationSettings: { ...(floor.annotationSettings || {}), ...action.settings },
      }));

    case 'SLAB_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        slabs: [...(floor.slabs || []), action.slab],
      }));

    case 'SLAB_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        slabs: (floor.slabs || []).map((slab) => (slab.id === action.slab.id ? { ...slab, ...action.slab } : slab)),
      }));

    case 'SLAB_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        slabs: (floor.slabs || []).filter((slab) => slab.id !== action.slabId),
      }));

    case 'RAILING_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        railings: [...(floor.railings || []), action.railing],
      }));

    case 'RAILING_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        railings: (floor.railings || []).map((railing) =>
          railing.id === action.railing.id ? { ...railing, ...action.railing } : railing,
        ),
      }));

    case 'RAILING_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        railings: (floor.railings || []).filter((railing) => railing.id !== action.railingId),
      }));

    case 'SECTION_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        sectionCuts: [...(floor.sectionCuts || []), action.sectionCut],
      }));

    case 'SECTION_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        sectionCuts: (floor.sectionCuts || []).map((sectionCut) =>
          sectionCut.id === action.sectionCut.id ? { ...sectionCut, ...action.sectionCut } : sectionCut,
        ),
      }));

    case 'SECTION_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        sectionCuts: (floor.sectionCuts || []).filter((sectionCut) => sectionCut.id !== action.sectionId),
      }));

    case 'ROOM_ADD':
      return updateFloor(state, action.floorId, (floor) => ({ ...floor, rooms: [...floor.rooms, action.room] }));

    case 'ROOM_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        rooms: floor.rooms.map((room) => (room.id === action.room.id ? { ...room, ...action.room } : room)),
      }));

    case 'ROOM_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        rooms: floor.rooms.filter((room) => room.id !== action.roomId),
      }));

    case 'ROOMS_SET':
      return updateFloor(state, action.floorId, (floor) => ({ ...floor, rooms: action.rooms }));

    case 'FIXTURE_ADD':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        fixtures: [...(floor.fixtures || []), action.fixture],
      }));

    case 'FIXTURE_UPDATE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        fixtures: (floor.fixtures || []).map((fixture) =>
          fixture.id === action.fixture.id ? { ...fixture, ...action.fixture } : fixture,
        ),
      }));

    case 'FIXTURE_DELETE':
      return updateFloor(state, action.floorId, (floor) => ({
        ...floor,
        fixtures: (floor.fixtures || []).filter((fixture) => fixture.id !== action.fixtureId),
      }));

    case 'PHASE_ADD':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        phases: sortPhases([...(state.project.phases || []), action.phase]),
      });

    case 'PHASE_UPDATE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        phases: sortPhases(
          (state.project.phases || []).map((phase) =>
            phase.id === action.phase.id ? { ...phase, ...action.phase } : phase,
          ),
        ),
      });

    case 'PHASE_DELETE': {
      const nextProject = clearProjectPhaseReferences(state.project, action.phaseId);
      return applyProjectUpdate(state, {
        ...nextProject,
        updatedAt: new Date().toISOString(),
        phases: (state.project.phases || []).filter((phase) => phase.id !== action.phaseId),
      });
    }

    case 'PHASE_REORDER':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        phases: action.phases,
      });

    case 'MARK_SAVED':
      return {
        ...state,
        isDirty: false,
        lastSavedAt: new Date().toISOString(),
        savedVersion: state.changeVersion,
      };

    case 'UNDO': {
      if (state.history.length === 0) return state;

      const previousProject = state.history[state.history.length - 1];
      const nextVersion = state.changeVersion + 1;
      return {
        ...state,
        project: previousProject,
        history: state.history.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
        changeVersion: nextVersion,
        isDirty: nextVersion !== state.savedVersion,
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;

      const nextProject = state.future[0];
      const nextVersion = state.changeVersion + 1;
      return {
        ...state,
        project: nextProject,
        history: [...state.history, state.project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        changeVersion: nextVersion,
        isDirty: nextVersion !== state.savedVersion,
      };
    }

    default:
      return state;
  }
}

function reduceEditorState(editorState, action) {
  switch (action.type) {
    case 'SET_MODEL_TARGET':
      return {
        ...clearSelectionState(editorState),
        workspaceMode: 'model',
        modelTarget: action.modelTarget,
        activeTool: 'select',
        toolState: {},
        statusMessage: null,
      };

    case 'SET_TOOL':
      return {
        ...clearSelectionState(editorState),
        activeTool: action.tool,
        toolState: {},
        statusMessage: null,
      };

    case 'SET_VIEW_MODE':
      return {
        ...clearSelectionState(editorState),
        workspaceMode: 'model',
        viewMode: normalizeViewMode(action.viewMode),
        activeSectionCutId: action.sectionCutId ?? editorState.activeSectionCutId,
        viewport: { ...editorState.modelViewport },
        toolState: {},
        statusMessage: null,
      };

    case 'SET_WORKSPACE_MODE':
      return {
        ...clearSelectionState(editorState),
        workspaceMode: action.workspaceMode,
        viewport:
          action.workspaceMode === 'sheet' ? { ...editorState.sheetViewport } : { ...editorState.modelViewport },
        toolState: {},
        statusMessage: null,
      };

    case 'SET_ACTIVE_SHEET':
      return {
        ...clearSelectionState(editorState),
        activeSheetId: action.sheetId,
        statusMessage: null,
      };

    case 'SELECT_OBJECT':
      return {
        ...clearSelectionState(editorState),
        selectedId: action.id,
        selectedType: action.objectType,
      };

    case 'DESELECT':
      return clearSelectionState(editorState);

    case 'SET_REGION_SELECTION':
      return {
        ...clearSelectionState(editorState),
        regionSelection:
          action.selection && action.bounds
            ? {
                bounds: action.bounds,
                selection: action.selection,
                objectCount: Object.values(action.selection).reduce((count, ids) => count + (ids?.length || 0), 0),
              }
            : null,
      };

    case 'UPDATE_TOOL_STATE': {
      const nextToolState = mergeIfChanged(editorState.toolState, action.payload);
      if (nextToolState === editorState.toolState) return editorState;

      return {
        ...editorState,
        toolState: nextToolState,
      };
    }

    case 'SET_VIEWPORT':
      return {
        ...editorState,
        modelViewport: editorState.workspaceMode === 'model' ? { ...action.viewport } : editorState.modelViewport,
        sheetViewport: editorState.workspaceMode === 'sheet' ? { ...action.viewport } : editorState.sheetViewport,
        viewport: { ...action.viewport },
      };

    case 'PAN':
      return {
        ...editorState,
        modelViewport:
          editorState.workspaceMode === 'model'
            ? {
                ...editorState.modelViewport,
                panX: editorState.modelViewport.panX + action.dx,
                panY: editorState.modelViewport.panY + action.dy,
              }
            : editorState.modelViewport,
        sheetViewport:
          editorState.workspaceMode === 'sheet'
            ? {
                ...editorState.sheetViewport,
                panX: editorState.sheetViewport.panX + action.dx,
                panY: editorState.sheetViewport.panY + action.dy,
              }
            : editorState.sheetViewport,
        viewport: {
          ...editorState.viewport,
          panX: editorState.viewport.panX + action.dx,
          panY: editorState.viewport.panY + action.dy,
        },
      };

    case 'ZOOM': {
      const { zoom, panX, panY } = action;
      return {
        ...editorState,
        modelViewport: editorState.workspaceMode === 'model' ? { zoom, panX, panY } : editorState.modelViewport,
        sheetViewport: editorState.workspaceMode === 'sheet' ? { zoom, panX, panY } : editorState.sheetViewport,
        viewport: { zoom, panX, panY },
      };
    }

    case 'TOGGLE_GRID':
      return { ...editorState, showGrid: !editorState.showGrid };

    case 'TOGGLE_SNAP':
      return { ...editorState, snapEnabled: !editorState.snapEnabled };

    case 'SET_ACTIVE_FLOOR':
      return {
        ...clearSelectionState(editorState),
        activeFloorId: action.floorId,
        toolState: {},
        statusMessage: null,
      };

    case 'SET_STATUS_MESSAGE':
      if (editorState.statusMessage === action.message) return editorState;
      return { ...editorState, statusMessage: action.message };

    case 'CLEAR_STATUS_MESSAGE':
      if (!editorState.statusMessage) return editorState;
      return { ...editorState, statusMessage: null };

    case 'START_PASTE_PREVIEW':
      return {
        ...editorState,
        selectedId: null,
        selectedType: null,
        regionSelection: null,
        pastePreview: {
          active: true,
          point: action.point ?? null,
        },
      };

    case 'UPDATE_PASTE_PREVIEW':
      if (!editorState.pastePreview?.active) return editorState;
      return {
        ...editorState,
        pastePreview: {
          active: true,
          point: action.point,
        },
      };

    case 'CANCEL_PASTE_PREVIEW':
      if (!editorState.pastePreview?.active) return editorState;
      return {
        ...editorState,
        pastePreview: {
          active: false,
          point: null,
        },
      };

    case 'TOGGLE_MAXIMIZE_PANEL':
      return {
        ...editorState,
        maximizedPanel: editorState.maximizedPanel === action.panel ? null : action.panel,
      };

    case 'SET_ACTIVE_PHASE':
      if (editorState.activePhaseId === action.phaseId) return editorState;
      return { ...editorState, activePhaseId: action.phaseId };

    case 'SET_PHASE_VIEW_MODE':
      if (editorState.phaseViewMode === action.mode) return editorState;
      return { ...editorState, phaseViewMode: action.mode };

    default:
      return editorState;
  }
}

export default function floorplanReducer(state, action) {
  const nextProjectState = reduceProjectState(state, action);
  if (nextProjectState !== state) {
    return syncFloorplanState(nextProjectState);
  }

  const nextEditorState = reduceEditorState(state.editor, action);
  if (nextEditorState !== state.editor) {
    return syncFloorplanState({
      ...state,
      editor: nextEditorState,
    });
  }

  return state;
}

export { buildEntityCollections, createInitialEditorState, reduceEditorState, reduceProjectState, syncFloorplanState };
