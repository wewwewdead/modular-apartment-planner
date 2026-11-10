import { defineMachine } from '@/shared/machine';

/**
 * The Sketch Studio document status: what the top bar badge, the status bar and
 * the 3D workshop footer say about the file.
 *
 *   idle       nothing loaded from or written to a file yet (or a New sketch)
 *   recovered  the last session's autosave was restored on mount
 *   opened     a file was opened or imported
 *   saving     a save is under way (the picker may still be open)
 *   saved      the last save finished
 *   error      an open, import or save failed
 *   dirty      the document no longer matches what was loaded or saved
 *
 * Loading a workspace, starting a save and a save or open finishing either way
 * replace the status whatever it was, so those five events are accepted from
 * every state. Edits and their undo (EDIT / CLEAN) come from the dirty check.
 *
 * Closing the save picker is not a failure: it undoes SAVE, so the status goes
 * back to what it was before the save started. A table cannot remember where it
 * came from, so the way back is one RESUME event per status, and the hook sends
 * the one for the status it noted when the save began (`resumeEventFor`).
 */
const FROM_ANY_STATUS = { LOAD: 'idle', OPEN: 'opened', SAVE: 'saving', SAVED: 'saved', FAIL: 'error' };

export const sketchPersistenceMachine = defineMachine({
  id: 'sketch-persistence',
  initial: 'idle',
  states: {
    idle: { ...FROM_ANY_STATUS, RECOVER: 'recovered', EDIT: 'dirty' },
    recovered: { ...FROM_ANY_STATUS, EDIT: 'dirty' },
    opened: { ...FROM_ANY_STATUS, EDIT: 'dirty' },
    saving: {
      ...FROM_ANY_STATUS,
      EDIT: 'dirty',
      RESUME_IDLE: 'idle',
      RESUME_RECOVERED: 'recovered',
      RESUME_OPENED: 'opened',
      RESUME_SAVED: 'saved',
      RESUME_ERROR: 'error',
      RESUME_DIRTY: 'dirty',
    },
    saved: { ...FROM_ANY_STATUS, EDIT: 'dirty' },
    // DISMISS keeps the status and only drops the message: the toast is gone,
    // but the last operation still failed.
    error: { ...FROM_ANY_STATUS, EDIT: 'dirty', DISMISS: 'error' },
    dirty: { ...FROM_ANY_STATUS, CLEAN: 'idle' },
  },
});

/** The event that takes a cancelled save back to `status`. */
export function resumeEventFor(status) {
  return `RESUME_${String(status).toUpperCase()}`;
}

/**
 * The persistence meta after `event`. An event the current status does not
 * accept leaves the meta exactly as it is. An accepted one writes `fields`, and
 * clears the error unless it brings one: a message belongs to the failure that
 * reported it, and must not outlive the status that showed it.
 */
export function advancePersistenceMeta(current, event, fields = {}) {
  if (!sketchPersistenceMachine.can(current.status, event)) return current;
  return {
    ...current,
    ...fields,
    status: sketchPersistenceMachine.next(current.status, event),
    error: fields.error ?? null,
  };
}
