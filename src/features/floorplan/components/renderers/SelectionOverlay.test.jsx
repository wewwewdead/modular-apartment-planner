import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SelectionOverlay from './SelectionOverlay';

function floorWithSlab() {
  return {
    id: 'floor-1',
    slabs: [
      {
        id: 'slab-1',
        boundaryPoints: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 5100 },
          { x: 0, y: 5100 },
        ],
      },
    ],
    walls: [],
    doors: [],
    windows: [],
    rooms: [],
  };
}

function render(props) {
  return renderToStaticMarkup(
    <svg>
      <SelectionOverlay floor={floorWithSlab()} zoom={0.1} {...props} />
    </svg>,
  );
}

describe('SelectionOverlay — a selected plate', () => {
  it('tints the plate without taking the clicks off what is drawn under it', () => {
    // The tint covers the WHOLE plate, so as a click target it swallows every
    // annotation on the plan beneath it — including the overhang indicators
    // that run along this plate's own edges, which is the only way to point at
    // one cantilever of several.
    const markup = render({ selectedId: 'slab-1', selectedType: 'slab' });
    const tint = markup.match(/<polygon[^>]*>/)[0];

    expect(tint).toContain('pointer-events:none');
  });

  it('keeps the corner and edge handles grabbable', () => {
    // Nothing is gained by letting clicks through if the plate can no longer be
    // reshaped: these are what a cantilever is dragged out with.
    const markup = render({ selectedId: 'slab-1', selectedType: 'slab' });
    const edgeHandle = markup.match(/<circle[^>]*data-handle="slab-edge"[^>]*>/)[0];
    const vertexHandle = markup.match(/<rect[^>]*data-handle="slab-vertex"[^>]*>/)[0];

    expect(edgeHandle).not.toContain('pointer-events:none');
    expect(vertexHandle).not.toContain('pointer-events:none');
  });

  it('draws nothing without a selection to draw around', () => {
    expect(render({ selectedId: null, selectedType: 'slab' })).toBe('<svg></svg>');
    expect(render({ selectedId: 'slab-missing', selectedType: 'slab' })).toBe('<svg></svg>');
  });

  it("stands down entirely while one of the plate's cantilever runs is picked", () => {
    // The picked run is the selection, drawn solid by the indicator layer. The
    // plate tint and handles reading as "the whole slab is selected" on top of
    // it is exactly the complaint that led here — so they yield until the run
    // is released.
    const picked = render({
      selectedId: 'slab-1',
      selectedType: 'slab',
      selectedOverhangEdge: { slabId: 'slab-1', edgeIndex: 1 },
    });
    expect(picked).toBe('<svg></svg>');

    // A pick on some other plate is not this plate's business.
    const otherPlate = render({
      selectedId: 'slab-1',
      selectedType: 'slab',
      selectedOverhangEdge: { slabId: 'slab-other', edgeIndex: 0 },
    });
    expect(otherPlate).toContain('data-handle="slab-vertex"');
  });
});
