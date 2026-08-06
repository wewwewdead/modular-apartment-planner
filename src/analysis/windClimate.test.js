import { describe, expect, it, vi } from 'vitest';
import {
  createWindClimateSnapshot,
  deriveWindClimate,
  fetchSiteWindClimate,
  fitWeibull,
  isWindClimateSnapshotFresh,
  readWindClimateSnapshot,
  restoreProjectWindClimate,
  restoreSiteWindClimate,
  WIND_CLIMATE_CACHE_KEY_PREFIX,
  WIND_CLIMATE_CACHE_TTL_MS,
  WIND_CLIMATE_DATASET_VERSION,
  WIND_CLIMATE_SNAPSHOT_SCHEMA_VERSION,
  WIND_CLIMATE_SOURCE_URL,
  windClimateCacheKey,
  windClimateDiffers,
  windClimateLocationKey,
  windClimatePeriod,
  windClimateRequestUrl,
} from './windClimate';

describe('wind climate', () => {
  it('uses the five previous complete calendar years', () => {
    expect(windClimatePeriod(new Date('2026-08-05T00:00:00Z'))).toEqual({
      startDate: '2021-01-01',
      endDate: '2025-12-31',
      label: '2021–2025',
    });
  });

  it('builds an archive request for the selected site coordinates', () => {
    const url = new URL(
      windClimateRequestUrl({ latitude: 10.32, longitude: 123.89, startDate: '2021-01-01', endDate: '2025-12-31' }),
    );
    expect(url.hostname).toBe('archive-api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('10.32');
    expect(url.searchParams.get('longitude')).toBe('123.89');
    expect(url.searchParams.get('hourly')).toBe('wind_speed_10m,wind_direction_10m');
    expect(url.searchParams.get('wind_speed_unit')).toBe('ms');
    expect(windClimateLocationKey({ latitude: 10.32, longitude: 123.89 })).toBe('10.3200|123.8900');
    expect(windClimateLocationKey({ latitude: null, longitude: null })).toBeNull();
  });

  it('fits positive Weibull parameters', () => {
    const fit = fitWeibull([1, 2, 3, 4, 5, 6]);
    expect(fit.weibullK).toBeGreaterThan(1);
    expect(fit.weibullC).toBeGreaterThan(fit.meanSpeed);
  });

  it('creates a normalized 16-sector rose and finds the prevailing direction', () => {
    const speeds = Array.from({ length: 48 }, (_, index) => (index < 30 ? 4 : 7));
    const directions = Array.from({ length: 48 }, (_, index) => (index < 30 ? 12 : 190));
    const result = deriveWindClimate({ speeds, directions });
    expect(result.windRose).toHaveLength(16);
    expect(result.windRose.reduce((sum, sector) => sum + sector.frequency, 0)).toBeCloseTo(1);
    expect(result.prevailingDirectionDeg).toBe(22.5);
    expect(result.prevailingMeanSpeed).toBeCloseTo(4);
    expect(result.metadata.sampleCount).toBe(48);
  });

  it('fetches and derives climate metadata without leaking raw hourly arrays', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latitude: 10.3,
        longitude: 123.9,
        elevation: 40,
        hourly: {
          wind_speed_10m: Array(24).fill(5),
          wind_direction_10m: Array(24).fill(90),
        },
      }),
    });
    const result = await fetchSiteWindClimate({
      latitude: 10.32,
      longitude: 123.89,
      now: new Date('2026-08-05T00:00:00Z'),
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.prevailingDirectionDeg).toBe(90);
    expect(result.metadata).toMatchObject({
      period: '2021–2025',
      locationKey: '10.3200|123.8900',
      sampleCount: 24,
      heightM: 10,
    });
    expect(result.metadata).not.toHaveProperty('speeds');
  });

  it('restores a matching compact project cache and rejects another location', () => {
    const climate = deriveWindClimate({
      speeds: Array(24).fill(5),
      directions: Array(24).fill(90),
      metadata: { schemaVersion: 1, locationKey: '10.3200|123.8900', period: '2021–2025' },
    });
    const cache = { ...climate.metadata, windRose: climate.windRose };
    expect(restoreSiteWindClimate(cache, { latitude: 10.32, longitude: 123.89 })).toMatchObject({
      prevailingDirectionDeg: 90,
      prevailingMeanSpeed: 5,
    });
    expect(restoreSiteWindClimate(cache, { latitude: 14.6, longitude: 121 })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Cache identity, snapshots and the untrusted read path (plan amendment 14/18) */
/* -------------------------------------------------------------------------- */

const CEBU = { latitude: 10.32, longitude: 123.89 };

function sampleClimate(metadata = {}) {
  return deriveWindClimate({
    speeds: Array(48).fill(5),
    directions: Array.from({ length: 48 }, (_, index) => (index < 40 ? 90 : 180)),
    metadata: {
      locationKey: '10.3200|123.8900',
      period: '2021–2025',
      startDate: '2021-01-01',
      endDate: '2025-12-31',
      cachedAt: '2026-08-05T00:00:00.000Z',
      source: 'Open-Meteo historical reanalysis',
      ...metadata,
    },
  });
}

describe('wind climate cache key', () => {
  it('keys on the dataset version, the 4-decimal location and the period', () => {
    const key = windClimateCacheKey({ ...CEBU, startDate: '2021-01-01', endDate: '2025-12-31' });
    expect(key).toBe(
      `${WIND_CLIMATE_CACHE_KEY_PREFIX}${WIND_CLIMATE_DATASET_VERSION}|10.3200|123.8900|2021-01-01|2025-12-31`,
    );
    // Same rounding the study matches on, so a hit can never disagree with the
    // site it is applied to.
    expect(
      windClimateCacheKey({ latitude: 10.32001, longitude: 123.89, startDate: '2021-01-01', endDate: '2025-12-31' }),
    ).toBe(key);
    expect(
      windClimateCacheKey({ latitude: 10.33, longitude: 123.89, startDate: '2021-01-01', endDate: '2025-12-31' }),
    ).not.toBe(key);
  });

  it('rolls with the five-year period, so January invalidates last year automatically', () => {
    const thisYear = windClimateCacheKey({ ...CEBU, ...windClimatePeriod(new Date('2026-08-05T00:00:00Z')) });
    const nextYear = windClimateCacheKey({ ...CEBU, ...windClimatePeriod(new Date('2027-01-02T00:00:00Z')) });
    expect(nextYear).not.toBe(thisYear);
  });

  it('has no key without a usable location or period', () => {
    expect(
      windClimateCacheKey({ latitude: null, longitude: null, startDate: '2021-01-01', endDate: '2025-12-31' }),
    ).toBeNull();
    expect(windClimateCacheKey({ ...CEBU, startDate: 'last-tuesday', endDate: '2025-12-31' })).toBeNull();
  });
});

describe('wind climate snapshot', () => {
  it('carries the container version, the dataset version, the location and the normals', () => {
    const snapshot = createWindClimateSnapshot(sampleClimate());
    expect(snapshot).toMatchObject({
      schemaVersion: WIND_CLIMATE_SNAPSHOT_SCHEMA_VERSION,
      datasetVersion: WIND_CLIMATE_DATASET_VERSION,
      locationKey: '10.3200|123.8900',
      capturedAt: '2026-08-05T00:00:00.000Z',
    });
    expect(snapshot.normals.windRose).toHaveLength(16);
    expect(snapshot.normals).toMatchObject({ period: '2021–2025', prevailingDirectionDeg: 90, heightM: 10 });
    // The raw hourly response never reaches the file.
    expect(JSON.stringify(snapshot)).not.toContain('speeds');
  });

  it('dates itself by when the data was fetched, not by when it was saved', () => {
    const snapshot = createWindClimateSnapshot(sampleClimate(), { now: new Date('2026-12-01T00:00:00Z') });
    expect(snapshot.capturedAt).toBe('2026-08-05T00:00:00.000Z');
    // Only a snapshot with no fetch stamp of its own falls back to the clock.
    const undated = createWindClimateSnapshot(sampleClimate({ cachedAt: undefined }), {
      now: new Date('2026-12-01T00:00:00Z'),
    });
    expect(undated.capturedAt).toBe('2026-12-01T00:00:00.000Z');
  });

  it('round-trips through JSON back into an API-shaped climate', () => {
    const original = sampleClimate();
    const snapshot = JSON.parse(JSON.stringify(createWindClimateSnapshot(original)));
    const restored = readWindClimateSnapshot(snapshot, CEBU);
    expect(restored.prevailingDirectionDeg).toBe(original.prevailingDirectionDeg);
    expect(restored.prevailingMeanSpeed).toBeCloseTo(original.prevailingMeanSpeed, 12);
    expect(restored.windRose).toHaveLength(16);
    expect(restored.metadata).toMatchObject({
      locationKey: '10.3200|123.8900',
      period: '2021–2025',
      sectorCount: 16,
      datasetVersion: WIND_CLIMATE_DATASET_VERSION,
    });
    expect(windClimateDiffers(original, restored)).toBe(false);
  });

  it('refuses a snapshot from another container version, dataset or location', () => {
    const snapshot = createWindClimateSnapshot(sampleClimate());
    expect(readWindClimateSnapshot({ ...snapshot, schemaVersion: 1 }, CEBU)).toBeNull();
    expect(readWindClimateSnapshot({ ...snapshot, datasetVersion: 'era5-v9' }, CEBU)).toBeNull();
    expect(readWindClimateSnapshot(snapshot, { latitude: 14.6, longitude: 121 })).toBeNull();
    expect(readWindClimateSnapshot(snapshot, {})).toBeNull();
    expect(readWindClimateSnapshot({ ...snapshot, normals: null }, CEBU)).toBeNull();
    expect(readWindClimateSnapshot(null, CEBU)).toBeNull();
    expect(readWindClimateSnapshot('{}', CEBU)).toBeNull();
  });

  it('applies the 30-day TTL only where it is asked for', () => {
    const snapshot = createWindClimateSnapshot(sampleClimate());
    const captured = Date.parse(snapshot.capturedAt);
    expect(WIND_CLIMATE_CACHE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(isWindClimateSnapshotFresh(snapshot, captured + WIND_CLIMATE_CACHE_TTL_MS - 1)).toBe(true);
    expect(isWindClimateSnapshotFresh(snapshot, captured + WIND_CLIMATE_CACHE_TTL_MS)).toBe(false);
    // A capture stamped in the future (clock change) counts as stale.
    expect(isWindClimateSnapshotFresh(snapshot, captured - 1)).toBe(false);
    expect(isWindClimateSnapshotFresh({ capturedAt: 'never' }, captured)).toBe(false);

    const stale = captured + WIND_CLIMATE_CACHE_TTL_MS + 1;
    expect(readWindClimateSnapshot(snapshot, CEBU, { now: stale, requireFresh: true })).toBeNull();
    // The project file is not on a clock: an old saved snapshot is still what
    // makes the study work offline.
    expect(readWindClimateSnapshot(snapshot, CEBU, { now: stale })).not.toBeNull();
  });

  it('prefers the snapshot over the legacy cache and falls back to it', () => {
    const snapshot = createWindClimateSnapshot(sampleClimate({ period: '2022–2026' }));
    const legacy = { schemaVersion: 1, ...sampleClimate().metadata, windRose: sampleClimate().windRose };
    expect(
      restoreProjectWindClimate({ ...CEBU, windClimateSnapshot: snapshot, windClimateCache: legacy }),
    ).toMatchObject({ metadata: { period: '2022–2026' } });
    expect(restoreProjectWindClimate({ ...CEBU, windClimateCache: legacy })).toMatchObject({
      metadata: { period: '2021–2025' },
    });
    expect(restoreProjectWindClimate({ ...CEBU })).toBeNull();
  });
});

describe('untrusted climate fields (plan amendment 18)', () => {
  const hostile = {
    schemaVersion: WIND_CLIMATE_SNAPSHOT_SCHEMA_VERSION,
    datasetVersion: WIND_CLIMATE_DATASET_VERSION,
    locationKey: '10.3200|123.8900',
    capturedAt: '2026-08-05T00:00:00.000Z',
    onLoad: 'alert(1)',
    __proto__: { polluted: true },
    normals: {
      windRose: createWindClimateSnapshot(sampleClimate()).normals.windRose,
      prevailingDirectionDeg: 450,
      prevailingMeanSpeed: 4.3,
      sourceUrl: 'javascript:alert(1)',
      source: 'Open\u0000-Meteo\u001b[31m',
      period: 'x'.repeat(500),
      startDate: 'not-a-date',
      endDate: '2025-12-31',
      heightM: 1e9,
      sampleCount: -5,
      href: 'javascript:alert(2)',
      html: '<img src=x onerror=alert(3)>',
    },
  };

  it('keeps only allowlisted fields, so nothing unexpected reaches the panel', () => {
    const restored = readWindClimateSnapshot(hostile, CEBU);
    expect(Object.keys(restored).sort()).toEqual([
      'metadata',
      'prevailingDirectionDeg',
      'prevailingMeanSpeed',
      'windRose',
    ]);
    expect(Object.keys(restored.metadata).sort()).toEqual([
      'cachedAt',
      'datasetVersion',
      'endDate',
      'heightM',
      'locationKey',
      'meanSpeed',
      'period',
      'prevailingDirectionDeg',
      'prevailingMeanSpeed',
      'sampleCount',
      'schemaVersion',
      'sectorCount',
      'source',
      'sourceUrl',
      'startDate',
    ]);
    expect(restored.metadata).not.toHaveProperty('href');
    expect(restored.metadata).not.toHaveProperty('html');
    expect(restored.metadata).not.toHaveProperty('onLoad');
  });

  it('never takes a URL from the payload — the source link is the module constant', () => {
    const restored = readWindClimateSnapshot(hostile, CEBU);
    // `sourceUrl` is the one field a renderer could plausibly put in an href.
    expect(restored.metadata.sourceUrl).toBe(WIND_CLIMATE_SOURCE_URL);
    expect(JSON.stringify(restored)).not.toContain('javascript:');
    const legacyRestored = restoreSiteWindClimate(
      {
        schemaVersion: 1,
        ...sampleClimate().metadata,
        sourceUrl: 'javascript:alert(1)',
        windRose: sampleClimate().windRose,
      },
      CEBU,
    );
    expect(legacyRestored.metadata.sourceUrl).toBe(WIND_CLIMATE_SOURCE_URL);
  });

  it('coerces, clamps and de-controls every value it does keep', () => {
    const restored = readWindClimateSnapshot(hostile, CEBU);
    expect(restored.prevailingDirectionDeg).toBe(90); // 450 wrapped
    expect(restored.metadata.heightM).toBe(500); // clamped
    expect(restored.metadata.sampleCount).toBe(0); // clamped
    expect(restored.metadata.startDate).toBe(''); // rejected, not passed through
    expect(restored.metadata.endDate).toBe('2025-12-31');
    expect(restored.metadata.period).toHaveLength(64);
    expect(restored.metadata.source).toBe('Open-Meteo[31m');
    expect(restored.metadata.source).not.toContain('\u0000');
    expect(restored.metadata.source).not.toContain('\u001b');
  });

  it('does not let a legacy cache smuggle extra keys through the old spread', () => {
    // The old implementation was `const { windRose, ...metadata } = cache`,
    // which put every remaining key of the file's object on the metadata.
    const restored = restoreSiteWindClimate(
      {
        schemaVersion: 1,
        ...sampleClimate().metadata,
        windRose: sampleClimate().windRose,
        smuggled: 'anything at all',
        dangerouslySetInnerHTML: { __html: '<script>alert(1)</script>' },
      },
      CEBU,
    );
    expect(restored.metadata).not.toHaveProperty('smuggled');
    expect(restored.metadata).not.toHaveProperty('dangerouslySetInnerHTML');
  });
});

describe('detecting an updated dataset', () => {
  it('is false for the same numbers and true for numbers a reader would notice', () => {
    const climate = sampleClimate();
    expect(windClimateDiffers(climate, sampleClimate())).toBe(false);
    expect(windClimateDiffers(climate, null)).toBe(false);
    expect(windClimateDiffers(climate, { ...climate, prevailingMeanSpeed: climate.prevailingMeanSpeed + 0.01 })).toBe(
      true,
    );
    expect(windClimateDiffers(climate, { ...climate, prevailingDirectionDeg: 180 })).toBe(true);
  });

  it('is true when the period rolled, even if the fit happens to match', () => {
    const climate = sampleClimate();
    const rolled = sampleClimate({ startDate: '2022-01-01', endDate: '2026-12-31', period: '2022–2026' });
    expect(rolled.prevailingMeanSpeed).toBe(climate.prevailingMeanSpeed);
    expect(windClimateDiffers(climate, rolled)).toBe(true);
  });

  it('is true when a single rose sector moved', () => {
    const climate = sampleClimate();
    const nudged = {
      ...climate,
      windRose: climate.windRose.map((sector, index) =>
        index === 4 ? { ...sector, weibullC: sector.weibullC + 0.5 } : sector,
      ),
    };
    expect(windClimateDiffers(climate, nudged)).toBe(true);
  });
});
