// @vitest-environment jsdom
// Part groups in the workstation (docs/sketch-studio-part-groups.md §7):
// Shift+click in the tree, Ctrl+G / Ctrl+Shift+G, Undo / Redo, the group
// panel, viewport clicks that take the group, double-click into it and Esc
// out, moving a group as one body, and Remove group.
// The kernel hook and the 3D viewport are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel, normalizeModel } from './model.js';

const viewport = vi.hoisted(() => ({ props: null, dragging: false }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'current',
    ready: true,
    snapshot: {
      parameters: {},
      parts: [],
      instances: model.instances.map((i, index) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [index * 100, 0, 0],
          [index * 100 + 40, 40, 700],
        ],
        placement: [],
      })),
    },
    request: vi.fn(),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      getInstanceBounds: () => [
        [0, 0, 0],
        [40, 40, 700],
      ],
      // Union of the members' boxes: legs at x = 0 and x = 100.
      getBounds: () => [
        [0, 0, 0],
        [140, 40, 700],
      ],
      isDragging: () => viewport.dragging,
      getPivot: () => [70, 20, 350],
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      getSceneSpan: () => 1000,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));

afterEach(() => {
  cleanup();
  viewport.dragging = false;
});

// Three legs at the top level; the parent keeps an undo history like SketchStudio.
function setup() {
  const { part } = createPart('member');
  const leg = (id, x) => ({ id, partId: part.id, name: id, position: [x, 0, 0], rotation: [0, 0, 0] });
  const history = [
    normalizeModel({ ...emptyModel(), parts: [part], instances: [leg('A', 0), leg('B', 100), leg('C', 200)] }),
  ];
  let index = 0;
  const setCadModel = vi.fn((next, meta = {}) => {
    if (meta.skipHistory) history[index] = next;
    else {
      history.splice(index + 1);
      history.push(next);
      index = history.length - 1;
    }
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test', entities: [], model: history[index] }}
        setCadModel={setCadModel}
        undo={() => {
          index = Math.max(0, index - 1);
        }}
        redo={() => {
          index = Math.min(history.length - 1, index + 1);
        }}
        canUndo
        canRedo
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  const view = render(workspace());
  const rerender = () => view.rerender(workspace());
  return {
    setCadModel,
    rerender,
    model: () => history[index],
    undo: () => {
      index = Math.max(0, index - 1);
      rerender();
    },
    redo: () => {
      index = Math.min(history.length - 1, index + 1);
      rerender();
    },
  };
}
const press = (key, init = {}, target = window) => act(() => fireEvent.keyDown(target, { key, ...init }));
const tree = () => document.querySelector('.cad-tree');
const itemName = (button) => button.querySelector('span').firstChild.data;
const treeNames = () => [...tree().querySelectorAll('.cad-tree-item')].map(itemName);
const row = (name) => [...tree().querySelectorAll('.cad-tree-item')].find((b) => itemName(b) === name);

function groupAB(harness) {
  act(() => fireEvent.click(row('A')));
  act(() => fireEvent.click(row('B'), { shiftKey: true }));
  press('g', { ctrlKey: true });
  harness.rerender();
}

it('Shift+click two rows, Ctrl+G groups them; Ctrl+Shift+G restores the flat list', () => {
  const harness = setup();
  act(() => fireEvent.click(row('A')));
  act(() => fireEvent.click(row('B'), { shiftKey: true }));
  expect(row('A').className).toContain('is-selected');
  expect(row('B').className).toContain('is-selected');
  expect(screen.getByRole('heading', { name: '2 parts selected' })).toBeTruthy();
  expect(viewport.props.selectedId).toBeNull();
  expect(viewport.props.selectedIds).toEqual(['A', 'B']);
  expect(viewport.props.movingKey).toBe('selection');
  press('g', { ctrlKey: true });
  expect(harness.setCadModel).toHaveBeenCalledTimes(1);
  harness.rerender();
  const [group] = harness.model().groups;
  expect(group).toMatchObject({ name: 'Group 1', parentId: null });
  expect(harness.model().instances.map((i) => i.groupId ?? null)).toEqual([group.id, group.id, null]);
  // The tree: Group 1 holding A and B, then C; the group is selected.
  expect(treeNames()).toEqual(['Group 1', 'A', 'B', 'C']);
  expect(row('Group 1').className).toContain('is-selected');
  expect(within(screen.getByRole('group', { name: 'Group 1 members' })).getAllByRole('button')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'Group' })).toBeTruthy();
  expect(screen.getByLabelText('Selection extent').textContent).toBe('Spans X 0–140 · Y 0–40 · Z 0–700 mm');
  expect(viewport.props.movingKey).toBe(group.id);
  // Ungroup: the flat list, its two parts still selected.
  press('G', { ctrlKey: true, shiftKey: true });
  harness.rerender();
  expect(harness.model().groups).toEqual([]);
  expect(treeNames()).toEqual(['A', 'B', 'C']);
  expect(screen.getByRole('heading', { name: '2 parts selected' })).toBeTruthy();
});

