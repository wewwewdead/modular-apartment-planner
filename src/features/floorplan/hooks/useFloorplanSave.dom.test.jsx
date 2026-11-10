// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
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
