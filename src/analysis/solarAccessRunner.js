/**
 * Solar access and clear-sky irradiation on the building's own surfaces.
 *
 * The pipeline, and why each stage exists:
 *
 *   massing → triangle mesh → BVH → sensors → sun samples → rays → totals
 *
 * The BVH is built before the sensors because roof candidates need it: a mass
 * top with a slab sitting on it is an intermediate floor, and the cheapest way
 * to know is to fire a short ray upward.
 *
 * Two results come out, and they are not equally trustworthy:
 *
 *   - **Sun hours** are pure geometry. They need no weather model, no
 *     irradiance model and no assumptions beyond the massing itself, and are
 *     exactly as good as the model you drew.
 *   - **Irradiation in kWh/m²** is theoretical clear sky. Real skies have
 *     clouds. See the note at the top of `clearSkyIrradiance.js`; the number is
 *     for comparing options, not for sizing an array.
 *
 * Two things keep this fast enough to be worth having. Sun positions below the
 * horizon are never sampled, and a sensor whose normal faces away from the sun
 * skips the ray entirely — for a facade that is most of the day, every day, and
 * it costs one dot product to find out.
 */

import { sampleDaySunPositions, siteInstant } from './solarPosition';
import { buildAnalysisMassing } from './buildingMassing';
import { sunDirectionInPlan } from './sunStudyRunner';
import { parseSunStudyDate, siteSupportsSunStudy } from './sunStudyState';
import { buildMassingMesh } from './massingMesh';
import { buildBvh, bvhIntersectsRay } from './rayBvh';
import { buildSolarSensors, compassLabel, normalBearingDeg } from './solarSensors';
import { hemisphereDirections } from './daylightGrid';
import {
  clearSkyIrradiance,
  dayOfYear,
  daysInMonth,
  extraterrestrialNormal,
  planeOfArrayIrradiance,
} from './clearSkyIrradiance';
import { createSolarAccessState } from './solarAccessState';

/** Sensors processed between progress reports. */
const PROGRESS_CHUNK = 250;

/** Sun this low contributes nothing a study can act on. */
const MIN_ALTITUDE_DEG = 1;

/**
 * A surface that can see none of the sky is an interior one.
 *
 * The merged massing ring has holes, and those holes are two different things
 * wearing the same shape: an open courtyard, whose walls are genuine facades,
 * and a roofed room, whose walls are not. Nothing in the geometry distinguishes
 * them — but the sky does. Anything that measures zero sky view is inside the
 * building, and counting it would drag every orientation average towards zero
 * with surfaces nobody will ever stand outside of.
 *
 * Set just above zero rather than at it, so a deep light well with a sliver of
 * sky survives while a sealed room does not.
 */
const ENCLOSED_SKY_VIEW = 0.002;

/** Eight-point compass for the orientation rollup; sixteen is noise in a table. */
const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function orientationOf(bearingDeg) {
  return ORIENTATIONS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8];
}

/**
 * Sun positions to evaluate, each with the hours it stands for.
 *
 * An annual study takes the fifteenth of each month and weights it by that
 * month's length. Twelve days is enough because the sun's declination moves
 * smoothly; sampling all 365 would cost thirty times as much to shift the
 * answer by under a percent.
 */
export function buildSunSamples({ latitude, longitude, timeZone, period, date, stepMinutes }) {
  const weightHours = stepMinutes / 60;
  const samples = [];

  const collect = (year, month, day, dayWeight) => {
    const noon = siteInstant({ year, month, day, minutes: 720, timeZone });
    const positions = sampleDaySunPositions({
      latitude,
      longitude,
      date: noon,
      stepMinutes,
      timeZone,
      minAltitudeDeg: MIN_ALTITUDE_DEG,
    });

    const ordinal = dayOfYear(month, day);
    for (const position of positions) {
      samples.push({
        altitude: position.altitude,
        azimuth: position.azimuth,
        dayOfYear: ordinal,
        month,
        weightHours: weightHours * dayWeight,
      });
    }
  };

  const { year, month, day } = parseSunStudyDate(date);
  if (period === 'day') {
    collect(year, month, day, 1);
  } else {
    for (let index = 1; index <= 12; index += 1) collect(year, index, 15, daysInMonth(index));
  }

  return samples;
}

