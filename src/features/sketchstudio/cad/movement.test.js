import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  cleanRotation,
  flipAxis,
  flipInstance,
  rotateInstance,
  rotateInstancesAbout,
  translateInstance,
  translateInstances,
  turnInstances,
} from './movement.js';
import { rotateVector, vector } from './model.js';

const model = {
  parts: [{ id: 'part', features: [{ type: 'board', width: 100 }] }],
  instances: [
    { id: 'item', partId: 'part', position: ['=offset', 40, 80], rotation: [25, 40, 70] },
    { id: 'other', partId: 'part', position: [0, 0, 0] },
  ],
  connections: [],
};
const parameters = { offset: 120 };
const bounds = [
  [100, 20, 50],
  [180, 100, 150],
];
const center = [140, 60, 100];
const worldPoint = (instance, point) =>
  rotateVector(point, instance.rotation).map((v, i) => v + vector(instance.position, parameters)[i]);
const close = (actual, expected) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 5));

it.each([
  [0, 0, 1],
  [1, 0, 0],
  [1, -2, 3],
])('turns an already rotated instance around its center for axis (%s, %s, %s)', (...axis) => {
  const next = flipInstance(model, 'item', axis, bounds, parameters);
  const unit = axis.map((v) => v / Math.hypot(...axis));
  for (const point of [
    [0, 0, 0],
    [25, 10, 60],
    [-10, 30, 5],
  ]) {
    const before = worldPoint(model.instances[0], point).map((v, i) => v - center[i]);
    const dot = before.reduce((sum, v, i) => sum + v * unit[i], 0);
    close(
      worldPoint(next.instances[0], point),
      before.map((v, i) => center[i] + 2 * dot * unit[i] - v),
    );
  }
  expect(next.parts).toBe(model.parts);
  expect(next.instances[1]).toBe(model.instances[1]);
  expect(next.instances[0].position[0]).toContain('offset');
  const restored = flipInstance(next, 'item', axis, bounds, parameters);
  close(worldPoint(restored.instances[0], [25, 10, 60]), worldPoint(model.instances[0], [25, 10, 60]));
  expect(model.instances[0].rotation).toEqual([25, 40, 70]);
});

it('rejects attached instances and missing geometry', () => {
  expect(() =>
    flipInstance(
      { ...model, connections: [{ from: 'item', to: 'other', type: 'fixed' }] },
      'item',
      [0, 0, 1],
      bounds,
      parameters,
    ),
  ).toThrow(/attached/);
  expect(() => flipInstance(model, 'item', [0, 0, 1], null, parameters)).toThrow(/Rebuild/);
});

it('shows the simplest equivalent angles without floating-point noise', () => {
  const half = (axis) => new Quaternion().setFromAxisAngle(new Vector3(...axis), Math.PI);
  // Two half turns about X then Z equal one half turn about Y.
  expect(cleanRotation(half([0, 0, 1]).multiply(half([1, 0, 0])))).toEqual([0, 180, 0]);
  expect(cleanRotation(new Quaternion())).toEqual([0, 0, 0]);
  const noisy = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI + 1e-12);
  expect(cleanRotation(noisy)).toEqual([0, 0, 180]);
  const quarter = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  expect(cleanRotation(quarter)).toEqual([90, 0, 0]);
});

it('flips horizontally about vertical Z and vertically about the longer horizontal side', () => {
  expect(flipAxis('horizontal', bounds)).toEqual([0, 0, 1]);
  expect(
    flipAxis('vertical', [
      [0, 0, 0],
      [600, 400, 18],
    ]),
  ).toEqual([1, 0, 0]);
  expect(
    flipAxis('vertical', [
      [0, 0, 0],
      [40, 700, 40],
    ]),
  ).toEqual([0, 1, 0]);
});

it('stands a lying tube up with a 90° turn about its center', () => {
  const tube = {
    parts: [{ id: 'tube', features: [] }],
    instances: [{ id: 't', partId: 'tube', position: [0, 0, 0], rotation: [0, 90, 0] }],
    connections: [],
  };
  // Lying along X from 0 to 700, 40 square, centered on Y/Z = 0.
  const lying = [
    [0, -20, -20],
    [700, 20, 20],
  ];
  const next = rotateInstance(tube, 't', [0, 1, 0], -90, lying);
  expect(next.instances[0].rotation).toEqual([0, 0, 0]);
  const end = (instance, point) =>
    rotateVector(point, instance.rotation).map((v, i) => v + vector(instance.position)[i]);
  close(end(next.instances[0], [0, 0, 0]), [350, 0, -350]);
  close(end(next.instances[0], [0, 0, 700]), [350, 0, 350]);
});

// Part groups (docs/sketch-studio-part-groups.md §3.5).
it('turns two boards 90° about Z about their union centre exactly like one rigid body', () => {
  const two = {
    parts: model.parts,
    instances: [
      { id: 'left', partId: 'part', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'right', partId: 'part', position: [300, 100, 18], rotation: [0, 0, 30] },
    ],
    connections: [{ id: 'c', type: 'fixed', from: 'left', to: 'right' }],
  };
  const centre = [200, 150, 9];
  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  // No attached refusal: the anchoring check replaces it.
  const next = turnInstances(two, ['left', 'right'], turn, centre);
  const rigid = (p) => [centre[0] - (p[1] - centre[1]), centre[1] + (p[0] - centre[0]), p[2]];
  for (const [index, point] of [
    [0, [0, 0, 0]],
    [0, [600, 400, 18]],
    [1, [0, 0, 0]],
    [1, [50, -20, 9]],
  ]) {
    const at = (instance) => rotateVector(point, instance.rotation).map((v, i) => v + instance.position[i]);
    close(at(next.instances[index]), rigid(at(two.instances[index])));
  }
  expect(next.instances[0].rotation).toEqual([0, 0, 90]);
  expect(next.instances[1].rotation).toEqual([0, 0, 120]);
  // The same through rotateInstancesAbout, axis and degrees.
  expect(rotateInstancesAbout(two, ['left', 'right'], [0, 0, 1], 90, centre).instances).toEqual(next.instances);
  // Only the listed movers change.
  expect(turnInstances(two, ['left'], turn, centre).instances[1]).toBe(two.instances[1]);
  expect(() => turnInstances(two, ['gone'], turn, centre)).toThrow('A selected part no longer exists.');
});

it('translateInstances keeps a parameter-expression position an expression and refuses nothing attached', () => {
  const next = translateInstances(model, ['item', 'other'], [10, 0, -5]);
  expect(next.instances[0].position).toEqual(['=(offset)+(10)', 40, 75]);
  expect(next.instances[1].position).toEqual([10, 0, -5]);
  // Identical per-instance maths to translateInstance.
  expect(next.instances[0]).toEqual(translateInstance(model, 'item', [10, 0, -5]).instances[0]);
  const attached = { ...model, connections: [{ id: 'c', type: 'fixed', from: 'item', to: 'other' }] };
  expect(() => translateInstance(attached, 'item', [1, 0, 0])).toThrow('This part is attached.');
  expect(translateInstances(attached, ['item'], [1, 0, 0]).instances[0].position).toEqual(['=(offset)+(1)', 40, 80]);
  expect(() => translateInstances(model, ['item'], [1, NaN, 0])).toThrow('Movement requires three finite distances.');
});
