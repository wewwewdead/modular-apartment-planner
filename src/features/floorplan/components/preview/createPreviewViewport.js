import * as THREE from 'three';
import { IS_DESKTOP_APP } from '@/platform/desktopApp';
import { applyRenderStyleToPalette, createMaterialPalette, disposeMaterialPalette } from './materials';
import { UNLIT_LENS_EMISSIVE_INTENSITY } from './buildPreviewObjects';
import { disposeScene } from './disposeScene';
import { createInspectNavigation } from './createInspectNavigation';
import { createWalkNavigation } from './createWalkNavigation';
import { createWalkPhysics } from './createWalkPhysics';
import { CLICK_DISTANCE_THRESHOLD } from './previewConfig';
import { createGrid, descriptorBoundsToWorldBox } from './previewCameraMath';
import { createSunSky, sunWorldDirection } from './createSunSky';
import { ambientIrradiance, fixtureAdaptationScale } from './fixtureAdaptation';
import { mixNumber, mixSrgbHex, nightfallBlend } from './twilightBlend';
import { SKY_ENVIRONMENT_INTENSITY, STUDIO_ENVIRONMENT_INTENSITY, createEnvironment } from './createEnvironment';
import { createGroundPlane } from './createGroundPlane';
import { createProgressiveRenderer } from './createProgressiveRenderer';
import { canvasPixelRatio } from './previewResolution';
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
 *
 * The desktop shell takes the 4096 map anyway: its refine budget is big enough
 * to absorb the extra pass cost, and the map's resolution is all the interactive
 * frame has — jitter averaging only exists once the camera settles.
 */
const SHADOW_MAP_SIZE = IS_DESKTOP_APP ? 4096 : 2048;

/** Sample count at which the full penumbra width can be resolved cleanly. */
const PENUMBRA_REFERENCE_SAMPLES = 24;

/**
 * Night.
 *
 * Not a sun at a negative altitude — a moonless one, so the room's own lamps are
 * the only thing lighting the model, which is the whole point of being able to
 * switch it on. What is left outside is a hemisphere of deep blue that says
 * there is a world out there without lighting anything in here, a trace of the
 * environment to keep reflective surfaces from going matte black, and enough
 * extra exposure that a 650 lm downlight reads as a downlight.
 */
const NIGHT_SKY_COLOR = 0x1a2438;
const NIGHT_GROUND_COLOR = 0x0d0f14;
const NIGHT_AMBIENT_INTENSITY = 0.015;
const NIGHT_HEMISPHERE_INTENSITY = 0.25;
const NIGHT_ENVIRONMENT_SCALE = 0.02;
const NIGHT_BACKGROUND_INTENSITY = 0.03;

/**
 * How far the camera opens after dark.
 *
 * Derived the same way the sun's own does, one step further down. `exposureScale`
 * adapts partially — `ADAPTATION = 0.6` — and is already pinned at its
 * `MAX_ADAPTATION` ceiling of 4 by civil twilight. Night is not where twilight
 * stopped: the ambient a room receives falls another 3.3× between the two (0.092
 * to 0.028 in the units `ambientIrradiance` returns), and putting that through
 * the same partial adaptation gives 3.3^0.6 ≈ 2.05. Four times two is eight.
 *
 * The 1.6 this replaces was set against a rig with no interreflection in it at
 * all, where the only thing a lamp could light was what its beam struck
 * directly. It rendered the floor under a 650 lm can at 29 of 255 — present in
 * the numbers, black on a screen — which is the look that was reported twice as
 * "the light only glows, the room stays dark".
 *
 * Still heavily partial: a photographer moving from a sunlit street to this room
 * opens about ten stops, and this is three. What it buys is that the lamp lands
 * in the middle of the tone curve instead of in its toe, where ACES has almost
 * no slope and a six-to-one difference in irradiance comes out as a few levels
 * of grey.
 */
const NIGHT_EXPOSURE_SCALE = 8;

