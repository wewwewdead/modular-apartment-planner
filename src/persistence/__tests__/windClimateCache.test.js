/* @vitest-environment jsdom */
/**
 * The localStorage fetch cache and the explicit-save snapshot (plan amendment 14).
 *
 * jsdom is used for one reason: it has a real `localStorage`. No network is
 * involved anywhere in this file — the climates below are built by the pure
 * derivation, not fetched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWindClimateSnapshot,
  deriveWindClimate,
  WIND_CLIMATE_CACHE_TTL_MS,
  WIND_CLIMATE_DATASET_VERSION,
  windClimateCacheKey,
  windClimatePeriod,
} from '@/analysis/windClimate';
import { createProject } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import { deserializeProject } from '../deserialize';
import { serializeProject } from '../serialize';
import {
  currentWindClimateSnapshot,
  projectWindClimateCacheKey,
  readCachedWindClimate,
  writeCachedWindClimate,
} from '../windClimateCache';

const CEBU = { latitude: 10.32, longitude: 123.89, timeZone: 'Asia/Manila' };
const FETCHED_AT = '2026-08-05T00:00:00.000Z';
const NOW = new Date('2026-08-06T00:00:00Z');

function climate(metadata = {}) {
  return deriveWindClimate({
    speeds: Array(48).fill(5),
    directions: Array.from({ length: 48 }, (_, index) => (index < 40 ? 90 : 180)),
    metadata: {
      locationKey: '10.3200|123.8900',
      period: '2021–2025',
      startDate: '2021-01-01',
      endDate: '2025-12-31',
      cachedAt: FETCHED_AT,
      ...metadata,
    },
  });
}

function locatedProject() {
  return executeBuildingCommand(createProject('Offline Wind'), {
    type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
    ...CEBU,
  }).project;
}

function key(now = NOW) {
  return windClimateCacheKey({ latitude: CEBU.latitude, longitude: CEBU.longitude, ...windClimatePeriod(now) });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // Unstub first: one test replaces `localStorage` with undefined.
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('the localStorage fetch cache', () => {
  it('round-trips a fetched climate under a location + period + dataset key', () => {
    expect(writeCachedWindClimate(key(), climate(), { now: NOW })).toBe(true);
    const stored = JSON.parse(localStorage.getItem(key()));
    expect(stored).toMatchObject({ datasetVersion: WIND_CLIMATE_DATASET_VERSION, locationKey: '10.3200|123.8900' });

    const read = readCachedWindClimate(key(), CEBU, { now: Date.parse(FETCHED_AT) + 1000 });
    expect(read).toMatchObject({ prevailingDirectionDeg: 90 });
    expect(read.windRose).toHaveLength(16);
  });

  it('misses for another location, another period and another dataset version', () => {
    writeCachedWindClimate(key(), climate(), { now: NOW });
    const now = Date.parse(FETCHED_AT) + 1000;
    expect(readCachedWindClimate(key(), { latitude: 14.6, longitude: 121 }, { now })).toBeNull();
    expect(readCachedWindClimate(key(new Date('2027-02-01T00:00:00Z')), CEBU, { now })).toBeNull();

    const entry = JSON.parse(localStorage.getItem(key()));
    localStorage.setItem(key(), JSON.stringify({ ...entry, datasetVersion: 'era5-v9' }));
    expect(readCachedWindClimate(key(), CEBU, { now })).toBeNull();
  });

  it('expires exactly at the 30-day TTL, measured from the fetch', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FETCHED_AT));
    writeCachedWindClimate(key(), climate());

    vi.advanceTimersByTime(WIND_CLIMATE_CACHE_TTL_MS - 1);
    expect(readCachedWindClimate(key(), CEBU, { now: Date.now() })).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(readCachedWindClimate(key(), CEBU, { now: Date.now() })).toBeNull();
    // Expiry is a miss, not a delete: the entry is still there to be overwritten.
    expect(localStorage.getItem(key())).not.toBeNull();
  });

  it('treats damaged or hostile entries as a miss rather than throwing', () => {
    localStorage.setItem(key(), 'not json at all');
    expect(readCachedWindClimate(key(), CEBU)).toBeNull();
    localStorage.setItem(key(), '"a string"');
    expect(readCachedWindClimate(key(), CEBU)).toBeNull();
    localStorage.setItem(key(), JSON.stringify({ schemaVersion: 2, normals: { windRose: 'nope' } }));
    expect(readCachedWindClimate(key(), CEBU)).toBeNull();
    expect(readCachedWindClimate(null, CEBU)).toBeNull();
  });

  it('degrades silently when storage is full', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      throw error;
    });
    expect(() => writeCachedWindClimate(key(), climate(), { now: NOW })).not.toThrow();
    expect(writeCachedWindClimate(key(), climate(), { now: NOW })).toBe(false);
    setItem.mockRestore();
  });

  it('degrades silently when localStorage is disabled entirely', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readCachedWindClimate('any-key', CEBU)).toBeNull();
    expect(writeCachedWindClimate('any-key', climate())).toBe(false);
    expect(currentWindClimateSnapshot(locatedProject())).toBeNull();
  });

  it('degrades silently when reading localStorage throws (blocked by policy)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readCachedWindClimate(key(), CEBU)).toBeNull();
    getItem.mockRestore();
  });

  it('refuses to write a climate that is not one', () => {
    expect(writeCachedWindClimate(key(), null)).toBe(false);
    expect(writeCachedWindClimate(key(), { windRose: [] })).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});

describe('the snapshot an explicit save writes', () => {
  it('is taken from the fetch cache, not from project state', () => {
    const project = locatedProject();
    expect(currentWindClimateSnapshot(project, { now: NOW })).toBeNull();

    writeCachedWindClimate(projectWindClimateCacheKey(project, { now: NOW }), climate(), { now: NOW });
    const snapshot = currentWindClimateSnapshot(project, { now: NOW });
    expect(snapshot).toMatchObject({
      schemaVersion: 2,
      datasetVersion: WIND_CLIMATE_DATASET_VERSION,
      locationKey: '10.3200|123.8900',
      capturedAt: FETCHED_AT,
    });
    expect(snapshot.normals.windRose).toHaveLength(16);
    expect(project.building.site.windClimateSnapshot).toBeNull();
  });

  it('survives past the TTL, because an old snapshot still beats no snapshot offline', () => {
    const project = locatedProject();
    writeCachedWindClimate(projectWindClimateCacheKey(project, { now: NOW }), climate(), { now: NOW });
    const long = new Date(Date.parse(FETCHED_AT) + WIND_CLIMATE_CACHE_TTL_MS * 3);
    // Same period, so the same key — only the age has changed.
    expect(currentWindClimateSnapshot(project, { now: NOW })).not.toBeNull();
    expect(readCachedWindClimate(projectWindClimateCacheKey(project, { now: NOW }), CEBU, { now: long })).toBeNull();
  });

  it('has no snapshot to write for a site with no coordinates', () => {
    expect(currentWindClimateSnapshot(createProject('Unlocated'), { now: NOW })).toBeNull();
    expect(projectWindClimateCacheKey(createProject('Unlocated'), { now: NOW })).toBeNull();
    expect(currentWindClimateSnapshot(null)).toBeNull();
  });

  it('reaches the file through serialize and comes back through deserialize', () => {
    const project = locatedProject();
    writeCachedWindClimate(projectWindClimateCacheKey(project, { now: NOW }), climate(), { now: NOW });
    const snapshot = currentWindClimateSnapshot(project, { now: NOW });

    const file = serializeProject(project, { windClimateSnapshot: snapshot });
    expect(file.data.building.site.windClimateSnapshot).toEqual(snapshot);
    expect(project.building.site.windClimateSnapshot).toBeNull();

    const reloaded = deserializeProject(JSON.parse(JSON.stringify(file))).project;
    expect(reloaded.building.site.windClimateSnapshot).toEqual(snapshot);
  });

  it('is not written by an autosave, which serializes the project as it stands', () => {
    const project = locatedProject();
    writeCachedWindClimate(projectWindClimateCacheKey(project, { now: NOW }), climate(), { now: NOW });
    // `saveProject` (autosave) passes no options through to `serializeProject`.
    expect(serializeProject(project).data.building.site.windClimateSnapshot).toBeNull();
    expect(serializeProject(project).data).toBe(project);
  });

  it('writes a snapshot equal to what the cache holds, so a reload is a no-op', () => {
    const project = locatedProject();
    const cacheKey = projectWindClimateCacheKey(project, { now: NOW });
    writeCachedWindClimate(cacheKey, climate(), { now: NOW });
    expect(currentWindClimateSnapshot(project, { now: NOW })).toEqual(
      createWindClimateSnapshot(readCachedWindClimate(cacheKey, CEBU, { now: Date.parse(FETCHED_AT) })),
    );
  });
});
