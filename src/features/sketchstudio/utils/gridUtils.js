import { screenToWorld } from './canvasMath';

const GRID_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];

function buildLinePositions(min, max, step) {
  const positions = [];
  const start = Math.floor(min / step) * step;

  for (let value = start; value <= max; value += step) {
    positions.push(Number(value.toFixed(4)));
  }

  return positions;
}

function isMajorLine(value, majorStep) {
  const remainder = Math.abs(value % majorStep);
  return remainder < 0.0001 || Math.abs(remainder - majorStep) < 0.0001;
}

export function getGridSpacing(zoom) {
  const minor = GRID_STEPS.find((step) => step * zoom >= 24) ?? GRID_STEPS[GRID_STEPS.length - 1];

  return {
    minor,
    major: minor * 5,
  };
}

export function getVisibleWorldBounds(viewport, canvasSize) {
  if (!canvasSize.width || !canvasSize.height) {
    return {
      minX: -1000,
      minY: -1000,
      maxX: 1000,
      maxY: 1000,
    };
  }

  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
  const bottomRight = screenToWorld({ x: canvasSize.width, y: canvasSize.height }, viewport);

  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}

export function getGridLines(viewport, canvasSize) {
  const { minor, major } = getGridSpacing(viewport.zoom);
  const bounds = getVisibleWorldBounds(viewport, canvasSize);

  // Padding for line positions (which lines exist) — small extension
  const posPadding = major * 2;
  const positionBounds = {
    minX: bounds.minX - posPadding,
    maxX: bounds.maxX + posPadding,
    minY: bounds.minY - posPadding,
    maxY: bounds.maxY + posPadding,
  };

  // Line endpoints extend far beyond the viewport so they never appear cut
  const viewWidth = bounds.maxX - bounds.minX;
  const viewHeight = bounds.maxY - bounds.minY;
  const span = Math.max(viewWidth, viewHeight, major * 10);
  const lineBounds = {
    minX: bounds.minX - span,
    maxX: bounds.maxX + span,
    minY: bounds.minY - span,
    maxY: bounds.maxY + span,
  };

  const xLines = buildLinePositions(positionBounds.minX, positionBounds.maxX, minor);
  const yLines = buildLinePositions(positionBounds.minY, positionBounds.maxY, minor);

  return {
    bounds: lineBounds,
    xMinor: xLines.filter((value) => !isMajorLine(value, major)),
    yMinor: yLines.filter((value) => !isMajorLine(value, major)),
    xMajor: buildLinePositions(positionBounds.minX, positionBounds.maxX, major),
    yMajor: buildLinePositions(positionBounds.minY, positionBounds.maxY, major),
  };
}
