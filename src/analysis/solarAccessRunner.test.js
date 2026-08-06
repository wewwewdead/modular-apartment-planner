import { describe, expect, it } from 'vitest';
import { createProject, createSlab, createWall } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import { createSolarAccessState } from './solarAccessState';
import { buildSunSamples, computeSolarAccess } from './solarAccessRunner';

const MANILA = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila' };
const LONDON = { latitude: 51.5074, longitude: -0.1278, timeZone: 'Europe/London' };

/**
 * A square building of the given plan size and height, at a located site.
 *
 * The roof slab is not decoration. Four walls and nothing on top is a building
 * with no roof, and the study correctly reports no roof surface for it — the
 * only thing at the top of a bare wall is a 300 mm strip of blockwork. Every
 * roof assertion below needs something to actually stand on.
 */
function building({ size = 12000, height = 9000, location = MANILA, extraFloors = [] } = {}) {
  const corners = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  const walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 300, { height }),
  );

  const base = createProject('Solar');
  const located = executeBuildingCommand(base, { type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION, ...location });
  expect(located.ok).toBe(true);

  const project = located.project;
  const floor = project.floors[0];
  const roof = createSlab(floor.id, corners, 200, height);

  return {
    ...project,
    floors: [{ ...floor, walls, slabs: [roof], elevation: 0, floorToFloorHeight: height }, ...extraFloors],
  };
}

/** A separate tall block, offset in plan, on its own floor entry. */
function neighbour(project, { x, y, size = 20000, height = 40000 }) {
  const corners = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
  const walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 300, { height }),
  );
  return {
    ...project,
    floors: [...project.floors, { ...project.floors[0], id: 'floor_neighbour', walls, elevation: 0, rooms: [] }],
  };
}

const ON = createSolarAccessState({ enabled: true, sensorSpacing: 3000, skyViewRays: 32 });

describe('sun sampling', () => {
  it('covers a whole year of daylight from twelve representative days', () => {
    // Every place on Earth gets very close to half of 8760 hours of daylight a
    // year. If the month weighting were wrong this would be off by a factor,
    // and every kWh figure with it.
    const samples = buildSunSamples({ ...MANILA, period: 'annual', date: '2026-06-21', stepMinutes: 30 });
    const hours = samples.reduce((total, sample) => total + sample.weightHours, 0);
    expect(hours).toBeGreaterThan(4100);
    expect(hours).toBeLessThan(4700);
  });

  it('gets the same annual total at a high latitude', () => {
    // Long summer days and short winter ones cancel. A study that reported
    // London as sunnier or gloomier in total hours would be wrong about the
    // Earth, not about London.
    const samples = buildSunSamples({ ...LONDON, period: 'annual', date: '2026-06-21', stepMinutes: 30 });
    const hours = samples.reduce((total, sample) => total + sample.weightHours, 0);
    expect(hours).toBeGreaterThan(4100);
    expect(hours).toBeLessThan(4700);
  });

  it('samples one day when asked for one day', () => {
    const samples = buildSunSamples({ ...MANILA, period: 'day', date: '2026-06-21', stepMinutes: 60 });
    const hours = samples.reduce((total, sample) => total + sample.weightHours, 0);
    // Manila in June: about 12.5 hours of daylight.
    expect(hours).toBeGreaterThan(11);
    expect(hours).toBeLessThan(14);
    expect(new Set(samples.map((sample) => sample.month))).toEqual(new Set([6]));
  });

  it('never samples the sun below the horizon', () => {
    const samples = buildSunSamples({ ...LONDON, period: 'annual', date: '2026-06-21', stepMinutes: 60 });
    expect(samples.every((sample) => sample.altitude > 0)).toBe(true);
  });
});

