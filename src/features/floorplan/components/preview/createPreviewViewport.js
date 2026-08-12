import * as THREE from 'three';
import { applyRenderStyleToPalette, createMaterialPalette, disposeMaterialPalette } from './materials';
import { disposeScene } from './disposeScene';
import { createInspectNavigation } from './createInspectNavigation';
import { createWalkNavigation } from './createWalkNavigation';
import { CLICK_DISTANCE_THRESHOLD } from './previewConfig';
import { createGrid, descriptorBoundsToWorldBox } from './previewCameraMath';
import { createSunSky, sunWorldDirection } from './createSunSky';
import { SKY_ENVIRONMENT_INTENSITY, STUDIO_ENVIRONMENT_INTENSITY, createEnvironment } from './createEnvironment';
import { createGroundPlane } from './createGroundPlane';
import { createProgressiveRenderer } from './createProgressiveRenderer';
import { FRAME_ACTION, nextFrameAction, wantsAnotherFrame } from './refineSchedule';
import { DEFAULT_RENDER_STYLE, renderStyleConfig, toneMappingConstant } from './renderStyle';
import {
  SUN_PEAK_INTENSITY,
  diffuseFraction,
  directBeamFactor,
  exposureScale,
  skyIntensityScale,
  sunColor,
} from './sunLighting';

let axisIndicatorInstance = null;

/**
 * Shadow map edge.
 *
 * 2048 rather than 4096 because the softness comes from averaging jittered sun
 * positions, not from the map's own resolution — and the map is re-rendered
 * once per accumulated sample, so quadrupling its area would quadruple the
 * cost of the refine to sharpen an edge that is about to be blurred anyway.
 */
const SHADOW_MAP_SIZE = 2048;

/** Sample count at which the full penumbra width can be resolved cleanly. */
const PENUMBRA_REFERENCE_SAMPLES = 24;

/**
 * Low-discrepancy point on the sun's disc, for sample `index`.
 *
 * Bases 5 and 7 rather than the 2 and 3 the camera jitter uses: sharing a
 * sequence would correlate "which part of the pixel" with "which part of the
 * sun", and a correlated pair converges to a subtly wrong image instead of a
 * noisy-then-clean one.
 */
function haltonDisc(index, target) {
  const radial = Math.sqrt(halton(index, 5));
  const angle = 2 * Math.PI * halton(index, 7);
  return target.set(radial * Math.cos(angle), radial * Math.sin(angle));
}

function halton(index, base) {
  let result = 0;
  let fraction = 1;
  let i = index + 1;
  while (i > 0) {
    fraction /= base;
    result += fraction * (i % base);
    i = Math.floor(i / base);
  }
  return result;
}

