/* @vitest-environment jsdom */
/**
 * Opening an assembly editor answers the click before it does any of the work
 * (docs/loading-states.md §5.4, §6.1). These pin the order for both editors:
 * with `mountShellFirst` the editor's frame — header, panels, both panes as
 * placeholders — is committed before the assembly is derived at all, and the
 * real editor replaces it once that frame has painted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createFloor, createWall } from '@/domain/models';
import { createCeiling } from '@/domain/ceilingModels';
import { createWallDetailing } from '@/domain/wallDetailing';
import CeilingDetailEditor from '../ceiling-detail/CeilingDetailEditor';
import WallDetailEditor from './WallDetailEditor';

const mocks = vi.hoisted(() => ({
  project: null,
  dispatch: vi.fn(),
  editorDispatch: vi.fn(),
  editor: null,
  derives: { ceiling: 0, wall: 0 },
}));

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useProject: () => ({ project: mocks.project, dispatch: mocks.dispatch }),
  useEditor: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
  useEditorState: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
}));

// Counted, not replaced: the editors must still get the real derivation.
vi.mock('@/domain/ceilingModels', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    deriveCeilingDetail: (...args) => {
      mocks.derives.ceiling += 1;
      return actual.deriveCeilingDetail(...args);
    },
  };
});
vi.mock('@/domain/wallDetailing', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    deriveWallDetail: (...args) => {
      mocks.derives.wall += 1;
      return actual.deriveWallDetail(...args);
    },
  };
});

vi.mock('@/features/floorplan/components/preview/ThreePreviewPanel', () => ({ default: () => null }));

const BOUNDARY = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
  });
  mocks.derives.ceiling = 0;
  mocks.derives.wall = 0;
  mocks.editorDispatch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Two animation frames — what `afterPaint` waits for — and the transition after them. */
async function paint() {
  await act(async () => {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('assembly editors mount shell-first', () => {
  it('paints the ceiling editor frame before deriving the ceiling', async () => {
    const floor = createFloor('Ground', 0);
    const ceiling = createCeiling('Living room', { floorId: floor.id, boundaryPolygon: BOUNDARY, baseElevation: 2700 });
    mocks.project = { id: 'project', floors: [floor], ceilings: [ceiling], trussSystems: [] };
    mocks.editor = { ceilingDetailEditor: { ceilingId: ceiling.id } };

    const { container, getByText } = render(<CeilingDetailEditor mountShellFirst />);

    const shell = container.querySelector('[data-editor-phase="opening"]');
    expect(shell).toBeTruthy();
    expect(shell.getAttribute('aria-busy')).toBe('true');
    expect(getByText('Living room')).toBeTruthy();
    // The real panel titles over skeleton bodies, and both panes as placeholders.
    expect(getByText('Face and boards')).toBeTruthy();
    expect(container.querySelector('[data-skeleton]')).toBeTruthy();
    expect(container.querySelector('[data-editor-canvas="opening"]')).toBeTruthy();
    expect(container.querySelector('[data-preview-pane="ceiling"]').getAttribute('data-loading-state')).toBe('loading');
    // The outline is drawn from the boundary already in memory.
    expect(container.querySelector('[data-editor-canvas="opening"] svg path')).toBeTruthy();
    expect(mocks.derives.ceiling).toBe(0);
    // Close works from the frame.
    fireEvent.click(getByText('Close'));
    expect(mocks.editorDispatch).toHaveBeenCalledWith({ type: 'CLOSE_CEILING_DETAIL_EDITOR' });

    await paint();

    expect(container.querySelector('[data-editor-phase="opening"]')).toBeNull();
    expect(container.querySelector('svg[data-tool]')).toBeTruthy();
    expect(mocks.derives.ceiling).toBeGreaterThan(0);
  });

  it('paints the wall editor frame before deriving the wall, with its openings in the outline', async () => {
    const floor = createFloor('Ground', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
    });
    wall.assembly.detailing = createWallDetailing({ enabled: true, sides: { interior: { enabled: true } } });
    floor.walls = [wall];
    floor.doors = [{ id: 'door_1', wallId: wall.id, offset: 1000, width: 900, height: 2100, sillHeight: 0 }];
    mocks.project = { id: 'project', floors: [floor] };
    mocks.editor = { wallDetailEditor: { floorId: floor.id, wallId: wall.id } };

    const { container, getByText } = render(<WallDetailEditor mountShellFirst />);

    expect(container.querySelector('[data-editor-phase="opening"]')).toBeTruthy();
    expect(getByText('Wall-local assembly editor')).toBeTruthy();
    expect(container.querySelector('[data-preview-pane="wall"]')).toBeTruthy();
    // The elevation rectangle and the door cut out of it: two closed runs.
    const outline = container.querySelector('[data-editor-canvas="opening"] svg path').getAttribute('d');
    expect(outline.match(/Z/g)).toHaveLength(2);
    expect(mocks.derives.wall).toBe(0);

    await paint();

    expect(container.querySelector('[data-editor-phase="opening"]')).toBeNull();
    expect(container.querySelector('svg[data-tool]')).toBeTruthy();
    expect(mocks.derives.wall).toBeGreaterThan(0);
  });

  it('renders in one pass without the flag, as the existing editors always did', () => {
    const floor = createFloor('Ground', 0);
    const ceiling = createCeiling('Hall', { floorId: floor.id, boundaryPolygon: BOUNDARY, baseElevation: 2700 });
    mocks.project = { id: 'project', floors: [floor], ceilings: [ceiling], trussSystems: [] };
    mocks.editor = { ceilingDetailEditor: { ceilingId: ceiling.id } };

    const { container } = render(<CeilingDetailEditor />);

    expect(container.querySelector('[data-editor-phase="opening"]')).toBeNull();
    expect(container.querySelector('svg[data-tool]')).toBeTruthy();
  });
});
