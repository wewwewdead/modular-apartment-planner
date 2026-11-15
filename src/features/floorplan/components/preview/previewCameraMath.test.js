import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  VIEW_PRESET_OPTIONS,
  cameraPoseFacing,
  directionFacing,
  elevationCameraFrame,
  facingSideOf,
  fitCameraToBox,
  fitOrthographicCamera,
  isElevationPreset,
  mirrorAcrossFacing,
  resolveFacing,
} from './previewCameraMath';
import { PRESETS } from './previewConfig';

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

describe('looking at the face being edited (docs/wall-fastener-visibility.md §2.1)', () => {
  // A wall along world z = 2000 from x = 0 to 4000. Its +z face looks the way
  // plan_aligned does (preset z = 1.05 > 0); its -z face looks away from it.
  const plusZ = resolveFacing(0, 1, 2000, 2000);
  const minusZ = resolveFacing(0, -1, 2000, 2000);
  const wallBox = new THREE.Box3(new THREE.Vector3(0, 0, 1900), new THREE.Vector3(4000, 3000, 2100));

  function fit(facing) {
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 1, 100000);
    const controls = { target: new THREE.Vector3(), update() {} };
    fitCameraToBox(camera, controls, wallBox, 'plan_aligned', facing);
    return { camera, controls };
  }

  it('makes a facing only from four finite numbers and a usable normal', () => {
    expect(resolveFacing(undefined, undefined, undefined, undefined)).toBeNull();
    expect(resolveFacing(0, 0, 10, 10)).toBeNull();
    expect(resolveFacing(Number.NaN, 1, 0, 0)).toBeNull();
    expect(resolveFacing(0, 2, 5, 6)).toEqual({ normalX: 0, normalZ: 1, pointX: 5, pointZ: 6 });
  });

  it('measures which side of the wall a point is on, ignoring height', () => {
    expect(facingSideOf({ x: 100, y: 9000, z: 2500 }, plusZ)).toBe(500);
    expect(facingSideOf({ x: 100, y: 0, z: 1500 }, plusZ)).toBe(-500);
    expect(facingSideOf({ x: 100, y: 0, z: 1500 }, minusZ)).toBe(500);
  });

  it('mirrors across the plane: same height, same distance from it, other side', () => {
    const mirrored = mirrorAcrossFacing(new THREE.Vector3(-3000, 2500, 5000), plusZ);
    expect(mirrored.toArray()).toEqual([-3000, 2500, -1000]);
    // An oblique wall: the plane x = z through the origin.
    const diagonal = resolveFacing(1, -1, 0, 0);
    const point = new THREE.Vector3(3000, 1200, 1000);
    const image = mirrorAcrossFacing(point, diagonal);
    expect(image.x).toBeCloseTo(1000, 6);
    expect(image.z).toBeCloseTo(3000, 6);
    expect(image.y).toBe(1200);
  });

  it('keeps plan_aligned when it already looks at the face, and mirrors it when it does not', () => {
    const preset = PRESETS.plan_aligned;
    expect(directionFacing(preset, null).equals(preset)).toBe(true);
    expect(directionFacing(preset, plusZ).equals(preset)).toBe(true);
    const turned = directionFacing(preset, minusZ);
    expect(turned.toArray()).toEqual([preset.x, preset.y, -preset.z]);
    // Never the preset itself: a caller's vector is not written to.
    expect(PRESETS.plan_aligned.z).toBeGreaterThan(0);
  });

  it('fits from in front of the face, at the same distance and height either way', () => {
    const untouched = fit(null);
    const front = fit(plusZ);
    const back = fit(minusZ);
    expect(front.camera.position.equals(untouched.camera.position)).toBe(true);
    expect(facingSideOf(front.camera.position, plusZ)).toBeGreaterThan(0);
    expect(facingSideOf(back.camera.position, minusZ)).toBeGreaterThan(0);
    expect(back.camera.position.y).toBeCloseTo(front.camera.position.y, 6);
    expect(back.camera.position.distanceTo(back.controls.target)).toBeCloseTo(
      front.camera.position.distanceTo(front.controls.target),
      6,
    );
  });

  it('turns a camera behind the wall round, target and all, and leaves one in front alone', () => {
    const { camera, controls } = fit(plusZ);
    const before = camera.position.distanceTo(controls.target);
    expect(cameraPoseFacing(camera.position, controls.target, plusZ)).toBeNull();
    expect(cameraPoseFacing(camera.position, controls.target, null)).toBeNull();

    const pose = cameraPoseFacing(camera.position, controls.target, minusZ);
    expect(facingSideOf(pose.position, minusZ)).toBeGreaterThan(0);
    expect(pose.position.y).toBe(camera.position.y);
    expect(pose.position.distanceTo(pose.target)).toBeCloseTo(before, 6);
    expect(pose.target.y).toBe(controls.target.y);
    // Mirroring is its own inverse: switching back lands where it started.
    const back = cameraPoseFacing(pose.position, pose.target, plusZ);
    expect(back.position.distanceTo(camera.position)).toBeLessThan(1e-6);
  });
});
