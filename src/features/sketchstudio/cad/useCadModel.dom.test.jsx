// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import useCadModel from './useCadModel.js';
import { emptyModel } from './model.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('CAD worker recovery in the UI', () => {
  it('does not run an inactive preview and releases its worker when cancelled', async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(requests).toHaveLength(0);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(requests).toHaveLength(1);
    rerender({ enabled: false });
    expect(result.current.ready).toBe(false);
    expect(terminated).toHaveBeenCalled();
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
