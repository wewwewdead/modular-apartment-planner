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

// The press brake station (CadWorkspace `brakeSession.stage`; null is idle;
// docs/sketch-studio-fab-shop.md §9 SM-2). Setup is picking the gauge edge,
// L, the angle and the tooling; the pedal starts a stroke, whose end commits
// the bend (or, re-running a step, only shows it) and returns to setup for
// the next hit. Leave, Esc with nothing picked or a new selection end it; a
// stroke is never cut short by a key, only by the station going away.
export const BRAKE = defineMachine({
  id: 'cad-brake',
  initial: 'idle',
  states: {
    idle: { START: 'setup' },
    setup: { STROKE: 'stroke', END: 'idle' },
    stroke: { DONE: 'setup', END: 'idle' },
  },
});

// The paint and print stations (docs/sketch-studio-fab-shop.md §9 SM-3), the
// laser (SM-4) and the replay (shop floor §8) share one workspace session,
// `shopSession` ({ station, stage, ... }; null is idle), each station with its
// own table. Every one of them owns the viewport's clicks while open; Leave,
// Esc at the first stage, the part going away or a new selection
// (resetSelectionTools) END it.
//
// Paint: pick a part (or start on a selected part or group) to choose what is
// painted, set the powder, Paint commits the finish rows. A target with
// prints asks first (CONFIRM): painting removes them. Strip paint confirms the
// same way. Esc steps back (confirm → colour → pick) and then leaves.
export const PAINT = defineMachine({
  id: 'cad-paint',
  initial: 'idle',
  states: {
    idle: { START: 'pick', TARGET: 'colour' },
    pick: { PICK: 'colour', END: 'idle' },
    colour: { PICK: 'colour', APPLY: 'colour', CONFIRM: 'confirm', BACK: 'pick', END: 'idle' },
    confirm: { APPLY: 'colour', BACK: 'colour', END: 'idle' },
  },
});

// Print: pick a flat face to place the artwork set in the panel (text or an
// image); the print is then the one being edited (fields, drag on its face)
// until New print goes back to the face pick. Picking another face in
// `artwork` moves the selected print there; choosing a print from the list
// selects it. Esc deselects the print, then leaves.
export const PRINT = defineMachine({
  id: 'cad-print',
  initial: 'idle',
  states: {
    idle: { START: 'face' },
    face: { PICK: 'artwork', SELECT: 'artwork', END: 'idle' },
    artwork: { PICK: 'artwork', SELECT: 'artwork', NEW: 'face', END: 'idle' },
  },
});
// Laser (§9 SM-4): the selected sheet-metal part's blank nested on the stock
// sheet. At `sheet` the sheet, the quantity and the etched marks are set; Cut
// runs the cut-path animation (`cutting`), whose end (DONE) or Stop (STOP)
// comes back to the sheet. Esc stops a cut, then leaves.
export const LASER = defineMachine({
  id: 'cad-laser',
  initial: 'idle',
  states: {
    idle: { START: 'sheet' },
    sheet: { CUT: 'cutting', END: 'idle' },
    cutting: { DONE: 'sheet', STOP: 'sheet', END: 'idle' },
  },
});
// Replay the build (docs/sketch-studio-shop-floor.md §8, SF-5): the product's
// route as a film (shopFilm.js). START plays it from the first scene; PAUSE
// and PLAY stop and run its clock; STEP (previous, next, a row of the step
// list) moves to a scene without changing whether it plays; the last scene's
// end is DONE, which waits on the finished product (PLAY there starts it
// again, STEP looks back at a scene). Esc, End replay and a new selection END
// it. It is the shop session's `station: 'film'`, so every rule that keeps
// another tool out while a station is open keeps it out too; it writes nothing.
export const FILM = defineMachine({
  id: 'cad-film',
  initial: 'idle',
  states: {
    idle: { START: 'playing' },
    playing: { PAUSE: 'paused', STEP: 'playing', DONE: 'ended', END: 'idle' },
    paused: { PLAY: 'playing', STEP: 'paused', END: 'idle' },
    ended: { PLAY: 'playing', STEP: 'paused', END: 'idle' },
  },
});
export const SHOP_STATIONS = Object.freeze({
  paint: PAINT,
  print: PRINT,
  laser: LASER,
  film: FILM,
});

// The tool that owns the viewport's clicks, or null when none does. Only one
// is meant to be open at a time; if two ever are, the first listed wins.
export function activeTool({
  operationDraft,
  sketchSession,
  mateSession,
  measureSession,
  holeMode,
  brakeSession,
  shopSession = null,
}) {
  if (operationDraft) return 'operation';
  if (sketchSession) return 'sketch';
  if (mateSession) return 'mate';
  if (measureSession) return 'measure';
  if (holeMode) return 'hole';
  if (brakeSession) return 'brake';
  if (shopSession) return shopSession.station;
  return null;
}
