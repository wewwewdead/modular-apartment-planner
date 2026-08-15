import { describe, expect, it } from 'vitest';
import { resolveSketchDocument } from '../../utils/sketchDocumentResolver';
import { createSketchJoint } from '../../utils/sketchJoineryUtils';
import { groupBomRows } from '../../utils/bomUtils';
import { computeRowCost } from '../../utils/materialCostUtils';
import { exportBomWithCost } from '../../utils/bomExportUtils';
import { buildBomEntityList, entitiesToBomRows, isHardwareBomRow } from '../utils/entityBomAdapter';
import { generateBomHtml } from '../export/bomHtmlExport';
import { buildMaterialCatalogById, buildMaterialPricingDict, getBuiltInMaterials } from '../data/materials';

const builtInMaterials = getBuiltInMaterials();
const materialCatalogById = buildMaterialCatalogById(builtInMaterials);
const materialPricing = buildMaterialPricingDict(builtInMaterials);

function createDocument(jointType, parameters = {}) {
  return {
    version: 1,
    id: `doc-${jointType}-hardware`,
    name: 'Joinery Hardware Test',
    units: 'mm',
    metadata: {},
    objectDefinition: {},
    layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
    variables: [],
    joints: [
      createSketchJoint({
        id: `joint-${jointType}`,
        type: jointType,
        sourcePartId: 'shelf',
        targetPartId: 'panel',
        parameters,
      }),
    ],
    entities: [
      {
        id: 'panel',
        type: 'rect',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        rotation: 0,
        thickness: 18,
        materialId: 'birch-plywood-18',
        layerId: 'default',
        meta: {},
      },
      {
        id: 'shelf',
        type: 'rect',
        x: 40,
        y: -18,
        width: 300,
        height: 18,
        rotation: 0,
        thickness: 18,
        materialId: 'birch-plywood-18',
        layerId: 'default',
        meta: {},
      },
    ],
  };
}

/** The BOM the craftsman sidebar renders, from a resolved document. */
function buildBom(resolution) {
  const entities = buildBomEntityList(resolution.document.entities, resolution.manufacturingExportEntities);
  return groupBomRows(entitiesToBomRows(entities, materialCatalogById));
}

describe('joinery hardware reaches the BOM', () => {
  it('bills one pocket screw per pocket, not one per drilled hole', () => {
    const resolution = resolveSketchDocument(createDocument('pocket_screw', { count: 3 }));
    const featureCount = resolution.manufacturingExportEntities.filter(
      (entity) => entity.type === 'feature' && entity.meta?.joinery?.fabrication?.hardware?.kind === 'pocket-screw',
    ).length;
    const hardwareRows = buildBom(resolution).filter(isHardwareBomRow);

    // 3 pocket bores in the source part + 3 pilot holes in the target part.
    expect(featureCount).toBe(6);
    expect(hardwareRows).toHaveLength(1);
    expect(hardwareRows[0]).toMatchObject({
      material: 'hw-pocket-screw-32-coarse',
      fastenerKind: 'pocket-screw',
      stockKind: 'piece',
      quantity: 3,
    });
    expect(computeRowCost(hardwareRows[0], materialPricing).totalCost).toBeCloseTo(0.36, 6);
  });

  it('bills one dowel per matched hole pair', () => {
    const resolution = resolveSketchDocument(createDocument('dowel', { count: 2, dowelDiameter: 8 }));
    const hardwareRows = buildBom(resolution).filter(isHardwareBomRow);

    expect(hardwareRows).toHaveLength(1);
    expect(hardwareRows[0]).toMatchObject({
      material: 'hw-dowel-8-35',
      fastenerKind: 'dowel',
      quantity: 2,
    });
  });

  it('leaves panel rows untouched and keeps cut geometry out of the hardware section', () => {
    const resolution = resolveSketchDocument(createDocument('dado'));
    const rows = buildBom(resolution);

    expect(rows.filter(isHardwareBomRow)).toHaveLength(0);
    expect(rows.every((row) => row.material === 'birch-plywood-18')).toBe(true);
  });

  it('exports hardware to the CSV and the HTML report', () => {
    const resolution = resolveSketchDocument(createDocument('pocket_screw', { count: 3 }));
    const rows = buildBom(resolution).map((row) => ({ ...row, ...computeRowCost(row, materialPricing) }));
    const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);

    const csv = exportBomWithCost(rows, 'csv', { rows, totalCost, costByMaterial: {} });
    const hardwareLine = csv.split('\n').find((line) => line.includes('Pocket Screw'));
    expect(hardwareLine).toContain('hardware');
    expect(hardwareLine).toContain('hw-pocket-screw-32-coarse');
    expect(hardwareLine).toContain('perPiece');

    const html = generateBomHtml(rows, totalCost, 'Hardware Test');
    expect(html).toContain('<h2>Hardware</h2>');
    expect(html).toContain('Pocket Screw #8 x 32mm Coarse');
    expect(html).toContain('$0.36');
  });

  it('does not double count when preview and export features are both supplied', () => {
    const resolution = resolveSketchDocument(createDocument('pocket_screw', { count: 2 }));
    const entities = buildBomEntityList(resolution.document.entities, [
      ...resolution.manufacturingPreviewEntities,
      ...resolution.manufacturingExportEntities,
    ]);
    const hardwareRows = groupBomRows(entitiesToBomRows(entities, materialCatalogById)).filter(isHardwareBomRow);

    expect(hardwareRows).toHaveLength(1);
    expect(hardwareRows[0].quantity).toBe(2);
  });
});