export function createPreviewViewport(container) {
  const materialPalette = createMaterialPalette();
  const scene = new THREE.Scene();
  scene.background = null;
  const raycaster = new THREE.Raycaster();
  const timer = new THREE.Timer();
  timer.connect(document);

  let style = renderStyleConfig(DEFAULT_RENDER_STYLE);

  const camera = new THREE.PerspectiveCamera(42, 1, 10, 100000);
  const renderer = new THREE.WebGLRenderer({
    // Nothing is drawn to the default framebuffer except one full-screen quad,
    // which has no edges to antialias. The multisampling that matters is on the
    // composer's offscreen targets — see MSAA_SAMPLES in createProgressiveRenderer.
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = toneMappingConstant(style.toneMapping);
  renderer.toneMappingExposure = style.exposure;
  // PCFSoftShadowMap is deprecated as of three 0.18x and silently falls back to
  // this anyway; naming it directly keeps the console clean. The softness comes
  // from accumulating jittered sun positions, not from filtering the map, so a
  // hard, high-resolution map is what this wants.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.enabled = true;
  // Re-rendering the shadow map is a full extra pass over the scene. It only
  // has to happen when the model or the light moves — never because the camera
  // did — so it is driven by hand from `markShadowsDirty`.
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const environment = createEnvironment(renderer);

  const inspectNavigation = createInspectNavigation({
    camera,
    domElement: renderer.domElement,
    onChange: () => startRenderLoop(),
  });

  // A trace of uniform fill, insurance for the case where prefiltering the
  // environment fails and there is nothing else lighting the shadowed side.
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.08);
  const skyLight = new THREE.HemisphereLight(0xdde7f4, 0xe6ded0, 0.18);
  scene.add(ambientLight);
  scene.add(skyLight);

  // Default is a decorative three-quarter key light. When a sun study is
  // running, `setSun` re-aims this same light at the real solar position.
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(3500, 5000, 2000);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  scene.add(keyLight);
  scene.add(keyLight.target);

  // Shapes the side the key light misses. No shadow: it is standing in for
  // bounce, and bounce does not cast one.
  const fillLight = new THREE.DirectionalLight(0xdce6f2, 0.35);
  fillLight.position.set(-4200, 2600, -3400);
  scene.add(fillLight);

  // The visible half of the same fact: `keyLight` is where the sun's light
  // comes from, `sunSky` is what you see when you look that way.
  const sunSky = createSunSky();
  scene.add(sunSky.object);
  const sunDirection = new THREE.Vector3();
  const baseLightDirection = new THREE.Vector3(0.52, 0.74, 0.3).normalize();
  const jitteredLightDirection = new THREE.Vector3();
  const lightBasisU = new THREE.Vector3();
  const lightBasisV = new THREE.Vector3();
  const previousLightPosition = new THREE.Vector3();
  const discSample = new THREE.Vector2();
  let lightDistance = 12000;
  let sunState = null;
  // The style's figure is the clear-noon case; `applySun` widens it as the sun
  // drops and more of the light arrives scattered.
  let sunAngularRadiusDeg = style.sunAngularRadiusDeg;

  let animationFrame = 0;
  let renderLoopRunning = false;
  let worldRoot = null;
  let selectionOverlay = null;
  let gridHelper = null;
  let ground = null;
  let currentBounds = null;
  let pickHandler = null;
  let pickContext = { activeFloorId: null };
  let pointerDown = null;
  let navigationModifierActive = false;
  let navigationMode = 'inspect';
  let walkUiHandler = null;
  let walkExitHandler = null;
  let compassHeadingHandler = null;
  let shadowsDirty = true;
  let groundLevelMm = 0;
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

  const markShadowsDirty = () => {
    shadowsDirty = true;
  };

  /**
   * Aim the key light, optionally from a different point on the sun's disc.
   *
   * Sample 0 and any interactive frame both use the centre of the disc. That is
   * not an optimisation, it is the fix for a visible shake: sample zero is
   * *displayed on its own* before there is anything to average it with, so if
   * it came from a point 45% of the way across the disc — which is where the
   * low-discrepancy sequence starts — the shadow would jump by half a penumbra
   * the instant the camera stopped, and jump back the instant it moved again.
   * A camera being nudged along alternates between those two states several
   * times a second.
   *
   * Offsetting the disc sequence by one costs nothing: sample 1 takes the
   * position sample 0 would have had.
   */
  const aimKeyLight = (sampleIndex, totalSamples = 1) => {
    let direction = baseLightDirection;

    if (sampleIndex >= 1 && sunAngularRadiusDeg > 0) {
      // Any two vectors perpendicular to the light give the disc a frame; which
      // two does not matter, only that they are stable between samples.
      lightBasisU.set(0, 1, 0).cross(baseLightDirection);
      if (lightBasisU.lengthSq() < 1e-6) lightBasisU.set(1, 0, 0).cross(baseLightDirection);
      lightBasisU.normalize();
      lightBasisV.copy(baseLightDirection).cross(lightBasisU).normalize();

      haltonDisc(sampleIndex - 1, discSample);
      // Never ask for a wider penumbra than the sample budget can resolve. Four
      // samples spread over a two-degree disc are not a soft shadow, they are
      // four hard shadows stacked — and on a scene heavy enough to have its
      // budget cut, that banding is exactly what would show.
      const resolvable = Math.min(1, Math.sqrt(totalSamples / PENUMBRA_REFERENCE_SAMPLES));
      const spread = Math.tan(THREE.MathUtils.degToRad(sunAngularRadiusDeg * resolvable));
      jitteredLightDirection
        .copy(baseLightDirection)
        .addScaledVector(lightBasisU, discSample.x * spread)
        .addScaledVector(lightBasisV, discSample.y * spread)
        .normalize();
      direction = jitteredLightDirection;
    }

    const centre = keyLight.target.position;
    previousLightPosition.copy(keyLight.position);
    keyLight.position.copy(centre).addScaledVector(direction, lightDistance);
    keyLight.target.updateMatrixWorld();

    // Only when the light really moved. Interactive frames all aim at the disc
    // centre, so orbiting the camera re-aims the light to exactly where it
    // already was — and marking that dirty would re-render the shadow map on
    // every frame of every drag for no change at all.
    if (previousLightPosition.distanceToSquared(keyLight.position) > 1e-6) {
      markShadowsDirty();
    }
  };

  const progressive = createProgressiveRenderer({
    renderer,
    scene,
    camera,
    onBeforeSample: (sampleIndex, totalSamples) => {
      aimKeyLight(sampleIndex, totalSamples);
      if (shadowsDirty) {
        renderer.shadowMap.needsUpdate = true;
        shadowsDirty = false;
      }
    },
  });
  progressive.setStyle(style);

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

  /*
   * The render loop has two speeds.
   *
   * While anything is moving it draws one plain frame per animation frame and
   * throws the accumulation away. The moment the camera settles it starts
   * folding jittered samples into the same image, and keeps going until the
   * sample budget is spent — at which point it stops asking for frames at all
   * and the finished picture simply stays on the canvas.
   */
  const lastCameraPosition = new THREE.Vector3();
  const lastCameraQuaternion = new THREE.Quaternion();
  let poseInitialised = false;
  let sceneDirty = true;
  let lastMovementAt = 0;

  const cameraHasMoved = () => {
    if (!poseInitialised) {
      lastCameraPosition.copy(camera.position);
      lastCameraQuaternion.copy(camera.quaternion);
      poseInitialised = true;
      return true;
    }

    // Millimetre units: a tenth of a millimetre of drift is not a camera move,
    // and treating it as one would stop the refine from ever finishing. The
    // rotation epsilon is the one OrbitControls itself settles at — anything
    // tighter and the controls would call themselves finished while this still
    // reported motion, and the image would never stop restarting.
    const moved =
      camera.position.distanceToSquared(lastCameraPosition) > 0.01 ||
      1 - Math.abs(camera.quaternion.dot(lastCameraQuaternion)) > 1.25e-7;

    if (moved) {
      lastCameraPosition.copy(camera.position);
      lastCameraQuaternion.copy(camera.quaternion);
    }
    return moved;
  };

  const renderFrame = (timestamp) => {
    timer.update(timestamp);
    const deltaSeconds = Math.min(timer.getDelta(), 0.1);

    if (navigationMode === 'inspect') {
      inspectNavigation.update(deltaSeconds);
    } else {
      walkNavigation.update(deltaSeconds);
    }

    emitCompassHeading();
    // Held in front of the camera rather than fixed in the world, so it has to
    // be repositioned after the camera has settled for this frame.
    sunSky.followCamera(camera);

    const moved = cameraHasMoved();
    const action = nextFrameAction({
      moved,
      sceneDirty,
      converged: progressive.isConverged(),
      nowMs: timestamp,
      lastMovementMs: lastMovementAt,
    });

    if (action === FRAME_ACTION.INTERACTIVE) {
      sceneDirty = false;
      lastMovementAt = timestamp;
      progressive.reset();
      progressive.renderInteractive();
    } else if (action === FRAME_ACTION.REFINE) {
      progressive.renderSample();
    }
    // SETTLE draws nothing at all: the frame already on screen is the right one,
    // and redrawing it is how the flicker got in.
    const keepGoing = wantsAnotherFrame(action);

    if (axisIndicatorInstance) {
      axisIndicatorInstance.render(renderer, camera);
    }

    // Walk mode holds the loop open regardless: the keyboard is polled here, so
    // letting it stop would freeze movement until the next mouse event.
    if (keepGoing || navigationMode === 'walk') {
      animationFrame = window.requestAnimationFrame(renderFrame);
    } else {
      renderLoopRunning = false;
    }
  };

  const startRenderLoop = () => {
    if (renderLoopRunning) return;
    renderLoopRunning = true;
    animationFrame = window.requestAnimationFrame(renderFrame);
  };

  const requestRender = () => {
    startRenderLoop();
  };

  /** Anything that changes the picture but not the camera comes through here. */
  const invalidate = () => {
    sceneDirty = true;
    startRenderLoop();
  };

  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    progressive.setSize(width, height);
    invalidate();
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

  /** Scene bounding sphere, falling back to a sane box before a world exists. */
  function sceneSphere() {
    if (currentBounds && !currentBounds.isEmpty()) {
      return currentBounds.getBoundingSphere(new THREE.Sphere());
    }
    return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
  }

  /** The edge overlay is a drawing convention, so it goes away in the render. */
  function applyOutlineVisibility(root) {
    if (!root) return;
    root.traverse((object) => {
      if (object.isLineSegments) object.visible = style.outlines;
    });
  }

  function rebuildGround() {
    if (ground) {
      scene.remove(ground.object);
      ground.dispose();
      ground = null;
    }
    if (!style.ground) return;

    ground = createGroundPlane(currentBounds, groundLevelMm);
    applyGroundColor();
    scene.add(ground.object);
  }

  function applyGroundColor() {
    if (!ground) return;
    if (sunState?.enabled) {
      // The ground reads as lit by the same sky it is standing under; a fixed
      // grey under a sunset looks like a hole cut in the picture.
      const altitudeDeg = (sunState.altitude * 180) / Math.PI;
      const warmth = THREE.MathUtils.clamp((altitudeDeg + 6) / 30, 0, 1);
      ground.setColor(new THREE.Color().setRGB(0.42 + 0.2 * warmth, 0.4 + 0.2 * warmth, 0.37 + 0.19 * warmth));
      return;
    }
    ground.setColor(0x9a958c);
  }

  function applyStyleToRenderer() {
    renderer.toneMapping = toneMappingConstant(style.toneMapping);
    renderer.toneMappingExposure = style.exposure;
    applyRenderStyleToPalette(materialPalette, style);
    progressive.setStyle(style);
    applyOutlineVisibility(worldRoot);
    if (gridHelper) gridHelper.visible = style.grid;
    rebuildGround();
  }

  /**
   * Point the key light at the real sun, hang the visible sun and its sky
   * behind it, light the scene with that sky, or restore the studio default.
   *
   * The direction convention lives in `sunWorldDirection`, which is built on
   * the same `sunDirectionInPlan` the 2D shadow projection uses — so the plan,
   * the preview's shadows and the disc you can see cannot disagree about where
   * the sun is.
   */
  function applySun() {
    const sphere = sceneSphere();
    const radius = Math.max(sphere.radius, 1000);
    lightDistance = radius * 3 + 1000;
    keyLight.target.position.copy(sphere.center);

    const skyTexture = sunSky.update(sunState);
    const sunIsUp = Boolean(sunState?.enabled) && sunState.altitude > 0;
    let environmentCalibration = STUDIO_ENVIRONMENT_INTENSITY;

    if (sunState?.enabled && skyTexture) {
      scene.background = skyTexture;
      scene.environment = environment.skyEnvironment(skyTexture, sunSky.getSkyVersion());
      environmentCalibration = SKY_ENVIRONMENT_INTENSITY;
    } else {
      scene.background = style.sky ? environment.studioBackdrop() : null;
      scene.environment = environment.studioEnvironment();
    }

    // The style's own figure is a multiplier on a *calibrated* environment, so
    // switching between the studio and the sky does not change the exposure.
    const environmentIntensity = style.environmentIntensity * environmentCalibration;

    // A real sky lights a shadow on its own. Anything else still burning is a
    // white light with no physical source, and it shows up precisely where it
    // does the most damage — in the shadows, whose blue is the strongest cue
    // that the lighting is real.
    const skyIsLighting = Boolean(sunState?.enabled && skyTexture);
    ambientLight.intensity = skyIsLighting ? 0 : 0.08;
    skyLight.intensity = skyIsLighting ? 0 : 0.18;
    sunAngularRadiusDeg = style.sunAngularRadiusDeg;
    let exposure = style.exposure;

    if (!sunState?.enabled) {
      baseLightDirection.set(0.52, 0.74, 0.3).normalize();
      keyLight.intensity = 2.2;
      keyLight.color.setHex(0xffffff);
      fillLight.intensity = 0.35;
      scene.environmentIntensity = environmentIntensity;
    } else {
      baseLightDirection.copy(sunWorldDirection(sunState, sunDirection));
      if (baseLightDirection.lengthSq() < 1e-9) baseLightDirection.set(0, 1, 0);
      fillLight.intensity = 0;

      const altitude = sunState.altitude;
      // Below the horizon the beam is gone and `directBeamFactor` returns zero
      // on its own; the sky carries the scene from there.
      keyLight.intensity = sunIsUp ? SUN_PEAK_INTENSITY * directBeamFactor(altitude) : 0;
      if (sunIsUp) sunColor(altitude, keyLight.color);

      // The sky's own painted brightness *is* its irradiance. Multiplying by a
      // second altitude curve on top would count the sunset twice.
      scene.environmentIntensity = environmentIntensity * skyIntensityScale(THREE.MathUtils.radToDeg(altitude));

      // More of the light scattered means a bigger effective source, so a
      // wider penumbra — the reason a shadow edge at dusk is soft and the same
      // edge at noon is a knife.
      sunAngularRadiusDeg = style.sunAngularRadiusDeg * (1 + 1.5 * diffuseFraction(altitude));
      exposure = style.exposure * exposureScale(altitude);
    }

    renderer.toneMappingExposure = exposure;
    aimKeyLight(-1);

    // Fit the orthographic shadow camera to the scene. Sized to the bounding
    // sphere so it stays stable as the sun swings around rather than snapping
    // resolution at every time step.
    const shadowCamera = keyLight.shadow.camera;
    shadowCamera.left = -radius * 1.15;
    shadowCamera.right = radius * 1.15;
    shadowCamera.top = radius * 1.15;
    shadowCamera.bottom = -radius * 1.15;
    shadowCamera.near = Math.max(1, lightDistance - radius * 2);
    shadowCamera.far = lightDistance + radius * 2;
    shadowCamera.updateProjectionMatrix();
    // Shadow acne scales with scene size; these are tuned for millimetre units.
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = radius * 0.004;

    applyGroundColor();
    markShadowsDirty();
    invalidate();
  }

  applyStyleToRenderer();
  applySun();
  startRenderLoop();

  return {
    setRenderStyle(styleName) {
      const nextStyle = renderStyleConfig(styleName);
      if (nextStyle === style) return;
      style = nextStyle;
      applyStyleToRenderer();
      // Sky and ground colour both depend on the style, and the sun is the only
      // thing that knows what they should be.
      applySun();
    },
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

      // Only when the whole world went with it. The overlay is built from
      // descriptors rather than from the world's meshes, so an incremental
      // rebuild leaves it perfectly valid — and dropping it here left the
      // selected object un-highlighted from now until the effect that rebuilds
      // it lands, a React commit later. During a drag that gap reopens fifteen
      // times a second, which is what made a dragged object flash.
      // `setSelectionOverlay` replaces (and disposes) it right afterwards, and
      // `dispose()` clears it on teardown, so nothing is leaked by holding on.
      if (selectionOverlay && !isSameRoot) {
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
      groundLevelMm = groundLevel;
      currentBounds = descriptorBoundsToWorldBox(bounds);
      inspectNavigation.setBounds(currentBounds);
      gridHelper = createGrid(bounds, groundLevel);
      gridHelper.visible = style.grid;
      scene.add(gridHelper);
      if (!isSameRoot) scene.add(worldRoot);
      applyOutlineVisibility(worldRoot);
      rebuildGround();
      // Occlusion is faded out beyond the model's own box, so the box has to
      // follow the model.
      progressive.setSceneBounds(currentBounds);
      if (!hadWorld && navigationMode === 'inspect') {
        inspectNavigation.resetView();
      }

      if (walkPose) {
        walkNavigation.restorePose(walkPose);
      }

      markShadowsDirty();
      // The shadow camera is fitted to the scene bounds, which just changed.
      applySun();
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
      invalidate();
    },
    requestRender,
    /** How far the progressive refine has got. Diagnostic, and cheap to poll. */
    getRenderStats() {
      return progressive.getStats();
    },
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

      if (worldRoot) {
        scene.remove(worldRoot);
        disposeScene(worldRoot, { disposeMaterials: false });
      }

      if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry?.dispose?.();
        gridHelper.material?.dispose?.();
      }

      if (ground) {
        scene.remove(ground.object);
        ground.dispose();
        ground = null;
      }

      scene.remove(sunSky.object);
      sunSky.dispose();
      progressive.dispose();
      environment.dispose();
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
