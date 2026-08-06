/**
 * WAS: the behaviour pins for the `CacheSiteWindClimate` building command.
 * NOW: the pins for its REMOVAL (plan amendment 14, issue 7A as corrected by
 * Tension 10) and for the migration owed to the files it already wrote.
 *
 * The command wrote a fetched wind climate into project state, which is how a
 * network result ended up on the undo stack: enabling a wind study cleared the
 * redo stack, and undoing past the write discarded the climate. The fetch cache
 * is now localStorage and the project file carries a versioned snapshot written
 * at explicit save time. Four of the old suite's claims are re-stated here in
 * their new form rather than deleted:
 *
 *   old: "stores a compact normalized wind climate on the project site"
 *     -> the command no longer exists, and dispatching it is an inert error
 *        that leaves the site untouched.
 *   old: "rejects data for another location or an invalid fitted rose"
 *     -> the same rejection now happens on the READ path, in
 *        `restoreProjectWindClimate`, where it also covers hand-edited files.
 *   old: "keeps the cache for orientation edits and invalidates it when
 *        coordinates change"
 *     -> unchanged as a claim, now asserted for BOTH the snapshot and the
 *        legacy cache.
 *   old: "round-trips the fitted rose through project serialization"
 *     -> the legacy shape must still survive a round trip (nobody's saved data
 *        is dropped), and the new snapshot must round-trip too.
 */

import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createUniformWindRose } from '@/analysis/windState';
import {
  createWindClimateSnapshot,
  restoreProjectWindClimate,
  restoreSiteWindClimate,
  WIND_CLIMATE_DATASET_VERSION,
} from '@/analysis/windClimate';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';

const CEBU = { latitude: 10.32, longitude: 123.89, timeZone: 'Asia/Manila' };

function located(project, location = CEBU) {
  return executeBuildingCommand(project, { type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION, ...location }).project;
}

/** The exact shape the removed command used to write. */
function legacyCache(overrides = {}) {
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

/** A project as it arrives from a file saved before amendment 14. */
function withLegacyCache(project, cache = legacyCache()) {
  return {
    ...project,
    building: { ...project.building, site: { ...project.building.site, windClimateCache: cache } },
  };
}

function snapshotOf(overrides = {}) {
  return createWindClimateSnapshot({
    windRose: createUniformWindRose(),
    prevailingDirectionDeg: 67.5,
    prevailingMeanSpeed: 4.3,
    metadata: {
      locationKey: '10.3200|123.8900',
      period: '2021–2025',
      startDate: '2021-01-01',
      endDate: '2025-12-31',
      cachedAt: '2026-08-05T00:00:00.000Z',
      sampleCount: 43824,
      heightM: 10,
      ...overrides,
    },
  });
}

describe('CacheSiteWindClimate — removed', () => {
  it('is gone from the command table under both its key and its wire name', () => {
    expect(BUILDING_COMMANDS).not.toHaveProperty('CACHE_SITE_WIND_CLIMATE');
    expect(Object.values(BUILDING_COMMANDS)).not.toContain('CacheSiteWindClimate');
  });

  it('is an inert unknown command that changes nothing when an old caller dispatches it', () => {
    const project = located(createProject('Offline Wind'));
    const result = executeBuildingCommand(project, {
      type: 'CacheSiteWindClimate',
      cache: legacyCache(),
    });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('unknown-command');
    expect(result.project).toBe(project);
    expect(project.building.site.windClimateCache).toBeNull();
    expect(project.building.site.windClimateSnapshot ?? null).toBeNull();
  });

  it('leaves no writer of the project climate anywhere in the command layer', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(fileURLToPath(new URL('./buildingCommands.js', import.meta.url)), 'utf8');
    // The two site fields may only be READ or CLEARED here. The one place they
    // are assigned a value is the site-location command, which nulls them.
    expect(source).not.toContain('cacheSiteWindClimate');
    expect(source.match(/windClimateSnapshot:/g) || []).toHaveLength(1);
    expect(source.match(/windClimateCache:/g) || []).toHaveLength(1);
  });
});

