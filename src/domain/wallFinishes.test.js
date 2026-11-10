import { describe, expect, it } from 'vitest';
import {
  MASONRY_FINISH_COAT,
  WALL_COLOUR_CATALOG,
  WALL_FINISH_KINDS,
  defaultWallFinish,
  describeWallFinish,
  normalizeWallFinish,
  parseWallFinishMaterialKey,
  resolveLayerFinish,
  sameWallFinish,
  wallCatalogueColour,
  wallFinishDrawingTint,
  wallFinishHex,
  wallFinishKindsFor,
  wallFinishMaterialKey,
} from './wallFinishes';
import { ROOF_COLOUR_CATALOG } from './roofCoveringCatalog';

const SIGNAL_ORANGE = {
  kind: 'paint',
  colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
  sheen: 'matte',
};

describe('wall finish kinds per face (spec §4)', () => {
  it('offers what each face can actually be finished in', () => {
    expect(wallFinishKindsFor('framed', 'fiber_cement')).toEqual(['paint', 'render']);
    expect(wallFinishKindsFor('framed', 'plywood')).toEqual(['paint', 'timber']);
    expect(wallFinishKindsFor('framed', 'rainscreen')).toEqual(['paint']);
    expect(wallFinishKindsFor('masonry', 'none')).toEqual(['paint', 'render']);
    // A framed face with no board has nothing to put a finish on.
    expect(wallFinishKindsFor('framed', 'none')).toEqual([]);
  });
});

describe('normalizeWallFinish', () => {
  it('keeps a valid finish exactly, as {kind, colour {hex, name, catalogue}, sheen}', () => {
    expect(normalizeWallFinish(SIGNAL_ORANGE, 'framed', 'fiber_cement')).toEqual(SIGNAL_ORANGE);
  });

  it('is null for no finish, nonsense, and a kind the face does not offer', () => {
    expect(normalizeWallFinish(undefined, 'framed', 'fiber_cement')).toBeNull();
    expect(normalizeWallFinish(null, 'framed', 'fiber_cement')).toBeNull();
    expect(normalizeWallFinish('paint', 'framed', 'fiber_cement')).toBeNull();
    expect(normalizeWallFinish({ kind: 'lacquer' }, 'framed', 'fiber_cement')).toBeNull();
    // Render on plywood, timber on fibre cement, anything on a bare face.
    expect(normalizeWallFinish({ ...SIGNAL_ORANGE, kind: 'render' }, 'framed', 'plywood')).toBeNull();
    expect(normalizeWallFinish({ ...SIGNAL_ORANGE, kind: 'timber' }, 'framed', 'fiber_cement')).toBeNull();
    expect(normalizeWallFinish(SIGNAL_ORANGE, 'framed', 'none')).toBeNull();
  });

  it('repairs a mangled colour or sheen rather than losing the chosen kind', () => {
    const repaired = normalizeWallFinish(
      { kind: 'render', colour: { hex: 'nope' }, sheen: 'shiny' },
      'masonry',
      'none',
    );
    expect(repaired).toEqual(defaultWallFinish('render'));
  });

  it('upper-cases the hex, names a custom colour by it, and drops solar absorptance', () => {
    const finish = normalizeWallFinish(
      { kind: 'paint', colour: { hex: '#abcdef', catalogue: 'mystery', solarAbsorptance: 0.4 }, sheen: 'gloss' },
      'framed',
      'plywood',
    );
    expect(finish.colour).toEqual({ hex: '#ABCDEF', name: '#ABCDEF', catalogue: 'custom' });
  });
});

