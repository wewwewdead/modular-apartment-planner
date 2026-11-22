// The kernel worker's message queue, driven with a fake `self` and a fake
// kernel (no WASM): which builds run, which are skipped, and that every
// request still gets its reply in order.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kernel = vi.hoisted(() => ({ sessions: [], buildMs: 0 }));

vi.mock('replicad-opencascadejs', () => ({ default: () => Promise.resolve({}) }));
vi.mock('replicad-opencascadejs/wasm?url', () => ({ default: 'opencascade.wasm' }));
vi.mock('replicad', () => ({ setOC: () => {} }));
vi.mock('./kernel.js', () => ({
  createKernelSession: (payload) => {
    // A build that holds the thread, as OpenCascade does.
    const end = Date.now() + kernel.buildMs;
    while (Date.now() < end);
    const session = {
      payload,
      dispose: vi.fn(),
      snapshot(options) {
        session.timing = { ...options?.timing };
        return { built: payload.revision };
      },
      drawings: () => ({ drawingsOf: payload.revision }),
    };
    kernel.sessions.push(session);
    return session;
  },
  snapshotTransferables: () => [],
}));

let replies;
let onmessage;
beforeEach(async () => {
  vi.resetModules();
  kernel.sessions = [];
  kernel.buildMs = 0;
  replies = [];
  globalThis.self = { postMessage: (message) => replies.push(message) };
  await import('./kernel.worker.js');
  onmessage = globalThis.self.onmessage;
});
afterEach(() => {
  delete globalThis.self;
});

const post = (type, revision, payload = { revision }) =>
  onmessage({ data: { type, revision, requestId: revision, payload } });
// Wait until the worker has answered `count` requests (the awake note aside).
const answered = (count) =>
  vi.waitFor(() => expect(replies.filter((r) => !r.status)).toHaveLength(count), { timeout: 4000, interval: 5 });

describe('kernel worker queue', () => {
  it('runs only the newest of the builds posted while one was building', async () => {
    post('build', 1);
    await answered(1);
    kernel.buildMs = 60;
    // Build 2 runs; six edits arrive while it holds the thread.
    post('build', 2);
    const later = [3, 4, 5, 6, 7, 8].map(
      (revision) => new Promise((resolve) => setTimeout(() => resolve(post('build', revision)), 5)),
    );
    await Promise.all(later);
    await answered(8);
    const builds = replies.filter((r) => !r.status);
    // Before the one-task wait each of the six ran its own build (six, plus 1 and 2).
    expect(kernel.sessions.map((s) => s.payload.revision)).toEqual([1, 2, 8]);
    expect(builds.map((r) => r.revision)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // A skipped build still answers its request, with the error the main thread drops as stale.
    for (const reply of builds.slice(2, 7)) {
      expect(reply.result).toBeUndefined();
      expect(reply.error.message).toBe('Superseded model revision.');
    }
    expect(builds[7].result).toMatchObject({ built: 8 });
  });

  it('B2.5: a build reports its timings under `debug`, which nothing else on the result changes', async () => {
    post('build', 1);
    await answered(1);
    const { debug, ...rest } = replies.find((r) => r.requestId === 1).result;
    expect(rest).toEqual({ built: 1 });
    expect(Object.keys(debug).sort()).toEqual(
      ['buildMs', 'copyMs', 'edgesMs', 'instances', 'meshMs', 'postedAt', 'snapshotMs'].sort(),
    );
    for (const key of ['buildMs', 'copyMs', 'edgesMs', 'meshMs', 'snapshotMs'])
      expect(debug[key]).toBeGreaterThanOrEqual(0);
    expect(debug.postedAt).toBeGreaterThan(performance.timeOrigin);
    // The kernel was handed the object the probes add into.
    expect(kernel.sessions[0].timing).toEqual({ meshMs: 0, edgesMs: 0, copyMs: 0 });
  });

  it('keeps every other request in strict order behind the builds', async () => {
    post('build', 1);
    await answered(1);
    kernel.buildMs = 40;
    post('build', 2);
    await new Promise((resolve) => setTimeout(resolve, 5));
    // A drawing for the build that will be superseded, then the newer build.
    onmessage({ data: { type: 'drawings', revision: 2, requestId: 'd2', payload: null } });
    post('build', 3);
    await answered(4);
    const order = replies.filter((r) => !r.status).map((r) => r.requestId);
    expect(order).toEqual([1, 2, 'd2', 3]);
    expect(replies.find((r) => r.requestId === 'd2').result).toEqual({ drawingsOf: 2 });
    expect(kernel.sessions.map((s) => s.payload.revision)).toEqual([1, 2, 3]);
  });

  it('builds a lone edit, and announces the awake kernel once', async () => {
    post('build', 1);
    post('build', 2);
    await answered(2);
    post('build', 3);
    await answered(3);
    expect(replies.filter((r) => r.status === 'awake')).toHaveLength(1);
    // Build 1 was already stale when its turn came (build 2 had arrived), so it never woke the kernel.
    expect(replies.map((r) => r.status ?? r.revision)).toEqual([1, 'awake', 2, 3]);
    expect(kernel.sessions.map((s) => s.payload.revision)).toEqual([2, 3]);
    expect(kernel.sessions[0].dispose).toHaveBeenCalledTimes(1);
  });
});
