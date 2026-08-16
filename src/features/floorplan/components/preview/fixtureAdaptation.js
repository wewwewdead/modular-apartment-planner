/**
 * How much of a luminaire's photometry survives the rig the frame is lit by.
 *
 * ## The problem this exists for
 *
 * `fixtureLightIntensity` turns a lamp's lumens into a renderer intensity
 * through one constant — `ARTIFICIAL_LIGHT_CALIBRATION` — and that constant was
 * measured against one lighting rig: night, where the sun is off, the
 * environment is down to two per cent and the exposure is opened 1.6×. It is
 * correct there and nowhere else.
 *
 * Switch a sun study on and the same lamp is competing with an unoccluded sky
 * map. Under a 75° sun a room the beam cannot reach still receives about 0.51 of
 * irradiance from the environment, while the default 650 lm can two and a half
 * metres up lays 0.21 on the floor beneath it — a fifth of the light already in
 * the room. That is the reported symptom exactly: a lens that glows over a floor
 * which does not change.
 *
 * ## Why the lamp is scaled rather than the room
 *
 * The lamp is not wrong; the room is too bright. three.js does not occlude
 * image-based light, so an interior floor is lit as though it were standing
 * outdoors in open shade — of the order of fifty times the illuminance a real
 * room a few metres from a window receives. Occluding the environment is a
 * global-illumination problem and is not affordable inside a progressive
 * preview. Restoring the *ratio* is: put the lamp back to the share of the
 * room's light it would have held if the room were as dark as it ought to be.
 *
 * So a fixture is scaled by how far the current rig's ambient sits above the
 * night rig's, and only partially — for the same reason `exposureScale` gives
 * back two of the seven stops between noon and dusk rather than all of them. A
 * photographer opening up does not pretend the light never left, and full
 * compensation would let a single downlight dominate a sunlit room, which no
 * downlight does.
 *
 * ## What is deliberately not in the law
 *
 * **The key light.** A room is shadowed from it, and what a lamp competes with
 * indoors is precisely the light that arrives without the sun.
 *
 * **Exposure.** The tone curve multiplies the lamp and the room it stands in by
 * the same number, so it cancels out of the ratio the eye reads. Folding it in
 * would *raise* the correction as the light fails, which is backwards: dusk is
 * the one daylight state where the lamps already win.
 *
 * Nothing here knows about three.js. The scale is applied at runtime, on the
 * light, by the viewport — never baked into a descriptor, because the
 * descriptor → Object3D pipeline is cached by source key and a descriptor that
 * changed with the time of day would simply never be rebuilt.
 */

const LUMINANCE = Object.freeze({ r: 0.2126, g: 0.7152, b: 0.0722 });

function srgbChannelToLinear(channel) {
  const value = Math.max(0, Math.min(255, channel)) / 255;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

/**
 * Relative luminance of an `0xRRGGBB` colour, in the linear space the renderer
 * works in. The rig states its light colours as sRGB hex, and irradiance is a
 * linear quantity, so the transfer curve has to be undone before the channels
 * are weighted.
 */
export function srgbHexLuminance(hex) {
  const value = Number(hex);
  if (!Number.isFinite(value)) return 1;
  const rgb = Math.max(0, Math.floor(value)) & 0xffffff;
  return (
    LUMINANCE.r * srgbChannelToLinear((rgb >> 16) & 0xff) +
    LUMINANCE.g * srgbChannelToLinear((rgb >> 8) & 0xff) +
    LUMINANCE.b * srgbChannelToLinear(rgb & 0xff)
  );
}

/**
 * Irradiance a horizontal surface receives per unit of
 * `scene.environmentIntensity`.
 *
 * Derived from the measurement `SKY_ENVIRONMENT_INTENSITY` was itself set by. At
 * a 75° sun the rig runs a key light of `SUN_PEAK_INTENSITY × directBeamFactor`
 * = 3.38 against an environment intensity of 0.2435, and the pair was calibrated
 * to a 7.4:1 sunlit-to-shaded ratio. A shaded surface sees only the environment,
 * so `(3.38·sin 75° + E) / E = 7.4` gives `E = 0.511`, and 0.511 / 0.2435 = 2.1.
 *
 * One figure for both environments on purpose: `STUDIO_ENVIRONMENT_INTENSITY`
 * and `SKY_ENVIRONMENT_INTENSITY` exist precisely so that `environmentIntensity`
 * means the same thing whichever map is loaded.
 */
export const ENVIRONMENT_IRRADIANCE_RESPONSE = 2.1;

/**
 * What lights a surface the sun cannot see.
 *
 * The key light is absent by construction — see the note above. The directional
 * fill *is* counted, because it casts no shadow and therefore does reach an
 * interior, and at its full intensity because that is what a surface turned
 * towards it receives, which is the brightest place a lamp has to hold its own.
 *
 * The rig's `AmbientLight` is white in every state it has, so it carries no
 * colour term; the hemisphere light's sky colour is not white at night and does.
 */
export function ambientIrradiance({
  ambientIntensity = 0,
  hemisphereIntensity = 0,
  hemisphereSkyHex = 0xffffff,
  fillIntensity = 0,
  environmentIntensity = 0,
} = {}) {
  return (
    Math.max(Number(ambientIntensity) || 0, 0) +
    Math.max(Number(hemisphereIntensity) || 0, 0) * srgbHexLuminance(hemisphereSkyHex) +
    Math.max(Number(fillIntensity) || 0, 0) +
    Math.max(Number(environmentIntensity) || 0, 0) * ENVIRONMENT_IRRADIANCE_RESPONSE
  );
}

/**
 * How much of the lost contrast a lamp gets back, as a power of how far the
 * ambient has risen above the level its calibration was measured at.
 *
 * 0.6 is the exponent `exposureScale` adapts by, and it is the same physical
 * argument in a different place: partial adaptation. It also lands where the eye
 * wants it — a 13-fold rise in ambient between night and noon becomes a 5.7×
 * lamp, which puts the default can's pool at roughly twice the room's own level
 * instead of two fifths of it.
 */
export const FIXTURE_ADAPTATION_EXPONENT = 0.6;

/**
 * Ceiling on the correction.
 *
 * Past eight times its rated output the preview has stopped showing the
 * specified luminaire and started showing a different one, and no reading taken
 * off it would mean anything. Only the two deliberately flooded rigs — the
 * drawing view, and the studio backdrop with no sun study running — get near it.
 */
export const MAX_FIXTURE_ADAPTATION = 8;

/**
 * The runtime multiplier for every fixture light in the scene.
 *
 * Never below one: a lamp is calibrated for the darkest rig there is, and making
 * it dimmer than that would be correcting in the wrong direction. Exactly one
 * when the rig *is* that rig, which is what keeps the shipped night look
 * untouched.
 */
export function fixtureAdaptationScale(ambient, nightAmbient) {
  if (!(nightAmbient > 0) || !(ambient > nightAmbient)) return 1;
  return Math.min(Math.pow(ambient / nightAmbient, FIXTURE_ADAPTATION_EXPONENT), MAX_FIXTURE_ADAPTATION);
}
