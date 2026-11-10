/* @vitest-environment jsdom */
/**
 * The document status the top bar, the status bar and the 3D workshop read.
 * Two moves used to be wrong: a save error stayed on the badge after the
 * status had moved on (and its toast could not be dismissed), and closing the
 * save picker forgot that the sketch had just been opened, recovered or
 * saved. The rest pin the moves that were right, through the real hook.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useSketchStudio from './useSketchStudio';
import SketchStudioLayout from '../components/SketchStudioLayout';
import sampleDocument from '../data/sampleDocument';
import { ConfirmDialogProvider } from '../../../ui/ConfirmDialog';
import { saveSketchRecovery } from '../../../shared/sketchAssetStorage';
import { buildSketchWorkspaceSnapshot } from '../utils/workspaceSerializationUtils';
import { openSketchWorkspaceFile, saveSketchWorkspaceFile } from '../utils/sketchWorkspaceFileUtils';

vi.mock('../utils/sketchWorkspaceFileUtils', async (importOriginal) => ({
  ...(await importOriginal()),
  openSketchWorkspaceFile: vi.fn(),
  saveSketchWorkspaceFile: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(openSketchWorkspaceFile).mockReset();
  vi.mocked(saveSketchWorkspaceFile).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const LINE = { id: 'line-a', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layerId: 'default', visible: true, meta: {} };

function workspace(name = 'Bench') {
  return buildSketchWorkspaceSnapshot({
    document: { ...sampleDocument, name, entities: [LINE] },
    ui: { activeLayerId: 'default', workspaceMode: 'draft' },
  });
}

function pickerClosed() {
  return Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
}

/** The real hook; `withLine` loads a one-line sketch first, which leaves the status idle. */
function mountStudio({ withLine = true } = {}) {
  const view = renderHook(() => useSketchStudio(), { wrapper: ConfirmDialogProvider });
  if (withLine) act(() => view.result.current.loadTemplate({ document: { ...sampleDocument, entities: [LINE] } }));
  const studio = () => view.result.current;
  const persistence = () => studio().documentPersistence;
  const save = () => act(() => studio().saveSketch());
  const edit = () => act(() => void studio().duplicateEntities(['line-a']));
  return { studio, persistence, save, edit };
}

async function mountOpened() {
  const env = mountStudio();
  vi.mocked(openSketchWorkspaceFile).mockResolvedValue({
    workspace: workspace(),
    fileHandle: { name: 'bench.sketch.json' },
    fileName: 'bench.sketch.json',
  });
  await act(() => env.studio().openSketch());
  expect(env.persistence()).toMatchObject({ status: 'opened', isDirty: false, error: null });
  return env;
}

describe('a save error', () => {
  it('clears when the status next changes', async () => {
    const env = await mountOpened();
    vi.mocked(saveSketchWorkspaceFile).mockRejectedValue(new Error('Disk full'));
    await env.save();
    expect(env.persistence()).toMatchObject({ status: 'error', error: 'Disk full', isDirty: false });

    env.edit();

    expect(env.persistence()).toMatchObject({ status: 'dirty', error: null, isDirty: true });
  });

  it('clears when its toast is dismissed', async () => {
    vi.useFakeTimers();
    function Studio() {
      return <SketchStudioLayout {...useSketchStudio()} />;
    }
    render(
      <MemoryRouter>
        <ConfirmDialogProvider>
          <Studio />
        </ConfirmDialogProvider>
      </MemoryRouter>,
    );
    vi.mocked(saveSketchWorkspaceFile).mockRejectedValue(new Error('Disk full'));

    await act(async () => {
      screen.getByRole('button', { name: 'Save Sketch' }).click();
    });
    expect(screen.getByText('Disk full')).toBeTruthy();
    expect(screen.getByText('Save Error')).toBeTruthy();

    // The toast dismisses itself after four seconds.
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Disk full')).toBeNull();
    expect(screen.queryByText('Save Error')).toBeNull();
  });
});

