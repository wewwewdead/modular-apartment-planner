import { generateId } from './ids';
import { WALL_THICKNESS, WALL_HEIGHT, DOOR_WIDTH, DOOR_HEIGHT, DOOR_SILL_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_SILL_HEIGHT, COLUMN_WIDTH, COLUMN_DEPTH, BEAM_WIDTH, BEAM_DEPTH, STAIR_WIDTH, STAIR_RISERS, STAIR_RISER_HEIGHT, STAIR_TREAD_DEPTH, SLAB_THICKNESS, SLAB_ELEVATION, SECTION_DEPTH, ROOM_COLOR, DIMENSION_DEFAULT_OFFSET } from './defaults';
import { polygonArea, polygonCentroid } from '@/geometry/polygon';

export function createProject(name = 'Untitled Project') {
  return {
    id: generateId('proj'),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    floors: [createFloor('Ground Floor', 0)],
    sheets: [],
    version: 1,
  };
}

export function createFloor(name = 'Floor', level = 0) {
  return {
    id: generateId('floor'),
    name,
    level,
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    columns: [],
    beams: [],
    stairs: [],
    annotations: [],
    annotationSettings: createAnnotationSettings(),
    slab: null,
    sectionCut: null,
  };
}

export function createAnnotationSettings(overrides = {}) {
  return {
    showWallDimensions: overrides.showWallDimensions ?? true,
    showRoomDimensions: overrides.showRoomDimensions ?? true,
    showOverallDimensions: overrides.showOverallDimensions ?? true,
    showObjectTags: overrides.showObjectTags ?? true,
    showElevationOverallDimensions: overrides.showElevationOverallDimensions ?? true,
    showElevationLevelDimensions: overrides.showElevationLevelDimensions ?? true,
    showElevationOpeningDimensions: overrides.showElevationOpeningDimensions ?? true,
  };
}

export function createLinearDimensionAnnotation(startPoint, endPoint, options = {}) {
  return {
    id: generateId('anno'),
    type: 'dimension',
    mode: options.mode ?? 'aligned',
    startPoint: { x: startPoint.x, y: startPoint.y },
    endPoint: { x: endPoint.x, y: endPoint.y },
    offset: options.offset ?? DIMENSION_DEFAULT_OFFSET,
    textOverride: options.textOverride ?? '',
  };
}

export function createWall(start, end, thickness = WALL_THICKNESS, options = {}) {
  return {
    id: generateId('wall'),
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    thickness,
    height: options.height ?? WALL_HEIGHT,
    startAttachment: options.startAttachment ?? null,
    endAttachment: options.endAttachment ?? null,
  };
}

export function createDoor(wallId, offset, width = DOOR_WIDTH, openDirection = 'left', type = 'swing') {
  return {
    id: generateId('door'),
    wallId,
    offset,
    width,
    height: DOOR_HEIGHT,
    sillHeight: DOOR_SILL_HEIGHT,
    openDirection,
    type,
  };
}

export function createWindow(wallId, offset, width = WINDOW_WIDTH, type = 'standard', openDirection = 'left') {
  return {
    id: generateId('win'),
    wallId,
    offset,
    width,
    height: WINDOW_HEIGHT,
    sillHeight: WINDOW_SILL_HEIGHT,
    type,
    openDirection,
  };
}

export function createColumn(x, y, width = COLUMN_WIDTH, depth = COLUMN_DEPTH, options = {}) {
  return {
    id: generateId('col'),
    x, y, width, depth,
    height: options.height ?? 3000,
    rotation: options.rotation ?? 0,
    type: options.type ?? 'rectangular',
    name: options.name ?? '',
    showLabel: options.showLabel ?? false,
  };
}

export function createBeam(startRef, endRef, width = BEAM_WIDTH, depth = BEAM_DEPTH, floorLevel = 0) {
  return {
    id: generateId('beam'),
    startRef: { ...startRef },
    endRef: { ...endRef },
    width,
    depth,
    floorLevel,
  };
}

export function createSlab(floorId, boundaryPoints = [], thickness = SLAB_THICKNESS, elevation = SLAB_ELEVATION, options = {}) {
  return {
    id: generateId('slab'),
    floorId,
    boundaryPoints: boundaryPoints.map(point => ({ x: point.x, y: point.y })),
    thickness,
    elevation,
    name: options.name ?? '',
    type: options.type ?? '',
  };
}

export function createStair(startPoint, width = STAIR_WIDTH, numberOfRisers = STAIR_RISERS, riserHeight = STAIR_RISER_HEIGHT, treadDepth = STAIR_TREAD_DEPTH, direction = { angle: 0 }, floorRelation = {}) {
  return {
    id: generateId('stair'),
    startPoint: { x: startPoint.x, y: startPoint.y },
    width,
    numberOfRisers,
    riserHeight,
    treadDepth,
    direction: {
      angle: direction?.angle ?? 0,
    },
    floorRelation: {
      fromFloorId: floorRelation.fromFloorId ?? null,
      toFloorId: floorRelation.toFloorId ?? null,
    },
  };
}

export function createSectionCut(startPoint, endPoint, options = {}) {
  return {
    id: generateId('section'),
    startPoint: { x: startPoint.x, y: startPoint.y },
    endPoint: { x: endPoint.x, y: endPoint.y },
    depth: options.depth ?? SECTION_DEPTH,
    label: options.label ?? 'Section A-A',
    direction: options.direction ?? 1,
  };
}

export function createRoom(name = 'Room', points = [], color = ROOM_COLOR) {
  const area = polygonArea(points);
  const centroid = points.length >= 3 ? polygonCentroid(points) : { x: 0, y: 0 };
  return {
    id: generateId('room'),
    name,
    points: points.map(p => ({ x: p.x, y: p.y })),
    labelPosition: { ...centroid },
    color,
    area,
  };
}
