/* @vitest-environment jsdom */
/**
 * Cross-hook characterization suite for the study workers.
 *
 * `useDaylightGrid` and `useSolarAccess` were once separate copies of the same
 * lifecycle that had drifted apart; they are unified behind one
 * `useStudyWorker`. This file pins where they AGREE and where they still
 * DIVERGE, so each difference is an explicit choice rather than a leftover.
 *
 * The stub worker records which worker file it was pointed at, so the hooks can
 * share one global stub and still be told apart.
 *
 * Divergences that REMAIN by design, each a property of the study rather than of
 * the lifecycle, and each still pinned below:
 *   - settle period: solar 500 ms, daylight 350 ms — the grid is the one an
 *     author tunes interactively
 *   - activation: daylight also requires `mode === 'grid'`; solar keys off
 *     `enabled` alone
 *   - scope: daylight alone puts a `floorId` in the request key and payload
 *
 * ## Supersession keeps the worker warm
 *
 * A superseded run is not terminated: the replacement request is posted into
 * the worker that already exists. The cost, stated plainly because it is a real
 * cost: neither solver yields between chunks, so a superseded run still
 * occupies its worker until it finishes, and its replacement waits. Correctness
 * is unaffected — the stale answer is suppressed by id — and giving the solvers
 * chunked yields is the fix, deliberately not taken yet.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { createDaylightState } from '@/analysis/daylightState';
import { createSolarAccessState } from '@/analysis/solarAccessState';
import { useDaylightGrid } from './useDaylightGrid';
import { useSolarAccess } from './useSolarAccess';

const SOLAR_SETTLE_MS = 500;
const DAYLIGHT_SETTLE_MS = 350;

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
}

function workersFor(name) {
  return workers.filter((worker) => worker.url.includes(`/${name}.worker.js`));
}

function DaylightProbe(props) {
  const value = useDaylightGrid(props);
  return <span data-probe="daylight" data-status={value.status} />;
}

function SolarProbe(props) {
  const value = useSolarAccess(props);
  return <span data-probe="solar" data-status={value.status} />;
}

function mount(Probe, props) {
  const view = render(<Probe {...props} />);
  return {
    status: () => view.container.querySelector('[data-probe]').getAttribute('data-status'),
    update: (next) => view.rerender(<Probe {...next} />),
    unmount: view.unmount,
  };
}

function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// The hooks compare the project by identity and never read its geometry on the
// main thread — the stub worker swallows the payload — so a bare object is the
// honest fixture.
const project = () => ({ id: 'project', floors: [] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', StubWorker);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  workers.length = 0;
});

describe('study workers — shared contract (characterization)', () => {
  it('constructs nothing and posts nothing while each study is disabled', () => {
    const shared = project();
    mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: false, mode: 'grid' }) });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: false }) });
    advance(5000);
    expect(workers).toHaveLength(0);
  });

  it('each points its worker at its own analysis module', () => {
    const shared = project();
    mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(SOLAR_SETTLE_MS);
    expect(workersFor('daylight')).toHaveLength(1);
    expect(workersFor('solarAccess')).toHaveLength(1);
    for (const worker of workers) expect(worker.options).toEqual({ type: 'module' });
  });

  it('each re-adds enabled:true to run settings that omit it', () => {
    const shared = project();
    mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(SOLAR_SETTLE_MS);
    expect(workersFor('daylight')[0].messages[0].daylight.enabled).toBe(true);
    expect(workersFor('solarAccess')[0].messages[0].solarAccess.enabled).toBe(true);
  });

  it('each terminates its worker on unmount', () => {
    const shared = project();
    const views = [
      mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) }),
      mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) }),
    ];
    advance(SOLAR_SETTLE_MS);
    expect(workers).toHaveLength(2);
    for (const view of views) view.unmount();
    for (const worker of workers) expect(worker.terminateCount).toBe(1);
  });

  it('each registers exactly one long-lived message listener', () => {
    const shared = project();
    mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(SOLAR_SETTLE_MS);
    for (const worker of workers) {
      expect(worker.listeners).toHaveLength(1);
      expect(worker.listeners[0][0]).toBe('message');
    }
  });
});

describe('study workers — settle periods diverge (characterization)', () => {
  it('waits 500 ms for solar access', () => {
    mount(SolarProbe, { project: project(), solarAccess: createSolarAccessState({ enabled: true }) });
    advance(SOLAR_SETTLE_MS - 1);
    expect(workers).toHaveLength(0);
    advance(1);
    expect(workers).toHaveLength(1);
  });

  it('waits only 350 ms for the daylight grid', () => {
    mount(DaylightProbe, { project: project(), daylight: createDaylightState({ enabled: true, mode: 'grid' }) });
    advance(DAYLIGHT_SETTLE_MS - 1);
    expect(workers).toHaveLength(0);
    advance(1);
    expect(workers).toHaveLength(1);
  });
});

describe('study workers — debounce collapse (characterization)', () => {
  it('collapses a burst of daylight setting changes into one postMessage', () => {
    const shared = project();
    const view = mount(DaylightProbe, {
      project: shared,
      daylight: createDaylightState({ enabled: true, mode: 'grid' }),
    });
    for (const sensorSpacing of [400, 500, 600, 700, 800]) {
      advance(50);
      view.update({ project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid', sensorSpacing }) });
    }
    expect(workers).toHaveLength(0);
    advance(DAYLIGHT_SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(1);
    expect(workers[0].messages[0].daylight.sensorSpacing).toBe(800);
  });

  it('collapses a burst of solar setting changes into one postMessage', () => {
    const shared = project();
    const view = mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    for (const stepMinutes of [30, 20, 15, 10, 5]) {
      advance(50);
      view.update({ project: shared, solarAccess: createSolarAccessState({ enabled: true, stepMinutes }) });
    }
    expect(workers).toHaveLength(0);
    advance(SOLAR_SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(1);
    expect(workers[0].messages[0].solarAccess.stepMinutes).toBe(5);
  });
});

describe('study workers — supersession keeps the worker warm, uniformly', () => {
  it('daylight posts the replacement into the worker it already has', () => {
    const shared = project();
    const view = mount(DaylightProbe, {
      project: shared,
      daylight: createDaylightState({ enabled: true, mode: 'grid' }),
    });
    advance(DAYLIGHT_SETTLE_MS);
    view.update({ project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid', rayCount: 999 }) });
    advance(DAYLIGHT_SETTLE_MS);

    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);
    expect(workers[0].messages).toHaveLength(2);
    expect(workers[0].messages[0].id).not.toBe(workers[0].messages[1].id);
  });

  it('solar access does too, matching daylight', () => {
    const shared = project();
    const view = mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(SOLAR_SETTLE_MS);
    view.update({ project: shared, solarAccess: createSolarAccessState({ enabled: true, skyViewRays: 128 }) });
    advance(SOLAR_SETTLE_MS);

    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);
    expect(workers[0].messages).toHaveLength(2);
  });

  it('daylight runs five studies through one worker, never building a second', () => {
    const shared = project();
    const view = mount(DaylightProbe, {
      project: shared,
      daylight: createDaylightState({ enabled: true, mode: 'grid' }),
    });
    for (const rayCount of [100, 200, 300, 400]) {
      advance(DAYLIGHT_SETTLE_MS);
      view.update({ project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid', rayCount }) });
    }
    advance(DAYLIGHT_SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(5);
    expect(workers[0].terminateCount).toBe(0);
    expect(workers[0].messages.map((message) => message.daylight.rayCount).slice(1)).toEqual([100, 200, 300, 400]);
  });

  it('terminates both the moment their panels are switched off', () => {
    // The other half of the contract: warmth is for supersession only. Losing
    // interest in a study still releases its thread.
    const shared = project();
    const views = [
      [
        mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) }),
        'daylight',
      ],
      [mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) }), 'solarAccess'],
    ];
    advance(SOLAR_SETTLE_MS);
    expect(workers).toHaveLength(2);
    for (const worker of workers) expect(worker.terminateCount).toBe(0);

    views[0][0].update({ project: shared, daylight: createDaylightState({ enabled: false, mode: 'grid' }) });
    views[1][0].update({ project: shared, solarAccess: createSolarAccessState({ enabled: false }) });

    for (const [, name] of views) expect(workersFor(name)[0].terminateCount, name).toBe(1);
  });
});

describe('study workers — activation and scope diverge (characterization)', () => {
  it('daylight stays inert in average mode even when enabled', () => {
    const view = mount(DaylightProbe, {
      project: project(),
      daylight: createDaylightState({ enabled: true, mode: 'average' }),
    });
    advance(5000);
    expect(workers).toHaveLength(0);
    expect(view.status()).toBe('idle');
  });

  it('daylight starts as soon as the mode flips to grid', () => {
    const shared = project();
    const view = mount(DaylightProbe, {
      project: shared,
      daylight: createDaylightState({ enabled: true, mode: 'average' }),
    });
    advance(5000);
    view.update({ project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) });
    advance(DAYLIGHT_SETTLE_MS);
    expect(workers).toHaveLength(1);
  });

  it('daylight alone carries a floorId scope through to the worker', () => {
    const shared = project();
    mount(DaylightProbe, {
      project: shared,
      daylight: createDaylightState({ enabled: true, mode: 'grid' }),
      floorId: 'floor_ground',
    });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(SOLAR_SETTLE_MS);

    expect(workersFor('daylight')[0].messages[0].floorId).toBe('floor_ground');
    expect(workersFor('solarAccess')[0].messages[0]).not.toHaveProperty('floorId');
  });

  it('daylight re-runs when only the floorId changes', () => {
    const shared = project();
    const daylight = createDaylightState({ enabled: true, mode: 'grid' });
    const view = mount(DaylightProbe, { project: shared, daylight, floorId: 'floor_ground' });
    advance(DAYLIGHT_SETTLE_MS);
    view.update({ project: shared, daylight, floorId: 'floor_first' });
    advance(DAYLIGHT_SETTLE_MS);
    const posted = workers.flatMap((worker) => worker.messages);
    expect(posted.map((message) => message.floorId)).toEqual(['floor_ground', 'floor_first']);
  });
});