describe('running the study', () => {
  it('is off unless it is switched on', () => {
    expect(computeSolarAccess({ project: building(), solarAccess: createSolarAccessState() })).toBeNull();
  });

  it('needs a site location', () => {
    const project = createProject('Nowhere');
    expect(computeSolarAccess({ project, solarAccess: ON })).toBeNull();
  });

  it('produces sensors on both the facades and the roof', () => {
    const study = computeSolarAccess({ project: building(), solarAccess: ON });

    expect(study.sensors.count).toBeGreaterThan(50);
    expect(study.totals.facadeAreaM2).toBeGreaterThan(0);
    expect(study.totals.roofAreaM2).toBeGreaterThan(0);
    // A 12 m square building: 144 m² of roof, give or take the sampling.
    expect(study.totals.roofAreaM2).toBeGreaterThan(100);
    expect(study.totals.roofAreaM2).toBeLessThan(190);
  });

  it('gives an unobstructed roof close to the full year of daylight hours', () => {
    // The strongest check in the file. A flat roof with nothing above it is in
    // the sun whenever the sun is up, so its annual sun hours must land on the
    // ~4380 h that daylight itself totals. Anything less means the building is
    // shading its own roof; anything more means hours are being double-counted.
    const study = computeSolarAccess({ project: building(), solarAccess: ON });
    const roof = study.surfaces.find((surface) => surface.kind === 'roof');

    expect(roof.meanSunHours).toBeGreaterThan(4000);
    expect(roof.meanSunHours).toBeLessThan(4600);
    expect(roof.meanSkyView).toBeGreaterThan(0.97);
  });

  it('gives an unobstructed facade exactly half the sky', () => {
    /*
     * A vertical plane sees half the dome and no more, so 0.5 is both the
     * expected value and a hard ceiling — exceeding it would mean the
     * hemisphere is being sampled about the wrong axis.
     *
     * Weighted by area, not per surface. A merged wall ring carries a handful
     * of square-metre slivers where the walls overlap at the corners, and those
     * genuinely sit in a re-entrant corner and see well under half the sky.
     * Averaging them alongside a 540 m² elevation as equals says more about the
     * arithmetic than about the building.
     */
    const study = computeSolarAccess({ project: building({ size: 30000 }), solarAccess: ON });
    const facades = study.surfaces.filter((surface) => surface.kind === 'facade');
    expect(facades.length).toBeGreaterThan(0);

    const area = facades.reduce((total, facade) => total + facade.areaM2, 0);
    const weightedView = facades.reduce((total, facade) => total + facade.meanSkyView * facade.areaM2, 0) / area;
    expect(weightedView).toBeCloseTo(0.5, 2);

    for (const facade of facades) expect(facade.meanSkyView).toBeLessThanOrEqual(0.5);
    // And no surface can be in the sun longer than the sun is up.
    expect(study.totals.meanSunHours).toBeLessThan(4380);
  });

  it('puts the roof well ahead of any facade for annual energy', () => {
    // True at every latitude outside the far north, and the reason roofs carry
    // the photovoltaics.
    const study = computeSolarAccess({ project: building(), solarAccess: ON });
    expect(study.totals.roofMeanIrradiation).toBeGreaterThan(study.totals.facadeMeanIrradiation);
  });

  it('lands in a believable clear-sky range for the tropics', () => {
    // Manila's measured annual GHI is around 1800 kWh/m². Clear sky has no
    // clouds, so it must come out higher — but not by more than about half.
    const study = computeSolarAccess({ project: building({ location: MANILA }), solarAccess: ON });
    const roof = study.surfaces.find((surface) => surface.kind === 'roof');

    expect(roof.meanIrradiation).toBeGreaterThan(1900);
    expect(roof.meanIrradiation).toBeLessThan(3000);
  });

  it('gives a cloudier, higher latitude less than the tropics', () => {
    const manila = computeSolarAccess({ project: building({ location: MANILA }), solarAccess: ON });
    const london = computeSolarAccess({ project: building({ location: LONDON }), solarAccess: ON });

    const roofOf = (study) => study.surfaces.find((surface) => surface.kind === 'roof').meanIrradiation;
    expect(roofOf(london)).toBeLessThan(roofOf(manila));
  });
});

describe('orientation', () => {
  const study = computeSolarAccess({ project: building({ location: MANILA }), solarAccess: ON });

  it('breaks the facades down by compass direction', () => {
    const keys = study.orientations.map((entry) => entry.orientation);
    expect(keys).toEqual(expect.arrayContaining(['N', 'E', 'S', 'W']));
    expect(study.orientations.every((entry) => entry.areaM2 > 0)).toBe(true);
  });

  it('favours the south over the north in the northern hemisphere', () => {
    // Manila is at 14.6°N, so the sun is south of overhead for most of the
    // year. A study that had the north angle or the y-axis sign backwards would
    // get this exactly the wrong way round, and would look just as plausible.
    const south = study.orientations.find((entry) => entry.orientation === 'S');
    const north = study.orientations.find((entry) => entry.orientation === 'N');
    expect(south.meanIrradiation).toBeGreaterThan(north.meanIrradiation);
    expect(south.meanSunHours).toBeGreaterThan(north.meanSunHours);
  });

  it('flips that round in the southern hemisphere', () => {
    // The same building in Sydney. If south still won, the result would be
    // following the drawing rather than the sun.
    const sydney = computeSolarAccess({
      project: building({ location: { latitude: -33.87, longitude: 151.21, timeZone: 'Australia/Sydney' } }),
      solarAccess: ON,
    });
    const south = sydney.orientations.find((entry) => entry.orientation === 'S');
    const north = sydney.orientations.find((entry) => entry.orientation === 'N');
    expect(north.meanIrradiation).toBeGreaterThan(south.meanIrradiation);
  });

  it('treats east and west almost alike', () => {
    // Morning and afternoon are symmetric about solar noon, so a square
    // building's east and west elevations should agree closely.
    const east = study.orientations.find((entry) => entry.orientation === 'E');
    const west = study.orientations.find((entry) => entry.orientation === 'W');
    expect(east.meanIrradiation / west.meanIrradiation).toBeGreaterThan(0.9);
    expect(east.meanIrradiation / west.meanIrradiation).toBeLessThan(1.1);
  });
});

