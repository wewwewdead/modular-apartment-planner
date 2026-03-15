import * as THREE from 'three';

const GIZMO_LENGTH = 200;
const AXIS_COLORS = { x: 0xff4444, y: 0x44cc44, z: 0x4488ff };

/**
 * Transform gizmo showing colored axis arrows at a selected part's position.
 * Active during Move/Rotate tools.
 */
export function createTransformGizmo() {
  const group = new THREE.Group();
  group.name = 'TransformGizmo';
  group.visible = false;

  const directions = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };

  const arrowGroups = {};

  for (const [axis, dir] of Object.entries(directions)) {
    const arrowGroup = new THREE.Group();

    // Shaft
    const shaftGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      dir.clone().multiplyScalar(GIZMO_LENGTH),
    ]);
    const shaft = new THREE.Line(shaftGeom, new THREE.LineBasicMaterial({
      color: AXIS_COLORS[axis],
      linewidth: 2,
      depthTest: false,
    }));
    shaft.renderOrder = 1000;
    arrowGroup.add(shaft);

    // Cone tip
    const coneGeom = new THREE.ConeGeometry(6, 20, 6);
    const cone = new THREE.Mesh(coneGeom, new THREE.MeshBasicMaterial({
      color: AXIS_COLORS[axis],
      depthTest: false,
    }));
    cone.position.copy(dir.clone().multiplyScalar(GIZMO_LENGTH));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.renderOrder = 1000;
    arrowGroup.add(cone);

    arrowGroups[axis] = arrowGroup;
    group.add(arrowGroup);
  }

  return {
    group,

    /**
     * Update gizmo position and active axis highlight.
     * @param {Object|null} position - { x, y, z } in Three.js world coords
     * @param {string|null} activeAxis - 'x', 'y', or 'z' to highlight, or null for all
     */
    update(position, activeAxis = null) {
      if (!position) {
        group.visible = false;
        return;
      }

      group.visible = true;
      group.position.set(position.x, position.y, position.z);

      for (const [axis, arrowGroup] of Object.entries(arrowGroups)) {
        if (activeAxis && axis !== activeAxis) {
          arrowGroup.visible = false;
        } else {
          arrowGroup.visible = true;
          // Brighten active axis
          const opacity = activeAxis === axis ? 1.0 : 0.6;
          arrowGroup.traverse((child) => {
            if (child.material) {
              child.material.opacity = opacity;
              child.material.transparent = opacity < 1.0;
            }
          });
        }
      }
    },

    clear() {
      group.visible = false;
    },

    dispose() {
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    },
  };
}
