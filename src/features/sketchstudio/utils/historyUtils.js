const HISTORY_LIMIT = 100;

export function createEmptyHistoryState() {
  return {
    past: [],
    future: [],
  };
}

export function buildUndoableSketchStateSnapshot(state) {
  return {
    document: state.document,
    ui: {
      activeLayerId: state.ui.activeLayerId,
    },
  };
}

export function isSameUndoableSketchStateSnapshot(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.document === right.document
    && left.ui?.activeLayerId === right.ui?.activeLayerId;
}

export function pushUndoableHistorySnapshot(history, previousSnapshot, nextSnapshot, limit = HISTORY_LIMIT) {
  if (!previousSnapshot || isSameUndoableSketchStateSnapshot(previousSnapshot, nextSnapshot)) {
    return history;
  }

  const lastPastSnapshot = history.past.at(-1);
  const nextPast = lastPastSnapshot && isSameUndoableSketchStateSnapshot(lastPastSnapshot, previousSnapshot)
    ? history.past
    : [...history.past, previousSnapshot];

  return {
    past: nextPast.slice(Math.max(0, nextPast.length - limit)),
    future: [],
  };
}
