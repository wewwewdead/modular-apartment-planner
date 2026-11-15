import { describe, expect, it } from 'vitest';
import { describeMachine } from '@/shared/machine.js';
import { BRAKE, FILM, LASER, MATE, PAINT, PDF_RUN, PRINT, SHOP_STATIONS, activeTool } from './toolSession.js';

describe('MATE', () => {
  it('walks a face mate through its two picks and ends from any stage', () => {
    expect(MATE.initial).toBe('idle');
    expect(describeMachine(MATE)).toEqual([
      'idle --START--> moving',
      'moving --PICK--> target',
      'moving --END--> idle',
      'target --PICK--> placed',
      'target --END--> idle',
      'placed --END--> idle',
    ]);
  });

  it('a pick after the mate is placed changes nothing, and an idle workspace has nothing to end', () => {
    expect(MATE.next('placed', 'PICK')).toBe('placed');
    expect(MATE.next('idle', 'END')).toBe('idle');
    expect(MATE.next('idle', 'PICK')).toBe('idle');
  });
});

describe('PDF_RUN', () => {
  it('lists every way a sheet PDF run moves', () => {
    expect(PDF_RUN.initial).toBe('idle');
    expect(describeMachine(PDF_RUN)).toEqual([
      'idle --START--> working',
      'working --REPORT--> report',
      'working --DONE--> idle',
      'working --CANCEL--> idle',
      'report --START--> working',
      'report --SKIP--> working',
      'report --FIT--> refit',
      'report --DISMISS--> idle',
      'refit --START--> working',
      'refit --CANCEL--> idle',
    ]);
  });

  it('a cancel leaves a report on screen; only a running or refitting export ends', () => {
    expect(PDF_RUN.next('report', 'CANCEL')).toBe('report');
    expect(PDF_RUN.next('working', 'CANCEL')).toBe('idle');
    expect(PDF_RUN.next('refit', 'CANCEL')).toBe('idle');
    // Fit to page is offered on the report only.
    expect(PDF_RUN.next('working', 'FIT')).toBe('working');
  });
});

describe('BRAKE', () => {
  it('runs the press brake: setup and the stroke, hit after hit, until it is left', () => {
    expect(BRAKE.initial).toBe('idle');
    expect(describeMachine(BRAKE)).toEqual([
      'idle --START--> setup',
      'setup --STROKE--> stroke',
      'setup --END--> idle',
      'stroke --DONE--> setup',
      'stroke --END--> idle',
    ]);
  });

  it('a second pedal press during a stroke and a stroke end with no stroke change nothing', () => {
    expect(BRAKE.next('stroke', 'STROKE')).toBe('stroke');
    expect(BRAKE.next('setup', 'DONE')).toBe('setup');
    expect(BRAKE.next('idle', 'END')).toBe('idle');
  });
});

