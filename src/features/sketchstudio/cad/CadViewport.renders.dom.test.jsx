// @vitest-environment jsdom
// How many times the viewport draws (docs/perf-pass-3.md §5 B1.1): one
// renderer.render per React commit, however many effects changed the scene,
// and one per pointer move of a gizmo drag or orbit step. Each frame drawn
// shows the commit's final state.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import CadViewport from './CadViewport.jsx';
import { createOperationDraft } from './operations.js';
import { placeClick, placementView, startPlacement } from './placementTool.js';
import { GRIP_PX } from './placementHandles.js';
import { mmPerPixelAt } from './marks.js';

const { frames } = vi.hoisted(() => ({ frames: [] }));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render(scene) {
        scene.updateMatrixWorld(true);
        const positions = {};
        let gizmo = null;
        scene.traverse((object) => {
          if (object.isMesh && object.userData.instanceId)
            positions[object.userData.instanceId] = new actual.Box3()
              .setFromObject(object)
              .getCenter(new actual.Vector3())
              .toArray();
        });
        // Where the move gizmo stands (its pivot) as drawn.
        scene.traverse((object) => {
          if (object.userData.pivotProbe) gizmo = object.position.toArray();
        });
        frames.push({ positions, gizmo, layers: placementLayers(scene) });
      }
    },
  };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { EventDispatcher, Vector3 } = await import('three');
  return {
    OrbitControls: class extends EventDispatcher {
      static current;
      target = new Vector3();
      enabled = true;
      constructor() {
        super();
        OrbitControls.current = this;
      }
      update() {}
      dispose() {}
    },
  };
});
vi.mock('three/addons/controls/TransformControls.js', async () => {
  const { EventDispatcher, Object3D } = await import('three');
  return {
    TransformControls: class extends EventDispatcher {
      static current;
      axis = null;
      dragging = false;
      constructor() {
        super();
        TransformControls.current = this;
      }
      getHelper() {
        return new Object3D();
      }
      setMode() {}
      setSpace() {}
      setSize() {}
      setTranslationSnap() {}
      setRotationSnap() {}
      // Like three's, attach and detach each tell their listeners.
      attach(object) {
        this.object = object;
        object.userData.pivotProbe = true;
        this.dispatchEvent({ type: 'change' });
      }
      detach() {
        this.object = null;
        this.dispatchEvent({ type: 'change' });
      }
      dispose() {}
    },
  };
});

function placementLayers(scene) {
  const layer = scene.children.find((o) => o.name === 'placement');
  return layer ? layer.children.map((c) => `${c.name}:${c.geometry?.parameters?.radius ?? ''}`) : [];
}

