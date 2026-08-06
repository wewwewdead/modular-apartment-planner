import { describe, expect, it, vi } from 'vitest';
import {
  deriveWindClimate,
  fetchSiteWindClimate,
  fitWeibull,
  restoreSiteWindClimate,
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
