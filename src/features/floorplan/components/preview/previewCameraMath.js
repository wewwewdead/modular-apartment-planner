import * as THREE from 'three';
import { DEFAULT_PRESET_NAME, PRESETS } from './previewConfig';
import { ELEVATION_VIEWS } from '@/elevations/projection';

export function descriptorBoundsToWorldBox(bounds) {
  return new THREE.Box3(
    new THREE.Vector3(bounds.minX, bounds.minElevation, bounds.minY),
    new THREE.Vector3(bounds.maxX, bounds.maxElevation, bounds.maxY),
  );
}

/**
 * The ground grid with its two axis lines.
 *
 * `materials` are the grid's three materials from a previous grid
 * (`grid.userData.materials`): the viewport rebuilds the grid with the world,
 * and reusing them means a rebuild costs three geometries rather than three
 * materials to compile and three to dispose. Without them the grid makes its
 * own, and reports them in `userData.materials` for the next one.
 */
export function createGrid(bounds, groundLevel, materials = null) {
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 4000);
  const normalizedSize = Math.ceil(size / 1000) * 1000;
  const divisions = Math.max(8, Math.round(normalizedSize / 500));
  const grid = new THREE.GridHelper(normalizedSize, divisions, 0x8fa1b4, 0xc7d1db);
  grid.position.y = groundLevel;
  if (materials?.grid) {
    grid.material.dispose();
    grid.material = materials.grid;
  } else {
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
  }

  // Colored axis lines on ground plane (SketchUp-style)
  const axisLength = normalizedSize / 2;
  const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-axisLength, 0.5, 0),
    new THREE.Vector3(axisLength, 0.5, 0),
  ]);
  const xAxisLine = new THREE.Line(
    xAxisGeom,
    materials?.xAxis || new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 }),
  );
  grid.add(xAxisLine);

  const zAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.5, -axisLength),
    new THREE.Vector3(0, 0.5, axisLength),
  ]);
  const zAxisLine = new THREE.Line(
    zAxisGeom,
    materials?.zAxis || new THREE.LineBasicMaterial({ color: 0x44cc44, linewidth: 2 }),
  );
  grid.add(zAxisLine);

  grid.userData.materials = { grid: grid.material, xAxis: xAxisLine.material, zAxis: zAxisLine.material };
  return grid;
}

/** How far a perspective camera stands back to take in the whole of `box`. */
export function perspectiveFitDistance(camera, box) {
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1200);
  const halfFovY = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfFovX = Math.atan(Math.tan(halfFovY) * camera.aspect);
  const distanceByHeight = Math.max(size.y, size.z) / (2 * Math.tan(halfFovY));
  const distanceByWidth = Math.max(size.x, size.z) / (2 * Math.tan(halfFovX));
  return Math.max(distanceByHeight, distanceByWidth, radius * 1.4) * 1.15;
}

export function fitCameraToBox(camera, controls, box, presetName = DEFAULT_PRESET_NAME) {
  const preset = PRESETS[presetName] || PRESETS[DEFAULT_PRESET_NAME];
  const direction = preset.clone().normalize();
  const center = box.getCenter(new THREE.Vector3());
  const distance = perspectiveFitDistance(camera, box);

  controls.target.copy(center);
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
  camera.near = Math.max(10, distance / 200);
  camera.far = distance * 10;
  camera.updateProjectionMatrix();
  controls.update();
}

/** The preview's view presets, in the order the View menu lists them. */
export const VIEW_PRESET_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'iso_northeast', label: 'Iso NE' },
  { value: 'iso_northwest', label: 'Iso NW' },
  { value: 'iso_southeast', label: 'Iso SE' },
  { value: 'iso_southwest', label: 'Iso SW' },
  { value: 'elevation_front', label: 'Front' },
  { value: 'elevation_rear', label: 'Rear' },
  { value: 'elevation_left', label: 'Left' },
  { value: 'elevation_right', label: 'Right' },
];

export function isElevationPreset(name) {
  return Boolean(ELEVATION_VIEWS[name]);
}

/**
 * The world-space frame of an elevation, from the same `ELEVATION_VIEWS` the
 * 2D elevations are drawn from, so "front" means the same face in both.
 *
 * Plan (x, y) is world (x, z). An elevation's `horizontalAxis` is the plan
 * direction that runs left-to-right across the drawing, so it is the camera's
 * right vector; the camera then looks along `right × up`, and sits on the other
 * side: `toCamera = (-h.y, 0, h.x)`.
 */
export function elevationCameraFrame(viewName) {
  const view = ELEVATION_VIEWS[viewName];
  if (!view) return null;
  const { x: hx, y: hy } = view.horizontalAxis;
  return {
    right: new THREE.Vector3(hx, 0, hy),
    toCamera: new THREE.Vector3(-hy, 0, hx),
  };
}

/**
 * Fit an orthographic camera to `box` as the named elevation: true parallel
 * projection, the model centred, with `padding` of air (a fraction of the
 * model's extent) on every side. `controls` is optional — a still has none.
 *
 * Returns the half extents of the frustum, in millimetres, or null for an
 * unknown view.
 */
export function fitOrthographicCamera(camera, controls, box, viewName, { aspect, padding = 0.06 } = {}) {
  const frame = elevationCameraFrame(viewName);
  if (!frame || !box || box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const resolvedAspect = aspect || (camera.right - camera.left) / Math.max(camera.top - camera.bottom, 1e-6) || 1;

  // Extent of the box across the drawing and down it.
  const across = Math.abs(size.x * frame.right.x) + Math.abs(size.z * frame.right.z);
  const depth = Math.abs(size.x * frame.toCamera.x) + Math.abs(size.z * frame.toCamera.z);
  const halfWidthNeeded = Math.max(across, 1000) / 2;
  const halfHeightNeeded = Math.max(size.y, 1000) / 2;
  const halfHeight = Math.max(halfHeightNeeded, halfWidthNeeded / resolvedAspect) * (1 + padding * 2);
  const halfWidth = halfHeight * resolvedAspect;

  const distance = Math.max(depth, across, size.y, 2000) * 2;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.zoom = 1;
  camera.near = Math.max(1, distance - depth * 2 - 1000);
  camera.far = distance + depth * 2 + 1000;
  camera.position.copy(center).addScaledVector(frame.toCamera, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
  return { halfWidth, halfHeight, distance };
}
