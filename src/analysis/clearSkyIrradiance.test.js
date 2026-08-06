import { describe, expect, it } from 'vitest';
import {
  SOLAR_CONSTANT,
  airMass,
  clearSkyIrradiance,
  dayOfYear,
  daysInMonth,
  extraterrestrialNormal,
  planeOfArrayIrradiance,
} from './clearSkyIrradiance';

const DEG = Math.PI / 180;

describe('extraterrestrial irradiance', () => {
  it('averages the solar constant over the year', () => {
    let total = 0;
    for (let day = 1; day <= 365; day += 1) total += extraterrestrialNormal(day);
    expect(total / 365).toBeCloseTo(SOLAR_CONSTANT, 0);
  });

  it('peaks at perihelion in early January and dips at aphelion in July', () => {
    // ±3.3% from orbital eccentricity. Small, but it is what makes a January
    // and a July number comparable.
    const january = extraterrestrialNormal(3);
    const july = extraterrestrialNormal(185);
    expect(january).toBeGreaterThan(july);
    expect(january / SOLAR_CONSTANT).toBeCloseTo(1.033, 2);
    expect(july / SOLAR_CONSTANT).toBeCloseTo(0.967, 2);
  });
});

describe('air mass', () => {
  it('is 1 with the sun overhead', () => {
    expect(airMass(0)).toBeCloseTo(1, 3);
  });

  it('is about 2 at 30° altitude', () => {
    // The classic AM2 reference: 60° from the zenith.
    expect(airMass(60 * DEG)).toBeCloseTo(2, 1);
  });

  it('reaches the observed ~38 at the horizon rather than diverging', () => {
    // A plain 1/cos θ goes to infinity here and would report a sunrise as
    // delivering no light at all.
    const horizon = airMass(90 * DEG);
    expect(horizon).toBeGreaterThan(30);
    expect(horizon).toBeLessThan(45);
    expect(Number.isFinite(horizon)).toBe(true);
  });

  it('increases monotonically as the sun drops', () => {
    let previous = 0;
    for (let zenith = 0; zenith <= 90; zenith += 5) {
      const mass = airMass(zenith * DEG);
      expect(mass).toBeGreaterThan(previous);
      previous = mass;
    }
  });
});

describe('clear-sky irradiance', () => {
  it('gives about 950 W/m² beam with the sun overhead', () => {
    // What a clear day at sea level actually measures. An order-of-magnitude
    // error here would make every kWh figure meaningless.
    const { dni } = clearSkyIrradiance({ altitude: 90 * DEG, dayOfYear: 172 });
    expect(dni).toBeGreaterThan(880);
    expect(dni).toBeLessThan(1000);
  });

  it('gives clear-sky diffuse in the 80-120 W/m² band at noon', () => {
    const { dhi } = clearSkyIrradiance({ altitude: 90 * DEG, dayOfYear: 172 });
    expect(dhi).toBeGreaterThan(80);
    expect(dhi).toBeLessThan(120);
  });

  it('never exceeds the extraterrestrial beam', () => {
    for (let altitude = 1; altitude <= 90; altitude += 1) {
      const { dni } = clearSkyIrradiance({ altitude: altitude * DEG, dayOfYear: 100 });
      expect(dni).toBeLessThan(extraterrestrialNormal(100));
    }
  });

  it('falls away as the sun sets and is exactly zero below the horizon', () => {
    const high = clearSkyIrradiance({ altitude: 60 * DEG, dayOfYear: 172 });
    const low = clearSkyIrradiance({ altitude: 10 * DEG, dayOfYear: 172 });
    expect(low.dni).toBeLessThan(high.dni);
    expect(low.ghi).toBeLessThan(high.ghi);

    const night = clearSkyIrradiance({ altitude: -5 * DEG, dayOfYear: 172 });
    expect(night).toMatchObject({ dni: 0, dhi: 0, ghi: 0 });
  });

  it('keeps global horizontal consistent with its own components', () => {
    const result = clearSkyIrradiance({ altitude: 45 * DEG, dayOfYear: 200 });
    expect(result.ghi).toBeCloseTo(result.dni * result.cosZenith + result.dhi, 6);
  });
});

