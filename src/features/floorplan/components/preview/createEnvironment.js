import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { compileScenePrograms, createEquirectToCubeWarmup } from './compileScenePrograms';
import { ENVIRONMENT_PREFILTER_SIZE } from './environmentSize';

/**
 * Image-based lighting for the preview.
 *
 * ## Why this replaces the ambient light
 *
 * An `AmbientLight` adds the same amount of light to every surface from every
 * direction. Nothing in the world does that, and the giveaway is exactly what
 * the old preview looked like: an interior corner as bright as an outside
 * wall, and no reflection anywhere. A prefiltered environment map gives each
 * surface light that depends on which way it faces — a ceiling picks up the
 * ground, a wall picks up the sky, and a smooth surface gets a reflection with
 * something in it.
 *
 * Two environments are on offer:
 *
 * - **Studio** — `RoomEnvironment`, three's soft-box room. Used when no sun
 *   study is running, because with no site and no time of day there is no
 *   honest answer about where the light comes from, and a neutral studio is the
 *   conventional way to say so.
 * - **Sky** — generated from the very canvas the sky backdrop is painted on, so
 *   the light falling on the model is the light you can see behind it. Warm on
 *   the sun's side, cool opposite, dark below the horizon.
 *
 * Prefiltering costs a few milliseconds, which is nothing once and far too much
 * every frame while a time-of-day slider is being dragged. The sky version
 * counter is what keeps it to once per repaint.
 */

/** Blur applied to the studio room, in radians. Enough to kill its box edges. */
const STUDIO_BLUR = 0.035;
/**
 * fromScene's own default, named so the warm-up allocates the same targets —
 * and the size the sky is prefiltered at too (`environmentSize.js`), so the
 * study's sky and the studio share one set of programs.
 */
const STUDIO_SIZE = ENVIRONMENT_PREFILTER_SIZE;

/**
 * Per-source calibration, so `scene.environmentIntensity` means the same thing
 * whichever environment is loaded.
 *
 * These are not taste. `RoomEnvironment` is a product-photography light box
 * built from emissive planes far brighter than daylight, while the sky map is a
 * prefiltered sRGB canvas whose values cannot exceed one — measured against the
 * same two boxes, the room delivers about five times the irradiance. Left
 * uncorrected it lit every surface into the top of the tone curve, where ACES
 * compresses hard: a concrete slab and a fibre cement sheet came out fourteen
 * levels apart out of 255, which is to say identical. Normalising here is what
 * gives albedo somewhere to be visible.
 */
export const STUDIO_ENVIRONMENT_INTENSITY = 0.2;

/**
 * The sky's figure is set by a different measurement from the studio's.
 *
 * The studio number is chosen for overall exposure; this one is chosen for the
 * **ratio between sunlight and skylight**, because that ratio is what makes an
 * outdoor scene look outdoors. Measured as the linear luminance of a sunlit
 * surface against a shaded one under a 75° sun: 0.7 gives 2.1:1, which reads as
 * an overcast day with a bright lamp added; 0.16 gives 14:1, where shadows
 * become black holes on a small panel. 0.25 gives 7.4:1, inside the 6-8:1 a
 * clear sky actually produces.
 */
export const SKY_ENVIRONMENT_INTENSITY = 0.25;

// The studio sweep each look stands in front of: the light, nearly flat one
// for the white model, and the earlier, darker one the detail editors keep.
const BACKDROP_STOPS = {
  white_model: [
    [0, 'rgb(246, 247, 249)'],
    [0.5, 'rgb(232, 234, 237)'],
    [1, 'rgb(214, 217, 221)'],
  ],
  classic: [
    [0, 'rgb(232, 236, 241)'],
    [0.46, 'rgb(214, 220, 228)'],
    [0.52, 'rgb(196, 202, 210)'],
    [1, 'rgb(150, 156, 164)'],
  ],
};

/** Rows in the sweep: the height of the canvas the sweep used to be painted on. */
const SWEEP_ROWS = 256;
/** Cube face size. The sweep is a smooth gradient; 64 texels a face hold it. */
const BACKDROP_FACE_SIZE = 64;

/*
 * Each face's texel → view direction, in the WebGL cube map convention (face
 * order +X, −X, +Y, −Y, +Z, −Z; s right, t down, both −1…1).
 */
const CUBE_FACE_DIRECTIONS = [
  (s, t) => [1, -t, -s],
  (s, t) => [-1, -t, s],
  (s, t) => [s, 1, t],
  (s, t) => [s, -1, -t],
  (s, t) => [s, -t, 1],
  (s, t) => [-s, -t, -1],
];

const parseRgb = (color) =>
  color
    .match(/\d+(\.\d+)?/g)
    .slice(0, 3)
    .map(Number);

/**
 * The sweep, top row first, as a canvas linear gradient would paint it:
 * straight interpolation of the sRGB stops.
 */
