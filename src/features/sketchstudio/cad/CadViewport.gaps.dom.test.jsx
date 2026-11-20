// @vitest-environment jsdom
// The flange gap marker at the press brake (docs/sketch-studio-corner-gaps.md
// §3.3): a row hovered in the card puts a line with end crosses between its
// two points, in the part's own group (it follows the part through poses),
// drawn through everything and never picked; it goes when the hover ends, the
// station closes or a stroke re-poses the part; cadShop() reports it.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import CadViewport from './CadViewport.jsx';
import { foldSheet, transformPoint } from './sheetMetal.js';
import { SHEET_STOCK } from './shopCatalog.js';
import { strokeTimeline } from './pressBrake.js';
import { flangeGaps } from './cornerGaps.js';
import { lCorner } from './cornerGaps.fixtures.js';

const { scenes } = vi.hoisted(() => ({ scenes: { last: null } }));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      info = { programs: [] };
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render(scene) {
        scenes.last = scene;
      }
    },
  };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { EventDispatcher, Vector3 } = await import('three');
  return {
    OrbitControls: class extends EventDispatcher {
      target = new Vector3();
      update() {}
      dispose() {}
    },
  };
});
vi.mock('three/addons/controls/TransformControls.js', async () => {
  const { EventDispatcher, Object3D } = await import('three');
  return {
    TransformControls: class extends EventDispatcher {
      getHelper() {
        return new Object3D();
      }
      setMode() {}
      setSpace() {}
      setSize() {}
      setTranslationSnap() {}
      setRotationSnap() {}
      attach() {}
      detach() {}
      dispose() {}
    },
  };
});

let frames = [],
  now = 0;
beforeEach(() => {
  scenes.last = null;
  frames = [];
  now = 1000;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 600, height: 600 }),
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The L corner, both walls made: the rear wall's end 0.2 short of the right wall's inside face.
const { feature, profile } = lCorner({ gap: 0.2 });
const fold = foldSheet(feature, profile, {});
const { rows } = flangeGaps(fold, profile, {});
const row = rows[0];
const gap = { at: row.at, flat: row.flatAt, overlap: row.overlap };
const model = {
  sketches: [{ id: feature.sketchId, name: 'Blank', plane: 'XY', profile }],
  parts: [{ id: 'sheet', name: 'Sheet', material: SHEET_STOCK.spcc.name, features: [feature] }],
  instances: [{ id: 'sheet-1', partId: 'sheet', position: [0, 0, 0], rotation: [0, 0, 0] }],
  connections: [],
};
const snapshot = {
  parts: [],
  instances: [
    {
      id: 'sheet-1',
      partId: 'sheet',
      bounds: [
        [0, 0, 0],
        [120, 100, 20],
      ],
      mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], triangles: [0, 1, 2] },
      edges: { lines: [0, 0, 0, 1, 0, 0] },
      placement: [{ translation: [0, 0, 0] }],
    },
  ],
};
const base = { key: 'brake-1', instanceId: 'sheet-1', machine: 'brake-50-2000', punch: 'a102', die: 'v8-88' };
// As the brake shows the part between hits: the last hit in the die, every bend as made.
const madeView = { ...base, fold, bendId: 'bend-right', bendIds: ['bend-right'], angles: {}, gaugePoint: null };
const props = (extra = {}) => ({
  model,
  snapshot,
  selectedId: 'sheet-1',
  ready: true,
  view: 'isometric',
  onSelect: vi.fn(),
  ...extra,
});
const shop = () => document.querySelector('.cad-viewport').cadShop();
const marker = () => scenes.last.getObjectByName('press-brake-gap');
const part = () => scenes.last.getObjectByName('press-brake-part');
const near = (p, q, tolerance = 1e-6) => p.forEach((v, i) => expect(Math.abs(v - q[i])).toBeLessThan(tolerance));

