import { getFloorElevation, getFloorStackBounds, getOrderedFloors, resolveProjectFloor } from '@/domain/floorModels';
import { getProjectTrussSystems } from '@/domain/trussModels';
import { resolveWallVerticalSpan } from '@/domain/wallFit';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { computeLandingElevation, landingOutline } from '@/geometry/landingGeometry';
import { buildRailingElevationElements } from '@/geometry/railingElevationGeometry';
import { buildRoofElevationElements } from '@/geometry/roofElevationGeometry';
import { buildTrussElevationElements } from '@/geometry/trussElevationGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { doorOutlineOnWall, windowOutlineOnWall } from '@/geometry/wallGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getSlabBottomLevel, getSlabTopLevel } from './slab';
import { getElevationView, projectElevationEdge } from './projection';

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
    depthSlope: projection.depthSlope,
    depthIntercept: projection.depthIntercept,
    style: options.style || category,
    sourceId: options.sourceId || null,
  };
}

function buildPrismFaces(id, category, outline, view, bottom, top, options = {}) {
  return outline.flatMap((point, index) => {
    const face = createSceneRect(
      `${id}-face-${index}`,
      category,
      projectElevationEdge(view, point, outline[(index + 1) % outline.length]),
      bottom,
      top,
      options,
    );
    return face ? [face] : [];
  });
}

function buildWallRects(floor, view) {
  return (floor.walls || []).flatMap((wall) => {
    const renderData = getWallRenderData(wall, floor.columns || []);
    const span = resolveWallVerticalSpan(wall, floor);
    return buildPrismFaces(`wall-elev-${wall.id}`, 'wall', renderData.outline, view, span.base, span.top, {
      sourceId: wall.id,
    });
  });
}

function buildSlabRects(floor, view) {
  return (floor.slabs || []).flatMap((slab) => {
    const slabTop = getSlabTopLevel(slab);
    const slabBottom = getSlabBottomLevel(slab);

    return buildPrismFaces(`slab-elev-${slab.id}`, 'slab', slab.boundaryPoints || [], view, slabBottom, slabTop, {
      sourceId: slab.id,
    });
  });
}

function buildColumnRects(floor, view) {
  const floorElevation = getFloorElevation(floor);
  return (floor.columns || [])
    .flatMap((column) =>
      buildPrismFaces(
        `column-elev-${column.id}`,
        'column',
        columnOutline(column),
        view,
        floorElevation,
        floorElevation + column.height,
        { sourceId: column.id },
      ),
    )
    .filter(Boolean);
}

function buildBeamRects(floor, view) {
  return (floor.beams || [])
    .flatMap((beam) => {
      const renderData = getBeamRenderData(beam, floor.columns || []);
      if (!renderData) return [];
      return buildPrismFaces(
        `beam-elev-${beam.id}`,
        'beam',
        renderData.outline,
        view,
        beam.floorLevel - beam.depth,
        beam.floorLevel,
        { sourceId: beam.id },
      );
    })
    .filter(Boolean);
}

function buildStairRects(floor, view, landingElevationMap) {
  const floorElevation = getFloorElevation(floor);
  return (floor.stairs || [])
    .flatMap((stair) => {
      const renderData = getStairRenderData(stair);
      if (!renderData?.outline?.length) return [];

      let baseElevation = floorElevation;
      if (stair.startLandingAttachment) {
        const elev = landingElevationMap?.get(stair.startLandingAttachment.landingId);
        if (elev != null) {
          baseElevation = floorElevation + elev;
        }
      }

      const dx = (renderData.endPoint.x - renderData.startPoint.x) / stair.numberOfRisers;
      const dy = (renderData.endPoint.y - renderData.startPoint.y) / stair.numberOfRisers;
      // Match the treads in the 3D model, including the open space below a flight.
      return renderData.treads.flatMap((tread, index) =>
        buildPrismFaces(
          `stair-elev-${stair.id}-${index}`,
          'stair',
          [
            tread.start,
            { x: tread.start.x + dx, y: tread.start.y + dy },
            { x: tread.end.x + dx, y: tread.end.y + dy },
            tread.end,
          ],
          view,
          baseElevation + index * stair.riserHeight,
          baseElevation + (index + 1) * stair.riserHeight,
          { sourceId: stair.id },
        ),
      );
    })
    .filter(Boolean);
}

