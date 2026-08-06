/* @vitest-environment jsdom */
/**
 * Characterization suite for the `useWindStudy` worker lifecycle (T18).
 *
 * Everything here pins CURRENT behaviour ahead of the cache/cancellation rework
 * (T6), including the parts that are arguably wrong — a pin that describes the
 * intended design instead of the shipped one tells the rework nothing.
 *
 * ## Why a stub worker
 *
 * jsdom has no `Worker`, and the hook's `createWorker` (useWindStudy.js:9-16)
 * treats `typeof Worker === 'undefined'` as "this browser cannot run the study".
 * `vi.stubGlobal('Worker', StubWorker)` supplies one. Vite rewrites
 * `new Worker(new URL('@/analysis/wind.worker.js', import.meta.url), …)` into a
 * resolved URL before the stub ever sees it, so the constructor receives
 * `http://localhost:3000/src/analysis/wind.worker.js?worker_file&type=module`
 * and `{ type: 'module' }` — the real worker file is never loaded or executed.
 *
 * The stub emulates exactly the four things the hook touches:
 *   - `new Worker(url, options)`            useWindStudy.js:12
 *   - `worker.addEventListener('message')`  useWindStudy.js:33
 *   - `worker.postMessage(payload)`         useWindStudy.js:75
 *   - `worker.terminate()`                  useWindStudy.js:50, :64
 * The hook never sets `onmessage`, never listens for `error`, and never calls
 * `removeEventListener`; `emit()` below therefore only has to feed the single
 * `message` listener an object shaped like `{ data }`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { createWindApartmentProject } from '@/analysis/__fixtures__/windApartmentProject';
import { createWindStudyState, windRunSettingsOf } from '@/analysis/windState';
import { useWindStudy } from './useWindStudy';

/** useWindStudy.js:6 */
const SETTLE_MS = 500;
/** useWindStudy.js:7 */
const UNAVAILABLE_MESSAGE = 'This browser cannot run the wind solver in the background.';

const workers = [];

class StubWorker {
  constructor(url, options) {
    this.url = String(url);
    this.options = options;
    this.messages = [];
    this.listeners = { message: [] };
    this.terminateCount = 0;
    workers.push(this);
  }

  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminateCount += 1;
  }

  emit(data) {
    for (const handler of this.listeners.message) handler({ data });
  }
}

function totalPosts() {
  return workers.reduce((sum, worker) => sum + worker.messages.length, 0);
}

function totalTerminations() {
  return workers.reduce((sum, worker) => sum + worker.terminateCount, 0);
}

function Probe({ project, windStudy, projectRevision, phaseScope = null }) {
  const value = useWindStudy({ project, windStudy, projectRevision, phaseScope });
  return (
    <span
      data-probe="wind-study"
      data-status={value.status}
      data-stale={String(value.stale)}
      data-error={JSON.stringify(value.error ?? null)}
      data-progress={JSON.stringify(value.progress ?? null)}
      data-study={JSON.stringify(value.study ?? null)}
    />
  );
}

function mount(props) {
  const view = render(<Probe {...props} />);
  return {
    read() {
      const node = view.container.querySelector('[data-probe="wind-study"]');
      return {
        status: node.getAttribute('data-status'),
        stale: node.getAttribute('data-stale') === 'true',
        error: JSON.parse(node.getAttribute('data-error')),
        progress: JSON.parse(node.getAttribute('data-progress')),
        study: JSON.parse(node.getAttribute('data-study')),
      };
    },
    update(next) {
      view.rerender(<Probe {...next} />);
    },
    unmount: view.unmount,
  };
}

