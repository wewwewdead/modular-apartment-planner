// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import useCadModel, { PREVIEW_IDLE_RELEASE_MS } from './useCadModel.js';
import { emptyModel } from './model.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('CAD worker recovery in the UI', () => {
  // The workspace switches the operation preview off for every draft it cannot
  // build yet, so switching off must not cold-boot OpenCascade next time: an
  // idle worker stays warm, and is let go only once the preview stays off.
  it('does not run an inactive preview, keeps an idle worker warm when switched off, and frees it later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const requests = [],
      terminated = vi.fn();
    class WorkerMock {
      postMessage(data) {
        requests.push(data);
        queueMicrotask(() => this.onmessage({ data: { ...data, result: { parts: [], instances: [] } } }));
      }
      terminate() {
        terminated();
      }
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = emptyModel();
    const { result, rerender } = renderHook(({ enabled }) => useCadModel(model, enabled), {
      initialProps: { enabled: false },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(requests).toHaveLength(0);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(requests).toHaveLength(1);
    rerender({ enabled: false });
    expect(result.current.ready).toBe(false);
    expect(terminated).not.toHaveBeenCalled();

    // Back on before the idle release: the same worker builds again.
    rerender({ enabled: true });
    await waitFor(() => expect(requests).toHaveLength(2));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(terminated).not.toHaveBeenCalled();

    rerender({ enabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_IDLE_RELEASE_MS - 1000);
    });
    expect(terminated).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(terminated).toHaveBeenCalled();
  });
  it('stops a build that is still running when the preview is switched off', async () => {
    const terminated = vi.fn();
    const requests = [];
    class WorkerMock {
      // Never answers: the build is still running when the preview goes off.
      postMessage(data) {
        requests.push(data);
      }
      terminate() {
        terminated();
      }
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = emptyModel();
    const { rerender } = renderHook(({ enabled }) => useCadModel(model, enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    rerender({ enabled: false });
    expect(terminated).toHaveBeenCalledTimes(1);
  });
  it('reports a failed export without taking the workspace into the error state', async () => {
    class WorkerMock {
      postMessage(data) {
        queueMicrotask(() => {
          if (data.type === 'build') this.onmessage({ data: { ...data, result: { parts: [], instances: [] } } });
          else this.onmessage({ data: { ...data, error: { message: 'STEP writer failed' } } });
        });
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = emptyModel();
    const { result } = renderHook(() => useCadModel(model));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await expect(result.current.request('export')).rejects.toThrow(/STEP writer failed/);
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.ready).toBe(true);
  });
  it('keeps the last valid snapshot and exposes recovery after an export worker crashes', async () => {
    const workers = [];
    class WorkerMock {
      constructor() {
        workers.push(this);
      }
      postMessage(data) {
        queueMicrotask(() => {
          if (data.type === 'build') this.onmessage({ data: { ...data, result: { parts: [], instances: [] } } });
          else this.onerror({ message: 'Worker crashed during export' });
        });
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = emptyModel();
    const { result } = renderHook(() => useCadModel(model));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const valid = result.current.snapshot;
    await act(async () => {
      await expect(result.current.request('export')).rejects.toThrow(/crashed/);
    });
    expect(result.current.ready).toBe(false);
    expect(result.current.snapshot).toBe(valid);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(workers.length).toBe(2);
  });
  it('cancels during the debounce interval without starting kernel work', async () => {
    vi.useFakeTimers();
    const started = vi.fn();
    class WorkerMock {
      constructor() {
        started();
      }
      terminate() {}
      postMessage() {}
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = emptyModel(),
      { result } = renderHook(() => useCadModel(model));
    act(() => result.current.cancel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(started).not.toHaveBeenCalled();
    expect(result.current.status).toBe('cancelled');
  });
});
describe('kernel boot reporting', () => {
  it('reports the kernel awake once the worker says its WASM has loaded', async () => {
    class WorkerMock {
      postMessage(data) {
        queueMicrotask(() => {
          // What kernel.worker.js sends once, after OpenCascade has initialised.
          this.onmessage({ data: { status: 'awake' } });
          this.onmessage({ data: { ...data, result: { parts: [], instances: [] } } });
        });
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = emptyModel();
    const { result } = renderHook(() => useCadModel(model));
    expect(result.current.kernelAwake).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.kernelAwake).toBe(true);
  });
  it('reports the kernel asleep again once its worker has died', async () => {
    class WorkerMock {
      postMessage(data) {
        queueMicrotask(() => {
          if (data.type === 'build') {
            this.onmessage({ data: { status: 'awake' } });
            this.onmessage({ data: { ...data, result: { parts: [], instances: [] } } });
          } else this.onerror({ message: 'Worker crashed during export' });
        });
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = emptyModel();
    const { result } = renderHook(() => useCadModel(model));
    await waitFor(() => expect(result.current.kernelAwake).toBe(true));
    await act(async () => {
      await expect(result.current.request('export')).rejects.toThrow(/crashed/);
    });
    expect(result.current.kernelAwake).toBe(false);
  });
});
describe('kernel-inert edits (docs/sketch-studio-fab-shop.md §4.3)', () => {
  it('keeps the snapshot for a finish-only change and request() still answers; a geometry change rebuilds', async () => {
    const requests = [];
    class WorkerMock {
      postMessage(data) {
        requests.push(data);
        queueMicrotask(() =>
          this.onmessage({
            data: {
              ...data,
              result: data.type === 'build' ? { parts: [], instances: [], built: requests.length } : ['sheet'],
            },
          }),
        );
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = emptyModel();
    const { result, rerender } = renderHook(({ model }) => useCadModel(model), { initialProps: { model } });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const snapshot = result.current.snapshot,
      revision = result.current.revision;
    expect(requests.map((r) => r.type)).toEqual(['build']);

    // Painting a part: no rebuild, ready on the very render that shows it.
    const painted = {
      ...model,
      finishes: [
        {
          id: 'f',
          instanceId: 'i',
          kind: 'powder',
          name: 'RAL 9005',
          colour: '#0a0a0a',
          gloss: 'gloss',
          thickness: 70,
        },
      ],
    };
    rerender({ model: painted });
    expect(result.current.ready).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(requests.map((r) => r.type)).toEqual(['build']);
    expect(result.current.status).toBe('ready');
    expect(result.current.source).toBe(painted);
    expect(result.current.snapshot).toBe(snapshot);
    expect(result.current.revision).toBe(revision);
    let answer;
    await act(async () => {
      answer = await result.current.request('drawings');
    });
    expect(answer).toEqual(['sheet']);
    expect(requests.at(-1)).toMatchObject({ type: 'drawings', revision });

    // Another press brake (the fabrication settings): no rebuild either.
    const reshopped = {
      ...painted,
      fabrication: { ...painted.fabrication, shop: { ...painted.fabrication.shop, machine: 'brake-80-2500' } },
    };
    rerender({ model: reshopped });
    expect(result.current.ready).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(requests.filter((r) => r.type === 'build')).toHaveLength(1);
    expect(result.current.source).toBe(reshopped);
    expect(result.current.snapshot).toBe(snapshot);

    // A real edit rebuilds as before.
    rerender({ model: { ...reshopped, parts: [] } });
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(requests.filter((r) => r.type === 'build')).toHaveLength(2));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.revision).toBeGreaterThan(revision);
  });
  it('SM-3: a group of parts and a print never rebuild; a rebuild is sent no print images', async () => {
    const requests = [];
    class WorkerMock {
      postMessage(data) {
        requests.push(data);
        queueMicrotask(() =>
          this.onmessage({ data: { ...data, result: data.type === 'build' ? { parts: [], instances: [] } : [] } }),
        );
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', WorkerMock);
    const model = {
      ...emptyModel(),
      parts: [{ id: 'p', name: 'Plate', features: [{ id: 'f', type: 'box', width: 1, depth: 1, height: 1 }] }],
      instances: [
        { id: 'a', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] },
        { id: 'b', partId: 'p', position: [5, 0, 0], rotation: [0, 0, 0] },
      ],
    };
    const { result, rerender } = renderHook(({ model }) => useCadModel(model), { initialProps: { model } });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const snapshot = result.current.snapshot;
    // Both parts put in one group (instances rewritten with a groupId).
    const grouped = {
      ...model,
      groups: [{ id: 'g', name: 'Group 1', parentId: null }],
      instances: model.instances.map((i) => ({ ...i, groupId: 'g' })),
    };
    rerender({ model: grouped });
    expect(result.current.ready).toBe(true);
    const image = `data:image/png;base64,${'Q'.repeat(300000)}`;
    const printed = {
      ...grouped,
      prints: [
        {
          id: 't',
          instanceId: 'a',
          origin: [0, 0, 1],
          x: [1, 0, 0],
          normal: [0, 0, 1],
          width: 10,
          height: 10,
          rotation: 0,
          method: 'uv',
          kind: 'image',
          image,
          colour: '#000000',
        },
      ],
    };
    rerender({ model: printed });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(requests.filter((r) => r.type === 'build')).toHaveLength(1);
    expect(result.current.snapshot).toBe(snapshot);
    expect(result.current.source).toBe(printed);
    // Moving a part rebuilds, and the build carries no image (nor finishes, prints).
    rerender({
      model: {
        ...printed,
        instances: printed.instances.map((i) => (i.id === 'b' ? { ...i, position: [6, 0, 0] } : i)),
      },
    });
    await waitFor(() => expect(requests.filter((r) => r.type === 'build')).toHaveLength(2));
    const sent = requests.filter((r) => r.type === 'build').at(-1).payload;
    expect(sent.prints).toBeUndefined();
    expect(sent.groups).toEqual(grouped.groups);
    expect(JSON.stringify(sent)).not.toContain('QQQQ');
  });
});
