// @vitest-environment jsdom
// The press brake in the viewport (docs/sketch-studio-fab-shop.md §9 SM-2
// items 2, 6, 7): the machine drawn from the catalogue sections, every part
// hidden while the sheet stands in the die, a stroke run in its own animation
// loop (the ram down, both wings up, the ram back) and reported by its token,
// the hand-over to the committed part without a jump, a collision drawn red.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import CadViewport from './CadViewport.jsx';
import { foldSheet, poseFold } from './sheetMetal.js';
import { SHEET_STOCK, punchOf } from './shopCatalog.js';
import { STROKE_GAP, brakeFrame, strokeTimeline } from './pressBrake.js';
import { createSheetMetalPreview } from './sheetMetalPreview.js';
import { WORK_HEIGHT } from './shopLayer.js';

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
const step = (ms) => {
  now += ms;
  const run = frames;
  frames = [];
  run.forEach((callback) => callback(now));
};

const profile = { type: 'rectangle', width: 100, height: 60, origin: [0, 0] };
const feature = (bends) => ({ id: 'sm', type: 'sheetmetal', sketchId: 's', thickness: 1.5, stock: 'spcc', bends });
const hitBend = {
  id: 'hit',
  a: [20, -1],
  b: [20, 61],
  angle: 90,
  direction: 'up',
  radius: null,
  punch: 'straight-88',
  die: 'v10-88',
};
// The stroke is made on the fold with the hit; the commit gives the model's own fold of the same bends.
const strokeFold = foldSheet(feature([hitBend]), profile);
const committedFold = foldSheet(feature([{ ...hitBend }]), profile);
const box = (min, max) => {
  const vertices = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) vertices.push(x, y, z);
  return {
    vertices,
    normals: vertices.map(() => 0),
    triangles: [
      0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
    ],
  };
};
const item = (id, partId, min, max) => ({
  id,
  partId,
  bounds: [min, max],
  mesh: box(min, max),
  edges: { lines: [...min, ...max] },
  placement: [{ translation: [0, 0, 0] }],
});
const model = {
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile }],
  parts: [
    { id: 'sheet', name: 'Sheet', material: SHEET_STOCK.spcc.name, features: [feature([])] },
    { id: 'plate', name: 'Plate', material: 'Steel', features: [{ id: 'f', type: 'box' }] },
  ],
  instances: [
    { id: 'sheet-1', partId: 'sheet', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'plate-1', partId: 'plate', position: [0, 0, 0], rotation: [0, 0, 0] },
  ],
  connections: [],
};
const snapshot = {
  parts: [],
  instances: [item('sheet-1', 'sheet', [0, 0, 0], [100, 60, 1.5]), item('plate-1', 'plate', [200, 0, 0], [300, 50, 5])],
};
const base = { key: 'brake-1', instanceId: 'sheet-1', machine: 'brake-50-2000', punch: 'straight-88', die: 'v10-88' };
const setupView = {
  ...base,
  fold: strokeFold,
  bendId: 'hit',
  angles: { hit: 0 },
  gaugePoint: [0, 30],
  gaugeDistance: 20,
  collision: null,
};
const props = (extra = {}) => ({
  model,
  snapshot,
  selectedId: 'sheet-1',
  ready: true,
  view: 'isometric',
  onSelect: vi.fn(),
  ...extra,
});
const kernel = (id) => {
  let found = null;
  scenes.last.traverse((o) => {
    if (o.isMesh && o.userData.instanceId === id) found = o;
  });
  return found;
};
const shop = () => document.querySelector('.cad-viewport').cadShop();
const named = (name) => scenes.last.getObjectByName(name);
// The colour of a machine part: its mesh, or the first mesh of a sectional
// group (the punch, its holders and the die stand in sections since SF-3).
const tone = (name) => {
  let mesh = null;
  named(name).traverse((o) => {
    if (!mesh && o.isMesh) mesh = o;
  });
  return `#${mesh.material.color.getHexString()}`;
};
// The highest world Z of each piece (the part as shown).
const pieceTops = () => {
  const part = named('press-brake-part');
  part.updateMatrixWorld(true);
  return part.children[0].children
    .filter((m) => m.name.startsWith('sheet-piece'))
    .map((m) => {
      const p = m.geometry.getAttribute('position');
      let top = -Infinity;
      for (let i = 0; i < p.count; i++)
        top = Math.max(top, new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).z - WORK_HEIGHT);
      return top;
    });
};
// World positions of every piece's first outline corner (the part as shown).
const corners = () => {
  const part = named('press-brake-part');
  part.updateMatrixWorld(true);
  return part.children[0].children
    .filter((m) => m.name.startsWith('sheet-piece'))
    .map((m) => {
      const p = m.geometry.getAttribute('position');
      const world = new THREE.Vector3(p.getX(0), p.getY(0), p.getZ(0)).applyMatrix4(m.matrixWorld).toArray();
      // In the machine frame (the die top stands WORK_HEIGHT above the floor).
      return [world[0], world[1], world[2] - WORK_HEIGHT];
    });
};

