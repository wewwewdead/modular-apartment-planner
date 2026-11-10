/**
 * The worker lifecycle shared by every background study.
 *
 * The daylight grid and solar access (and any future study) all ask the same
 * question of the browser — "run this expensive thing off the main thread, and
 * tell me when the answer is for the building I am actually looking at" — and
 * each used to answer it with its own copy of the code below. Copies drift:
 * they had already grown different supersession behaviour. This is the single
 * copy.
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
 *      away everything the worker had cached on every keystroke.
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
 * The study workers run their solve to completion inside one task, so a
 * superseded run already under way BLOCKS its replacement until it finishes
 * rather than being killed (requests that queued behind it are skipped, not
 * solved — see `handleLatestRequestOnly`). That is a deliberate, disclosed trade: the id
 * matching in rule 1 keeps the stale answer off the screen either way, and
 * terminating to shave that wait throws away the worker's cache. Giving the
 * workers chunked yields is the fix, and is not in this change.
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
 * What a study panel is told, derived from what the hook stored.
 *
 * `result.key` is the request key last answered — by a study, an error, or the
 * finding that no worker can be built — and `result.studyKey` the request key
 * the study on screen was computed for. They differ after an error, which
 * answers a run without replacing the study.
 *
 * "No worker" outlasts the inputs it was found for: reading `running` on every
 * edit would make a study that falls back to the main thread swap its overlay
 * out and back each time. A post clears it, which is only reached once a
 * worker has been built.
 *
 * @param {object} options
 * @param {boolean} options.active
 * @param {string|null} options.requestKey  The current inputs.
 * @param {{study: object|null, studyKey: string|null, key: string|null, error: string|null, unavailable: boolean}} options.result
 * @returns {{status: 'idle'|'running'|'ready'|'error'|'unavailable', stale: boolean}}
 */
export function deriveStudyStatus({ active, requestKey, result }) {
  if (!active) return { status: 'idle', stale: false };
  // The overlay on screen belongs to an earlier version of the building. Worth
  // saying so: a number read off a superseded plan is misleading in a way a
  // blank canvas is not — and that holds beside an error too.
  const stale = Boolean(result.study) && result.studyKey !== requestKey;
  if (result.unavailable) return { status: 'unavailable', stale };
  if (result.key !== requestKey) return { status: 'running', stale };
  return { status: result.error ? 'error' : 'ready', stale };
}

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
  const [result, setResult] = useState({
    study: null,
    studyKey: null,
    key: null,
    error: null,
    progress: null,
    unavailable: false,
  });

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
    answeredRef.current = result.study && !result.error && !result.unavailable ? result.studyKey : null;
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
        setResult({ study: message.result, studyKey: key, key, error: null, progress: null, unavailable: false });
      } else if (message.type === 'error') {
        setResult((current) => ({ ...current, key, error: message.message, progress: null }));
      }
    });

    // The worker itself failing — its module would not load, or it died outside
    // the solve's own try/catch — posts no reply at all, so without these the
    // pending run stayed "running" forever. Either way the pending run is
    // answered with an error. A worker that raised `error` is gone: it is
    // dropped so the next run builds a fresh one rather than posting into it.
    // A `messageerror` (a reply that could not be deserialised) leaves the
    // worker as it is.
    const fail = (message) => {
      // Nothing pending (the run in flight was dropped because its inputs were
      // undone) means nothing on screen is waiting for this run to answer.
      if (!pendingRef.current.id) return;
      const key = pendingRef.current.key;
      setResult((current) => ({ ...current, key, error: message, progress: null }));
    };
    worker.addEventListener('error', (event) => {
      if (workerRef.current === worker) {
        worker.terminate();
        workerRef.current = null;
      }
      fail(event?.message || 'The study stopped unexpectedly.');
    });
    worker.addEventListener('messageerror', () => {
      fail('The study sent back a result that could not be read.');
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
    //
    // A run posted for inputs since undone (A → B → back to A before B replies)
    // is still the pending one, and its reply would land on top of the answer
    // that is already right. Adopting that answer drops the pending request, so
    // the reply fails the id check. This is the one write the effect makes
    // itself — deferred to a timer, it could come after the reply it exists to
    // stop — and it is a ref, so it renders nothing.
    if (answeredRef.current !== null && answeredRef.current === requestKey) {
      pendingRef.current = { id: 0, key: null };
      return undefined;
    }

    // The worker is built inside the timer, not here: it is only genuinely
    // needed once a run survives the settle period, and building it in a
    // callback keeps every write to state out of the effect body.
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
      // The progress on screen was the superseded run's. And a worker exists
      // now, so "no worker" stops being the answer to anything: it is withdrawn
      // with the key it answered, leaving this run to read as running.
      setResult((current) => {
        if (current.progress === null && !current.unavailable) return current;
        return current.unavailable
          ? { ...current, key: null, unavailable: false, progress: null }
          : { ...current, progress: null };
      });
      // Supersession is the worker's problem now. A solve already running
      // cannot be interrupted — it finishes, and its reply is dropped by id
      // above — but requests that queued behind it are skipped: the worker
      // solves only the newest (`handleLatestRequestOnly`). Terminating here
      // instead would guarantee a cold start for the replacement.
      worker.postMessage({ id, ...payloadRef.current });
    }, settleMs);

    return () => clearTimeout(timer);
  }, [active, ensureWorker, requestKey, settleMs]);

  const { status, stale } = deriveStudyStatus({ active, requestKey, result });

  return {
    study: active ? result.study : null,
    status,
    progress: result.progress,
    error: result.unavailable ? unavailableMessage : result.error,
    stale,
  };
}

export default useStudyWorker;
