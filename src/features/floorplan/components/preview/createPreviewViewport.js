import * as THREE from 'three';
import { IS_DESKTOP_APP } from '@/platform/desktopApp';
import {
  PALETTE_LOOKS,
  applyRenderStyleToPalette,
  applyRoofAppearanceToPalette,
  createMaterialPalette,
  disposeMaterialPalette,
} from './materials';
import { UNLIT_LENS_EMISSIVE_INTENSITY, ensureOutlines } from './buildPreviewObjects';
import { SOURCE_ONLY_LAYER, remergeFloorOutlines, unitOutlineGeometry } from './previewBatching';
import { ghostMaterialFor, ghostMaterialsOf } from './materials';
import {
  CROSSFADE_MS,
  DEFAULT_VIEW_MODE,
  TIERS,
  VIEW_MODES,
  applyViewModeToWorld,
  choosePickTarget,
  effectiveRenderStyle,
  isSeeThrough,
  paletteOpacities,
  resolveViewMode,
  setGhostDepthWrite,
  tierOf,
  viewModePolicy,
  writeOpacities,
} from './viewMode';
import { disposeScene } from './disposeScene';
import { freezeStaticMatrices } from './staticMatrices';
import { createInspectNavigation } from './createInspectNavigation';
import { createWalkNavigation } from './createWalkNavigation';
import { createWalkPhysics } from './createWalkPhysics';
import { CLICK_DISTANCE_THRESHOLD, PRESETS } from './previewConfig';
import {
  createGrid,
  descriptorBoundsToWorldBox,
  elevationCameraFrame,
  fitOrthographicCamera,
  isElevationPreset,
  perspectiveFitDistance,
} from './previewCameraMath';
import { createSunSky, sunWorldDirection } from './createSunSky';
import { ambientIrradiance, fixtureAdaptationScale } from './fixtureAdaptation';
import { mixNumber, mixSrgbHex, nightfallBlend } from './twilightBlend';
import { SKY_ENVIRONMENT_INTENSITY, STUDIO_ENVIRONMENT_INTENSITY, createEnvironment } from './createEnvironment';
import { createGroundMaterial, createGroundPlane, disposeGroundMaterial } from './createGroundPlane';
import { REFINE_PROFILES, createProgressiveRenderer } from './createProgressiveRenderer';
import { canvasPixelRatio } from './previewResolution';
import { compileScenePrograms, createBackgroundWarmup } from './compileScenePrograms';
import { FRAME_ACTION, nextFrameAction, shouldPresizeRefine, wantsAnotherFrame } from './refineSchedule';
import { PREVIEW_PERF_ENABLED, createPreviewPerfRecorder, publishPreviewPerf } from './previewPerf';
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
 * How long after the last world change the shader warm-up runs.
 *
 * The asynchronous compile (`compileScenePrograms`) is worth firing because
 * the alternative is compiling the same programs synchronously in the middle of
 * the first frame that shows a new material or a new light count — which is
 * exactly the hitch a user reads as the preview "catching up". It is not worth
 * firing fifteen times a second, which is how often a dragged wall rebuilds the
 * scene, so it waits for the drag to stop.
 */
const SHADER_WARMUP_DEBOUNCE_MS = 250;

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

/**
 * The ground's own colour with no sun study to derive one from: a light paving
 * tone, so the white model stands on a plinth rather than in a hole, and the
 * shadow pooling under it has something pale to darken.
 */
const DEFAULT_GROUND_COLOR = 0xc9c6c0;
/** The ground as it was, for the detail editors' classic look. */
const CLASSIC_GROUND_COLOR = 0x9a958c;

/*
 * The warm room behind every window (see `applyWindowGlow`). Emissive
 * intensities: a trace with the lights off, a lived-in glow by day with them
 * on, and lit windows after dark — at night the exposure is several stops up,
 * so the night figure does not have to shout.
 */
const WINDOW_GLOW_UNLIT = 0.03;
const WINDOW_GLOW_DAY = 0.35;
const WINDOW_GLOW_NIGHT = 0.3;
const WINDOW_GLOW_OPACITY = 0.6;

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