function sweepRows(stops) {
  const parsed = stops.map(([offset, color]) => [offset, parseRgb(color)]);
  const rows = new Float32Array(SWEEP_ROWS * 3);
  for (let row = 0; row < SWEEP_ROWS; row++) {
    const offset = (row + 0.5) / SWEEP_ROWS;
    let upper = parsed.findIndex(([stop]) => stop >= offset);
    if (upper < 0) upper = parsed.length - 1;
    const lower = Math.max(0, upper - 1);
    const [from, fromColor] = parsed[lower];
    const [to, toColor] = parsed[upper];
    const mix = to > from ? Math.min(Math.max((offset - from) / (to - from), 0), 1) : 0;
    for (let channel = 0; channel < 3; channel++) {
      rows[row * 3 + channel] = fromColor[channel] + (toColor[channel] - fromColor[channel]) * mix;
    }
  }
  return rows;
}

/**
 * The studio sweep as a cube texture, computed here rather than handed to
 * three as an equirectangular map.
 *
 * An equirect background is converted to a cube by three on the first frame
 * that draws it, with a shader of its own compiled and linked right there on
 * the main thread: 150–370 ms of frozen page every time a preview opened. The
 * sweep varies only with height, so each texel is one lookup of one column —
 * the row the equirect lookup would sample, `0.5 − asin(y) / π` of the way
 * down, blended between rows as the GPU would. No canvas, so no read-back.
 */
