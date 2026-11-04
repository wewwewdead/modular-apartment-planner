import { describe, expect, it } from 'vitest';
import {
  ROOF_COLOUR_CATALOG,
  ROOF_COVERING_CATALOG,
  ROOF_COVERING_KINDS,
  catalogueColour,
  coveringForKind,
  coveringForProduct,
  createDefaultRoofCovering,
  createDefaultRoofTrims,
  formatSlopeReadout,
  normalizeHexColour,
  normalizeRoofCovering,
  normalizeRoofTrims,
  resolveRoofAppearance,
  resolveRoofCoveringProduct,
  roofMaterialKeyForCovering,
  solarAbsorptanceClass,
  suggestRoofBuildUp,
} from './roofCoveringCatalog';

const HEX = /^#[0-9A-F]{6}$/;

describe('ROOF_COVERING_CATALOG', () => {
  const products = Object.values(ROOF_COVERING_CATALOG);

  it('has every required field on every product', () => {
    for (const entry of products) {
      expect(entry).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          kind: expect.any(String),
          label: expect.any(String),
          coverWidth: expect.any(Number),
          ribHeight: expect.any(Number),
          thickness: expect.any(Number),
          minPitchDeg: expect.any(Number),
          massKgM2: expect.any(Number),
          maxTrussSpacing: expect.any(Number),
        }),
      );
      expect(ROOF_COVERING_CATALOG[entry.id]).toBe(entry);
      expect(ROOF_COVERING_KINDS).toContain(entry.kind);
      expect(typeof entry.approx).toBe('boolean');
    }
  });

  it('gives min pitch and every spacing as finite numbers', () => {
    for (const entry of products) {
      expect(Number.isFinite(entry.minPitchDeg)).toBe(true);
      for (const key of ['single', 'end', 'internal']) {
        expect(Number.isFinite(entry.maxSupportSpacing[key])).toBe(true);
      }
    }
  });

  it('carries the published numbers the spec names', () => {
    expect(ROOF_COVERING_CATALOG.corrugated_042).toMatchObject({
      coverWidth: 762,
      ribHeight: 16,
      minPitchDeg: 5,
      maxOverhang: 200,
      maxSupportSpacing: { internal: 1200 },
    });
    expect(ROOF_COVERING_CATALOG.corrugated_048.maxSupportSpacing.internal).toBe(1700);
    expect(ROOF_COVERING_CATALOG.trapezoidal_042).toMatchObject({ ribHeight: 29, minPitchDeg: 2 });
    expect(ROOF_COVERING_CATALOG.trapezoidal_048.maxSupportSpacing.internal).toBe(2600);
    expect(ROOF_COVERING_CATALOG.concealed_700_042).toMatchObject({ coverWidth: 700, ribHeight: 41 });
    expect(ROOF_COVERING_CATALOG.standing_seam_305.approx).toBe(true);
    expect(ROOF_COVERING_CATALOG.concrete_tile_330).toMatchObject({
      minPitchDeg: 15,
      massKgM2: 45,
      maxTrussSpacing: 900,
    });
    expect(ROOF_COVERING_CATALOG.terracotta_320).toMatchObject({ minPitchDeg: 20, massKgM2: 50 });
    expect(ROOF_COVERING_CATALOG.slate_500.minPitchDeg).toBe(22.5);
    expect(ROOF_COVERING_CATALOG.shingle_standard).toMatchObject({ minPitchDeg: 18.4, minPitchDegAlt: 9.5 });
    // A 2 % fall.
    expect(ROOF_COVERING_CATALOG.membrane_standard.minPitchDeg).toBeCloseTo(1.146, 3);
    expect(ROOF_COVERING_CATALOG.membrane_standard.thickness).toBe(2);
  });

  it('resolves a Generic product from the kind', () => {
    const generic = resolveRoofCoveringProduct({ kind: 'metal_trapezoidal', productId: '' });
    expect(generic).toMatchObject({ id: '', generic: true, coverWidth: 762, ribHeight: 29 });
    // A product of another kind does not belong to this covering.
    expect(resolveRoofCoveringProduct({ kind: 'slate', productId: 'corrugated_042' }).generic).toBe(true);
  });
});

describe('ROOF_COLOUR_CATALOG', () => {
  it('lists 22 Colorbond and 20 RAL colours with uppercase hexes', () => {
    expect(ROOF_COLOUR_CATALOG.colorbond).toHaveLength(22);
    expect(ROOF_COLOUR_CATALOG.ral).toHaveLength(20);
    for (const entry of [...ROOF_COLOUR_CATALOG.colorbond, ...ROOF_COLOUR_CATALOG.ral]) {
      expect(entry.hex).toMatch(HEX);
      expect(entry.sa === null || (entry.sa > 0 && entry.sa <= 1)).toBe(true);
    }
  });

  it('carries the swatches the spec quotes', () => {
    expect(catalogueColour('colorbond', 'Manor Red')).toEqual({
      hex: '#5E1D0E',
      name: 'Manor Red',
      catalogue: 'colorbond',
      solarAbsorptance: 0.69,
    });
    expect(catalogueColour('colorbond', 'Monument')).toMatchObject({ hex: '#323233', solarAbsorptance: 0.73 });
    expect(catalogueColour('colorbond', 'Night Sky')).toMatchObject({ hex: '#000000', solarAbsorptance: 0.95 });
    expect(catalogueColour('colorbond', 'Surfmist')).toMatchObject({ hex: '#E4E2D5', solarAbsorptance: 0.33 });
    expect(catalogueColour('ral', 'RAL 7016 Anthracite grey').hex).toBe('#373F43');
    expect(catalogueColour('ral', 'RAL 9005 Jet black').hex).toBe('#0A0A0D');
  });

  it('classes solar absorptance the NCC way', () => {
    expect(solarAbsorptanceClass(0.33)).toBe('light');
    expect(solarAbsorptanceClass(0.44)).toBe('medium');
    expect(solarAbsorptanceClass(0.6)).toBe('dark');
    expect(solarAbsorptanceClass(null)).toBe(null);
  });

  it('normalizes typed hexes', () => {
    expect(normalizeHexColour('5e1d0e')).toBe('#5E1D0E');
    expect(normalizeHexColour('#abc')).toBe(null);
  });
});

