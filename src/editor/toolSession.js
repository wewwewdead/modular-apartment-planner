/**
 * What `editor.toolState` means, said once.
 *
 * Every tool handler is a stateless closure, so whatever a tool needs to
 * remember lives in one untyped bag that `UPDATE_TOOL_STATE` merges into. Three
 * different kinds of thing share it: what the tool is armed with (the bed the
 * furniture tool places, the fillet radius), how far a multi-click flow has got
 * (a wall's first corner, a beam's first column), and per-frame previews. The
 * questions the rest of the editor asks about that bag are answered here rather
 * than by each asker keeping its own list.
 */

/**
 * The settings that outlive a reset which keeps the tool — a change of floor,
 * of view or of workspace mode. Without them the tool stays the furniture tool
 * but places a kitchen top, and the menu shows nothing checked.
 *
 * Each one is read by a handler that copes with the rest of the bag empty: the
 * door's swing (`openDirection`, flipped with F) and the furniture's turn
 * (`previewRotation`, turned with R) as much as the furniture piece itself.
 * `targetTrussSystemId` and `ceilingTargetFloorId` are left out because they
 * name something on one floor. The truss type and material do not; they are
 * left out with the target because they are seeded from it when the tool is
 * entered (`Toolbar.jsx`, the T key), so a type changed in the truss panel is
 * dropped by the reset as well, and the draw tool falls back to the
 * catalogue's first. `cantileverMode` and `cantileverPick` belong to a plate
 * that the reset deselects.
 */
export const ARMED_SETTING_KEYS = Object.freeze([
  'fixtureType',
  'deviceType',
  'beamPlacementMode',
  'radius',
  'openDirection',
  'previewRotation',
]);

/** The armed settings of `toolState`, and nothing else, as a fresh bag. */
export function keepArmedSettings(toolState) {
  const kept = {};
  if (!toolState) return kept;
  for (const key of ARMED_SETTING_KEYS) {
    if (toolState[key] != null) kept[key] = toolState[key];
  }
  return kept;
}

/**
 * Enter a tool with a selection, settings and a prompt already in place.
 *
 * `SET_TOOL` clears the selection, the tool state and the status line, so
 * whatever the tool should start with has to follow it: the object it works
 * on, then what it is armed with, then the prompt, the order every site used.
 * Each part is sent only when given, so a site that sends only some of them
 * sends the same actions it always did. A function over `dispatch` rather than
 * one reducer action, so every site keeps producing exactly the actions it
 * produced.
 *
 * @param {Function} dispatch the editor dispatch
 * @param {object} entry
 * @param {string} entry.tool
 * @param {{ id: string, objectType: string }} [entry.selection]
 * @param {object} [entry.toolState] merged into the empty tool state
 * @param {string} [entry.statusMessage]
 */
export function enterTool(dispatch, { tool, selection, toolState, statusMessage }) {
  dispatch({ type: 'SET_TOOL', tool });
  if (selection) dispatch({ type: 'SELECT_OBJECT', id: selection.id, objectType: selection.objectType });
  if (toolState) dispatch({ type: 'UPDATE_TOOL_STATE', payload: toolState });
  if (statusMessage != null) dispatch({ type: 'SET_STATUS_MESSAGE', message: statusMessage });
}

/**
 * The markers that say a tool is part-way through something Escape would
 * cancel: a drag, a first point, a first pick.
 *
 * Focus mode withholds Escape while one of these is set, so that the first
 * press cancels the flow and the second leaves focus. That only works because
 * the owning tool's Escape clears every marker listed here — a marker its tool
 * left standing would withhold the second press as well, and focus mode could
 * never be left from the keyboard. A marker is listed only once that has been
 * checked against its handler (see toolSession.test.js).
 */
export const FLOW_MARKER_KEYS = Object.freeze([
  'dragging',
  'pendingDrag',
  'start',
  'chainStart',
  'startColumnId',
  'dimensionStartPoint',
  'sectionStartPoint',
  'stairStartPoint',
  'railingStartPoint',
  'slabPoints',
  'ceilingPoints',
  'ceilingPickBeamIds',
  'cantileverPick',
  'startTrussBeamId',
  'roofParapetStart',
  'roofOpeningPoints',
]);

/** Is a tool in the middle of something Escape would cancel? An empty point list is not. */
export function isToolFlowInProgress(toolState) {
  if (!toolState) return false;
  return FLOW_MARKER_KEYS.some((key) => {
    const value = toolState[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}
