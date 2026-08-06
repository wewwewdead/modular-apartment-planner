import { describe, it, expect } from 'vitest';
import {
  createSunStudyState,
  applySunStudyPatch,
  parseSunStudyDate,
  formatStudyTime,
  siteSupportsSunStudy,
  SUN_STUDY_MODES,
} from './sunStudyState';

describe('applySunStudyPatch', () => {
  const base = createSunStudyState();

  it('applies valid fields', () => {
    const next = applySunStudyPatch(base, { enabled: true, mode: 'range', date: '2026-06-21', minutes: 555 });

    expect(next).toMatchObject({ enabled: true, mode: 'range', date: '2026-06-21', minutes: 555 });
  });

  it('leaves untouched fields alone', () => {
    const next = applySunStudyPatch(base, { minutes: 600 });

    expect(next.date).toBe(base.date);
    expect(next.mode).toBe(base.mode);
  });

  it('clamps the time to a single day', () => {
    expect(applySunStudyPatch(base, { minutes: -30 }).minutes).toBe(0);
    expect(applySunStudyPatch(base, { minutes: 5000 }).minutes).toBe(1439);
    expect(applySunStudyPatch(base, { minutes: 61.7 }).minutes).toBe(62);
  });

  it('ignores nonsense rather than corrupting the study', () => {
    const next = applySunStudyPatch(base, {
      mode: 'wind',
      date: 'sometime in June',
      minutes: Number.NaN,
      enabled: 'yes',
      stepMinutes: 'often',
    });

    expect(next).toEqual(base);
  });

  it('keeps sampling and grid settings inside workable bounds', () => {
    expect(applySunStudyPatch(base, { stepMinutes: 0 }).stepMinutes).toBe(1);
    expect(applySunStudyPatch(base, { stepMinutes: 999 }).stepMinutes).toBe(120);
    expect(applySunStudyPatch(base, { gridCellSize: 1 }).gridCellSize).toBe(100);
    expect(applySunStudyPatch(base, { gridCellSize: 1e9 }).gridCellSize).toBe(20000);
    expect(applySunStudyPatch(base, { thresholdHours: 99 }).thresholdHours).toBe(24);
  });

  it('accepts every declared mode', () => {
    for (const mode of SUN_STUDY_MODES) {
      expect(applySunStudyPatch(base, { mode }).mode).toBe(mode);
    }
  });
});

describe('parseSunStudyDate', () => {
  it('splits an ISO date', () => {
    expect(parseSunStudyDate('2026-06-21')).toEqual({ year: 2026, month: 6, day: 21 });
  });

  it('falls back rather than emitting NaN parts', () => {
    expect(parseSunStudyDate('')).toEqual({ year: 2026, month: 12, day: 21 });
    expect(parseSunStudyDate(null)).toEqual({ year: 2026, month: 12, day: 21 });
  });
});

describe('formatStudyTime', () => {
  it('pads to HH:MM', () => {
    expect(formatStudyTime(0)).toBe('00:00');
    expect(formatStudyTime(9 * 60 + 5)).toBe('09:05');
    expect(formatStudyTime(1439)).toBe('23:59');
  });

  it('clamps out-of-range input', () => {
    expect(formatStudyTime(-10)).toBe('00:00');
    expect(formatStudyTime(99999)).toBe('23:59');
  });
});

describe('siteSupportsSunStudy', () => {
  it('needs both coordinates and a valid civil timezone', () => {
    expect(siteSupportsSunStudy({ latitude: 14.6, longitude: 121, timeZone: 'Asia/Manila' })).toBe(true);
    expect(siteSupportsSunStudy({ latitude: 14.6 })).toBe(false);
    expect(siteSupportsSunStudy({ longitude: 121 })).toBe(false);
    expect(siteSupportsSunStudy({ latitude: null, longitude: 121 })).toBe(false);
    expect(siteSupportsSunStudy(null)).toBe(false);
  });

  it('rejects a missing or unknown timezone', () => {
    expect(siteSupportsSunStudy({ latitude: 51.5, longitude: -0.13 })).toBe(false);
    expect(siteSupportsSunStudy({ latitude: 51.5, longitude: -0.13, timeZone: 'Mars/Olympus' })).toBe(false);
  });

  it('accepts a site at the origin', () => {
    // Zeroes are real coordinates, not missing values.
    expect(siteSupportsSunStudy({ latitude: 0, longitude: 0, timeZone: 'UTC' })).toBe(true);
  });
});
