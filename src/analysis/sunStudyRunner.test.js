import { describe, it, expect } from 'vitest';
import { computeSunStudy, sunDirectionInPlan } from './sunStudyRunner';
import { createSunStudyState } from './sunStudyState';
import { createProject, createWall } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';

const MANILA = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila' };

function projectWithBuilding(location = MANILA) {
  const project = createProject('Sun Study');
  const corners = [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 10000 },
    { x: 0, y: 10000 },
  ];
  project.floors[0].walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 200, { height: 9000 }),
  );

  if (!location) return project;
  const result = executeBuildingCommand(project, { type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION, ...location });
  expect(result.ok).toBe(true);
  return result.project;
}

const noon = (overrides = {}) => createSunStudyState({ enabled: true, date: '2026-12-21', minutes: 720, ...overrides });

describe('computeSunStudy', () => {
  it('returns nothing when the study is off', () => {
    expect(computeSunStudy({ project: projectWithBuilding(), sunStudy: createSunStudyState() })).toBeNull();
  });

  it('returns nothing when the site has no location', () => {
    expect(computeSunStudy({ project: projectWithBuilding(null), sunStudy: noon() })).toBeNull();
  });

  it('casts a midday shadow for a located site', () => {
    const study = computeSunStudy({ project: projectWithBuilding(), sunStudy: noon() });

    expect(study.sunIsUp).toBe(true);
    expect(study.regions.length).toBeGreaterThan(0);
    expect(study.shadowAreaMm2).toBeGreaterThan(0);
    // Manila at the December solstice: sun high in the south at midday.
    expect(study.altitudeDeg).toBeGreaterThan(45);
    expect(study.altitudeDeg).toBeLessThan(60);
    expect(study.azimuthDeg).toBeGreaterThan(150);
    expect(study.azimuthDeg).toBeLessThan(210);
  });

  it('casts no shadow at midnight', () => {
    const study = computeSunStudy({ project: projectWithBuilding(), sunStudy: noon({ minutes: 0 }) });

    expect(study.sunIsUp).toBe(false);
    expect(study.regions).toEqual([]);
  });

  it('throws a longer shadow in winter than in summer', () => {
    const project = projectWithBuilding();
    const winter = computeSunStudy({ project, sunStudy: noon({ date: '2026-12-21' }) });
    const summer = computeSunStudy({ project, sunStudy: noon({ date: '2026-06-21' }) });

    expect(winter.shadowAreaMm2).toBeGreaterThan(summer.shadowAreaMm2);
  });

  it('builds a day-long envelope in range mode', () => {
    const project = projectWithBuilding();
    const instant = computeSunStudy({ project, sunStudy: noon({ mode: 'instant' }) });
    const range = computeSunStudy({ project, sunStudy: noon({ mode: 'range', stepMinutes: 30 }) });

    expect(range.samples.length).toBeGreaterThan(10);
    expect(range.envelope.length).toBeGreaterThan(0);
    // The whole day sweeps more ground than any one moment in it.
    expect(range.shadowAreaMm2).toBeGreaterThan(instant.shadowAreaMm2);
    // Range mode still reports the current moment for context.
    expect(range.regions.length).toBeGreaterThan(0);
  });

  it('builds a sun-hours grid in sunHours mode', () => {
    const study = computeSunStudy({
      project: projectWithBuilding(),
      sunStudy: noon({ mode: 'sunHours', stepMinutes: 60, gridCellSize: 2000 }),
    });

    expect(study.grid).not.toBeNull();
    expect(study.grid.columns).toBeGreaterThan(0);
    expect(study.grid.hours.length).toBe(study.grid.columns * study.grid.rows);
    expect(study.grid.maxHours).toBeGreaterThan(0);
    expect(study.grid.compliantFraction).toBeGreaterThan(0);
    expect(study.grid.compliantFraction).toBeLessThanOrEqual(1);
  });

  it('reports visible compliance against the property mask', () => {
    const located = projectWithBuilding();
    const boundary = [
      { x: -10000, y: -20000 },
      { x: 20000, y: -20000 },
      { x: 20000, y: 20000 },
      { x: -10000, y: 20000 },
    ];
    const bounded = executeBuildingCommand(located, {
      type: BUILDING_COMMANDS.DEFINE_PROPERTY_BOUNDARY,
      boundary,
    }).project;
    const study = computeSunStudy({
      project: bounded,
      sunStudy: noon({ mode: 'sunHours', stepMinutes: 60, gridCellSize: 2000, targetId: 'property' }),
    });

    expect(study.target).toMatchObject({ id: 'property', name: 'Property boundary' });
    expect(study.targetAreaMm2).toBeCloseTo(30000 * 40000, -3);
    expect(study.grid.assessedAreaMm2).toBeCloseTo(study.targetAreaMm2, -3);
    expect(study.grid.compliantFraction).toBeGreaterThanOrEqual(0);
    expect(study.grid.compliantFraction).toBeLessThanOrEqual(1);
  });

  it('uses an explicit neighboring-lot mask for shadow coverage', () => {
    const project = projectWithBuilding();
    const polygon = [
      { x: 0, y: -10000 },
      { x: 10000, y: -10000 },
      { x: 10000, y: 5000 },
      { x: 0, y: 5000 },
    ];
    const targeted = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.UPSERT_SOLAR_STUDY_TARGET,
      id: 'north_neighbor',
      name: 'North neighbor',
      kind: 'neighbor',
      polygon,
    }).project;
    const study = computeSunStudy({
      project: targeted,
      sunStudy: noon({ mode: 'range', stepMinutes: 30, targetId: 'north_neighbor' }),
    });

    expect(study.target).toMatchObject({ id: 'north_neighbor', kind: 'neighbor' });
    expect(study.targetShadowFraction).toBeGreaterThan(0);
    expect(study.targetShadowFraction).toBeLessThanOrEqual(1);
  });

  it('reports sunrise and sunset for the local day, not the UTC day', () => {
    // Manila is UTC+8, so a 00:30 local study time lands on the previous UTC
    // day. Sun times must still describe the day the user picked.
    const study = computeSunStudy({
      project: projectWithBuilding(),
      sunStudy: noon({ date: '2026-12-21', minutes: 30 }),
    });

    expect(new Intl.DateTimeFormat('en-CA', { timeZone: MANILA.timeZone }).format(study.times.sunrise)).toBe(
      '2026-12-21',
    );
  });

  it('turns the shadow with the site north angle', () => {
    const project = projectWithBuilding();
    const rotated = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
      ...MANILA,
      northAngle: 90,
    }).project;

    const straight = computeSunStudy({ project, sunStudy: noon() });
    const turned = computeSunStudy({ project: rotated, sunStudy: noon() });

    const centroidY = (study) =>
      study.regions[0].outline.reduce((sum, point) => sum + point.y, 0) / study.regions[0].outline.length;
    const centroidX = (study) =>
      study.regions[0].outline.reduce((sum, point) => sum + point.x, 0) / study.regions[0].outline.length;

    // North up: the midday shadow runs up the page. North turned a quarter
    // turn: it runs across it instead.
    expect(centroidY(straight)).toBeLessThan(5000);
    expect(centroidX(turned)).toBeGreaterThan(5000);
  });

  it('survives a project with nothing built yet', () => {
    const project = executeBuildingCommand(createProject('Empty'), {
      type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
      ...MANILA,
    }).project;

    const study = computeSunStudy({ project, sunStudy: noon() });
    expect(study.masses).toEqual([]);
    expect(study.regions).toEqual([]);
  });
});

describe('sunDirectionInPlan', () => {
  it('points north when the sun is due north', () => {
    const direction = sunDirectionInPlan({ azimuth: 0, northAngle: 0 });

    expect(direction.x).toBeCloseTo(0, 6);
    expect(direction.y).toBeCloseTo(-1, 6);
  });

  it('points east when the sun is due east', () => {
    const direction = sunDirectionInPlan({ azimuth: Math.PI / 2, northAngle: 0 });

    expect(direction.x).toBeCloseTo(1, 6);
    expect(direction.y).toBeCloseTo(0, 6);
  });

  it('rotates with the north angle', () => {
    const direction = sunDirectionInPlan({ azimuth: 0, northAngle: 90 });

    expect(direction.x).toBeCloseTo(1, 6);
    expect(direction.y).toBeCloseTo(0, 6);
  });
});
