// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { loadProject, saveProject } from '@/persistence/storage';
import { exportProjectArchive, exportProjectFile, openProjectFile } from '@/persistence/fileTransfer';
import { useUnsavedChangesGuard } from '@/app/useUnsavedChangesGuard';
import useFloorplan from './useFloorplan';

// The route guard needs a data router; what it is asked to guard is all these
// tests want from it.
vi.mock('@/app/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: vi.fn() }));

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
  exportProjectArchive: vi.fn(),
  openProjectFile: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A project opened from a file on disk has two copies that can fall behind the
 * screen: the browser draft (autosaved) and the file itself (written only by
 * Save). "Unsaved" has to mean either one, or the guard goes quiet five seconds
 * after an edit while the file on disk is still the old project.
 */

let container = null;
let root = null;
let latest = null;

const initialProject = createProject('Test');
const capture = (value) => {
  latest = value;
};

function Harness({ onRender, isPlayground }) {
  onRender(useFloorplan({ initialProject, isPlayground }));
  return null;
}

function mount({ isPlayground = false } = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ConfirmDialogProvider>
        <Harness onRender={capture} isPlayground={isPlayground} />
      </ConfirmDialogProvider>,
    ),
  );
}

function deferred() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Long enough for afterPaint's fallback timer, which a load waits on.
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}

async function autosave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
}

const guarded = () => vi.mocked(useUnsavedChangesGuard).mock.lastCall[0];
const ui = () => latest.selectors.workspaceUi;
const edit = (name) => act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name }));
const buttonNamed = (text) => [...document.querySelectorAll('button')].find((button) => button.textContent === text);

async function openFromDisk(handle) {
  window.showOpenFilePicker = () => {};
  const loaded = createProject('From disk');
  vi.mocked(openProjectFile).mockImplementation(async ({ onProgress }) => {
    onProgress({ stage: 'reading', name: handle.name });
    return { project: loaded, savedAt: null, fileHandle: handle };
  });
  await act(async () => {
    await latest.actions.project.openProjectFile();
  });
  await settle();
  expect(latest.state.project.id).toBe(loaded.id);
  return loaded;
}

beforeEach(() => {
  vi.mocked(useUnsavedChangesGuard).mockClear();
  vi.mocked(saveProject).mockReset();
  vi.mocked(saveProject).mockResolvedValue(undefined);
  vi.mocked(loadProject).mockReset();
  vi.mocked(exportProjectFile).mockReset();
  vi.mocked(exportProjectArchive).mockReset();
  vi.mocked(openProjectFile).mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  latest = null;
  delete window.showOpenFilePicker;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a project opened from a file', () => {
  it('stays guarded after the autosave while the file on disk is behind', async () => {
    mount();
    await openFromDisk({ name: 'plan.json' });
    expect(guarded()).toBe(false);

    vi.useFakeTimers();
    edit('Edited');
    await autosave();

    // The draft has the edit; the file does not.
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(latest.state.isDirty).toBe(false);
    expect(guarded()).toBe(true);
    expect(latest.fileBehind).toBe(true);
    expect(latest.fileName).toBe('plan.json');
  });

  it('asks before New throws away an edit that only the draft holds, naming the file', async () => {
    mount();
    await openFromDisk({ name: 'plan.json' });
    vi.useFakeTimers();
    edit('Edited');
    await autosave();
    vi.useRealTimers();

    let asking = null;
    act(() => {
      asking = latest.actions.project.newProject();
    });
    await act(async () => {});
    expect(document.body.textContent).toContain('plan.json');
    expect(ui().showNewProjectModal).toBe(false);

    await act(async () => {
      buttonNamed('Cancel').click();
      await asking;
    });
    expect(ui().showNewProjectModal).toBe(false);
  });

  it('is current again once Save has written it', async () => {
    const handle = { name: 'plan.json' };
    mount();
    await openFromDisk(handle);
    edit('Edited');
    expect(latest.fileBehind).toBe(true);

    vi.mocked(exportProjectFile).mockResolvedValue({ savedAt: 'now', fileHandle: handle });
    await act(async () => {
      await latest.actions.project.saveProject();
    });

    expect(vi.mocked(exportProjectFile).mock.calls[0][1]).toEqual({ fileHandle: handle });
    expect(latest.fileBehind).toBe(false);
    expect(latest.state.isDirty).toBe(false);
    expect(guarded()).toBe(false);
  });

  it('stays behind for an edit made while the write was out, after the autosave too', async () => {
    const handle = { name: 'plan.json' };
    const write = deferred();
    mount();
    await openFromDisk(handle);
    edit('Written');
    vi.mocked(exportProjectFile).mockReturnValue(write.promise);

    let saving = null;
    act(() => {
      saving = latest.actions.project.saveProject();
    });
    vi.useFakeTimers();
    edit('Not written');
    await act(async () => {
      write.resolve({ savedAt: 'now', fileHandle: handle });
      await saving;
    });
    await autosave();

    expect(latest.state.isDirty).toBe(false);
    expect(guarded()).toBe(true);
    expect(latest.fileBehind).toBe(true);
  });

  it('drops a file that can no longer be written, so the next save asks where to put it', async () => {
    const handle = { name: 'plan.json' };
    mount();
    await openFromDisk(handle);
    edit('Edited');

    vi.mocked(exportProjectFile).mockRejectedValueOnce(new DOMException('gone', 'NotFoundError'));
    await act(async () => {
      await latest.actions.project.saveProject();
    });

    expect(latest.state.editor.statusMessage).toMatch(/^Save failed/);
    expect(latest.state.editor.statusMessage).toMatch(/next save will ask where/i);
    expect(ui().projectFileHandle).toBeNull();
    expect(latest.state.isDirty).toBe(true);

    vi.mocked(exportProjectFile).mockResolvedValueOnce({ savedAt: 'now', fileHandle: { name: 'moved.json' } });
    await act(async () => {
      await latest.actions.project.saveProject();
    });
    expect(vi.mocked(exportProjectFile).mock.calls[1][1]).toEqual({ fileHandle: null });
    expect(latest.fileName).toBe('moved.json');
  });

  it('keeps the file when the user only closed the save picker', async () => {
    const handle = { name: 'plan.json' };
    mount();
    await openFromDisk(handle);
    edit('Edited');

    vi.mocked(exportProjectFile).mockRejectedValueOnce(new DOMException('dismissed', 'AbortError'));
    await act(async () => {
      await latest.actions.project.saveProject();
    });
    expect(ui().projectFileHandle).toBe(handle);
  });

  it('does not bind a save that lands after the project was replaced', async () => {
    const write = deferred();
    mount();
    edit('Old project');
    vi.mocked(exportProjectFile).mockReturnValue(write.promise);

    let saving = null;
    act(() => {
      saving = latest.actions.project.saveProject();
    });
    act(() => latest.actions.project.createProject({ name: 'New project' }));
    const replacement = latest.state.project.id;

    await act(async () => {
      write.resolve({ savedAt: 'now', fileHandle: { name: 'old.json' } });
      await saving;
    });

    expect(latest.state.project.id).toBe(replacement);
    expect(ui().projectFileHandle).toBeNull();
    expect(latest.fileName).toBeNull();
    expect(latest.state.isDirty).toBe(false);
    expect(latest.state.savedVersion).toBe(0);
  });
});

