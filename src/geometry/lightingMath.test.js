import { describe, expect, it } from 'vitest';
import { COLOR_TEMPERATURES } from '@/domain/lightingCatalog';
import {
  ARTIFICIAL_LIGHT_CALIBRATION,
  INTERIOR_BOUNCE_FLUX_FRACTION,
  MM_LIGHT_INTENSITY_SCALE,
  aimDirectionWorld,
  fixtureBounceIntensity,
  fixtureLightIntensity,
  kelvinToRgb,
  lumensToCandela,
} from './lightingMath';

describe('lumensToCandela', () => {
  it('spreads an omnidirectional lamp over the whole sphere', () => {
    // 800 lm / 4π sr.
    expect(lumensToCandela(800, null)).toBeCloseTo(63.66, 1);
    expect(lumensToCandela(800, undefined)).toBeCloseTo(63.66, 1);
    expect(lumensToCandela(800, 0)).toBeCloseTo(63.66, 1);
    // A "beam" wider than the sphere is the sphere.
    expect(lumensToCandela(800, 360)).toBeCloseTo(63.66, 1);
  });

  it('concentrates a reflector lamp into its cone', () => {
    expect(lumensToCandela(500, 40)).toBeCloseTo(1319.53, 2);
    // Same flux, narrower cone, brighter axis.
    expect(lumensToCandela(500, 20)).toBeGreaterThan(lumensToCandela(500, 40));
  });

  it('returns nothing for a lamp with no flux', () => {
    expect(lumensToCandela(0, 40)).toBe(0);
    expect(lumensToCandela(-100, 40)).toBe(0);
    expect(lumensToCandela('bright', null)).toBe(0);
  });
});

describe('fixtureLightIntensity', () => {
  it('scales candela into a millimetre world, calibrated to the renderer sun', () => {
    expect(MM_LIGHT_INTENSITY_SCALE).toBe(1e6);
    expect(fixtureLightIntensity(800, null)).toBeCloseTo(
      lumensToCandela(800, null) * 1e6 * ARTIFICIAL_LIGHT_CALIBRATION,
      6,
    );
    expect(fixtureLightIntensity(500, 40) / (1e6 * ARTIFICIAL_LIGHT_CALIBRATION)).toBeCloseTo(1319.53, 2);
    // A 650 lm can two metres over the floor should land its pool in the ACES
    // mid-range (~0.3 linear before exposure), not at real-lux 60 — the number
    // that read as pure white in a rendered night room.
    const floorIrradiance = fixtureLightIntensity(650, 110) / (2000 * 2000);
    expect(floorIrradiance).toBeGreaterThan(0.1);
    expect(floorIrradiance).toBeLessThan(1);
  });
});

describe('fixtureBounceIntensity', () => {
  it('returns the flux-balance share of the lamp, not a fraction picked by eye', () => {
    // ρ_floor / (1 − ρ̄) with the design values 0.20 and 0.50.
    expect(INTERIOR_BOUNCE_FLUX_FRACTION).toBeCloseTo(0.4, 12);
    // Inside every published range for an area-weighted interior reflectance,
    // and below it — the first bounce off a downlit floor is the dark one.
    expect(INTERIOR_BOUNCE_FLUX_FRACTION).toBeGreaterThan(0.1);
    expect(INTERIOR_BOUNCE_FLUX_FRACTION).toBeLessThan(0.8);
  });

  it('is the same lamp, omnidirectional, carrying only the bounced flux', () => {
    expect(fixtureBounceIntensity(650)).toBeCloseTo(fixtureLightIntensity(650 * 0.4, null), 6);
    // A 650 lm can puts 260 lm back into the room.
    expect(fixtureBounceIntensity(650) / (1e6 * ARTIFICIAL_LIGHT_CALIBRATION)).toBeCloseTo(260 / (4 * Math.PI), 6);
  });

  it('is scaled by flux and nothing else', () => {
    expect(fixtureBounceIntensity(1300)).toBeCloseTo(fixtureBounceIntensity(650) * 2, 6);
    expect(fixtureBounceIntensity(0)).toBe(0);
    expect(fixtureBounceIntensity(-100)).toBe(0);
    expect(fixtureBounceIntensity('bright')).toBe(0);
  });

  it('stays a fill rather than a second lamp', () => {
    // A downlight's own beam is concentrated into a cone; the light the room
    // gives back is spread over the whole sphere, so it is an order of magnitude
    // weaker on the axis and comparable to it out at the corners.
    for (const [lumens, beam] of [
      [650, 110],
      [500, 40],
      [800, null],
    ]) {
      expect(fixtureBounceIntensity(lumens)).toBeLessThan(fixtureLightIntensity(lumens, beam));
    }
  });

  it('reproduces the enclosure’s own indirect field at the radius it should', () => {
    // Flux balance says E = Φ_b / A; a point source says Φ_b / 4πd². They agree
    // at r* = √(A/4π), which for a 61 m² room is 2.2 m — where a floor and a
    // wall sit from a ceiling fixture.
    const roomAreaM2 = 61.3;
    const matchRadiusMm = Math.sqrt(roomAreaM2 / (4 * Math.PI)) * 1000;
    expect(matchRadiusMm).toBeCloseTo(2208.6, 1);

    // 650 lm → 260 lm bounced → 4.24 lx over 61.3 m². In renderer units that is
    // the same number the point light gives at the match radius.
    const rendererUnitsPerLux = MM_LIGHT_INTENSITY_SCALE * ARTIFICIAL_LIGHT_CALIBRATION * 1e-6;
    expect(fixtureBounceIntensity(650) / (matchRadiusMm * matchRadiusMm)).toBeCloseTo(
      (260 / roomAreaM2) * rendererUnitsPerLux,
      6,
    );
  });
});

