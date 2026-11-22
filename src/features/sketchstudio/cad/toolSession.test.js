import { describe, expect, it } from 'vitest';
import { describeMachine } from '@/shared/machine.js';
import {
  BRAKE,
  FILM,
  LASER,
  LIGHT_TOOLS,
  MATE,
  PAINT,
  PDF_RUN,
  PRINT,
  ROUTE_WAITS_FOR,
  SELECTION_FREE_TOOLS,
  SHOP_STATIONS,
  activeTool,
  openTools,
  resumeEvent,
  resumeSession,
  toolOpenBesides,
} from './toolSession.js';

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
      'idle --RESUME_SETUP--> setup',
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
      'idle --RESUME_PICK--> pick',
      'idle --RESUME_COLOUR--> colour',
      'idle --RESUME_CONFIRM--> confirm',
      'pick --PICK--> colour',
      'pick --END--> idle',
      'colour --PICK--> colour',
      'colour --APPLY--> colour',
      'colour --CONFIRM--> confirm',
      'colour --BACK--> pick',
      'colour --GONE--> pick',
      'colour --END--> idle',
      'confirm --APPLY--> colour',
      'confirm --BACK--> colour',
      'confirm --GONE--> pick',
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
      'idle --RESUME_FACE--> face',
      'idle --RESUME_ARTWORK--> artwork',
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
      'idle --AUTOCUT--> cutting',
      'idle --RESUME_SHEET--> sheet',
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