describe('defaults and catalogues', () => {
  it('starts each kind on the spec default', () => {
    expect(defaultWallFinish('paint')).toEqual({
      kind: 'paint',
      colour: { hex: '#F2EEE4', name: 'Warm White', catalogue: 'facade' },
      sheen: 'matte',
    });
    expect(defaultWallFinish('render')).toMatchObject({ colour: { name: 'Bone' }, sheen: 'matte' });
    expect(defaultWallFinish('timber')).toMatchObject({ colour: { name: 'Ipe', catalogue: 'timber' }, sheen: 'satin' });
  });

  it('carries the 16 facade and 10 timber swatches, and shares the roof RAL list', () => {
    expect(WALL_COLOUR_CATALOG.facade).toHaveLength(16);
    expect(WALL_COLOUR_CATALOG.timber).toHaveLength(10);
    expect(WALL_COLOUR_CATALOG.ral).toBe(ROOF_COLOUR_CATALOG.ral);
    expect(wallCatalogueColour('facade', 'Signal Orange')).toEqual(SIGNAL_ORANGE.colour);
    for (const entry of [...WALL_COLOUR_CATALOG.facade, ...WALL_COLOUR_CATALOG.timber]) {
      expect(entry.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('draws a masonry interior coat ten millimetres thick', () => {
    expect(MASONRY_FINISH_COAT).toBe(10);
  });
});

describe('the 3D material key', () => {
  it('is null for a stock face, whatever else the layer says', () => {
    expect(wallFinishMaterialKey({ material: 'fiber_cement', thickness: 6 }, 'framed')).toBeNull();
    expect(wallFinishMaterialKey({ material: 'none' }, 'masonry')).toBeNull();
    expect(wallFinishMaterialKey(null, 'framed')).toBeNull();
    // A finish the face cannot carry is not a finish.
    expect(wallFinishMaterialKey({ material: 'none', finish: SIGNAL_ORANGE }, 'framed')).toBeNull();
  });

  it('names the whole look, per substrate', () => {
    expect(wallFinishMaterialKey({ material: 'fiber_cement', finish: SIGNAL_ORANGE }, 'framed')).toBe(
      'wallFinish:paint:fc:E0701F:matte',
    );
    expect(wallFinishMaterialKey({ material: 'plywood', finish: { ...SIGNAL_ORANGE, sheen: 'satin' } }, 'framed')).toBe(
      'wallFinish:paint:ply:E0701F:satin',
    );
    expect(wallFinishMaterialKey({ material: 'rainscreen', finish: SIGNAL_ORANGE }, 'framed')).toBe(
      'wallFinish:paint:cassette:E0701F:matte',
    );
    expect(wallFinishMaterialKey({ material: 'none', finish: defaultWallFinish('render') }, 'masonry')).toBe(
      'wallFinish:render:masonry:E4DDCC:matte',
    );
  });

  it('round-trips through the parser, which refuses anything else', () => {
    for (const [material, system, kind] of [
      ['fiber_cement', 'framed', 'render'],
      ['plywood', 'framed', 'timber'],
      ['rainscreen', 'framed', 'paint'],
      ['none', 'masonry', 'paint'],
    ]) {
      const finish = { ...defaultWallFinish(kind), sheen: 'gloss' };
      const key = wallFinishMaterialKey({ material, finish }, system);
      const parsed = parseWallFinishMaterialKey(key);
      expect(parsed).toMatchObject({ kind, hex: finish.colour.hex, sheen: 'gloss' });
      expect(`wallFinish:${parsed.kind}:${parsed.substrate}:${parsed.hex.slice(1)}:${parsed.sheen}`).toBe(key);
    }
    expect(parseWallFinishMaterialKey('wall')).toBeNull();
    expect(parseWallFinishMaterialKey('wallFinish:paint:fc:e0701f:matte')).toBeNull();
    expect(parseWallFinishMaterialKey('wallFinish:stain:fc:E0701F:matte')).toBeNull();
    expect(parseWallFinishMaterialKey(undefined)).toBeNull();
  });
});

describe('drawing helpers', () => {
  it('reads a face hex, null when stock', () => {
    expect(wallFinishHex({ material: 'plywood', finish: SIGNAL_ORANGE })).toBe('#E0701F');
    expect(wallFinishHex({ material: 'plywood' })).toBeNull();
  });

  it('knocks a colour 60 % of the way back to the paper', () => {
    // E0→F4: 224 + (244−224)·0.6 = 236 = EC; 70→F1: 112 + 129·0.6 = 189.4 → BD;
    // 1F→EA: 31 + 203·0.6 = 152.8 → 99.
    expect(wallFinishDrawingTint('#E0701F')).toBe('#ECBD99');
    expect(wallFinishDrawingTint('#F4F1EA')).toBe('#F4F1EA');
    expect(wallFinishDrawingTint('not a colour')).toBeNull();
  });

  it('describes a finish in one line', () => {
    expect(describeWallFinish(SIGNAL_ORANGE)).toBe('Paint · Signal Orange · matte');
    expect(describeWallFinish(null)).toBe('Stock');
  });

  it('compares finishes by look', () => {
    expect(sameWallFinish(SIGNAL_ORANGE, { ...SIGNAL_ORANGE, colour: { ...SIGNAL_ORANGE.colour } })).toBe(true);
    expect(sameWallFinish(SIGNAL_ORANGE, { ...SIGNAL_ORANGE, sheen: 'gloss' })).toBe(false);
    expect(sameWallFinish(null, null)).toBe(true);
    expect(sameWallFinish(SIGNAL_ORANGE, null)).toBe(false);
    expect(WALL_FINISH_KINDS.TIMBER).toBe('timber');
  });
});

describe('plank siding finishes (spec §6.1)', () => {
  const IPE = { kind: 'timber', colour: { hex: '#6B4226', name: 'Ipe', catalogue: 'timber' }, sheen: 'satin' };

  it('offers timber first, then paint, and never goes stock', () => {
    expect(wallFinishKindsFor('framed', 'siding')).toEqual(['timber', 'paint']);
    expect(resolveLayerFinish(undefined, 'framed', 'siding')).toEqual(IPE);
    expect(resolveLayerFinish({ ...IPE, kind: 'render' }, 'framed', 'siding')).toEqual(IPE);
    expect(resolveLayerFinish({ ...IPE, kind: 'paint' }, 'framed', 'siding').kind).toBe('paint');
    // Every other face still goes stock without a finish.
    expect(resolveLayerFinish(undefined, 'framed', 'plywood')).toBeNull();
  });

  it('carries its course in the key and reads it back', () => {
    const layer = { material: 'siding', finish: IPE, course: { orientation: 'horizontal', exposure: 140, joint: 6 } };
    const key = wallFinishMaterialKey(layer, 'framed');
    expect(key).toBe('wallFinish:timber:siding:6B4226:satin:h140j6');
    expect(parseWallFinishMaterialKey(key)).toEqual({
      kind: 'timber',
      substrate: 'siding',
      hex: '#6B4226',
      sheen: 'satin',
      course: { orientation: 'horizontal', exposure: 140, joint: 6 },
    });
    const vertical = wallFinishMaterialKey(
      { ...layer, course: { orientation: 'vertical', exposure: 95, joint: 0 } },
      'framed',
    );
    expect(vertical).toBe('wallFinish:timber:siding:6B4226:satin:v95j0');
    expect(parseWallFinishMaterialKey(vertical).course).toEqual({ orientation: 'vertical', exposure: 95, joint: 0 });
  });

  it('keeps every other substrate key exactly as it was, and refuses a course where none belongs', () => {
    expect(wallFinishMaterialKey({ material: 'fiber_cement', finish: SIGNAL_ORANGE }, 'framed')).toBe(
      'wallFinish:paint:fc:E0701F:matte',
    );
    expect(parseWallFinishMaterialKey('wallFinish:paint:fc:E0701F:matte')).not.toHaveProperty('course');
    expect(parseWallFinishMaterialKey('wallFinish:paint:fc:E0701F:matte:h140j6')).toBeNull();
    expect(parseWallFinishMaterialKey('wallFinish:timber:siding:6B4226:satin')).toBeNull();
    expect(parseWallFinishMaterialKey('wallFinish:timber:siding:6B4226:satin:h20j6')).toBeNull();
  });
});
