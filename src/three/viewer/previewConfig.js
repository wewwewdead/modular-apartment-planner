import * as THREE from 'three';

export const DEFAULT_PRESET_NAME = 'plan_aligned';
export const CLICK_DISTANCE_THRESHOLD = 6;

export const PRESETS = {
  // Match the SVG blueprint's top/bottom and left/right reading in the preview.
  plan_aligned: new THREE.Vector3(-1.1, 0.92, 1.05),
  default: new THREE.Vector3(-1.1, 0.92, 1.05),
  iso_northeast: new THREE.Vector3(1, 0.88, 1),
  iso_northwest: new THREE.Vector3(-1, 0.88, 1),
  iso_southeast: new THREE.Vector3(1, 0.88, -1),
  iso_southwest: new THREE.Vector3(-1, 0.88, -1),
  front_aligned: new THREE.Vector3(0, 0.05, 1.2),
  side_aligned: new THREE.Vector3(1.2, 0.05, 0),
  bottom_aligned: new THREE.Vector3(-1.1, -0.92, 1.05),
};

export const WALK_EYE_HEIGHT = 1700;
export const WALK_MOVE_SPEED = 1800;
export const WALK_SPRINT_MULTIPLIER = 1.8;
export const WALK_LOOK_DISTANCE = 1200;
export const DEFAULT_WALK_DIRECTION = new THREE.Vector3(1, 0, -1).normalize();
