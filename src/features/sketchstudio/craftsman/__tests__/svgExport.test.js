import { describe, expect, it } from 'vitest';
import { exportEntitiesToSvg } from '../export/svgExport';

describe('SVG export', () => {
  it('produces valid SVG with mm units for a rect', () => {
    const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 400 }];
    const svg = exportEntitiesToSvg(entities);

    expect(svg).toContain('<?xml');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="600"');
    expect(svg).toContain('height="400"');
    expect(svg).toContain('Craftsman Studio');
  });

  it('produces valid SVG shell for empty entities', () => {
    const svg = exportEntitiesToSvg([]);

    expect(svg).toContain('<?xml');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).not.toContain('<rect');
  });

  it('exports circle with correct attributes', () => {
    const entities = [{ id: 'c1', type: 'circle', cx: 100, cy: 100, radius: 50 }];
    const svg = exportEntitiesToSvg(entities);

    expect(svg).toContain('<circle');
    expect(svg).toContain('cx="100"');
    expect(svg).toContain('cy="100"');
    expect(svg).toContain('r="50"');
  });

  it('exports polyline as polygon when closed', () => {
    const entities = [{
      id: 'p1',
      type: 'polyline',
      closed: true,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }],
    }];
    const svg = exportEntitiesToSvg(entities);

    expect(svg).toContain('<polygon');
    expect(svg).toContain('0,0 100,0 50,80');
  });

  it('exports open polyline as polyline element', () => {
    const entities = [{
      id: 'p1',
      type: 'polyline',
      closed: false,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    }];
    const svg = exportEntitiesToSvg(entities);

    expect(svg).toContain('<polyline');
    expect(svg).not.toContain('<polygon');
  });

  it('filters by selection when selectedOnly is true', () => {
    const entities = [
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 100 },
      { id: 'r2', type: 'rect', x: 200, y: 0, width: 100, height: 100 },
    ];

    const svg = exportEntitiesToSvg(entities, { selectedOnly: true, selectedIds: ['r1'] });
    const rectCount = (svg.match(/<rect /g) || []).length;
    expect(rectCount).toBe(1);
  });

  it('exports text entities alongside geometry', () => {
    const entities = [
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 100 },
      { id: 't1', type: 'text', x: 0, y: 0, text: 'Label', fontSize: 12 },
    ];

    const svg = exportEntitiesToSvg(entities);
    const rectCount = (svg.match(/<rect /g) || []).length;
    expect(rectCount).toBe(1);
    expect(svg).toContain('<text');
    expect(svg).toContain('Label');
  });
});
