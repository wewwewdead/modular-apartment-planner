import { describe, it, expect } from 'vitest';
import { solarPosition, sunTimes, siteInstant, siteClock, sampleDaySunPositions } from './solarPosition';

const RAD = 180 / Math.PI;

// Real sites, chosen to exercise every branch: a low northern latitude where
// the sun passes north of the zenith in summer, a mid northern latitude, a
// southern-hemisphere site, the equator, and inside the Arctic circle.
const MANILA = { latitude: 14.5995, longitude: 120.9842, timezoneOffsetMinutes: 480 };
const LONDON = { latitude: 51.5072, longitude: -0.1276, timezoneOffsetMinutes: 0 };
const SYDNEY = { latitude: -33.8688, longitude: 151.2093, timezoneOffsetMinutes: 600 };
const EQUATOR = { latitude: 0, longitude: 0, timezoneOffsetMinutes: 0 };
const TROMSO = { latitude: 69.6496, longitude: 18.956, timezoneOffsetMinutes: 60 };

function utc(year, month, day, hour = 12, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/** Geometric sun altitude, in degrees, at the site's solar noon on a date. */
function noonAltitudeDeg(site, date) {
  const { solarNoon } = sunTimes({ ...site, date });
  return solarPosition({ ...site, date: solarNoon }).trueAltitude * RAD;
}

function noonAzimuthDeg(site, date) {
  const { solarNoon } = sunTimes({ ...site, date });
  return solarPosition({ ...site, date: solarNoon }).azimuth * RAD;
}

describe('solar declination', () => {
  it('is near zero at the equinoxes', () => {
    expect(solarPosition({ ...EQUATOR, date: utc(2026, 3, 20) }).declination * RAD).toBeCloseTo(0, 0);
    expect(solarPosition({ ...EQUATOR, date: utc(2026, 9, 22) }).declination * RAD).toBeCloseTo(0, 0);
  });

  it('reaches the axial tilt at the solstices', () => {
    const june = solarPosition({ ...EQUATOR, date: utc(2026, 6, 21) }).declination * RAD;
    const december = solarPosition({ ...EQUATOR, date: utc(2026, 12, 21) }).declination * RAD;

    expect(june).toBeGreaterThan(23.4);
    expect(june).toBeLessThan(23.5);
    expect(december).toBeLessThan(-23.4);
    expect(december).toBeGreaterThan(-23.5);
  });

  it('never exceeds the axial tilt across a full year', () => {
    for (let dayOfYear = 0; dayOfYear < 365; dayOfYear += 1) {
      const date = new Date(Date.UTC(2026, 0, 1) + dayOfYear * 86400000);
      const declination = solarPosition({ ...EQUATOR, date }).declination * RAD;
      expect(Math.abs(declination)).toBeLessThanOrEqual(23.45);
    }
  });
});

describe('published solar-position vectors', () => {
  it('matches the NREL SPA Appendix A reference case', () => {
    // Reda & Andreas, NREL/TP-560-34302, Appendix A:
    // 2003-10-17 12:30:30 at UTC-7, 39.742476° N, 105.1786° W.
    // Published astronomical zenith 50.12795°, azimuth 194.34024°.
    const position = solarPosition({
      latitude: 39.742476,
      longitude: -105.1786,
      date: new Date('2003-10-17T19:30:30.000Z'),
    });

    expect(position.trueAltitude * RAD).toBeCloseTo(90 - 50.12795, 1);
    expect(position.azimuth * RAD).toBeCloseTo(194.34024, 1);
  });
});

describe('solar noon geometry', () => {
  // At solar noon the sun sits on the observer's meridian, so its elevation is
  // exactly 90° minus the angular distance between latitude and declination.
  // This is pure geometry and holds at every site and season.
  const cases = [
    ['Manila, December solstice', MANILA, utc(2026, 12, 21)],
    ['Manila, June solstice', MANILA, utc(2026, 6, 21)],
    ['London, December solstice', LONDON, utc(2026, 12, 21)],
    ['London, June solstice', LONDON, utc(2026, 6, 21)],
    ['Sydney, June solstice', SYDNEY, utc(2026, 6, 21)],
    ['Sydney, December solstice', SYDNEY, utc(2026, 12, 21)],
    ['Tromso, June solstice', TROMSO, utc(2026, 6, 21)],
  ];

  it.each(cases)('%s matches 90 - |latitude - declination|', (_label, site, date) => {
    const { solarNoon } = sunTimes({ ...site, date });
    const position = solarPosition({ ...site, date: solarNoon });
    const expected = 90 - Math.abs(site.latitude - position.declination * RAD);

    expect(position.trueAltitude * RAD).toBeCloseTo(expected, 1);
  });

  it('puts the midday sun due south when the site is north of the subsolar latitude', () => {
    // Manila in December: declination -23.4°, well south of latitude 14.6°.
    expect(noonAzimuthDeg(MANILA, utc(2026, 12, 21))).toBeCloseTo(180, 0);
    expect(noonAzimuthDeg(LONDON, utc(2026, 6, 21))).toBeCloseTo(180, 0);
  });

  it('puts the midday sun due north when the site is south of the subsolar latitude', () => {
    // Manila in June: declination +23.4° is north of latitude 14.6°, so the
    // noon sun is behind you if you face south. This branch is easy to get
    // backwards, and only shows up in the tropics or below the equator.
    const manilaJune = noonAzimuthDeg(MANILA, utc(2026, 6, 21));
    expect(Math.min(manilaJune, 360 - manilaJune)).toBeCloseTo(0, 0);

    const sydneyDecember = noonAzimuthDeg(SYDNEY, utc(2026, 12, 21));
    expect(Math.min(sydneyDecember, 360 - sydneyDecember)).toBeCloseTo(0, 0);
  });

  it('is higher in summer than in winter, in both hemispheres', () => {
    expect(noonAltitudeDeg(LONDON, utc(2026, 6, 21))).toBeGreaterThan(noonAltitudeDeg(LONDON, utc(2026, 12, 21)));
    expect(noonAltitudeDeg(SYDNEY, utc(2026, 12, 21))).toBeGreaterThan(noonAltitudeDeg(SYDNEY, utc(2026, 6, 21)));
  });

  it('is symmetric about solar noon', () => {
    // Sampled at the solstice, where declination is at a stationary point. On
    // other dates declination drifts measurably across a four-hour window
    // (~0.05° in April), so the morning and afternoon sun are genuinely not
    // mirror images and a tight tolerance here would be testing the wrong thing.
    const { solarNoon } = sunTimes({ ...LONDON, date: utc(2026, 6, 21) });
    const before = solarPosition({ ...LONDON, date: new Date(solarNoon.getTime() - 2 * 3600000) });
    const after = solarPosition({ ...LONDON, date: new Date(solarNoon.getTime() + 2 * 3600000) });

    expect(before.trueAltitude * RAD).toBeCloseTo(after.trueAltitude * RAD, 2);
    // Morning and afternoon bearings mirror across due south.
    expect(before.azimuth * RAD + after.azimuth * RAD).toBeCloseTo(360, 1);
  });
});

describe('sunrise and sunset', () => {
  it('gives the equator roughly twelve hours of daylight year-round', () => {
    for (const month of [1, 3, 6, 9, 12]) {
      const { daylightMinutes } = sunTimes({ ...EQUATOR, date: utc(2026, month, 15) });
      // Slightly over 12h: sunrise is defined at the sun's upper limb allowing
      // for refraction, not at its centre.
      expect(daylightMinutes).toBeGreaterThan(718);
      expect(daylightMinutes).toBeLessThan(732);
    }
  });

  it('brackets solar noon symmetrically', () => {
    const { sunrise, sunset, solarNoon } = sunTimes({ ...LONDON, date: utc(2026, 5, 10) });
    const morning = solarNoon.getTime() - sunrise.getTime();
    const afternoon = sunset.getTime() - solarNoon.getTime();

    expect(Math.abs(morning - afternoon)).toBeLessThan(60000);
  });

  it('places the sun within half a degree of the horizon at sunrise and sunset', () => {
    const { sunrise, sunset } = sunTimes({ ...MANILA, date: utc(2026, 8, 4) });

    expect(Math.abs(solarPosition({ ...MANILA, date: sunrise }).altitude * RAD)).toBeLessThan(0.5);
    expect(Math.abs(solarPosition({ ...MANILA, date: sunset }).altitude * RAD)).toBeLessThan(0.5);
  });

  it('reports polar night and midnight sun inside the Arctic circle', () => {
    const december = sunTimes({ ...TROMSO, date: utc(2026, 12, 21) });
    expect(december.alwaysDown).toBe(true);
    expect(december.sunrise).toBeNull();
    expect(december.daylightMinutes).toBe(0);

    const june = sunTimes({ ...TROMSO, date: utc(2026, 6, 21) });
    expect(june.alwaysUp).toBe(true);
    expect(june.sunset).toBeNull();
    expect(june.daylightMinutes).toBe(1440);
  });

  it('gives longer summer days the further from the equator', () => {
    const day = utc(2026, 6, 21);
    const equator = sunTimes({ ...EQUATOR, date: day }).daylightMinutes;
    const manila = sunTimes({ ...MANILA, date: day }).daylightMinutes;
    const london = sunTimes({ ...LONDON, date: day }).daylightMinutes;

    expect(manila).toBeGreaterThan(equator);
    expect(london).toBeGreaterThan(manila);
  });
});

describe('equation of time', () => {
  it('stays inside its known annual envelope and changes sign', () => {
    let minimum = Infinity;
    let maximum = -Infinity;

    for (let dayOfYear = 0; dayOfYear < 365; dayOfYear += 1) {
      const date = new Date(Date.UTC(2026, 0, 1) + dayOfYear * 86400000);
      const { equationOfTime } = solarPosition({ ...EQUATOR, date });
      minimum = Math.min(minimum, equationOfTime);
      maximum = Math.max(maximum, equationOfTime);
    }

    // The analemma runs from about -14.2 min in February to +16.4 min in November.
    expect(minimum).toBeGreaterThan(-15);
    expect(minimum).toBeLessThan(-13.5);
    expect(maximum).toBeGreaterThan(16);
    expect(maximum).toBeLessThan(17);
  });
});

describe('site clock conversion', () => {
  it('round-trips wall-clock parts through an absolute instant', () => {
    const parts = { year: 2026, month: 8, day: 4, minutes: 9 * 60 + 30 };
    const instant = siteInstant({ ...parts, timezoneOffsetMinutes: 480 });

    expect(instant.toISOString()).toBe('2026-08-04T01:30:00.000Z');
    expect(siteClock({ date: instant, timezoneOffsetMinutes: 480 })).toEqual(parts);
  });

  it('puts local clock noon near true solar noon for an on-meridian site', () => {
    // Manila sits 6° east of the UTC+8 standard meridian, so true solar noon
    // runs a little ahead of clock noon — but never by more than ~40 minutes.
    const localNoon = siteInstant({ year: 2026, month: 8, day: 4, minutes: 720, timezoneOffsetMinutes: 480 });
    const { solarNoon } = sunTimes({ ...MANILA, date: localNoon });

    expect(Math.abs(solarNoon.getTime() - localNoon.getTime())).toBeLessThan(40 * 60000);
  });

  it('applies the IANA daylight-saving rule for the date', () => {
    const winter = siteInstant({ year: 2026, month: 1, day: 15, minutes: 12 * 60, timeZone: 'America/New_York' });
    const summer = siteInstant({ year: 2026, month: 7, day: 15, minutes: 12 * 60, timeZone: 'America/New_York' });

    expect(winter.toISOString()).toBe('2026-01-15T17:00:00.000Z');
    expect(summer.toISOString()).toBe('2026-07-15T16:00:00.000Z');
    expect(siteClock({ date: summer, timeZone: 'America/New_York' })).toEqual({
      year: 2026,
      month: 7,
      day: 15,
      minutes: 12 * 60,
    });
  });
});

describe('day sampling', () => {
  it('returns only above-horizon samples, ordered through the day', () => {
    const samples = sampleDaySunPositions({ ...MANILA, date: utc(2026, 8, 4), stepMinutes: 30 });

    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample.altitude).toBeGreaterThan(0);
    }
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index].minutes).toBeGreaterThan(samples[index - 1].minutes);
    }
  });

  it('spans roughly the daylight window', () => {
    const date = utc(2026, 8, 4);
    const samples = sampleDaySunPositions({ ...MANILA, date, stepMinutes: 10 });
    const { daylightMinutes } = sunTimes({ ...MANILA, date });
    const spanned = samples[samples.length - 1].minutes - samples[0].minutes;

    expect(Math.abs(spanned - daylightMinutes)).toBeLessThan(30);
  });

  it('returns nothing during polar night', () => {
    expect(sampleDaySunPositions({ ...TROMSO, date: utc(2026, 12, 21), stepMinutes: 30 })).toEqual([]);
  });

  it('samples 23 and 25 real hours across DST transition days', () => {
    const site = { latitude: 40.71, longitude: -74.01, timeZone: 'America/New_York' };
    const springDate = siteInstant({ year: 2026, month: 3, day: 8, minutes: 720, timeZone: site.timeZone });
    const autumnDate = siteInstant({ year: 2026, month: 11, day: 1, minutes: 720, timeZone: site.timeZone });

    expect(sampleDaySunPositions({ ...site, date: springDate, stepMinutes: 60, minAltitudeDeg: -90 })).toHaveLength(23);
    expect(sampleDaySunPositions({ ...site, date: autumnDate, stepMinutes: 60, minAltitudeDeg: -90 })).toHaveLength(25);
  });
});