describe('covering and trim defaults', () => {
  it('defaults pitched roofs to corrugated Shale Grey and flat roofs to a grey slab', () => {
    expect(createDefaultRoofCovering('gable')).toMatchObject({
      kind: 'metal_corrugated',
      productId: 'corrugated_042',
      finish: 'satin',
      colour: { hex: '#BDBFBA', name: 'Shale Grey', catalogue: 'colorbond', solarAbsorptance: 0.44 },
    });
    expect(createDefaultRoofCovering('flat', 200)).toMatchObject({
      kind: 'concrete_slab',
      thickness: 200,
      finish: 'matte',
      colour: { hex: '#B4B8BC', name: 'Preview grey' },
    });
  });

  it('turns every trim off for flat and custom roofs', () => {
    for (const roofType of ['flat', 'custom']) {
      const trims = createDefaultRoofTrims(roofType);
      for (const key of ['fascia', 'barge', 'gutter', 'downpipes', 'ridgeCap', 'bargeCap']) {
        expect(trims[key].enabled).toBe(false);
      }
      expect(trims.soffit.mode).toBe('open');
    }
    expect(createDefaultRoofTrims('hip').soffit.mode).toBe('boxed');
    expect(createDefaultRoofTrims('hip').bargeCap.enabled).toBe(false);
  });

  it('deep-fills a partial covering and partial trims', () => {
    const covering = normalizeRoofCovering({ kind: 'clay_tile', colour: { hex: '#703731' } }, 'gable');
    // No product stored: the kind's Generic entry, with its reference sizes.
    expect(covering).toMatchObject({ kind: 'clay_tile', productId: '', coverWidth: 320, finish: 'matte' });
    expect(covering.colour).toEqual({ hex: '#703731', name: '#703731', catalogue: 'custom', solarAbsorptance: null });
    const trims = normalizeRoofTrims({ gutter: { profile: 'box_200' } }, 'gable');
    expect(trims.gutter).toEqual({ enabled: true, profile: 'box_200', width: 115, depth: 90 });
  });

  it('switches kind and product with the catalogue sizes, keeping the colour', () => {
    const base = createDefaultRoofCovering('gable');
    const tile = coveringForKind(base, 'concrete_tile');
    expect(tile).toMatchObject({ kind: 'concrete_tile', productId: '', coverWidth: 330, finish: 'matte' });
    expect(tile.colour).toEqual(base.colour);
    expect(coveringForProduct(base, 'corrugated_048')).toMatchObject({ productId: 'corrugated_048' });
  });

  it('suggests a body build-up without applying it', () => {
    expect(suggestRoofBuildUp({ kind: 'metal_corrugated', ribHeight: 16 })).toBe(66);
    expect(suggestRoofBuildUp({ kind: 'metal_concealed', ribHeight: 41 })).toBe(91);
    expect(suggestRoofBuildUp({ kind: 'concrete_tile', ribHeight: 50 })).toBe(75);
    expect(suggestRoofBuildUp({ kind: 'membrane' })).toBe(152);
    expect(suggestRoofBuildUp({ kind: 'concrete_slab' }, 240)).toBe(240);
  });

  it('maps covering kinds onto the roof palette family', () => {
    expect(roofMaterialKeyForCovering('metal_standing_seam')).toBe('roof_metal');
    expect(roofMaterialKeyForCovering('slate')).toBe('roof_tile');
    expect(roofMaterialKeyForCovering('shingle')).toBe('roof_tile');
    expect(roofMaterialKeyForCovering('membrane')).toBe('roof_membrane');
    expect(roofMaterialKeyForCovering('concrete_slab')).toBe('roof_slab');
  });

  it('writes a slope as percent and degrees', () => {
    expect(formatSlopeReadout(25)).toBe('25 % · 14.0°');
    expect(formatSlopeReadout(32.5)).toBe('32.5 % · 18.0°');
  });
});

describe('resolveRoofAppearance', () => {
  const roof = { id: 'roof_1', roofType: 'gable' };

  it('takes the gable infill colour from the first truss system (RT-2)', () => {
    const appearance = resolveRoofAppearance(roof, [
      { id: 'a', endClosures: { colour: { hex: '#5e1d0e', name: 'Manor Red', catalogue: 'colorbond' } } },
      { id: 'b', endClosures: { colour: { hex: '#000000' } } },
    ]);
    expect(appearance.closures).toEqual([{ hex: '#5E1D0E' }]);
    expect(appearance.covering.hex).toBe('#BDBFBA');
  });

  it('falls back to the default infill colour for a system saved before closures existed', () => {
    expect(resolveRoofAppearance(roof, [{ id: 'old' }]).closures).toEqual([{ hex: '#E9E5DD' }]);
  });

  it('has no closures without truss systems, and answers for closures alone without a roof', () => {
    expect(resolveRoofAppearance(roof).closures).toEqual([]);
    expect(resolveRoofAppearance(null, [])).toBeNull();
    expect(resolveRoofAppearance(null, [{ id: 'a' }])).toEqual({
      covering: null,
      trims: null,
      soffit: null,
      closures: [{ hex: '#E9E5DD' }],
    });
  });
});
