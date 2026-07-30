import { GRID_MINOR } from '@/domain/defaults';

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
