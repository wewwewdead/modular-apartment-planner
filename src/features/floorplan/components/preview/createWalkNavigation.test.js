// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createWalkNavigation } from './createWalkNavigation';

// A stand-in for pointer lock, which jsdom does not have: the test decides
// whether the walk is locked, and `loseLock` plays the browser taking it away.
const lockState = { locked: false, listeners: [] };
vi.mock('three/examples/jsm/controls/PointerLockControls.js', () => ({
  PointerLockControls: class {
    get isLocked() {
      return lockState.locked;
    }
    lock() {
      lockState.locked = true;
    }
    unlock() {
      lockState.locked = false;
    }
    addEventListener(type, listener) {
      lockState.listeners.push([type, listener]);
    }
    removeEventListener(type, listener) {
      lockState.listeners = lockState.listeners.filter(([t, l]) => t !== type || l !== listener);
    }
    dispose() {}
  },
}));

function loseLock() {
  lockState.locked = false;
  for (const [type, listener] of lockState.listeners) if (type === 'unlock') listener({ type });
}

let navigation = null;
let onExitRequested = null;
let camera = null;

function keydown(code, init = {}) {
  const event = new KeyboardEvent('keydown', { code, key: init.key ?? code, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  lockState.locked = false;
  lockState.listeners = [];
  onExitRequested = vi.fn();
  camera = new THREE.PerspectiveCamera();
  navigation = createWalkNavigation({
    camera,
    domElement: document.createElement('canvas'),
    onExitRequested,
  });
  navigation.setEnabled(true);
});

afterEach(() => {
  navigation.dispose();
});

describe('walk navigation keys', () => {
  it('lets Ctrl+S, Ctrl+C, Ctrl+F and Ctrl+R through while unlocked', () => {
    for (const [code, key] of [
      ['KeyS', 's'],
      ['KeyC', 'c'],
      ['KeyF', 'f'],
      ['KeyR', 'r'],
    ]) {
      expect(keydown(code, { key, ctrlKey: true }).defaultPrevented).toBe(false);
    }
  });

  it('lets chords through while locked too', () => {
    lockState.locked = true;
    expect(keydown('KeyS', { key: 's', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(keydown('KeyD', { key: 'd', metaKey: true }).defaultPrevented).toBe(false);
  });

  it("leaves the plan's W and D shortcuts alone while unlocked", () => {
    const reachedWindow = vi.fn();
    window.addEventListener('keydown', reachedWindow);
    const w = keydown('KeyW', { key: 'w' });
    const d = keydown('KeyD', { key: 'd' });
    window.removeEventListener('keydown', reachedWindow);

    expect(w.defaultPrevented).toBe(false);
    expect(d.defaultPrevented).toBe(false);
    expect(reachedWindow).toHaveBeenCalledTimes(2);
  });

  it('takes W while locked', () => {
    lockState.locked = true;
    const reachedWindow = vi.fn();
    window.addEventListener('keydown', reachedWindow);
    const w = keydown('KeyW', { key: 'w' });
    window.removeEventListener('keydown', reachedWindow);

    expect(w.defaultPrevented).toBe(true);
    expect(reachedWindow).not.toHaveBeenCalled();
  });

  it('still leaves walk on Escape while unlocked', () => {
    const escape = keydown('Escape', { key: 'Escape' });
    expect(escape.defaultPrevented).toBe(true);
    expect(onExitRequested).toHaveBeenCalledTimes(1);
  });

  it('takes no keys while the viewport is suspended', () => {
    lockState.locked = true;
    navigation.setInputSuspended(true);
    expect(keydown('KeyW', { key: 'w' }).defaultPrevented).toBe(false);
    expect(keydown('Escape', { key: 'Escape' }).defaultPrevented).toBe(false);
    expect(onExitRequested).not.toHaveBeenCalled();

    navigation.setInputSuspended(false);
    expect(keydown('KeyW', { key: 'w' }).defaultPrevented).toBe(true);
  });
});

// Holding W and Alt-Tabbing away takes pointer lock and focus with it, and the
// key-up goes to another window. Clicking back in must not walk on by itself.
describe('walk navigation when the key-up never comes', () => {
  function stepsForward() {
    const before = camera.position.clone();
    navigation.update(0.1);
    return camera.position.distanceTo(before) > 0;
  }

  it('stops walking when pointer lock is lost mid-stride', () => {
    lockState.locked = true;
    keydown('KeyW', { key: 'w' });
    expect(stepsForward()).toBe(true);

    loseLock();
    lockState.locked = true;

    expect(stepsForward()).toBe(false);
  });

  it('stops walking when the window loses focus mid-stride', () => {
    lockState.locked = true;
    keydown('KeyW', { key: 'w' });
    keydown('ShiftLeft', { key: 'Shift' });
    expect(stepsForward()).toBe(true);

    window.dispatchEvent(new Event('blur'));

    expect(stepsForward()).toBe(false);
  });

  it('lets go of the window when it is disposed', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const lockListenersBefore = lockState.listeners.length;
    const other = createWalkNavigation({ camera, domElement: document.createElement('canvas') });
    const blurListeners = added.mock.calls.filter(([type]) => type === 'blur').map(([, listener]) => listener);
    other.dispose();

    expect(lockState.listeners).toHaveLength(lockListenersBefore);
    expect(blurListeners).toHaveLength(1);
    expect(removed.mock.calls.some(([type, listener]) => type === 'blur' && listener === blurListeners[0])).toBe(true);
    added.mockRestore();
    removed.mockRestore();
  });
});
