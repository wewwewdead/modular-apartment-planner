import { createContext, useContext, useReducer } from 'react';
import { createProject } from '@/domain/models';
import { clearProjectPhaseReferences } from '@/domain/phaseAssignments';
import {
  createDuplicatedFloor,
  getDefaultFloorName,
  getFloorElevation,
  getFloorLevelIndex,
  shiftFloorAbsoluteElements,
  shiftFloorElevationData,
  sortFloors,
} from '@/domain/floorModels';
import { sortPhases } from '@/domain/phaseModels';
import { getRoofAttachmentElevation } from '@/domain/roofModels';
import { syncWallAttachmentPoints } from '@/geometry/wallColumnGeometry';
import {
  HISTORY_LIMIT,
  snapshotProject,
  syncProjectStructures,
  applyProjectUpdate,
  updateFloor,
  replaceFloors,
  updateRoofSystem,
  updateTrussSystems,
} from '@/domain/projectStateHelpers';
import {
  replaceDeletedFloorReferences,
  clearStairRoofAccessReferences,
  applyWallUpdate,
  applyColumnUpdate,
  applyColumnDelete,
  applyLandingUpdate,
  applyLandingDelete,
} from '@/domain/projectCommands';

const ProjectContext = createContext(null);

function projectReducer(state, action) {
  switch (action.type) {
    case 'PROJECT_NEW': {
      const newProject = syncProjectStructures({
        ...action.project,
        floors: sortFloors(action.project.floors || []),
      });
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
      const loadedProject = syncProjectStructures({
        ...action.project,
        floors: sortFloors(action.project.floors || []),
      });
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

    // --- Roof system ---

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

    // --- Truss systems ---

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

    // --- Roof sub-entities ---

    case 'PARAPET_ADD':
      return updateRoofSystem(state, (rs) => (rs ? { ...rs, parapets: [...(rs.parapets || []), action.parapet] } : rs));
    case 'PARAPET_UPDATE':
      return updateRoofSystem(state, (rs) =>
        rs
          ? {
              ...rs,
              parapets: (rs.parapets || []).map((p) => (p.id === action.parapet.id ? { ...p, ...action.parapet } : p)),
            }
          : rs,
      );
    case 'PARAPET_DELETE':
      return updateRoofSystem(state, (rs) =>
        rs ? { ...rs, parapets: (rs.parapets || []).filter((p) => p.id !== action.parapetId) } : rs,
      );

    case 'DRAIN_ADD':
      return updateRoofSystem(state, (rs) => (rs ? { ...rs, drains: [...(rs.drains || []), action.drain] } : rs));
    case 'DRAIN_UPDATE':
      return updateRoofSystem(state, (rs) =>
        rs
          ? { ...rs, drains: (rs.drains || []).map((d) => (d.id === action.drain.id ? { ...d, ...action.drain } : d)) }
          : rs,
      );
    case 'DRAIN_DELETE':
      return updateRoofSystem(state, (rs) =>
        rs ? { ...rs, drains: (rs.drains || []).filter((d) => d.id !== action.drainId) } : rs,
      );

    case 'ROOF_OPENING_ADD':
      return updateRoofSystem(state, (rs) =>
        rs ? { ...rs, roofOpenings: [...(rs.roofOpenings || []), action.roofOpening] } : rs,
      );
    case 'ROOF_OPENING_UPDATE':
      return updateRoofSystem(state, (rs) =>
        rs
          ? {
              ...rs,
              roofOpenings: (rs.roofOpenings || []).map((o) =>
                o.id === action.roofOpening.id ? { ...o, ...action.roofOpening } : o,
              ),
            }
          : rs,
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
                    (o) => o.id !== action.roofOpeningId,
                  ),
                }
              : null,
          },
          action.roofOpeningId,
        ),
      );

    case 'ROOF_PLANE_ADD':
      return updateRoofSystem(state, (rs) =>
        rs ? { ...rs, roofPlanes: [...(rs.roofPlanes || []), action.roofPlane] } : rs,
      );
    case 'ROOF_PLANE_UPDATE':
      return updateRoofSystem(state, (rs) =>
        rs
          ? {
              ...rs,
              roofPlanes: (rs.roofPlanes || []).map((p) =>
                p.id === action.roofPlane.id ? { ...p, ...action.roofPlane } : p,
              ),
            }
          : rs,
      );
    case 'ROOF_PLANE_DELETE':
      return updateRoofSystem(state, (rs) =>
        rs
          ? {
              ...rs,
              roofPlanes: (rs.roofPlanes || []).filter((p) => p.id !== action.roofPlaneId),
              roofEdges: (rs.roofEdges || []).filter((e) => !(e.planeIds || []).includes(action.roofPlaneId)),
            }
          : rs,
      );

    case 'ROOF_EDGE_UPDATE':
      return updateRoofSystem(state, (rs) => {
        if (!rs) return rs;
        const existingEdges = rs.roofEdges || [];
        const existingIndex = existingEdges.findIndex(
          (e) =>
            e.id === action.roofEdge.id ||
            (action.roofEdge.geometryKey && e.geometryKey === action.roofEdge.geometryKey),
        );
        if (existingIndex === -1) {
          return { ...rs, roofEdges: [...existingEdges, action.roofEdge] };
        }
        return {
          ...rs,
          roofEdges: existingEdges.map((e, i) => (i === existingIndex ? { ...e, ...action.roofEdge } : e)),
        };
      });

    case 'ROOF_EDGE_DELETE':
      return updateRoofSystem(state, (rs) =>
        rs
          ? {
              ...rs,
              roofEdges: (rs.roofEdges || []).filter(
                (e) => e.id !== action.roofEdgeId && (action.geometryKey ? e.geometryKey !== action.geometryKey : true),
              ),
            }
          : rs,
      );

    // --- Floors ---

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
          trussSystems: (state.project.trussSystems || []).filter((ts) => ts.floorId !== action.floorId),
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

    // --- Sheets ---

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
        sheets: (state.project.sheets || []).map((s) => (s.id === action.sheet.id ? { ...s, ...action.sheet } : s)),
      });
    case 'SHEET_DELETE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).filter((s) => s.id !== action.sheetId),
      });

    case 'SHEET_VIEWPORT_ADD':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((s) =>
          s.id === action.sheetId ? { ...s, viewports: [...(s.viewports || []), action.viewport] } : s,
        ),
      });
    case 'SHEET_VIEWPORT_UPDATE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((s) =>
          s.id === action.sheetId
            ? {
                ...s,
                viewports: (s.viewports || []).map((v) =>
                  v.id === action.viewport.id ? { ...v, ...action.viewport } : v,
                ),
              }
            : s,
        ),
      });
    case 'SHEET_VIEWPORT_DELETE':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((s) =>
          s.id === action.sheetId
            ? { ...s, viewports: (s.viewports || []).filter((v) => v.id !== action.viewportId) }
            : s,
        ),
      });

    // --- Walls ---

    case 'WALL_ADD':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        walls: [...f.walls, syncWallAttachmentPoints(action.wall, f.columns || [])],
      }));

    case 'WALL_UPDATE':
      return updateFloor(state, action.floorId, (f) => applyWallUpdate(f, action.wall, f.columns || []));

    case 'WALL_DELETE': {
      const wallId = action.wallId;
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        walls: f.walls.filter((w) => w.id !== wallId),
        doors: f.doors.filter((d) => d.wallId !== wallId),
        windows: f.windows.filter((w) => w.wallId !== wallId),
      }));
    }

    case 'FILLET_APPLY':
      return updateFloor(state, action.floorId, (f) => {
        const walls = f.walls.map((w) => {
          if (w.id === action.wall1Id) return { ...w, [action.wall1Endpoint]: { ...action.tangentPoint1 } };
          if (w.id === action.wall2Id) return { ...w, [action.wall2Endpoint]: { ...action.tangentPoint2 } };
          return w;
        });
        return { ...f, walls: [...walls, action.arcWall] };
      });

    case 'FILLET_REMOVE':
      return updateFloor(state, action.floorId, (f) => {
        const arcWall = f.walls.find((w) => w.id === action.arcWallId);
        if (!arcWall || !arcWall.controlPoint) return f;
        const originalCorner = arcWall.controlPoint;
        const walls = f.walls
          .filter((w) => w.id !== action.arcWallId)
          .map((w) => {
            if (w.id === action.wall1Id) return { ...w, [action.wall1Endpoint]: { ...originalCorner } };
            if (w.id === action.wall2Id) return { ...w, [action.wall2Endpoint]: { ...originalCorner } };
            return w;
          });
        return { ...f, walls };
      });

    // --- Simple entity CRUD (doors, windows, beams, stairs, rooms, etc.) ---

    case 'DOOR_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, doors: [...f.doors, action.door] }));
    case 'DOOR_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        doors: f.doors.map((d) => (d.id === action.door.id ? { ...d, ...action.door } : d)),
      }));
    case 'DOOR_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        doors: f.doors.filter((d) => d.id !== action.doorId),
      }));

    case 'WINDOW_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, windows: [...f.windows, action.window] }));
    case 'WINDOW_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        windows: f.windows.map((w) => (w.id === action.window.id ? { ...w, ...action.window } : w)),
      }));
    case 'WINDOW_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        windows: f.windows.filter((w) => w.id !== action.windowId),
      }));

    case 'BEAM_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, beams: [...(f.beams || []), action.beam] }));
    case 'BEAM_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        beams: (f.beams || []).map((b) => (b.id === action.beam.id ? { ...b, ...action.beam } : b)),
      }));
    case 'BEAM_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        beams: (f.beams || []).filter((b) => b.id !== action.beamId),
      }));

    case 'STAIR_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, stairs: [...(f.stairs || []), action.stair] }));
    case 'STAIR_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        stairs: (f.stairs || []).map((s) => (s.id === action.stair.id ? { ...s, ...action.stair } : s)),
      }));
    case 'STAIR_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        stairs: (f.stairs || []).filter((s) => s.id !== action.stairId),
      }));

    case 'LANDING_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, landings: [...(f.landings || []), action.landing] }));
    case 'LANDING_UPDATE':
      return updateFloor(state, action.floorId, (f) => applyLandingUpdate(f, action.landing));
    case 'LANDING_DELETE':
      return updateFloor(state, action.floorId, (f) => applyLandingDelete(f, action.landingId));

    case 'COLUMN_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, columns: [...(f.columns || []), action.column] }));
    case 'COLUMN_DUPLICATE':
      return updateFloor(state, action.floorId, (f) => ({ ...f, columns: [...(f.columns || []), action.column] }));
    case 'COLUMN_UPDATE':
      return updateFloor(state, action.floorId, (f) => applyColumnUpdate(f, action.column));
    case 'COLUMN_DELETE':
      return updateFloor(state, action.floorId, (f) => applyColumnDelete(f, action.columnId));

    case 'ANNOTATION_ADD':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        annotations: [...(f.annotations || []), action.annotation],
      }));
    case 'ANNOTATION_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        annotations: (f.annotations || []).map((a) =>
          a.id === action.annotation.id ? { ...a, ...action.annotation } : a,
        ),
      }));
    case 'ANNOTATION_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        annotations: (f.annotations || []).filter((a) => a.id !== action.annotationId),
      }));
    case 'ANNOTATION_SETTINGS_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        annotationSettings: { ...(f.annotationSettings || {}), ...action.settings },
      }));

    case 'SLAB_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, slabs: [...(f.slabs || []), action.slab] }));
    case 'SLAB_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        slabs: (f.slabs || []).map((s) => (s.id === action.slab.id ? { ...s, ...action.slab } : s)),
      }));
    case 'SLAB_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        slabs: (f.slabs || []).filter((s) => s.id !== action.slabId),
      }));

    case 'RAILING_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, railings: [...(f.railings || []), action.railing] }));
    case 'RAILING_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        railings: (f.railings || []).map((r) => (r.id === action.railing.id ? { ...r, ...action.railing } : r)),
      }));
    case 'RAILING_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        railings: (f.railings || []).filter((r) => r.id !== action.railingId),
      }));

    case 'SECTION_ADD':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        sectionCuts: [...(f.sectionCuts || []), action.sectionCut],
      }));
    case 'SECTION_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        sectionCuts: (f.sectionCuts || []).map((s) =>
          s.id === action.sectionCut.id ? { ...s, ...action.sectionCut } : s,
        ),
      }));
    case 'SECTION_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        sectionCuts: (f.sectionCuts || []).filter((s) => s.id !== action.sectionId),
      }));

    case 'ROOM_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, rooms: [...f.rooms, action.room] }));
    case 'ROOM_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        rooms: f.rooms.map((r) => (r.id === action.room.id ? { ...r, ...action.room } : r)),
      }));
    case 'ROOM_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        rooms: f.rooms.filter((r) => r.id !== action.roomId),
      }));
    case 'ROOMS_SET':
      return updateFloor(state, action.floorId, (f) => ({ ...f, rooms: action.rooms }));

    case 'FIXTURE_ADD':
      return updateFloor(state, action.floorId, (f) => ({ ...f, fixtures: [...(f.fixtures || []), action.fixture] }));
    case 'FIXTURE_UPDATE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        fixtures: (f.fixtures || []).map((fix) => (fix.id === action.fixture.id ? { ...fix, ...action.fixture } : fix)),
      }));
    case 'FIXTURE_DELETE':
      return updateFloor(state, action.floorId, (f) => ({
        ...f,
        fixtures: (f.fixtures || []).filter((fix) => fix.id !== action.fixtureId),
      }));

    // --- Phases ---

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
          (state.project.phases || []).map((p) => (p.id === action.phase.id ? { ...p, ...action.phase } : p)),
        ),
      });
    case 'PHASE_DELETE': {
      const nextProject = clearProjectPhaseReferences(state.project, action.phaseId);
      return applyProjectUpdate(state, {
        ...nextProject,
        updatedAt: new Date().toISOString(),
        phases: (state.project.phases || []).filter((p) => p.id !== action.phaseId),
      });
    }
    case 'PHASE_REORDER':
      return applyProjectUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        phases: action.phases,
      });

    // --- Undo/Redo & lifecycle ---

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

function createInitialState(project) {
  const synced = syncProjectStructures({
    ...project,
    floors: sortFloors(project.floors || []),
  });
  return {
    project: synced,
    isDirty: false,
    lastSavedAt: null,
    savedSnapshot: snapshotProject(synced),
    history: [],
    future: [],
  };
}

export function ProjectProvider({ children, initialProject }) {
  const [state, dispatch] = useReducer(projectReducer, initialProject || createProject(), createInitialState);
  return <ProjectContext.Provider value={{ state, dispatch }}>{children}</ProjectContext.Provider>;
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
    getFloor: (floorId) => state.project.floors.find((f) => f.id === floorId),
  };
}
