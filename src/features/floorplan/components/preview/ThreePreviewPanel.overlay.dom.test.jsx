/* @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/domain/models';
import ThreePreviewPanel from './ThreePreviewPanel';

/*
  The selection overlay across scene rebuilds, against a stand-in viewport and
  scene cache. A rebuild that leaves the selected object as it was keeps the
  overlay on screen; one that changes it, or a change of selection, builds a
  new one. Counted on the viewport's own `setSelectionOverlay` and on the
  overlay builder.
*/

const stand = vi.hoisted(() => ({
  viewports: [],
  meshMap: new Map(),
  overlayBuilds: 0,
  selectedId: 'wall_a',
}));

function standInViewport() {
  const viewport = {
    materialPalette: {},
    overlays: [],
    resize() {},
    dispose() {},
    setPickHandler() {},
    setPickContext() {},
    setViewPresetHandler() {},
    setRenderStatusHandler() {},
    setLoadStatusHandler(handler) {
      handler?.({ phase: 'building', parallelShaderCompile: true });
    },
    setWalkPhysicsMode() {},
    setWalkUiHandler() {},
    setWalkExitHandler() {},
    setCompassHeadingHandler() {},
    setFacing() {},
    setWorld() {},
    setSuspended() {},
    setSelectionOverlay(overlay) {
      viewport.overlays.push(overlay);
    },
    setSun() {},
    setNavigationMode() {},
    setRenderStyle() {},
    setViewMode() {},
    getViewMode: () => 'solid',
    setInteriorLighting() {},
    setActiveFloorContext() {},
    applyRoofAppearance() {},
    setViewPreset() {},
    getViewPreset: () => 'free',
    resetView() {},
    captureImage: () => null,
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
    build: () => ({ root: {}, batchRoot: null, meshMap: stand.meshMap, lightsChanged: false }),
    dispose() {},
  }),
}));

vi.mock('@/three/scene/buildPreviewScene', () => ({
  // A fresh descriptor every call, as the real one is on every project change.
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
  buildSelectionOverlay: () => {
    stand.overlayBuilds += 1;
    return { overlay: stand.overlayBuilds };
  },
}));

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useEditorState: () => ({
    selectedId: stand.selectedId,
    selectedType: 'wall',
    activePhaseId: null,
    phaseViewMode: 'all',
    sunStudy: null,
    hiddenWallBoards: undefined,
    hiddenCeilingBoards: undefined,
    dispatch() {},
  }),
}));

const wall = (id, x) => ({
  id,
  kind: 'wall',
  geometry: 'box',
  position: { x, y: 0, z: 0 },
  size: { x: 1000, y: 3000, z: 150 },
});
const meshMapOf = (...descriptors) =>
  new Map(descriptors.map((descriptor) => [descriptor.id, { descriptor, floorVisible: true }]));

/** Let the panel's throttled rebuild land. */
const rebuild = () => act(() => new Promise((resolve) => setTimeout(resolve, 90)));

beforeEach(() => {
  stand.viewports = [];
  stand.overlayBuilds = 0;
  stand.selectedId = 'wall_a';
  stand.meshMap = meshMapOf(wall('wall_a', 0), wall('wall_b', 2000));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('ThreePreviewPanel selection overlay across rebuilds', () => {
  it('keeps the overlay through a rebuild that left the selected object as it was', async () => {
    const view = render(
      <ThreePreviewPanel project={createProject('A')} activeFloorId={null} applyPhaseFilter={false} />,
    );
    await rebuild();
    const viewport = stand.viewports.at(-1);
    const builtAtFirst = stand.overlayBuilds;
    const setAtFirst = viewport.overlays.length;
    expect(builtAtFirst).toBeGreaterThan(0);

    // Another wall moved; the selected one did not (equal, though a new object).
    stand.meshMap = meshMapOf(wall('wall_a', 0), wall('wall_b', 2500));
    view.rerender(<ThreePreviewPanel project={createProject('B')} activeFloorId={null} applyPhaseFilter={false} />);
    await rebuild();
    expect(stand.overlayBuilds).toBe(builtAtFirst);
    expect(viewport.overlays.length).toBe(setAtFirst);
  });

  it('rebuilds the overlay when the selected object itself changed', async () => {
    const view = render(
      <ThreePreviewPanel project={createProject('A')} activeFloorId={null} applyPhaseFilter={false} />,
    );
    await rebuild();
    const viewport = stand.viewports.at(-1);
    const builtAtFirst = stand.overlayBuilds;

    stand.meshMap = meshMapOf(wall('wall_a', 300), wall('wall_b', 2000));
    view.rerender(<ThreePreviewPanel project={createProject('B')} activeFloorId={null} applyPhaseFilter={false} />);
    await rebuild();
    expect(stand.overlayBuilds).toBe(builtAtFirst + 1);
    expect(viewport.overlays.at(-1)).toEqual({ overlay: stand.overlayBuilds });
  });

  it('rebuilds the overlay when the selected object went out of view', async () => {
    const view = render(
      <ThreePreviewPanel project={createProject('A')} activeFloorId={null} applyPhaseFilter={false} />,
    );
    await rebuild();
    const builtAtFirst = stand.overlayBuilds;

    stand.meshMap = new Map([
      ['wall_a', { descriptor: wall('wall_a', 0), floorVisible: false }],
      ['wall_b', { descriptor: wall('wall_b', 2000), floorVisible: true }],
    ]);
    view.rerender(<ThreePreviewPanel project={createProject('B')} activeFloorId={null} applyPhaseFilter={false} />);
    await rebuild();
    expect(stand.overlayBuilds).toBe(builtAtFirst + 1);
  });
});
