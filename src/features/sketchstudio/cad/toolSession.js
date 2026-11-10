// Which tool the CAD workstation is running, and the two small lifecycles in
// it that are written down as tables (src/shared/machine.js).
//
// CadWorkspace keeps "which tool is active" in separate pieces of state (an
// operation draft, a sketch session, a mate session, Measure, the hole tool).
// They stay where they are; this module only names what they add up to.
import { defineMachine } from '@/shared/machine.js';

// Face-to-face mate (CadWorkspace `mateSession`; null is idle). The first pick
// chooses the face to move, the second the face it sits against, and that
// second pick commits the move. Any stage can end: Done or a new selection
// keep a placed move, Cancel mate puts it back, Esc ends a pick.
export const MATE = defineMachine({
  id: 'cad-mate',
  initial: 'idle',
  states: {
    idle: { START: 'moving' },
    moving: { PICK: 'target', END: 'idle' },
    target: { PICK: 'placed', END: 'idle' },
    placed: { END: 'idle' },
  },
});

// A sheet PDF export (CadWorkspace `pdfRun.stage`; null is idle). A run that
// finds a sheet it cannot print stops on a report instead of writing; from
// there the user exports the other sheets, fits one to its page (the run waits
// for that commit to rebuild, then starts again on the same file) or drops it.
// Export PDF is open again while a report shows, so a fresh run can start from
// it. Cancel aborts a working run, whose own end then returns it to idle.
export const PDF_RUN = defineMachine({
  id: 'cad-pdf-run',
  initial: 'idle',
  states: {
    idle: { START: 'working' },
    working: { REPORT: 'report', DONE: 'idle', CANCEL: 'idle' },
    report: { START: 'working', SKIP: 'working', FIT: 'refit', DISMISS: 'idle' },
    refit: { START: 'working', CANCEL: 'idle' },
  },
});

// The tool that owns the viewport's clicks, or null when none does. Only one
// is meant to be open at a time; if two ever are, the first listed wins.
export function activeTool({ operationDraft, sketchSession, mateSession, measureSession, holeMode }) {
  if (operationDraft) return 'operation';
  if (sketchSession) return 'sketch';
  if (mateSession) return 'mate';
  if (measureSession) return 'measure';
  if (holeMode) return 'hole';
  return null;
}
