// A group turned as one body through the real kernel
// (docs/sketch-studio-part-groups.md §3.5, §7): turnInstances on the rigid
// movers moves attached members rigidly with their in-group parent.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { Quaternion, Vector3 } from 'three';
import { createPart, emptyModel } from './model.js';
import { turnInstances } from './movement.js';
import { createKernelSession } from './kernel.js';
import { createHardware, hardwareDefaults } from './hardware.js';
import { rigidMovers } from './groups.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

const snapshotOf = (model) => {
  const session = createKernelSession(model);
  try {
    return session.snapshot();
  } finally {
    session.dispose();
  }
};
const boundsOf = (snapshot, id) => snapshot.instances.find((i) => i.id === id).bounds;
// A 90° turn about Z through `centre` maps a world box exactly onto a box.
const turnedBox = ([min, max], centre) => {
  const corners = [min, max].map((p) => [centre[0] - (p[1] - centre[1]), centre[1] + (p[0] - centre[0]), p[2]]);
  return [
    [0, 1, 2].map((i) => Math.min(corners[0][i], corners[1][i])),
    [0, 1, 2].map((i) => Math.max(corners[0][i], corners[1][i])),
  ];
};
const expectBox = (actual, expected) =>
  actual.forEach((corner, k) => corner.forEach((v, i) => expect(v).toBeCloseTo(expected[k][i], 2)));
const quarterTurn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);

describe('turning a group through the kernel', () => {
  it('a tube fixed to a board turns rigidly with it, its own pose untouched', () => {
    const board = createPart('board'),
      tube = createPart('member');
    const model = {
      ...emptyModel(),
      parts: [board.part, tube.part],
      instances: [
        { ...board.instance, id: 'board', position: [100, 50, 0], rotation: [0, 0, 20] },
        { ...tube.instance, id: 'tube', position: [30, 40, 18], rotation: [0, 0, 0] },
      ],
      connections: [{ id: 'fix', type: 'fixed', from: 'tube', to: 'board', offset: [0, 0, 0] }],
      groups: [{ id: 'g', name: 'Group 1', parentId: null }],
    };
    model.instances.forEach((i) => (i.groupId = 'g'));
    const before = snapshotOf(model);
    const movers = rigidMovers(model, ['board', 'tube']);
    expect(movers).toEqual(['board']);
    const centre = [400, 300, 100];
    const turned = turnInstances(model, movers, quarterTurn, centre);
    expect(turned.instances[1]).toBe(model.instances[1]);
    const after = snapshotOf(turned);
    for (const id of ['board', 'tube']) expectBox(boundsOf(after, id), turnedBox(boundsOf(before, id), centre));
  }, 30000);

  it('a bolt concentric in a hole of the board turns rigidly with it', () => {
    const hole = {
      id: 'hole',
      type: 'hole',
      position: [200, 100, 18],
      direction: [0, 0, -1],
      diameter: 8,
      throughAll: true,
    };
    const bolt = createHardware(hardwareDefaults('bolt'));
    const model = {
      ...emptyModel(),
      parts: [
        {
          id: 'plate',
          name: 'Plate',
          features: [{ id: 'base', type: 'box', width: 400, depth: 300, height: 18 }, hole],
        },
        bolt.part,
      ],
      instances: [
        { id: 'plate', partId: 'plate', position: [0, 0, 0], rotation: [0, 0, 0] },
        { ...bolt.instance, id: 'bolt', rotation: [0, 0, 35] },
      ],
      connections: [
        {
          id: 'pin',
          type: 'concentric',
          from: 'bolt',
          to: 'plate',
          fromFeatureId: bolt.part.features[0].id,
          toFeatureId: 'hole',
          offset: 0,
        },
      ],
    };
    const before = snapshotOf(model);
    const movers = rigidMovers(model, ['plate', 'bolt']);
    expect(movers).toEqual(['plate', 'bolt']);
    const centre = [-150, 80, 0];
    const after = snapshotOf(turnInstances(model, movers, quarterTurn, centre));
    for (const id of ['plate', 'bolt']) expectBox(boundsOf(after, id), turnedBox(boundsOf(before, id), centre));
  }, 30000);
});
