const MIN_ZOOM = 0.002;
const MAX_ZOOM = 200;

export function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

export function worldToScreen(point, viewport) {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

export function getNextZoom(currentZoom, deltaY) {
  const zoomFactor = Math.exp(-deltaY * 0.0015);
  return clampZoom(currentZoom * zoomFactor);
}

export function zoomAtPoint(viewport, screenPoint, nextZoom) {
  const worldPoint = screenToWorld(screenPoint, viewport);

  return {
    zoom: nextZoom,
    panX: screenPoint.x - worldPoint.x * nextZoom,
    panY: screenPoint.y - worldPoint.y * nextZoom,
  };
}

export function pixelsToWorldUnits(pixelValue, zoom) {
  return pixelValue / zoom;
}

export function calculateDistance(pointA, pointB) {
  return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
}

export function getMidpoint(pointA, pointB) {
  return {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
  };
}

export function getVector(fromPoint, toPoint) {
  return {
    x: toPoint.x - fromPoint.x,
    y: toPoint.y - fromPoint.y,
  };
}

export function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y);

  if (!length) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

export function projectPointFromStart(startPoint, targetPoint, distance) {
  const direction = normalizeVector(getVector(startPoint, targetPoint));

  return {
    x: startPoint.x + direction.x * distance,
    y: startPoint.y + direction.y * distance,
  };
}

export function applyOrthoPoint(startPoint, point) {
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: point.x,
      y: startPoint.y,
    };
  }

  return {
    x: startPoint.x,
    y: point.y,
  };
}

export function roundWorldValue(value) {
  return Math.round(value * 10) / 10;
}
