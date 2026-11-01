// @vitest-environment jsdom
// Phase M.1 (docs/sketch-studio-remove-part.md): a part's only enabled
// feature offers Remove part instead of Remove feature / Suppress, so removing
// a bolt never leaves a part with no solid. Kernel hook and viewport are the
// stand-ins of CadWorkspace.place.dom.test.jsx.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';

const viewport = vi.hoisted(() => ({ props: null, dragging: false, dropPoint: [1250, -480, 0] }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'current',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({
        id: p.id,
        // Hole rows report their centres, as the kernel does.
        features: Object.fromEntries(
          p.features
            .filter((f) => f.type === 'hole' && f.row && f.position)
            .map((f) => [
              f.id,
              {
                cut: { position: f.position, direction: f.direction, widthDirection: [1, 0, 0] },
                row: {
                  ...f.row,
                  centres: Array.from({ length: f.row.count }, (_, k) =>
                    f.position.map((v, i) => v + f.row.direction[i] * f.row.pitch * k),
                  ),
                },
              },
            ]),
        ),
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
      isDragging: () => viewport.dragging,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      getSceneSpan: () => 1000,
      viewDropPoint: () => viewport.dropPoint,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));

afterEach(() => {
  cleanup();
  viewport.dragging = false;
});

// The fixture of model.test.js: a board (box + 3-hole row), bolts of one
// hardware part each concentric to it, a mark on bolt 2, an assembly sheet
// listing bolt 1 and the board, a board sheet with a bolt callout, a bolt
// sheet. `tool` adds a subtract on the board that uses the bolt part.
function boltsOnBoard({ bolts = 3, tool = false } = {}) {
  const assembly = emptyModel().sheets[0];
  const ids = Array.from({ length: bolts }, (_, k) => k + 1);
  return {
    ...emptyModel(),
    parts: [
      {
        id: 'board',
        name: 'Board / plate',
        features: [
          { id: 'box', type: 'box', width: 600, depth: 400, height: 18 },
          {
            id: 'row',
            type: 'hole',
            diameter: 6.6,
            depth: 5,
            throughAll: true,
            position: [100, 100, 18],
            direction: [0, 0, -1],
            row: { count: 3, pitch: 50, direction: [1, 0, 0] },
          },
          ...(tool ? [{ id: 'cut', type: 'subtract', toolPartId: 'bolt' }] : []),
        ],
      },
      { id: 'bolt', name: 'Hex bolt M6', features: [{ id: 'hw', type: 'hardware', kind: 'bolt', size: 'M6' }] },
    ],
    instances: [
      { id: 'b1', partId: 'board', name: '', position: [0, 0, 0], rotation: [0, 0, 0] },
      ...ids.map((k) => ({ id: `bolt${k}`, partId: 'bolt', name: '', position: [0, 0, 0], rotation: [0, 0, 0] })),
    ],
    connections: ids.map((k) => ({
      id: `c${k}`,
      type: 'concentric',
      from: `bolt${k}`,
      to: 'b1',
      fromFeatureId: 'hw',
      toFeatureId: 'row',
      ...(k > 1 ? { holeIndex: k - 1 } : {}),
    })),
    marks:
      bolts >= 2
        ? [
            {
              id: 'on-bolt2',
              from: { instanceId: 'bolt2', local: [0, 0, 0] },
              to: { instanceId: 'b1', local: [600, 0, 18] },
              along: 'aligned',
              offset: [0, -28.8, 1.3],
            },
          ]
        : [],
    sheets: [
      { ...assembly, instanceIds: bolts ? ['bolt1', 'b1'] : ['b1'] },
      {
        ...assembly,
        id: 'board-sheet',
        title: 'Board',
        partId: 'board',
        annotations: [{ id: 'bolt-callout', type: 'hole-callout', view: 'top', partId: 'bolt', featureIds: ['hw'] }],
      },
      { ...assembly, id: 'bolt-sheet', title: 'Bolt', partId: 'bolt' },
    ],
  };
}

function setup(model) {
  let current = model;
  const setCadModel = vi.fn((next) => {
    current = next;
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test', entities: [], model: current }}
        setCadModel={setCadModel}
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  const view = render(workspace());
  return { setCadModel, rerender: () => view.rerender(workspace()), model: () => current };
}
// The Assembly list in the tree: one button per instance, named after its part.
const treeItems = (name) =>
  [...document.querySelectorAll('.cad-tree-item')].filter((b) => b.textContent.includes(name));
const pickInTree = (name, index = 0) => act(() => fireEvent.click(treeItems(name)[index]));
// perform() is async: let its promise settle inside act.
const press = (name) => act(async () => fireEvent.click(screen.getByRole('button', { name })));
const help = (name, count) =>
  `This is the only active feature of ${name}: removing it removes the part and its ${count}. To remove just this one, use Remove instance below.`;

it("a bolt's only feature offers Remove part, which removes the part, every bolt and every connection", async () => {
  const { setCadModel, model } = setup(boltsOnBoard());
  expect(treeItems('Hex bolt M6')).toHaveLength(3);
  pickInTree('Hex bolt M6', 1);
  expect(viewport.props.selectedId).toBe('bolt2');
  expect(screen.getByRole('heading', { name: 'hardware · feature 1' })).toBeTruthy();
  expect(screen.getByText(help('Hex bolt M6', '3 instances'))).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove feature' })).toBeNull();
  const suppress = screen.getByRole('button', { name: 'Suppress' });
  expect(suppress.disabled).toBe(true);
  expect(suppress.title).toBe('The only active feature of a part cannot be suppressed; remove the part instead.');
  expect(screen.getByRole('button', { name: 'Remove part · 3 instances' }).className).toContain('cad-danger');
  await press('Remove part · 3 instances');
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(model().parts.map((p) => p.id)).toEqual(['board']);
  expect(model().instances.map((i) => i.id)).toEqual(['b1']);
  expect(model().connections).toEqual([]);
  expect(model().marks).toEqual([]);
  expect(model().sheets.map((s) => s.id)).toEqual(['assembly-sheet', 'board-sheet']);
  expect(model().sheets[0].instanceIds).toEqual(['b1']);
  expect(model().sheets[1].annotations).toEqual([]);
  expect(viewport.props.selectedId).toBeNull();
  expect(document.querySelector('.cad-error')).toBeNull();
});

it("a board's hole keeps Remove feature; its sole box then offers Remove part · 1 instance", async () => {
  const { setCadModel, model, rerender } = setup(boltsOnBoard());
  pickInTree('Board / plate');
  expect(screen.getByRole('heading', { name: 'hole ×3 · feature 2' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Remove part/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Suppress' }).disabled).toBe(false);
  await press('Remove feature');
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(model().parts.map((p) => p.id)).toEqual(['board', 'bolt']);
  expect(model().parts[0].features.map((f) => f.id)).toEqual(['box']);
  expect(model().instances).toHaveLength(4);
  rerender();
  expect(screen.getByRole('heading', { name: 'box · feature 1' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove feature' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Suppress' }).disabled).toBe(true);
  expect(screen.getByText(help('Board / plate', '1 instance'))).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove part · 1 instance' })).toBeTruthy();
});

it('a suppressed sibling does not count: the enabled feature is still the only one', () => {
  const fixture = boltsOnBoard();
  fixture.parts[0].features[1] = { ...fixture.parts[0].features[1], suppressed: true };
  setup(fixture);
  pickInTree('Board / plate');
  // The shown (last) feature is the suppressed hole: Enable and Remove feature as before.
  expect(screen.getByRole('button', { name: 'Enable' }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Remove feature' })).toBeTruthy();
  // The box is the only enabled feature.
  act(() => fireEvent.click(screen.getByRole('button', { name: '1. box' })));
  expect(screen.getByRole('button', { name: 'Suppress' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Remove part · 1 instance' })).toBeTruthy();
});

it('Remove instance on one bolt removes just that bolt and keeps the part', async () => {
  const { setCadModel, model } = setup(boltsOnBoard());
  pickInTree('Hex bolt M6', 1);
  await press('Remove instance');
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(model().parts.map((p) => p.id)).toEqual(['board', 'bolt']);
  expect(model().instances.map((i) => i.id)).toEqual(['b1', 'bolt1', 'bolt3']);
  expect(model().connections.map((c) => c.id)).toEqual(['c1', 'c3']);
  expect(model().marks).toEqual([]);
  expect(model().sheets.map((s) => s.id)).toEqual(['assembly-sheet', 'board-sheet', 'bolt-sheet']);
  expect(viewport.props.selectedId).toBeNull();
});

it('Remove instance on the last bolt removes the hardware definition too', async () => {
  const { model } = setup(boltsOnBoard({ bolts: 1 }));
  pickInTree('Hex bolt M6');
  expect(screen.getByRole('button', { name: 'Remove part · 1 instance' })).toBeTruthy();
  await press('Remove instance');
  expect(model().parts.map((p) => p.id)).toEqual(['board']);
  expect(model().instances.map((i) => i.id)).toEqual(['b1']);
  expect(model().connections).toEqual([]);
  expect(model().sheets.map((s) => s.id)).toEqual(['assembly-sheet', 'board-sheet']);
  expect(document.querySelector('.cad-error')).toBeNull();
});

it('Remove instance on the last board keeps its definition', async () => {
  const fixture = boltsOnBoard({ bolts: 0 });
  const { model } = setup(fixture);
  pickInTree('Board / plate');
  await press('Remove instance');
  expect(model().parts.map((p) => p.id)).toEqual(['board', 'bolt']);
  expect(model().instances).toEqual([]);
});

it('a part used as a Boolean tool refuses Remove part with the named message and commits nothing', async () => {
  const { setCadModel, model } = setup(boltsOnBoard({ bolts: 1, tool: true }));
  pickInTree('Hex bolt M6');
  await press('Remove part · 1 instance');
  expect(setCadModel).not.toHaveBeenCalled();
  expect(document.querySelector('.cad-error').textContent).toBe(
    '"Hex bolt M6" is the Boolean tool of "Board / plate" (subtract); remove that feature first.',
  );
  // Remove instance on its last bolt still works, and keeps the referenced definition.
  await press('Remove instance');
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(model().parts.map((p) => p.id)).toEqual(['board', 'bolt']);
  expect(model().instances.map((i) => i.id)).toEqual(['b1']);
});
