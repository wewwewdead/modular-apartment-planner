// A sheet-metal part drawn from a foldSheet result (docs/sketch-studio-fab-shop.md
// §7): one extruded mesh per rigid piece (cut-outs included) and one generated
// strip per bend-zone interval. `pose(fold)` moves the pieces and rewrites the
// arc vertices in place from a re-posed fold (sheetMetal.js poseFold), so a
// bend animates without a kernel round trip. Part coordinates throughout: the
// caller places the group. Materials are borrowed (the viewport's cache);
// `dispose` frees geometry only.
import * as THREE from 'three';
import { bendArcPoint, transformPoint, zoneSamples } from './sheetMetal.js';

// Samples across a zone; a round bend's are a multiple of its hits (one on every hit boundary).
export const ARC_STEPS = 16;
// The four faces of a zone strip as (s, z) corner pairs, swept across the zone.
const strip = (s0, s1, t) => [
  [
    [s0, 0],
    [s1, 0],
  ],
  [
    [s1, t],
    [s0, t],
  ],
  [
    [s0, t],
    [s0, 0],
  ],
  [
    [s1, 0],
    [s1, t],
  ],
];

function pieceGeometry(piece, thickness) {
  const shape = new THREE.Shape(piece.outer.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes = piece.holes.map((ring) => new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
}

function arcGeometry(steps) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * (steps + 1) * 2 * 3), 3));
  const index = [];
  for (let face = 0; face < 4; face++) {
    const base = face * (steps + 1) * 2;
    for (let j = 0; j < steps; j++) {
      const a = base + 2 * j;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry.setIndex(index);
  return geometry;
}

/**
 * @param {object} fold     A foldSheet (or poseFold) result.
 * @param {object} materials { body: THREE.Material, edge: THREE.LineBasicMaterial }
 * @returns {{ group: THREE.Group, pose(fold): void, setMaterials(materials): void, dispose(): void }}
 */
export function createSheetMetalPreview(fold, { body, edge }) {
  const t = fold.thickness;
  const group = new THREE.Group();
  group.name = 'sheet-metal-preview';
  const meshes = [];
  const lines = [];
  const pieces = new Map();
  for (const piece of fold.pieces) {
    const geometry = pieceGeometry(piece, t);
    const mesh = new THREE.Mesh(geometry, body);
    mesh.name = `sheet-piece-${piece.id}`;
    mesh.matrixAutoUpdate = false;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edge);
    outline.raycast = () => {};
    mesh.add(outline);
    group.add(mesh);
    meshes.push(mesh);
    lines.push(outline);
    pieces.set(piece.id, mesh);
  }
  const arcs = [];
  for (const bend of fold.bends)
    for (const [s0, s1] of bend.intervals) {
      const steps = zoneSamples(bend, ARC_STEPS);
      const mesh = new THREE.Mesh(arcGeometry(steps), body);
      mesh.name = `sheet-arc-${bend.id}`;
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * steps * 2 * 3), 3));
      const outline = new THREE.LineSegments(edgeGeometry, edge);
      outline.raycast = () => {};
      group.add(mesh, outline);
      meshes.push(mesh);
      lines.push(outline);
      arcs.push({ bendId: bend.id, s0, s1, steps, mesh, outline });
    }
  const pose = (posed) => {
    for (const piece of posed.pieces) {
      const mesh = pieces.get(piece.id);
      if (!mesh) continue;
      mesh.matrix.fromArray(piece.matrix);
      mesh.matrixWorldNeedsUpdate = true;
    }
    const bends = new Map(posed.bends.map((b) => [b.id, b]));
    for (const arc of arcs) {
      const bend = bends.get(arc.bendId);
      const at = (s, fraction, z) =>
        transformPoint(bend.fixedMatrix, bendArcPoint(bend, t, bend.transform, s, fraction, z));
      const positions = arc.mesh.geometry.getAttribute('position');
      const steps = arc.steps;
      let k = 0;
      for (const [p, q] of strip(arc.s0, arc.s1, t))
        for (let j = 0; j <= steps; j++) {
          positions.setXYZ(k++, ...at(p[0], j / steps, p[1]));
          positions.setXYZ(k++, ...at(q[0], j / steps, q[1]));
        }
      positions.needsUpdate = true;
      arc.mesh.geometry.computeVertexNormals();
      arc.mesh.geometry.computeBoundingBox();
      arc.mesh.geometry.computeBoundingSphere();
      const edges = arc.outline.geometry.getAttribute('position');
      k = 0;
      for (const [s, z] of [
        [arc.s0, 0],
        [arc.s1, 0],
        [arc.s0, t],
        [arc.s1, t],
      ])
        for (let j = 0; j < steps; j++) {
          edges.setXYZ(k++, ...at(s, j / steps, z));
          edges.setXYZ(k++, ...at(s, (j + 1) / steps, z));
        }
      edges.needsUpdate = true;
      arc.outline.geometry.computeBoundingBox();
      arc.outline.geometry.computeBoundingSphere();
    }
  };
  pose(fold);
  return {
    group,
    pose,
    setMaterials(next) {
      for (const mesh of meshes) mesh.material = next.body;
      for (const line of lines) line.material = next.edge;
    },
    dispose() {
      group.traverse((obj) => obj.geometry?.dispose());
      group.clear();
    },
  };
}