function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function emit(worker, data) {
  act(() => {
    worker.emit(data);
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

describe('useWindStudy — inactive (characterization)', () => {
  it('constructs no worker and posts nothing while the study is off', () => {
    const view = mount({
      project: createWindApartmentProject(),
      windStudy: createWindStudyState({ enabled: false }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS * 10);
    expect(workers).toHaveLength(0);
    expect(totalPosts()).toBe(0);
    expect(view.read()).toMatchObject({ status: 'idle', stale: false, study: null, error: null });
  });

  it('treats a missing windStudy the same as a disabled one', () => {
    const view = mount({ project: createWindApartmentProject(), windStudy: null, projectRevision: '0||all' });
    advance(SETTLE_MS * 10);
    expect(workers).toHaveLength(0);
    expect(view.read().status).toBe('idle');
  });

  it('stays idle across re-renders while off, however many arrive', () => {
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: false }), projectRevision: '0||all' });
    for (let index = 0; index < 8; index += 1) {
      view.update({
        project,
        windStudy: createWindStudyState({ enabled: false, directionDeg: index * 22.5 }),
        projectRevision: `${index}||all`,
      });
    }
    advance(SETTLE_MS * 4);
    expect(workers).toHaveLength(0);
    expect(totalPosts()).toBe(0);
  });
});

describe('useWindStudy — first run (characterization)', () => {
  const project = createWindApartmentProject();
  const windStudy = createWindStudyState({ enabled: true });
  const base = { project, windStudy, projectRevision: '0||all' };

  it('waits the full settle period before constructing anything', () => {
    const view = mount(base);
    expect(workers).toHaveLength(0);
    expect(view.read().status).toBe('running');

    advance(SETTLE_MS - 1);
    expect(workers).toHaveLength(0);

    advance(1);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(1);
  });

  it('builds a module worker pointed at the wind worker file', () => {
    mount(base);
    advance(SETTLE_MS);
    expect(workers[0].url).toContain('/src/analysis/wind.worker.js');
    expect(workers[0].options).toEqual({ type: 'module' });
  });

  it('registers exactly one message listener and never uses onmessage', () => {
    mount(base);
    advance(SETTLE_MS);
    expect(workers[0].listeners.message).toHaveLength(1);
    expect(Object.keys(workers[0].listeners)).toEqual(['message']);
    expect(workers[0].onmessage).toBeUndefined();
  });

  it('posts the exact project object it was handed, not a copy', () => {
    mount(base);
    advance(SETTLE_MS);
    expect(workers[0].messages[0].project).toBe(project);
  });

  it('re-adds enabled:true to run settings that deliberately omit it', () => {
    mount(base);
    advance(SETTLE_MS);
    const payload = workers[0].messages[0];
    // Updated by T12: `phaseScope` joins the payload. It is deliberately NOT
    // inside `windStudy` — it is not a solver setting and must not appear in
    // `windRunSettingsOf` — and deliberately not part of the request key, which
    // `projectRevision` already covers.
    expect(Object.keys(payload).sort()).toEqual(['id', 'phaseScope', 'project', 'windStudy']);
    expect(Object.keys(windRunSettingsOf(windStudy))).not.toContain('enabled');
    expect(Object.keys(windRunSettingsOf(windStudy))).not.toContain('phaseScope');
    expect(payload.windStudy).toEqual({ ...windRunSettingsOf(windStudy), enabled: true });
    expect(typeof payload.id).toBe('number');
  });

  it('posts a null phase scope when the caller does not supply one', () => {
    // The hook defaults it rather than omitting the key, so the worker's
    // destructure is never handed `undefined` from a caller that forgot.
    mount(base);
    advance(SETTLE_MS);
    expect(workers[0].messages[0].phaseScope).toBeNull();
  });

  it('posts the phase scope it was handed, by identity', () => {
    const phaseScope = { activePhaseId: 'phase_new', phaseViewMode: 'single' };
    mount({ ...base, phaseScope });
    advance(SETTLE_MS);
    expect(workers[0].messages[0].phaseScope).toBe(phaseScope);
  });

  it('reports running until a matching result lands', () => {
    const view = mount(base);
    advance(SETTLE_MS);
    expect(view.read()).toMatchObject({ status: 'running', stale: false, study: null });
  });
});

describe('useWindStudy — re-render with unchanged inputs (characterization)', () => {
  it('does not re-run when a pan/zoom-shaped re-render keeps every input identical', () => {
    // The provider rebuilds nothing on a viewport action: `project`,
    // `windStudy` and `projectRevision` all arrive with the same identity, so
    // the study effect must not fire. This is the gate the whole design rests on.
    const project = createWindApartmentProject();
    const windStudy = createWindStudyState({ enabled: true });
    const props = { project, windStudy, projectRevision: '0||all' };
    const view = mount(props);
    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(1);

    for (let index = 0; index < 12; index += 1) view.update(props);
    advance(SETTLE_MS * 3);

    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(1);
    expect(totalTerminations()).toBe(0);
  });

  it('does not re-run on identical re-renders that arrive mid-settle either', () => {
    const project = createWindApartmentProject();
    const windStudy = createWindStudyState({ enabled: true });
    const props = { project, windStudy, projectRevision: '0||all' };
    const view = mount(props);
    advance(SETTLE_MS - 100);
    for (let index = 0; index < 5; index += 1) view.update(props);
    advance(100);
    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(1);
  });

  it('DOES re-run when the settings object is rebuilt with identical values', () => {
    // characterization: pins current behaviour; see T6. The effect depends on
    // the memoised `settings` OBJECT (useWindStudy.js:78), not on the
    // value-equal `requestKey` string it also depends on. A caller that hands
    // over a fresh-but-equal windStudy object therefore terminates the running
    // worker and starts the identical run again.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    expect(totalPosts()).toBe(1);

    view.update({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    expect(workers[0].terminateCount).toBe(1);
    advance(SETTLE_MS);

    expect(workers).toHaveLength(2);
    expect(totalPosts()).toBe(2);
    expect(workers[1].messages[0].windStudy).toEqual(workers[0].messages[0].windStudy);
  });
});

describe('useWindStudy — supersession and debounce (characterization)', () => {
  it('terminates the running worker immediately and posts one replacement after the settle', () => {
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const first = workers[0];
    expect(first.messages).toHaveLength(1);

    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });

    // Termination is synchronous with the render commit, not deferred to the
    // timer (useWindStudy.js:64-65).
    expect(first.terminateCount).toBe(1);
    expect(workers).toHaveLength(1);

    advance(SETTLE_MS);
    expect(workers).toHaveLength(2);
    expect(workers[1].terminateCount).toBe(0);
    expect(workers[1].messages).toHaveLength(1);
    expect(workers[1].messages[0].windStudy.directionDeg).toBe(90);
    expect(first.messages).toHaveLength(1);
    expect(view.read().status).toBe('running');
  });

  it('collapses a burst of rapid changes into a single postMessage', () => {
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    for (const directionDeg of [22.5, 45, 67.5, 90, 112.5]) {
      advance(50);
      view.update({
        project,
        windStudy: createWindStudyState({ enabled: true, directionDeg }),
        projectRevision: '0||all',
      });
    }
    expect(workers).toHaveLength(0);

    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(1);
    expect(workers[0].messages[0].windStudy.directionDeg).toBe(112.5);
  });

  it('burns one request id per superseded run even though only the last is posted', () => {
    // characterization: the id is allocated in the effect body, not in the
    // timer, so the counter advances once per keystroke. Pinned because a cache
    // keyed on request id would have to account for the gaps.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const baselineId = workers[0].messages[0].id;

    for (const directionDeg of [22.5, 45, 67.5]) {
      view.update({
        project,
        windStudy: createWindStudyState({ enabled: true, directionDeg }),
        projectRevision: '0||all',
      });
    }
    advance(SETTLE_MS);
    expect(workers[1].messages[0].id).toBe(baselineId + 3);
  });

  it('terminates once per burst, not once per change, because the ref is nulled first', () => {
    // characterization: `workerRef.current?.terminate()` on line 64 is a no-op
    // for every change after the first, since line 65 nulls the ref and no new
    // worker exists until the timer fires. A burst therefore leaves at most one
    // orphaned run — but also means a long burst has NO worker alive at all.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const first = workers[0];

    for (const directionDeg of [22.5, 45, 67.5, 90]) {
      view.update({
        project,
        windStudy: createWindStudyState({ enabled: true, directionDeg }),
        projectRevision: '0||all',
      });
    }
    expect(first.terminateCount).toBe(1);
    expect(totalTerminations()).toBe(1);

    advance(SETTLE_MS);
    expect(workers).toHaveLength(2);
    expect(totalPosts()).toBe(2);
  });

  it('re-runs when only the project identity changes, settings untouched', () => {
    const windStudy = createWindStudyState({ enabled: true });
    const view = mount({ project: createWindApartmentProject(), windStudy, projectRevision: '0||all' });
    advance(SETTLE_MS);
    view.update({ project: createWindApartmentProject(), windStudy, projectRevision: '1||all' });
    advance(SETTLE_MS);
    expect(workers).toHaveLength(2);
    expect(workers[0].terminateCount).toBe(1);
  });

  it('re-runs when only the projectRevision changes', () => {
    const project = createWindApartmentProject();
    const windStudy = createWindStudyState({ enabled: true });
    const view = mount({ project, windStudy, projectRevision: '0||all' });
    advance(SETTLE_MS);
    view.update({ project, windStudy, projectRevision: '1|phase_new|single' });
    advance(SETTLE_MS);
    expect(workers).toHaveLength(2);
    expect(totalPosts()).toBe(2);
  });

  it('posts nothing when the component unmounts inside the settle window', () => {
    const view = mount({
      project: createWindApartmentProject(),
      windStudy: createWindStudyState({ enabled: true }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS - 1);
    view.unmount();
    advance(SETTLE_MS * 4);
    expect(workers).toHaveLength(0);
  });
});

describe('useWindStudy — worker messages (characterization)', () => {
  function startedRun() {
    const project = createWindApartmentProject();
    const windStudy = createWindStudyState({ enabled: true });
    const view = mount({ project, windStudy, projectRevision: '0||all' });
    advance(SETTLE_MS);
    return { view, project, windStudy, worker: workers[0], id: workers[0].messages[0].id };
  }

  it('resolves a matching result into a ready study', () => {
    const { view, worker, id } = startedRun();
    emit(worker, { id, type: 'result', result: { mode: 'direction', summary: { peakAmplification: 1.8 } } });
    expect(view.read()).toMatchObject({
      status: 'ready',
      stale: false,
      error: null,
      progress: null,
      study: { mode: 'direction', summary: { peakAmplification: 1.8 } },
    });
  });

  it('ignores a result whose id does not match the pending request', () => {
    const { view, worker, id } = startedRun();
    emit(worker, { id: id + 1, type: 'result', result: { mode: 'direction' } });
    expect(view.read()).toMatchObject({ status: 'running', study: null });
  });

  it('ignores a result that arrives for a run that has already been superseded', () => {
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const first = workers[0];
    const staleId = first.messages[0].id;

    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });
    // The terminated worker replies anyway — a real worker can have the result
    // already in flight when terminate() lands.
    emit(first, { id: staleId, type: 'result', result: { mode: 'direction', stale: true } });
    expect(view.read()).toMatchObject({ status: 'running', study: null });
  });

  it('surfaces progress without leaving the running state', () => {
    const { view, worker, id } = startedRun();
    emit(worker, { id, type: 'progress', progress: { stage: 'solve', iteration: 120, iterations: 450 } });
    expect(view.read()).toMatchObject({
      status: 'running',
      progress: { stage: 'solve', iteration: 120, iterations: 450 },
    });
  });

  it('ignores progress from a mismatched id', () => {
    const { view, worker, id } = startedRun();
    emit(worker, { id: id + 7, type: 'progress', progress: { stage: 'solve', iteration: 1, iterations: 450 } });
    expect(view.read().progress).toBeNull();
  });

  it('clears progress when the result lands', () => {
    const { view, worker, id } = startedRun();
    emit(worker, { id, type: 'progress', progress: { stage: 'sector', sector: 4, sectors: 16, directionDeg: 90 } });
    emit(worker, { id, type: 'result', result: { mode: 'comfort' } });
    expect(view.read().progress).toBeNull();
  });

  it('turns an error message into the error status, verbatim', () => {
    const { view, worker, id } = startedRun();
    emit(worker, { id, type: 'error', message: 'Wind domain has no solid cells.' });
    expect(view.read()).toMatchObject({
      status: 'error',
      error: 'Wind domain has no solid cells.',
      study: null,
      progress: null,
    });
  });

  it('ignores message types it does not know about', () => {
    const { view, worker, id } = startedRun();
    emit(worker, { id, type: 'log', message: 'hello' });
    emit(worker, {});
    expect(view.read().status).toBe('running');
  });

  it('keeps the previous study on screen when the NEXT run errors', () => {
    // characterization: pins current behaviour; see T6. The error branch spreads
    // over the current state (useWindStudy.js:42), so `study` survives. The
    // panel therefore shows an error line above a result from an older
    // building, with no marker saying so — `stale` is false once the key
    // matches.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    emit(workers[0], { id: workers[0].messages[0].id, type: 'result', result: { mode: 'direction', tag: 'first' } });

    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS);
    emit(workers[1], { id: workers[1].messages[0].id, type: 'error', message: 'Solver diverged.' });

    expect(view.read()).toMatchObject({
      status: 'error',
      error: 'Solver diverged.',
      stale: false,
      study: { mode: 'direction', tag: 'first' },
    });
  });

  it('marks the old study stale while its replacement runs', () => {
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    emit(workers[0], { id: workers[0].messages[0].id, type: 'result', result: { mode: 'direction', tag: 'first' } });
    expect(view.read().stale).toBe(false);

    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });
    expect(view.read()).toMatchObject({ status: 'running', stale: true, study: { tag: 'first' } });
  });
});