it('draws the machine, hides every part and lays the pending hit flat on the die', () => {
  const { rerender } = render(<CadViewport {...props()} />);
  expect(shop().station).toBe(null);
  rerender(<CadViewport {...props({ brakeView: setupView })} />);
  expect(named('press-brake').visible).toBe(true);
  expect(named('press-brake').parent.type).toBe('Scene');
  for (const id of ['sheet-1', 'plate-1']) expect(kernel(id).parent.visible).toBe(false);
  for (const name of [
    'press-brake-bed',
    'press-brake-die',
    'press-brake-punch',
    'press-brake-upper-beam',
    'press-brake-backgauge',
  ])
    expect(named(name)).toBeDefined();
  // The punch is the catalogue section at true size, set up to the 60 mm bend.
  const punch = new THREE.Box3().setFromObject(named('press-brake-punch'));
  expect(punch.max.x - punch.min.x).toBeCloseTo(60, 6);
  expect(punch.max.z - punch.min.z).toBeCloseTo(punchOf('straight-88').height, 6);
  // Parked 40 mm above the sheet; the fingers at L 20 behind the punch line.
  expect(shop().station).toMatchObject({
    machine: 'brake-50-2000',
    bendId: 'hit',
    angle: 0,
    gaugeDistance: 20,
    stroking: false,
  });
  expect(shop().station.tipZ).toBeCloseTo(1.5 + STROKE_GAP, 9);
  expect(punch.min.z - WORK_HEIGHT).toBeCloseTo(1.5 + STROKE_GAP, 6);
  expect(named('press-brake-backgauge').position.y).toBe(20);
  // Flat on the die top, the punch line over the V.
  for (const [, , z] of corners()) expect(Math.min(Math.abs(z), Math.abs(z - 1.5))).toBeLessThan(1e-6);
  expect(frames).toHaveLength(0);
});

it('runs a stroke in its own loop, reports its token and hands over to the committed part without a jump', () => {
  const ended = vi.fn();
  const { rerender } = render(<CadViewport {...props({ brakeView: setupView, onBrakeStrokeEnd: ended })} />);
  const timeline = strokeTimeline('brake-50-2000', 3.9);
  const stroke = { token: 't1', bendId: 'hit', target: 90, timeline, commit: true };
  const strokeView = {
    ...base,
    fold: strokeFold,
    bendId: 'hit',
    angles: {},
    gaugePoint: [0, 30],
    gaugeDistance: 20,
    stroke,
  };
  rerender(<CadViewport {...props({ brakeView: strokeView, onBrakeStrokeEnd: ended })} />);
  expect(frames).toHaveLength(1);
  expect(shop().station).toMatchObject({ stroking: true, phase: 'approach', angle: 0 });
  // The ram comes down to the sheet …
  step(timeline.approach / 2);
  expect(shop().station.tipZ).toBeCloseTo(1.5 + STROKE_GAP / 2, 6);
  // … the wings rise with the punch on the inside of the bend …
  step(timeline.approach / 2 + timeline.bend / 2);
  const mid = shop().station;
  expect(mid.phase).toBe('bend');
  expect(mid.angle).toBeGreaterThan(30);
  expect(mid.angle).toBeLessThan(60);
  const posed = poseFold(strokeFold, { hit: mid.angle });
  expect(mid.tipZ).toBeCloseTo(brakeFrame(posed, 'hit', { die: 'v10-88', gaugePoint: [0, 30] }).tipZ, 6);
  // Both wings rise, at the same slope: the 20 mm wing and the 80 mm one
  // stand at heights in the ratio of their reach from the punch line.
  const [short, long] = pieceTops().sort((a, b) => a - b);
  expect(short).toBeGreaterThan(3);
  expect(long / short).toBeGreaterThan(3);
  expect(long / short).toBeLessThan(5);
  // … the same token again does not restart it.
  rerender(<CadViewport {...props({ brakeView: { ...strokeView }, onBrakeStrokeEnd: ended })} />);
  expect(shop().station.phase).toBe('bend');
  step(timeline.bend / 2 + timeline.return / 2);
  expect(shop().station).toMatchObject({ phase: 'return', angle: 90 });
  expect(ended).not.toHaveBeenCalled();
  step(timeline.return);
  expect(ended).toHaveBeenCalledWith('t1');
  expect(frames).toHaveLength(0);
  expect(shop().station).toMatchObject({ stroking: false, angle: 90 });
  expect(shop().station.tipZ).toBeCloseTo(1.5 + STROKE_GAP, 9);
  const before = corners();
  // The workspace commits: the model's own fold of the same bends, at rest in the die.
  const rest = { ...base, fold: committedFold, bendId: 'hit', angles: {}, gaugePoint: [0, 30] };
  rerender(<CadViewport {...props({ brakeView: rest, onBrakeStrokeEnd: ended })} />);
  corners().forEach((p, i) => p.forEach((v, k) => expect(v).toBeCloseTo(before[i][k], 9)));
  expect(shop().station.tipZ).toBeCloseTo(1.5 + STROKE_GAP, 9);
  // Leaving: the parts come back, the machine goes.
  rerender(<CadViewport {...props({ brakeView: null })} />);
  expect(named('press-brake').visible).toBe(false);
  expect(named('press-brake-part')).toBeUndefined();
  for (const id of ['sheet-1', 'plate-1']) expect(kernel(id).parent.visible).toBe(true);
  expect(shop().station).toBe(null);
});

