import { getFloorElevation, getFloorStackBounds, getOrderedFloors, resolveProjectFloor } from '@/domain/floorModels';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { computeLandingElevation } from '@/geometry/landingGeometry';
import { buildRailingSectionElements } from '@/geometry/railingSectionGeometry';
import { buildRoofSectionElements } from '@/geometry/roofSectionGeometry';
import { buildTrussSectionElements } from '@/geometry/trussSectionGeometry';
import { segmentIntersection } from '@/geometry/line';
import { pointInPolygon } from '@/geometry/polygon';
import { buildStairRoofAccessSectionElement } from '@/geometry/roofAccessGeometry';
import { projectPointToSectionCut, sectionCutLength } from '@/geometry/sectionCutGeometry';
import { getStairRenderData, stairTotalRise } from '@/geometry/stairGeometry';
import { doorOutlineOnWall, windowOutlineOnWall } from '@/geometry/wallGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getSlabBottomLevel, getSlabTopLevel } from '@/elevations/slab';
import { SECTION_VISIBILITY_REASONS } from './diagnostics';

const EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function uniqueSortedValues(values = []) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => (
    index === 0 || Math.abs(value - sorted[index - 1]) > 1e-4
  ));
}

function intervalFromValues(values, maxLength) {
  if (!values.length) return null;
  const clamped = values
    .map((value) => clamp(value, 0, maxLength))
    .filter((value) => value >= -EPSILON && value <= maxLength + EPSILON);
  if (!clamped.length) return null;

  const left = Math.min(...clamped);
  const right = Math.max(...clamped);
  if (right - left < EPSILON) return null;
  return { left, right };
}

function projectPolygon(sectionCut, polygon = []) {
  return polygon.map((point) => projectPointToSectionCut(sectionCut, point));
}

function polygonCutInterval(sectionCut, polygon = []) {
  if (polygon.length < 3) return null;

  const values = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const hit = segmentIntersection(sectionCut.startPoint, sectionCut.endPoint, start, end);
    if (hit) {
      values.push(projectPointToSectionCut(sectionCut, hit).along);
    }
  }

  if (pointInPolygon(sectionCut.startPoint, polygon)) values.push(0);
  if (pointInPolygon(sectionCut.endPoint, polygon)) values.push(sectionCutLength(sectionCut));

  return intervalFromValues(uniqueSortedValues(values), sectionCutLength(sectionCut));
}

function polygonProjectionInfo(sectionCut, polygon = [], depth) {
  if (polygon.length < 3) return null;
  const projected = projectPolygon(sectionCut, polygon);
  const alongs = projected.map((entry) => entry.along);
  const offsets = projected.map((entry) => entry.offset);
  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);

  if (maxOffset < -EPSILON || minOffset > depth + EPSILON) return null;

  return {
    interval: intervalFromValues(alongs, sectionCutLength(sectionCut)),
    depth: offsets.reduce((sum, value) => sum + Math.max(0, value), 0) / Math.max(1, offsets.length),
    minOffset,
    maxOffset,
  };
}

function createSceneRect(id, category, renderMode, interval, bottom, top, depth, sourceId) {
  if (!interval) return null;
  if (interval.right - interval.left < EPSILON) return null;
  if (Math.abs(top - bottom) < EPSILON) return null;

  return {
    id,
    category,
    renderMode,
    left: interval.left,
    right: interval.right,
    bottom,
    top,
    depth,
    sourceId,
  };
}

function createFootprintRect(id, category, sourceId, sectionCut, polygon, bottom, top, depthLimit) {
  const cutInterval = polygonCutInterval(sectionCut, polygon);
  if (cutInterval) {
    return createSceneRect(id, category, 'cut', cutInterval, bottom, top, 0, sourceId);
  }

  const projection = polygonProjectionInfo(sectionCut, polygon, depthLimit);
  if (!projection?.interval) return null;
  return createSceneRect(id, category, 'projection', projection.interval, bottom, top, projection.depth, sourceId);
}

