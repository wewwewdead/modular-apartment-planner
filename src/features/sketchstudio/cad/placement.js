// The same ordered rigid operations drive kernel shapes and semantic anchors.
export function unmapPlacement(point, operations, directionOnly = false) {
  return mapPlacement(
    point,
    [...operations]
      .reverse()
      .map((op) => (op.translation ? { translation: op.translation.map((v) => -v) } : { ...op, angle: -op.angle })),
    directionOnly,
  );
}

export function mapPlacement(point, operations, directionOnly = false) {
  let result = [...point];
  for (const operation of operations) {
    if (operation.translation) {
      if (!directionOnly) result = result.map((x, i) => x + operation.translation[i]);
      continue;
    }
    const origin = directionOnly ? [0, 0, 0] : operation.origin;
    const length = Math.hypot(...operation.axis);
    if (length < 1e-12) throw new Error('Rotation axis cannot be zero.');
    const axis = operation.axis.map((x) => x / length);
    const [x, y, z] = result.map((x, i) => x - origin[i]),
      [ax, ay, az] = axis;
    const angle = (operation.angle * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const dot = ax * x + ay * y + az * z,
      cross = [ay * z - az * y, az * x - ax * z, ax * y - ay * x];
    result = [x, y, z].map((value, i) => value * c + cross[i] * s + axis[i] * dot * (1 - c) + origin[i]);
  }
  return result;
}
