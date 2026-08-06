/* @vitest-environment jsdom */
/**
 * Provider-level half of the wind study characterization suite (T18).
 *
 * `WindStudyContext.test.jsx` runs in the `node` environment and could only pin
 * the request IDENTITY that gates the worker — it models `filteredProject` and
 * `projectRevision` by hand because effects never run under
 * `renderToStaticMarkup`. Its deferral asks for the missing half: the real
 * provider chain mounted, real reducer actions dispatched, and actual
 * `postMessage` calls counted.
 *
 * That is what this file does. The tree below is the production one —
 * `FloorplanProvider` (which owns the real reducer and the real
 * `filteredProject` memo at useFloorplan.js:230-233) wrapped in the two
 * providers it hard-requires: `ConfirmDialogProvider` for `useConfirmDialog`,
 * and a data router for `useUnsavedChangesGuard`'s `useBlocker`. Nothing is
 * mocked except the `Worker` global, which jsdom does not have.
 *
 * The link this closes: the node file proves a viewport action leaves the
 * request KEY unchanged; `useWindStudy.dom.test.jsx` proves unchanged inputs
 * mean no re-run. Neither of them runs the real provider, so neither can show
 * that a pan reaches the hook without disturbing anything. It does, and after
 * T6 that is a stronger guarantee than it was: the effect is gated on the
 * request key's VALUE, so the provider re-deriving an equal settings object
 * would no longer cost a run either. The zero-post pins below are unchanged
 * across that rework, which is the point of quoting them here.
 */

import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { createWindApartmentProject } from '@/analysis/__fixtures__/windApartmentProject';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { FloorplanProvider, useFloorplanContext } from './FloorplanContext';
import { WindStudyProvider, useWindStudy } from './WindStudyContext';

/** useWindStudy.js:6 */
const SETTLE_MS = 500;

const workers = [];

class StubWorker {
  constructor(url, options) {
    this.url = String(url);
    this.options = options;
    this.messages = [];
    this.listeners = [];
    this.terminateCount = 0;
    workers.push(this);
  }

  addEventListener(type, handler) {
    this.listeners.push([type, handler]);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminateCount += 1;
  }

  emit(data) {
    for (const [type, handler] of this.listeners) if (type === 'message') handler({ data });
  }
}

function totalPosts() {
  return workers.reduce((sum, worker) => sum + worker.messages.length, 0);
}

function Capture({ handleRef }) {
  const context = useFloorplanContext();
  useEffect(() => {
    handleRef.current = context;
  });
  return null;
}

function Probe() {
  const wind = useWindStudy();
  return (
    <span
      data-probe="wind-context"
      data-status={wind.status}
      data-stale={String(wind.stale)}
      data-climate={wind.climate?.status ?? 'none'}
      data-enabled={String(Boolean(wind.settings?.enabled))}
    />
  );
}

/** Same two-phase fixture the node suite builds, so the pins line up. */
function phasedWindProject() {
  const project = createWindApartmentProject();
  project.phases = [
    { id: 'phase_existing', name: 'Existing', order: 0, color: '#888888', visible: true },
    { id: 'phase_new', name: 'New work', order: 1, color: '#4488cc', visible: true },
  ];
  const floor = project.floors[0];
  floor.walls = floor.walls.map((wall) => ({
    ...wall,
    phaseId: wall.id === 'wall_spine' || wall.id === 'wall_cross' ? 'phase_new' : 'phase_existing',
  }));
  return project;
}

function Harness({ handleRef, project }) {
  return (
    <ConfirmDialogProvider>
      <FloorplanProvider initialProject={project} isPlayground>
        <WindStudyProvider>
          <Capture handleRef={handleRef} />
          <Probe />
        </WindStudyProvider>
      </FloorplanProvider>
    </ConfirmDialogProvider>
  );
}