describe('resumeSession', () => {
  it('puts back the very session the replay started over, at any stage it can start over', () => {
    const cases = [
      [BRAKE, 'setup'],
      [PAINT, 'pick'],
      [PAINT, 'colour'],
      [PAINT, 'confirm'],
      [PRINT, 'face'],
      [PRINT, 'artwork'],
      [LASER, 'sheet'],
    ];
    for (const [machine, stage] of cases) {
      const session = { stage, key: 'k' };
      expect(resumeSession(machine, session)).toBe(session);
    }
  });

  it('has nothing to put back for no session, and none for a stroke or a cut, which keep the replay out', () => {
    expect(resumeSession(BRAKE, null)).toBe(null);
    expect(resumeSession(undefined, null)).toBe(null);
    expect(resumeSession(BRAKE, { stage: 'stroke' })).toBe(null);
    expect(resumeSession(LASER, { stage: 'cutting' })).toBe(null);
    expect(resumeEvent('artwork')).toBe('RESUME_ARTWORK');
  });

  it('a paint booth whose targets all go is back at the pick from either stage; the pick stays', () => {
    expect(PAINT.next('colour', 'GONE')).toBe('pick');
    expect(PAINT.next('confirm', 'GONE')).toBe('pick');
    expect(PAINT.next('pick', 'GONE')).toBe('pick');
    // The two Backs it was written as before, composed: the same answer from every stage.
    for (const stage of PAINT.states)
      if (stage !== 'idle') expect(PAINT.next(stage, 'GONE')).toBe(PAINT.next(PAINT.next(stage, 'BACK'), 'BACK'));
  });

  it('Cut on the laser opens it cutting in one move, as START then CUT did', () => {
    expect(LASER.next('idle', 'AUTOCUT')).toBe(LASER.next(LASER.next('idle', 'START'), 'CUT'));
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

// Every combination of the workspace's sessions: each one closed or open (the
// sketch picking or drawing, the hole tool placing or moving, the shop session
// at each of its stations), so a rule written over openTools can be compared
// with the hand-written list it replaced.
const SESSION_VALUES = {
  operationDraft: [null, { type: 'hole' }],
  sketchSession: [null, { stage: 'pick' }, { stage: 'draw' }],
  mateSession: [null, { stage: 'moving' }],
  // Measure is an empty object while points are picked.
  measureSession: [null, {}],
  holeMode: [null, 'place', 'move'],
  brakeSession: [null, { stage: 'setup' }, { stage: 'stroke' }],
  shopSession: [null, ...Object.keys(SHOP_STATIONS).map((station) => ({ station, stage: 'pick' }))],
};
function combinations(values) {
  return Object.entries(values).reduce(
    (all, [key, options]) => all.flatMap((state) => options.map((value) => ({ ...state, [key]: value }))),
    [{}],
  );
}
const EVERY_SESSION = combinations(SESSION_VALUES);
const FLAGS = [false, true];

describe('openTools', () => {
  it('lists every open tool in the order activeTool reads them', () => {
    expect(openTools({})).toEqual([]);
    expect(
      openTools({
        operationDraft: { type: 'hole' },
        sketchSession: { stage: 'pick' },
        mateSession: { stage: 'moving' },
        measureSession: {},
        holeMode: 'place',
        brakeSession: { stage: 'setup' },
        shopSession: { station: 'film', stage: 'playing' },
      }),
    ).toEqual(['operation', 'sketch', 'mate', 'measure', 'hole', 'brake', 'film']);
    // Measure left open under a replay: both are there, Measure first.
    expect(openTools({ measureSession: {}, shopSession: { station: 'film', stage: 'playing' } })).toEqual([
      'measure',
      'film',
    ]);
  });

  it('toolOpenBesides asks for a tool outside the exceptions', () => {
    expect(toolOpenBesides([], LIGHT_TOOLS)).toBe(false);
    expect(toolOpenBesides(['measure', 'hole'], LIGHT_TOOLS)).toBe(false);
    expect(toolOpenBesides(['measure', 'film'], LIGHT_TOOLS)).toBe(true);
    expect(toolOpenBesides(['operation'], SELECTION_FREE_TOOLS)).toBe(false);
    expect(toolOpenBesides(['laser'], SELECTION_FREE_TOOLS)).toBe(true);
  });

  // activeTool is now the first of openTools: the same answer as the chain it was.
  it('activeTool answers as its own chain did, for every combination of sessions', () => {
    const before = ({
      operationDraft,
      sketchSession,
      mateSession,
      measureSession,
      holeMode,
      brakeSession,
      shopSession = null,
    }) => {
      if (operationDraft) return 'operation';
      if (sketchSession) return 'sketch';
      if (mateSession) return 'mate';
      if (measureSession) return 'measure';
      if (holeMode) return 'hole';
      if (brakeSession) return 'brake';
      if (shopSession) return shopSession.station;
      return null;
    };
    for (const s of EVERY_SESSION) expect(activeTool(s)).toBe(before(s));
  });
});

// The workspace's "is another tool open" rules (CadWorkspace.jsx), each as it
// was written by hand and as it now reads openTools, over every combination of
// sessions and of the rule's other inputs. The left side of each comparison is
// the old expression, kept as it was; the right side is the site's new code.
describe('the workspace rules read over openTools', () => {
  const each = (extra, check) => {
    for (const s of EVERY_SESSION)
      for (const x of combinations(extra)) check({ ...s, ...x }, openTools(s), activeTool(s));
  };

  it('measureBlocked: Measure waits for every other tool, an exploded view and a busy export', () => {
    each({ exploded: FLAGS, busy: FLAGS }, (s, tools) => {
      const old = Boolean(
        s.exploded ||
        s.operationDraft ||
        s.sketchSession ||
        s.mateSession ||
        s.holeMode ||
        s.brakeSession ||
        s.shopSession ||
        s.busy,
      );
      expect(Boolean(s.exploded || s.busy || toolOpenBesides(tools, ['measure']))).toBe(old);
    });
  });

  it('placeable: the gizmo works only with no tool open at all', () => {
    each({ exploded: FLAGS, busy: FLAGS, rest: FLAGS }, (s, tools) => {
      const old = Boolean(
        s.rest &&
        !s.exploded &&
        !s.busy &&
        !s.operationDraft &&
        !s.holeMode &&
        !s.sketchSession &&
        !s.mateSession &&
        !s.brakeSession &&
        !s.shopSession &&
        !s.measureSession,
      );
      expect(Boolean(s.rest && !s.exploded && !s.busy && !tools.length)).toBe(old);
    });
  });

  it('the group keys wait for any tool or a busy export', () => {
    each({ busy: FLAGS }, (s, tools) => {
      const old = Boolean(
        s.sketchSession ||
        s.holeMode ||
        s.mateSession ||
        s.operationDraft ||
        s.measureSession ||
        s.brakeSession ||
        s.shopSession ||
        s.busy,
      );
      expect(tools.length > 0 || s.busy).toBe(old);
    });
  });

  it('the placement keys wait for any tool', () => {
    each({}, (s, tools) => {
      const old = Boolean(
        s.sketchSession ||
        s.holeMode ||
        s.mateSession ||
        s.operationDraft ||
        s.measureSession ||
        s.brakeSession ||
        s.shopSession,
      );
      expect(tools.length > 0).toBe(old);
    });
  });

  it('Apply and place another keeps the view for any tool started meanwhile', () => {
    each({}, (s, tools, tool) => {
      expect(tools.length > 0).toBe(Boolean(tool));
    });
  });

  it('the route waits for an operation, a sketch or a mate', () => {
    each({}, (s, tools, tool) => {
      const old = ['operation', 'sketch', 'mate'].includes(tool);
      expect(tools.some((t) => ROUTE_WAITS_FOR.includes(t))).toBe(old);
    });
  });

  it('the ribbon’s commands wait for every tool but Measure and the hole tool, and for a busy export', () => {
    each({ busy: FLAGS }, (s, tools) => {
      const old =
        s.busy ||
        Boolean(s.operationDraft) ||
        Boolean(s.sketchSession) ||
        Boolean(s.mateSession) ||
        Boolean(s.brakeSession) ||
        Boolean(s.shopSession);
      expect(s.busy || toolOpenBesides(tools, LIGHT_TOOLS)).toBe(old);
    });
  });

  it('the origin plane tiles: an empty model at rest, or a sketch pick', () => {
    each({ empty: FLAGS, pickShown: FLAGS }, (s, tools) => {
      const old =
        (s.empty &&
          !s.pickShown &&
          !s.sketchSession &&
          !s.operationDraft &&
          !s.measureSession &&
          !s.mateSession &&
          !s.holeMode &&
          !s.brakeSession &&
          !s.shopSession) ||
        s.sketchSession?.stage === 'pick';
      expect((s.empty && !s.pickShown && !tools.length) || s.sketchSession?.stage === 'pick').toBe(old);
    });
  });

  it('the parts tree waits for every tool that holds the selection', () => {
    each({}, (s, tools) => {
      const old = Boolean(s.sketchSession || s.mateSession || s.brakeSession || s.shopSession);
      expect(toolOpenBesides(tools, SELECTION_FREE_TOOLS)).toBe(old);
    });
  });

  it('Place holes and Move holes wait for every tool but Measure and the hole tool', () => {
    each({ part: FLAGS, ready: FLAGS, busy: FLAGS }, (s, tools) => {
      const old =
        !s.part ||
        !s.ready ||
        Boolean(s.operationDraft) ||
        Boolean(s.sketchSession) ||
        Boolean(s.mateSession) ||
        Boolean(s.brakeSession) ||
        Boolean(s.shopSession) ||
        s.busy;
      expect(!s.part || !s.ready || toolOpenBesides(tools, LIGHT_TOOLS) || s.busy).toBe(old);
    });
  });

  it('the viewport gets the hole tool only while no operation, press brake or station owns the view', () => {
    each({ exploded: FLAGS, section: FLAGS, busy: FLAGS }, (s, tools) => {
      const old =
        !s.operationDraft && !s.brakeSession && !s.shopSession && !s.exploded && !s.section && !s.busy
          ? s.holeMode
          : null;
      expect(
        !toolOpenBesides(tools, ['sketch', 'mate', ...LIGHT_TOOLS]) && !s.exploded && !s.section && !s.busy
          ? s.holeMode
          : null,
      ).toBe(old);
    });
  });

  // The one change on purpose: Delete named only the sketcher, so it removed
  // the selected mark under an operation, a mate, a press brake stroke or a
  // station. It now waits for them too; Measure (the marks' own tool) and the
  // hole tool still let it through.
  it('Delete removes a mark only with no tool open but Measure and the hole tool', () => {
    each({}, (s, tools) => {
      const old = !s.sketchSession;
      const now = !toolOpenBesides(tools, LIGHT_TOOLS);
      const heavy = Boolean(s.operationDraft || s.mateSession || s.brakeSession || s.shopSession);
      expect(now).toBe(old && !heavy);
    });
  });
});