function buildWallElements(floor, sectionCut) {
  const floorElevation = getFloorElevation(floor);
  return (floor.walls || [])
    .map((wall) => {
      const outline = getWallRenderData(wall, floor.columns || []).outline;
      return createFootprintRect(
        `section-wall-${wall.id}`,
        'wall',
        wall.id,
        sectionCut,
        outline,
        floorElevation,
        floorElevation + (wall.height ?? 0),
        sectionCut.depth
      );
    })
    .filter(Boolean);
}

function buildSlabElements(floor, sectionCut) {
  return (floor.slabs || [])
    .filter(slab => slab.boundaryPoints?.length)
    .map(slab => createFootprintRect(
      `section-slab-${slab.id}`,
      'slab',
      slab.id,
      sectionCut,
      slab.boundaryPoints,
      getSlabBottomLevel(slab),
      getSlabTopLevel(slab),
      sectionCut.depth
    ))
    .filter(Boolean);
}

function buildColumnElements(floor, sectionCut) {
  const floorElevation = getFloorElevation(floor);
  return (floor.columns || [])
    .map((column) => createFootprintRect(
      `section-column-${column.id}`,
      'column',
      column.id,
      sectionCut,
      columnOutline(column),
      floorElevation,
      floorElevation + column.height,
      sectionCut.depth
    ))
    .filter(Boolean);
}

function buildBeamElements(floor, sectionCut) {
  return (floor.beams || [])
    .map((beam) => {
      const renderData = getBeamRenderData(beam, floor.columns || []);
      if (!renderData) return null;
      return createFootprintRect(
        `section-beam-${beam.id}`,
        'beam',
        beam.id,
        sectionCut,
        renderData.outline,
        beam.floorLevel - beam.depth,
        beam.floorLevel,
        sectionCut.depth
      );
    })
    .filter(Boolean);
}

function buildDoorElements(floor, sectionCut) {
  const floorElevation = getFloorElevation(floor);
  return (floor.doors || [])
    .map((door) => {
      const wall = (floor.walls || []).find((entry) => entry.id === door.wallId);
      if (!wall) return null;
      const info = doorOutlineOnWall(wall, door);
      return createFootprintRect(
        `section-door-${door.id}`,
        'door',
        door.id,
        sectionCut,
        [info.p1, info.p2, info.p3, info.p4],
        floorElevation + (door.sillHeight ?? 0),
        floorElevation + (door.sillHeight ?? 0) + (door.height ?? 0),
        sectionCut.depth
      );
    })
    .filter(Boolean);
}

function buildWindowElements(floor, sectionCut) {
  const floorElevation = getFloorElevation(floor);
  return (floor.windows || [])
    .map((windowItem) => {
      const wall = (floor.walls || []).find((entry) => entry.id === windowItem.wallId);
      if (!wall) return null;
      const info = windowOutlineOnWall(wall, windowItem);
      return createFootprintRect(
        `section-window-${windowItem.id}`,
        'window',
        windowItem.id,
        sectionCut,
        [info.p1, info.p2, info.p3, info.p4],
        floorElevation + (windowItem.sillHeight ?? 0),
        floorElevation + (windowItem.sillHeight ?? 0) + (windowItem.height ?? 0),
        sectionCut.depth
      );
    })
    .filter(Boolean);
}

function buildStairElements(floor, sectionCut, landingElevationMap) {
  const floorElevation = getFloorElevation(floor);
  return (floor.stairs || [])
    .map((stair) => {
      const renderData = getStairRenderData(stair);
      if (!renderData) return null;

      const cutInterval = polygonCutInterval(sectionCut, renderData.outline);
      const projection = polygonProjectionInfo(sectionCut, renderData.outline, sectionCut.depth);
      const interval = cutInterval || projection?.interval;
      if (!interval) return null;

      const startProjection = projectPointToSectionCut(sectionCut, renderData.startPoint);
      const endProjection = projectPointToSectionCut(sectionCut, renderData.endPoint);
      const clampedStart = clamp(startProjection.along, 0, sectionCutLength(sectionCut));
      const clampedEnd = clamp(endProjection.along, 0, sectionCutLength(sectionCut));
      if (Math.abs(clampedEnd - clampedStart) < EPSILON) return null;

      let baseElevation = floorElevation;
      if (stair.startLandingAttachment) {
        const elev = landingElevationMap?.get(stair.startLandingAttachment.landingId);
        if (elev != null) {
          baseElevation = floorElevation + elev;
        }
      }

      const risers = Math.max(1, stair.numberOfRisers || 1);
      const rise = stairTotalRise(stair);
      const risePerRiser = rise / risers;
      const alongStep = (clampedEnd - clampedStart) / risers;
      const points = [{ x: clampedStart, z: baseElevation }];
      let currentAlong = clampedStart;
      let currentZ = baseElevation;

      for (let index = 0; index < risers; index += 1) {
        currentAlong += alongStep;
        points.push({ x: currentAlong, z: currentZ });
        currentZ += risePerRiser;
        points.push({ x: currentAlong, z: currentZ });
      }

      return {
        id: `section-stair-${stair.id}`,
        category: 'stair',
        renderMode: cutInterval ? 'cut' : 'projection',
        points,
        depth: projection?.depth ?? 0,
        sourceId: stair.id,
      };
    })
    .filter(Boolean);
}

