import { describe, expect, it } from 'vitest';
import { createFeatureEntity, updateEntityFromNumericField } from '../../utils/entityUtils';
import {
  DEFAULT_FASTENER_HARDWARE_ID,
  applyHardwareToFeatureEntity,
  buildFastenerFeatureConfig,
  getFastenerDrillingDefaults,
  groupHardwareByFastenerKind,
  isFastenerEntity,
  resolveFastenerTargetPartId,
} from '../../utils/fastenerUtils';
import sketchStudioInitialState from '../../store/sketchStudioInitialState';
import sketchStudioReducer from '../../store/sketchStudioReducer';
import { commitEntity, setEntityHardware } from '../../store/sketchStudioActions';
import { entitiesToBomRows, isHardwareBomRow } from '../utils/entityBomAdapter';
import { buildMaterialCatalogById, getBuiltInMaterials, getHardwareItems } from '../data/materials';

const materialCatalogById = buildMaterialCatalogById(getBuiltInMaterials());

function createBaseState() {
  return {
    ...sketchStudioInitialState,
    document: {
      ...sketchStudioInitialState.document,
      entities: [],
    },
    history: { past: [], future: [] },
  };
}

/** What the fastener tool builds for one click at `point`. */
function placeFastener(hardwareId, point, options = {}) {
  return createFeatureEntity(buildFastenerFeatureConfig(hardwareId, point, options), [], 'default');
}

describe('fastener placement', () => {
  it('places the contract entity for a single click', () => {
    const entity = placeFastener(DEFAULT_FASTENER_HARDWARE_ID, { x: 320, y: 180 }, { targetPartId: 'rect-1' });

    expect(entity).toMatchObject({
      type: 'feature',
      featureType: 'hole',
      operation: 'subtract',
      shape: 'circle',
      cx: 320,
      cy: 180,
      // Pilot diameter of the #8 x 32mm wood screw, not a dragged radius.
      diameter: 3,
      hardwareId: 'hw-screw-8-32',
      targetPartId: 'rect-1',
      depth: 32,
      through: false,
      layerId: 'default',
    });
    expect(isFastenerEntity(entity)).toBe(true);
  });

  it('drills every catalog fastener to its own pilot diameter and drilling defaults', () => {
    for (const item of getHardwareItems().filter((candidate) => candidate.fastener)) {
      const entity = placeFastener(item.id, { x: 0, y: 0 });
      const passesThrough = item.fastener.kind === 'machine-bolt';

      expect(entity.diameter).toBe(item.fastener.pilotDiameter);
      expect(entity.hardwareId).toBe(item.id);
      expect(entity.through).toBe(passesThrough);
      expect(entity.depth).toBe(passesThrough ? null : item.fastener.length);
    }
  });

  it('refuses to single-place pattern hardware - patterns go through the pattern pipeline', () => {
    for (const item of getHardwareItems().filter((candidate) => candidate.pattern)) {
      expect(buildFastenerFeatureConfig(item.id, { x: 0, y: 0 })).toBeNull();
    }
  });

  it('refuses to place anything that is not catalog hardware', () => {
    expect(buildFastenerFeatureConfig('plywood-birch-18', { x: 0, y: 0 })).toBeNull();
    expect(buildFastenerFeatureConfig('hw-screw-8-32', null)).toBeNull();
    expect(placeFastener('not-a-catalog-id', { x: 0, y: 0 })).toBeNull();
  });

  it('only anchors a fastener to entity types a part can be cut from', () => {
    expect(resolveFastenerTargetPartId({ id: 'rect-1', type: 'rect' })).toBe('rect-1');
    expect(resolveFastenerTargetPartId({ id: 'poly-1', type: 'polyline' })).toBe('poly-1');
    expect(resolveFastenerTargetPartId({ id: 'dim-1', type: 'dimension' })).toBeNull();
    expect(resolveFastenerTargetPartId(null)).toBeNull();
  });

  it('re-applies pilot diameter and drilling defaults when the hardware changes', () => {
    const screw = placeFastener('hw-screw-8-32', { x: 10, y: 10 });
    const bolt = applyHardwareToFeatureEntity(screw, 'hw-bolt-m6-40');

    expect(bolt).toMatchObject({ hardwareId: 'hw-bolt-m6-40', diameter: 6.5, depth: null, through: true });
    expect(bolt.cx).toBe(screw.cx);
    expect(bolt.id).toBe(screw.id);

    // Unknown ids and non-features are left exactly as they are.
    expect(applyHardwareToFeatureEntity(screw, 'plywood-birch-18')).toBe(screw);
    const rect = { id: 'rect-1', type: 'rect' };
    expect(applyHardwareToFeatureEntity(rect, 'hw-bolt-m6-40')).toBe(rect);
  });

  it('edits depth and through as a consistent pair', () => {
    const screw = placeFastener('hw-screw-8-32', { x: 10, y: 10 });

    const throughHole = updateEntityFromNumericField(screw, 'through', 'true');
    expect(throughHole).toMatchObject({ through: true, depth: null });

    // Switching back to a blind hole restores the catalog drilling depth.
    const blindHole = updateEntityFromNumericField(throughHole, 'through', 'false');
    expect(blindHole).toMatchObject({ through: false, depth: 32 });

    // Typing a depth implies a blind hole.
    const deeper = updateEntityFromNumericField(throughHole, 'depth', '24');
    expect(deeper).toMatchObject({ through: false, depth: 24 });
  });

  it('groups the catalog by fastener kind for the picker', () => {
    const groups = groupHardwareByFastenerKind();

    expect(groups.length).toBeGreaterThan(1);
    expect(groups.map((group) => group.id)).toContain('wood-screw');
    expect(groups.find((group) => group.id === 'machine-bolt')?.label).toBe('Bolts');
    expect(groups.flatMap((group) => group.items)).toHaveLength(getHardwareItems().length);
  });

  it('exposes head and length figures the preview and callouts need', () => {
    expect(getFastenerDrillingDefaults('hw-screw-8-32')).toMatchObject({
      kind: 'wood-screw',
      diameter: 3,
      headDiameter: 8,
      length: 32,
      countersink: true,
    });
    expect(getFastenerDrillingDefaults('plywood-birch-18')).toBeNull();
  });
});

