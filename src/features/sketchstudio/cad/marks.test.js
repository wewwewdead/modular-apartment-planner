import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  anchorAt,
  anchorWorld,
  defaultOffset,
  displayedInstanceMatrix,
  formatMm,
  markGeometry,
  markOffset,
  markSnapPoints,
  markValue,
  measureCandidates,
  mmPerPixelAt,
  modelPoses,
} from './marks.js';
import { instanceMatrix, placementMatrix } from './movement.js';

const close = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};
const pointsClose = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((p, i) => close(actual[i], p, digits));
};

describe('displayedInstanceMatrix', () => {
  it('composes the group matrix with the meshed pose (local → world → local)', () => {
    const placement = [{ axis: [0, 0, 1], angle: 90, origin: [0, 0, 0] }, { translation: [100, 50, 0] }];
    const group = new THREE.Matrix4().makeTranslation(5, 0, 0);
    const matrix = displayedInstanceMatrix(group, placement);
    // (10, 20, 30) turned 90° about Z → (-20, 10, 30), + (100, 50, 0), + (5, 0, 0).
    close(new THREE.Vector3(10, 20, 30).applyMatrix4(matrix).toArray(), [85, 60, 30]);
    // A turned and moved group (a drag in progress) round-trips through an anchor.
    const turned = new THREE.Matrix4()
      .makeTranslation(-40, 12, 7)
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 2, 3).normalize(), 0.7));
    const pose = { matrix: turned, placement, visible: true };
    const world = [12.5, -3, 44];
    const anchor = anchorAt(world, 'part', pose);
    expect(anchor.instanceId).toBe('part');
    close(anchorWorld(anchor, new Map([['part', pose]])), world, 9);
  });

  it('is the committed pose while the old mesh waits for a rebuild', () => {
    const meshed = [{ axis: [0, 0, 1], angle: 30, origin: [0, 0, 0] }, { translation: [10, 0, 0] }];
    const committed = { position: [200, -50, 18], rotation: [0, 90, 45] };
    // CadViewport's pending delta: instanceMatrix(committed) · placementMatrix(meshed)⁻¹.
    const delta = instanceMatrix(committed).multiply(placementMatrix(meshed).invert());
    const shown = displayedInstanceMatrix(delta, meshed).toArray();
    close(shown, instanceMatrix(committed).toArray(), 9);
  });
});

describe('anchorWorld', () => {
  const pose = { matrix: new THREE.Matrix4().makeTranslation(1, 2, 3), placement: [], visible: true };
  it('returns null for a missing or hidden part or a broken anchor', () => {
    const groups = new Map([
      ['shown', pose],
      ['hidden', { ...pose, visible: false }],
    ]);
    expect(anchorWorld({ instanceId: 'missing', local: [0, 0, 0] }, groups)).toBeNull();
    expect(anchorWorld({ instanceId: 'hidden', local: [0, 0, 0] }, groups)).toBeNull();
    expect(anchorWorld(null, groups)).toBeNull();
    expect(anchorWorld({ instanceId: 'shown' }, groups)).toBeNull();
    expect(anchorWorld({ instanceId: 'shown', local: [1, 1, 1] }, groups)).toEqual([2, 3, 4]);
  });
  it('keeps a world-fixed point where it is', () => {
    expect(anchorWorld({ instanceId: null, local: [7, 8, 9] }, new Map())).toEqual([7, 8, 9]);
    expect(anchorAt([7, 8, 9], null, null)).toEqual({ instanceId: null, local: [7, 8, 9] });
  });
});

