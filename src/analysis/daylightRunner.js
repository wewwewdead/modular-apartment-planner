/**
 * Turns a project plus the editor's daylight settings into everything the
 * panel and the overlay need.
 *
 * Two entry points, one shared preparation step:
 *
 *   - `computeDaylightStudy` — BRE split-flux. Analytic, milliseconds, runs
 *     inside a `useMemo`. One average daylight factor per room.
 *   - `computeDaylightGrids` — the same rooms plus a Monte Carlo map each.
 *     Seconds, so it runs in a worker and is never called on the main thread by
 *     the panel.
 *
 * Both read the same apertures and the same obstruction horizons, which is what
 * makes their answers comparable. When the two disagree by more than the
 * sampling noise, that is a real fact about the room — usually a deep plan the
 * whole-room formula cannot see — and the panel shows both rather than picking
 * a winner.
 */

import { buildAnalysisMassing } from './buildingMassing';
import { buildDaylightRooms } from './roomDaylight';
import { buildObstructionHorizon, obstructionAngleDeg, skyAngleDeg } from './obstructionHorizon';
import { computeRoomDaylightGrid, fractionAbove } from './daylightGrid';
import {
  apertureEfficiency,
  averageDaylightFactorPercent,
  averageReflectance,
  daylightFactorToLux,
  daylightTargetFor,
  internallyReflectedComponentPercent,
  limitingDepthRatio,
  resolveGlazing,
  roomSurfaces,
  splitReflectances,
} from './daylightModel';
import { createDaylightState, reflectancesOf } from './daylightState';

const MM2_PER_M2 = 1e6;

function weightedMean(entries, valueOf, weightOf) {
  let weighted = 0;
  let weight = 0;
  for (const entry of entries) {
    const w = weightOf(entry);
    if (!(w > 0)) continue;
    weighted += valueOf(entry) * w;
    weight += w;
  }
  return weight > 0 ? weighted / weight : 0;
}

/**
 * Resolve glazing, build an obstruction horizon and read the sky angle for
 * every aperture on the floor.
 *
 * The horizon is the expensive part and the part both methods share, so it is
 * built once here and handed to the grid rather than rebuilt per sensor.
 */
function prepareApertures({ rooms, masses, settings }) {
  const horizons = new Map();

  for (const room of rooms) {
    for (const aperture of room.apertures) {
      const glazing = resolveGlazing({ glazing: aperture.glazing }, settings, aperture.presetKey);
      const efficiency = apertureEfficiency(glazing);

      const horizon = buildObstructionHorizon({
        origin: { x: aperture.centre.x, y: aperture.centre.y, z: aperture.centreElevation },
        outwardNormal: aperture.outwardNormal,
        masses,
      });
      horizons.set(aperture.id, horizon);

      // Efficiency multiplies the *structural opening* area, never the net
      // glazed area — the frame factor is already inside it, and applying it
      // twice would quietly halve every daylight factor in the project.
      aperture.glazingProperties = glazing;
      aperture.efficiency = efficiency;
      aperture.netGlazedAreaMm2 = aperture.openingAreaMm2 * glazing.frameFactor;
      aperture.skyAngleDeg = skyAngleDeg(horizon, aperture.outwardNormal);
      aperture.obstructionAngleDeg = obstructionAngleDeg(horizon, aperture.outwardNormal);
    }
  }

  return horizons;
}

