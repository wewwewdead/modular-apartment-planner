import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { isTypingTarget } from '@/utils/keyboard';
import { WALK_MOVE_SPEED, WALK_SPRINT_MULTIPLIER } from './previewConfig';

const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyR',
  'KeyF',
  'ShiftLeft',
  'ShiftRight',
  'Escape',
]);

function isMovementKey(event) {
  return MOVEMENT_KEYS.has(event.code);
}

export function createWalkNavigation({
  camera,
  domElement,
  moveSpeed = WALK_MOVE_SPEED,
  sprintMultiplier = WALK_SPRINT_MULTIPLIER,
  onStateChange,
  onExitRequested,
}) {
  const controls = new PointerLockControls(camera, domElement);
  const movement = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    sprint: false,
  };
  const forwardVector = new THREE.Vector3();
  const rightVector = new THREE.Vector3();
  const movementVector = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  let enabled = false;

  const emitStateChange = () => {
    onStateChange?.({
      enabled,
      isLocked: controls.isLocked,
    });
  };

  const clearMovement = () => {
    movement.forward = false;
    movement.backward = false;
    movement.left = false;
    movement.right = false;
    movement.up = false;
    movement.down = false;
    movement.sprint = false;
  };

  const handleClick = () => {
    if (!enabled || controls.isLocked) return;
    controls.lock();
  };

  const handleKeyDown = (event) => {
    if (!enabled) return;
    if (isTypingTarget(event.target)) return;
    if (!isMovementKey(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (!controls.isLocked && event.code !== 'Escape') return;

    switch (event.code) {
      case 'KeyW':
        movement.forward = true;
        break;
      case 'KeyS':
        movement.backward = true;
        break;
      case 'KeyA':
        movement.left = true;
        break;
      case 'KeyD':
        movement.right = true;
        break;
      case 'KeyR':
        movement.up = true;
        break;
      case 'KeyF':
        movement.down = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        movement.sprint = true;
        break;
      case 'Escape':
        clearMovement();
        onExitRequested?.();
        break;
      default:
        return;
    }
  };

  const handleKeyUp = (event) => {
    if (!enabled || isTypingTarget(event.target)) return;
    if (!isMovementKey(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    switch (event.code) {
      case 'KeyW':
        movement.forward = false;
        break;
      case 'KeyS':
        movement.backward = false;
        break;
      case 'KeyA':
        movement.left = false;
        break;
      case 'KeyD':
        movement.right = false;
        break;
      case 'KeyR':
        movement.up = false;
        break;
      case 'KeyF':
        movement.down = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        movement.sprint = false;
        break;
      default:
        return;
    }
  };

  controls.addEventListener('lock', emitStateChange);
  controls.addEventListener('unlock', emitStateChange);
  domElement.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);

  return {
    update(deltaSeconds) {
      if (!enabled || !controls.isLocked) return;

      const distance = moveSpeed
        * (movement.sprint ? sprintMultiplier : 1)
        * deltaSeconds;

      camera.updateMatrixWorld(true);
      camera.getWorldDirection(forwardVector).normalize();
      rightVector.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      movementVector.set(0, 0, 0);

      if (movement.forward) movementVector.add(forwardVector);
      if (movement.backward) movementVector.sub(forwardVector);
      if (movement.left) movementVector.sub(rightVector);
      if (movement.right) movementVector.add(rightVector);
      if (movement.up) movementVector.add(worldUp);
      if (movement.down) movementVector.sub(worldUp);

      if (!movementVector.lengthSq()) return;

      movementVector.normalize().multiplyScalar(distance);
      camera.position.add(movementVector);
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      clearMovement();
      if (!enabled && controls.isLocked) {
        controls.unlock();
      }
      emitStateChange();
    },
    isLocked() {
      return controls.isLocked;
    },
    capturePose() {
      return {
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
      };
    },
    restorePose(pose) {
      if (!pose?.position) return false;

      camera.position.fromArray(pose.position);
      if (pose.quaternion) {
        camera.quaternion.fromArray(pose.quaternion);
      } else if (pose.lookAt) {
        const lookAt = Array.isArray(pose.lookAt)
          ? new THREE.Vector3().fromArray(pose.lookAt)
          : new THREE.Vector3(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
        camera.lookAt(lookAt);
      }
      camera.updateMatrixWorld(true);
      return true;
    },
    dispose() {
      clearMovement();
      if (controls.isLocked) {
        controls.unlock();
      }
      controls.dispose?.();
      controls.disconnect?.();
      controls.removeEventListener('lock', emitStateChange);
      controls.removeEventListener('unlock', emitStateChange);
      domElement.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    },
  };
}
