// Test fixtures shared by placementCuts.test.js and placementHardware.test.js
// (Phase J / M): a 600 × 400 × 18 board with kernel-like snapshot metrics,
// click info for its flat faces, and a draft opened in Place.
import { emptyModel } from './model.js';
import { createOperationDraft } from './operations.js';
import { mapPlacement } from './placement.js';
import { instanceOperations, placeFrame, startPlacement } from './placementTool.js';

export const BOARD = [
  [0, 0, 0],
  [600, 400, 18],
];

const worldBounds = (placement) => {
  const corners = [];
  for (const x of [0, 600])
    for (const y of [0, 400]) for (const z of [0, 18]) corners.push(mapPlacement([x, y, z], placement));
  const bounds = [0, 1, 2].map((k) => [Math.min(...corners.map((c) => c[k])), Math.max(...corners.map((c) => c[k]))]);
  return [bounds.map((b) => b[0]), bounds.map((b) => b[1])];
};

// A board instance 'b1' (600 × 400 × 18), optionally turned and moved, with
// optional extra features (their kernel metrics in `metrics`). `more`: further
// instances of the same board ({ id, name, position, rotation }).
export function world({ rotation = [0, 0, 0], position = [0, 0, 0], features = [], metrics = {}, more = [] } = {}) {
  const part = {
    id: 'board',
    name: 'Board',
    features: [{ id: 'box', type: 'box', width: 600, depth: 400, height: 18 }, ...features],
  };
  const instance = { id: 'b1', partId: 'board', name: '', position, rotation };
  const others = more.map((m) => ({ name: '', position: [0, 0, 0], rotation: [0, 0, 0], ...m, partId: 'board' }));
  const instances = [instance, ...others];
  const model = { ...emptyModel(), parts: [part], instances };
  const placement = instanceOperations(instance);
  const snapshot = {
    parameters: {},
    parts: [{ id: 'board', bounds: BOARD, features: { box: { bounds: BOARD }, ...metrics } }],
    instances: instances.map((i) => {
      const ops = instanceOperations(i);
      return { id: i.id, partId: 'board', placement: ops, bounds: worldBounds(ops) };
    }),
  };
  return { model, snapshot, placement, ctx: { model, snapshot, parameters: {} } };
}

// Click info for a flat face given in part coordinates (of `instanceId`).
export function face(w, localPoint, localNormal, extra = {}) {
  const instanceId = extra.instanceId || 'b1';
  const ops = w.snapshot.instances.find((i) => i.id === instanceId).placement;
  const point = mapPlacement(localPoint, ops);
  const normal = mapPlacement(localNormal, ops, true);
  return {
    kind: 'face',
    planar: true,
    instanceId,
    partId: 'board',
    point,
    normal,
    faceFrame: { ...placeFrame(point, normal), origin: mapPlacement([0, 0, localPoint[2]], ops) },
    outline: [],
    snapKind: 'face',
    ...extra,
  };
}

export const placeDraft = (w, type, extra = {}) =>
  createOperationDraft({ type, model: w.model, placement: startPlacement({ type, ...extra }) });
