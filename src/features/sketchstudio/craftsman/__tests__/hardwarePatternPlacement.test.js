/**
 * End-to-end contract for placed pattern hardware (hinges, handles): the click
 * pipeline's feature configs become grouped feature entities, the BOM bills one
 * piece per placed set, and the export legend tags the primary hole.
 */
import { describe, expect, it } from 'vitest';
import { buildFastenerLegend } from '../export/fastenerLegend';
import { buildMaterialCatalogById, getBuiltInMaterials } from '../data/materials';
import { entitiesToBomRows, isHardwareBomRow } from '../utils/entityBomAdapter';
import { createFeatureEntity } from '../../utils/entityUtils';
import { getHardwarePattern } from '../../utils/fastenerUtils';
import { buildHardwarePatternFeatureConfigs } from '../../utils/hardwarePatternUtils';
import { buildGroupIndex, createGroupId, expandGroupedSelection } from '../../utils/groupUtils';

const materialCatalogById = buildMaterialCatalogById(getBuiltInMaterials());

/** A 400 x 700mm door at (0, 0). */
const DOOR = { id: 'rect-1', type: 'rect', x: 0, y: 0, width: 400, height: 700, rotation: 0, materialId: null };

/** Mirrors the fastener tool's pattern branch in useSketchToolClick. */
function placePattern(hardwareId, point, entities, targetEntity) {
  const pattern = getHardwarePattern(hardwareId);
  const configs = buildHardwarePatternFeatureConfigs(pattern, point, targetEntity, {
    targetPartId: targetEntity?.id ?? null,
  });
  const groupId = createGroupId(entities);

  let nextEntities = entities;
  const placed = [];
  for (const config of configs) {
    const entity = createFeatureEntity({ ...config, meta: { ...config.meta, groupId } }, nextEntities, 'default');
    expect(entity).not.toBeNull();
    placed.push(entity);
    nextEntities = [...nextEntities, entity];
  }

  return { entities: nextEntities, placed, groupId };
}

describe('pattern hardware placement', () => {
  it('drills the full hinge pattern as grouped features and bills exactly one hinge', () => {
    const { entities, placed } = placePattern('hw-hinge-concealed-35', { x: 5, y: 350 }, [DOOR], DOOR);

    expect(placed).toHaveLength(3);
    expect(placed.filter((entity) => entity.hardwareId === 'hw-hinge-concealed-35')).toHaveLength(1);
    expect(new Set(placed.map((entity) => entity.meta.groupId)).size).toBe(1);
    expect(placed.every((entity) => entity.targetPartId === DOOR.id)).toBe(true);

    const hardwareRows = entitiesToBomRows(entities, materialCatalogById).filter(isHardwareBomRow);
    expect(hardwareRows).toHaveLength(1);
    expect(hardwareRows[0]).toMatchObject({
      material: 'hw-hinge-concealed-35',
      materialName: 'Concealed Hinge 35mm Cup',
      fastenerKind: 'hinge',
      quantity: 1,
    });
  });

  it('bills two hinges and one handle for a door hung with a full hardware set', () => {
    let state = placePattern('hw-hinge-concealed-35', { x: 5, y: 100 }, [DOOR], DOOR);
    state = placePattern('hw-hinge-concealed-35', { x: 5, y: 600 }, state.entities, DOOR);
    state = placePattern('hw-handle-bar-96', { x: 360, y: 350 }, state.entities, DOOR);

    const hardwareRows = entitiesToBomRows(state.entities, materialCatalogById).filter(isHardwareBomRow);
    const hinges = hardwareRows.filter((row) => row.material === 'hw-hinge-concealed-35');
    const handles = hardwareRows.filter((row) => row.material === 'hw-handle-bar-96');

    expect(hinges).toHaveLength(2);
    expect(handles).toHaveLength(1);
  });

  it('selects the whole boring set when any one hole is picked', () => {
    const { entities, placed } = placePattern('hw-hinge-concealed-35', { x: 5, y: 350 }, [DOOR], DOOR);
    const groupIndex = buildGroupIndex(entities);
    const pilot = placed.find((entity) => !entity.hardwareId);

    const selection = expandGroupedSelection(entities, [pilot.id], groupIndex);
    expect(new Set(selection)).toEqual(new Set(placed.map((entity) => entity.id)));
  });

  it('tags the primary hole in the export legend with the catalog name', () => {
    const { entities } = placePattern('hw-hinge-concealed-35', { x: 5, y: 350 }, [DOOR], DOOR);
    const legend = buildFastenerLegend(entities);

    expect(legend.items).toHaveLength(1);
    expect(legend.items[0]).toMatchObject({ name: 'Concealed Hinge 35mm Cup', quantity: 1, kind: 'hinge' });
    // One mark at the cup; the pilot holes stay untagged plain holes.
    expect(legend.marks).toHaveLength(1);
  });

  it('keeps two hinges on the same door apart in the legend count', () => {
    let state = placePattern('hw-hinge-concealed-35', { x: 5, y: 100 }, [DOOR], DOOR);
    state = placePattern('hw-hinge-concealed-35', { x: 5, y: 600 }, state.entities, DOOR);

    const legend = buildFastenerLegend(state.entities);
    expect(legend.items).toHaveLength(1);
    expect(legend.items[0].quantity).toBe(2);
    expect(legend.marks).toHaveLength(2);
  });
});
