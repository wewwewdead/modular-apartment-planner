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
});
