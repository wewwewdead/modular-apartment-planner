import { defineMachine } from '@/shared/machine';

/**
 * A project on its way in from the Open Project dialog.
 *
 * Three ways in: a browser draft (`draft`), a file from the open picker
 * (`picking` until a file is chosen, then `reading`), and a file from the
 * plain file input, which arrives already chosen (`reading`). A file that
 * turns out to be an archive is `unpacking` after it has been read.
 *
 * Every stage ends in one of three ways: the project is put on screen
 * (COMMIT), it could not be opened (FAIL), or the user closed the dialog or the
 * picker (CANCEL). After a CANCEL the load is still running somewhere, and
 * whatever it reports later — progress, result or failure — reaches `idle`,
 * which has no use for any of it.
 *
 * The UI's `projectOpening` object (`{ stage: 'draft', draftId }` or
 * `{ stage: 'reading' | 'unpacking', name }`) is drawn from these stages;
 * `picking` has nothing to show, because the picker is on screen instead.
 */
export const projectOpenMachine = defineMachine({
  id: 'project-open',
  initial: 'idle',
  states: {
    idle: { OPEN_DRAFT: 'draft', PICK: 'picking', READ: 'reading' },
    picking: { READ: 'reading', FAIL: 'idle', CANCEL: 'idle' },
    draft: { COMMIT: 'idle', FAIL: 'idle', CANCEL: 'idle' },
    reading: { READ: 'reading', UNPACK: 'unpacking', COMMIT: 'idle', FAIL: 'idle', CANCEL: 'idle' },
    unpacking: { UNPACK: 'unpacking', COMMIT: 'idle', FAIL: 'idle', CANCEL: 'idle' },
  },
});

const STAGE_EVENTS = { reading: 'READ', unpacking: 'UNPACK' };

/** The event for a stage a file reader reports through `onProgress`. */
export function projectOpenEventForStage(stage) {
  return Object.hasOwn(STAGE_EVENTS, stage) ? STAGE_EVENTS[stage] : null;
}
