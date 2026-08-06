import * as THREE from 'three';
import { createMaterialPalette, disposeMaterialPalette } from './materials';
import { disposeScene } from './disposeScene';
import { createInspectNavigation } from './createInspectNavigation';
import { createWalkNavigation } from './createWalkNavigation';
import { CLICK_DISTANCE_THRESHOLD } from './previewConfig';
import { createGrid, descriptorBoundsToWorldBox } from './previewCameraMath';
import { createWindPreviewLayer } from './buildWindPreviewLayer';

let axisIndicatorInstance = null;

export function createPreviewViewport(container) {
  const materialPalette = createMaterialPalette();
  const scene = new THREE.Scene();
  scene.background = null;
  const raycaster = new THREE.Raycaster();
  const timer = new THREE.Timer();
  timer.connect(document);

  const camera = new THREE.PerspectiveCamera(42, 1, 10, 100000);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // PCFSoftShadowMap is deprecated as of three 0.18x and silently falls back to
  // this anyway; naming it directly keeps the console clean.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const inspectNavigation = createInspectNavigation({
    camera,
    domElement: renderer.domElement,
    onChange: () => startRenderLoop(),
  });

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
  const skyLight = new THREE.HemisphereLight(0xdde7f4, 0xe6ded0, 0.7);
  scene.add(ambientLight);
  scene.add(skyLight);

  // Default is a decorative three-quarter key light. When a sun study is
  // running, `setSun` re-aims this same light at the real solar position and
  // switches on shadow casting.
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
  keyLight.position.set(3500, 5000, 2000);
  keyLight.shadow.mapSize.set(2048, 2048);
  scene.add(keyLight);
  scene.add(keyLight.target);
  let sunState = null;

  let animationFrame = 0;
  let renderLoopRunning = false;
  let worldRoot = null;
  let selectionOverlay = null;
  let windPreviewLayer = null;
  let gridHelper = null;
  let currentBounds = null;
  let pickHandler = null;
  let pickContext = { activeFloorId: null };
  let pointerDown = null;
  let navigationModifierActive = false;
  let navigationMode = 'inspect';
  let walkUiHandler = null;
  let walkExitHandler = null;
  let compassHeadingHandler = null;
  let activeFloorContext = {
    floorId: null,
    spawn: null,
  };
  const walkPoseByFloorId = new Map();
  const forwardVector = new THREE.Vector3();
  const horizontalForward = new THREE.Vector3();
  let lastCompassHeading = 0;
  const walkNavigation = createWalkNavigation({
    camera,
    domElement: renderer.domElement,
    onStateChange: () => {
      emitWalkUiState();
    },
    onExitRequested: () => {
      setNavigationMode('inspect');
      walkExitHandler?.();
    },
  });

  const emitWalkUiState = () => {
    walkUiHandler?.({
      navigationMode,
      isLocked: navigationMode === 'walk' && walkNavigation.isLocked(),
      canLock: navigationMode === 'walk',
    });
  };

  const emitCompassHeading = () => {
    if (!compassHeadingHandler) return;

    camera.getWorldDirection(forwardVector);
    horizontalForward.set(forwardVector.x, 0, forwardVector.z);
    if (horizontalForward.lengthSq() > 1e-6) {
      horizontalForward.normalize();
      lastCompassHeading = THREE.MathUtils.radToDeg(Math.atan2(horizontalForward.x, -horizontalForward.z));
    }

    compassHeadingHandler(lastCompassHeading);
  };

  const saveCurrentWalkPose = () => {
    if (!activeFloorContext.floorId) return;
    walkPoseByFloorId.set(activeFloorContext.floorId, walkNavigation.capturePose());
  };

  const restoreWalkPose = ({ forceSpawn = false } = {}) => {
    if (!activeFloorContext.floorId) return;

    const rememberedPose = !forceSpawn ? walkPoseByFloorId.get(activeFloorContext.floorId) : null;

    if (rememberedPose) {
      walkNavigation.restorePose(rememberedPose);
      return;
    }

    const spawn = activeFloorContext.spawn;
    if (!spawn?.position || !spawn.lookAt) return;

    walkNavigation.restorePose({
      position: [spawn.position.x, spawn.position.y, spawn.position.z],
      lookAt: [spawn.lookAt.x, spawn.lookAt.y, spawn.lookAt.z],
    });
  };

  const setNavigationMode = (nextMode = 'inspect') => {
    const resolvedMode = nextMode === 'walk' ? 'walk' : 'inspect';
    if (navigationMode === resolvedMode) {
      emitWalkUiState();
      return;
    }

    if (navigationMode === 'walk') {
      saveCurrentWalkPose();
    }

    navigationMode = resolvedMode;
    inspectNavigation.setEnabled(navigationMode === 'inspect');
    walkNavigation.setEnabled(navigationMode === 'walk');

    if (navigationMode === 'inspect') {
      // Derive inspect state from walk camera so the view doesn't jump
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const orbitTarget = camera.position.clone().add(forward.multiplyScalar(3000));
      const derived = {
        position: camera.position.toArray(),
        target: orbitTarget.toArray(),
      };
      if (!inspectNavigation.restoreState(derived)) {
        inspectNavigation.resetView();
      }
    } else {
      restoreWalkPose();
    }

    emitWalkUiState();
  };

  // Damping-aware render loop: runs while camera is moving or damping, stops when settled.
  // Walk mode uses continuous rendering; inspect mode renders on demand.
  let dampingFramesRemaining = 0;

  const renderFrame = (timestamp) => {
    timer.update(timestamp);
    const deltaSeconds = Math.min(timer.getDelta(), 0.1);

    if (navigationMode === 'inspect') {
      const prevTarget = inspectNavigation.controls?.target?.clone?.();
      const prevPos = camera.position.clone();
      inspectNavigation.update(deltaSeconds);
      // Check if camera is still damping (position or target changed)
      const posChanged = prevPos && camera.position.distanceToSquared(prevPos) > 0.001;
      const targetChanged = prevTarget && inspectNavigation.controls?.target?.distanceToSquared?.(prevTarget) > 0.001;
      if (posChanged || targetChanged) {
        dampingFramesRemaining = 3; // keep rendering a few extra frames for smooth settle
      } else {
        dampingFramesRemaining = Math.max(0, dampingFramesRemaining - 1);
      }
    } else {
      walkNavigation.update(deltaSeconds);
    }

    windPreviewLayer?.update(deltaSeconds);

    emitCompassHeading();
    renderer.render(scene, camera);
    if (axisIndicatorInstance) {
      axisIndicatorInstance.render(renderer, camera);
    }

    // In walk mode, always continue. In inspect mode, stop when settled.
    if (navigationMode === 'walk' || dampingFramesRemaining > 0 || windPreviewLayer?.animated) {
      animationFrame = window.requestAnimationFrame(renderFrame);
    } else {
      renderLoopRunning = false;
    }
  };

  const startRenderLoop = () => {
    if (renderLoopRunning) return;
    renderLoopRunning = true;
    dampingFramesRemaining = 2;
    animationFrame = window.requestAnimationFrame(renderFrame);
  };

  const requestRender = () => {
    startRenderLoop();
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
    if (navigationMode !== 'inspect') return;
    if (!worldRoot || !pickHandler) return;

    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
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
    if (navigationMode !== 'inspect') {
      pointerDown = null;
      return;
    }

    if (navigationModifierActive) {
      pointerDown = null;
      return;
    }

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
    if (navigationMode !== 'inspect') {
      pointerDown = null;
      return;
    }

    if (navigationModifierActive) {
      pointerDown = null;
      return;
    }

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

  // Initial render
  startRenderLoop();

  /** Scene bounding sphere, falling back to a sane box before a world exists. */
  function sceneSphere() {
    if (currentBounds && !currentBounds.isEmpty()) {
      return currentBounds.getBoundingSphere(new THREE.Sphere());
    }
    return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
  }

  /**
   * Point the key light at the real sun, or restore the decorative default.
   *
   * Plan space maps to world as (x, elevation, y), and a compass bearing
   * becomes a plan direction of (sin, -cos) once the site's north angle is
   * added — the same convention the 2D shadow projection uses, so the two views
   * cannot disagree about where the sun is.
   */
  function applySun() {
    const sphere = sceneSphere();
    const radius = Math.max(sphere.radius, 1000);

    if (!sunState?.enabled) {
      keyLight.castShadow = false;
      renderer.shadowMap.enabled = false;
      keyLight.position.set(3500, 5000, 2000);
      keyLight.target.position.set(0, 0, 0);
      keyLight.target.updateMatrixWorld();
      keyLight.intensity = 1.05;
      keyLight.color.setHex(0xffffff);
      ambientLight.intensity = 0.72;
      skyLight.intensity = 0.7;
      requestRender();
      return;
    }

    if (!(sunState.altitude > 0)) {
      // Below the horizon: no direct sun at all. Keep a dim sky wash so the
      // model stays readable rather than going black.
      keyLight.castShadow = false;
      renderer.shadowMap.enabled = false;
      keyLight.intensity = 0;
      ambientLight.intensity = 0.34;
      skyLight.intensity = 0.3;
      requestRender();
      return;
    }

    const bearing = (sunState.northAngle * Math.PI) / 180 + sunState.azimuth;
    const horizontal = Math.cos(sunState.altitude);
    const direction = new THREE.Vector3(
      horizontal * Math.sin(bearing),
      Math.sin(sunState.altitude),
      horizontal * -Math.cos(bearing),
    );

    const distance = radius * 3 + 1000;
    keyLight.position.copy(sphere.center).addScaledVector(direction, distance);
    keyLight.target.position.copy(sphere.center);
    keyLight.target.updateMatrixWorld();

    // A low sun is dimmer and warmer for the same reason its shadows are long:
    // its light takes a longer path through the atmosphere.
    const elevationFactor = Math.min(1, Math.sin(sunState.altitude) / Math.sin(Math.PI / 6));
    keyLight.intensity = 0.45 + 1.15 * elevationFactor;
    keyLight.color.setRGB(1, 0.72 + 0.28 * elevationFactor, 0.48 + 0.52 * elevationFactor);
    ambientLight.intensity = 0.3 + 0.2 * elevationFactor;
    skyLight.intensity = 0.42 + 0.18 * elevationFactor;

    keyLight.castShadow = true;
    renderer.shadowMap.enabled = true;

    // Fit the orthographic shadow camera to the scene. Sized to the bounding
    // sphere so it stays stable as the sun swings around rather than snapping
    // resolution at every time step.
    const shadowCamera = keyLight.shadow.camera;
    shadowCamera.left = -radius * 1.15;
    shadowCamera.right = radius * 1.15;
    shadowCamera.top = radius * 1.15;
    shadowCamera.bottom = -radius * 1.15;
    shadowCamera.near = Math.max(1, distance - radius * 2);
    shadowCamera.far = distance + radius * 2;
    shadowCamera.updateProjectionMatrix();
    // Shadow acne scales with scene size; these are tuned for millimetre units.
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = radius * 0.004;

    requestRender();
  }

  return {
    setSun(nextSun) {
      sunState = nextSun || null;
      applySun();
    },
    setWorld(nextRoot, bounds, groundLevel = 0) {
      const hadWorld = !!worldRoot;
      const walkPose = navigationMode === 'walk' ? walkNavigation.capturePose() : null;
      // When the incremental scene cache is used it hands back the SAME
      // persistent root each build, having already disposed only the floor
      // groups it rebuilt. Disposing/removing the root in that case would
      // destroy the reused geometries, so skip teardown on identity reuse.
      const isSameRoot = worldRoot && worldRoot === nextRoot;

      if (worldRoot && !isSameRoot) {
        scene.remove(worldRoot);
        // disposeMaterials: false — shared materials are owned by the palette,
        // disposed via disposeMaterialPalette() in viewport.dispose().
        disposeScene(worldRoot, { disposeMaterials: false });
      }

      if (selectionOverlay) {
        scene.remove(selectionOverlay);
        disposeScene(selectionOverlay, { disposeMaterials: true });
        selectionOverlay = null;
      }

      if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry?.dispose?.();
        gridHelper.material?.dispose?.();
      }

      worldRoot = nextRoot;
      currentBounds = descriptorBoundsToWorldBox(bounds);
      inspectNavigation.setBounds(currentBounds);
      gridHelper = createGrid(bounds, groundLevel);
      scene.add(gridHelper);
      scene.add(worldRoot);
      if (!hadWorld && navigationMode === 'inspect') {
        inspectNavigation.resetView();
      }

      if (walkPose) {
        walkNavigation.restorePose(walkPose);
      }

      // The shadow camera is fitted to the scene bounds, which just changed.
      applySun();
      requestRender();
    },
    resetView() {
      if (navigationMode === 'walk') {
        if (activeFloorContext.floorId) {
          walkPoseByFloorId.delete(activeFloorContext.floorId);
        }
        restoreWalkPose({ forceSpawn: true });
        return;
      }
      inspectNavigation.resetView();
      requestRender();
    },
    fit() {
      inspectNavigation.resetView();
      requestRender();
    },
    setProjectionPreset(presetName) {
      inspectNavigation.setProjectionPreset(presetName);
      requestRender();
    },
    setInspectLeftButtonRotateEnabled(enabled) {
      inspectNavigation.setLeftButtonRotateEnabled(enabled);
    },
    setNavigationModifierActive(active) {
      navigationModifierActive = !!active;
      if (navigationModifierActive) {
        pointerDown = null;
      }
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
    setNavigationMode(mode) {
      setNavigationMode(mode);
      requestRender();
    },
    setSelectionOverlay(nextOverlay) {
      if (selectionOverlay) {
        scene.remove(selectionOverlay);
        // Overlay materials are clones, safe to dispose
        disposeScene(selectionOverlay, { disposeMaterials: true });
      }
      selectionOverlay = nextOverlay;
      if (selectionOverlay) {
        scene.add(selectionOverlay);
      }
      requestRender();
    },
    setWindStudy(study, options = {}) {
      if (windPreviewLayer) {
        scene.remove(windPreviewLayer.group);
        windPreviewLayer.dispose();
        windPreviewLayer = null;
      }
      windPreviewLayer = createWindPreviewLayer(study, options);
      if (windPreviewLayer) scene.add(windPreviewLayer.group);
      requestRender();
    },
    requestRender,
    setActiveFloorContext(nextContext = {}) {
      const previousFloorId = activeFloorContext.floorId;
      const nextFloorId = nextContext.floorId ?? activeFloorContext.floorId;
      const floorChanged = previousFloorId !== nextFloorId;

      if (navigationMode === 'walk' && floorChanged && previousFloorId) {
        saveCurrentWalkPose();
      }

      activeFloorContext = {
        ...activeFloorContext,
        ...nextContext,
      };

      if (navigationMode === 'walk' && floorChanged) {
        restoreWalkPose();
      }

      requestRender();
    },
    setWalkUiHandler(handler) {
      walkUiHandler = typeof handler === 'function' ? handler : null;
      emitWalkUiState();
    },
    setWalkExitHandler(handler) {
      walkExitHandler = typeof handler === 'function' ? handler : null;
    },
    setCompassHeadingHandler(handler) {
      compassHeadingHandler = typeof handler === 'function' ? handler : null;
      emitCompassHeading();
    },
    resize() {
      resize();
      requestRender();
    },
    dispose() {
      window.cancelAnimationFrame(animationFrame);
      renderLoopRunning = false;
      inspectNavigation.dispose();
      walkNavigation.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
      renderer.domElement.removeEventListener('pointerleave', handlePointerCancel);

      if (selectionOverlay) {
        scene.remove(selectionOverlay);
        disposeScene(selectionOverlay, { disposeMaterials: true });
        selectionOverlay = null;
      }

      if (windPreviewLayer) {
        scene.remove(windPreviewLayer.group);
        windPreviewLayer.dispose();
        windPreviewLayer = null;
      }

      if (worldRoot) {
        scene.remove(worldRoot);
        disposeScene(worldRoot, { disposeMaterials: false });
      }

      if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry?.dispose?.();
        gridHelper.material?.dispose?.();
      }

      disposeMaterialPalette(materialPalette);
      timer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    setAxisIndicator(indicator) {
      axisIndicatorInstance = indicator;
    },
    materialPalette,
    getCamera() {
      return camera;
    },
    getDomElement() {
      return renderer.domElement;
    },
    getScene() {
      return scene;
    },
    getRaycaster() {
      return raycaster;
    },
  };
}
