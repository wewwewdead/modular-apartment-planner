// Bounding-box snapping while dragging a part. Boxes are world-space
// { min: [x, y, z], max: [x, y, z] }. For each axis the gizmo moves along,
// the moving box's faces snap to a nearby box face of another part, either
// flush (touching: min ↔ max) or aligned (same side: min ↔ min, max ↔ max).
// Only parts that overlap the moving box across the other two axes (within
// the threshold) count, so a far-away part's plane never pulls the drag.

export const snapThreshold = (span) => Math.max(8, 0.01 * (span || 0));

const shift = (box, delta) => ({
  min: box.min.map((v, i) => v + delta[i]),
  max: box.max.map((v, i) => v + delta[i]),
});
function overlapsAcross(a, b, axis, threshold) {
  return [0, 1, 2]
    .filter((i) => i !== axis)
    .every((i) => a.min[i] <= b.max[i] + threshold && b.min[i] <= a.max[i] + threshold);
}

export function snapBoxDelta(box, delta, others, { threshold = 8, axes = [0, 1, 2] } = {}) {
  const moved = shift(box, delta);
  const result = [...delta];
  const snaps = [];
  for (const axis of axes) {
    let best = null;
    for (const other of others) {
      if (!overlapsAcross(moved, other, axis, threshold)) continue;
      for (const [side, otherSide, kind] of [
        ['min', 'max', 'flush'],
        ['max', 'min', 'flush'],
        ['min', 'min', 'aligned'],
        ['max', 'max', 'aligned'],
      ]) {
        const diff = other[otherSide][axis] - moved[side][axis];
        if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff) - 1e-9))
          best = { diff, axis, side, value: other[otherSide][axis], kind };
      }
    }
    if (best) {
      result[axis] = delta[axis] + best.diff;
      snaps.push(best);
    }
  }
  return { delta: result.map((v) => Math.round(v * 1e6) / 1e6), snaps };
}

// Axes a TransformControls handle moves along ('X', 'XY', 'XYZ', …).
export const gizmoAxes = (handle) =>
  ['X', 'Y', 'Z'].map((name, i) => (String(handle || 'XYZ').includes(name) ? i : -1)).filter((i) => i >= 0);
