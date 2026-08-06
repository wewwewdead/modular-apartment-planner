/* @vitest-environment jsdom */
/**
 * The wind climate as a CACHE rather than a document edit (plan amendment 14,
 * issue 7A as corrected by Tension 10).
 *
 * The headline is the undo/redo proof at the bottom, which is the bug the whole
 * amendment exists for: the old hook dispatched the fetched climate into project
 * state through `EXECUTE_BUILDING_COMMAND`, and `applyProjectUpdate` clears
 * `future` on every project write. So enabling a wind study — a read-only act,
 * as far as the reader is concerned — silently destroyed the redo stack, and an
 * undo that reached past the write threw the climate away with it.
 *
 * Everything is real except two globals jsdom does not have: `Worker` (stubbed,
 * as in `useWindStudy.dom.test.jsx`) and `fetch`. No test here reaches the
 * network, and every one of them clears `localStorage` first.
 */

import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { createWindApartmentProject } from '@/analysis/__fixtures__/windApartmentProject';
import {
  createWindClimateSnapshot,
  deriveWindClimate,
  WIND_CLIMATE_CACHE_TTL_MS,
  windClimateCacheKey,
  windClimatePeriod,
} from '@/analysis/windClimate';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import { writeCachedWindClimate } from '@/persistence/windClimateCache';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { FloorplanProvider, useFloorplanContext } from '../context/FloorplanContext';
import { WindStudyProvider, useWindStudy } from '../context/WindStudyContext';

/** useWindStudy.js:6 */
const SETTLE_MS = 500;
const CEBU = { latitude: 10.32, longitude: 123.89, timeZone: 'Asia/Manila' };
const NOW = new Date('2026-08-06T00:00:00Z');
const PERIOD = windClimatePeriod(NOW);
const CACHE_KEY = windClimateCacheKey({ ...CEBU, ...PERIOD });

class StubWorker {
  constructor() {
    this.messages = [];
    this.listeners = [];
  }
  addEventListener(type, handler) {
    this.listeners.push([type, handler]);
  }
  postMessage(message) {
    this.messages.push(message);
  }
  terminate() {}
}

/** An Open-Meteo archive response, `directionDeg` degrees at `speed` m/s. */
function meteoPayload({ directionDeg = 90, speed = 5 } = {}) {
  return {
    latitude: 10.3,
    longitude: 123.9,
    elevation: 40,
    hourly: {
      wind_speed_10m: Array(48).fill(speed),
      wind_direction_10m: Array(48).fill(directionDeg),
    },
  };
}

function stubFetch(payload = meteoPayload()) {
  const impl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }));
  vi.stubGlobal('fetch', impl);
  return impl;
}

function offlineFetch() {
  const impl = vi.fn(() => Promise.reject(new Error('offline')));
  vi.stubGlobal('fetch', impl);
  return impl;
}

/** The same climate the stubbed response derives to, for seeding caches directly. */
function climateFor({ directionDeg = 90, speed = 5, ...metadata } = {}) {
  return deriveWindClimate({
    speeds: Array(48).fill(speed),
    directions: Array(48).fill(directionDeg),
    metadata: {
      locationKey: '10.3200|123.8900',
      period: PERIOD.label,
      startDate: PERIOD.startDate,
      endDate: PERIOD.endDate,
      cachedAt: NOW.toISOString(),
      ...metadata,
    },
  });
}

function locatedProject(site = {}) {
  const project = executeBuildingCommand(createWindApartmentProject(), {
    type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
    ...CEBU,
  }).project;
  return { ...project, building: { ...project.building, site: { ...project.building.site, ...site } } };
}

function Capture({ handleRef }) {
  const context = useFloorplanContext();
  useEffect(() => {
    handleRef.current = context;
  });
  return null;
}

function Probe({ climateRef }) {
  const wind = useWindStudy();
  useEffect(() => {
    climateRef.current = wind.climate;
  });
  return (
    <span
      data-probe="climate"
      data-status={wind.climate?.status ?? 'none'}
      data-updated={String(Boolean(wind.climate?.updated))}
      data-offline-ready={String(Boolean(wind.climate?.offlineReady))}
    />
  );
}

function mount(project) {
  const handleRef = { current: null };
  const climateRef = { current: null };
  const element = (
    <ConfirmDialogProvider>
      <FloorplanProvider initialProject={project} isPlayground>
        <WindStudyProvider>
          <Capture handleRef={handleRef} />
          <Probe climateRef={climateRef} />
        </WindStudyProvider>
      </FloorplanProvider>
    </ConfirmDialogProvider>
  );
  const router = createMemoryRouter([{ path: '/', element }]);
  const view = render(<RouterProvider router={router} />);
  const node = () => view.container.querySelector('[data-probe="climate"]');
  return {
    read: () => ({
      status: node().getAttribute('data-status'),
      updated: node().getAttribute('data-updated') === 'true',
      offlineReady: node().getAttribute('data-offline-ready') === 'true',
    }),
    climate: () => climateRef.current,
    state: () => handleRef.current.state,
    send: (...actions) =>
      act(() => {
        for (const action of actions) handleRef.current.dispatch(action);
      }),
    unmount: view.unmount,
  };
}

