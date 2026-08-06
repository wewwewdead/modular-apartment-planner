/**
 * Drives the wind comfort study on a worker.
 *
 * Everything about the request lifecycle — debounce, supersession, staleness,
 * teardown — lives in `useStudyWorker`. This hook only shapes the request:
 * which settings a run depends on, and what the worker is handed.
 */

import { useMemo } from 'react';
import { studyRequestKey } from '@/analysis/studyRequestIdentity';
import { windRunSettingsOf } from '@/analysis/windState';
import { useStudyWorker } from './useStudyWorker';

/** Quiet period before a run starts, ms. A comfort run is heavy enough that an abandoned one costs real time. */
const SETTLE_MS = 500;

const UNAVAILABLE_MESSAGE = 'This browser cannot run the wind solver in the background.';

function createWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('@/analysis/wind.worker.js', import.meta.url), { type: 'module' });
  } catch {
    // Blocked by a strict CSP, or an environment without module workers.
    return null;
  }
}

/**
 * @param {object} options
 * @param {object} options.project    Phase-filtered project.
 * @param {object} options.windStudy  Editor state from `createWindStudyState`.
 * @returns {{study: object|null, status: string, progress: object|null, error: string|null, stale: boolean}}
 */
export function useWindStudy({ project, windStudy, projectRevision = null }) {
  const active = Boolean(windStudy?.enabled);

  // Everything a run depends on, as one value. The project object is compared
  // by identity: the reducer replaces it on every edit, which is exactly when
  // the study needs redoing.
  const settings = useMemo(() => (windStudy ? windRunSettingsOf(windStudy) : null), [windStudy]);
  const requestKey = useMemo(
    () => (active ? studyRequestKey({ project, projectRevision, settings }) : null),
    [active, project, projectRevision, settings],
  );

  // `enabled` is deliberately absent from the run settings so that toggling the
  // panel does not invalidate a finished study. The worker is only ever asked
  // to run studies that are meant to run, so it gets it back here.
  const payload = useMemo(() => ({ project, windStudy: { ...settings, enabled: true } }), [project, settings]);

  return useStudyWorker({
    workerFactory: createWorker,
    active,
    requestKey,
    payload,
    settleMs: SETTLE_MS,
    unavailableMessage: UNAVAILABLE_MESSAGE,
  });
}

export default useWindStudy;