describe('kelvinToRgb', () => {
  it('leaves a warm lamp red-dominant', () => {
    const warm = kelvinToRgb(2700);
    expect(warm.r).toBe(1);
    expect(warm.b).toBeGreaterThan(0.4);
    expect(warm.b).toBeLessThan(0.8);
    expect(warm.g).toBeLessThan(warm.r);
    expect(warm.b).toBeLessThan(warm.g);
  });

  it('lands cool daylight on white', () => {
    const daylight = kelvinToRgb(6500);
    expect(daylight.r).toBeGreaterThanOrEqual(0.95);
    expect(daylight.g).toBeGreaterThanOrEqual(0.95);
    expect(daylight.b).toBeGreaterThanOrEqual(0.95);
  });

  it('cools monotonically across the catalog temperatures', () => {
    const blues = COLOR_TEMPERATURES.map((entry) => kelvinToRgb(entry.kelvin).b);
    for (let index = 1; index < blues.length; index += 1) {
      expect(blues[index]).toBeGreaterThanOrEqual(blues[index - 1]);
    }
    expect(blues[0]).toBeLessThan(blues[blues.length - 1]);
  });

  it('clamps out-of-range and unusable input', () => {
    expect(kelvinToRgb(50)).toEqual(kelvinToRgb(1000));
    expect(kelvinToRgb(50000)).toEqual(kelvinToRgb(12000));
    expect(kelvinToRgb('warm')).toEqual(kelvinToRgb(1000));

    for (const channel of Object.values(kelvinToRgb(12000))) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});

describe('aimDirectionWorld', () => {
  // The frame a plan-aligned ceiling gets from getCeilingLocalSpace: U along
  // plan east, V mirrored against plan Y.
  const AXIS_U = { x: 1, y: 0 };
  const AXIS_V = { x: 0, y: -1 };

  it('points straight down when nothing is tilted, whatever the bearing says', () => {
    for (const azimuthDeg of [0, 45, 90, 180, 270, -30]) {
      const direction = aimDirectionWorld({ tiltDeg: 0, azimuthDeg }, AXIS_U, AXIS_V);
      expect(direction.x).toBeCloseTo(0, 12);
      expect(direction.y).toBeCloseTo(-1, 12);
      expect(direction.z).toBeCloseTo(0, 12);
    }
    // A fixture that stores no aim at all is a fixture pointing down.
    expect(aimDirectionWorld(null, AXIS_U, AXIS_V)).toMatchObject({ x: 0, y: -1, z: 0 });
  });

  it('lays a fully tilted beam along the frame axis its bearing names', () => {
    const alongU = aimDirectionWorld({ tiltDeg: 90, azimuthDeg: 0 }, AXIS_U, AXIS_V);
    expect(alongU.x).toBeCloseTo(1, 12);
    expect(alongU.y).toBeCloseTo(0, 12);
    expect(alongU.z).toBeCloseTo(0, 12);

    // +V is mirrored against plan Y, so a quarter turn counter-clockwise in the
    // drawing lands on −z in the world.
    const alongV = aimDirectionWorld({ tiltDeg: 90, azimuthDeg: 90 }, AXIS_U, AXIS_V);
    expect(alongV.x).toBeCloseTo(0, 12);
    expect(alongV.y).toBeCloseTo(0, 12);
    expect(alongV.z).toBeCloseTo(-1, 12);
  });

  it('turns the bearing with the ceiling frame rather than with plan north', () => {
    const angle = Math.PI / 6;
    const axisU = { x: Math.cos(angle), y: Math.sin(angle) };
    // The mirrored partner getCeilingLocalSpace builds.
    const axisV = { x: axisU.y, y: -axisU.x };

    const direction = aimDirectionWorld({ tiltDeg: 90, azimuthDeg: 0 }, axisU, axisV);
    expect(direction.x).toBeCloseTo(axisU.x, 12);
    expect(direction.z).toBeCloseTo(axisU.y, 12);
  });

  it('always hands back a unit vector', () => {
    const angle = 0.4;
    const axisU = { x: Math.cos(angle), y: Math.sin(angle) };
    const axisV = { x: axisU.y, y: -axisU.x };

    for (const tiltDeg of [0, 15, 40, 65, 90]) {
      for (const azimuthDeg of [0, 37, 123, 245, 359]) {
        for (const frame of [
          [AXIS_U, AXIS_V],
          [axisU, axisV],
        ]) {
          const direction = aimDirectionWorld({ tiltDeg, azimuthDeg }, frame[0], frame[1]);
          expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 12);
          // Never above the ceiling: the tilt range stops at the horizontal.
          expect(direction.y).toBeLessThanOrEqual(1e-12);
        }
      }
    }
  });
});
