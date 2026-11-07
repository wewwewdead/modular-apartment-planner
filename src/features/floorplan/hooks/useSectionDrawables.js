import { useEffect, useState } from 'react';
import { afterPaint } from '@/ui/loading';
import {
  createSectionVisibilityJob,
  getVisibleSectionDrawables,
  peekVisibleSectionDrawables,
} from '@/sections/visibility';
import {
  createElevationVisibilityJob,
  getVisibleElevationDrawables,
  peekVisibleElevationDrawables,
} from '@/elevations/visibility';

/*
 * The hidden-line pass behind the section and elevation views, run after the
 * view has painted and in slices short enough that the page keeps drawing
 * frames while it works (docs/night-section-freezes.md §4.3.2).
 *
 * The pass is the expensive part of opening either view — a polygon
 * difference per drawable against everything in front of it, about a second
 * for a real section — and it used to run in the render of the commit the
 * click started, so nothing on screen changed until it was over. Here the
 * commit renders the view's paper and the pass runs behind it.
 *
 * Every result is cached on the scene object by the visibility modules, so the
 * synchronous readers (sheets, PDF, the elevation click handler) and a warm
 * re-entry into the view all get it for free once any one of them has paid.
 */

/** Work per slice. Under a 60 Hz frame, so a frame always fits between two. */
export const VISIBILITY_SLICE_MS = 12;

const KINDS = {
  section: {
    peek: peekVisibleSectionDrawables,
    run: getVisibleSectionDrawables,
    createJob: createSectionVisibilityJob,
  },
  elevation: {
    peek: peekVisibleElevationDrawables,
    run: getVisibleElevationDrawables,
    createJob: createElevationVisibilityJob,
  },
};

/*
 * One job per scene, whoever asks: StrictMode's second effect, or a second
 * reader of the same scene, picks the work up where it was left rather than
 * starting it again.
 */
const jobsByScene = new WeakMap();

function jobFor(kind, scene) {
  let job = jobsByScene.get(scene);
  if (!job) {
    job = KINDS[kind].createJob(scene);
    jobsByScene.set(scene, job);
  }
  return job;
}

/*
 * Hands the thread back so the browser can draw a frame and take input.
 *
 * A MessageChannel message, deliberately not `scheduler.yield()`. A yielded
 * continuation is queued *ahead* of ordinary tasks, so for the whole second a
 * section takes, every timer and every React render the page scheduled waited
 * behind the job: the placeholder's 300 ms words arrived with the drawing at
 * 1.4 s, and the longest frame gap was 132 ms. Posted as an ordinary task the
 * job takes its turn with them — words on time, longest gap 51 ms — for about
 * 50 ms more in total (measured on the bench fixture, docs/
 * night-section-freezes.md §6). Not a zero `setTimeout` (clamped to 4 ms once
 * nested, a quarter of every slice) and not `requestIdleCallback`: under
 * continuous input — a drag, a held key — there is no idle time, and the
 * drawing would never arrive.
 */
function yieldToBrowser() {
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs the scene's visibility job to completion in slices, after the current
 * commit has painted. Resolves true when the result is cached on the scene,
 * false if `isCancelled` said stop first (the job keeps its progress).
 */
export async function resolveVisibilityInSlices(kind, scene, { isCancelled = () => false } = {}) {
  await afterPaint();
  const job = jobFor(kind, scene);
  while (!isCancelled()) {
    if (job.step(VISIBILITY_SLICE_MS).done) return true;
    await yieldToBrowser();
  }
  return false;
}

/**
 * The visible drawables for a section (`kind: 'section'`) or elevation
 * (`kind: 'elevation'`) scene.
 *
 * With `deferred` false — tests, sheets, anything with no frame to wait for —
 * it is the synchronous pass, exactly as before. With `deferred` true it never
 * computes during render; it returns:
 *
 * - `status: 'ready'` with the drawables, when the scene's pass is done;
 * - `status: 'stale'` with the last drawing this hook showed and *its* scene,
 *   when the scene changed under the same `viewKey` (a depth edit, any model
 *   edit) — the old drawing stays up under a bar until the new one lands;
 * - `status: 'loading'` with no drawables otherwise: a first entry, or a new
 *   view (another cut, another side), which shows its placeholder.
 */
export function useVisibleDrawables(kind, scene, { deferred = false, viewKey = null } = {}) {
  const { peek, run } = KINDS[kind];
  const cached = scene ? peek(scene) : undefined;
  const drawables = !scene ? null : deferred ? cached : (cached ?? run(scene));
  const [lastDrawn, setLastDrawn] = useState(null);
  // Bumped when a deferred pass finishes, to read the now-cached result.
  const [, setResolvedScene] = useState(null);

  // Remember what was last on screen, so an edit can keep it there while the
  // new pass runs. Set during render — the derived-state pattern — so the
  // stale picture is available on the very commit the scene changes in.
  if (scene && drawables && (lastDrawn?.scene !== scene || lastDrawn.viewKey !== viewKey)) {
    setLastDrawn({ scene, drawables, viewKey });
  }

  const pending = Boolean(deferred && scene && !cached);
  useEffect(() => {
    if (!pending) return undefined;
    let cancelled = false;
    resolveVisibilityInSlices(kind, scene, { isCancelled: () => cancelled }).then((done) => {
      if (done && !cancelled) setResolvedScene(scene);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, pending, scene]);

  if (!scene) return { status: 'ready', scene: null, drawables: null };
  if (drawables) return { status: 'ready', scene, drawables };
  if (lastDrawn && lastDrawn.viewKey === viewKey) {
    return { status: 'stale', scene: lastDrawn.scene, drawables: lastDrawn.drawables };
  }
  return { status: 'loading', scene, drawables: null };
}