it('draws a collision red at the angle it happens, on the part and the tool it hits', () => {
  const { rerender } = render(<CadViewport {...props()} />);
  const triangles = [
    [
      [0, -20, 70],
      [10, -20, 70],
      [0, -20, 80],
    ],
  ];
  rerender(
    <CadViewport
      {...props({ brakeView: { ...setupView, angles: { hit: 71 }, collision: { angle: 71, tool: 'ram', triangles } } })}
    />,
  );
  const hit = named('press-brake-collision');
  expect(hit.geometry.getAttribute('position').count).toBe(3);
  expect(`#${hit.material.color.getHexString()}`).toBe('#e03131');
  expect(tone('press-brake-upper-beam')).toBe('#e03131');
  expect(tone('press-brake-punch')).not.toBe('#e03131');
  expect(tone('press-brake-holders')).not.toBe('#e03131');
  // Posed at the hit, the ram where it would be then.
  expect(shop().station.angle).toBeCloseTo(71, 9);
  expect(shop().station.collision).toEqual({ tool: 'ram', angle: 71, marked: 1 });
  expect(shop().station.tipZ).toBeLessThan(1.5);
  rerender(<CadViewport {...props({ brakeView: setupView })} />);
  expect(named('press-brake-collision')).toBeUndefined();
  expect(tone('press-brake-upper-beam')).not.toBe('#e03131');
});

it('poses a 6-bend part for a stroke frame in a few milliseconds', () => {
  const six = foldSheet(
    feature(
      [20, 50, 90, 150, 190, 220].map((x, i) => ({
        id: `b${i + 1}`,
        a: [x, -1],
        b: [x, 81],
        angle: 90,
        direction: i % 2 ? 'down' : 'up',
      })),
    ),
    { type: 'rectangle', width: 240, height: 80, origin: [0, 0] },
  );
  const handle = createSheetMetalPreview(six, {
    body: new THREE.MeshBasicMaterial(),
    edge: new THREE.LineBasicMaterial(),
  });
  // One frame: re-pose the fold, frame the bend in the die, rewrite the preview.
  const frame = (angle) => {
    const posed = poseFold(six, { b6: angle });
    const placed = brakeFrame(posed, 'b6', { die: 'v10-88', gaugePoint: [240, 40] });
    handle.pose(posed);
    return placed;
  };
  for (let i = 0; i < 20; i++) frame(i * 4.5);
  // performance.now is this file's hand-cranked clock: time with Date.now over many frames.
  const runs = 600;
  const start = Date.now();
  for (let i = 0; i < runs; i++) frame((i * 90) / runs);
  const ms = (Date.now() - start) / runs;
  console.warn(`press brake stroke frame, 6-bend part: ${ms.toFixed(2)} ms`);
  expect(ms).toBeLessThan(16);
  handle.dispose();
});

// SM-2b: the side view card, the machine's look and the operator's camera.
const side = () => document.querySelector('figure.cad-brake-side');
const sideText = (label) => side().querySelector(`[aria-label="${label}"]`).textContent;
const camera = () => document.querySelector('.cad-viewport').cadCamera();