describe('a project with no file bound', () => {
  it('is guarded exactly while the draft is behind, as it always was', async () => {
    vi.useFakeTimers();
    mount();
    expect(guarded()).toBe(false);

    edit('Edited');
    expect(guarded()).toBe(true);
    await autosave();
    expect(latest.state.isDirty).toBe(false);
    expect(guarded()).toBe(false);

    // New asks nothing of a project whose draft has everything.
    await act(async () => {
      await latest.actions.project.newProject();
    });
    expect(ui().showNewProjectModal).toBe(true);
  });

  it('asks before New with the words it always used while the draft is behind', async () => {
    mount();
    edit('Edited');

    act(() => {
      latest.actions.project.newProject();
    });
    await act(async () => {});
    expect(document.body.textContent).toContain('Unsaved changes will be lost. Continue?');
  });

  it('does not count a browser draft as a file', async () => {
    vi.mocked(loadProject).mockResolvedValue({ project: createProject('Draft'), savedAt: null });
    mount();
    await act(async () => {
      latest.actions.project.loadDraft('draft_1');
    });
    await settle();

    vi.useFakeTimers();
    edit('Edited');
    await autosave();
    expect(guarded()).toBe(false);
  });

  it('publishes that there is no file and nothing behind', () => {
    mount();
    edit('Edited');
    expect(latest.fileBehind).toBe(false);
    expect(latest.fileName).toBeNull();
  });
});

describe('the playground', () => {
  it('neither autosaves nor guards the demo it started with', async () => {
    vi.useFakeTimers();
    mount({ isPlayground: true });

    edit('Demo edit');
    await autosave();
    expect(saveProject).not.toHaveBeenCalled();
    expect(guarded()).toBe(false);
  });

  it('autosaves and guards a real project opened in it', async () => {
    vi.mocked(loadProject).mockResolvedValue({ project: createProject('Real work'), savedAt: null });
    mount({ isPlayground: true });
    await act(async () => {
      latest.actions.project.loadDraft('draft_1');
    });
    await settle();
    expect(latest.state.project.name).toBe('Real work');

    vi.useFakeTimers();
    edit('Real edit');
    expect(guarded()).toBe(true);
    await autosave();
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveProject).mock.calls[0][0].name).toBe('Real edit');
  });
});

describe('Share and the Save shortcut', () => {
  it('tells the user when the shared copy could not be written', async () => {
    vi.mocked(exportProjectArchive).mockRejectedValue(new Error('zip failed'));
    mount();

    await act(async () => {
      await latest.actions.project.shareProject();
    });
    expect(latest.state.editor.statusMessage).toMatch(/^Share failed/);
  });

  it('says nothing when the user closes the share picker', async () => {
    vi.mocked(exportProjectArchive).mockRejectedValue(new DOMException('dismissed', 'AbortError'));
    mount();

    await act(async () => {
      await latest.actions.project.shareProject();
    });
    expect(latest.state.editor.statusMessage).toBeFalsy();
  });

  it('saves once for a held Ctrl+S, not once per key repeat', async () => {
    vi.mocked(exportProjectFile).mockResolvedValue({ savedAt: 'now', fileHandle: null });
    mount();

    const press = (repeat) => {
      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, repeat, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      return event;
    };
    await act(async () => {
      press(false);
    });
    let repeated = null;
    await act(async () => {
      repeated = press(true);
      press(true);
    });

    expect(exportProjectFile).toHaveBeenCalledTimes(1);
    // Still the app's key, not the browser's "Save page".
    expect(repeated.defaultPrevented).toBe(true);
  });
});
