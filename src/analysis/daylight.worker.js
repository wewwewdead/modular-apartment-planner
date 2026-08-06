/**
 * Worker wrapper for the Monte Carlo daylight grid.
 *
 * The grid is seconds of work for a floor of rooms, which on the main thread
 * would freeze the canvas for exactly as long. Everything it needs is plain
 * data — the analysis modules import nothing from the store or the DOM — so it
 * moves across the postMessage boundary unchanged.
 *
 * All the logic lives in `daylightRunner`; this file only marshals. That keeps
 * the study testable in plain Node, where there is no `Worker` at all.
 */

import { computeDaylightGrids } from './daylightRunner';

/**
 * Grids come back as typed arrays inside plain objects. Collecting their
 * buffers lets `postMessage` transfer them instead of structured-cloning a few
 * megabytes of floats back across the boundary.
 */
function transferablesOf(result) {
  const buffers = [];
  for (const room of result?.rooms || []) {
    if (!room.grid) continue;
    buffers.push(room.grid.values.buffer, room.grid.mask.buffer);
  }
  return buffers;
}

self.onmessage = (event) => {
  const { id, project, daylight, floorId } = event.data || {};

  try {
    const result = computeDaylightGrids({ project, daylight, floorId }, (progress) =>
      self.postMessage({ id, type: 'progress', progress }),
    );
    self.postMessage({ id, type: 'result', result }, transferablesOf(result));
  } catch (error) {
    // A study that fails must say so rather than leaving the panel spinning
    // forever on a promise nobody will settle.
    self.postMessage({ id, type: 'error', message: error?.message || 'Daylight study failed.' });
  }
};
