/**
 * The sun you can see has to be in the same place as the sun the shadows are
 * computed from, and there is no way to notice by eye that it is not — a sun
 * drawn in the wrong quarter of the sky looks exactly as convincing as one in
 * the right quarter. So the direction is checked against the compass, and the
 * sky against the one property it must never break: getting darker as the sun
 * goes down.
 */

import { describe, expect, it } from 'vitest';
import { createSunSky, skyPalette, sunWorldDirection } from './createSunSky';

const DEG = Math.PI / 180;
const luminance = ([red, green, blue]) => 0.2126 * red + 0.7152 * green + 0.0722 * blue;

describe('sunWorldDirection', () => {
  it('points straight up when the sun is overhead', () => {
    const direction = sunWorldDirection({ altitude: Math.PI / 2, azimuth: 1.2, northAngle: 40 });

    expect(direction.x).toBeCloseTo(0, 6);
    expect(direction.y).toBeCloseTo(1, 6);
    expect(direction.z).toBeCloseTo(0, 6);
  });

  it('puts north at -z and east at +x, matching the plan', () => {
    // Plan y runs down the screen and becomes world z, so the northward plan
    // direction of (0, -1) has to arrive as world (0, 0, -1).
    const north = sunWorldDirection({ altitude: 0, azimuth: 0, northAngle: 0 });
    expect(north.x).toBeCloseTo(0, 6);
    expect(north.z).toBeCloseTo(-1, 6);

    const east = sunWorldDirection({ altitude: 0, azimuth: 90 * DEG, northAngle: 0 });
    expect(east.x).toBeCloseTo(1, 6);
    expect(east.z).toBeCloseTo(0, 6);
  });

  it('swings with the north angle, as the drawing does', () => {
    const direction = sunWorldDirection({ altitude: 0, azimuth: 0, northAngle: 90 });

    expect(direction.x).toBeCloseTo(1, 6);
    expect(direction.z).toBeCloseTo(0, 6);
  });

  it('drops below the horizon with the sun', () => {
    expect(sunWorldDirection({ altitude: -10 * DEG, azimuth: 2, northAngle: 0 }).y).toBeLessThan(0);
  });

  it('is a unit vector at every altitude, so a distance can be scaled along it', () => {
    for (const altitudeDeg of [-40, -5, 0, 12, 45, 89]) {
      for (const azimuthDeg of [0, 73, 180, 291]) {
        const direction = sunWorldDirection({
          altitude: altitudeDeg * DEG,
          azimuth: azimuthDeg * DEG,
          northAngle: 17,
        });
        expect(direction.length()).toBeCloseTo(1, 6);
      }
    }
  });

  it('writes into the vector it is handed, rather than allocating per frame', () => {
    const target = sunWorldDirection({ altitude: 0.3, azimuth: 1, northAngle: 0 });
    const same = sunWorldDirection({ altitude: 0.9, azimuth: 2, northAngle: 0 }, target);

    expect(same).toBe(target);
  });
});

describe('skyPalette', () => {
  it('never brightens as the sun sets', () => {
    // From 25° down through dusk into night, every step of the dial towards
    // midnight has to darken the sky. Above 25° it deliberately goes the other
    // way — see the note on the overhead key — so the run starts there.
    let previous = Infinity;
    for (let altitude = 25; altitude >= -20; altitude -= 1) {
      const { zenith } = skyPalette(altitude);
      expect(luminance(zenith)).toBeLessThanOrEqual(previous + 1e-9);
      previous = luminance(zenith);
    }
  });

  it('deepens the zenith as the sun climbs past the afternoon sky', () => {
    expect(luminance(skyPalette(90).zenith)).toBeLessThan(luminance(skyPalette(25).zenith));
  });

  it('is blue by day and dark by night', () => {
    const [dayRed, , dayBlue] = skyPalette(60).zenith;
    expect(dayBlue).toBeGreaterThan(dayRed);
    expect(luminance(skyPalette(60).zenith)).toBeGreaterThan(120);

    expect(luminance(skyPalette(-18).zenith)).toBeLessThan(45);
  });

  it('warms the horizon while the sun is on it', () => {
    // Gold hour: the horizon runs warm even though the zenith stays cool.
    const sunset = skyPalette(0);
    expect(sunset.horizon[0]).toBeGreaterThan(sunset.horizon[2]);
    expect(sunset.horizon[0]).toBeGreaterThan(sunset.zenith[0]);

    // Midday: no such split, the horizon is just paler sky.
    const noon = skyPalette(60);
    expect(noon.horizon[0]).toBeLessThan(noon.horizon[2]);
  });

  it('holds still outside the range it has colours for', () => {
    expect(skyPalette(-40)).toEqual(skyPalette(-12));
    expect(skyPalette(90)).toEqual(skyPalette(120));
  });
});

describe('createSunSky without a canvas', () => {
  it('degrades to no sun and no sky rather than throwing', () => {
    // Node has no `document`, which is the same position a locked-down browser
    // leaves this in. The study still runs and the shadows are still right;
    // there is simply nothing extra to draw.
    const sunSky = createSunSky();

    expect(sunSky.object.visible).toBe(false);
    expect(sunSky.update({ enabled: true, altitude: 0.8, azimuth: 2, northAngle: 0 })).toBeNull();
    expect(sunSky.object.visible).toBe(false);
    expect(() => sunSky.followCamera({ position: { x: 0, y: 0, z: 0 }, far: 100000 })).not.toThrow();
    expect(() => sunSky.dispose()).not.toThrow();
  });

  it('puts the sun away when the study is switched off', () => {
    const sunSky = createSunSky();

    expect(sunSky.update(null)).toBeNull();
    expect(sunSky.update({ enabled: false, altitude: 1, azimuth: 0, northAngle: 0 })).toBeNull();
    expect(sunSky.object.visible).toBe(false);
  });
});
