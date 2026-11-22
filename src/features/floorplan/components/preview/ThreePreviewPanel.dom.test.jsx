/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/domain/models';
import { createDrain, createRoofSystem } from '@/domain/roofModels';
import ThreePreviewPanel from './ThreePreviewPanel';

/*
  The panel against a stand-in viewport: what the panel shows and saves for
  what the viewport reports. The viewport's own reporting is pinned in
  createPreviewViewport.dom.test.js.
*/

const stand = vi.hoisted(() => ({ viewports: [], dispatched: [] }));

function standInViewport() {
  const handlers = {};
  const viewport = {
    handlers,
    // The mode on screen; the test moves it on as a compile would land.
    onScreenViewMode: 'solid',
    materialPalette: {},
    captured: 0,
    resize() {},
    dispose() {},
    setPickHandler(handler) {
      handlers.pick = handler;
    },
    setPickContext() {},
    setViewPresetHandler(handler) {
      handlers.viewPreset = handler;
    },
    setRenderStatusHandler(handler) {
      handlers.render = handler;
    },
    setLoadStatusHandler(handler) {
      handlers.load = handler;
      handler?.({ phase: 'building', parallelShaderCompile: true });
    },
    setWalkPhysicsMode() {},
    setWalkUiHandler() {},
    setWalkExitHandler() {},
    setCompassHeadingHandler() {},
    setFacing() {},
    setWorld() {},
    setSuspended() {},
    setSelectionOverlay() {},
    setSun() {},
    setNavigationMode() {},
    setRenderStyle() {},
    setViewMode() {},
    getViewMode() {
      return viewport.onScreenViewMode;
    },
    setInteriorLighting() {},
    setActiveFloorContext() {},
    applyRoofAppearance() {},
    setViewPreset() {},
    getViewPreset: () => 'iso_northeast',
    resetView() {},
    captureImage() {
      viewport.captured += 1;
      return 'data:image/png;base64,AAAA';
    },
  };
  return viewport;
}

vi.mock('./createPreviewViewport', () => ({
  createPreviewViewport: () => {
    const viewport = standInViewport();
    stand.viewports.push(viewport);
    return viewport;
  },
}));

vi.mock('./previewSceneCache', () => ({
  createPreviewSceneCache: () => ({
    build: () => ({ root: {}, batchRoot: null, meshMap: new Map(), lightsChanged: false }),
    dispose() {},
  }),
}));

vi.mock('@/three/scene/buildPreviewScene', () => ({
  buildPreviewScene: () => ({
    floors: [],
    roofLayerIds: [],
    visibleFloorIds: [],
    bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000, minElevation: 0, maxElevation: 1000 },
    groundLevel: 0,
    activeFloorId: null,
    defaultTarget: { x: 500, z: 500 },
    hasVisibleObjects: true,
  }),
}));

vi.mock('./buildPreviewObjects', async (importOriginal) => ({
  ...(await importOriginal()),
  buildSelectionOverlay: () => null,
}));

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useEditorState: () => ({
    selectedId: null,
    selectedType: null,
    activePhaseId: null,
    phaseViewMode: 'all',
    sunStudy: null,
    hiddenWallBoards: undefined,
    hiddenCeilingBoards: undefined,
    dispatch: (action) => stand.dispatched.push(action),
  }),
}));

let downloads = [];