describe('closing the save picker', () => {
  it('goes back to opened', async () => {
    const env = await mountOpened();
    vi.mocked(saveSketchWorkspaceFile).mockRejectedValue(pickerClosed());
    await env.save();
    expect(env.persistence()).toMatchObject({ status: 'opened', error: null, fileName: 'bench.sketch.json' });
  });

  it('goes back to recovered', async () => {
    saveSketchRecovery(workspace('Recovered bench'));
    const env = mountStudio({ withLine: false });
    expect(env.persistence()).toMatchObject({ status: 'recovered', isDirty: false });

    vi.mocked(saveSketchWorkspaceFile).mockRejectedValue(pickerClosed());
    await env.save();

    expect(env.persistence()).toMatchObject({ status: 'recovered', error: null });
  });

  it('goes back to saved', async () => {
    const env = mountStudio();
    vi.mocked(saveSketchWorkspaceFile).mockResolvedValueOnce({
      savedAt: '2026-11-09T10:00:00.000Z',
      fileHandle: { name: 'bench.sketch.json' },
      fileName: 'bench.sketch.json',
    });
    await env.save();
    expect(env.persistence()).toMatchObject({ status: 'saved', isDirty: false });

    vi.mocked(saveSketchWorkspaceFile).mockRejectedValueOnce(pickerClosed());
    await act(() => env.studio().saveSketchAs());

    expect(env.persistence()).toMatchObject({ status: 'saved', error: null, fileName: 'bench.sketch.json' });
  });

  it('stays dirty with unsaved changes, as before', async () => {
    const env = await mountOpened();
    env.edit();
    vi.mocked(saveSketchWorkspaceFile).mockRejectedValue(pickerClosed());
    await env.save();
    expect(env.persistence()).toMatchObject({ status: 'dirty', isDirty: true, error: null });
  });
});

describe('the moves that were already right', () => {
  it('starts idle and clean', () => {
    const env = mountStudio({ withLine: false });
    expect(env.persistence()).toMatchObject({ status: 'idle', error: null, isDirty: false, fileName: null });
    expect(env.studio().status.documentStatus).toBe('idle');
  });

  it('goes dirty on an edit and back to idle when the edit is undone', () => {
    const env = mountStudio();
    env.edit();
    expect(env.persistence()).toMatchObject({ status: 'dirty', isDirty: true });
    expect(env.studio().status.documentStatus).toBe('dirty');
    act(() => env.studio().undo());
    expect(env.persistence()).toMatchObject({ status: 'idle', isDirty: false });
  });

  it('shows saving while the file is written, then saved', async () => {
    const env = await mountOpened();
    env.edit();
    let finish;
    vi.mocked(saveSketchWorkspaceFile).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let pending;
    act(() => {
      pending = env.studio().saveSketch();
    });
    expect(env.persistence()).toMatchObject({ status: 'saving', error: null });

    await act(async () => {
      finish({ savedAt: 't1', fileHandle: { name: 'bench.sketch.json' }, fileName: 'bench.sketch.json' });
      await pending;
    });

    expect(env.persistence()).toMatchObject({
      status: 'saved',
      error: null,
      isDirty: false,
      savedAt: 't1',
      fileName: 'bench.sketch.json',
      savedDocumentName: 'Bench',
    });
  });

  it('reports a failed open as an error and New as idle', async () => {
    const env = mountStudio();
    vi.mocked(openSketchWorkspaceFile).mockRejectedValue(new Error('Not a sketch file'));
    await act(() => env.studio().openSketch());
    expect(env.persistence()).toMatchObject({ status: 'error', error: 'Not a sketch file' });

    await act(() => env.studio().newSketch());
    expect(env.persistence()).toMatchObject({ status: 'idle', error: null, fileName: null, savedAt: null });
  });

  it('ignores a closed open picker', async () => {
    const env = await mountOpened();
    vi.mocked(openSketchWorkspaceFile).mockRejectedValue(pickerClosed());
    await act(() => env.studio().openSketch());
    expect(env.persistence()).toMatchObject({ status: 'opened', error: null });
  });

  it('keeps the shape consumers read', () => {
    const env = mountStudio();
    expect(Object.keys(env.persistence()).sort()).toEqual(
      [
        'savedAt',
        'fileName',
        'savedDocumentName',
        'status',
        'error',
        'reading',
        'isDirty',
        'hasFileHandle',
        'desiredFileName',
        'renamePending',
      ].sort(),
    );
  });
});
