/* @vitest-environment jsdom */
/**
 * Lifecycle pins for the sun study's worker hook.
 *
 * The day-scale sun study used to run synchronously in the provider's
 * `useMemo`, which is what froze the canvas when "All day" or "Sun hours" was
 * switched on. `useSunDayStudy` moves it onto `useStudyWorker`; these tests pin
 * the parts that are THIS hook's choices rather than the shared lifecycle's
 * (which `studyWorkerLifecycle.dom.test.jsx` already pins):
 *
 *   - "Moment" mode never constructs a worker; its day study is synchronous.
 *   - Heavy modes post to the worker, and the payload has no `minutes` in it.
 *   - A time-scrubber step neither re-posts nor flips `recomputing` — the
 *     regression `sunStudyPerformance.test.js` guards at the runner level,
 *     pinned here at the hook level.
 *   - While the first heavy run is in flight, a massing-only stand-in carrying
 *     the real mode keeps the instant shadow drawable.
 *   - Without `Worker` (jsdom by default, locked-down browsers) the heavy modes
 *     fall back to the synchronous compute the study always had.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { createProject, createWall } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import { createSunStudyState } from '@/analysis/sunStudyState';
import { useSunDayStudy } from './useSunDayStudy';

const SETTLE_MS = 250;
const MANILA = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila' };

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

  reply(data) {
    act(() => {
      for (const [type, handler] of this.listeners) {
        if (type === 'message') handler({ data });
      }
    });
  }
}

function locatedProject() {
  const project = createProject('Sun worker test');
  project.floors[0].walls = [
    createWall({ x: 0, y: 0 }, { x: 8000, y: 0 }, 200, { height: 3000 }),
    createWall({ x: 8000, y: 0 }, { x: 8000, y: 6000 }, 200, { height: 3000 }),
    createWall({ x: 8000, y: 6000 }, { x: 0, y: 6000 }, 200, { height: 3000 }),
    createWall({ x: 0, y: 6000 }, { x: 0, y: 0 }, 200, { height: 3000 }),
  ];
  return executeBuildingCommand(project, { type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION, ...MANILA }).project;
}

function Probe(props) {
  const value = useSunDayStudy(props);
  return (
    <span
      data-probe="sun-day"
      data-mode={value.day ? value.day.mode : 'none'}
      data-masses={value.day ? value.day.masses.length : -1}
      data-envelope={value.day ? value.day.envelope.length : -1}
      data-recomputing={String(value.recomputing)}
      data-error={value.error || ''}
    />
  );
}

function mount(props) {
  const view = render(<Probe {...props} />);
  const read = (name) => view.container.querySelector('[data-probe]').getAttribute(`data-${name}`);
  return {
    update: (next) => view.rerender(<Probe {...next} />),
    unmount: view.unmount,
    day: () => (read('mode') === 'none' ? null : { mode: read('mode') }),
    masses: () => Number(read('masses')),
    envelope: () => Number(read('envelope')),
    recomputing: () => read('recomputing') === 'true',
    error: () => read('error') || null,
  };
}

function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

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

describe('useSunDayStudy', () => {
  it('computes Moment mode synchronously and never constructs a worker', () => {
    const view = mount({
      project: locatedProject(),
      sunStudy: createSunStudyState({ enabled: true, mode: 'instant' }),
    });
    advance(5000);

    expect(workers).toHaveLength(0);
    expect(view.day()).not.toBeNull();
    expect(view.day().mode).toBe('instant');
    expect(view.masses()).toBeGreaterThan(0);
    expect(view.recomputing()).toBe(false);
  });

  it('posts heavy modes to the sun worker, without the minute of day', () => {
    mount({ project: locatedProject(), sunStudy: createSunStudyState({ enabled: true, mode: 'range', minutes: 600 }) });
    advance(SETTLE_MS);

    expect(workers).toHaveLength(1);
    expect(workers[0].url).toContain('sunStudy.worker.js');
    expect(workers[0].options).toEqual({ type: 'module' });
    const message = workers[0].messages[0];
    expect(message.sunStudy.mode).toBe('range');
    expect(message.sunStudy.enabled).toBe(true);
    expect(message.sunStudy).not.toHaveProperty('minutes');
  });

  it('keeps a massing-only stand-in, in the real mode, while the first run is in flight', () => {
    const view = mount({ project: locatedProject(), sunStudy: createSunStudyState({ enabled: true, mode: 'range' }) });
    advance(SETTLE_MS);

    expect(view.recomputing()).toBe(true);
    expect(view.day()).not.toBeNull();
    expect(view.day().mode).toBe('range');
    expect(view.masses()).toBeGreaterThan(0);
    expect(view.envelope()).toBe(0);

    const { id } = workers[0].messages[0];
    workers[0].reply({
      id,
      type: 'result',
      result: { mode: 'range', masses: [], envelope: [{ outline: [], holes: [] }] },
    });

    expect(view.recomputing()).toBe(false);
    expect(view.envelope()).toBe(1);
  });

  it('does not re-post or flip recomputing when only the minute changes', () => {
    const project = locatedProject();
    const settings = createSunStudyState({ enabled: true, mode: 'range', minutes: 480 });
    const view = mount({ project, sunStudy: settings });
    advance(SETTLE_MS);
    const { id } = workers[0].messages[0];
    workers[0].reply({ id, type: 'result', result: { mode: 'range', masses: [], envelope: [] } });
    expect(view.recomputing()).toBe(false);

    for (const minutes of [485, 600, 1020]) {
      view.update({ project, sunStudy: { ...settings, minutes } });
      advance(SETTLE_MS + 50);
    }

    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(1);
    expect(view.recomputing()).toBe(false);
  });

  it('surfaces a worker failure instead of leaving the overlay silently stale', () => {
    const view = mount({ project: locatedProject(), sunStudy: createSunStudyState({ enabled: true, mode: 'range' }) });
    advance(SETTLE_MS);

    const { id } = workers[0].messages[0];
    workers[0].reply({ id, type: 'error', message: 'Sun study failed.' });

    expect(view.error()).toBe('Sun study failed.');
  });

  it('falls back to the synchronous compute when the browser has no Worker', () => {
    vi.unstubAllGlobals();

    const view = mount({ project: locatedProject(), sunStudy: createSunStudyState({ enabled: true, mode: 'range' }) });
    advance(5000);

    expect(workers).toHaveLength(0);
    expect(view.day()).not.toBeNull();
    expect(view.day().mode).toBe('range');
    expect(view.envelope()).toBeGreaterThan(0);
    expect(view.recomputing()).toBe(false);
  });

  it('returns nothing while the study is disabled or the site is unlocated', () => {
    const disabled = mount({
      project: locatedProject(),
      sunStudy: createSunStudyState({ enabled: false, mode: 'range' }),
    });
    const unlocated = mount({
      project: createProject('Nowhere'),
      sunStudy: createSunStudyState({ enabled: true, mode: 'range' }),
    });
    advance(5000);

    expect(workers).toHaveLength(0);
    expect(disabled.day()).toBeNull();
    expect(unlocated.day()).toBeNull();
  });
});
