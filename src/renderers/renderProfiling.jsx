import { Profiler, useEffect, useMemo, useRef } from 'react';

const STORAGE_KEY = 'map.debug.renderProfile';
const QUERY_KEY = 'renderProfile';
const GLOBAL_KEY = '__MAP_RENDER_PROFILE__';
const FLUSH_INTERVAL_MS = 1000;

function canUseBrowserApis() {
  return import.meta.env.DEV && typeof window !== 'undefined';
}

function readEnabledFlag() {
  if (!canUseBrowserApis()) return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(QUERY_KEY) === '1') return true;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isRenderProfilingEnabled() {
  return readEnabledFlag();
}

function ensureStore() {
  if (!readEnabledFlag()) return null;

  if (window[GLOBAL_KEY]) {
    return window[GLOBAL_KEY];
  }

  const entries = new Map();
  let flushTimerId = null;

  function getEntry(name) {
    if (!entries.has(name)) {
      entries.set(name, {
        name,
        renders: 0,
        commits: 0,
        totalActualDuration: 0,
        maxActualDuration: 0,
        lastActualDuration: 0,
        lastBaseDuration: 0,
        lastPhase: null,
        lastChangedKeys: [],
      });
    }
    return entries.get(name);
  }

  function flush() {
    flushTimerId = null;
    if (!entries.size) return;

    const summary = [...entries.values()].map((entry) => ({
      component: entry.name,
      renders: entry.renders,
      commits: entry.commits,
      lastPhase: entry.lastPhase || 'n/a',
      lastActualMs: Number(entry.lastActualDuration.toFixed(2)),
      avgActualMs: entry.commits ? Number((entry.totalActualDuration / entry.commits).toFixed(2)) : 0,
      maxActualMs: Number(entry.maxActualDuration.toFixed(2)),
      changed: entry.lastChangedKeys.length ? entry.lastChangedKeys.join(', ') : 'none',
    }));

    // eslint-disable-next-line no-console
    console.groupCollapsed('[render-profile] aggregated summary');
    // eslint-disable-next-line no-console
    console.table(summary);
    // eslint-disable-next-line no-console
    console.info(
      `[render-profile] reset with window.${GLOBAL_KEY}.reset(), flush on demand with window.${GLOBAL_KEY}.flush()`,
    );
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  function scheduleFlush() {
    if (flushTimerId != null) return;
    flushTimerId = window.setTimeout(flush, FLUSH_INTERVAL_MS);
  }

  window[GLOBAL_KEY] = {
    flush,
    reset() {
      entries.clear();
      if (flushTimerId != null) {
        window.clearTimeout(flushTimerId);
        flushTimerId = null;
      }
      // eslint-disable-next-line no-console
      console.info('[render-profile] counters reset');
    },
    recordRender(name, changedKeys = []) {
      const entry = getEntry(name);
      entry.renders += 1;
      entry.lastChangedKeys = changedKeys;
      scheduleFlush();
    },
    recordCommit(name, actualDuration, baseDuration, phase) {
      const entry = getEntry(name);
      entry.commits += 1;
      entry.totalActualDuration += actualDuration;
      entry.maxActualDuration = Math.max(entry.maxActualDuration, actualDuration);
      entry.lastActualDuration = actualDuration;
      entry.lastBaseDuration = baseDuration;
      entry.lastPhase = phase;
      scheduleFlush();
    },
  };

  return window[GLOBAL_KEY];
}

function getChangedKeys(previousValues, nextValues) {
  if (!nextValues) return [];
  if (!previousValues) return Object.keys(nextValues);

  return Object.entries(nextValues).reduce((changed, [key, value]) => {
    if (!Object.is(previousValues[key], value)) {
      changed.push(key);
    }
    return changed;
  }, []);
}

export function useRenderProfile(name, trackedValues = null) {
  const enabled = readEnabledFlag();
  const previousValuesRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const changedKeys = getChangedKeys(previousValuesRef.current, trackedValues);
    previousValuesRef.current = trackedValues;
    ensureStore()?.recordRender(name, changedKeys);
  });
}

export function RenderProfilerScope({ name, children }) {
  const enabled = readEnabledFlag();
  const onRender = useMemo(() => {
    if (!enabled) return null;

    return (_id, phase, actualDuration, baseDuration) => {
      ensureStore()?.recordCommit(name, actualDuration, baseDuration, phase);
    };
  }, [enabled, name]);

  if (!enabled) {
    return children;
  }

  return (
    <Profiler id={name} onRender={onRender}>
      {children}
    </Profiler>
  );
}
