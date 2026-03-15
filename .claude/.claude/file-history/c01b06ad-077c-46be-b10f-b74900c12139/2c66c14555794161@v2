import { DOOR_HEIGHT, DOOR_SILL_HEIGHT, SLAB_ELEVATION, SLAB_THICKNESS, STAIR_RISERS, STAIR_RISER_HEIGHT, STAIR_TREAD_DEPTH, STAIR_WIDTH, WALL_HEIGHT, WINDOW_HEIGHT, WINDOW_SILL_HEIGHT } from '@/domain/defaults';
import { createFloor } from '@/domain/models';
import { createAnnotationSettings } from '@/domain/models';
import { CURRENT_PROJECT_VERSION } from '@/domain/projectVersion';
import { normalizePhases } from '@/domain/phaseModels';
import { createRoofSystem, syncRoofSystemAttachment } from '@/domain/roofModels';
import {
  createTrussInstance,
  createPurlinSystem,
  createTrussSystem,
  normalizeTrussMaterial,
  syncProjectTrussSystems,
  TRUSS_SUPPORT_MODES,
} from '@/domain/trussModels';
import { getDefaultActiveFloorId, getFloorElevation, getFloorLevelIndex, getFloorToFloorHeight, getFloorTopElevation, sortFloors } from '@/domain/floorModels';
import { createSheetRevision } from '@/domain/sheetModels';
import {
  normalizePlanLengthScale,
  normalizePlanOffset,
  normalizeRotationDegrees,
} from '@/truss/systemTransform';
import { registerMigration } from './index';

