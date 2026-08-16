import { describe, expect, it } from 'vitest';
import {
  BEAM_ANGLE_RANGE_DEG,
  BULB_TYPES,
  COLOR_TEMPERATURES,
  DEFAULT_FIXTURE_TYPE_ID,
  FIXTURE_TYPES,
  getBulbType,
  getFixtureType,
  isKnownColorTemperature,
  isPendantFixture,
  resolveFixtureBulbId,
  resolveFixturePhotometrics,
} from './lightingCatalog';

describe('lighting catalog integrity', () => {
  it('rates every lamp', () => {
    for (const bulb of BULB_TYPES) {
      expect(bulb.lumens).toBeGreaterThan(0);
      expect(bulb.watts).toBeGreaterThan(0);
      expect(isKnownColorTemperature(bulb.defaultCct)).toBe(true);
      // A beam is either a real cone or nothing at all.
      expect(bulb.beamAngleDeg === null || bulb.beamAngleDeg > 0).toBe(true);
    }
    expect(new Set(BULB_TYPES.map((bulb) => bulb.id)).size).toBe(BULB_TYPES.length);
  });

  it('gives every fixture a lamp it can take', () => {
    for (const fixture of FIXTURE_TYPES) {
      expect(fixture.allowedBulbs.length).toBeGreaterThan(0);
      expect(fixture.allowedBulbs).toContain(fixture.defaultBulb);
      for (const bulbId of fixture.allowedBulbs) {
        expect(BULB_TYPES.some((bulb) => bulb.id === bulbId)).toBe(true);
      }
      expect(fixture.bulbCount).toBeGreaterThan(0);
      expect(fixture.apertureMm).toBeGreaterThan(0);
    }
    expect(new Set(FIXTURE_TYPES.map((fixture) => fixture.id)).size).toBe(FIXTURE_TYPES.length);
  });

  it('gives an aimable fixture somewhere to aim', () => {
    for (const fixture of FIXTURE_TYPES) {
      expect(fixture.maxTiltDeg > 0).toBe(fixture.aimable);
    }
    expect(FIXTURE_TYPES.some((fixture) => fixture.aimable)).toBe(true);
  });

  it('hangs exactly the fixtures that stand off the ceiling', () => {
    expect(FIXTURE_TYPES.filter((fixture) => isPendantFixture(fixture.id)).map((fixture) => fixture.id)).toEqual([
      'semi_flush',
      'pendant',
      'chandelier_5',
    ]);
    expect(isPendantFixture('recessed_can_6')).toBe(false);
  });

  it('keeps the beam range inside what a reflector can do', () => {
    expect(BEAM_ANGLE_RANGE_DEG).toEqual({ min: 10, max: 160 });
    for (const bulb of BULB_TYPES) {
      if (bulb.beamAngleDeg === null) continue;
      expect(bulb.beamAngleDeg).toBeGreaterThanOrEqual(BEAM_ANGLE_RANGE_DEG.min);
      expect(bulb.beamAngleDeg).toBeLessThanOrEqual(BEAM_ANGLE_RANGE_DEG.max);
    }
  });

  it('lists color temperatures warmest first', () => {
    expect(COLOR_TEMPERATURES.map((entry) => entry.kelvin)).toEqual([2200, 2700, 3000, 3500, 4000, 5000, 6500]);
    expect(isKnownColorTemperature(2700)).toBe(true);
    expect(isKnownColorTemperature(2750)).toBe(false);
    expect(isKnownColorTemperature('2700')).toBe(false);
  });
});

describe('catalog lookups', () => {
  it('falls back rather than returning nothing', () => {
    expect(getBulbType('par30').id).toBe('par30');
    expect(getBulbType('halogen_torch').id).toBe(BULB_TYPES[0].id);
    expect(getFixtureType('pendant').id).toBe('pendant');
    expect(getFixtureType('chandelier_12').id).toBe(DEFAULT_FIXTURE_TYPE_ID);
    expect(getFixtureType(undefined).id).toBe('recessed_can_6');
  });

  it('refuses a lamp the fixture has no socket for', () => {
    expect(resolveFixtureBulbId('wafer_led', 'a19')).toBe('led_disk');
    expect(resolveFixtureBulbId('recessed_can_6', 'par38')).toBe('par38');
    // An unknown fixture resolves against the fallback fixture's own list.
    expect(resolveFixtureBulbId('nope', 'mr16')).toBe('br30');
  });
});

describe('resolveFixturePhotometrics', () => {
  it('reports the whole luminaire, not one lamp', () => {
    const chandelier = { fixtureType: 'chandelier_5', bulbType: 'b11', colorTempK: 2200 };
    expect(resolveFixturePhotometrics(chandelier)).toEqual({
      lumens: 5 * 300,
      watts: 5 * 4,
      beamAngleDeg: null,
      colorTempK: 2200,
    });
  });

  it('prefers the fixture overrides where they are real', () => {
    expect(
      resolveFixturePhotometrics({ fixtureType: 'recessed_can_6', bulbType: 'br30', lumensOverride: 1500 }),
    ).toMatchObject({ lumens: 1500, watts: 9, beamAngleDeg: 110, colorTempK: 2700 });

    expect(resolveFixturePhotometrics({ fixtureType: 'track_head', bulbType: 'gu10', beamAngleDeg: 24 })).toMatchObject(
      { lumens: 450, beamAngleDeg: 24 },
    );

    // Junk falls back to the lamp rather than poisoning the render.
    expect(
      resolveFixturePhotometrics({ fixtureType: 'track_head', bulbType: 'gu10', lumensOverride: 0, colorTempK: 2750 }),
    ).toMatchObject({ lumens: 450, colorTempK: 3000 });
  });

  it('reads a stored null as the lamp, not as a zero', () => {
    // Every fixture the factory writes stores explicit nulls, so this is the
    // shape photometrics actually meets.
    expect(
      resolveFixturePhotometrics({
        fixtureType: 'recessed_can_6',
        bulbType: 'br30',
        lumensOverride: null,
        beamAngleDeg: null,
      }),
    ).toEqual({ lumens: 650, watts: 9, beamAngleDeg: 110, colorTempK: 2700 });
  });

  it('answers for a fixture that names nothing at all', () => {
    expect(resolveFixturePhotometrics(undefined)).toEqual({
      lumens: 650,
      watts: 9,
      beamAngleDeg: 110,
      colorTempK: 2700,
    });
  });
});
