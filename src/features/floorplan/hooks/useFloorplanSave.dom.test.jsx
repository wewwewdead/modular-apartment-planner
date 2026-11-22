// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from '@/app/ErrorBoundary';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { saveProject } from '@/persistence/storage';
import { exportProjectFile } from '@/persistence/fileTransfer';
import useFloorplan from './useFloorplan';

// The route guard needs a data router; it has nothing to do with these paths.
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

const initialProject = createProject('Test');
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

beforeEach(() => {
  vi.mocked(saveProject).mockReset();
  vi.mocked(exportProjectFile).mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  latest = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useFloorplan autosave', () => {
  it('leaves an edit made while the draft was being written dirty, and saves it next', async () => {
    vi.useFakeTimers();
    let finishWrite = null;
    vi.mocked(saveProject).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWrite = resolve;
        }),
    );
    mount();

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'First' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveProject).mock.calls[0][0].name).toBe('First');

    // The write is still out when the next edit lands.
    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Second' }));
    await act(async () => {
      finishWrite();
    });

    // What was written is the first name; the second is not on disk yet.
    expect(latest.state.isDirty).toBe(true);

    vi.mocked(saveProject).mockResolvedValue(undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveProject).mock.calls[1][0].name).toBe('Second');
    expect(latest.state.isDirty).toBe(false);
  });

  it('writes the draft once when the workspace goes away inside the five seconds', async () => {
    vi.useFakeTimers();
    vi.mocked(saveProject).mockResolvedValue(undefined);
    mount();

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'First' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    // A second edit restarts the wait; that is not a leave and writes nothing.
    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Second' }));
    expect(saveProject).not.toHaveBeenCalled();

    act(() => root.unmount());
    root = null;
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveProject).mock.calls[0][0].name).toBe('Second');

    // The timer it left behind is gone with it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(saveProject).toHaveBeenCalledTimes(1);
  });

  it('writes nothing on leaving a project with nothing unsaved', async () => {
    vi.useFakeTimers();
    vi.mocked(saveProject).mockResolvedValue(undefined);
    mount();

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Saved' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(latest.state.isDirty).toBe(false);

    act(() => root.unmount());
    root = null;
    expect(saveProject).toHaveBeenCalledTimes(1);
  });

  it('keeps the last edits as a draft when the workspace crashes before the autosave', () => {
    vi.mocked(saveProject).mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bomb = { explode: null };
    function Bomb() {
      const [armed, setArmed] = useState(false);
      useEffect(() => {
        bomb.explode = () => setArmed(true);
      });
      if (armed) throw new Error('render failure');
      return null;
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <ErrorBoundary>
          <ConfirmDialogProvider>
            <Harness onRender={capture} />
            <Bomb />
          </ConfirmDialogProvider>
        </ErrorBoundary>,
      ),
    );

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Before the crash' }));
    act(() => bomb.explode());

    expect(document.body.textContent).toContain('Something Went Wrong');
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveProject).mock.calls[0][0].name).toBe('Before the crash');
  });
});

describe('useFloorplan save to file', () => {
  it('tells the user when the project file could not be written, and leaves the project dirty', async () => {
    vi.mocked(exportProjectFile).mockRejectedValue(new Error('disk full'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Renamed' }));
    await act(async () => {
      await latest.actions.project.saveProject();
    });

    expect(latest.state.editor.statusMessage).toMatch(/^Save failed/);
    expect(latest.state.isDirty).toBe(true);
    // Still logged for whoever is debugging it.
    expect(warn).toHaveBeenCalledWith('[save] Failed to save project file:', expect.any(Error));
  });

  it('says nothing when the user closes the save picker', async () => {
    vi.mocked(exportProjectFile).mockRejectedValue(new DOMException('dismissed', 'AbortError'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();

    await act(async () => {
      await latest.actions.project.saveProject();
    });

    expect(latest.state.editor.statusMessage).toBeFalsy();
    expect(warn).not.toHaveBeenCalled();
  });
});
