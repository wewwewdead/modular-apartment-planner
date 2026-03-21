import { calculateDistance, getMidpoint, pixelsToWorldUnits } from './canvasMath';
import { formatDimensionText } from './dimensionUtils';
import { normalizeRectFromPoints } from './entityUtils';

const LABEL_OFFSET_PX = 18;

function getAngleDegrees(start, end) {
  return Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
}

function getDirection(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (!length) {
    return null;
  }

  return {
    x: dx / length,
    y: dy / length,
  };
}

function buildLinearAnnotation({ id, start, end, text, zoom }) {
  const direction = getDirection(start, end);

  if (!direction || !text) {
    return null;
  }

  const midpoint = getMidpoint(start, end);
  const normal = { x: -direction.y, y: direction.x };
  const offset = pixelsToWorldUnits(LABEL_OFFSET_PX, zoom || 1);

  return {
    id,
    text,
    x: midpoint.x + (normal.x * offset),
    y: midpoint.y + (normal.y * offset),
    angle: getAngleDegrees(start, end),
    textAnchor: 'middle',
  };
}

function buildRadiusAnnotation({ id, center, radius, text, zoom }) {
  if (!(radius > 0) || !text) {
    return null;
  }

  const offset = pixelsToWorldUnits(LABEL_OFFSET_PX, zoom || 1);

  return {
    id,
    text,
    x: center.x + radius + offset,
    y: center.y - offset,
    angle: 0,
    textAnchor: 'start',
  };
}

function getRectangleEdges(previewEntity) {
  if (previewEntity.type === 'polyline' || previewEntity.shape === 'polygon') {
    const points = previewEntity.points || [];

    if (points.length < 4) {
      return null;
    }

    return {
      width: { start: points[0], end: points[1] },
      height: { start: points[1], end: points[2] },
    };
  }

  const normalized = normalizeRectFromPoints(previewEntity.startPoint, previewEntity.endPoint);

  return {
    width: {
      start: { x: normalized.x, y: normalized.y },
      end: { x: normalized.x + normalized.width, y: normalized.y },
    },
    height: {
      start: { x: normalized.x + normalized.width, y: normalized.y },
      end: { x: normalized.x + normalized.width, y: normalized.y + normalized.height },
    },
  };
}

function buildRectangleAnnotations({ idPrefix, previewEntity, units, zoom, widthValue, heightValue }) {
  const edges = getRectangleEdges(previewEntity);

  if (!edges) {
    return [];
  }

  const widthText = formatDimensionText(widthValue ?? calculateDistance(edges.width.start, edges.width.end), units);
  const heightText = formatDimensionText(heightValue ?? calculateDistance(edges.height.start, edges.height.end), units);

  return [
    buildLinearAnnotation({
      id: `${idPrefix}-width`,
      start: edges.width.start,
      end: edges.width.end,
      text: widthText,
      zoom,
    }),
    buildLinearAnnotation({
      id: `${idPrefix}-height`,
      start: edges.height.start,
      end: edges.height.end,
      text: heightText,
      zoom,
    }),
  ].filter(Boolean);
}

export function buildDraftMeasurementAnnotations({ draft, draftPreview, units, zoom }) {
  if (!draft?.type || !draftPreview || draftPreview.type === 'dimension-guide' || draftPreview.type === 'dimension') {
    return [];
  }

  if (draft.type === 'line' && draftPreview.type === 'line') {
    return [
      buildLinearAnnotation({
        id: 'line-length',
        start: { x: draftPreview.x1, y: draftPreview.y1 },
        end: { x: draftPreview.x2, y: draftPreview.y2 },
        text: formatDimensionText(calculateDistance({ x: draftPreview.x1, y: draftPreview.y1 }, { x: draftPreview.x2, y: draftPreview.y2 }), units),
        zoom,
      }),
    ].filter(Boolean);
  }

  if (draft.type === 'polyline' && draftPreview.type === 'polyline' && draftPreview.points.length >= 2) {
    const start = draftPreview.points.at(-2);
    const end = draftPreview.points.at(-1);

    return [
      buildLinearAnnotation({
        id: 'polyline-segment',
        start,
        end,
        text: formatDimensionText(calculateDistance(start, end), units),
        zoom,
      }),
    ].filter(Boolean);
  }

  if (draft.type === 'rect') {
    return buildRectangleAnnotations({
      idPrefix: 'rect',
      previewEntity: draftPreview,
      units,
      zoom,
      widthValue: draftPreview.width,
      heightValue: draftPreview.height,
    });
  }

  if (draft.type === 'cutoutRect') {
    return buildRectangleAnnotations({
      idPrefix: 'cutout',
      previewEntity: draftPreview,
      units,
      zoom,
      widthValue: draftPreview.width,
      heightValue: draftPreview.height,
    });
  }

  if (draft.type === 'circle' && (draftPreview.type === 'circle' || draftPreview.type === 'ellipse')) {
    return [
      buildRadiusAnnotation({
        id: 'circle-radius',
        center: draftPreview.type === 'circle' ? draftPreview.center : { x: draftPreview.cx, y: draftPreview.cy },
        radius: draftPreview.radius,
        text: `R ${formatDimensionText(draftPreview.radius, units)}`,
        zoom,
      }),
    ].filter(Boolean);
  }

  if (draft.type === 'holeCircle' && draftPreview.type === 'feature') {
    const displayRadius = draftPreview.shape === 'circle'
      ? draftPreview.diameter / 2
      : Math.max(draftPreview.rx || 0, draftPreview.ry || 0);

    return [
      buildRadiusAnnotation({
        id: 'hole-diameter',
        center: { x: draftPreview.cx, y: draftPreview.cy },
        radius: displayRadius,
        text: `Dia ${formatDimensionText(draftPreview.diameter, units)}`,
        zoom,
      }),
    ].filter(Boolean);
  }

  if (draft.type === 'arc' && draftPreview.type === 'arc') {
    return [
      buildLinearAnnotation({
        id: 'arc-chord',
        start: draftPreview.start,
        end: draftPreview.end,
        text: formatDimensionText(calculateDistance(draftPreview.start, draftPreview.end), units),
        zoom,
      }),
    ].filter(Boolean);
  }

  return [];
}
