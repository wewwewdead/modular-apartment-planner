/**
 * Drives the Monte Carlo daylight grid on a worker.
 *
 * The split-flux study runs synchronously in a `useMemo` because it is
 * milliseconds. The grid is not: a floor of rooms is a few hundred thousand
 * rays, which on the main thread would hold the canvas still for as long as it
 * took. So it goes to a worker, and `useStudyWorker` owns the request
 * lifecycle — debounce, supersession, staleness, teardown. This hook only
 * shapes the request.
 *
 * Two things are particular to the grid rather than shared: it only runs in
 * grid mode, the average mode having no worker to drive; and it is scoped to
 * one floor, which has to reach both the request key and the worker payload or
 * a floor switch would silently reuse the previous floor's map.
 */

import { useMemo } from 'react';
import { gridSettingsOf } from '@/analysis/daylightState';
import { studyRequestKey } from '@/analysis/studyRequestIdentity';
import { useStudyWorker } from './useStudyWorker';

/**
 * Quiet period before a run starts, ms. Shorter than the wind and solar
 * studies': the grid is the one an author tunes interactively, so it is worth
 * trading a few abandoned runs for a map that keeps up.
 */
const SETTLE_MS = 350;

const UNAVAILABLE_MESSAGE = 'This browser cannot run the daylight map in the background.';

function createWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('@/analysis/daylight.worker.js', import.meta.url), { type: 'module' });
  } catch {
    // Blocked by a strict CSP, or an environment without module workers.
    return null;
  }
}

/**
 * @param {object} options
 * @param {object} options.project   Phase-filtered project.
 * @param {object} options.daylight  Editor state from `createDaylightState`.
 * @param {string} [options.floorId]
 * @returns {{study: object|null, status: string, progress: object|null, error: string|null, stale: boolean}}
 */
export function useDaylightGrid({ project, daylight, floorId = null, projectRevision = null }) {
  const active = Boolean(daylight?.enabled) && daylight?.mode === 'grid';

  // Everything a grid run depends on, as one value. The project object is
  // compared by identity: the reducer replaces it on every edit, which is
  // exactly when the grid needs redoing.
  const settings = useMemo(() => (daylight ? gridSettingsOf(daylight) : null), [daylight]);
  const requestKey = useMemo(
    () => (active ? studyRequestKey({ project, projectRevision, settings, scope: { floorId } }) : null),
    [active, floorId, project, projectRevision, settings],
  );

  // `enabled` is deliberately absent from the grid settings so that toggling
  // the panel does not invalidate a finished map. The worker is only ever asked
  // to run studies that are meant to run, so it gets it back here.
  const payload = useMemo(
    () => ({ project, daylight: { ...settings, enabled: true }, floorId }),
    [floorId, project, settings],
  );

  return useStudyWorker({
    workerFactory: createWorker,
    active,
    requestKey,
    payload,
    settleMs: SETTLE_MS,
    unavailableMessage: UNAVAILABLE_MESSAGE,
  });
}

export default useDaylightGrid;
