import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  VIEW_PRESET_OPTIONS,
  elevationCameraFrame,
  fitOrthographicCamera,
  isElevationPreset,
} from './previewCameraMath';

// A 10 m wide (x), 6 m deep (z), 7 m tall building.
const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10000, 7000, 6000));
const center = box.getCenter(new THREE.Vector3());

function fitted(view, aspect = 16 / 9) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  const frustum = fitOrthographicCamera(camera, null, box, view, { aspect });
  camera.updateMatrixWorld(true);
  return { camera, frustum };
}

function project(camera, point) {
  return point.clone().project(camera);
}

describe('fitOrthographicCamera', () => {
  it('looks at the front from the front: plan +x runs left to right, plan +y is toward the camera', () => {
    const { camera } = fitted('elevation_front');
    const direction = camera.getWorldDirection(new THREE.Vector3());
    // Plan y is world z: the front camera stands at +z and looks back along -z.
    expect(direction.z).toBeCloseTo(-1);
    expect(project(camera, new THREE.Vector3(10000, 3500, 3000)).x).toBeGreaterThan(
      project(camera, new THREE.Vector3(0, 3500, 3000)).x,
    );
  });

  it('agrees with the 2D elevations on every side', () => {
    for (const view of ['elevation_front', 'elevation_rear', 'elevation_left', 'elevation_right']) {
      const { camera } = fitted(view);
      const frame = elevationCameraFrame(view);
      const toCamera = camera.position.clone().sub(center).normalize();
      expect(toCamera.distanceTo(frame.toCamera), view).toBeLessThan(1e-9);
      // The camera's right is the elevation's horizontal axis.
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      expect(right.distanceTo(frame.right), view).toBeLessThan(1e-9);
    }
  });

  it('is a true parallel projection: a vertical edge lands at one x at every height', () => {
    const { camera } = fitted('elevation_left');
    const low = project(camera, new THREE.Vector3(0, 0, 0));
    const high = project(camera, new THREE.Vector3(0, 7000, 0));
    const farLow = project(camera, new THREE.Vector3(10000, 0, 0));
    expect(high.x).toBeCloseTo(low.x, 9);
    // Depth changes nothing on screen.
    expect(farLow.x).toBeCloseTo(low.x, 9);
  });

  it('frames the whole model with a little air on every side', () => {
    const { camera } = fitted('elevation_front', 16 / 9);
    const corners = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10000, 0, 0),
      new THREE.Vector3(0, 7000, 6000),
      new THREE.Vector3(10000, 7000, 6000),
    ].map((corner) => project(camera, corner));
    for (const corner of corners) {
      expect(Math.abs(corner.x)).toBeLessThan(0.97);
      expect(Math.abs(corner.y)).toBeLessThan(0.97);
    }
    // Height-limited at this aspect: the model fills the frame but for the padding.
    const top = Math.max(...corners.map((corner) => corner.y));
    expect(top).toBeGreaterThan(0.85);
  });

  it('keeps the requested aspect', () => {
    const { frustum } = fitted('elevation_front', 2);
    expect(frustum.halfWidth / frustum.halfHeight).toBeCloseTo(2);
  });

  it('refuses a view that is not an elevation', () => {
    const camera = new THREE.OrthographicCamera();
    expect(fitOrthographicCamera(camera, null, box, 'iso_northeast')).toBeNull();
    expect(isElevationPreset('iso_northeast')).toBe(false);
    expect(isElevationPreset('elevation_rear')).toBe(true);
  });
});

describe('the View menu', () => {
  it('offers Free, the four iso corners and the four elevations', () => {
    expect(VIEW_PRESET_OPTIONS.map((option) => option.value)).toEqual([
      'free',
      'iso_northeast',
      'iso_northwest',
      'iso_southeast',
      'iso_southwest',
      'elevation_front',
      'elevation_rear',
      'elevation_left',
      'elevation_right',
    ]);
  });
});
