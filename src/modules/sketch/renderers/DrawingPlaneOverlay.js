import * as THREE from 'three';
import { GROUND_PLANE } from '../domain/drawingPlane';

const GRID_COLOR = 0xB8860B;
const GRID_OPACITY = 0.12;
const PREVIEW_COLOR = 0xB8860B;
const PREVIEW_OPACITY = 0.3;

/**
 * Three.js Group that renders:
 * 1) A translucent grid on the active drawing plane
 * 2) A rectangle preview during draw operations
 */
export function createDrawingPlaneOverlay() {
  const group = new THREE.Group();
  group.name = 'DrawingPlaneOverlay';

  let gridMesh = null;
  let previewMesh = null;

  const gridMaterial = new THREE.MeshBasicMaterial({
    color: GRID_COLOR,
    transparent: true,
    opacity: GRID_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const gridLineMaterial = new THREE.LineBasicMaterial({
    color: GRID_COLOR,
    transparent: true,
    opacity: 0.2,
  });

  const previewMaterial = new THREE.MeshBasicMaterial({
    color: PREVIEW_COLOR,
    transparent: true,
    opacity: PREVIEW_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const previewEdgeMaterial = new THREE.LineBasicMaterial({
    color: PREVIEW_COLOR,
    transparent: true,
    opacity: 0.8,
  });

  function clearGrid() {
    if (gridMesh) {
      group.remove(gridMesh);
      gridMesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
      gridMesh = null;
    }
  }

  function clearPreview() {
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
     * Update the grid to display on the given drawing plane.
     * @param {Object} plane - Drawing plane with origin, normal, uAxis, vAxis
     * @param {number} gridSize - Grid spacing in mm (default 50)
     * @param {number} extent - Grid extent in mm (default 2000)
     */
    setPlane(plane, gridSize = 50, extent = 2000) {
      clearGrid();

      const gridGroup = new THREE.Group();
      gridGroup.name = 'PlaneGrid';

      // Create grid lines
      const halfExtent = extent;
      const lines = [];
      for (let i = -halfExtent; i <= halfExtent; i += gridSize) {
        // Lines along u axis
        lines.push(
          planeToThree(plane, i, -halfExtent),
          planeToThree(plane, i, halfExtent),
        );
        // Lines along v axis
        lines.push(
          planeToThree(plane, -halfExtent, i),
          planeToThree(plane, halfExtent, i),
        );
      }

      if (lines.length > 0) {
        const points = lines.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const lineSegments = new THREE.LineSegments(geometry, gridLineMaterial);
        gridGroup.add(lineSegments);
      }

      gridMesh = gridGroup;
      group.add(gridMesh);
    },

    /**
     * Show or update a rectangle preview on the drawing plane.
     * @param {Object} plane - Drawing plane
     * @param {Object} startLocal - { u, v } start corner in plane-local coords
     * @param {Object} endLocal - { u, v } end corner in plane-local coords
     */
    setPreviewRect(plane, startLocal, endLocal) {
      clearPreview();

      if (!startLocal || !endLocal) return;

      const u1 = Math.min(startLocal.u, endLocal.u);
      const v1 = Math.min(startLocal.v, endLocal.v);
      const u2 = Math.max(startLocal.u, endLocal.u);
      const v2 = Math.max(startLocal.v, endLocal.v);

      const corners = [
        planeToThree(plane, u1, v1),
        planeToThree(plane, u2, v1),
        planeToThree(plane, u2, v2),
        planeToThree(plane, u1, v2),
      ];

      // Fill quad
      const quadGeometry = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        corners[0].x, corners[0].y, corners[0].z,
        corners[1].x, corners[1].y, corners[1].z,
        corners[2].x, corners[2].y, corners[2].z,
        corners[0].x, corners[0].y, corners[0].z,
        corners[2].x, corners[2].y, corners[2].z,
        corners[3].x, corners[3].y, corners[3].z,
      ]);
      quadGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      const quad = new THREE.Mesh(quadGeometry, previewMaterial);

      // Edge outline
      const edgePoints = [...corners, corners[0]].map((c) => new THREE.Vector3(c.x, c.y, c.z));
      const edgeGeometry = new THREE.BufferGeometry().setFromPoints(edgePoints);
      const edge = new THREE.Line(edgeGeometry, previewEdgeMaterial);

      const previewGroup = new THREE.Group();
      previewGroup.name = 'DrawPreview';
      previewGroup.add(quad);
      previewGroup.add(edge);

      previewMesh = previewGroup;
      group.add(previewMesh);
    },

    setPreviewPolygon(plane, points, previewPoint = null) {
      clearPreview();

      const outlinePoints = [...(points || [])];
      if (previewPoint) {
        outlinePoints.push(previewPoint);
      }
      if (outlinePoints.length < 2) return;

      const previewGroup = new THREE.Group();
      previewGroup.name = 'DrawPreview';

      if (outlinePoints.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(outlinePoints[0].u, outlinePoints[0].v);
        for (let index = 1; index < outlinePoints.length; index += 1) {
          shape.lineTo(outlinePoints[index].u, outlinePoints[index].v);
        }
        shape.closePath();

        const fillGeometry = new THREE.ShapeGeometry(shape);
        fillGeometry.applyMatrix4(makePlaneBasisMatrix(plane));
        previewGroup.add(new THREE.Mesh(fillGeometry, previewMaterial));
      }

      const edgePoints = outlinePoints.map((point) => {
        const world = planeToThree(plane, point.u, point.v);
        return new THREE.Vector3(world.x, world.y, world.z);
      });
      if ((points || []).length >= 3) {
        edgePoints.push(edgePoints[0].clone());
      }

      const edgeGeometry = new THREE.BufferGeometry().setFromPoints(edgePoints);
      previewGroup.add(new THREE.Line(edgeGeometry, previewEdgeMaterial));

      previewMesh = previewGroup;
      group.add(previewMesh);
    },

    /**
     * Show a 3D freeform point/line preview.
     * Points are in domain coords {x,y,z}.
     */
    setPreviewFreeform3d(points, previewPoint) {
      clearPreview();

      if (!points || points.length === 0) return;

      const previewGroup = new THREE.Group();
      previewGroup.name = 'DrawPreview';

      // Convert domain to Three.js coords: x=x, y=z, z=y
      const toThree = (p) => new THREE.Vector3(p.x, p.z, p.y);

      const threePoints = points.map(toThree);

      // Sphere markers at each vertex
      const dotGeom = new THREE.SphereGeometry(5, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: PREVIEW_COLOR, depthTest: false });
      for (const pt of threePoints) {
        const dot = new THREE.Mesh(dotGeom, dotMat);
        dot.position.copy(pt);
        dot.renderOrder = 800;
        previewGroup.add(dot);
      }

      // Line segments between placed points
      if (threePoints.length >= 2) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints(threePoints);
        const line = new THREE.Line(lineGeom, previewEdgeMaterial);
        line.renderOrder = 799;
        previewGroup.add(line);
      }

      // Preview line from last point to cursor
      if (previewPoint && threePoints.length >= 1) {
        const last = threePoints[threePoints.length - 1];
        const cursor = toThree(previewPoint);
        const previewLineGeom = new THREE.BufferGeometry().setFromPoints([last, cursor]);
        const previewLineMat = new THREE.LineDashedMaterial({
          color: PREVIEW_COLOR,
          transparent: true,
          opacity: 0.6,
          dashSize: 20,
          gapSize: 10,
        });
        const previewLine = new THREE.Line(previewLineGeom, previewLineMat);
        previewLine.computeLineDistances();
        previewLine.renderOrder = 799;
        previewGroup.add(previewLine);

        // Cursor dot
        const cursorDot = new THREE.Mesh(dotGeom, dotMat);
        cursorDot.position.copy(cursor);
        cursorDot.renderOrder = 800;
        previewGroup.add(cursorDot);
      }

      // Dashed close-line from last point to first when >= 3 points
      if (threePoints.length >= 3) {
        const closeMat = new THREE.LineDashedMaterial({
          color: PREVIEW_COLOR,
          transparent: true,
          opacity: 0.4,
          dashSize: 15,
          gapSize: 10,
        });
        const closeGeom = new THREE.BufferGeometry().setFromPoints([
          threePoints[threePoints.length - 1],
          threePoints[0],
        ]);
        const closeLine = new THREE.Line(closeGeom, closeMat);
        closeLine.computeLineDistances();
        closeLine.renderOrder = 798;
        previewGroup.add(closeLine);
      }

      previewMesh = previewGroup;
      group.add(previewMesh);
    },

    clearPreview,
    clearGrid,

    dispose() {
      clearGrid();
      clearPreview();
      gridMaterial.dispose();
      gridLineMaterial.dispose();
      previewMaterial.dispose();
      previewEdgeMaterial.dispose();
    },
  };
}

/**
 * Convert plane-local (u, v) to Three.js world coordinates.
 * Domain: x=x, y=y, z=z -> Three.js: x=x, y=z, z=y
 */
function planeToThree(plane, u, v) {
  const wx = plane.origin.x + u * plane.uAxis.x + v * plane.vAxis.x;
  const wy = plane.origin.y + u * plane.uAxis.y + v * plane.vAxis.y;
  const wz = plane.origin.z + u * plane.uAxis.z + v * plane.vAxis.z;
  // Convert domain coords to Three.js coords
  return { x: wx, y: wz, z: wy };
}

function domainVectorToThree(vector) {
  return new THREE.Vector3(vector.x, vector.z, vector.y);
}

function makePlaneBasisMatrix(plane) {
  const uAxis = domainVectorToThree(plane.uAxis);
  const vAxis = domainVectorToThree(plane.vAxis);
  const normal = domainVectorToThree(plane.normal);
  const origin = new THREE.Vector3(plane.origin.x, plane.origin.z, plane.origin.y);
  const matrix = new THREE.Matrix4().makeBasis(uAxis, vAxis, normal);
  matrix.setPosition(origin);
  return matrix;
}