/** Drain the fetch promise chain and the study's debounce. */
async function flush() {
  for (let step = 0; step < 8; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  await act(async () => {
    vi.advanceTimersByTime(SETTLE_MS);
  });
}

async function enabled(project) {
  const view = mount(project);
  await view.send({ type: 'TOGGLE_WIND_STUDY' });
  await flush();
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('Worker', StubWorker);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('the wind climate fetch cache lives in localStorage', () => {
  it('fetches once for a located site and stores the result under the location key', async () => {
    const fetchImpl = stubFetch();
    const view = await enabled(locatedProject());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(view.read().status).toBe('ready');
    expect(view.state().editor.windStudy.windRoseSource).toBe('site-climate');
    expect(view.state().editor.windStudy.windClimate.locationKey).toBe('10.3200|123.8900');

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
    expect(stored).toMatchObject({ locationKey: '10.3200|123.8900', capturedAt: NOW.toISOString() });
    expect(stored.normals.windRose).toHaveLength(16);
  });

  it('serves a second session from storage without touching the network', async () => {
    const first = stubFetch();
    const view = await enabled(locatedProject());
    expect(first).toHaveBeenCalledTimes(1);
    view.unmount();
    cleanup();

    const second = stubFetch();
    const reopened = await enabled(locatedProject());
    expect(second).not.toHaveBeenCalled();
    expect(reopened.read().status).toBe('ready');
    expect(reopened.state().editor.windStudy.windClimate.locationKey).toBe('10.3200|123.8900');
  });

  it('fetches again once the entry is older than the 30-day TTL', async () => {
    writeCachedWindClimate(CACHE_KEY, climateFor(), { now: NOW });
    vi.setSystemTime(new Date(NOW.getTime() + WIND_CLIMATE_CACHE_TTL_MS + 1));

    const fetchImpl = stubFetch();
    await enabled(locatedProject());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetches through when storage is unavailable, and still runs the study', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const fetchImpl = stubFetch();
    const view = await enabled(locatedProject());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(view.read().status).toBe('ready');
    expect(view.state().editor.windStudy.windRoseSource).toBe('site-climate');
    setItem.mockRestore();
  });

  it('never reaches the network for a project with no site coordinates', async () => {
    const fetchImpl = stubFetch();
    const view = await enabled(createWindApartmentProject());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(view.read().status).toBe('unavailable');
  });
});

describe('the snapshot the project file carries', () => {
  it('runs the study offline, before any fetch, from a saved snapshot', async () => {
    const fetchImpl = offlineFetch();
    const view = await enabled(locatedProject({ windClimateSnapshot: createWindClimateSnapshot(climateFor()) }));

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(view.read()).toMatchObject({ status: 'ready', offlineReady: true, updated: false });
    expect(view.state().editor.windStudy.windRoseSource).toBe('site-climate');
    expect(view.state().editor.windStudy.directionDeg).toBe(90);
  });

  it('also reads the legacy pre-amendment-14 project cache', async () => {
    const legacy = climateFor();
    const fetchImpl = offlineFetch();
    const view = await enabled(
      locatedProject({
        windClimateCache: { schemaVersion: 1, ...legacy.metadata, windRose: legacy.windRose },
      }),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(view.read()).toMatchObject({ status: 'ready', offlineReady: true });
    expect(view.state().editor.windStudy.windClimate.locationKey).toBe('10.3200|123.8900');
  });

  it('says so, visibly, when the cached data no longer matches the saved snapshot', async () => {
    // A file saved with a rose fitted for an older five-year window, and a
    // fetch cache holding the current one. The newer data is used; the reader
    // is told rather than left to notice the numbers moved.
    const saved = createWindClimateSnapshot(
      climateFor({ directionDeg: 180, speed: 3, period: '2020–2024', startDate: '2020-01-01', endDate: '2024-12-31' }),
    );
    writeCachedWindClimate(CACHE_KEY, climateFor({ directionDeg: 90, speed: 5 }), { now: NOW });

    const fetchImpl = stubFetch();
    const view = await enabled(locatedProject({ windClimateSnapshot: saved }));

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(view.read()).toMatchObject({ status: 'ready', updated: true });
    expect(view.state().editor.windStudy.directionDeg).toBe(90);
  });

  it('does not cry wolf when the cache agrees with the snapshot', async () => {
    writeCachedWindClimate(CACHE_KEY, climateFor(), { now: NOW });
    const view = await enabled(locatedProject({ windClimateSnapshot: createWindClimateSnapshot(climateFor()) }));
    expect(view.read()).toMatchObject({ status: 'ready', updated: false });
  });

  it('falls back to an out-of-period snapshot when the network is unreachable', async () => {
    const fetchImpl = offlineFetch();
    const stale = createWindClimateSnapshot(
      climateFor({ directionDeg: 180, period: '2020–2024', startDate: '2020-01-01', endDate: '2024-12-31' }),
    );
    const view = await enabled(locatedProject({ windClimateSnapshot: stale }));

    // It tried the network first — the snapshot is not for the current period —
    // and used the saved copy rather than reporting a failure nobody can act on.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(view.read().status).toBe('ready');
    expect(view.state().editor.windStudy.directionDeg).toBe(180);
  });

  it('reports a failed refresh instead of silently reusing the snapshot', async () => {
    const view = await enabled(locatedProject({ windClimateSnapshot: createWindClimateSnapshot(climateFor()) }));
    expect(view.read().status).toBe('ready');

    offlineFetch();
    await act(async () => {
      view.climate().refresh();
    });
    await flush();
    expect(view.read().status).toBe('error');
  });
});

describe('the climate never enters the document', () => {
  it('writes nothing to the project when it loads and applies a climate', async () => {
    stubFetch();
    const view = mount(locatedProject());
    const before = view.state().project;
    const changeVersion = view.state().changeVersion;

    await view.send({ type: 'TOGGLE_WIND_STUDY' });
    await flush();

    expect(view.state().editor.windStudy.windRoseSource).toBe('site-climate');
    expect(view.state().project).toBe(before);
    expect(view.state().changeVersion).toBe(changeVersion);
    expect(view.state().isDirty).toBe(false);
    expect(view.state().project.building.site.windClimateCache).toBeNull();
    expect(view.state().project.building.site.windClimateSnapshot).toBeNull();
  });

  /**
   * THE HEADLINE (plan amendment 14).
   *
   * Edit, undo, then enable the wind study — the sequence that used to eat the
   * redo stack, because the climate write went through `EXECUTE_BUILDING_COMMAND`
   * and every project write clears `future` (projectStateHelpers.js:26).
   */
  it('leaves the redo stack intact when a wind study loads its climate', async () => {
    const fetchImpl = stubFetch();
    const view = mount(locatedProject());
    const floorId = view.state().project.floors[0].id;

    await view.send({
      type: 'WINDOW_UPDATE',
      floorId,
      window: { id: 'win_nw_north', ventilation: { operable: true, openFraction: 0.2, dischargeCoefficient: 0.62 } },
    });
    expect(view.state().changeVersion).toBe(1);
    expect(view.state().history).toHaveLength(1);

    await view.send({ type: 'UNDO' });
    expect(view.state().future).toHaveLength(1);
    expect(view.state().history).toHaveLength(0);
    const undoneVersion = view.state().changeVersion;
    const undoneProject = view.state().project;

    // The act under test: switching the study on triggers the climate load.
    await view.send({ type: 'TOGGLE_WIND_STUDY' });
    await flush();

    // Guard against a vacuous pass — a climate really was fetched and applied.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(view.read().status).toBe('ready');
    expect(view.state().editor.windStudy.windRoseSource).toBe('site-climate');

    // The proof: the redo stack survived, no history entry was pushed, the
    // change counter never moved, and the project object is the same one.
    expect(view.state().future).toHaveLength(1);
    expect(view.state().history).toHaveLength(0);
    expect(view.state().changeVersion).toBe(undoneVersion);
    expect(view.state().project).toBe(undoneProject);

    // And redo still does what it always did.
    await view.send({ type: 'REDO' });
    const window = view.state().project.floors[0].windows.find((entry) => entry.id === 'win_nw_north');
    expect(window.ventilation.openFraction).toBe(0.2);
    expect(view.state().future).toHaveLength(0);
    expect(view.state().editor.windStudy.windRoseSource).toBe('site-climate');
  });

  it('keeps a refresh out of the undo chain too', async () => {
    stubFetch();
    const view = await enabled(locatedProject());
    const project = view.state().project;
    const changeVersion = view.state().changeVersion;

    stubFetch(meteoPayload({ directionDeg: 180, speed: 7 }));
    await act(async () => {
      view.climate().refresh();
    });
    await flush();

    expect(view.state().editor.windStudy.directionDeg).toBe(180);
    expect(view.state().project).toBe(project);
    expect(view.state().changeVersion).toBe(changeVersion);
    expect(view.state().history).toHaveLength(0);
  });
});
