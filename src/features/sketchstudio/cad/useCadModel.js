import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { RevisionWorker } from './workerClient.js';

export default function useCadModel(model, enabled = true) {
  const clients = useRef(null);
  const currentModel = useRef(model);
  useLayoutEffect(() => {
    currentModel.current = model;
  }, [model]);
  const sequence = useRef(0);
  const [attempt, retry] = useState(0);
  const [state, setState] = useState({ status: 'idle', snapshot: null, source: null });
  useEffect(() => {
    const kernel = new RevisionWorker(
      () => new Worker(new URL('./kernel.worker.js', import.meta.url), { type: 'module' }),
    );
    const solver = new RevisionWorker(
      () => new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' }),
    );
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
      kernel.cancel();
      solver.cancel();
      return;
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
        if (source === currentModel.current && state.revision === sequence.current)
          setState((old) => ({ ...old, status: 'error', error }));
        throw error;
      }
    },
    [ready, state.revision, state.source],
  );
  return {
    ...state,
    ready,
    request,
    retry: () => retry((v) => v + 1),
    cancel: () => {
      sequence.current++;
      clients.current.kernel.cancel();
      clients.current.solver.cancel();
      setState((old) => ({ ...old, status: 'cancelled', error: new Error('Operation cancelled. Retry to rebuild.') }));
    },
  };
}
