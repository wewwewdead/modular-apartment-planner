import { normalizeWindRose, WIND_DIRECTIONS } from './windState';

export const WIND_CLIMATE_SOURCE_URL = 'https://open-meteo.com/en/docs/historical-weather-api';
const WIND_CLIMATE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';
const CLIMATE_YEARS = 5;
const MIN_SCALE = 0.1;

/**
 * Identity of the DATA, not of the code that reads it.
 *
 * Bump this string whenever the request or the fit changes what the numbers
 * mean — a different endpoint, a different hourly variable set, a different
 * measurement height, a different sector count or Weibull estimator. It is part
 * of the localStorage key AND is stored inside every snapshot, so a bump
 * invalidates both cleanly: old keys are never read again, and an old snapshot
 * found in a project file is rejected by the reader rather than mixed with new
 * numbers. `schemaVersion` below is the separate question of whether the
 * CONTAINER can be parsed at all.
 */
export const WIND_CLIMATE_DATASET_VERSION = 'open-meteo-archive-hourly-10m-1';

/** Container format of the project-file snapshot and of a localStorage entry. */
export const WIND_CLIMATE_SNAPSHOT_SCHEMA_VERSION = 2;

/**
 * How long a fetched climate is reused before the network is consulted again.
 *
 * Thirty days. These are five-year climate normals: a month of extra hours
 * moves a Weibull fit by far less than the difference between the reanalysis
 * grid cell and the actual site, which is the error that already dominates.
 * The rolling five-year window (`windClimatePeriod`) also rolls the cache key
 * every January, so a stale entry cannot outlive the period it was fitted for
 * however generous the TTL is.
 */
export const WIND_CLIMATE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const WIND_CLIMATE_CACHE_KEY_PREFIX = 'apartment-planner:wind-climate:';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPEED_MS = 150;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function windClimatePeriod(now = new Date()) {
  const endYear = now.getUTCFullYear() - 1;
  const startYear = endYear - CLIMATE_YEARS + 1;
  return {
    startDate: isoDate(startYear, 1, 1),
    endDate: isoDate(endYear, 12, 31),
    label: `${startYear}–${endYear}`,
  };
}

export function windClimateLocationKey({ latitude, longitude }) {
  if (latitude == null || latitude === '' || longitude == null || longitude === '') return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return null;
  }
  return `${lat.toFixed(4)}|${lon.toFixed(4)}`;
}

export function windClimateRequestUrl({ latitude, longitude, startDate, endDate }) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: startDate,
    end_date: endDate,
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
    timezone: 'GMT',
  });
  return `${WIND_CLIMATE_ENDPOINT}?${params}`;
}

