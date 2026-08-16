/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RENDER_STYLE,
  INTERIOR_LIGHTS_STORAGE_KEY,
  NIGHT_MODE_STORAGE_KEY,
  RENDER_STYLES,
  RENDER_STYLE_STORAGE_KEY,
  persistInteriorLightsPreference,
  persistNightModePreference,
  persistRenderStylePreference,
  readInteriorLightsPreference,
  readNightModePreference,
  readRenderStylePreference,
} from './renderStyle';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('the stored render style preference', () => {
  it('round-trips', () => {
    persistRenderStylePreference(RENDER_STYLES.SHADED);
    expect(readRenderStylePreference()).toBe(RENDER_STYLES.SHADED);
  });

  it('ignores a value someone else left in the key', () => {
    window.localStorage.setItem(RENDER_STYLE_STORAGE_KEY, 'wireframe');
    expect(readRenderStylePreference()).toBe(DEFAULT_RENDER_STYLE);
  });

  it('normalises what it writes, so a bad value cannot be stored', () => {
    persistRenderStylePreference('wireframe');
    expect(window.localStorage.getItem(RENDER_STYLE_STORAGE_KEY)).toBe(DEFAULT_RENDER_STYLE);
  });

  it('survives storage being unavailable', () => {
    // Private browsing, a full quota, or a blocked origin all throw here, and
    // none of them are a reason for the preview to fail to open.
    // Spied on the prototype, not the instance: jsdom's localStorage forwards
    // through Storage.prototype, so an own-property stub on the instance is
    // simply not the function that ends up being called.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(readRenderStylePreference()).toBe(DEFAULT_RENDER_STYLE);
    expect(persistRenderStylePreference(RENDER_STYLES.SHADED)).toBe(false);
  });
});

describe('the stored interior lighting preferences', () => {
  it('starts with the lamps on and the sun up', () => {
    expect(readInteriorLightsPreference()).toBe(true);
    expect(readNightModePreference()).toBe(false);
  });

  it('round-trips both switches', () => {
    persistInteriorLightsPreference(false);
    persistNightModePreference(true);
    expect(window.localStorage.getItem(INTERIOR_LIGHTS_STORAGE_KEY)).toBe('false');
    expect(window.localStorage.getItem(NIGHT_MODE_STORAGE_KEY)).toBe('true');
    expect(readInteriorLightsPreference()).toBe(false);
    expect(readNightModePreference()).toBe(true);
  });

  it('falls back to the default for anything that is not a stored boolean', () => {
    window.localStorage.setItem(INTERIOR_LIGHTS_STORAGE_KEY, 'dimmed');
    window.localStorage.setItem(NIGHT_MODE_STORAGE_KEY, '1');
    expect(readInteriorLightsPreference()).toBe(true);
    expect(readNightModePreference()).toBe(false);
  });

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(readInteriorLightsPreference()).toBe(true);
    expect(readNightModePreference()).toBe(false);
    expect(persistInteriorLightsPreference(false)).toBe(false);
    expect(persistNightModePreference(true)).toBe(false);
  });
});
