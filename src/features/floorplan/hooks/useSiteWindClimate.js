import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchSiteWindClimate,
  restoreSiteWindClimate,
  WIND_CLIMATE_SOURCE_URL,
  windClimateLocationKey,
  windClimatePeriod,
} from '@/analysis/windClimate';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';

const climateCache = new Map();

export function useSiteWindClimate({ site, windStudy, dispatch }) {
  const abortRef = useRef(null);
  const requestRef = useRef(0);
  const [request, setRequest] = useState({ status: 'idle', error: null, metadata: null });
  const latitude = Number(site?.latitude);
  const longitude = Number(site?.longitude);
  const locationKey = windClimateLocationKey({ latitude: site?.latitude, longitude: site?.longitude });
  const period = useMemo(() => windClimatePeriod(), []);
  const projectClimate = useMemo(
    () =>
      restoreSiteWindClimate(site?.windClimateCache, {
        latitude: site?.latitude,
        longitude: site?.longitude,
      }),
    [site?.latitude, site?.longitude, site?.windClimateCache],
  );
  const applied = windStudy?.windRoseSource === 'site-climate' && windStudy?.windClimate?.locationKey === locationKey;
  const manualOverride = windStudy?.windRoseSource === 'user';
  const autoRequired = Boolean(windStudy?.enabled && locationKey && !manualOverride && !applied);

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!locationKey) {
        setRequest({ status: 'unavailable', error: 'Set the site location in Sun & Shadow first.', metadata: null });
        return;
      }
      abortRef.current?.abort();
      abortRef.current = null;
      requestRef.current += 1;
      const requestId = requestRef.current;
      const cacheKey = `${locationKey}|${period.startDate}|${period.endDate}`;
      const stored = force ? null : projectClimate;
      const cached = stored || (force ? null : climateCache.get(cacheKey));

      setRequest({ status: 'loading', error: null, metadata: cached?.metadata || null });
      try {
        const controller = new AbortController();
        abortRef.current = controller;
        const climate =
          cached ||
          (await fetchSiteWindClimate({
            latitude,
            longitude,
            signal: controller.signal,
          }));
        if (requestId !== requestRef.current) return;
        climateCache.set(cacheKey, climate);
        if (!stored) {
          dispatch({
            type: 'EXECUTE_BUILDING_COMMAND',
            command: {
              type: BUILDING_COMMANDS.CACHE_SITE_WIND_CLIMATE,
              cache: {
                ...climate.metadata,
                windRose: climate.windRose,
                prevailingDirectionDeg: climate.prevailingDirectionDeg,
                prevailingMeanSpeed: climate.prevailingMeanSpeed,
              },
            },
          });
        }
        dispatch({
          type: 'SET_WIND_STUDY',
          patch: {
            windRose: climate.windRose,
            windRoseSource: 'site-climate',
            windClimate: climate.metadata,
            directionDeg: climate.prevailingDirectionDeg,
            referenceSpeed: climate.prevailingMeanSpeed,
          },
        });
        setRequest({ status: 'ready', error: null, metadata: climate.metadata });
      } catch (error) {
        if (error?.name === 'AbortError' || requestId !== requestRef.current) return;
        setRequest({
          status: 'error',
          error: error?.message || 'Could not load wind climate data.',
          metadata: null,
        });
      } finally {
        if (requestId === requestRef.current) abortRef.current = null;
      }
    },
    [dispatch, latitude, locationKey, longitude, period.endDate, period.startDate, projectClimate],
  );

  useEffect(() => {
    if (!windStudy?.enabled) {
      requestRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    if (!locationKey) {
      requestRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setRequest({ status: 'unavailable', error: 'Set the site location in Sun & Shadow first.', metadata: null });
      return;
    }
    if (applied) {
      setRequest((current) =>
        current.status === 'ready' && current.metadata === windStudy.windClimate
          ? current
          : { status: 'ready', error: null, metadata: windStudy.windClimate },
      );
      return;
    }
    if (manualOverride) {
      requestRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setRequest({ status: 'manual', error: null, metadata: null });
      return;
    }
    load();
  }, [applied, load, locationKey, manualOverride, windStudy?.enabled, windStudy?.windClimate]);

  useEffect(
    () => () => {
      requestRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  return {
    ...request,
    site: locationKey ? { latitude, longitude, timeZone: site?.timeZone || null } : null,
    locationKey,
    period,
    autoRequired,
    offlineReady: Boolean(projectClimate),
    sourceUrl: WIND_CLIMATE_SOURCE_URL,
    activate: () => load({ force: false }),
    refresh: () => load({ force: true }),
  };
}
