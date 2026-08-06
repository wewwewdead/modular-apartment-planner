/**
 * Solar position for a geographic site, following the NOAA Solar Calculator
 * formulation (Meeus, *Astronomical Algorithms*, low-precision solar chapter).
 * Accurate to roughly ±0.02° for years 1800-2100, which is far tighter than
 * anything a shadow study needs.
 *
 * Conventions used throughout this module:
 *   - `date` is always an absolute instant (a real `Date`). Time zones are a
 *     presentation concern; see `siteInstant` for building an instant from the
 *     wall-clock time a person would read at the site.
 *   - Angles are returned in RADIANS.
 *   - `azimuth` is a compass bearing: 0 = true north, increasing clockwise, so
 *     east = π/2 and south = π.
 *   - `altitude` is apparent (refraction-corrected) elevation above the
 *     horizon; `trueAltitude` is the geometric elevation. Shadow geometry uses
 *     `trueAltitude` — refraction only matters within a fraction of a degree of
 *     the horizon, where shadows are already effectively unbounded.
 */

import { isValidTimeZone, zonedClockParts, zonedDateTimeToInstant } from '@/utils/timeZone';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const MS_PER_DAY = 86400000;
const MINUTES_PER_DAY = 1440;

/** Julian day number of the Unix epoch (1970-01-01T00:00:00Z). */
const UNIX_EPOCH_JD = 2440587.5;
const J2000 = 2451545;

/**
 * Sun's apparent radius plus mean atmospheric refraction at the horizon. The
 * standard NOAA sunrise/sunset zenith, in degrees.
 */
const SUNRISE_ZENITH_DEG = 90.833;

function julianDay(date) {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

function julianCentury(jd) {
  return (jd - J2000) / 36525;
}

/** Minutes elapsed since 00:00 UTC on the date's own UTC day. */
function utcMinutesOfDay(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60000;
}

function normalizeDegrees(value) {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * The handful of solar quantities that depend only on the instant, not on the
 * observer's position. Shared by position and sunrise/sunset so the two can
 * never drift apart.
 */
function solarCoordinates(jc) {
  const meanLongitude = normalizeDegrees(280.46646 + jc * (36000.76983 + jc * 0.0003032));
  const meanAnomaly = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const eccentricity = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);

  const equationOfCentre =
    Math.sin(meanAnomaly * DEG) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * meanAnomaly * DEG) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * meanAnomaly * DEG) * 0.000289;

  const trueLongitude = meanLongitude + equationOfCentre;
  // Correction for nutation and aberration.
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * DEG);

  const meanObliquity = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * DEG);

  const declination = Math.asin(Math.sin(obliquity * DEG) * Math.sin(apparentLongitude * DEG));

  // Equation of time, in minutes. `y` is tan²(ε/2).
  const y = Math.tan((obliquity / 2) * DEG) ** 2;
  const equationOfTime =
    4 *
    RAD *
    (y * Math.sin(2 * meanLongitude * DEG) -
      2 * eccentricity * Math.sin(meanAnomaly * DEG) +
      4 * eccentricity * y * Math.sin(meanAnomaly * DEG) * Math.cos(2 * meanLongitude * DEG) -
      0.5 * y * y * Math.sin(4 * meanLongitude * DEG) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * DEG));

  return { declination, equationOfTime, eccentricity, meanAnomaly, apparentLongitude, obliquity };
}

/**
 * Atmospheric refraction correction (degrees) for a geometric elevation given
 * in degrees. Standard NOAA piecewise fit for 1010 mb / 10 °C.
 */
function refractionDegrees(elevationDeg) {
  if (elevationDeg > 85) return 0;

  const tanElevation = Math.tan(elevationDeg * DEG);
  let arcSeconds;
  if (elevationDeg > 5) {
    arcSeconds = 58.1 / tanElevation - 0.07 / tanElevation ** 3 + 0.000086 / tanElevation ** 5;
  } else if (elevationDeg > -0.575) {
    arcSeconds =
      1735 + elevationDeg * (-518.2 + elevationDeg * (103.4 + elevationDeg * (-12.79 + elevationDeg * 0.711)));
  } else {
    arcSeconds = -20.772 / tanElevation;
  }
  return arcSeconds / 3600;
}

/**
 * Sun altitude and azimuth for a site at an instant.
 *
 * @param {object} options
 * @param {number} options.latitude   Degrees, north positive.
 * @param {number} options.longitude  Degrees, east positive.
 * @param {Date}   options.date       Absolute instant.
 * @returns {{altitude: number, trueAltitude: number, azimuth: number,
 *   declination: number, hourAngle: number, equationOfTime: number}}
 *   Angles in radians; `equationOfTime` in minutes.
 */
