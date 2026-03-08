import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createMaterialPalette, disposeMaterialPalette } from './materials';
import { disposeScene } from './disposeScene';

const DEFAULT_PRESET_NAME = 'plan_aligned';
const CLICK_DISTANCE_THRESHOLD = 6;

const PRESETS = {
  // Match the SVG blueprint's top/bottom and left/right reading in the preview.
  plan_aligned: new THREE.Vector3(-1.1, 0.92, 1.05),
  default: new THREE.Vector3(-1.1, 0.92, 1.05),
  iso_northeast: new THREE.Vector3(1, 0.88, 1),
  iso_northwest: new THREE.Vector3(-1, 0.88, 1),
  iso_southeast: new THREE.Vector3(1, 0.88, -1),
  iso_southwest: new THREE.Vector3(-1, 0.88, -1),
};

function descriptorBoundsToWorldBox(bounds) {
  return new THREE.Box3(
    new THREE.Vector3(bounds.minX, bounds.minElevation, bounds.minY),
    new THREE.Vector3(bounds.maxX, bounds.maxElevation, bounds.maxY)
  );
}

function createGrid(bounds, groundLevel) {
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

function fitCameraToBox(camera, controls, box, presetName) {
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

export function createPreviewViewport(container) {
  const materialPalette = createMaterialPalette();
  const scene = new THREE.Scene();
  scene.background = null;
  const raycaster = new THREE.Raycaster();

  const camera = new THREE.PerspectiveCamera(42, 1, 10, 100000);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 400;
  controls.maxDistance = 150000;
  controls.maxPolarAngle = Math.PI * 0.495;

  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  scene.add(new THREE.HemisphereLight(0xdde7f4, 0xe6ded0, 0.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
  keyLight.position.set(3500, 5000, 2000);
  scene.add(keyLight);

  let animationFrame = 0;
  let worldRoot = null;
  let gridHelper = null;
  let currentBounds = null;
  let currentPreset = DEFAULT_PRESET_NAME;
  let pickHandler = null;
  let pickContext = { activeFloorId: null };
  let pointerDown = null;

  const renderFrame = () => {
    controls.update();
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(renderFrame);
  };

  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const resolvePickTarget = (object) => {
    let current = object;
    while (current) {
      if (current.userData?.previewTarget) {
        return current.userData.previewTarget;
      }
      current = current.parent;
    }
    return null;
  };

  const pickObjectAt = (clientX, clientY) => {
    if (!worldRoot || !pickHandler) return;

    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(worldRoot, true);
    const seenTargets = new Set();
    const targets = [];

    for (const hit of hits) {
      const target = resolvePickTarget(hit.object);
      if (!target) continue;

      const key = `${target.floorId || ''}:${target.kind}:${target.sourceId}`;
      if (seenTargets.has(key)) continue;
      seenTargets.add(key);
      targets.push(target);
    }

    if (!targets.length) {
      pickHandler(null);
      return;
    }

    const preferredTarget = pickContext.activeFloorId
      ? targets.find((target) => target.floorId === pickContext.activeFloorId) || null
      : null;

    pickHandler(preferredTarget || targets[0]);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      pointerDown = null;
      return;
    }

    pointerDown = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerCancel = () => {
    pointerDown = null;
  };

  const handlePointerUp = (event) => {
    if (event.button !== 0 || !pointerDown) {
      pointerDown = null;
      return;
    }

    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    pointerDown = null;

    if (Math.hypot(dx, dy) > CLICK_DISTANCE_THRESHOLD) {
      return;
    }

    pickObjectAt(event.clientX, event.clientY);
  };

  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('pointercancel', handlePointerCancel);
  renderer.domElement.addEventListener('pointerleave', handlePointerCancel);

  animationFrame = window.requestAnimationFrame(renderFrame);

  return {
    setWorld(nextRoot, bounds, groundLevel = 0) {
      const hadWorld = !!worldRoot;
      if (worldRoot) {
        scene.remove(worldRoot);
        disposeScene(worldRoot, { disposeMaterials: true });
      }

      if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry?.dispose?.();
        gridHelper.material?.dispose?.();
      }

      worldRoot = nextRoot;
      currentBounds = descriptorBoundsToWorldBox(bounds);
      gridHelper = createGrid(bounds, groundLevel);
      scene.add(gridHelper);
      scene.add(worldRoot);
      if (!hadWorld) fitCameraToBox(camera, controls, currentBounds, currentPreset);
    },
    resetView() {
      if (!currentBounds) return;
      fitCameraToBox(camera, controls, currentBounds, currentPreset);
    },
    fit() {
      if (!currentBounds) return;
      fitCameraToBox(camera, controls, currentBounds, currentPreset);
    },
    setProjectionPreset(presetName = DEFAULT_PRESET_NAME) {
      currentPreset = presetName in PRESETS ? presetName : DEFAULT_PRESET_NAME;
      if (!currentBounds) return;
      fitCameraToBox(camera, controls, currentBounds, currentPreset);
    },
    setPickHandler(handler) {
      pickHandler = typeof handler === 'function' ? handler : null;
    },
    setPickContext(nextContext = {}) {
      pickContext = {
        ...pickContext,
        ...nextContext,
      };
    },
    resize,
    dispose() {
      window.cancelAnimationFrame(animationFrame);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
      renderer.domElement.removeEventListener('pointerleave', handlePointerCancel);

      if (worldRoot) {
        scene.remove(worldRoot);
        disposeScene(worldRoot, { disposeMaterials: true });
      }

      if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry?.dispose?.();
        gridHelper.material?.dispose?.();
      }

      disposeMaterialPalette(materialPalette);
      renderer.dispose();
      renderer.domElement.remove();
    },
    materialPalette,
  };
}
