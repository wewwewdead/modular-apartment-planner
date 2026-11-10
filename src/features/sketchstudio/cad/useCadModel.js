import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { RevisionWorker } from './workerClient.js';

// A preview switched off keeps its warm workers this long before letting them
// go, so the WASM heaps are still freed when it stays off.
export const PREVIEW_IDLE_RELEASE_MS = 30000;

export default function useCadModel(model, enabled = true) {
  const clients = useRef(null);
  const currentModel = useRef(model);
  useLayoutEffect(() => {
    currentModel.current = model;
  }, [model]);
  const sequence = useRef(0);
  const [attempt, retry] = useState(0);
  const [state, setState] = useState({ status: 'idle', snapshot: null, source: null });
  // OpenCascade has loaded in the current worker; a restarted worker loads it again.
  const [kernelAwake, setKernelAwake] = useState(false);
  useEffect(() => {
    const kernel = new RevisionWorker(
      () => new Worker(new URL('./kernel.worker.js', import.meta.url), { type: 'module' }),
    );
    const solver = new RevisionWorker(
      () => new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' }),
    );
    kernel.onStatus = (status) => {
      if (status === 'awake') setKernelAwake(true);
    };
    // A crash, a timeout or a cancel terminates the worker; its replacement
    // loads OpenCascade again.
    kernel.onTerminate = () => setKernelAwake(false);
    clients.current = { kernel, solver };
    return () => {
      kernel.cancel();
      solver.cancel();
      clients.current = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const revision = ++sequence.current;
    const { kernel, solver } = clients.current;
    if (!enabled) {
      // The workspace switches the preview off for every draft it cannot build
      // yet — the whole Place stage, each half-typed value — and terminating
      // made the next operation cold-boot OpenCascade. So an idle worker stays
      // warm; one actually running a build it can no longer use is stopped,
      // and a preview that stays off still lets its heaps go after a while.
      for (const client of [kernel, solver]) {
        if (client.isBusy()) client.cancel();
        else client.supersede();
      }
      const idleRelease = setTimeout(() => {
        kernel.cancel();
        solver.cancel();
      }, PREVIEW_IDLE_RELEASE_MS);
      return () => clearTimeout(idleRelease);
    }
    // Restarting the worker reloads OpenCascade (~1 s), so an edit only
    // supersedes the previous request.
    kernel.supersede();
    solver.supersede();
    const timer = setTimeout(async () => {
      if (revision !== sequence.current) return;
      setState((old) => ({ ...old, status: 'building', error: null }));
      try {
        const solved = model.sketches.some((s) => s.constrained)
          ? await solver.request('solve', model, revision)
          : { model, reports: [] };
        if (!active || revision !== sequence.current) return;
        const snapshot = await kernel.request('build', solved.model, revision);
        if (active && revision === sequence.current)
          setState({ status: 'ready', snapshot, source: model, revision, reports: solved.reports });
      } catch (error) {
        if (active && revision === sequence.current)
          setState((old) => ({ ...old, status: 'error', error, errorSource: model }));
      }
    }, 50);
    return () => {
      active = false;
      clearTimeout(timer);
      kernel.supersede();
      solver.supersede();
    };
  }, [model, attempt, enabled]);
  const ready = enabled && state.status === 'ready' && state.source === model;
  const request = useCallback(
    async (type, payload = null) => {
      if (!ready || state.source !== currentModel.current)
        throw new Error('Wait for the current model to rebuild before exporting or inspecting.');
      const source = currentModel.current;
      try {
        const result = await clients.current.kernel.request(type, payload, state.revision);
        if (source !== currentModel.current) throw new Error('Model changed during the operation. Run it again.');
        return result;
      } catch (error) {
        // Only a dead worker (crashed, timed out) takes the whole workspace
        // into the error state; a request the kernel answered with an error —
        // an export or a drawing that failed — is the caller's to report.
        if (
          !clients.current?.kernel.isAlive() &&
          source === currentModel.current &&
          state.revision === sequence.current
        )
          setState((old) => ({ ...old, status: 'error', error }));
        throw error;
      }
    },
    [ready, state.revision, state.source],
  );
  return {
    ...state,
    kernelAwake,
    ready,
    request,
    retry: () => retry((v) => v + 1),
    cancel: () => {
      sequence.current++;
      setKernelAwake(false);
      clients.current.kernel.cancel();
      clients.current.solver.cancel();
      setState((old) => ({ ...old, status: 'cancelled', error: new Error('Operation cancelled. Retry to rebuild.') }));
    },
  };
}
