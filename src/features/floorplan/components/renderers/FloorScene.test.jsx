import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('./FloorPlanLayer', () => ({
  default: function MockFloorPlanLayer({ selectedId }) {
    return <g data-marker={`floor-plan:${selectedId || 'none'}`} />;
  },
}));

vi.mock('./FloorSelectionLayer', () => ({
  default: function MockFloorSelectionLayer({ marqueeBounds, selectionBounds }) {
    const marquee = marqueeBounds
      ? `${marqueeBounds.minX},${marqueeBounds.minY},${marqueeBounds.maxX},${marqueeBounds.maxY}`
      : 'none';
    const selection = selectionBounds
      ? `${selectionBounds.minX},${selectionBounds.minY},${selectionBounds.maxX},${selectionBounds.maxY}`
      : 'none';

    return <g data-marker={`floor-selection:${marquee}:${selection}`} />;
  },
}));

vi.mock('./FloorPreviewLayer', () => ({
  default: function MockFloorPreviewLayer({ activeTool }) {
    return <g data-marker={`floor-preview:${activeTool || 'none'}`} />;
  },
}));

vi.mock('./SectionRenderer', () => ({
  default: function MockSectionRenderer({
    activeSectionCutId,
    roofHiddenByPhase,
    hasProjectRoof,
    railingsHiddenByPhase,
    hasProjectRailings,
  }) {
    return (
      <g
        data-marker={[
          'section',
          activeSectionCutId || 'none',
          roofHiddenByPhase,
          hasProjectRoof,
          railingsHiddenByPhase,
          hasProjectRailings,
        ].join(':')}
      />
    );
  },
}));

vi.mock('./ElevationRenderer', () => ({
  default: function MockElevationRenderer({ viewMode, selectedId, selectedType }) {
    return <g data-marker={['elevation', viewMode, selectedId || 'none', selectedType || 'none'].join(':')} />;
  },
}));

import FloorScene from './FloorScene';

function createFloor(id = 'floor-1') {
  return {
    id,
    slabs: [],
    rooms: [],
    walls: [],
    beams: [],
    stairs: [],
    landings: [],
    railings: [],
    columns: [],
    fixtures: [],
    doors: [],
    windows: [],
    sectionCuts: [],
  };
}

function renderScene(overrides = {}) {
  const floor = overrides.floor === undefined ? createFloor() : overrides.floor;
  const filteredFloor = overrides.filteredFloor === undefined ? floor : overrides.filteredFloor;

  const props = {
    floor,
    filteredFloor,
    filteredProject: { floors: filteredFloor ? [filteredFloor] : [], trussSystems: [], roofSystem: null },
    viewMode: 'plan',
    selectedId: 'wall-1',
    selectedType: 'wall',
    activeTool: 'select',
    toolState: {},
    zoom: 1,
    previewContent: null,
    regionSelection: null,
    activeSectionCutId: null,
    roofHiddenByPhase: false,
    hasProjectRoof: false,
    railingsHiddenByPhase: false,
    hasProjectRailings: false,
    ...overrides,
  };

  return renderToStaticMarkup(
    <svg>
      <FloorScene {...props} />
    </svg>,
  );
}