describe('markValue and markGeometry', () => {
  it('measures and draws an aligned mark', () => {
    const mark = { along: 'aligned', offset: [0, 0, 10] };
    const A = [0, 0, 0],
      B = [30, 40, 0];
    expect(markValue(mark, A, B)).toBe(50);
    const g = markGeometry(mark, A, B);
    expect(g.value).toBe(50);
    pointsClose(g.dimension, [
      [0, 0, 10],
      [30, 40, 10],
    ]);
    // Tick = max(2, 0.1 · 10) = 2: extensions overshoot the line by 2 mm.
    pointsClose(g.extensions[0], [
      [0, 0, 0],
      [0, 0, 12],
    ]);
    pointsClose(g.extensions[1], [
      [30, 40, 0],
      [30, 40, 12],
    ]);
    close(g.labelAt, [15, 20, 10]);
    // 45° between the line direction (0.6, 0.8, 0) and the offset side (0, 0, 1), half-length 2.
    const t = [0.6, 0.8, 1].map((v) => v * Math.SQRT2);
    pointsClose(g.ticks[0], [
      [-t[0], -t[1], 10 - t[2]],
      [t[0], t[1], 10 + t[2]],
    ]);
    pointsClose(g.ticks[1], [
      [30 - t[0], 40 - t[1], 10 - t[2]],
      [30 + t[0], 40 + t[1], 10 + t[2]],
    ]);
  });

  it('measures along X, Y or Z and projects the far point onto the line', () => {
    const A = [0, 0, 0],
      B = [30, 40, 5];
    const x = markGeometry({ along: 'X', offset: [0, -20, 0] }, A, B);
    expect(x.value).toBe(30);
    pointsClose(x.dimension, [
      [0, -20, 0],
      [30, -20, 0],
    ]);
    pointsClose(x.extensions[0], [
      [0, 0, 0],
      [0, -22, 0],
    ]);
    // B's extension runs from B to B' and on by 2 mm (not square to the line).
    const run = Math.hypot(60, 5);
    pointsClose(x.extensions[1], [
      [30, 40, 5],
      [30, -20 - (60 / run) * 2, -(5 / run) * 2],
    ]);
    close(x.labelAt, [15, -20, 0]);
    const y = markGeometry({ along: 'Y', offset: [-20, 0, 0] }, A, B);
    expect(y.value).toBe(40);
    pointsClose(y.dimension, [
      [-20, 0, 0],
      [-20, 40, 0],
    ]);
    const z = markGeometry({ along: 'Z', offset: [0, -20, 0] }, A, B);
    expect(z.value).toBe(5);
    pointsClose(z.dimension, [
      [0, -20, 0],
      [0, -20, 5],
    ]);
    // Distances are magnitudes whichever way the points were picked.
    expect(markValue({ along: 'X' }, B, A)).toBe(30);
    expect(markValue({ along: 'Y' }, [0, 10, 0], [0, -5, 0])).toBe(15);
  });
});

describe('defaultOffset', () => {
  it('stands off from the parts centre, square to the measured direction', () => {
    // A board edge measured along its front: the line goes out in front (−Y), a little up.
    const offset = defaultOffset({ A: [0, 0, 18], B: [600, 0, 18], centre: [300, 200, 9], span: 1000 });
    const n = Math.hypot(200, 9);
    close(offset, [0, (-200 / n) * 40, (9 / n) * 40]);
    // Length max(10, 0.04 · span).
    expect(Math.hypot(...defaultOffset({ A: [0, 0, 0], B: [1, 0, 0], centre: [0, 5, 0], span: 100 }))).toBeCloseTo(10);
  });

  it('removes the axis component for an axis mark', () => {
    close(defaultOffset({ A: [0, 0, 0], B: [100, 50, 0], along: 'X', centre: [50, -100, 0] }), [0, 10, 0]);
    close(defaultOffset({ A: [0, 0, 0], B: [100, 50, 0], along: 'Y', centre: [0, 0, 0] }), [10, 0, 0]);
  });

  it('falls back to Z × d, then X × d, when the centre lies on the segment', () => {
    close(defaultOffset({ A: [0, 0, 0], B: [10, 0, 0], centre: [5, 0, 0] }), [0, 10, 0]);
    close(defaultOffset({ A: [0, 0, 0], B: [0, 0, 10], centre: [0, 0, 5] }), [0, -10, 0]);
    close(defaultOffset({ A: [0, 0, 0], B: [10, 0, 0] }), [0, 10, 0]);
  });

  it('takes the centre from the anchored parts, else the scene', () => {
    const poses = new Map([
      [
        'board',
        {
          bounds: [
            [0, 0, 0],
            [600, 400, 18],
          ],
          visible: true,
        },
      ],
      [
        'far',
        {
          bounds: [
            [0, -5000, 0],
            [10, -4990, 10],
          ],
          visible: true,
        },
      ],
    ]);
    const A = [0, 0, 18],
      B = [600, 0, 18];
    const from = { instanceId: 'board', local: A },
      to = { instanceId: 'board', local: B };
    close(
      markOffset({ from, to, A, B, poses, span: 1000 }),
      defaultOffset({ A, B, centre: [300, 200, 9], span: 1000 }),
    );
    // World-fixed ends: the union of every visible box.
    const world = { instanceId: null, local: A };
    close(
      markOffset({ from: world, to: { instanceId: null, local: B }, A, B, poses, span: 1000 }),
      defaultOffset({ A, B, centre: [300, -2300, 9], span: 1000 }),
    );
  });
});

