// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { loadProject, saveProject } from '@/persistence/storage';
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
  vi.mocked(loadProject).mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  latest = null;
  vi.useRealTimers();
});

describe('useFloorplan persistence failures', () => {
  it('tells the user when an autosave fails, and leaves the project dirty', async () => {
    vi.useFakeTimers();
    vi.mocked(saveProject).mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();

    act(() => latest.dispatch({ type: 'PROJECT_SET_NAME', name: 'Renamed' }));
    expect(latest.state.isDirty).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(latest.state.editor.statusMessage).toMatch(/Autosave failed: browser storage is full/);
    expect(latest.state.isDirty).toBe(true);
  });

  it('tells the user when a browser draft cannot be opened', async () => {
    vi.mocked(loadProject).mockRejectedValue(new Error('Project not found'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();

    let loading = null;
    await act(async () => {
      loading = latest.actions.project.loadDraft('missing');
      // The read waits a paint before it starts (afterPaint's fallback timer).
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(document.body.textContent).toContain('Could not open project');
    expect(document.body.textContent).toContain('Project not found');
    expect(latest.selectors.workspaceUi.projectOpening).toBeNull();

    // The alert is acknowledge-only; OK settles the load call.
    const ok = [...document.querySelectorAll('button')].find((button) => button.textContent === 'OK');
    await act(async () => {
      ok.click();
      await loading;
    });
    expect(document.body.textContent).not.toContain('Could not open project');
  });
});
