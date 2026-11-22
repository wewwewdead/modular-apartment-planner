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
  // Set while the viewport is parked behind a detail editor: a pane nobody can
  // see takes no keys and no click-to-lock.
  let inputSuspended = false;
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
    if (!enabled || inputSuspended || controls.isLocked) return;
    controls.lock();
  };

  const handleKeyDown = (event) => {
    if (!enabled || inputSuspended) return;
    if (isTypingTarget(event.target)) return;
    // A chord is never a walk key: Ctrl+S, Ctrl+C, Ctrl+F and Ctrl+R keep
    // reaching the app and the browser.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!isMovementKey(event)) return;
    // Unlocked, walk mode only answers Escape (leave walk); every other key —
    // the plan's W and D tool shortcuts among them — goes on to its listener.
    if (!controls.isLocked && event.code !== 'Escape') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

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
    if (!enabled || inputSuspended || isTypingTarget(event.target)) return;
    if (!isMovementKey(event)) return;
    // Unlocked, key-down let the key through (the plan's Space pan latches on
    // it), so its key-up must reach the same listener. Nothing is held to
    // release: movement keys are only set while locked, and losing the lock
    // clears them.
    if (!controls.isLocked && event.code !== 'Escape') return;

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
  // Holding W and Alt-Tabbing away takes pointer lock and focus with it, and
  // the key-up lands in another window. A key is only known to be held while
  // the walk still has the keyboard, so losing either lets go of every key.
  controls.addEventListener('unlock', clearMovement);
  domElement.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', clearMovement);

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
    /** Parks keyboard and click input while the viewport is suspended. */
    setInputSuspended(nextSuspended) {
      inputSuspended = Boolean(nextSuspended);
      if (inputSuspended) clearMovement();
    },
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
      controls.removeEventListener('unlock', clearMovement);
      domElement.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', clearMovement);
    },
  };
}
