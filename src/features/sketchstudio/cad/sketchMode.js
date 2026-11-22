// The in-viewport sketcher's modes (sketchTools.js sketchReducer). The state
// has no mode field: which mode it is in is read off the fields that are set,
// and each mode owns some of them. This module is the one definition of both:
// what "no mode" is, which mode a state is in, and the rules a state must
// keep. Every action that leaves every mode spreads NO_MODE, so a field a new
// mode adds is cleared by all of them at once.

// Every field a mode owns, at rest. The selection is not in it: a tool clears
// it, an action keeps it, Ctrl+A and a Check row replace it, Undo keeps what
// still exists, so each of those says what it does with it.
export const NO_MODE = Object.freeze({
  tool: null,
  points: Object.freeze([]),
  chainStart: null,
  pending: null,
  offsetFrom: null,
  reliefCut: null,
  box: null,
  op: null,
  drag: null,
});

/**
 * Which mode the sketcher is in, in the order Esc takes them: 'box' (a box
 * being dragged), 'drag' (the selection being dragged), 'action' (Move,
 * Copy, Rotate, Mirror or Pattern on the selection), 'tool' (a Draw, Edit,
 * Zero, Dimension or Relief tool), 'selection' (entities or one dimension) or
 * 'idle' (nothing: Esc finishes the sketch).
 */
export function sketchMode(state) {
  if (state.box) return 'box';
  if (state.drag) return 'drag';
  if (state.op) return 'action';
  if (state.tool) return 'tool';
  if (state.selectedIds.length || state.selectedDimensionId) return 'selection';
  return 'idle';
}

/**
 * The rules a sketcher state keeps, as the words of each one it breaks; [] when
 * it keeps them all. Every way out of a mode must leave a state with none.
 */
export function modeViolations(state) {
  const found = [];
  const { tool, op, selectedIds, selectedDimensionId } = state;
  const entityIds = new Set(state.entities.map((e) => e.id));
  if (tool && (selectedIds.length || selectedDimensionId)) found.push('a tool with a selection');
  if (op && tool) found.push('an action and a tool together');
  if (state.box && (tool || op)) found.push('a box under a tool or an action');
  if (state.drag && (tool || op)) found.push('a drag under a tool or an action');
  if (op && !selectedIds.length) found.push('an action with nothing selected');
  if (selectedIds.some((id) => !entityIds.has(id))) found.push('a selected entity that no longer exists');
  if (selectedDimensionId && !state.dimensions.some((d) => d.id === selectedDimensionId))
    found.push('a selected dimension that no longer exists');
  if (selectedDimensionId && selectedIds.length) found.push('a dimension selected with entities');
  if (state.points.length && !tool) found.push('a half-drawn shape with no tool');
  if (state.chainStart && tool !== 'line') found.push('a polyline start outside Line');
  if (state.pending && tool !== 'dimension') found.push('a pending dimension outside Dimension');
  if (state.offsetFrom && (tool !== 'offset' || !entityIds.has(state.offsetFrom)))
    found.push('an Offset choice outside Offset or of an entity gone');
  if (state.reliefCut && tool !== 'relief') found.push('a relief readout outside Relief');
  return found;
}
