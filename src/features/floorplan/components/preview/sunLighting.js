import * as THREE from 'three';
import { skyPalette } from './createSunSky';

/**
 * What the sun and the sky are actually doing, as functions of solar altitude.
 *
 * The preview used to fake this with a single ramp that reached full strength
 * at 30° and stayed there. Three things were wrong with it, and all three show
 * up the moment a sun study is running:
 *
 * 1. **It saturated at 30°.** Above that, nothing changed — so in the tropics,
 *    where the sun spends the whole working day between 40° and 85°, the entire
 *    useful range of the study was a single flat lighting condition.
 * 2. **Its colour was a hand-drawn lerp**, not extinction. The sun does not
 *    redden linearly; it reddens because blue light is scattered out of the
 *    beam faster than red, and the beam's path through the atmosphere grows
 *    non-linearly as the sun drops — slowly from the zenith to 30°, then very
 *    fast.
 * 3. **The white fill lights stayed on.** Outdoors, a surface in shadow is lit
 *    by the sky and by bounce off the ground, and by nothing else. That is why
 *    real shadows are *blue*. Leaving a white ambient and a white hemisphere
 *    light burning under an accurate sky map washes exactly that colour out,
 *    which is the single most recognisable cue that lighting is real.
 *
 * Everything here is a pure function of altitude, so the model can be checked
 * against published figures without a GPU.
 */

/**
 * Relative optical depth per channel for a clear sea-level atmosphere,
 * sampled at roughly 600 / 550 / 450 nm.
 *
 * The ratios are what matter: blue is attenuated a bit over twice as fast as
 * red, which is the whole reason for both a blue sky and a red sunset.
 */
export const OPTICAL_DEPTH = Object.freeze({ r: 0.1, g: 0.14, b: 0.23 });

/** Altitude the sky's brightness is normalised against — a high, ordinary sun. */
export const REFERENCE_ALTITUDE_DEG = 60;

/**
 * The sky's share of the light at the reference altitude.
 *
 * Clear-sky diffuse is about 10-15% of global horizontal irradiance under a
 * high sun, and this sits inside that. It is not an independent knob: it has to
 * agree with `SKY_ENVIRONMENT_INTENSITY`, which was measured to give a 7.4:1
 * sunlit-to-shaded ratio, because this figure is what the exposure
 * compensation and the penumbra width are derived from. Change one without the
 * other and the preview starts compensating for light it is not receiving.
 */
export const SKY_ILLUMINANCE_WEIGHT = 0.13;

/** Peak directional-light intensity, at a zenith sun. */
export const SUN_PEAK_INTENSITY = 3.9;

/**
 * Relative air mass — how many atmospheres the beam crosses to reach the ground.
 *
 * Kasten & Young (1989). A plain `1/sin(altitude)` is fine down to about 20°
 * and then diverges badly: it says infinity at the horizon where the real
 * answer, with a curved atmosphere and refraction, is about 38.
 */
export function airMass(altitudeRad) {
  const altitudeDeg = THREE.MathUtils.radToDeg(altitudeRad);
  if (altitudeDeg <= -1) return Infinity;
  const denominator = Math.sin(altitudeRad) + 0.50572 * Math.pow(Math.max(altitudeDeg, 0) + 6.07995, -1.6364);
  if (!(denominator > 0)) return Infinity;
  return 1 / denominator;
}

/**
 * Fraction of each channel surviving the trip, as a **linear** colour.
 *
 * Beer-Lambert: transmittance is `exp(-depth * airMass)`, per channel.
 */
export function atmosphericTransmittance(altitudeRad, target = new THREE.Color()) {
  const mass = airMass(altitudeRad);
  if (!Number.isFinite(mass)) return target.setRGB(0, 0, 0);
  return target.setRGB(
    Math.exp(-OPTICAL_DEPTH.r * mass),
    Math.exp(-OPTICAL_DEPTH.g * mass),
    Math.exp(-OPTICAL_DEPTH.b * mass),
  );
}

const LUMINANCE = Object.freeze({ r: 0.2126, g: 0.7152, b: 0.0722 });

function luminance(color) {
  return LUMINANCE.r * color.r + LUMINANCE.g * color.g + LUMINANCE.b * color.b;
}

const transmittanceScratch = new THREE.Color();

/**
 * Strength of the direct beam relative to one at the top of the atmosphere.
 *
 * This is the *beam*, measured face-on. Multiply by sin(altitude) to get what
 * lands on the ground.
 */
