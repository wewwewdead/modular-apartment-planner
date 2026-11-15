// The three.js stand-in of a sheet-metal part (sheetMetalPreview.js): one
// mesh per piece, one generated strip per zone, posed in place from a fold.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSheetMetalPreview, ARC_STEPS } from './sheetMetalPreview.js';
import { foldSheet, foldedBounds, poseFold } from './sheetMetal.js';

const fold = foldSheet(
  {
    thickness: 1.5,
    stock: 'spcc',
    bends: [
      { id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' },
      { id: 'b2', a: [80, 0], b: [80, 60], angle: 90, direction: 'down' },
    ],
  },
  {
    type: 'rectangle',
    width: 100,
    height: 60,
    origin: [0, 0],
    holes: [{ type: 'circle', radius: 5, center: [50, 30] }],
  },
);
const materials = () => ({ body: new THREE.MeshBasicMaterial(), edge: new THREE.LineBasicMaterial() });
const boxOf = (group) => {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
};
const expectBox = (box, [min, max]) => {
  box.min.toArray().forEach((v, i) => expect(v).toBeCloseTo(min[i], 4));
  box.max.toArray().forEach((v, i) => expect(v).toBeCloseTo(max[i], 4));
};

describe('sheet-metal preview', () => {
  it('draws the folded part where the fold maths puts it, cut-out included', () => {
    const preview = createSheetMetalPreview(fold, materials());
    const pieces = preview.group.children.filter((c) => c.name.startsWith('sheet-piece'));
    const arcs = preview.group.children.filter((c) => c.name.startsWith('sheet-arc'));
    expect(pieces).toHaveLength(3);
    expect(arcs).toHaveLength(2);
    expect(arcs[0].geometry.getAttribute('position').count).toBe(4 * (ARC_STEPS + 1) * 2);
    expectBox(boxOf(preview.group), foldedBounds(fold, ARC_STEPS));
    // The middle piece keeps the Ø10 cut-out: its extrusion has a hole.
    const middle = pieces.find((p) => p.name.endsWith(fold.rootPiece));
    expect(middle.geometry.parameters.shapes.holes).toHaveLength(1);
    preview.dispose();
    expect(preview.group.children).toHaveLength(0);
  });
  it('poses in place: flat at 0°, folded again at the bend angles', () => {
    const preview = createSheetMetalPreview(fold, materials());
    const arc = preview.group.children.find((c) => c.name.startsWith('sheet-arc'));
    const geometry = arc.geometry;
    preview.pose(poseFold(fold, { b1: 0, b2: 0 }));
    expect(arc.geometry).toBe(geometry);
    expectBox(boxOf(preview.group), [
      [0, 0, 0],
      [100, 60, 1.5],
    ]);
    preview.pose(fold);
    expectBox(boxOf(preview.group), foldedBounds(fold, ARC_STEPS));
  });
});
