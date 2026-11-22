import { FRAME_ACTION } from './refineSchedule';

/**
 * How many pixels a moving frame of the preview can afford, read from the frame
 * rate the person is actually getting.
 *
 * ## Why the frame rate and not a timer
 *
 * Everything else in the pipeline times JavaScript: how long `composer.render()`
 * took to *submit*. That says nothing at all about a GPU that is behind — the
 * draw calls go into a queue in a couple of milliseconds and the GPU works
 * through them for thirty. What does notice is the browser: it holds back the
 * next animation frame until the GPU has caught up, so a GPU-bound preview
 * shows up as a longer gap between consecutive `requestAnimationFrame`
 * timestamps. That gap is the signal here.
 *
 * ## What counts
 *
 * A gap is evidence only when both frames around it drew a camera-motion frame
 * (INTERACTIVE), the loop ran without a break between them, and neither was a
 * scene rebuild — a plan drag's rebuild is main-thread work, and no amount of
 * resolution will make it cheaper. The first frame of a gesture, and any frame
 * on which the resolution changed, does not open a pair either: it is the one
 * that reallocated the offscreen chain, and that cost is paid once, not per
 * frame.
 *
 * Decisions are taken on a window of at least `WINDOW_MIN_FRAMES` such gaps
 * spanning at least `WINDOW_MIN_MS`, never on one frame, and the slowest tenth
 * of the window is set aside before the mean is taken: a long task in the
 * middle of a smooth orbit (a React commit, a garbage collection) is one slow
 * frame, and it must not cost the next thirty seconds of orbiting their
 * sharpness. A GPU that is genuinely behind is slow on every frame, so the
 * trim does not hide it.
 *
 * ## The target
 *
 * 60 fps, whatever the display: over budget means a windowed mean above
 * `OVER_BUDGET_MS`, so a 144 Hz panel running the preview at 72 fps is within
 * it. Two cases the target must not misread, both of which only ever make this
 * engage *less*:
 *
 * - A display, or a browser, that cannot show 60 at all — a 50 Hz panel,
 *   Chrome's battery saver capping animation frames at 30. Every gap is then
 *   long however few pixels are drawn, and chasing it would walk the ladder to
 *   the bottom for nothing. The frames on which nothing is drawn (SETTLE, and
 *   a walk's IDLE) measure the display's own interval, and the budget is never
 *   tighter than that interval allows. Until a few of them have been seen —
 *   which the quiet period after the first world's first frame provides — no
 *   gap is judged at all.
 * - A frame whose main-thread submission alone is over the target. That frame
 *   is bound by draw calls, not pixels; resolution cannot help it, and the
 *   existing submit-time hysteresis that drops occlusion is the thing that
 *   answers it.
 *
 * ## The ladder, and when it moves
 *
 * `INTERACTIVE_SCALE_LADDER` is the render scale of a moving frame, relative to
 * the canvas. Past its last rung the one thing left to give up is ambient
 * occlusion on moving frames: resolution goes first, features last, and on the
 * way back up occlusion is the first thing restored.
 *
 * A change reallocates the whole offscreen chain, so it lands where
 * `applyRenderScale` already pays for one: at the first frame of a gesture,
 * judged on the window the previous gestures left. Mid-gesture it moves only
 * when this gesture's own frames have filled a window over budget — a
 * sustained miss is worth one hitch, a passing one is not.
 *
 * Stepping back up is by trial, because a vsynced display cannot show
 * headroom: a preview that would run at 200 fps and one that barely holds 60
 * both report 16.7 ms. After `STEP_UP_WAIT_GESTURES` consecutive gestures
 * within budget the next gesture starts one rung higher; if that rung goes
 * over budget, it steps back down and waits twice as long before trying again,
 * up to `STEP_UP_WAIT_CAP`. A canvas resize or a new world resets the wait —
 * either one changes what a frame costs.
 *
 * Pure: no WebGL, no clock, no DOM. The loop that feeds it cannot be unit
 * tested; the policy can, with gap traces written by hand.
 */