/** The daylight values the same three lights carry, restored on the way out. */
const DAY_SKY_COLOR = 0xdde7f4;
const DAY_GROUND_COLOR = 0xe6ded0;
const DAY_AMBIENT_INTENSITY = 0.08;
const DAY_HEMISPHERE_INTENSITY = 0.18;

/**
 * The bounce stand-in, named because the fixture adaptation has to read it: it
 * is the one directional light that reaches an interior, so a lamp indoors is
 * competing with it and the two figures must not drift apart.
 */
const DAY_FILL_INTENSITY = 0.35;

/** The ground's own colour with no sun study to derive one from. */
const DEFAULT_GROUND_COLOR = 0x9a958c;

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
  // One device pixel per device pixel, on both platforms. The desktop shell
  // still supersamples — twice the ratio, every canvas pixel averaged from four
  // rendered ones — but it does it *offscreen*, on the accumulation buffers,
  // and only once the camera has stopped. Supersampling the canvas instead made
  // every frame of every drag pay for detail the compositor immediately scaled
  // away: 10 megapixels a frame in full-window mode, and 47 fps. See
  // `previewResolution` for the two ratios and `createProgressiveRenderer` for
  // which frames use which.
  const devicePixelRatio = window.devicePixelRatio || 1;
  renderer.setPixelRatio(canvasPixelRatio(devicePixelRatio));
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
  const ambientLight = new THREE.AmbientLight(0xffffff, DAY_AMBIENT_INTENSITY);
  const skyLight = new THREE.HemisphereLight(DAY_SKY_COLOR, DAY_GROUND_COLOR, DAY_HEMISPHERE_INTENSITY);
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
  const fillLight = new THREE.DirectionalLight(0xdce6f2, DAY_FILL_INTENSITY);
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
  let interiorLighting = { lightsOn: true, night: false };
  // How much of each fixture's photometry the current rig lets through. Derived
  // in `applySun` from the rig it has just built, never stored on a descriptor.
  let fixtureIntensityScale = 1;
  // How far a running sun study has crossed from daylight into the night rig.
  // Zero whenever there is no study, or its sun is still above civil twilight.
  let nightfallAmount = 0;
  let activeFloorContext = {
    floorId: null,
    spawn: null,
  };
  const walkPoseByFloorId = new Map();
  const forwardVector = new THREE.Vector3();
  const horizontalForward = new THREE.Vector3();
  let lastCompassHeading = 0;
  // Reads the world through callbacks rather than being handed it: `worldRoot`
  // and `ground` are swapped underneath by `setWorld` and `rebuildGround`, and
  // a collider that had to be told about each swap would be one missed call
  // away from walking through the building.
  const walkPhysics = createWalkPhysics({
    camera,
    getCollisionSources: () => [worldRoot, ground?.object],
    getGroundLevel: () => groundLevelMm,
  });
  const walkNavigation = createWalkNavigation({
    camera,
    domElement: renderer.domElement,
    physics: walkPhysics,
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
      physicsMode: walkNavigation.getPhysicsMode(),
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
    // After `renderer.setSize`, never before: the offscreen chain is sized from
    // the canvas's own pixel count rather than from CSS pixels, so the canvas
    // has to be the new size before it is asked.
    progressive.setSize();
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

      // Keyed down to the assembly part, so two boards of the same wall are two
      // pickable things rather than one. Meshes with no part still collapse to
      // their object, which is what the floorplan wants from a click.
      const part = target.part ? `${target.part.side || ''}:${target.part.kind}:${target.part.id}` : '';
      const key = `${target.floorId || ''}:${target.kind}:${target.sourceId}:${part}`;
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

  /**
   * The sun the scene is actually lit by.
   *
   * Night is not a time of day here, it is the sun being switched off: a study
   * left running at noon must not go on lighting the model through it.
   */
  function activeSunState() {
    return interiorLighting.night ? null : sunState;
  }

  /**
   * Switch the ceiling luminaires in the loaded world on or off, and set how
   * much of their rated output the rig around them lets through.
   *
   * Both halves of a lamp, because they are two different things on screen: the
   * light does the lighting, and the lens is what you can see is lit. Dimming
   * one without the other leaves either a bright lamp lighting nothing or a dark
   * lamp casting a pool of light.
   *
   * Driven from `applySun`, which is the only thing that knows what the rig
   * currently is. One traversal of the world root either way, so this is where
   * the intensity is written rather than in a second pass of its own.
   */
  function applyInteriorLighting() {
    if (!worldRoot) return;

    worldRoot.traverse((node) => {
      if (node.userData?.isFixtureLight) {
        node.visible = interiorLighting.lightsOn;
        // Photometry × adaptation. Always from `baseIntensity` rather than from
        // whatever the light is carrying, so repeated passes over a reused scene
        // graph cannot compound the factor.
        const baseIntensity = node.userData.baseIntensity;
        if (Number.isFinite(baseIntensity)) node.intensity = baseIntensity * fixtureIntensityScale;
      }

      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const material of materials) {
        if (!material?.userData?.fixtureLens) continue;
        // The lens deliberately does not take the adaptation scale. Its lit
        // emissive is already past the tone curve's shoulder — 3 renders 248 of
        // 255 at exposure 1 and 251 at the night rig's 1.6 — so scaling it moves
        // nothing on screen and would only clip the lamp's own colour out of the
        // fitting. A brighter pool under an equally white lens is what a
        // photograph of a lit room looks like in any case.
        material.emissiveIntensity = interiorLighting.lightsOn
          ? (material.userData.litEmissiveIntensity ?? 1)
          : UNLIT_LENS_EMISSIVE_INTENSITY;
      }
    });
  }

  function applyGroundColor() {
    if (!ground) return;
    const sun = activeSunState();
    if (sun?.enabled && nightfallAmount < 1) {
      // The ground reads as lit by the same sky it is standing under; a fixed
      // grey under a sunset looks like a hole cut in the picture.
      const altitudeDeg = (sun.altitude * 180) / Math.PI;
      const warmth = THREE.MathUtils.clamp((altitudeDeg + 6) / 30, 0, 1);
      const color = new THREE.Color().setRGB(0.42 + 0.2 * warmth, 0.4 + 0.2 * warmth, 0.37 + 0.19 * warmth);
      // Albedo rather than light, but still part of what "the same picture"
      // means: the sun-derived ground is about a third brighter in linear terms
      // than the default one, and a step that size on the largest surface in the
      // frame is exactly what would give the crossover away.
      if (nightfallAmount > 0) color.lerp(new THREE.Color(DEFAULT_GROUND_COLOR), nightfallAmount);
      ground.setColor(color);
      return;
    }
    ground.setColor(DEFAULT_GROUND_COLOR);
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

    // Night is one more input to this same function rather than a second
    // lighting path beside it: everything below is still derived from the stored
    // state, so leaving night restores exactly what was there before it.
    const night = interiorLighting.night;
    const sun = activeSunState();
    const skyTexture = sunSky.update(sun);
    const sunIsUp = Boolean(sun?.enabled) && sun.altitude > 0;
    let environmentCalibration = STUDIO_ENVIRONMENT_INTENSITY;

    if (sun?.enabled && skyTexture) {
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
    const skyIsLighting = Boolean(sun?.enabled && skyTexture);
    ambientLight.intensity = skyIsLighting ? 0 : DAY_AMBIENT_INTENSITY;
    skyLight.color.setHex(DAY_SKY_COLOR);
    skyLight.groundColor.setHex(DAY_GROUND_COLOR);
    skyLight.intensity = skyIsLighting ? 0 : DAY_HEMISPHERE_INTENSITY;
    // Tracked rather than read back off the light: the fixture adaptation wants
    // the sRGB figure that was set, and a round trip through the linear working
    // space to recover it is a rounding error waiting to happen.
    let hemisphereSkyHex = DAY_SKY_COLOR;
    scene.backgroundIntensity = 1;
    sunAngularRadiusDeg = style.sunAngularRadiusDeg;
    let exposure = style.exposure;
    nightfallAmount = 0;

    // The environment the night rig runs on, hoisted because two things need the
    // identical expression: the bottom of the nightfall fade, and the reference
    // the fixture adaptation is measured against. They have to be the same
    // number, not two roundings of the same idea.
    const nightEnvironmentIntensity =
      style.environmentIntensity * STUDIO_ENVIRONMENT_INTENSITY * NIGHT_ENVIRONMENT_SCALE;

    if (!sun?.enabled) {
      baseLightDirection.set(0.52, 0.74, 0.3).normalize();
      keyLight.intensity = 2.2;
      keyLight.color.setHex(0xffffff);
      fillLight.intensity = DAY_FILL_INTENSITY;
      scene.environmentIntensity = environmentIntensity;
    } else {
      baseLightDirection.copy(sunWorldDirection(sun, sunDirection));
      if (baseLightDirection.lengthSq() < 1e-9) baseLightDirection.set(0, 1, 0);
      fillLight.intensity = 0;

      const altitude = sun.altitude;
      const altitudeDeg = THREE.MathUtils.radToDeg(altitude);
      // Below the horizon the beam is gone and `directBeamFactor` returns zero
      // on its own; the sky carries the scene from there.
      keyLight.intensity = sunIsUp ? SUN_PEAK_INTENSITY * directBeamFactor(altitude) : 0;
      if (sunIsUp) sunColor(altitude, keyLight.color);

      // The sky's own painted brightness *is* its irradiance. Multiplying by a
      // second altitude curve on top would count the sunset twice.
      scene.environmentIntensity = environmentIntensity * skyIntensityScale(altitudeDeg);

      // More of the light scattered means a bigger effective source, so a
      // wider penumbra — the reason a shadow edge at dusk is soft and the same
      // edge at noon is a knife.
      sunAngularRadiusDeg = style.sunAngularRadiusDeg * (1 + 1.5 * diffuseFraction(altitude));
      exposure = style.exposure * exposureScale(altitude);

      // ── Nightfall ──
      //
      // Between civil and nautical twilight the study crosses over to the night
      // rig, and at the bottom it *is* the night rig — the same constants, so a
      // study left running past dark and the night switch are lighting the model
      // with the same numbers. Only gated on the sky actually lighting the
      // scene: with no sky texture (headless, or a locked-down canvas) the
      // ambient and hemisphere fills above are the fallback and must stay.
      nightfallAmount = skyIsLighting ? nightfallBlend(altitudeDeg) : 0;
      if (nightfallAmount > 0) {
        ambientLight.intensity = mixNumber(0, NIGHT_AMBIENT_INTENSITY, nightfallAmount);
        skyLight.intensity = mixNumber(0, NIGHT_HEMISPHERE_INTENSITY, nightfallAmount);
        // The fills come back coloured, which is the point of bringing them
        // back: what is left after nautical twilight is a deep blue dome and a
        // darker ground, and a white fill would say daylight in a picture that
        // no longer has any.
        hemisphereSkyHex = mixSrgbHex(DAY_SKY_COLOR, NIGHT_SKY_COLOR, nightfallAmount);
        skyLight.color.setHex(hemisphereSkyHex);
        skyLight.groundColor.setHex(mixSrgbHex(DAY_GROUND_COLOR, NIGHT_GROUND_COLOR, nightfallAmount));
        // Toward the night rig's *number*, while the map stays the painted sky.
        // No step at the join: STUDIO_ENVIRONMENT_INTENSITY and
        // SKY_ENVIRONMENT_INTENSITY exist precisely so that
        // `environmentIntensity` means the same irradiance whichever map is
        // loaded. Keeping the sky map is the better half of the trade too — a
        // real late-twilight dome is a truer thing for glass to reflect after
        // dark than a product-photography light box.
        scene.environmentIntensity = mixNumber(scene.environmentIntensity, nightEnvironmentIntensity, nightfallAmount);
        scene.backgroundIntensity = mixNumber(1, NIGHT_BACKGROUND_INTENSITY, nightfallAmount);
        // The discontinuity this removes is the loud one: `exposureScale` is
        // pinned at its 4× ceiling from about the horizon down, while night runs
        // at 1.6, so today the same moment of the evening is rendered two and a
        // half stops apart depending on which control you reached for.
        exposure = mixNumber(exposure, style.exposure * NIGHT_EXPOSURE_SCALE, nightfallAmount);
      }
    }

    if (night) {
      keyLight.intensity = 0;
      fillLight.intensity = 0;
      ambientLight.intensity = NIGHT_AMBIENT_INTENSITY;
      skyLight.color.setHex(NIGHT_SKY_COLOR);
      skyLight.groundColor.setHex(NIGHT_GROUND_COLOR);
      skyLight.intensity = NIGHT_HEMISPHERE_INTENSITY;
      hemisphereSkyHex = NIGHT_SKY_COLOR;
      // A trace of whichever environment is loaded, so glass and metal still
      // have something to reflect instead of reading as matte black.
      scene.environmentIntensity = environmentIntensity * NIGHT_ENVIRONMENT_SCALE;
      // The backdrop is painted for daylight whichever one is up; this is what
      // stops a studio sweep or a noon sky from glowing behind a night render.
      scene.backgroundIntensity = NIGHT_BACKGROUND_INTENSITY;
      exposure = style.exposure * NIGHT_EXPOSURE_SCALE;
    }

    // Nothing to cast: a shadow map for a light of zero intensity is a full
    // extra pass over the scene for a picture that cannot change. Derived from
    // the intensity rather than from the night flag so it also covers the study
    // whose sun has set — where the pass would otherwise be re-rendered once per
    // accumulated sample, because the jittered re-aim keeps marking a beam that
    // is not there as dirty.
    keyLight.castShadow = keyLight.intensity > 0;

    renderer.toneMappingExposure = exposure;

    // What a lamp indoors is actually competing with, read back off the rig this
    // function has just built rather than re-derived from the branches above —
    // so a later change to any of those lights is picked up here for free. The
    // key light is not in it: a room is shadowed from the sun, which is the
    // whole case being answered.
    const roomAmbient = ambientIrradiance({
      ambientIntensity: ambientLight.intensity,
      hemisphereIntensity: skyLight.intensity,
      hemisphereSkyHex,
      fillIntensity: fillLight.intensity,
      environmentIntensity: scene.environmentIntensity,
    });
    // The operating point `ARTIFICIAL_LIGHT_CALIBRATION` was measured at, built
    // from the same night constants the branch above sets. Two states land on it
    // exactly rather than nearly — the night switch, and a study below nautical
    // twilight, whose fade ends on these very numbers — so in both the scale is
    // 1 and the shipped night look is untouched.
    const nightAmbient = ambientIrradiance({
      ambientIntensity: NIGHT_AMBIENT_INTENSITY,
      hemisphereIntensity: NIGHT_HEMISPHERE_INTENSITY,
      hemisphereSkyHex: NIGHT_SKY_COLOR,
      fillIntensity: 0,
      environmentIntensity: nightEnvironmentIntensity,
    });
    fixtureIntensityScale = fixtureAdaptationScale(roomAmbient, nightAmbient);
    applyInteriorLighting();

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
      // The shadow camera is fitted to the scene bounds, which just changed —
      // and `applySun` ends by re-running `applyInteriorLighting`, which is what
      // brings fresh groups into line with the switch and with the rig's current
      // fixture scale. One traversal of the world root, not two: this runs on
      // every incremental rebuild, fifteen times a second while a wall is
      // dragged.
      applySun();
    },
    /**
     * The room's own lights: `lightsOn` switches the ceiling luminaires, `night`
     * takes the sun and the sky away so they are the only thing left lighting
     * the model.
     */
    setInteriorLighting({ lightsOn = true, night = false } = {}) {
      interiorLighting = { lightsOn: Boolean(lightsOn), night: Boolean(night) };
      // `applySun` re-derives the whole rig from the stored state — night
      // included — then re-applies the lamps against it and ends in
      // markShadowsDirty + invalidate, which is the same path a style or sun
      // change takes to restart the progressive refine.
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
    setWalkPhysicsMode(enabled) {
      walkNavigation.setPhysicsMode(enabled);
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
