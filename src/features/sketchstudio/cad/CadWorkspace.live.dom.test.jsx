// @vitest-environment jsdom
// Phase L (docs/sketch-studio-live-fields.md): Properties fields apply as you
// type, in the tree editor (one undo step per edit session, the studio's real
// reducer) and in the operation panel (drafts). Kernel hook and viewport are
// stand-ins, as in CadWorkspace.place.dom.test.jsx.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle, useLayoutEffect, useReducer } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel } from './model.js';
import { LIVE_DEBOUNCE_MS } from './liveField.js';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import sketchStudioReducer from '../store/sketchStudioReducer';
import { undo } from '../store/sketchStudioActions';

const viewport = vi.hoisted(() => ({ props: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'current',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({
        id: p.id,
        features: {},
        bounds: [
          [0, 0, 0],
          [600, 400, 18],
        ],
      })),
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [0, 0, 0],
          [600, 400, 18],
        ],
        placement: [],
      })),
    },
    request: vi.fn(async () => []),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      getInstanceBounds: () => [
        [0, 0, 0],
        [600, 400, 18],
      ],
      isDragging: () => false,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      getSceneSpan: () => 1000,
      viewDropPoint: () => [0, 0, 0],
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ROW = { count: 4, pitch: 50, direction: [1, 0, 0] };
function boardWithRow() {
  const board = createPart('board');
  return {
    ...emptyModel(),
    parts: [
      {
        ...board.part,
        id: 'board',
        features: [
          ...board.part.features,
          {
            id: 'hole1',
            type: 'hole',
            diameter: 6,
            depth: 5,
            throughAll: true,
            position: [100, 100, 18],
            direction: [0, 0, -1],
            row: ROW,
          },
        ],
      },
    ],
    instances: [{ id: 'b1', partId: 'board', name: '', position: [0, 0, 0], rotation: [0, 0, 0] }],
  };
}

// The workspace on the studio's reducer: SET_CAD_MODEL with its meta, Undo.
function setup(model = boardWithRow(), { select = true } = {}) {
  const probe = { state: null, metas: [] };
  function Studio() {
    const [state, dispatch] = useReducer(sketchStudioReducer, null, () => ({
      ...sketchStudioInitialState,
      document: { ...sketchStudioInitialState.document, model },
      history: { past: [], future: [] },
    }));
    useLayoutEffect(() => {
      probe.state = state;
    });
    return (
      <MemoryRouter>
        <CadWorkspace
          document={{ id: 'doc', name: 'Test', entities: [], model: state.document.model }}
          setCadModel={(next, meta) => {
            probe.metas.push(meta);
            dispatch({ type: 'SET_CAD_MODEL', payload: next, meta });
          }}
          undo={() => dispatch(undo())}
          canUndo={state.history.past.length > 0}
          documentPersistence={{}}
        />
      </MemoryRouter>
    );
  }
  render(<Studio />);
  if (select) act(() => viewport.props.onSelect('b1'));
  return {
    probe,
    hole: () => probe.state.document.model.parts[0].features.find((f) => f.id === 'hole1'),
    past: () => probe.state.history.past.length,
  };
}
const type = (input, text) =>
  act(() => fireEvent.change(input, { target: { value: text, selectionStart: text.length } }));
const settle = () => act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS));
// A block body: onPlace returns perform's promise, which would make act async.
const place = (info) =>
  act(() => {
    viewport.props.onPlace(info);
  });
const rowBlock = () => within(screen.getByRole('group', { name: 'Row of holes' }));