it('draws the side view of the very pose the 3D scene shows, frame by frame', () => {
  const ended = vi.fn();
  const { rerender } = render(<CadViewport {...props({ brakeView: setupView, onBrakeStrokeEnd: ended })} />);
  expect(side()).not.toBeNull();
  expect(side().dataset.state).toBe('rest');
  // The tooling from the catalogue sections, the sheet flat on the die, the finger at L.
  for (const tool of ['punch', 'die', 'ram', 'bed'])
    expect(side().querySelector(`.cad-side-${tool}`).getAttribute('d')).toMatch(/^M /);
  expect(side().querySelector('[aria-label="Sheet section"]').getAttribute('d')).toMatch(/^M .* Z$/);
  expect(side().querySelector('[aria-label="Backgauge finger"]').hasAttribute('hidden')).toBe(false);
  expect(sideText('Side view angle')).toBe('0°');
  expect(sideText('Punch tip from the die top')).toBe('+41.5 mm');
  expect(side().querySelector('figcaption small').textContent).toBe('Straight 88° punch · V10 88° die');
  const timeline = strokeTimeline('brake-50-2000', 3.9);
  const stroke = { token: 't2', bendId: 'hit', target: 90, timeline, commit: false };
  rerender(<CadViewport {...props({ brakeView: { ...setupView, angles: {}, stroke }, onBrakeStrokeEnd: ended })} />);
  const readings = [];
  for (let i = 0; i < 12; i++) {
    step((timeline.total / 12) * (i ? 1 : 0.5));
    const station = shop().station;
    if (!station.stroking) break;
    // The readout is the 3D pose's angle, to the tenth.
    expect(sideText('Side view angle')).toBe(`${Number(station.angle.toFixed(1))}°`);
    readings.push(station.angle);
  }
  step(timeline.total);
  expect(ended).toHaveBeenCalledWith('t2');
  expect(readings.some((a) => a > 0 && a < 90)).toBe(true);
  expect(sideText('Side view angle')).toBe('90°');
  expect(side().dataset.state).toBe('rest');
  rerender(<CadViewport {...props({ brakeView: null })} />);
  expect(side()).toBeNull();
});

it('slides the part along Y while the ram lifts when the stroke takes it off along a slant (shop punches §5.3)', () => {
  const ended = vi.fn();
  const { rerender } = render(<CadViewport {...props({ brakeView: setupView, onBrakeStrokeEnd: ended })} />);
  const timeline = strokeTimeline('brake-50-2000', 3.9);
  const view = { ...setupView, angles: {} };
  const bottom = brakeFrame(poseFold(strokeFold, { hit: 90 }), 'hit', { die: 'v10-88', gaugePoint: [0, 30] }).tipZ;
  // The same stroke lifted straight (no takeOff) and taken off at −15° (toward the operator), read mid-return.
  const midReturn = (token, takeOff) => {
    rerender(
      <CadViewport
        {...props({
          brakeView: { ...view, stroke: { token, bendId: 'hit', target: 90, timeline, commit: false, takeOff } },
          onBrakeStrokeEnd: ended,
        })}
      />,
    );
    step(timeline.approach + timeline.bend + timeline.return / 2);
    const station = shop().station;
    expect(station.phase).toBe('return');
    const at = {
      corners: corners(),
      slide: station.slide,
      tipZ: station.tipZ,
      takeOff: station.takeOff,
      sheet: side().querySelector('[aria-label="Sheet section"]').getAttribute('transform'),
    };
    step(timeline.return);
    expect(ended).toHaveBeenCalledWith(token);
    return at;
  };
  const straight = midReturn('s1', null);
  expect(straight).toMatchObject({ slide: 0, takeOff: null, sheet: null });
  const slanted = midReturn('s2', -15);
  expect(slanted.takeOff).toBe(-15);
  expect(slanted.tipZ).toBeCloseTo(straight.tipZ, 9);
  // tan(−15°) × the ram's lift so far: toward the operator (−Y), a few mm.
  const lift = slanted.tipZ - bottom;
  expect(lift).toBeGreaterThan(10);
  expect(slanted.slide).toBeCloseTo(Math.tan((-15 * Math.PI) / 180) * lift, 9);
  slanted.corners.forEach((p, i) => {
    expect(p[0]).toBeCloseTo(straight.corners[i][0], 6);
    expect(p[1]).toBeCloseTo(straight.corners[i][1] + slanted.slide, 6);
    expect(p[2]).toBeCloseTo(straight.corners[i][2], 6);
  });
  // The side view slides the sheet with it.
  expect(slanted.sheet).toBe(`translate(${Number(slanted.slide.toFixed(3))} 0)`);
  // Done: the part at rest in the die as before (view only; the committed pose is today's).
  expect(shop().station.slide).toBe(0);
  expect(side().querySelector('[aria-label="Sheet section"]').hasAttribute('transform')).toBe(false);
});

