/* @vitest-environment jsdom */
/**
 * Cross-hook characterization suite for the three study workers (T18).
 *
 * `useWindStudy`, `useDaylightGrid` and `useSolarAccess` are three copies of the
 * same lifecycle that have drifted apart. T7 unifies them behind one
 * `useStudyWorker`; this file pins where they currently AGREE and, more
 * importantly, where they DIVERGE, so the unification has to make an explicit
 * choice for each difference instead of silently picking one copy.
 *
 * The stub worker design is the same as `useWindStudy.dom.test.jsx`; here it
 * also records which worker file it was pointed at, so the three hooks can share
 * one global stub and still be told apart.
 *
 * Divergences pinned below:
 *   - settle period: wind 500 ms (useWindStudy.js:6), solar 500 ms
 *     (useSolarAccess.js:26), daylight 350 ms (useDaylightGrid.js:43)
 *   - supersession: wind terminates and rebuilds the worker
 *     (useWindStudy.js:64-65); daylight and solar have no such lines and reuse
 *     one long-lived worker for every run
 *   - activation: daylight also requires `mode === 'grid'`
 *     (useDaylightGrid.js:69); wind and solar key off `enabled` alone
 *   - scope: daylight alone puts a `floorId` in the request key and payload
 *     (useDaylightGrid.js:76, :147)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { createWindApartmentProject } from '@/analysis/__fixtures__/windApartmentProject';
import { createDaylightState } from '@/analysis/daylightState';
import { createSolarAccessState } from '@/analysis/solarAccessState';
import { createWindStudyState } from '@/analysis/windState';
import { useDaylightGrid } from './useDaylightGrid';
import { useSolarAccess } from './useSolarAccess';
import { useWindStudy } from './useWindStudy';

const WIND_SETTLE_MS = 500;
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

function WindProbe(props) {
  const value = useWindStudy(props);
  return <span data-probe="wind" data-status={value.status} />;
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

const project = () => createWindApartmentProject();

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
    mount(WindProbe, { project: shared, windStudy: createWindStudyState({ enabled: false }) });
    mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: false, mode: 'grid' }) });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: false }) });
    advance(5000);
    expect(workers).toHaveLength(0);
  });

  it('each points its worker at its own analysis module', () => {
    const shared = project();
    mount(WindProbe, { project: shared, windStudy: createWindStudyState({ enabled: true }) });
    mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(WIND_SETTLE_MS);
    expect(workersFor('wind')).toHaveLength(1);
    expect(workersFor('daylight')).toHaveLength(1);
    expect(workersFor('solarAccess')).toHaveLength(1);
    for (const worker of workers) expect(worker.options).toEqual({ type: 'module' });
  });

  it('each re-adds enabled:true to run settings that omit it', () => {
    const shared = project();
    mount(WindProbe, { project: shared, windStudy: createWindStudyState({ enabled: true }) });
    mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(WIND_SETTLE_MS);
    expect(workersFor('wind')[0].messages[0].windStudy.enabled).toBe(true);
    expect(workersFor('daylight')[0].messages[0].daylight.enabled).toBe(true);
    expect(workersFor('solarAccess')[0].messages[0].solarAccess.enabled).toBe(true);
  });

  it('each terminates its worker on unmount', () => {
    const shared = project();
    const views = [
      mount(WindProbe, { project: shared, windStudy: createWindStudyState({ enabled: true }) }),
      mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) }),
      mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) }),
    ];
    advance(WIND_SETTLE_MS);
    expect(workers).toHaveLength(3);
    for (const view of views) view.unmount();
    for (const worker of workers) expect(worker.terminateCount).toBe(1);
  });

  it('each registers exactly one long-lived message listener', () => {
    const shared = project();
    mount(WindProbe, { project: shared, windStudy: createWindStudyState({ enabled: true }) });
    mount(DaylightProbe, { project: shared, daylight: createDaylightState({ enabled: true, mode: 'grid' }) });
    mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(WIND_SETTLE_MS);
    for (const worker of workers) {
      expect(worker.listeners).toHaveLength(1);
      expect(worker.listeners[0][0]).toBe('message');
    }
  });
});

describe('study workers — settle periods diverge (characterization)', () => {
  it('waits 500 ms for wind', () => {
    mount(WindProbe, { project: project(), windStudy: createWindStudyState({ enabled: true }) });
    advance(WIND_SETTLE_MS - 1);
    expect(workers).toHaveLength(0);
    advance(1);
    expect(workers).toHaveLength(1);
  });

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

describe('study workers — supersession diverges (characterization)', () => {
  it('wind terminates the superseded worker and builds a fresh one', () => {
    const shared = project();
    const view = mount(WindProbe, { project: shared, windStudy: createWindStudyState({ enabled: true }) });
    advance(WIND_SETTLE_MS);
    view.update({ project: shared, windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }) });
    advance(WIND_SETTLE_MS);

    expect(workers).toHaveLength(2);
    expect(workers[0].terminateCount).toBe(1);
    expect(workers[0].messages).toHaveLength(1);
    expect(workers[1].messages).toHaveLength(1);
  });

  it('daylight does NOT terminate: one worker takes both runs, the old one still in flight', () => {
    // characterization: pins current behaviour; see T7. Without the wind hook's
    // terminate/rebuild, the superseded Monte Carlo run keeps burning the
    // worker thread and the replacement queues behind it — the newer request
    // cannot start until the obsolete one finishes.
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

  it('solar access does NOT terminate either, matching daylight rather than wind', () => {
    const shared = project();
    const view = mount(SolarProbe, { project: shared, solarAccess: createSolarAccessState({ enabled: true }) });
    advance(SOLAR_SETTLE_MS);
    view.update({ project: shared, solarAccess: createSolarAccessState({ enabled: true, skyViewRays: 128 }) });
    advance(SOLAR_SETTLE_MS);

    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);
    expect(workers[0].messages).toHaveLength(2);
  });

  it('daylight keeps reusing the one worker across many supersessions', () => {
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
    mount(WindProbe, { project: shared, windStudy: createWindStudyState({ enabled: true }) });
    advance(WIND_SETTLE_MS);

    expect(workersFor('daylight')[0].messages[0].floorId).toBe('floor_ground');
    expect(workersFor('solarAccess')[0].messages[0]).not.toHaveProperty('floorId');
    expect(workersFor('wind')[0].messages[0]).not.toHaveProperty('floorId');
  });

  it('daylight re-runs when only the floorId changes', () => {
    const shared = project();
    const daylight = createDaylightState({ enabled: true, mode: 'grid' });
    const view = mount(DaylightProbe, { project: shared, daylight, floorId: 'floor_ground' });
    advance(DAYLIGHT_SETTLE_MS);
    view.update({ project: shared, daylight, floorId: 'floor_first' });
    advance(DAYLIGHT_SETTLE_MS);
    expect(workers[0].messages.map((message) => message.floorId)).toEqual(['floor_ground', 'floor_first']);
  });
});