export function directBeamFactor(altitudeRad) {
  if (!(altitudeRad > 0)) return 0;
  return luminance(atmosphericTransmittance(altitudeRad, transmittanceScratch));
}

/**
 * The sun's colour, normalised so its brightest channel is 1.
 *
 * Intensity is carried by the light's `intensity`, so the colour only has to
 * carry the *shift* — otherwise a low sun would be dimmed twice.
 */
export function sunColor(altitudeRad, target = new THREE.Color()) {
  atmosphericTransmittance(altitudeRad, target);
  const peak = Math.max(target.r, target.g, target.b);
  if (peak <= 0) return target.setRGB(1, 1, 1);
  return target.setRGB(target.r / peak, target.g / peak, target.b / peak);
}

const srgbChannelToLinear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
};

const paletteLuminance = ([red, green, blue]) =>
  LUMINANCE.r * srgbChannelToLinear(red) +
  LUMINANCE.g * srgbChannelToLinear(green) +
  LUMINANCE.b * srgbChannelToLinear(blue);

/**
 * How bright the sky itself is, from the very palette it is painted with.
 *
 * Deriving it from `skyPalette` rather than a second curve is the point: the
 * light arriving from the sky and the sky you can see behind the model are then
 * guaranteed to agree, at every step of the time dial, by construction.
 *
 * A horizontal surface sees more of the dome than of the horizon band, hence
 * the weighting.
 */
export function skyLuminanceFactor(altitudeDeg) {
  const { zenith, horizon } = skyPalette(altitudeDeg);
  return 0.6 * paletteLuminance(zenith) + 0.4 * paletteLuminance(horizon);
}

const REFERENCE_SKY_LUMINANCE = skyLuminanceFactor(REFERENCE_ALTITUDE_DEG);
const REFERENCE_DIRECT =
  directBeamFactor(THREE.MathUtils.degToRad(REFERENCE_ALTITUDE_DEG)) *
  Math.sin(THREE.MathUtils.degToRad(REFERENCE_ALTITUDE_DEG));

/** Sky brightness relative to the reference altitude, for `environmentIntensity`. */
export function skyIntensityScale(altitudeDeg) {
  if (!(REFERENCE_SKY_LUMINANCE > 0)) return 1;
  return skyLuminanceFactor(altitudeDeg) / REFERENCE_SKY_LUMINANCE;
}

/** Light on a horizontal surface from the beam, and from the sky, separately. */
export function illuminanceSplit(altitudeRad) {
  const altitudeDeg = THREE.MathUtils.radToDeg(altitudeRad);
  const direct = directBeamFactor(altitudeRad) * Math.max(0, Math.sin(altitudeRad));
  const diffuse = SKY_ILLUMINANCE_WEIGHT * skyIntensityScale(altitudeDeg);
  return { direct, diffuse, total: direct + diffuse };
}

/**
 * Share of the light that is *not* the direct beam.
 *
 * Near zero it is a hard, sculptural sun; near one every shadow has softened
 * into the general glow of an overcast dusk. Drives how far the sun is jittered
 * for penumbra.
 */
export function diffuseFraction(altitudeRad) {
  const { diffuse, total } = illuminanceSplit(altitudeRad);
  return total > 0 ? diffuse / total : 1;
}

/** Total light arriving, as a fraction of what arrives at the reference altitude. */
export function relativeIlluminance(altitudeRad) {
  const reference = REFERENCE_DIRECT + SKY_ILLUMINANCE_WEIGHT;
  return illuminanceSplit(altitudeRad).total / reference;
}

/** How far the eye is allowed to adapt, as a power of the light it lost. */
const ADAPTATION = 0.6;
const MAX_ADAPTATION = 4;

/**
 * Exposure multiplier, the way a photographer opens up as the light goes.
 *
 * Partial on purpose. Rendering dusk and noon at the same brightness would
 * throw away the one thing a sun study exists to show, so this recovers about
 * two stops of the roughly seven that are lost between a high sun and civil
 * twilight — enough to keep a dusk scene legible, not enough to make it look
 * like midday.
 */
export function exposureScale(altitudeRad) {
  const relative = relativeIlluminance(altitudeRad);
  if (!(relative > 0)) return MAX_ADAPTATION;
  return THREE.MathUtils.clamp(Math.pow(1 / relative, ADAPTATION), 1, MAX_ADAPTATION);
}