it('shows a collision on the side view: the tool hit red, the pose at the hit', () => {
  const triangles = [
    [
      [0, -20, 70],
      [10, -20, 70],
      [0, -20, 80],
    ],
  ];
  render(
    <CadViewport
      {...props({ brakeView: { ...setupView, angles: { hit: 71 }, collision: { angle: 71, tool: 'ram', triangles } } })}
    />,
  );
  expect(side().dataset.state).toBe('collision');
  expect(side().querySelector('.cad-side-ram').classList.contains('is-hit')).toBe(true);
  expect(side().querySelector('.cad-side-punch').classList.contains('is-hit')).toBe(false);
  expect(sideText('Side view angle')).toBe('71°');
  expect(sideText('Side view collision')).toBe('Hits the ram at 71°');
});

it('gives every machine part its own tone, lights the operator side and draws the die by the part', () => {
  render(<CadViewport {...props({ brakeView: setupView })} />);
  const colour = tone;
  const tools = ['press-brake-die', 'press-brake-punch'];
  const beams = ['press-brake-bed', 'press-brake-upper-beam', 'press-brake-frame'];
  const tones = [...tools, ...beams, 'press-brake-finger-left', 'press-brake-gauge-beam'].map(colour);
  expect(new Set(tones).size).toBe(tones.length);
  // Tooling lighter than the beams.
  const light = (hex) => new THREE.Color(hex).getHSL({}).l;
  for (const tool of tools) for (const beam of beams) expect(light(colour(tool))).toBeGreaterThan(light(colour(beam)));
  // The station's own lights, on only while it shows; the floor grid off meanwhile.
  expect(named('press-brake-light-1').isDirectionalLight).toBe(true);
  expect(named('press-brake-light-1').parent.name).toBe('press-brake');
  let grid = null;
  scenes.last.traverse((o) => {
    if (o.type === 'GridHelper') grid = o;
  });
  expect(grid.visible).toBe(false);
  // Sectional tooling (shop floor §6.2): the die is set up under the 60 mm bend
  // only (before SF-3 it was drawn over the part with 40 mm each end), the
  // punch and its holders over the same run, the upper beam the bed's length.
  const die = new THREE.Box3().setFromObject(named('press-brake-die'));
  expect(die.min.x).toBeCloseTo(-30, 6);
  expect(die.max.x).toBeCloseTo(30, 6);
  const holders = new THREE.Box3().setFromObject(named('press-brake-holders'));
  expect(holders.max.x - holders.min.x).toBeCloseTo(60, 6);
  expect(holders.max.z - holders.min.z).toBeCloseTo(100, 6);
  const beam = new THREE.Box3().setFromObject(named('press-brake-upper-beam'));
  expect(beam.min.z - holders.max.z).toBeCloseTo(0, 6);
  // The pending punch line is marked on the sheet's top face, over the V.
  const line = named('press-brake-punch-line');
  expect(line.visible).toBe(true);
  const p = line.geometry.getAttribute('position');
  expect(p.count).toBe(2);
  expect(Math.abs(p.getY(0))).toBeLessThan(1e-5);
  expect(p.getZ(0)).toBeCloseTo(1.5 + 0.15, 5);
  expect(Math.abs(p.getX(1) - p.getX(0))).toBeCloseTo(60, 4);
});

