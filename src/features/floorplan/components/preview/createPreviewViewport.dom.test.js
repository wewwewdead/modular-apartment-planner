// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { describeMachine } from '@/shared/machine';
import { createPreviewViewport } from './createPreviewViewport';
import { previewLoadMachine } from './loadPhase';

/*
  The viewport's road to a first picture, driven through the real viewport
  with the GPU taken out: a renderer that draws nothing, an environment and a
  progressive renderer that only answer, a compile the test resolves by hand,
  and animation frames the test runs one at a time. What is left is the code
  that decides which phase the panel is told, which is what these pin.
*/

const harness = vi.hoisted(() => ({
  compiles: [],
  converged: false,
  rendererHasCompile: true,
  rendererThrows: false,
  environmentThrows: false,
  renderers: [],
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  class DrawingNothingRenderer {
    constructor() {
      // What three does when the browser gives it no context.
      if (harness.rendererThrows) throw new Error('Error creating WebGL context.');
      harness.renderers.push(this);
      this.domElement = document.createElement('canvas');
      this.extensions = { has: () => true, get: () => ({}) };
      this.shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false, type: actual.PCFShadowMap };
      this.info = { autoReset: true, render: { calls: 0, triangles: 0 }, programs: [], reset() {} };
      this.properties = { get: () => ({}) };
      this.disposed = false;
      if (harness.rendererHasCompile) this.compile = () => new Set();
    }
    setPixelRatio() {}
    setSize() {}
    getRenderTarget() {
      return null;
    }
    setRenderTarget() {}
    dispose() {
      this.disposed = true;
    }
    forceContextLoss() {}
  }
  return { ...actual, WebGLRenderer: DrawingNothingRenderer };
});

vi.mock('./createEnvironment', async (importOriginal) => ({
  ...(await importOriginal()),
  createEnvironment: () => {
    if (harness.environmentThrows) throw new Error('No environment.');
    return {
      prepareStudioEnvironment: () => Promise.resolve(),
      skyEnvironment: () => null,
      studioBackdrop: () => null,
      studioEnvironment: () => null,
      dispose() {},
    };
  },
}));

vi.mock('./createProgressiveRenderer', async (importOriginal) => ({
  ...(await importOriginal()),
  createProgressiveRenderer: () => ({
    setStyle() {},
    reset() {},
    renderInteractive() {},
    renderSample() {},
    isConverged: () => harness.converged,
    presizeForRefine() {},
    getCompileWarmups: () => [],
    getSceneRenderTarget: () => null,
    setRefineProfile() {},
    setCamera() {},
    setSceneBounds() {},
    setSize() {},
    repaint: () => true,
    getStats: () => ({}),
    dispose() {},
  }),
}));

vi.mock('./compileScenePrograms', async (importOriginal) => ({
  ...(await importOriginal()),
  compileScenePrograms: () =>
    new Promise((resolve) => {
      harness.compiles.push(resolve);
    }),
}));

let frames = [];
let clock = 0;
let container = null;
let viewport = null;
let phases = [];
let converged = [];

/** Run the animation frames that are queued now, `count` times over. */
function runFrames(count = 1) {
  for (let i = 0; i < count; i += 1) {
    const queued = frames;
    frames = [];
    clock += 16;
    for (const frame of queued) frame?.(clock);
  }
}