export function createPreviewViewport(container, { look = PALETTE_LOOKS.WHITE_MODEL } = {}) {
  const materialPalette = createMaterialPalette({ look });
  // The ground's own colour in this look (see DEFAULT_GROUND_COLOR).
  const defaultGroundColor = look === PALETTE_LOOKS.CLASSIC ? CLASSIC_GROUND_COLOR : DEFAULT_GROUND_COLOR;
  const scene = new THREE.Scene();
  scene.background = null;
  /*
   * The scene sits at the origin and is never transformed, and saying so out
   * loud is what makes freezing the world root worth anything.
   *
   * `Object3D.updateMatrix` ends by setting `matrixWorldNeedsUpdate`, and
   * `updateMatrixWorld` turns that into `force = true` for the whole subtree. So
   * a Scene left on auto re-derives every descendant's world matrix on every
   * frame regardless of what its children have been set to — the building, its
   * batches, the outline of every stud. With this off, the walk still visits
   * every node but composes and multiplies nothing that has not moved. The
   * children that do move (the sun, its sky, the ground, the grid) keep their
   * own flag and go on forcing their own subtrees, which is all they need.
   */
  scene.matrixAutoUpdate = false;
  const raycaster = new THREE.Raycaster();
  // A batched member is drawn by an instanced batch in another root, and the
  // mesh the click has to resolve to is the one left behind on this layer. The
  // camera never looks at it; the picker only ever looks at it.
  raycaster.layers.enable(SOURCE_ONLY_LAYER);
  const timer = new THREE.Timer();
  timer.connect(document);

  let style = renderStyleConfig(DEFAULT_RENDER_STYLE);
  /*
   * The see-through mode (`viewMode.js`). `viewMode` is the one on screen;
   * `requestedViewMode` the one last asked for, which runs ahead of it while a
   * first toggle's ghost programs link in the background. Each request takes a
   * token, so a compile that resolves for a request since replaced is ignored.
   * `viewModeFade` is the crossfade in flight, if any: `previous` is the mode
   * being left, `from`/`to` the opacities it runs between.
   */
  let viewMode = DEFAULT_VIEW_MODE;
  let requestedViewMode = DEFAULT_VIEW_MODE;
  let viewModeToken = 0;
  let viewModeFade = null;
  // How many twins the palette had when their opacities were last written, so
  // a twin a rebuild makes (a first roof, in X-ray) is given its opacity.
  let knownGhostCount = 0;
  // Which variants (plain mesh, instanced batch) of each twin a warm-up has
  // already been issued for: a program is per variant.
  const ghostWarmupVariants = new WeakMap();
  /*
   * The mode the *style* follows: the see-through side of a fade, whichever
   * way it runs, so ambient occlusion stays off and the outlines stay up for
   * the whole of it, and change only when it lands.
   */
  const styleViewMode = () => (viewModeFade && !isSeeThrough(viewMode) ? viewModeFade.previous : viewMode);
  const effectiveStyle = () => effectiveRenderStyle(style, styleViewMode());

  const camera = new THREE.PerspectiveCamera(42, 1, 10, 100000);
  /*
   * The elevation presets look through a true orthographic camera — parallel
   * verticals, no convergence — fitted to the model. Created once, switched in
   * and out by `setActiveCamera`; the perspective camera stays the walk camera
   * and the one every other view uses.
   */
  const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 100000);
  let activeCamera = camera;
  // The preset on screen and the direction it looks from (target → camera), so
  // an orbit that turns away from it can be noticed and the menu told.
  let viewPresetName = 'free';
  let presetDirection = null;
  // While an elevation is up and no sun study is running, the studio key light
  // comes over the viewer's left shoulder — see `elevationKeyLight`.
  let elevationLightDirection = null;
  let viewPresetHandler = null;
  let renderStatusHandler = null;
  let lastReportedConverged = null;
  /*
   * Where the pane is on its way to a first picture, for the panel's loading
   * state: 'building' until a world arrives, 'compiling' while its programs
   * link, 'ready' once a frame of it is on the canvas. Waking from suspension
   * goes back through 'waking' until the catch-up frame is drawn.
   */
  let loadPhase = 'building';
  let loadStatusHandler = null;
  const renderer = new THREE.WebGLRenderer({
    // Nothing is drawn to the default framebuffer except one full-screen quad,
    // which has no edges to antialias. The multisampling that matters is on the
    // composer's offscreen targets — see MSAA_SAMPLES in createProgressiveRenderer.
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Without KHR_parallel_shader_compile the links run on this thread whatever
  // the gate does; the panel says so rather than pretending otherwise.
  const parallelShaderCompile = renderer.extensions.has('KHR_parallel_shader_compile');
  const emitLoadPhase = (next) => {
    if (loadPhase === next) return;
    loadPhase = next;
    loadStatusHandler?.({ phase: next, parallelShaderCompile });
  };
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

  const environment = createEnvironment(renderer, { look });
  /*
   * The studio environment is not built until its programs have linked in the
   * background (see `prepareStudioEnvironment`); until then the scene has no
   * environment, which nothing sees — no frame of a world is drawn before the
   * first-world gate, and that gate compiles only once this has landed, so the
   * programs it links are the ones with the environment in them.
   */
  let disposed = false;
  let studioEnvironmentReady = false;
  const studioEnvironmentPrepared = environment.prepareStudioEnvironment().then(() => {
    studioEnvironmentReady = true;
    if (!disposed) applySun();
  });

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
  /*
   * Whether this viewport has been put to sleep by whoever owns it.
   *
   * The case it exists for: the wall and ceiling detail editors are overlays,
   * and the main workspace — its plan canvas and, if the user had it open, its
   * own 3D preview — stays mounted underneath. An invisible preview that keeps
   * refining is spending the frame budget of the pane the pointer is actually
   * in, on a picture nobody can see. Suspending stops the loop without
   * unmounting, so the camera, the walk pose and the built world all survive
   * the overlay and are still there when it closes.
   */
  let suspended = false;
  let worldRoot = null;
  // The instanced draw calls the world root's meshes were folded into. A
  // sibling of the world root, never a child of it: the walk's collision index
  // and the click picker both read the world root, and a batch answers a ray
  // with a face normal that has the instance's own rotation left out of it.
  let batchRoot = null;
  let selectionOverlay = null;
  let gridHelper = null;
  let ground = null;
  // The ground's and the grid's materials outlive the ground and grid, which
  // are rebuilt with the world: see `createGroundMaterial` for why.
  let groundMaterial = null;
  let gridMaterials = null;

  function disposeGridHelperGeometry(helper) {
    helper.geometry?.dispose?.();
    for (const child of helper.children) child.geometry?.dispose?.();
  }
  let currentBounds = null;
  let pickHandler = null;
  let pickContext = { activeFloorId: null };
  let pointerDown = null;
  let navigationModifierActive = false;
  let navigationMode = 'inspect';
  // What the settled image costs, and whether the sun's disc is sampled for it.
  // Follows the navigation mode; see `REFINE_PROFILES`.
  let refineProfile = REFINE_PROFILES.inspect;
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
  // away from walking through the building. Both of those do also call
  // `invalidateCollisions` — belt and braces, because the collision index they
  // feed would otherwise be one missed call away from the same bug.
  const walkPhysics = createWalkPhysics({
    camera,
    getCollisionSources: () => [worldRoot, ground?.object],
    getGroundLevel: () => groundLevelMm,
  });

  // Charged to the frame it happened on, so a stutter can be attributed rather
  // than guessed at. Wrapped rather than measured inside the physics because the
  // measurement should not exist at all when the gate is off.
  let perf = null;
  if (PREVIEW_PERF_ENABLED) {
    const innerStep = walkPhysics.step;
    walkPhysics.step = (input) => {
      const startedAt = performance.now();
      innerStep(input);
      perf?.setWalkStepMs(performance.now() - startedAt);
    };
  }
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

  /*
   * Whether the key light's shadow pass runs at all (see `applySun`). Coming
   * back on, the map is whatever the last daylight pass left — the model or the
   * sun may have moved since — so the light's own `needsUpdate` forces one
   * fresh pass at the next sample regardless of whether the re-aim moved it.
   */
  const setKeyLightShadowPass = (on) => {
    if (keyLight.shadow.autoUpdate === on) return;
    keyLight.shadow.autoUpdate = on;
    keyLight.shadow.needsUpdate = on;
    if (on) markShadowsDirty();
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

    // The walk profile holds the light at the disc centre for every sample, so
    // the shadow map is rendered once for a pose and then left alone — see
    // `REFINE_PROFILES`. A 4096² map re-rendered per sample is most of what a
    // walk-mode refine used to cost.
    if (sampleIndex >= 1 && sunAngularRadiusDeg > 0 && refineProfile.jitterSunDisc) {
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
    //
    // Nor while the light is dark: its own pass is skipped then (see
    // `setKeyLightShadowPass`), and the global flag would only re-render every
    // *other* shadow-casting light — the lamps, at night — once per sample for
    // a beam that is not there.
    if (keyLight.intensity > 0 && previousLightPosition.distanceToSquared(keyLight.position) > 1e-6) {
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

    activeCamera.getWorldDirection(forwardVector);
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

    if (resolvedMode === 'walk') leaveViewPreset({ restorePerspective: true });

    navigationMode = resolvedMode;
    inspectNavigation.setEnabled(navigationMode === 'inspect');
    walkNavigation.setEnabled(navigationMode === 'walk');
    // Before the pose is restored below, so the frame that lands after this call
    // is already being refined under the right profile.
    refineProfile = navigationMode === 'walk' ? REFINE_PROFILES.walk : REFINE_PROFILES.inspect;
    progressive.setRefineProfile(refineProfile);
    // A walk that is about to start is a walk against whatever the world is now,
    // and the index is the cheapest thing in the building to rebuild.
    if (navigationMode === 'walk') walkPhysics.invalidateCollisions();
    applyWindowGlow();

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
  let lastCameraZoom = 1;
  let poseInitialised = false;
  let sceneDirty = true;
  let lastMovementAt = 0;

  const cameraHasMoved = () => {
    const camera = activeCamera;
    if (!poseInitialised) {
      lastCameraPosition.copy(camera.position);
      lastCameraQuaternion.copy(camera.quaternion);
      lastCameraZoom = camera.zoom;
      poseInitialised = true;
      return true;
    }

    // Millimetre units: a tenth of a millimetre of drift is not a camera move,
    // and treating it as one would stop the refine from ever finishing. The
    // rotation epsilon is the one OrbitControls itself settles at — anything
    // tighter and the controls would call themselves finished while this still
    // reported motion, and the image would never stop restarting.
    // An orthographic camera zooms without moving, so its zoom is part of the
    // pose; for the perspective camera it never changes.
    const moved =
      camera.position.distanceToSquared(lastCameraPosition) > 0.01 ||
      1 - Math.abs(camera.quaternion.dot(lastCameraQuaternion)) > 1.25e-7 ||
      Math.abs(camera.zoom - lastCameraZoom) > 1e-6;

    if (moved) {
      lastCameraPosition.copy(camera.position);
      lastCameraQuaternion.copy(camera.quaternion);
      lastCameraZoom = camera.zoom;
    }
    return moved;
  };

  const renderFrame = (timestamp) => {
    const frameStartedAt = PREVIEW_PERF_ENABLED ? performance.now() : 0;
    if (PREVIEW_PERF_ENABLED) renderer.info.reset();
    timer.update(timestamp);
    const deltaSeconds = Math.min(timer.getDelta(), 0.1);

    if (navigationMode === 'inspect') {
      inspectNavigation.update(deltaSeconds);
    } else {
      walkNavigation.update(deltaSeconds);
    }

    // Programs for a new light count are compiling in the background (see
    // `startLightCompileGate`). Drawing now would make the driver finish them
    // on this thread, which is the freeze the gate exists to remove — so this
    // frame draws nothing at all, not even the axis gizmo: anything drawn into
    // the canvas would replace the picture it is holding. The camera keeps
    // moving underneath, and the first frame after the gate sees it as moved.
    if (lightCompileGate && navigationMode === 'inspect') {
      if (!suspended) animationFrame = window.requestAnimationFrame(renderFrame);
      else renderLoopRunning = false;
      return;
    }

    // Nothing to show before the first world, and drawing the empty stage
    // would link its ground and sky programs on this thread; the panel's
    // placeholder covers the canvas until then. `setWorld` restarts the loop.
    if (!worldRoot) {
      renderLoopRunning = false;
      return;
    }

    // A see-through crossfade is a scene change on every frame it runs — and
    // the only per-frame cost the modes have.
    if (viewModeFade) stepViewModeFade(timestamp);

    emitCompassHeading();
    // Held in front of the camera rather than fixed in the world, so it has to
    // be repositioned after the camera has settled for this frame.
    sunSky.followCamera(activeCamera);

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
      if (worldRoot) emitLoadPhase('ready');
    } else if (action === FRAME_ACTION.REFINE) {
      progressive.renderSample();
      if (worldRoot) emitLoadPhase('ready');
    } else if (shouldPresizeRefine({ action, nowMs: timestamp, lastMovementMs: lastMovementAt })) {
      // Still nothing on the canvas — this only resizes the offscreen chain for
      // the refine that is a frame or two away, so the first sample is a render
      // rather than a render plus three reallocations.
      progressive.presizeForRefine();
    }
    // SETTLE draws nothing at all: the frame already on screen is the right one,
    // and redrawing it is how the flicker got in.
    const keepGoing = wantsAnotherFrame(action);

    if (axisIndicatorInstance) {
      axisIndicatorInstance.render(renderer, activeCamera);
    }

    // Tell the panel when the picture finishes (or restarts) refining — only on
    // the change, so this costs nothing per frame. Save image waits on it.
    const converged = progressive.isConverged();
    if (renderStatusHandler && converged !== lastReportedConverged) {
      lastReportedConverged = converged;
      renderStatusHandler({ converged });
    }

    if (PREVIEW_PERF_ENABLED) {
      perf?.frame({ timestamp, action, durationMs: performance.now() - frameStartedAt });
    }

    // Walk mode holds the loop open regardless: the keyboard is polled here, so
    // letting it stop would freeze movement until the next mouse event. Being
    // suspended outranks even that — a viewport nobody can see has no keyboard.
    if (!suspended && (keepGoing || navigationMode === 'walk')) {
      animationFrame = window.requestAnimationFrame(renderFrame);
    } else {
      renderLoopRunning = false;
    }
  };

  const startRenderLoop = () => {
    if (suspended || renderLoopRunning) return;
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

  /**
   * Compile the programs a new world needs before a frame has to wait for them.
   *
   * Fire and forget, and deliberately not awaited anywhere: if it fails, or the
   * renderer is too old to have it, the only consequence is the hitch this was
   * meant to remove. The `invalidate` on the way out is what puts the warmed
   * materials on screen — by then the preview has usually gone idle, and an idle
   * loop does not restart itself.
   */
  /*
   * A world whose light counts moved needs a fresh program for every lit
   * material, and three compiles a missing program synchronously on the frame
   * that first draws with it — 17 programs, a second or more on a ceiling
   * assembly. `compileScenePrograms` issues them up front — for the offscreen
   * target the scene is really drawn into — and, where the driver has
   * KHR_parallel_shader_compile (ANGLE on D3D11 does), lets them compile off
   * the main thread; while it is pending `renderFrame` holds the last presented
   * picture instead of drawing.
   *
   * Only in inspect mode: in walk mode the view is the user's eyes, and a frozen
   * one is worse than a hitch. A later gate supersedes an earlier one, so a
   * resolve for a world that has since been replaced is ignored; a rejection
   * releases the gate like a resolve does, and so does LIGHT_COMPILE_GATE_MAX_MS
   * — a compile that never reports back must not hold the picture forever.
   *
   * The same holds for a world that brings a material no frame has drawn with
   * yet: the first light on a ceiling brings a double-sided lens, a program the
   * scene did not have, and its synchronous link was a quarter-second task of
   * its own. A material that merely is new — a second lens of a kind already
   * compiled — finds its program in the cache, so that gate opens on the first
   * poll and costs one compile traversal.
   */
  let lightCompileGate = null;
  const LIGHT_COMPILE_GATE_MAX_MS = 4000;
  // The background box's stand-in for the compile (see createBackgroundWarmup),
  // one per background texture, alive as long as that background is.
  let backgroundWarmup = null;
  const compileExtras = () => {
    const background = scene.background?.isCubeTexture ? scene.background : null;
    if (backgroundWarmup?.material.uniforms.envMap.value !== background) {
      backgroundWarmup?.geometry.dispose();
      backgroundWarmup?.material.dispose();
      backgroundWarmup = createBackgroundWarmup(background);
    }
    return { extras: backgroundWarmup ? [backgroundWarmup] : [], standalone: progressive.getCompileWarmups() };
  };
  const hasUnpreparedMaterial = (root) => {
    let found = false;
    root?.traverse((node) => {
      if (found || !(node.isMesh || node.isLine || node.isPoints || node.isSprite)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      found = materials.some((material) => material && !renderer.properties.get(material).currentProgram);
    });
    return found;
  };
  const startLightCompileGate = () => {
    if (navigationMode !== 'inspect' || typeof renderer.compile !== 'function') return;
    let compiling = null;
    try {
      // After the studio environment, whose arrival changes every lit program.
      compiling = studioEnvironmentPrepared.then(() =>
        compileScenePrograms(renderer, scene, activeCamera, progressive.getSceneRenderTarget(), compileExtras()),
      );
    } catch {
      return;
    }
    holdFramesUntil(compiling);
  };
  /*
   * The hold itself, shared by the world gate above and a see-through mode's
   * first toggle (`requestViewMode`): the same inspect-only rule (the render
   * loop only honours the gate in inspect mode), the same limit, and a later
   * gate superseding an earlier one.
   */
  const holdFramesUntil = (compiling) => {
    if (typeof compiling?.then !== 'function') return;
    const gate = {};
    lightCompileGate = gate;
    // Only on the way to a picture: a gate over a picture already on screen
    // holds that picture, which is not a loading state.
    if (loadPhase === 'building' || loadPhase === 'waking') emitLoadPhase('compiling');
    const release = () => {
      if (lightCompileGate !== gate) return;
      lightCompileGate = null;
      window.clearTimeout(gate.timeout);
      markShadowsDirty();
      invalidate();
    };
    gate.timeout = window.setTimeout(release, LIGHT_COMPILE_GATE_MAX_MS);
    compiling.then(release, release);
  };

  let shaderWarmupTimer = 0;
  const scheduleShaderWarmup = () => {
    if (typeof renderer.compile !== 'function') return;
    if (shaderWarmupTimer) window.clearTimeout(shaderWarmupTimer);
    shaderWarmupTimer = window.setTimeout(() => {
      shaderWarmupTimer = 0;
      let compiling = null;
      try {
        // Against the target the scene is drawn into; see `compileScenePrograms`.
        compiling = compileScenePrograms(
          renderer,
          scene,
          activeCamera,
          progressive.getSceneRenderTarget(),
          compileExtras(),
        );
      } catch {
        return;
      }
      compiling?.then?.(() => invalidate())?.catch?.(() => {});
    }, SHADER_WARMUP_DEBOUNCE_MS);
  };

  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // The elevation keeps its scale and its framing: only the width of the
    // frustum follows the new shape of the pane.
    const halfHeight = (orthoCamera.top - orthoCamera.bottom) / 2;
    orthoCamera.left = -halfHeight * (width / height);
    orthoCamera.right = halfHeight * (width / height);
    orthoCamera.updateProjectionMatrix();
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

    raycaster.setFromCamera(pointer, activeCamera);
    const hits = raycaster.intersectObject(worldRoot, true);
    const seenTargets = new Set();
    const targets = [];
    // The first (nearest) hit on each target, so a click can say where it landed.
    const targetHits = new Map();

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
      if (!targetHits.has(target)) targetHits.set(target, hit);
    }

    if (!targets.length) {
      pickHandler(null);
      return;
    }

    // What you can see before what you can see through (§3.6): in X-ray a
    // click on a ghosted wall with a column behind it is a click on the column.
    // Glass and the hidden window glow count as see-through there too — they
    // are no more what the eye lands on than the ghost wall around them.
    const seeThrough = isSeeThrough(viewMode);
    const isGhostHit = ({ hit }) => {
      const material = hit?.object?.material;
      if (!material || Array.isArray(material)) return false;
      if (material.userData?.ghostTwin === true) return true;
      return seeThrough && (material.visible === false || tierOf(material) === TIERS.GLAZING);
    };
    const chosenEntry = choosePickTarget(
      targets.map((target) => ({ target, hit: targetHits.get(target) })),
      { activeFloorId: pickContext.activeFloorId, isGhostHit },
    );

    // The hit point in the world root's frame — the frame the descriptors were
    // built in, which is plan millimetres (x, elevation, y). The root sits at the
    // origin, so this is the identity today, but it is the frame that matters.
    const chosen = chosenEntry?.target || targets[0];
    const hit = targetHits.get(chosen);
    pickHandler(chosen, hit?.point ? { point: worldRoot.worldToLocal(hit.point.clone()) } : null);
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

  /**
   * Look through `nextCamera` from now on: the render passes, the controls, the
   * picker and the frame loop all follow. A deliberate view change, so it starts
   * the refine over and pays GTAO's one recompile when the projection kind flips.
   */
  function setActiveCamera(nextCamera) {
    if (nextCamera === activeCamera) return;
    activeCamera = nextCamera;
    inspectNavigation.setCamera(nextCamera);
    progressive.setCamera(nextCamera);
    poseInitialised = false;
    invalidate();
  }

  /**
   * Spend whatever orbit the damping still has in hand, now. A preset chosen a
   * moment after a drag would otherwise be turned off its axis by the tail of
   * that drag on the next update — and read as the user orbiting away from it.
   */
  function settleControls() {
    const controls = inspectNavigation.controls;
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
  }

  function emitViewPreset() {
    viewPresetHandler?.(viewPresetName);
  }

  /**
   * Back to the perspective camera, looking from where the elevation looked —
   * stood back far enough to see what the elevation showed.
   */
  function restorePerspectiveFromOrtho() {
    if (activeCamera !== orthoCamera) return;
    const controls = inspectNavigation.controls;
    const target = controls.target.clone();
    const direction = orthoCamera.position.clone().sub(target);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
    direction.normalize();
    const fitDistance =
      currentBounds && !currentBounds.isEmpty()
        ? perspectiveFitDistance(camera, currentBounds)
        : orthoCamera.position.distanceTo(target);
    const distance = fitDistance / Math.max(orthoCamera.zoom, 0.05);
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.up.set(0, 1, 0);
    camera.near = Math.max(10, distance / 200);
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
    setActiveCamera(camera);
  }

  /**
   * The studio key light for an elevation: from in front of the face being
   * drawn, high and from the viewer's left, the way an elevation is rendered —
   * so the rear and the sides are not drawn in their own shade, and the soft
   * shadows fall down and to the right like the 2D elevation's shadow band.
   * Only the direction changes; the rig's intensities and calibration do not,
   * and a running sun study always wins.
   */
  function elevationKeyLight(viewName) {
    const frame = elevationCameraFrame(viewName);
    if (!frame) return null;
    return new THREE.Vector3()
      .addScaledVector(frame.toCamera, 0.62)
      .addScaledVector(frame.right, -0.42)
      .add(new THREE.Vector3(0, 0.66, 0))
      .normalize();
  }

  function setElevationLight(direction) {
    const changed =
      Boolean(direction) !== Boolean(elevationLightDirection) ||
      (direction && elevationLightDirection && !direction.equals(elevationLightDirection));
    elevationLightDirection = direction;
    if (changed) applySun();
  }

  /** Forget the preset (the user has moved away from it, or asked for Free). */
  function leaveViewPreset({ restorePerspective = false } = {}) {
    presetDirection = null;
    setElevationLight(null);
    if (restorePerspective) restorePerspectiveFromOrtho();
    if (viewPresetName !== 'free') {
      viewPresetName = 'free';
      emitViewPreset();
    }
  }

  /*
   * An orbit away from a preset is the user taking the camera back. Pan and
   * zoom keep the direction and so keep the preset; a rotation does not, and
   * out of an elevation it means "let me look round", which is a perspective
   * camera's job — so the drag carries on through the perspective camera from
   * the same direction. The controls re-read the camera's position every
   * update, so swapping it mid-drag continues the orbit rather than jumping.
   */
  const presetOffset = new THREE.Vector3();
  inspectNavigation.controls.addEventListener('change', () => {
    if (!presetDirection) return;
    presetOffset.copy(activeCamera.position).sub(inspectNavigation.controls.target);
    if (presetOffset.lengthSq() < 1e-6) return;
    presetOffset.normalize();
    if (presetOffset.dot(presetDirection) > Math.cos(THREE.MathUtils.degToRad(0.5))) return;
    leaveViewPreset({ restorePerspective: true });
  });

  /** Scene bounding sphere, falling back to a sane box before a world exists. */
  function sceneSphere() {
    if (currentBounds && !currentBounds.isEmpty()) {
      return currentBounds.getBoundingSphere(new THREE.Sphere());
    }
    return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
  }

  /**
   * The edge overlay is a drawing convention, so it goes away in the render.
   *
   * A world built under a style that draws no outlines has none to hide, so a
   * switch *to* one that does has to cut them first — `ensureOutlines` finds the
   * meshes that were marked as wanting one and builds it from the geometry they
   * still hold. Only ever additive: switching back hides the lines rather than
   * destroying them, since rebuilding is exactly what the next switch would cost.
   */
  function applyOutlineVisibility(root, outlines = effectiveStyle().outlines) {
    if (!root) return false;
    let cut = false;
    if (outlines && ensureOutlines(root, materialPalette)) {
      // New nodes arrive on auto-update; the world they joined is frozen.
      freezeStaticMatrices(root);
      cut = true;
    }
    root.traverse((object) => {
      if (object.isLineSegments) object.visible = outlines;
    });
    return cut;
  }

  /**
   * Both roots' outlines, as the style on screen wants them.
   *
   * Lines cut lazily for the world root — a Realistic world switched to Shaded
   * or to a see-through mode — would each be a draw call of their own, so they
   * are folded into each floor's merged outline in the batch root straight away
   * (`remergeFloorOutlines`). Turning X-ray on in Realistic then costs the same
   * one outline call per floor that Shaded does.
   */
  function applyOutlines() {
    const outlines = effectiveStyle().outlines;
    const cut = applyOutlineVisibility(worldRoot, outlines);
    if (cut && remergeFloorOutlines(worldRoot, batchRoot, materialPalette)) freezeStaticMatrices(batchRoot);
    applyOutlineVisibility(batchRoot, outlines);
  }

  function rebuildGround() {
    if (ground) {
      scene.remove(ground.object);
      ground.dispose();
      ground = null;
    }
    // The disc is one of the two things the walk is cast against, and this
    // function is where it stops existing and starts again.
    walkPhysics.invalidateCollisions();
    if (!style.ground) return;

    if (!groundMaterial) groundMaterial = createGroundMaterial();
    ground = createGroundPlane(currentBounds, groundLevelMm, { material: groundMaterial });
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
        // Visibility is the budget's alone: a lamp the scene could not afford to
        // run has had its flux folded into the room's bounce fill, and showing it
        // would count it twice. The switch goes through the intensity instead,
        // because a light's visibility is part of every lit material's program
        // identity and its intensity is not — switching the lamps by hiding them
        // recompiled the whole material set on every press, there and back.
        node.visible = !node.userData.budgetSuppressed;
        // Photometry × adaptation. Always from `baseIntensity` rather than from
        // whatever the light is carrying, so repeated passes over a reused scene
        // graph cannot compound the factor.
        const baseIntensity = node.userData.baseIntensity;
        if (Number.isFinite(baseIntensity)) {
          node.intensity = interiorLighting.lightsOn ? baseIntensity * fixtureIntensityScale : 0;
        }
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

  /**
   * How brightly the room behind every window glows, and whether it shows.
   *
   * One uniform on one shared material, so this is free to call on every pass:
   * nothing is rebuilt and nothing recompiles. The glow follows the lights — a
   * faint warmth with them off, a lived-in amber by day with them on, and
   * properly lit windows after dark — and a study running into the evening
   * crosses from the day figure to the night one with the rest of the rig.
   *
   * In walk mode the pane would sit between the eye and the view out, so it
   * goes away entirely there.
   */
  function applyWindowGlow() {
    const glow = materialPalette.windowGlow;
    if (!glow) return;
    let intensity = WINDOW_GLOW_UNLIT;
    if (interiorLighting.lightsOn) {
      intensity = interiorLighting.night
        ? WINDOW_GLOW_NIGHT
        : mixNumber(WINDOW_GLOW_DAY, WINDOW_GLOW_NIGHT, nightfallAmount);
    }
    glow.emissiveIntensity = intensity;
    // Seen through a ghosted wall the pane is a tan board floating in the
    // room, so a see-through mode hides it too — for the whole of its fades.
    const hidden = navigationMode === 'walk' || viewModePolicy(styleViewMode(), TIERS.GLOW).hidden;
    glow.opacity = hidden ? 0 : WINDOW_GLOW_OPACITY;
    glow.visible = !hidden;
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
      if (nightfallAmount > 0) color.lerp(new THREE.Color(defaultGroundColor), nightfallAmount);
      ground.setColor(color);
      return;
    }
    ground.setColor(defaultGroundColor);
  }

  function applyStyleToRenderer() {
    renderer.toneMapping = toneMappingConstant(style.toneMapping);
    renderer.toneMappingExposure = style.exposure;
    // The palette, the passes and the outlines follow the see-through mode as
    // well as the style; tone mapping, grid and ground are the style's alone.
    const drawn = effectiveStyle();
    applyRenderStyleToPalette(materialPalette, drawn);
    progressive.setStyle(drawn);
    applyOutlines();
    if (gridHelper) gridHelper.visible = style.grid;
    rebuildGround();
  }

  /**
   * The parts of the style a see-through mode changes — ambient occlusion off,
   * outlines on — and the window glow it hides. No ground rebuild and no tone
   * mapping: those belong to the style, and a mode toggle must not pay for them.
   */
  function applyViewModeStyle() {
    const drawn = effectiveStyle();
    applyRenderStyleToPalette(materialPalette, drawn);
    progressive.setStyle(drawn);
    applyOutlines();
    applyWindowGlow();
  }

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    } catch {
      return false;
    }
  }

  const outlinesShownIn = (mode) => Boolean(effectiveRenderStyle(style, mode).outlines);

  /** A twin made since the opacities were last written gets the mode's. */
  function syncNewGhostOpacities() {
    const count = ghostMaterialsOf(materialPalette).length;
    if (count === knownGhostCount) return;
    knownGhostCount = count;
    if (viewModeFade) {
      viewModeFade.to = paletteOpacities(materialPalette, viewMode, { outlinesShown: outlinesShownIn(viewMode) });
      setGhostDepthWrite(materialPalette, true);
      return;
    }
    writeOpacities(paletteOpacities(materialPalette, viewMode));
  }

  /**
   * Land the mode for good: final materials and shadow casters, final
   * opacities, ghosts no longer writing depth, this mode's AO and outlines, and
   * a fresh shadow map.
   */
  function settleViewMode() {
    viewModeFade = null;
    applyViewModeToWorld(worldRoot, batchRoot, materialPalette, viewMode);
    writeOpacities(paletteOpacities(materialPalette, viewMode));
    knownGhostCount = ghostMaterialsOf(materialPalette).length;
    setGhostDepthWrite(materialPalette, false);
    applyViewModeStyle();
    markShadowsDirty();
    invalidate();
  }

  /**
   * Put `next` on screen, with the crossfade unless the user has asked for less
   * motion (docs/preview-xray-mode.md §3.8).
   *
   * Entering a see-through mode the twins arrive at their source's opacity,
   * writing depth like the solid surfaces they stand in for, and fade to their
   * ghost opacity; leaving, they fade back up and only then hand the mesh its
   * base material back. Shadows change once, when the fade lands: a ghost that
   * is still nearly opaque keeps its shadow, and a wall that is solid again
   * gets its own back the moment it is. A toggle mid-fade lands the running
   * fade at once and starts from there.
   */
  function beginViewModeTransition(next) {
    if (viewModeFade) settleViewMode();
    const previous = viewMode;
    if (next === previous) return;
    viewMode = next;

    if (!worldRoot || CROSSFADE_MS <= 0 || prefersReducedMotion()) {
      settleViewMode();
      return;
    }

    const from = paletteOpacities(materialPalette, previous, { outlinesShown: outlinesShownIn(previous) });
    viewModeFade = { previous, from, to: new Map(), startedAt: null };
    applyViewModeToWorld(worldRoot, batchRoot, materialPalette, viewMode, { during: previous });
    viewModeFade.to = paletteOpacities(materialPalette, viewMode, { outlinesShown: outlinesShownIn(viewMode) });
    knownGhostCount = ghostMaterialsOf(materialPalette).length;
    writeOpacities(from);
    setGhostDepthWrite(materialPalette, true);
    applyViewModeStyle();
    invalidate();
  }

  /** One frame of the crossfade, ease-out cubic; lands it on the last. */
  function stepViewModeFade(timestamp) {
    const fade = viewModeFade;
    if (fade.startedAt === null) fade.startedAt = timestamp;
    const t = Math.min(1, Math.max(0, (timestamp - fade.startedAt) / CROSSFADE_MS));
    if (t >= 1) {
      settleViewMode();
      return;
    }
    const eased = 1 - (1 - t) ** 3;
    for (const [material, to] of fade.to) {
      const from = fade.from.get(material) ?? (material.userData?.ghostTwin ? 1 : to);
      material.opacity = from + (to - from) * eased;
    }
    sceneDirty = true;
  }

  /**
   * Make the twins `mode` ghosts with, and a warm-up object for every
   * (twin, plain-or-instanced) pair no compile has been issued for yet — plus
   * the outline, which a Realistic pane has never drawn. Each warm-up borrows
   * the real mesh's geometry, so the program it compiles is the one the real
   * draw will look up. Empty on every toggle after a pane's first.
   */
  function prepareGhostTwins(mode) {
    const warmups = [];
    const visit = (node) => {
      if (!node.isMesh) return;
      const base = node.userData.baseMaterial || node.material;
      if (!base || Array.isArray(base) || base.userData?.ghostTwin) return;
      const tier = tierOf(base);
      if (!viewModePolicy(mode, tier).ghost) return;
      const twin = ghostMaterialFor(materialPalette, base, { tier });
      const variant = node.isInstancedMesh ? 'instanced' : 'mesh';
      let variants = ghostWarmupVariants.get(twin);
      if (!variants) {
        variants = new Set();
        ghostWarmupVariants.set(twin, variants);
      }
      if (variants.has(variant)) return;
      variants.add(variant);
      warmups.push(
        node.isInstancedMesh ? new THREE.InstancedMesh(node.geometry, twin, 1) : new THREE.Mesh(node.geometry, twin),
      );
    };
    worldRoot?.traverse(visit);
    batchRoot?.traverse(visit);
    const outline = materialPalette.outline;
    if (
      outline &&
      outlinesShownIn(mode) &&
      !ghostWarmupVariants.has(outline) &&
      !renderer.properties.get(outline).currentProgram
    ) {
      ghostWarmupVariants.set(outline, new Set(['line']));
      warmups.push(new THREE.LineSegments(unitOutlineGeometry('box'), outline));
    }
    return warmups;
  }

  /**
   * Ask for a see-through mode (§3.7).
   *
   * Everything the mode needs is made first — the twins, and warm-ups for the
   * programs nobody has compiled yet. With nothing to compile (every toggle
   * after a pane's first) the mode lands at once: a traversal and some
   * uniforms. Otherwise the new programs are compiled off the main thread
   * against the scene's own lights and target, the swap waits for them, and in
   * inspect mode the gate holds the last picture meanwhile so the button and
   * the picture change together; in walk mode nothing is held and the swap
   * lands when the programs are ready. Never longer than the gate's limit.
   */
  function requestViewMode(nextMode) {
    const mode = resolveViewMode(nextMode);
    if (mode === requestedViewMode) return;
    requestedViewMode = mode;
    viewModeToken += 1;
    const token = viewModeToken;
    let timeout = 0;
    const commit = () => {
      if (disposed || token !== viewModeToken) return;
      window.clearTimeout(timeout);
      beginViewModeTransition(requestedViewMode);
    };

    const warmups = worldRoot && typeof renderer.compile === 'function' ? prepareGhostTwins(mode) : [];
    if (!warmups.length) {
      commit();
      return;
    }

    const stage = new THREE.Group();
    for (const warmup of warmups) stage.add(warmup);
    let compiling = null;
    try {
      compiling = studioEnvironmentPrepared.then(() =>
        compileScenePrograms(renderer, scene, activeCamera, progressive.getSceneRenderTarget(), {
          extras: [stage],
          includeScene: false,
        }),
      );
    } catch {
      commit();
      return;
    }
    // Registered before the gate's own release, so the frame the gate lets
    // through is already the new mode's.
    timeout = window.setTimeout(commit, LIGHT_COMPILE_GATE_MAX_MS);
    compiling.then(commit, commit);
    if (navigationMode === 'inspect') holdFramesUntil(compiling);
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
      scene.environment = studioEnvironmentReady ? environment.studioEnvironment() : null;
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
      if (elevationLightDirection) {
        baseLightDirection.copy(elevationLightDirection);
      } else {
        baseLightDirection.set(0.52, 0.74, 0.3).normalize();
      }
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
    //
    // The pass is dropped with the light's own shadow flags, never with
    // `castShadow`. The number of shadow-casting directional lights is part of
    // every program's identity in three — lit or not, the GTAO normal pass and
    // the background box included — so flipping `castShadow` at sunset (or on
    // the Night switch) re-keyed every program in the scene and the next frame
    // linked them all on the main thread: 0.7 s of frozen page at the exact
    // minute the slider crossed the horizon. `castShadow` stays as it was set
    // at creation; `WebGLShadowMap.render` skips a light whose shadow has
    // `autoUpdate` and `needsUpdate` both false, whatever the global flag the
    // per-sample `markShadowsDirty` raises. The map left bound holds the last
    // daylight pass, which a light of intensity zero multiplies by nothing.
    setKeyLightShadowPass(keyLight.intensity > 0);

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
    applyWindowGlow();

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

  let unpublishPerf = null;
  if (PREVIEW_PERF_ENABLED) {
    // `renderer.info` resets itself at the top of every `render` call, and a
    // frame here is a dozen of them — the composer's passes, the shadow map, the
    // present blit. Taking the counters by hand is the only way the snapshot
    // reads as "what this frame drew" rather than "what the last full-screen
    // quad drew".
    renderer.info.autoReset = false;
    perf = createPreviewPerfRecorder({
      renderer,
      progressive,
      getNavigationMode: () => navigationMode,
      getCamera: () => activeCamera,
      getViewPreset: () => viewPresetName,
      getScene: () => scene,
      debug: {
        viewMode: () => viewMode,
        // Identity of every instanced batch: the same ids after a rebuild mean
        // the cache refilled them rather than building fresh ones.
        batches: () =>
          (batchRoot?.children || []).flatMap((group) =>
            group.children.filter((child) => child.isInstancedMesh).map((child) => child.uuid),
          ),
        // What each instanced batch is drawing with right now: the probe below
        // raycasts the source meshes, never the batches, so this is how a
        // script proves the batch that actually draws a material holds its
        // ghost in a see-through mode (§12, the framed wall's core).
        batchMaterials: () =>
          (batchRoot?.children || []).flatMap((group) =>
            group.children
              .filter((child) => child.isInstancedMesh)
              .map((child) => {
                const material = child.material;
                const base = child.userData.baseMaterial || material;
                return {
                  batch: child.uuid,
                  group: group.name,
                  count: child.count,
                  baseKey: base?.userData?.paletteKey || null,
                  paletteKey: material?.userData?.paletteKey || null,
                  ghost: material?.userData?.ghostTwin === true,
                  opacity: material?.opacity ?? null,
                  transparent: Boolean(material?.transparent),
                  depthWrite: material?.depthWrite ?? null,
                  castShadow: child.castShadow,
                };
              }),
          ),
        // Draw calls the scene pass would make, frustum aside: what the colour
        // pass draws, counted structurally so post-processing passes (GTAO's
        // normal pass re-draws the scene) do not muddy a mode-to-mode compare.
        drawables: () => {
          let count = 0;
          scene.traverseVisible((node) => {
            if (!(node.isMesh || node.isLine || node.isPoints)) return;
            if (!node.layers.test(activeCamera.layers)) return;
            const material = node.material;
            if (!material || Array.isArray(material) || material.visible === false) return;
            count += material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1;
          });
          return count;
        },
        probe: (clientX, clientY) => {
          if (!worldRoot) return [];
          const rect = renderer.domElement.getBoundingClientRect();
          const pointer = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -(((clientY - rect.top) / rect.height) * 2 - 1),
          );
          raycaster.setFromCamera(pointer, activeCamera);
          return raycaster.intersectObject(worldRoot, true).map((hit) => {
            const target = resolvePickTarget(hit.object);
            const material = hit.object.material;
            return {
              kind: target?.kind || null,
              sourceId: target?.sourceId || null,
              floorId: target?.floorId || null,
              paletteKey: material?.userData?.paletteKey || null,
              mesh: hit.object.uuid,
              ghost: material?.userData?.ghostTwin === true,
              // What the hit mesh is drawn with now, for a script to check a
              // ghost's policy (opacity, depth writes, shadow) on the very mesh.
              baseKey: (hit.object.userData.baseMaterial || material)?.userData?.paletteKey || null,
              opacity: material?.opacity ?? null,
              depthWrite: material?.depthWrite ?? null,
              castShadow: hit.object.castShadow,
              distance: Math.round(hit.distance),
            };
          });
        },
        project: ([x, y, z]) => {
          const rect = renderer.domElement.getBoundingClientRect();
          const v = new THREE.Vector3(x, y, z).project(activeCamera);
          return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, z: v.z };
        },
        centers: (kind) => {
          const out = [];
          worldRoot?.traverse((node) => {
            if (!node.isMesh) return;
            // The target may sit on the object's group rather than on each mesh.
            const target = resolvePickTarget(node);
            if (target?.kind !== kind) return;
            const box = new THREE.Box3().setFromObject(node);
            if (box.isEmpty()) return;
            const c = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            out.push({
              mesh: node.uuid,
              paletteKey: (node.userData.baseMaterial || node.material)?.userData?.paletteKey || null,
              sourceId: target.sourceId,
              floorId: target.floorId || null,
              center: c.toArray(),
              size: size.toArray(),
            });
          });
          return out;
        },
      },
    });
    unpublishPerf = publishPreviewPerf(perf);
  }

  applyStyleToRenderer();
  applySun();
  startRenderLoop();

  return {
    /**
     * Put the viewport to sleep, or wake it up again.
     *
     * Asleep it draws nothing and asks for no frames — not even in walk mode,
     * and not when something calls `invalidate` behind its back. Everything
     * else is left exactly as it is: the camera has not moved, the world root
     * is still hung in the scene, the walk pose is still remembered. Waking it
     * always costs one full redraw, because whatever happened while it was out
     * of the picture (an edit committed, the pane resized, nothing at all) the
     * image on the canvas is the one from before, and proving it is still right
     * costs the same as redrawing it.
     */
    setSuspended(nextSuspended) {
      const next = Boolean(nextSuspended);
      if (suspended === next) return;
      suspended = next;

      if (suspended) {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        renderLoopRunning = false;
        return;
      }

      if (loadPhase === 'ready') emitLoadPhase('waking');
      invalidate();
    },
    setRenderStyle(styleName) {
      const nextStyle = renderStyleConfig(styleName);
      if (nextStyle === style) return;
      style = nextStyle;
      applyStyleToRenderer();
      // Sky and ground colour both depend on the style, and the sun is the only
      // thing that knows what they should be.
      applySun();
    },
    /**
     * Solid, X-ray or Wireframe (`viewMode.js`). Runtime only: no rebuild, no
     * sourceKey, nothing persisted. The first toggle in a pane's life may wait a
     * moment for its ghost programs to link off the main thread; every later
     * one is a traversal.
     */
    setViewMode(mode) {
      requestViewMode(mode);
    },
    /** The mode on screen (which lags the last request while it compiles). */
    getViewMode() {
      return viewMode;
    },
    setSun(nextSun) {
      sunState = nextSun || null;
      applySun();
    },
    setWorld(nextRoot, bounds, groundLevel = 0, { batchRoot: nextBatchRoot = null, lightsChanged = false } = {}) {
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

      // The batch root follows the same rule for the same reason: the scene
      // cache hands back the one it owns on every incremental build, and
      // disposing it would free the batches it had just decided to keep.
      if (batchRoot && batchRoot !== nextBatchRoot) {
        scene.remove(batchRoot);
        disposeScene(batchRoot, { disposeMaterials: false });
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
        disposeScene(selectionOverlay, { disposeMaterials: false });
        selectionOverlay = null;
      }

      if (gridHelper) {
        scene.remove(gridHelper);
        disposeGridHelperGeometry(gridHelper);
      }

      worldRoot = nextRoot;
      // Every call, not only the ones that swapped the root: the incremental
      // cache hands back the same root with rebuilt floor groups inside it, and
      // a wall that has just been drawn has to be solid on the very next step.
      walkPhysics.invalidateCollisions();
      groundLevelMm = groundLevel;
      currentBounds = descriptorBoundsToWorldBox(bounds);
      inspectNavigation.setBounds(currentBounds);
      gridHelper = createGrid(bounds, groundLevel, gridMaterials);
      gridMaterials = gridHelper.userData.materials;
      gridHelper.visible = style.grid;
      scene.add(gridHelper);
      if (!isSameRoot) scene.add(worldRoot);
      batchRoot = nextBatchRoot;
      if (batchRoot && batchRoot.parent !== scene) scene.add(batchRoot);
      applyOutlines();
      // Freshly built meshes arrive holding their base materials and casting
      // as built, so a see-through mode has to reach them before anything
      // draws them — and before the unprepared-material check below, which is
      // what catches a twin of a family the scene has never drawn (the first
      // roof put up in X-ray) and gates it. Untouched floors and refilled
      // batch groups come back stamped and are skipped.
      if (viewMode !== VIEW_MODES.SOLID || viewModeFade) {
        if (applyViewModeToWorld(worldRoot, batchRoot, materialPalette, viewMode, { during: viewModeFade?.previous })) {
          markShadowsDirty();
        }
        syncNewGhostOpacities();
      }
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
      // Debounced, so the same fifteen rebuilds a second queue one compile after
      // the drag ends rather than fifteen during it.
      scheduleShaderWarmup();
      // Not debounced: a moved light count, or a material nothing has drawn
      // with, means the very next frame would compile, so the background
      // compile has to be under way before it.
      //
      // The first world most of all. Every program in it is new, and the frame
      // that first draws with one asks three for its uniforms — `onFirstUse`,
      // whose getProgramInfoLog / getActiveUniform cannot answer until the link
      // is done, so drawing at once made the driver finish all of them on this
      // thread: 1.4–1.9 s of frozen page when an assembly editor opened. Held
      // behind the gate, the links run in parallel and are finished by the
      // time the first frame queries them. Nothing is on the canvas to hold
      // yet; the panel's placeholder covers the wait.
      if (!hadWorld || lightsChanged || hasUnpreparedMaterial(worldRoot) || hasUnpreparedMaterial(batchRoot)) {
        startLightCompileGate();
      }
    },
    /**
     * The room's own lights: `lightsOn` switches the ceiling luminaires, `night`
     * takes the sun and the sky away so they are the only thing left lighting
     * the model.
     */
    /**
     * The project's roof covering, trim, soffit and gable-infill colours (see
     * `applyRoofAppearanceToPalette`). Cheap enough to call on every project
     * change: it mutates the shared palette materials in place, so nothing is
     * rebuilt and batching keeps its instanced draws; only an 'unpainted'
     * finish flipping a material to bare metal asks for a program update.
     */
    applyRoofAppearance(appearance) {
      const { changed, recompile } = applyRoofAppearanceToPalette(materialPalette, appearance);
      if (!changed) return;
      // A metalness flip changes the program, so warm it before it is drawn.
      if (recompile) scheduleShaderWarmup();
      invalidate();
    },
    setInteriorLighting({ lightsOn = true, night = false } = {}) {
      interiorLighting = { lightsOn: Boolean(lightsOn), night: Boolean(night) };
      // `applySun` re-derives the whole rig from the stored state — night
      // included — then re-applies the lamps against it and ends in
      // markShadowsDirty + invalidate, which is the same path a style or sun
      // change takes to restart the progressive refine.
      applySun();
      // The lamps switch by intensity and the key light keeps `castShadow`
      // (its pass is dropped by its own shadow flags), so nothing the renderer
      // counts moves with the switch and no program changes. The warm-up is a
      // safety net for a future rig change that does move one; it runs after
      // the first frame, so it must never be what keeps that frame quick, and
      // it costs nothing when there is nothing to compile.
      scheduleShaderWarmup();
    },
    resetView() {
      if (navigationMode === 'walk') {
        if (activeFloorContext.floorId) {
          walkPoseByFloorId.delete(activeFloorContext.floorId);
        }
        restoreWalkPose({ forceSpawn: true });
        return;
      }
      presetDirection = null;
      setElevationLight(null);
      setActiveCamera(camera);
      inspectNavigation.resetView();
      leaveViewPreset();
      requestRender();
    },
    fit() {
      presetDirection = null;
      setActiveCamera(camera);
      inspectNavigation.resetView();
      leaveViewPreset();
      requestRender();
    },
    /** One of the perspective direction presets (`previewConfig.PRESETS`). */
    setProjectionPreset(presetName) {
      presetDirection = null;
      setElevationLight(null);
      settleControls();
      setActiveCamera(camera);
      inspectNavigation.setProjectionPreset(presetName);
      const direction = PRESETS[presetName];
      presetDirection = direction ? direction.clone().normalize() : null;
      viewPresetName = direction ? presetName : 'free';
      requestRender();
    },
    /**
     * A true orthographic elevation (`elevation_front | _rear | _left | _right`),
     * fitted to the model with a little air round it. The same axes the 2D
     * elevations use, so "front" is the same face in both.
     */
    setOrthographicView(viewName) {
      if (navigationMode !== 'inspect' || !isElevationPreset(viewName)) return false;
      if (!currentBounds || currentBounds.isEmpty()) return false;
      presetDirection = null;
      settleControls();
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      fitOrthographicCamera(orthoCamera, null, currentBounds, viewName, { aspect: width / height });
      setActiveCamera(orthoCamera);
      inspectNavigation.controls.target.copy(currentBounds.getCenter(new THREE.Vector3()));
      inspectNavigation.controls.update();
      presetDirection = elevationCameraFrame(viewName).toCamera.clone();
      viewPresetName = viewName;
      setElevationLight(elevationKeyLight(viewName));
      invalidate();
      return true;
    },
    /** The View menu: `free`, an iso preset, or an elevation. */
    setViewPreset(name) {
      if (isElevationPreset(name)) return this.setOrthographicView(name);
      if (name in PRESETS) {
        this.setProjectionPreset(name);
        return true;
      }
      leaveViewPreset({ restorePerspective: true });
      requestRender();
      return true;
    },
    getViewPreset() {
      return viewPresetName;
    },
    setViewPresetHandler(handler) {
      viewPresetHandler = typeof handler === 'function' ? handler : null;
    },
    /**
     * Told `{ phase, parallelShaderCompile }` whenever the pane moves between
     * 'building', 'compiling', 'waking' and 'ready'; called once at once with
     * where it is now.
     */
    setLoadStatusHandler(handler) {
      loadStatusHandler = typeof handler === 'function' ? handler : null;
      loadStatusHandler?.({ phase: loadPhase, parallelShaderCompile });
    },
    getLoadPhase: () => loadPhase,
    setRenderStatusHandler(handler) {
      renderStatusHandler = typeof handler === 'function' ? handler : null;
      lastReportedConverged = null;
      startRenderLoop();
    },
    /**
     * The finished picture as a PNG data URL.
     *
     * Re-presents the accumulated image and reads the canvas back in the same
     * task, before the compositor can clear it — which is what makes this work
     * without `preserveDrawingBuffer`, and so without its per-frame cost. If
     * nothing has been accumulated yet it draws one plain frame first.
     */
    captureImage() {
      if (!progressive.repaint()) {
        progressive.reset();
        progressive.renderInteractive();
      }
      return renderer.domElement.toDataURL('image/png');
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
        // The overlay's tints are the palette's (selectionMaterials.js) and
        // outlive it; only its geometry goes.
        disposeScene(selectionOverlay, { disposeMaterials: false });
      }
      selectionOverlay = nextOverlay;
      if (selectionOverlay) {
        scene.add(selectionOverlay);
        // Built fresh from descriptors and never moved afterwards — the same
        // deal the world root gets, and it has to be struck after the overlay is
        // parented because a frozen node's world matrix is only right for the
        // parent it was frozen under.
        freezeStaticMatrices(selectionOverlay);
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
      disposed = true;
      backgroundWarmup?.geometry.dispose();
      backgroundWarmup?.material.dispose();
      backgroundWarmup = null;
      window.cancelAnimationFrame(animationFrame);
      renderLoopRunning = false;
      if (shaderWarmupTimer) {
        window.clearTimeout(shaderWarmupTimer);
        shaderWarmupTimer = 0;
      }
      unpublishPerf?.();
      perf = null;
      walkPhysics.invalidateCollisions();
      inspectNavigation.dispose();
      walkNavigation.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
      renderer.domElement.removeEventListener('pointerleave', handlePointerCancel);

      if (selectionOverlay) {
        scene.remove(selectionOverlay);
        disposeScene(selectionOverlay, { disposeMaterials: false });
        selectionOverlay = null;
      }

      if (worldRoot) {
        scene.remove(worldRoot);
        disposeScene(worldRoot, { disposeMaterials: false });
      }

      if (batchRoot) {
        scene.remove(batchRoot);
        disposeScene(batchRoot, { disposeMaterials: false });
        batchRoot = null;
      }

      if (gridHelper) {
        scene.remove(gridHelper);
        disposeGridHelperGeometry(gridHelper);
      }

      if (ground) {
        scene.remove(ground.object);
        ground.dispose();
        ground = null;
      }
      disposeGroundMaterial(groundMaterial);
      groundMaterial = null;
      for (const material of Object.values(gridMaterials || {})) material?.dispose?.();
      gridMaterials = null;

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
      return activeCamera;
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
