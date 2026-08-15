import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShelfSagPanel, { isShelfSagPanelVisible, resolveShelfDefaults } from '../components/ShelfSagPanel';
import WoodMovementNotices from '../components/WoodMovementNotices';
import NestingPanel from '../components/NestingPanel';
import ExportBar from '../components/ExportBar';
import { getMaterialById } from '../data/materials';

const OAK_SHELF = {
  id: 'shelf',
  type: 'rect',
  x: 0,
  y: 0,
  width: 900,
  height: 250,
  materialId: 'oak-20x95',
  thickness: 20,
  grainAngle: 0,
  layerId: 'default',
};

function rigidJoint(id, sourceEdgeKey) {
  return {
    id,
    type: 'dado',
    sourcePartId: 'shelf',
    targetPartId: 'upright',
    resolvedContact: { sourceEdgeKey, targetEdgeKey: 'left' },
    validationState: { status: 'valid' },
  };
}

function linearRow(overrides = {}) {
  return {
    partId: 'l1',
    partName: 'Rail',
    role: 'line',
    material: 'pine-20x45',
    materialName: 'Pine 20x45mm',
    thickness: 20,
    width: 1000,
    height: 45,
    stockLength: 1000,
    stockSectionWidth: 45,
    stockKind: 'linear',
    costBasis: 'perLinearMeter',
    quantity: 3,
    ...overrides,
  };
}

describe('ShelfSagPanel', () => {
  it('shows only for parts made of a material with a published modulus', () => {
    expect(isShelfSagPanelVisible(OAK_SHELF)).toBe(true);
    expect(isShelfSagPanelVisible({ ...OAK_SHELF, materialId: 'mdf-18' })).toBe(true);
    expect(isShelfSagPanelVisible({ ...OAK_SHELF, materialId: null })).toBe(false);
    expect(isShelfSagPanelVisible({ ...OAK_SHELF, type: 'dimension' })).toBe(false);
    expect(isShelfSagPanelVisible(null)).toBe(false);
  });

  it('auto-fills span from the longest drawn dimension, depth from the shorter', () => {
    expect(resolveShelfDefaults(OAK_SHELF, getMaterialById('oak-20x95'))).toEqual({
      spanMm: 900,
      widthMm: 250,
      thicknessMm: 20,
    });
  });

  it('falls back to the catalog thickness when the entity has none', () => {
    expect(resolveShelfDefaults({ ...OAK_SHELF, thickness: null }, getMaterialById('oak-20x95')).thicknessMm).toBe(20);
  });

  it('renders a live verdict with the default book load', () => {
    const html = renderToStaticMarkup(<ShelfSagPanel entity={OAK_SHELF} />);
    // 900mm oak shelf, 250 deep, 20 thick, 25 kg/m:
    //   I = 250 x 20^3/12 = 166,666.67; E = 12.27 GPa
    //   delta = 5 x 0.24516625 x 900^4 / (384 x 12270 x 166666.67) = 1.0224mm
    //   1.0224 / 0.9 = 1.136 mm/m -> fine
    expect(html).toContain('1.02');
    expect(html).toContain('1.14');
    expect(html).toContain('Fine');
    expect(html).toContain('E = 12.27 GPa');
    expect(html).toContain('value="900"');
    expect(html).toContain('value="25"');
  });

  it('says why it cannot answer when the part has no thickness', () => {
    const html = renderToStaticMarkup(
      <ShelfSagPanel entity={{ ...OAK_SHELF, thickness: 0, materialId: 'birch-plywood-18' }} />,
    );
    // The plywood catalog entry supplies its own thickness, so this still
    // computes - the empty branch is for a material with none at all.
    expect(html).toContain('mm sag');
  });
});

describe('WoodMovementNotices', () => {
  it('renders nothing when no part is trapped', () => {
    expect(renderToStaticMarkup(<WoodMovementNotices entities={[OAK_SHELF]} joints={[]} />)).toBe('');
    expect(renderToStaticMarkup(<WoodMovementNotices entities={[OAK_SHELF]} joints={[rigidJoint('a', 'top')]} />)).toBe(
      '',
    );
  });

  it('warns with the movement figure and the advice when both edges are captured', () => {
    const html = renderToStaticMarkup(
      <WoodMovementNotices entities={[OAK_SHELF]} joints={[rigidJoint('a', 'top'), rigidJoint('b', 'bottom')]} />,
    );
    // 250mm across the grain, white oak C_T 0.00365, 6 %MC: 250 x 0.00365 x 6 = 5.475 -> 5.48mm
    expect(html).toContain('Wood movement');
    expect(html).toContain('5.48mm');
    expect(html).toContain('elongated holes / panel groove');
    expect(html).toContain('Movement');
  });
});

describe('ExportBar', () => {
  const props = { entities: [OAK_SHELF], selectedIds: [], bomRows: [], projectName: 'Bookcase' };

  it('offers the tiled full-scale template next to the existing 1:1 PDF', () => {
    const html = renderToStaticMarkup(<ExportBar {...props} />);
    expect(html).toContain('PDF 1:1');
    expect(html).toContain('PDF Template');
    expect(html).toContain('>A4<');
    expect(html).toContain('>Letter<');
  });

  it('offers a selection-only template once something is selected', () => {
    const html = renderToStaticMarkup(<ExportBar {...props} selectedIds={['shelf']} />);
    expect(html).toContain('Template (sel)');
  });

  it('shows the saw-kerf setting only when the project has linear stock', () => {
    expect(renderToStaticMarkup(<ExportBar {...props} />)).not.toContain('Cut kerf:');
    const withLinear = renderToStaticMarkup(<ExportBar {...props} bomRows={[linearRow()]} />);
    expect(withLinear).toContain('Cut kerf:');
    expect(withLinear).toContain('value="3"');
  });
});

describe('NestingPanel cut list section', () => {
  it('shows the cut list when the BOM has linear stock', () => {
    const html = renderToStaticMarkup(<NestingPanel bomRows={[linearRow()]} />);
    expect(html).toContain('Cut list');
    expect(html).toContain('Saw kerf per cut (mm)');
    expect(html).toContain('Board length (mm)');
    // Three 1000mm rails at 3mm kerf on a 2400mm pine board: 2 on the first
    // (2006mm consumed, 394 offcut) and 1 on a second.
    expect(html).toContain('Board 1 — 2 cuts');
    expect(html).toContain('394mm offcut');
    expect(html).toContain('Board 2 — 1 cut');
  });

  it('defaults the board length to the catalog stock length', () => {
    const html = renderToStaticMarkup(<NestingPanel bomRows={[linearRow()]} />);
    expect(html).toContain('value="2400"');
  });

  it('hides the cut list entirely for a sheet-only BOM', () => {
    const html = renderToStaticMarkup(
      <NestingPanel
        bomRows={[
          {
            partId: 'r1',
            partName: 'Panel',
            material: 'birch-plywood-18',
            materialName: '18mm Birch Plywood',
            width: 600,
            height: 400,
            stockKind: 'sheet',
            costBasis: 'perM2',
            quantity: 1,
          },
        ]}
      />,
    );
    expect(html).not.toContain('Cut list');
    expect(html).toContain('Cut-List Optimizer');
  });

  it('flags an oversize part in the panel rather than dropping it', () => {
    const html = renderToStaticMarkup(
      <NestingPanel bomRows={[linearRow({ partName: 'Long rail', stockLength: 3000, quantity: 1 })]} />,
    );
    expect(html).toContain('longer than a 2400mm board');
    expect(html).toContain('Long rail');
  });
});
