import * as THREE from 'three';

const AXIS_SIZE = 80;
const VIEWPORT_SIZE = 100;
const AXIS_COLORS = { x: 0xff4444, y: 0x44cc44, z: 0x4488ff };
const LABEL_COLORS = { x: '#ff4444', y: '#44cc44', z: '#4488ff' };

/**
 * Small RGB axis triad rendered in a viewport corner (like SketchUp's corner axes).
 * Uses a separate orthographic camera that mirrors the main camera's rotation.
 */
export function createAxisIndicator() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-VIEWPORT_SIZE, VIEWPORT_SIZE, VIEWPORT_SIZE, -VIEWPORT_SIZE, 1, 300);
  camera.position.set(0, 0, 200);
  camera.lookAt(0, 0, 0);

  // Create axis lines
  const axes = ['x', 'y', 'z'];
  const directions = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };

  for (const axis of axes) {
    const dir = directions[axis];
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      dir.clone().multiplyScalar(AXIS_SIZE * 0.7),
    ]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: AXIS_COLORS[axis], linewidth: 2 }));
    scene.add(line);

    // Arrowhead cone
    const coneGeom = new THREE.ConeGeometry(4, 14, 6);
    const cone = new THREE.Mesh(coneGeom, new THREE.MeshBasicMaterial({ color: AXIS_COLORS[axis] }));
    const tipPos = dir.clone().multiplyScalar(AXIS_SIZE * 0.7);
    cone.position.copy(tipPos);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(cone);
  }

  // Label sprites
  for (const axis of axes) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = LABEL_COLORS[axis];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(axis.toUpperCase(), 16, 16);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    const dir = directions[axis];
    sprite.position.copy(dir.clone().multiplyScalar(AXIS_SIZE * 0.92));
    sprite.scale.set(16, 16, 1);
    scene.add(sprite);
  }

  // Rotation quaternion
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();

  return {
    /**
     * Render the axis indicator in the bottom-left corner of the viewport.
     * Call after the main scene render.
     */
    render(renderer, mainCamera) {
      const { width, height } = renderer.getSize(new THREE.Vector2());
      const size = Math.min(120, Math.floor(Math.min(width, height) * 0.15));
      const margin = 10;
      const x = margin;
      const y = margin;

      // Mirror the main camera's rotation
      mainCamera.getWorldQuaternion(q);
      camera.position.set(0, 0, 200).applyQuaternion(q);
      camera.up.set(0, 1, 0).applyQuaternion(q);
      camera.lookAt(0, 0, 0);

      const currentAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setViewport(x, y, size, size);
      renderer.setScissor(x, y, size, size);
      renderer.setScissorTest(true);
      renderer.clearDepth();
      renderer.render(scene, camera);

      // Restore
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.autoClear = currentAutoClear;
    },

    dispose() {
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    },
  };
}