/** Let the promise chain behind a compile settle. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

async function finishCompiles() {
  await settle();
  for (const resolve of harness.compiles.splice(0)) resolve();
  await settle();
}

function aWorld() {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), new THREE.MeshStandardMaterial()));
  return root;
}
const BOUNDS = { minX: 0, minY: 0, maxX: 1000, maxY: 1000, minElevation: 0, maxElevation: 1000 };

function start() {
  viewport = createPreviewViewport(container);
  viewport.setLoadStatusHandler(({ phase }) => phases.push(phase));
  viewport.setRenderStatusHandler(({ converged: value }) => converged.push(value));
}

beforeEach(() => {
  harness.compiles = [];
  harness.converged = false;
  harness.rendererHasCompile = true;
  harness.rendererThrows = false;
  harness.environmentThrows = false;
  harness.renderers = [];
  frames = [];
  clock = 0;
  phases = [];
  converged = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    frames = [];
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  viewport?.dispose();
  viewport = null;
  container.remove();
  vi.restoreAllMocks();
});

describe('the preview load phase table', () => {
  it('is the one the registry prints', () => {
    expect(describeMachine(previewLoadMachine)).toEqual([
      'building --COMPILE--> compiling',
      'building --FRAME--> ready',
      'building --LOSE--> lost',
      'compiling --FRAME--> ready',
      'compiling --LOSE--> lost',
      'ready --WAKE--> waking',
      'ready --LOSE--> lost',
      'waking --COMPILE--> compiling',
      'waking --FRAME--> ready',
      'waking --LOSE--> lost',
    ]);
  });

  it('lets nothing out of lost', () => {
    for (const event of previewLoadMachine.events) expect(previewLoadMachine.next('lost', event)).toBe('lost');
  });
});

describe('the viewport reports its load phase', () => {
  it('builds, compiles the first world, then shows it', async () => {
    start();
    expect(phases).toEqual(['building']);

    viewport.setWorld(aWorld(), BOUNDS);
    expect(phases).toEqual(['building', 'compiling']);
    // Held behind the gate: no frame of the world, so not ready yet.
    runFrames(3);
    expect(phases).toEqual(['building', 'compiling']);

    await finishCompiles();
    runFrames(1);
    expect(phases).toEqual(['building', 'compiling', 'ready']);
  });

  it('goes straight from building to ready when the first world needs no gate (walk)', () => {
    start();
    viewport.setNavigationMode('walk');
    viewport.setWorld(aWorld(), BOUNDS);
    runFrames(1);
    expect(phases).toEqual(['building', 'ready']);
  });

  it('goes straight from building to ready on a renderer that cannot compile ahead', () => {
    harness.rendererHasCompile = false;
    start();
    viewport.setWorld(aWorld(), BOUNDS);
    runFrames(1);
    expect(phases).toEqual(['building', 'ready']);
  });

  it('wakes from a suspension and is ready again once the catch-up frame is drawn', async () => {
    start();
    viewport.setWorld(aWorld(), BOUNDS);
    await finishCompiles();
    runFrames(1);
    phases = [];

    viewport.setSuspended(true);
    viewport.setSuspended(false);
    expect(phases).toEqual(['waking']);
    runFrames(1);
    expect(phases).toEqual(['waking', 'ready']);
  });

  it('compiles on the way back from a suspension when the woken world brings new lights', async () => {
    start();
    viewport.setWorld(aWorld(), BOUNDS);
    await finishCompiles();
    runFrames(1);
    phases = [];

    viewport.setSuspended(true);
    viewport.setSuspended(false);
    viewport.setWorld(aWorld(), BOUNDS, 0, { lightsChanged: true });
    expect(phases).toEqual(['waking', 'compiling']);

    await finishCompiles();
    runFrames(1);
    expect(phases).toEqual(['waking', 'compiling', 'ready']);
  });

  it('keeps its phase when woken before the first picture', async () => {
    start();
    viewport.setSuspended(true);
    viewport.setSuspended(false);
    expect(phases).toEqual(['building']);

    viewport.setWorld(aWorld(), BOUNDS);
    viewport.setSuspended(true);
    viewport.setSuspended(false);
    expect(phases).toEqual(['building', 'compiling']);

    await finishCompiles();
    runFrames(1);
    expect(phases).toEqual(['building', 'compiling', 'ready']);
  });

  it('does not call a gate over a picture already on screen a loading state', async () => {
    start();
    viewport.setWorld(aWorld(), BOUNDS);
    await finishCompiles();
    runFrames(1);
    phases = [];

    viewport.setWorld(aWorld(), BOUNDS, 0, { lightsChanged: true });
    await finishCompiles();
    runFrames(1);
    expect(phases).toEqual([]);
  });
});

describe('a lost WebGL context', () => {
  const loseContext = () => viewport.getDomElement().dispatchEvent(new Event('webglcontextlost', { cancelable: true }));

  it('reports lost, stops the loop, and takes back the finished picture', async () => {
    start();
    viewport.setWorld(aWorld(), BOUNDS);
    await finishCompiles();
    harness.converged = true;
    runFrames(3);
    expect(phases.at(-1)).toBe('ready');
    expect(converged.at(-1)).toBe(true);

    viewport.requestRender();
    loseContext();

    expect(phases.at(-1)).toBe('lost');
    expect(converged.at(-1)).toBe(false);
    expect(frames).toEqual([]);
    // Nothing that used to restart the loop can.
    viewport.requestRender();
    viewport.resize();
    expect(frames).toEqual([]);
  });

  it('is not flipped back to ready by a compile that resolves afterwards', async () => {
    start();
    viewport.setWorld(aWorld(), BOUNDS);
    expect(phases.at(-1)).toBe('compiling');

    loseContext();
    expect(phases.at(-1)).toBe('lost');

    await finishCompiles();
    runFrames(3);
    viewport.setSuspended(true);
    viewport.setSuspended(false);
    viewport.setWorld(aWorld(), BOUNDS, 0, { lightsChanged: true });
    await finishCompiles();
    runFrames(3);
    expect(phases.at(-1)).toBe('lost');
    expect(phases.filter((phase) => phase === 'lost')).toHaveLength(1);
  });

  it('leaves the walk, so the mouse is not held captive by a dead canvas', () => {
    start();
    const walkExit = vi.fn();
    viewport.setWalkExitHandler(walkExit);
    viewport.setNavigationMode('walk');
    viewport.setWorld(aWorld(), BOUNDS);
    runFrames(1);

    loseContext();
    expect(walkExit).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the viewport is disposed', () => {
    start();
    const canvas = viewport.getDomElement();
    const removed = vi.spyOn(canvas, 'removeEventListener');
    viewport.dispose();
    viewport = null;
    expect(removed.mock.calls.some(([type]) => type === 'webglcontextlost')).toBe(true);

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(phases).not.toContain('lost');
  });
});

describe('a viewport that fails to start', () => {
  function listenersLeftOn(target, act) {
    const added = vi.spyOn(target, 'addEventListener');
    const removed = vi.spyOn(target, 'removeEventListener');
    act();
    return added.mock.calls.filter(
      ([type, listener]) => !removed.mock.calls.some(([t, l]) => t === type && l === listener),
    );
  }

  it('leaves no listener on the document when the browser gives it no context', () => {
    harness.rendererThrows = true;
    const left = listenersLeftOn(document, () => {
      expect(() => createPreviewViewport(container)).toThrow('Error creating WebGL context.');
    });
    expect(left).toEqual([]);
  });

  it('gives back the renderer and its canvas when a later step throws', () => {
    harness.environmentThrows = true;
    const left = listenersLeftOn(document, () => {
      expect(() => createPreviewViewport(container)).toThrow('No environment.');
    });
    expect(left).toEqual([]);
    expect(harness.renderers).toHaveLength(1);
    expect(harness.renderers[0].disposed).toBe(true);
    expect(container.querySelector('canvas')).toBeNull();
  });
});
