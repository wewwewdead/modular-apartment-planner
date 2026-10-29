// Workstation shortcuts for placing a selected part: R / M pick the rotate or
// move gizmo (pressing the active one again turns it off, like the toolbar
// buttons), ] / [ turn the part by the angle snap step about Z (counter-
// clockwise / clockwise seen from +Z), Shift+] / Shift+[ about X. A pure
// mapping from the key event and workspace state to an action.

// The turn step when the angle snap is 0 (free).
export const DEFAULT_TURN_STEP = 15;

const editable = (target) =>
  Boolean(target?.closest?.('input, select, textarea, [contenteditable=""], [contenteditable="true"]'));

/**
 * @param {KeyboardEvent} event
 * @param {object} state
 * @param {boolean} state.selected  A part is selected.
 * @param {boolean} state.busy      A sketch, hole tool, mate or operation draft is active.
 * @param {boolean} state.placeable The selected part can be moved or turned now.
 * @param {boolean} state.dragging  A gizmo drag is in progress.
 * @param {number}  state.snap      Angle snap in degrees (0 = free).
 * @returns {null | {type: 'gizmo', mode: 'rotate' | 'translate'} | {type: 'turn', axis: 'X' | 'Z', degrees: number}}
 */
export function placementKeyAction(event, { selected, busy, placeable, dragging, snap }) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return null;
  if (editable(event.target) || dragging || !selected || busy) return null;
  const key = event.key?.toLowerCase();
  if ((key === 'r' || key === 'm') && !event.repeat)
    return { type: 'gizmo', mode: key === 'r' ? 'rotate' : 'translate' };
  // By code as well: Shift+[ types "{" on US layouts.
  const left = event.code === 'BracketLeft' || ['[', '{'].includes(event.key);
  const right = event.code === 'BracketRight' || [']', '}'].includes(event.key);
  if ((left || right) && placeable) {
    const step = snap > 0 ? snap : DEFAULT_TURN_STEP;
    return { type: 'turn', axis: event.shiftKey ? 'X' : 'Z', degrees: right ? step : -step };
  }
  return null;
}