/** Orthonormal frame around a normal, for orienting the sky-view samples. */
function basisFrom(nx, ny, nz, frame) {
  // Any vector not parallel to the normal will do; picking the axis the normal
  // leans on least keeps the cross product well conditioned.
  const ax = Math.abs(nx) < 0.9 ? 1 : 0;
  const ay = Math.abs(nx) < 0.9 ? 0 : 1;

  let ux = ay * nz - 0 * ny;
  let uy = 0 * nx - ax * nz;
  let uz = ax * ny - ay * nx;
  const length = Math.hypot(ux, uy, uz) || 1;
  ux /= length;
  uy /= length;
  uz /= length;

  frame[0] = ux;
  frame[1] = uy;
  frame[2] = uz;
  frame[3] = ny * uz - nz * uy;
  frame[4] = nz * ux - nx * uz;
  frame[5] = nx * uy - ny * ux;
}

/**
 * Fraction of the sky dome a sensor can see, cosine-weighted about its normal.
 *
 * This is what the isotropic diffuse term scales with. An unobstructed flat
 * roof comes out at 1, an unobstructed wall at 0.5, and a light well at
 * whatever its geometry allows — which is the number no analytic tilt formula
 * can supply.
 */
function skyViewFactor({ bvh, x, y, z, nx, ny, nz, directions, rayCount, frame }) {
  basisFrom(nx, ny, nz, frame);
  let open = 0;

  for (let index = 0; index < rayCount; index += 1) {
    const dx = directions[index * 3];
    const dy = directions[index * 3 + 1];
    const dz = directions[index * 3 + 2];

    const wx = frame[0] * dx + frame[3] * dy + nx * dz;
    const wy = frame[1] * dx + frame[4] * dy + ny * dz;
    const wz = frame[2] * dx + frame[5] * dy + nz * dz;

    // Below the horizontal is ground, not sky. No terrain is modelled, so this
    // test is what stops a facade counting the earth beneath it as sky and
    // reporting roughly twice the diffuse it gets.
    if (wz <= 0) continue;
    if (!bvhIntersectsRay(bvh, x, y, z, wx, wy, wz)) open += 1;
  }

  return open / rayCount;
}

/**
 * Run the study.
 *
 * @param {object} options
 * @param {object} options.project      Use the phase-filtered project.
 * @param {object} options.solarAccess  Editor state from `createSolarAccessState`.
 * @param {Function} [onProgress]
 * @returns {object|null} Null when the study is off or the site has no location.
 */
