import { getFloorElevation } from '@/domain/floorModels';
import { getSlabBottomLevel } from '@/elevations/slab';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { computeLandingElevation } from '@/geometry/landingGeometry';
import { isValidSlabBoundary } from '@/geometry/slabGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { wallDirection, wallLength, wallOutline } from '@/geometry/wallGeometry';
import { buildWallPreviewContexts, buildWallSolidSegments } from './wallPreviewContext';

const DOOR_INSERT_THICKNESS_MIN = 35;
const DOOR_INSERT_THICKNESS_MAX = 70;
const WINDOW_INSERT_THICKNESS_MIN = 45;
const WINDOW_INSERT_THICKNESS_MAX = 90;

function createBoundsFromPoints(points, baseElevation, topElevation) {
  if (!points?.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minElevation: baseElevation,
      maxElevation: topElevation,
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minElevation: baseElevation,
    maxElevation: topElevation,
  };
}

function createPrismDescriptor(id, kind, outline, baseElevation, height, metadata = {}) {
  const topElevation = baseElevation + height;
  return {
    id,
    kind,
    geometry: 'prism',
    outline: outline.map((point) => ({ x: point.x, y: point.y })),
    baseElevation,
    height,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(outline, baseElevation, topElevation),
  };
}

function createLinearBoxDescriptor(id, kind, startPoint, endPoint, width, baseElevation, height, metadata = {}) {
  const outline = wallOutline({
    start: { x: startPoint.x, y: startPoint.y },
    end: { x: endPoint.x, y: endPoint.y },
    thickness: width,
  });
  const direction = wallDirection({
    start: { x: startPoint.x, y: startPoint.y },
    end: { x: endPoint.x, y: endPoint.y },
  });
  const topElevation = baseElevation + height;

  return {
    id,
    kind,
    geometry: 'box',
    center: {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    },
    size: {
      x: wallLength({ start: startPoint, end: endPoint }),
      y: height,
      z: width,
    },
    rotation: Math.atan2(direction.y, direction.x),
    baseElevation,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(outline, baseElevation, topElevation),
  };
}

function createBoxDescriptor(id, kind, center, size, baseElevation, rotation = 0, metadata = {}) {
  const halfX = size.x / 2;
  const halfZ = size.z / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corners = [
    { x: -halfX, y: -halfZ },
    { x: halfX, y: -halfZ },
    { x: halfX, y: halfZ },
    { x: -halfX, y: halfZ },
  ].map((point) => ({
    x: center.x + (point.x * cos - point.y * sin),
    y: center.y + (point.x * sin + point.y * cos),
  }));

  return {
    id,
    kind,
    geometry: 'box',
    center: { x: center.x, y: center.y },
    size,
    rotation,
    baseElevation,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(corners, baseElevation, baseElevation + size.y),
  };
}

function resolveLandingElevation(landing, stairs, floorLevel) {
  if (landing.elevation) return landing.elevation;
  return computeLandingElevation(landing, stairs, floorLevel) - floorLevel;
}

function createStairDescriptor(stair, floorLevel, floorId, landings, landingElevationMap) {
  const renderData = getStairRenderData(stair);
  if (!renderData?.outline?.length) return null;

  let baseElevation = floorLevel;
  if (stair.startLandingAttachment) {
    const elev = landingElevationMap?.get(stair.startLandingAttachment.landingId);
    if (elev != null) {
      baseElevation = floorLevel + elev;
    }
  }

  return {
    id: stair.id,
    kind: 'stair',
    geometry: 'stair',
    startPoint: { ...stair.startPoint },
    width: stair.width,
    numberOfRisers: stair.numberOfRisers,
    riserHeight: stair.riserHeight,
    treadDepth: stair.treadDepth,
    angle: renderData.angle,
    baseElevation,
    materialKey: 'stair',
    metadata: {
      sourceId: stair.id,
      floorId,
    },
    bounds: createBoundsFromPoints(
      renderData.outline,
      baseElevation,
      baseElevation + renderData.totalRise
    ),
  };
}

function buildWallObjects(wallContexts) {
  return wallContexts.flatMap((context) => (
    buildWallSolidSegments(context).map((segment) => createLinearBoxDescriptor(
      segment.id,
      'wall',
      segment.startPoint,
      segment.endPoint,
      segment.thickness,
      segment.baseElevation,
      segment.topElevation - segment.baseElevation,
      {
        sourceId: segment.wallId,
        floorId: segment.floorId,
        wallId: segment.wallId,
      }
    ))
  ));
}

