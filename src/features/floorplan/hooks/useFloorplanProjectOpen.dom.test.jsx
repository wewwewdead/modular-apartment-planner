// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { loadProject } from '@/persistence/storage';
import { importProjectFile, openProjectFile } from '@/persistence/fileTransfer';
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
  openProjectFile: vi.fn(),
  importProjectFile: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Opening a project from the Open Project dialog. The dialog is the only place
 * a load starts, so closing it (Cancel, Escape, the ×) is how the user says
 * they no longer want the project they asked for: whatever that load does
 * afterwards — its progress, its result, its failure — must not reach the
 * screen. A load nobody cancelled lands exactly as it always has.
 */

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

function deferred() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Long enough for afterPaint's fallback timer, which is what a load waits on
// before it reads and again before it commits.
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}

async function openDialog() {
  await act(async () => {
    await latest.actions.workspace.openLoadModal();
  });
}

function closeDialog() {
  act(() => latest.actions.workspace.closeLoadModal());
}

const ui = () => latest.selectors.workspaceUi;

function loadedResult(name) {
  return { project: createProject(name), savedAt: '2026-11-09T00:00:00.000Z' };
}

beforeEach(() => {
  vi.mocked(loadProject).mockReset();
  vi.mocked(openProjectFile).mockReset();
  vi.mocked(importProjectFile).mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  latest = null;
  delete window.showOpenFilePicker;
  vi.restoreAllMocks();
});

