import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_RENDER_STYLE,
  RENDER_STYLES,
  RENDER_STYLE_PRESETS,
  renderStyleConfig,
  resolveRenderStyle,
  toneMappingConstant,
} from './renderStyle';

// The stored preference needs a window, so it lives in renderStyle.dom.test.js.

describe('render style presets', () => {
  it('describes every style the toggle offers', () => {
    for (const name of Object.values(RENDER_STYLES)) {
      expect(RENDER_STYLE_PRESETS[name]).toBeTruthy();
      expect(RENDER_STYLE_PRESETS[name].label).toBeTruthy();
    }
  });

  it('names a tone mapping three actually has', () => {
    for (const preset of Object.values(RENDER_STYLE_PRESETS)) {
      expect(toneMappingConstant(preset.toneMapping)).not.toBe(THREE.NoToneMapping);
    }
  });

  it('falls back to no tone mapping for a name that does not exist', () => {
    expect(toneMappingConstant('kodachrome')).toBe(THREE.NoToneMapping);
  });

  it('keeps the drawing view a drawing and the render a render', () => {
    const shaded = RENDER_STYLE_PRESETS[RENDER_STYLES.SHADED];
    const realistic = RENDER_STYLE_PRESETS[RENDER_STYLES.REALISTIC];

    // Outlines and the grid are drawing conventions; a photograph has neither.
    expect(shaded.outlines).toBe(true);
    expect(shaded.grid).toBe(true);
    expect(realistic.outlines).toBe(false);
    expect(realistic.grid).toBe(false);

    // And the realistic one is the one that costs something.
    expect(realistic.maxSamples).toBeGreaterThan(shaded.maxSamples);
    expect(realistic.detailStrength).toBeGreaterThan(shaded.detailStrength);
    expect(realistic.sunAngularRadiusDeg).toBeGreaterThan(shaded.sunAngularRadiusDeg);
  });

  it('asks for an occlusion radius in millimetres, not three’s default quarter-unit', () => {
    // GTAO gathers in world units. The library default of 0.25 is a quarter of
    // a millimetre here, which returns a blank pass.
    for (const preset of Object.values(RENDER_STYLE_PRESETS)) {
      expect(preset.aoRadiusMm).toBeGreaterThan(100);
    }
  });
});

describe('resolveRenderStyle', () => {
  it('passes through a style it knows', () => {
    expect(resolveRenderStyle(RENDER_STYLES.SHADED)).toBe(RENDER_STYLES.SHADED);
  });

  it('falls back for anything else', () => {
    expect(resolveRenderStyle('cel')).toBe(DEFAULT_RENDER_STYLE);
    expect(resolveRenderStyle(null)).toBe(DEFAULT_RENDER_STYLE);
    expect(resolveRenderStyle(undefined)).toBe(DEFAULT_RENDER_STYLE);
  });

  it('always hands back a config', () => {
    expect(renderStyleConfig('cel')).toBe(RENDER_STYLE_PRESETS[DEFAULT_RENDER_STYLE]);
  });
});