describe('FloorScene', () => {
  it('renders the extracted plan layers and forwards normalized marquee bounds', () => {
    const markup = renderScene({
      toolState: {
        dragType: 'marquee',
        startPos: { x: 20, y: 10 },
        currentPos: { x: 5, y: 30 },
      },
      regionSelection: {
        bounds: { minX: 1, minY: 2, maxX: 3, maxY: 4 },
      },
    });

    expect(markup).toContain('floor-plan:wall-1');
    expect(markup).toContain('floor-selection:5,10,20,30:1,2,3,4');
    expect(markup).toContain('floor-preview:select');
  });

  it('delegates section view rendering to SectionRenderer', () => {
    const markup = renderScene({
      viewMode: 'section_view',
      activeSectionCutId: 'section-a',
      roofHiddenByPhase: true,
      hasProjectRoof: true,
      railingsHiddenByPhase: false,
      hasProjectRailings: true,
    });

    expect(markup).toContain('section:section-a:true:true:false:true');
    expect(markup).not.toContain('floor-plan:');
  });

  it('delegates elevation views to ElevationRenderer', () => {
    const markup = renderScene({
      viewMode: 'elevation_front',
      selectedId: 'door-1',
      selectedType: 'door',
    });

    expect(markup).toContain('elevation:elevation_front:door-1:door');
    expect(markup).not.toContain('floor-preview:');
  });

  it('renders nothing when there is no active floor', () => {
    expect(renderScene({ floor: null, filteredFloor: null })).toBe('<svg></svg>');
  });

  it('draws the ghost floor below underneath the active plan, and only when asked', () => {
    const floorBelow = {
      ...createFloor('floor-0'),
      walls: [{ id: 'wall-below', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 200 }],
    };

    const withUnderlay = renderScene({ floorBelow, showFloorBelowUnderlay: true });
    expect(withUnderlay).toContain('floor-underlay');
    // Below the active floor's plan layer: an overhang has to read as this
    // floor drawn OVER the one beneath it.
    expect(withUnderlay.indexOf('floor-underlay')).toBeLessThan(withUnderlay.indexOf('floor-plan:'));

    expect(renderScene({ floorBelow, showFloorBelowUnderlay: false })).not.toContain('floor-underlay');
    // Ground floor: nothing below to ghost.
    expect(renderScene({ floorBelow: null, showFloorBelowUnderlay: true })).not.toContain('floor-underlay');
  });

  it('marks cantilevered slab edges over the active plan, and nothing when none overhang', () => {
    const floorOverhangs = [
      {
        floorId: 'floor-1',
        belowFloorId: 'floor-0',
        slabId: 'slab-1',
        overhangEdges: [
          { start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, depthMm: 620 },
          { start: { x: 3000, y: 0 }, end: { x: 3000, y: 900 }, depthMm: 240 },
        ],
        maxDepthMm: 620,
      },
    ];

    const marked = renderScene({ floorOverhangs });
    expect(marked).toContain('overhang-indicators');
    // One label per slab, carrying the deepest reach — not one per edge.
    expect(marked.match(/>620</g)).toHaveLength(1);
    expect(marked).not.toContain('>240<');
    // Annotates this floor, so it sits ON the plan rather than under it.
    expect(marked.indexOf('floor-plan:')).toBeLessThan(marked.indexOf('overhang-indicators'));

    // Nothing cantilevered: the layer must not put a group on the drawing.
    expect(renderScene({ floorOverhangs: null })).not.toContain('overhang-indicators');
    expect(renderScene({ floorOverhangs: [] })).not.toContain('overhang-indicators');
  });

  describe('picking one cantilever of several', () => {
    const floorOverhangs = [
      {
        floorId: 'floor-1',
        belowFloorId: 'floor-0',
        slabId: 'slab-1',
        overhangEdges: [
          { start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, depthMm: 620, boundaryEdgeIndex: 0 },
          { start: { x: 3000, y: 0 }, end: { x: 3000, y: 900 }, depthMm: 240, boundaryEdgeIndex: 1 },
        ],
        maxDepthMm: 620,
      },
    ];

    it('gives every run a hit target that names it', () => {
      const markup = renderScene({ floorOverhangs });

      expect(markup).toContain('data-overhang-slab="slab-1"');
      expect(markup).toContain('data-overhang-edge="0"');
      expect(markup).toContain('data-overhang-edge="1"');
      expect(markup).toContain('pointer-events:stroke');
      // The number that measures a run is not a way of pointing at it.
      expect(markup).toContain('pointer-events:none');
    });

    it('draws the selected run differently from the passive ones', () => {
      const selected = renderScene({ floorOverhangs, selectedOverhangEdge: { slabId: 'slab-1', edgeIndex: 1 } });

      expect(selected).toContain('var(--color-selection)');
      expect(renderScene({ floorOverhangs })).not.toContain('var(--color-selection)');
    });

    it('fails soft on a run index that no longer exists, or belongs to another plate', () => {
      // The index is a position in geometry that is remeasured after every
      // edit. Out of range must highlight NOTHING — highlighting whichever run
      // inherited the number would be worse than a missing accent.
      expect(renderScene({ floorOverhangs, selectedOverhangEdge: { slabId: 'slab-1', edgeIndex: 9 } })).not.toContain(
        'var(--color-selection)',
      );
      expect(
        renderScene({ floorOverhangs, selectedOverhangEdge: { slabId: 'slab-other', edgeIndex: 1 } }),
      ).not.toContain('var(--color-selection)');
    });
  });
});
