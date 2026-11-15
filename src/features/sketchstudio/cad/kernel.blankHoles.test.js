// Fasteners in laser-cut holes (docs/sketch-studio-shop-floor.md §5.3)
// through the real kernel: a 100 × 60 blank with two Ø4.5 cut-outs and one
// 90° bend between them. The sheet-metal feature's metrics list both holes
// (`holes`, `exits`), and an M4 pan-head screw held by a concentric
// connection to the sheet-metal feature seats in each, on the entry side and
// on the far side, on the hole axis the folded SOLID has: the axis is read
// from the cylindrical face of the exact solid, not from the fold maths.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, setOC } from 'replicad';
import { emptyModel } from './model.js';
import { createKernelSession } from './kernel.js';
import { createHardware, hardwareDefaults } from './hardware.js';
import { mapPlacement } from './placement.js';
import { holeCentres } from './placementCuts.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

const T = 1.5;
const HOLES = [
  [20, 30],
  [80, 30],
];
function blankModel() {
  return {
    ...emptyModel(),
    sketches: [
      {
        id: 's',
        name: 'Blank',
        plane: 'XY',
        profile: {
          type: 'rectangle',
          width: 100,
          height: 60,
          origin: [0, 0],
          holes: HOLES.map((center) => ({ type: 'circle', center, radius: 2.25 })),
        },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [
      {
        id: 'p',
        name: 'Bracket',
        material: 'SPCC cold-rolled steel',
        features: [
          {
            id: 'sm',
            type: 'sheetmetal',
            sketchId: 's',
            thickness: T,
            stock: 'spcc',
            kFactor: null,
            base: [10, 30],
            bends: [{ id: 'b1', a: [50, 0], b: [50, 60], angle: 90, direction: 'up', radius: null }],
          },
        ],
      },
    ],
    // Placed off the origin and turned, so the seats are mapped through a real pose.
    instances: [{ id: 'host', partId: 'p', position: [40, -25, 12], rotation: [0, 0, 30], visible: true }],
  };
}
// One M4 pan-head machine screw per hole, posed anywhere, held by the connection.
function withScrews(side) {
  const model = blankModel();
  const screws = HOLES.map((_, index) => {
    const { part, instance } = createHardware(hardwareDefaults('pan-head', 'M4'));
    model.parts.push(part);
    model.instances.push({ ...instance, position: [300 + index * 50, 200, 80], rotation: [20, 40, 0] });
    model.connections.push({
      id: `seat-${index}`,
      type: 'concentric',
      from: instance.id,
      to: 'host',
      fromFeatureId: part.features[0].id,
      toFeatureId: 'sm',
      ...(index > 0 ? { holeIndex: index } : {}),
      ...(side === 'far' ? { side: 'far' } : {}),
      offset: 0,
    });
    return instance.id;
  });
  return { model, screws };
}
// The hole axes of the folded solid (its cylindrical faces of radius 2.25), in the part frame.
function solidAxes(session) {
  const oc = getOC();
  const axes = [];
  for (const face of session.shapes.get('p').faces) {
    if (face.geomType !== 'CYLINDRE') continue;
    const adaptor = new oc.BRepAdaptor_Surface(face.wrapped, false);
    const cylinder = adaptor.Cylinder();
    if (Math.abs(cylinder.Radius() - 2.25) < 1e-6) {
      const axis = cylinder.Axis();
      const at = axis.Location(),
        dir = axis.Direction();
      axes.push({ point: [at.X(), at.Y(), at.Z()], direction: [dir.X(), dir.Y(), dir.Z()] });
    }
    adaptor.delete();
  }
  return axes;
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const offAxis = (point, axis) => {
  const d = sub(point, axis.point);
  const along = dot(d, axis.direction);
  return Math.hypot(...d.map((v, i) => v - axis.direction[i] * along));
};

describe('fasteners in a sheet-metal blank’s laser-cut holes', () => {
  it('lists the round cut-outs clear of the bends as seats, with the sheet’s thickness as each exit', () => {
    const session = createKernelSession(blankModel());
    try {
      const metrics = session.snapshot().parts.find((p) => p.id === 'p').features.sm;
      expect(metrics.holes.map((h) => [h.index, h.diameter])).toEqual([
        [0, 4.5],
        [1, 4.5],
      ]);
      expect(metrics.exits).toEqual([T, T]);
      // Each listed centre is on its hole's axis in the folded solid, its direction along it.
      const axes = solidAxes(session);
      expect(axes).toHaveLength(2);
      for (const hole of metrics.holes) {
        const axis = axes.find((a) => offAxis(hole.centre, a) < 0.01);
        expect(axis, `hole ${hole.index} lies on a hole axis of the solid`).toBeTruthy();
        expect(Math.abs(Math.abs(dot(hole.direction, axis.direction)) - 1)).toBeLessThan(1e-9);
      }
      // One hole is on the fixed flat, the other rose with the 90° flange: its axis is horizontal.
      expect(metrics.holes.map((h) => Math.abs(h.direction[2]))).toEqual([1, expect.closeTo(0, 9)]);
    } finally {
      session.dispose();
    }
  });

  for (const side of ['entry', 'far'])
    it(`seats an M4 screw in each hole on the ${side} side, on the folded hole axis within 0.01 mm`, () => {
      const { model, screws } = withScrews(side);
      const session = createKernelSession(model);
      try {
        const snapshot = session.snapshot();
        const host = snapshot.instances.find((i) => i.id === 'host');
        const metrics = snapshot.parts.find((p) => p.id === 'p').features.sm;
        // The solid's axes in the world, through the host's pose.
        const axes = solidAxes(session).map((a) => ({
          point: mapPlacement(a.point, host.placement),
          direction: mapPlacement(a.direction, host.placement, true),
        }));
        let worst = 0;
        screws.forEach((id, index) => {
          const placed = snapshot.instances.find((i) => i.id === id);
          const seat = mapPlacement([0, 0, 0], placed.placement);
          const shank = mapPlacement([0, 0, -1], placed.placement, true);
          const hole = metrics.holes.find((h) => h.index === index);
          const axis = axes.find((a) => offAxis(seat, a) < 0.01);
          expect(axis, `screw ${index + 1} sits on a hole axis (${side})`).toBeTruthy();
          worst = Math.max(worst, offAxis(seat, axis), 1 - Math.abs(dot(shank, axis.direction)));
          // The entry seat is the hole's top-face centre; the far seat the bottom face's, facing back up.
          const into = mapPlacement(hole.direction, host.placement, true);
          const top = mapPlacement(hole.centre, host.placement);
          const expected = side === 'far' ? top.map((v, i) => v + into[i] * T) : top;
          expect(Math.hypot(...sub(seat, expected))).toBeLessThan(0.01);
          expect(dot(shank, into)).toBeCloseTo(side === 'far' ? -1 : 1, 9);
        });
        // Reported in the run log (the spec asks for the measured number).
        console.warn(
          `blank-hole seat (${side}): worst distance off the solid's hole axis ${worst.toExponential(2)} mm`,
        );
        // The station's hole candidates list both openings of each hole.
        const candidates = holeCentres({ model, snapshot, parameters: {} }).filter((h) => h.instanceId === 'host');
        expect(candidates.map((h) => [h.index, h.side, h.attachable, h.radius])).toEqual([
          [0, 'entry', true, 2.25],
          [0, 'far', true, 2.25],
          [1, 'entry', true, 2.25],
          [1, 'far', true, 2.25],
        ]);
      } finally {
        session.dispose();
      }
    });

  it('refuses a connection to a cut-out that is not a round hole clear of the bends, by name', () => {
    const { model } = withScrews('entry');
    model.connections[1].holeIndex = 5;
    expect(() => createKernelSession(model)).toThrow(
      'Cut-out 6 of Bracket is not a round hole clear of the bends: the hardware has nothing to seat in.',
    );
  });
});
