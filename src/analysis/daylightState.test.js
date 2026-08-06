import { describe, expect, it } from 'vitest';
import {
  DAYLIGHT_MODES,
  applyDaylightPatch,
  createDaylightState,
  gridSettingsOf,
  reflectancesOf,
} from './daylightState';

describe('daylight study settings', () => {
  it('starts switched off, on the analytic method', () => {
    const state = createDaylightState();
    expect(state.enabled).toBe(false);
    expect(state.mode).toBe('average');
    expect(DAYLIGHT_MODES).toContain(state.mode);
  });

  it('starts from clear double glazing in a light interior', () => {
    const state = createDaylightState();
    expect(state.transmittance).toBeGreaterThan(0.5);
    expect(state.ceilingReflectance).toBeGreaterThan(state.wallReflectance);
    expect(state.wallReflectance).toBeGreaterThan(state.floorReflectance);
  });

  it('takes overrides at construction', () => {
    expect(createDaylightState({ enabled: true, rayCount: 1024 }).rayCount).toBe(1024);
  });
});

describe('patching', () => {
  const base = createDaylightState();

  it('accepts valid values', () => {
    expect(applyDaylightPatch(base, { enabled: true }).enabled).toBe(true);
    expect(applyDaylightPatch(base, { mode: 'grid' }).mode).toBe('grid');
    expect(applyDaylightPatch(base, { transmittance: 0.4 }).transmittance).toBeCloseTo(0.4, 6);
  });

  it('rejects an unknown mode instead of storing it', () => {
    expect(applyDaylightPatch(base, { mode: 'radiance' }).mode).toBe(base.mode);
  });

  it('clamps every reflectance and transmittance into 0-1', () => {
    const patched = applyDaylightPatch(base, {
      transmittance: 9,
      frameFactor: -3,
      wallReflectance: 1.4,
      obstructionReflectance: -0.2,
    });
    expect(patched.transmittance).toBe(1);
    expect(patched.frameFactor).toBe(0);
    expect(patched.wallReflectance).toBe(1);
    expect(patched.obstructionReflectance).toBe(0);
  });

  it('keeps the sampling settings inside a workable range', () => {
    expect(applyDaylightPatch(base, { rayCount: 5 }).rayCount).toBe(32);
    expect(applyDaylightPatch(base, { rayCount: 99999 }).rayCount).toBe(4096);
    expect(applyDaylightPatch(base, { sensorSpacing: 1 }).sensorSpacing).toBe(100);
    expect(applyDaylightPatch(base, { workingPlaneHeight: -400 }).workingPlaneHeight).toBe(0);
  });

  it('survives the nonsense a text input can produce', () => {
    const patched = applyDaylightPatch(base, {
      transmittance: NaN,
      rayCount: 'abc',
      designSkyLux: undefined,
      sensorSpacing: null,
    });
    expect(patched.transmittance).toBe(base.transmittance);
    expect(patched.rayCount).toBe(base.rayCount);
    expect(patched.designSkyLux).toBe(base.designSkyLux);
    expect(patched.sensorSpacing).toBe(base.sensorSpacing);
  });

  it('leaves untouched fields alone', () => {
    const patched = applyDaylightPatch(base, { enabled: true });
    expect(patched.wallReflectance).toBe(base.wallReflectance);
    expect(patched.rayCount).toBe(base.rayCount);
  });
});

describe('derived views of the settings', () => {
  it('extracts only what a grid run depends on', () => {
    const state = createDaylightState({ enabled: true });
    const settings = gridSettingsOf(state);
    // `enabled` is not in here on purpose: it decides whether to run at all,
    // and including it would invalidate a cached grid every time the panel is
    // toggled off and on again.
    expect(settings.enabled).toBeUndefined();
    expect(settings.rayCount).toBe(state.rayCount);
    expect(settings.wallReflectance).toBe(state.wallReflectance);
  });

  it('reshapes the reflectances for the formulas', () => {
    const reflectances = reflectancesOf(createDaylightState({ wallReflectance: 0.45 }));
    expect(reflectances.wall).toBeCloseTo(0.45, 6);
    expect(reflectances.glazing).toBeGreaterThan(0);
  });
});
