/**
 * The wind-climate fetch cache: localStorage, keyed by location + period.
 *
 * Why it lives here rather than in the project (plan amendment 14, issue 7A as
 * corrected by Tension 10): the previous design wrote every fetched climate
 * into project state through a building command, which put a network result on
 * the undo stack. Enabling a wind study destroyed the redo stack, and undoing
 * far enough threw the climate away. A fetch cache is not a document edit, so
 * it does not belong in the document.
 *
 * Two rules govern everything below:
 *
 *  1. Storage failure is never an error. Quota exhausted, storage disabled,
 *     private-mode `localStorage` that throws on ACCESS, a hand-edited entry
 *     that is not JSON — each degrades to "no cache", the caller fetches
 *     through, and the study runs. Nothing here throws.
 *  2. Nothing believed without checking. Entries are validated by the same
 *     allowlisting reader the project-file snapshot goes through
 *     (`readWindClimateSnapshot`): localStorage is user-writable too.
 */

import {
  createWindClimateSnapshot,
  readWindClimateSnapshot,
  windClimateCacheKey,
  windClimatePeriod,
} from '@/analysis/windClimate';

function storage() {
  try {
    const store = globalThis.localStorage;
    return store && typeof store.getItem === 'function' ? store : null;
  } catch {
    // Reading the property itself throws when storage is blocked by policy.
    return null;
  }
}

/** The raw stored object for a key, or null. Never throws. */
function readEntry(key) {
  if (!key) return null;
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A cached climate for this site, or null when there is none fresh enough.
 * The TTL lives in `@/analysis/windClimate` and is applied here.
 */
export function readCachedWindClimate(key, site, { now = Date.now() } = {}) {
  return readWindClimateSnapshot(readEntry(key), site, { now, requireFresh: true });
}

/**
 * Store a fetched climate. Returns whether it landed, which the caller is free
 * to ignore — a false is a cache miss next time, not a failure to report.
 */
export function writeCachedWindClimate(key, climate, { now = new Date() } = {}) {
  if (!key) return false;
  const store = storage();
  if (!store) return false;
  const snapshot = createWindClimateSnapshot(climate, { now });
  if (!snapshot) return false;
  try {
    store.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch {
    // QuotaExceededError, or storage disabled between the read and the write.
    return false;
  }
}

/** The cache key for a project's current site and the current five-year period. */
export function projectWindClimateCacheKey(project, { now = new Date() } = {}) {
  const site = project?.building?.site;
  if (!site) return null;
  return windClimateCacheKey({ latitude: site.latitude, longitude: site.longitude, ...windClimatePeriod(now) });
}

/**
 * The snapshot an EXPLICIT save writes into the project file, taken from the
 * fetch cache rather than from project state.
 *
 * No freshness requirement: saving a slightly stale copy is strictly better
 * than saving none, because this is what makes the project readable offline on
 * another machine. Returns null when the site has no coordinates, when nothing
 * has been fetched for it, or when storage is unavailable — in which case the
 * snapshot already in project state (if any) is written through untouched.
 */
export function currentWindClimateSnapshot(project, { now = new Date() } = {}) {
  const key = projectWindClimateCacheKey(project, { now });
  if (!key) return null;
  const climate = readWindClimateSnapshot(readEntry(key), project?.building?.site);
  return climate ? createWindClimateSnapshot(climate, { now }) : null;
}