describe('legacy project files (migration)', () => {
  it('still restores a wind climate written by the removed command', () => {
    const project = withLegacyCache(located(createProject('Offline Wind')));
    const restored = restoreProjectWindClimate(project.building.site);
    expect(restored).toMatchObject({ prevailingDirectionDeg: 67.5, prevailingMeanSpeed: 4.3 });
    expect(restored.windRose).toHaveLength(16);
    expect(restored.metadata).toMatchObject({ period: '2021–2025', locationKey: '10.3200|123.8900' });
  });

  it('rejects a legacy cache fitted for another location or carrying a broken rose', () => {
    const site = located(createProject('Offline Wind')).building.site;
    expect(restoreSiteWindClimate(legacyCache({ locationKey: '14.5995|120.9842' }), site)).toBeNull();
    expect(restoreSiteWindClimate(legacyCache({ windRose: [] }), site)).toBeNull();
    expect(restoreSiteWindClimate(legacyCache({ prevailingMeanSpeed: 0 }), site)).toBeNull();
  });

  it('prefers the current snapshot over a legacy cache when a file carries both', () => {
    const project = withLegacyCache(located(createProject('Offline Wind')));
    const site = { ...project.building.site, windClimateSnapshot: snapshotOf({ period: '2022–2026' }) };
    expect(restoreProjectWindClimate(site).metadata.period).toBe('2022–2026');
  });

  it('round-trips the legacy shape through serialization so no saved data is dropped', () => {
    const project = withLegacyCache(located(createProject('Offline Wind')));
    const restored = deserializeProject(serializeProject(project)).project;
    expect(restored.building.site.windClimateCache).toEqual(project.building.site.windClimateCache);
    expect(restoreProjectWindClimate(restored.building.site)).not.toBeNull();
  });
});

describe('site location edits', () => {
  it('keeps both climate fields for orientation edits and clears them when coordinates move', () => {
    const seeded = {
      ...withLegacyCache(located(createProject('Offline Wind'))),
    };
    seeded.building.site.windClimateSnapshot = snapshotOf();

    const rotated = located(seeded, { ...CEBU, northAngle: 22 });
    expect(rotated.building.site.windClimateCache).not.toBeNull();
    expect(rotated.building.site.windClimateSnapshot).not.toBeNull();

    const moved = located(rotated, { latitude: 10.4, longitude: 123.89, timeZone: 'Asia/Manila' });
    expect(moved.building.site.windClimateCache).toBeNull();
    expect(moved.building.site.windClimateSnapshot).toBeNull();
  });
});

describe('the versioned project snapshot', () => {
  it('is written by an explicit save and round-trips through the file', () => {
    const project = located(createProject('Offline Wind'));
    const windClimateSnapshot = snapshotOf();
    const serialized = serializeProject(project, { windClimateSnapshot });
    expect(serialized.data.building.site.windClimateSnapshot).toEqual(windClimateSnapshot);
    // The in-memory project is untouched: serialization is not a mutation.
    expect(project.building.site.windClimateSnapshot ?? null).toBeNull();

    const restored = deserializeProject(serialized).project;
    expect(restored.building.site.windClimateSnapshot).toEqual(windClimateSnapshot);
    expect(restoreProjectWindClimate(restored.building.site)).toMatchObject({
      prevailingDirectionDeg: 67.5,
      prevailingMeanSpeed: 4.3,
    });
  });

  it('carries the dataset version, so a dataset change invalidates it on read', () => {
    const project = located(createProject('Offline Wind'));
    const snapshot = snapshotOf();
    expect(snapshot.datasetVersion).toBe(WIND_CLIMATE_DATASET_VERSION);
    const site = { ...project.building.site, windClimateSnapshot: { ...snapshot, datasetVersion: 'something-else' } };
    expect(restoreProjectWindClimate(site)).toBeNull();
  });

  it('is left alone by a save that has nothing newer to write', () => {
    const project = located(createProject('Offline Wind'));
    const saved = serializeProject(project, { windClimateSnapshot: snapshotOf() });
    const loaded = deserializeProject(saved).project;
    // Autosave passes no snapshot: whatever the file carried survives.
    const resaved = serializeProject(loaded);
    expect(resaved.data.building.site.windClimateSnapshot).toEqual(snapshotOf());
  });
});
