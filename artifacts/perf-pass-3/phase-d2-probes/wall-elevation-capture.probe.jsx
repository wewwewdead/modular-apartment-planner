/* @vitest-environment jsdom */
// TEMPORARY (perf pass 3, D2.4): before/after capture of the elevation markup.
import { afterEach, beforeEach, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync, writeFileSync } from 'node:fs';
import { createFloor, createWall } from '@/domain/models';
import { createWallDetailing, createWallDimension } from '@/domain/wallDetailing';
import WallDetailEditor from './WallDetailEditor';

const mocks = vi.hoisted(() => ({ project: null, dispatch: vi.fn(), editorDispatch: vi.fn(), editor: null }));
vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useProject: () => ({ project: mocks.project, dispatch: mocks.dispatch }),
  useEditor: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
  useEditorState: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
}));
vi.mock('@/features/floorplan/components/preview/ThreePreviewPanel', () => ({ default: () => null }));
const CANVAS_RECT = { left: 0, top: 0, width: 900, height: 810, right: 900, bottom: 810, x: 0, y: 0 };
const ORANGE = {
  kind: 'paint',
  colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
  sheen: 'matte',
};

function setup(variant) {
  const floor = createFloor('Ground', 0);
  const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
    assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
  });
  wall.id = 'wall_fixed';
  wall.assembly.detailing = createWallDetailing({
    enabled: true,
    sides: {
      interior: {
        enabled: true,
        dimensions: {
          manual: [
            {
              ...createWallDimension({ mode: 'horizontal', start: { u: 200, v: 1000 }, end: { u: 1200, v: 1000 } }),
              id: 'dim1',
            },
          ],
        },
      },
    },
  });
  if (variant === 'siding') {
    wall.assembly = {
      ...wall.assembly,
      interior: {
        material: 'siding',
        thickness: 19,
        layerCount: 1,
        accents: [{ id: 'acc1', label: 'A', u: 400, v: 300, width: 600, height: 900, finish: ORANGE, anchor: null }],
      },
    };
  }
  floor.id = 'floor_fixed';
  floor.walls = [wall];
  mocks.project = { id: 'project', floors: [floor] };
  mocks.editor = { wallDetailEditor: { floorId: floor.id, wallId: wall.id } };
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(CANVAS_RECT);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const svgHtml = (container) =>
  container.querySelector('svg[data-tool]').outerHTML.replace(/wall-(siding|accent)-clip-[a-zA-Z0-9]+/g, 'clip');

it('captures', () => {
  const out = {};
  for (const variant of ['plain', 'siding']) {
    setup(variant);
    const view = render(<WallDetailEditor />);
    const { container } = view;
    out[`${variant}:initial`] = svgHtml(container);
    const board = Array.from(container.querySelectorAll('title')).find((n) =>
      n.textContent.startsWith('P'),
    )?.parentElement;
    if (board) {
      fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
      fireEvent.pointerUp(board, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    }
    out[`${variant}:board-selected`] = svgHtml(container);
    const stud = Array.from(container.querySelectorAll('title')).find((n) =>
      n.textContent.startsWith('Stud'),
    )?.parentElement;
    if (stud) {
      fireEvent.pointerDown(stud, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
      fireEvent.pointerMove(stud, { button: 0, pointerId: 1, clientX: 380, clientY: 300 });
      out[`${variant}:stud-dragging`] = svgHtml(container);
      fireEvent.pointerUp(stud, { button: 0, pointerId: 1, clientX: 380, clientY: 300 });
    }
    // Measure tool hovering.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    });
    fireEvent.pointerMove(container.querySelector('svg[data-tool]'), {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 200,
    });
    out[`${variant}:measure-hover`] = svgHtml(container);
    view.unmount();
  }
  const file = process.env.D2_WALL_FILE;
  if (process.env.D2_CAPTURE_MODE === 'write') {
    writeFileSync(file, JSON.stringify(out));
    console.log('wrote', Object.keys(out));
    return;
  }
  const before = JSON.parse(readFileSync(file, 'utf8'));
  let diffs = 0;
  for (const key of Object.keys(before)) {
    if (before[key] !== out[key]) {
      diffs += 1;
      const a = before[key];
      const b = out[key] || '';
      let i = 0;
      while (i < a.length && a[i] === b[i]) i += 1;
      console.log(
        'DIFF',
        key,
        i,
        '\nold:',
        a.slice(Math.max(0, i - 300), i + 200),
        '\nnew:',
        b.slice(Math.max(0, i - 300), i + 200),
      );
    }
  }
  console.log('compared', Object.keys(before).length, 'diffs', diffs);
  if (diffs) throw new Error('markup changed');
});