function mount(project = createWindApartmentProject()) {
  const handleRef = { current: null };
  const router = createMemoryRouter([{ path: '/', element: <Harness handleRef={handleRef} project={project} /> }]);
  const view = render(<RouterProvider router={router} />);
  const node = () => view.container.querySelector('[data-probe="wind-context"]');
  return {
    read: () => ({
      status: node().getAttribute('data-status'),
      stale: node().getAttribute('data-stale') === 'true',
      climate: node().getAttribute('data-climate'),
      enabled: node().getAttribute('data-enabled') === 'true',
    }),
    state: () => handleRef.current.state,
    send: (...actions) =>
      act(() => {
        for (const action of actions) handleRef.current.dispatch(action);
      }),
    unmount: view.unmount,
  };
}

function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function enabledRun(project) {
  const view = mount(project);
  view.send({ type: 'TOGGLE_WIND_STUDY' });
  advance(SETTLE_MS);
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', StubWorker);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in tests'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  workers.length = 0;
});

describe('WindStudyProvider wiring (characterization)', () => {
  it('runs nothing until the study is switched on', () => {
    const view = mount();
    advance(SETTLE_MS * 4);
    expect(workers).toHaveLength(0);
    expect(view.read()).toMatchObject({ status: 'idle', enabled: false });
  });

  it('starts exactly one run when the study is toggled on', () => {
    const view = enabledRun();
    expect(view.read().enabled).toBe(true);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(1);
  });

  it('hands the worker `selectors.filteredProject`, which is the raw project in the default view', () => {
    // characterization: `filterProjectByPhase` returns the project unchanged
    // when there is nothing to filter, so the default view posts the very same
    // object. The identity-based request key depends on that pass-through.
    const view = enabledRun();
    expect(workers[0].messages[0].project).toBe(view.state().project);
  });

  it('hands the worker a genuinely filtered project once a phase view is active', () => {
    const view = enabledRun(phasedWindProject());
    view.send({ type: 'SET_ACTIVE_PHASE', phaseId: 'phase_new' }, { type: 'SET_PHASE_VIEW_MODE', mode: 'single' });
    advance(SETTLE_MS);

    // One warm worker (T6), so the newest request is the last MESSAGE rather
    // than the last worker.
    const messages = workers[workers.length - 1].messages;
    const posted = messages[messages.length - 1].project;
    expect(posted).not.toBe(view.state().project);
    // Strict phase views hand the solver the partitions only — no exterior
    // shell and no openings at all. The same behaviour the node suite pins at
    // the identity level, here proved on the payload the worker receives.
    expect(posted.floors[0].walls.map((wall) => wall.id)).toEqual(['wall_spine', 'wall_cross']);
    expect(posted.floors[0].windows).toHaveLength(0);
    expect(view.state().project.floors[0].walls).toHaveLength(6);
  });

  it('never reaches the network for a project with no site coordinates', () => {
    const view = enabledRun();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(view.read().climate).toBe('unavailable');
  });
});

describe('WindStudyProvider viewport actions (characterization)', () => {
  it('posts nothing more across a pan, zoom and viewport burst', () => {
    // This is the claim WindStudyContext.test.jsx could only make about the
    // request key. Here the real reducer runs and the real worker is counted.
    const view = enabledRun();
    const viewportBefore = view.state().editor.viewport;

    view.send(
      { type: 'PAN', dx: 137, dy: -84 },
      { type: 'ZOOM', zoom: 0.42, panX: 12, panY: -300 },
      { type: 'PAN', dx: -9, dy: 9 },
      { type: 'SET_VIEWPORT', viewport: { zoom: 0.08, panX: 2000, panY: 1500 } },
    );
    advance(SETTLE_MS * 4);

    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(1);
    expect(workers[0].terminateCount).toBe(0);
    // Guard against a vacuous pass: the viewport really did move.
    expect(view.state().editor.viewport).not.toEqual(viewportBefore);
  });

  it('posts nothing more for a drag modelled one PAN at a time', () => {
    const view = enabledRun();
    for (let step = 0; step < 20; step += 1) {
      view.send({ type: 'PAN', dx: 4, dy: -3 });
      advance(16);
    }
    advance(SETTLE_MS * 2);
    expect(totalPosts()).toBe(1);
    expect(workers).toHaveLength(1);
  });

  it('posts nothing more for a selection change', () => {
    const view = enabledRun();
    const wallId = view.state().project.floors[0].walls[0].id;
    view.send({ type: 'SELECT', ids: [wallId] });
    advance(SETTLE_MS * 2);
    expect(totalPosts()).toBe(1);
  });
});

