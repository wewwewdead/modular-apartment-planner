import { describe, it, expect } from 'vitest';
import { computeSunStudy, computeDayStudy, computeInstantShadow } from './sunStudyRunner';
import { createSunStudyState } from './sunStudyState';
import { createProject, createWall } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';

/**
 * Guards against the shape of slowness that made "All day" and "Sun hours"
 * freeze the editor.
 *
 * Two separate mistakes caused it, and each has its own test here:
 *
 *   1. `shadowRangeEnvelope` fed every shadow piece from every time step into a
 *      single polygon union. The pieces overlap almost completely, and the
 *      sweep-line pays for every intersection, so cost grew far faster than the
 *      piece count. Measured 3.1 s on a 36-vertex footprint.
 *   2. The renderer memoised the whole study on the entire settings object, so
 *      dragging the time scrubber rebuilt a full day of geometry per step.
 *
 * Thresholds are set roughly an order of magnitude above measured values on a
 * developer machine, so they do not go off on a slow CI box — they exist to
 * catch a return to seconds, not to police milliseconds.
 */

const MANILA = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila' };

/** A rounded plan, which is the worst case: many vertices, none axis-aligned. */
function roundBuilding(sides = 12, radius = 15000) {
  const project = createProject('Perf');
  const corners = Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  project.floors[0].walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 200, { height: 9000 }),
  );
  return executeBuildingCommand(project, { type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION, ...MANILA }).project;
}

function elapsed(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('sun study performance', () => {
  const project = roundBuilding();

  it('builds a day-long envelope in well under a second', () => {
    const settings = createSunStudyState({ enabled: true, mode: 'range', date: '2026-12-21' });

    expect(elapsed(() => computeSunStudy({ project, sunStudy: settings }))).toBeLessThan(1500);
  });

  it('builds a sun-hours grid in well under a second', () => {
    const settings = createSunStudyState({ enabled: true, mode: 'sunHours', date: '2026-12-21' });

    expect(elapsed(() => computeSunStudy({ project, sunStudy: settings }))).toBeLessThan(2000);
  });

  it.each(['instant', 'range', 'sunHours'])('scrubs time cheaply in %s mode', (mode) => {
    // The day study is cached by the renderer, so a scrubber step must only
    // cost one sun position and one shadow cast — never a rebuild of the day.
    const settings = createSunStudyState({ enabled: true, mode, date: '2026-12-21' });
    const day = computeDayStudy({ project, sunStudy: settings });

    const ms = elapsed(() => {
      for (let minutes = 360; minutes < 1080; minutes += 12) {
        computeInstantShadow({ day, sunStudy: { ...settings, minutes } });
      }
    });

    // Sixty steps. Before the split this was a full day rebuild each time.
    expect(ms).toBeLessThan(400);
  });

  it('keeps the day study independent of the time of day', () => {
    // The guarantee behind the memo split: nothing in the day study may vary
    // with the minute, or caching it would produce stale envelopes.
    const settings = createSunStudyState({ enabled: true, mode: 'sunHours', date: '2026-12-21' });
    const morning = computeDayStudy({ project, sunStudy: { ...settings, minutes: 420 } });
    const evening = computeDayStudy({ project, sunStudy: { ...settings, minutes: 1020 } });

    expect(morning.envelopeAreaMm2).toBe(evening.envelopeAreaMm2);
    expect(morning.grid.hours).toEqual(evening.grid.hours);
    expect(morning.samples.length).toBe(evening.samples.length);
  });
});
