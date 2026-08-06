import { normalizeWindRose, WIND_DIRECTIONS } from './windState';

export const WIND_CLIMATE_SOURCE_URL = 'https://open-meteo.com/en/docs/historical-weather-api';
const WIND_CLIMATE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';
const CLIMATE_YEARS = 5;
const MIN_SCALE = 0.1;

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

/** Turn the compact project payload back into the same shape as an API result. */
export function restoreSiteWindClimate(cache, site) {
  if (!cache || cache.schemaVersion !== 1) return null;
  const locationKey = windClimateLocationKey(site || {});
  if (!locationKey || cache.locationKey !== locationKey) return null;
  const windRose = normalizeWindRose(cache.windRose);
  const prevailingDirectionDeg = Number(cache.prevailingDirectionDeg);
  const prevailingMeanSpeed = Number(cache.prevailingMeanSpeed);
  if (
    !windRose ||
    windRose.length !== WIND_DIRECTIONS.length ||
    !Number.isFinite(prevailingDirectionDeg) ||
    !Number.isFinite(prevailingMeanSpeed) ||
    prevailingMeanSpeed <= 0
  ) {
    return null;
  }
  const { windRose: _storedRose, ...metadata } = cache;
  return { windRose, prevailingDirectionDeg, prevailingMeanSpeed, metadata };
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
