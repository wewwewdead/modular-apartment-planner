/**
 * Drives the solar access study on a worker.
 *
 * The same lifecycle as the daylight grid and the wind study, because it is
 * literally the same one: `useStudyWorker` owns debounce, supersession,
 * staleness and teardown, and this hook only shapes the request.
 *
 * Unlike the daylight map this study has no cheap analytic sibling to fall back
 * on while it runs, so the previous result stays on screen and is marked stale
 * rather than being cleared — which is what the shared hook does anyway.
 */

import { useMemo } from 'react';
import { runSettingsOf } from '@/analysis/solarAccessState';
import { studyRequestKey } from '@/analysis/studyRequestIdentity';
import { useStudyWorker } from './useStudyWorker';

/**
 * Quiet period before a run starts, ms. Longer than the daylight map's, because
 * this study is heavier and an abandoned run costs more.
 */
const SETTLE_MS = 500;

const UNAVAILABLE_MESSAGE = 'This browser cannot run the solar study in the background.';

function createWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('@/analysis/solarAccess.worker.js', import.meta.url), { type: 'module' });
  } catch {
    // Blocked by a strict CSP, or an environment without module workers.
    return null;
  }
}

/**
 * @param {object} options
 * @param {object} options.project      Phase-filtered project.
 * @param {object} options.solarAccess  Editor state from `createSolarAccessState`.
 * @returns {{study: object|null, status: string, progress: object|null, error: string|null, stale: boolean}}
 */
export function useSolarAccess({ project, solarAccess, projectRevision = null }) {
  const active = Boolean(solarAccess?.enabled);

  const settings = useMemo(() => (solarAccess ? runSettingsOf(solarAccess) : null), [solarAccess]);
  const requestKey = useMemo(
    () => (active ? studyRequestKey({ project, projectRevision, settings }) : null),
    [active, project, projectRevision, settings],
  );

  // `enabled` is absent from the run settings so that toggling the panel does
  // not invalidate a finished study; the worker gets it back here.
  const payload = useMemo(() => ({ project, solarAccess: { ...settings, enabled: true } }), [project, settings]);

  return useStudyWorker({
    workerFactory: createWorker,
    active,
    requestKey,
    payload,
    settleMs: SETTLE_MS,
    unavailableMessage: UNAVAILABLE_MESSAGE,
  });
}

export default useSolarAccess;