// Lanczos approximation, sufficient for the narrow positive range used by
// c = mean / Gamma(1 + 1/k) in the Weibull moment fit below.
function gamma(value) {
  const coefficients = [
    0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
    12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (value < 0.5) return Math.PI / (Math.sin(Math.PI * value) * gamma(1 - value));
  const z = value - 1;
  let sum = coefficients[0];
  for (let index = 1; index < coefficients.length; index += 1) sum += coefficients[index] / (z + index);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * sum;
}

export function fitWeibull(speeds) {
  if (!speeds.length) return { weibullK: 2, weibullC: MIN_SCALE, meanSpeed: 0 };
  const meanSpeed = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
  if (!(meanSpeed > 0)) return { weibullK: 2, weibullC: MIN_SCALE, meanSpeed: 0 };
  const variance = speeds.reduce((sum, value) => sum + (value - meanSpeed) ** 2, 0) / speeds.length;
  const coefficientOfVariation = Math.sqrt(variance) / meanSpeed;
  const weibullK = clamp(coefficientOfVariation > 1e-6 ? coefficientOfVariation ** -1.086 : 10, 0.5, 10);
  const weibullC = Math.max(MIN_SCALE, meanSpeed / gamma(1 + 1 / weibullK));
  return { weibullK, weibullC, meanSpeed };
}

function sectorIndex(directionDeg) {
  return Math.round((((directionDeg % 360) + 360) % 360) / 22.5) % WIND_DIRECTIONS.length;
}

export function deriveWindClimate({ speeds, directions, metadata = {} }) {
  if (!Array.isArray(speeds) || !Array.isArray(directions) || speeds.length !== directions.length) {
    throw new Error('The wind climate response is missing aligned speed and direction samples.');
  }

  const sectors = WIND_DIRECTIONS.map(() => []);
  let sampleCount = 0;
  let speedSum = 0;
  for (let index = 0; index < speeds.length; index += 1) {
    const speed = Number(speeds[index]);
    const direction = Number(directions[index]);
    if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(direction)) continue;
    sectors[sectorIndex(direction)].push(speed);
    sampleCount += 1;
    speedSum += speed;
  }
  if (sampleCount < 24) throw new Error('The wind climate response contains too few valid hourly samples.');

  const windRose = sectors.map((sectorSpeeds, index) => {
    const fit = fitWeibull(sectorSpeeds);
    return {
      directionDeg: WIND_DIRECTIONS[index],
      frequency: sectorSpeeds.length / sampleCount,
      weibullK: fit.weibullK,
      weibullC: fit.weibullC,
      meanSpeed: fit.meanSpeed,
      sampleCount: sectorSpeeds.length,
    };
  });
  const prevailing = windRose.reduce((best, sector) => (sector.frequency > best.frequency ? sector : best));

  return {
    windRose: windRose.map(({ directionDeg, frequency, weibullK, weibullC }) => ({
      directionDeg,
      frequency,
      weibullK,
      weibullC,
    })),
    prevailingDirectionDeg: prevailing.directionDeg,
    prevailingMeanSpeed: Math.max(MIN_SCALE, prevailing.meanSpeed),
    metadata: {
      ...metadata,
      sampleCount,
      meanSpeed: speedSum / sampleCount,
      prevailingDirectionDeg: prevailing.directionDeg,
      prevailingMeanSpeed: Math.max(MIN_SCALE, prevailing.meanSpeed),
      heightM: 10,
      sectorCount: WIND_DIRECTIONS.length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Cache identity, snapshots and the untrusted-JSON read path                  */
/*                                                                              */
/* Everything here is pure: it decides WHAT a cache entry is called, WHETHER a  */
/* stored payload may be believed and WHEN it has gone stale. Reading or        */
/* writing localStorage is the caller's job (src/persistence/windClimateCache). */
/* -------------------------------------------------------------------------- */

/**
 * The localStorage key for one fetched climate.
 *
 * Keyed by exactly what the request varies on: the 4-decimal location key (the
 * same rounding `windClimateLocationKey` gives the study, so a cache hit can
 * never disagree with the site it is applied to — a coarser key would return a
 * climate whose own `locationKey` no longer matches the site, and the panel
 * would re-apply it forever), the five-year period, and the dataset version.
 */
export function windClimateCacheKey({ latitude, longitude, startDate, endDate }) {
  const locationKey = windClimateLocationKey({ latitude, longitude });
  if (!locationKey || !ISO_DATE.test(String(startDate)) || !ISO_DATE.test(String(endDate))) return null;
  return `${WIND_CLIMATE_CACHE_KEY_PREFIX}${WIND_CLIMATE_DATASET_VERSION}|${locationKey}|${startDate}|${endDate}`;
}

/* Untrusted-input helpers. Every field crossing the JSON boundary — project
 * file or localStorage, both of which a user can edit by hand — goes through
 * one of these. Strings are type-checked, stripped of control characters and
 * length-capped; numbers are coerced once and clamped to a physical range. */

function safeString(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  let cleaned = '';
  for (const character of value) {
    const code = character.codePointAt(0);
    // Drop C0/C1 control characters; everything printable survives.
    if (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)) cleaned += character;
  }
  return cleaned.trim().slice(0, maxLength);
}

function safeIsoDate(value) {
  return typeof value === 'string' && ISO_DATE.test(value) ? value : '';
}

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value.slice(0, 40) : '';
}

function clampedNumber(value, min, max, fallback = null) {
  const numeric = Number(value);
  if (value == null || value === '' || !Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}

/**
 * The one shape both readers produce: an API-result-shaped climate whose
 * `metadata` contains ONLY allowlisted, coerced fields.
 *
 * `sourceUrl` is deliberately not read from the payload. It is the one string
 * in this record that a renderer could plausibly put in an `href`, so it is
 * stamped from the module constant instead — a hand-edited project file cannot
 * introduce a `javascript:` URL through it.
 */
function buildRestoredClimate({ windRose, prevailingDirectionDeg, prevailingMeanSpeed, locationKey, fields }) {
  return {
    windRose,
    prevailingDirectionDeg,
    prevailingMeanSpeed,
    metadata: {
      schemaVersion: WIND_CLIMATE_SNAPSHOT_SCHEMA_VERSION,
      datasetVersion: WIND_CLIMATE_DATASET_VERSION,
      locationKey,
      source: fields.source || 'Historical wind climate',
      sourceUrl: WIND_CLIMATE_SOURCE_URL,
      period: fields.period,
      startDate: fields.startDate,
      endDate: fields.endDate,
      cachedAt: fields.cachedAt,
      sampleCount: fields.sampleCount,
      meanSpeed: fields.meanSpeed,
      heightM: fields.heightM,
      prevailingDirectionDeg,
      prevailingMeanSpeed,
      sectorCount: WIND_DIRECTIONS.length,
    },
  };
}

/** The rose plus the two prevailing numbers, or null if any of them is unusable. */
function readCore(source) {
  const windRose = normalizeWindRose(source?.windRose);
  const prevailingDirectionDeg = Number(source?.prevailingDirectionDeg);
  const prevailingMeanSpeed = Number(source?.prevailingMeanSpeed);
  if (
    !windRose ||
    windRose.length !== WIND_DIRECTIONS.length ||
    !Number.isFinite(prevailingDirectionDeg) ||
    !Number.isFinite(prevailingMeanSpeed) ||
    prevailingMeanSpeed <= 0 ||
    prevailingMeanSpeed > MAX_SPEED_MS
  ) {
    return null;
  }
  return { windRose, prevailingDirectionDeg: wrapDegrees(prevailingDirectionDeg), prevailingMeanSpeed };
}

function readFields(source) {
  return {
    source: safeString(source?.source),
    period: safeString(source?.period, 64),
    startDate: safeIsoDate(source?.startDate),
    endDate: safeIsoDate(source?.endDate),
    sampleCount: clampedNumber(source?.sampleCount, 0, Number.MAX_SAFE_INTEGER),
    meanSpeed: clampedNumber(source?.meanSpeed, 0, MAX_SPEED_MS),
    heightM: clampedNumber(source?.heightM, 0.1, 500, 10),
  };
}

/**
 * LEGACY read path: the `site.windClimateCache` shape written by the removed
 * `CacheSiteWindClimate` command (plan amendment 14). Nothing writes it any
 * more; existing project files still carry it and must keep working, so it is
 * read as a snapshot of last resort.
 *
 * Tightened by plan amendment 18: it used to spread every remaining key of the
 * stored object into `metadata` (`const { windRose, ...metadata } = cache`),
 * which let arbitrary attacker-chosen keys and values from a project file reach
 * the panel. The allowlist above replaces that spread.
 */
export function restoreSiteWindClimate(cache, site) {
  if (!isPlainObject(cache) || cache.schemaVersion !== 1) return null;
  const locationKey = windClimateLocationKey(site || {});
  if (!locationKey || cache.locationKey !== locationKey) return null;
  const core = readCore(cache);
  if (!core) return null;
  return buildRestoredClimate({
    ...core,
    locationKey,
    fields: { ...readFields(cache), cachedAt: safeTimestamp(cache.cachedAt) },
  });
}

/**
 * The compact, versioned record a project file carries and a localStorage entry
 * stores: `{ schemaVersion, datasetVersion, locationKey, capturedAt, normals }`.
 * `normals` is the five-year summary the study runs on — the fitted 16-sector
 * rose and its prevailing condition — never the raw hourly response.
 */
export function createWindClimateSnapshot(climate, { now = new Date() } = {}) {
  const core = readCore(climate);
  const metadata = isPlainObject(climate?.metadata) ? climate.metadata : {};
  const locationKey = typeof metadata.locationKey === 'string' ? metadata.locationKey : '';
  if (!core || !locationKey) return null;
  const fields = readFields(metadata);
  return {
    schemaVersion: WIND_CLIMATE_SNAPSHOT_SCHEMA_VERSION,
    datasetVersion: WIND_CLIMATE_DATASET_VERSION,
    locationKey,
    // When the data was FETCHED, not when it was written here: the TTL asks how
    // old the numbers are, and re-saving a project must not make them young.
    capturedAt: safeTimestamp(metadata.cachedAt) || new Date(now).toISOString(),
    normals: {
      windRose: core.windRose.map((sector) => ({ ...sector })),
      prevailingDirectionDeg: core.prevailingDirectionDeg,
      prevailingMeanSpeed: core.prevailingMeanSpeed,
      meanSpeed: fields.meanSpeed,
      sampleCount: fields.sampleCount,
      heightM: fields.heightM,
      period: fields.period,
      startDate: fields.startDate,
      endDate: fields.endDate,
      source: fields.source,
    },
  };
}

/** Age check for a stored snapshot. A future `capturedAt` (clock change) is stale. */
export function isWindClimateSnapshotFresh(snapshot, now = Date.now()) {
  const capturedAt = Date.parse(snapshot?.capturedAt);
  if (!Number.isFinite(capturedAt)) return false;
  const age = Number(now) - capturedAt;
  return age >= 0 && age < WIND_CLIMATE_CACHE_TTL_MS;
}

/**
 * Read a snapshot from untrusted JSON back into an API-result-shaped climate.
 *
 * Rejects anything whose container version or dataset version is not exactly
 * ours, and anything fitted for a different location than the site asks about.
 * `requireFresh` applies the TTL: the localStorage cache uses it (a stale entry
 * means "go and fetch"), the project file does not (an old saved snapshot is
 * still the only thing that makes the study work offline).
 */
export function readWindClimateSnapshot(snapshot, site, { now = Date.now(), requireFresh = false } = {}) {
  if (!isPlainObject(snapshot)) return null;
  if (snapshot.schemaVersion !== WIND_CLIMATE_SNAPSHOT_SCHEMA_VERSION) return null;
  if (snapshot.datasetVersion !== WIND_CLIMATE_DATASET_VERSION) return null;
  const locationKey = windClimateLocationKey(site || {});
  if (!locationKey || snapshot.locationKey !== locationKey) return null;
  if (requireFresh && !isWindClimateSnapshotFresh(snapshot, now)) return null;
  const normals = isPlainObject(snapshot.normals) ? snapshot.normals : null;
  const core = normals && readCore(normals);
  if (!core) return null;
  return buildRestoredClimate({
    ...core,
    locationKey,
    fields: { ...readFields(normals), cachedAt: safeTimestamp(snapshot.capturedAt) },
  });
}

/**
 * What the study may use before any fetch: the versioned snapshot written at
 * explicit save, falling back to the legacy project cache for files saved
 * before amendment 14.
 */
export function restoreProjectWindClimate(site) {
  return (
    readWindClimateSnapshot(site?.windClimateSnapshot, site) || restoreSiteWindClimate(site?.windClimateCache, site)
  );
}

/**
 * Do two climates carry materially different numbers?
 *
 * Used for one thing only: telling the reader that what they are looking at is
 * no longer what their project file says. The comparison is on the values the
 * study consumes, with a relative epsilon because a snapshot's frequencies are
 * re-normalised on read and can land an ulp away from the originals.
 */
export function windClimateDiffers(left, right) {
  if (!left || !right) return false;
  const apart = (a, b) => Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (apart(left.prevailingDirectionDeg, right.prevailingDirectionDeg)) return true;
  if (apart(left.prevailingMeanSpeed, right.prevailingMeanSpeed)) return true;
  if ((left.metadata?.startDate || '') !== (right.metadata?.startDate || '')) return true;
  if ((left.metadata?.endDate || '') !== (right.metadata?.endDate || '')) return true;
  const leftRose = left.windRose || [];
  const rightRose = right.windRose || [];
  if (leftRose.length !== rightRose.length) return true;
  for (let index = 0; index < leftRose.length; index += 1) {
    for (const key of ['directionDeg', 'frequency', 'weibullK', 'weibullC']) {
      if (apart(leftRose[index][key], rightRose[index][key])) return true;
    }
  }
  return false;
}

export async function fetchSiteWindClimate({ latitude, longitude, now = new Date(), signal, fetchImpl = fetch }) {
  const locationKey = windClimateLocationKey({ latitude, longitude });
  if (!locationKey) throw new Error('Set a valid latitude and longitude before loading wind climate data.');
  const period = windClimatePeriod(now);
  const response = await fetchImpl(windClimateRequestUrl({ latitude, longitude, ...period }), { signal });
  if (!response.ok) {
    let reason = '';
    try {
      reason = (await response.json())?.reason || '';
    } catch {
      // The HTTP status below remains useful when a proxy returns non-JSON.
    }
    throw new Error(reason || `Wind climate request failed (${response.status}).`);
  }
  const payload = await response.json();
  const result = deriveWindClimate({
    speeds: payload?.hourly?.wind_speed_10m,
    directions: payload?.hourly?.wind_direction_10m,
    metadata: {
      source: 'Open-Meteo historical reanalysis',
      sourceUrl: WIND_CLIMATE_SOURCE_URL,
      schemaVersion: 1,
      cachedAt: now.toISOString(),
      period: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      locationKey,
      requestedLatitude: Number(latitude),
      requestedLongitude: Number(longitude),
      gridLatitude: Number(payload.latitude),
      gridLongitude: Number(payload.longitude),
      elevationM: Number(payload.elevation),
    },
  });
  return result;
}
