/**
 * Drives the Monte Carlo daylight grid on a worker.
 *
 * The split-flux study runs synchronously in a `useMemo` because it is
 * milliseconds. The grid is not: a floor of rooms is a few hundred thousand
 * rays, which on the main thread would hold the canvas still for as long as it
 * took. So it goes to a worker, and this hook owns the request lifecycle —
 * which is the fiddly part, not the physics.
 *
 * Three rules it exists to enforce:
 *
 *   1. **A superseded run must not land.** Editing a wall while a grid is
 *      running starts a newer one; the older result is for a building that no
 *      longer exists and has to be dropped, not merged.
 *   2. **The last good result stays on screen.** Clearing the map the instant
 *      an edit starts makes the plan flash empty on every keystroke. The stale
 *      grid stays, marked stale, until the new one replaces it.
 *   3. **Nothing runs unasked.** The worker is not constructed until a run is
 *      actually due, so a session that never opens the map costs nothing.
 *
 * The shape of the state is what keeps this out of trouble. Only a *finished
 * result* is stored, and only ever written from a callback — the worker's
 * message handler or the timer that starts a run. Everything the caller reads
 * about progress is derived by comparing the stored result's key against the
 * current one. A stored `status` would have to be written from an effect on
 * every input change, which is the cascading-render trap.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gridSettingsOf } from '@/analysis/daylightState';
import { studyRequestKey } from '@/analysis/studyRequestIdentity';

/** Requests are matched to responses by id, so a stale reply is recognisable. */
let nextRequestId = 1;

/**
 * Quiet period before a run starts, ms.
 *
 * Any edit to the project replaces the object, so dragging a wall would fire a
 * run per pointer move. Waiting for the drag to stop costs a third of a second
 * of latency and saves dozens of abandoned studies.
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
  const workerRef = useRef(null);
  const pendingRef = useRef({ id: 0, key: null });
  const [result, setResult] = useState({ study: null, key: null, error: null, progress: null, unavailable: false });

  const active = Boolean(daylight?.enabled) && daylight?.mode === 'grid';

  // Everything a grid run depends on, as one value. The project object is
  // compared by identity: the reducer replaces it on every edit, which is
  // exactly when the grid needs redoing.
  const settings = useMemo(() => (daylight ? gridSettingsOf(daylight) : null), [daylight]);
  const requestKey = useMemo(
    () => (active ? studyRequestKey({ project, projectRevision, settings, scope: { floorId } }) : null),
    [active, floorId, project, projectRevision, settings],
  );

  /**
   * Build the worker on first use and give it one long-lived message handler.
   *
   * One handler rather than one per request, because the worker outlives any
   * single run: it reads the pending request from a ref, so a reply that
   * arrives after the plan has moved on is recognised and dropped rather than
   * landing on top of a newer study.
   */
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
    if (workerRef.current) workerRef.current.terminate();
    workerRef.current = null;
    pendingRef.current = { id: 0, key: null };
  }, []);

  useEffect(() => teardown, [teardown]);

  // Leaving grid mode releases the worker. The last result is kept: coming back
  // to a map that is already there, marked stale until it refreshes, beats an
  // empty plan and a fresh wait.
  useEffect(() => {
    if (!active) teardown();
  }, [active, teardown]);

  useEffect(() => {
    if (!active) return undefined;

    const id = nextRequestId;
    nextRequestId += 1;
    pendingRef.current = { id, key: requestKey };

    // The worker is built inside the timer, not here: it is only genuinely
    // needed once a run survives the settle period, and building it in a
    // callback keeps every write to a ref or to state out of the effect body.
    const timer = setTimeout(() => {
      const worker = ensureWorker();
      if (!worker) {
        setResult((current) => ({ ...current, key: requestKey, unavailable: true, progress: null }));
        return;
      }
      // `enabled` is deliberately absent from the grid settings so that
      // toggling the panel does not invalidate a finished map. The worker is
      // only ever asked to run studies that are meant to run, so it gets it
      // back here.
      worker.postMessage({ id, project, daylight: { ...settings, enabled: true }, floorId });
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [active, project, settings, floorId, requestKey, ensureWorker]);

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
    // The map on screen belongs to an earlier version of the building. Worth
    // saying so: a daylight factor read off a superseded plan is misleading in
    // a way a blank canvas is not.
    stale: Boolean(active && result.study && !settled),
  };
}

export default useDaylightGrid;
