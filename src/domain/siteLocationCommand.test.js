import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';

const MANILA = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila' };

function configure(project, overrides = {}) {
  return executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
    ...MANILA,
    ...overrides,
  });
}

describe('ConfigureSiteLocation', () => {
  it('leaves a new project without a location rather than guessing one', () => {
    const { site } = createProject('Sun Study').building;

    expect(site.latitude).toBeNull();
    expect(site.longitude).toBeNull();
    expect(site.timeZone).toBeNull();
  });

  it('records coordinates and their civil timezone', () => {
    const result = configure(createProject('Sun Study'), { locationLabel: 'Quezon City' });

    expect(result.ok).toBe(true);
    expect(result.project.building.site).toMatchObject({ ...MANILA, locationLabel: 'Quezon City' });
  });

  it('sets the north angle alongside the location when given', () => {
    const result = configure(createProject('Sun Study'), { northAngle: 27 });

    expect(result.ok).toBe(true);
    expect(result.project.building.site.northAngle).toBe(27);
  });

  it('leaves an existing north angle alone when omitted', () => {
    const first = configure(createProject('Sun Study'), { northAngle: 27 });
    const second = configure(first.project);

    expect(second.project.building.site.northAngle).toBe(27);
  });

  it('gives a new site the default terrain exposure rather than leaving it unset', () => {
    // Unlike latitude, exposure has no "unknown" that would make a study
    // meaningless — every site has terrain — so this one does get a default.
    expect(createProject('Wind Study').building.site.exposureClass).toBe('suburban');
  });

  it('records a terrain exposure class when one is given', () => {
    const result = configure(createProject('Wind Study'), { exposureClass: 'dense-urban' });

    expect(result.ok).toBe(true);
    expect(result.project.building.site.exposureClass).toBe('dense-urban');
  });

  it('leaves an existing exposure class alone when omitted', () => {
    const first = configure(createProject('Wind Study'), { exposureClass: 'open' });
    const second = configure(first.project);

    expect(second.project.building.site.exposureClass).toBe('open');
  });

  it('rejects an exposure class it does not know, without half-applying', () => {
    const result = configure(createProject('Wind Study'), { exposureClass: 'rural' });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('invalid-exposure-class');
    expect(result.project.building.site.latitude).toBeNull();
    expect(result.project.building.site.exposureClass).toBe('suburban');
  });

  it('accepts the extremes of every range', () => {
    for (const location of [
      { latitude: -90, longitude: -180 },
      { latitude: 90, longitude: 180 },
      { latitude: 0, longitude: 0 },
    ]) {
      expect(configure(createProject('Sun Study'), location).ok).toBe(true);
    }
  });

  it.each([
    ['latitude past the pole', { latitude: 91 }, 'invalid-latitude'],
    ['latitude below the pole', { latitude: -91 }, 'invalid-latitude'],
    ['missing latitude', { latitude: null }, 'invalid-latitude'],
    ['non-numeric latitude', { latitude: '14.6' }, 'invalid-latitude'],
    ['longitude past the antimeridian', { longitude: 181 }, 'invalid-longitude'],
    ['longitude before the antimeridian', { longitude: -181 }, 'invalid-longitude'],
    ['missing longitude', { longitude: undefined }, 'invalid-longitude'],
    ['non-numeric longitude', { longitude: '' }, 'invalid-longitude'],
    ['non-finite north angle', { northAngle: Number.NaN }, 'invalid-north-angle'],
    ['missing timezone', { timeZone: null }, 'invalid-time-zone'],
    ['unknown timezone', { timeZone: 'Mars/Olympus' }, 'invalid-time-zone'],
  ])('rejects %s', (_label, overrides, code) => {
    const project = createProject('Sun Study');
    const result = configure(project, overrides);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(code);
    // A rejected command must not half-apply.
    expect(result.project.building.site.latitude).toBeNull();
  });
});
