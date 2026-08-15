import { describe, expect, it } from 'vitest';
import { nestPartsOnSheets, optimizeCutList, SHEET_GRAIN_ANGLE_DEG } from '../utils/nestingOptimizer';
import {
  formatGrainAngle,
  getGrainRotations,
  getPlacedGrainAngle,
  isGrainLocked,
  normalizeGrainAngle,
} from '../utils/grainUtils';
import { getBuiltInMaterials, getMaterialById, materialHasGrain } from '../data/materials';
import { entityToBomRow } from '../utils/entityBomAdapter';
import { getBomRowGroupKey, groupBomRows } from '../../utils/bomUtils';

const SHEET = { width: 2440, height: 1220 };

function sheetRow(overrides = {}) {
  return {
    partName: 'Panel',
    material: 'birch-plywood-18',
    materialName: '18mm Birch Plywood',
    width: 600,
    height: 400,
    quantity: 1,
    stockKind: 'sheet',
    costBasis: 'perM2',
    ...overrides,
  };
}

describe('material grain catalog', () => {
  it('marks solid lumber and veneered panels as grained, and nothing else', () => {
    const grained = getBuiltInMaterials()
      .filter((material) => material.hasGrain === true)
      .map((material) => material.id)
      .sort();

    expect(grained).toEqual(
      [
        'birch-plywood-12',
        'birch-plywood-18',
        'birch-plywood-24',
        'birch-plywood-3',
        'birch-plywood-6',
        'marine-plywood-18',
        'oak-20x95',
        'pine-20x45',
        'pine-20x95',
        'pine-45x45',
        'pine-45x95',
        'walnut-20x95',
      ].sort(),
    );
  });

  it('leaves MDF, acrylic, metal and hardware grain free', () => {
    ['mdf-6', 'mdf-12', 'mdf-18', 'acrylic-3', 'acrylic-5', 'acrylic-6-black', 'steel-2', 'aluminum-3'].forEach(
      (id) => {
        expect(materialHasGrain(getMaterialById(id))).toBe(false);
      },
    );

    getBuiltInMaterials()
      .filter((material) => material.category === 'hardware')
      .forEach((material) => expect(materialHasGrain(material)).toBe(false));
  });

  it('answers false for an unknown material rather than guessing', () => {
    expect(materialHasGrain('no-such-material')).toBe(false);
    expect(materialHasGrain(null)).toBe(false);
  });
});

describe('grain angle normalization', () => {
  it('folds an angle onto the [0, 180) fibre axis', () => {
    expect(normalizeGrainAngle(0)).toBe(0);
    expect(normalizeGrainAngle(180)).toBe(0);
    expect(normalizeGrainAngle(270)).toBe(90);
    expect(normalizeGrainAngle(-90)).toBe(90);
    expect(normalizeGrainAngle(-180)).toBe(0);
  });

  it('treats missing and unparseable values as unconstrained', () => {
    expect(normalizeGrainAngle(null)).toBeNull();
    expect(normalizeGrainAngle(undefined)).toBeNull();
    expect(normalizeGrainAngle('')).toBeNull();
    expect(normalizeGrainAngle('abc')).toBeNull();
  });

  it('locks only when the stock has grain AND the part declares a direction', () => {
    expect(isGrainLocked(true, 0)).toBe(true);
    expect(isGrainLocked(true, null)).toBe(false);
    expect(isGrainLocked(false, 90)).toBe(false);
  });

  it('reports the quarter turns that keep the grain on the sheet axis', () => {
    expect(getGrainRotations(null).rotations).toEqual([0, 90, 180, 270]);
    expect(getGrainRotations(0)).toMatchObject({ rotations: [0, 180], swapsFootprint: false, alignedToSheet: true });
    expect(getGrainRotations(90)).toMatchObject({ rotations: [90, 270], swapsFootprint: true, alignedToSheet: true });
    // No quarter turn can put a 45-degree grain on the sheet axis, so the part
    // is pinned as drawn and flagged as not aligned.
    expect(getGrainRotations(45)).toMatchObject({ rotations: [0, 180], swapsFootprint: false, alignedToSheet: false });
  });

  it('reports the grain direction after a placement rotation', () => {
    expect(getPlacedGrainAngle(90, 90)).toBe(0);
    expect(getPlacedGrainAngle(0, 180)).toBe(0);
    expect(getPlacedGrainAngle(null, 90)).toBeNull();
  });

  it('formats the sheet-relative labels', () => {
    expect(SHEET_GRAIN_ANGLE_DEG).toBe(0);
    expect(formatGrainAngle(0)).toContain('along sheet length');
    expect(formatGrainAngle(90)).toContain('across sheet length');
    expect(formatGrainAngle(null)).toBe('Unconstrained');
  });
});

