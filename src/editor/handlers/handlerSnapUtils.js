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

/**
 * What a double-click on an outline tool (slab, ceiling, roof opening) does,
 * read from the corner list as the double-click finds it.
 *
 * - `commit`: three corners or more once the repeat is dropped. The outline is
 *   finished on `points`.
 * - `keep`: fewer than that. The repeat the second press stacked on the last
 *   corner is dropped and the outline goes on from `points`; left in, it would
 *   be committed later as an edge of no length.
 * - `clear`: one corner or none before anything is dropped. That one corner was
 *   put down by the second press alone: the first press closed the outline on
 *   its first corner and the second started a new one on the same spot, which
 *   nobody asked for.
 */
export function settleOutlineDoubleClick(points, tolerance) {
  if ((points || []).length <= 1) return { action: 'clear', points: [] };
  const kept = dropTrailingRepeatedPoints(points, tolerance);
  return { action: kept.length >= 3 ? 'commit' : 'keep', points: kept };
}