/** Render scale of a moving frame, relative to the canvas, best first. */
export const INTERACTIVE_SCALE_LADDER = Object.freeze([1, 0.85, 0.7, 0.58, 0.5]);

/** A windowed mean above this is a frame rate below 60 fps. */
export const OVER_BUDGET_MS = 18.5;

/** Where a step down aims: far enough that the predicted mean is this or less. */
export const STEP_DOWN_TARGET_MS = 16;

/** A window is at least this many qualifying frames… */
export const WINDOW_MIN_FRAMES = 20;
/** …and at least this long, whichever is the more. */
export const WINDOW_MIN_MS = 500;

/** Consecutive gestures within budget before a rung higher is tried. */
export const STEP_UP_WAIT_GESTURES = 3;
/** The longest the wait doubles to after failed trials. */
export const STEP_UP_WAIT_CAP = 24;

/**
 * A gap this long is not a frame: the tab was hidden, a debugger paused it, or
 * the machine slept. Nothing the preview draws is measured by it.
 */
const MAX_GAP_MS = 1000;

/** How many display-interval samples are kept, and how many before they count. */
const REFRESH_HISTORY = 16;
const REFRESH_MIN_SAMPLES = 4;
/**
 * Margin over the display's own interval before a frame counts as late, for a
 * display slower than 60 Hz: the same 11% `OVER_BUDGET_MS` leaves over 16.7 ms.
 */
const REFRESH_MARGIN = 1.11;
/** A display interval above this (below about 55 Hz) is a display that cannot show 60. */
const SLOW_DISPLAY_MS = 18;

/** Fraction of a window, slowest first, set aside before the mean is taken. */
const TRIM_FRACTION = 0.1;

/*
 * The rungs as the policy walks them: the scale ladder with occlusion, then one
 * more at the bottom scale without it.
 */
const RUNGS = Object.freeze([
  ...INTERACTIVE_SCALE_LADDER.map((scale) => Object.freeze({ scale, occlusion: true })),
  Object.freeze({ scale: INTERACTIVE_SCALE_LADDER[INTERACTIVE_SCALE_LADDER.length - 1], occlusion: false }),
]);
const LAST_SCALE_RUNG = INTERACTIVE_SCALE_LADDER.length - 1;
const LAST_RUNG = RUNGS.length - 1;

/**
 * A trailing window of gaps: the shortest run of the most recent ones that is
 * still at least `WINDOW_MIN_FRAMES` long and `WINDOW_MIN_MS` wide.
 */
function createGapWindow() {
  const gaps = [];
  const submits = [];
  let total = 0;

  return {
    add(gapMs, submitMs) {
      gaps.push(gapMs);
      submits.push(submitMs);
      total += gapMs;
      // Drop from the front only while what is left would still be a full
      // window: older evidence is replaced, never thrown away short.
      while (gaps.length > WINDOW_MIN_FRAMES && total - gaps[0] >= WINDOW_MIN_MS) {
        total -= gaps.shift();
        submits.shift();
      }
    },
    clear() {
      gaps.length = 0;
      submits.length = 0;
      total = 0;
    },
    get size() {
      return gaps.length;
    },
    full() {
      return gaps.length >= WINDOW_MIN_FRAMES && total >= WINDOW_MIN_MS;
    },
    /** The mean with the slowest `TRIM_FRACTION` set aside. */
    trimmedMean() {
      if (!gaps.length) return 0;
      const sorted = gaps.slice().sort((a, b) => a - b);
      const kept = sorted.length - Math.floor(sorted.length * TRIM_FRACTION);
      let sum = 0;
      for (let index = 0; index < kept; index += 1) sum += sorted[index];
      return sum / kept;
    },
    meanSubmit() {
      if (!submits.length) return 0;
      let sum = 0;
      for (const value of submits) sum += value;
      return sum / submits.length;
    },
  };
}

