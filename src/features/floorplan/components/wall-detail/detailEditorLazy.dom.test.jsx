/* @vitest-environment jsdom */
/**
 * The workspace loads each assembly editor's code on demand, behind the shell
 * the editor paints first. These pin that the shell still answers the click at
 * once, that the editor follows, that a prefetched editor opens without
 * suspending, and that a failed load is a retryable error inside the editor's
 * own overlay rather than a broken workspace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Suspense, useState } from 'react';
import { createFloor, createWall } from '@/domain/models';
import { createEditorChunk, DetailEditorLoadBoundary } from './detailEditorChunk';
import { createCeiling } from '@/domain/ceilingModels';
import CeilingDetailEditorLazy from '../ceiling-detail/CeilingDetailEditorLazy';
import WallDetailEditorLazy from './WallDetailEditorLazy';

const mocks = vi.hoisted(() => ({ project: null, editor: null, editorDispatch: vi.fn() }));

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useProject: () => ({ project: mocks.project, dispatch: vi.fn() }),
  useEditorState: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
}));

// The editor's own code: a stand-in that says it arrived.
vi.mock('./WallDetailEditor', () => ({
  WallDetailEditorBody: ({ openedAt }) => <div data-testid="wall-editor-body" data-opened={String(openedAt)} />,
}));

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
  });
  mocks.editorDispatch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function paint() {
  await act(async () => {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('wall editor loaded on demand', () => {
  it('paints the shell at once and the editor once its code is here', async () => {
    const floor = createFloor('Ground', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
    floor.walls = [wall];
    mocks.project = { id: 'project', floors: [floor] };
    mocks.editor = { wallDetailEditor: { floorId: floor.id, wallId: wall.id } };

    const view = render(<WallDetailEditorLazy />);
    expect(view.container.querySelector('[data-editor-phase="opening"]')).toBeTruthy();
    expect(view.getByText('Wall-local assembly editor')).toBeTruthy();
    expect(view.queryByTestId('wall-editor-body')).toBeNull();
    fireEvent.click(view.getByText('Close'));
    expect(mocks.editorDispatch).toHaveBeenCalledWith({ type: 'CLOSE_WALL_DETAIL_EDITOR' });

    await paint();
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(view.getByTestId('wall-editor-body')).toBeTruthy();
    expect(view.container.querySelector('[data-editor-phase="opening"]')).toBeNull();
  });
});

vi.mock('../ceiling-detail/CeilingDetailEditor', () => ({
  CeilingDetailEditorBody: ({ ceilingDetailEditor }) => (
    <div data-testid="ceiling-editor-body" data-ceiling={ceilingDetailEditor.ceilingId} />
  ),
}));

describe('ceiling editor loaded on demand', () => {
  it('paints the shell at once and the editor once its code is here', async () => {
    const floor = createFloor('Ground', 0);
    const ceiling = createCeiling('Hall', {
      floorId: floor.id,
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
      ],
      baseElevation: 2700,
    });
    mocks.project = { id: 'project', floors: [floor], ceilings: [ceiling], trussSystems: [] };
    mocks.editor = { ceilingDetailEditor: { ceilingId: ceiling.id } };

    const view = render(<CeilingDetailEditorLazy />);
    expect(view.container.querySelector('[data-editor-phase="opening"]')).toBeTruthy();
    expect(view.getByText('Hall')).toBeTruthy();

    await paint();
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(view.getByTestId('ceiling-editor-body').getAttribute('data-ceiling')).toBe(ceiling.id);
  });
});

describe('editor chunks', () => {
  it('hands out the real component once the code has arrived, so a prefetched editor never suspends', async () => {
    const Editor = () => <p>editor</p>;
    const chunk = createEditorChunk(() => Promise.resolve({ Editor }));
    const before = chunk.component((module) => module.Editor);
    expect(before).not.toBe(Editor);
    expect(before.$$typeof).toBe(Symbol.for('react.lazy'));

    await chunk.prefetch();
    expect(chunk.component((module) => module.Editor)).toBe(Editor);
  });

  it('swallows a failed prefetch', async () => {
    const chunk = createEditorChunk(() => Promise.reject(new Error('offline')));
    await expect(chunk.prefetch()).resolves.toBeUndefined();
    expect(chunk.loaded()).toBeNull();
  });

  it('shows a failed load as the error screen with a retry and a way out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempts = 0;
    const chunk = createEditorChunk(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('Failed to fetch dynamically imported module'))
        : Promise.resolve({ Editor: () => <p>editor arrived</p> });
    });
    const onClose = vi.fn();

    function Host() {
      const [Body, setBody] = useState(() => chunk.component((module) => module.Editor));
      return (
        <DetailEditorLoadBoundary
          dialogLabel="Wall assembly detail editor"
          closeTitle="Close"
          onClose={onClose}
          onRetry={() => setBody(() => chunk.component((module) => module.Editor))}
        >
          <Suspense fallback={<p>shell</p>}>
            <Body />
          </Suspense>
        </DetailEditorLoadBoundary>
      );
    }

    vi.useRealTimers();
    const view = render(<Host />);
    expect(view.getByText('shell')).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.container.querySelector('[data-editor-phase="failed"]')).toBeTruthy();
    expect(view.getByText(/Failed to fetch dynamically imported module/)).toBeTruthy();
    fireEvent.click(view.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(view.getByText('Try Again'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.getByText('editor arrived')).toBeTruthy();
    expect(attempts).toBe(2);
  });
});
