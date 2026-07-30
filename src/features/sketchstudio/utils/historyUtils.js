export const HISTORY_LIMIT = 100;

export function createEmptyHistoryState() {
  return {
    past: [],
    future: [],
  };
}

/**
 * Build an undoable snapshot by REFERENCE, not by clone.
 *
 * `state.document` is treated as immutable — every reducer path that mutates it
 * produces a brand-new `document` object (via object spread) and never edits the
 * previous one in place. That immutability invariant is what makes reference
 * snapshots safe: two history entries that share an unchanged document share the
 * exact same object, so structural sharing keeps each entry cheap (one document
 * reference + a small `ui` object) rather than a deep copy of the whole scene.
 *
 * Do NOT deep-clone here, and do NOT introduce in-place document mutations
 * anywhere in the reducer, or restored snapshots would alias live state.
 */
export function buildUndoableSketchStateSnapshot(state) {
  return {
    document: state.document,
    ui: {
      activeLayerId: state.ui.activeLayerId,
    },
  };
}

/**
 * Cap a history stack to `limit` entries, dropping the OLDEST entries.
 * `past` is oldest-first, so the oldest live at the head. `future` is
 * newest-first (index 0 is the next redo), so its "oldest" redo lives at the
 * tail — `keepEnd: false` trims the tail for that case.
 */
export function capHistoryStack(stack, limit = HISTORY_LIMIT, { keepEnd = true } = {}) {
  if (stack.length <= limit) {
    return stack;
  }
  return keepEnd ? stack.slice(stack.length - limit) : stack.slice(0, limit);
}

export function isSameUndoableSketchStateSnapshot(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.document === right.document && left.ui?.activeLayerId === right.ui?.activeLayerId;
}

export function pushUndoableHistorySnapshot(history, previousSnapshot, nextSnapshot, limit = HISTORY_LIMIT) {
  if (!previousSnapshot || isSameUndoableSketchStateSnapshot(previousSnapshot, nextSnapshot)) {
    return history;
  }

  const lastPastSnapshot = history.past.at(-1);
  const nextPast =
    lastPastSnapshot && isSameUndoableSketchStateSnapshot(lastPastSnapshot, previousSnapshot)
      ? history.past
      : [...history.past, previousSnapshot];

  return {
    past: capHistoryStack(nextPast, limit),
    future: [],
  };
}
