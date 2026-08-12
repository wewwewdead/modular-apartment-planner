import { distance } from './point';
import { distanceToSegment } from './line';

/**
 * World-space geometry of a structural grid's axis lines and end bubbles.
 * Mirrors the drawing math in StructuralGridOverlay (extension formula,
 * bubble radius) so hit-testing agrees with what is on screen — the overlay
 * itself stays pointer-transparent and all picking happens in model space.
 */
export const GRID_AXIS_BUBBLE_RADIUS = 180;

function axisRange(axes, orientation) {
  const offsets = axes.filter((axis) => axis.orientation === orientation).map((axis) => axis.offset);
  return offsets.length ? { min: Math.min(...offsets), max: Math.max(...offsets) } : { min: 0, max: 0 };
}

export function gridAxisSegments(grid) {
  const axes = grid.axes || [];
  const xRange = axisRange(axes, 'vertical');
  const yRange = axisRange(axes, 'horizontal');
  const extension = Math.max(700, Math.max(xRange.max - xRange.min, yRange.max - yRange.min) * 0.08);
  const radians = ((grid.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const originX = grid.origin?.x || 0;
  const originY = grid.origin?.y || 0;
  const toWorld = (point) => ({
    x: originX + point.x * cos - point.y * sin,
    y: originY + point.x * sin + point.y * cos,
  });

  return axes.map((axis) => {
    const vertical = axis.orientation === 'vertical';
    const crossRange = vertical ? yRange : xRange;
    const start = vertical
      ? { x: axis.offset, y: crossRange.min - extension }
      : { x: crossRange.min - extension, y: axis.offset };
    const end = vertical
      ? { x: axis.offset, y: crossRange.max + extension }
      : { x: crossRange.max + extension, y: axis.offset };
    return { axisId: axis.id, start: toWorld(start), end: toWorld(end) };
  });
}

/** The labelled circles at the ends of every axis — the grid's grab handles. */
export function hitTestGridBubbles(modelPos, gridSystems = [], tolerance = 0) {
  for (const grid of gridSystems) {
    for (const segment of gridAxisSegments(grid)) {
      if (
        distance(modelPos, segment.start) <= GRID_AXIS_BUBBLE_RADIUS + tolerance ||
        distance(modelPos, segment.end) <= GRID_AXIS_BUBBLE_RADIUS + tolerance
      ) {
        return { id: grid.id, type: 'structuralGrid' };
      }
    }
  }
  return null;
}

/**
 * The dashed axis lines themselves. Callers should try this only after every
 * other plan entity has missed: grid lines run along wall centrelines by
 * design, so giving them earlier priority would steal wall clicks.
 */
export function hitTestGridLines(modelPos, gridSystems = [], tolerance = 0) {
  for (const grid of gridSystems) {
    for (const segment of gridAxisSegments(grid)) {
      if (distanceToSegment(modelPos, segment.start, segment.end) <= tolerance) {
        return { id: grid.id, type: 'structuralGrid' };
      }
    }
  }
  return null;
}
