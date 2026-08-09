import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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

function createStudioBackdropTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;

  // A seamless-paper sweep: pale at the top, settling to a slightly cooler,
  // darker floor. The model reads against it without competing with it.
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgb(232, 236, 241)');
  gradient.addColorStop(0.46, 'rgb(214, 220, 228)');
  gradient.addColorStop(0.52, 'rgb(196, 202, 210)');
  gradient.addColorStop(1, 'rgb(150, 156, 164)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createEnvironment(renderer) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  let studioTarget = null;
  let skyTarget = null;
  let skyTargetVersion = -1;
  let backdropTexture = null;

  return {
    /** Prefiltered studio room, built on first use and then reused. */
    studioEnvironment() {
      if (!studioTarget) {
        const room = new RoomEnvironment();
        studioTarget = pmremGenerator.fromScene(room, STUDIO_BLUR);
        room.traverse((object) => {
          object.geometry?.dispose?.();
          object.material?.dispose?.();
        });
      }
      return studioTarget.texture;
    },

    /** The flat backdrop that goes with the studio environment. */
    studioBackdrop() {
      if (!backdropTexture) backdropTexture = createStudioBackdropTexture();
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
      studioTarget = null;
      skyTarget = null;
      backdropTexture = null;
    },
  };
}
