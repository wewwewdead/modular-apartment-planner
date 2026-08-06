import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createUniformWindRose } from '@/analysis/windState';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';

const CEBU = { latitude: 10.32, longitude: 123.89, timeZone: 'Asia/Manila' };

function located(project, location = CEBU) {
  return executeBuildingCommand(project, { type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION, ...location }).project;
}

function cache(overrides = {}) {
  return {
    schemaVersion: 1,
    locationKey: '10.3200|123.8900',
    source: 'Open-Meteo historical reanalysis',
    sourceUrl: 'https://open-meteo.com/en/docs/historical-weather-api',
    period: '2021–2025',
    startDate: '2021-01-01',
    endDate: '2025-12-31',
    cachedAt: '2026-08-05T00:00:00.000Z',
    sampleCount: 43824,
    heightM: 10,
    prevailingDirectionDeg: 67.5,
    prevailingMeanSpeed: 4.3,
    windRose: createUniformWindRose(),
    ...overrides,
  };
}

function store(project, value = cache()) {
  return executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.CACHE_SITE_WIND_CLIMATE,
    cache: value,
  });
}

describe('CacheSiteWindClimate', () => {
  it('stores a compact normalized wind climate on the project site', () => {
    const result = store(located(createProject('Offline Wind')));
    expect(result.ok).toBe(true);
    expect(result.project.building.site.windClimateCache).toMatchObject({
      schemaVersion: 1,
      locationKey: '10.3200|123.8900',
      period: '2021–2025',
      prevailingDirectionDeg: 67.5,
    });
    expect(result.project.building.site.windClimateCache.windRose).toHaveLength(16);
    expect(result.changes.domain).toContainEqual({
      operation: 'replace',
      entityType: 'siteWindClimate',
      id: '10.3200|123.8900',
    });
  });

  it('rejects data for another location or an invalid fitted rose', () => {
    const project = located(createProject('Offline Wind'));
    expect(store(project, cache({ locationKey: '14.5995|120.9842' })).error.code).toBe(
      'wind-climate-location-mismatch',
    );
    expect(store(project, cache({ windRose: [] })).error.code).toBe('invalid-wind-climate-rose');
    expect(project.building.site.windClimateCache).toBeNull();
  });

  it('keeps the cache for orientation edits and invalidates it when coordinates change', () => {
    const project = store(located(createProject('Offline Wind'))).project;
    const rotated = located(project, { ...CEBU, northAngle: 22 });
    expect(rotated.building.site.windClimateCache).not.toBeNull();

    const moved = located(rotated, { latitude: 10.4, longitude: 123.89, timeZone: 'Asia/Manila' });
    expect(moved.building.site.windClimateCache).toBeNull();
  });

  it('round-trips the fitted rose through project serialization', () => {
    const project = store(located(createProject('Offline Wind'))).project;
    const restored = deserializeProject(serializeProject(project)).project;
    expect(restored.building.site.windClimateCache).toEqual(project.building.site.windClimateCache);
  });
});
