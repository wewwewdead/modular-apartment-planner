/**
 * Drives the solar access study on a worker.
 *
 * The same lifecycle as `useDaylightGrid`, and for the same reasons: only a
 * finished result is stored, it is only ever written from a callback, and
 * everything the caller reads about progress is derived by comparing that
 * result's key against the current one. A stored status would have to be
 * written from an effect on every input change, which is the cascading-render
 * trap.
 *
 * Unlike the daylight map this study has no cheap analytic sibling to fall back
 * on while it runs, so the previous result stays on screen and is marked stale
 * rather than being cleared.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runSettingsOf } from '@/analysis/solarAccessState';
import { studyRequestKey } from '@/analysis/studyRequestIdentity';

let nextRequestId = 1;

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
  const workerRef = useRef(null);
  const pendingRef = useRef({ id: 0, key: null });
  const [result, setResult] = useState({ study: null, key: null, error: null, progress: null, unavailable: false });

  const active = Boolean(solarAccess?.enabled);
  const settings = useMemo(() => (solarAccess ? runSettingsOf(solarAccess) : null), [solarAccess]);
  const requestKey = useMemo(
    () => (active ? studyRequestKey({ project, projectRevision, settings }) : null),
    [active, project, projectRevision, settings],
  );

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = createWorker();
    if (!worker) return null;

    // One long-lived handler reading the pending request from a ref, so a reply
    // that arrives after the plan has moved on is recognised and dropped.
    worker.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.id !== pendingRef.current.id) return;
      const key = pendingRef.current.key;

      if (message.type === 'progress') {
        setResult((current) => ({ ...current, progress: message.progress }));
      } else if (message.type === 'result') {
        setResult({ study: message.result, key, error: null, progress: null, unavailable: false });
      } else if (message.type === 'error') {
        setResult((current) => ({ ...current, key, error: message.message, progress: null }));
      }
    });

    workerRef.current = worker;
    return worker;
  }, []);

  const teardown = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate();
    workerRef.current = null;
    pendingRef.current = { id: 0, key: null };
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    if (!active) teardown();
  }, [active, teardown]);

  useEffect(() => {
    if (!active) return undefined;

    const id = nextRequestId;
    nextRequestId += 1;
    pendingRef.current = { id, key: requestKey };

    const timer = setTimeout(() => {
      const worker = ensureWorker();
      if (!worker) {
        setResult((current) => ({ ...current, key: requestKey, unavailable: true, progress: null }));
        return;
      }
      // `enabled` is absent from the run settings so that toggling the panel
      // does not invalidate a finished study; the worker gets it back here.
      worker.postMessage({ id, project, solarAccess: { ...settings, enabled: true } });
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [active, project, settings, requestKey, ensureWorker]);

  const settled = result.key === requestKey;

  return {
    study: active ? result.study : null,
    status: !active
      ? 'idle'
      : !settled
        ? 'running'
        : result.unavailable
          ? 'unavailable'
          : result.error
            ? 'error'
            : 'ready',
    progress: result.progress,
    error: result.unavailable ? UNAVAILABLE_MESSAGE : result.error,
    stale: Boolean(active && result.study && !settled),
  };
}

export default useSolarAccess;