it('opens on the operator view of the part in the machine, frames it again after a hit and on Fit', () => {
  const ended = vi.fn();
  const { rerender } = render(<CadViewport {...props({ onBrakeStrokeEnd: ended })} />);
  const before = camera();
  rerender(<CadViewport {...props({ brakeView: setupView, onBrakeStrokeEnd: ended })} />);
  const eye = camera();
  const [dx, dy, dz] = eye.position.map((v, i) => v - eye.target[i]);
  // In front of the machine (−Y), round toward the right end, looking down 25°.
  expect(dy).toBeLessThan(0);
  expect(dx).toBeGreaterThan(0);
  expect((Math.atan2(dz, Math.hypot(dx, dy)) * 180) / Math.PI).toBeCloseTo(25, 6);
  expect((Math.atan2(dx, -dy) * 180) / Math.PI).toBeCloseTo(35, 6);
  // Framed on the part and the tooling round it (well under a metre), near the die top.
  expect(eye.span).toBeLessThan(600);
  expect(Math.abs(eye.target[2] - WORK_HEIGHT)).toBeLessThan(150);
  // Fit: the operator's view of the station again.
  rerender(<CadViewport {...props({ brakeView: setupView, onBrakeStrokeEnd: ended, fitKey: 1 })} />);
  camera().position.forEach((v, i) => expect(v).toBeCloseTo(eye.position[i], 6));
  // A standard view frames the station from its side instead of the hidden parts.
  rerender(<CadViewport {...props({ brakeView: setupView, onBrakeStrokeEnd: ended, fitKey: 1, view: 'top' })} />);
  const top = camera();
  expect(top.position[2] - top.target[2]).toBeGreaterThan(0);
  expect(Math.hypot(top.position[0] - top.target[0], top.position[1] - top.target[1])).toBeLessThan(1e-6);
  expect(Math.abs(top.target[2] - WORK_HEIGHT)).toBeLessThan(150);
  // A hit made puts the operator's view back.
  const timeline = strokeTimeline('brake-50-2000', 3.9);
  const stroke = { token: 't3', bendId: 'hit', target: 90, timeline, commit: true };
  rerender(
    <CadViewport
      {...props({ brakeView: { ...setupView, angles: {}, stroke }, onBrakeStrokeEnd: ended, fitKey: 1, view: 'top' })}
    />,
  );
  step(timeline.total / 2);
  step(timeline.total);
  expect(ended).toHaveBeenCalledWith('t3');
  const after = camera();
  expect(after.position[1] - after.target[1]).toBeLessThan(0);
  // Leaving restores the camera the user had.
  rerender(<CadViewport {...props({ brakeView: null, onBrakeStrokeEnd: ended, fitKey: 1, view: 'top' })} />);
  camera().position.forEach((v, i) => expect(v).toBeCloseTo(before.position[i], 6));
});

// The replay (docs/sketch-studio-shop-floor.md §8): its hits run on the film's
// clock (frozen while paused), and its camera comes back as it ends — over a
// press brake the film opened and closed on the way.
it("plays a replay's hit on the film's clock and puts the camera back when the film ends", () => {
  const ended = vi.fn();
  let filmMs = 0;
  const { rerender } = render(<CadViewport {...props({ onBrakeStrokeEnd: ended })} />);
  const before = camera();
  const film = { key: 'film-1', ids: ['sheet-1', 'plate-1'], brake: true };
  rerender(<CadViewport {...props({ film, onBrakeStrokeEnd: ended })} />);
  // The product framed: the centre of both parts' boxes (0 … 300 along X).
  expect(camera().target[0]).toBeCloseTo(150, 6);
  const timeline = strokeTimeline('brake-50-2000', 3.9);
  const stroke = { token: 'f1', bendId: 'hit', target: 90, timeline, commit: false, clock: () => filmMs };
  const view = { ...base, key: 'film-1:bend:sheet-1', fold: strokeFold, bendId: 'hit', angles: {}, gaugePoint: null };
  rerender(<CadViewport {...props({ film, brakeView: { ...view, stroke }, onBrakeStrokeEnd: ended })} />);
  // Paused at the scene's start: however long, the ram stays parked.
  step(5000);
  expect(shop().station).toMatchObject({ stroking: true, phase: 'approach', angle: 0 });
  filmMs = timeline.approach + timeline.bend / 2;
  step(16);
  const mid = shop().station.angle;
  expect(mid).toBeGreaterThan(30);
  expect(mid).toBeLessThan(60);
  step(5000);
  expect(shop().station.angle).toBe(mid);
  filmMs = timeline.total + 1;
  step(16);
  expect(shop().station).toMatchObject({ stroking: false, angle: 90 });
  // A replay's hit is view only: its end is reported, nothing reframes for a commit.
  expect(ended).toHaveBeenCalledWith('f1');
  // The film ends on the brake: the station goes and the camera is the one before the film.
  rerender(<CadViewport {...props({ film: null, brakeView: null, onBrakeStrokeEnd: ended })} />);
  expect(shop().station).toBe(null);
  camera().position.forEach((v, i) => expect(v).toBeCloseTo(before.position[i], 6));
  camera().target.forEach((v, i) => expect(v).toBeCloseTo(before.target[i], 6));
});
