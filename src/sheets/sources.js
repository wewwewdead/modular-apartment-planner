import { buildElevationAnnotationScene } from '@/elevations/annotations';
import { buildProjectElevationScene } from '@/elevations/scene';
import { getDefaultActiveFloorId, resolveProjectFloor } from '@/domain/floorModels';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { landingOutline } from '@/geometry/landingGeometry';
import { getSectionCutRenderData } from '@/geometry/sectionCutGeometry';
import { getSlabRenderData } from '@/geometry/slabGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { fixtureOutline } from '@/geometry/fixtureGeometry';
import { doorOutlineOnWall, windowOutlineOnWall } from '@/geometry/wallGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { buildProjectSectionScene } from '@/sections/scene';

const PLAN_PADDING = 1500;
const VERTICAL_PADDING = 700;
const TOP_PADDING = 1100;

function boundsFromPoints(points = [], fallback = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 }) {
  if (!points.length) return fallback;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function expandBounds(bounds, paddingX, paddingY = paddingX) {
  return {
    minX: bounds.minX - paddingX,
    maxX: bounds.maxX + paddingX,
    minY: bounds.minY - paddingY,
    maxY: bounds.maxY + paddingY,
  };
}

function collectPlanPoints(floor) {
  const points = [];

  for (const wall of floor.walls || []) {
    points.push(...(getWallRenderData(wall, floor.columns || []).outline || []));
  }
  for (const room of floor.rooms || []) {
    points.push(...(room.points || []));
  }
  for (const beam of floor.beams || []) {
    const renderData = getBeamRenderData(beam, floor.columns || []);
    if (renderData?.outline) points.push(...renderData.outline);
  }
  for (const stair of floor.stairs || []) {
    const renderData = getStairRenderData(stair);
    if (renderData?.outline) points.push(...renderData.outline);
  }
  for (const landing of floor.landings || []) {
    points.push(...landingOutline(landing));
  }
  for (const column of floor.columns || []) {
    points.push(...columnOutline(column));
  }
  for (const slab of (floor.slabs || [])) {
    const rd = getSlabRenderData(slab);
    if (rd?.boundaryPoints) points.push(...rd.boundaryPoints);
  }
  for (const sc of (floor.sectionCuts || [])) {
    points.push(sc.startPoint, sc.endPoint);
    const renderData = getSectionCutRenderData(sc);
    if (renderData?.arrow) {
      points.push(renderData.arrow.shaftStart, renderData.arrow.shaftEnd, renderData.arrow.headA, renderData.arrow.headB);
    }
  }

  for (const door of floor.doors || []) {
    const wall = (floor.walls || []).find((entry) => entry.id === door.wallId);
    if (!wall) continue;
    const outline = doorOutlineOnWall(wall, door);
    points.push(outline.p1, outline.p2, outline.p3, outline.p4);
  }

  for (const windowItem of floor.windows || []) {
    const wall = (floor.walls || []).find((entry) => entry.id === windowItem.wallId);
    if (!wall) continue;
    const outline = windowOutlineOnWall(wall, windowItem);
    points.push(outline.p1, outline.p2, outline.p3, outline.p4);
  }

  for (const fixture of floor.fixtures || []) {
    points.push(...fixtureOutline(fixture));
  }

  return points;
}

function buildPlanSource(floor) {
  if (!floor) {
    return {
      kind: 'empty',
      title: 'Plan',
      message: 'Missing floor.',
      bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1500 },
    };
  }

  const geometryBounds = expandBounds(boundsFromPoints(collectPlanPoints(floor)), PLAN_PADDING);

  return {
    kind: 'plan',
    title: `${floor.name} Plan`,
    floor,
    bounds: geometryBounds,
  };
}

function sceneBoundsToRenderBounds(scene) {
  return {
    minX: scene.bounds.minX - VERTICAL_PADDING,
    maxX: scene.bounds.maxX + VERTICAL_PADDING,
    minY: -scene.bounds.maxZ - TOP_PADDING,
    maxY: -scene.bounds.minZ + VERTICAL_PADDING,
  };
}

function buildSectionSource(project, floor, sourceRefId) {
  const cuts = floor?.sectionCuts || [];
  const sectionCut = sourceRefId
    ? cuts.find(s => s.id === sourceRefId)
    : cuts[0] || null;

  if (!sectionCut) {
    return {
      kind: 'empty',
      title: 'Section',
      message: 'No section cut on this floor.',
      bounds: { minX: 0, maxX: 2000, minY: -3000, maxY: 1000 },
    };
  }

  const scene = buildProjectSectionScene(project, floor.id, sectionCut.id);
  return {
    kind: 'section',
    title: sectionCut.label || 'Section',
    floor,
    scene,
    bounds: sceneBoundsToRenderBounds(scene),
  };
}

function buildElevationSource(project, floor, sourceView) {
  if (!floor) {
    return {
      kind: 'empty',
      title: 'Elevation',
      message: 'Missing floor.',
      bounds: { minX: 0, maxX: 2000, minY: -3000, maxY: 1000 },
    };
  }

  const scene = buildProjectElevationScene(project, floor.id, sourceView);
  const annotationScene = buildElevationAnnotationScene(floor, scene);

  return {
    kind: 'elevation',
    title: scene.title,
    floor,
    viewMode: sourceView,
    scene,
    annotationScene,
    bounds: sceneBoundsToRenderBounds(scene),
  };
}

function build3DPreviewSource(project, floor) {
  if (!floor) {
    return {
      kind: 'empty',
      title: 'Axonometric View',
      message: 'Missing floor.',
      bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1500 },
    };
  }

  // Use 16:10 aspect ratio matching render resolution (1600x1000).
  // At scale 100, this fills a 160x100mm viewport on paper.
  const imageWidth = 16000;
  const imageHeight = 10000;

  return {
    kind: '3d_preview',
    title: 'Axonometric View',
    project,
    activeFloorId: floor.id,
    bounds: {
      minX: 0,
      maxX: imageWidth,
      minY: 0,
      maxY: imageHeight,
    },
  };
}

export function resolveSheetViewportSource(project, viewport) {
  const defaultFloorId = getDefaultActiveFloorId(project, viewport.sourceFloorId);
  const floor = resolveProjectFloor(project, defaultFloorId);

  switch (viewport.sourceView) {
    case '3d_preview':
      return build3DPreviewSource(project, floor);
    case 'section':
      return buildSectionSource(project, floor, viewport.sourceRefId);
    case 'elevation_front':
    case 'elevation_rear':
    case 'elevation_left':
    case 'elevation_right':
      return buildElevationSource(project, floor, viewport.sourceView);
    case 'plan':
    default:
      return buildPlanSource(floor);
  }
}

export function getViewportSourceLabel(sourceView) {
  switch (sourceView) {
    case '3d_preview':
      return 'Axonometric View';
    case 'section':
      return 'Section';
    case 'elevation_front':
      return 'Front Elevation';
    case 'elevation_rear':
      return 'Rear Elevation';
    case 'elevation_left':
      return 'Left Elevation';
    case 'elevation_right':
      return 'Right Elevation';
    case 'plan':
    default:
      return 'Plan';
  }
}