const drewNothing = (action) => action === FRAME_ACTION.SETTLE || action === FRAME_ACTION.IDLE;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The scale a step down lands on: the first rung below `rung` whose predicted
 * mean — this one's, scaled by the ratio of pixel counts — is within `target`,
 * or the last scale rung if none is. Past the last scale rung the only step
 * left is the one that drops occlusion.
 */
export function stepDownRung(rung, meanMs, targetMs = STEP_DOWN_TARGET_MS) {
  if (rung >= LAST_SCALE_RUNG) return LAST_RUNG;
  const current = RUNGS[rung].scale;
  let next = rung + 1;
  while (next < LAST_SCALE_RUNG) {
    const ratio = (RUNGS[next].scale * RUNGS[next].scale) / (current * current);
    if (meanMs * ratio <= targetMs) break;
    next += 1;
  }
  return next;
}

export function createRenderScaleGovernor() {
  let rung = 0;
  // Gaps at the current rung across gestures; what a gesture start judges.
  const rolling = createGapWindow();
  // Gaps of the gesture under way only; what a mid-gesture change judges.
  const gestureWindow = createGapWindow();
  // Display intervals, from consecutive frames that drew nothing.
  const refreshGaps = [];

  let previous = null;
  let gestureFrames = 0;
  let goodGestures = 0;
  let wait = STEP_UP_WAIT_GESTURES;
  // The rung a trial stepped up from, while one is being judged.
  let trialFrom = null;
  let changes = 0;
  // The gap between this frame and the last, when both rendered a refine
  // sample back to back — the progressive renderer's refine budget reads it.
  let refineGapMs = null;

  const refreshMs = () => (refreshGaps.length >= REFRESH_MIN_SAMPLES ? median(refreshGaps) : 0);
  // Only a display clearly slower than 60 Hz moves the budget; a 60 Hz one
  // (whose measured interval wanders either side of 16.7 ms) or a faster one
  // leaves the 60 fps target exactly as it is.
  const slowDisplay = () => refreshMs() > SLOW_DISPLAY_MS;
  const overBudgetMs = () => (slowDisplay() ? refreshMs() * REFRESH_MARGIN : OVER_BUDGET_MS);
  const targetMs = () => (slowDisplay() ? refreshMs() : STEP_DOWN_TARGET_MS);

  /**
   * 'over', 'within', 'cpu' (bound by submission, which this cannot fix) or
   * 'unknown' (the display's own interval has not been seen yet, so a long gap
   * cannot be told from a slow display). The window must be full; callers
   * check.
   */
  const judge = (gaps) => {
    if (refreshGaps.length < REFRESH_MIN_SAMPLES) return 'unknown';
    if (gaps.meanSubmit() >= targetMs()) return 'cpu';
    return gaps.trimmedMean() > overBudgetMs() ? 'over' : 'within';
  };

  const setRung = (next) => {
    if (next === rung) return false;
    rung = next;
    rolling.clear();
    gestureWindow.clear();
    changes += 1;
    return true;
  };

  const stepDown = (meanMs) => {
    if (rung >= LAST_RUNG) {
      // Nothing left to give up. Evidence at this rung stays useful; only the
      // count of good gestures restarts.
      goodGestures = 0;
      return false;
    }
    goodGestures = 0;
    if (trialFrom !== null) {
      // A failed trial goes back to exactly where it came from, which was
      // within budget. Not wherever the formula would put it: a vsynced
      // display rounds a frame that missed 16.7 ms up to 33.3, and taken at
      // face value that would land a rung below the one that was fine.
      const origin = trialFrom;
      wait = Math.min(wait * 2, STEP_UP_WAIT_CAP);
      trialFrom = null;
      return setRung(origin);
    }
    return setRung(stepDownRung(rung, meanMs, targetMs()));
  };

  /** Close the gesture that just ended, and decide what the next one starts at. */
  const startGesture = () => {
    const fresh = gestureFrames > 0;
    gestureFrames = 0;
    gestureWindow.clear();
    if (!rolling.full()) return false;

    const verdict = judge(rolling);
    if (verdict === 'over') return stepDown(rolling.trimmedMean());
    if (verdict !== 'within' || !fresh) return false;

    // A trial that has filled a window within budget has succeeded; the rung
    // it reached is simply the current one now.
    trialFrom = null;
    goodGestures += 1;
    if (goodGestures >= wait && rung > 0) {
      goodGestures = 0;
      trialFrom = rung;
      return setRung(rung - 1);
    }
    return false;
  };

  return {
    /**
     * Record one animation frame, before it draws, and settle the rung it is
     * to be drawn at.
     *
     * @param {object} frame
     * @param {number} frame.timestampMs  The `requestAnimationFrame` timestamp.
     * @param {string} frame.action       One of `FRAME_ACTION`.
     * @param {boolean} [frame.sceneDirty] Something other than the camera changed.
     * @param {boolean} [frame.continuous] The loop ran without a break since the
     *   last recorded frame.
     * @param {number} [frame.submitMs]   Main-thread submit time of the previous
     *   frame's draw.
     * @returns {boolean} whether the rung changed on this frame.
     */
    frame({ timestampMs, action, sceneDirty = false, continuous = true, submitMs = 0 }) {
      const interactive = action === FRAME_ACTION.INTERACTIVE;
      const linked = Boolean(continuous && previous);
      const gap = linked ? timestampMs - previous.timestampMs : -1;
      const usable = gap > 0 && gap < MAX_GAP_MS;
      let changed = false;

      refineGapMs = usable && action === FRAME_ACTION.REFINE && previous.action === FRAME_ACTION.REFINE ? gap : null;

      // A frame that drew nothing after another that drew nothing: the gap is
      // the display's own interval (or the browser's cap on animation frames).
      if (usable && drewNothing(action) && drewNothing(previous.action)) {
        refreshGaps.push(gap);
        if (refreshGaps.length > REFRESH_HISTORY) refreshGaps.shift();
      }

      if (interactive) {
        const gestureStart = !linked || previous.action !== FRAME_ACTION.INTERACTIVE;
        if (gestureStart) {
          changed = startGesture();
        } else if (usable && !sceneDirty && !previous.sceneDirty && !previous.reallocated) {
          rolling.add(gap, submitMs);
          gestureWindow.add(gap, submitMs);
          gestureFrames += 1;
          if (gestureWindow.full() && judge(gestureWindow) === 'over') {
            changed = stepDown(gestureWindow.trimmedMean());
          }
        }
        previous = { timestampMs, action, sceneDirty, reallocated: gestureStart || changed };
      } else {
        previous = { timestampMs, action, sceneDirty, reallocated: false };
      }
      return changed;
    },

    /** The render scale of a moving frame, relative to the canvas. */
    get scale() {
      return RUNGS[rung].scale;
    },

    /** Whether moving frames may keep ambient occlusion, as far as this is concerned. */
    get occlusion() {
      return RUNGS[rung].occlusion;
    },

    /**
     * The gap between this frame and the previous one when both were refine
     * samples drawn back to back, else null. Valid until the next `frame`.
     */
    get refineGapMs() {
      return refineGapMs;
    },

    /**
     * The canvas changed size, or a new world arrived: what a frame costs has
     * changed, so the evidence goes and the step-up wait starts again. The rung
     * stays — a pane resized by a few pixels is no reason to throw away what
     * the last minute of orbiting established.
     */
    reset() {
      rolling.clear();
      gestureWindow.clear();
      gestureFrames = 0;
      goodGestures = 0;
      wait = STEP_UP_WAIT_GESTURES;
      trialFrom = null;
      previous = null;
    },

    /** A JSON-safe picture of the policy's state, for `getStats`. */
    snapshot() {
      return {
        scale: RUNGS[rung].scale,
        occlusion: RUNGS[rung].occlusion,
        rung,
        changes,
        windowFrames: rolling.size,
        windowMeanMs: Math.round(rolling.trimmedMean() * 100) / 100,
        refreshMs: Math.round(refreshMs() * 100) / 100,
        goodGestures,
        wait,
        trial: trialFrom !== null,
      };
    },
  };
}
