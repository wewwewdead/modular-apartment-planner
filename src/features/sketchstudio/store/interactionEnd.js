import {
  cancelAnchorDrag,
  cancelHandleDrag,
  cancelTransform,
  endAnchorDrag,
  endHandleDrag,
  endPan,
  endSelectionBox,
  endTransform,
} from './sketchStudioActions';

/**
 * How a canvas gesture ends, for each way it can end.
 *
 * A gesture in `interaction.mode` is stopped by one of four things: the button
 * coming up (`release`), the browser taking the pointer away (`abort`), Escape
 * while the button is still down (`escape`), or undo pressed mid-gesture
 * (`undo`). Each of those lives in a different hook, and before this table they
 * each decided for themselves -- Escape kept a moved selection where undo put it
 * back, and did nothing at all for a handle drag, a pan or a marquee.
 *
 *   commit  keep what the drag did, as one history entry
 *   cancel  put the document back as it was when the drag started, no entry
 *   end     nothing to keep or put back (a pan, a marquee): just stop
 *
 * A release and an abort keep the work: the user let go, or the browser did it
 * for them, and neither means "throw that away". Escape and undo both mean it.
 */
export const INTERACTION_END = Object.freeze({
  panning: Object.freeze({ release: 'end', abort: 'end', escape: 'end', undo: 'end' }),
  'selection-box': Object.freeze({ release: 'end', abort: 'end', escape: 'end', undo: 'end' }),
  'handle-drag': Object.freeze({ release: 'commit', abort: 'commit', escape: 'cancel', undo: 'cancel' }),
  'anchor-drag': Object.freeze({ release: 'commit', abort: 'commit', escape: 'cancel', undo: 'cancel' }),
  transform: Object.freeze({ release: 'commit', abort: 'commit', escape: 'cancel', undo: 'cancel' }),
});

const END_ACTIONS = {
  panning: { end: endPan },
  'selection-box': { end: endSelectionBox },
  'handle-drag': { commit: endHandleDrag, cancel: cancelHandleDrag },
  'anchor-drag': { commit: endAnchorDrag, cancel: cancelAnchorDrag },
  transform: { commit: endTransform, cancel: cancelTransform },
};

/** True while a gesture the table covers is under way (not idle, not drawing). */
export function isInteractionInFlight(mode) {
  return Object.hasOwn(INTERACTION_END, mode ?? '');
}

/** `commit`, `cancel` or `end`; null when `mode` has no gesture to end. */
export function getInteractionEnd(mode, cause) {
  return isInteractionInFlight(mode) ? (INTERACTION_END[mode][cause] ?? null) : null;
}

/** The action that ends `mode` for `cause`; null when there is nothing to end. */
export function interactionEndAction(mode, cause) {
  const outcome = getInteractionEnd(mode, cause);
  return outcome ? END_ACTIONS[mode][outcome]() : null;
}