describe('irradiance on a tilted plane', () => {
  const noon = clearSkyIrradiance({ altitude: 60 * DEG, dayOfYear: 172 });
  const extraterrestrial = extraterrestrialNormal(172);

  const base = {
    dni: noon.dni,
    dhi: noon.dhi,
    ghi: noon.ghi,
    cosZenith: noon.cosZenith,
    extraterrestrial,
    sunlit: true,
  };

  it('reproduces global horizontal for an unobstructed flat roof', () => {
    // A horizontal plane facing the sun with a full sky view must receive the
    // global horizontal irradiance and nothing more. Anything else means a
    // component is being double-counted or dropped.
    const flat = planeOfArrayIrradiance({
      ...base,
      cosIncidence: noon.cosZenith,
      skyViewFactor: 1,
      tiltCosine: 1,
    });
    expect(flat.total).toBeCloseTo(noon.ghi, 0);
    expect(flat.ground).toBe(0);
  });

  it('drops to diffuse and ground alone when the sun is hidden', () => {
    const shaded = planeOfArrayIrradiance({
      ...base,
      cosIncidence: noon.cosZenith,
      skyViewFactor: 1,
      tiltCosine: 1,
      sunlit: false,
    });
    expect(shaded.beam).toBe(0);
    expect(shaded.total).toBeGreaterThan(0);
    expect(shaded.total).toBeLessThan(noon.ghi * 0.25);
  });

  it('gives a wall facing away from the sun no beam at all', () => {
    const away = planeOfArrayIrradiance({
      ...base,
      cosIncidence: -0.5,
      skyViewFactor: 0.5,
      tiltCosine: 0,
    });
    expect(away.beam).toBe(0);
    expect(away.diffuse).toBeGreaterThan(0);
  });

  it('gives a vertical wall its share of ground reflection', () => {
    // Half sky, half ground — the reason a south wall over pale paving gains
    // noticeably on one over dark grass.
    const wall = planeOfArrayIrradiance({ ...base, cosIncidence: 0.5, skyViewFactor: 0.5, tiltCosine: 0 });
    expect(wall.ground).toBeCloseTo(noon.ghi * 0.2 * 0.5, 4);
  });

  it('scales isotropic diffuse with how much sky the sensor can see', () => {
    const open = planeOfArrayIrradiance({ ...base, cosIncidence: 0.5, skyViewFactor: 0.5, tiltCosine: 0 });
    const enclosed = planeOfArrayIrradiance({ ...base, cosIncidence: 0.5, skyViewFactor: 0.05, tiltCosine: 0 });
    expect(enclosed.diffuse).toBeLessThan(open.diffuse);
    expect(enclosed.total).toBeLessThan(open.total);
  });

  it('keeps the circumsolar halo with the beam, not with the sky dome', () => {
    // Hay-Davies over isotropic: a shaded sensor loses the halo even though its
    // sky view factor has not changed. Treating all diffuse as isotropic would
    // credit a wall in the shade with light coming from around the sun.
    const lit = planeOfArrayIrradiance({ ...base, cosIncidence: 0.9, skyViewFactor: 0.5, tiltCosine: 0 });
    const shaded = planeOfArrayIrradiance({
      ...base,
      cosIncidence: 0.9,
      skyViewFactor: 0.5,
      tiltCosine: 0,
      sunlit: false,
    });
    expect(lit.diffuse).toBeGreaterThan(shaded.diffuse);
  });

  it('never returns a negative or non-finite total', () => {
    const nonsense = planeOfArrayIrradiance({
      ...base,
      cosIncidence: -2,
      skyViewFactor: -1,
      tiltCosine: 5,
      sunlit: false,
    });
    expect(nonsense.total).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(nonsense.total)).toBe(true);
  });
});

describe('calendar helpers', () => {
  it('counts the days of the year', () => {
    expect(dayOfYear(1, 1)).toBe(1);
    expect(dayOfYear(12, 31)).toBe(365);
    expect(dayOfYear(6, 21)).toBe(172);
    let total = 0;
    for (let month = 1; month <= 12; month += 1) total += daysInMonth(month);
    expect(total).toBe(365);
  });
});
