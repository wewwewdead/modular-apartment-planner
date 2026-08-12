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

  it('gives only the selected grid a rotation grip, inside its own transform', () => {
    const structuralSystem = {
      gridSystems: [
        {
          id: 'grid_1',
          origin: { x: 0, y: 0 },
          rotation: 0,
          axes: [
            { id: 'x1', label: '1', orientation: 'vertical', offset: 0 },
            { id: 'x2', label: '2', orientation: 'vertical', offset: 4000 },
            { id: 'y1', label: 'A', orientation: 'horizontal', offset: 0 },
          ],
        },
        { id: 'grid_2', origin: { x: 0, y: 0 }, rotation: 0, axes: [] },
      ],
      columnStacks: [],
    };
    const floor = { id: 'ground', columns: [] };

    const unselected = renderToStaticMarkup(
      <svg>
        <StructuralGridOverlay structuralSystem={structuralSystem} floor={floor} />
      </svg>,
    );
    expect(unselected).not.toContain('data-handle="grid-rotate"');

    const selected = renderToStaticMarkup(
      <svg>
        <StructuralGridOverlay
          structuralSystem={structuralSystem}
          floor={floor}
          selectedId="grid_1"
          selectedType="structuralGrid"
        />
      </svg>,
    );
    // One grip only, on the selected grid, out past the axis extent on local +x
    // (4000 + 700 extension + 1000 clearance) so it turns with the grid.
    expect(selected.match(/data-handle="grid-rotate"/g)).toHaveLength(1);
    expect(selected).toContain('cx="5700"');
  });

  it('draws an uncommitted drag at the preview origin, pinned stacks included', () => {
    const html = renderToStaticMarkup(
      <svg>
        <StructuralGridOverlay
          structuralSystem={{
            gridSystems: [
              {
                id: 'grid_1',
                origin: { x: 1000, y: 2000 },
                rotation: 10,
                axes: [{ id: 'x1', label: '1', orientation: 'vertical', offset: 0 }],
              },
              { id: 'grid_2', origin: { x: 0, y: 0 }, rotation: 0, axes: [] },
            ],
            columnStacks: [
              {
                id: 'stack_pinned',
                origin: { x: 1000, y: 2000 },
                gridIntersection: { gridId: 'grid_1' },
                columnRefs: [],
              },
              { id: 'stack_loose', origin: { x: 9000, y: 9000 }, columnRefs: [] },
            ],
          }}
          floor={{ id: 'ground', columns: [] }}
          previewTransform={{ gridId: 'grid_1', origin: { x: 1600, y: 2500 } }}
        />
      </svg>,
    );

    expect(html).toContain('translate(1600 2500) rotate(10)');
    // The other grid and the unpinned stack stay where the project has them.
    expect(html).toContain('translate(0 0) rotate(0)');
    expect(html).toContain('cx="9000"');
    // The pinned stack travels with the preview by the same 600/500 shift.
    expect(html).toContain('cx="1600"');
    expect(html).toContain('cy="2500"');
  });

  it('applies an uncommitted rotation, carrying pinned stacks round with it', () => {
    const html = renderToStaticMarkup(
      <svg>
        <StructuralGridOverlay
          structuralSystem={{
            gridSystems: [
              {
                id: 'grid_1',
                origin: { x: 0, y: 0 },
                rotation: 0,
                axes: [{ id: 'x1', label: '1', orientation: 'vertical', offset: 0 }],
              },
            ],
            columnStacks: [
              {
                id: 'stack_pinned',
                origin: { x: 4000, y: 0 },
                gridIntersection: { gridId: 'grid_1' },
                columnRefs: [],
              },
            ],
          }}
          floor={{ id: 'ground', columns: [] }}
          previewTransform={{ gridId: 'grid_1', origin: { x: 0, y: 0 }, rotation: 90 }}
        />
      </svg>,
    );

    expect(html).toContain('translate(0 0) rotate(90)');
    // 90° clockwise in y-down space takes the stack from +x onto +y.
    expect(html).toContain('cy="4000"');
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
