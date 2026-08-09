/**
 * Worker wrapper for the day-scale half of the sun and shadow study.
 *
 * "All day" and "Sun hours" cast shadows for every sampled sun position and
 * union or grid the lot — hundreds of milliseconds on a real plan, and on the
 * main thread that is a frozen canvas on every edit. Everything the study needs
 * is plain data — the analysis modules import nothing from the store, the DOM
 * or a renderer — so it crosses the postMessage boundary unchanged.
 *
 * Only the day-scale study runs here. The instant shadow stays on the main
 * thread, where it costs milliseconds per scrubber step and a worker round-trip
 * would only add latency.
 *
 * All the logic lives in `sunStudyRunner`; this file only marshals, which keeps
 * the study testable in plain Node where there is no `Worker` at all.
 */

import { computeDayStudy } from './sunStudyRunner';

/**
 * The sun-hours grid carries typed arrays, one slot per cell. Handing their
 * buffers to `postMessage` transfers them instead of copying.
 */
function transferablesOf(result) {
  const grid = result?.grid;
  if (!grid) return [];

  const buffers = [];
  for (const view of [grid.hours, grid.mask, grid.assessedAreas]) {
    if (ArrayBuffer.isView(view) && !buffers.includes(view.buffer)) buffers.push(view.buffer);
  }
  return buffers;
}

self.onmessage = (event) => {
  const { id, project, sunStudy } = event.data || {};

  try {
    const result = computeDayStudy({ project, sunStudy });
    self.postMessage({ id, type: 'result', result }, transferablesOf(result));
  } catch (error) {
    // A study that fails must say so rather than leaving the panel spinning
    // forever on a promise nobody will settle.
    self.postMessage({ id, type: 'error', message: error?.message || 'Sun study failed.' });
  }
};