it('formats millimetres to at most two decimals', () => {
  expect(formatMm(600)).toBe('600');
  expect(formatMm(598.4999)).toBe('598.5');
  expect(formatMm(12.3456)).toBe('12.35');
  expect(formatMm(0.004)).toBe('0');
});

it('lists mark snap points with the anchors a new point copies', () => {
  const mark = {
    id: 'm',
    from: { instanceId: 'a', local: [0, 0, 0] },
    to: { instanceId: 'a', local: [10, 0, 0] },
  };
  const points = markSnapPoints([{ mark, A: [5, 0, 0], B: [15, 0, 0] }]);
  expect(points.map((p) => p.role)).toEqual(['from', 'to', 'mid']);
  expect(points[2]).toMatchObject({ point: [10, 0, 0], anchor: { instanceId: 'a', local: [5, 0, 0] } });
  const across = { ...mark, to: { instanceId: 'b', local: [1, 1, 1] } };
  expect(markSnapPoints([{ mark: across, A: [5, 0, 0], B: [15, 0, 0] }])[2].anchor).toEqual({
    instanceId: null,
    local: [10, 0, 0],
  });
  // A part never snaps to the points that ride on it.
  expect(markSnapPoints([{ mark: across, A: [5, 0, 0], B: [15, 0, 0] }], { exclude: 'a' }).map((p) => p.role)).toEqual([
    'to',
  ]);
});

