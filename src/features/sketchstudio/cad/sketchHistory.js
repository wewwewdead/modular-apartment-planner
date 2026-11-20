// Undo / Redo for the in-viewport sketcher (docs/sketch-studio-hand-drawing.md
// §5.2, HD-1). The history is two stacks of { entities, dimensions }
// snapshots: the arrays are never mutated, so a snapshot is two references.
// Every action that changes the drawing goes through `commit`; a tool switch,
// a cursor move, a selection or a typed-but-not-entered value never does.
// Pure: the state is any object with `entities`, `dimensions` and `history`.

// The undo stack holds at most this many steps; the oldest goes first.
export const HISTORY_LIMIT = 200;

export const emptyHistory = () => ({ undo: [], redo: [] });
const snapshot = (state) => ({ entities: state.entities, dimensions: state.dimensions });
const historyOf = (state) => state.history || emptyHistory();

/**
 * `next` with `state`'s drawing pushed as one undo step and the redo stack
 * cleared. A `next` whose entities and dimensions are the very arrays of
 * `state` changed nothing: it is returned with the history untouched.
 */
export function commit(state, next) {
  if (next.entities === state.entities && next.dimensions === state.dimensions) return next;
  const { undo } = historyOf(state);
  return { ...next, history: { undo: [...undo, snapshot(state)].slice(-HISTORY_LIMIT), redo: [] } };
}

export const canUndo = (state) => historyOf(state).undo.length > 0;
export const canRedo = (state) => historyOf(state).redo.length > 0;

// One step back: the last snapshot's drawing, the current one onto redo; null when there is none.
export function undo(state) {
  const { undo: back, redo } = historyOf(state);
  if (!back.length) return null;
  const last = back.at(-1);
  return {
    ...state,
    ...last,
    history: { undo: back.slice(0, -1), redo: [...redo, snapshot(state)] },
  };
}

// One step forward again: the reverse of `undo`; null when there is none.
export function redo(state) {
  const { undo: back, redo: forward } = historyOf(state);
  if (!forward.length) return null;
  const next = forward.at(-1);
  return {
    ...state,
    ...next,
    history: { undo: [...back, snapshot(state)].slice(-HISTORY_LIMIT), redo: forward.slice(0, -1) },
  };
}