describe('WindStudyProvider re-run triggers (characterization)', () => {
  it('re-runs once into the same warm worker when a wind setting changes', () => {
    // FLIPPED BY T6, from 'terminates and re-runs once when a wind setting
    // changes', which asserted `workers[0].terminateCount === 1` on the commit
    // and a second worker after the settle. Supersession now posts rather than
    // terminates, so the worker's solved-field cache survives the edit — which
    // is exactly what makes a ventilation-only change cheap.
    const view = enabledRun();
    view.send({ type: 'SET_WIND_STUDY', patch: { directionDeg: 90 } });
    expect(workers[0].terminateCount).toBe(0);

    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(2);
    expect(workers[0].messages[1].windStudy.directionDeg).toBe(90);
    expect(view.read().status).toBe('running');
  });

  it('collapses a burst of setting changes into one run', () => {
    // Updated by T6: the second run is a second MESSAGE on the one worker. The
    // debounce itself is untouched.
    const view = enabledRun();
    for (const directionDeg of [22.5, 45, 67.5, 90, 112.5]) {
      view.send({ type: 'SET_WIND_STUDY', patch: { directionDeg } });
      advance(50);
    }
    expect(totalPosts()).toBe(1);
    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(2);
    expect(workers[0].messages[1].windStudy.directionDeg).toBe(112.5);
  });

  it('re-runs when a geometry edit lands', () => {
    // Updated by T6: one worker, two posts.
    const view = enabledRun();
    const floorId = view.state().project.floors[0].id;
    view.send({
      type: 'WINDOW_UPDATE',
      floorId,
      window: { id: 'win_nw_north', ventilation: { operable: true, openFraction: 0.2, dischargeCoefficient: 0.62 } },
    });
    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(2);
  });

  it('re-runs when the phase view changes', () => {
    // Updated by T6: one worker, two posts.
    const view = enabledRun();
    view.send({ type: 'SET_PHASE_VIEW_MODE', mode: 'cumulative' });
    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(2);
  });

  it('publishes a finished result through the context', () => {
    const view = enabledRun();
    const study = { mode: 'direction', summary: { peakAmplification: 1.4 } };
    act(() => {
      workers[0].emit({ id: workers[0].messages[0].id, type: 'result', result: study });
    });
    expect(view.read()).toMatchObject({ status: 'ready', stale: false });
  });

  it('marks the published result stale while a viewport-free edit re-runs', () => {
    const view = enabledRun();
    act(() => {
      workers[0].emit({
        id: workers[0].messages[0].id,
        type: 'result',
        result: { mode: 'direction', summary: { peakAmplification: 1.4 } },
      });
    });
    view.send({ type: 'SET_WIND_STUDY', patch: { directionDeg: 90 } });
    expect(view.read()).toMatchObject({ status: 'running', stale: true });
  });

  it('tears the worker down when the study is toggled back off', () => {
    const view = enabledRun();
    view.send({ type: 'TOGGLE_WIND_STUDY' });
    expect(workers[0].terminateCount).toBe(1);
    advance(SETTLE_MS * 4);
    expect(workers).toHaveLength(1);
    expect(view.read()).toMatchObject({ status: 'idle', enabled: false });
  });
});