export function solarPosition({ latitude, longitude, date }) {
  const jc = julianCentury(julianDay(date));
  const { declination, equationOfTime } = solarCoordinates(jc);

  // True solar time, in minutes past local solar midnight. Longitude converts
  // to time at 4 minutes per degree.
  const trueSolarMinutes = mod(utcMinutesOfDay(date) + equationOfTime + 4 * longitude, MINUTES_PER_DAY);

  // Hour angle: 0 at solar noon, negative in the morning, ±180° at midnight.
  const hourAngleDeg = trueSolarMinutes / 4 < 0 ? trueSolarMinutes / 4 + 180 : trueSolarMinutes / 4 - 180;
  const hourAngle = hourAngleDeg * DEG;

  const latitudeRad = latitude * DEG;
  const cosZenith =
    Math.sin(latitudeRad) * Math.sin(declination) + Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngle);
  const zenith = Math.acos(clamp(cosZenith, -1, 1));

  const trueAltitudeDeg = 90 - zenith * RAD;
  const altitudeDeg = trueAltitudeDeg + refractionDegrees(trueAltitudeDeg);

  return {
    altitude: altitudeDeg * DEG,
    trueAltitude: trueAltitudeDeg * DEG,
    azimuth: solarAzimuth({ latitudeRad, declination, zenith, hourAngleDeg }),
    declination,
    hourAngle,
    equationOfTime,
  };
}

/**
 * Compass bearing of the sun, radians clockwise from true north. Split out
 * because the poles and the exact zenith need care: when the sun is directly
 * overhead or the observer is at a pole, azimuth is geometrically undefined and
 * we fall back to a stable value rather than emitting NaN.
 */
function solarAzimuth({ latitudeRad, declination, zenith, hourAngleDeg }) {
  const denominator = Math.cos(latitudeRad) * Math.sin(zenith);
  if (Math.abs(denominator) < 1e-9) {
    // At a pole (or with the sun at the exact zenith) every direction is south
    // or north. Hour angle still gives a usable, continuous answer.
    return mod(hourAngleDeg + 180, 360) * DEG;
  }

  const cosAzimuth = (Math.sin(latitudeRad) * Math.cos(zenith) - Math.sin(declination)) / denominator;
  const azimuthDeg = Math.acos(clamp(cosAzimuth, -1, 1)) * RAD;
  return mod(hourAngleDeg > 0 ? azimuthDeg + 180 : 540 - azimuthDeg, 360) * DEG;
}

/**
 * Sunrise, solar noon and sunset for the UTC day containing `date`.
 *
 * Returns absolute instants, or nulls when the sun does not cross the horizon
 * that day — `alwaysUp` and `alwaysDown` disambiguate midnight sun from polar
 * night.
 *
 * @returns {{sunrise: Date|null, sunset: Date|null, solarNoon: Date,
 *   daylightMinutes: number, alwaysUp: boolean, alwaysDown: boolean}}
 */
export function sunTimes({ latitude, longitude, date }) {
  const startOfDayMs = Math.floor(date.getTime() / MS_PER_DAY) * MS_PER_DAY;

  // Solar noon depends on the equation of time, which itself varies slightly
  // across the day. Evaluate at UTC noon, then refine once at the resulting
  // estimate; a second pass moves the answer by well under a second.
  let noonMinutesUtc = 720 - 4 * longitude;
  let coordinates = solarCoordinates(julianCentury(julianDay(new Date(startOfDayMs + 720 * 60000))));
  for (let pass = 0; pass < 2; pass += 1) {
    noonMinutesUtc = 720 - 4 * longitude - coordinates.equationOfTime;
    coordinates = solarCoordinates(julianCentury(julianDay(new Date(startOfDayMs + noonMinutesUtc * 60000))));
  }

  const latitudeRad = latitude * DEG;
  const cosHourAngle =
    Math.cos(SUNRISE_ZENITH_DEG * DEG) / (Math.cos(latitudeRad) * Math.cos(coordinates.declination)) -
    Math.tan(latitudeRad) * Math.tan(coordinates.declination);

  const solarNoon = new Date(startOfDayMs + noonMinutesUtc * 60000);

  // |cos H| > 1 means the sun never reaches the sunrise zenith: it either stays
  // up all day or never clears the horizon.
  if (cosHourAngle > 1) {
    return { sunrise: null, sunset: null, solarNoon, daylightMinutes: 0, alwaysUp: false, alwaysDown: true };
  }
  if (cosHourAngle < -1) {
    return {
      sunrise: null,
      sunset: null,
      solarNoon,
      daylightMinutes: MINUTES_PER_DAY,
      alwaysUp: true,
      alwaysDown: false,
    };
  }

  const halfDayMinutes = 4 * Math.acos(cosHourAngle) * RAD;
  return {
    sunrise: new Date(startOfDayMs + (noonMinutesUtc - halfDayMinutes) * 60000),
    sunset: new Date(startOfDayMs + (noonMinutesUtc + halfDayMinutes) * 60000),
    solarNoon,
    daylightMinutes: halfDayMinutes * 2,
    alwaysUp: false,
    alwaysDown: false,
  };
}

