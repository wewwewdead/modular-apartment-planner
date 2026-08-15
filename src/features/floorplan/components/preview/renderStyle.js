import * as THREE from 'three';
import { IS_DESKTOP_APP } from '@/platform/desktopApp';

/**
 * The two things the preview can be asked to be.
 *
 * `shaded` is the drawing-office view: flat, evenly lit, every edge outlined,
 * grid visible. It is the right thing when you are reading geometry — you want
 * to see the *model*, not a photograph of it.
 *
 * `realistic` is the presentation view: image-based lighting, ambient
 * occlusion, sun-accurate soft shadows, surface micro-relief, no outlines, no
 * grid. It answers "what will this look like", which is a different question
 * from "where is this wall".
 *
 * Everything expensive is gated behind the *idle* path (see
 * `createProgressiveRenderer`), so choosing `realistic` costs nothing while you
 * are dragging the camera — the extra work happens in the half second after you
 * let go.
 */

export const RENDER_STYLES = {
  SHADED: 'shaded',
  REALISTIC: 'realistic',
};

export const DEFAULT_RENDER_STYLE = RENDER_STYLES.REALISTIC;

export const RENDER_STYLE_STORAGE_KEY = 'floorplan.preview3d.renderStyle';

const TONE_MAPPINGS = {
  none: THREE.NoToneMapping,
  neutral: THREE.NeutralToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
};

/**
 * @typedef {object} RenderStyleConfig
 * @property {string} label            Button text.
 * @property {boolean} outlines        Draw the per-object edge overlay.
 * @property {boolean} grid            Draw the ground grid + axis lines.
 * @property {boolean} ground          Draw the shadow-catching ground plane.
 * @property {boolean} sky             Paint a sky/studio backdrop behind the model.
 * @property {boolean} ambientOcclusion Run the GTAO pass.
 * @property {number} aoIntensity      How hard AO is blended in (0..1).
 * @property {number} aoRadiusMm       World-space AO gather radius, millimetres.
 * @property {number} environmentIntensity Multiplier on the *calibrated*
 *   image-based light — see the constants in `createEnvironment`. 1 is a
 *   correctly exposed scene; above that deliberately flattens it.
 * @property {string} toneMapping      Key into TONE_MAPPINGS.
 * @property {number} exposure         Renderer tone-mapping exposure.
 * @property {number} detailStrength   Procedural micro-relief amount (0 disables).
 * @property {number} maxSamples       Progressive samples accumulated when idle.
 * @property {number} sunAngularRadiusDeg Half-angle the sun is jittered over.
 */

/** @type {Record<string, RenderStyleConfig>} */
export const RENDER_STYLE_PRESETS = {
  [RENDER_STYLES.SHADED]: {
    label: 'Shaded',
    outlines: true,
    grid: true,
    ground: false,
    sky: false,
    ambientOcclusion: true,
    // Enough occlusion to seat objects on each other, not enough to dirty a
    // drawing that is being read for dimensions.
    aoIntensity: 0.55,
    aoRadiusMm: 260,
    // Over-lit on purpose. The drawing view wants every face legible at once,
    // and the price of that is exactly the flatness the realistic view avoids.
    environmentIntensity: 2,
    // Neutral (Khronos PBR Neutral) is the tone map that leaves an author's
    // chosen colour alone. In the drawing view the palette *is* the legend, so
    // a filmic curve that shifts hue would be actively wrong.
    toneMapping: 'neutral',
    exposure: 1.05,
    detailStrength: 0,
    // Still worth accumulating: this model is full of 45 mm studs and railing
    // balusters, and sub-pixel jitter is the only anti-aliasing that keeps them
    // from crawling.
    maxSamples: IS_DESKTOP_APP ? 16 : 10,
    sunAngularRadiusDeg: 0.35,
  },
  [RENDER_STYLES.REALISTIC]: {
    label: 'Realistic',
    outlines: false,
    grid: false,
    ground: true,
    sky: true,
    ambientOcclusion: true,
    aoIntensity: 1,
    aoRadiusMm: 700,
    environmentIntensity: 1,
    toneMapping: 'aces',
    // ACES already lifts the midtones; pushing exposure past 1 on top of a
    // near-white plaster palette crowds everything into the shoulder and the
    // model loses the tonal separation between its faces.
    exposure: 1,
    detailStrength: 1,
    // The desktop shell earns the longer run: with its bigger refine budget the
    // extra samples actually land (see REFINE_BUDGET_MS), buying smoother
    // penumbras and cleaner thin-member antialiasing after the camera settles.
    maxSamples: IS_DESKTOP_APP ? 128 : 48,
    // The sun's true half-angle is 0.27°, and shadow edges in a real street are
    // softer than that because the sky around the sun is lit too. 1.4° lands on
    // the penumbra a photograph actually shows at building scale.
    sunAngularRadiusDeg: 1.4,
  },
};

export function resolveRenderStyle(styleName) {
  return RENDER_STYLE_PRESETS[styleName] ? styleName : DEFAULT_RENDER_STYLE;
}

export function renderStyleConfig(styleName) {
  return RENDER_STYLE_PRESETS[resolveRenderStyle(styleName)];
}

export function toneMappingConstant(key) {
  return TONE_MAPPINGS[key] ?? THREE.NoToneMapping;
}

export function readRenderStylePreference() {
  if (typeof window === 'undefined') return DEFAULT_RENDER_STYLE;
  try {
    return resolveRenderStyle(window.localStorage.getItem(RENDER_STYLE_STORAGE_KEY));
  } catch {
    return DEFAULT_RENDER_STYLE;
  }
}

export function persistRenderStylePreference(styleName) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(RENDER_STYLE_STORAGE_KEY, resolveRenderStyle(styleName));
    return true;
  } catch {
    return false;
  }
}
