import * as THREE from 'three';
import { DEFAULT_PRESET_NAME, PRESETS } from './previewConfig';

export function descriptorBoundsToWorldBox(bounds) {
  return new THREE.Box3(
    new THREE.Vector3(bounds.minX, bounds.minElevation, bounds.minY),
    new THREE.Vector3(bounds.maxX, bounds.maxElevation, bounds.maxY)
  );
}

export function createGrid(bounds, groundLevel) {
  const size = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    4000
  );
  const normalizedSize = Math.ceil(size / 1000) * 1000;
  const divisions = Math.max(8, Math.round(normalizedSize / 500));
  const grid = new THREE.GridHelper(normalizedSize, divisions, 0x8fa1b4, 0xc7d1db);
  grid.position.y = groundLevel;
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  return grid;
}

export function fitCameraToBox(camera, controls, box, presetName = DEFAULT_PRESET_NAME) {
  const preset = PRESETS[presetName] || PRESETS[DEFAULT_PRESET_NAME];
  const direction = preset.clone().normalize();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1200);
  const halfFovY = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfFovX = Math.atan(Math.tan(halfFovY) * camera.aspect);
  const distanceByHeight = Math.max(size.y, size.z) / (2 * Math.tan(halfFovY));
  const distanceByWidth = Math.max(size.x, size.z) / (2 * Math.tan(halfFovX));
  const distance = Math.max(distanceByHeight, distanceByWidth, radius * 1.4) * 1.15;

  controls.target.copy(center);
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
  camera.near = Math.max(10, distance / 200);
  camera.far = distance * 10;
  camera.updateProjectionMatrix();
  controls.update();
}