describe('obstruction', () => {
  /*
   * Everything in the project is part of the building being studied — there is
   * no separate notion of "context" — so the neighbour block gets sensors too,
   * and its own sunny south elevation would otherwise lift the S orientation
   * average above the unobstructed case. These helpers look only at the
   * original building's masses.
   */
  const ownSurfaces = (study, predicate) =>
    study.surfaces.filter((surface) => !surface.massId.includes('floor_neighbour') && predicate(surface));

  const meanOf = (surfaces, field) => {
    const area = surfaces.reduce((total, surface) => total + surface.areaM2, 0);
    return area > 0 ? surfaces.reduce((total, s) => total + s[field] * s.areaM2, 0) / area : 0;
  };

  // Plan y increases downward and north is −y, so a block that shades the south
  // elevation of a building spanning y 0-12000 sits at positive y.
  const SOUTH_OF_SITE = { x: -4000, y: 18000 };

  const clear = computeSolarAccess({ project: building({ location: MANILA }), solarAccess: ON });
  const shaded = computeSolarAccess({
    project: neighbour(building({ location: MANILA }), SOUTH_OF_SITE),
    solarAccess: ON,
  });

  const southFacades = (study) => ownSurfaces(study, (surface) => surface.compass === 'S');

  it('darkens the facade a tower is built in front of', () => {
    expect(meanOf(southFacades(shaded), 'meanSunHours')).toBeLessThan(meanOf(southFacades(clear), 'meanSunHours'));
    expect(meanOf(southFacades(shaded), 'meanIrradiation')).toBeLessThan(
      meanOf(southFacades(clear), 'meanIrradiation'),
    );
  });

  it('reports a lower sky view for an overshadowed facade', () => {
    expect(meanOf(southFacades(shaded), 'meanSkyView')).toBeLessThan(meanOf(southFacades(clear), 'meanSkyView'));
  });

  it('leaves the north elevation of the same building alone', () => {
    // The block is only to the south. A study that darkened every elevation
    // would be shading by proximity rather than by geometry.
    const northOf = (study) =>
      meanOf(
        ownSurfaces(study, (surface) => surface.compass === 'N'),
        'meanSunHours',
      );
    expect(northOf(shaded)).toBeCloseTo(northOf(clear), 1);
  });

  it('leaves the roof alone when the tower is far enough away', () => {
    const roof = ownSurfaces(shaded, (surface) => surface.kind === 'roof')[0];
    // Still the best surface on the building, whatever went up next door.
    expect(roof.meanSunHours).toBeGreaterThan(3000);
  });
});

describe('interior surfaces', () => {
  it('drops the inside faces of the walls', () => {
    // The merged massing ring has the rooms as holes, so the inward-facing
    // sensors are interior wall surfaces. Left in, they would report zero hours
    // and pull every orientation average down with them.
    const study = computeSolarAccess({ project: building(), solarAccess: ON });

    expect(study.meta.enclosedCount).toBeGreaterThan(0);
    expect(study.meta.sensorCount).toBeLessThan(study.meta.candidateCount);
    for (let index = 0; index < study.sensors.count; index += 1) {
      expect(study.sensors.skyView[index]).toBeGreaterThan(0);
    }
  });
});

describe('reporting', () => {
  const study = computeSolarAccess({ project: building(), solarAccess: ON });

  it('carries the geometry the overlay needs', () => {
    const facade = study.surfaces.find((surface) => surface.kind === 'facade');
    expect(facade.start).toBeTruthy();
    expect(facade.end).toBeTruthy();
    expect(facade.compass).toBeTruthy();
    expect(study.sensors.positions).toHaveLength(study.sensors.count * 3);
  });

  it('states how much work it did, so the numbers can be judged', () => {
    expect(study.meta.sunSampleCount).toBeGreaterThan(100);
    expect(study.meta.triangleCount).toBeGreaterThan(0);
    expect(study.meta.totalDaylightHours).toBeGreaterThan(4000);
  });

  it('reports progress as it goes', () => {
    const seen = [];
    computeSolarAccess({ project: building(), solarAccess: ON }, (progress) => seen.push(progress));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].total).toBe(study.sensors.count);
  });

  it('offers a roof photovoltaic potential that matches its own parts', () => {
    expect(study.totals.roofPotentialMWh).toBeCloseTo(
      (study.totals.roofAreaM2 * study.totals.roofMeanIrradiation) / 1000,
      4,
    );
  });
});
