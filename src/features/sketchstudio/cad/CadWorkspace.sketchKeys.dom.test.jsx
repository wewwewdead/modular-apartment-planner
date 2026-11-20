// @vitest-environment jsdom
// Sketch keys SK-1 in the workspace (docs/sketch-studio-sketch-shortcuts.md
// §4): on the studio's real reducer and its real keyboard hook
// (useSketchKeyboard, whose Ctrl+Z undoes the model), Ctrl+Z in a sketch is
// the sketcher's Undo last and leaves the model as it was; out of a sketch it
// undoes the model as before. Shapes are typed through the sketcher's HUD on a
// stand-in canvas; kernel hook and 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle, useLayoutEffect, useReducer, useRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import sketchStudioReducer from '../store/sketchStudioReducer';
import useSketchHistory from '../hooks/useSketchHistory';
import useSketchKeyboard from '../hooks/useSketchKeyboard';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s, so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const stage = vi.hoisted(() => ({ canvas: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'ready',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({ id: p.id, bounds: null, features: {} })),
      instances: model.instances.map((i) => ({ id: i.id, partId: i.partId, bounds: null, placement: [] })),
    },
    request: vi.fn(),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [0, 0, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => stage.canvas,
      planePoint: (x, y) => [x, y],
      getGroupPoses: () => new Map(),
      planeEdges: () => [],
      getMarkPoints: () => [],
      setSketchOverlay: () => {},
    }));
    return <div aria-label="Solid model viewport" />;
  },
}));
beforeEach(() => {
  stage.canvas = document.createElement('canvas');
  document.body.append(stage.canvas);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  cleanup();
  stage.canvas.remove();
  vi.unstubAllGlobals();
});

// The workspace inside the studio as useSketchStudio wires it: the reducer,
// its history and its window keys.
function setup() {
  const probe = { state: null };
  function Studio() {
    const [state, dispatch] = useReducer(sketchStudioReducer, null, () => ({
      ...sketchStudioInitialState,
      document: { ...sketchStudioInitialState.document, model: emptyModel() },
      history: { past: [], future: [] },
    }));
    const { canUndo, canRedo, handleUndo, handleRedo } = useSketchHistory(state, dispatch);
    const isSpacePanActiveRef = useRef(false);
    useSketchKeyboard(state, dispatch, {
      commitPrecisionDraft: () => {},
      undo: handleUndo,
      redo: handleRedo,
      isSpacePanActiveRef,
      groupSelection: () => {},
      degroupSelection: () => {},
    });
    useLayoutEffect(() => {
      probe.state = state;
      probe.dispatch = dispatch;
    });
    return (
      <MemoryRouter>
        <CadWorkspace
          document={{ id: 'doc', name: 'Test', entities: [], model: state.document.model }}
          setCadModel={(next, meta) => dispatch({ type: 'SET_CAD_MODEL', payload: next, meta })}
          undo={handleUndo}
          redo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          documentPersistence={{}}
        />
      </MemoryRouter>
    );
  }
  render(<Studio />);
  // One model step before the sketch, so a model undo would show.
  const width = { ...emptyModel(), parameters: [{ id: 'w', name: 'width', value: 200 }] };
  act(() => probe.dispatch({ type: 'SET_CAD_MODEL', payload: width }));
  return { model: () => probe.state.document.model, past: () => probe.state.history.past.length };
}
const toolbar = () => screen.queryByRole('toolbar', { name: 'Sketch tools' });
const pressed = (name) => within(toolbar()).getByRole('button', { name }).getAttribute('aria-pressed');
const key = (target, init) => act(() => fireEvent.keyDown(target, init));
const typeStep = (values) =>
  act(() => {
    const entries = Object.entries(values);
    for (const [field, value] of entries)
      fireEvent.change(screen.getByLabelText(`Sketch ${field}`), { target: { value: String(value) } });
    fireEvent.keyDown(screen.getByLabelText(`Sketch ${entries.at(-1)[0]}`), { key: 'Enter' });
  });
const statusLine = () => document.querySelector('.cad-sketch-status').textContent;
const startSketch = () => {
  act(() => fireEvent.click(within(document.querySelector('.cad-start')).getByRole('button', { name: 'New sketch' })));
  const properties = within(document.querySelector('.cad-properties'));
  act(() => fireEvent.click(properties.getByRole('button', { name: 'Start sketch', exact: true })));
};

it('Ctrl+Z in a sketch takes the line back and leaves the model; out of the sketch it undoes the model', () => {
  const harness = setup();
  startSketch();
  expect(toolbar()).toBeTruthy();
  const before = harness.model();
  const past = harness.past();
  expect(before.parameters).toHaveLength(1);
  expect(past).toBe(1);
  // L, then one typed line: the chain goes on with its Length field focused.
  key(document.body, { key: 'l' });
  expect(pressed('Line')).toBe('true');
  typeStep({ x: 0, y: 0 });
  typeStep({ length: 100, angle: 0 });
  expect(statusLine()).toContain('1 item · open outline');
  expect(document.activeElement).toBe(screen.getByLabelText('Sketch length'));
  key(document.activeElement, { key: 'z', ctrlKey: true });
  expect(statusLine()).toContain('0 items · no profile yet');
  expect(harness.model()).toBe(before);
  expect(harness.past()).toBe(past);
  // From the page as well.
  key(screen.getByLabelText('Sketch x'), { key: 'Escape' });
  key(document.body, { key: 'r' });
  expect(pressed('Rectangle')).toBe('true');
  typeStep({ x: 0, y: 0 });
  typeStep({ width: 200, height: 100 });
  key(screen.getByLabelText('Sketch x'), { key: 'Escape' });
  key(document.body, { key: 'c' });
  typeStep({ x: 100, y: 50 });
  typeStep({ radius: 20 });
  key(screen.getByLabelText('Sketch x'), { key: 'Escape' });
  expect(statusLine()).toContain('2 items · closed profile');
  key(document.body, { key: 'z', ctrlKey: true });
  expect(statusLine()).toContain('1 item · closed profile');
  expect(harness.model()).toBe(before);
  // Finished, the sketch is one model step; Ctrl+Z now undoes the model.
  act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Finish sketch' })));
  expect(toolbar()).toBeNull();
  expect(harness.model().sketches).toHaveLength(1);
  expect(harness.past()).toBe(past + 1);
  key(document.body, { key: 'z', ctrlKey: true });
  expect(harness.model().sketches).toEqual([]);
  expect(harness.model()).toEqual(before);
  expect(harness.past()).toBe(past);
});
