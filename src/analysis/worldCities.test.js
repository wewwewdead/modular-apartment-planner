import { describe, it, expect } from 'vitest';
import { WORLD_CITIES, searchCities, nearestCity, distanceKm } from './worldCities';
import { isValidTimeZone } from '@/utils/timeZone';

describe('the city index', () => {
  it('holds coordinates that are all on Earth', () => {
    for (const city of WORLD_CITIES) {
      expect(city.latitude).toBeGreaterThanOrEqual(-90);
      expect(city.latitude).toBeLessThanOrEqual(90);
      expect(city.longitude).toBeGreaterThanOrEqual(-180);
      expect(city.longitude).toBeLessThanOrEqual(180);
      expect(city.name).toBeTruthy();
      expect(city.country).toBeTruthy();
      expect(isValidTimeZone(city.timeZone), `${city.name} has a valid civil timezone`).toBe(true);
    }
  });

  it('has unique ids', () => {
    expect(new Set(WORLD_CITIES.map((city) => city.id)).size).toBe(WORLD_CITIES.length);
  });

  it('covers every inhabited continent, so the map scatter reads as land', () => {
    const inBox = (minLat, maxLat, minLon, maxLon) =>
      WORLD_CITIES.filter(
        (c) => c.latitude >= minLat && c.latitude <= maxLat && c.longitude >= minLon && c.longitude <= maxLon,
      ).length;

    expect(inBox(35, 71, -10, 40)).toBeGreaterThan(20); // Europe
    expect(inBox(-35, 37, -18, 52)).toBeGreaterThan(15); // Africa
    expect(inBox(15, 70, -170, -52)).toBeGreaterThan(20); // North America
    expect(inBox(-56, 13, -82, -34)).toBeGreaterThan(10); // South America
    expect(inBox(-11, 55, 60, 150)).toBeGreaterThan(30); // Asia
    expect(inBox(-48, -10, 112, 180)).toBeGreaterThan(8); // Oceania
  });

  it('places a few well-known cities where they belong', () => {
    const find = (name) => WORLD_CITIES.find((city) => city.name === name);

    // Loose tolerances: these are city-centre approximations, and one degree
    // of error moves a shadow angle by one degree, which is immaterial.
    expect(find('Manila').latitude).toBeCloseTo(14.6, 1);
    expect(find('Manila').longitude).toBeCloseTo(121.0, 1);
    expect(find('London').longitude).toBeCloseTo(-0.13, 1);
    expect(find('Sydney').latitude).toBeLessThan(0);
    expect(find('Quito').latitude).toBeCloseTo(0, 0);
  });
});

describe('searchCities', () => {
  it('ignores queries too short to be useful', () => {
    expect(searchCities('')).toEqual([]);
    expect(searchCities('m')).toEqual([]);
  });

  it('ranks name prefixes above everything else', () => {
    const results = searchCities('man');

    expect(results[0].name.toLowerCase().startsWith('man')).toBe(true);
    expect(results.map((c) => c.name)).toContain('Manila');
    expect(results.map((c) => c.name)).toContain('Manchester');
  });

  it('finds cities by country too', () => {
    expect(searchCities('philippines').length).toBeGreaterThan(3);
  });

  it('is case insensitive', () => {
    expect(searchCities('MANILA')[0].name).toBe('Manila');
    expect(searchCities('mAnIlA')[0].name).toBe('Manila');
  });

  it('matches through accents the user types', () => {
    // The index stores unaccented names, so someone typing the accented form
    // must still land on the right city.
    expect(searchCities('córdoba')[0].name).toBe('Cordoba');
    expect(searchCities('sāo paulo')[0].name).toBe('Sao Paulo');
  });

  it('respects the result limit', () => {
    expect(searchCities('a', 5).length).toBeLessThanOrEqual(5);
    expect(searchCities('san', 2).length).toBeLessThanOrEqual(2);
  });
});

describe('nearestCity', () => {
  it('names the closest listed city to a point', () => {
    const near = nearestCity({ latitude: 14.55, longitude: 121.02 });

    expect(near.city.country).toBe('Philippines');
    expect(near.distanceKm).toBeLessThan(30);
  });

  it('reports a large distance in open ocean rather than pretending', () => {
    // Point Nemo, the most remote spot in the Pacific.
    const near = nearestCity({ latitude: -48.88, longitude: -123.39 });

    expect(near).not.toBeNull();
    expect(near.distanceKm).toBeGreaterThan(1000);
  });

  it('returns null without a usable point', () => {
    expect(nearestCity(null)).toBeNull();
    expect(nearestCity({ latitude: Number.NaN, longitude: 0 })).toBeNull();
  });
});

describe('distanceKm', () => {
  it('measures a known separation', () => {
    // London to Paris is about 344 km.
    const london = { latitude: 51.51, longitude: -0.13 };
    const paris = { latitude: 48.86, longitude: 2.35 };

    expect(distanceKm(london, paris)).toBeGreaterThan(330);
    expect(distanceKm(london, paris)).toBeLessThan(360);
  });

  it('is zero for a point against itself and symmetric', () => {
    const a = { latitude: 35.68, longitude: 139.69 };
    const b = { latitude: -33.87, longitude: 151.21 };

    expect(distanceKm(a, a)).toBeCloseTo(0, 6);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6);
  });

  it('handles antipodal points without NaN', () => {
    const distance = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });

    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeCloseTo(20015, -2);
  });
});
