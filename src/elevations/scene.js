import { getFloorElevation, getFloorStackBounds, getOrderedFloors, resolveProjectFloor } from '@/domain/floorModels';
import { getProjectTrussSystems } from '@/domain/trussModels';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { computeLandingElevation } from '@/geometry/landingGeometry';
import { buildRailingElevationElements } from '@/geometry/railingElevationGeometry';
import { buildRoofElevationElements } from '@/geometry/roofElevationGeometry';
import { buildTrussElevationElements } from '@/geometry/trussElevationGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { doorOutlineOnWall, windowOutlineOnWall } from '@/geometry/wallGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { buildSlabElevationBands, getSlabBottomLevel, getSlabTopLevel } from './slab';
import { getElevationView, projectPlanPoints } from './projection';

function createSceneRect(id, category, projection, bottom, top, options = {}) {
  if (!projection) return null;
  if (Math.abs(projection.right - projection.left) < 1e-6) return null;
  if (Math.abs(top - bottom) < 1e-6) return null;

  return {
    id,
    category,
    left: projection.left,
    right: projection.right,
    bottom,
    top,
    depth: projection.depth,
    style: options.style || category,
    sourceId: options.sourceId || null,
  };
}

function buildWallRects(floor, view) {
  const floorElevation = getFloorElevation(floor);
  return (floor.walls || [])
    .map((wall) => {
      const renderData = getWallRenderData(wall, floor.columns || []);
      return createSceneRect(
        `wall-elev-${wall.id}`,
        'wall',
        projectPlanPoints(view, renderData.outline),
        floorElevation,
        floorElevation + (wall.height ?? 0),
        { sourceId: wall.id }
      );
    })
    .filter(Boolean);
}

function buildSlabRects(floor, view) {
  return (floor.slabs || []).flatMap((slab) => {
    const slabTop = getSlabTopLevel(slab);
    const slabBottom = getSlabBottomLevel(slab);

    return buildSlabElevationBands(slab, view)
      .map((band) => createSceneRect(
        `slab-elev-${slab.id}-${band.edgeIndex}`,
        'slab',
        band,
        slabBottom,
        slabTop,
        { sourceId: slab.id }
      ))
      .filter(Boolean);
  });
}

function buildColumnRects(floor, view) {
  const floorElevation = getFloorElevation(floor);
  return (floor.columns || [])
    .map((column) => createSceneRect(
      `column-elev-${column.id}`,
      'column',
      projectPlanPoints(view, columnOutline(column)),
      floorElevation,
      floorElevation + column.height,
      { sourceId: column.id }
    ))
    .filter(Boolean);
}

function buildBeamRects(floor, view) {
  return (floor.beams || [])
    .map((beam) => {
      const renderData = getBeamRenderData(beam, floor.columns || []);
      if (!renderData) return null;
      return createSceneRect(
        `beam-elev-${beam.id}`,
        'beam',
        projectPlanPoints(view, renderData.outline),
        beam.floorLevel - beam.depth,
        beam.floorLevel,
        { sourceId: beam.id }
      );
    })
    .filter(Boolean);
}

function buildStairRects(floor, view, landingElevationMap) {
  const floorElevation = getFloorElevation(floor);
  return (floor.stairs || [])
    .map((stair) => {
      const renderData = getStairRenderData(stair);
      if (!renderData?.outline?.length) return null;

      let baseElevation = floorElevation;
      if (stair.startLandingAttachment) {
        const elev = landingElevationMap?.get(stair.startLandingAttachment.landingId);
        if (elev != null) {
          baseElevation = floorElevation + elev;
        }
      }

      return createSceneRect(
        `stair-elev-${stair.id}`,
        'stair',
        projectPlanPoints(view, renderData.outline),
        baseElevation,
        baseElevation + renderData.totalRise,
        { sourceId: stair.id }
      );
    })
    .filter(Boolean);
}

function buildDoorRects(floor, view) {
  const floorElevation = getFloorElevation(floor);
  return (floor.doors || [])
    .map((door) => {
      const wall = (floor.walls || []).find((entry) => entry.id === door.wallId);
      if (!wall) return null;
      const info = doorOutlineOnWall(wall, door);
      return createSceneRect(
        `door-elev-${door.id}`,
        'door',
        projectPlanPoints(view, [info.p1, info.p2, info.p3, info.p4]),
        floorElevation + (door.sillHeight ?? 0),
        floorElevation + (door.sillHeight ?? 0) + (door.height ?? 0),
        { sourceId: door.id }
      );
    })
    .filter(Boolean);
}

function buildWindowRects(floor, view) {
  const floorElevation = getFloorElevation(floor);
  return (floor.windows || [])
    .map((windowItem) => {
      const wall = (floor.walls || []).find((entry) => entry.id === windowItem.wallId);
      if (!wall) return null;
      const info = windowOutlineOnWall(wall, windowItem);
      return createSceneRect(
        `window-elev-${windowItem.id}`,
        'window',
        projectPlanPoints(view, [info.p1, info.p2, info.p3, info.p4]),
        floorElevation + (windowItem.sillHeight ?? 0),
        floorElevation + (windowItem.sillHeight ?? 0) + (windowItem.height ?? 0),
        { sourceId: windowItem.id }
      );
    })
    .filter(Boolean);
}