function migrateV14toV15(project) {
  if (!Array.isArray(project.sheets)) {
    project.sheets = [];
  }
  if (project.roofSystem === undefined) {
    project.roofSystem = null;
  }
  if (!Array.isArray(project.trussSystems)) {
    project.trussSystems = [];
  }
  if (project.address === undefined) project.address = '';
  project.documentDefaults = {
    drawnBy: project.documentDefaults?.drawnBy ?? '',
    checkedBy: project.documentDefaults?.checkedBy ?? '',
  };
  project.version = Math.max(CURRENT_PROJECT_VERSION, Number(project.version || 0));

  if (project.floors.length === 0) {
    project.floors = [createFloor('Ground Floor', 0)];
  }

  // Backfill missing room fields for old saves
  project.floors.forEach((floor, index) => {
    if (!floor.name) floor.name = index === 0 ? 'Ground Floor' : `Floor ${index}`;
    if (floor.levelIndex === undefined) {
      floor.levelIndex = floor.level ?? index;
    }
    if (floor.floorToFloorHeight === undefined) {
      floor.floorToFloorHeight = WALL_HEIGHT;
    }
    if (floor.elevation === undefined) {
      floor.elevation = floor.level ?? (floor.levelIndex * floor.floorToFloorHeight);
    }
    delete floor.level;

    if (!floor.rooms) floor.rooms = [];
    for (const room of floor.rooms) {
      if (!room.points) room.points = [];
      if (room.area === undefined) room.area = 0;
    }
  });

  // Backfill door/window type fields for old saves
  for (const floor of project.floors) {
    if (!floor.doors) floor.doors = [];
    for (const door of floor.doors) {
      if (!door.type) door.type = 'swing';
      if (door.height === undefined) door.height = DOOR_HEIGHT;
      if (door.sillHeight === undefined) door.sillHeight = DOOR_SILL_HEIGHT;
    }
    if (!floor.windows) floor.windows = [];
    for (const win of floor.windows) {
      if (!win.type) win.type = 'standard';
      if (!win.openDirection) win.openDirection = 'left';
      if (win.height === undefined) win.height = WINDOW_HEIGHT;
      if (win.sillHeight === undefined) win.sillHeight = WINDOW_SILL_HEIGHT;
    }
    if (!floor.columns) floor.columns = [];
    if (!floor.fixtures) floor.fixtures = [];
    if (!floor.beams) floor.beams = [];
    if (!floor.stairs) floor.stairs = [];
    if (!floor.landings) floor.landings = [];
    if (!floor.annotations) floor.annotations = [];
    if (!floor.railings) floor.railings = [];
    floor.annotationSettings = createAnnotationSettings(floor.annotationSettings || {});
    // Migrate single slab → slabs array
    if (floor.slab !== undefined) {
      floor.slabs = floor.slab ? [floor.slab] : [];
      delete floor.slab;
    }
    if (!Array.isArray(floor.slabs)) floor.slabs = [];
    // Migrate single sectionCut → sectionCuts array
    if (floor.sectionCut !== undefined) {
      floor.sectionCuts = floor.sectionCut ? [floor.sectionCut] : [];
      delete floor.sectionCut;
    }
    if (!Array.isArray(floor.sectionCuts)) floor.sectionCuts = [];
    for (const wall of floor.walls) {
      if (wall.height === undefined) wall.height = WALL_HEIGHT;
      if (wall.startAttachment === undefined) wall.startAttachment = null;
      if (wall.endAttachment === undefined) wall.endAttachment = null;
    }
    for (const column of floor.columns) {
      if (column.showLabel === undefined) {
        column.showLabel = Boolean(column.name);
      }
    }
    for (const fixture of floor.fixtures) {
      if (!fixture.fixtureType) fixture.fixtureType = 'kitchenTop';
      if (fixture.x === undefined) fixture.x = 0;
      if (fixture.y === undefined) fixture.y = 0;
      if (fixture.width === undefined) fixture.width = 600;
      if (fixture.depth === undefined) fixture.depth = 400;
      if (fixture.rotation === undefined) fixture.rotation = 0;
      if (fixture.name === undefined) fixture.name = '';
    }
    for (const beam of floor.beams) {
      if (beam.floorLevel === undefined) beam.floorLevel = getFloorElevation(floor, index);
    }
    for (const stair of floor.stairs) {
      if (!stair.startPoint) stair.startPoint = { x: 0, y: 0 };
      if (stair.width === undefined) stair.width = STAIR_WIDTH;
      if (stair.numberOfRisers === undefined) stair.numberOfRisers = STAIR_RISERS;
      if (stair.riserHeight === undefined) stair.riserHeight = STAIR_RISER_HEIGHT;
      if (stair.treadDepth === undefined) stair.treadDepth = STAIR_TREAD_DEPTH;
      if (stair.direction === undefined) {
        stair.direction = { angle: 0 };
      } else if (typeof stair.direction === 'number') {
        stair.direction = { angle: stair.direction };
      } else if (stair.direction.angle === undefined) {
        stair.direction.angle = 0;
      }
      if (stair.floorRelation === undefined) {
        stair.floorRelation = { fromFloorId: floor.id, toFloorId: floor.id };
      } else {
        if (stair.floorRelation.fromFloorId === undefined) stair.floorRelation.fromFloorId = floor.id;
        if (stair.floorRelation.toFloorId === undefined) stair.floorRelation.toFloorId = floor.id;
      }
      if (stair.startLandingAttachment === undefined) stair.startLandingAttachment = null;
      if (stair.endLandingAttachment === undefined) stair.endLandingAttachment = null;
      if (stair.roofAccess === undefined) stair.roofAccess = null;
    }
    for (const landing of floor.landings) {
      if (!landing.position) landing.position = { x: 0, y: 0 };
      if (landing.width === undefined) landing.width = 1000;
      if (landing.depth === undefined) landing.depth = 1000;
      if (landing.thickness === undefined) landing.thickness = 200;
      if (landing.elevation === undefined) landing.elevation = 0;
      if (landing.rotation === undefined) landing.rotation = 0;
    }
    for (const annotation of floor.annotations) {
      if (!annotation.id) {
        annotation.id = `anno_${floor.id}_${Math.random().toString(36).slice(2, 8)}`;
      }
      if (!annotation.type) annotation.type = 'dimension';
      if (!annotation.mode) annotation.mode = 'aligned';
      if (!annotation.startPoint) annotation.startPoint = { x: 0, y: 0 };
      if (!annotation.endPoint) annotation.endPoint = { x: 0, y: 0 };
      if (annotation.offset === undefined) annotation.offset = 300;
      if (annotation.textOverride === undefined) annotation.textOverride = '';
    }
    for (const slab of floor.slabs) {
      if (!slab.floorId) slab.floorId = floor.id;
      if (!slab.boundaryPoints) slab.boundaryPoints = [];
      if (slab.thickness === undefined) slab.thickness = SLAB_THICKNESS;
      if (slab.elevation === undefined) slab.elevation = SLAB_ELEVATION;
      if (slab.name === undefined) slab.name = '';
      if (slab.type === undefined) slab.type = '';
    }
    for (const sc of floor.sectionCuts) {
      if (!sc.id) {
        sc.id = `section_${floor.id}_${Math.random().toString(36).slice(2, 8)}`;
      }
      if (!sc.startPoint) sc.startPoint = { x: 0, y: 0 };
      if (!sc.endPoint) sc.endPoint = { x: 1000, y: 0 };
      if (sc.depth === undefined) sc.depth = 2000;
      if (sc.label === undefined) sc.label = 'Section A-A';
      if (sc.direction === undefined) sc.direction = 1;
    }
  }

  project.floors = sortFloors(project.floors).map((floor, index) => ({
    ...floor,
    levelIndex: getFloorLevelIndex(floor, index),
    elevation: getFloorElevation(floor, index),
    floorToFloorHeight: getFloorToFloorHeight(floor),
  }));

  project.trussSystems = (project.trussSystems || []).map((trussSystem) => {
    const floor = project.floors.find((entry) => entry.id === trussSystem.floorId)
      || project.floors.find((entry) => entry.id === getDefaultActiveFloorId(project))
      || project.floors[0]
      || null;
    const floorId = floor?.id || null;

    return {
      ...createTrussSystem(trussSystem.name || 'Truss System'),
      ...trussSystem,
      id: trussSystem?.id || `truss_system_${Math.random().toString(36).slice(2, 8)}`,
      floorId,
      phaseId: typeof trussSystem?.phaseId === 'string' && trussSystem.phaseId ? trussSystem.phaseId : null,
      baseElevation: trussSystem?.baseElevation ?? (floor ? getFloorTopElevation(floor) : 0),
      planRotationOffsetDegrees: normalizeRotationDegrees(trussSystem?.planRotationOffsetDegrees),
      planOffset: normalizePlanOffset(trussSystem?.planOffset),
      planLengthScale: normalizePlanLengthScale(trussSystem?.planLengthScale),
      purlinSystem: createPurlinSystem(trussSystem?.purlinSystem),
      trussInstances: (trussSystem.trussInstances || []).map((trussInstance) => ({
        ...createTrussInstance({ floorId }),
        ...trussInstance,
        id: trussInstance?.id || `truss_instance_${Math.random().toString(36).slice(2, 8)}`,
        floorId: trussInstance?.floorId || floorId,
        material: normalizeTrussMaterial(trussInstance?.material),
        startPoint: trussInstance?.startPoint ? { x: trussInstance.startPoint.x, y: trussInstance.startPoint.y } : { x: -6000, y: 0 },
        endPoint: trussInstance?.endPoint ? { x: trussInstance.endPoint.x, y: trussInstance.endPoint.y } : { x: 6000, y: 0 },
        bearingOffsets: {
          start: Number.isFinite(trussInstance?.bearingOffsets?.start) ? trussInstance.bearingOffsets.start : 0,
          end: Number.isFinite(trussInstance?.bearingOffsets?.end) ? trussInstance.bearingOffsets.end : 0,
        },
        overhangs: {
          start: Number.isFinite(trussInstance?.overhangs?.start) ? trussInstance.overhangs.start : 300,
          end: Number.isFinite(trussInstance?.overhangs?.end) ? trussInstance.overhangs.end : 300,
        },
        supportMode: trussInstance?.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR
          ? TRUSS_SUPPORT_MODES.BEAM_PAIR
          : null,
        supportBeamIds: {
          start: typeof trussInstance?.supportBeamIds?.start === 'string' ? trussInstance.supportBeamIds.start : null,
          end: typeof trussInstance?.supportBeamIds?.end === 'string' ? trussInstance.supportBeamIds.end : null,
        },
        supportOffsetAlongAxis: Number.isFinite(trussInstance?.supportOffsetAlongAxis)
          ? Math.max(0, trussInstance.supportOffsetAlongAxis)
          : 0,
        roofAttachmentId: trussInstance?.roofAttachmentId || null,
      })),
    };
  });
  project = syncProjectTrussSystems(project);

  if (project.roofSystem) {
    const roofSystem = {
      ...createRoofSystem(project.roofSystem.name || 'Roof'),
      ...project.roofSystem,
      trussAttachmentId: project.roofSystem.trussAttachmentId || null,
      pitchSource: project.roofSystem.pitchSource || (project.roofSystem.trussAttachmentId ? 'truss' : 'manual'),
      boundaryPolygon: (project.roofSystem.boundaryPolygon || []).map((point) => ({
        x: point.x,
        y: point.y,
      })),
      parapets: (project.roofSystem.parapets || []).map((parapet) => ({
        ...parapet,
        startPoint: parapet.startPoint ? { x: parapet.startPoint.x, y: parapet.startPoint.y } : { x: 0, y: 0 },
        endPoint: parapet.endPoint ? { x: parapet.endPoint.x, y: parapet.endPoint.y } : { x: 1000, y: 0 },
        attachment: parapet.attachment
          ? {
              type: parapet.attachment.type ?? 'roof_edge',
              edgeIndex: Number.isFinite(parapet.attachment.edgeIndex) ? parapet.attachment.edgeIndex : 0,
              startOffset: Number.isFinite(parapet.attachment.startOffset) ? parapet.attachment.startOffset : 0,
              endOffset: Number.isFinite(parapet.attachment.endOffset) ? parapet.attachment.endOffset : 0,
            }
          : null,
      })),
      drains: (project.roofSystem.drains || []).map((drain) => ({
        ...drain,
        position: drain.position ? { x: drain.position.x, y: drain.position.y } : { x: 0, y: 0 },
      })),
      roofOpenings: (project.roofSystem.roofOpenings || []).map((opening) => ({
        ...opening,
        boundaryPoints: (opening.boundaryPoints || []).map((point) => ({
          x: point.x,
          y: point.y,
        })),
      })),
      roofPlanes: (project.roofSystem.roofPlanes || []).map((plane) => ({
        ...plane,
        boundaryPoints: (plane.boundaryPoints || []).map((point) => ({
          x: point.x,
          y: point.y,
        })),
      })),
      roofEdges: (project.roofSystem.roofEdges || []).map((edge) => ({
        ...edge,
        startPoint: edge.startPoint ? { x: edge.startPoint.x, y: edge.startPoint.y } : { x: 0, y: 0 },
        endPoint: edge.endPoint ? { x: edge.endPoint.x, y: edge.endPoint.y } : { x: 1000, y: 0 },
        planeIds: [...new Set(edge.planeIds || [])],
      })),
      ridges: (project.roofSystem.ridges || []).map((ridge) => ({
        ...ridge,
        startPoint: ridge.startPoint ? { x: ridge.startPoint.x, y: ridge.startPoint.y } : { x: 0, y: 0 },
        endPoint: ridge.endPoint ? { x: ridge.endPoint.x, y: ridge.endPoint.y } : { x: 1000, y: 0 },
        planeIds: [...new Set(ridge.planeIds || [])],
      })),
      valleys: (project.roofSystem.valleys || []).map((valley) => ({
        ...valley,
        startPoint: valley.startPoint ? { x: valley.startPoint.x, y: valley.startPoint.y } : { x: 0, y: 0 },
        endPoint: valley.endPoint ? { x: valley.endPoint.x, y: valley.endPoint.y } : { x: 1000, y: 0 },
        planeIds: [...new Set(valley.planeIds || [])],
      })),
      hips: (project.roofSystem.hips || []).map((hip) => ({
        ...hip,
        startPoint: hip.startPoint ? { x: hip.startPoint.x, y: hip.startPoint.y } : { x: 0, y: 0 },
        endPoint: hip.endPoint ? { x: hip.endPoint.x, y: hip.endPoint.y } : { x: 1000, y: 0 },
        planeIds: [...new Set(hip.planeIds || [])],
      })),
    };

    project.roofSystem = syncRoofSystemAttachment(project, roofSystem);
  }

  for (const sheet of project.sheets) {
    if (!sheet.id) {
      sheet.id = `sheet_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (sheet.title === undefined) sheet.title = '';
    if (sheet.paperSize === undefined) sheet.paperSize = 'A3_LANDSCAPE';
    if (sheet.number === undefined) sheet.number = '';
    if (sheet.issueDate === undefined) sheet.issueDate = '';
    if (sheet.scaleLabel === undefined) sheet.scaleLabel = '1:100';
    if (sheet.scaleMode === undefined) sheet.scaleMode = 'custom';
    if (sheet.layoutTemplate === undefined) sheet.layoutTemplate = 'auto';
    if (sheet.drawingName === undefined) sheet.drawingName = sheet.title || 'Drawing';
    if (sheet.projectNameOverride === undefined) sheet.projectNameOverride = '';
    sheet.titleBlock = {
      projectTitleOverride: sheet.titleBlock?.projectTitleOverride ?? '',
      projectAddressOverride: sheet.titleBlock?.projectAddressOverride ?? '',
      drawnBy: sheet.titleBlock?.drawnBy ?? '',
      checkedBy: sheet.titleBlock?.checkedBy ?? '',
    };
    if (!Array.isArray(sheet.revisions)) sheet.revisions = [];
    sheet.revisions = sheet.revisions.map((revision) => ({
      ...createSheetRevision(),
      ...revision,
      id: revision?.id || `revision_${sheet.id}_${Math.random().toString(36).slice(2, 8)}`,
    }));
    if (!Array.isArray(sheet.viewports)) sheet.viewports = [];

    for (const viewport of sheet.viewports) {
      if (!viewport.id) {
        viewport.id = `viewport_${sheet.id}_${Math.random().toString(36).slice(2, 8)}`;
      }
      if (viewport.sourceView === undefined) viewport.sourceView = 'plan';
      if (viewport.sourceFloorId === undefined) viewport.sourceFloorId = getDefaultActiveFloorId(project);
      if (viewport.sourceRefId === undefined) viewport.sourceRefId = null;
      if (viewport.x === undefined) viewport.x = 20;
      if (viewport.y === undefined) viewport.y = 20;
      if (viewport.width === undefined) viewport.width = 160;
      if (viewport.height === undefined) viewport.height = 100;
      if (viewport.scale === undefined) viewport.scale = 100;
      if (viewport.title === undefined) viewport.title = '';
      if (viewport.rotation === undefined) viewport.rotation = 0;
      if (viewport.role === undefined) viewport.role = viewport.sourceView === '3d_preview'
        ? 'supplemental'
        : ((viewport.sourceView === 'plan' || viewport.sourceView === 'roof_plan' || viewport.sourceView === 'roof_drainage' || viewport.sourceView === 'truss_plan')
          ? 'primary'
          : (viewport.sourceView === 'truss_detail' ? 'detail' : 'secondary'));
      if (viewport.captionPosition === undefined) viewport.captionPosition = 'below';
      if (viewport.referenceNote === undefined) viewport.referenceNote = '';
      if (viewport.lockAutoLayout === undefined) viewport.lockAutoLayout = false;
      if (viewport.phaseId === undefined) viewport.phaseId = null;
      if (viewport.phaseViewMode === undefined) viewport.phaseViewMode = 'all';
    }
  }

  project.phases = normalizePhases(project.phases || []);

  return project;
}

registerMigration(14, 15, migrateV14toV15);
