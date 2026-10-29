import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { cleanRotation, flipAxis, flipInstance, rotateInstance } from './movement.js';
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
