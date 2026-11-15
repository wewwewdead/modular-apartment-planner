import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_PRESET_NAME, PRESETS } from './previewConfig';
import { cameraPoseFacing, fitCameraToBox } from './previewCameraMath';

export function createInspectNavigation({ camera: initialCamera, domElement, onChange }) {
  // The camera the controls drive. Swapped for an orthographic one while an
  // elevation preset is up; OrbitControls supports both (it zooms an
  // orthographic camera through `camera.zoom` rather than by dollying).
  let camera = initialCamera;
  const perspectiveCamera = initialCamera;
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

  if (typeof onChange === 'function') {
    controls.addEventListener('change', onChange);
  }

  let currentBounds = null;
  let currentPreset = DEFAULT_PRESET_NAME;
  // The face an assembly editor is working on (`previewCameraMath`
  // `resolveFacing`), or null for every other pane. Only the default view
  // reads it: an iso preset is a choice somebody made on purpose.
  let currentFacing = null;

  return {
    update() {
      controls.update();
    },
    setBounds(bounds) {
      currentBounds = bounds ? bounds.clone() : null;
    },
    getBounds() {
      return currentBounds;
    },
    setEnabled(enabled) {
      controls.enabled = enabled;
    },
    setLeftButtonRotateEnabled(enabled) {
      applyMouseBindings(enabled);
    },
    /** Point the controls at a different camera (perspective ↔ orthographic). */
    setCamera(nextCamera) {
      if (!nextCamera || nextCamera === camera) return;
      camera = nextCamera;
      controls.object = nextCamera;
      controls.update();
    },
    getCamera() {
      return camera;
    },
    resetView() {
      if (!currentBounds) return;
      // Reset is always the default perspective view, whatever preset was up.
      currentPreset = DEFAULT_PRESET_NAME;
      if (camera !== perspectiveCamera) this.setCamera(perspectiveCamera);
      fitCameraToBox(camera, controls, currentBounds, currentPreset, currentFacing);
    },
    /** Remember the face being edited, for the next fit. Moves nothing by itself. */
    setFacing(facing) {
      currentFacing = facing || null;
    },
    /**
     * Turn the camera round to the face being edited, if it is behind the
     * wall: camera and orbit target mirrored across the wall's plane, so the
     * distance, the zoom and the height are what they were. A camera already in
     * front of the face — the user orbited there, then picked a board on it —
     * is left alone. Returns whether it moved.
     */
    turnToFacing() {
      if (!currentBounds) return false;
      const pose = cameraPoseFacing(camera.position, controls.target, currentFacing);
      if (!pose) return false;
      camera.position.copy(pose.position);
      controls.target.copy(pose.target);
      camera.updateProjectionMatrix();
      controls.update();
      return true;
    },
    setProjectionPreset(presetName = DEFAULT_PRESET_NAME) {
      currentPreset = presetName in PRESETS ? presetName : DEFAULT_PRESET_NAME;
      if (!currentBounds) return;
      if (camera !== perspectiveCamera) this.setCamera(perspectiveCamera);
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
    controls,
    dispose() {
      controls.dispose();
    },
  };
}
