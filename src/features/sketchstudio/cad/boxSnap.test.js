import { describe, expect, it } from 'vitest';
import { snapBoxDelta } from './boxSnap.js';

// Box snapping to measure mark points (the face-to-face rules are covered in
// assembleAndDraw.test.js).
describe('snapping a dragged box to mark points', () => {
  const tube = { min: [0, 0, 0], max: [40, 40, 700] };
  it('pulls the min face, the max face or the centre onto a mark coordinate', () => {
    // Mark end at x = 600: the right face (max 40 + 556 = 596) moves 4 mm on.
    const right = snapBoxDelta(tube, [556, 0, 0], [], { threshold: 8, axes: [0], points: [[600, 0, 18]] });
    expect(right.delta).toEqual([560, 0, 0]);
    expect(right.snaps).toEqual([{ diff: 4, axis: 0, side: 'max', value: 600, kind: 'mark' }]);
    // The left face onto it.
    const left = snapBoxDelta(tube, [603, 0, 0], [], { threshold: 8, axes: [0], points: [[600, 0, 18]] });
    expect(left.delta).toEqual([600, 0, 0]);
    expect(left.snaps[0]).toMatchObject({ side: 'min', kind: 'mark' });
    // The box centre (x 20 + delta) onto a mark midpoint at x = 300.
    const middle = snapBoxDelta(tube, [283, 0, 0], [], { threshold: 8, axes: [0], points: [[300, 0, 18]] });
    expect(middle.delta).toEqual([280, 0, 0]);
    expect(middle.snaps[0]).toMatchObject({ side: 'centre', value: 300, kind: 'mark centre' });
  });

  it('needs no overlap across the other axes, only the threshold along the moved one', () => {
    // A mark far away in Y and Z still lines the box up in X.
    const far = [[600, 9000, -4000]];
    expect(snapBoxDelta(tube, [557, 0, 0], [], { threshold: 8, points: far }).delta).toEqual([560, 0, 0]);
    // Out of reach along X: nothing.
    expect(snapBoxDelta(tube, [500, 0, 0], [], { threshold: 8, axes: [0], points: far }).snaps).toEqual([]);
    // Only the axes the handle moves.
    expect(snapBoxDelta(tube, [557, 3, 0], [], { threshold: 8, axes: [1], points: far }).delta).toEqual([557, 3, 0]);
  });

  it('keeps one snap per axis: the smallest move across faces and marks', () => {
    const neighbour = { min: [598, 0, 0], max: [700, 40, 700] };
    // Flush to the neighbour needs +2, the mark at 601 needs +5: flush wins.
    const flush = snapBoxDelta(tube, [556, 0, 0], [neighbour], { threshold: 8, axes: [0], points: [[601, 0, 0]] });
    expect(flush.delta).toEqual([558, 0, 0]);
    expect(flush.snaps.map((s) => s.kind)).toEqual(['flush']);
    // The mark at 597 needs +1: the mark wins.
    const mark = snapBoxDelta(tube, [556, 0, 0], [neighbour], { threshold: 8, axes: [0], points: [[597, 0, 0]] });
    expect(mark.delta).toEqual([557, 0, 0]);
    expect(mark.snaps.map((s) => s.kind)).toEqual(['mark']);
    // An exact tie keeps the box face.
    const tie = snapBoxDelta(tube, [556, 0, 0], [neighbour], { threshold: 8, axes: [0], points: [[598, 0, 0]] });
    expect(tie.snaps.map((s) => s.kind)).toEqual(['flush']);
    // Aligned (same side) competes the same way.
    const aligned = snapBoxDelta(tube, [596, 0, 0], [neighbour], { threshold: 8, axes: [0], points: [[603, 0, 0]] });
    expect(aligned.snaps.map((s) => s.kind)).toEqual(['aligned']);
    // Each axis snaps independently.
    const both = snapBoxDelta(tube, [557, 297, 0], [], { threshold: 8, axes: [0, 1], points: [[600, 300, 0]] });
    expect(both.delta).toEqual([560, 300, 0]);
    expect(both.snaps.map((s) => [s.axis, s.side])).toEqual([
      [0, 'max'],
      [1, 'min'],
    ]);
  });
});
