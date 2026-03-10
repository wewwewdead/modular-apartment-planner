import { generateId } from './ids';
import { WALL_THICKNESS, WALL_HEIGHT, DOOR_WIDTH, DOOR_HEIGHT, DOOR_SILL_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_SILL_HEIGHT, COLUMN_WIDTH, COLUMN_DEPTH, BEAM_WIDTH, BEAM_DEPTH, STAIR_WIDTH, STAIR_RISERS, STAIR_RISER_HEIGHT, STAIR_TREAD_DEPTH, SLAB_THICKNESS, SLAB_ELEVATION, SECTION_DEPTH, LANDING_WIDTH, LANDING_DEPTH, LANDING_THICKNESS, RAILING_HEIGHT, RAILING_WIDTH, ROOM_COLOR, DIMENSION_DEFAULT_OFFSET } from './defaults';
import { FIXTURE_DEFAULTS } from '@/editor/tools';
import { polygonArea, polygonCentroid } from '@/geometry/polygon';

export function createProject(name = 'Untitled Project') {
  return {
    id: generateId('proj'),
    name,
    address: '',
    documentDefaults: {
      drawnBy: '',
      checkedBy: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    floors: [createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: WALL_HEIGHT })],
    sheets: [],
    version: 1,
  };
}

export function createFloor(name = 'Floor', levelIndex = 0, options = {}) {
  const floorToFloorHeight = options.floorToFloorHeight ?? WALL_HEIGHT;
  const elevation = options.elevation ?? (levelIndex * floorToFloorHeight);

  return {
    id: generateId('floor'),
    name,
    levelIndex,
    elevation,
    floorToFloorHeight,
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    columns: [],
    beams: [],
    stairs: [],
    landings: [],
    fixtures: [],
    annotations: [],
    annotationSettings: createAnnotationSettings(),
    slabs: [],
    sectionCuts: [],
    railings: [],
  };
}

export function nextSectionLabel(existingCuts = []) {
  const usedLetters = new Set(
    existingCuts
      .map(c => {
        const match = c.label?.match(/^Section\s+([A-Z])-\1$/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
  );
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!usedLetters.has(letter)) return `Section ${letter}-${letter}`;
  }
  return `Section ${existingCuts.length + 1}`;
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

export function createStair(startPoint, width = STAIR_WIDTH, numberOfRisers = STAIR_RISERS, riserHeight = STAIR_RISER_HEIGHT, treadDepth = STAIR_TREAD_DEPTH, direction = { angle: 0 }, floorRelation = {}, options = {}) {
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
    startLandingAttachment: options.startLandingAttachment ?? null,
    endLandingAttachment: options.endLandingAttachment ?? null,
  };
}

export function createLanding(position, width = LANDING_WIDTH, depth = LANDING_DEPTH, options = {}) {
  return {
    id: generateId('landing'),
    position: { x: position.x, y: position.y },
    width,
    depth,
    thickness: options.thickness ?? LANDING_THICKNESS,
    elevation: options.elevation ?? 0,
    rotation: options.rotation ?? 0,
  };
}

export function createFixture(fixtureType, x, y, options = {}) {
  const defaults = FIXTURE_DEFAULTS[fixtureType] || { width: 600, depth: 400 };
  return {
    id: generateId('fix'),
    fixtureType,
    x, y,
    width: options.width ?? defaults.width,
    depth: options.depth ?? defaults.depth,
    rotation: options.rotation ?? 0,
    name: options.name ?? '',
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

export function createRailing(startPoint, endPoint, options = {}) {
  return {
    id: generateId('rail'),
    startPoint: { x: startPoint.x, y: startPoint.y },
    endPoint: { x: endPoint.x, y: endPoint.y },
    type: options.type ?? 'guardrail',
    height: options.height ?? RAILING_HEIGHT,
    width: options.width ?? RAILING_WIDTH,
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
