/**
 * Drives the day-scale half of the sun study on a worker.
 *
 * The sun study was the last heavy study still computed synchronously on the
 * main thread: switching to "All day" or "Sun hours", and every edit made while
 * one of them was on, stalled the canvas for as long as the envelope or grid
 * took to build. `useStudyWorker` owns debounce, supersession, staleness and
 * teardown, exactly as it does for daylight and solar access; this hook
 * only shapes the request — and keeps two deliberate synchronous paths:
 *
 *   - **"Moment" mode never touches the worker.** Its day study is a massing
 *     build and nothing else, cheaper than a postMessage round-trip, and the
 *     mode people scrub constantly should have zero added latency.
 *   - **No `Worker`, no worker.** jsdom and locked-down browsers get the
 *     synchronous compute the study always had, not a dead panel.
 *
 * While the first run of a heavy mode is in flight there is no previous result
 * to keep on screen, so a massing-only stand-in (the real day study, minus the
 * envelope and grid) keeps the instant shadow live until the envelope lands.
 *
 * The request key deliberately omits the minute of day: only the instant shadow
 * reads it, and a time-scrubber step must never cost a day rebuild — the
 * mistake `sunStudyPerformance.test.js` exists to keep dead.
 */

import { useDeferredValue, useMemo } from 'react';
import { computeDayStudy } from '@/analysis/sunStudyRunner';
import { siteSupportsSunStudy } from '@/analysis/sunStudyState';
import { studyRequestKey } from '@/analysis/studyRequestIdentity';
import { useStudyWorker } from './useStudyWorker';

/**
 * Quiet period before a run starts, ms. Shorter than the other studies': a day
 * envelope is sub-second work, and the mode buttons feel broken if the overlay
 * trails a click by much more than this.
 */
const SETTLE_MS = 250;

const UNAVAILABLE_MESSAGE = 'This browser cannot run the sun study in the background.';

function createWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('@/analysis/sunStudy.worker.js', import.meta.url), { type: 'module' });
  } catch {
    // Blocked by a strict CSP, or an environment without module workers.
    return null;
  }
}

/**
 * @param {object} options
 * @param {object} options.project   Phase-filtered project.
 * @param {object} options.sunStudy  Editor state from `createSunStudyState`.
 * @param {string|null} [options.projectRevision]
 * @returns {{day: object|null, recomputing: boolean, error: string|null}}
 *   `day` is a `computeDayStudy` result; feed it to `computeInstantShadow`.
 */
export function useSunDayStudy({ project, sunStudy, projectRevision = null }) {
  const enabled = Boolean(sunStudy?.enabled) && siteSupportsSunStudy(project?.building?.site);

  // Checked per render, not at module load, so a test can stub `Worker` in.
  const workersAvailable = typeof Worker !== 'undefined';

  // Built from the scalar fields rather than sliced off the settings object, so
  // its identity survives a time-scrubber step: `minutes` is deliberately not
  // here, and neither is `enabled` — toggling the panel must not invalidate a
  // finished study.
  const { mode, date, stepMinutes, gridCellSize, thresholdHours, targetId } = sunStudy || {};
  const settings = useMemo(
    () => ({ mode, date, stepMinutes, gridCellSize, thresholdHours, targetId }),
    [mode, date, stepMinutes, gridCellSize, thresholdHours, targetId],
  );

  const heavy = mode !== 'instant';
  const workerActive = enabled && heavy && workersAvailable;

  const requestKey = useMemo(
    () => (workerActive ? studyRequestKey({ project, projectRevision, settings, scope: 'sun-day' }) : null),
    [workerActive, project, projectRevision, settings],
  );
  const payload = useMemo(() => ({ project, sunStudy: { ...settings, enabled: true } }), [project, settings]);

  const worker = useStudyWorker({
    workerFactory: createWorker,
    active: workerActive,
    requestKey,
    payload,
    settleMs: SETTLE_MS,
    unavailableMessage: UNAVAILABLE_MESSAGE,
  });

  // The synchronous paths. Deferring the input rather than the settings is the
  // shape the sun study settled on before the worker existed, kept for the same
  // reason: the mode button's pressed state must not wait for the compute.
  const syncActive = enabled && (!heavy || !workersAvailable || worker.status === 'unavailable');
  const syncInput = useMemo(
    () => (syncActive ? { project, sunStudy: { ...settings, enabled: true } } : null),
    [syncActive, project, settings],
  );
  const deferredSyncInput = useDeferredValue(syncInput);
  const syncDay = useMemo(() => (deferredSyncInput ? computeDayStudy(deferredSyncInput) : null), [deferredSyncInput]);

  // Massing-only stand-in for a heavy mode's first run. Computed lazily — once
  // any worker result exists, the stale-marked previous study is better.
  const needsStandIn = workerActive && worker.status !== 'unavailable' && !worker.study;
  const standIn = useMemo(() => {
    if (!needsStandIn) return null;
    const day = computeDayStudy({ project, sunStudy: { ...settings, enabled: true, mode: 'instant' } });
    // Carry the real mode so overlays and the panel do not flicker through an
    // instant-mode frame; the empty envelope says the rest honestly.
    return day ? { ...day, mode: settings.mode } : null;
  }, [needsStandIn, project, settings]);

  if (!enabled) return { day: null, recomputing: false, error: null };

  if (syncActive) {
    return { day: syncDay, recomputing: deferredSyncInput !== syncInput, error: null };
  }

  return {
    day: worker.study ?? standIn,
    recomputing: worker.status === 'running' || worker.stale,
    error: worker.status === 'error' ? worker.error : null,
  };
}

export default useSunDayStudy;
