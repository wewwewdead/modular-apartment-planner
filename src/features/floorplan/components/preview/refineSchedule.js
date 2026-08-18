/**
 * When the preview is allowed to start refining.
 *
 * The progressive renderer improves an image over many frames and throws the
 * whole thing away the moment the camera moves. That is fine for a drag, which
 * moves the camera on every single frame and so never starts a refine at all —
 * but a mouse wheel is not a drag. Wheel events arrive in bursts with gaps of
 * tens of milliseconds between them, and each gap is long enough for several
 * refine samples to land. The picture visibly softens, the next wheel tick
 * throws it away and snaps it back, and the cycle repeats for as long as you
 * keep scrolling. Measured on a shadow edge, the snap was up to 93 levels out
 * of 255, several times a second.
 *
 * So refinement waits for genuine stillness rather than merely for a frame in
 * which nothing happened to move. The quiet period is longer than the gap
 * between wheel events and far shorter than a person's sense of "it stopped".
 */

/** How still the camera must be, in milliseconds, before refining begins. */
export const REFINE_QUIET_PERIOD_MS = 180;

/**
 * How long before the refine starts the offscreen buffers are resized for it.
 *
 * The first refinement sample used to pay for the whole step up to the
 * supersampled resolution — reallocating the composer chain, the occlusion
 * buffers and the accumulation target — on top of being the most expensive
 * frame of the run in its own right. That is a visible hitch at exactly the
 * moment the user stopped moving and started looking.
 *
 * SETTLE frames draw nothing, so the allocation is free there. But it must not
 * happen on the *first* settle frame: a momentary pause mid-drag would then pay
 * for a step up it is about to throw away on the next interactive frame, which
 * is the opposite of the trade. So it happens near the end of the quiet window
 * instead — late enough that the camera has genuinely stopped, and with enough
 * lead for at least one frame to land inside it even at 30 fps.
 */
export const REFINE_PRESIZE_LEAD_MS = 50;

export const FRAME_ACTION = Object.freeze({
  /** Camera or scene changed: draw one cheap frame and reset the accumulation. */
  INTERACTIVE: 'interactive',
  /** Nothing moved, but not for long enough yet. Hold the frame as it is. */
  SETTLE: 'settle',
  /** Fold one more sample into the accumulated image. */
  REFINE: 'refine',
  /** Converged and still. Nothing to draw, and no reason to ask for a frame. */
  IDLE: 'idle',
});

/**
 * Decide what a single animation frame should do.
 *
 * Pure, so the policy that governs every frame of the preview can be reasoned
 * about and tested without a GPU, a canvas, or a clock.
 *
 * @param {object} state
 * @param {boolean} state.moved          Camera moved since the previous frame.
 * @param {boolean} state.sceneDirty     Something other than the camera changed.
 * @param {boolean} state.converged      Accumulation has all the samples it gets.
 * @param {number}  state.nowMs          This frame's timestamp.
 * @param {number}  state.lastMovementMs Timestamp of the last INTERACTIVE frame.
 * @param {number} [state.quietPeriodMs]
 * @returns {string} one of FRAME_ACTION
 */
export function nextFrameAction({
  moved,
  sceneDirty,
  converged,
  nowMs,
  lastMovementMs,
  quietPeriodMs = REFINE_QUIET_PERIOD_MS,
}) {
  if (moved || sceneDirty) return FRAME_ACTION.INTERACTIVE;
  if (converged) return FRAME_ACTION.IDLE;
  // A clock that jumps backwards (or a first frame before anything has moved)
  // must not strand the preview in SETTLE forever.
  const stillFor = nowMs - lastMovementMs;
  if (stillFor >= 0 && stillFor < quietPeriodMs) return FRAME_ACTION.SETTLE;
  return FRAME_ACTION.REFINE;
}

/** Whether an action needs another animation frame after it. */
export function wantsAnotherFrame(action) {
  return action !== FRAME_ACTION.IDLE;
}

/**
 * Whether a SETTLE frame should size the offscreen chain for the refine that is
 * about to start.
 *
 * Only ever true on a SETTLE, and only in the last `leadMs` of the quiet window.
 * Pure for the same reason `nextFrameAction` is: this is a policy about frames,
 * and it should be arguable without a GPU.
 */
export function shouldPresizeRefine({
  action,
  nowMs,
  lastMovementMs,
  quietPeriodMs = REFINE_QUIET_PERIOD_MS,
  leadMs = REFINE_PRESIZE_LEAD_MS,
}) {
  if (action !== FRAME_ACTION.SETTLE) return false;
  const stillFor = nowMs - lastMovementMs;
  return stillFor >= quietPeriodMs - leadMs;
}
