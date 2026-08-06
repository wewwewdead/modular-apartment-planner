/**
 * Turns a project plus the editor's sun-study settings into everything the
 * overlays, the panel and the 3D preview need to draw.
 *
 * One entry point, one result shape, computed synchronously. Instant and range
 * studies are fast enough to run inside a `useMemo`; the sun-hours grid is the
 * expensive one and only runs when that mode is selected.
 */

import { solarPosition, sunTimes, siteInstant, sampleDaySunPositions } from './solarPosition';
import { buildAnalysisMassing, massingBounds } from './buildingMassing';
import { castShadows, shadowRangeEnvelope, sunHoursGrid, shadowArea, shadowCoverageOfPlot } from './shadowProjection';
import { parseSunStudyDate, siteSupportsSunStudy } from './sunStudyState';
import { polygonArea } from '@/geometry/polygon';

const RAD = 180 / Math.PI;

/** Padding around the massing when a study has no shadow to bound the grid. */
const GRID_FALLBACK_PADDING_MM = 20000;

function boundsOfRegions(regions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const region of regions) {
    for (const point of region.outline) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function boundsOfPolygon(polygon) {
  if (!polygon?.length) return null;
  return polygon.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function resolveTarget(site, targetId) {
  if (targetId === 'extent') return null;
  if (targetId === 'property' && site.boundary?.length >= 3) {
    return { id: 'property', name: 'Property boundary', kind: 'property', polygon: site.boundary };
  }
  const stored = (site.solarStudyTargets || []).find((target) => target.id === targetId && target.polygon?.length >= 3);
  if (stored) return stored;
  if (site.boundary?.length >= 3) {
    return { id: 'property', name: 'Property boundary', kind: 'property', polygon: site.boundary };
  }
  return null;
}

/**
 * Run the study.
 *
 * @param {object} options
 * @param {object} options.project   Use the phase-filtered project, so hidden
 *   phases stop casting shadows exactly as they stop drawing.
 * @param {object} options.sunStudy  Editor state from `createSunStudyState`.
 * @param {string[]} [options.floorIds]
 * @returns {object|null} Null when the study is off or the site has no location.
 */
export function computeSunStudy({ project, sunStudy, floorIds = null }) {
  const day = computeDayStudy({ project, sunStudy, floorIds });
  if (!day) return null;
  return { ...day, ...computeInstantShadow({ day, sunStudy }) };
}

/**
 * The day-scale half of the study: massing, sun path, envelope and sun-hours
 * grid. This is the expensive part, and none of it depends on the time of day.
 *
 * Split out from the instant shadow so that dragging the time scrubber does not
 * rebuild a whole day of geometry on every step — the mistake that made "All
 * day" and "Sun hours" lock the UI. Callers should memoise this on the date and
 * the sampling settings, and memoise `computeInstantShadow` on the minute.
 *
 * @returns {object|null} Null when the study is off or the site has no location.
 */
export function computeDayStudy({ project, sunStudy, floorIds = null }) {
  const site = project?.building?.site;
  if (!sunStudy?.enabled || !siteSupportsSunStudy(site)) return null;

  const { latitude, longitude, timeZone } = site;
  const northAngle = site.northAngle || 0;
  const { year, month, day } = parseSunStudyDate(sunStudy.date);

  // Anchor sunrise/sunset to local noon: a study time near midnight can fall on
  // a different UTC day, which would otherwise report the neighbouring day's times.
  const noonInstant = siteInstant({ year, month, day, minutes: 720, timeZone });

  const times = sunTimes({ latitude, longitude, date: noonInstant });
  const masses = buildAnalysisMassing(project, { floorIds });
  const target = resolveTarget(site, sunStudy.targetId);
  const targetAreaMm2 = target ? Math.abs(polygonArea(target.polygon)) : 0;

  const result = {
    mode: sunStudy.mode,
    latitude,
    longitude,
    timeZone,
    dateParts: { year, month, day },
    northAngle,
    times,
    masses,
    envelope: [],
    grid: null,
    samples: [],
    envelopeAreaMm2: 0,
    target,
    targetAreaMm2,
    targetShadowFraction: null,
    targetIsComplianceReady: Boolean(target),
  };

  if (sunStudy.mode === 'instant') return result;

  const samples = sampleDaySunPositions({
    latitude,
    longitude,
    date: noonInstant,
    stepMinutes: sunStudy.stepMinutes,
    timeZone,
  });
  result.samples = samples;
  result.envelope = shadowRangeEnvelope(masses, samples, { northAngle });
  result.envelopeAreaMm2 = shadowArea(result.envelope);
  if (target) result.targetShadowFraction = shadowCoverageOfPlot(result.envelope, target.polygon);

  if (sunStudy.mode === 'sunHours') {
    // The envelope bounds the only ground that is ever shaded, which makes it
    // the natural extent for the grid.
    const bounds =
      boundsOfPolygon(target?.polygon) ||
      boundsOfRegions(result.envelope) ||
      padBounds(massingBounds(masses), GRID_FALLBACK_PADDING_MM);
    result.grid = sunHoursGrid({
      masses,
      sunSamples: samples,
      bounds,
      cellSize: sunStudy.gridCellSize,
      stepMinutes: sunStudy.stepMinutes,
      northAngle,
      thresholdHours: sunStudy.thresholdHours,
      targetPolygon: target?.polygon || null,
    });
  }

  return result;
}

/**
 * The cheap half: where the sun is at the chosen minute, and the shadow it
 * casts right now. Milliseconds, so it can run on every scrubber step.
 */
export function computeInstantShadow({ day, sunStudy }) {
  const { latitude, longitude, timeZone, dateParts, northAngle, masses, mode, target } = day;
  const instant = siteInstant({ ...dateParts, minutes: sunStudy.minutes, timeZone });
  const position = solarPosition({ latitude, longitude, date: instant });

  // Shadow length is geometric, so use the unrefracted altitude.
  const sun = { altitude: position.trueAltitude, azimuth: position.azimuth };
  const sunIsUp = position.trueAltitude > 0;
  const regions = masses.length && sunIsUp ? castShadows(masses, sun, { northAngle }) : [];

  return {
    instant,
    sun,
    sunIsUp,
    altitudeDeg: position.trueAltitude * RAD,
    azimuthDeg: position.azimuth * RAD,
    regions,
    // "How much ground is shaded" means the moment in instant mode and the whole
    // day in the others, which is what each view is actually claiming.
    shadowAreaMm2: mode === 'instant' ? shadowArea(regions) : day.envelopeAreaMm2,
    targetShadowFraction:
      mode === 'instant' && target ? shadowCoverageOfPlot(regions, target.polygon) : day.targetShadowFraction,
  };
}

function padBounds(bounds, padding) {
  if (!bounds) return null;
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
}

/**
 * Just where the sun is, with no massing or shadow work.
 *
 * The 3D preview only needs to aim a light, and re-running the full study for
 * that would rebuild the massing and union every shadow polygon on every drag
 * of the time scrubber.
 *
 * @returns {{enabled: boolean, altitude: number, azimuth: number, northAngle: number}|null}
 */
export function computeSunVector({ project, sunStudy }) {
  const site = project?.building?.site;
  if (!sunStudy?.enabled || !siteSupportsSunStudy(site)) return null;

  const { latitude, longitude, timeZone } = site;
  const { year, month, day } = parseSunStudyDate(sunStudy.date);
  const instant = siteInstant({ year, month, day, minutes: sunStudy.minutes, timeZone });
  const position = solarPosition({ latitude, longitude, date: instant });

  return {
    enabled: true,
    altitude: position.trueAltitude,
    azimuth: position.azimuth,
    northAngle: site.northAngle || 0,
  };
}

/**
 * Direction the sun is coming from, as a unit vector in plan space. The 3D
 * preview and the compass both need this, and both would otherwise re-derive
 * the north-angle convention and risk getting it backwards.
 */
export function sunDirectionInPlan({ azimuth, northAngle = 0 }) {
  const bearing = (northAngle * Math.PI) / 180 + azimuth;
  return { x: Math.sin(bearing), y: -Math.cos(bearing) };
}
