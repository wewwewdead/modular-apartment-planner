import { doorOutlineOnWall, positionOnWall, projectPointOnWall, wallAngle, wallLength, wallOutline, windowOutlineOnWall } from '@/geometry/wallGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';

const EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildOpeningDescriptor(kind, source, context) {
  const outlineInfo = kind === 'door'
    ? doorOutlineOnWall(context.sourceWall, source)
    : windowOutlineOnWall(context.sourceWall, source);

  const sourceCenterAlong = projectPointOnWall(context.sourceWall, outlineInfo.center);
  const sourceStartAlong = sourceCenterAlong - source.width / 2;
  const sourceEndAlong = sourceCenterAlong + source.width / 2;
  const clippedSourceStartAlong = clamp(sourceStartAlong, context.trimStartAlong, context.trimEndAlong);
  const clippedSourceEndAlong = clamp(sourceEndAlong, context.trimStartAlong, context.trimEndAlong);
  const visibleWidth = clippedSourceEndAlong - clippedSourceStartAlong;

  const baseElevation = context.wallBase + (source.sillHeight ?? 0);
  const topElevation = baseElevation + (source.height ?? 0);
  const visibleBaseElevation = clamp(baseElevation, context.wallBase, context.wallTop);
  const visibleTopElevation = clamp(topElevation, context.wallBase, context.wallTop);
  const visibleHeight = visibleTopElevation - visibleBaseElevation;

  if (visibleWidth <= EPSILON || visibleHeight <= EPSILON) {
    return null;
  }

  const startAlong = clippedSourceStartAlong - context.trimStartAlong;
  const endAlong = clippedSourceEndAlong - context.trimStartAlong;
  const centerAlong = (startAlong + endAlong) / 2;
  const startPoint = positionOnWall(context.renderWall, startAlong);
  const endPoint = positionOnWall(context.renderWall, endAlong);
  const centerPoint = positionOnWall(context.renderWall, centerAlong);

  return {
    id: source.id,
    kind,
    type: source.type || (kind === 'window' ? 'standard' : 'swing'),
    openDirection: source.openDirection || 'left',
    wallId: context.wall.id,
    sourceId: source.id,
    angle: wallAngle(context.renderWall),
    wallThickness: context.renderWall.thickness,
    width: source.width,
    height: source.height ?? 0,
    sillHeight: source.sillHeight ?? 0,
    startAlong,
    endAlong,
    centerAlong,
    visibleWidth,
    visibleBaseElevation,
    visibleTopElevation,
    visibleHeight,
    startPoint,
    endPoint,
    centerPoint,
    outline: wallOutline({
      start: startPoint,
      end: endPoint,
      thickness: context.renderWall.thickness,
    }),
    metadata: {
      wallId: context.wall.id,
      floorId: context.floorId,
      sourceStartAlong,
      sourceEndAlong,
      clippedSourceStartAlong,
      clippedSourceEndAlong,
    },
  };
}

export function buildWallPreviewContext(floor, wall, floorLevel) {
  const wallRenderData = getWallRenderData(wall, floor.columns || []);
  const sourceWall = wallRenderData.wall;
  const renderWall = wallRenderData.renderWall;
  const trimStartAlong = projectPointOnWall(sourceWall, renderWall.start);
  const trimEndAlong = projectPointOnWall(sourceWall, renderWall.end);
  const context = {
    floorId: floor.id,
    wall,
    sourceWall,
    renderWall,
    wallRenderData,
    trimStartAlong,
    trimEndAlong,
    renderLength: wallLength(renderWall),
    wallBase: floorLevel,
    wallTop: floorLevel + (wall.height ?? 0),
  };

  const openings = [
    ...(floor.doors || []).filter((item) => item.wallId === wall.id).map((door) => (
      buildOpeningDescriptor('door', door, context)
    )),
    ...(floor.windows || []).filter((item) => item.wallId === wall.id).map((windowItem) => (
      buildOpeningDescriptor('window', windowItem, context)
    )),
  ]
    .filter(Boolean)
    .sort((left, right) => left.startAlong - right.startAlong);

  return {
    ...context,
    openings,
  };
}

export function buildWallPreviewContexts(floor, floorLevel) {
  return (floor.walls || []).map((wall) => buildWallPreviewContext(floor, wall, floorLevel));
}

export function buildWallSolidSegments(context) {
  if (context.renderLength <= EPSILON || context.wallTop - context.wallBase <= EPSILON) {
    return [];
  }

  const segments = [];
  let cursor = 0;
  let segmentIndex = 0;

  const pushSegment = (startAlong, endAlong, baseElevation, topElevation) => {
    if (endAlong - startAlong <= EPSILON) return;
    if (topElevation - baseElevation <= EPSILON) return;

    segmentIndex += 1;
    segments.push({
      id: `${context.wall.id}-segment-${segmentIndex}`,
      wallId: context.wall.id,
      floorId: context.floorId,
      startPoint: positionOnWall(context.renderWall, startAlong),
      endPoint: positionOnWall(context.renderWall, endAlong),
      thickness: context.renderWall.thickness,
      baseElevation,
      topElevation,
    });
  };

  for (const opening of context.openings) {
    const openingStart = Math.max(cursor, opening.startAlong);
    const openingEnd = Math.max(openingStart, opening.endAlong);

    pushSegment(cursor, openingStart, context.wallBase, context.wallTop);

    if (opening.visibleBaseElevation > context.wallBase + EPSILON) {
      pushSegment(
        openingStart,
        openingEnd,
        context.wallBase,
        Math.min(opening.visibleBaseElevation, context.wallTop)
      );
    }

    if (opening.visibleTopElevation < context.wallTop - EPSILON) {
      pushSegment(
        openingStart,
        openingEnd,
        Math.max(opening.visibleTopElevation, context.wallBase),
        context.wallTop
      );
    }

    cursor = Math.max(cursor, openingEnd);
  }

  pushSegment(cursor, context.renderLength, context.wallBase, context.wallTop);
  return segments;
}
