/**
 * Clear-sky solar irradiance, and how much of it lands on a tilted surface.
 *
 * **Read this before trusting a kilowatt-hour out of this file.** These are
 * *theoretical clear-sky* numbers. There is no weather file: no cloud cover, no
 * aerosol history, no measured turbidity, no snow, no horizon profile from the
 * terrain beyond the model. A real year at a real site delivers substantially
 * less — commonly 20-40% less, and more than that in a cloudy maritime climate.
 *
 * What that makes the output good for: comparing options. Which facade, which
 * roof pitch, which massing, which neighbour. Those comparisons are sound
 * because every option is evaluated under the same sky.
 *
 * What it is not good for: predicting yield. A PV array sized off these numbers
 * would be oversized, and the UI says so wherever a kWh figure appears. Doing
 * this properly needs a TMY or EPW file and a Perez sky, which is a different
 * feature with a different data dependency.
 *
 * Sun hours are a separate matter entirely: they are pure geometry, need no
 * irradiance model at all, and are exactly as trustworthy as the massing.
 */

const DEG = Math.PI / 180;

/** Solar constant, W/m². The 2015 IAU/CODATA consensus value. */
export const SOLAR_CONSTANT = 1361;

/** Reflectance of the ground around the building. Grass, asphalt, paving. */
export const DEFAULT_GROUND_REFLECTANCE = 0.2;

/**
 * Extraterrestrial irradiance on a surface facing the sun, W/m².
 *
 * Earth's orbit is slightly eccentric, so this swings about ±3.3% over the
 * year, peaking at perihelion in early January. Small, but it is the difference
 * between a January and a July number being comparable or not.
 */
export function extraterrestrialNormal(dayOfYear) {
  return SOLAR_CONSTANT * (1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365.25));
}

/**
 * Relative optical air mass, by the Kasten-Young formula.
 *
 * A plain `1/cos θ` diverges at the horizon; Kasten-Young stays finite and
 * lands on the observed ~38 air masses at sunrise, which is what keeps low-sun
 * irradiance from being wildly overstated.
 */
export function airMass(zenithAngle) {
  const zenithDeg = Math.min(90, zenithAngle / DEG);
  const cosine = Math.cos(Math.min(zenithAngle, Math.PI / 2));
  return 1 / (cosine + 0.50572 * Math.pow(96.07995 - zenithDeg, -1.6364));
}

/**
 * Clear-sky beam and diffuse irradiance for a sun altitude.
 *
 * Beam follows the Meinel transmittance `0.7^(AM^0.678)`, a compact and widely
 * used clear-sky approximation that lands near 950 W/m² for an overhead sun —
 * about what a clear day at sea level actually measures.
 *
 * Diffuse is taken as a fixed fraction of the beam, the ASHRAE clear-sky C
 * factor. At solar noon that is roughly 95 W/m² horizontal diffuse, inside the
 * 80-120 W/m² a clear sky delivers.
 *
 * @param {object} options
 * @param {number} options.altitude   Sun altitude, radians. Use the geometric
 *   (unrefracted) altitude, matching the shadow code.
 * @param {number} options.dayOfYear
 * @returns {{dni: number, dhi: number, ghi: number, cosZenith: number, airMass: number}}
 *   All W/m². Zero everywhere once the sun is down.
 */
export function clearSkyIrradiance({ altitude, dayOfYear, diffuseFraction = 0.1 }) {
  const cosZenith = Math.sin(altitude);
  if (!(cosZenith > 0)) return { dni: 0, dhi: 0, ghi: 0, cosZenith: 0, airMass: Infinity };

  const zenith = Math.PI / 2 - altitude;
  const mass = airMass(zenith);
  const normal = extraterrestrialNormal(dayOfYear);

  const dni = normal * Math.pow(0.7, Math.pow(mass, 0.678));
  const dhi = diffuseFraction * dni;

  return { dni, dhi, ghi: dni * cosZenith + dhi, cosZenith, airMass: mass };
}

/**
 * Irradiance on a tilted plane, by the Hay-Davies anisotropic sky model.
 *
 * Three terms, and each is obstructed differently, which is the whole reason
 * this is not a one-liner:
 *
 *   - **Beam** comes straight from the sun, so it is all or nothing on whether
 *     the sensor can see the sun.
 *   - **Circumsolar diffuse** is the bright halo around the sun. It travels the
 *     same path, so it is gated by the same visibility. Isotropic models miss
 *     this and understate a facade in direct sun by a useful margin.
 *   - **Isotropic diffuse** comes from the whole sky dome, so it scales with how
 *     much sky the sensor can actually see — the measured view factor, not the
 *     `(1 + cos β) / 2` of an unobstructed plane. In a courtyard those two are
 *     nothing alike.
 *
 * Ground-reflected light uses the complementary view factor of the plane's own
 * tilt. A vertical facade sees half sky and half ground; a flat roof sees no
 * ground at all.
 *
 * @param {object} options
 * @param {number} options.dni @param {number} options.dhi @param {number} options.ghi  W/m².
 * @param {number} options.cosIncidence  Cosine of the angle between the sun and
 *   the surface normal. Negative means the sun is behind the surface.
 * @param {number} options.cosZenith
 * @param {number} options.extraterrestrial  Normal extraterrestrial irradiance.
 * @param {number} options.skyViewFactor  0-1, measured by raycasting.
 * @param {number} options.tiltCosine     Surface normal's vertical component.
 * @param {boolean|number} options.sunlit Whether the sun itself is visible.
 * @returns {{total: number, beam: number, diffuse: number, ground: number}} W/m².
 */
export function planeOfArrayIrradiance({
  dni,
  dhi,
  ghi,
  cosIncidence,
  cosZenith,
  extraterrestrial,
  skyViewFactor,
  tiltCosine,
  sunlit,
  groundReflectance = DEFAULT_GROUND_REFLECTANCE,
}) {
  const visible = sunlit ? 1 : 0;
  const facing = Math.max(0, cosIncidence);

  const beam = dni * facing * visible;

  // Anisotropy index: what fraction of the extraterrestrial beam survived the
  // atmosphere, and so how much of the diffuse is concentrated round the sun.
  const anisotropy = extraterrestrial > 0 ? Math.min(1, dni / extraterrestrial) : 0;
  const ratio = cosZenith > 0.01 ? facing / cosZenith : 0;

  const circumsolar = dhi * anisotropy * ratio * visible;
  const isotropic = dhi * (1 - anisotropy) * Math.max(0, skyViewFactor);

  const ground = ghi * groundReflectance * Math.max(0, (1 - tiltCosine) / 2);

  const diffuse = circumsolar + isotropic;
  return { total: beam + diffuse + ground, beam, diffuse, ground };
}

/** Days in a month, ignoring leap years — a rounding no study can see. */
export function daysInMonth(month) {
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Math.max(0, Math.min(11, month - 1))];
}

/** Day number within the year, 1-365. */
export function dayOfYear(month, day) {
  let total = day;
  for (let index = 1; index < month; index += 1) total += daysInMonth(index);
  return total;
}

export const IRRADIANCE_CONSTANTS = { DEG };