export function computeSolarAccess({ project, solarAccess }, onProgress = null) {
  const settings = { ...createSolarAccessState(), ...(solarAccess || {}) };
  const site = project?.building?.site;
  if (!settings.enabled || !siteSupportsSunStudy(site)) return null;

  const masses = buildAnalysisMassing(project);
  if (!masses.length) return null;

  const mesh = buildMassingMesh(masses);
  const bvh = buildBvh(mesh.positions, mesh.triangleCount);

  const northAngle = site.northAngle || 0;
  const sensors = buildSolarSensors({
    masses,
    bvh,
    spacing: settings.sensorSpacing,
    northAngle,
    includeFacades: settings.includeFacades,
    includeRoofs: settings.includeRoofs,
  });
  if (!sensors.count) return null;

  const samples = buildSunSamples({
    latitude: site.latitude,
    longitude: site.longitude,
    timeZone: site.timeZone,
    period: settings.period,
    date: settings.date,
    stepMinutes: settings.stepMinutes,
  });

  // Everything about a sun position that does not depend on the sensor, hoisted
  // out of the inner loop: it is evaluated once per sample instead of once per
  // sensor per sample.
  const sunVectors = new Float32Array(samples.length * 3);
  const sky = samples.map((sample, index) => {
    const plan = sunDirectionInPlan({ azimuth: sample.azimuth, northAngle });
    const horizontal = Math.cos(sample.altitude);
    sunVectors[index * 3] = plan.x * horizontal;
    sunVectors[index * 3 + 1] = plan.y * horizontal;
    sunVectors[index * 3 + 2] = Math.sin(sample.altitude);

    return {
      ...clearSkyIrradiance({ altitude: sample.altitude, dayOfYear: sample.dayOfYear }),
      extraterrestrial: extraterrestrialNormal(sample.dayOfYear),
      weightHours: sample.weightHours,
    };
  });

  const totalDaylightHours = samples.reduce((total, sample) => total + sample.weightHours, 0);

  const rayCount = Math.max(8, settings.skyViewRays);
  const directions = hemisphereDirections(rayCount);
  const frame = new Float64Array(6);

  /*
   * Sky view first, for every candidate, and then throw the interior ones away
   * before any sun rays are fired.
   *
   * Two reasons to do it in this order rather than filtering afterwards. The
   * enclosed sensors are exactly the ones that would need a ray at every sun
   * position and return nothing, so dropping them early is also the cheapest
   * thing to do; and the results arrive already free of surfaces that would
   * otherwise have to be explained away in every summary.
   */
  const candidateView = new Float32Array(sensors.count);
  for (let sensor = 0; sensor < sensors.count; sensor += 1) {
    /*
     * Re-generate the directions per sensor with a golden-ratio offset.
     *
     * One shared low-discrepancy set is deterministic, which is good, but it is
     * also the *same* set every time — so its particular over- and
     * under-sampling of the dome becomes a systematic bias rather than noise
     * that averages out across a facade. Shifting and wrapping both coordinates
     * per sensor keeps the run reproducible while letting neighbouring sensors
     * disagree in the way that makes their mean converge.
     */
    hemisphereDirections(rayCount, (sensor * 0.7548776662466927) % 1, (sensor * 0.5698402909980532) % 1, directions);

    candidateView[sensor] = skyViewFactor({
      bvh,
      x: sensors.positions[sensor * 3],
      y: sensors.positions[sensor * 3 + 1],
      z: sensors.positions[sensor * 3 + 2],
      nx: sensors.normals[sensor * 3],
      ny: sensors.normals[sensor * 3 + 1],
      nz: sensors.normals[sensor * 3 + 2],
      directions,
      rayCount,
      frame,
    });
  }

  const exterior = compactSensors(sensors, candidateView, (view) => view > ENCLOSED_SKY_VIEW);
  if (!exterior.count) return null;

  const sunHours = new Float32Array(exterior.count);
  const irradiation = new Float32Array(exterior.count);
  const skyView = exterior.skyView;

  for (let sensor = 0; sensor < exterior.count; sensor += 1) {
    const x = exterior.positions[sensor * 3];
    const y = exterior.positions[sensor * 3 + 1];
    const z = exterior.positions[sensor * 3 + 2];
    const nx = exterior.normals[sensor * 3];
    const ny = exterior.normals[sensor * 3 + 1];
    const nz = exterior.normals[sensor * 3 + 2];
    const view = skyView[sensor];

    let hours = 0;
    let energy = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const cosIncidence = nx * sunVectors[index * 3] + ny * sunVectors[index * 3 + 1] + nz * sunVectors[index * 3 + 2];
      const conditions = sky[index];

      // The sun is behind this surface. No ray needed, and for a facade this is
      // true for most of the day — the single biggest saving in the study.
      const sunlit =
        cosIncidence > 0 &&
        !bvhIntersectsRay(bvh, x, y, z, sunVectors[index * 3], sunVectors[index * 3 + 1], sunVectors[index * 3 + 2]);

      if (sunlit) hours += conditions.weightHours;

      const poa = planeOfArrayIrradiance({
        dni: conditions.dni,
        dhi: conditions.dhi,
        ghi: conditions.ghi,
        cosIncidence,
        cosZenith: conditions.cosZenith,
        extraterrestrial: conditions.extraterrestrial,
        skyViewFactor: view,
        tiltCosine: nz,
        sunlit,
        groundReflectance: settings.groundReflectance,
      });

      // W/m² for `weightHours` hours, in kilowatt-hours.
      energy += (poa.total * conditions.weightHours) / 1000;
    }

    sunHours[sensor] = hours;
    irradiation[sensor] = energy;

    if (onProgress && sensor % PROGRESS_CHUNK === 0) {
      onProgress({ done: sensor, total: exterior.count });
    }
  }

  return {
    period: settings.period,
    metric: settings.metric,
    date: settings.date,
    sensors: {
      positions: exterior.positions,
      normals: exterior.normals,
      areas: exterior.areas,
      surfaceIds: exterior.surfaceIds,
      heights: exterior.heights,
      sunHours,
      irradiation,
      skyView,
      count: exterior.count,
      spacing: sensors.spacing,
    },
    surfaces: summariseSurfaces({ sensors: exterior, sunHours, irradiation, skyView, settings }),
    orientations: summariseOrientations({ sensors: exterior, sunHours, irradiation, northAngle }),
    totals: summariseTotals({ sensors: exterior, sunHours, irradiation, settings }),
    meta: {
      sunSampleCount: samples.length,
      totalDaylightHours,
      triangleCount: mesh.triangleCount,
      sensorCount: exterior.count,
      candidateCount: sensors.count,
      enclosedCount: sensors.count - exterior.count,
      sensorSpacing: sensors.spacing,
      northAngle,
      thresholdHours: settings.thresholdHours,
    },
  };
}