const SIZE = 600;
beforeEach(() => {
  frames.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const model = {
  parts: [{ id: 'part', features: [] }],
  instances: [
    { id: 'item', partId: 'part', position: [0, 0, 0] },
    { id: 'other', partId: 'part', position: [100, 0, 0] },
  ],
  connections: [],
};
function piece(id, [x, y, z]) {
  return {
    id,
    partId: 'part',
    bounds: [
      [x, y, z],
      [x + 10, y + 10, z + 10],
    ],
    mesh: {
      vertices: [x, y, z, x + 10, y, z, x, y + 10, z + 10],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      triangles: [0, 1, 2],
    },
    edges: { lines: [x, y, z, x + 10, y, z] },
    placement: [{ translation: [x, y, z] }],
  };
}
const snapshotAt = (itemAt = [0, 0, 0]) => ({
  parts: [],
  instances: [piece('item', itemAt), piece('other', [100, 0, 0])],
});
// The frames one act draws.
function framesOf(act) {
  const before = frames.length;
  act();
  return frames.slice(before);
}

it('draws once when a snapshot arrives with a part selected, at the final pose', () => {
  const props = {
    model,
    snapshot: snapshotAt(),
    ready: true,
    selectedId: 'item',
    moveEnabled: true,
    onSelect: vi.fn(),
  };
  const { rerender } = render(<CadViewport {...props} />);
  const drawn = framesOf(() => rerender(<CadViewport {...props} snapshot={snapshotAt()} />));
  expect(drawn.at(-1).positions.item).toEqual([5, 5, 5]);
  // The gizmo is drawn on the rebuilt part's centre.
  expect(drawn.at(-1).gizmo).toEqual([5, 5, 5]);
  expect(drawn).toHaveLength(1);
});

it('draws once when a click selects a part', () => {
  const props = { model, snapshot: snapshotAt(), ready: true, selectedId: null, moveEnabled: true, onSelect: vi.fn() };
  const { rerender } = render(<CadViewport {...props} />);
  const drawn = framesOf(() => rerender(<CadViewport {...props} selectedId="other" />));
  expect(drawn.at(-1).gizmo).toEqual([105, 5, 5]);
  expect(drawn).toHaveLength(1);
});

it('draws once per translate-drag move, after the snap and the parts have moved', () => {
  const props = {
    model,
    snapshot: snapshotAt(),
    ready: true,
    selectedId: 'item',
    moveEnabled: true,
    onMove: vi.fn(),
    onSelect: vi.fn(),
  };
  render(<CadViewport {...props} />);
  const transform = TransformControls.current;
  transform.axis = 'XYZ';
  act(() => {
    // TransformControls' pointerDown: `dragging` set (a change), then mouseDown.
    transform.dragging = true;
    transform.dispatchEvent({ type: 'change' });
    transform.dispatchEvent({ type: 'mouseDown' });
  });
  // pointerMove: the pivot moves, then change, then objectChange.
  const drawn = framesOf(() =>
    act(() => {
      transform.object.position.add(new THREE.Vector3(20.4, 0, 0));
      transform.dispatchEvent({ type: 'change' });
      transform.dispatchEvent({ type: 'objectChange' });
    }),
  );
  // Snapped to the 1 mm grid before it was drawn.
  expect(drawn.at(-1).positions.item).toEqual([25, 5, 5]);
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(props.onMove).toHaveBeenCalledWith('item', [20, 0, 0]);
  expect(drawn).toHaveLength(1);
});

// A profile placed on the top face, seen from the front: its arrow, square and grip handles.
const BOUNDS = [
  [0, 0, 0],
  [600, 400, 18],
];
const board = {
  id: 'board',
  partId: 'board',
  bounds: BOUNDS,
  mesh: { vertices: [0, 0, 18, 600, 0, 18, 600, 400, 18], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], triangles: [0, 1, 2] },
  edges: { lines: [0, 0, 18, 600, 0, 18] },
  placement: [{ translation: [0, 0, 0] }],
};
const boardModel = {
  parameters: [],
  sketches: [],
  marks: [],
  parts: [{ id: 'board', name: 'Board', features: [] }],
  instances: [{ id: 'board', partId: 'board', position: [0, 0, 0], rotation: [0, 0, 0] }],
  connections: [],
};
const boardSnapshot = { parameters: {}, parts: [{ id: 'board', bounds: BOUNDS }], instances: [board] };

it('draws once per orbit step with placement handles, the handles already resized', () => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: SIZE, height: SIZE }),
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(SIZE);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(SIZE);
  const ctx = { model: boardModel, snapshot: boardSnapshot, parameters: {} };
  const draft = placeClick(
    createOperationDraft({ type: 'extrude', model: boardModel, placement: startPlacement({ type: 'extrude' }) }),
    {
      kind: 'face',
      planar: true,
      instanceId: 'board',
      partId: 'board',
      point: [300, 200, 18],
      normal: [0, 0, 1],
      faceFrame: { origin: [0, 0, 18], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] },
      outline: [],
    },
    ctx,
  );
  render(
    <CadViewport
      model={boardModel}
      snapshot={boardSnapshot}
      ready
      view="front"
      placement={placementView(draft, ctx)}
      onSelect={vi.fn()}
    />,
  );
  expect(frames.at(-1).layers.some((name) => name.startsWith('placement-grip-'))).toBe(true);
  // An orbit step that zooms out (the gizmo follows the live camera): the
  // handles grow in mm to keep their size on screen.
  const camera = TransformControls.current.camera;
  const drawn = framesOf(() =>
    act(() => {
      camera.zoom = 0.5;
      camera.updateProjectionMatrix();
      OrbitControls.current.dispatchEvent({ type: 'change' });
    }),
  );
  // Drawn with the handles redrawn for the new zoom: the grip's sphere GRIP_PX on screen.
  const at = document
    .querySelector('.cad-viewport')
    .cadPlacement()
    .handles.find((h) => h.kind === 'grip').at;
  const grip = Number(
    drawn
      .at(-1)
      .layers.find((name) => name.startsWith('placement-grip-'))
      .split(':')[1],
  );
  expect(grip).toBeCloseTo(GRIP_PX * mmPerPixelAt(camera, at, SIZE), 6);
  expect(drawn).toHaveLength(1);
});

// B1.6: hidden by display: none (the drawing focus), the viewport draws nothing
// and draws once, the latest state, when it has a size again.
it('holds its draws while it has no size and draws the latest state once it is back', () => {
  let observed = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        observed = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  let size = SIZE;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size);
  const props = {
    model,
    snapshot: snapshotAt(),
    ready: true,
    selectedId: 'item',
    moveEnabled: true,
    onSelect: vi.fn(),
  };
  const { rerender } = render(<CadViewport {...props} />);
  act(() => observed([]));
  expect(frames.at(-1).positions.item).toEqual([5, 5, 5]);
  size = 0;
  const hidden = framesOf(() => {
    act(() => observed([]));
    // Edits while hidden: the part moves, then rebuilt geometry arrives.
    rerender(
      <CadViewport
        {...props}
        model={{ ...model, instances: [{ ...model.instances[0], position: [20, 0, 0] }, model.instances[1]] }}
      />,
    );
    rerender(
      <CadViewport
        {...props}
        model={{ ...model, instances: [{ ...model.instances[0], position: [20, 0, 0] }, model.instances[1]] }}
        snapshot={snapshotAt([20, 0, 0])}
      />,
    );
  });
  expect(hidden).toHaveLength(0);
  size = SIZE;
  const shown = framesOf(() => act(() => observed([])));
  expect(shown).toHaveLength(1);
  expect(shown[0].positions.item).toEqual([25, 5, 5]);
  expect(shown[0].gizmo).toEqual([25, 5, 5]);
});