/**
 * Minutes ahead of UTC for **local mean solar time** at a longitude: the clock
 * the sun itself keeps, where midday is when the sun crosses your meridian.
 *
 * A civil time zone is a political label, not a physical quantity — the sun's
 * position depends only on latitude, longitude and the instant. Deriving the
 * clock from longitude means a site needs two numbers instead of three, and it
 * puts solar noon near 12:00 everywhere, which is what a shadow study wants.
 *
 * Earth turns 15° per hour, so each degree of longitude is 4 minutes.
 *
 * Note this is *mean* solar time: true solar noon still wanders about ±16
 * minutes across the year with the equation of time, which is real and visible.
 */
export function solarTimeOffsetMinutes(longitude) {
  return Number.isFinite(longitude) ? longitude * 4 : 0;
}

/**
 * Build an absolute instant from the wall-clock time a person standing on the
 * site would read. This is the only place time zones enter the module.
 *
 * @param {object} options
 * @param {number} options.year
 * @param {number} options.month  1-12.
 * @param {number} options.day    1-31.
 * @param {number} [options.minutes]  Minutes past local midnight.
 * @param {string} [options.timeZone] IANA zone, e.g. `Asia/Manila`. This is
 *   preferred because it applies the civil DST rule on the requested date.
 * @param {number} [options.timezoneOffsetMinutes]  Legacy fixed offset,
 *   minutes ahead of UTC, e.g.
 *   480 for UTC+8. Note this is the opposite sign to `Date#getTimezoneOffset`.
 */
export function siteInstant({ year, month, day, minutes = 0, timeZone = null, timezoneOffsetMinutes = 0 }) {
  if (isValidTimeZone(timeZone)) {
    return zonedDateTimeToInstant({ year, month, day, minutes, timeZone });
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + (minutes - timezoneOffsetMinutes) * 60000);
}

/** Inverse of `siteInstant`: local wall-clock parts for an instant at the site. */
export function siteClock({ date, timeZone = null, timezoneOffsetMinutes = 0 }) {
  if (isValidTimeZone(timeZone)) {
    const parts = zonedClockParts(date, timeZone);
    return { year: parts.year, month: parts.month, day: parts.day, minutes: parts.minutes };
  }
  const shifted = new Date(date.getTime() + timezoneOffsetMinutes * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * Sun positions across a single day, for shadow-range and sun-hours studies.
 * Only samples where the sun is above `minAltitude` are returned, since a sun
 * below the horizon casts no shadow.
 *
 * @param {object} options
 * @param {number} options.latitude
 * @param {number} options.longitude
 * @param {Date}   options.date  Any instant on the day of interest.
 * @param {number} [options.stepMinutes]  Sampling interval. 15 gives smooth
 *   envelopes; 60 matches the hourly convention used in overshadowing rules.
 * @param {string} [options.timeZone] IANA civil timezone.
 * @param {number} [options.timezoneOffsetMinutes] Legacy fixed offset.
 * @param {number} [options.minAltitudeDeg]  Sun below this contributes nothing.
 *   Defaults to 0.5°, below which shadows are longer than any plausible site.
 * @returns {Array<{date: Date, minutes: number, altitude: number, azimuth: number}>}
 *   `minutes` is local wall-clock minutes past midnight at the site.
 */
export function sampleDaySunPositions({
  latitude,
  longitude,
  date,
  stepMinutes = 15,
  timeZone = null,
  timezoneOffsetMinutes = 0,
  minAltitudeDeg = 0.5,
}) {
  const { year, month, day } = siteClock({ date, timeZone, timezoneOffsetMinutes });
  const step = Math.max(1, stepMinutes);
  const samples = [];

  const start = siteInstant({ year, month, day, minutes: 0, timeZone, timezoneOffsetMinutes });
  const nextDate = new Date(Date.UTC(year, month - 1, day) + MS_PER_DAY);
  const end = siteInstant({
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth() + 1,
    day: nextDate.getUTCDate(),
    minutes: 0,
    timeZone,
    timezoneOffsetMinutes,
  });

  // Iterate absolute time between civil midnights. DST transition days then
  // contain 23 or 25 real hours instead of being forced into a fictional 24.
  for (let instantMs = start.getTime(); instantMs < end.getTime(); instantMs += step * 60000) {
    const instant = new Date(instantMs);
    const minutes = siteClock({ date: instant, timeZone, timezoneOffsetMinutes }).minutes;
    const position = solarPosition({ latitude, longitude, date: instant });
    if (position.trueAltitude * RAD < minAltitudeDeg) continue;
    samples.push({ date: instant, minutes, altitude: position.trueAltitude, azimuth: position.azimuth });
  }

  return samples;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mod(value, modulus) {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

export const SOLAR_MATH = { DEG, RAD, MINUTES_PER_DAY };
