/**
 * A window on what the 3D preview actually spends its frames doing.
 *
 * Not a widget — there is nothing to look at. It is the handle a measurement
 * session (or a Playwright script) reads: what the last three hundred frames
 * cost, which of them was an interactive frame and which a refinement sample,
 * the worst gap between two of them, how much of that went into the walk
 * controller, and what the renderer thinks it drew. Every number here answers a
 * question that was previously answered by staring at the picture.
 *
 * ## Why a localStorage flag rather than `import.meta.env.DEV`
 *
 * The problem being measured is worst on the desktop shell, and the desktop
 * shell ships a *production* build — a dev-only gate would be off in the only
 * place the numbers matter, and rebuilding the app in dev mode to measure it
 * would change the very thing being measured. So the gate is a stored flag that
 * survives a reload and can be set from a console in any build:
 *
 *     localStorage.previewPerf = '1'; location.reload();
 *
 * A dev server turns it on by default, because in dev the cost is irrelevant and
 * having the handle there without being asked is worth more.
 *
 * ## Cost when it is off
 *
 * One `if` on a module constant per frame. The recorder is never constructed,
 * the ring buffer is never allocated, and `performance.now()` is never called.
 */

const STORAGE_KEY = 'previewPerf';

/** Frames kept — five seconds at 60 fps, which is longer than any gesture. */
const FRAME_HISTORY = 300;

function readGate() {
  if (typeof window === 'undefined') return false;
  try {
    // A stored '0' is a deliberate "off", including on a dev server.
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // Storage can throw outright under a locked-down origin; that is a "no",
    // not a reason to take the preview down with it.
  }
  try {
    // Written out rather than optional-chained so the bundler's static
    // replacement matches it: in a production build this whole expression
    // becomes `false` and the recorder is dropped from the bundle.
    return Boolean(import.meta.env.DEV);
  } catch {
    return false;
  }
}

export const PREVIEW_PERF_ENABLED = readGate();

/**
 * The per-viewport recorder.
 *
 * `frame()` is called once per animation frame with what that frame did; the
 * gap is measured between successive calls, so it reflects what the user
 * actually experienced rather than what the renderer was busy with.
 */
export function createPreviewPerfRecorder({ renderer, progressive, getNavigationMode }) {
  const durations = new Float32Array(FRAME_HISTORY);
  const gaps = new Float32Array(FRAME_HISTORY);
  const walkSteps = new Float32Array(FRAME_HISTORY);
  const actions = new Array(FRAME_HISTORY).fill('');
  const timestamps = new Float64Array(FRAME_HISTORY);
  // Per frame rather than only in the snapshot, because the next thing anyone
  // will want to know is whether a heavy frame was heavy in draw calls or in
  // pixels, and the snapshot only ever holds the most recent one.
  const drawCalls = new Float32Array(FRAME_HISTORY);
  const triangles = new Float32Array(FRAME_HISTORY);

  let write = 0;
  let filled = 0;
  let previousTimestamp = 0;
  let walkStepMs = 0;

  const each = (visit) => {
    const start = filled < FRAME_HISTORY ? 0 : write;
    for (let offset = 0; offset < filled; offset += 1) {
      visit((start + offset) % FRAME_HISTORY);
    }
  };

  const percentile = (values, fraction) => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
    return sorted[index];
  };

  const summarise = () => {
    const interactive = [];
    const refine = [];
    let maxGap = 0;
    let maxWalkStep = 0;
    let walkTotal = 0;
    let walkFrames = 0;

    each((slot) => {
      if (gaps[slot] > maxGap) maxGap = gaps[slot];
      if (walkSteps[slot] > 0) {
        walkFrames += 1;
        walkTotal += walkSteps[slot];
        if (walkSteps[slot] > maxWalkStep) maxWalkStep = walkSteps[slot];
      }
      if (actions[slot] === 'interactive') interactive.push(durations[slot]);
      else if (actions[slot] === 'refine') refine.push(durations[slot]);
    });

    return {
      frames: filled,
      maxFrameGapMs: round(maxGap),
      interactive: {
        count: interactive.length,
        medianMs: round(percentile(interactive, 0.5)),
        p95Ms: round(percentile(interactive, 0.95)),
        maxMs: round(interactive.length ? Math.max(...interactive) : 0),
      },
      refine: {
        count: refine.length,
        medianMs: round(percentile(refine, 0.5)),
        p95Ms: round(percentile(refine, 0.95)),
        maxMs: round(refine.length ? Math.max(...refine) : 0),
      },
      walkStep: {
        frames: walkFrames,
        meanMs: round(walkFrames ? walkTotal / walkFrames : 0),
        maxMs: round(maxWalkStep),
      },
    };
  };

  const recorder = {
    /** Time charged to `walkPhysics.step` for the frame being recorded. */
    setWalkStepMs(ms) {
      walkStepMs = ms;
    },

    frame({ timestamp, action, durationMs }) {
      const slot = write;
      const info = renderer.info.render;
      drawCalls[slot] = info.calls;
      triangles[slot] = info.triangles;
      timestamps[slot] = timestamp;
      gaps[slot] = previousTimestamp ? timestamp - previousTimestamp : 0;
      durations[slot] = durationMs;
      walkSteps[slot] = walkStepMs;
      actions[slot] = action;
      previousTimestamp = timestamp;
      walkStepMs = 0;
      write = (write + 1) % FRAME_HISTORY;
      if (filled < FRAME_HISTORY) filled += 1;
    },

    /** Everything a measurement wants in one object, safe to `JSON.stringify`. */
    snapshot() {
      const info = renderer.info.render;
      return {
        navigationMode: getNavigationMode(),
        render: {
          calls: info.calls,
          triangles: info.triangles,
          lines: info.lines,
          points: info.points,
          frame: info.frame,
        },
        progressive: progressive.getStats(),
        ...summarise(),
      };
    },

    /** The raw ring, oldest first, for anyone who wants to plot it. */
    frames() {
      const out = [];
      each((slot) => {
        out.push({
          t: round(timestamps[slot]),
          action: actions[slot],
          ms: round(durations[slot]),
          gapMs: round(gaps[slot]),
          walkMs: round(walkSteps[slot]),
          calls: drawCalls[slot],
          triangles: triangles[slot],
        });
      });
      return out;
    },

    /** Start a fresh measurement without reloading the page. */
    reset() {
      write = 0;
      filled = 0;
      previousTimestamp = 0;
      walkStepMs = 0;
    },
  };

  return recorder;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Publish a recorder as `window.__previewPerf`.
 *
 * Last viewport to be created wins — the floorplan has one preview pane, and an
 * assembly editor's second one is not what anybody is measuring. Returns the
 * function that takes it down again, which the viewport calls on dispose so a
 * torn-down renderer is never left reachable from the console.
 */
export function publishPreviewPerf(recorder) {
  if (typeof window === 'undefined') return () => {};
  const previous = window.__previewPerf;
  window.__previewPerf = recorder;
  return () => {
    if (window.__previewPerf === recorder) window.__previewPerf = previous;
  };
}