function computeSceneBounds(rects, stairs, sectionCut, baseLevel, polygons = [], lines = []) {
  const stairXs = stairs.flatMap((element) => element.points.map((point) => point.x));
  const stairZs = stairs.flatMap((element) => element.points.map((point) => point.z));
  const rectXs = rects.flatMap((element) => [element.left, element.right]);
  const rectZs = rects.flatMap((element) => [element.bottom, element.top]);
  const polygonXs = polygons.flatMap((element) => element.points.map((point) => point.x));
  const polygonZs = polygons.flatMap((element) => element.points.map((point) => point.z));
  const lineXs = lines.flatMap((element) => element.points.map((point) => point.x));
  const lineZs = lines.flatMap((element) => element.points.map((point) => point.z));
  const xs = [...rectXs, ...stairXs, ...polygonXs, ...lineXs];
  const zs = [...rectZs, ...stairZs, ...polygonZs, ...lineZs];

  if (!xs.length || !zs.length) {
    return {
      minX: 0,
      maxX: sectionCutLength(sectionCut) || 3000,
      minZ: baseLevel,
      maxZ: baseLevel + 3000,
    };
  }

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(baseLevel, ...zs),
    maxZ: Math.max(...zs),
  };
}

function resolveLandingElevation(landing, stairs, floorLevel) {
  if (landing.elevation) return landing.elevation;
  return computeLandingElevation(landing, stairs, floorLevel) - floorLevel;
}

function buildFloorSectionElements(floor, sectionCut, roofSystem = null) {
  const floorElevation = getFloorElevation(floor);
  const landings = floor.landings || [];
  const stairs = floor.stairs || [];

  const landingElevationMap = new Map(
    landings.map(l => [l.id, resolveLandingElevation(l, stairs, floorElevation)])
  );
  const railingElements = buildRailingSectionElements(floor, sectionCut);

  return {
    rectElements: [
      ...buildWallElements(floor, sectionCut),
      ...buildSlabElements(floor, sectionCut),
      ...buildColumnElements(floor, sectionCut),
      ...buildBeamElements(floor, sectionCut),
      ...buildDoorElements(floor, sectionCut),
      ...buildWindowElements(floor, sectionCut),
      ...(railingElements.rectElements || []),
    ],
    polygonElements: [],
    lineElements: railingElements.lineElements || [],
    stairElements: [
      ...buildStairElements(floor, sectionCut, landingElevationMap),
      ...(roofSystem
        ? stairs
          .map((stair) => buildStairRoofAccessSectionElement({
            stair,
            floor,
            roofSystem,
            sectionCut,
            landingElevationMap,
          }))
          .filter(Boolean)
        : []),
    ],
    diagnostics: {
      railing: railingElements.diagnostics || {
        visible: false,
        reason: SECTION_VISIBILITY_REASONS.NO_GEOMETRY,
        elementCount: 0,
      },
    },
  };
}

