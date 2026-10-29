import { getFloorElevation, getFloorStackBounds, getOrderedFloors, resolveProjectFloor } from '@/domain/floorModels';
import { computeLandingElevation } from '@/geometry/landingGeometry';
import { buildRailingSectionElements } from '@/geometry/railingSectionGeometry';
import { buildRoofSectionElements } from '@/geometry/roofSectionGeometry';
import { buildTrussSectionElements } from '@/geometry/trussSectionGeometry';
import { buildStairRoofAccessSectionElement } from '@/geometry/roofAccessGeometry';
import { sectionCutLength } from '@/geometry/sectionCutGeometry';
import { SECTION_VISIBILITY_REASONS } from './diagnostics';
import { buildFloorSectionGeometry } from './floorGeometry';
import { buildCeilingSectionElements } from './ceilingGeometry';
import { buildStairElevationContexts } from '@/three/scene/objectBuilders';
import { resolveSectionViewDepth } from './viewDepth';

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

function buildFloorSectionElements(floor, sectionCut, roofSystem = null, stairContexts = []) {
  const floorElevation = getFloorElevation(floor);
  const landings = floor.landings || [];
  const stairs = floor.stairs || [];

  const landingElevationMap = new Map(landings.map((l) => [l.id, resolveLandingElevation(l, stairs, floorElevation)]));
  const railingElements = buildRailingSectionElements(floor, sectionCut, { stairContexts });

  return {
    rectElements: [
      ...buildFloorSectionGeometry(floor, sectionCut, landingElevationMap),
      ...(railingElements.rectElements || []),
    ],
    polygonElements: railingElements.polygonElements || [],
    lineElements: railingElements.lineElements || [],
    stairElements: [
      ...(roofSystem
        ? stairs
            .map((stair) =>
              buildStairRoofAccessSectionElement({
                stair,
                floor,
                roofSystem,
                sectionCut,
                landingElevationMap,
              }),
            )
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
  const viewDepth = resolveSectionViewDepth(floors, sectionCut, project, roofSystem);
  sectionCut = { ...sectionCut, depth: viewDepth.depth };

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

  const stairContexts = buildStairElevationContexts(floors);
  for (const floor of floors) {
    const floorElements = buildFloorSectionElements(floor, sectionCut, roofSystem, stairContexts);
    rectElements.push(...floorElements.rectElements);
    rectElements.push(...buildCeilingSectionElements(project, floor.id, sectionCut));
    polygonElements.push(...(floorElements.polygonElements || []));
    lineElements.push(...(floorElements.lineElements || []));
    stairElements.push(...floorElements.stairElements);
    railingDiagnostics = mergeVisibilityDiagnostics(railingDiagnostics, floorElements.diagnostics?.railing);
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
    if (a.renderMode !== b.renderMode) return a.renderMode === 'cut' ? -1 : 1;
    return b.depth - a.depth;
  });

  const sortedPolygonElements = polygonElements.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'cut' ? -1 : 1;
    return b.depth - a.depth;
  });

  const sortedStairElements = stairElements.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'cut' ? -1 : 1;
    return b.depth - a.depth;
  });

  const sortedLineElements = lineElements.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'cut' ? -1 : 1;
    return (b.depth || 0) - (a.depth || 0);
  });

  return {
    viewKey: 'section_view',
    sectionCutId: sectionCut.id,
    viewDepth,
    title: title || sectionCut.label || 'Section',
    rectElements: sortedRectElements,
    polygonElements: sortedPolygonElements,
    stairElements: sortedStairElements,
    lineElements: sortedLineElements,
    bounds: computeSceneBounds(
      sortedRectElements,
      sortedStairElements,
      sectionCut,
      stackBounds.minElevation,
      sortedPolygonElements,
      sortedLineElements,
    ),
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
  const sectionCut = sectionCutId ? cuts.find((entry) => entry.id === sectionCutId) : cuts[0] || null;
  if (!sectionCut) return null;

  return buildSectionSceneFromFloors(
    getOrderedFloors(project),
    sectionCut,
    sectionCut.label || 'Section',
    project.roofSystem || null,
    project,
  );
}
