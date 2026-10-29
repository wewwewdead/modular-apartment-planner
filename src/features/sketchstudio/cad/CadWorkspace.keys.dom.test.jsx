// @vitest-environment jsdom
// Workstation shortcuts end to end: R / M pick the gizmo, ] / [ turn the
// selected part (World or Local), and nothing fires while typing, dragging
// or in another tool. The kernel hook and the 3D viewport are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel } from './model.js';
import { instanceAxis } from './movement.js';

const viewport = vi.hoisted(() => ({ props: null, dragging: false }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'current',
    ready: true,
    snapshot: {
      parameters: {},
      parts: [],
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [0, 0, 0],
          [40, 40, 700],
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
      isDragging: () => viewport.dragging,
      getPivot: () => [20, 20, 350],
      getCanvas: () => null,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));

afterEach(() => {
  cleanup();
  viewport.dragging = false;
});

function setup(rotation = [0, 0, 0]) {
  const { part } = createPart('member');
  const model = {
    ...emptyModel(),
    parts: [part],
    instances: [{ id: 'leg', partId: part.id, position: [0, 0, 0], rotation }],
  };
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
  act(() => viewport.props.onSelect('leg'));
  // The model commits through the parent document, as SketchStudio does.
  const rerender = () => view.rerender(workspace());
  return { setCadModel, rerender, latest: () => current.instances[0] };
}
const press = (key, init = {}, target = window) => act(() => fireEvent.keyDown(target, { key, ...init }));

it('R and M switch between the rotate and move gizmo and toggle it off', () => {
  setup();
  expect(viewport.props.transformMode).toBe('translate');
  expect(viewport.props.moveEnabled).toBe(true);
  press('r');
  expect(viewport.props.transformMode).toBe('rotate');
  expect(viewport.props.moveEnabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Rotate part' }).getAttribute('aria-pressed')).toBe('true');
  press('r');
  expect(viewport.props.moveEnabled).toBe(false);
  press('m');
  expect(viewport.props.transformMode).toBe('translate');
  expect(viewport.props.moveEnabled).toBe(true);
});

it('] and [ turn the selected part by the snap step about Z, Shift about X', () => {
  const { setCadModel, rerender, latest } = setup();
  press(']', { code: 'BracketRight' });
  expect(setCadModel).toHaveBeenCalledTimes(1);
  rerender();
  expect(latest().rotation).toEqual([0, 0, 15]);
  // A preset changes the step.
  press('r');
  act(() => fireEvent.click(screen.getByRole('button', { name: '45°' })));
  expect(viewport.props.rotateSnap).toBe(45);
  press('[', { code: 'BracketLeft' });
  rerender();
  expect(latest().rotation).toEqual([0, 0, -30]);
  press('{', { code: 'BracketLeft', shiftKey: true });
  rerender();
  // -45° about world X tips the part's own Z (world Z so far) toward +Y
  // (rotation fields keep 1e-6°, hence 6 places).
  instanceAxis(latest(), 'Z').forEach((v, i) => expect(v).toBeCloseTo([0, Math.SQRT1_2, Math.SQRT1_2][i], 6));
});

it('follows Local space: ] turns about the part’s own Z', () => {
  // Turned 90° about X: the part's own Z axis lies along world -Y.
  const { rerender, latest } = setup([90, 0, 0]);
  press('r');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Local' })));
  expect(viewport.props.rotateSpace).toBe('local');
  const ownZ = instanceAxis(latest(), 'Z');
  ownZ.forEach((v, i) => expect(v).toBeCloseTo([0, -1, 0][i], 9));
  press(']', { code: 'BracketRight' });
  rerender();
  // Its own Z stays put; its own X turned 15° about it.
  instanceAxis(latest(), 'Z').forEach((v, i) => expect(v).toBeCloseTo(ownZ[i], 9));
  const x = instanceAxis(latest(), 'X');
  expect(x[0]).toBeCloseTo(Math.cos((15 * Math.PI) / 180), 9);
  // The X 90° button turns about the part's own X in Local.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'X 90°' })));
  rerender();
  instanceAxis(latest(), 'X').forEach((v, i) => expect(v).toBeCloseTo(x[i], 9));
});

it('stays quiet while typing, dragging, with modifiers or without a selection', () => {
  const { setCadModel } = setup();
  const field = screen.getByLabelText('Standard view');
  press('r', {}, field);
  expect(viewport.props.transformMode).toBe('translate');
  viewport.dragging = true;
  press(']', { code: 'BracketRight' });
  press('r');
  viewport.dragging = false;
  press('r', { ctrlKey: true });
  expect(viewport.props.transformMode).toBe('translate');
  expect(setCadModel).not.toHaveBeenCalled();
  act(() => viewport.props.onSelect(null));
  press('r');
  press(']', { code: 'BracketRight' });
  expect(viewport.props.transformMode).toBe('translate');
  expect(setCadModel).not.toHaveBeenCalled();
});
