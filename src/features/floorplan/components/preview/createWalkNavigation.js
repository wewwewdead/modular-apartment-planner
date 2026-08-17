import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { isTypingTarget } from '@/utils/keyboard';
import { WALK_MOVE_SPEED, WALK_PHYSICS_MOVE_SPEED, WALK_SPRINT_MULTIPLIER } from './previewConfig';

const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyR',
  'KeyF',
  'KeyC',
  'Space',
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
  physics = null,
  moveSpeed = WALK_MOVE_SPEED,
  physicsMoveSpeed = WALK_PHYSICS_MOVE_SPEED,
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
  // Physics is the default walk: the point of the mode is standing in the
  // building. Noclip stays one C-press away.
  let physicsEnabled = true;
  let jumpQueued = false;

  const emitStateChange = () => {
    onStateChange?.({
      enabled,
      isLocked: controls.isLocked,
      physicsMode: physicsEnabled,
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
    jumpQueued = false;
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
      case 'Space':
        // Edge-triggered: holding the bar is one jump, not a pogo stick.
        if (!event.repeat) jumpQueued = true;
        break;
      case 'KeyC':
        if (!event.repeat) setPhysicsMode(!physicsEnabled);
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

  function setPhysicsMode(nextEnabled) {
    const resolved = Boolean(nextEnabled);
    if (physicsEnabled === resolved) return;
    physicsEnabled = resolved;
    // Ungrounded on entry, so gravity carries a camera that was flying back
    // down to the nearest floor — which is the toggle doing its job.
    physics?.reset();
    emitStateChange();
  }

  controls.addEventListener('lock', emitStateChange);
  controls.addEventListener('unlock', emitStateChange);
  domElement.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);

  return {
    update(deltaSeconds) {
      if (!enabled || !controls.isLocked) return;

      camera.updateMatrixWorld(true);
      camera.getWorldDirection(forwardVector);
      rightVector.setFromMatrixColumn(camera.matrixWorld, 0);

      if (physicsEnabled && physics) {
        // Walking follows your heading, not your gaze: looking at the floor
        // must not slow you down, so both axes are flattened to the plan.
        forwardVector.y = 0;
        rightVector.y = 0;
        if (forwardVector.lengthSq() > 1e-8) forwardVector.normalize();
        if (rightVector.lengthSq() > 1e-8) rightVector.normalize();

        movementVector.set(0, 0, 0);
        if (movement.forward) movementVector.add(forwardVector);
        if (movement.backward) movementVector.sub(forwardVector);
        if (movement.left) movementVector.sub(rightVector);
        if (movement.right) movementVector.add(rightVector);

        if (movementVector.lengthSq()) {
          const speed = physicsMoveSpeed * (movement.sprint ? sprintMultiplier : 1);
          movementVector.normalize().multiplyScalar(speed * deltaSeconds);
        }

        physics.step({ moveVector: movementVector, jumpRequested: jumpQueued, deltaSeconds });
        jumpQueued = false;
        return;
      }

      const distance = moveSpeed * (movement.sprint ? sprintMultiplier : 1) * deltaSeconds;

      forwardVector.normalize();
      rightVector.normalize();
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
    setPhysicsMode,
    getPhysicsMode() {
      return physicsEnabled;
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
      // The camera just teleported; whatever the body knew about the floor
      // under it is stale.
      physics?.reset();
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