function computeSceneBounds(elements = [], polygonElements = [], lineElements = [], baseLevel = 0) {
  const rectXs = elements.flatMap((element) => [element.left, element.right]);
  const rectZs = elements.flatMap((element) => [element.bottom, element.top]);
  const polygonXs = polygonElements.flatMap((element) => element.points.map((point) => point.x));
  const polygonZs = polygonElements.flatMap((element) => element.points.map((point) => point.z));
  const lineXs = lineElements.flatMap((element) => [element.start?.x, element.end?.x]).filter(Number.isFinite);
  const lineZs = lineElements.flatMap((element) => [element.start?.z, element.end?.z]).filter(Number.isFinite);
  const xs = [...rectXs, ...polygonXs, ...lineXs];
  const zs = [...rectZs, ...polygonZs, ...lineZs];

  if (!xs.length || !zs.length) {
    return {
      minX: -1000,
      maxX: 1000,
      minZ: baseLevel,
      maxZ: baseLevel + 3000,
    };
  }

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Number.isFinite(baseLevel) ? Math.min(baseLevel, ...zs) : Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function resolveLandingElevation(landing, stairs, floorLevel) {
  if (landing.elevation) return landing.elevation;
  return computeLandingElevation(landing, stairs, floorLevel) - floorLevel;
}

function buildFloorElevationElements(floor, view) {
  const floorElevation = getFloorElevation(floor);
  const landings = floor.landings || [];
  const stairs = floor.stairs || [];

  const landingElevationMap = new Map(
    landings.map(l => [l.id, resolveLandingElevation(l, stairs, floorElevation)])
  );
  const railingElements = buildRailingElevationElements(floor, view);

  return {
    elements: [
      ...buildWallRects(floor, view),
      ...buildSlabRects(floor, view),
      ...buildColumnRects(floor, view),
      ...buildBeamRects(floor, view),
      ...buildStairRects(floor, view, landingElevationMap),
      ...buildDoorRects(floor, view),
      ...buildWindowRects(floor, view),
      ...(railingElements.elements || []),
    ],
    lineElements: railingElements.lineElements || [],
  };
}

function buildElevationSceneFromFloors(floors, viewMode, roofSystem = null, project = null) {
  const view = getElevationView(viewMode);
  const stackBounds = getFloorStackBounds(floors);
  const floorElevationContent = floors
    .map((floor) => buildFloorElevationElements(floor, view));
  const floorElements = floorElevationContent
    .flatMap((content) => content.elements || [])
    .sort((a, b) => b.depth - a.depth);
  const floorLineElements = floorElevationContent
    .flatMap((content) => content.lineElements || []);
  const trussLineElements = project
    ? floors.flatMap((floor) => (
      buildTrussElevationElements(getProjectTrussSystems(project, floor.id), view).lineElements || []
    ))
    : [];
  const roofElements = roofSystem
    ? buildRoofElevationElements(roofSystem, view)
    : { elements: [], polygonElements: [], lineElements: [] };
  const elements = [...floorElements, ...(roofElements.elements || [])]
    .sort((a, b) => b.depth - a.depth);
  const polygonElements = [...(roofElements.polygonElements || [])]
    .sort((a, b) => b.depth - a.depth);
  const lineElements = [
    ...floorLineElements,
    ...trussLineElements,
    ...(roofElements.lineElements || []),
  ]
    .sort((a, b) => b.depth - a.depth);

  return {
    viewKey: view.key,
    title: view.label,
    elements,
    polygonElements,
    lineElements,
    bounds: computeSceneBounds(elements, polygonElements, lineElements, stackBounds.minElevation),
    groundLevel: stackBounds.minElevation,
  };
}

export function buildElevationScene(floor, viewMode) {
  if (!floor) return null;
  return buildElevationSceneFromFloors([floor], viewMode);
}

export function buildProjectElevationScene(project, sourceFloorId, viewMode) {
  const sourceFloor = resolveProjectFloor(project, sourceFloorId);
  if (!sourceFloor) return null;
  return buildElevationSceneFromFloors(getOrderedFloors(project), viewMode, project?.roofSystem || null, project);
}

export function buildRoofOnlyElevationScene(roofSystem, viewMode) {
  if (!roofSystem) return null;

  const view = getElevationView(viewMode);
  const roofElements = buildRoofElevationElements(roofSystem, view);
  const elements = [...(roofElements.elements || [])]
    .sort((a, b) => b.depth - a.depth);
  const polygonElements = [...(roofElements.polygonElements || [])]
    .sort((a, b) => b.depth - a.depth);
  const lineElements = [...(roofElements.lineElements || [])]
    .sort((a, b) => b.depth - a.depth);
  const titleBase = roofSystem.name?.trim() || 'Roof';

  return {
    viewKey: view.key,
    title: `${titleBase} ${view.label}`,
    elements,
    polygonElements,
    lineElements,
    bounds: computeSceneBounds(elements, polygonElements, lineElements, null),
    groundLevel: null,
  };
}
