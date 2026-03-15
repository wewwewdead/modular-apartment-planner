import * as THREE from 'three';
import { getPartFaceCorners } from '../domain/partGeometry';

// Snap indicator colors
const CORNER_COLOR = 0x00cc66;
const MIDPOINT_COLOR = 0x00cccc;
const FACE_CENTER_COLOR = 0x3388ff;
const FACE_FLUSH_COLOR = 0xff8800;
const HOVER_FACE_COLOR = 0xdaa520; // gold

// Alignment guide axis colors
const AXIS_COLORS = { x: 0xff4444, y: 0x44cc44, z: 0x4488ff };
const ALIGNMENT_GUIDE_LENGTH = 2000; // mm

const SNAP_DOT_SIZE = 8; // pixels (screen space)
const FACE_OFFSET = 0.5; // mm offset to avoid z-fighting

/**
 * Three.js overlay for snap indicators, face highlights, and alignment guides.
 * Follows the createDrawingPlaneOverlay() factory pattern.
 */
export function createSnapOverlay() {
  const group = new THREE.Group();
  group.name = 'SnapOverlay';

  // --- Snap dot indicator ---
  let snapDot = null;
  const snapDotMaterials = {
    corner: createDotMaterial(CORNER_COLOR),
    midpoint: createDotMaterial(MIDPOINT_COLOR),
    faceCenter: createDotMaterial(FACE_CENTER_COLOR),
    faceFlush: createDotMaterial(FACE_FLUSH_COLOR),
  };

  // --- Face hover highlight ---
  let faceHighlight = null;
  let faceFillMesh = null;
  const faceHighlightMaterial = new THREE.LineBasicMaterial({
    color: HOVER_FACE_COLOR,
    linewidth: 2,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  const faceFillMaterial = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthTest: false,
  });

  // --- Alignment guide lines ---
  let alignmentLines = null;
  const alignmentMaterials = {
    x: new THREE.LineDashedMaterial({ color: AXIS_COLORS.x, dashSize: 10, gapSize: 6, transparent: true, opacity: 0.5, depthTest: false }),
    y: new THREE.LineDashedMaterial({ color: AXIS_COLORS.y, dashSize: 10, gapSize: 6, transparent: true, opacity: 0.5, depthTest: false }),
    z: new THREE.LineDashedMaterial({ color: AXIS_COLORS.z, dashSize: 10, gapSize: 6, transparent: true, opacity: 0.5, depthTest: false }),
  };

  function clearSnapDot() {
    if (snapDot) {
      group.remove(snapDot);
      snapDot.geometry?.dispose();
      snapDot = null;
    }
  }

  function clearFaceHighlight() {
    if (faceHighlight) {
      group.remove(faceHighlight);
      faceHighlight.geometry?.dispose();
      faceHighlight = null;
    }
    if (faceFillMesh) {
      group.remove(faceFillMesh);
      faceFillMesh.geometry?.dispose();
      faceFillMesh = null;
    }
  }

  function clearAlignmentLines() {
    if (alignmentLines) {
      group.remove(alignmentLines);
      alignmentLines.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
      alignmentLines = null;
    }
  }

  return {
    group,

    /**
     * Show/update a snap point indicator.
     * @param {import('../editor/inferenceEngine').SnapResult|null} snapResult
     */
    updateSnapIndicator(snapResult) {
      clearSnapDot();

      if (!snapResult || !snapResult.inference) return;

      const { inference } = snapResult;
      const material = snapDotMaterials[inference.type] || snapDotMaterials.corner;

      // Create a small sphere at the snap point (domain -> Three.js coords)
      const geometry = new THREE.SphereGeometry(4, 8, 8);
      snapDot = new THREE.Mesh(geometry, material);
      // Domain to Three.js: x=x, y=z, z=y
      snapDot.position.set(inference.x, inference.z, inference.y);
      snapDot.renderOrder = 999;
      group.add(snapDot);
    },

    /**
     * Show/update a face hover highlight (golden edge outline).
     * @param {Object|null} part - Part whose face to highlight
     * @param {string|null} faceId - Face ID ('+x', '-x', etc.)
     */
    updateHoverFace(part, faceId) {
      clearFaceHighlight();

      if (!part || !faceId) return;

      const corners = getPartFaceCorners(part, faceId);
      if (corners.length < 4) return;

      // Get face normal direction for offset
      const normalDir = getFaceNormalDir(faceId);

      // Convert corners domain -> Three.js with small normal offset
      const threeCorners = corners.map((c) => new THREE.Vector3(
        c.x + normalDir.x * FACE_OFFSET,
        c.z + normalDir.z * FACE_OFFSET, // domain z -> three y
        c.y + normalDir.y * FACE_OFFSET  // domain y -> three z
      ));
      threeCorners.push(threeCorners[0]); // close the loop

      const geometry = new THREE.BufferGeometry().setFromPoints(threeCorners);
      faceHighlight = new THREE.LineLoop(geometry, faceHighlightMaterial);
      faceHighlight.renderOrder = 998;
      group.add(faceHighlight);

      // Translucent blue fill quad
      const rawCorners = threeCorners.slice(0, 4);
      const fillVerts = new Float32Array([
        rawCorners[0].x, rawCorners[0].y, rawCorners[0].z,
        rawCorners[1].x, rawCorners[1].y, rawCorners[1].z,
        rawCorners[2].x, rawCorners[2].y, rawCorners[2].z,
        rawCorners[0].x, rawCorners[0].y, rawCorners[0].z,
        rawCorners[2].x, rawCorners[2].y, rawCorners[2].z,
        rawCorners[3].x, rawCorners[3].y, rawCorners[3].z,
      ]);
      const fillGeom = new THREE.BufferGeometry();
      fillGeom.setAttribute('position', new THREE.BufferAttribute(fillVerts, 3));
      faceFillMesh = new THREE.Mesh(fillGeom, faceFillMaterial);
      faceFillMesh.renderOrder = 997;
      group.add(faceFillMesh);
    },

    /**
     * Show/update alignment guide lines.
     * @param {Array<{axis: 'x'|'y'|'z', value: number, points: Array}>} alignments
     */
    updateAlignmentLines(alignments) {
      clearAlignmentLines();

      if (!alignments || alignments.length === 0) return;

      const lineGroup = new THREE.Group();
      lineGroup.name = 'AlignmentGuides';

      for (const align of alignments) {
        const material = alignmentMaterials[align.axis];
        if (!material) continue;

        // Find bounding range of aligned points + cursor
        for (const p of align.points) {
          const start = new THREE.Vector3();
          const end = new THREE.Vector3();

          // Create a line segment along the alignment axis through the point
          // Domain -> Three.js: x=x, y=z, z=y
          if (align.axis === 'x') {
            start.set(p.x, p.z, p.y - ALIGNMENT_GUIDE_LENGTH / 2);
            end.set(p.x, p.z, p.y + ALIGNMENT_GUIDE_LENGTH / 2);
          } else if (align.axis === 'y') {
            start.set(p.x, p.z - ALIGNMENT_GUIDE_LENGTH / 2, p.y);
            end.set(p.x, p.z + ALIGNMENT_GUIDE_LENGTH / 2, p.y);
          } else { // z
            start.set(p.x, p.z, p.y);
            // Only draw one guide per axis/value combo, not per point
            break;
          }

          const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
          const line = new THREE.LineSegments(geom, material);
          line.computeLineDistances();
          line.renderOrder = 997;
          lineGroup.add(line);
          break; // one guide line per axis is enough
        }
      }

      alignmentLines = lineGroup;
      group.add(alignmentLines);
    },

    /**
     * Clear all snap visuals.
     */
    clear() {
      clearSnapDot();
      clearFaceHighlight();
      clearAlignmentLines();
    },

    /**
     * Dispose of all materials and geometry.
     */
    dispose() {
      clearSnapDot();
      clearFaceHighlight();
      clearAlignmentLines();
      Object.values(snapDotMaterials).forEach((m) => m.dispose());
      faceHighlightMaterial.dispose();
      faceFillMaterial.dispose();
      Object.values(alignmentMaterials).forEach((m) => m.dispose());
    },
  };
}

// --- Helpers ---

function createDotMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
}

function getFaceNormalDir(faceId) {
  switch (faceId) {
    case '+x': return { x: 1, y: 0, z: 0 };
    case '-x': return { x: -1, y: 0, z: 0 };
    case '+y': return { x: 0, y: 1, z: 0 };
    case '-y': return { x: 0, y: -1, z: 0 };
    case '+z': return { x: 0, y: 0, z: 1 };
    case '-z': return { x: 0, y: 0, z: -1 };
    default: return { x: 0, y: 0, z: 0 };
  }
}