beforeEach(() => {
  stand.viewports = [];
  stand.dispatched = [];
  downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownload() {
    downloads.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function renderPanel() {
  render(<ThreePreviewPanel project={createProject('My House')} activeFloorId={null} applyPhaseFilter={false} />);
  return stand.viewports.at(-1);
}

/** The viewport reports a first picture, finished refining. */
function showFinishedPicture(viewport) {
  act(() => {
    viewport.handlers.load({ phase: 'compiling', parallelShaderCompile: true });
    viewport.handlers.load({ phase: 'ready', parallelShaderCompile: true });
    viewport.handlers.render({ converged: true });
  });
}

const saveImage = () => screen.getByRole('button', { name: 'Save image' });
const pane = () => document.querySelector('[data-preview-pane]');

describe('Save image', () => {
  it('names the file after the mode on screen, not the one still compiling', () => {
    const viewport = renderPanel();
    showFinishedPicture(viewport);
    act(() => viewport.handlers.viewPreset('iso_northeast'));

    // X-ray asked for; its ghost programs are still linking, so the picture
    // (and what Save image captures) is still Solid.
    fireEvent.click(screen.getByRole('button', { name: 'X-ray' }));
    fireEvent.click(saveImage());
    expect(downloads).toEqual(['my-house-iso_northeast.png']);

    // The compile lands and X-ray is on screen.
    viewport.onScreenViewMode = 'xray';
    fireEvent.click(saveImage());
    expect(downloads.at(-1)).toBe('my-house-iso_northeast-xray.png');
  });
});

describe('a lost graphics context', () => {
  it('shows the failure with Try again, says what happened, and turns Save image off', () => {
    const viewport = renderPanel();
    showFinishedPicture(viewport);
    expect(pane().getAttribute('data-loading-state')).toBe('ready');
    expect(saveImage().disabled).toBe(false);

    act(() => {
      viewport.handlers.render({ converged: false });
      viewport.handlers.load({ phase: 'lost', parallelShaderCompile: true });
    });

    expect(pane().getAttribute('data-loading-state')).toBe('error');
    expect(screen.getByText(/graphics context was lost/i)).toBeTruthy();
    expect(saveImage().disabled).toBe(true);
    // No "still refining" spinner over a picture that is gone.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps Save image off even if the dead pane once more reports a finished picture', () => {
    const viewport = renderPanel();
    showFinishedPicture(viewport);
    act(() => {
      viewport.handlers.load({ phase: 'lost', parallelShaderCompile: true });
      viewport.handlers.render({ converged: true });
    });
    expect(saveImage().disabled).toBe(true);
  });

  it('builds a new viewport on Try again', () => {
    const viewport = renderPanel();
    showFinishedPicture(viewport);
    act(() => {
      viewport.handlers.load({ phase: 'lost', parallelShaderCompile: true });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(stand.viewports).toHaveLength(2);
    expect(pane().getAttribute('data-loading-state')).toBe('loading');
  });
});

describe('a pick in the 3D preview with several roofs', () => {
  function roof(id, x0, drains = []) {
    return createRoofSystem(id, {
      id,
      roofType: 'flat',
      boundaryPolygon: [
        { x: x0, y: 0 },
        { x: x0 + 6000, y: 0 },
        { x: x0 + 6000, y: 6000 },
        { x: x0, y: 6000 },
      ],
      drains,
    });
  }

  function renderTwoRoofs() {
    const drain = createDrain({ x: 13000, y: 3000 }, { id: 'drain_b' });
    const project = { ...createProject('Two roofs'), roofSystems: [roof('roof_a', 0), roof('roof_b', 10000, [drain])] };
    render(<ThreePreviewPanel project={project} activeFloorId={null} applyPhaseFilter={false} />);
    return stand.viewports.at(-1);
  }

  it('makes the roof that holds a picked drain the active roof before selecting it', () => {
    const viewport = renderTwoRoofs();
    act(() => viewport.handlers.pick({ sourceId: 'drain_b', kind: 'drain' }));
    expect(stand.dispatched).toEqual([
      { type: 'SET_ACTIVE_ROOF', roofId: 'roof_b' },
      { type: 'SELECT_OBJECT', id: 'drain_b', objectType: 'drain' },
    ]);
  });

  it('selects a picked roof itself, which activates it in the store', () => {
    const viewport = renderTwoRoofs();
    act(() => viewport.handlers.pick({ sourceId: 'roof_b', kind: 'roofSystem' }));
    expect(stand.dispatched).toEqual([{ type: 'SELECT_OBJECT', id: 'roof_b', objectType: 'roofSystem' }]);
  });
});
