import { isTypingTarget } from '@/utils/keyboard';

/*
 * The rules the wall and ceiling detail editors share for their canvas: when a
 * press counts as a click rather than a drag, and what the Space key does.
 * Each editor keeps its own gesture state; what it decides with that state
 * comes from here, so the two cannot drift apart again.
 */

/**
 * How far, on screen, a press may travel and still be a click. Judged in
 * pixels, not millimetres: zoomed out, a millimetre is a fraction of a pixel,
 * so a bare click used to clear a millimetre test and commit a "move" — which
 * on a generated board, stud or screw layout also froze the whole pattern into
 * custom pieces.
 */
export const CLICK_TRAVEL_PX = 2;

/** The click travel in drawing millimetres at `unitPx` millimetres per pixel; never under 1 mm. */
export function clickTravelUnits(unitPx) {
  return Math.max(1, unitPx * CLICK_TRAVEL_PX);
}

/**
 * Whether a press from `start` to `current` (drawing points, `{ u, v }`) went
 * far enough to be a drag. A move, a copy, a measurement moved whole and a
 * measurement's end grip all commit only past this.
 */
export function travelledPastClick(start, current, unitPx) {
  return Math.hypot(current.u - start.u, current.v - start.v) >= clickTravelUnits(unitPx);
}

/**
 * How far, on screen, a measuring press may travel and still be the first of
 * two clicks rather than a drag from one end to the other. Wider than a plain
 * click: a measurement is aimed, and the hand drifts while aiming.
 */
export const MEASURE_CLICK_PX = 5;

/**
 * Whether the release `event` of a measuring press that began at the gesture's
 * `screenX` / `screenY` stayed within a click. A gesture with no recorded
 * screen position counts as not having moved.
 */
export function isMeasureClick(gesture, event) {
  const travel = Math.hypot(
    event.clientX - (gesture.screenX ?? event.clientX),
    event.clientY - (gesture.screenY ?? event.clientY),
  );
  return travel < MEASURE_CLICK_PX;
}

/** The Space bar, wherever focus is. Every Space release lets the pan latch go. */
export function isSpaceKey(event) {
  return event.code === 'Space';
}

/**
 * Whether a Space key-down arms the pan latch (and is taken from the page):
 * anywhere but a field, where Space types. A focused button included, on
 * purpose: a tool button keeps the focus after it is clicked, and "pick a
 * tool, hold Space, drag" has to pan rather than press the button again.
 * Enter still presses a focused button.
 */
export function spaceArmsPanLatch(event) {
  return isSpaceKey(event) && !isTypingTarget(event.target);
}

/**
 * Whether a Space key-up is taken from the page: every one, so a focused
 * button is not pressed by the release that ends a pan.
 */
export function spaceKeyUpTaken(event) {
  return isSpaceKey(event);
}
