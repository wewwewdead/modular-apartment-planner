/* @vitest-environment jsdom */
/**
 * Suite for the `useWindStudy` worker lifecycle.
 *
 * Written as characterization ahead of T6; REWORKED BY T6, which changed the
 * lifecycle deliberately. Each assertion that moved says so and says what it
 * used to claim, because a pin that quietly changed its mind is worse than no
 * pin at all.
 *
 * ## What T6 changed, in one paragraph
 *
 * The worker used to be terminated and rebuilt on every supersession. That made
 * a superseded run stop immediately, at the cost of throwing away everything the
 * worker had computed — which, once the worker started caching solved lattice
 * fields, meant every keystroke bought a cold solve. Now the worker is built
 * once and kept: supersession POSTS the newer request, and the worker abandons
 * the older one at its next chunk boundary. `terminate()` is reserved for the
 * two moments nobody wants the answer any more — unmount, and the panel being
 * switched off.
 *
 * ## Why a stub worker
 *
 * jsdom has no `Worker`, and the hook's `createWorker` treats
 * `typeof Worker === 'undefined'` as "this browser cannot run the study".
 * `vi.stubGlobal('Worker', StubWorker)` supplies one. Vite rewrites
 * `new Worker(new URL('@/analysis/wind.worker.js', import.meta.url), …)` into a
 * resolved URL before the stub ever sees it, so the constructor receives
 * `http://localhost:3000/src/analysis/wind.worker.js?worker_file&type=module`
 * and `{ type: 'module' }` — the real worker file is never loaded or executed.
 *
 * The stub emulates exactly the four things the hook touches: the constructor,
 * `addEventListener('message')`, `postMessage` and `terminate`. The hook never
 * sets `onmessage`, never listens for `error`, and never calls
 * `removeEventListener`; `emit()` below therefore only has to feed the single
 * `message` listener an object shaped like `{ data }`.
 *
 * True chunk-abandonment cannot be seen from here — the stub never runs the
 * solver — so cancellation is pinned at two levels: the MESSAGE level below (the
 * newer request reaches the worker while the older one is unanswered, and the
 * older reply is then suppressed) and the SOLVER level in `lbmSolver.test.js`
 * (an async solve whose generation counter is bumped between chunks stops).
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

  it('does NOT re-run when the settings object is rebuilt with identical values', () => {
    // FLIPPED BY T6. This used to assert the opposite, and named the reason:
    // the effect depended on the memoised `settings` OBJECT as well as on the
    // value-equal `requestKey` string, so a caller handing over a
    // fresh-but-equal windStudy object terminated the running worker and started
    // the identical run again. The effect is now gated on the request key alone,
    // and what to post is read from a ref at post time.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    expect(totalPosts()).toBe(1);

    for (let pass = 0; pass < 4; pass += 1) {
      view.update({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    }
    advance(SETTLE_MS * 3);

    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(1);
    expect(totalTerminations()).toBe(0);
  });
});

describe('useWindStudy — supersession and debounce', () => {
  it('keeps the worker warm and posts the replacement into it', () => {
    // FLIPPED BY T6. This used to be 'terminates the running worker immediately
    // and posts one replacement after the settle', and asserted
    // `first.terminateCount === 1` synchronously with the render commit plus a
    // second worker after the settle. Killing the worker killed its solved-field
    // cache, which is the cost T6 exists to remove: the replacement now goes to
    // the same worker, which abandons the run in flight at its next chunk.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const worker = workers[0];
    expect(worker.messages).toHaveLength(1);

    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });

    // Nothing happens on the commit itself: no terminate, and no post until the
    // settle has been survived.
    expect(worker.terminateCount).toBe(0);
    expect(worker.messages).toHaveLength(1);
    expect(workers).toHaveLength(1);

    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(totalTerminations()).toBe(0);
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1].windStudy.directionDeg).toBe(90);
    expect(view.read().status).toBe('running');
  });

  it('reaches the worker with the newer request while the older one is still unanswered', () => {
    // The message-level half of the cancellation contract: what the hook
    // guarantees is that the worker LEARNS about the newer request without
    // waiting for the older one to reply. What the worker then does with that —
    // abandon the lattice at the next chunk boundary — is pinned in
    // `lbmSolver.test.js`, which can run a real solve.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const worker = workers[0];
    const firstId = worker.messages[0].id;

    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS);

    // Two live requests on one worker, the first of which never replied.
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1].id).not.toBe(firstId);
    expect(view.read()).toMatchObject({ status: 'running', study: null });

    // The old worker replying anyway — a real one can have a result in flight
    // when the newer request lands — is suppressed by id.
    emit(worker, { id: firstId, type: 'result', result: { mode: 'direction', tag: 'stale' } });
    expect(view.read()).toMatchObject({ status: 'running', study: null });

    emit(worker, { id: worker.messages[1].id, type: 'result', result: { mode: 'direction', tag: 'live' } });
    expect(view.read()).toMatchObject({ status: 'ready', study: { tag: 'live' } });
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

  it('allocates one request id per POST, not one per superseded render', () => {
    // FLIPPED BY T6. This used to be 'burns one request id per superseded run
    // even though only the last is posted', and pinned `baselineId + 3` after
    // three abandoned renders: the id was allocated in the effect body, so the
    // counter advanced once per keystroke. It is now allocated in the timer, at
    // the moment of the post, which is what makes an id mean a request the
    // worker has actually seen.
    //
    // The allocator is module-global and other suites share it, so what is
    // pinned is the STEP between this hook's own posts, not an absolute value.
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
    expect(workers[0].messages).toHaveLength(2);
    expect(workers[0].messages[1].id).toBe(baselineId + 1);
  });

  it('terminates nothing across a burst, and keeps one worker alive throughout it', () => {
    // FLIPPED BY T6. This used to be 'terminates once per burst, not once per
    // change, because the ref is nulled first' and asserted exactly one
    // termination plus a second worker. Its own comment named the defect: a long
    // burst left NO worker alive at all. There is now always exactly one.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const worker = workers[0];

    for (const directionDeg of [22.5, 45, 67.5, 90]) {
      view.update({
        project,
        windStudy: createWindStudyState({ enabled: true, directionDeg }),
        projectRevision: '0||all',
      });
      expect(totalTerminations()).toBe(0);
      expect(workers).toHaveLength(1);
    }

    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(worker.messages).toHaveLength(2);
    expect(totalTerminations()).toBe(0);
  });

  it('re-runs when only the project identity changes, settings untouched', () => {
    // Updated by T6: the re-run is a second POST into the same warm worker
    // rather than a second worker. It used to assert `workers[0].terminateCount`
    // was 1.
    const windStudy = createWindStudyState({ enabled: true });
    const view = mount({ project: createWindApartmentProject(), windStudy, projectRevision: '0||all' });
    advance(SETTLE_MS);
    view.update({ project: createWindApartmentProject(), windStudy, projectRevision: '1||all' });
    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(2);
    expect(totalTerminations()).toBe(0);
  });

  it('re-runs when only the projectRevision changes', () => {
    // Updated by T6: one worker, two posts. It used to expect two workers.
    const project = createWindApartmentProject();
    const windStudy = createWindStudyState({ enabled: true });
    const view = mount({ project, windStudy, projectRevision: '0||all' });
    advance(SETTLE_MS);
    view.update({ project, windStudy, projectRevision: '1|phase_new|single' });
    advance(SETTLE_MS);
    expect(workers).toHaveLength(1);
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

  it('shows a run that lands DURING the settle window, marked stale', () => {
    // FLIPPED BY T6. This used to be 'ignores a result that arrives for a run
    // that has already been superseded' and expected `study: null`, because the
    // worker had been terminated the instant the inputs changed and any reply
    // was by definition an orphan.
    //
    // The request in flight is no longer an orphan: it is still the pending one
    // until the replacement is actually posted, which is a settle period away.
    // Dropping its answer would leave the panel blank for a run that finished.
    // It lands, keyed to the inputs it was a study of, and is therefore marked
    // stale rather than presented as current — rule 3, doing its job.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const worker = workers[0];
    const inFlightId = worker.messages[0].id;

    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });
    emit(worker, { id: inFlightId, type: 'result', result: { mode: 'direction', tag: 'in-flight' } });
    expect(view.read()).toMatchObject({ status: 'running', stale: true, study: { tag: 'in-flight' } });

    // Once the replacement has actually been posted, the older id stops being
    // the pending one and a late reply carrying it is dropped.
    advance(SETTLE_MS);
    emit(worker, { id: inFlightId, type: 'result', result: { mode: 'direction', tag: 'too-late' } });
    expect(view.read()).toMatchObject({ status: 'running', stale: true, study: { tag: 'in-flight' } });
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
    // characterization: pins current behaviour. The error branch spreads over
    // the current state, so `study` survives. The panel therefore shows an error
    // line above a result from an older building, with no marker saying so —
    // `stale` is false once the key matches. Left as it was: T6 deliberately did
    // not touch the error path, and improving it is a separate decision.
    //
    // Updated only in its plumbing: both runs go to the one warm worker, so the
    // second reply is matched against `messages[1]` rather than `workers[1]`.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    const worker = workers[0];
    emit(worker, { id: worker.messages[0].id, type: 'result', result: { mode: 'direction', tag: 'first' } });

    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS);
    emit(worker, { id: worker.messages[1].id, type: 'error', message: 'Solver diverged.' });

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

  it('re-shows the cached study instantly on re-enable and does NOT re-run it', () => {
    // FLIPPED BY T6. This used to end '…AND re-runs it anyway', asserting a
    // second worker and a second post. The redundant run was the more expensive
    // half of the defect, because switching the panel off terminates the worker
    // and with it the solved fields it had cached — so the re-run was guaranteed
    // to be a cold one, for an answer already on screen.
    //
    // The run is now skipped whenever the stored result already answers exactly
    // this request key. `enabled` is excluded from `windRunSettingsOf`, so an
    // off/on cycle produces a key string-equal to the finished one.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    emit(workers[0], { id: workers[0].messages[0].id, type: 'result', result: { mode: 'direction', tag: 'first' } });

    view.update({ project, windStudy: createWindStudyState({ enabled: false }), projectRevision: '0||all' });
    expect(view.read().status).toBe('idle');

    view.update({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    expect(view.read()).toMatchObject({ status: 'ready', stale: false, study: { tag: 'first' } });

    advance(SETTLE_MS * 4);
    expect(workers).toHaveLength(1);
    expect(totalPosts()).toBe(1);
  });

  it('still runs on re-enable when the inputs moved while the panel was off', () => {
    // Guards the pin above against being a blanket "never re-runs after a
    // toggle": the skip is keyed on the request, not on the toggle.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    emit(workers[0], { id: workers[0].messages[0].id, type: 'result', result: { mode: 'direction', tag: 'first' } });

    view.update({ project, windStudy: createWindStudyState({ enabled: false }), projectRevision: '0||all' });
    view.update({
      project,
      windStudy: createWindStudyState({ enabled: true, directionDeg: 90 }),
      projectRevision: '0||all',
    });
    advance(SETTLE_MS);

    // A fresh worker, because switching off terminated the last one.
    expect(workers).toHaveLength(2);
    expect(workers[1].messages).toHaveLength(1);
    expect(workers[1].messages[0].windStudy.directionDeg).toBe(90);
  });

  it('does not re-run an errored request just because it is re-entered', () => {
    // The skip is only for an ANSWER. An error is not one, so the next run gets
    // to try again — which is what keeps a transient worker failure recoverable.
    const project = createWindApartmentProject();
    const view = mount({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    emit(workers[0], { id: workers[0].messages[0].id, type: 'error', message: 'Solver diverged.' });
    expect(view.read().status).toBe('error');

    view.update({ project, windStudy: createWindStudyState({ enabled: false }), projectRevision: '0||all' });
    view.update({ project, windStudy: createWindStudyState({ enabled: true }), projectRevision: '0||all' });
    advance(SETTLE_MS);
    expect(totalPosts()).toBe(2);
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
