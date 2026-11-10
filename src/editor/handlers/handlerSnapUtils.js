import { GRID_MINOR } from '@/domain/defaults';
import { distance } from '@/geometry/point';

/**
 * Snap a single coordinate value to the nearest minor grid line.
 * Shared by the floorplan placement tool handlers so grid snapping stays consistent.
 */
export function snapToGrid(value) {
  return Math.round(value / GRID_MINOR) * GRID_MINOR;
}

/**
 * Resolve a model-space point, snapping both axes to the grid when snapping is enabled.
 * Returns a fresh { x, y } object so callers can safely store it in tool state.
 */
export function resolvePoint(modelPos, snapEnabled) {
  if (!snapEnabled) return { x: modelPos.x, y: modelPos.y };
  return {
    x: snapToGrid(modelPos.x),
    y: snapToGrid(modelPos.y),
  };
}

/**
 * An outline as it stands when a double-click finishes it.
 *
 * A double-click reaches a tool as press, press, then the double-click, so the
 * second press has already added the last corner a second time on top of the
 * first. Trailing corners within `tolerance` of the one before them are that
 * repeat and are dropped. Returns a new array; the input is left alone.
 */
export function dropTrailingRepeatedPoints(points, tolerance) {
  const kept = [...(points || [])];
  while (kept.length >= 2 && distance(kept[kept.length - 1], kept[kept.length - 2]) <= tolerance) {
    kept.pop();
  }
  return kept;
}
