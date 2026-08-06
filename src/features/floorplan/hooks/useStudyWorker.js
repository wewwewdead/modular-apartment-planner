/**
 * The worker lifecycle shared by every background study.
 *
 * Wind, the daylight grid and solar access all ask the same question of the
 * browser — "run this expensive thing off the main thread, and tell me when the
 * answer is for the building I am actually looking at" — and each used to
 * answer it with its own copy of the code below. Three copies drift: they had
 * already grown different supersession behaviour. This is the single copy.
 *
 * What varies between studies is settings-shaped and lives at the call site:
 * which worker file to build, how long to wait for edits to stop, what to post,
 * and what to say when the browser cannot run workers at all. What does not
 * vary is everything here.
 *
 * Four rules it exists to enforce:
 *
 *   1. **A superseded run must not land.** Editing a wall while a study is
 *      running starts a newer one; the older result is for a building that no
 *      longer exists and has to be dropped, not merged. Replies are matched to
 *      requests by id, so a late one is recognisable and ignorable.
 *   2. **A superseded run must not block the new one.** The old worker is
 *      terminated and a fresh one built, so the replacement starts immediately
 *      instead of queueing behind geometry nobody is looking at any more.
 *   3. **The last good result stays on screen.** Clearing the overlay the
 *      instant an edit starts makes the plan flash empty on every keystroke.
 *      The previous study stays, marked stale, until its replacement arrives.
 *   4. **Nothing runs unasked.** The worker is not constructed until a run has
 *      survived the settle period, so a session that never opens a study panel
 *      costs nothing.
 *
 * The shape of the state is what keeps this out of trouble. Only a *finished
 * result* is stored, and only ever written from a callback — the worker's
 * message handler or the timer that starts a run. Everything the caller reads
 * about progress is derived by comparing the stored result's key against the
 * current one. A stored `status` would have to be written from an effect on
 * every input change, which is the cascading-render trap.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Requests are matched to responses by id, so a stale reply is recognisable. */
let nextRequestId = 1;

/**
 * @param {object} options
 * @param {() => (Worker|null)} options.workerFactory  Builds the study's worker,
 *   or returns null when the environment cannot. Must be a stable reference —
 *   a module-level function, not an inline arrow — because a new identity is
 *   treated as a new run and terminates the worker in flight. Each study keeps
 *   its own factory so that Vite can see its literal `new URL(...)` worker path.
 * @param {boolean} options.active       Whether the study should be running at all.
 * @param {string|null} options.requestKey  Identity of the current run; a change
 *   means the stored result no longer describes the inputs on screen.
 * @param {object} options.payload       Posted to the worker as `{ id, ...payload }`.
 *   Memoise it: its identity, alongside `requestKey`, is what triggers a re-run.
 * @param {number} options.settleMs      Quiet period before a run starts.
 * @param {string} options.unavailableMessage  Shown when no worker can be built.
 * @returns {{study: object|null, status: string, progress: object|null, error: string|null, stale: boolean}}
 */
export function useStudyWorker({ workerFactory, active, requestKey, payload, settleMs, unavailableMessage }) {
  const workerRef = useRef(null);
  const pendingRef = useRef({ id: 0, key: null });
  const [result, setResult] = useState({ study: null, key: null, error: null, progress: null, unavailable: false });

  /**
   * Build the worker on first use and give it one long-lived message handler.
   *
   * One handler rather than one per request, because the worker can outlive a
   * single run: it reads the pending request from a ref, so a reply that
   * arrives after the plan has moved on is recognised and dropped rather than
   * landing on top of a newer study.
   */
  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = workerFactory();
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
  }, [workerFactory]);

  const teardown = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current = { id: 0, key: null };
  }, []);

  useEffect(() => teardown, [teardown]);

  // Switching a study off releases its worker. The last result is kept: coming
  // back to an overlay that is already there, marked stale until it refreshes,
  // beats an empty plan and a fresh wait.
  useEffect(() => {
    if (!active) teardown();
  }, [active, teardown]);

  useEffect(() => {
    if (!active) return undefined;

    // These runs are intentionally long. Terminate a superseded worker so a
    // wall drag does not leave the new run queued behind obsolete geometry.
    // The ref is nulled straight away, so a burst of changes orphans at most
    // one run: every terminate after the first is a no-op.
    workerRef.current?.terminate();
    workerRef.current = null;

    // Allocated here rather than in the timer, so every superseded run burns an
    // id and a reply carrying one can never be mistaken for the live request.
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
      worker.postMessage({ id, ...payload });
    }, settleMs);

    return () => clearTimeout(timer);
  }, [active, ensureWorker, payload, requestKey, settleMs]);

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
    error: result.unavailable ? unavailableMessage : result.error,
    // The overlay on screen belongs to an earlier version of the building.
    // Worth saying so: a number read off a superseded plan is misleading in a
    // way a blank canvas is not.
    stale: Boolean(active && result.study && !settled),
  };
}

export default useStudyWorker;