it('Undo / Redo round-trip a group; a selection whose group was undone falls back without errors', () => {
  const harness = setup();
  groupAB(harness);
  const groupId = harness.model().groups[0].id;
  harness.undo();
  expect(harness.model().groups).toEqual([]);
  expect(treeNames()).toEqual(['A', 'B', 'C']);
  expect(viewport.props.selectedIds).toEqual([]);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Group' })).toBeNull();
  harness.redo();
  expect(harness.model().groups[0].id).toBe(groupId);
  expect(treeNames()).toEqual(['Group 1', 'A', 'B', 'C']);
  expect(viewport.props.selectedIds).toEqual(['A', 'B']);
});

it('a viewport click takes the group; double-click opens it; Esc closes one level', () => {
  const harness = setup();
  groupAB(harness);
  const groupId = harness.model().groups[0].id;
  act(() => viewport.props.onSelect(null));
  act(() => viewport.props.onSelect('B'));
  expect(viewport.props.movingKey).toBe(groupId);
  expect(viewport.props.selectedIds).toEqual(['A', 'B']);
  // Shift+click a part outside the group adds it (siblings at the top level).
  act(() => viewport.props.onSelect('C', { toggle: true }));
  expect(screen.getByRole('heading', { name: '2 items selected' })).toBeTruthy();
  expect(viewport.props.selectedIds).toEqual(['A', 'B', 'C']);
  // Double-click: inside the group, the part itself selected.
  act(() => viewport.props.onSelect('B', { open: true }));
  expect(viewport.props.selectedId).toBe('B');
  expect(screen.getByRole('button', { name: 'Inside Group 1 · Close (Esc)' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: /Square tube/ })).toBeTruthy();
  // Inside, a click selects a member, not the group.
  act(() => viewport.props.onSelect('A'));
  expect(viewport.props.selectedId).toBe('A');
  press('Escape');
  expect(screen.queryByRole('button', { name: 'Inside Group 1 · Close (Esc)' })).toBeNull();
  expect(viewport.props.movingKey).toBe(groupId);
  // A click outside the open group closes it.
  act(() => viewport.props.onSelect('A', { open: true }));
  act(() => viewport.props.onSelect('C'));
  expect(screen.queryByRole('button', { name: /^Inside/ })).toBeNull();
  expect(viewport.props.selectedId).toBe('C');
});

it('moves, turns and hides a group as one body; Move by applies a delta once; Remove group removes both', () => {
  const harness = setup();
  groupAB(harness);
  const groupId = harness.model().groups[0].id;
  expect(viewport.props.moveEnabled).toBe(true);
  act(() => {
    viewport.props.onMove(groupId, [0, 50, 0]);
  });
  harness.rerender();
  expect(harness.model().instances.map((i) => i.position)).toEqual([
    [0, 50, 0],
    [100, 50, 0],
    [200, 0, 0],
  ]);
  // ] turns both 15° about Z through the union centre (70, 20, 350).
  press(']', { code: 'BracketRight' });
  harness.rerender();
  expect(
    harness
      .model()
      .instances.slice(0, 2)
      .map((i) => i.rotation),
  ).toEqual([
    [0, 0, 15],
    [0, 0, 15],
  ]);
  const before = harness
    .model()
    .instances.slice(0, 2)
    .map((i) => i.position);
  // Move by: Enter in a box moves once and resets the boxes.
  const x = screen.getByLabelText('Move by X (mm)');
  fireEvent.change(x, { target: { value: '25' }, nativeEvent: { inputType: 'insertText' } });
  act(() => fireEvent.keyDown(x, { key: 'Enter' }));
  harness.rerender();
  harness
    .model()
    .instances.slice(0, 2)
    .forEach((i, k) => expect(i.position[0]).toBeCloseTo(before[k][0] + 25, 6));
  expect(screen.getByLabelText('Move by X (mm)').value).toBe('0');
  // Hide: every member.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Hide' })));
  harness.rerender();
  expect(harness.model().instances.map((i) => i.visible !== false)).toEqual([false, false, true]);
  expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Remove group · 2 parts' })));
  harness.rerender();
  expect(harness.model().instances.map((i) => i.id)).toEqual(['C']);
  expect(harness.model().groups).toEqual([]);
});

it('an anchored group cannot move and says why; Local space is off for a group', () => {
  const harness = setup();
  groupAB(harness);
  // Attach A to C (outside the group) through the advanced model data.
  harness.setCadModel({
    ...harness.model(),
    connections: [{ id: 'fix', type: 'fixed', from: 'A', to: 'C', offset: [0, 0, 0] }],
  });
  harness.rerender();
  expect(viewport.props.moveEnabled).toBe(false);
  const hint = 'A is attached to C outside this group. Group them together or edit Connections / welds.';
  expect(viewport.props.moveHint).toBe(hint);
  expect(screen.getAllByText(hint).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Duplicate' }).disabled).toBe(true);
  press('r');
  const local = screen.getByRole('button', { name: 'Local' });
  expect(local.disabled).toBe(true);
  expect(local.title).toBe('A group has no axes of its own; World axes are used');
});
