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
import {
  PALETTE_LOOKS,
  applyRenderStyleToPalette,
  applyRoofAppearanceToPalette,
  createMaterialPalette,
  disposeMaterialPalette,
  ghostMaterialFor,
  ghostMaterialsOf,
  ghostSourceOf,
  syncGhostMaterials,
} from './materials';

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

describe('the corten rainscreen tones', () => {
  const tones = ['wallRainscreen', 'wallRainscreenWarm', 'wallRainscreenDeep'];

  it('is a small fixed set of shared instances', () => {
    // The facade cycles these across every cassette in the scene. Each one is
    // another instanced draw call, so the count is the budget — three, not one
    // per panel and not one per wall.
    expect(new Set(tones.map((key) => palette[key].uuid)).size).toBe(3);
    expect(Object.keys(palette).filter((key) => key.startsWith('wallRainscreen'))).toEqual(tones);
  });

  it('reads as weathered oxide rather than as bare steel', () => {
    for (const key of tones) {
      // The patina is a mineral crust, not a mirror: give it metalness and it
      // starts reflecting the sky, which is the one thing corten stops doing.
      expect(palette[key].metalness, key).toBe(0);
      expect(palette[key].roughness, key).toBeGreaterThan(0.7);
      // Warm and dark enough to be obviously not a painted board.
      expect(palette[key].color.r, key).toBeGreaterThan(palette[key].color.b * 2);
      expect(reflectance(palette[key]), key).toBeLessThan(reflectance(palette.wallFiberCement));
    }
  });

  it('separates the three tones enough to see, without turning into three materials', () => {
    const values = tones.map((key) => reflectance(palette[key])).sort((a, b) => a - b);
    // Visibly stepped — a quilt of related browns is what a cassette facade is.
    expect(values[1] / values[0]).toBeGreaterThan(1.15);
    expect(values[2] / values[1]).toBeGreaterThan(1.15);
    // But still one family: the darkest is not a different substance.
    expect(values[2] / values[0]).toBeLessThan(4);
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
    for (const key of [
      'wallFramingSteel',
      'wallCoreSteel',
      'ceilingFraming',
      'railing_handrail',
      'fixtureAccentMetal',
    ]) {
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
      'wallCoreSteel',
      'wallCoreTimber',
      'slab',
      'roof',
      'column',
      'beam',
      'stair',
      'door',
      'ceilingBoard',
      'ceilingBoardPlywood',
      'ceilingFramingTimber',
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

describe('the white model', () => {
  it('frames its openings in charcoal', () => {
    // A dark powder coat: the frame line that makes a white facade read.
    expect(reflectance(palette.windowFrame)).toBeLessThan(0.1);
  });

  it('puts a warm, transparent, emissive glow behind the glass', () => {
    const glow = palette.windowGlow;
    expect(glow.transparent).toBe(true);
    expect(glow.depthWrite).toBe(false);
    expect(glow.emissiveIntensity).toBeGreaterThan(0);
    // Warm: more red than blue in what it gives off.
    expect(glow.emissive.r).toBeGreaterThan(glow.emissive.b);
    expect(glow.userData.ownedByPalette).toBe(true);
  });

  it('keeps the plants to a small fixed set of shared instances', () => {
    // Like the corten tones: each distinct material is another instanced draw
    // call, so the count is the budget — two leaf greens and a pot.
    const tones = ['plantLeaf', 'plantLeafDeep', 'plantPot'];
    expect(new Set(tones.map((key) => palette[key].uuid)).size).toBe(3);
    expect(Object.keys(palette).filter((key) => key.startsWith('plant'))).toEqual(tones);
  });
});

describe('the roof covering family and the edge kit', () => {
  const ROOF_KEYS = ['roof_metal', 'roof_tile', 'roof_membrane', 'roof_slab', 'roofRidgeCap'];
  const KIT_KEYS = ['roofTrim', 'roofGutter', 'roofDownpipe', 'roofSoffit', 'gableInfill'];

  it('exists in both looks, with surface detail', () => {
    for (const look of [PALETTE_LOOKS.WHITE_MODEL, PALETTE_LOOKS.CLASSIC]) {
      const built = createMaterialPalette({ look });
      for (const key of [...ROOF_KEYS, ...KIT_KEYS, 'roof']) {
        expect(built[key], `${look} ${key}`).toBeInstanceOf(THREE.MeshStandardMaterial);
        expect(built[key].userData.detailFamily, key).toBeTruthy();
      }
    }
  });

  it('keeps `roof` as an alias of `roof_slab`, and the trims as one instance', () => {
    expect(palette.roof).toBe(palette.roof_slab);
    expect(palette.roofGutter).toBe(palette.roofTrim);
    expect(palette.roofDownpipe).toBe(palette.roofTrim);
  });

  it('keeps the classic panes on the grey the roof always had', () => {
    const classic = createMaterialPalette({ look: PALETTE_LOOKS.CLASSIC });
    for (const key of ROOF_KEYS) expect(classic[key].color.getHex(), key).toBe(0xa2a7ab);
  });

  it('paints painted steel as paint, not as a mirror', () => {
    expect(palette.roof_metal.metalness).toBe(0);
    expect(palette.roof_metal.roughness).toBe(0.5);
    expect(palette.roof_tile.roughness).toBe(0.85);
    expect(palette.roof_slab.roughness).toBe(0.9);
  });

  it('applies the project colours to every roof key and leaves the walls alone', () => {
    const live = createMaterialPalette();
    const wallHex = live.wall.color.getHex();
    const result = applyRoofAppearanceToPalette(live, {
      covering: { kind: 'metal_corrugated', hex: '#5E1D0E', finish: 'gloss' },
      trims: { hex: '#323233' },
      soffit: { hex: '#E4E2D5' },
      closures: [{ hex: '#E9E5DD' }],
    });
    expect(result.changed).toBe(true);
    expect(result.recompile).toBe(false);
    for (const key of [...ROOF_KEYS, 'roof']) expect(live[key].color.getHex(), key).toBe(0x5e1d0e);
    for (const key of ['roofTrim', 'roofGutter', 'roofDownpipe']) expect(live[key].color.getHex()).toBe(0x323233);
    expect(live.roofSoffit.color.getHex()).toBe(0xe4e2d5);
    expect(live.gableInfill.color.getHex()).toBe(0xe9e5dd);
    expect(live.roof_metal.roughness).toBe(0.3);
    expect(live.wall.color.getHex()).toBe(wallHex);
    // The same appearance again changes nothing, so the viewport can skip a redraw.
    expect(
      applyRoofAppearanceToPalette(live, {
        covering: { kind: 'metal_corrugated', hex: '#5E1D0E', finish: 'gloss' },
        trims: { hex: '#323233' },
        soffit: { hex: '#E4E2D5' },
        closures: [{ hex: '#E9E5DD' }],
      }).changed,
    ).toBe(false);
  });

  it('turns an unpainted sheet into bare metal, and asks for a program update only then', () => {
    const live = createMaterialPalette();
    const versionBefore = live.roof_metal.version;
    const result = applyRoofAppearanceToPalette(live, {
      covering: { kind: 'metal_corrugated', hex: '#A5A8A6', finish: 'unpainted' },
      trims: { hex: '#A5A8A6' },
      soffit: { hex: '#E4E2D5' },
      closures: [],
    });
    expect(result.recompile).toBe(true);
    expect(live.roof_metal.metalness).toBe(1);
    expect(live.roof_metal.roughness).toBe(0.4);
    expect(live.roof_metal.version).toBeGreaterThan(versionBefore);
    // Tiles and slabs are never metal; fibre cement neither.
    expect(live.roof_tile.metalness).toBe(0);
    expect(live.roofSoffit.metalness).toBe(0);
  });

  it('paints the gable infill alone when a project has trusses but no roof', () => {
    const live = createMaterialPalette();
    const roofHex = live.roof_metal.color.getHex();
    applyRoofAppearanceToPalette(live, { covering: null, trims: null, soffit: null, closures: [{ hex: '#5E1D0E' }] });
    expect(live.gableInfill.color.getHex()).toBe(0x5e1d0e);
    expect(live.roof_metal.color.getHex()).toBe(roofHex);
    expect(live.roof_metal.metalness).toBe(0);
  });

  it('keeps a matte tile at its own roughness', () => {
    const live = createMaterialPalette();
    applyRoofAppearanceToPalette(live, {
      covering: { kind: 'concrete_tile', hex: '#703731', finish: 'matte' },
      trims: { hex: '#703731' },
      soffit: { hex: '#E4E2D5' },
      closures: [],
    });
    expect(live.roof_tile.roughness).toBe(0.85);
    expect(live.roof_metal.roughness).toBe(0.75);
  });
});

describe('ghost twins for the see-through modes', () => {
  it('names every material after its key and remembers the glass it was built as', () => {
    const live = createMaterialPalette();
    for (const [key, material] of Object.entries(live)) {
      if (!material?.isMaterial) continue;
      // Aliases keep their first key; everything else is its own.
      if (key === 'roof') expect(material.userData.paletteKey).toBe('roof_slab');
      else if (key === 'roofGutter' || key === 'roofDownpipe') expect(material.userData.paletteKey).toBe('roofTrim');
      else expect(material.userData.paletteKey).toBe(key);
    }
    expect(live.window.userData.baseOpacity).toBe(live.window.opacity);
    expect(live.wall.userData.baseOpacity).toBeUndefined();
    // After the classic look rewrote it, not before.
    const classic = createMaterialPalette({ look: PALETTE_LOOKS.CLASSIC });
    expect(classic.window.userData.baseOpacity).toBe(0.28);
  });

  it('makes a transparent twin once, and never flips the source', () => {
    const live = createMaterialPalette();
    const twin = ghostMaterialFor(live, live.wall);
    expect(ghostMaterialFor(live, live.wall)).toBe(twin);
    expect(ghostMaterialsOf(live)).toEqual([twin]);
    expect(ghostSourceOf(live, twin)).toBe(live.wall);

    expect(twin).not.toBe(live.wall);
    expect(twin.transparent).toBe(true);
    expect(twin.depthWrite).toBe(false);
    // One pass, not three's back-then-front pair: see `ghostMaterialFor`.
    expect(twin.forceSinglePass).toBe(true);
    expect(twin.side).toBe(live.wall.side);
    expect(twin.userData).toMatchObject({ ghostTwin: true, ownedByPalette: true, paletteKey: 'wall' });
    expect(live.wall.transparent).toBe(false);
    expect(live.wall.depthWrite).toBe(true);
  });

  it('keeps the twin in the detailed program family its source compiles', () => {
    const live = createMaterialPalette();
    for (const key of ['wall', 'slab', 'roof_metal', 'column', 'fixture_sofa', 'railing_handrail']) {
      const twin = ghostMaterialFor(live, live[key]);
      expect(twin.customProgramCacheKey()).toBe(live[key].customProgramCacheKey());
      expect(twin.userData.detailFamily).toEqual(live[key].userData.detailFamily);
      expect(typeof twin.onBeforeCompile).toBe('function');
    }
  });

  it('cools the colour from the source every time, so a re-sync never compounds', () => {
    const live = createMaterialPalette();
    const twin = ghostMaterialFor(live, live.roof_metal);
    const first = twin.color.getHex();
    expect(first).not.toBe(live.roof_metal.color.getHex());
    syncGhostMaterials(live);
    syncGhostMaterials(live);
    expect(twin.color.getHex()).toBe(first);
  });

  it('follows the roof appearance and the style relief', () => {
    const live = createMaterialPalette();
    const twin = ghostMaterialFor(live, live.roof_metal);
    const before = twin.color.getHex();
    applyRoofAppearanceToPalette(live, {
      covering: { kind: 'metal', hex: '#703731', finish: 'unpainted' },
      trims: { hex: '#703731' },
      soffit: { hex: '#E4E2D5' },
      closures: [],
    });
    expect(twin.color.getHex()).not.toBe(before);
    expect(twin.metalness).toBe(live.roof_metal.metalness);
    expect(twin.roughness).toBe(live.roof_metal.roughness);

    applyRenderStyleToPalette(live, renderStyleConfig(RENDER_STYLES.SHADED));
    expect(twin.userData.detailScale).toBe(0);
    applyRenderStyleToPalette(live, renderStyleConfig(RENDER_STYLES.REALISTIC));
    expect(twin.userData.detailScale).toBe(1);
  });

  it('disposes the twins with the palette', () => {
    const live = createMaterialPalette();
    const twin = ghostMaterialFor(live, live.wall);
    let disposed = 0;
    twin.addEventListener('dispose', () => {
      disposed += 1;
    });
    disposeMaterialPalette(live);
    expect(disposed).toBe(1);
    expect(ghostMaterialsOf(live)).toEqual([]);
  });

  it('leaves a non-material alone', () => {
    const live = createMaterialPalette();
    expect(ghostMaterialFor(live, null)).toBeNull();
    expect(ghostMaterialFor(null, live.wall)).toBe(live.wall);
    expect(new THREE.MeshBasicMaterial().userData.paletteKey).toBeUndefined();
  });
});

describe('the framed wall schematic core', () => {
  // Solid must not change when a framed wall's core moved off the framing keys
  // (docs/preview-xray-mode.md §12): same look, separate instances, so only the
  // see-through modes can tell a stand-in slab from the studs it stands for.
  it('looks exactly like the framing it stands for, as its own materials', () => {
    for (const look of Object.values(PALETTE_LOOKS)) {
      const live = createMaterialPalette({ look });
      for (const [core, framing] of [
        ['wallCoreSteel', 'wallFramingSteel'],
        ['wallCoreTimber', 'wallFramingTimber'],
      ]) {
        expect(live[core], core).not.toBe(live[framing]);
        expect(live[core].type, core).toBe(live[framing].type);
        expect(live[core].color.getHex(), core).toBe(live[framing].color.getHex());
        expect(live[core].roughness, core).toBe(live[framing].roughness);
        expect(live[core].metalness, core).toBe(live[framing].metalness);
        expect(live[core].envMapIntensity, core).toBe(live[framing].envMapIntensity);
        expect(live[core].side, core).toBe(live[framing].side);
        expect(live[core].userData.detailFamily, core).toEqual(live[framing].userData.detailFamily);
        expect(live[core].userData.paletteKey, core).toBe(core);
      }
      disposeMaterialPalette(live);
    }
  });
});
