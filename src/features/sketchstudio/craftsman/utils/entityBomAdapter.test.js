import { describe, expect, it } from 'vitest';
import {
  buildBomEntityList,
  createFastenerHardwareResolver,
  entityToBomRow,
  entitiesToBomRows,
  getEntityFastenerHardwareId,
  isEntityBomEligible,
  isHardwareBomRow,
} from './entityBomAdapter';
import { buildMaterialCatalogById, getBuiltInMaterials, resolveHardwareIdForFastener } from '../data/materials';

const fullCatalog = buildMaterialCatalogById(getBuiltInMaterials());

/** Mirrors the joinery feature entities `resolveJointGeometry` emits. */
function createJoineryFeature({ id, jointId, jointType, partId, operationKind, index, hardwareKind, diameter }) {
  return {
    id,
    type: 'feature',
    featureType: 'joinery',
    operation: 'subtract',
    targetPartId: partId,
    shape: 'circle',
    cx: 0,
    cy: 0,
    diameter,
    depth: 12,
    through: false,
    meta: {
      joineryGenerated: true,
      joinery: {
        jointId,
        jointType,
        operationId: `${jointId}:${operationKind}:${partId}:${index}`,
        operationKind,
        role: partId === 'partA' ? 'source' : 'target',
        fabrication: { process: 'drilling', hardware: { kind: hardwareKind } },
        fabricationReady: true,
        previewOnly: false,
      },
    },
  };
}

/** One pocket screw: a pocket bore in the source part + a pilot hole in the target. */
function createPocketScrewPair(jointId, index = 1) {
  return [
    createJoineryFeature({
      id: `joinery-feature-${jointId}-partA-pocket-bore-${index}`,
      jointId,
      jointType: 'pocket_screw',
      partId: 'partA',
      operationKind: 'pocket-bore',
      index,
      hardwareKind: 'pocket-screw',
      diameter: 9.5,
    }),
    createJoineryFeature({
      id: `joinery-feature-${jointId}-partB-pilot-hole-${index}`,
      jointId,
      jointType: 'pocket_screw',
      partId: 'partB',
      operationKind: 'pilot-hole',
      index,
      hardwareKind: 'pocket-screw',
      diameter: 3.7,
    }),
  ];
}

/** One dowel: matched holes drilled into both parts. */
function createDowelPair(jointId, index = 1, diameter = 8.2) {
  return ['partA', 'partB'].map((partId) =>
    createJoineryFeature({
      id: `joinery-feature-${jointId}-${partId}-dowel-hole-${index}`,
      jointId,
      jointType: 'dowel',
      partId,
      operationKind: 'dowel-hole',
      index,
      hardwareKind: 'dowel',
      diameter,
    }),
  );
}

const catalog = {
  'birch-plywood-18': { id: 'birch-plywood-18', name: '18mm Birch Plywood', thickness: 18, pricePerM2: 45 },
  'steel-sq-25': {
    id: 'steel-sq-25',
    name: 'Steel SQ Tube 25x25x1.5mm',
    thickness: 1.5,
    defaultWidth: 25,
    defaultHeight: 6000,
    costBasis: 'perLinearMeter',
  },
};

