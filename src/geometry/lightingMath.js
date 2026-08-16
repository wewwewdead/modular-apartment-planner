/**
 * Photometry for ceiling luminaires: lamp ratings as they are printed on a box
 * (lumens, kelvin, beam angle) turned into the numbers a renderer takes
 * (candela, RGB). Pure functions — nothing here knows about three.js, the
 * ceiling, or the scene.
 */

// Blackbody colour is only meaningful over the range the fit was made for, and
// no lamp is sold outside it either.
const MIN_KELVIN = 1000;
const MAX_KELVIN = 12000;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * The sRGB transfer curve. Tanner Helland's fit lands 2700 K on a saturated
 * sodium orange (blue ≈ 0.34), which is the colour of the lamp seen against a
 * daylit sky — not the colour of a room standing under it, where the eye
 * adapts to the source it is lit by. Encoding pulls the tint back toward white
 * (blue ≈ 0.62) without moving the hue, and leaves the 6500 K white point where
 * it already was.
 */
function encode(channel) {
  const value = clamp01(channel);
  // A fully saturated channel has to come back exactly 1: the curve's own
  // constants do not quite land there in floating point, and a red that reads
  // 0.99999999 is a red that no longer compares equal to white.
  if (value >= 1) return 1;
  return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

/**
 * Correlated colour temperature to RGB, 0..1 per channel, by Tanner Helland's
 * piecewise fit to the blackbody locus. Red saturates below 6600 K and blue
 * above it, which is what makes a warm lamp warm.
 */
export function kelvinToRgb(kelvin) {
  const temperature = Math.max(MIN_KELVIN, Math.min(MAX_KELVIN, Number(kelvin) || MIN_KELVIN)) / 100;

  const red = temperature <= 66 ? 255 : 329.698727446 * Math.pow(temperature - 60, -0.1332047592);
  const green =
    temperature <= 66
      ? 99.4708025861 * Math.log(temperature) - 161.1195681661
      : 288.1221695283 * Math.pow(temperature - 60, -0.0755148492);
  const blue =
    temperature >= 66 ? 255 : temperature <= 19 ? 0 : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;

  return { r: encode(red / 255), g: encode(green / 255), b: encode(blue / 255) };
}

/**
 * Luminous flux to luminous intensity. An omnidirectional lamp spreads its
 * lumens over the whole sphere; a reflector lamp puts them through the solid
 * angle of its cone, which is why a 500 lm PAR20 reads twenty times brighter
 * than a 500 lm globe on the axis it points down.
 */
export function lumensToCandela(lumens, beamAngleDeg) {
  const flux = Number(lumens);
  if (!Number.isFinite(flux) || flux <= 0) return 0;

  const beam = Number(beamAngleDeg);
  // Anything that is not a real cone — no beam quoted, or one that has opened
  // out past a full sphere — is the whole sphere.
  if (!Number.isFinite(beam) || beam <= 0 || beam >= 360) return flux / (4 * Math.PI);

  const solidAngle = 2 * Math.PI * (1 - Math.cos((beam / 2) * (Math.PI / 180)));
  return solidAngle > 0 ? flux / solidAngle : flux / (4 * Math.PI);
}

/**
 * three.js physical lights fall off with the inverse square of world distance,
 * and this world is drawn in millimetres. A candela figure is per square metre
 * of the unit sphere, so it has to be multiplied by the millimetres in a square
 * metre (1e6) for a lamp to light a room the way its data sheet says it does —
 * unscaled, every fixture reads as a millionth of itself.
 */
export const MM_LIGHT_INTENSITY_SCALE = 1e6;

/**
 * The bridge from real photometry to the renderer's own exposure scale. With
 * the mm correction alone, a surface's irradiance from a fixture comes out
 * numerically in real lux — but the renderer's noon sun is a stylised 3.9, not
 * the hundred thousand lux it stands for, so honest lux blew every lamp out to
 * white. Strict consistency with the sun (÷100k, then ×3.9) fails the other
 * way: lamps vanish, because the night exposure only rises 1.6× where a real
 * camera at night opens up a thousandfold. 0.005 splits the difference the eye
 * actually wants — a 650 lm can lays a mid-bright pool on the floor at night,
 * and in daylight the same pool survives as an accent instead of overpowering
 * the sun. Verified against a rendered room, not derived; retune by eye if the
 * sun's own calibration moves.
 */
export const ARTIFICIAL_LIGHT_CALIBRATION = 0.005;

export function fixtureLightIntensity(lumens, beamAngleDeg) {
  return lumensToCandela(lumens, beamAngleDeg) * MM_LIGHT_INTENSITY_SCALE * ARTIFICIAL_LIGHT_CALIBRATION;
}

/**
 * Interior surface reflectances, as design values rather than measurements.
 *
 * The IES Lighting Handbook and the CIBSE Code for Lighting both recommend a
 * ceiling of 0.6–0.9, walls of 0.3–0.8 and a floor of 0.1–0.5, and the triple
 * every lumen-method worked example is set up with is 0.70 / 0.50 / 0.20. Area
 * weighted over a room whose walls are roughly two thirds of its enclosure, that
 * triple averages a little under 0.5.
 *
 * Two figures are wanted rather than one because a downlight does not scatter
 * its flux evenly around a room: essentially all of it lands on the floor, so
 * the *first* bounce is governed by the floor alone — the darkest surface in the
 * set, and the one a single average would quietly flatter.
 */
const FIRST_BOUNCE_REFLECTANCE = 0.2;
const ROOM_MEAN_REFLECTANCE = 0.5;

/**
 * The share of a lamp's flux that ends up in the room's indirect field.
 *
 * Flux balance in an enclosure: the floor returns `ρ_floor` of what it is given,
 * and every pass after that has been mixed around the room and returns `ρ̄` of
 * what is left. The series `ρ_floor·(1 + ρ̄ + ρ̄² + …)` sums to
 * `ρ_floor / (1 − ρ̄)` — 0.4 for the values above, so a 650 lm can puts 260 lm
 * of its output back into the room as light with no direction of its own.
 *
 * This is the term the renderer has none of. three.js computes exactly one
 * bounce — the direct one — so every surface a beam misses is lit by the night
 * ambient and nothing else, and a room with a lamp burning in it reads as a room
 * with a lamp burning in a black box. It is also not a small term: spread over
 * the ~61 m² of a 3.9 × 2.7 m room it is about 4 lux everywhere, against the
 * 27 lux the same can lays directly beneath itself three metres down.
 */
export const INTERIOR_BOUNCE_FLUX_FRACTION = FIRST_BOUNCE_REFLECTANCE / (1 - ROOM_MEAN_REFLECTANCE);

/**
 * The indirect field of one luminaire, as a lamp the renderer can actually run.
 *
 * The field itself is uniform — that is what makes a lit room read as *filled*
 * rather than spotted — and a point light is not. The stand-in is exact at one
 * radius and wrong either side of it: spreading the bounce flux over 4π gives
 * `Φ_b / 4πd²` where the enclosure gives `Φ_b / A`, so the two agree at
 * `r* = √(A/4π)`. For ordinary rooms — 40 to 100 m² of enclosure — that is 1.8
 * to 2.8 m, which is where the floor, the walls and anything standing on them
 * sit relative to a ceiling fixture. Nearer than `r*` it over-fills, and the
 * direct beam dominates there anyway; further, it under-fills, by about a factor
 * of two at the far corner of a room — inside the uncertainty on ρ̄ itself.
 *
 * Omnidirectional by construction: the bounce arrives from every direction at
 * once, so quoting a beam angle for it would be describing something else.
 */
export function fixtureBounceIntensity(lumens) {
  const flux = Number(lumens);
  if (!Number.isFinite(flux) || flux <= 0) return 0;
  return fixtureLightIntensity(flux * INTERIOR_BOUNCE_FLUX_FRACTION, null);
}

const DEG_TO_RAD = Math.PI / 180;

/** The RCP frame of a ceiling whose edges never pulled it off plan north. */
const DEFAULT_AXIS_U = Object.freeze({ x: 1, y: 0 });
const DEFAULT_AXIS_V = Object.freeze({ x: 0, y: -1 });

/**
 * Where an aimed fixture points, as a unit vector in the world the renderer
 * draws in.
 *
 * The aim is stored the way one is set on site: a tilt off straight down, and a
 * bearing taken in the ceiling's own drawing — degrees counter-clockwise from
 * +U. Turning that bearing into a direction uses the frame's own axes rather
 * than a rotation built from its angle, because the RCP frame mirrors V against
 * plan Y (determinant −1): a hand-rolled rotation would send every eyeball to
 * the mirror image of the wall it was aimed at.
 *
 * World space is the one the ceiling's descriptors already use — plan x is
 * world x, plan y is world z, elevation is world +y — so a tilt of zero is
 * (0, −1, 0), straight down, whatever the bearing says.
 */
export function aimDirectionWorld(aim, axisU = DEFAULT_AXIS_U, axisV = DEFAULT_AXIS_V) {
  const tilt = (Number(aim?.tiltDeg) || 0) * DEG_TO_RAD;
  const azimuth = (Number(aim?.azimuthDeg) || 0) * DEG_TO_RAD;
  const alongU = Math.cos(azimuth);
  const alongV = Math.sin(azimuth);
  const spread = Math.sin(tilt);

  return {
    x: (alongU * axisU.x + alongV * axisV.x) * spread,
    y: -Math.cos(tilt),
    z: (alongU * axisU.y + alongV * axisV.y) * spread,
  };
}
