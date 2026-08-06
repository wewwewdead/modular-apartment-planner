import { describe, expect, it } from 'vitest';
import { isValidTimeZone, timeZoneOffsetMinutesAt, zonedClockParts, zonedDateTimeToInstant } from './timeZone';

describe('IANA timezone conversion', () => {
  it('validates zones through the runtime timezone database', () => {
    expect(isValidTimeZone('Asia/Manila')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Not/A_Zone')).toBe(false);
  });

  it('reports the date-specific DST offset', () => {
    expect(timeZoneOffsetMinutesAt(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300);
    expect(timeZoneOffsetMinutesAt(new Date('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240);
  });

  it('chooses the earlier instant when a fall-back time repeats', () => {
    const instant = zonedDateTimeToInstant({
      year: 2026,
      month: 11,
      day: 1,
      minutes: 90,
      timeZone: 'America/New_York',
    });

    expect(instant.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(zonedClockParts(instant, 'America/New_York').minutes).toBe(90);
  });

  it('moves a nonexistent spring-forward time to the first compatible time', () => {
    const instant = zonedDateTimeToInstant({
      year: 2026,
      month: 3,
      day: 8,
      minutes: 150,
      timeZone: 'America/New_York',
    });

    expect(instant.toISOString()).toBe('2026-03-08T07:00:00.000Z');
    expect(zonedClockParts(instant, 'America/New_York').minutes).toBe(180);
  });
});