describe('entityBomAdapter', () => {
  describe('isEntityBomEligible', () => {
    it('returns true for a rect with a material assignment', () => {
      expect(isEntityBomEligible({ type: 'rect', materialId: 'birch-plywood-18' })).toBe(true);
    });

    it('returns false for unsupported or unassigned entities', () => {
      expect(isEntityBomEligible({ type: 'rect' })).toBe(false);
      expect(isEntityBomEligible({ type: 'dimension', materialId: 'x' })).toBe(false);
      expect(isEntityBomEligible({ type: 'text', materialId: 'x' })).toBe(false);
      expect(isEntityBomEligible(null)).toBe(false);
    });
  });

  describe('entityToBomRow', () => {
    it('converts rect entities to exact BOM rows', () => {
      const row = entityToBomRow(
        { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 600, height: 400 },
        catalog,
      );

      expect(row).toMatchObject({
        partName: 'Panel',
        material: 'birch-plywood-18',
        width: 600,
        height: 400,
        thickness: 18,
        areaMm2: 240000,
        stockLength: 2000,
        dimensionAccuracy: 'exact',
      });
    });

    it('supports real sketch circle entities that store radius as "r"', () => {
      const row = entityToBomRow(
        { id: 'c1', type: 'circle', materialId: 'birch-plywood-18', cx: 0, cy: 0, r: 50 },
        catalog,
      );

      expect(row.width).toBe(100);
      expect(row.height).toBe(100);
      expect(row.areaMm2).toBeCloseTo(Math.PI * 2500, 2);
      expect(row.stockLength).toBeCloseTo(Math.PI * 100, 2);
      expect(row.dimensionAccuracy).toBe('exact');
    });

    it('keeps exact stock length metadata for linear line entities', () => {
      const row = entityToBomRow(
        { id: 'l1', type: 'line', materialId: 'steel-sq-25', x1: 0, y1: 0, x2: 300, y2: 400 },
        catalog,
      );

      expect(row).toMatchObject({
        width: 500,
        height: 25,
        stockLength: 500,
        stockSectionWidth: 25,
        costBasis: 'perLinearMeter',
        stockKind: 'linear',
        dimensionAccuracy: 'exact',
      });
    });

    it('marks closed polyline dimensions as approximate while preserving exact area/length', () => {
      const row = entityToBomRow(
        {
          id: 'p1',
          type: 'polyline',
          materialId: 'birch-plywood-18',
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 100 },
            { x: 0, y: 100 },
          ],
        },
        catalog,
      );

      expect(row.width).toBe(200);
      expect(row.height).toBe(100);
      expect(row.areaMm2).toBe(20000);
      expect(row.stockLength).toBe(600);
      expect(row.dimensionAccuracy).toBe('approximate');
      expect(row.dimensionNote).toContain('bounding-box');
    });

    it('returns null for non-eligible entities', () => {
      expect(entityToBomRow({ type: 'text', materialId: 'x' }, catalog)).toBeNull();
    });
  });

  describe('entitiesToBomRows', () => {
    it('filters out non-eligible entities', () => {
      const rows = entitiesToBomRows(
        [
          { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 100, height: 100 },
          { id: 'd1', type: 'dimension' },
          { id: 'r2', type: 'rect', materialId: 'birch-plywood-18', width: 200, height: 200 },
        ],
        catalog,
      );

      expect(rows).toHaveLength(2);
    });
  });

  describe('user-placed hardware', () => {
    it('emits a counted row for a feature entity carrying a hardware id', () => {
      const rows = entitiesToBomRows(
        [
          {
            id: 'f1',
            type: 'feature',
            featureType: 'hole',
            shape: 'circle',
            cx: 10,
            cy: 10,
            diameter: 3,
            hardwareId: 'hw-screw-8-40',
          },
        ],
        fullCatalog,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        partId: 'f1',
        partName: '#8 x 40mm Wood Screw',
        role: 'hardware',
        material: 'hw-screw-8-40',
        costBasis: 'perPiece',
        stockKind: 'piece',
        quantity: 1,
        width: 0,
        height: 0,
        areaMm2: null,
        stockLength: null,
        fastenerKind: 'wood-screw',
      });
      expect(isHardwareBomRow(rows[0])).toBe(true);
    });

    it('ignores feature entities without hardware', () => {
      expect(
        entitiesToBomRows(
          [{ id: 'f1', type: 'feature', featureType: 'hole', shape: 'circle', diameter: 5, hardwareId: null }],
          fullCatalog,
        ),
      ).toEqual([]);
    });

    it('counts the same placed fastener once even if the entity is passed twice', () => {
      const feature = {
        id: 'f1',
        type: 'feature',
        featureType: 'hole',
        shape: 'circle',
        diameter: 3,
        hardwareId: 'hw-screw-8-40',
      };

      expect(entitiesToBomRows([feature, { ...feature }], fullCatalog)).toHaveLength(1);
    });
  });

  describe('joinery hardware', () => {
    it('bills a pocket-screw joint once per screw, not once per drilled hole', () => {
      const rows = entitiesToBomRows(createPocketScrewPair('joint1'), fullCatalog);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        material: 'hw-pocket-screw-32-coarse',
        role: 'hardware',
        stockKind: 'piece',
        fastenerKind: 'pocket-screw',
        quantity: 1,
      });
    });

    it('bills a dowel joint once per dowel and matches the catalog diameter', () => {
      const rows = entitiesToBomRows([...createDowelPair('joint1', 1, 8.2), ...createDowelPair('joint1', 2, 8.2)], {});

      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.material === 'hw-dowel-8-35')).toBe(true);
      expect(entitiesToBomRows(createDowelPair('joint2', 1, 6.2), {})[0].material).toBe('hw-dowel-6-30');
      expect(entitiesToBomRows(createDowelPair('joint3', 1, 10.2), {})[0].material).toBe('hw-dowel-10-40');
    });

    it('does not double count features shared by the preview and export entity sets', () => {
      const pair = createPocketScrewPair('joint1');

      expect(entitiesToBomRows([...pair, ...pair], fullCatalog)).toHaveLength(1);
    });

    it('ignores joinery features whose joint uses no hardware', () => {
      const dado = createJoineryFeature({
        id: 'joinery-feature-joint9-partA-dado-1',
        jointId: 'joint9',
        jointType: 'dado',
        partId: 'partA',
        operationKind: 'dado',
        index: 1,
        hardwareKind: undefined,
        diameter: 10,
      });

      expect(entitiesToBomRows([dado], fullCatalog)).toEqual([]);
    });

    it('reads hardware from a flat meta.fabrication as well as meta.joinery.fabrication', () => {
      const rows = entitiesToBomRows(
        [
          {
            id: 'f9',
            type: 'feature',
            featureType: 'joinery',
            shape: 'circle',
            diameter: 8,
            meta: { joineryGenerated: true, fabrication: { hardware: { kind: 'dowel' } } },
          },
        ],
        fullCatalog,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].material).toBe('hw-dowel-8-35');
    });
  });

  describe('buildBomEntityList', () => {
    it('adds only fastener-bearing joinery features to the document entities', () => {
      const documentEntities = [{ id: 'partA', type: 'rect', materialId: 'birch-plywood-18', width: 100, height: 100 }];
      const manufacturingEntities = [
        // The manufacturing set re-clones every document entity.
        { ...documentEntities[0], meta: { manufacturingHidden: true } },
        { id: 'joinery-profile-partA', type: 'polyline', materialId: 'birch-plywood-18', closed: true, points: [] },
        ...createPocketScrewPair('joint1'),
      ];

      const combined = buildBomEntityList(documentEntities, manufacturingEntities);

      expect(combined).toHaveLength(3);
      expect(combined.filter((entity) => entity.type === 'feature')).toHaveLength(2);
      expect(entitiesToBomRows(combined, fullCatalog).filter(isHardwareBomRow)).toHaveLength(1);
    });

    it('keeps the document array identity when there is no joinery hardware', () => {
      const documentEntities = [{ id: 'partA', type: 'rect' }];

      expect(buildBomEntityList(documentEntities, [])).toBe(documentEntities);
    });
  });

  describe('createFastenerHardwareResolver', () => {
    /** Wraps the real lookup so a test can see how often the catalog is scanned. */
    function countingLookup() {
      const calls = [];
      const lookup = (kind, diameter) => {
        calls.push([kind, diameter]);
        return resolveHardwareIdForFastener(kind, diameter);
      };

      return { calls, lookup };
    }

    it('answers exactly like the uncached catalog lookup', () => {
      const resolve = createFastenerHardwareResolver();
      const cases = [
        ['pocket-screw', null],
        ['pocket-screw', 9.5],
        ['dowel', 8.2],
        ['dowel', 6.1],
        ['dowel', null],
        ['dowel', 0],
        ['wood-screw', null],
        ['machine-bolt', 8],
        ['not-a-real-kind', 4],
        [null, 4],
      ];

      cases.forEach(([kind, diameter]) => {
        expect(resolve(kind, diameter)).toBe(resolveHardwareIdForFastener(kind, diameter));
        // Cached answers stay identical on the second ask.
        expect(resolve(kind, diameter)).toBe(resolveHardwareIdForFastener(kind, diameter));
      });
    });

    it('scans the catalog once per distinct kind and diameter across a build', () => {
      const { calls, lookup } = countingLookup();
      const resolve = createFastenerHardwareResolver(lookup);
      const entities = [
        // 3 pocket screws = 6 drilled holes, all one (kind, no diameter) question.
        ...createPocketScrewPair('joint1', 1),
        ...createPocketScrewPair('joint1', 2),
        ...createPocketScrewPair('joint1', 3),
        // Dowels are diameter-matched, so each distinct size is its own question.
        ...createDowelPair('joint2', 1, 8.2),
        ...createDowelPair('joint2', 2, 8.2),
        ...createDowelPair('joint3', 1, 6.1),
        // Carries no hardware at all: must never reach the catalog.
        { id: 'partA', type: 'rect', materialId: 'birch-plywood-18' },
      ];

      const ids = entities.map((entity) => getEntityFastenerHardwareId(entity, resolve));

      expect(ids.filter(Boolean)).toHaveLength(12);
      expect(ids[0]).toBe('hw-pocket-screw-32-coarse');
      expect(calls).toEqual([
        ['pocket-screw', null],
        ['dowel', 8.2],
        ['dowel', 6.1],
      ]);
    });

    it('collapses every non-selecting diameter onto the kind default, as the lookup does', () => {
      const { calls, lookup } = countingLookup();
      const resolve = createFastenerHardwareResolver(lookup);

      const answers = [resolve('dowel', null), resolve('dowel', 0), resolve('dowel', -3), resolve('dowel', NaN)];

      expect(new Set(answers).size).toBe(1);
      expect(calls).toHaveLength(1);
    });

    it('starts an empty memo per instance so a catalog edit cannot go stale', () => {
      const { calls, lookup } = countingLookup();
      const firstBuild = createFastenerHardwareResolver(lookup);
      const secondBuild = createFastenerHardwareResolver(lookup);

      firstBuild('dowel', 8.2);
      firstBuild('dowel', 8.2);
      expect(calls).toHaveLength(1);

      // A later build re-reads the catalog rather than trusting the last answer,
      // which is what keeps custom materials from being cached forever.
      secondBuild('dowel', 8.2);
      expect(calls).toHaveLength(2);
    });

    it('bills the same rows whether or not the resolver is memoized', () => {
      const entities = [...createPocketScrewPair('joint1'), ...createDowelPair('joint2', 1, 8.2)];

      const memoized = entitiesToBomRows(entities, fullCatalog);
      const uncached = entities
        .map((entity, index) => {
          const hardwareId = getEntityFastenerHardwareId(entity);
          return hardwareId ? { index, hardwareId } : null;
        })
        .filter(Boolean);

      expect(memoized.filter(isHardwareBomRow).map((row) => row.hardwareId)).toEqual([
        'hw-pocket-screw-32-coarse',
        'hw-dowel-8-35',
      ]);
      // Every hole still resolves, the BOM just stops billing the duplicates.
      expect(uncached).toHaveLength(4);
      expect(new Set(uncached.map((entry) => entry.hardwareId))).toEqual(
        new Set(['hw-pocket-screw-32-coarse', 'hw-dowel-8-35']),
      );
    });
  });
});