it('tree editor: typing 1, 5, 0 into Spacing rebuilds live, keeps focus and caret, and is one Undo', () => {
  const { probe, hole, past } = setup();
  const spacing = rowBlock().getByLabelText('Spacing (mm)');
  act(() => spacing.focus());
  for (const text of ['1', '15', '150']) {
    type(spacing, text);
    settle();
    expect(hole().row.pitch).toBe(Number(text));
    expect(past()).toBe(1);
  }
  expect(probe.metas.map((m) => m.skipHistory)).toEqual([false, true, true]);
  // The same input, still focused, caret where the typing left it.
  expect(rowBlock().getByLabelText('Spacing (mm)')).toBe(spacing);
  expect(document.activeElement).toBe(spacing);
  expect(spacing.selectionStart).toBe(3);
  // The engraved row length follows.
  expect(rowBlock().getByLabelText('Row length (mm)').value).toBe('450');
  // Enter: the text equals the value, nothing more is committed.
  act(() => fireEvent.keyDown(spacing, { key: 'Enter' }));
  expect(probe.metas).toHaveLength(3);
  expect(past()).toBe(1);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(hole().row.pitch).toBe(50);
  expect(rowBlock().getByLabelText('Spacing (mm)').value).toBe('50');
});

it('tree editor: Holes in row 1 keeps the row while typing; the commit removes it; 150 waits and then errors', () => {
  const { hole, past } = setup();
  const count = rowBlock().getByLabelText('Holes in row');
  act(() => count.focus());
  type(count, '1');
  settle();
  expect(hole().row).toEqual(ROW);
  expect(past()).toBe(0);
  type(count, '12');
  settle();
  expect(hole().row.count).toBe(12);
  type(count, '150');
  settle();
  expect(hole().row.count).toBe(12);
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => count.blur());
  expect(screen.getByRole('alert').textContent).toBe('Holes in a row must be a whole number from 1 to 100.');
  expect(hole().row.count).toBe(12);
  expect(past()).toBe(1);
  // Typing 1 and committing removes the row (a second edit session: a second entry).
  act(() => count.focus());
  type(count, '1');
  settle();
  expect(hole().row).toBeDefined();
  act(() => count.blur());
  expect(hole().row).toBeUndefined();
  expect(past()).toBe(2);
});

it('tree editor: Esc after live edits restores the value and leaves no history entry', () => {
  const { hole, past } = setup();
  const spacing = rowBlock().getByLabelText('Spacing (mm)');
  act(() => spacing.focus());
  type(spacing, '70');
  settle();
  expect(hole().row.pitch).toBe(70);
  expect(past()).toBe(1);
  act(() => fireEvent.keyDown(spacing, { key: 'Escape' }));
  expect(hole().row.pitch).toBe(50);
  expect(past()).toBe(0);
  expect(rowBlock().getByLabelText('Spacing (mm)').value).toBe('50');
  expect(document.activeElement).not.toBe(spacing);
});

it('tree editor: two fields edited in a row are two undo steps; a button between sessions is its own', () => {
  const { hole, past } = setup();
  const spacing = rowBlock().getByLabelText('Spacing (mm)');
  act(() => spacing.focus());
  type(spacing, '60');
  settle();
  act(() => spacing.blur());
  const diameter = screen.getByLabelText('Diameter (mm)');
  act(() => diameter.focus());
  type(diameter, '8');
  settle();
  act(() => diameter.blur());
  expect(past()).toBe(2);
  // Flip direction (a button) commits without a session: a new entry.
  act(() => fireEvent.click(rowBlock().getByRole('button', { name: 'Flip direction' })));
  expect(past()).toBe(3);
  expect(hole().row.pitch).toBe(60);
  expect(hole().diameter).toBe(8);
  // Spacing again: a new session, a new entry, though it is the same field.
  act(() => spacing.focus());
  type(spacing, '65');
  settle();
  expect(past()).toBe(4);
});

it('tree editor: instance Position applies as you type through VectorFields', () => {
  const { probe, past } = setup();
  const x = screen.getByRole('group', { name: 'Position (mm)' }).querySelector('input');
  act(() => x.focus());
  type(x, '12');
  settle();
  type(x, '125');
  settle();
  expect(probe.state.document.model.instances[0].position).toEqual([125, 0, 0]);
  // One Part name field (its key must not collide with the Material select's).
  expect(screen.getAllByLabelText('Part name')).toHaveLength(1);
  expect(past()).toBe(1);
  expect(document.activeElement).toBe(x);
});