/** Keep the sensors passing a test, preserving surface metadata. */
function compactSensors(sensors, skyView, keep) {
  const kept = [];
  for (let index = 0; index < sensors.count; index += 1) {
    if (keep(skyView[index])) kept.push(index);
  }

  const count = kept.length;
  const compacted = {
    positions: new Float32Array(count * 3),
    normals: new Float32Array(count * 3),
    areas: new Float32Array(count),
    surfaceIds: new Int32Array(count),
    heights: new Float32Array(count),
    skyView: new Float32Array(count),
    count,
    surfaces: sensors.surfaces,
  };

  kept.forEach((source, target) => {
    for (let axis = 0; axis < 3; axis += 1) {
      compacted.positions[target * 3 + axis] = sensors.positions[source * 3 + axis];
      compacted.normals[target * 3 + axis] = sensors.normals[source * 3 + axis];
    }
    compacted.areas[target] = sensors.areas[source];
    compacted.surfaceIds[target] = sensors.surfaceIds[source];
    compacted.heights[target] = sensors.heights[source];
    compacted.skyView[target] = skyView[source];
  });

  return compacted;
}

function areaWeighted(indices, areas, values) {
  let weighted = 0;
  let area = 0;
  for (const index of indices) {
    weighted += values[index] * areas[index];
    area += areas[index];
  }
  return area > 0 ? weighted / area : 0;
}

