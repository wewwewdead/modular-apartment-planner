// Phase J through the real kernel: a hole or pocket placed with a click
// (placementCuts.js) is cut square to the clicked face, and a pocket's
// rectangle is oriented as its ghost (cutWidthDirection) on any face.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel } from './model.js';
import { createKernelSession } from './kernel.js';
import { createOperationDraft, operationModel } from './operations.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import { instanceOperations, placeClick, placeFrame, placementView, startPlacement } from './placementTool.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);
const close = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};
// A box part on an instance with the given pose, built by the kernel.
function build(size, { rotation = [0, 0, 0], position = [0, 0, 0] } = {}) {
  const [width, depth, height] = size;
  const part = { id: 'p', name: 'Plate', features: [{ id: 'box', type: 'box', width, depth, height }] };
  const instance = { id: 'i', partId: 'p', name: '', position, rotation };
  const model = { ...emptyModel(), parts: [part], instances: [instance] };
  const session = createKernelSession(model);
  try {
    return { model, snapshot: session.snapshot(), ops: instanceOperations(instance) };
  } finally {
    session.dispose();
  }
}
// Place a cut with a click on the face through `local` with outward `normal`
// (part coordinates), then build the result.
function cutAt(w, type, local, normal, patch = {}) {
  const ctx = { model: w.model, snapshot: w.snapshot, parameters: {} };
  const point = mapPlacement(local, w.ops);
  const worldNormal = mapPlacement(normal, w.ops, true);
  const draft = placeClick(
    createOperationDraft({ type, model: w.model, placement: startPlacement({ type }) }),
    {
      kind: 'face',
      planar: true,
      instanceId: 'i',
      partId: 'p',
      point,
      normal: worldNormal,
      faceFrame: placeFrame(point, worldNormal),
      outline: [],
      snapKind: 'face',
    },
    ctx,
  );
  const placed = { ...draft, feature: { ...draft.feature, ...patch } };
  const session = createKernelSession(operationModel(placed));
  try {
    const snapshot = session.snapshot();
    const part = snapshot.parts.find((x) => x.id === 'p');
    return { draft: placed, view: placementView(placed, ctx), metrics: part.features[placed.feature.id], part };
  } finally {
    session.dispose();
  }
}

describe('click-placed cuts in the kernel', () => {
  it('a pocket on a +X face: the 20 × 12 rectangle lies as the ghost shows (720 mm³, bounds kept)', () => {
    const w = build([100, 80, 40]);
    // Centred 6 mm below the top edge: a 12 mm height along Z fits exactly;
    // a rectangle turned the other way (20 along Z) would overhang by 4 mm.
    const { draft, view, metrics, part } = cutAt(w, 'pocket', [100, 30, 34], [1, 0, 0], {
      width: 20,
      height: 12,
      depth: 3,
    });
    expect(draft.feature.direction).toEqual([-1, 0, 0]);
    close(metrics.cut.widthDirection, [0, 1, 0]);
    close(view.shape.frame.x, metrics.cut.widthDirection);
    close(view.shape.frame.y, [0, 0, -1]);
    expect(metrics.removedVolume).toBeGreaterThan(720 * 0.99);
    expect(metrics.removedVolume).toBeLessThan(720 * 1.01);
    close(part.bounds[0], [0, 0, 0], 4);
    close(part.bounds[1], [100, 80, 40], 4);
    // The ghost's corners (world = part here) span Y 20–40 and Z 28–40.
    const corners = view.shape.loops[0].map(([u, v]) =>
      view.shape.frame.origin.map((o, k) => o + u * view.shape.frame.x[k] + v * view.shape.frame.y[k]),
    );
    expect(Math.min(...corners.map((c) => c[1]))).toBeCloseTo(20, 6);
    expect(Math.max(...corners.map((c) => c[1]))).toBeCloseTo(40, 6);
    expect(Math.min(...corners.map((c) => c[2]))).toBeCloseTo(28, 6);
    expect(Math.max(...corners.map((c) => c[2]))).toBeCloseTo(40, 6);
  }, 60000);

  it('cuts square to the face on the underside, a 37°-turned part and a 15°-tilted one', () => {
    const r = Math.PI * 9;
    const under = cutAt(build([600, 400, 18]), 'hole', [100, 100, 0], [0, 0, -1]);
    close(under.metrics.cut.direction, [0, 0, 1]);
    expect(under.metrics.removedVolume).toBeCloseTo(r * 18, 0);
    for (const rotation of [
      [0, 0, 37],
      [15, 0, 0],
    ]) {
      const w = build([600, 400, 18], { rotation, position: [40, -30, 5] });
      const { metrics } = cutAt(w, 'hole', [600, 200, 9], [1, 0, 0]);
      // The kernel's cut direction is the part-local inward normal of the clicked face.
      const inward = unmapPlacement(mapPlacement([-1, 0, 0], w.ops, true), w.ops, true);
      close(metrics.cut.direction, inward, 6);
      // Through all along the 600 mm length.
      expect(metrics.removedVolume).toBeGreaterThan(r * 600 * 0.99);
      expect(metrics.removedVolume).toBeLessThan(r * 600 * 1.01);
    }
  }, 60000);
});
