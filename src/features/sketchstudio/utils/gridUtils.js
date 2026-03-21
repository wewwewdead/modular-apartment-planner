import { screenToWorld } from './canvasMath';

const GRID_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

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
  const padding = major * 2;
  const extendedBounds = {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };

  const xLines = buildLinePositions(extendedBounds.minX, extendedBounds.maxX, minor);
  const yLines = buildLinePositions(extendedBounds.minY, extendedBounds.maxY, minor);

  return {
    bounds: extendedBounds,
    xMinor: xLines.filter((value) => !isMajorLine(value, major)),
    yMinor: yLines.filter((value) => !isMajorLine(value, major)),
    xMajor: buildLinePositions(extendedBounds.minX, extendedBounds.maxX, major),
    yMajor: buildLinePositions(extendedBounds.minY, extendedBounds.maxY, major),
  };
}