function summariseSurfaces({ sensors, sunHours, irradiation, skyView, settings }) {
  const grouped = new Map();
  for (let index = 0; index < sensors.count; index += 1) {
    const id = sensors.surfaceIds[index];
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(index);
  }

  return sensors.surfaces
    .map((surface) => {
      const indices = grouped.get(surface.id) || [];
      if (!indices.length) return null;

      const areaMm2 = indices.reduce((total, index) => total + sensors.areas[index], 0);
      const compliantMm2 = indices
        .filter((index) => sunHours[index] >= settings.thresholdHours)
        .reduce((total, index) => total + sensors.areas[index], 0);

      return {
        id: surface.id,
        kind: surface.kind,
        label: surface.label,
        massId: surface.massId,
        // Every sensor on a surface shares its plane, so the bearing is a
        // property of the surface rather than something to average.
        bearingDeg: surface.bearingDeg,
        compass: surface.compass,
        start: surface.start || null,
        end: surface.end || null,
        base: surface.base,
        sensorCount: indices.length,
        areaM2: areaMm2 / 1e6,
        meanSunHours: areaWeighted(indices, sensors.areas, sunHours),
        meanIrradiation: areaWeighted(indices, sensors.areas, irradiation),
        meanSkyView: areaWeighted(indices, sensors.areas, skyView),
        maxIrradiation: indices.reduce((best, index) => Math.max(best, irradiation[index]), 0),
        minSunHours: indices.reduce((worst, index) => Math.min(worst, sunHours[index]), Infinity),
        compliantAreaFraction: areaMm2 > 0 ? compliantMm2 / areaMm2 : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.meanIrradiation - a.meanIrradiation);
}

/**
 * Roll facades up by compass direction.
 *
 * This is the table an architect actually reads: south gets this much, north
 * gets that much, and here is what the tower opposite took off the east.
 */
function summariseOrientations({ sensors, sunHours, irradiation, northAngle }) {
  const grouped = new Map();

  for (let index = 0; index < sensors.count; index += 1) {
    if (sensors.normals[index * 3 + 2] > 0.5) continue; // roofs

    const bearing = normalBearingDeg(sensors.normals[index * 3], sensors.normals[index * 3 + 1], northAngle);
    const key = orientationOf(bearing);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(index);
  }

  return ORIENTATIONS.filter((key) => grouped.has(key)).map((key) => {
    const indices = grouped.get(key);
    return {
      orientation: key,
      label: compassLabel(ORIENTATIONS.indexOf(key) * 45),
      sensorCount: indices.length,
      areaM2: indices.reduce((total, index) => total + sensors.areas[index], 0) / 1e6,
      meanSunHours: areaWeighted(indices, sensors.areas, sunHours),
      meanIrradiation: areaWeighted(indices, sensors.areas, irradiation),
    };
  });
}

function summariseTotals({ sensors, sunHours, irradiation, settings }) {
  const all = Array.from({ length: sensors.count }, (_, index) => index);
  const facades = all.filter((index) => sensors.normals[index * 3 + 2] <= 0.5);
  const roofs = all.filter((index) => sensors.normals[index * 3 + 2] > 0.5);

  const areaOf = (indices) => indices.reduce((total, index) => total + sensors.areas[index], 0) / 1e6;
  const compliant = all.filter((index) => sunHours[index] >= settings.thresholdHours);

  return {
    facadeAreaM2: areaOf(facades),
    roofAreaM2: areaOf(roofs),
    meanSunHours: areaWeighted(all, sensors.areas, sunHours),
    meanIrradiation: areaWeighted(all, sensors.areas, irradiation),
    roofMeanIrradiation: roofs.length ? areaWeighted(roofs, sensors.areas, irradiation) : 0,
    facadeMeanIrradiation: facades.length ? areaWeighted(facades, sensors.areas, irradiation) : 0,
    bestIrradiation: all.reduce((best, index) => Math.max(best, irradiation[index]), 0),
    compliantAreaFraction: areaOf(all) > 0 ? areaOf(compliant) / areaOf(all) : 0,
    // Roof area times its mean is the headline for a PV feasibility question,
    // and the only place the clear-sky caveat really bites.
    roofPotentialMWh: (areaOf(roofs) * (roofs.length ? areaWeighted(roofs, sensors.areas, irradiation) : 0)) / 1000,
  };
}

export const SOLAR_ACCESS_CONSTANTS = { MIN_ALTITUDE_DEG, ORIENTATIONS, PROGRESS_CHUNK };
