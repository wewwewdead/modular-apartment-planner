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