it('operation panel: typing 6 into Holes in row sets the count without Enter, in the direction stage and in Shape', () => {
  const { probe } = setup(
    {
      ...emptyModel(),
      parts: [{ ...createPart('board').part, id: 'board' }],
      instances: [{ id: 'b1', partId: 'board', name: '', position: [0, 0, 0], rotation: [0, 0, 0] }],
    },
    { select: false },
  );
  act(() => fireEvent.click(within(document.querySelector('.cad-ribbon')).getByRole('button', { name: 'Hole row' })));
  place({
    kind: 'face',
    planar: true,
    instanceId: 'b1',
    partId: 'board',
    point: [100, 100, 18],
    normal: [0, 0, 1],
    faceFrame: { origin: [0, 0, 18], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] },
    outline: [
      [
        [0, 0],
        [600, 0],
      ],
      [
        [600, 0],
        [600, 400],
      ],
    ],
  });
  const count = screen.getByLabelText('Holes in row');
  act(() => count.focus());
  type(count, '6');
  settle();
  expect(viewport.props.placement.row).toMatchObject({ seed: true, count: 6 });
  expect(document.activeElement).toBe(count);
  act(() => count.blur());
  place({ kind: 'path', point: [350, 100, 18], snapKind: 'grid', step: 1, free: false });
  expect(viewport.props.placement.stage).toBe('shape');
  expect(screen.getByText(/^Row of 6 holes .* pitch 50 mm · 250 mm/)).toBeTruthy();
  const shapeCount = screen.getByLabelText('Holes in row');
  act(() => shapeCount.focus());
  type(shapeCount, '3');
  settle();
  expect(screen.getByText(/^Row of 3 holes .* pitch 50 mm · 100 mm/)).toBeTruthy();
  expect(document.activeElement).toBe(shapeCount);
  // Below the minimum (2) while typing: ignored silently.
  type(shapeCount, '1');
  settle();
  expect(screen.getByText(/^Row of 3 holes/)).toBeTruthy();
  expect(screen.queryByText(/Holes in a row must be/)).toBeNull();
  type(shapeCount, '3');
  // Spacing in Shape, live.
  const spacing = screen.getByLabelText('Spacing (mm)');
  act(() => spacing.focus());
  type(spacing, '40');
  settle();
  expect(screen.getByText(/^Row of 3 holes .* pitch 40 mm · 80 mm/)).toBeTruthy();
  // Drafts have no history: nothing reached the saved model.
  expect(probe.metas).toHaveLength(0);
});

it('tree editor: Flip direction right after typing in Spacing: the blur commits first, then the flip', () => {
  const { hole, past } = setup();
  const spacing = rowBlock().getByLabelText('Spacing (mm)');
  act(() => spacing.focus());
  type(spacing, '70');
  // No settle: the click moves the focus (blur commits), then the button acts.
  act(() => spacing.blur());
  act(() => fireEvent.click(rowBlock().getByRole('button', { name: 'Flip direction' })));
  expect(hole().row.pitch).toBe(70);
  expect(hole().row.direction).not.toEqual(ROW.direction);
  expect(past()).toBe(2);
  expect(rowBlock().getByLabelText('Spacing (mm)').value).toBe('70');
});

it('tree editor: an Undo in the middle of a session breaks the coalescing (the next value is its own step)', () => {
  const { probe, hole, past } = setup();
  const spacing = rowBlock().getByLabelText('Spacing (mm)');
  act(() => spacing.focus());
  type(spacing, '60');
  settle();
  // The Undo button without moving the focus (a browser that does not focus buttons).
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(hole().row.pitch).toBe(50);
  expect(past()).toBe(0);
  type(spacing, '65');
  settle();
  expect(probe.metas.map((m) => m.skipHistory)).toEqual([false, false]);
  expect(past()).toBe(1);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(hole().row.pitch).toBe(50);
});
