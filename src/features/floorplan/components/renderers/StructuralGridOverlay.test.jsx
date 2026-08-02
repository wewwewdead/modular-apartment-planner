import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StructuralGridOverlay from './StructuralGridOverlay';

describe('StructuralGridOverlay', () => {
  it('renders transformed axes, bubbles, and stack alignment state', () => {
    const html = renderToStaticMarkup(
      <svg>
        <StructuralGridOverlay
          structuralSystem={{
            gridSystems: [
              {
                id: 'grid_1',
                origin: { x: 1000, y: 2000 },
                rotation: 10,
                axes: [
                  { id: 'x1', label: '1', orientation: 'vertical', offset: 0 },
                  { id: 'x2', label: '2', orientation: 'vertical', offset: 4000 },
                  { id: 'y1', label: 'A', orientation: 'horizontal', offset: 0 },
                  { id: 'y2', label: 'B', orientation: 'horizontal', offset: 4000 },
                ],
              },
            ],
            columnStacks: [
              {
                id: 'stack_1',
                origin: { x: 1000, y: 2000 },
                columnRefs: [{ floorId: 'ground', columnId: 'column_1' }],
              },
              { id: 'stack_planned', origin: { x: 5000, y: 2000 }, columnRefs: [] },
            ],
          }}
          floor={{ id: 'ground', columns: [{ id: 'column_1', x: 1120, y: 2000 }] }}
        />
      </svg>,
    );

    expect(html).toContain('data-layer="structural-coordination"');
    expect(html).toContain('translate(1000 2000) rotate(10)');
    expect(html).toContain('data-axis-id="x1"');
    expect(html).toContain('data-status="misaligned"');
    expect(html).toContain('120 mm offset');
    expect(html).toContain('data-status="planned"');
  });

  it('renders conceptual load-path relationships as a distinct non-analysis layer', () => {
    const html = renderToStaticMarkup(
      <svg>
        <StructuralGridOverlay
          structuralSystem={{ gridSystems: [], columnStacks: [] }}
          floor={{ id: 'floor_1', columns: [] }}
          loadPath={{
            edges: [
              {
                id: 'slab:1->beam:1',
                kind: 'slab_to_beam',
                floorId: 'floor_1',
                fromPoint: { x: 1000, y: 1000 },
                toPoint: { x: 1000, y: 0 },
              },
            ],
          }}
        />
      </svg>,
    );
    expect(html).toContain('data-type="conceptual-load-path"');
    expect(html).toContain('data-edge-kind="slab_to_beam"');
  });

  it('renders nothing when no structural coordination entities exist', () => {
    const html = renderToStaticMarkup(
      <svg>
        <StructuralGridOverlay structuralSystem={{ gridSystems: [], columnStacks: [] }} floor={null} />
      </svg>,
    );
    expect(html).not.toContain('data-layer="structural-coordination"');
  });
});
