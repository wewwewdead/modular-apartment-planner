import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchSiteWindClimate,
  restoreProjectWindClimate,
  WIND_CLIMATE_SOURCE_URL,
  windClimateCacheKey,
  windClimateDiffers,
  windClimateLocationKey,
  windClimatePeriod,
} from '@/analysis/windClimate';
import { readCachedWindClimate, writeCachedWindClimate } from '@/persistence/windClimateCache';

/**
 * Where a wind climate may come from, in the order this hook tries them.
 *
 * The important one is what is NOT here: project state. A fetched climate is
 * never dispatched into the document (plan amendment 14) — it would land on the
 * undo stack, destroy the redo stack on the way in, and be thrown away by an
 * undo that reached past it. There is deliberately no second in-memory cache
 * either: localStorage IS the fetch cache, and a remount costs one JSON parse.
 *
 *   cache    localStorage, within the 30-day TTL — the fetch cache
 *   project  the versioned snapshot the project file was saved with, or the
 *            legacy `site.windClimateCache` of a file saved before amendment 14
 *   network  Open-Meteo
 *
 * `project` is tried before the network when it is fitted for the CURRENT
 * five-year period: opening a saved project should not require a round trip.
 * When the period has rolled past it, the network is tried first and the
 * snapshot becomes the offline fallback, which is also the case that makes the
 * "climate data updated" notice reachable.
 */
function isCurrentPeriod(climate, period) {
  return climate?.metadata?.startDate === period.startDate && climate?.metadata?.endDate === period.endDate;
}

export function useSiteWindClimate({ site, windStudy, dispatch }) {
  const abortRef = useRef(null);
  const requestRef = useRef(0);
  const [request, setRequest] = useState({ status: 'idle', error: null, metadata: null, updated: false });
  const latitude = Number(site?.latitude);
  const longitude = Number(site?.longitude);
  const locationKey = windClimateLocationKey({ latitude: site?.latitude, longitude: site?.longitude });
  const period = useMemo(() => windClimatePeriod(), []);
  const cacheKey = useMemo(
    () => windClimateCacheKey({ latitude: site?.latitude, longitude: site?.longitude, ...period }),
    [period, site?.latitude, site?.longitude],
  );
  // What the project file itself carries. Read through the allowlisting reader
  // in `@/analysis/windClimate`, never spread from the file as-is.
  const projectClimate = useMemo(
    () =>
      restoreProjectWindClimate({
        latitude: site?.latitude,
        longitude: site?.longitude,
        windClimateSnapshot: site?.windClimateSnapshot,
        windClimateCache: site?.windClimateCache,
      }),
    [site?.latitude, site?.longitude, site?.windClimateCache, site?.windClimateSnapshot],
  );
  const applied = windStudy?.windRoseSource === 'site-climate' && windStudy?.windClimate?.locationKey === locationKey;
  const manualOverride = windStudy?.windRoseSource === 'user';
  const autoRequired = Boolean(windStudy?.enabled && locationKey && !manualOverride && !applied);

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!locationKey) {
        setRequest({
          status: 'unavailable',
          error: 'Set the site location in Sun & Shadow first.',
          metadata: null,
          updated: false,
        });
        return;
      }
      abortRef.current?.abort();
      abortRef.current = null;
      requestRef.current += 1;
      const requestId = requestRef.current;

      // "Refresh online" means the network. The stored copy is bypassed rather
      // than deleted: a refresh that fails offline must not have destroyed the
      // cache it was trying to improve on.
      const cached = force ? null : readCachedWindClimate(cacheKey, { latitude, longitude });
      const seed = !force && !cached && isCurrentPeriod(projectClimate, period) ? projectClimate : null;
      const resolved = cached || seed;

      setRequest({ status: 'loading', error: null, metadata: resolved?.metadata || null, updated: false });
      try {
        let climate = resolved;
        let fetched = false;
        if (!climate) {
          const controller = new AbortController();
          abortRef.current = controller;
          try {
            climate = await fetchSiteWindClimate({ latitude, longitude, signal: controller.signal });
            fetched = true;
          } catch (error) {
            // Offline with a saved snapshot fitted for another period: use it
            // rather than reporting a failure the reader can do nothing about.
            // A user-requested refresh still surfaces its own error.
            if (force || error?.name === 'AbortError' || !projectClimate) throw error;
            climate = projectClimate;
          }
        }
        if (requestId !== requestRef.current) return;

        // Only a network result is written back: the project snapshot is the
        // file's business, and re-writing a cache hit would refresh nothing.
        if (fetched) writeCachedWindClimate(cacheKey, climate);

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
        setRequest({
          status: 'ready',
          error: null,
          metadata: climate.metadata,
          // The numbers on screen are no longer the numbers in the file. Said
          // plainly rather than applied silently; the next explicit save
          // records them.
          updated: climate !== projectClimate && windClimateDiffers(projectClimate, climate),
        });
      } catch (error) {
        if (error?.name === 'AbortError' || requestId !== requestRef.current) return;
        setRequest({
          status: 'error',
          error: error?.message || 'Could not load wind climate data.',
          metadata: null,
          updated: false,
        });
      } finally {
        if (requestId === requestRef.current) abortRef.current = null;
      }
    },
    [cacheKey, dispatch, latitude, locationKey, longitude, period, projectClimate],
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
      setRequest({
        status: 'unavailable',
        error: 'Set the site location in Sun & Shadow first.',
        metadata: null,
        updated: false,
      });
      return;
    }
    if (applied) {
      setRequest((current) =>
        current.status === 'ready' && current.metadata === windStudy.windClimate
          ? current
          : { status: 'ready', error: null, metadata: windStudy.windClimate, updated: current.updated },
      );
      return;
    }
    if (manualOverride) {
      requestRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setRequest({ status: 'manual', error: null, metadata: null, updated: false });
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
