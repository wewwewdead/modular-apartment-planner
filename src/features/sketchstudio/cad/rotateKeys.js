// Workstation shortcuts for placing a selected part: R / M pick the rotate or
// move gizmo (pressing the active one again turns it off, like the toolbar
// buttons), ] / [ turn the part by the angle snap step about Z (counter-
// clockwise / clockwise seen from +Z), Shift+] / Shift+[ about X. D starts or
// stops the Measure tool, with or without a selection; S starts New sketch
// (never while another tool runs). A pure mapping from the key event and
// workspace state to an action.

// The turn step when the angle snap is 0 (free).
export const DEFAULT_TURN_STEP = 15;

const editable = (target) =>
  Boolean(target?.closest?.('input, select, textarea, [contenteditable=""], [contenteditable="true"]'));

/**
 * @param {KeyboardEvent} event
 * @param {object} state
 * @param {boolean} state.selected  A part is selected.
 * @param {boolean} state.busy      A sketch, hole tool, mate, operation draft or Measure is active.
 * @param {boolean} state.placeable The selected part can be moved or turned now.
 * @param {boolean} state.dragging  A gizmo drag is in progress.
 * @param {number}  state.snap      Angle snap in degrees (0 = free).
 * @param {boolean} [state.measuring] Measure is the active tool (busy, but D still stops it).
 * @param {boolean} [state.toolGizmo] A boolean operation's tool gizmo is shown (busy, but R / M still
 *   switch it between rotate and move; spec §6 of docs/sketch-studio-direct-placement.md).
 * @returns {null | {type: 'gizmo', mode: 'rotate' | 'translate'} | {type: 'turn', axis: 'X' | 'Z', degrees: number}
 *   | {type: 'tool', tool: 'measure' | 'sketch'}}
 */
export function placementKeyAction(
  event,
  { selected, busy, placeable, dragging, snap, measuring = false, toolGizmo = false },
) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return null;
  if (editable(event.target) || dragging) return null;
  const key = event.key?.toLowerCase();
  // Measure needs no selection; the other tools keep D out while they run.
  if (key === 'd' && !event.repeat && (!busy || measuring)) return { type: 'tool', tool: 'measure' };
  // New sketch needs no selection; unlike D it does not fire while a tool runs.
  if (key === 's' && !event.repeat && !busy) return { type: 'tool', tool: 'sketch' };
  if (toolGizmo && (key === 'r' || key === 'm') && !event.repeat)
    return { type: 'gizmo', mode: key === 'r' ? 'rotate' : 'translate', toolGizmo: true };
  if (!selected || busy) return null;
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
