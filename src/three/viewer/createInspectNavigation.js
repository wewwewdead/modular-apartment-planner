import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_PRESET_NAME, PRESETS } from './previewConfig';
import { fitCameraToBox } from './previewCameraMath';

export function createInspectNavigation({ camera, domElement }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 400;
  controls.maxDistance = 150000;
  controls.maxPolarAngle = Math.PI;

  const applyMouseBindings = (leftButtonRotateEnabled = true) => {
    controls.mouseButtons.LEFT = leftButtonRotateEnabled ? THREE.MOUSE.ROTATE : null;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  };

  applyMouseBindings(true);

  let currentBounds = null;
  let currentPreset = DEFAULT_PRESET_NAME;

  return {
    update() {
      controls.update();
    },
    setBounds(bounds) {
      currentBounds = bounds ? bounds.clone() : null;
    },
    setEnabled(enabled) {
      controls.enabled = enabled;
    },
    setLeftButtonRotateEnabled(enabled) {
      applyMouseBindings(enabled);
    },
    resetView() {
      if (!currentBounds) return;
      fitCameraToBox(camera, controls, currentBounds, currentPreset);
    },
    setProjectionPreset(presetName = DEFAULT_PRESET_NAME) {
      currentPreset = presetName in PRESETS ? presetName : DEFAULT_PRESET_NAME;
      if (!currentBounds) return;
      fitCameraToBox(camera, controls, currentBounds, currentPreset);
    },
    captureState() {
      return {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      };
    },
    restoreState(state) {
      if (!state?.position || !state?.target) return false;
      camera.position.fromArray(state.position);
      controls.target.fromArray(state.target);
      camera.updateProjectionMatrix();
      controls.update();
      return true;
    },
    dispose() {
      controls.dispose();
    },
  };
}