function buildLandingRects(floor, view, landingElevationMap) {
  return (floor.landings || []).flatMap((landing) => {
    const bottom = getFloorElevation(floor) + (landingElevationMap.get(landing.id) || 0);
    return buildPrismFaces(
      `landing-elev-${landing.id}`,
      'landing',
      landingOutline(landing),
      view,
      bottom,
      bottom + (landing.thickness ?? 200),
      { sourceId: landing.id, style: 'slab' },
    );
  });
}

function openingProjection(view, info) {
  // Project the opening's broad face, never its wall-thickness footprint.
  // An edge-on window must disappear instead of becoming a narrow stripe.
  const faces = [
    [info.p1, info.p2],
    [info.p4, info.p3],
  ]
    .map(([a, b]) => projectElevationEdge(view, a, b))
    .filter(Boolean);
  return faces.sort((a, b) => a.depth - b.depth)[0] || null;
}

function buildDoorRects(floor, view) {
  return (floor.doors || [])
    .map((door) => {
      const wall = (floor.walls || []).find((entry) => entry.id === door.wallId);
      if (!wall) return null;
      const info = doorOutlineOnWall(getWallRenderData(wall, floor.columns || []).bodyWall, door);
      // Measured off the wall's floor datum, so an opening follows its host
      // wall up a plinth beam without following a bypass wall down past the
      // deck — a door is on the floor whatever the wall does around it.
      const sill = resolveWallVerticalSpan(wall, floor).datum + (door.sillHeight ?? 0);
      const rect = createSceneRect(
        `door-elev-${door.id}`,
        'door',
        openingProjection(view, info),
        sill,
        sill + (door.height ?? 0),
        { sourceId: door.id },
      );
      return rect ? { ...rect, openingType: door.type, actualWidth: door.width } : null;
    })
    .filter(Boolean);
}

function buildWindowRects(floor, view) {
  return (floor.windows || [])
    .map((windowItem) => {
      const wall = (floor.walls || []).find((entry) => entry.id === windowItem.wallId);
      if (!wall) return null;
      const info = windowOutlineOnWall(getWallRenderData(wall, floor.columns || []).bodyWall, windowItem);
      const sill = resolveWallVerticalSpan(wall, floor).datum + (windowItem.sillHeight ?? 0);
      const rect = createSceneRect(
        `window-elev-${windowItem.id}`,
        'window',
        openingProjection(view, info),
        sill,
        sill + (windowItem.height ?? 0),
        { sourceId: windowItem.id },
      );
      return rect ? { ...rect, openingType: windowItem.type, actualWidth: windowItem.width } : null;
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

  const landingElevationMap = new Map(landings.map((l) => [l.id, resolveLandingElevation(l, stairs, floorElevation)]));
  const railingElements = buildRailingElevationElements(floor, view);

  return {
    elements: [
      ...buildWallRects(floor, view),
      ...buildSlabRects(floor, view),
      ...buildColumnRects(floor, view),
      ...buildBeamRects(floor, view),
      ...buildStairRects(floor, view, landingElevationMap),
      ...buildLandingRects(floor, view, landingElevationMap),
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
  const floorElevationContent = floors.map((floor) => buildFloorElevationElements(floor, view));
  const floorElements = floorElevationContent
    .flatMap((content) => content.elements || [])
    .sort((a, b) => b.depth - a.depth);
  const floorLineElements = floorElevationContent.flatMap((content) => content.lineElements || []);
  const trussLineElements = project
    ? floors.flatMap(
        (floor) => buildTrussElevationElements(getProjectTrussSystems(project, floor.id), view).lineElements || [],
      )
    : [];
  const roofElements = roofSystem
    ? buildRoofElevationElements(roofSystem, view)
    : { elements: [], polygonElements: [], lineElements: [] };
  const elements = [...floorElements, ...(roofElements.elements || [])].sort((a, b) => b.depth - a.depth);
  const polygonElements = [...(roofElements.polygonElements || [])].sort((a, b) => b.depth - a.depth);
  const lineElements = [...floorLineElements, ...trussLineElements, ...(roofElements.lineElements || [])].sort(
    (a, b) => b.depth - a.depth,
  );

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
  const elements = [...(roofElements.elements || [])].sort((a, b) => b.depth - a.depth);
  const polygonElements = [...(roofElements.polygonElements || [])].sort((a, b) => b.depth - a.depth);
  const lineElements = [...(roofElements.lineElements || [])].sort((a, b) => b.depth - a.depth);
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
