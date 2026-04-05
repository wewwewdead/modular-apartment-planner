import { describe, expect, it } from 'vitest';
import { buildSvgExportDocument, exportEntitiesToSvg } from '../export/svgExport';
import { createSketchJoint, resolveSketchJoinery } from '../../utils/sketchJoineryUtils';

describe('SVG export', () => {
  it('produces SVG documents with explicit millimeter sizing', () => {
    const svg = exportEntitiesToSvg([{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 400 }]);

    expect(svg).toContain('<?xml');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="640mm"');
    expect(svg).toContain('height="440mm"');
    expect(svg).toContain('Craftsman Studio');
  });

  it('exports arc entities with the exact quadratic path geometry', () => {
    const svg = exportEntitiesToSvg([{
      id: 'a1',
      type: 'arc',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      control: { x: 50, y: 50 },
    }]);

    expect(svg).toContain('<path d="M 0 0 Q 50 50 100 0"');
    expect(svg).not.toContain('A 50 50');
  });

  it('computes bounds from exported geometry without DOM helpers', () => {
    const document = buildSvgExportDocument([{
      id: 'a1',
      type: 'arc',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      control: { x: 50, y: 100 },
    }]);

    expect(document.bounds.width).toBeGreaterThan(100);
    expect(document.bounds.height).toBeGreaterThan(40);
    expect(document.elements).toHaveLength(1);
  });

  it('filters by selection when requested', () => {
    const svg = exportEntitiesToSvg([
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 100 },
      { id: 'r2', type: 'rect', x: 200, y: 0, width: 100, height: 100 },
    ], {
      selectedOnly: true,
      selectedIds: ['r1'],
    });

    expect((svg.match(/<rect /g) || []).length).toBe(1);
  });

  it('includes generated joinery geometry for selected source parts and omits hidden base outlines', () => {
    const baseEntities = [
      { id: 'panel', type: 'rect', x: 0, y: 0, width: 200, height: 120, rotation: 0, thickness: 18, layerId: 'default', meta: {} },
      { id: 'back', type: 'rect', x: 50, y: -18, width: 100, height: 18, rotation: 0, thickness: 6, layerId: 'default', meta: {} },
    ];
    const joint = createSketchJoint({
      id: 'joint-rabbet',
      type: 'rabbet',
      sourcePartId: 'back',
      targetPartId: 'panel',
      sourceEdgeRef: { entityId: 'back', sourceType: 'segment', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
      parameters: {
        width: 100,
        depth: 9,
      },
    });
    const resolution = resolveSketchJoinery(baseEntities, [joint]);

    const svg = exportEntitiesToSvg(resolution.exportEntities, {
      selectedOnly: true,
      selectedIds: ['panel'],
      referenceEntities: baseEntities,
    });

    expect((svg.match(/<polygon /g) || []).length).toBe(1);
    expect(svg).not.toContain('<rect');
  });

  it('preserves text and circle export support', () => {
    const svg = exportEntitiesToSvg([
      { id: 'c1', type: 'circle', cx: 100, cy: 100, radius: 50 },
      { id: 't1', type: 'text', x: 0, y: 0, text: 'Label', fontSize: 12 },
    ]);

    expect(svg).toContain('<circle');
    expect(svg).toContain('<text');
    expect(svg).toContain('Label');
  });

  it('exports text leader arrows with the label', () => {
    const svg = exportEntitiesToSvg([
      {
        id: 't1',
        type: 'text',
        x: 100,
        y: 20,
        text: 'Label',
        fontSize: 12,
        leader: { target: { x: 40, y: 80 } },
      },
    ]);

    expect(svg).toContain('<line');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<text');
  });
});