describe('useFloorplan project open', () => {
  it('puts a draft on screen and closes the dialog when nobody cancels', async () => {
    const loaded = loadedResult('Loaded draft');
    vi.mocked(loadProject).mockResolvedValue(loaded);
    mount();
    await openDialog();

    let loading = null;
    act(() => {
      loading = latest.actions.project.loadDraft('draft_1');
    });
    expect(ui().projectOpening).toEqual({ stage: 'draft', draftId: 'draft_1' });
    await settle();
    await act(async () => loading);

    expect(latest.state.project.id).toBe(loaded.project.id);
    expect(ui().showLoadModal).toBe(false);
    expect(ui().projectOpening).toBeNull();
    expect(ui().projectFileHandle).toBeNull();
  });

  it('adopts the file it opened as the save target when nobody cancels', async () => {
    window.showOpenFilePicker = () => {};
    const handle = { name: 'plan.json' };
    const loaded = loadedResult('Loaded file');
    vi.mocked(openProjectFile).mockImplementation(async ({ onProgress }) => {
      onProgress({ stage: 'reading', name: 'plan.json' });
      return { ...loaded, fileHandle: handle };
    });
    mount();
    await openDialog();

    await act(async () => {
      await latest.actions.project.openProjectFile();
    });
    await settle();

    expect(latest.state.project.id).toBe(loaded.project.id);
    expect(ui().projectFileHandle).toBe(handle);
    expect(ui().showLoadModal).toBe(false);
    expect(ui().projectOpening).toBeNull();
  });

  it('shows a failure on the dialog card while the dialog is up', async () => {
    vi.mocked(loadProject).mockRejectedValue(new Error('Project not found'));
    mount();
    await openDialog();

    act(() => {
      latest.actions.project.loadDraft('missing');
    });
    await settle();

    expect(ui().projectOpenError).toBe('Project not found');
    expect(ui().projectOpening).toBeNull();
    expect(ui().showLoadModal).toBe(true);
    expect(document.body.textContent).not.toContain('Could not open project');
  });

  it('reports a file that fails before it is read on the dialog card', async () => {
    window.showOpenFilePicker = () => {};
    vi.mocked(openProjectFile).mockRejectedValue(new Error('The file could not be read.'));
    mount();
    await openDialog();

    await act(async () => {
      await latest.actions.project.openProjectFile();
    });

    expect(ui().projectOpenError).toBe('The file could not be read.');
    expect(ui().projectOpening).toBeNull();
  });

  it('leaves everything as it was when the file picker is dismissed', async () => {
    window.showOpenFilePicker = () => {};
    vi.mocked(openProjectFile).mockRejectedValue(new DOMException('dismissed', 'AbortError'));
    mount();
    await openDialog();

    await act(async () => {
      await latest.actions.project.openProjectFile();
    });

    expect(ui().projectOpenError).toBeNull();
    expect(ui().projectOpening).toBeNull();
    expect(ui().showLoadModal).toBe(true);
    expect(latest.state.project.id).toBe(initialProject.id);
  });

  it('abandons a draft still loading when the dialog is closed, keeping what the user did since', async () => {
    const read = deferred();
    vi.mocked(loadProject).mockReturnValue(read.promise);
    mount();
    await openDialog();

    act(() => {
      latest.actions.project.loadDraft('draft_1');
    });
    await settle();
    closeDialog();

    expect(ui().showLoadModal).toBe(false);
    expect(ui().projectOpening).toBeNull();

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Kept' }));
    read.resolve(loadedResult('Late draft'));
    await settle();

    expect(latest.state.project.id).toBe(initialProject.id);
    expect(latest.state.project.name).toBe('Kept');
    expect(latest.state.isDirty).toBe(true);
    expect(ui().projectOpening).toBeNull();
  });

  it('says nothing about a draft that fails after the dialog was closed', async () => {
    const read = deferred();
    vi.mocked(loadProject).mockReturnValue(read.promise);
    mount();
    await openDialog();

    act(() => {
      latest.actions.project.loadDraft('draft_1');
    });
    await settle();
    closeDialog();

    read.reject(new Error('Project not found'));
    await settle();

    expect(document.body.textContent).not.toContain('Could not open project');
    expect(ui().projectOpenError).toBeNull();
    expect(ui().projectOpening).toBeNull();
  });

  it('abandons a file being read when the dialog is closed, and does not adopt its handle', async () => {
    window.showOpenFilePicker = () => {};
    const read = deferred();
    vi.mocked(openProjectFile).mockImplementation(async ({ onProgress }) => {
      onProgress({ stage: 'reading', name: 'plan.json' });
      return read.promise;
    });
    mount();
    await openDialog();

    act(() => {
      latest.actions.project.openProjectFile();
    });
    await act(async () => {});
    expect(ui().projectOpening).toEqual({ stage: 'reading', name: 'plan.json' });

    closeDialog();
    expect(ui().projectOpening).toBeNull();

    read.resolve({ ...loadedResult('Late file'), fileHandle: { name: 'plan.json' } });
    await settle();

    expect(latest.state.project.id).toBe(initialProject.id);
    expect(ui().projectFileHandle).toBeNull();
    expect(ui().projectOpening).toBeNull();
  });

  it('does not bring back the progress of an import that was abandoned', async () => {
    const read = deferred();
    const unpack = deferred();
    vi.mocked(importProjectFile).mockImplementation(async (file, { onProgress }) => {
      onProgress({ stage: 'reading', name: file.name });
      await read.promise;
      onProgress({ stage: 'unpacking', name: file.name });
      await unpack.promise;
      return loadedResult('Late archive');
    });
    mount();
    await openDialog();

    const file = new File(['zip'], 'shared.apz');
    act(() => {
      latest.actions.project.importProjectFile({ target: { files: [file], value: 'shared.apz' } });
    });
    await settle();
    expect(ui().projectOpening).toEqual({ stage: 'reading', name: 'shared.apz' });

    closeDialog();
    read.resolve();
    await act(async () => {});
    expect(ui().projectOpening).toBeNull();

    unpack.resolve();
    await settle();
    expect(latest.state.project.id).toBe(initialProject.id);
    expect(ui().projectOpening).toBeNull();
  });

  it('lands the load started after an abandoned one, whichever finishes last', async () => {
    const first = deferred();
    const second = loadedResult('Second draft');
    vi.mocked(loadProject).mockReturnValueOnce(first.promise).mockResolvedValueOnce(second);
    mount();

    await openDialog();
    act(() => {
      latest.actions.project.loadDraft('draft_1');
    });
    await settle();
    closeDialog();

    await openDialog();
    act(() => {
      latest.actions.project.loadDraft('draft_2');
    });
    await settle();
    expect(latest.state.project.id).toBe(second.project.id);

    first.resolve(loadedResult('First draft'));
    await settle();
    expect(latest.state.project.id).toBe(second.project.id);
    expect(ui().projectOpening).toBeNull();
  });
});