describe('fastener BOM integration', () => {
  it('bills a fastener committed through the reducer as a hardware row', () => {
    const state = sketchStudioReducer(
      createBaseState(),
      commitEntity(placeFastener('hw-screw-8-40', { x: 60, y: 40 })),
    );

    expect(state.document.entities).toHaveLength(1);

    const rows = entitiesToBomRows(state.document.entities, materialCatalogById);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      role: 'hardware',
      hardwareId: 'hw-screw-8-40',
      material: 'hw-screw-8-40',
      materialName: '#8 x 40mm Wood Screw',
      fastenerKind: 'wood-screw',
      costBasis: 'perPiece',
      quantity: 1,
    });
    expect(isHardwareBomRow(rows[0])).toBe(true);
  });

  it('follows the selected hardware when the fastener is re-pointed', () => {
    const placedState = sketchStudioReducer(
      createBaseState(),
      commitEntity(placeFastener('hw-screw-8-40', { x: 60, y: 40 })),
    );
    const fastenerId = placedState.document.entities[0].id;
    const changedState = sketchStudioReducer(placedState, setEntityHardware([fastenerId], 'hw-bolt-m8-50'));

    const rows = entitiesToBomRows(changedState.document.entities, materialCatalogById);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hardwareId: 'hw-bolt-m8-50', fastenerKind: 'machine-bolt' });
  });

  it('bills the drilled part and its fastener side by side', () => {
    const panel = {
      id: 'rect-1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 600,
      height: 400,
      rotation: 0,
      thickness: 18,
      materialId: 'plywood-birch-18',
      layerId: 'default',
      meta: {},
    };
    const baseState = {
      ...createBaseState(),
      document: { ...sketchStudioInitialState.document, entities: [panel] },
    };
    const state = sketchStudioReducer(
      baseState,
      commitEntity(placeFastener('hw-screw-8-32', { x: 60, y: 40 }, { targetPartId: 'rect-1' })),
    );

    const rows = entitiesToBomRows(state.document.entities, materialCatalogById);
    expect(rows.map((row) => row.material)).toEqual(['plywood-birch-18', 'hw-screw-8-32']);
    expect(rows.filter(isHardwareBomRow)).toHaveLength(1);
  });

  it('counts each placed fastener once', () => {
    const firstState = sketchStudioReducer(
      createBaseState(),
      commitEntity(placeFastener('hw-screw-8-40', { x: 60, y: 40 })),
    );
    const secondState = sketchStudioReducer(
      firstState,
      commitEntity(
        createFeatureEntity(
          buildFastenerFeatureConfig('hw-screw-8-40', { x: 120, y: 40 }),
          firstState.document.entities,
          'default',
        ),
      ),
    );

    const rows = entitiesToBomRows(secondState.document.entities, materialCatalogById);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.hardwareId === 'hw-screw-8-40')).toBe(true);
  });
});