/** Split-flux metrics for one prepared room. */
function summariseRoom(room, settings) {
  const reflectances = reflectancesOf(settings);
  const apertures = room.apertures;

  const openingAreaMm2 = apertures.reduce((total, aperture) => total + aperture.openingAreaMm2, 0);
  const netGlazedAreaMm2 = apertures.reduce((total, aperture) => total + aperture.netGlazedAreaMm2, 0);

  const surfaces = roomSurfaces({
    floorAreaMm2: room.areaMm2,
    perimeterMm: room.perimeterMm,
    heightMm: room.heightMm,
    glazingAreaMm2: openingAreaMm2,
  });
  const meanReflectance = averageReflectance(surfaces, reflectances);

  const target = daylightTargetFor(room.spaceType, settings.defaultTargetPercent);
  const base = {
    id: room.id,
    name: room.name,
    spaceType: room.spaceType,
    areaM2: room.areaMm2 / MM2_PER_M2,
    heightMm: room.heightMm,
    apertureCount: apertures.length,
    openingAreaM2: openingAreaMm2 / MM2_PER_M2,
    netGlazedAreaM2: netGlazedAreaMm2 / MM2_PER_M2,
    // The rule of thumb everyone carries in their head: glazing about a tenth
    // of the floor gives about 2% daylight factor.
    glazingToFloorRatio: room.areaMm2 > 0 ? netGlazedAreaMm2 / room.areaMm2 : 0,
    totalSurfaceAreaM2: surfaces.total,
    averageReflectance: meanReflectance,
    target,
    // The overlay draws from the study, not from the floor, so the study has to
    // carry the geometry with it. Without the polygon the room tint has nothing
    // to fill and average mode silently draws nothing at all.
    polygon: room.polygon,
    centroid: room.centroid,
  };

  if (!apertures.length || !(openingAreaMm2 > 0)) {
    return {
      ...base,
      skyAngleDeg: 0,
      obstructionAngleDeg: 90,
      averageDaylightFactor: 0,
      internallyReflected: 0,
      skyAndExternal: 0,
      illuminanceLux: 0,
      meetsTarget: target === null ? null : false,
      limitingDepthRatio: 0,
      hasDaylight: false,
    };
  }

  const areaOf = (aperture) => aperture.openingAreaMm2;
  const sky = weightedMean(apertures, (aperture) => aperture.skyAngleDeg, areaOf);
  const obstruction = weightedMean(apertures, (aperture) => aperture.obstructionAngleDeg, areaOf);
  const efficiency = weightedMean(apertures, (aperture) => aperture.efficiency, areaOf);
  const windowMidHeight = weightedMean(apertures, (aperture) => aperture.sillHeight + aperture.height / 2, areaOf);
  const headHeight = apertures.reduce((highest, aperture) => Math.max(highest, aperture.headHeight), 0);

  const openingAreaM2 = openingAreaMm2 / MM2_PER_M2;
  const split = splitReflectances({
    surfaces,
    windowMidHeightMm: windowMidHeight,
    heightMm: room.heightMm,
    reflectances,
  });

  const averageDaylightFactor = averageDaylightFactorPercent({
    glazingAreaM2: openingAreaM2,
    efficiency,
    skyAngleDeg: sky,
    totalSurfaceAreaM2: surfaces.total,
    averageReflectance: meanReflectance,
  });

  const internallyReflected = internallyReflectedComponentPercent({
    glazingAreaM2: openingAreaM2,
    efficiency,
    totalSurfaceAreaM2: surfaces.total,
    averageReflectance: meanReflectance,
    floorAndLowerWallsReflectance: split.floorAndLowerWalls,
    ceilingAndUpperWallsReflectance: split.ceilingAndUpperWalls,
    obstructionAngleDeg: obstruction,
  });

  return {
    ...base,
    skyAngleDeg: sky,
    obstructionAngleDeg: obstruction,
    averageDaylightFactor,
    internallyReflected,
    // What is left once interreflection is taken out: the light arriving
    // straight from the sky and off the obstruction opposite.
    skyAndExternal: Math.max(0, averageDaylightFactor - internallyReflected),
    illuminanceLux: daylightFactorToLux(averageDaylightFactor, settings.designSkyLux),
    meetsTarget: target === null ? null : averageDaylightFactor >= target,
    limitingDepthRatio: limitingDepthRatio({
      depthMm: room.extents?.depth || 0,
      widthMm: room.extents?.width || 0,
      windowHeadHeightMm: headHeight,
      backReflectance: settings.wallReflectance,
    }),
    hasDaylight: true,
  };
}

/**
 * Prepare rooms, masses and horizons. Shared by both methods and by the worker.
 * @returns {object|null} Null when there is nothing on the floor to study.
 */
export function prepareDaylightStudy({ project, daylight, floorId = null }) {
  const settings = { ...createDaylightState(), ...(daylight || {}) };
  if (!settings.enabled) return null;

  const model = buildDaylightRooms(project, {
    floorId,
    includeGlazedDoors: settings.includeGlazedDoors,
  });
  if (!model.rooms.length) return null;

  // Every storey shades a window, not just the one being edited — a balcony
  // two floors up is the most common cause of a dark room.
  const masses = buildAnalysisMassing(project);
  const horizons = prepareApertures({ rooms: model.rooms, masses, settings });

  return { settings, model, masses, horizons };
}