function buildSlabObjects(floor) {
  return (floor.slabs || [])
    .filter(slab => isValidSlabBoundary(slab.boundaryPoints))
    .map(slab => createPrismDescriptor(
      slab.id,
      'slab',
      slab.boundaryPoints,
      getSlabBottomLevel(slab),
      slab.thickness ?? 0,
      {
        sourceId: slab.id,
        floorId: floor.id,
      }
    ));
}

function buildColumnObjects(floor, floorLevel) {
  return (floor.columns || []).map((column) => createBoxDescriptor(
    column.id,
    'column',
    { x: column.x, y: column.y },
    {
      x: column.width,
      y: column.height,
      z: column.depth,
    },
    floorLevel,
    (column.rotation || 0) * Math.PI / 180,
    {
      sourceId: column.id,
      floorId: floor.id,
    }
  ));
}

function buildBeamObjects(floor) {
  return (floor.beams || [])
    .map((beam) => {
      const renderData = getBeamRenderData(beam, floor.columns || []);
      if (!renderData) return null;

      return createLinearBoxDescriptor(
        beam.id,
        'beam',
        renderData.start,
        renderData.end,
        beam.width,
        beam.floorLevel - beam.depth,
        beam.depth,
        {
          sourceId: beam.id,
          floorId: floor.id,
        }
      );
    })
    .filter(Boolean);
}

function getInsertThickness(kind, wallThickness) {
  if (kind === 'door') {
    return Math.max(
      DOOR_INSERT_THICKNESS_MIN,
      Math.min(wallThickness * 0.22, DOOR_INSERT_THICKNESS_MAX)
    );
  }

  return Math.max(
    WINDOW_INSERT_THICKNESS_MIN,
    Math.min(wallThickness * 0.32, WINDOW_INSERT_THICKNESS_MAX)
  );
}

function createOpeningInsertDescriptor(opening) {
  return createBoxDescriptor(
    opening.id,
    opening.kind,
    opening.centerPoint,
    {
      x: opening.visibleWidth,
      y: opening.visibleHeight,
      z: getInsertThickness(opening.kind, opening.wallThickness),
    },
    opening.visibleBaseElevation,
    opening.angle,
    {
      sourceId: opening.sourceId,
      floorId: opening.metadata.floorId,
      wallId: opening.wallId,
      openingKind: opening.kind,
    }
  );
}

function buildDoorObjects(wallContexts) {
  return wallContexts
    .flatMap((context) => context.openings)
    .filter((opening) => opening.kind === 'door')
    .map((opening) => createOpeningInsertDescriptor(opening));
}

function buildWindowObjects(wallContexts) {
  return wallContexts
    .flatMap((context) => context.openings)
    .filter((opening) => opening.kind === 'window')
    .map((opening) => {
      const desc = createOpeningInsertDescriptor(opening);
      desc.geometry = 'window';
      desc.windowType = opening.type || 'standard';
      desc.openDirection = opening.openDirection || 'left';
      return desc;
    });
}

function buildStairObjects(floor, floorLevel, landings, landingElevationMap) {
  return (floor.stairs || [])
    .map((stair) => createStairDescriptor(stair, floorLevel, floor.id, landings, landingElevationMap))
    .filter(Boolean);
}

function buildLandingObjects(floor, floorLevel, landingElevationMap) {
  return (floor.landings || []).map((landing) => createBoxDescriptor(
    landing.id,
    'landing',
    { x: landing.position.x, y: landing.position.y },
    {
      x: landing.width,
      y: landing.thickness ?? 200,
      z: landing.depth,
    },
    floorLevel + (landingElevationMap.get(landing.id) || 0),
    (landing.rotation || 0) * Math.PI / 180,
    {
      sourceId: landing.id,
      floorId: floor.id,
    }
  ));
}

export function buildFloorPreviewObjects(floor) {
  const floorLevel = getFloorElevation(floor);
  const landings = floor.landings || [];
  const stairs = floor.stairs || [];

  const landingElevationMap = new Map(
    landings.map(l => [l.id, resolveLandingElevation(l, stairs, floorLevel)])
  );

  const wallContexts = buildWallPreviewContexts(floor, floorLevel);

  return [
    ...buildSlabObjects(floor),
    ...buildWallObjects(wallContexts),
    ...buildColumnObjects(floor, floorLevel),
    ...buildBeamObjects(floor),
    ...buildStairObjects(floor, floorLevel, landings, landingElevationMap),
    ...buildLandingObjects(floor, floorLevel, landingElevationMap),
    ...buildDoorObjects(wallContexts),
    ...buildWindowObjects(wallContexts),
  ];
}
