import { computeWindStudy } from './windRunner';

/**
 * Buffers `postMessage` may hand over instead of copying.
 *
 * Every entry is a typed array the runner built and nothing else holds: after
 * the post, the worker's copies are detached, which is safe precisely because
 * the worker returns the whole result and keeps none of it. Anything that is
 * NOT solely owned by the result — an input the caller still needs, or a view
 * onto a buffer the worker reads again — must stay off this list.
 *
 * The `Set` is the ownership guard, not a tidiness measure: transferring one
 * buffer twice is a DataCloneError, and two of these fields can legitimately be
 * views of the same allocation. `grid.amplification` and
 * `representativeFlow.amplification` are separate arrays today, but the comfort
 * result's per-sector fields are copies of the same sector runs, so the
 * invariant is worth enforcing rather than assuming.
 *
 * Exported so the list can be unit-tested. A worker module has no callable
 * surface of its own, and getting this wrong fails only at run time in a real
 * `Worker` — the most expensive place to find out.
 */
export function transferablesOf(result) {
  const grid = result?.grid;
  if (!grid) return [];
  const arrays = [
    grid.obstacles,
    grid.amplification,
    grid.velocityX,
    grid.velocityY,
    grid.pressureCoefficient,
    grid.comfortSpeed,
    grid.safetySpeed,
    grid.categories,
    grid.unsafe,
    grid.counts,
    result?.sectorPressureCoefficients,
    result?.representativeFlow?.amplification,
    result?.representativeFlow?.velocityX,
    result?.representativeFlow?.velocityY,
    result?.representativeFlow?.pressureCoefficient,
  ].filter(Boolean);
  return [...new Set(arrays.map((array) => array.buffer))];
}

// Installed only where there is a worker global to install it on. Importing
// this module in node — which is what lets the marshalling above be tested at
// all — must not throw on a missing `self`.
if (typeof self !== 'undefined') {
  self.onmessage = (event) => {
    const { id, project, windStudy, phaseScope } = event.data || {};
    try {
      const result = computeWindStudy({ project, windStudy, phaseScope }, (progress) =>
        self.postMessage({ id, type: 'progress', progress }),
      );
      self.postMessage({ id, type: 'result', result }, transferablesOf(result));
    } catch (error) {
      self.postMessage({ id, type: 'error', message: error?.message || 'Wind study failed.' });
    }
  };
}
