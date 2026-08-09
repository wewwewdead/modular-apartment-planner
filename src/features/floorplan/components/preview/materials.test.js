/**
 * A model is only worth looking at if it tells you what it is built from, and
 * the way that goes wrong is quiet: every finish drifts towards the same
 * flattering pale grey until a poured slab and a cladding sheet are the same
 * object with different names. These tests pin the separations that carry
 * meaning — reflectance, roughness, and surface character — rather than the
 * exact colours, which are free to be tuned.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RENDER_STYLES, renderStyleConfig } from './renderStyle';
import { applyRenderStyleToPalette, createMaterialPalette } from './materials';

/** Relative luminance in linear light — how much of the light a surface sends back. */
function reflectance(material) {
  const { r, g, b } = material.color;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const palette = createMaterialPalette();

describe('concrete against fibre cement', () => {
  it('reflects far more light off the sheet than off the slab', () => {
    // Concrete returns about a quarter of the light that hits it; a fibre
    // cement sheet returns most of it. Measured through the real pipeline, this
    // ratio puts them 68 levels apart out of 255 — the first version of this
    // palette had them at 14, which is why they looked like the same material.
    expect(reflectance(palette.wallFiberCement) / reflectance(palette.slab)).toBeGreaterThan(2.2);
  });

  it('keeps the sheet visibly smoother than anything cast', () => {
    // The satin off a pressed sheet against the dead matte of a pour.
    expect(palette.slab.roughness - palette.wallFiberCement.roughness).toBeGreaterThan(0.15);
  });

  it('gives them different surface character, not just different numbers', () => {
    const slab = palette.slab.userData.detailFamily;
    const sheet = palette.wallFiberCement.userData.detailFamily;

    // Cast: blotchy at the scale of a pour. Milled: no patchiness at all.
    expect(slab.mottle).toBeGreaterThan(0.1);
    expect(sheet.mottle).toBe(0);
    // And the sheet is near flat where the slab has real relief.
    expect(slab.strength).toBeGreaterThan(sheet.strength * 3);
  });
});

describe('the light finishes stay distinguishable from each other', () => {
  it('separates painted render from a fibre cement sheet', () => {
    // These two are genuinely close in tone — a painted wall and a raw sheet
    // are. The separation has to come from finish, not value.
    expect(Math.abs(palette.wall.roughness - palette.wallFiberCement.roughness)).toBeGreaterThan(0.12);
    expect(palette.wall.userData.detailFamily.strength).toBeGreaterThan(
      palette.wallFiberCement.userData.detailFamily.strength * 3,
    );
  });

  it('keeps the ceiling the lightest thing in the room', () => {
    expect(reflectance(palette.ceilingBoard)).toBeGreaterThan(reflectance(palette.wall));
    expect(reflectance(palette.ceilingBoard)).toBeGreaterThan(reflectance(palette.slab));
  });

  it('keeps structure darker than the finishes hung on it', () => {
    for (const key of ['column', 'beam', 'slab']) {
      expect(reflectance(palette[key]), key).toBeLessThan(reflectance(palette.wallFiberCement));
    }
  });
});

describe('metalness', () => {
  it('is only ever fully metal or not metal at all', () => {
    for (const [key, material] of Object.entries(palette)) {
      if (typeof material.metalness !== 'number') continue;
      expect([0, 1], `${key} metalness`).toContain(material.metalness);
    }
  });

  it('makes the real metals metal', () => {
    for (const key of ['wallFramingSteel', 'ceilingFraming', 'railing_handrail', 'fixtureAccentMetal']) {
      expect(palette[key].metalness, key).toBe(1);
    }
  });

  it('leaves coated and cast surfaces dielectric', () => {
    // A powder-coated frame and a concrete column are paint and stone, whatever
    // is underneath them.
    for (const key of ['windowFrame', 'column', 'beam', 'slab', 'wall', 'wallFiberCement']) {
      expect(palette[key].metalness, key).toBe(0);
    }
  });
});

describe('glass', () => {
  it('is transparent and reflects the sky harder than anything else', () => {
    for (const key of ['window', 'railing_glass', 'roofOpening']) {
      expect(palette[key].transparent, key).toBe(true);
      expect(palette[key].roughness, key).toBeLessThan(0.1);
      expect(palette[key].envMapIntensity, key).toBeGreaterThan(1.5);
    }
  });
});

describe('detail assignment', () => {
  it('reaches every material that should have a surface', () => {
    const shouldHaveDetail = [
      'wall',
      'wallFiberCement',
      'wallPlywood',
      'wallFramingSteel',
      'wallFramingTimber',
      'slab',
      'roof',
      'column',
      'beam',
      'stair',
      'door',
      'ceilingBoard',
      'trussChord_timber',
      'trussChord_metal',
    ];
    for (const key of shouldHaveDetail) {
      expect(palette[key]?.userData?.detailFamily, key).toBeTruthy();
    }
  });

  it('is switched off wholesale by the Shaded style', () => {
    const shaded = createMaterialPalette();
    applyRenderStyleToPalette(shaded, renderStyleConfig(RENDER_STYLES.SHADED));
    expect(shaded.slab.userData.detailScale).toBe(0);

    applyRenderStyleToPalette(shaded, renderStyleConfig(RENDER_STYLES.REALISTIC));
    expect(shaded.slab.userData.detailScale).toBe(1);
  });

  it('names only families that exist', () => {
    for (const material of Object.values(palette)) {
      const family = material.userData?.detailFamily;
      if (!family) continue;
      // A typo in the assignment table silently produces the zero family, which
      // looks exactly like "this material was meant to be smooth".
      expect(Number.isFinite(family.frequency)).toBe(true);
      expect(family.frequency).toBeGreaterThan(0);
    }
  });

  it('does not put detail on glass or the outline overlay', () => {
    expect(palette.window.userData.detailFamily).toBeUndefined();
    expect(palette.outline).toBeInstanceOf(THREE.LineBasicMaterial);
    expect(palette.outline.userData.detailFamily).toBeUndefined();
  });
});