/**
 * Run the split-flux study.
 *
 * @param {object} options
 * @param {object} options.project   Pass the phase-filtered project, so hidden
 *   phases stop obstructing windows exactly as they stop drawing.
 * @param {object} options.daylight  Editor state from `createDaylightState`.
 * @param {string} [options.floorId]
 * @returns {object|null} Null when the study is off or the floor has no rooms.
 */
export function computeDaylightStudy({ project, daylight, floorId = null }) {
  const prepared = prepareDaylightStudy({ project, daylight, floorId });
  if (!prepared) return null;

  const rooms = prepared.model.rooms.map((room) => summariseRoom(room, prepared.settings));

  return {
    mode: prepared.settings.mode,
    designSkyLux: prepared.settings.designSkyLux,
    rooms,
    summary: summarise(rooms),
    skippedInternalOpenings: prepared.model.skippedInternal,
    hasGrids: false,
  };
}

/**
 * Run the split-flux study and add a Monte Carlo map to every room that has a
 * window. Seconds of work — call this from the worker, not from a render.
 *
 * @param {object} options  As `computeDaylightStudy`.
 * @param {(progress: {done: number, total: number, roomName: string}) => void} [onProgress]
 */
export function computeDaylightGrids({ project, daylight, floorId = null }, onProgress = null) {
  const prepared = prepareDaylightStudy({ project, daylight, floorId });
  if (!prepared) return null;

  const { settings, model, horizons } = prepared;
  const lit = model.rooms.filter((room) => room.apertures.length > 0);
  const rooms = [];
  let done = 0;

  for (const room of model.rooms) {
    const summary = summariseRoom(room, settings);

    if (!room.apertures.length) {
      rooms.push(summary);
      continue;
    }

    const grid = computeRoomDaylightGrid({
      room,
      apertures: room.apertures,
      horizons,
      // The sky component is sampled; interreflection is not, so it comes from
      // the same BRE formula the split-flux number uses. That is the split-flux
      // decomposition proper, and it is why the two methods stay comparable.
      internallyReflectedPercent: summary.internallyReflected,
      settings,
    });

    done += 1;
    if (onProgress) onProgress({ done, total: lit.length, roomName: room.name });

    if (!grid) {
      rooms.push(summary);
      continue;
    }

    rooms.push({
      ...summary,
      grid: {
        values: grid.values,
        mask: grid.mask,
        columns: grid.columns,
        rows: grid.rows,
        cellSize: grid.cellSize,
        origin: grid.origin,
        sensorCount: grid.sensorCount,
        rayCount: grid.rayCount,
        mean: grid.mean,
        min: grid.min,
        max: grid.max,
        uniformity: grid.uniformity,
        fractionAboveTarget: summary.target === null ? null : fractionAbove(grid, summary.target),
        // Half the target is the conventional "gloomy" line: below it a space
        // reads as needing the lights on even at midday.
        fractionAboveHalfTarget: summary.target === null ? null : fractionAbove(grid, summary.target / 2),
      },
    });
  }

  return {
    mode: 'grid',
    designSkyLux: settings.designSkyLux,
    rooms,
    summary: summarise(rooms),
    skippedInternalOpenings: model.skippedInternal,
    hasGrids: true,
  };
}

/** Floor-level totals, area-weighted where a mean would otherwise mislead. */
export function summarise(rooms = []) {
  const judged = rooms.filter((room) => room.target !== null);
  const lit = rooms.filter((room) => room.hasDaylight);
  const totalArea = rooms.reduce((total, room) => total + room.areaM2, 0);

  return {
    roomCount: rooms.length,
    litRoomCount: lit.length,
    darkRoomCount: rooms.length - lit.length,
    judgedRoomCount: judged.length,
    meetingTargetCount: judged.filter((room) => room.meetsTarget).length,
    // Weighted by floor area: a bright cupboard should not pull the average up.
    areaWeightedDaylightFactor:
      totalArea > 0
        ? rooms.reduce((total, room) => total + room.averageDaylightFactor * room.areaM2, 0) / totalArea
        : 0,
    totalAreaM2: totalArea,
    totalGlazedAreaM2: rooms.reduce((total, room) => total + room.netGlazedAreaM2, 0),
  };
}