describe('measureCandidates', () => {
  // Looking straight down at the origin: 200 × 200 px, 1 mm per px,
  // screen x = 100 + X, y = 100 − Y.
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 2000);
  camera.position.set(0, 0, 500);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const project = (v) => {
    const p = v.clone().project(camera);
    return [((p.x + 1) / 2) * 200, ((1 - p.y) / 2) * 200];
  };
  const at = ([x, y]) => [100 + x, 100 - y];
  const rayAt = ([px, py]) => {
    const caster = new THREE.Raycaster();
    caster.setFromCamera(new THREE.Vector2((px / 200) * 2 - 1, 1 - (py / 200) * 2), camera);
    return caster.ray;
  };
  const boxEdges = ([x0, y0, z0], [x1, y1, z1]) => {
    const c = (x, y, z) => [x, y, z];
    const rect = (z) => [c(x0, y0, z), c(x1, y0, z), c(x1, y1, z), c(x0, y1, z)];
    const bottom = rect(z0),
      top = rect(z1);
    const lines = [];
    for (let i = 0; i < 4; i++) lines.push(...bottom[i], ...bottom[(i + 1) % 4], ...top[i], ...top[(i + 1) % 4]);
    for (let i = 0; i < 4; i++) lines.push(...bottom[i], ...top[i]);
    return lines;
  };
  const group = (instanceId, min, max, extra = {}) => ({
    instanceId,
    matrix: new THREE.Matrix4(),
    placement: [],
    bounds: [min, max],
    visible: true,
    positions: boxEdges(min, max),
    ...extra,
  });
  const box = group('box', [0, 0, 0], [60, 40, 10]);
  const pick = (screen, extra = {}) =>
    measureCandidates({ pointer: screen, groups: [box], ray: rayAt(screen), camera, project, height: 200, ...extra });

  it('takes a corner first, the one nearest the camera when corners line up', () => {
    const result = pick(at([62, 41]));
    expect(result.kind).toBe('vertex');
    expect(result.point).toEqual([60, 40, 10]);
    expect(result.anchor).toEqual({ instanceId: 'box', local: [60, 40, 10] });
  });

  it('takes an edge midpoint over the edge itself', () => {
    const result = pick(at([30, 38]));
    expect(result.kind).toBe('midpoint');
    expect(result.point).toEqual([30, 40, 10]);
  });

  it('offers midpoints of segments at least 24 px long only', () => {
    const short = { ...group('short', [0, 0, 0], [20, 0, 0]), positions: [0, 0, 0, 20, 0, 0] };
    const long = { ...group('long', [0, 0, 0], [30, 0, 0]), positions: [0, 0, 0, 30, 0, 0] };
    const onShort = measureCandidates({
      pointer: at([10, 0]),
      groups: [short],
      ray: rayAt(at([10, 0])),
      camera,
      project,
      height: 200,
    });
    expect(onShort.kind).toBe('edge');
    close(onShort.point, [10, 0, 0]);
    const onLong = measureCandidates({
      pointer: at([15, 0]),
      groups: [long],
      ray: rayAt(at([15, 0])),
      camera,
      project,
      height: 200,
    });
    expect(onLong).toMatchObject({ kind: 'midpoint', point: [15, 0, 0] });
  });

  it('ranks vertex over midpoint over mark where they coincide', () => {
    // A corner of the L sits at the midpoint of the long leg; a mark ends there too.
    const ell = {
      ...group('ell', [0, 0, 0], [40, 30, 0]),
      positions: [0, 0, 0, 40, 0, 0, 20, 0, 0, 20, 30, 0],
    };
    const mark = { point: [20, 0, 0], anchor: { instanceId: 'other', local: [1, 2, 3] } };
    const options = { pointer: at([20, 0]), ray: rayAt(at([20, 0])), camera, project, height: 200 };
    expect(measureCandidates({ ...options, groups: [ell], marks: [mark] }).kind).toBe('vertex');
    const straight = { ...ell, positions: [0, 0, 0, 40, 0, 0] };
    expect(measureCandidates({ ...options, groups: [straight], marks: [mark] }).kind).toBe('midpoint');
    const bare = { ...ell, positions: [] };
    expect(measureCandidates({ ...options, groups: [bare], marks: [mark] })).toEqual({
      point: [20, 0, 0],
      kind: 'mark',
      anchor: mark.anchor,
    });
  });

  it('takes a mark point over the edge it lies on, and an edge over the face', () => {
    const mark = { point: [15, 40, 10], anchor: { instanceId: 'box', local: [15, 40, 10] } };
    expect(pick(at([15, 39]), { marks: [mark] })).toEqual({ ...mark, kind: 'mark' });
    const hit = { point: [45, 37, 10], instanceId: 'box' };
    const onEdge = pick(at([45, 37]), { hit });
    expect(onEdge.kind).toBe('edge');
    close(onEdge.point, [45, 40, 10]);
    const onFace = pick(at([30, 20]), { hit: { point: [30, 20, 10], instanceId: 'box' } });
    expect(onFace).toEqual({ point: [30, 20, 10], kind: 'face', anchor: { instanceId: 'box', local: [30, 20, 10] } });
    expect(pick(at([90, -90]))).toBeNull();
  });

  it('hides corners behind the surface under the cursor, keeps silhouette corners without one', () => {
    // A plate 50 mm above the box covers its corner: 50 mm > 16 px · 1 mm/px.
    const plate = group('plate', [-50, -50, 50], [50, 50, 50]);
    const options = { pointer: at([0, 0]), ray: rayAt(at([0, 0])), camera, project, height: 200 };
    const covered = measureCandidates({
      ...options,
      groups: [box, plate],
      hit: { point: [0, 0, 50], instanceId: 'plate' },
    });
    expect(covered.kind).toBe('face');
    expect(covered.point).toEqual([0, 0, 50]);
    // Within the slack (the box's own top, 10 mm above its bottom corner) the corner stays.
    const ownTop = measureCandidates({ ...options, groups: [box], hit: { point: [0.5, 0.5, 10], instanceId: 'box' } });
    expect(ownTop).toMatchObject({ kind: 'vertex', point: [0, 0, 10] });
    // No hit (the cursor just off the silhouette): no occlusion test.
    const lower = group('lower', [0, 0, -100], [60, 40, -90]);
    const silhouette = measureCandidates({
      ...options,
      pointer: at([-3, -3]),
      ray: rayAt(at([-3, -3])),
      groups: [lower],
    });
    expect(silhouette).toMatchObject({ kind: 'vertex', point: [0, 0, -90] });
  });

  it('anchors to the part in its own frame and skips parts off the cursor', () => {
    const moved = group('moved', [0, 0, 0], [60, 40, 10], {
      matrix: new THREE.Matrix4().makeTranslation(-80, -60, 0),
      placement: [{ translation: [5, 0, 0] }],
    });
    const result = measureCandidates({
      pointer: at([-80, -60]),
      groups: [moved],
      ray: rayAt(at([-80, -60])),
      camera,
      project,
      height: 200,
    });
    expect(result.point).toEqual([-80, -60, 10]);
    // Meshed at +5 X, shown 80 / 60 further: local = world − both.
    close(result.anchor.local, [-5, 0, 10]);
    // Culling uses the box: with bounds far away the edges are not even looked at.
    const culled = {
      ...box,
      bounds: [
        [500, 500, 0],
        [510, 510, 0],
      ],
    };
    expect(
      measureCandidates({ pointer: at([60, 40]), groups: [culled], ray: rayAt(at([60, 40])), camera, project }),
    ).toBeNull();
    // Hidden parts are ignored.
    expect(
      measureCandidates({
        pointer: at([60, 40]),
        groups: [{ ...box, visible: false }],
        ray: rayAt(at([60, 40])),
        camera,
        project,
      }),
    ).toBeNull();
  });

  it('works out millimetres per pixel for both cameras', () => {
    expect(mmPerPixelAt(camera, [0, 0, 0], 200)).toBe(1);
    const perspective = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    perspective.position.set(0, 0, 100);
    perspective.lookAt(0, 0, 0);
    perspective.updateMatrixWorld();
    expect(mmPerPixelAt(perspective, [0, 0, 0], 200)).toBeCloseTo(1, 9);
  });
});

