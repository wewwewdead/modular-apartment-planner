import { describe, expect, it } from 'vitest';
import { describeMachine } from '@/shared/machine.js';
import { MATE, PDF_RUN, activeTool } from './toolSession.js';

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

describe('activeTool', () => {
  const none = { operationDraft: null, sketchSession: null, mateSession: null, measureSession: null, holeMode: null };
  it.each([
    [{}, null],
    [{ operationDraft: { type: 'hole' } }, 'operation'],
    [{ sketchSession: { stage: 'pick' } }, 'sketch'],
    [{ mateSession: { stage: 'placed' } }, 'mate'],
    // Measure is an empty object while points are picked.
    [{ measureSession: {} }, 'measure'],
    [{ holeMode: 'place' }, 'hole'],
    [{ holeMode: 'move' }, 'hole'],
  ])('%j is %s', (state, tool) => {
    expect(activeTool({ ...none, ...state })).toBe(tool);
  });

  it('reads a workspace with no state given as no tool', () => {
    expect(activeTool({})).toBeNull();
  });
});