function createStudioBackdropTexture(look = 'white_model') {
  // A seamless-paper sweep, light and nearly flat: near-white at the top,
  // settling to a soft grey floor with no horizon line to read as one. A white
  // model wants a light studio behind it; a dark sweep makes it a cut-out.
  const rows = sweepRows(BACKDROP_STOPS[look] || BACKDROP_STOPS.white_model);
  const size = BACKDROP_FACE_SIZE;
  const faces = CUBE_FACE_DIRECTIONS.map((directionAt) => {
    const data = new Uint8Array(size * size * 4);
    for (let texelRow = 0; texelRow < size; texelRow++) {
      const t = ((texelRow + 0.5) / size) * 2 - 1;
      for (let col = 0; col < size; col++) {
        const s = ((col + 0.5) / size) * 2 - 1;
        const [x, y, z] = directionAt(s, t);
        const height = y / Math.hypot(x, y, z);
        const position = Math.min(Math.max((0.5 - Math.asin(height) / Math.PI) * SWEEP_ROWS - 0.5, 0), SWEEP_ROWS - 1);
        const below = Math.floor(position);
        const above = Math.min(below + 1, SWEEP_ROWS - 1);
        const mix = position - below;
        const offset = (texelRow * size + col) * 4;
        for (let channel = 0; channel < 3; channel++) {
          data[offset + channel] = Math.round(rows[below * 3 + channel] * (1 - mix) + rows[above * 3 + channel] * mix);
        }
        data[offset + 3] = 255;
      }
    }
    const face = new THREE.DataTexture(data, size, size);
    face.colorSpace = THREE.SRGBColorSpace;
    return face;
  });
  const texture = new THREE.CubeTexture(faces);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createEnvironment(renderer, { look = 'white_model' } = {}) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  let studioTarget = null;
  let skyTarget = null;
  let skyTargetVersion = -1;
  let backdropTexture = null;
  let studioPrepared = null;
  // The room `studioEnvironment` will draw, built by the warm-up so that the
  // programs linked there are the ones `fromScene` draws with. Handed over to
  // `studioEnvironment` and disposed there, once it has been drawn.
  let studioRoom = null;
  // A stand-in for the box the generator clears each cube face with, holding
  // that program alive until the generator's own box has acquired it.
  let studioBackgroundWarmup = null;
  // A stand-in for the material three converts an equirectangular background
  // to a cube with. Three builds that material per conversion and disposes it
  // straight after, so without a second holder its program is destroyed and
  // the next conversion links it again; held for the environment's lifetime.
  let equirectToCubeWarmup = null;
  const disposeRoom = (room) => {
    room?.traverse((object) => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
  };

  return {
    /**
     * Links the studio room's programs in the background, so the PMREM render
     * that `studioEnvironment` does is not also the frame that compiles them.
     *
     * `fromScene` draws the room six times into a half-float cube target, and
     * the first draw with each of its materials asked the driver for a program
     * that was still linking — half a second of blocked main thread on a cold
     * shader cache, every time a preview pane opened. Compiled here against a
     * target of the same kind (which is what fixes tone mapping and colour
     * space in the program's identity), the room's programs are finished by
     * the time the room is drawn.
     *
     * It has to be the very room `studioEnvironment` will draw, kept alive
     * until then. A program is three's for as long as some material holds it:
     * a throwaway room disposed after the compile handed its programs back,
     * three destroyed them, and the real room linked every one again inside
     * `fromScene`, on the main thread — the warm-up was then only priming the
     * browser's shader cache, which not every browser has.
     *
     * The generator's own passes — the blur and GGX filters, the heaviest links
     * of the lot on a cold cache, and the box it clears each face with — are
     * compiled in a stage of their own, with no lights: a program's identity
     * carries the light count of the scene it was compiled for, and the
     * generator draws these as bare meshes, under none. Compiled beside the
     * room's point light they got the wrong identity and linked again at first
     * use. three builds the filters on its first target allocation; in 0.183
     * that is `_setSize` + `_allocateTargets`, private but stable, so
     * allocating here at the size `fromScene` will ask for makes it reuse them.
     * A three without those methods links its filters on first use, as before.
     */
    prepareStudioEnvironment() {
      if (studioTarget) return Promise.resolve();
      if (!studioPrepared) {
        studioRoom = new RoomEnvironment();
        const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
        const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
        const passes = new THREE.Group();
        const passGeometry = new THREE.BufferGeometry();
        if (typeof pmremGenerator._setSize === 'function' && typeof pmremGenerator._allocateTargets === 'function') {
          pmremGenerator._setSize(STUDIO_SIZE);
          pmremGenerator._allocateTargets().dispose();
          for (const material of [pmremGenerator._blurMaterial, pmremGenerator._ggxMaterial]) {
            if (material) passes.add(new THREE.Mesh(passGeometry, material));
          }
        }
        // The sun study's sky is prefiltered by the same generator from an
        // equirectangular canvas, through a conversion material the studio
        // never draws. Linked here, at the size the sky will use (the filters
        // above), it is ready before the first sky frame instead of being
        // linked inside it. The material is the generator's own and lives as
        // long as the generator, so the program it compiles here is the one
        // the sky is drawn with.
        if (typeof pmremGenerator.compileEquirectangularShader === 'function') {
          const previousTarget = renderer.getRenderTarget();
          try {
            renderer.setRenderTarget(target);
            pmremGenerator.compileEquirectangularShader();
          } finally {
            renderer.setRenderTarget(previousTarget);
          }
          if (pmremGenerator._equirectMaterial) {
            passes.add(new THREE.Mesh(passGeometry, pmremGenerator._equirectMaterial));
          }
        }
        // And the sky as a *backdrop*: three converts an equirectangular
        // background to a cube map on the first frame that draws it, with a
        // material of its own (see `createEquirectToCubeWarmup`).
        equirectToCubeWarmup = createEquirectToCubeWarmup(renderer);
        if (equirectToCubeWarmup) passes.add(new THREE.Mesh(passGeometry, equirectToCubeWarmup));
        // Built the way three 0.183's `_sceneToCubeUV` builds its own box.
        studioBackgroundWarmup = new THREE.MeshBasicMaterial({
          name: 'PMREM.Background',
          side: THREE.BackSide,
          depthWrite: false,
          depthTest: false,
        });
        passes.add(new THREE.Mesh(passGeometry, studioBackgroundWarmup));
        const release = () => {
          target.dispose();
          passGeometry.dispose();
        };
        try {
          studioPrepared = Promise.all([
            compileScenePrograms(renderer, studioRoom, camera, target),
            compileScenePrograms(renderer, passes, camera, target),
          ]).then(release, release);
        } catch {
          release();
          studioPrepared = Promise.resolve();
        }
      }
      return studioPrepared;
    },

    /** Prefiltered studio room, built on first use and then reused. */
    studioEnvironment() {
      if (!studioTarget) {
        const room = studioRoom || new RoomEnvironment();
        studioRoom = null;
        studioTarget = pmremGenerator.fromScene(room, STUDIO_BLUR, 0.1, 100, { size: STUDIO_SIZE });
        disposeRoom(room);
        studioBackgroundWarmup?.dispose();
        studioBackgroundWarmup = null;
      }
      return studioTarget.texture;
    },

    /** The flat backdrop that goes with the studio environment. */
    studioBackdrop() {
      if (!backdropTexture) backdropTexture = createStudioBackdropTexture(look);
      return backdropTexture;
    },

    /**
     * Prefiltered lighting from the painted sky.
     *
     * `version` is the sky's own repaint counter; handing back the same number
     * twice skips the work, so dragging the time dial across a degree that does
     * not change the painting costs nothing.
     */
    skyEnvironment(skyTexture, version) {
      if (!skyTexture) return null;
      if (skyTarget && skyTargetVersion === version) return skyTarget.texture;

      const next = pmremGenerator.fromEquirectangular(skyTexture);
      skyTarget?.dispose();
      skyTarget = next;
      skyTargetVersion = version;
      return skyTarget.texture;
    },

    dispose() {
      studioTarget?.dispose();
      skyTarget?.dispose();
      backdropTexture?.dispose();
      pmremGenerator.dispose();
      // A room warmed up for a studio environment that was never asked for.
      disposeRoom(studioRoom);
      studioRoom = null;
      studioBackgroundWarmup?.dispose();
      studioBackgroundWarmup = null;
      equirectToCubeWarmup?.dispose();
      equirectToCubeWarmup = null;
      studioTarget = null;
      skyTarget = null;
      backdropTexture = null;
    },
  };
}
