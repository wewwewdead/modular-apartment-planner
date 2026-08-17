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

// Physics walk. Millimetre units throughout: gravity is 9.81 m/s² written in
// mm, speeds are mm/s, and the step height is one code-book stair riser with a
// little slack so a 200 mm tread edge never counts as a wall.
export const WALK_PHYSICS_MOVE_SPEED = 1500;
export const WALK_GRAVITY = 9810;
export const WALK_JUMP_SPEED = 3200;
export const WALK_TERMINAL_SPEED = 20000;
export const WALK_BODY_RADIUS = 250;
export const WALK_STEP_HEIGHT = 220;
export const WALK_HEAD_CLEARANCE = 200;
// How fast the eye rides up a step it has claimed, 1/s. High enough that a
// stair feels like stairs rather than an escalator, low enough that each riser
// is not a teleport.
export const WALK_STAIR_SMOOTHING_RATE = 14;
// Head bob: radians of stride phase per millimetre walked, and the bob's
// half-height. At 1.5 m/s this is ~1.3 strides a second and ±14 mm of eye
// movement — felt, not seen.
export const WALK_BOB_PHASE_PER_MM = 0.0055;
export const WALK_BOB_AMPLITUDE = 14;