it('reads poses from the committed model for the Marks panel', () => {
  const item = (id) => ({ id, placement: [{ translation: [10, 0, 0] }] });
  const model = {
    instances: [
      { id: 'moved', position: [110, 0, 0], rotation: [0, 0, 90] },
      { id: 'hidden', position: [0, 0, 0], visible: false },
      { id: 'attached', position: [999, 0, 0] },
    ],
    connections: [{ id: 'c', type: 'fixed', from: 'attached', to: 'moved' }],
  };
  const poses = modelPoses(model, {
    parameters: {},
    instances: [item('moved'), item('hidden'), item('attached'), item('gone')],
  });
  // Committed pose: turned 90° about Z, then at (110, 0, 0).
  close(anchorWorld({ instanceId: 'moved', local: [5, 0, 0] }, poses), [110, 5, 0]);
  expect(anchorWorld({ instanceId: 'hidden', local: [0, 0, 0] }, poses)).toBeNull();
  expect(anchorWorld({ instanceId: 'gone', local: [0, 0, 0] }, poses)).toBeNull();
  // Attached: where the kernel meshed it.
  close(anchorWorld({ instanceId: 'attached', local: [1, 0, 0] }, poses), [11, 0, 0]);
  expect(modelPoses(model, null).size).toBe(0);
});
