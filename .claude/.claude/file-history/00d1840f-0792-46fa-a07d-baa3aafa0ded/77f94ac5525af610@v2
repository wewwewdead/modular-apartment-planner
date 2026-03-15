import * as THREE from 'three';

const PREVIEW_COLOR = 0xB8860B;
const PREVIEW_OPACITY = 0.35;
const EDGE_COLOR = 0xB8860B;

/**
 * Three.js Group for push/pull extrusion preview.
 * Shows a translucent box growing from the selected face.
 */
export function createExtrusionPreview() {
  const group = new THREE.Group();
  group.name = 'ExtrusionPreview';

  let previewMesh = null;

  const material = new THREE.MeshBasicMaterial({
    color: PREVIEW_COLOR,
    transparent: true,
    opacity: PREVIEW_OPACITY,
    depthWrite: false,
  });

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: EDGE_COLOR,
    transparent: true,
    opacity: 0.7,
  });

  function clear() {
    if (previewMesh) {
      group.remove(previewMesh);
      previewMesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
      previewMesh = null;
    }
  }

  return {
    group,

    /**
     * Update the extrusion preview.
     * @param {Object} sourcePart - The part being extruded from
     * @param {string} faceId - Face ID ('+x', '-x', '+y', '-y', '+z', '-z')
     * @param {number} distance - Extrusion distance in mm
     */
    update(sourcePart, faceId, distance) {
      clear();

      if (!sourcePart || !faceId || Math.abs(distance) < 1) return;

      const dims = getPartDimensions(sourcePart);
      const pos = sourcePart.position;
      const absDist = Math.abs(distance);

      let boxW, boxH, boxD, cx, cy, cz;

      switch (faceId) {
        case '+z':
          boxW = dims.width;
          boxH = absDist;
          boxD = dims.depth;
          cx = pos.x + dims.width / 2;
          cy = pos.z + dims.height + absDist / 2;
          cz = pos.y + dims.depth / 2;
          break;
        case '-z':
          boxW = dims.width;
          boxH = absDist;
          boxD = dims.depth;
          cx = pos.x + dims.width / 2;
          cy = pos.z - absDist / 2;
          cz = pos.y + dims.depth / 2;
          break;
        case '+x':
          boxW = absDist;
          boxH = dims.height;
          boxD = dims.depth;
          cx = pos.x + dims.width + absDist / 2;
          cy = pos.z + dims.height / 2;
          cz = pos.y + dims.depth / 2;
          break;
        case '-x':
          boxW = absDist;
          boxH = dims.height;
          boxD = dims.depth;
          cx = pos.x - absDist / 2;
          cy = pos.z + dims.height / 2;
          cz = pos.y + dims.depth / 2;
          break;
        case '+y':
          boxW = dims.width;
          boxH = dims.height;
          boxD = absDist;
          cx = pos.x + dims.width / 2;
          cy = pos.z + dims.height / 2;
          cz = pos.y + dims.depth + absDist / 2;
          break;
        case '-y':
          boxW = dims.width;
          boxH = dims.height;
          boxD = absDist;
          cx = pos.x + dims.width / 2;
          cy = pos.z + dims.height / 2;
          cz = pos.y - absDist / 2;
          break;
        default:
          return;
      }

      // Three.js coords: x=domain x, y=domain z, z=domain y
      const geometry = new THREE.BoxGeometry(boxW, boxH, boxD);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx, cy, cz);

      const edges = new THREE.EdgesGeometry(geometry);
      const lineSegments = new THREE.LineSegments(edges, edgeMaterial);
      mesh.add(lineSegments);

      previewMesh = mesh;
      group.add(previewMesh);
    },

    clear,

    dispose() {
      clear();
      material.dispose();
      edgeMaterial.dispose();
    },
  };
}

function getPartDimensions(part) {
  switch (part.type) {
    case 'panel':
      return { width: part.width, depth: part.depth, height: part.thickness };
    case 'leg':
      return { width: part.width, depth: part.depth, height: part.height };
    case 'frame': {
      const w = part.axis === 'y' ? part.width : part.length;
      const d = part.axis === 'y' ? part.length : part.width;
      return { width: w, depth: d, height: part.height };
    }
    default:
      return { width: part.width || 100, depth: part.depth || 100, height: part.height || part.thickness || 18 };
  }
}