function mergeVisibilityDiagnostics(current, next) {
  const currentCount = current?.elementCount || 0;
  const nextCount = next?.elementCount || 0;

  if (currentCount > 0 || nextCount > 0) {
    return {
      visible: true,
      reason: SECTION_VISIBILITY_REASONS.OK,
      elementCount: currentCount + nextCount,
    };
  }

  const reasons = [current?.reason, next?.reason].filter(Boolean);
  const reason = reasons.includes(SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION)
    ? SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION
    : reasons.includes(SECTION_VISIBILITY_REASONS.MISSES_CUT)
      ? SECTION_VISIBILITY_REASONS.MISSES_CUT
      : SECTION_VISIBILITY_REASONS.NO_GEOMETRY;

  return {
    visible: false,
    reason,
    elementCount: 0,
  };
}

function buildSectionSceneFromFloors(floors, sectionCut, title = null, roofSystem = null, project = null) {
  if (!sectionCut) return null;

  const stackBounds = getFloorStackBounds(floors);
  const rectElements = [];
  const polygonElements = [];
  const stairElements = [];
  const lineElements = [];
  let roofDiagnostics = {
    visible: false,
    reason: SECTION_VISIBILITY_REASONS.NO_GEOMETRY,
    elementCount: 0,
  };
  let railingDiagnostics = {
    visible: false,
    reason: SECTION_VISIBILITY_REASONS.NO_GEOMETRY,
    elementCount: 0,
  };

  for (const floor of floors) {
    const floorElements = buildFloorSectionElements(floor, sectionCut, roofSystem);
    rectElements.push(...floorElements.rectElements);
    polygonElements.push(...(floorElements.polygonElements || []));
    lineElements.push(...(floorElements.lineElements || []));
    stairElements.push(...floorElements.stairElements);
    railingDiagnostics = mergeVisibilityDiagnostics(
      railingDiagnostics,
      floorElements.diagnostics?.railing
    );
  }

  if (roofSystem) {
    const roofElements = buildRoofSectionElements(roofSystem, sectionCut);
    rectElements.push(...roofElements.rectElements);
    polygonElements.push(...(roofElements.polygonElements || []));
    stairElements.push(...roofElements.stairElements);
    roofDiagnostics = roofElements.diagnostics || roofDiagnostics;
  }

  const trussElements = buildTrussSectionElements(project?.trussSystems || [], sectionCut);
  lineElements.push(...(trussElements.lineElements || []));

  const sortedRectElements = rectElements.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'projection' ? -1 : 1;
    return b.depth - a.depth;
  });

  const sortedPolygonElements = polygonElements.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'projection' ? -1 : 1;
    return b.depth - a.depth;
  });

  const sortedStairElements = stairElements.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'projection' ? -1 : 1;
    return b.depth - a.depth;
  });

  const sortedLineElements = lineElements.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'projection' ? -1 : 1;
    return (b.depth || 0) - (a.depth || 0);
  });

  return {
    viewKey: 'section_view',
    title: title || sectionCut.label || 'Section',
    rectElements: sortedRectElements,
    polygonElements: sortedPolygonElements,
    stairElements: sortedStairElements,
    lineElements: sortedLineElements,
    bounds: computeSceneBounds(sortedRectElements, sortedStairElements, sectionCut, stackBounds.minElevation, sortedPolygonElements, sortedLineElements),
    groundLevel: stackBounds.minElevation,
    diagnostics: {
      roof: roofDiagnostics,
      railing: railingDiagnostics,
      truss: trussElements.diagnostics || {
        visible: false,
        reason: SECTION_VISIBILITY_REASONS.NO_GEOMETRY,
        elementCount: 0,
      },
    },
  };
}

export function buildSectionScene(floor, sectionCut) {
  if (!floor || !sectionCut) return null;
  return buildSectionSceneFromFloors([floor], sectionCut, sectionCut.label || 'Section', null, null);
}

export function buildProjectSectionScene(project, sourceFloorId, sectionCutId = null) {
  const sourceFloor = resolveProjectFloor(project, sourceFloorId);
  if (!sourceFloor) return null;

  const cuts = sourceFloor.sectionCuts || [];
  const sectionCut = sectionCutId
    ? cuts.find((entry) => entry.id === sectionCutId)
    : cuts[0] || null;
  if (!sectionCut) return null;

  return buildSectionSceneFromFloors(
    getOrderedFloors(project),
    sectionCut,
    sectionCut.label || 'Section',
    project.roofSystem || null,
    project
  );
}
