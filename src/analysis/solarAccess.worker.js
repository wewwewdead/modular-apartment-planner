/**
 * Worker wrapper for the solar access study.
 *
 * Thousands of sensors against hundreds of sun positions is seconds of work,
 * and on the main thread that is seconds of frozen canvas. Everything the study
 * needs is plain data — the analysis modules import nothing from the store, the
 * DOM or a renderer — so it crosses the postMessage boundary unchanged.
 *
 * All the logic lives in `solarAccessRunner`; this file only marshals, which
 * keeps the study testable in plain Node where there is no `Worker` at all.
 */

import { computeSolarAccess } from './solarAccessRunner';

/**
 * The per-sensor results are typed arrays, often a megabyte or two. Handing
 * their buffers to `postMessage` transfers them instead of copying.
 */
function transferablesOf(result) {
  const sensors = result?.sensors;
  if (!sensors) return [];
  return [
    sensors.positions.buffer,
    sensors.normals.buffer,
    sensors.areas.buffer,
    sensors.surfaceIds.buffer,
    sensors.heights.buffer,
    sensors.sunHours.buffer,
    sensors.irradiation.buffer,
    sensors.skyView.buffer,
  ];
}

self.onmessage = (event) => {
  const { id, project, solarAccess } = event.data || {};

  try {
    const result = computeSolarAccess({ project, solarAccess }, (progress) =>
      self.postMessage({ id, type: 'progress', progress }),
    );
    self.postMessage({ id, type: 'result', result }, result ? transferablesOf(result) : []);
  } catch (error) {
    // A study that fails must say so rather than leaving the panel spinning
    // forever on a promise nobody will settle.
    self.postMessage({ id, type: 'error', message: error?.message || 'Solar study failed.' });
  }
};
