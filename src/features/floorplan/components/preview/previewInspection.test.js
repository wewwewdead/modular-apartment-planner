import { describe, expect, it } from 'vitest';
import { createCeiling } from '@/domain/ceilingModels';
import { createFloor } from '@/domain/models';
import { getPreviewInspection, isPreviewInspectableType } from './previewInspection';

/**
 * Ceilings are the one inspectable that lives on the project rather than on a
 * floor, so the cases worth pinning are that it is found at all and that it
 * reports its own local frame — a ceiling hung off a rotated grid measures
 * along its own edges, not along plan north.
 */
function rectangle(length, depth, rotationRad = 0) {
  const halfLength = length / 2;
  const halfDepth = depth / 2;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return [
    { x: -halfLength, y: -halfDepth },
    { x: halfLength, y: -halfDepth },
    { x: halfLength, y: halfDepth },
    { x: -halfLength, y: halfDepth },
  ].map((point) => ({ x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }));
}

function makeProject(ceilingOptions = {}) {
  const floor = createFloor('Ground Floor', 0);
  const ceiling = createCeiling('Kitchen Ceiling', {
    floorId: floor.id,
    boundaryPolygon: rectangle(6000, 4000),
    baseElevation: 2700,
    ...ceilingOptions,
  });
  return { project: { floors: [floor], ceilings: [ceiling] }, floor, ceiling };
}

function rowValue(inspection, label) {
  return inspection.rows.find((row) => row.label === label)?.value;
}

describe('getPreviewInspection — ceilings', () => {
  it('treats a ceiling as inspectable', () => {
    expect(isPreviewInspectableType('ceiling')).toBe(true);
  });

  it('reports a manual ceiling against the floor it belongs to', () => {
    const { project, floor, ceiling } = makeProject();

    const inspection = getPreviewInspection(project, 'ceiling', ceiling.id);

    expect(inspection).toMatchObject({
      id: ceiling.id,
      type: 'ceiling',
      floorId: floor.id,
      floorName: 'Ground Floor',
      title: 'Kitchen Ceiling',
      subtitle: 'Ground Floor · Ceiling',
    });
    expect(rowValue(inspection, 'Length')).toBe('6000 mm');
    expect(rowValue(inspection, 'Depth')).toBe('4000 mm');
    expect(rowValue(inspection, 'Area')).toBe('24.00 m²');
    // Manual mode hangs nothing: the stored datum is the board underside.
    expect(rowValue(inspection, 'Board Underside')).toBe('2700 mm');
    expect(rowValue(inspection, 'Attachment')).toBe('Manual datum');
    expect(rowValue(inspection, 'Boards')).toBe('Boarded');
  });

  it('measures a rotated ceiling along its own edges', () => {
    const { project, ceiling } = makeProject({
      boundaryPolygon: rectangle(6000, 4000, Math.PI / 6),
      boundarySource: 'drawn',
    });

    const inspection = getPreviewInspection(project, 'ceiling', ceiling.id);

    expect(rowValue(inspection, 'Length')).toBe('6000 mm');
    expect(rowValue(inspection, 'Depth')).toBe('4000 mm');
    expect(rowValue(inspection, 'Area')).toBe('24.00 m²');
  });

  it('names an unboarded ceiling and counts its fixtures only when it has some', () => {
    const { project, ceiling } = makeProject({
      detailing: {
        face: { enabled: false },
        lighting: {
          fixtures: [
            { u: 1000, v: 800 },
            { u: 3000, v: 800 },
          ],
        },
      },
    });

    const inspection = getPreviewInspection(project, 'ceiling', ceiling.id);

    expect(rowValue(inspection, 'Boards')).toBe('Not boarded');
    expect(rowValue(inspection, 'Light Fixtures')).toBe('2');

    const bare = makeProject();
    const bareInspection = getPreviewInspection(bare.project, 'ceiling', bare.ceiling.id);
    expect(bareInspection.rows.some((row) => row.label === 'Light Fixtures')).toBe(false);
  });

  it('returns nothing for a ceiling id the project does not hold', () => {
    const { project } = makeProject();

    expect(getPreviewInspection(project, 'ceiling', 'ceiling_missing')).toBeNull();
    expect(getPreviewInspection(project, 'ceiling', null)).toBeNull();
  });
});

describe('getPreviewInspection — the roof and its trims', () => {
  async function roofProject(roofOptions = {}) {
    const { createRoofSystem } = await import('@/domain/roofModels');
    const floor = createFloor('Ground Floor', 0);
    const roofSystem = createRoofSystem('Roof', {
      id: 'roof_1',
      roofType: 'gable',
      boundaryPolygon: rectangle(10000, 8000),
      ...roofOptions,
    });
    return { floors: [floor], roofSystem };
  }

  it('lists what the edge kit draws, and the covering', async () => {
    const project = await roofProject();
    const inspection = getPreviewInspection(project, 'roofSystem', 'roof_1');
    expect(rowValue(inspection, 'Trims')).toBe('Fascia · Barge · Gutter · Downpipes · Ridge cap · Boxed soffit');
    expect(rowValue(inspection, 'Covering')).toBe('Corrugated metal · Shale Grey');
  });

  it('drops a trim the moment it is switched off', async () => {
    const project = await roofProject({ trims: { fascia: { enabled: false } } });
    const inspection = getPreviewInspection(project, 'roofSystem', 'roof_1');
    expect(rowValue(inspection, 'Trims')).toBe('Barge · Gutter · Downpipes · Ridge cap · Boxed soffit');
  });

  it('says a flat roof has none', async () => {
    const project = await roofProject({ roofType: 'flat' });
    expect(rowValue(getPreviewInspection(project, 'roofSystem', 'roof_1'), 'Trims')).toBe('None (flat roof)');
  });
});

describe('getPreviewInspection — truss system end closures', () => {
  async function trussProject(endClosures) {
    const { createTrussSystem } = await import('@/domain/trussModels');
    const floor = { ...createFloor('Ground Floor', 0), id: 'floor_1' };
    const trussSystem = createTrussSystem('Trusses', {
      id: 'ts_1',
      floorId: 'floor_1',
      baseElevation: 3000,
      endClosures,
      trussInstances: [
        {
          id: 'ti_1',
          trussTypeId: 'truss_type_gable',
          span: 7200,
          rise: 1800,
          spacing: 900,
          count: 5,
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 3600, y: 0 },
        },
      ],
    });
    return { floors: [floor], trussSystems: [trussSystem], roofSystem: null };
  }

  it('says what closes each end, and the infill area', async () => {
    const inspection = getPreviewInspection(await trussProject(), 'trussSystem', 'ts_1');
    expect(rowValue(inspection, 'End closures')).toBe('End A: Infill · fibre cement · End B: Infill · fibre cement');
    // RT-3: two 7.85 m² gables (the 6.48 triangle on a 190.6 heel strip).
    expect(rowValue(inspection, 'Gable infill')).toBe('15.70 m²');
  });

  it('follows a side switched open', async () => {
    const inspection = getPreviewInspection(
      await trussProject({ start: { mode: 'open' }, end: { assemblyPreset: 'plywood' } }),
      'trussSystem',
      'ts_1',
    );
    expect(rowValue(inspection, 'End closures')).toBe('End A: Open · End B: Infill · plywood');
    expect(rowValue(inspection, 'Gable infill')).toBe('7.85 m²');
  });
});
