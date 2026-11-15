// Line up holes (mate.js lineUpHoles, lineUpNodes): the maths that puts a
// part's holes on another's — the kiosk example seats its displays and
// covers with it.
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { emptyModel, normalizeModel } from './model.js';
import { lineUpHoles, lineUpNodes } from './mate.js';
import { instanceMatrix } from './movement.js';

const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const sheet = (id, sketchId) => ({
  id,
  name: id,
  material: 'SPCC cold-rolled steel',
  features: [{ id: `${id}-f`, type: 'sheetmetal', sketchId, thickness: 1.5, stock: 'spcc', bends: [] }],
});
const at = (id, partId, extra = {}) => ({
  id,
  partId,
  name: '',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  visible: true,
  ...extra,
});

describe('Line up holes', () => {
  // A moving part's two holes, posed at random; the target holes on a plate's top face.
  const turned = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 0.5).normalize(), 1.1);
  const pose = (point) =>
    new Vector3(...point)
      .applyQuaternion(turned)
      .add(new Vector3(30, -40, 70))
      .toArray();
  const along = (normal) => new Vector3(...normal).applyQuaternion(turned).toArray();
  const movingA = { point: pose([0, 0, 0]), normal: along([0, 0, -1]) };
  const movingB = { point: pose([100, 0, 0]), normal: along([0, 0, -1]) };
  const targetA = { point: [40, 40, 1.5], normal: [0, 0, 1] };
  const targetB = { point: [140, 40, 1.5], normal: [0, 0, 1] };
  const apply = (result, point) =>
    new Vector3(...point)
      .sub(new Vector3(...result.centre))
      .applyQuaternion(new Quaternion(...result.quaternion))
      .add(new Vector3(...result.centre))
      .add(new Vector3(...result.translation))
      .toArray();
  it('makes the first pair’s axes one, face against face', () => {
    const result = lineUpHoles([{ moving: movingA, target: targetA }]);
    apply(result, movingA.point).forEach((v, i) => expect(v).toBeCloseTo(targetA.point[i], 9));
    const normal = new Vector3(...movingA.normal).applyQuaternion(new Quaternion(...result.quaternion));
    expect(normal.dot(new Vector3(0, 0, 1))).toBeCloseTo(-1, 9);
    expect(result.residual).toBe(null);
  });
  it('takes out the spin with a second pair, and says how far apart unequal spacings leave it', () => {
    const result = lineUpHoles([
      { moving: movingA, target: targetA },
      { moving: movingB, target: targetB },
    ]);
    apply(result, movingA.point).forEach((v, i) => expect(v).toBeCloseTo(targetA.point[i], 9));
    apply(result, movingB.point).forEach((v, i) => expect(v).toBeCloseTo(targetB.point[i], 9));
    expect(result.residual).toBeCloseTo(0, 9);
    // The second target 2 mm further out: lined up on the line, 2 mm short.
    const off = lineUpHoles([
      { moving: movingA, target: targetA },
      { moving: movingB, target: { ...targetB, point: [142, 40, 1.5] } },
    ]);
    expect(off.residual).toBeCloseTo(2, 9);
    const landed = apply(off, movingB.point);
    expect(landed[1]).toBeCloseTo(40, 9);
    expect(landed[2]).toBeCloseTo(1.5, 9);
  });
  it('moves the parts as one body in the model', () => {
    const model = normalizeModel({
      ...emptyModel(),
      sketches: [
        { id: 's1', name: 'Plate', plane: 'XY', profile: rect(200, 150) },
        { id: 's2', name: 'Cover', plane: 'XY', profile: rect(200, 150) },
      ],
      parts: [sheet('plate', 's1'), sheet('cover', 's2')],
      instances: [at('ip', 'plate'), at('ic', 'cover', { position: [0, 0, 1.5] })],
    });
    // The cover's corner hole at its own (10, 10) bottom face; the plate's at (50, 60) top face.
    const { model: next } = lineUpNodes(model, {
      movers: ['ic'],
      pairs: [
        {
          moving: { point: [10, 10, 1.5], normal: [0, 0, -1] },
          target: { point: [50, 60, 1.5], normal: [0, 0, 1] },
        },
      ],
    });
    const moved = next.instances.find((i) => i.id === 'ic');
    expect(moved.position).toEqual([40, 50, 1.5]);
    expect(instanceMatrix(moved).elements.slice(0, 11)).toEqual(instanceMatrix(at('x', 'y')).elements.slice(0, 11));
  });
});
