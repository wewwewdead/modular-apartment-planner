import { isStudyAborted, StudyAbortedError } from './lbmSolver';
import {
  assembleWindResult,
  buildWindMassing,
  prepareWindRun,
  solveWindFieldsAsync,
  windRunSectors,
} from './windRunner';

/**
 * Buffers `postMessage` may hand over instead of copying.
 *
 * Every entry is a typed array the runner built and nothing else holds: after
 * the post, the worker's copies are detached, which is safe precisely because
 * the worker returns the whole result and keeps none of it. Anything that is
 * NOT solely owned by the result — an input the caller still needs, or a view
 * onto a buffer the worker reads again — must stay off this list.
 *
 * That ownership rule is what the runner's `assembleWindResult` copies for. The
 * cached fields below outlive the result they were assembled into, so the
 * assembly hands out copies and this list detaches those.
 *
 * The `Set` is the ownership guard, not a tidiness measure: transferring one
 * buffer twice is a DataCloneError, and two of these fields can legitimately be
 * views of the same allocation. `grid.amplification` and
 * `representativeFlow.amplification` are separate arrays today, but the comfort
 * result's per-sector fields are copies of the same sector runs, so the
 * invariant is worth enforcing rather than assuming.
 *
 * Exported so the list can be unit-tested. A worker module has no callable
 * surface of its own, and getting this wrong fails only at run time in a real
 * `Worker` — the most expensive place to find out.
 */
export function transferablesOf(result) {
  const grid = result?.grid;
  if (!grid) return [];
  const arrays = [
    grid.obstacles,
    grid.amplification,
    grid.velocityX,
    grid.velocityY,
    grid.pressureCoefficient,
    grid.comfortSpeed,
    grid.safetySpeed,
    grid.categories,
    grid.unsafe,
    grid.counts,
    result?.sectorPressureCoefficients,
    result?.representativeFlow?.amplification,
    result?.representativeFlow?.velocityX,
    result?.representativeFlow?.velocityY,
    result?.representativeFlow?.pressureCoefficient,
  ].filter(Boolean);
  return [...new Set(arrays.map((array) => array.buffer))];
}

/**
 * A wind runner that remembers the building it last solved.
 *
 * ## What is cached, and why exactly this
 *
 * The lattice is the expensive part by two orders of magnitude, and it depends
 * on the massing and nothing else: a window's open fraction, a room's outline
 * and the reference speed all leave the solved flow field bit for bit
 * identical. So the cache holds the rasterized massing and the solved per-sector
 * fields, filed under the massing key, and a request whose massing key matches
 * skips straight to the airflow network and the summaries.
 *
 * ## Why ONE generation
 *
 * The cache holds the CURRENT building and nothing else. Two generations would
 * only pay off if a user oscillated between two states of the massing, which is
 * not a thing that happens while editing; meanwhile a sixteen-sector field set
 * at production resolution is a couple of megabytes, and a worker that quietly
 * grew to hold several of them would be a memory leak with a schedule. A
 * mismatched key evicts.
 *
 * ## Abandonment
 *
 * `shouldAbort` is threaded all the way down to the solver's chunk boundaries.
 * Nothing is written to the cache once it answers true: an abandoned run's
 * fields are correct for the massing it was solving, but a NEWER run may have
 * already filed its own, and clobbering that would leave the cache describing a
 * building nobody asked about.
 */
export function createWindStudyRunner() {
  let cache = null;

  async function run({ project, windStudy, phaseScope = null }, { onProgress = null, shouldAbort = null } = {}) {
    const prepared = prepareWindRun({ project, windStudy, phaseScope });
    if (!prepared) return null;

    const hit = cache && cache.massingKey === prepared.massingKey;
    if (!hit) cache = null;

    const massing = hit ? cache.massing : buildWindMassing(prepared);
    if (!massing) return null;

    const { windRose, directions } = windRunSectors(prepared);
    let fields = hit ? cache.fields : null;

    if (!fields) {
      fields = await solveWindFieldsAsync(prepared, massing, directions, onProgress, { shouldAbort });
      if (shouldAbort?.()) throw new StudyAbortedError();
      cache = { massingKey: prepared.massingKey, massing, fields };
    }

    if (shouldAbort?.()) throw new StudyAbortedError();
    return assembleWindResult(prepared, massing, fields, windRose, onProgress);
  }

  return {
    run,
    /** The massing generation currently held, or null. Test and diagnostic seam. */
    cachedMassingKey: () => cache?.massingKey ?? null,
    clear: () => {
      cache = null;
    },
  };
}

/**
 * Installed only where there is a worker global to install it on. Importing this
 * module in node — which is what lets the marshalling and the cache above be
 * tested at all — must not throw on a missing `self`.
 *
 * ## Protocol
 *
 * In:  `{ id, project, windStudy, phaseScope }` — run this study.
 *      `{ type: 'cancel' }`                    — abandon whatever is running.
 * Out: `{ id, type: 'progress', progress }`
 *      `{ id, type: 'result', result }`
 *      `{ id, type: 'error', message }`
 *
 * ## The generation counter
 *
 * Every inbound message bumps `generation`, and each run captures the value it
 * was started at. The solver checks the two for equality at every chunk
 * boundary, which is the ONLY moment a busy worker can notice anything: while
 * the lattice is iterating, the thread is not reading its message queue, so a
 * cancellation cannot arrive by any other route. That is why cancellation is
 * chunked yields rather than a flag — a flag in a message never gets delivered,
 * and a flag in a `SharedArrayBuffer` needs cross-origin isolation headers this
 * app does not send.
 *
 * A superseded run therefore stops at its next chunk and posts nothing at all:
 * neither a result nor an error, because being replaced is not a failure. The
 * hook's id matching is still the last line of defence for anything that slips
 * through, such as a reply already in flight when the newer request lands.
 */
if (typeof self !== 'undefined') {
  const runner = createWindStudyRunner();
  let generation = 0;

  self.onmessage = async (event) => {
    const message = event.data || {};
    generation += 1;
    const mine = generation;
    if (message.type === 'cancel') return;

    const { id, project, windStudy, phaseScope } = message;
    const superseded = () => generation !== mine;
    try {
      const result = await runner.run(
        { project, windStudy, phaseScope },
        {
          onProgress: (progress) => {
            if (!superseded()) self.postMessage({ id, type: 'progress', progress });
          },
          shouldAbort: superseded,
        },
      );
      if (superseded()) return;
      self.postMessage({ id, type: 'result', result }, transferablesOf(result));
    } catch (error) {
      if (isStudyAborted(error) || superseded()) return;
      self.postMessage({ id, type: 'error', message: error?.message || 'Wind study failed.' });
    }
  };
}