it("marks a hovered gap between its two points, in the part's group, drawn through everything and never picked", () => {
  const { rerender } = render(<CadViewport {...props({ brakeView: madeView })} />);
  expect(shop().station.gap).toBe(null);
  rerender(<CadViewport {...props({ brakeView: madeView, brakeGap: gap })} />);
  const line = marker();
  expect(line.visible).toBe(true);
  expect(line.parent).toBe(part());
  expect(line.material.depthTest).toBe(false);
  expect(`#${line.material.color.getHexString()}`).toBe('#287fb3');
  // The raycast is a no-op: picking passes through it.
  const hits = [];
  line.raycast({}, hits);
  expect(hits).toEqual([]);
  // The line, then a cross at each end; a dot at each end, a constant size on screen, never picked either.
  expect(line.geometry.getAttribute('position').count).toBe(10);
  const ends = line.getObjectByName('press-brake-gap-ends');
  expect(ends.geometry.getAttribute('position').count).toBe(2);
  expect(ends.material.sizeAttenuation).toBe(false);
  expect(ends.material.depthTest).toBe(false);
  ends.raycast({}, hits);
  expect(hits).toEqual([]);
  const reported = shop().station.gap;
  expect(reported.overlap).toBe(false);
  expect(reported.inPartGroup).toBe(true);
  // In the machine frame: the part's group placing the row's folded points.
  const frame = part().matrix.elements;
  near(reported.points[0], transformPoint(frame, row.at[0]), 1e-3);
  near(reported.points[1], transformPoint(frame, row.at[1]), 1e-3);
  expect(reported.length).toBeCloseTo(Math.hypot(...row.at[0].map((v, i) => v - row.at[1][i])), 3);
  // The hover ends: gone.
  rerender(<CadViewport {...props({ brakeView: madeView, brakeGap: null })} />);
  expect(marker().visible).toBe(false);
  expect(shop().station.gap).toBe(null);
});

it('follows the part when it is shown in another pose, and goes with the station', () => {
  const { rerender } = render(<CadViewport {...props({ brakeView: madeView, brakeGap: gap })} />);
  // Step 1 shown after it is made: the right wall lies flat again; the end on the rear wall stays.
  const scrubbed = {
    ...madeView,
    scrub: true,
    bendId: 'bend-rear',
    bendIds: ['bend-rear'],
    angles: { 'bend-right': 0 },
  };
  rerender(<CadViewport {...props({ brakeView: scrubbed, brakeGap: gap })} />);
  const frame = part().matrix.elements;
  const reported = shop().station.gap;
  near(reported.points[0], transformPoint(frame, row.at[0]), 1e-3);
  // The right wall's point lies where its flat point is now: on the sheet lying flat.
  near(reported.points[1], transformPoint(frame, row.flatAt[1]), 1e-3);
  // The station closes: the marker goes with it.
  rerender(<CadViewport {...props({ brakeView: null, brakeGap: gap })} />);
  expect(shop().station).toBe(null);
  expect(marker()?.visible ?? false).toBe(false);
});

it('is cleared when a stroke re-poses the part, and an overlap is drawn red', () => {
  const { rerender } = render(<CadViewport {...props({ brakeView: madeView, brakeGap: gap })} />);
  expect(shop().station.gap).not.toBe(null);
  const run = { token: 't1', bendId: 'bend-right', target: 90, timeline: strokeTimeline('brake-50-2000', 3.9) };
  rerender(<CadViewport {...props({ brakeView: { ...madeView, stroke: run }, brakeGap: gap })} />);
  expect(shop().station.stroking).toBe(true);
  expect(shop().station.gap).toBe(null);
  expect(marker().visible).toBe(false);
  // Back between hits with a new hover: shown again, red for an overlap.
  rerender(<CadViewport {...props({ brakeView: madeView, brakeGap: null })} />);
  rerender(<CadViewport {...props({ brakeView: madeView, brakeGap: { ...gap, overlap: true } })} />);
  expect(shop().station.gap.overlap).toBe(true);
  expect(`#${marker().material.color.getHexString()}`).toBe('#e03131');
});
