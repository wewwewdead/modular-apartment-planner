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
 * Five rules it exists to enforce:
 *
 *   1. **A superseded run must not land.** Editing a wall while a study is
 *      running starts a newer one; the older result is for a building that no
 *      longer exists. Replies are matched to requests by id, so a reply that
 *      arrives after its request stopped being the live one is ignorable.
 *   2. **The worker stays warm.** Supersession posts the new request and lets
 *      the worker abandon the old one; it does NOT terminate. Termination threw
 *      away the worker's solved-field cache on every keystroke, which is the
 *      thing that made a one-window change cost a whole new lattice solve.
 *   3. **The last good result stays on screen.** Clearing the overlay the
 *      instant an edit starts makes the plan flash empty on every keystroke.
 *      The previous study stays, marked stale, until its replacement arrives.
 *   4. **Nothing runs unasked.** The worker is not constructed until a run has
 *      survived the settle period, so a session that never opens a study panel
 *      costs nothing — and a request whose answer is already on screen is not
 *      posted at all.
 *   5. **Only unmount and deactivation terminate.** Those are the two moments
 *      where nobody is going to want the answer.
 *
 * ## What warmth costs the studies that cannot yet be interrupted
 *
 * Only the wind worker solves in abandonable chunks. The daylight and solar
 * workers still run their solve to completion inside one message handler, so a
 * superseded run there BLOCKS its replacement until it finishes rather than
 * being killed. That is a deliberate, disclosed trade: the id matching in rule 1
 * keeps the stale answer off the screen either way, and terminating to shave
 * that wait is what cost wind its cache. Giving those two workers the same
 * chunked yields is the fix, and is not in this change.
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
 *   a module-level function, not an inline arrow. Each study keeps its own
 *   factory so that Vite can see its literal `new URL(...)` worker path.
 * @param {boolean} options.active       Whether the study should be running at all.
 * @param {string|null} options.requestKey  Identity of the current run, BY VALUE.
 *   This alone gates the run: a rebuilt-but-equal settings object produces an
 *   equal key and must not cost a re-post.
 * @param {object} options.payload       Posted to the worker as `{ id, ...payload }`.
 *   Read through a ref at post time, so its identity is not a re-run trigger.
 * @param {number} options.settleMs      Quiet period before a run starts.
 * @param {string} options.unavailableMessage  Shown when no worker can be built.
 * @returns {{study: object|null, status: string, progress: object|null, error: string|null, stale: boolean}}
 */
export function useStudyWorker({ workerFactory, active, requestKey, payload, settleMs, unavailableMessage }) {
  const workerRef = useRef(null);
  const pendingRef = useRef({ id: 0, key: null });
  const payloadRef = useRef(payload);
  const answeredRef = useRef(null);
  const [result, setResult] = useState({ study: null, key: null, error: null, progress: null, unavailable: false });

  // Kept current without being a dependency of the run effect: what to post is
  // not the same question as whether to post. Declared before that effect so it
  // is already up to date by the time the effect below reads it.
  useEffect(() => {
    payloadRef.current = payload;
  });

  /**
   * The request key whose answer is already on screen, or null.
   *
   * Only a real study counts. An error, or an environment that could not build
   * a worker, is not an answer — the next run gets to try again.
   */
  useEffect(() => {
    answeredRef.current = result.study && !result.error && !result.unavailable ? result.key : null;
  }, [result]);

  /**
   * Build the worker on first use and give it one long-lived message handler.
   *
   * One handler rather than one per request, because the worker outlives every
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

  // Switching a study off releases its worker, and with it whatever the worker
  // had cached. The last result is kept: coming back to an overlay that is
  // already there beats an empty plan and a fresh wait — and because the run
  // below skips a key it has already answered, coming back does not re-run it
  // either.
  useEffect(() => {
    if (!active) teardown();
  }, [active, teardown]);

  useEffect(() => {
    if (!active) return undefined;
    // The answer for exactly these inputs is already on screen. Re-posting would
    // recompute it, and — since disabling the study terminated the worker that
    // had the fields cached — recompute it the slow way.
    if (answeredRef.current !== null && answeredRef.current === requestKey) return undefined;

    // The worker is built inside the timer, not here: it is only genuinely
    // needed once a run survives the settle period, and building it in a
    // callback keeps every write to a ref or to state out of the effect body.
    //
    // The id is allocated here too, at the moment of the post, so ids count
    // posts rather than keystrokes. Until this fires the PREVIOUS request is
    // still the pending one, which is what lets a run that is already finishing
    // land as a stale-marked result instead of being thrown away.
    const timer = setTimeout(() => {
      const worker = ensureWorker();
      if (!worker) {
        setResult((current) => ({ ...current, key: requestKey, unavailable: true, progress: null }));
        return;
      }
      const id = nextRequestId;
      nextRequestId += 1;
      pendingRef.current = { id, key: requestKey };
      // Supersession is the worker's problem now: it sees a newer request and
      // abandons the one in flight at its next chunk boundary. Terminating here
      // instead would guarantee a cold start for the replacement.
      worker.postMessage({ id, ...payloadRef.current });
    }, settleMs);

    return () => clearTimeout(timer);
  }, [active, ensureWorker, requestKey, settleMs]);

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