describe('grain as a hard nesting constraint', () => {
  it('keeps an unconstrained part normalized to landscape, exactly as before', () => {
    const { sheets } = nestPartsOnSheets([sheetRow({ width: 400, height: 600 })], { sheetSize: SHEET });
    const placement = sheets[0].placements[0];

    expect(placement.grainLocked).toBe(false);
    expect(placement.canRotate).toBe(true);
    expect(placement.placedWidth).toBe(600);
    expect(placement.placedHeight).toBe(400);
  });

  it('holds a 0-degree grain part in its drawn orientation', () => {
    const { sheets } = nestPartsOnSheets([sheetRow({ width: 400, height: 600, hasGrain: true, grainAngle: 0 })], {
      sheetSize: SHEET,
    });
    const placement = sheets[0].placements[0];

    expect(placement.grainLocked).toBe(true);
    expect(placement.canRotate).toBe(false);
    // NOT normalized to landscape: turning it would run the fibre across the sheet.
    expect(placement.placedWidth).toBe(400);
    expect(placement.placedHeight).toBe(600);
    expect(placement.grainRotationsDeg).toEqual([0, 180]);
    expect(placement.placedGrainAngleDeg).toBe(0);
  });

  it('turns a 90-degree grain part so its fibre lands on the sheet axis', () => {
    const { sheets } = nestPartsOnSheets([sheetRow({ width: 400, height: 600, hasGrain: true, grainAngle: 90 })], {
      sheetSize: SHEET,
    });
    const placement = sheets[0].placements[0];

    expect(placement.grainLocked).toBe(true);
    expect(placement.placedWidth).toBe(600);
    expect(placement.placedHeight).toBe(400);
    expect(placement.grainRotationsDeg).toEqual([90, 270]);
    // 90 degrees of grain plus a 90-degree placement turn = along the sheet.
    expect(placement.placedGrainAngleDeg).toBe(0);
  });

  it('never rotates a locked part onto a shelf, even when rotation is the only way it fits', () => {
    // Isolated on exactly one variable. On a 1000x450 sheet the 900x400 panel
    // fills the first shelf; the 300x80 strip cannot follow it upright, and a
    // second shelf would overrun the sheet height. Its only home is turned on to
    // the tail of shelf 1 - the branch grain locking has to refuse.
    const small = { partName: 'Strip', width: 300, height: 80, hasGrain: true };
    const rows = [sheetRow({ partName: 'Big', width: 900, height: 400, hasGrain: true }), sheetRow(small)];
    const locked = [rows[0], sheetRow({ ...small, grainAngle: 0 })];
    const options = { sheetSize: { width: 1000, height: 450 }, bladeKerf: 0 };

    const freeResult = nestPartsOnSheets(rows, options);
    const lockedResult = nestPartsOnSheets(locked, options);

    expect(freeResult.sheets).toHaveLength(1);
    expect(freeResult.sheets[0].placements[1].rotated).toBe(true);

    // Grain locked: the turn is forbidden, so the strip costs a whole extra
    // sheet. Correct beats tight.
    expect(lockedResult.sheets).toHaveLength(2);
    const lockedPlacement = lockedResult.sheets[1].placements[0];
    expect(lockedPlacement.grainLocked).toBe(true);
    expect(lockedPlacement.rotated).toBeUndefined();
    expect(lockedPlacement.placedWidth).toBe(300);
    expect(lockedPlacement.placedHeight).toBe(80);
  });

  it('reports a locked part that only fits turned as oversized instead of turning it', () => {
    // 1000 x 2000 with the grain along X. The sheet is 2440 x 1220, so it fits
    // only if turned - which the grain forbids.
    const { sheets } = nestPartsOnSheets([sheetRow({ width: 1000, height: 2000, hasGrain: true, grainAngle: 0 })], {
      sheetSize: SHEET,
    });

    expect(sheets).toHaveLength(1);
    expect(sheets[0].oversized).toBe(true);
    expect(sheets[0].placements[0].grainLocked).toBe(true);
  });

  it('counts grain-locked parts in the summary', () => {
    const result = optimizeCutList(
      [
        sheetRow({ partName: 'Locked', hasGrain: true, grainAngle: 0 }),
        sheetRow({ partName: 'Free', width: 500, height: 300 }),
      ],
      { sheetSize: SHEET },
    );

    expect(result.summary.sheet.grainLockedParts).toBe(1);
    expect(result.summary.sheet.totalParts).toBe(2);
  });

  it('leaves a grained material unconstrained until the part declares an angle', () => {
    const { sheets } = nestPartsOnSheets([sheetRow({ width: 400, height: 600, hasGrain: true, grainAngle: null })], {
      sheetSize: SHEET,
    });

    expect(sheets[0].placements[0].grainLocked).toBe(false);
    expect(sheets[0].placements[0].placedWidth).toBe(600);
  });
});

describe('grain on BOM rows', () => {
  it('carries the material grain flag and the part angle onto the row', () => {
    const catalog = { 'birch-plywood-18': getMaterialById('birch-plywood-18'), 'mdf-18': getMaterialById('mdf-18') };

    const grained = entityToBomRow(
      { id: 'r1', type: 'rect', width: 600, height: 400, materialId: 'birch-plywood-18', grainAngle: 90 },
      catalog,
    );
    const plain = entityToBomRow({ id: 'r2', type: 'rect', width: 600, height: 400, materialId: 'mdf-18' }, catalog);

    expect(grained.hasGrain).toBe(true);
    expect(grained.grainAngle).toBe(90);
    expect(plain.hasGrain).toBe(false);
    expect(plain.grainAngle).toBeNull();
  });

  it('does not merge two identical panels cut with different grain directions', () => {
    const along = sheetRow({ hasGrain: true, grainAngle: 0 });
    const across = sheetRow({ hasGrain: true, grainAngle: 90 });

    expect(getBomRowGroupKey(along)).not.toBe(getBomRowGroupKey(across));
    expect(groupBomRows([along, across])).toHaveLength(2);
    expect(groupBomRows([along, { ...along }])).toHaveLength(1);
  });
});