describe('useWindStudy — teardown (characterization)', () => {
  it('terminates the worker on unmount', () => {
    const view = mount({
      project: createWindApartmentProject(),
      windStudy: createWindStudyState({ enabled: true }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS);
    expect(workers[0].terminateCount).toBe(0);
    view.unmount();
    expect(workers[0].terminateCount).toBe(1);
  });

  it('terminates the worker and hides the study when the panel is switched off', () => {
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    emit(workers[0], { id: workers[0].messages[0].id, type: 'result', result: { mode: 'direction', tag: 'first' } });

    view.update({ project, windStudy: createWindStudyState({ enabled: false }), projectRevision: '0||all' });
    expect(workers[0].terminateCount).toBe(1);
    expect(view.read()).toMatchObject({ status: 'idle', study: null, stale: false });

    advance(SETTLE_MS * 4);
    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(1);
  });

  it('re-shows the cached study instantly on re-enable AND re-runs it anyway', () => {
    // characterization: pins current behaviour; see T6. `enabled` is excluded
    // from `windRunSettingsOf`, so an off/on cycle produces a requestKey that is
    // string-equal to the finished one: `settled` is true on the very first
    // render back, and the status reads 'ready' with the old study before any
    // work has been done. The effect still schedules a full redundant re-run.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    emit(workers[0], { id: workers[0].messages[0].id, type: 'result', result: { mode: 'direction', tag: 'first' } });

    view.update({ project, windStudy: createWindStudyState({ enabled: false }), projectRevision: '0||all' });
    expect(view.read().status).toBe('idle');

    view.update({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    expect(view.read()).toMatchObject({ status: 'ready', stale: false, study: { tag: 'first' } });

    advance(SETTLE_MS);
    expect(workers).toHaveLength(2);
    expect(workers[1].messages).toHaveLength(1);
  });

  it('does not terminate anything when the study was never active', () => {
    const view = mount({
      project: createWindApartmentProject(),
      windStudy: createWindStudyState({ enabled: false }),
      projectRevision: '0||all',
    });
    view.unmount();
    expect(totalTerminations()).toBe(0);
  });
});

describe('useWindStudy — no worker available (characterization)', () => {
  it('reports unavailable when the environment has no Worker at all', () => {
    vi.unstubAllGlobals();
    expect(typeof globalThis.Worker).toBe('undefined');
    const view = mount({
      project: createWindApartmentProject(),
      windStudy: createWindStudyState({ enabled: true }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS);
    expect(view.read()).toMatchObject({ status: 'unavailable', error: UNAVAILABLE_MESSAGE, study: null });
  });

  it('reports unavailable when the Worker constructor throws, e.g. a strict CSP', () => {
    vi.stubGlobal(
      'Worker',
      class BlockedWorker {
        constructor() {
          throw new Error('Refused to create a worker (CSP).');
        }
      },
    );
    const view = mount({
      project: createWindApartmentProject(),
      windStudy: createWindStudyState({ enabled: true }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS);
    expect(view.read()).toMatchObject({ status: 'unavailable', error: UNAVAILABLE_MESSAGE });
  });

  it('retries construction on the next run rather than latching unavailable', () => {
    // characterization: the `unavailable` flag is only ever cleared by a
    // successful result (useWindStudy.js:40), but the derived status stops
    // reporting it as soon as the requestKey moves on — so the recovery path
    // runs through 'running' rather than latching on the CSP message.
    let allowed = false;
    vi.stubGlobal(
      'Worker',
      class MaybeWorker extends StubWorker {
        constructor(url, options) {
          if (!allowed) throw new Error('blocked');
          super(url, options);
        }
      },
    );
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    expect(view.read().status).toBe('unavailable');

    allowed = true;
    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(view.read().status).toBe('running');

    emit(workers[0], { id: workers[0].messages[0].id, type: 'result', result: { mode: 'direction' } });
    expect(view.read()).toMatchObject({ status: 'ready', error: null });
  });
});
