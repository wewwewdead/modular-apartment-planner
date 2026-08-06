import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { studyRequestKey } from '@/analysis/studyRequestIdentity';
import { windRunSettingsOf } from '@/analysis/windState';

let nextRequestId = 1;
const SETTLE_MS = 500;
const UNAVAILABLE_MESSAGE = 'This browser cannot run the wind solver in the background.';

function createWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('@/analysis/wind.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

export function useWindStudy({ project, windStudy, projectRevision = null }) {
  const workerRef = useRef(null);
  const pendingRef = useRef({ id: 0, key: null });
  const [result, setResult] = useState({ study: null, key: null, error: null, progress: null, unavailable: false });
  const active = Boolean(windStudy?.enabled);
  const settings = useMemo(() => (windStudy ? windRunSettingsOf(windStudy) : null), [windStudy]);
  const requestKey = useMemo(
    () => (active ? studyRequestKey({ project, projectRevision, settings }) : null),
    [active, project, projectRevision, settings],
  );

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = createWorker();
    if (!worker) return null;
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
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current = { id: 0, key: null };
  }, []);

  useEffect(() => teardown, [teardown]);
  useEffect(() => {
    if (!active) teardown();
  }, [active, teardown]);

  useEffect(() => {
    if (!active) return undefined;
    // A comfort run is intentionally long. Terminate a superseded worker so a
    // wall drag does not leave the new run queued behind obsolete geometry.
    workerRef.current?.terminate();
    workerRef.current = null;
    const id = nextRequestId;
    nextRequestId += 1;
    pendingRef.current = { id, key: requestKey };
    const timer = setTimeout(() => {
      const worker = ensureWorker();
      if (!worker) {
        setResult((current) => ({ ...current, key: requestKey, unavailable: true, progress: null }));
        return;
      }
      worker.postMessage({ id, project, windStudy: { ...settings, enabled: true } });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [active, ensureWorker, project, requestKey, settings]);

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

export default useWindStudy;
