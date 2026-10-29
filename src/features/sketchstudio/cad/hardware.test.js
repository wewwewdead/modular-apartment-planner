import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel } from './model.js';
import { createKernelSession } from './kernel.js';
import { createHardware, hardwareDefaults, HARDWARE_TYPES, holePreset } from './hardware.js';
import { resolveCutPlacement, snapCutPoint, positionedCut } from './cutPlacement.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import { buildCutList, cutListCsv } from './fabrication.js';
import { annotationText, sheetSvg } from './drawings.js';
import { rearCoverExample } from './rearCover.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

it('preserves points and directions through nested assembly placements and tangent snapping', () => {
  const pose = [
    { angle: 37, axis: [1, 2, 3], origin: [10, 15, 20] },
    { translation: [102, -78, 23] },
    { angle: 91, axis: [0, 1, 0], origin: [0, 0, 0] },
  ];
  for (const direction of [false, true]) {
    const point = [3, 5, 9];
    unmapPlacement(mapPlacement(point, pose, direction), pose, direction).forEach((v, i) =>
      expect(v).toBeCloseTo(point[i], 9),
    );
  }
  const point = [2.4, 6.8, 7.1],
    normal = [0, Math.SQRT1_2, Math.SQRT1_2];
  const snapped = snapCutPoint(point, normal, 1);
  expect(snapped[0]).toBe(2);
  expect(snapped[1] + snapped[2]).toBeCloseTo(point[1] + point[2], 9);
  snapCutPoint(point, normal, 0).forEach((v, i) => expect(v).toBeCloseTo(point[i], 9));
  expect(() => positionedCut({ positionLocked: true }, point, normal)).toThrow(/Unlock/);
});

it('keeps edge distances constant after resizing while relative centers follow the stock', () => {
  const f = { type: 'hole', throughAll: true, placement: { type: 'side', side: 'top', units: 'mm', u: 12, v: 20 } };
  expect(
    resolveCutPlacement(
      f,
      [],
      [
        [0, 0, 0],
        [100, 80, 5],
      ],
    ).position,
  ).toEqual([12, 20, 5]);
  expect(
    resolveCutPlacement(
      f,
      [],
      [
        [0, 0, 0],
        [200, 160, 10],
      ],
    ).position,
  ).toEqual([12, 20, 10]);
  expect(
    resolveCutPlacement(
      { ...f, placement: { ...f.placement, units: 'percent' } },
      [],
      [
        [0, 0, 0],
        [200, 160, 10],
      ],
    ).position,
  ).toEqual([24, 32, 10]);
  expect(() =>
    resolveCutPlacement(
      f,
      [],
      [
        [0, 0, 0],
        [10, 10, 5],
      ],
    ),
  ).toThrow(/Edge distances/);
});

it('builds each hardware family as a real exportable solid with procurement notes', () => {
  const items = Object.keys(HARDWARE_TYPES).map((kind) =>
    createHardware({ ...hardwareDefaults(kind), supplierCode: 'SUPPLIER-123', installationHole: '4.2' }),
  );
  const model = { ...emptyModel(), parts: items.map((i) => i.part), instances: items.map((i) => i.instance) };
  const session = createKernelSession(model);
  try {
    const snapshot = session.snapshot();
    expect(snapshot.parts).toHaveLength(items.length);
    snapshot.parts.forEach((p) => expect(p.volume).toBeGreaterThan(0));
    const csv = cutListCsv(buildCutList(model, snapshot));
    expect(csv).toContain('SUPPLIER-123');
    expect(csv).toContain('Installation hole Ø4.2');
    expect(snapshot.parts[0].bounds[0][2]).toBeCloseTo(-12, 5);
  } finally {
    session.dispose();
  }
});

it('attaches hardware to a moved M3 pilot bore in a rotated assembly and exports its thread callout', () => {
  const hole = holePreset(
    { id: 'hole', type: 'hole', position: [25, 30, 5], direction: [0, 0, -1], throughAll: true, depth: 5 },
    'tap',
    'M3',
  );
  const hardware = createHardware(hardwareDefaults('bolt'));
  const model = {
    ...emptyModel(),
    parts: [
      { id: 'plate', name: 'Plate', features: [{ id: 'base', type: 'box', width: 100, depth: 80, height: 5 }, hole] },
      hardware.part,
    ],
    instances: [
      { id: 'plate-instance', partId: 'plate', position: [23, 45, 67], rotation: [30, 15, 80] },
      hardware.instance,
    ],
    connections: [
      {
        id: 'attachment',
        type: 'concentric',
        from: hardware.instance.id,
        to: 'plate-instance',
        fromFeatureId: hardware.part.features[0].id,
        toFeatureId: hole.id,
        offset: 0,
      },
    ],
  };
  for (const x of [25, 50]) {
    hole.position[0] = x;
    const session = createKernelSession(model);
    try {
      const snapshot = session.snapshot();
      const a = snapshot.instances.find((i) => i.id === 'plate-instance');
      const b = snapshot.instances.find((i) => i.id === hardware.instance.id);
      const center = mapPlacement(hole.position, a.placement);
      mapPlacement([0, 0, 0], b.placement).forEach((v, i) => expect(v).toBeCloseTo(center[i], 5));
      expect(annotationText({ type: 'hole', partId: 'plate', featureId: 'hole' }, model, snapshot)).toContain(
        'TAP M3 × 0.5',
      );
      expect(snapshot.parts[0].features.hole.removedVolume).toBeCloseTo(Math.PI * 1.25 ** 2 * 5, 4);
    } finally {
      session.dispose();
    }
  }
});

it('builds the rear cover reference with fourteen through holes and explicit assumptions', () => {
  const model = rearCoverExample();
  const session = createKernelSession(model);
  try {
    const snapshot = session.snapshot();
    expect(model.parts[0].features.filter((f) => f.type === 'hole')).toHaveLength(14);
    expect(snapshot.parts[0].bounds[1][2]).toBeCloseTo(16.2, 4);
    expect(model.sheets[0].notes).toContain('centers are assumed');
    const drawing = session.drawings()[0];
    expect(sheetSvg(drawing, model, snapshot)).toContain('Hole centers are assumed');
  } finally {
    session.dispose();
  }
});
