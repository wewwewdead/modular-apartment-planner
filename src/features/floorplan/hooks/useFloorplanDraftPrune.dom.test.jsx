// @vitest-environment jsdom
/**
 * The draft prune that follows a save waits for idle time (docs/perf-pass-3.md
 * D1.3). It reads and parses every stored draft it has not yet seen hold work,
 * and it used to run in the same task as the autosave it followed. The save
 * itself, its order and its MARK_SAVED version are untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { pruneDrafts, saveProject } from '@/persistence/storage';
import { exportProjectFile } from '@/persistence/fileTransfer';
import useFloorplan from './useFloorplan';

vi.mock('@/app/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => {} }));

vi.mock('@/persistence/storage', () => ({
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  listProjects: vi.fn(async () => []),
  deleteProject: vi.fn(),
  pruneDrafts: vi.fn(async () => []),
}));

vi.mock('@/persistence/fileTransfer', async (importOriginal) => ({
  ...(await importOriginal()),
  exportProjectFile: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;
let latest = null;
let idleQueue = [];

const initialProject = createProject('Prune');

const capture = (value) => {
  latest = value;
};

function Harness({ onRender }) {
  onRender(useFloorplan({ initialProject }));
  return null;
}

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ConfirmDialogProvider>
        <Harness onRender={capture} />
      </ConfirmDialogProvider>,
    ),
  );
}

function pendingIdle() {
  return idleQueue.filter(Boolean).length;
}

async function runIdle() {
  const callbacks = idleQueue.filter(Boolean);
  idleQueue = [];
  await act(async () => {
    for (const callback of callbacks) callback({ didTimeout: false, timeRemaining: () => 50 });
  });
}

// A hand-run idle queue. Installed after any fake timers, which would
// otherwise take requestIdleCallback over and run it with the clock.
function installIdleQueue() {
  idleQueue = [];
  window.requestIdleCallback = (callback) => {
    idleQueue.push(callback);
    return idleQueue.length;
  };
  window.cancelIdleCallback = (handle) => {
    idleQueue[handle - 1] = null;
  };
}

beforeEach(() => {
  vi.mocked(saveProject).mockReset();
  vi.mocked(saveProject).mockResolvedValue(undefined);
  vi.mocked(exportProjectFile).mockReset();
  vi.mocked(pruneDrafts).mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  latest = null;
  delete window.requestIdleCallback;
  delete window.cancelIdleCallback;
  vi.useRealTimers();
});

describe('the draft prune after a save', () => {
  it('waits for idle time after an autosave, and keeps the saved project', async () => {
    vi.useFakeTimers();
    installIdleQueue();
    mount();
    // The start-up prune, already idle-scheduled before this change.
    await runIdle();
    vi.mocked(pruneDrafts).mockClear();

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Edited' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(latest.state.isDirty).toBe(false);
    expect(pruneDrafts).not.toHaveBeenCalled();
    expect(pendingIdle()).toBe(1);

    await runIdle();
    expect(pruneDrafts).toHaveBeenCalledTimes(1);
    expect(pruneDrafts).toHaveBeenCalledWith({ keepId: initialProject.id });
  });

  it('waits for idle time after Save too', async () => {
    vi.mocked(exportProjectFile).mockResolvedValue({ fileHandle: null });
    installIdleQueue();
    mount();
    await runIdle();
    vi.mocked(pruneDrafts).mockClear();

    await act(async () => {
      await latest.actions.project.saveProject();
    });
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(pruneDrafts).not.toHaveBeenCalled();
    await runIdle();
    expect(pruneDrafts).toHaveBeenCalledWith({ keepId: initialProject.id });
  });

  it('drops a prune still waiting when the workspace goes away', async () => {
    vi.useFakeTimers();
    installIdleQueue();
    mount();
    await runIdle();
    vi.mocked(pruneDrafts).mockClear();

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Edited' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(pendingIdle()).toBe(1);
    act(() => root.unmount());
    root = null;
    expect(pendingIdle()).toBe(0);
    expect(pruneDrafts).not.toHaveBeenCalled();
  });
});