describe('the paint and print stations (SM-3)', () => {
  it('PAINT: a pick or a selected target, the powder, a confirm before prints go', () => {
    expect(PAINT.initial).toBe('idle');
    expect(describeMachine(PAINT)).toEqual([
      'idle --START--> pick',
      'idle --TARGET--> colour',
      'pick --PICK--> colour',
      'pick --END--> idle',
      'colour --PICK--> colour',
      'colour --APPLY--> colour',
      'colour --CONFIRM--> confirm',
      'colour --BACK--> pick',
      'colour --END--> idle',
      'confirm --APPLY--> colour',
      'confirm --BACK--> colour',
      'confirm --END--> idle',
    ]);
    // Nothing to apply before a target is picked; a click while confirming picks nothing.
    expect(PAINT.next('pick', 'APPLY')).toBe('pick');
    expect(PAINT.next('confirm', 'PICK')).toBe('confirm');
  });

  it('PRINT: a face places the artwork, which is then edited until New print', () => {
    expect(PRINT.initial).toBe('idle');
    expect(describeMachine(PRINT)).toEqual([
      'idle --START--> face',
      'face --PICK--> artwork',
      'face --SELECT--> artwork',
      'face --END--> idle',
      'artwork --PICK--> artwork',
      'artwork --SELECT--> artwork',
      'artwork --NEW--> face',
      'artwork --END--> idle',
    ]);
    expect(PRINT.next('face', 'NEW')).toBe('face');
    // SM-4 adds the laser to the shop's one session, SF-5 the replay; no Weld or Assembly station (shop trim).
    expect(SHOP_STATIONS).toEqual({
      paint: PAINT,
      print: PRINT,
      laser: LASER,
      film: FILM,
    });
  });

  it('FILM: the replay plays, pauses, steps, waits on the finished product, and ends from anywhere', () => {
    expect(FILM.initial).toBe('idle');
    expect(describeMachine(FILM)).toEqual([
      'idle --START--> playing',
      'playing --PAUSE--> paused',
      'playing --STEP--> playing',
      'playing --DONE--> ended',
      'playing --END--> idle',
      'paused --PLAY--> playing',
      'paused --STEP--> paused',
      'paused --END--> idle',
      'ended --PLAY--> playing',
      'ended --STEP--> paused',
      'ended --END--> idle',
    ]);
    // Only a running film reaches its end; a paused one waits; play while playing changes nothing.
    expect(FILM.next('paused', 'DONE')).toBe('paused');
    expect(FILM.next('playing', 'PLAY')).toBe('playing');
    expect(FILM.next('idle', 'PAUSE')).toBe('idle');
  });

  it('LASER: the sheet, Cut runs the cut path, its end or Stop comes back to the sheet', () => {
    expect(LASER.initial).toBe('idle');
    expect(describeMachine(LASER)).toEqual([
      'idle --START--> sheet',
      'sheet --CUT--> cutting',
      'sheet --END--> idle',
      'cutting --DONE--> sheet',
      'cutting --STOP--> sheet',
      'cutting --END--> idle',
    ]);
    // A second Cut while cutting, and a stop or an end of a cut with none running, change nothing.
    expect(LASER.next('cutting', 'CUT')).toBe('cutting');
    expect(LASER.next('sheet', 'DONE')).toBe('sheet');
    expect(LASER.next('sheet', 'STOP')).toBe('sheet');
  });
});

describe('activeTool', () => {
  const none = {
    operationDraft: null,
    sketchSession: null,
    mateSession: null,
    measureSession: null,
    holeMode: null,
    brakeSession: null,
  };
  it.each([
    [{}, null],
    [{ operationDraft: { type: 'hole' } }, 'operation'],
    [{ sketchSession: { stage: 'pick' } }, 'sketch'],
    [{ mateSession: { stage: 'placed' } }, 'mate'],
    // Measure is an empty object while points are picked.
    [{ measureSession: {} }, 'measure'],
    [{ holeMode: 'place' }, 'hole'],
    [{ holeMode: 'move' }, 'hole'],
    [{ brakeSession: { stage: 'setup' } }, 'brake'],
    [{ brakeSession: { stage: 'stroke' } }, 'brake'],
    // One session for the finishing stations: the tool is its station.
    [{ shopSession: { station: 'paint', stage: 'pick' } }, 'paint'],
    [{ shopSession: { station: 'print', stage: 'artwork' } }, 'print'],
    [{ shopSession: { station: 'laser', stage: 'cutting' } }, 'laser'],
    // SF-5: the replay owns the view while it plays.
    [{ shopSession: { station: 'film', stage: 'paused' } }, 'film'],
    // The first listed wins if two are ever open.
    [{ brakeSession: { stage: 'setup' }, shopSession: { station: 'paint', stage: 'pick' } }, 'brake'],
  ])('%j is %s', (state, tool) => {
    expect(activeTool({ ...none, ...state })).toBe(tool);
  });

  it('reads a workspace with no state given as no tool', () => {
    expect(activeTool({})).toBeNull();
  });
});
